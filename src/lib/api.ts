/**
 * EHSC Link — WordPress REST API 유틸리티
 * ──────────────────────────────────────────────────────────────
 *
 * ⚠️  보안 메모:
 *   - 이 파일에는 인증 정보(API Key, Application Password 등)를 절대 포함하지 않습니다.
 *   - 공개 게시글 읽기 전용으로만 동작합니다.
 *   - 쓰기 / 수정 / 삭제 요청은 구현하지 않습니다.
 *   - 비공개 글은 인증 없이 조회 불가합니다 (WordPress 기본 동작).
 *
 * 테스트 예시:
 *   - 전체 글:          GET https://cms.example.com/wp-json/wp/v2/posts
 *   - 카테고리 필터:    GET .../posts?categories=12&per_page=5
 *   - 슬러그 조회:      GET .../posts?slug=my-post-slug
 *   - 카테고리 목록:    GET .../categories?per_page=100
 *   - 미디어:           GET .../media/123
 */

import { API_ENDPOINTS } from './config';
import type {
  WPPost,
  WPCategory,
  WPMedia,
  GetPostsParams,
  PostCardData,
} from '../types/wordpress';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 날짜 / 텍스트 유틸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ISO 8601 날짜 → 한국어 긴 포맷
 * @example "2026-03-07T10:30:00" → "2026년 3월 7일"
 */
export function formatKoreanDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

/**
 * ISO 8601 날짜 → 짧은 포맷 (목록 카드용)
 * @example "2026-03-07T10:30:00" → "2026.03.07"
 */
export function formatShortDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
  } catch {
    return isoDate;
  }
}

/**
 * 게시글 발행 날짜 기준으로 행사 상태를 추론합니다.
 *
 * 참고: 실제 운영에서는 WordPress ACF 커스텀 필드(예: event_status)로
 *       'upcoming' / 'ongoing' / 'ended' 를 명시 관리하는 것을 권장합니다.
 *
 * 현재 휴리스틱:
 *  - 발행 후 30일 이내 → 'ongoing'
 *  - 30일 초과         → 'ended'
 *  - 미래 날짜         → 'upcoming'
 */
export function deriveEventStatus(isoDate: string): 'upcoming' | 'ongoing' | 'ended' {
  const diffMs   = new Date().getTime() - new Date(isoDate).getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0)   return 'upcoming';
  if (diffDays <= 30) return 'ongoing';
  return 'ended';
}

/**
 * HTML 태그·엔티티를 제거하고 순수 텍스트 반환
 * DOMParser 기반 처리로 XSS 안전합니다.
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent ?? '';
  } catch {
    // DOMParser 사용 불가 환경(SSR 등) fallback
    return html.replace(/<[^>]*>/g, '');
  }
}

/**
 * 텍스트를 maxLength 이하로 자르고 '…' 추가
 */
export function truncateText(text: string, maxLength = 80): string {
  const clean = text.trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength).trimEnd() + '…';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fetch 헬퍼
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * WordPress REST API GET 요청 래퍼
 *
 * - 실패 시 콘솔에 상세 에러를 기록하고, 호출부에는 null 반환
 * - 사용자 노출 메시지와 개발자 디버그 에러를 분리
 * - GET만 허용 (쓰기 요청 의도적 미구현)
 */
async function wpFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const errBody = await res.json();
        detail = (errBody as { message?: string }).message ?? detail;
      } catch { /* JSON 파싱 실패 무시 */ }
      console.error(`[EHSC API] 요청 실패 | ${res.status} | ${url}\n  → ${detail}`);
      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    console.error(`[EHSC API] 네트워크 오류 | ${url}`, err);
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 카테고리 캐시 & API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 카테고리 목록 인메모리 캐시 (페이지 새로고침 시 초기화) */
let _categoryCache: WPCategory[] | null = null;

/**
 * 전체 카테고리 목록 조회 (캐시 포함)
 *
 * 테스트: GET https://cms.example.com/wp-json/wp/v2/categories?per_page=100
 */
export async function getCategories(): Promise<WPCategory[]> {
  if (_categoryCache) return _categoryCache;
  const url  = `${API_ENDPOINTS.categories}?per_page=100`;
  const data = await wpFetch<WPCategory[]>(url);
  _categoryCache = data ?? [];
  return _categoryCache;
}

/**
 * 슬러그(slug)로 카테고리 ID 조회
 *
 * ID를 하드코딩하지 않고 slug 기반으로 조회해
 * WordPress 카테고리 ID 변경에 자동 대응합니다.
 *
 * @returns 카테고리 ID, 또는 slug가 없으면 null (graceful fallback)
 */
