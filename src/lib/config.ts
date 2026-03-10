/**
 * EHSC Link — Notion CMS 설정
 * ──────────────────────────────────────────────────────────────
 *
 * Worker URL만 변경하면 전체 API 주소가 자동으로 업데이트됩니다.
 *
 * ⚠️  보안 메모:
 *   - Notion API 키는 절대 이 파일에 포함하지 마세요.
 *   - API 키는 Cloudflare Worker secret으로 관리됩니다.
 *   - 브라우저는 Worker(CORS 허용)를 통해서만 Notion에 접근합니다.
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ▼ Cloudflare Worker 배포 후 이 URL을 교체하세요 ▼
export const WORKER_BASE_URL: string =
  /* Vite 환경변수 (선택). 없으면 기본 Worker URL 사용 */
  (typeof import.meta !== 'undefined'
    ? (import.meta as unknown as { env: Record<string, string> }).env?.VITE_WORKER_URL
    : undefined) ??
  'https://ehsc-notion-proxy.simple-alarm-service.workers.dev';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Notion DB 카테고리(Select) 값
 * Notion 데이터베이스의 「카테고리」속성 선택값과 정확히 일치해야 합니다.
 */
export const CATEGORIES = {
  /** 공지사항 페이지 */
  notices:      '공지사항',

  /** 학생회 행사 페이지 */
  events:       '학생회 행사',

  /** 스포츠라이트 (사진 갤러리) */
  gallery:      '스포츠라이트',

  /** 체육대회 / 이현제 */
  sportsDay:    '체육대회/이현제',

  /** 회의록 */
  minutes:      '회의록',

  /** 기타자료실 */
  resourcesEtc: '기타자료실',

  /** EHBS 방송부 */
  ehbs: 'EHBS',
} as const;

export type CategoryKey = keyof typeof CATEGORIES;
export type CategoryValue = (typeof CATEGORIES)[CategoryKey];

// ─── 표시 설정 ────────────────────────────────────────────────────────────

/** 기본 페이지당 게시글 수 */
export const DEFAULT_PER_PAGE = 10;

/** 메인 홈 공지사항 위젯 최대 표시 수 (탭 필터용으로 여유있게 가져옴) */
export const HOME_NOTICES_COUNT = 10;

/** 메인 홈 진행 행사 최대 표시 수 */
export const HOME_EVENTS_COUNT = 3;

/** 메인 홈 갤러리 미리보기 최대 수 */
export const HOME_GALLERY_COUNT = 4;
