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
import { fetchPosts, fetchPost, fetchClubs, fetchClub, fetchClubBySlug } from '../lib/api';
import {
  CATEGORIES,
  HOME_NOTICES_COUNT,
  HOME_EVENTS_COUNT,
  HOME_GALLERY_COUNT,
  HOME_ARCHIVE_COUNT,
  DEFAULT_PER_PAGE,
} from '../lib/config';
import type { PostCardData, PostDetailResponse, ClubData, ClubDetailResponse } from '../types/notion';

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
// 홈 전용 훅 (고정 카테고리 + 고정 개수)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 홈 공지사항 위젯 — 카테고리 무관 전체 최신글 N건
 * (탭 필터링은 Notices 컴포넌트에서 클라이언트 사이드로 처리)
 */
export function useHomeNotices(): UsePostsReturn {
  return usePosts({ perPage: HOME_NOTICES_COUNT });
}

/**
 * 홈 진행 행사 섹션 — 모든 이벤트 카테고리 통합 최신 N건
 * (학생회 행사 + 스포츠라이트 + 체육대회/이현제)
 */
export function useHomeEvents(): UsePostsReturn {
  return usePosts({
    categories: [CATEGORIES.events, CATEGORIES.gallery, CATEGORIES.sportsDay],
    perPage:    HOME_EVENTS_COUNT,
  });
}

/** 홈 갤러리 섹션 (스포츠라이트 최신 N건) */
export function useHomeGallery(): UsePostsReturn {
  return usePosts({ category: CATEGORIES.gallery, perPage: HOME_GALLERY_COUNT });
}

/** 홈 자료실 섹션 (회의록 + 기타자료실 최신 N건) */
export function useHomeArchive(): UsePostsReturn {
  return usePosts({
    categories: [CATEGORIES.minutes, CATEGORIES.resourcesEtc],
    perPage: HOME_ARCHIVE_COUNT,
  });
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