export async function getCategoryIdBySlug(slug: string): Promise<number | null> {
  const cats  = await getCategories();
  const found = cats.find((c) => c.slug === slug);
  if (!found) {
    console.warn(
      `[EHSC API] 카테고리 slug '${slug}'를 찾을 수 없습니다.\n` +
      `  → WordPress 관리자 → 글 → 카테고리에서 해당 slug로 카테고리를 생성해 주세요.`
    );
    return null;
  }
  return found.id;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 게시글 API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 게시글 목록 조회
 *
 * - status=publish 고정 (공개 글만)
 * - _embed=1 로 featured image, terms, author 정보를 한 번에 가져옵니다.
 *
 * 테스트:
 *   await getPosts({ per_page: 5 })
 *   await getPosts({ categories: 12, per_page: 10, page: 1 })
 *   await getPosts({ search: '체육대회' })
 */
export async function getPosts(params: GetPostsParams = {}): Promise<WPPost[]> {
  const q = new URLSearchParams();

  // 공개 글만, featured image·terms·author 임베드
  q.set('status', 'publish');
  q.set('_embed',  '1');

  if (params.categories) q.set('categories', String(params.categories));
  if (params.per_page)   q.set('per_page',   String(params.per_page));
  if (params.page)       q.set('page',        String(params.page));
  if (params.search)     q.set('search',      params.search);
  if (params.orderby)    q.set('orderby',     params.orderby);
  if (params.order)      q.set('order',       params.order);
  if (params.slug)       q.set('slug',        params.slug);

  const url = `${API_ENDPOINTS.posts}?${q.toString()}`;
  return (await wpFetch<WPPost[]>(url)) ?? [];
}

/**
 * ID로 단일 게시글 조회
 *
 * 테스트: await getPostById(42)
 */
export async function getPostById(id: number): Promise<WPPost | null> {
  return wpFetch<WPPost>(`${API_ENDPOINTS.posts}/${id}?_embed=1`);
}

/**
 * 슬러그(slug)로 단일 게시글 조회
 *
 * 테스트: await getPostBySlug('2026-spring-sports-day')
 */
export async function getPostBySlug(slug: string): Promise<WPPost | null> {
  const posts = await getPosts({ slug, per_page: 1 });
  return posts[0] ?? null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 미디어 API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 미디어 ID로 이미지 정보 조회
 *
 * ※ 가능하면 getPosts()의 _embed를 통해 featured image를 사용하세요.
 *   이 함수는 _embed가 없는 경우의 fallback용입니다.
 *
 * 테스트: await getMediaById(123)
 */
export async function getMediaById(id: number): Promise<WPMedia | null> {
  if (!id) return null;
  return wpFetch<WPMedia>(`${API_ENDPOINTS.media}/${id}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 데이터 변환 유틸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * _embed 포함 WPPost에서 대표 이미지 URL 추출
 * 우선순위: large → medium_large → medium → source_url(원본)
 */
export function extractFeaturedImageUrl(post: WPPost): string {
  const media = post._embedded?.['wp:featuredmedia']?.[0];
  if (!media) return '';
  const sizes = media.media_details?.sizes;
  return (
    sizes?.large?.source_url       ??
    sizes?.medium_large?.source_url ??
    sizes?.medium?.source_url      ??
    media.source_url               ??
    ''
  );
}

/**
 * _embed 포함 WPPost에서 카테고리 이름 배열 추출
 * _embedded['wp:term'][0] = categories, [1] = tags
 */
export function extractCategories(post: WPPost): string[] {
  const terms = post._embedded?.['wp:term'];
  if (!terms?.[0]) return [];
  return terms[0].map((c) => c.name);
}

/**
 * _embed 포함 WPPost에서 작성자 이름 추출
 */
export function extractAuthor(post: WPPost): string {
  return post._embedded?.author?.[0]?.name ?? '학생자치회';
}

/**
 * WPPost → PostCardData 변환
 *
 * API 응답을 목록 카드 렌더링에 적합한 형태로 정규화합니다.
 * 컴포넌트는 이 구조를 직접 사용하세요.
 */
export function mapPostToCardData(post: WPPost): PostCardData {
  return {
    id:         post.id,
    slug:       post.slug,
    title:      stripHtml(post.title.rendered),
    date:       formatShortDate(post.date),
    rawDate:    post.date,
    excerpt:    truncateText(stripHtml(post.excerpt.rendered), 90),
    imageUrl:   extractFeaturedImageUrl(post),
    imageAlt:   stripHtml(post.title.rendered),
    categories: extractCategories(post),
    author:     extractAuthor(post),
    link:       post.link,
  };
}
