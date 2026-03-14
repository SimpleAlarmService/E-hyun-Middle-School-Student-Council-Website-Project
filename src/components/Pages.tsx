/**
 * EHSC Link — 페이지 컴포넌트
 * ──────────────────────────────────────────────────────────────
 *
 * 변경 내역 (Notion CMS 마이그레이션):
 *  - [교체] WordPress 훅(usePosts/usePost) → useNotion 훅
 *  - [교체] CATEGORY_SLUGS → CATEGORIES (한글 Select 값)
 *  - [교체] WordPress HTML 렌더링 → NotionBlockRenderer
 *  - [제거] stripHtml, extractCategories (Notion은 이미 플레인 텍스트 반환)
 *  - [변경] postId 타입: number → string (Notion UUID)
 *  - [유지] IntroPage, ParticipationPage, SuggestionPage, EventProposalPage — 정적 콘텐츠 그대로
 */

import React, { Fragment, useState } from 'react';
import {
  Users,
  Target,
  MessageSquare,
  Lightbulb,
  Calendar,
  FileText,
  ChevronRight,
  ChevronLeft,
  Download,
  AlertCircle,
  InboxIcon,
  ArrowLeft,
  Tag,
  Play,
  Radio,
  Trophy,
  Star,
  Image as ImageIcon,
  BookOpen,
  Layers,
  ClipboardList,
  Music,
  Dumbbell,
  Palette,
  GraduationCap,
  CheckCircle2,
} from 'lucide-react';
import { CATEGORIES } from '../lib/config';
import { usePosts, usePost, useClubs, useClubUnified, useClubPosts, useClubPostUnified } from '../hooks/useNotion';
import { deriveEventStatus, mapEventStatus } from '../lib/api';
import type { PostCardData, NotionBlock, NotionRichText, ClubData, ClubPostData } from '../types/notion';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 공통 UI (로딩 / 에러 / 빈 상태)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PageHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="bg-white border-b border-slate-200 py-12 mb-8">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">{title}</h1>
      <p className="text-slate-500">{subtitle}</p>
    </div>
  </div>
);

const PageSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="animate-pulse space-y-4" aria-label="로딩 중">
    {[...Array(rows)].map((_, i) => (
      <div key={i} className="h-14 bg-slate-100 rounded-lg" />
    ))}
  </div>
);

const CardSkeleton = ({ count = 6 }: { count?: number }) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse" aria-label="로딩 중">
    {[...Array(count)].map((_, i) => (
      <div key={i} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="h-48 bg-slate-200" />
        <div className="p-6 space-y-3">
          <div className="h-4 bg-slate-200 rounded w-3/4" />
          <div className="h-3 bg-slate-100 rounded w-1/2" />
        </div>
      </div>
    ))}
  </div>
);

const ErrorState = ({ message = '데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' }: { message?: string }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
    <AlertCircle size={36} className="text-red-400" />
    <p className="text-sm text-center max-w-xs">{message}</p>
  </div>
);

