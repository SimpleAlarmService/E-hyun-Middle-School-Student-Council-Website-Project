/**
 * EHSC Link — 페이지 컴포넌트
 * ──────────────────────────────────────────────────────────────
 *
 * 변경 내역 (WordPress API 연동 리팩터링):
 *  - [제거] NoticesPage: 하드코딩된 공지 5건 테이블 데이터
 *  - [제거] EventsPage:  하드코딩된 행사 6건 카드 데이터
 *  - [제거] ClubsPage:   하드코딩된 동아리 6건 카드 데이터
 *  - [제거] ArchivePage: 하드코딩된 문서 4건 + picsum 갤러리 4장
 *  - [추가] 모든 데이터 목록 페이지 → usePosts() 훅으로 API 연동
 *  - [추가] NoticeDetailPage: 공지사항 단일 게시글 상세 페이지 (신규)
 *  - [추가] 각 페이지 로딩 스켈레톤 / 에러 / 빈 상태 UI
 *  - [유지] IntroPage:      조직 구성은 정적 콘텐츠 (편집적 결정)
 *  - [유지] ParticipationPage: 링크/문의 폼 구조 유지
 *  - [유지] SitemapPage:    구조 유지
 *  - [유지] PageHeader 컴포넌트, 전체 레이아웃·디자인 톤 동일
 *
 * 설계 원칙:
 *  - 관리자 인증 정보 없음 (읽기 전용)
 *  - 데이터 없을 때 레이아웃이 무너지지 않도록 빈 상태 UI 처리
 *  - WordPress에서 글만 쓰면 자동 반영되는 구조
 */

import { Fragment, useState } from 'react';
import {
  Users,
  Target,
  BookOpen,
  MessageSquare,
  Lightbulb,
  Calendar,
  FileText,
  Image as ImageIcon,
  ChevronRight,
  ChevronLeft,
  Download,
  AlertCircle,
  InboxIcon,
  ArrowLeft,
  Tag,
} from 'lucide-react';
import { CATEGORY_SLUGS } from '../lib/config';
import { usePosts, usePost } from '../hooks/useWordPress';
import { formatKoreanDate, stripHtml, deriveEventStatus } from '../lib/api';
import type { PostCardData, WPPost } from '../types/wordpress';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 공통 UI 컴포넌트 (페이지 내부용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 페이지 공통 헤더 */
const PageHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="bg-white border-b border-slate-200 py-12 mb-8">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">{title}</h1>
      <p className="text-slate-500">{subtitle}</p>
    </div>
  </div>
);

/** 전체 페이지 로딩 스켈레톤 */
const PageSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="animate-pulse space-y-4" aria-label="로딩 중">
    {[...Array(rows)].map((_, i) => (
      <div key={i} className="h-14 bg-slate-100 rounded-lg" />
    ))}
  </div>
);

/** 카드 그리드 로딩 스켈레톤 */
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

/** 에러 상태 (전체 영역) */
const ErrorState = ({ message = '데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' }: { message?: string }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
    <AlertCircle size={36} className="text-red-400" />
    <p className="text-sm text-center max-w-xs">{message}</p>
  </div>
);

