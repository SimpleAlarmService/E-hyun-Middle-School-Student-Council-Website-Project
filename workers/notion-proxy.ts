/**
 * EHSC Notion Proxy — Cloudflare Worker
 * ──────────────────────────────────────────────────────────────
 *
 * Notion API를 브라우저에 직접 노출하지 않고 Worker에서 프록시합니다.
 * API 키는 Worker 환경 변수(secret)로 안전하게 보관됩니다.
 *
 * 엔드포인트:
 *   GET /search-index                 — 통합검색 인덱스 (전체 콘텐츠 배열, TTL 120초)
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
 * 메인 DB 속성 (NOTION_DATABASE_ID):
 *   제목(Title) / 카테고리(Select) / 작성일(Date) / 내용(Text) / 작성자(People)
 *   공개(Select: 예정|진행중|완료) / 진행 여부(공지사항 제외)(Checkbox)
 *   대표 이미지(Files) — ※ 공백 포함
 *   ※ '공개' Select 값이 있는 게시글만 노출 (예정/진행중/완료)
 *   ※ '공개' Select 값 = 이벤트 상태(eventStatus)로도 사용
 *
 * 동아리 DB 속성 (NOTION_CLUBS_DATABASE_ID):
 *   동아리명(Title) / slug(Select) / 활동분야(MultiSelect) / 한줄소개(Text)
 *   상세소개(Text) / 활동상태(Select) / 대회참가(Checkbox) / 모집중(Checkbox)
 *   대표이미지(Files) / 게시여부(Checkbox)
 *
 * 동아리 활동 DB 속성 (NOTION_CLUB_POSTS_DATABASE_ID):
 *   제목(Title) / 동아리명(Select) / slug(Select) / 본문(Text) / 텍스트(Text)
 *   대표이미지(Files) / 작성일(Date) / 작성자(Text) / 공개여부(Checkbox)
 */

export interface Env {
  NOTION_API_KEY: string;
  NOTION_DATABASE_ID: string;
  NOTION_EHBS_DATABASE_ID?: string;       // EHBS 방송부 전용 DB (선택)
  NOTION_CLUBS_DATABASE_ID?: string;      // 대표 동아리 DB (선택)
  NOTION_CLUB_POSTS_DATABASE_ID?: string; // 동아리 활동 기록 DB (선택)
  /** POST /purge 인증 시크릿 — wrangler secret put PURGE_SECRET 으로 설정 */
  PURGE_SECRET?: string;
}

/**
 * 통합검색 인덱스 아이템
 * GET /search-index 응답 배열의 원소 타입
 */
