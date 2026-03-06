/**
 * EHSC Link — WordPress 데이터 페칭 커스텀 훅
 * ──────────────────────────────────────────────────────────────
 *
 * 각 훅은 { data, isLoading, error } 구조를 반환합니다.
 * 컴포넌트에서 세 가지 상태를 반드시 처리하세요:
 *   - isLoading: 스켈레톤 / 로딩 인디케이터 표시
 *   - error:     사용자 친화적 에러 메시지 표시
 *   - data 빈 배열: 빈 상태(Empty State) UI 표시
 *
 * 추후 확장 포인트:
 *   - usePosts에 pagination (page 파라미터) 추가 가능
 *   - SWR / React Query로 교체해 캐싱·재검증 강화 가능
 *   - usePosts에 search 파라미터 추가해 검색 기능 구현 가능
 */

import { useState, useEffect } from 'react';
import {
  getPosts,
  getPostById,
  getPostBySlug,
  getCategories,
  getCategoryIdBySlug,
  mapPostToCardData,
} from '../lib/api';
import {
  HOME_NOTICES_COUNT,
  HOME_EVENTS_COUNT,
  HOME_GALLERY_COUNT,
  DEFAULT_PER_PAGE,
  CATEGORY_SLUGS,
} from '../lib/config';
import type { WPPost, WPCategory, PostCardData, GetPostsParams } from '../types/wordpress';

// ─── 공통 비동기 상태 타입 ────────────────────────────────────────────────

interface AsyncState<T> {
  data: T;
  isLoading: boolean;
  error: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// usePosts — 게시글 목록
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface UsePostsOptions {
  /** CATEGORY_SLUGS의 값 (예: 'notices', 'events') */
  categorySlug?: string;
  perPage?: number;
  page?: number;
  /** false이면 fetch를 실행하지 않습니다 */
  enabled?: boolean;
}

/** usePosts 반환 타입 (rawPosts 포함) */
type UsePostsResult = AsyncState<PostCardData[]> & { rawPosts: WPPost[] };

/**
 * 게시글 목록 페칭 훅
 *
 * categorySlug를 지정하면 해당 카테고리 게시글만 가져옵니다.
 * 지정하지 않으면 전체 최신 게시글을 가져옵니다.
 *
 * @example
 *   const { data, isLoading, error } = usePosts({ categorySlug: 'notices', perPage: 5 });
 */
export function usePosts(options: UsePostsOptions = {}): UsePostsResult {
  const { categorySlug, perPage = DEFAULT_PER_PAGE, page = 1, enabled = true } = options;

  const [state, setState] = useState<UsePostsResult>({
    data:     [],
    rawPosts: [],
    isLoading: true,
    error:    null,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ data: [], rawPosts: [], isLoading: false, error: null });
      return;
    }

    let isMounted = true;

    const fetchData = async () => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const params: GetPostsParams = { per_page: perPage, page };

        if (categorySlug) {
          const categoryId = await getCategoryIdBySlug(categorySlug);
          // categoryId가 null이면 slug 미존재 → 카테고리 없이 전체 최신 글 조회 (graceful fallback)
          if (categoryId !== null) params.categories = categoryId;
        }

        const posts = await getPosts(params);

        if (isMounted) {
          setState({
            data:      posts.map(mapPostToCardData),
            rawPosts:  posts,
            isLoading: false,
            error:     null,
          });
        }
      } catch (err) {
        console.error('[usePosts] 오류:', err);
        if (isMounted) {
          setState({
            data:      [],
            rawPosts:  [],
            isLoading: false,
            error:     '게시글을 불러오는 데 실패했습니다.',
          });
        }
      }
    };

    fetchData();

    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorySlug, perPage, page, enabled]);

  return state;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// usePost — 단일 게시글
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface UsePostOptions {
  id?:   number;
  slug?: string;
}

/**
 * 단일 게시글 페칭 훅
 * id 또는 slug 중 하나를 전달하세요.
 *
 * @example
 *   const { data: post, isLoading } = usePost({ id: 42 });
 *   const { data: post, isLoading } = usePost({ slug: 'my-post' });
 */
export function usePost(options: UsePostOptions): AsyncState<WPPost | null> {
  const { id, slug } = options;

  const [state, setState] = useState<AsyncState<WPPost | null>>({
    data:      null,
    isLoading: !!id || !!slug,
    error:     null,
  });

  useEffect(() => {
    if (!id && !slug) {
      setState({ data: null, isLoading: false, error: null });
      return;
    }

    let isMounted = true;

    const fetchData = async () => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const post = id
          ? await getPostById(id)
          : await getPostBySlug(slug!);

        if (isMounted) {
          setState({
            data:      post,
            isLoading: false,
            error:     post ? null : '게시글을 찾을 수 없습니다.',
          });
        }
      } catch (err) {
        console.error('[usePost] 오류:', err);
        if (isMounted) {
          setState({ data: null, isLoading: false, error: '게시글을 불러오는 데 실패했습니다.' });
        }
      }
    };

    fetchData();

    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, slug]);

  return state;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// useCategories — 카테고리 목록
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 전체 카테고리 목록 페칭 훅 (캐시 포함)
 *
 * @example
 *   const { data: categories } = useCategories();
 */
export function useCategories(): AsyncState<WPCategory[]> {
  const [state, setState] = useState<AsyncState<WPCategory[]>>({
    data:      [],
    isLoading: true,
    error:     null,
  });

  useEffect(() => {
    let isMounted = true;

    getCategories()
      .then((cats) => {
        if (isMounted) setState({ data: cats, isLoading: false, error: null });
      })
      .catch((err) => {
        console.error('[useCategories] 오류:', err);
        if (isMounted) {
          setState({ data: [], isLoading: false, error: '카테고리 정보를 불러오지 못했습니다.' });
        }
      });

    return () => { isMounted = false; };
  }, []);

  return state;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 홈 페이지 특화 훅
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 메인 홈 공지사항 위젯용 훅
 *
 * 카테고리 필터 없이 최신 글 전체를 가져옵니다.
 * 위젯 내 탭(공지/행사/안내)에서 카테고리 이름 기반으로 클라이언트 필터링합니다.
 * → 공지사항, 학생자치회 공지, 행사 공지, 행사 안내 등 모든 공지성 글을 한 번에 표시
 */
export function useHomeNotices(): UsePostsResult {
  return usePosts({
    // categorySlug 미지정 → 전체 최신 글 (탭에서 이름 기반 필터링)
    perPage: HOME_NOTICES_COUNT,
  });
}

/**
 * 메인 홈 '진행 중인 행사' 섹션용 훅
 * '학생회 행사' 카테고리 최신 게시글 HOME_EVENTS_COUNT개 반환
 */
export function useHomeEvents(): UsePostsResult {
  return usePosts({
    categorySlug: CATEGORY_SLUGS.events,
    perPage:      HOME_EVENTS_COUNT,
  });
}

/**
 * 메인 홈 '활동 갤러리' 섹션용 훅
 * '스포츠라이트' 카테고리 최신 게시글 HOME_GALLERY_COUNT개 반환
 */
export function useHomeGallery(): UsePostsResult {
  return usePosts({
    categorySlug: CATEGORY_SLUGS.gallery,
    perPage:      HOME_GALLERY_COUNT,
  });
}