/** 빈 상태 (전체 영역) */
const EmptyState = ({ message = '등록된 게시글이 없습니다.' }: { message?: string }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
    <InboxIcon size={36} />
    <p className="text-sm text-center">{message}</p>
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IntroPage — 학생자치회 소개
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 조직 구성 정보는 편집적 판단으로 정적 유지합니다.
// (부서 이름·역할은 학기 중 변경이 거의 없고, 운영자가 직접 관리)
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
        {/* 이미지 placeholder (실제 학교 사진으로 교체 권장) */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl aspect-video overflow-hidden flex items-center justify-center">
          <Users size={64} className="text-blue-300" />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <Users className="text-blue-600" /> 조직 구성
        </h2>

        {/* 부서 */}
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

        {/* 학년 대표 */}
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
//
// [변경] 하드코딩된 테이블 데이터 → usePosts({ categorySlug: 'notices' }) 연동
// [추가] onSelectPost 콜백: 행 클릭 시 상세 페이지 진입
// [구조] 페이지네이션 확장 가능한 구조로 설계 (현재 10건 기본)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface NoticesPageProps {
  onSelectPost?: (postId: number) => void;
}

export const NoticesPage = ({ onSelectPost }: NoticesPageProps) => {
  const { data: posts, isLoading, error } = usePosts({
    categorySlug: CATEGORY_SLUGS.notices,
    perPage: 20,
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
                    <td className="px-6 py-4 text-sm text-slate-800 font-medium">
                      {post.title}
                    </td>
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
            {/* 추후 페이지네이션 컴포넌트 위치 */}
            {/* TODO: 페이지네이션 구현 시 여기에 <Pagination /> 추가 */}
          </div>
        )}
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NoticeDetailPage — 공지사항 상세 (신규)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// postId를 받아 단일 게시글을 조회합니다.
// 이전글/다음글 구조는 향후 확장을 위한 UI 자리만 남겨둡니다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface NoticeDetailPageProps {
  postId:   number;
  onBack:   () => void;
}

export const NoticeDetailPage = ({ postId, onBack }: NoticeDetailPageProps) => {
  const { data: post, isLoading, error } = usePost({ id: postId });

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

  if (error || !post) {
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

  const categories = post._embedded?.['wp:term']?.[0] ?? [];

  return (
    <div className="pb-12">
      {/* 게시글 헤더 */}
      <div className="bg-white border-b border-slate-200 py-10 mb-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 mb-6 transition-colors">
            <ArrowLeft size={16} /> 목록으로
          </button>

          {/* 카테고리 배지 */}
          {categories.length > 0 && (
            <div className="flex gap-2 mb-3">
              {categories.map((cat) => (
                <span key={cat.id} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-blue-50 text-blue-600 border border-blue-100 font-medium">
                  <Tag size={10} /> {cat.name}
                </span>
              ))}
            </div>
          )}

          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4 leading-tight">
            {stripHtml(post.title.rendered)}
          </h1>

          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
            <span>작성자: {post._embedded?.author?.[0]?.name ?? '학생자치회'}</span>
            <span>·</span>
            <span>게시일: {formatKoreanDate(post.date)}</span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* 대표 이미지 */}
        {post.featured_media > 0 && post._embedded?.['wp:featuredmedia']?.[0] && (
          <div className="rounded-xl overflow-hidden border border-slate-200">
            <img
              src={post._embedded['wp:featuredmedia'][0].source_url}
              alt={post._embedded['wp:featuredmedia'][0].alt_text || stripHtml(post.title.rendered)}
              className="w-full object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* 본문 (WordPress rendered HTML 안전 렌더링) */}
        <article
          className="prose prose-slate max-w-none prose-headings:font-bold prose-a:text-blue-600 prose-img:rounded-lg"
          /* WordPress가 서버사이드에서 생성한 안전한 HTML을 렌더링합니다.
             추후 DOMPurify 등의 sanitizer 추가를 고려하세요. */
          dangerouslySetInnerHTML={{ __html: post.content.rendered }}
        />

        {/* 첨부파일 자리 (WordPress media API 연동 시 구현 가능) */}
        {/* TODO: 첨부파일이 있는 경우 여기에 표시
            WordPress REST API에서 직접 첨부파일 목록을 가져오려면:
            GET /wp-json/wp/v2/media?parent={postId} */}

        {/* 이전글/다음글 자리 (향후 확장용 구조) */}
        {/* TODO: 이전글/다음글 구현 시 여기에 추가
            getPosts({ before: post.date, per_page: 1 })
            getPosts({ after: post.date, order: 'asc', per_page: 1 }) */}

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
// ParticipationPage — 학생참여
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 건의함·행사제안 링크 구조는 정적 유지 (외부 폼 연결용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ParticipationPage = () => (
  <div className="pb-12">
    <PageHeader title="학생참여" subtitle="여러분의 목소리가 학교를 변화시킵니다." />
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
        <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-6">
          <MessageSquare size={24} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4">학생 건의함</h2>
        <p className="text-slate-600 mb-8">
          학교생활 중 겪는 불편함이나 개선이 필요한 사항을 자유롭게 제안해 주세요.
          학생자치회가 검토 후 학교 측에 전달하겠습니다.
        </p>
        {/* TODO: 외부 구글 폼 또는 카카오 폼 링크 연결 */}
        <button className="w-full py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-colors">
          건의 작성하기
        </button>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
        <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center mb-6">
          <Lightbulb size={24} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4">행사 제안</h2>
        <p className="text-slate-600 mb-8">
          학생들이 즐겁게 참여할 수 있는 새로운 행사 아이디어가 있다면 제안해 주세요.
          여러분의 아이디어가 실제 행사가 될 수 있습니다.
        </p>
        {/* TODO: 외부 구글 폼 또는 카카오 폼 링크 연결 */}
        <button className="w-full py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors">
          아이디어 제안하기
        </button>
      </div>
    </div>
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EventsPage — 학생회 행사
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// [변경] 하드코딩된 행사 카드 6건 → usePosts({ categorySlug }) 연동
// [추가] 카테고리 탭: 학생회 행사 / 체육대회·이현제
// [추가] 카드 로딩 스켈레톤 / 에러 / 빈 상태
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EVENTS_TABS = [
  { label: '스포츠라이트',    slug: CATEGORY_SLUGS.gallery   },
  { label: '행사 안내',      slug: CATEGORY_SLUGS.events    },
  { label: '체육대회/이현제', slug: CATEGORY_SLUGS.sportsDay },
] as const;

export const EventsPage = () => {
  const [activeTab, setActiveTab] = useState(0);

  const { data: events, isLoading, error } = usePosts({
    categorySlug: EVENTS_TABS[activeTab].slug,
    perPage: 12,
  });

  return (
    <div className="pb-12">
      <PageHeader title="학생회 행사" subtitle="이현중학교 학생들을 위한 즐거운 행사들입니다." />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* 카테고리 탭 */}
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
                <EventPostCard post={event} />
              </Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/** 행사 카드 (EventsPage 전용) */
const EventPostCard = ({ post }: { post: PostCardData }) => {
  const status = deriveEventStatus(/* ISO date from rawPost — use display date as fallback */ post.date);
  // status 표시 레이블·색상
  const statusLabel = status === 'upcoming' ? '예정' : status === 'ongoing' ? '진행중' : '종료';
  const statusClass = status === 'upcoming'
    ? 'bg-blue-600 text-white'
    : status === 'ongoing'
    ? 'bg-green-600 text-white'
    : 'bg-slate-500 text-white';

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
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
//
// [변경] 하드코딩된 문서 4건 → usePosts({ categorySlug }) 연동
// [추가] 문서 탭: 자료실 / 기타자료실 / 회의록
// [변경] picsum 갤러리 → usePosts({ categorySlug: 'gallery' }) 연동
// [추가] 로딩 스켈레톤 / 에러 / 빈 상태
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DOCS_TABS = [
  { label: '회의록',    slug: CATEGORY_SLUGS.minutes      },
  { label: '기타자료실', slug: CATEGORY_SLUGS.resourcesEtc },
] as const;

export const ArchivePage = () => {
  const [activeDocsTab, setActiveDocsTab] = useState(0);

  const { data: docs, isLoading: docsLoading, error: docsError } = usePosts({
    categorySlug: DOCS_TABS[activeDocsTab].slug,
    perPage: 20,
  });

  return (
    <div className="pb-12">
      <PageHeader title="자료실" subtitle="학생자치회의 회의록과 문서 자료입니다." />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* 탭 */}
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
// SitemapPage — 사이트맵
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const SitemapPage = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
  const sitemapData = [
    { title: '학생자치회', id: 'intro',        items: ['학생회 소개', '부서 소개'] },
    { title: '공지사항',   id: 'notices',       items: ['학생자치회 공지', '행사 공지'] },
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