interface SearchIndexItem {
  id:       string;
  title:    string;
  category: string;
  summary:  string;  // 검색 발췌 / 요약
  content:  string;  // 본문 검색용 텍스트
  page:     string;  // navigate() 첫 번째 인자 (라우트 키)
  pageId:   string | null; // navigate() 두 번째 인자 (없으면 null)
  date:     string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 상수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NOTION_VERSION = '2022-06-28';
const NOTION_BASE    = 'https://api.notion.com/v1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Purge-Secret',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 캐시 TTL 상수 (초 단위)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 통합검색 인덱스 캐시 유지 시간 (초)
 * - /search-index 엔드포인트에 적용
 * - 글 추가·수정·삭제 후 최대 이 시간 내에 검색 결과에 반영됨
 * - 즉시 반영이 필요하면: POST /purge { "urls": ["<worker-url>/search-index"] }
 */
const SEARCH_INDEX_TTL = 120;  // 2분

/**
 * 홈 통합 데이터 캐시 유지 시간 (초)
 * - /home-data 엔드포인트에 적용
 * - 자주 접근하므로 짧게 유지
 */
const HOME_CACHE_TTL   = 60;   // 1분

/**
 * 목록 데이터 캐시 유지 시간 (초)
 * - /posts, /clubs, /club-posts 등 목록 엔드포인트에 적용
 */
const LIST_CACHE_TTL   = 120;  // 2분

/**
 * 상세 데이터 캐시 유지 시간 (초)
 * - /posts/:id, /clubs/by-slug/:slug, /club-posts/:id 등에 적용
 * - 변경 빈도가 낮으므로 더 길게 유지
 */
const DETAIL_CACHE_TTL = 300;  // 5분

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 유틸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * Cloudflare Cache API를 사용한 엣지 캐싱 헬퍼
 *
 * 동작 원리:
 *   1. 동일 URL에 대한 캐시 히트 시 → Notion API 호출 없이 즉시 반환
 *   2. 캐시 미스 시 → Notion API 호출 후 결과를 ttl 초 동안 캐시에 저장
 *   3. 200 이외 응답(오류)은 캐시하지 않음
 *
 * 캐시 무효화 방법:
 *   - Cloudflare 대시보드 → Caching → Cache Rules → Purge Cache
 *   - 또는 POST /purge 엔드포인트로 특정 URL 직접 삭제
 *
 * @param request  원본 요청 (URL이 캐시 키로 사용됨)
 * @param ttl      캐시 유지 시간(초) — HOME_CACHE_TTL | LIST_CACHE_TTL | DETAIL_CACHE_TTL
 * @param handler  실제 Notion API 호출 함수
 */
async function withCache(
  request: Request,
  ttl: number,
  handler: () => Promise<Response>,
): Promise<Response> {
  const cache    = caches.default;
  const cacheKey = new Request(request.url, { method: 'GET' });

  // ── 캐시 히트 확인 ──────────────────────────────────────────
  const cached = await cache.match(cacheKey);
  if (cached) {
    const h = new Headers(cached.headers);
    h.set('X-Cache', 'HIT');
    return new Response(cached.body, { status: cached.status, headers: h });
  }

  // ── Notion API 호출 ──────────────────────────────────────────
  const fresh = await handler();

  // 200 응답만 캐시 (오류·404 등은 캐시하지 않음)
  if (fresh.status === 200) {
    const h = new Headers(fresh.headers);
    h.set('Cache-Control', `public, max-age=${ttl}, s-maxage=${ttl}`);
    h.set('X-Cache',     'MISS');
    h.set('X-Cache-TTL', String(ttl));
    const toCache = new Response(fresh.body, { status: 200, headers: h });
    await cache.put(cacheKey, toCache.clone());
    return toCache;
  }

  return fresh;
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
  // 진행 여부: '공개' Select 타입 (예정 | 진행중 | 완료)
  //   '예정' → upcoming / '진행중' → ongoing / '완료' → ended
  //   없으면 '' → 프론트에서 날짜 기반 자동 추론(deriveEventStatus)
  const eventStatus = p['공개']?.select?.name ?? '';
  // '유튜브' 우선, 없으면 EHBS DB의 '유튜브 링크' 사용
  const youtubeUrl  = p['유튜브']?.url ?? p['유튜브 링크']?.url ?? '';

  // 이미지 URL: 아래 순서로 탐색
  //   1) '대표 이미지' Files 속성 (공백 포함 정확한 이름)
  //   2) DB의 모든 Files 타입 속성 중 첫 번째 파일 (속성명이 달라도 자동 인식)
  //   3) Notion 페이지 내장 커버 이미지
  //   4) 유튜브 링크가 있으면 유튜브 썸네일 자동 사용
  const imageUrlFromProp = getFirstFileUrl(p['대표 이미지']?.files ?? '');
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

  // EHBS 전용 DB는 별도 스키마(공개 속성 없음) → 필터 없이 전체 조회
  // 메인 DB: 공개(Select is_not_empty) 필터 — 예정/진행중/완료 값이 있는 게시글만
  const filters: unknown[] = isEhbs
    ? []
    : [{ property: '공개', select: { is_not_empty: true } }];

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
    sorts,
    page_size: limit,
  };
  if (filters.length > 0) requestBody.filter = { and: filters };
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
  // slug(통일된 이름) → 페이지주소(구버전) 순서로 탐색 (Select · rich_text 모두 지원)
  const slug           = p['slug']?.select?.name
                      ?? (p['slug']?.rich_text ?? p['페이지주소']?.rich_text ?? [])
                           .map((r: { plain_text: string }) => r.plain_text)
                           .join('')
                           .trim()
                      ?? '';
  // 활동분야: MultiSelect → string[] (여러 분야 동시 지원)
  const field          = (p['활동분야']?.multi_select ?? []).map((s: { name: string }) => s.name);
  // 한줄소개(신규) → 설명(구버전) 순서로 탐색
  const description    = (p['한줄소개']?.rich_text ?? p['설명']?.rich_text ?? [])
                           .map((r: { plain_text: string }) => r.plain_text)
                           .join('');
  // 상세소개(신규) → 상세설명(구버전) 순서로 탐색
  const detailDesc     = (p['상세소개']?.rich_text ?? p['상세설명']?.rich_text ?? [])
                           .map((r: { plain_text: string }) => r.plain_text)
                           .join('');
  const status         = p['활동상태']?.select?.name ?? '';
  const hasCompetition = p['대회참가']?.checkbox ?? false;
  // 모집중: Checkbox (true면 현재 멤버 모집 중)
  const isRecruiting   = p['모집중']?.checkbox ?? false;
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
    isRecruiting,
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