const EmptyState = ({ message = '등록된 게시글이 없습니다.' }: { message?: string }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
    <InboxIcon size={36} />
    <p className="text-sm text-center">{message}</p>
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Notion Block 렌더러
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Notion Rich Text 배열 → React 노드 */
function renderRichText(texts: NotionRichText[]): React.ReactNode {
  return texts.map((t, i) => {
    let node: React.ReactNode = t.plain_text;
    if (t.annotations.bold)          node = <strong key={`b${i}`}>{node}</strong>;
    if (t.annotations.italic)        node = <em key={`i${i}`}>{node}</em>;
    if (t.annotations.strikethrough) node = <del key={`s${i}`}>{node}</del>;
    if (t.annotations.underline)     node = <u key={`u${i}`}>{node}</u>;
    if (t.annotations.code)          node = (
      <code key={`c${i}`} className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded text-sm font-mono">
        {node}
      </code>
    );
    if (t.text.link) node = (
      <a key={`l${i}`} href={t.text.link.url} target="_blank" rel="noopener noreferrer"
         className="text-blue-600 underline hover:text-blue-800">
        {node}
      </a>
    );
    return <span key={i}>{node}</span>;
  });
}

/** 개별 Notion 블록 → JSX */
const NotionBlockView = ({ block }: { block: NotionBlock }) => {
  switch (block.type) {

    case 'paragraph':
      return (
        <p className="mb-4 leading-relaxed text-slate-700">
          {renderRichText(block.paragraph?.rich_text ?? [])}
        </p>
      );

    case 'heading_1':
      return (
        <h1 className="text-2xl font-bold mt-8 mb-3 text-slate-900">
          {renderRichText(block.heading_1?.rich_text ?? [])}
        </h1>
      );

    case 'heading_2':
      return (
        <h2 className="text-xl font-bold mt-6 mb-2 text-slate-800">
          {renderRichText(block.heading_2?.rich_text ?? [])}
        </h2>
      );

    case 'heading_3':
      return (
        <h3 className="text-lg font-semibold mt-4 mb-2 text-slate-800">
          {renderRichText(block.heading_3?.rich_text ?? [])}
        </h3>
      );

    case 'bulleted_list_item':
      return (
        <li className="ml-5 mb-1.5 list-disc text-slate-700">
          {renderRichText(block.bulleted_list_item?.rich_text ?? [])}
        </li>
      );

    case 'numbered_list_item':
      return (
        <li className="ml-5 mb-1.5 list-decimal text-slate-700">
          {renderRichText(block.numbered_list_item?.rich_text ?? [])}
        </li>
      );

    case 'quote':
      return (
        <blockquote className="border-l-4 border-slate-300 pl-4 my-4 italic text-slate-600">
          {renderRichText(block.quote?.rich_text ?? [])}
        </blockquote>
      );

    case 'callout':
      return (
        <div className="flex gap-3 bg-blue-50 border border-blue-100 rounded-lg p-4 my-4">
          {block.callout?.icon?.emoji && (
            <span className="text-xl shrink-0">{block.callout.icon.emoji}</span>
          )}
          <div className="text-slate-700">
            {renderRichText(block.callout?.rich_text ?? [])}
          </div>
        </div>
      );

    case 'code':
      return (
        <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto my-4 text-sm font-mono leading-relaxed">
          <code>{(block.code?.rich_text ?? []).map(t => t.plain_text).join('')}</code>
        </pre>
      );

    case 'divider':
      return <hr className="border-slate-200 my-6" />;

    case 'image': {
      const src =
        block.image?.type === 'external' ? block.image.external?.url
        : block.image?.type === 'file'   ? block.image.file?.url
        : undefined;
      if (!src) return null;
      const caption = (block.image?.caption ?? []).map(t => t.plain_text).join('');
      return (
        <figure className="my-6">
          <img
            src={src}
            alt={caption || '첨부 이미지'}
            className="w-full rounded-lg border border-slate-200"
            loading="lazy"
          />
          {caption && (
            <figcaption className="text-xs text-slate-400 text-center mt-2">{caption}</figcaption>
          )}
        </figure>
      );
    }

    default:
      return null;
  }
};

/** Notion 블록 배열 → 본문 렌더링 */
const NotionBlockRenderer = ({
  blocks,
  hideEmptyMessage = false,
}: {
  blocks: NotionBlock[];
  hideEmptyMessage?: boolean;
}) => {
  if (blocks.length === 0) {
    if (hideEmptyMessage) return null;
    return <p className="text-slate-400 text-sm py-4">내용이 없습니다.</p>;
  }
  return (
    <div className="text-slate-700 leading-relaxed">
      {blocks.map((block) => (
        <Fragment key={block.id}>
          <NotionBlockView block={block} />
        </Fragment>
      ))}
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IntroPage — 학생자치회 소개 (정적)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const IntroPage = () => (
  <div className="pb-12">
    <PageHeader title="학생자치회 소개" subtitle="이현중학교 학생자치회의 비전과 조직을 소개합니다." />
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Target className="text-blue-600" /> 우리의 목표
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            이현중학교 학생자치회는 학생들의 자율적인 참여를 바탕으로 학교의 주인으로서 책임을 다하며,
            모두가 행복한 학교 문화를 조성하는 것을 목표로 합니다.
          </p>
          <ul className="space-y-2">
            {['학생 권익 보호 및 의견 수렴', '민주적인 학교 문화 정착', '다양한 학생 주도 행사 기획', '지역사회와 연계한 봉사활동'].map((item) => (
              <li key={item} className="flex items-center gap-2 text-slate-700">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl aspect-video overflow-hidden flex items-center justify-center">
          <Users size={64} className="text-blue-300" />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <Users className="text-blue-600" /> 조직 구성
        </h2>

        <h3 className="text-lg font-semibold text-slate-700 mb-4">부서</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {[
            { role: '홍보부',     desc: '소식지 발행 및 SNS 홍보 활동' },
            { role: '총무부',     desc: '예산 관리 및 행정 업무 지원' },
            { role: '환경미화부', desc: '교내 환경 정비 및 미화 활동' },
            { role: '생활안전부', desc: '교내 안전 지도 및 캠페인 운영' },
            { role: '학습부',     desc: '학습 분위기 조성 및 학습 지원' },
            { role: '도서부',     desc: '도서실 운영 및 독서 문화 활성화' },
            { role: '체육부',     desc: '스포츠 행사 및 체육대회 주관' },
          ].map((dept) => (
            <div key={dept.role} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 transition-colors">
              <h3 className="font-bold text-slate-900 mb-2">{dept.role}</h3>
              <p className="text-sm text-slate-500">{dept.desc}</p>
            </div>
          ))}
        </div>

        <h3 className="text-lg font-semibold text-slate-700 mb-4">학년 대표 · 서기</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { role: '1학년 학년대표', desc: '1학년 학생 의견 수렴 및 전달' },
            { role: '2학년 학년대표', desc: '2학년 학생 의견 수렴 및 전달' },
            { role: '3학년 학년대표', desc: '3학년 학생 의견 수렴 및 전달' },
            { role: '3학년 서기',     desc: '회의록 작성 및 자료 정리' },
          ].map((dept) => (
            <div key={dept.role} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 transition-colors">
              <h3 className="font-bold text-slate-900 mb-2">{dept.role}</h3>
              <p className="text-sm text-slate-500">{dept.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NoticesPage — 공지사항 목록
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface NoticesPageProps {
  onSelectPost?: (postId: string) => void;
}

export const NoticesPage = ({ onSelectPost }: NoticesPageProps) => {
  const { data: posts, isLoading, error } = usePosts({
    category: CATEGORIES.notices,
    perPage:  20,
  });

  return (
    <div className="pb-12">
      <PageHeader title="공지사항" subtitle="학생자치회의 새로운 소식을 확인하세요." />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {isLoading ? (
          <CardSkeleton count={6} />
        ) : error ? (
          <ErrorState message={error} />
        ) : posts.length === 0 ? (
          <EmptyState message="등록된 공지사항이 없습니다." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {posts.map((post) => (
              <NoticeCard key={post.id} post={post} onSelectPost={onSelectPost} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/** 공지사항 카드 */
const NoticeCard = ({ post, onSelectPost }: { post: PostCardData; onSelectPost?: (id: string) => void }) => (
  <div
    className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow group cursor-pointer"
    onClick={() => onSelectPost?.(post.id)}
    role="button"
    tabIndex={0}
    aria-label={`게시글 보기: ${post.title}`}
    onKeyDown={(e) => e.key === 'Enter' && onSelectPost?.(post.id)}
  >
    {/* 썸네일 */}
    <div className="h-48 bg-slate-100 relative overflow-hidden">
      {post.imageUrl ? (
        <img
          src={post.imageUrl}
          alt={post.imageAlt}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
          <FileText size={40} className="text-slate-400" />
        </div>
      )}
      {/* 카테고리 배지 */}
      {post.categories[0] && (
        <div className="absolute top-4 left-4">
          <span className="text-xs font-bold px-2 py-1 rounded bg-blue-600 text-white shadow-sm">
            {post.categories[0]}
          </span>
        </div>
      )}
    </div>

    {/* 내용 */}
    <div className="p-6">
      <h3 className="font-bold text-lg text-slate-800 mb-2 group-hover:text-blue-700 line-clamp-2">
        {post.title}
      </h3>
      <p className="text-sm text-slate-500 flex items-center gap-2 mb-2">
        <Calendar size={14} /> {post.date}
      </p>
      {post.excerpt && (
        <p className="text-sm text-slate-500 line-clamp-2">{post.excerpt}</p>
      )}
    </div>
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// YouTube 유틸 (NoticeDetailPage · EHBSCard 공유)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** YouTube URL에서 비디오 ID 추출 */
function getYoutubeVideoId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NoticeDetailPage — 게시글 상세
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface NoticeDetailPageProps {
  postId: string;   // Notion UUID
  onBack: () => void;
}

export const NoticeDetailPage = ({ postId, onBack }: NoticeDetailPageProps) => {
  const { detail, isLoading, error } = usePost(postId);

  // ── 로딩 ──
  if (isLoading) {
    return (
      <div className="pb-12">
        <div className="bg-white border-b border-slate-200 py-12 mb-8">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 animate-pulse space-y-3">
            <div className="h-6 bg-slate-200 rounded w-1/4" />
            <div className="h-8 bg-slate-200 rounded w-3/4" />
            <div className="h-4 bg-slate-100 rounded w-1/3" />
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 animate-pulse space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-4 bg-slate-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  // ── 에러 / 없음 ──
  if (error || !detail) {
    return (
      <div className="pb-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-12">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 mb-8">
            <ArrowLeft size={16} /> 목록으로
          </button>
          <ErrorState message={error ?? '게시글을 찾을 수 없습니다.'} />
        </div>
      </div>
    );
  }

  const post   = detail.post;
  const blocks = detail.blocks;

  // ── 대표 이미지 결정 ──────────────────────────────────────────
  // 우선순위: 대표이미지 속성 > page.cover (Worker가 합쳐서 imageUrl로 반환)
  //           > 본문 첫 번째 image 블록
  const firstImageBlock = blocks.find((b) => b.type === 'image');
  const firstBlockImageSrc = firstImageBlock?.image
    ? firstImageBlock.image.type === 'external'
      ? (firstImageBlock.image.external?.url ?? '')
      : (firstImageBlock.image.file?.url ?? '')
    : '';
  const coverSrc = post.imageUrl || firstBlockImageSrc;

  return (
    <div className="pb-12">
      {/* 게시글 헤더 */}
      <div className="bg-white border-b border-slate-200 py-10 mb-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 mb-6 transition-colors">
            <ArrowLeft size={16} /> 목록으로
          </button>

          {/* 카테고리 배지 */}
          {post.categories.length > 0 && (
            <div className="flex gap-2 mb-3">
              {post.categories.map((cat) => (
                <span key={cat} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-blue-50 text-blue-600 border border-blue-100 font-medium">
                  <Tag size={10} /> {cat}
                </span>
              ))}
            </div>
          )}

          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4 leading-tight">
            {post.title}
          </h1>

          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
            <span>작성자: {post.author}</span>
            <span>·</span>
            <span>게시일: {post.date}</span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">

        {/* YouTube 영상 embed (유튜브 링크가 있는 경우 최상단 표시) */}
        {post.youtubeUrl && (() => {
          const yid = getYoutubeVideoId(post.youtubeUrl as string);
          return yid ? (
            <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm" style={{ position: 'relative', paddingTop: '56.25%' }}>
              <iframe
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                src={`https://www.youtube.com/embed/${yid}?rel=0`}
                title={post.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : null;
        })()}

        {/* 대표 이미지 — YouTube가 없을 때만 표시 */}
        {!post.youtubeUrl && coverSrc && (
          <figure className="my-2">
            <img
              src={coverSrc}
              alt={post.imageAlt || post.title}
              className="w-full rounded-xl border border-slate-200 shadow-sm"
              loading="eager"
            />
          </figure>
        )}

        {/* 내용 속성 (DB 「내용」 필드가 있으면 블록보다 먼저 표시) */}
        {post.content && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
            <p className="text-slate-700 leading-relaxed whitespace-pre-line">{post.content}</p>
          </div>
        )}

        {/* 본문 (Notion 블록 렌더링) — content 속성이 있으면 빈 메시지 숨김 */}
        <article className="prose prose-slate max-w-none prose-headings:font-bold prose-a:text-blue-600 prose-img:rounded-lg">
          <NotionBlockRenderer blocks={blocks} hideEmptyMessage={!!post.content} />
        </article>

        {/* content 도 없고 blocks 도 없을 때 최종 안내 */}
        {!post.content && blocks.length === 0 && null}

        {/* 목록으로 돌아가기 */}
        <div className="pt-6 border-t border-slate-200">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors"
          >
            <ChevronLeft size={16} /> 목록으로
          </button>
        </div>
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ParticipationPage — 학생참여 (정적)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ParticipationPage = ({ onNavigate }: { onNavigate?: (page: string) => void }) => (
  <div className="pb-12">
    <PageHeader title="학생참여" subtitle="여러분의 목소리가 학교를 변화시킵니다." />
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-8">

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
            <MessageSquare size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">학생 건의함</h2>
            <p className="text-sm text-slate-500 mt-0.5">학교생활 불편함·개선사항을 제안해 주세요.</p>
          </div>
        </div>
        <p className="text-slate-600 leading-relaxed">
          이곳은 이현중학교 학생들이 학교생활과 관련하여 느낀 불편 사항이나
          개선이 필요한 부분, 또는 학교 발전을 위한 다양한 의견을 전달할 수 있는
          공간입니다.<br /><br />
          접수된 건의사항은 학생자치회에서 확인한 후 필요에 따라 학교와 함께
          검토합니다.
        </p>
        <button
          onClick={() => onNavigate?.('suggestion')}
          className="mt-auto self-start inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors"
        >
          <MessageSquare size={18} />
          건의 작성하기
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center shrink-0">
            <Lightbulb size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">행사 제안</h2>
            <p className="text-sm text-slate-500 mt-0.5">새로운 행사 아이디어를 제안해 주세요.</p>
          </div>
        </div>
        <p className="text-slate-600 leading-relaxed">
          학생 여러분의 작은 의견 하나하나가 학교를 변화시키는 중요한 시작이
          될 수 있습니다. 학교생활과 관련된 다양한 생각과 의견을 자유롭게
          작성해 주시기 바랍니다.<br /><br />
          제안해 주신 행사 아이디어는 학생자치회가 검토하여 반영할 수 있도록
          노력합니다.
        </p>
        <button
          onClick={() => onNavigate?.('event-proposal')}
          className="mt-auto self-start inline-flex items-center gap-2 px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white font-semibold rounded-xl transition-colors"
        >
          <Lightbulb size={18} />
          아이디어 제안하기
        </button>
      </div>

    </div>
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SuggestionPage — 학생 건의함 (Google Form 임베드, 정적)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const SuggestionPage = ({ onBack }: { onBack?: () => void }) => (
  <div className="pb-12">
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-4">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors"
        >
          ← 학생참여로 돌아가기
        </button>
      )}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
          <MessageSquare size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">학생 건의함</h1>
          <p className="text-slate-500 mt-0.5">학교생활 불편함·개선사항을 제안해 주세요.</p>
        </div>
      </div>
    </div>
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <iframe
          src="https://docs.google.com/forms/d/e/1FAIpQLScwKCFGFVVnRft2H96WzOkpR1uaTsdA9YSnqtZjoiZhuJFJag/viewform?embedded=true"
          width="100%"
          height="900"
          frameBorder="0"
          marginHeight={0}
          marginWidth={0}
          title="학생 건의함"
          className="block"
        >
          로딩 중…
        </iframe>
      </div>
    </div>
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EventProposalPage — 행사 제안 (Google Form 임베드, 정적)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const EventProposalPage = ({ onBack }: { onBack?: () => void }) => (
  <div className="pb-12">
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-4">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors"
        >
          ← 학생참여로 돌아가기
        </button>
      )}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center shrink-0">
          <Lightbulb size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">행사 제안</h1>
          <p className="text-slate-500 mt-0.5">새로운 행사 아이디어를 제안해 주세요.</p>
        </div>
      </div>
    </div>
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <iframe
          src="https://docs.google.com/forms/d/e/1FAIpQLSdTH5U4batptXujtbZ3J4CV-fk1eVlzytq1BMeBsJVPy6KIvQ/viewform?embedded=true"
          width="100%"
          height="900"
          frameBorder="0"
          marginHeight={0}
          marginWidth={0}
          title="행사 제안"
          className="block"
        >
          로딩 중…
        </iframe>
      </div>
    </div>
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EventsPage — 학생회 행사
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EVENTS_TABS = [
  { label: '스포츠라이트',    category: CATEGORIES.gallery   },
  { label: '행사 안내',      category: CATEGORIES.events    },
  { label: '체육대회/이현제', category: CATEGORIES.sportsDay },
] as const;

export const EventsPage = ({ onSelectPost }: { onSelectPost?: (id: string) => void }) => {
  const [activeTab, setActiveTab] = useState(0);

  const { data: events, isLoading, error } = usePosts({
    category: EVENTS_TABS[activeTab].category,
    perPage:  12,
  });

  return (
    <div className="pb-12">
      <PageHeader title="학생회 행사" subtitle="이현중학교 학생들을 위한 즐거운 행사들입니다." />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="flex gap-2 mb-8 border-b border-slate-200">
          {EVENTS_TABS.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActiveTab(i)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === i
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <CardSkeleton count={6} />
        ) : error ? (
          <ErrorState message={error} />
        ) : events.length === 0 ? (
          <EmptyState message="등록된 행사가 없습니다." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {events.map((event) => (
              <Fragment key={event.id}>
                <EventPostCard post={event} onSelectPost={onSelectPost} />
              </Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/** 행사 카드 (EventsPage 전용) */
const EventPostCard = ({ post, onSelectPost }: { post: PostCardData; onSelectPost?: (id: string) => void }) => {
  // 진행 여부 속성이 있으면 우선 사용, 없으면 작성일로 추론
  const status      = post.eventStatus
    ? mapEventStatus(post.eventStatus)
    : deriveEventStatus(post.rawDate);
  const statusLabel = post.eventStatus || (status === 'upcoming' ? '예정' : status === 'ongoing' ? '진행중' : '종료');
  const statusClass = status === 'upcoming'
    ? 'bg-blue-600 text-white'
    : status === 'ongoing'
    ? 'bg-green-600 text-white'
    : 'bg-slate-500 text-white';

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow group cursor-pointer"
      onClick={() => onSelectPost?.(post.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelectPost?.(post.id)}
    >
      <div className="h-48 bg-slate-100 relative">
        {post.imageUrl ? (
          <img
            src={post.imageUrl}
            alt={post.imageAlt}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
            <Calendar size={40} className="text-slate-400" />
          </div>
        )}
        <div className="absolute top-4 right-4">
          <span className={`text-xs font-bold px-2 py-1 rounded shadow-sm ${statusClass}`}>{statusLabel}</span>
        </div>
      </div>
      <div className="p-6">
        <h3 className="font-bold text-lg text-slate-800 mb-2 group-hover:text-blue-700 line-clamp-2">{post.title}</h3>
        <p className="text-sm text-slate-500 flex items-center gap-2 mb-2">
          <Calendar size={14} /> {post.date}
        </p>
        {post.excerpt && (
          <p className="text-sm text-slate-500 line-clamp-2">{post.excerpt}</p>
        )}
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ArchivePage — 자료실
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DOCS_TABS = [
  { label: '회의록',    category: CATEGORIES.minutes      },
  { label: '기타자료실', category: CATEGORIES.resourcesEtc },
] as const;

export const ArchivePage = () => {
  const [activeDocsTab, setActiveDocsTab] = useState(0);

  const { data: docs, isLoading: docsLoading, error: docsError } = usePosts({
    category: DOCS_TABS[activeDocsTab].category,
    perPage:  20,
  });

  return (
    <div className="pb-12">
      <PageHeader title="자료실" subtitle="학생자치회의 회의록과 문서 자료입니다." />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="flex gap-2 mb-8 border-b border-slate-200">
          {DOCS_TABS.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActiveDocsTab(i)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeDocsTab === i
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {docsLoading ? (
          <div className="animate-pulse space-y-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-lg" />)}
          </div>
        ) : docsError ? (
          <ErrorState message={docsError} />
        ) : docs.length === 0 ? (
          <EmptyState message="등록된 자료가 없습니다." />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            {docs.map((doc) => (
              <a
                key={doc.id}
                href={doc.link}
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 border-b border-slate-100 flex justify-between items-center hover:bg-slate-50 group transition-colors last:border-none"
                aria-label={`자료 보기: ${doc.title}`}
              >
                <div className="flex items-center gap-3">
                  <FileText size={20} className="text-slate-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-800 group-hover:text-blue-700 transition-colors">
                      {doc.title}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {doc.date}
                      {doc.author && ` | ${doc.author}`}
                    </p>
                  </div>
                </div>
                <Download size={18} className="text-slate-400 group-hover:text-blue-500 shrink-0" />
              </a>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SitemapPage — 사이트맵 (정적)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EHBSPage — 방송부
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** EHBS 카드 — 클릭 시 상세 페이지로 이동 */
const EHBSCard = ({
  post,
  onSelectPost,
}: {
  post: PostCardData;
  onSelectPost?: (id: string) => void;
}) => {
  const youtubeId = post.youtubeUrl ? getYoutubeVideoId(post.youtubeUrl) : null;
  const thumbnail = youtubeId
    ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
    : post.imageUrl;
  const isYoutube = !!youtubeId;

  const handleClick = () => {
    onSelectPost?.(post.id);
  };

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={isYoutube ? `YouTube에서 보기: ${post.title}` : `게시글 보기: ${post.title}`}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      {/* 썸네일 영역 */}
      <div className="h-48 bg-slate-900 relative overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={post.imageAlt || post.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
            <Radio size={40} className="text-slate-500" />
          </div>
        )}

        {/* YouTube 플레이 버튼 오버레이 */}
        {isYoutube && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
            <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Play size={22} className="text-white ml-1" fill="white" />
            </div>
          </div>
        )}

        {/* 날짜 배지 */}
        {post.date && (
          <div className="absolute bottom-3 right-3">
            <span className="text-[10px] font-medium px-2 py-1 rounded bg-black/50 text-white backdrop-blur-sm">
              {post.date}
            </span>
          </div>
        )}
      </div>

      {/* 텍스트 정보 */}
      <div className="p-5">
        <h3 className="font-bold text-base text-slate-800 mb-1.5 line-clamp-2 group-hover:text-red-600 transition-colors">
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="text-sm text-slate-500 line-clamp-2">{post.excerpt}</p>
        )}
        {isYoutube && (
          <span className="mt-2 inline-flex items-center gap-1 text-xs text-red-500 font-medium">
            <Play size={10} fill="currentColor" /> 영상 보기
          </span>
        )}
      </div>
    </div>
  );
};

export const EHBSPage = ({
  onSelectPost,
}: {
  onSelectPost?: (id: string) => void;
}) => {
  const { data: posts, isLoading, error } = usePosts({
    category: CATEGORIES.ehbs,
    perPage:  20,
  });

  return (
    <div className="pb-12">
      <PageHeader
        title="EHBS 방송부"
        subtitle="이현중학교 방송부의 영상과 활동을 소개합니다."
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {isLoading ? (
          <CardSkeleton count={6} />
        ) : error ? (
          <ErrorState message={error} />
        ) : posts.length === 0 ? (
          <EmptyState message="등록된 방송이 없습니다." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {posts.map((post) => (
              <EHBSCard
                key={post.id}
                post={post}
                onSelectPost={onSelectPost}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ClubsPage — 자율동아리 목록
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 활동분야별 배지 색상 */
const FIELD_COLORS: Record<string, string> = {
  공연: 'bg-purple-50 text-purple-700 border-purple-200',
  체육: 'bg-green-50  text-green-700  border-green-200',
  학술: 'bg-blue-50   text-blue-700   border-blue-200',
  예술: 'bg-rose-50   text-rose-700   border-rose-200',
  기타: 'bg-slate-50  text-slate-600  border-slate-200',
};

function fieldBadgeClass(field: string) {
  return FIELD_COLORS[field] ?? FIELD_COLORS['기타'];
}

/** 동아리 카드 */
const ClubCard = ({
  club,
  onSelect,
}: {
  club:     ClubData;
  /** id: Notion UUID, slug: 슬러그 (있으면 slug 우선 전달) */
  onSelect: (id: string, slug: string) => void;
}) => (
  <div
    className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer group"
    onClick={() => onSelect(club.id, club.slug)}
    role="button"
    tabIndex={0}
    aria-label={`${club.name} 상세 보기`}
    onKeyDown={(e) => e.key === 'Enter' && onSelect(club.id, club.slug)}
  >
    {/* 대표이미지 */}
    <div className="h-44 bg-slate-100 relative overflow-hidden">
      {club.imageUrl ? (
        <img
          src={club.imageUrl}
          alt={club.imageAlt || club.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
          <ImageIcon size={40} className="text-slate-300" />
        </div>
      )}
      {/* 활동분야 배지 */}
      {club.field && (
        <span className={`absolute top-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full border ${fieldBadgeClass(club.field)}`}>
          {club.field}
        </span>
      )}
      {/* 대회참가 아이콘 */}
      {club.hasCompetition && (
        <span className="absolute top-3 right-3 w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center shadow">
          <Trophy size={13} className="text-white" />
        </span>
      )}
    </div>

    {/* 텍스트 정보 */}
    <div className="p-4">
      <h3 className="font-bold text-base text-slate-900 mb-1.5 group-hover:text-blue-700 transition-colors">
        {club.name}
      </h3>
      {club.description && (
        <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed">
          {club.description}
        </p>
      )}
    </div>
  </div>
);

/** 활동분야 필터 탭 */
const FIELD_ALL = '전체';

export const ClubsPage = ({
  onSelectClub,
}: {
  /** id: Notion UUID, slug: 슬러그 (없으면 빈 문자열) */
  onSelectClub: (id: string, slug: string) => void;
}) => {
  const { data: clubs, isLoading, error } = useClubs();
  const [activeField, setActiveField] = useState(FIELD_ALL);

  // 활동분야 목록 (동적으로 DB에서 추출)
  const fields = [FIELD_ALL, ...Array.from(new Set(clubs.map((c) => c.field).filter(Boolean)))];

  const filtered = activeField === FIELD_ALL
    ? clubs
    : clubs.filter((c) => c.field === activeField);

  return (
    <div className="pb-12">
      <PageHeader
        title="자율동아리"
        subtitle="학교를 빛내는 자율동아리들을 소개합니다."
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 안내 문구 */}
        <div className="mb-8 p-4 bg-blue-50 border border-blue-100 rounded-xl flex gap-3 items-start">
          <Star size={18} className="text-blue-500 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-700 leading-relaxed">
            이현중학교 학생 중 학교를 대표하여 대회, 공연, 행사 등에 참여하는
            팀들의 활동을 소개하는 공간입니다.
          </p>
        </div>

        {/* 활동분야 필터 (데이터 로드 후 표시) */}
        {!isLoading && !error && fields.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-8">
            {fields.map((f) => (
              <button
                key={f}
                onClick={() => setActiveField(f)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  activeField === f
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        )}

        {/* 동아리 그리드 */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 overflow-hidden animate-pulse">
                <div className="h-44 bg-slate-200" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-2/3" />
                  <div className="h-3 bg-slate-100 rounded w-full" />
                  <div className="h-3 bg-slate-100 rounded w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} />
        ) : filtered.length === 0 ? (
          <EmptyState message="등록된 동아리가 없습니다." />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filtered.map((club) => (
              <ClubCard
                key={club.id}
                club={club}
                onSelect={(id, slug) => onSelectClub(id, slug)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ClubDetailPage — 동아리 상세
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 활동상태 → 배지 색상 */
function statusBadgeClass(status: string): string {
  if (status.includes('활동')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status.includes('모집')) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (status.includes('시즌')) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status.includes('휴면')) return 'bg-slate-100 text-slate-500 border-slate-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

export const ClubDetailPage = ({
  clubIdentifier,
  onBack,
}: {
  /**
   * Notion 페이지 ID 또는 slug 중 하나.
   * UUID 패턴이면 ID로, 아니면 slug로 자동 조회합니다.
   */
  clubIdentifier: string;
  onBack: () => void;
}) => {
  const { detail, isLoading, error } = useClubUnified(clubIdentifier);

  if (isLoading) {
    return (
      <div className="pb-12">
        <div className="bg-white border-b border-slate-200 py-12 mb-8 animate-pulse">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
            <div className="h-6 bg-slate-200 rounded w-1/4" />
            <div className="h-8 bg-slate-200 rounded w-1/2" />
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-4 bg-slate-100 rounded" />)}
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="pb-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-12">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 mb-8">
            <ArrowLeft size={16} /> 목록으로
          </button>
          <ErrorState message={error ?? '동아리 정보를 찾을 수 없습니다.'} />
        </div>
      </div>
    );
  }

  const { club, blocks } = detail;

  return (
    <div className="pb-12">
      {/* 헤더 */}
      <div className="bg-white border-b border-slate-200 py-10 mb-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 mb-6 transition-colors"
          >
            <ArrowLeft size={16} /> 목록으로
          </button>

          {/* 배지 모음 */}
          <div className="flex flex-wrap gap-2 mb-3">
            {club.field && (
              <span className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border font-medium ${fieldBadgeClass(club.field)}`}>
                <Tag size={10} /> {club.field}
              </span>
            )}
            {club.status && (
              <span className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border font-medium ${statusBadgeClass(club.status)}`}>
                {club.status}
              </span>
            )}
            {club.hasCompetition && (
              <span className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                <Trophy size={10} /> 대회 참가
              </span>
            )}
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">
            {club.name}
          </h1>
          {club.slug && (
            <p className="text-xs text-slate-300 font-mono mt-1">/{club.slug}</p>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* 대표이미지 */}
        {club.imageUrl && (
          <figure>
            <img
              src={club.imageUrl}
              alt={club.imageAlt || club.name}
              className="w-full rounded-xl border border-slate-200 shadow-sm"
              loading="eager"
            />
          </figure>
        )}

        {/* 짧은 설명 */}
        {club.description && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
            <p className="text-blue-800 leading-relaxed whitespace-pre-line font-medium">
              {club.description}
            </p>
          </div>
        )}

        {/* 상세 설명 */}
        {club.detailDesc && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
            <p className="text-slate-700 leading-relaxed whitespace-pre-line">
              {club.detailDesc}
            </p>
          </div>
        )}

        {/* Notion 본문 블록 */}
        <article className="prose prose-slate max-w-none prose-headings:font-bold prose-a:text-blue-600 prose-img:rounded-lg">
          <NotionBlockRenderer blocks={blocks} hideEmptyMessage={!!(club.description || club.detailDesc)} />
        </article>

        {/* 목록으로 */}
        <div className="pt-6 border-t border-slate-200">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors"
          >
            <ChevronLeft size={16} /> 목록으로
          </button>
        </div>
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ClubIntroPage — 자율동아리 소개 (정적)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 활동분야별 아이콘 매핑 */
const FIELD_ICONS: Record<string, React.ReactNode> = {
  공연: <Music size={28} className="text-purple-500" />,
  체육: <Dumbbell size={28} className="text-green-500" />,
  학술: <GraduationCap size={28} className="text-blue-500" />,
  예술: <Palette size={28} className="text-rose-500" />,
  기타: <Star size={28} className="text-slate-500" />,
};

export const ClubIntroPage = ({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) => (
  <div className="pb-16">
    <PageHeader
      title="자율동아리 소개"
      subtitle="이현중학교 자율동아리 제도를 안내합니다."
    />

    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">

      {/* 안내 배너 */}
      <div className="bg-blue-600 text-white rounded-2xl p-8 shadow-lg">
        <h2 className="text-xl font-bold mb-3">자율동아리란?</h2>
        <p className="leading-relaxed text-blue-100">
          이현중학교 자율동아리는 학생들이 자발적으로 구성하여 활동하는 소모임입니다.
          공연, 체육, 학술, 예술 등 다양한 분야에서 학생들의 끼와 재능을 발휘하고,
          대회·공연·행사 등 교내외 활동에 참여하며 성장할 수 있습니다.
        </p>
      </div>

      {/* 활동 분야 */}
      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
          <Layers size={20} className="text-blue-600" /> 활동 분야
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {(['공연', '체육', '학술', '예술', '기타'] as const).map((field) => (
            <div
              key={field}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col items-center gap-3 shadow-sm hover:shadow-md transition-shadow"
            >
              {FIELD_ICONS[field]}
              <span className="font-semibold text-slate-800">{field}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 운영 방식 */}
      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
          <BookOpen size={20} className="text-blue-600" /> 운영 방식
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { icon: <Users size={20} className="text-blue-500" />,       title: '자율 구성', desc: '학생들이 자발적으로 팀을 구성합니다.' },
            { icon: <Calendar size={20} className="text-green-500" />,    title: '정기 활동', desc: '학기 중 정기적으로 모여 활동합니다.' },
            { icon: <Trophy size={20} className="text-amber-500" />,      title: '대회 참가', desc: '교외 대회·공연에 학교 대표로 출전합니다.' },
            { icon: <CheckCircle2 size={20} className="text-purple-500" />, title: '학교 지원', desc: '학생자치회와 학교의 지원을 받을 수 있습니다.' },
          ].map((item) => (
            <div key={item.title} className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex gap-4">
              <div className="mt-0.5 shrink-0">{item.icon}</div>
              <div>
                <p className="font-semibold text-slate-800 mb-1">{item.title}</p>
                <p className="text-sm text-slate-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={() => onNavigate('clubs')}
          className="flex-1 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors text-center"
        >
          동아리 목록 보기
        </button>
        <button
          onClick={() => onNavigate('clubs-apply')}
          className="flex-1 px-6 py-3 border-2 border-blue-600 text-blue-700 font-semibold rounded-xl hover:bg-blue-50 transition-colors text-center"
        >
          지원 신청 안내
        </button>
      </div>

    </div>
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ClubGalleryPage — 동아리 활동 기록 게시판
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 활동 기록 게시글 카드 */
const ClubPostCard = ({
  post,
  onSelect,
}: {
  post:     ClubPostData;
  onSelect: (id: string, slug: string) => void;
}) => (
  <div
    className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer group flex flex-col"
    onClick={() => onSelect(post.id, post.slug)}
    role="button"
    tabIndex={0}
    aria-label={`${post.title} 읽기`}
    onKeyDown={(e) => e.key === 'Enter' && onSelect(post.id, post.slug)}
  >
    {/* 대표이미지 */}
    <div className="h-44 bg-slate-100 relative overflow-hidden shrink-0">
      {post.imageUrl ? (
        <img
          src={post.imageUrl}
          alt={post.imageAlt || post.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
          <FileText size={36} className="text-slate-300" />
        </div>
      )}
      {/* 동아리명 배지 */}
      {post.clubName && (
        <span className="absolute top-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full border bg-white/90 text-slate-700 border-slate-200 backdrop-blur-sm">
          {post.clubName}
        </span>
      )}
    </div>

    {/* 텍스트 */}
    <div className="p-4 flex flex-col flex-1">
      <h3 className="font-bold text-sm text-slate-900 mb-1.5 line-clamp-2 group-hover:text-blue-700 transition-colors leading-snug">
        {post.title}
      </h3>
      {post.summary && (
        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-2 flex-1">
          {post.summary}
        </p>
      )}
      <div className="flex items-center gap-2 text-xs text-slate-400 mt-auto pt-2 border-t border-slate-50">
        <Calendar size={11} />
        <span>{post.date}</span>
        {post.author && post.author !== '학생자치회' && (
          <>
            <span>·</span>
            <span>{post.author}</span>
          </>
        )}
      </div>
    </div>
  </div>
);

export const ClubGalleryPage = ({
  onSelectPost,
}: {
  onSelectPost: (id: string, slug: string) => void;
}) => {
  const { data: posts, isLoading, error } = useClubPosts({ limit: 50 });
  const [activeClub, setActiveClub] = useState('전체');

  // 동아리명 필터 탭 (동적으로 DB에서 추출)
  const clubs = ['전체', ...Array.from(new Set(posts.map((p) => p.clubName).filter(Boolean)))];
  const filtered = activeClub === '전체' ? posts : posts.filter((p) => p.clubName === activeClub);

  return (
    <div className="pb-12">
      <PageHeader
        title="활동 기록"
        subtitle="자율동아리의 다양한 활동과 프로젝트 기록을 공유합니다."
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 안내 문구 */}
        <div className="mb-8 p-5 bg-blue-50 border border-blue-100 rounded-xl flex gap-3 items-start">
          <BookOpen size={18} className="text-blue-500 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-800 leading-relaxed">
            이 페이지는 이현중학교 자율동아리의 활동 기록을 공유하는 공간입니다.
            각 동아리의 다양한 활동과 프로젝트 진행 과정을 확인할 수 있습니다.
          </p>
        </div>

        {/* 동아리별 필터 탭 (데이터 로드 후) */}
        {!isLoading && !error && clubs.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-8">
            {clubs.map((club) => (
              <button
                key={club}
                onClick={() => setActiveClub(club)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  activeClub === club
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                }`}
              >
                {club}
              </button>
            ))}
          </div>
        )}

        {/* 게시글 그리드 */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 overflow-hidden animate-pulse">
                <div className="h-44 bg-slate-200" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-full" />
                  <div className="h-3 bg-slate-100 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} />
        ) : filtered.length === 0 ? (
          <EmptyState message="등록된 활동 기록이 없습니다." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filtered.map((post) => (
              <ClubPostCard
                key={post.id}
                post={post}
                onSelect={onSelectPost}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ClubPostDetailPage — 동아리 활동 게시글 상세
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ClubPostDetailPage = ({
  postIdentifier,
  onBack,
}: {
  /**
   * Notion 페이지 ID 또는 slug.
   * UUID 패턴이면 ID로, 아니면 slug로 자동 조회합니다.
   */
  postIdentifier: string;
  onBack: () => void;
}) => {
  const { detail, isLoading, error } = useClubPostUnified(postIdentifier);

  if (isLoading) {
    return (
      <div className="pb-12">
        <div className="bg-white border-b border-slate-200 py-12 mb-8 animate-pulse">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
            <div className="h-5 bg-slate-200 rounded w-1/4" />
            <div className="h-8 bg-slate-200 rounded w-2/3" />
            <div className="h-4 bg-slate-100 rounded w-1/3" />
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-4 bg-slate-100 rounded" />)}
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="pb-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-12">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 mb-8 transition-colors">
            <ArrowLeft size={16} /> 활동 기록 목록으로
          </button>
          <ErrorState message={error ?? '존재하지 않는 활동 기록입니다.'} />
        </div>
      </div>
    );
  }

  const { post, blocks } = detail;

  return (
    <div className="pb-12">
      {/* 헤더 */}
      <div className="bg-white border-b border-slate-200 py-10 mb-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 mb-6 transition-colors"
          >
            <ArrowLeft size={16} /> 활동 기록 목록으로
          </button>

          {/* 동아리명 배지 */}
          {post.clubName && (
            <div className="mb-3">
              <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                {post.clubName}
              </span>
            </div>
          )}

          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-3 leading-snug">
            {post.title}
          </h1>

          {/* 메타 정보 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
            {post.date && (
              <span className="flex items-center gap-1.5">
                <Calendar size={13} /> {post.date}
              </span>
            )}
            {post.author && (
              <span className="flex items-center gap-1.5">
                <Users size={13} /> {post.author}
              </span>
            )}
            {post.slug && (
              <span className="font-mono text-xs text-slate-300">/{post.slug}</span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* 대표이미지 */}
        {post.imageUrl && (
          <figure>
            <img
              src={post.imageUrl}
              alt={post.imageAlt || post.title}
              className="w-full rounded-xl border border-slate-200 shadow-sm"
              loading="eager"
            />
          </figure>
        )}

        {/* 요약 */}
        {post.summary && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
            <p className="text-blue-800 leading-relaxed font-medium whitespace-pre-line">
              {post.summary}
            </p>
          </div>
        )}

        {/* Notion 본문 블록 */}
        <article className="prose prose-slate max-w-none prose-headings:font-bold prose-a:text-blue-600 prose-img:rounded-lg">
          <NotionBlockRenderer blocks={blocks} hideEmptyMessage={!!post.summary} />
        </article>

        {/* 돌아가기 */}
        <div className="pt-6 border-t border-slate-200">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors"
          >
            <ChevronLeft size={16} /> 활동 기록 목록으로
          </button>
        </div>
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ClubApplyPage — 활동 지원 신청 안내 (정적)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ClubApplyPage = ({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) => (
  <div className="pb-16">
    <PageHeader
      title="지원 신청"
      subtitle="자율동아리 지원·등록 안내입니다."
    />

    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">

      {/* 안내 카드 */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-8">
        <h2 className="text-lg font-bold text-blue-900 mb-3 flex items-center gap-2">
          <ClipboardList size={20} /> 신청 전 확인사항
        </h2>
        <ul className="space-y-2 text-sm text-blue-800">
          {[
            '동아리 활동에 지속적으로 참여할 의지가 있는 학생',
            '학교 규정 및 동아리 규칙을 준수하는 학생',
            '담당 교사의 지도 하에 활동이 진행됩니다',
            '동아리명·slug 등록 후 학생자치회 심의를 거칩니다',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <CheckCircle2 size={15} className="text-blue-500 mt-0.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* 신청 절차 */}
      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-6">신청 절차</h2>
        <div className="space-y-4">
          {[
            { step: '01', title: '동아리 구성원 모집',    desc: '관심 있는 친구들과 함께 팀을 구성합니다 (최소 3인 이상 권장).', color: 'bg-blue-600' },
            { step: '02', title: '지도 교사 섭외',        desc: '담당 교사를 정하고 활동 승인을 받습니다.', color: 'bg-indigo-600' },
            { step: '03', title: '건의함·행사 제안 제출',  desc: '이 웹사이트의 학생참여 → 건의함에 동아리 등록을 요청합니다.', color: 'bg-purple-600' },
            { step: '04', title: '학생자치회 심의',        desc: '학생자치회에서 신청 내용을 검토하고 결과를 안내합니다.', color: 'bg-pink-600' },
            { step: '05', title: '사이트 자동 반영',       desc: '승인 후 Notion DB에 등록되면 동아리 목록에 자동으로 나타납니다.', color: 'bg-rose-600' },
          ].map((item, idx, arr) => (
            <div key={item.step} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 ${item.color} text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0`}>
                  {item.step}
                </div>
                {idx < arr.length - 1 && <div className="w-0.5 h-6 bg-slate-200 mt-1" />}
              </div>
              <div className="pb-4">
                <p className="font-semibold text-slate-900 mb-0.5">{item.title}</p>
                <p className="text-sm text-slate-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA 버튼 */}
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={() => onNavigate('suggestion')}
          className="flex-1 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
        >
          <MessageSquare size={18} /> 건의함 바로가기
        </button>
        <button
          onClick={() => onNavigate('clubs')}
          className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-center"
        >
          동아리 목록 보기
        </button>
      </div>

    </div>
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const SitemapPage = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
  const sitemapData = [
    { title: '학생자치회',    id: 'intro',        items: ['학생회 소개', '부서 소개'] },
    { title: '공지사항',      id: 'notices',       items: [] },
    { title: '학생참여',      id: 'participation', items: ['건의함', '행사 제안'] },
    { title: '학생회 행사',   id: 'events',        items: ['스포츠라이트', '행사 안내', '체육대회/이현제'] },
    { title: '자료실',        id: 'archive',       items: ['회의록', '기타자료실'] },
    { title: '자율동아리',    id: 'clubs-intro',   items: ['동아리 소개', '동아리 목록', '활동 기록', '지원 신청'] },
  ];

  return (
    <div className="pb-12">
      <PageHeader title="사이트맵" subtitle="EHSC Connect의 전체 메뉴 구조입니다." />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
          {sitemapData.map((section) => (
            <div key={section.title} className="space-y-4">
              <button
                onClick={() => onNavigate(section.id)}
                className="text-lg font-bold text-slate-900 hover:text-blue-700 transition-colors text-left"
              >
                {section.title}
              </button>
              <ul className="space-y-2">
                {section.items.map((item) => (
                  <li key={item}>
                    <button
                      onClick={() => onNavigate(section.id)}
                      className="text-sm text-slate-500 hover:text-blue-600 transition-colors text-left flex items-center gap-1"
                    >
                      <ChevronRight size={12} /> {item}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
