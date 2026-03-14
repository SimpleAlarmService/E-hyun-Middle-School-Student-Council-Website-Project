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
 *   GET /clubs                        — 자율동아리 목록
 *   GET /clubs/by-slug/:slug          — slug 기반 동아리 상세
 *   GET /clubs/:id                    — 동아리 단건 상세
 *   GET /club-posts?limit=N&cursor=X  — 동아리 활동 게시글 목록
 *   GET /club-posts/by-slug/:slug     — slug 기반 활동 게시글 상세
 *   GET /club-posts/:id               — 활동 게시글 단건 상세
 *
 * 환경변수 (wrangler secret put):
 *   NOTION_API_KEY                — Notion Integration Token
 *   NOTION_DATABASE_ID            — 학생자치회 게시글 Notion Database ID
 *   NOTION_EHBS_DATABASE_ID       — EHBS 방송부 전용 DB (선택)
 *   NOTION_CLUBS_DATABASE_ID      — 대표 동아리 DB (선택)
 *   NOTION_CLUB_POSTS_DATABASE_ID — 동아리 활동 기록 DB (선택)
 *
 * 동아리 활동 DB 필수 속성:
 *   제목(Title) / 동아리명(Select) / slug(Text) / 요약(Text)
 *   대표이미지(Files) / 작성일(Date) / 작성자(Text)
 *   공개여부(Checkbox) / 내용(Page content = Notion 블록)
 */

