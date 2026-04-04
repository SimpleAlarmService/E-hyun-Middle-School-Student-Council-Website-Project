/**
 * useNotion — Notion CMS 데이터 패칭 훅
 * ──────────────────────────────────────────────────────────────
 *
 * Cloudflare Worker(notion-proxy)를 통해 Notion 데이터를 가져옵니다.
 *
 * 제공 훅:
 *   usePosts(params)      — 카테고리별 게시글 목록
 *   usePost(id)           — 단일 게시글 상세 (properties + blocks)
 *   useHomeNotices()      — 홈 공지사항 위젯용 (최신 5건)
 *   useHomeEvents()       — 홈 진행 행사 섹션용 (최신 3건)
 *   useHomeGallery()      — 홈 갤러리 섹션용 (최신 4건)
 *   useHomeArchive()      — 홈 자료실 섹션용 (최신 4건, 회의록+기타자료실)
 */

import { useState, useEffect } from 'react';
import { fetchPosts, fetchPost, fetchClubs, fetchClub, fetchClubBySlug, fetchClubPosts, fetchClubPost, fetchClubPostBySlug, fetchClubPostsByClub, fetchHomeData } from '../lib/api';
import {
  DEFAULT_PER_PAGE,
} from '../lib/config';
import type {
  PostCardData, PostDetailResponse,
  ClubData, ClubDetailResponse,
  ClubPostData, ClubPostDetailResponse,
  HomeDataResponse,
} from '../types/notion';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// usePosts — 게시글 목록
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UsePostsParams {
  /** 단일 카테고리 Select 값 */
  category?:   string;
  /** 복수 카테고리 OR 검색 (예: ['학생회 행사', '스포츠라이트']) */
  categories?: string[];
  /** 가져올 최대 게시글 수 (기본값: DEFAULT_PER_PAGE) */
  perPage?:    number;
}

export interface UsePostsReturn {
  data:      PostCardData[];
  isLoading: boolean;
  error:     string | null;
}

