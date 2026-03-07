/**
 * WordPress REST API 응답 타입 정의
 * ──────────────────────────────────────────────────────────────
 *
 * 참고 문서: https://developer.wordpress.org/rest-api/reference/
 *
 * 주요 인터페이스:
 *  - WPPost       : 게시글 전체 응답 (content, title, excerpt 포함)
 *  - WPCategory   : 카테고리 응답
 *  - WPMedia      : 미디어(이미지) 응답
 *  - PostCardData : API 응답을 화면 카드용으로 정규화한 구조
 *  - GetPostsParams : getPosts() 호출 파라미터
 */

// ─── WordPress 기본 타입 ──────────────────────────────────────────────────

/** WordPress rendered 필드 (title, excerpt, content 등) */
export interface WPRendered {
  rendered: string;
  protected?: boolean;
}

/** WordPress 카테고리 응답 */
export interface WPCategory {
  id: number;
  count: number;
  description: string;
  link: string;
  name: string;
  slug: string;
  taxonomy: string;
  parent: number;
}

/** 이미지 크기 단위 */
export interface WPMediaSize {
  source_url: string;
  width: number;
  height: number;
}

/** WordPress 미디어(이미지) 응답 */
export interface WPMedia {
  id: number;
  date: string;
  slug: string;
  link: string;
  title: WPRendered;
  alt_text: string;
  source_url: string;
  media_details: {
    width: number;
    height: number;
    file: string;
    sizes: {
      thumbnail?:    WPMediaSize;
      medium?:       WPMediaSize;
      medium_large?: WPMediaSize;
      large?:        WPMediaSize;
      full?:         WPMediaSize;
    };
  };
}

/** _embed 포함 시 featured media 내부 구조 */
export interface WPEmbeddedFeaturedMedia {
  id: number;
  source_url: string;
  alt_text: string;
  media_details?: {
    sizes?: {
      thumbnail?:    WPMediaSize;
      medium?:       WPMediaSize;
      medium_large?: WPMediaSize;
      large?:        WPMediaSize;
    };
  };
}

// ─── 게시글 타입 ──────────────────────────────────────────────────────────

/**
 * WordPress 게시글 응답
 *
 * _embed=1 파라미터 포함 시 featuredmedia, terms, author 정보가
 * _embedded 필드에 추가됩니다.
 */
export interface WPPost {
  id: number;
  date: string;           // ISO 8601 형식 (서버 로컬 시간)
  date_gmt: string;
  modified: string;
  slug: string;
  status: 'publish' | 'draft' | 'pending' | 'private' | 'trash';
  link: string;           // WordPress 원본 URL
  title: WPRendered;
  content: WPRendered;
  excerpt: WPRendered;
  author: number;         // author ID
  featured_media: number; // 0이면 대표 이미지 없음
  categories: number[];   // 카테고리 ID 배열
  tags: number[];

  /** _embed=1 파라미터 사용 시 포함되는 임베드 데이터 */
  _embedded?: {
    'wp:featuredmedia'?: WPEmbeddedFeaturedMedia[];
    'wp:term'?: WPCategory[][];   // [0]: categories, [1]: tags
    author?: Array<{
      id: number;
      name: string;
      avatar_urls?: Record<string, string>;
    }>;
  };
}

// ─── API 파라미터 타입 ────────────────────────────────────────────────────

/** getPosts() 호출 시 파라미터 */
export interface GetPostsParams {
  categories?: number;                          // 카테고리 ID
  per_page?: number;                            // 한 페이지 게시글 수
  page?: number;                                // 페이지 번호 (1부터)
  search?: string;                              // 검색어
  orderby?: 'date' | 'title' | 'id' | 'relevance';
  order?: 'asc' | 'desc';
  slug?: string;                                // slug로 단일 조회용
}

// ─── 정규화된 카드 데이터 ─────────────────────────────────────────────────

/**
 * 화면 카드 렌더링용 정규화된 포스트 데이터
 *
 * WPPost를 mapPostToCardData()로 변환한 결과로,
 * 컴포넌트에서 직접 사용하는 단순화된 구조입니다.
 */
export interface PostCardData {
  id: number;
  slug: string;
  title: string;         // HTML 제거된 순수 텍스트
  date: string;          // "2026.03.07" 형식 (표시용)
  rawDate: string;       // ISO 8601 원본 날짜 (예: "2026-03-07T10:30:00", 상태 계산용)
  excerpt: string;       // HTML 제거 후 잘린 요약 텍스트
  imageUrl: string;      // 대표 이미지 URL (없으면 빈 문자열 '')
  imageAlt: string;      // 이미지 alt 텍스트
  categories: string[];  // 카테고리 이름 배열 (한글)
  author: string;        // 작성자 이름
  link: string;          // WordPress 원본 URL (외부 링크 참조용)
}
