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
} from 'lucide-react';
import { CATEGORIES } from '../lib/config';
import { usePosts, usePost } from '../hooks/useNotion';
import { deriveEventStatus } from '../lib/api';
import type { PostCardData, NotionBlock, NotionRichText } from '../types/notion';

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
const NotionBlockRenderer = ({ blocks }: { blocks: NotionBlock[] }) => {
  if (blocks.length === 0) {
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
          <PageSkeleton rows={8} />
        ) : error ? (
          <ErrorState message={error} />
        ) : posts.length === 0 ? (
          <EmptyState message="등록된 공지사항이 없습니다." />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-sm font-bold text-slate-700 w-16">번호</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-700">제목</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-700 w-28 hidden sm:table-cell">분류</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-700 w-28 hidden md:table-cell">작성자</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-700 w-32">날짜</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post, index) => (
                  <tr
                    key={post.id}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => onSelectPost?.(post.id)}
                    role="button"
                    tabIndex={0}
                    aria-label={`게시글 보기: ${post.title}`}
                    onKeyDown={(e) => e.key === 'Enter' && onSelectPost?.(post.id)}
                  >
                    <td className="px-6 py-4 text-sm text-slate-400">{posts.length - index}</td>
                    <td className="px-6 py-4 text-sm text-slate-800 font-medium">{post.title}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 hidden sm:table-cell">
                      {post.categories[0] ? (
                        <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-50 text-blue-600 border border-blue-100 font-medium">
                          {post.categories[0]}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 hidden md:table-cell">{post.author}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{post.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

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
        {/* 대표 이미지 */}
        {post.imageUrl && (
          <div className="rounded-xl overflow-hidden border border-slate-200">
            <img
              src={post.imageUrl}
              alt={post.imageAlt || post.title}
              className="w-full object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* 본문 (Notion 블록 렌더링) */}
        <article className="prose prose-slate max-w-none prose-headings:font-bold prose-a:text-blue-600 prose-img:rounded-lg">
          <NotionBlockRenderer blocks={blocks} />
        </article>

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
  const status      = deriveEventStatus(post.rawDate);
  const statusLabel = status === 'upcoming' ? '예정' : status === 'ongoing' ? '진행중' : '종료';
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

export const SitemapPage = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
  const sitemapData = [
    { title: '학생자치회', id: 'intro',        items: ['학생회 소개', '부서 소개'] },
    { title: '공지사항',   id: 'notices',       items: [] },
    { title: '학생참여',   id: 'participation', items: ['건의함', '행사 제안'] },
    { title: '학생회 행사',id: 'events',        items: ['스포츠라이트', '행사 안내', '체육대회/이현제'] },
    { title: '자료실',     id: 'archive',       items: ['회의록', '기타자료실'] },
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