  // slug 필드 타입(Select · rich_text)과 구버전 페이지주소 필드를 순서대로 탐색
  // notionFetch는 잘못된 filter 타입에서 400을 throw → catch로 다음 전략 시도
  const activeFilter = { property: '게시여부', checkbox: { equals: true } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;

  // 1순위: slug 필드 Select 타입 (신규 권장)
  try {
    data = await notionFetch(env, `/databases/${dbId}/query`, 'POST', {
      filter: { and: [activeFilter, { property: 'slug', select: { equals: slug } }] },
      page_size: 1,
    });
  } catch { /* Select 타입 아님, 다음 시도 */ }

  // 2순위: slug 필드 rich_text 타입
  if (!data) {
    try {
      data = await notionFetch(env, `/databases/${dbId}/query`, 'POST', {
        filter: { and: [activeFilter, { property: 'slug', rich_text: { equals: slug } }] },
        page_size: 1,
      });
    } catch { /* slug 필드 없음, 다음 시도 */ }
  }

  // 3순위: 페이지주소 필드 (구버전 rich_text)
  if (!data) {
    try {
      data = await notionFetch(env, `/databases/${dbId}/query`, 'POST', {
        filter: { and: [activeFilter, { property: '페이지주소', rich_text: { equals: slug } }] },
        page_size: 1,
      });
    } catch { data = { results: [] }; }
  }

  const page = data?.results?.[0];
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
  // 게시글 자체의 slug는 Notion UUID를 사용 — DB에 별도 slug 컬럼 불필요
  // (slug 컬럼은 소속 동아리 주소로 재사용: 아래 belongsToAddress 참고)

  // 소속 동아리 주소: slug(통일된 이름) → 소속동아리주소(구버전) fallback (Select · rich_text 모두 지원)
  const belongsToAddress = p['slug']?.select?.name
                        ?? (p['slug']?.rich_text ?? p['소속동아리주소']?.rich_text ?? [])
                             .map((r: { plain_text: string }) => r.plain_text)
                             .join('')
                             .trim()
                        ?? '';
  const clubName  = p['동아리명']?.select?.name
                 ?? p['동아리명']?.multi_select?.[0]?.name
                 ?? belongsToAddress;  // 동아리명 없으면 소속 주소를 표시명으로 fallback
  // 요약: 본문(신규) → 텍스트(fallback) 순서로 탐색 (DB에 '요약' 없음)
  const summary   = (p['본문']?.rich_text ?? p['텍스트']?.rich_text ?? [])
                      .map((r: { plain_text: string }) => r.plain_text)
                      .join('');
  const rawDate   = p['작성일']?.date?.start ?? '';
  const author    = (p['작성자']?.rich_text ?? [])
                      .map((r: { plain_text: string }) => r.plain_text)
                      .join('') || '학생자치회';

  // 대표이미지: Files 속성 → 페이지 커버 순서로 탐색
  const imageUrl  = getFirstFileUrl(p['대표이미지']?.files ?? []) || getPageCoverUrl(page);

  return {
    id:               page.id,
    title,
    slug:             page.id,  // 게시글은 UUID로 식별 (딥링크 URL: #club-post/<uuid>)
    clubName,
    belongsToAddress,
    summary,
    date:             formatKoreanDate(rawDate),
    rawDate,
    author,
    imageUrl,
    imageAlt:         title,
    isPublic:         p['공개여부']?.checkbox ?? false,
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

  // 신규 필드 '페이지주소' 먼저 조회, 없으면 구버전 'slug' 필드로 fallback
  const queryByField = (property: string) => notionFetch(
    env,
    `/databases/${dbId}/query`,
    'POST',
    {
      filter: {
        and: [
          { property: '공개여부', checkbox:   { equals: true } },
          { property,             rich_text:  { equals: slug }  },
        ],
      },
      page_size: 1,
    },
  );

  let data = await queryByField('페이지주소');
  if (!data.results?.length) {
    data = await queryByField('slug');
  }

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

/**
 * GET /club-posts/by-club/:address
 * 특정 동아리(slug = address)의 공개 게시글 목록 반환 (작성일 내림차순)
 * 게시글 DB의 slug 필드에 동아리 주소를 입력하면 자동으로 연결됩니다.
 * 구버전(소속동아리주소) 필드도 OR 조건으로 지원합니다.
 */
async function handleClubPostsByClub(env: Env, clubAddress: string): Promise<Response> {
  if (!env.NOTION_CLUB_POSTS_DATABASE_ID) {
    return jsonResponse({ error: 'NOTION_CLUB_POSTS_DATABASE_ID not configured' }, 503);
  }

  const dbId = await resolveDbId(env, env.NOTION_CLUB_POSTS_DATABASE_ID);

  // slug 필드 타입(Select · rich_text)과 구버전 소속동아리주소 필드를 순서대로 탐색
  const publicFilter = { property: '공개여부', checkbox: { equals: true } };
  const sortOpts     = [{ property: '작성일', direction: 'descending' }];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;

  // 1순위: slug 필드 Select 타입 (신규 권장)
  try {
    data = await notionFetch(env, `/databases/${dbId}/query`, 'POST', {
      filter: { and: [publicFilter, { property: 'slug', select: { equals: clubAddress } }] },
      sorts:     sortOpts,
      page_size: 50,
    });
  } catch { /* Select 타입 아님, 다음 시도 */ }

  // 2순위: slug 필드 rich_text 타입
  if (!data) {
    try {
      data = await notionFetch(env, `/databases/${dbId}/query`, 'POST', {
        filter: { and: [publicFilter, { property: 'slug', rich_text: { equals: clubAddress } }] },
        sorts:     sortOpts,
        page_size: 50,
      });
    } catch { /* slug 필드 없음, 다음 시도 */ }
  }

  // 3순위: 소속동아리주소 필드 (구버전 rich_text)
  if (!data) {
    try {
      data = await notionFetch(env, `/databases/${dbId}/query`, 'POST', {
        filter: { and: [publicFilter, { property: '소속동아리주소', rich_text: { equals: clubAddress } }] },
        sorts:     sortOpts,
        page_size: 50,
      });
    } catch { data = { results: [], has_more: false, next_cursor: null }; }
  }

  return jsonResponse({
    results:    (data?.results ?? []).map(mapClubPost),
    hasMore:    data?.has_more ?? false,
    nextCursor: data?.next_cursor ?? null,
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 핸들러 — 홈 통합 데이터 (4개 섹션을 1번의 Worker 요청으로)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * GET /home-data
 *
 * 홈 화면에 필요한 4가지 데이터를 한 번에 반환합니다.
 * 기존에 4번 호출하던 것을 1번으로 줄여 초기 로딩 속도를 향상시킵니다.
 *
 *   notices  — 공지사항 최신 10건 (전체 카테고리)
 *   events   — 진행 행사 최신 3건  (학생회 행사 + 스포츠라이트 + 체육대회/이현제)
 *   gallery  — 갤러리 최신 4건    (스포츠라이트)
 *   archive  — 자료실 최신 4건    (회의록 + 기타자료실)
 *
 * 캐시 TTL: HOME_CACHE_TTL (60초)
 */
async function handleHomeData(env: Env): Promise<Response> {
  const dbId         = await resolveDbId(env);
  // 공개(Select is_not_empty) 필터 — 예정/진행중/완료 값이 있는 게시글만
  const publicFilter = { property: '공개', select: { is_not_empty: true } };
  const sortByDate   = [{ property: '작성일', direction: 'descending' }];

  // 카테고리 필터 생성 헬퍼 (단일 / 복수 OR)
  const catFilter = (cats: string[]) =>
    cats.length === 1
      ? { property: '카테고리', select: { equals: cats[0] } }
      : { or: cats.map((c) => ({ property: '카테고리', select: { equals: c } })) };

  // 4개 쿼리 병렬 실행 — Notion API 왕복 4회를 동시에 처리
  const [noticesRaw, eventsRaw, galleryRaw, archiveRaw] = await Promise.all([
    notionFetch(env, `/databases/${dbId}/query`, 'POST', {
      filter:    { and: [publicFilter] },
      sorts:     sortByDate,
      page_size: 10,
    }),
    notionFetch(env, `/databases/${dbId}/query`, 'POST', {
      filter:    { and: [publicFilter, catFilter(['학생회 행사', '스포츠라이트', '체육대회/이현제'])] },
      sorts:     sortByDate,
      page_size: 3,
    }),
    notionFetch(env, `/databases/${dbId}/query`, 'POST', {
      filter:    { and: [publicFilter, catFilter(['스포츠라이트'])] },
      sorts:     sortByDate,
      page_size: 4,
    }),
    notionFetch(env, `/databases/${dbId}/query`, 'POST', {
      filter:    { and: [publicFilter, catFilter(['회의록', '기타자료실'])] },
      sorts:     sortByDate,
      page_size: 4,
    }),
  ]);

  return jsonResponse({
    notices: (noticesRaw.results ?? []).map(mapPage),
    events:  (eventsRaw.results  ?? []).map(mapPage),
    gallery: (galleryRaw.results ?? []).map(mapPage),
    archive: (archiveRaw.results ?? []).map(mapPage),
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 핸들러 — 통합검색 인덱스
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * GET /search-index
 *
 * 모든 Notion DB에서 검색용 데이터를 수집해 하나의 배열로 반환합니다.
 * 브라우저는 이 배열을 받아 로컬에서 필터링합니다.
 *
 * 포함 데이터:
 *   - 메인 DB: 공지사항 / 학생회 행사 / 스포츠라이트 / 체육대회·이현제 / 회의록 / 기타자료실
 *   - EHBS DB (설정 시): EHBS 방송부 게시글
 *   - 동아리 DB (설정 시): 자율동아리 소개
 *   - 동아리 활동 DB (설정 시): 동아리 활동 게시글
 *
 * 캐시 TTL: SEARCH_INDEX_TTL (120초)
 * Purge: POST /purge { "urls": ["<worker-url>/search-index"] }
 *
 * 운영 안내:
 *   Notion에 글을 추가·수정·삭제한 뒤 최대 120초 후 검색 결과에 반영됩니다.
 *   즉시 반영이 필요하면 /purge 엔드포인트로 캐시를 비워주세요.
 */
async function handleSearchIndex(env: Env): Promise<Response> {
  // ── 카테고리 → 라우트 매핑 ────────────────────────────────
  const EVENT_CATS   = new Set(['학생회 행사', '스포츠라이트', '체육대회/이현제']);
  const ARCHIVE_CATS = new Set(['회의록', '기타자료실']);

  function catToRoute(cat: string): { page: string; needsId: boolean } {
    if (EVENT_CATS.has(cat))   return { page: 'event-detail',  needsId: true  };
    if (ARCHIVE_CATS.has(cat)) return { page: 'archive',       needsId: false };
    if (cat === 'EHBS')        return { page: 'ehbs-detail',   needsId: true  };
    return                            { page: 'notice-detail', needsId: true  };
  }

  // ── DB 전체 페이지 수집 (cursor 페이지네이션) ──────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function fetchAllPages(dbId: string, body: Record<string, unknown>): Promise<any[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: any[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const req  = cursor ? { ...body, start_cursor: cursor } : body;
      const data = await notionFetch(env, `/databases/${dbId}/query`, 'POST', req);
      all.push(...(data.results ?? []));
      if (!data.has_more || !data.next_cursor) break;
      cursor = data.next_cursor;
    }
    return all;
  }

  // ── 4개 DB 를 병렬로 쿼리 ────────────────────────────────
  //    resolveDbId + fetchAllPages 를 각 DB마다 chaining 후 allSettled
  const [mainR, ehbsR, clubsR, clubPostsR] = await Promise.allSettled([
    // 1. 메인 DB (공지/행사/자료실 등)
    resolveDbId(env).then((dbId) =>
      fetchAllPages(dbId, {
        filter:    { property: '공개', select: { is_not_empty: true } },
        sorts:     [{ property: '작성일', direction: 'descending' }],
        page_size: 100,
      }),
    ),
    // 2. EHBS 전용 DB (설정된 경우에만)
    env.NOTION_EHBS_DATABASE_ID
      ? resolveDbId(env, env.NOTION_EHBS_DATABASE_ID).then((dbId) =>
          fetchAllPages(dbId, {
            filter:    { property: '공개', select: { is_not_empty: true } },
            sorts:     [{ property: '게시일', direction: 'descending' }],
            page_size: 100,
          }),
        )
      : Promise.resolve([]),
    // 3. 자율동아리 DB (설정된 경우에만)
    env.NOTION_CLUBS_DATABASE_ID
      ? resolveDbId(env, env.NOTION_CLUBS_DATABASE_ID).then((dbId) =>
          fetchAllPages(dbId, {
            filter:    { property: '게시여부', checkbox: { equals: true } },
            sorts:     [{ property: '동아리명', direction: 'ascending' }],
            page_size: 100,
          }),
        )
      : Promise.resolve([]),
    // 4. 동아리 활동 DB (설정된 경우에만)
    env.NOTION_CLUB_POSTS_DATABASE_ID
      ? resolveDbId(env, env.NOTION_CLUB_POSTS_DATABASE_ID).then((dbId) =>
          fetchAllPages(dbId, {
            filter:    { property: '공개여부', checkbox: { equals: true } },
            sorts:     [{ property: '작성일', direction: 'descending' }],
            page_size: 100,
          }),
        )
      : Promise.resolve([]),
  ]);

  const items: SearchIndexItem[] = [];
  const seenIds = new Set<string>(); // 중복 제거용

  // ── 메인 게시글 처리 ─────────────────────────────────────
  if (mainR.status === 'fulfilled') {
    for (const p of mainR.value) {
      if (seenIds.has(p.id)) continue;
      seenIds.add(p.id);
      const m   = mapPage(p);
      const cat = (m.categories as string[])?.[0] ?? '공지사항';
      const { page, needsId } = catToRoute(cat);
      items.push({
        id:       m.id       as string,
        title:    m.title    as string,
        category: cat,
        summary:  (m.excerpt as string) || (m.content as string || '').slice(0, 120),
        content:  (m.content as string) || '',
        page,
        pageId:   needsId ? m.id as string : null,
        date:     m.date     as string,
      });
    }
  } else {
    console.error('[search-index/main]', mainR.reason);
  }

  // ── EHBS 처리 ────────────────────────────────────────────
  if (ehbsR.status === 'fulfilled') {
    for (const p of ehbsR.value) {
      if (seenIds.has(p.id)) continue;
      seenIds.add(p.id);
      const m = mapPage(p);
      items.push({
        id:       m.id    as string,
        title:    m.title as string,
        category: 'EHBS',
        summary:  (m.excerpt as string) || (m.content as string || '').slice(0, 120),
        content:  (m.content as string) || '',
        page:     'ehbs-detail',
        pageId:   m.id as string,
        date:     m.date as string,
      });
    }
  }

  // ── 자율동아리 처리 ───────────────────────────────────────
  if (clubsR.status === 'fulfilled') {
    for (const p of clubsR.value) {
      const m = mapClub(p);
      if (!m.slug) continue;
      items.push({
        id:       m.id   as string,
        title:    m.name as string,
        category: '자율동아리',
        summary:  (m.description as string) || '',
        content:  [
          m.detailDesc,
          Array.isArray(m.field) ? (m.field as string[]).join(' ') : m.field,
        ].filter(Boolean).join(' '),
        page:   'club-detail',
        pageId: m.slug as string,
        date:   '',
      });
    }
  }

  // ── 동아리 활동 처리 ─────────────────────────────────────
  if (clubPostsR.status === 'fulfilled') {
    for (const p of clubPostsR.value) {
      const m   = mapClubPost(p);
      const cat = m.clubName
        ? `동아리 활동 · ${m.clubName as string}`
        : '동아리 활동';
      items.push({
        id:       m.id    as string,
        title:    m.title as string,
        category: cat,
        summary:  (m.summary as string) || '',
        content:  '',
        page:     'club-post-detail',
        pageId:   m.id as string,
        date:     m.date as string,
      });
    }
  }

  return jsonResponse(items);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 핸들러 — 캐시 Purge (운영자 전용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * POST /purge
 * Content-Type: application/json
 * X-Purge-Secret: <PURGE_SECRET>
 *
 * Body: { "urls": ["https://worker.dev/posts/123", ...] }
 *
 * 지정한 URL의 캐시를 즉시 삭제합니다.
 * 글 삭제 / 비공개 / 긴급 수정 시 사용합니다.
 *
 * 설정:
 *   wrangler secret put PURGE_SECRET
 */
async function handlePurge(request: Request, env: Env): Promise<Response> {
  // 시크릿 미설정 → 503
  if (!env.PURGE_SECRET) {
    return jsonResponse({ error: 'PURGE_SECRET not configured' }, 503);
  }
  // 시크릿 불일치 → 401
  const secret = request.headers.get('X-Purge-Secret') ?? '';
  if (secret !== env.PURGE_SECRET) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = await request.json() as any;
  const urls: string[] = Array.isArray(body?.urls) ? body.urls : [];
  if (urls.length === 0) {
    return jsonResponse({ error: 'urls array is required' }, 400);
  }

  const cache = caches.default;
  const results = await Promise.all(
    urls.map(async (url) => {
      const deleted = await cache.delete(new Request(url, { method: 'GET' }));
      return { url, deleted };
    }),
  );

  return jsonResponse({ purged: results.filter((r) => r.deleted).length, results });
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

    const url  = new URL(request.url);
    const path = url.pathname.replace(/\/$/, ''); // 끝 슬래시 제거

    // ── POST /purge — 캐시 퍼지 (GET 제한 전에 처리)
    if (path === '/purge' && request.method === 'POST') {
      try {
        return await handlePurge(request, env);
      } catch (err) {
        console.error('[notion-proxy/purge]', err);
        return jsonResponse({ error: 'Purge failed' }, 500);
      }
    }

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method Not Allowed' }, 405);
    }

    try {
      // ── GET /image — Notion S3 이미지 프록시 (캐시 없음: Notion URL은 1시간 만료)
      if (path === '/image') {
        return await handleImageProxy(url);
      }

      // ── GET /search-index — 통합검색 인덱스 (TTL: SEARCH_INDEX_TTL = 120초)
      if (path === '/search-index') {
        return await withCache(request, SEARCH_INDEX_TTL, () => handleSearchIndex(env));
      }

      // ── GET /home-data — 홈 통합 데이터 (TTL: HOME_CACHE_TTL = 60초)
      if (path === '/home-data') {
        return await withCache(request, HOME_CACHE_TTL, () => handleHomeData(env));
      }

      // ── GET /posts — 게시글 목록 (TTL: LIST_CACHE_TTL = 120초)
      if (path === '/posts') {
        return await withCache(request, LIST_CACHE_TTL, () => handleList(env, url));
      }

      // ── GET /posts/:id — 게시글 상세 (TTL: DETAIL_CACHE_TTL = 300초)
      const detailMatch = path.match(/^\/posts\/([^/]+)$/);
      if (detailMatch) {
        return await withCache(request, DETAIL_CACHE_TTL, () => handleDetail(env, detailMatch[1]));
      }

      // ── GET /clubs — 동아리 목록 (TTL: LIST_CACHE_TTL = 120초)
      if (path === '/clubs') {
        return await withCache(request, LIST_CACHE_TTL, () => handleClubs(env));
      }

      // ── GET /clubs/by-slug/:slug — 동아리 상세 (TTL: DETAIL_CACHE_TTL = 300초)
      //    반드시 /clubs/:id 보다 먼저 매칭
      const clubSlugMatch = path.match(/^\/clubs\/by-slug\/([^/]+)$/);
      if (clubSlugMatch) {
        return await withCache(request, DETAIL_CACHE_TTL,
          () => handleClubBySlug(env, decodeURIComponent(clubSlugMatch[1])));
      }

      // ── GET /clubs/:id — 동아리 상세 (TTL: DETAIL_CACHE_TTL = 300초)
      const clubDetailMatch = path.match(/^\/clubs\/([^/]+)$/);
      if (clubDetailMatch) {
        return await withCache(request, DETAIL_CACHE_TTL,
          () => handleClubDetail(env, clubDetailMatch[1]));
      }

      // ── GET /club-posts — 활동 게시글 목록 (TTL: LIST_CACHE_TTL = 120초)
      if (path === '/club-posts') {
        return await withCache(request, LIST_CACHE_TTL, () => handleClubPosts(env, url));
      }

      // ── GET /club-posts/by-slug/:slug — 활동 게시글 상세 (TTL: DETAIL_CACHE_TTL = 300초)
      //    반드시 /:id 보다 먼저 매칭
      const clubPostSlugMatch = path.match(/^\/club-posts\/by-slug\/([^/]+)$/);
      if (clubPostSlugMatch) {
        return await withCache(request, DETAIL_CACHE_TTL,
          () => handleClubPostBySlug(env, decodeURIComponent(clubPostSlugMatch[1])));
      }

      // ── GET /club-posts/by-club/:address — 동아리별 게시글 목록 (TTL: LIST_CACHE_TTL = 120초)
      //    반드시 /:id 보다 먼저 매칭
      const clubPostsByClubMatch = path.match(/^\/club-posts\/by-club\/([^/]+)$/);
      if (clubPostsByClubMatch) {
        return await withCache(request, LIST_CACHE_TTL,
          () => handleClubPostsByClub(env, decodeURIComponent(clubPostsByClubMatch[1])));
      }

      // ── GET /club-posts/:id — 활동 게시글 단건 상세 (TTL: DETAIL_CACHE_TTL = 300초)
      const clubPostDetailMatch = path.match(/^\/club-posts\/([^/]+)$/);
      if (clubPostDetailMatch) {
        return await withCache(request, DETAIL_CACHE_TTL,
          () => handleClubPostDetail(env, clubPostDetailMatch[1]));
      }

      return jsonResponse({ error: 'Not Found' }, 404);
    } catch (err) {
      console.error('[notion-proxy]', err);
      return jsonResponse({ error: 'Internal Server Error' }, 500);
    }
  },
};