export interface Env {
  NOTION_API_KEY: string;
  NOTION_DATABASE_ID: string;
  NOTION_EHBS_DATABASE_ID?: string;       // EHBS 방송부 전용 DB (선택)
  NOTION_CLUBS_DATABASE_ID?: string;      // 대표 동아리 DB (선택)
  NOTION_CLUB_POSTS_DATABASE_ID?: string; // 동아리 활동 기록 DB (선택)
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

/** YouTube URL → 고화질 썸네일 URL (없으면 '') */
function getYoutubeThumbnail(youtubeUrl: string): string {
  if (!youtubeUrl) return '';
  const m = youtubeUrl.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : '';
}

/** Notion 페이지 → PostCardData */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPage(page: any): Record<string, unknown> {
  const p = page.properties ?? {};

  const title       = p['제목']?.title?.[0]?.plain_text ?? '';
  const category    = p['카테고리']?.select?.name ?? '';
  // '작성일' 우선, 없으면 EHBS DB의 '게시일' 사용
  const rawDate     = p['작성일']?.date?.start ?? p['게시일']?.date?.start ?? '';
  const excerpt     = (p['요약']?.rich_text ?? [])
                        .map((r: { plain_text: string }) => r.plain_text)
                        .join('');
  const content     = (p['내용']?.rich_text ?? p['본문']?.rich_text ?? [])
                        .map((r: { plain_text: string }) => r.plain_text)
                        .join('');
  const eventStatus = p['진행 여부']?.select?.name ?? '';
  // '유튜브' 우선, 없으면 EHBS DB의 '유튜브 링크' 사용
  const youtubeUrl  = p['유튜브']?.url ?? p['유튜브 링크']?.url ?? '';

  // 이미지 URL: 아래 순서로 탐색
  //   1) '대표이미지' Files 속성 (정확한 이름)
  //   2) DB의 모든 Files 타입 속성 중 첫 번째 파일 (속성명이 달라도 자동 인식)
  //   3) Notion 페이지 내장 커버 이미지
  //   4) 유튜브 링크가 있으면 유튜브 썸네일 자동 사용
  const imageUrlFromProp = getFirstFileUrl(p['대표이미지']?.files ?? '');
  const imageUrlFromAnyFile = imageUrlFromProp || (() => {
    for (const key of Object.keys(p)) {
      if (p[key]?.type === 'files' && p[key].files?.length) {
        const url = getFirstFileUrl(p[key].files);
        if (url) return url;
      }
    }
    return '';
  })();
  const imageUrl = imageUrlFromAnyFile || getPageCoverUrl(page) || getYoutubeThumbnail(youtubeUrl);

  return {
    id:          page.id,
    title,
    date:        formatKoreanDate(rawDate),
    rawDate,
    excerpt,
    content,
    eventStatus,
    youtubeUrl,
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
 * 주어진 raw ID가 데이터베이스 ID인지 페이지 ID인지 자동 판별합니다.
 * - 데이터베이스 ID → 그대로 반환
 * - 페이지 ID      → 하위 첫 번째 child_database 블록 ID를 반환
 * rawId 생략 시 env.NOTION_DATABASE_ID 사용
 */
async function resolveDbId(env: Env, rawId?: string): Promise<string> {
  const raw = rawId ?? env.NOTION_DATABASE_ID;
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

  // EHBS 전용 DB가 설정된 경우 해당 DB 사용 (이미 전용 DB이므로 카테고리 필터 불필요)
  const isEhbs = category === 'EHBS' && !!env.NOTION_EHBS_DATABASE_ID;
  const dbId   = isEhbs
    ? await resolveDbId(env, env.NOTION_EHBS_DATABASE_ID)
    : await resolveDbId(env);

  // 공개(Checkbox = true) 필터는 항상 적용
  const filters: unknown[] = [
    { property: '공개', checkbox: { equals: true } },
  ];

  // EHBS 전용 DB는 전체가 EHBS 게시물이므로 카테고리 필터 생략
  if (!isEhbs) {
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
  }

  // EHBS 전용 DB는 '게시일' 필드 사용, 메인 DB는 '작성일' 필드 사용
  const sorts = isEhbs
    ? [{ property: '게시일', direction: 'descending' }]
    : [{ property: '작성일', direction: 'descending' }];

  const requestBody: Record<string, unknown> = {
    filter:    { and: filters },
    sorts,
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
 * Notion S3 이미지를 캐시 없이 매 요청마다 직접 프록시합니다.
 * CORS 헤더를 붙여서 브라우저에서 바로 로드 가능하게 합니다.
 */
async function handleImageProxy(url: URL): Promise<Response> {
  const rawUrl = url.searchParams.get('url');
  if (!rawUrl) {
    return new Response('Bad Request: url parameter required', {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  // url.searchParams.get() 이 이미 percent-decode 하므로 추가 디코딩 불필요
  const notionUrl = rawUrl;

  const resp = await fetch(notionUrl);
  if (!resp.ok) {
    return new Response('Image not available', { status: resp.status, headers: CORS_HEADERS });
  }

  const contentType = resp.headers.get('Content-Type') ?? 'image/jpeg';
  return new Response(resp.body, {
    headers: {
      'Content-Type':                contentType,
      'Cache-Control':               'no-store',
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
// 핸들러 — 대표 동아리 목록
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 대표 활동 DB 페이지 → ClubData */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapClub(page: any): Record<string, unknown> {
  const p = page.properties ?? {};

  const name           = p['동아리명']?.title?.[0]?.plain_text ?? '';
  // slug: Rich text 속성 (예: bora-dance). 없으면 빈 문자열
  const slug           = (p['slug']?.rich_text ?? [])
                           .map((r: { plain_text: string }) => r.plain_text)
                           .join('')
                           .trim();
  const field          = p['활동분야']?.select?.name ?? '';
  const description    = (p['설명']?.rich_text ?? [])
                           .map((r: { plain_text: string }) => r.plain_text)
                           .join('');
  // 상세설명: Rich text 속성 (카드에는 표시 안 하고 상세 페이지에서 사용)
  const detailDesc     = (p['상세설명']?.rich_text ?? [])
                           .map((r: { plain_text: string }) => r.plain_text)
                           .join('');
  const status         = p['활동상태']?.select?.name ?? '';
  const hasCompetition = p['대회참가']?.checkbox ?? false;
  // 정렬순서: Number (없으면 999로 처리해 뒤로 밀림)
  const order          = p['정렬순서']?.number ?? 999;

  // 대표이미지: Files 속성 → 페이지 커버 순서로 탐색
  const imageUrl = getFirstFileUrl(p['대표이미지']?.files ?? []) || getPageCoverUrl(page);

  return {
    id:             page.id,
    name,
    slug,
    field,
    description,
    detailDesc,
    status,
    hasCompetition,
    order,
    imageUrl,
    imageAlt:       name,
  };
}

/**
 * GET /clubs
 * 대표 활동 DB에서 게시여부=true 인 동아리 목록 반환
 * 정렬: 정렬순서(오름차순) → 동아리명(오름차순) — 메모리 정렬로 필드 없는 DB도 안전
 */
async function handleClubs(env: Env): Promise<Response> {
  if (!env.NOTION_CLUBS_DATABASE_ID) {
    return jsonResponse({ error: 'NOTION_CLUBS_DATABASE_ID not configured' }, 503);
  }

  const dbId = await resolveDbId(env, env.NOTION_CLUBS_DATABASE_ID);

  const data = await notionFetch(
    env,
    `/databases/${dbId}/query`,
    'POST',
    {
      filter:    { property: '게시여부', checkbox: { equals: true } },
      sorts:     [{ property: '동아리명', direction: 'ascending' }],
      page_size: 100,
    },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = (data.results ?? []).map(mapClub) as any[];
  // 정렬순서(number) → 이름(string) 2차 정렬 (메모리)
  results.sort((a, b) => {
    if (a.order !== b.order) return (a.order as number) - (b.order as number);
    return (a.name as string).localeCompare(b.name as string, 'ko');
  });

  return jsonResponse({
    results,
    hasMore:    false,
    nextCursor: null,
  });
}

/**
 * GET /clubs/:id
 * 동아리 단건 상세 (속성 + 본문 블록)
 */
async function handleClubDetail(env: Env, pageId: string): Promise<Response> {
  const [page, blocksData] = await Promise.all([
    notionFetch(env, `/pages/${pageId}`),
    notionFetch(env, `/blocks/${pageId}/children?page_size=100`),
  ]);

  return jsonResponse({
    club:   mapClub(page),
    blocks: blocksData.results ?? [],
  });
}

/**
 * GET /clubs/by-slug/:slug
 * slug 값으로 동아리 상세 조회 (URL 공유, 딥링크 지원)
 */
async function handleClubBySlug(env: Env, slug: string): Promise<Response> {
  if (!env.NOTION_CLUBS_DATABASE_ID) {
    return jsonResponse({ error: 'NOTION_CLUBS_DATABASE_ID not configured' }, 503);
  }

  const dbId = await resolveDbId(env, env.NOTION_CLUBS_DATABASE_ID);

  const data = await notionFetch(
    env,
    `/databases/${dbId}/query`,
    'POST',
    {
      filter: {
        and: [
          { property: '게시여부', checkbox:   { equals: true } },
          { property: 'slug',     rich_text:  { equals: slug }  },
        ],
      },
      page_size: 1,
    },
  );

  const page = data.results?.[0];
  if (!page) {
    return jsonResponse({ error: `Club with slug "${slug}" not found` }, 404);
  }

  const blocksData = await notionFetch(
    env,
    `/blocks/${page.id}/children?page_size=100`,
  );

  return jsonResponse({
    club:   mapClub(page),
    blocks: blocksData.results ?? [],
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 핸들러 — 동아리 활동 게시글
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 동아리 활동 DB 페이지 → ClubPostData */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapClubPost(page: any): Record<string, unknown> {
  const p = page.properties ?? {};

  const title     = p['제목']?.title?.[0]?.plain_text ?? '';
  const slug      = (p['slug']?.rich_text ?? [])
                      .map((r: { plain_text: string }) => r.plain_text)
                      .join('')
                      .trim();
  const clubName  = p['동아리명']?.select?.name
                 ?? p['동아리명']?.multi_select?.[0]?.name
                 ?? '';
  const summary   = (p['요약']?.rich_text ?? [])
                      .map((r: { plain_text: string }) => r.plain_text)
                      .join('');
  const rawDate   = p['작성일']?.date?.start ?? '';
  const author    = (p['작성자']?.rich_text ?? [])
                      .map((r: { plain_text: string }) => r.plain_text)
                      .join('') || '학생자치회';

  // 대표이미지: Files 속성 → 페이지 커버 순서로 탐색
  const imageUrl  = getFirstFileUrl(p['대표이미지']?.files ?? []) || getPageCoverUrl(page);

  return {
    id:        page.id,
    title,
    slug,
    clubName,
    summary,
    date:      formatKoreanDate(rawDate),
    rawDate,
    author,
    imageUrl,
    imageAlt:  title,
    isPublic:  p['공개여부']?.checkbox ?? false,
  };
}

/**
 * GET /club-posts?limit=N&cursor=X
 * 동아리 활동 DB에서 공개여부=true 게시글 목록 반환 (작성일 내림차순)
 */
async function handleClubPosts(env: Env, url: URL): Promise<Response> {
  if (!env.NOTION_CLUB_POSTS_DATABASE_ID) {
    return jsonResponse({ error: 'NOTION_CLUB_POSTS_DATABASE_ID not configured' }, 503);
  }

  const dbId  = await resolveDbId(env, env.NOTION_CLUB_POSTS_DATABASE_ID);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100);
  const cursor = url.searchParams.get('cursor') ?? undefined;

  const requestBody: Record<string, unknown> = {
    filter:    { property: '공개여부', checkbox: { equals: true } },
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
    results:    (data.results ?? []).map(mapClubPost),
    hasMore:    data.has_more ?? false,
    nextCursor: data.next_cursor ?? null,
  });
}

/**
 * GET /club-posts/:id
 * 동아리 활동 게시글 단건 상세 (속성 + 본문 블록)
 */
async function handleClubPostDetail(env: Env, pageId: string): Promise<Response> {
  const [page, blocksData] = await Promise.all([
    notionFetch(env, `/pages/${pageId}`),
    notionFetch(env, `/blocks/${pageId}/children?page_size=100`),
  ]);

  return jsonResponse({
    post:   mapClubPost(page),
    blocks: blocksData.results ?? [],
  });
}

/**
 * GET /club-posts/by-slug/:slug
 * slug 값으로 동아리 활동 게시글 상세 조회 (URL 공유·딥링크 지원)
 */
async function handleClubPostBySlug(env: Env, slug: string): Promise<Response> {
  if (!env.NOTION_CLUB_POSTS_DATABASE_ID) {
    return jsonResponse({ error: 'NOTION_CLUB_POSTS_DATABASE_ID not configured' }, 503);
  }

  const dbId = await resolveDbId(env, env.NOTION_CLUB_POSTS_DATABASE_ID);

  const data = await notionFetch(
    env,
    `/databases/${dbId}/query`,
    'POST',
    {
      filter: {
        and: [
          { property: '공개여부', checkbox:   { equals: true } },
          { property: 'slug',     rich_text:  { equals: slug }  },
        ],
      },
      page_size: 1,
    },
  );

  const page = data.results?.[0];
  if (!page) {
    return jsonResponse({ error: `Club post with slug "${slug}" not found` }, 404);
  }

  const blocksData = await notionFetch(
    env,
    `/blocks/${page.id}/children?page_size=100`,
  );

  return jsonResponse({
    post:   mapClubPost(page),
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

      // GET /clubs  — 자율동아리 목록
      if (path === '/clubs') {
        return await handleClubs(env);
      }

      // GET /clubs/by-slug/:slug  — slug 기반 동아리 상세 (반드시 /clubs/:id 보다 먼저 매칭)
      const clubSlugMatch = path.match(/^\/clubs\/by-slug\/([^/]+)$/);
      if (clubSlugMatch) {
        return await handleClubBySlug(env, decodeURIComponent(clubSlugMatch[1]));
      }

      // GET /clubs/:id  — 동아리 상세
      const clubDetailMatch = path.match(/^\/clubs\/([^/]+)$/);
      if (clubDetailMatch) {
        return await handleClubDetail(env, clubDetailMatch[1]);
      }

      // GET /club-posts  — 동아리 활동 게시글 목록
      if (path === '/club-posts') {
        return await handleClubPosts(env, url);
      }

      // GET /club-posts/by-slug/:slug  — slug 기반 활동 게시글 상세 (반드시 /:id 보다 먼저)
      const clubPostSlugMatch = path.match(/^\/club-posts\/by-slug\/([^/]+)$/);
      if (clubPostSlugMatch) {
        return await handleClubPostBySlug(env, decodeURIComponent(clubPostSlugMatch[1]));
      }

      // GET /club-posts/:id  — 활동 게시글 단건 상세
      const clubPostDetailMatch = path.match(/^\/club-posts\/([^/]+)$/);
      if (clubPostDetailMatch) {
        return await handleClubPostDetail(env, clubPostDetailMatch[1]);
      }

      return jsonResponse({ error: 'Not Found' }, 404);
    } catch (err) {
      console.error('[notion-proxy]', err);
      return jsonResponse({ error: 'Internal Server Error' }, 500);
    }
  },
};
