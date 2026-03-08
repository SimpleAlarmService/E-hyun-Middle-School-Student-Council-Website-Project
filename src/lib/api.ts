/**
 * EHSC Link — Notion Worker API 클라이언트
 * ──────────────────────────────────────────────────────────────
 *
 * Cloudflare Worker(notion-proxy)를 통해 Notion 데이터를 가져옵니다.
 * API 키는 Worker 환경 변수에만 있으므로 브라우저에 노출되지 않습니다.
 */

import { WORKER_BASE_URL } from './config';
import type { PostListResponse, PostDetailResponse } from '../types/notion';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API 함수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface FetchPostsParams {
  category?: string;
  limit?:    number;
  cursor?:   string;
  signal?:   AbortSignal;
}

/** 게시글 목록 조회 */
export async function fetchPosts(params: FetchPostsParams): Promise<PostListResponse> {
  const url = new URL(`${WORKER_BASE_URL}/posts`);
  if (params.category) url.searchParams.set('category', params.category);
  if (params.limit)    url.searchParams.set('limit',    String(params.limit));
  if (params.cursor)   url.searchParams.set('cursor',   params.cursor);

  const res = await fetch(url.toString(), { signal: params.signal });
  if (!res.ok) throw new Error(`Worker ${res.status}`);
  return res.json() as Promise<PostListResponse>;
}

/** 단일 게시글 조회 (properties + Notion blocks) */
export async function fetchPost(id: string, signal?: AbortSignal): Promise<PostDetailResponse> {
  const res = await fetch(`${WORKER_BASE_URL}/posts/${id}`, { signal });
  if (!res.ok) throw new Error(`Worker ${res.status}`);
  return res.json() as Promise<PostDetailResponse>;
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