export function usePosts({ category, categories, perPage }: UsePostsParams): UsePostsReturn {
  const [data,      setData]    = useState<PostCardData[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error,     setError]   = useState<string | null>(null);

  // categories 배열을 안정적인 문자열 키로 변환 (useEffect 의존성)
  const categoriesKey = categories?.join(',') ?? '';

  useEffect(() => {
    setData([]);
    setLoading(true);
    setError(null);

    const controller = new AbortController();

    fetchPosts({
      category,
      categories,
      limit:  perPage ?? DEFAULT_PER_PAGE,
      signal: controller.signal,
    })
      .then((res) => setData(res.results))
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        console.warn('[useNotion/usePosts]', err);
        setError('데이터를 불러올 수 없습니다.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, categoriesKey, perPage]);

  return { data, isLoading, error };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// usePost — 단일 게시글 상세
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UsePostReturn {
  /** Worker에서 반환된 게시글 상세 (post + blocks) */
  detail:    PostDetailResponse | null;
  isLoading: boolean;
  error:     string | null;
}

export function usePost(id: string | null): UsePostReturn {
  const [detail,    setDetail]  = useState<PostDetailResponse | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error,     setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }

    setDetail(null);
    setLoading(true);
    setError(null);

    const controller = new AbortController();

    fetchPost(id, controller.signal)
      .then(setDetail)
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        console.warn('[useNotion/usePost]', err);
        setError('게시글을 불러올 수 없습니다.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [id]);

  return { detail, isLoading, error };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 홈 통합 훅 — /home-data 엔드포인트로 1번 요청
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 모듈 레벨 in-flight 중복 요청 방지
 * 홈 페이지에서 4개 훅이 동시에 마운트될 때 fetch는 1번만 실행됩니다.
 */
let _homeDataPromise: Promise<HomeDataResponse> | null = null;
let _homeDataAt = 0;
const HOME_DATA_DEDUP_MS = 3_000; // 3초 이내 중복 요청 차단

function fetchHomeDataOnce(): Promise<HomeDataResponse> {
  const now = Date.now();
  if (_homeDataPromise && now - _homeDataAt < HOME_DATA_DEDUP_MS) {
    return _homeDataPromise;
  }
  _homeDataAt = now;
  const p = fetchHomeData();
  _homeDataPromise = p;
  p.catch(() => { _homeDataPromise = null; }); // 오류 시 캐시 비움
  return p;
}

export interface UseHomeDataReturn {
  data:      HomeDataResponse | null;
  isLoading: boolean;
  error:     string | null;
}

/**
 * 홈 통합 데이터 훅 — notices / events / gallery / archive 한 번에 로드
 *
 * Worker /home-data 엔드포인트를 호출하여 기존 4번의 API 호출을 1번으로 줄입니다.
 * 홈 컴포넌트 어디서 호출해도 3초 이내에는 Fetch가 1번만 실행됩니다.
 */
export function useHomeData(): UseHomeDataReturn {
  const [data,      setData]    = useState<HomeDataResponse | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error,     setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetchHomeDataOnce()
      .then((res) => { setData(res); })
      .catch((err: Error) => {
        console.warn('[useNotion/useHomeData]', err);
        setError('홈 데이터를 불러올 수 없습니다.');
      })
      .finally(() => setLoading(false));
  }, []);

  return { data, isLoading, error };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 홈 전용 훅 — useHomeData()에 위임 (하위 호환 유지)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 홈 공지사항 위젯 — useHomeData().notices 반환 */
export function useHomeNotices(): UsePostsReturn {
  const { data, isLoading, error } = useHomeData();
  return { data: data?.notices ?? [], isLoading, error };
}

/** 홈 진행 행사 섹션 — useHomeData().events 반환 */
export function useHomeEvents(): UsePostsReturn {
  const { data, isLoading, error } = useHomeData();
  return { data: data?.events ?? [], isLoading, error };
}

/** 홈 갤러리 섹션 — useHomeData().gallery 반환 */
export function useHomeGallery(): UsePostsReturn {
  const { data, isLoading, error } = useHomeData();
  return { data: data?.gallery ?? [], isLoading, error };
}

/** 홈 자료실 섹션 — useHomeData().archive 반환 */
export function useHomeArchive(): UsePostsReturn {
  const { data, isLoading, error } = useHomeData();
  return { data: data?.archive ?? [], isLoading, error };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 대표 동아리 훅
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UseClubsReturn {
  data:      ClubData[];
  isLoading: boolean;
  error:     string | null;
}

/** 대표 동아리 목록 (게시여부=true 전체) */
export function useClubs(): UseClubsReturn {
  const [data,      setData]    = useState<ClubData[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error,     setError]   = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setData([]);
    setLoading(true);
    setError(null);

    fetchClubs(controller.signal)
      .then((res) => setData(res.results))
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        console.warn('[useNotion/useClubs]', err);
        setError('동아리 정보를 불러올 수 없습니다.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  return { data, isLoading, error };
}

export interface UseClubReturn {
  detail:    ClubDetailResponse | null;
  isLoading: boolean;
  error:     string | null;
}

/** 동아리 단건 상세 (Notion 페이지 ID 기반) */
export function useClub(id: string | null): UseClubReturn {
  const [detail,    setDetail]  = useState<ClubDetailResponse | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error,     setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setDetail(null); return; }

    setDetail(null);
    setLoading(true);
    setError(null);

    const controller = new AbortController();

    fetchClub(id, controller.signal)
      .then(setDetail)
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        console.warn('[useNotion/useClub]', err);
        setError('동아리 정보를 불러올 수 없습니다.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [id]);

  return { detail, isLoading, error };
}

/** 동아리 단건 상세 (slug 기반 — URL 딥링크 지원) */
export function useClubBySlug(slug: string | null): UseClubReturn {
  const [detail,    setDetail]  = useState<ClubDetailResponse | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error,     setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!slug) { setDetail(null); return; }

    setDetail(null);
    setLoading(true);
    setError(null);

    const controller = new AbortController();

    fetchClubBySlug(slug, controller.signal)
      .then(setDetail)
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        console.warn('[useNotion/useClubBySlug]', err);
        setError('동아리 정보를 불러올 수 없습니다.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [slug]);

  return { detail, isLoading, error };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// useClubUnified — slug 또는 ID 자동 판별
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Notion 페이지 UUID 패턴 (32자리 hex 또는 hyphen 구분) */
function isNotionId(s: string): boolean {
  return /^[0-9a-f]{32}$/i.test(s) ||
         /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(s);
}

/**
 * 동아리 단건 상세 — identifier가 UUID이면 ID로, 아니면 slug로 조회
 *
 * 사용 예:
 *   useClubUnified('bora-dance')  → slug 조회
 *   useClubUnified('abc123...')   → ID 조회 (하위 호환)
 */
export function useClubUnified(identifier: string | null): UseClubReturn {
  const isId = identifier ? isNotionId(identifier) : true;

  // 두 훅 모두 항상 호출 (Rules of Hooks 준수), 한쪽엔 null을 넘겨 비활성화
  const byId   = useClub(isId  ? identifier : null);
  const bySlug = useClubBySlug(!isId ? identifier : null);

  return isId ? byId : bySlug;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// useClubPosts — 동아리 활동 게시글
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface UseClubPostsReturn {
  data:      ClubPostData[];
  isLoading: boolean;
  error:     string | null;
}

/** 동아리 활동 게시글 목록 */
export function useClubPosts(params: { limit?: number } = {}): UseClubPostsReturn {
  const [data,      setData]    = useState<ClubPostData[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error,     setError]   = useState<string | null>(null);

  useEffect(() => {
    setData([]);
    setLoading(true);
    setError(null);

    const controller = new AbortController();

    fetchClubPosts({ limit: params.limit }, controller.signal)
      .then((res) => setData(res.results))
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        console.warn('[useNotion/useClubPosts]', err);
        setError('활동 기록을 불러올 수 없습니다.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.limit]);

  return { data, isLoading, error };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// useClubPostUnified — slug 또는 ID 자동 판별
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface UseClubPostReturn {
  detail:    ClubPostDetailResponse | null;
  isLoading: boolean;
  error:     string | null;
}

/** 동아리 활동 게시글 단건 (Notion 페이지 ID 기반) */
function useClubPostById(id: string | null): UseClubPostReturn {
  const [detail,    setDetail]  = useState<ClubPostDetailResponse | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error,     setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setDetail(null); return; }

    setDetail(null);
    setLoading(true);
    setError(null);

    const controller = new AbortController();

    fetchClubPost(id, controller.signal)
      .then(setDetail)
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        console.warn('[useNotion/useClubPostById]', err);
        setError('활동 기록을 불러올 수 없습니다.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [id]);

  return { detail, isLoading, error };
}

/** 동아리 활동 게시글 단건 (slug 기반) */
function useClubPostBySlug(slug: string | null): UseClubPostReturn {
  const [detail,    setDetail]  = useState<ClubPostDetailResponse | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error,     setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!slug) { setDetail(null); return; }

    setDetail(null);
    setLoading(true);
    setError(null);

    const controller = new AbortController();

    fetchClubPostBySlug(slug, controller.signal)
      .then(setDetail)
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        console.warn('[useNotion/useClubPostBySlug]', err);
        setError('활동 기록을 불러올 수 없습니다.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [slug]);

  return { detail, isLoading, error };
}

/**
 * 동아리 활동 게시글 단건 — identifier가 UUID면 ID 조회, 아니면 slug 조회
 *
 * 사용 예:
 *   useClubPostUnified('bora-2025-showcase')  → slug 조회
 *   useClubPostUnified('abc123...')           → ID 조회 (하위 호환)
 */
export function useClubPostUnified(identifier: string | null): UseClubPostReturn {
  const isId = identifier ? isNotionId(identifier) : true;

  const byId   = useClubPostById(!isId ? null : identifier);
  const bySlug = useClubPostBySlug(isId ? null : identifier);

  return isId ? byId : bySlug;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// useClubPostsByClub — 특정 동아리의 활동 게시글 목록
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 특정 동아리(clubAddress = 동아리의 페이지주소/slug)에 속한 게시글 목록.
 * ClubDetailPage 하단에 동아리 활동 기록을 표시할 때 사용합니다.
 *
 * @param clubAddress - 동아리의 「페이지주소」 값 (예: 'bora-dance'). null이면 요청 안 함.
 */
export function useClubPostsByClub(clubAddress: string | null): UseClubPostsReturn {
  const [data,      setData]    = useState<ClubPostData[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [error,     setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!clubAddress) {
      setData([]);
      setLoading(false);
      return;
    }

    setData([]);
    setLoading(true);
    setError(null);

    const controller = new AbortController();

    fetchClubPostsByClub(clubAddress, controller.signal)
      .then((res) => setData(res.results))
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        console.warn('[useNotion/useClubPostsByClub]', err);
        setError('활동 기록을 불러올 수 없습니다.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [clubAddress]);

  return { data, isLoading, error };
}
