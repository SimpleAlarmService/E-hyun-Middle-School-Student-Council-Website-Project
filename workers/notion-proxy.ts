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

/** Notion 페이지 커버(내장) URL 추출 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPageCoverUrl(page: any): string {
  const cover = page.cover;
  if (!cover) return '';
  if (cover.type === 'external') return cover.external?.url ?? '';
  if (cover.type === 'file')     return cover.file?.url ?? '';
  return '';
}

/** Notion 페이지 → PostCardData */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPage(page: any): Record<string, unknown> {
  const p = page.properties ?? {};

  const title       = p['제목']?.title?.[0]?.plain_text ?? '';
  const category    = p['카테고리']?.select?.name ?? '';
  const rawDate     = p['작성일']?.date?.start ?? '';
  const excerpt     = (p['요약']?.rich_text ?? [])
                        .map((r: { plain_text: string }) => r.plain_text)
                        .join('');
  const content     = (p['내용']?.rich_text ?? [])
                        .map((r: { plain_text: string }) => r.plain_text)
                        .join('');
  const eventStatus = p['진행 여부']?.select?.name ?? '';

  // 대표이미지 속성 → 없으면 Notion 페이지 내장 커버 이미지 사용
  const imageUrl = getFirstFileUrl(p['대표이미지']?.files ?? []) || getPageCoverUrl(page);

  return {
    id:          page.id,
    title,
    date:        formatKoreanDate(rawDate),
    rawDate,
    excerpt,
    content,
    eventStatus,
    imageUrl,
    imageAlt:    title,
    categories:  category ? [category] : [],
    link:        page.url ?? '',
    author:      '학생자치회',
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
  const category   = url.searchParams.get('category') ?? '';
  // 다중 카테고리: categories=A,B,C (쉼표 구분)
  const categories = (url.searchParams.get('categories') ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const limit      = Math.min(Number(url.searchParams.get('limit') ?? 10), 100);
  const cursor     = url.searchParams.get('cursor') ?? undefined;

  const dbId = await resolveDbId(env);

  // 공개(Checkbox = true) 필터는 항상 적용
  const filters: unknown[] = [
    { property: '공개', checkbox: { equals: true } },
  ];

  if (categories.length > 1) {
    // 복수 카테고리 → OR 필터
    filters.push({
      or: categories.map((cat) => ({
        property: '카테고리',
        select:   { equals: cat },
      })),
    });
  } else if (categories.length === 1) {
    filters.push({ property: '카테고리', select: { equals: categories[0] } });
  } else if (category) {
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

  const mapped: Record<string, unknown>[] = (data.results ?? []).map(mapPage);

  // ── imageUrl 없는 게시글: 본문 첫 이미지 블록을 병렬 보완 ────────────────
  //    대표이미지 속성 / 커버 둘 다 없는 경우 페이지 블록을 추가 조회합니다.
  const noImageIdx = mapped
    .map((_, i) => (mapped[i].imageUrl ? null : i))
    .filter((i): i is number => i !== null);

  if (noImageIdx.length > 0) {
    await Promise.all(
      noImageIdx.map(async (idx) => {
        try {
          const blocksData = await notionFetch(
            env,
            `/blocks/${mapped[idx].id}/children?page_size=10`,
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const firstImg = (blocksData.results ?? []).find((b: any) => b.type === 'image');
          if (firstImg) {
            const src =
              firstImg.image?.type === 'external' ? (firstImg.image.external?.url ?? '')
              : firstImg.image?.type === 'file'   ? (firstImg.image.file?.url   ?? '')
              : '';
            if (src) mapped[idx].imageUrl = src;
          }
        } catch {
          // 블록 조회 실패 → 이미지 없는 상태 유지
        }
      }),
    );
  }

  return jsonResponse({
    results:    mapped,
    hasMore:    data.has_more ?? false,
    nextCursor: data.next_cursor ?? null,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 핸들러 — 이미지 프록시 (Notion S3 URL 만료 문제 해결)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * GET /image?url=<encoded_notion_s3_url>
 *
 * Notion 내부 업로드 이미지는 서명된 S3 URL로 제공되며 약 1시간 후 만료됩니다.
 * 이 엔드포인트는 Cloudflare CDN을 통해 이미지를 30일간 캐시하여,
 * 원본 S3 URL이 만료된 후에도 이미지를 안정적으로 제공합니다.
 */
async function handleImageProxy(url: URL): Promise<Response> {
  const rawUrl = url.searchParams.get('url');
  if (!rawUrl) {
    return new Response('Bad Request: url parameter required', {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const notionUrl = decodeURIComponent(rawUrl);

  // Cloudflare CDN에 30일 캐시 (S3 URL 만료 후에도 제공 가능)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp = await fetch(notionUrl, { cf: { cacheTtl: 86400 * 30, cacheEverything: true } } as any);

  if (!resp.ok) {
    return new Response('Image not available', { status: resp.status, headers: CORS_HEADERS });
  }

  const contentType = resp.headers.get('Content-Type') ?? 'image/jpeg';
  return new Response(resp.body, {
    headers: {
      'Content-Type':               contentType,
      'Cache-Control':              'public, max-age=2592000', // 30일
      'Access-Control-Allow-Origin': '*',
    },
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

      // GET /image?url=<encoded_url>  — Notion S3 이미지 프록시
      if (path === '/image') {
        return await handleImageProxy(url);
      }

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
