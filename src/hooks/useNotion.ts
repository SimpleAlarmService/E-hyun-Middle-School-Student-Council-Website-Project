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
 */

import { useState, useEffect } from 'react';
import { fetchPosts, fetchPost } from '../lib/api';
import {
  CATEGORIES,
  HOME_NOTICES_COUNT,
  HOME_EVENTS_COUNT,
  HOME_GALLERY_COUNT,
  DEFAULT_PER_PAGE,
} from '../lib/config';
import type { PostCardData, PostDetailResponse } from '../types/notion';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// usePosts — 게시글 목록
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UsePostsParams {
  /** Notion 카테고리 Select 값 (예: '공지사항', '학생회 행사') */
  category?: string;
  /** 가져올 최대 게시글 수 (기본값: DEFAULT_PER_PAGE) */
  perPage?:  number;
}

export interface UsePostsReturn {
  data:      PostCardData[];
  isLoading: boolean;
  error:     string | null;
}

export function usePosts({ category, perPage }: UsePostsParams): UsePostsReturn {
  const [data,      setData]    = useState<PostCardData[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error,     setError]   = useState<string | null>(null);

  useEffect(() => {
    setData([]);
    setLoading(true);
    setError(null);

    const controller = new AbortController();

    fetchPosts({
      category,
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
  }, [category, perPage]);

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

/** 홈 공지사항 위젯 (공지사항 최신 N건) */
export function useHomeNotices(): UsePostsReturn {
  return usePosts({ category: CATEGORIES.notices, perPage: HOME_NOTICES_COUNT });
}

/** 홈 진행 행사 섹션 (학생회 행사 최신 N건) */
export function useHomeEvents(): UsePostsReturn {
  return usePosts({ category: CATEGORIES.events, perPage: HOME_EVENTS_COUNT });
}

/** 홈 갤러리 섹션 (스포츠라이트 최신 N건) */
export function useHomeGallery(): UsePostsReturn {
  return usePosts({ category: CATEGORIES.gallery, perPage: HOME_GALLERY_COUNT });
}
