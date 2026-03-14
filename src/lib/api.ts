/**
 * EHSC Link — Notion Worker API 클라이언트
 * ──────────────────────────────────────────────────────────────
 *
 * Cloudflare Worker(notion-proxy)를 통해 Notion 데이터를 가져옵니다.
 * API 키는 Worker 환경 변수에만 있으므로 브라우저에 노출되지 않습니다.
 */

import { WORKER_BASE_URL } from './config';
import type { PostListResponse, PostDetailResponse, ClubListResponse, ClubDetailResponse } from '../types/notion';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 이미지 URL 유틸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Notion 내부 S3 업로드 이미지 URL을 Worker 이미지 프록시 URL로 변환합니다.
 * Notion S3 URL은 1시간 후 만료되지만, Worker 프록시를 거치면
 * Cloudflare CDN에 365일간 캐시되어 안정적으로 제공됩니다.
 * 외부 URL(Imgur, Google Drive 등)은 그대로 반환합니다.
 */
export function notionImageUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  // Notion 내부 업로드 이미지 S3 URL 패턴
  if (
    rawUrl.includes('prod-files-secure.s3') ||
    rawUrl.includes('secure.notion-static.com') ||
    rawUrl.includes('s3.us-west-2.amazonaws.com') ||
    rawUrl.includes('s3-us-west-2.amazonaws.com')
  ) {
    return `${WORKER_BASE_URL}/image?url=${encodeURIComponent(rawUrl)}`;
  }
  return rawUrl;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API 함수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface FetchPostsParams {
  category?:   string;
  categories?: string[];   // 다중 카테고리 OR 검색
  limit?:      number;
  cursor?:     string;
  signal?:     AbortSignal;
}

/** 게시글 목록 조회 */
export async function fetchPosts(params: FetchPostsParams): Promise<PostListResponse> {
  const url = new URL(`${WORKER_BASE_URL}/posts`);
  if (params.categories?.length)
    url.searchParams.set('categories', params.categories.join(','));
  else if (params.category)
    url.searchParams.set('category', params.category);
  if (params.limit)  url.searchParams.set('limit',  String(params.limit));
  if (params.cursor) url.searchParams.set('cursor',  params.cursor);

  const res = await fetch(url.toString(), { signal: params.signal });
  if (!res.ok) throw new Error(`Worker ${res.status}`);
  const json = await res.json() as PostListResponse;
  // Notion S3 URL → Worker 이미지 프록시 URL 로 변환 (만료 방지)
  return {
    ...json,
    results: json.results.map((post) => ({ ...post, imageUrl: notionImageUrl(post.imageUrl) })),
  };
}

/** 단일 게시글 조회 (properties + Notion blocks) */
export async function fetchPost(id: string, signal?: AbortSignal): Promise<PostDetailResponse> {
  const res = await fetch(`${WORKER_BASE_URL}/posts/${id}`, { signal });
  if (!res.ok) throw new Error(`Worker ${res.status}`);
  const json = await res.json() as PostDetailResponse;
  // Notion S3 URL → Worker 이미지 프록시 URL 로 변환 (만료 방지)
  return {
    ...json,
    post: { ...json.post, imageUrl: notionImageUrl(json.post.imageUrl) },
  };
}

/** 대표 동아리 목록 조회 */
export async function fetchClubs(signal?: AbortSignal): Promise<ClubListResponse> {
  const res = await fetch(`${WORKER_BASE_URL}/clubs`, { signal });
  if (!res.ok) throw new Error(`Worker ${res.status}`);
  const json = await res.json() as ClubListResponse;
  return {
    ...json,
    results: json.results.map((club) => ({ ...club, imageUrl: notionImageUrl(club.imageUrl) })),
  };
}

/** 동아리 단건 상세 조회 (Notion 페이지 ID 기반) */
export async function fetchClub(id: string, signal?: AbortSignal): Promise<ClubDetailResponse> {
  const res = await fetch(`${WORKER_BASE_URL}/clubs/${id}`, { signal });
  if (!res.ok) throw new Error(`Worker ${res.status}`);
  const json = await res.json() as ClubDetailResponse;
  return {
    ...json,
    club: { ...json.club, imageUrl: notionImageUrl(json.club.imageUrl) },
  };
}

/** 동아리 단건 상세 조회 (slug 기반 — URL 딥링크 지원) */
export async function fetchClubBySlug(slug: string, signal?: AbortSignal): Promise<ClubDetailResponse> {
  const res = await fetch(`${WORKER_BASE_URL}/clubs/by-slug/${encodeURIComponent(slug)}`, { signal });
  if (!res.ok) throw new Error(`Worker ${res.status}`);
  const json = await res.json() as ClubDetailResponse;
  return {
    ...json,
    club: { ...json.club, imageUrl: notionImageUrl(json.club.imageUrl) },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 날짜 유틸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ISO 날짜 → "YYYY년 M월 D일" */
export function formatKoreanDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** ISO 날짜 → "YYYY.MM.DD" */
export function formatShortDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('.');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 행사 상태 추론
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type EventStatus = 'upcoming' | 'ongoing' | 'ended';

/**
 * 작성일(rawDate: ISO 날짜)로 행사 상태를 추론합니다.
 *   - 미래(아직 안 됨): upcoming
 *   - 14일 이내: ongoing
 *   - 14일 이상 지남: ended
 */
export function deriveEventStatus(rawDate: string): EventStatus {
  if (!rawDate) return 'ended';
  const postDate  = new Date(rawDate);
  if (isNaN(postDate.getTime())) return 'ended';
  const daysSince = (Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 0)   return 'upcoming';
  if (daysSince < 14)  return 'ongoing';
  return 'ended';
}

/**
 * Notion 「진행 여부」 Select 값 → EventStatus 변환
 *   '예정' / '진행 전' → upcoming
 *   '진행중' / '진행 중' → ongoing
 *   '종료' / '완료' 또는 기타 → ended
 */
export function mapEventStatus(notionStatus: string): EventStatus {
  if (!notionStatus) return 'ended';
  if (notionStatus.includes('예정') || notionStatus.includes('진행 전')) return 'upcoming';
  if (notionStatus.includes('진행')) return 'ongoing';
  return 'ended';
}
