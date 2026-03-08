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
  /** 작성자 (기본값: 학생자치회) */
  author: string;
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
