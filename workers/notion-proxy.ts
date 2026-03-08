/**
 * EHSC Notion Proxy — Cloudflare Worker
 * ──────────────────────────────────────────────────────────────
 *
 * Notion API를 브라우저에 직접 노출하지 않고 Worker에서 프록시합니다.
 * API 키는 Worker 환경 변수(secret)로 안전하게 보관됩니다.
 *
 * 엔드포인트:
 *   GET /posts?category=공지사항&limit=10&cursor=<cursor>
 *   GET /posts/:pageId
 *
 * 환경변수 (wrangler secret put):
 *   NOTION_API_KEY       — Notion Integration Token
 *   NOTION_DATABASE_ID   — 게시글 Notion Database ID
 *
 * Notion DB 속성:
 *   제목(Title) / 카테고리(Select) / 작성일(Date) / 공개(Checkbox) / 요약(Rich Text) / 대표이미지(Files)
 */

export interface Env {
  NOTION_API_KEY: string;
  NOTION_DATABASE_ID: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 상수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NOTION_VERSION = '2022-06-28';
const NOTION_BASE    = 'https://api.notion.com/v1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 유틸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** "YYYY-MM-DD" → "YYYY년 M월 D일" */
function formatKoreanDate(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-').map(Number);
  if (parts.length < 3) return iso;
  const [y, m, d] = parts;
  return `${y}년 ${m}월 ${d}일`;
}

/** Notion Files 속성에서 첫 번째 URL 추출 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getFirstFileUrl(files: any[]): string {
  if (!files?.length) return '';
  const f = files[0];
  if (f.type === 'external') return f.external?.url ?? '';
  if (f.type === 'file')     return f.file?.url ?? '';
  return '';
}

/** Notion 페이지 → PostCardData */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPage(page: any): Record<string, unknown> {
  const p = page.properties ?? {};

  const title    = p['제목']?.title?.[0]?.plain_text ?? '';
  const category = p['카테고리']?.select?.name ?? '';
  const rawDate  = p['작성일']?.date?.start ?? '';
  const excerpt  = (p['요약']?.rich_text ?? [])
                     .map((r: { plain_text: string }) => r.plain_text)
                     .join('');
  const imageUrl = getFirstFileUrl(p['대표이미지']?.files ?? []);

  return {
    id:         page.id,
    title,
    date:       formatKoreanDate(rawDate),
    rawDate,
    excerpt,
    imageUrl,
    imageAlt:   title,
    categories: category ? [category] : [],
    link:       page.url ?? '',
    author:     '학생자치회',
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Notion API 헬퍼
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function notionFetch(
  env:    Env,
  path:   string,
  method  = 'GET',
  body?:  unknown,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const res = await fetch(`${NOTION_BASE}${path}`, {
    method,
    headers: {
      Authorization:    `Bearer ${env.NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type':   'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API ${res.status}: ${text}`);
  }
  return res.json();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DB ID 자동 해석
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * NOTION_DATABASE_ID 가 실제로는 페이지 ID일 때,
 * 해당 페이지의 자식 블록 중 첫 번째 child_database 블록 ID를 반환합니다.
 * 처음부터 데이터베이스 ID라면 그대로 반환합니다.
 */
async function resolveDbId(env: Env): Promise<string> {
  const raw = env.NOTION_DATABASE_ID;
  // 먼저 데이터베이스로 직접 접근 시도
  try {
    await notionFetch(env, `/databases/${raw}`);
    return raw; // 성공 → 그대로 사용
  } catch {
    // 실패 → 페이지의 하위 블록에서 child_database 검색
    const blocks = await notionFetch(env, `/blocks/${raw}/children?page_size=50`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbBlock = (blocks.results ?? []).find((b: any) => b.type === 'child_database');
    if (!dbBlock) {
      throw new Error(
        `No child_database found inside page ${raw}. ` +
        'Please set NOTION_DATABASE_ID to the actual database ID.',
      );
    }
    return dbBlock.id as string;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 핸들러 — 목록
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function handleList(env: Env, url: URL): Promise<Response> {
  const category = url.searchParams.get('category') ?? '';
  const limit    = Math.min(Number(url.searchParams.get('limit') ?? 10), 100);
  const cursor   = url.searchParams.get('cursor') ?? undefined;

  const dbId = await resolveDbId(env);

  // 공개(Checkbox = true) 필터는 항상 적용
  const filters: unknown[] = [
    { property: '공개', checkbox: { equals: true } },
  ];
  if (category) {
    filters.push({ property: '카테고리', select: { equals: category } });
  }

  const requestBody: Record<string, unknown> = {
    filter:    { and: filters },
    sorts:     [{ property: '작성일', direction: 'descending' }],
    page_size: limit,
  };
  if (cursor) requestBody.start_cursor = cursor;

  const data = await notionFetch(
    env,
    `/databases/${dbId}/query`,
    'POST',
    requestBody,
  );

  return jsonResponse({
    results:    (data.results ?? []).map(mapPage),
    hasMore:    data.has_more ?? false,
    nextCursor: data.next_cursor ?? null,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 핸들러 — 단건 상세
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function handleDetail(env: Env, pageId: string): Promise<Response> {
  const [page, blocksData] = await Promise.all([
    notionFetch(env, `/pages/${pageId}`),
    notionFetch(env, `/blocks/${pageId}/children?page_size=100`),
  ]);

  return jsonResponse({
    post:   mapPage(page),
    blocks: blocksData.results ?? [],
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Worker 진입점
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method Not Allowed' }, 405);
    }

    try {
      const url  = new URL(request.url);
      const path = url.pathname.replace(/\/$/, ''); // 끝 슬래시 제거

      // GET /posts
      if (path === '/posts') {
        return await handleList(env, url);
      }

      // GET /posts/:id
      const detailMatch = path.match(/^\/posts\/([^/]+)$/);
      if (detailMatch) {
        return await handleDetail(env, detailMatch[1]);
      }

      return jsonResponse({ error: 'Not Found' }, 404);
    } catch (err) {
      console.error('[notion-proxy]', err);
      return jsonResponse({ error: 'Internal Server Error' }, 500);
    }
  },
};
