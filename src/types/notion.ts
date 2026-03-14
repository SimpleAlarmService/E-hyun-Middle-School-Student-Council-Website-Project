/**
 * EHSC Link — Notion CMS 타입 정의
 * ──────────────────────────────────────────────────────────────
 *
 * Cloudflare Worker(notion-proxy)가 반환하는 데이터 구조를 정의합니다.
 * Notion API 원본 구조는 Workers 쪽에서 처리하므로 여기서는
 * 클라이언트가 소비하는 형태만 정의합니다.
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 목록/카드 공통 타입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 목록 카드 · 테이블 행에서 공통으로 사용하는 게시글 데이터 */
export interface PostCardData {
  /** Notion 페이지 UUID */
  id: string;
  /** 제목 (plain text) */
  title: string;
  /** 표시용 날짜 (예: "2026년 3월 8일") */
  date: string;
  /** ISO 날짜 (예: "2026-03-08") — 행사 상태 계산 등에 사용 */
  rawDate: string;
  /** 요약 텍스트 (DB 속성 「요약」) */
  excerpt: string;
  /** 본문 텍스트 (DB 속성 「내용」) */
  content: string;
  /** 진행 여부 Select 값 (예: '예정', '진행중', '종료') — 공지사항 제외 */
  eventStatus: string;
  /** 대표 이미지 URL */
  imageUrl: string;
  /** 대표 이미지 alt 텍스트 */
  imageAlt: string;
  /** 카테고리 이름 배열 (한글) */
  categories: string[];
  /** Notion 페이지 외부 URL (자료실 외부 링크 등) */
  link: string;
  /** YouTube 영상 URL (EHBS 방송부용, DB 속성 「유튜브」) */
  youtubeUrl?: string;
  /** 작성자 (기본값: 학생자치회) */
  author: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 대표 동아리 타입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 대표 동아리 카드 데이터 (GET /clubs 응답 results 아이템) */
export interface ClubData {
  /** Notion 페이지 UUID */
  id: string;
  /** 동아리명 */
  name: string;
  /**
   * 고유 슬러그 (예: bora-dance)
   * — Notion DB 「slug」Text 속성에 직접 입력
   * — URL 딥링크 라우팅에 사용. 없으면 빈 문자열
   */
  slug: string;
  /** 활동분야 (예: 공연, 체육, 학술, 예술, 기타) */
  field: string;
  /** 짧은 설명 (목록 카드 미리보기용) */
  description: string;
  /** 상세 설명 (상세 페이지에서만 표시) */
  detailDesc: string;
  /** 활동상태 (예: 활동 중, 모집 중, 시즌 종료, 휴면) */
  status: string;
  /** 대회참가 여부 */
  hasCompetition: boolean;
  /** 정렬순서 — 낮을수록 목록 앞쪽에 표시 (없으면 999) */
  order: number;
  /** 대표이미지 URL */
  imageUrl: string;
  /** 대표이미지 alt */
  imageAlt: string;
}

/** GET /clubs 응답 */
export interface ClubListResponse {
  results:    ClubData[];
  hasMore:    boolean;
  nextCursor: string | null;
}

/** GET /clubs/:id 응답 */
export interface ClubDetailResponse {
  club:   ClubData;
  blocks: NotionBlock[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 동아리 활동 게시글 타입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 동아리 활동 게시글 카드 데이터 (GET /club-posts 응답 results 아이템) */
export interface ClubPostData {
  /** Notion 페이지 UUID */
  id: string;
  /** 게시글 제목 */
  title: string;
  /**
   * 고유 슬러그 (예: bora-2025-showcase)
   * — Notion DB 「slug」Text 속성에 입력
   * — URL 딥링크에 사용. 없으면 빈 문자열
   */
  slug: string;
  /** 작성한 동아리 이름 (Select 속성 「동아리명」) */
  clubName: string;
  /** 요약 텍스트 (카드 미리보기) */
  summary: string;
  /** 표시용 날짜 (예: 2026년 3월 8일) */
  date: string;
  /** ISO 날짜 (예: 2026-03-08) */
  rawDate: string;
  /** 작성자 */
  author: string;
  /** 대표이미지 URL */
  imageUrl: string;
  /** 대표이미지 alt 텍스트 */
  imageAlt: string;
  /** 공개 여부 (서버에서 이미 필터링, 클라이언트 참조용) */
  isPublic: boolean;
}

/** GET /club-posts 응답 */
export interface ClubPostListResponse {
  results:    ClubPostData[];
  hasMore:    boolean;
  nextCursor: string | null;
}

/** GET /club-posts/:id  또는  GET /club-posts/by-slug/:slug 응답 */
export interface ClubPostDetailResponse {
  post:   ClubPostData;
  blocks: NotionBlock[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Worker 응답 타입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** GET /posts 응답 */
export interface PostListResponse {
  results:    PostCardData[];
  hasMore:    boolean;
  nextCursor: string | null;
}

/** GET /posts/:id 응답 */
export interface PostDetailResponse {
  post:   PostCardData;
  blocks: NotionBlock[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Notion Block 타입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface NotionRichText {
  plain_text: string;
  annotations: {
    bold:          boolean;
    italic:        boolean;
    strikethrough: boolean;
    underline:     boolean;
    code:          boolean;
    color:         string;
  };
  text: {
    content: string;
    link: { url: string } | null;
  };
}

interface NotionFileRef {
  type:      'external' | 'file';
  external?: { url: string };
  file?:     { url: string };
  caption?:  NotionRichText[];
}

export interface NotionBlock {
  id:           string;
  type:         string;
  has_children: boolean;

  paragraph?:          { rich_text: NotionRichText[]; color?: string };
  heading_1?:          { rich_text: NotionRichText[]; color?: string };
  heading_2?:          { rich_text: NotionRichText[]; color?: string };
  heading_3?:          { rich_text: NotionRichText[]; color?: string };
  bulleted_list_item?: { rich_text: NotionRichText[]; color?: string };
  numbered_list_item?: { rich_text: NotionRichText[]; color?: string };
  quote?:              { rich_text: NotionRichText[]; color?: string };
  callout?:            { rich_text: NotionRichText[]; icon?: { emoji?: string }; color?: string };
  code?:               { rich_text: NotionRichText[]; language?: string };
  divider?:            Record<string, never>;
  image?:              NotionFileRef;
  video?:              { type: 'external'; external: { url: string } };
  toggle?:             { rich_text: NotionRichText[]; color?: string; children?: NotionBlock[] };
}
