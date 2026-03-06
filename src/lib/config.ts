/**
 * EHSC Link — WordPress CMS API 설정
 * ──────────────────────────────────────────────────────────────
 *
 * ✅ CMS_BASE_URL 하나만 변경하면 전체 API 주소가 자동으로 업데이트됩니다.
 *
 * ⚠️  보안 & 운영 메모:
 *   - 이 파일에는 인증 정보(API Key, Application Password 등)를 절대 포함하지 마세요.
 *   - 비공개 글은 인증 없이 조회 불가합니다 (WordPress 기본 동작).
 *   - 이 사이트는 공개 게시글 읽기 전용으로만 동작합니다.
 *   - 쓰기 / 수정 / 삭제 API는 구현하지 않습니다.
 *
 * 참고: ehscdb.wordpress.com은 wordpress.com 호스팅 사이트이므로
 *       표준 /wp-json/wp/v2/ 대신 WordPress.com 공개 WP API를 사용합니다.
 *       응답 JSON 구조는 표준 WP REST API와 동일합니다.
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ▼ 다른 WordPress 사이트로 이전할 경우 이 주소만 변경하세요 ▼
export const CMS_BASE_URL = 'https://public-api.wordpress.com/wp/v2/sites/ehscdb.wordpress.com';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * API 엔드포인트 상수
 * CMS_BASE_URL을 기반으로 자동 조합됩니다. 직접 수정 불필요.
 */
export const API_ENDPOINTS = {
  posts:      `${CMS_BASE_URL}/posts`,
  categories: `${CMS_BASE_URL}/categories`,
  media:      `${CMS_BASE_URL}/media`,
  pages:      `${CMS_BASE_URL}/pages`,
  tags:       `${CMS_BASE_URL}/tags`,
} as const;

/**
 * WordPress 카테고리 슬러그 → 실제 ehscdb.wordpress.com 카테고리 매핑
 *
 * wordpress.com 호스팅은 한글 카테고리 이름을 URL 인코딩된 slug로 저장합니다.
 * 아래 slug 값은 WordPress 관리자 > 글 > 카테고리에서 확인한 실제 값입니다.
 *
 * | slug 상수      | 실제 WordPress slug                                     | 카테고리 이름      |
 * |----------------|---------------------------------------------------------|--------------------|
 * | notices        | %ea%b3%b5%ec%a7%80%ec%82%ac%ed%95%ad                    | 공지사항           |
 * | events         | %ed%95%99%ec%83%9d%ed%9a%8c-%ed%96%89%ec%82%ac          | 학생회 행사        |
 * | sportsDay      | %ec%b2%b4%ec%9c%a1%eb%8c%80%ed%9a%8c-%ec%9d%b4%ed%98%84%ec%a0%9c | 체육대회/이현제 |
 * | gallery        | %ec%8a%a4%ed%8f%ac%ec%b8%a0%eb%9d%bc%ec%9d%b4%ed%8a%b8  | 스포츠라이트       |
 * | resources      | %ec%9e%90%eb%a3%8c%ec%8b%a4                             | 자료실             |
 * | resourcesEtc   | %ea%b8%b0%ed%83%80%ec%9e%90%eb%a3%8c%ec%8b%a4           | 기타자료실         |
 * | minutes        | %ed%9a%8c%ec%9d%98%eb%a1%9d                             | 회의록             |
 * | clubs          | (없음 - 빈 상태 표시)                                    | -                  |
 */
export const CATEGORY_SLUGS = {
  /** 공지사항 페이지 */
  notices:       '%ea%b3%b5%ec%a7%80%ec%82%ac%ed%95%ad',

  /** 학생회 행사 페이지 */
  events:        '%ed%95%99%ec%83%9d%ed%9a%8c-%ed%96%89%ec%82%ac',

  /** 체육대회 / 이현제 */
  sportsDay:     '%ec%b2%b4%ec%9c%a1%eb%8c%80%ed%9a%8c-%ec%9d%b4%ed%98%84%ec%a0%9c',

  /** 스포츠라이트 (갤러리 / 스포츠 사진) */
  gallery:       '%ec%8a%a4%ed%8f%ac%ec%b8%a0%eb%9d%bc%ec%9d%b4%ed%8a%b8',

  /** 자료실 */
  resources:     '%ec%9e%90%eb%a3%8c%ec%8b%a4',

  /** 기타자료실 */
  resourcesEtc:  '%ea%b8%b0%ed%83%80%ec%9e%90%eb%a3%8c%ec%8b%a4',

  /** 회의록 */
  minutes:       '%ed%9a%8c%ec%9d%98%eb%a1%9d',

  /** 자율동아리 (현재 WordPress 사이트에 카테고리 없음 → 빈 상태 표시) */
  clubs:         '',
} as const;

export type CategorySlug = (typeof CATEGORY_SLUGS)[keyof typeof CATEGORY_SLUGS];

// ─── 표시 설정 ────────────────────────────────────────────────────────────

/** 기본 페이지당 게시글 수 */
export const DEFAULT_PER_PAGE = 10;

/** 메인 홈 공지사항 위젯 최대 표시 수 */
export const HOME_NOTICES_COUNT = 5;

/** 메인 홈 진행 행사 최대 표시 수 */
export const HOME_EVENTS_COUNT = 3;

/** 메인 홈 갤러리 미리보기 최대 수 */
export const HOME_GALLERY_COUNT = 4;
