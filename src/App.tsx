/**
 * EHSC Link — 메인 앱 라우터 및 홈 페이지
 * ──────────────────────────────────────────────────────────────
 *
 * 변경 내역 (WordPress API 연동 리팩터링):
 *  - [제거] 홈 "진행 중인 행사" 섹션: 하드코딩된 EventCard 3건 (농구/교복데이/버스킹)
 *  - [제거] 홈 "활동 갤러리" 섹션: picsum 더미 이미지 4장
 *  - [추가] 홈 "진행 중인 행사" → useHomeEvents() 훅으로 실제 API 데이터 표시
 *  - [추가] 홈 "활동 갤러리" → useHomeGallery() 훅으로 실제 API 데이터 표시
 *  - [추가] 로딩 스켈레톤, 에러 상태, 빈 상태 처리
 *  - [추가] selectedPostId 상태 및 'notice-detail' 라우트 (공지 상세 페이지)
 *  - [추가] navigate() 함수: page + 선택적 postId 함께 관리
 *  - [유지] 전체 레이아웃, 참여 카드, 학생자치회 소개 섹션, 디자인 톤
 */

import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  Header,
  MainVisual,
  Notices,
  QuickLinks,
  EventCard,
  Footer,
} from './components/Components';
import { MealCard } from './components/MealCard';
import { SchoolInfoCard } from './components/SchoolInfoCard';
import { TimeTableCard } from './components/TimeTableCard';
import { SchoolScheduleCard } from './components/SchoolScheduleCard';
import {
  IntroPage,
  NoticesPage,
  NoticeDetailPage,
  ParticipationPage,
  SuggestionPage,
  EventProposalPage,
  EventsPage,
  EHBSPage,
  ArchivePage,
  SitemapPage,
} from './components/Pages';
import { useHomeEvents, useHomeArchive } from './hooks/useNotion';
import { deriveEventStatus, mapEventStatus } from './lib/api';
import { ArrowRight, MessageSquare, ThumbsUp, Users, Calendar, FileText, AlertCircle } from 'lucide-react';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 홈 페이지 내부 로딩 / 빈 상태 UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 행사 카드 로딩 스켈레톤 */
const EventCardSkeleton = () => (
  <div className="bg-white rounded-lg border border-slate-200 overflow-hidden animate-pulse">
    <div className="h-40 bg-slate-200" />
    <div className="p-4 space-y-2">
      <div className="h-4 bg-slate-200 rounded w-3/4" />
      <div className="h-3 bg-slate-100 rounded w-1/2" />
    </div>
  </div>
);

/** 자료실 아이템 로딩 스켈레톤 */
const ArchiveItemSkeleton = () => (
  <div className="bg-white rounded-lg border border-slate-200 p-4 flex gap-3 items-center animate-pulse">
    <div className="w-10 h-10 rounded-lg bg-slate-200 shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="h-3.5 bg-slate-200 rounded w-3/4" />
      <div className="h-3 bg-slate-100 rounded w-1/3" />
    </div>
    <div className="h-5 w-14 bg-slate-100 rounded-full shrink-0" />
  </div>
);

/** 홈 섹션 빈 상태 */
const HomeSectionEmpty = ({ message }: { message: string }) => (
  <div className="col-span-full flex flex-col items-center justify-center py-12 gap-3 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
    <AlertCircle size={24} />
    <p className="text-sm">{message}</p>
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HomePage (분리된 컴포넌트)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface HomePageProps {
  navigate: (page: string, postId?: string) => void;
}

const HomePage = ({ navigate }: HomePageProps) => {
  // 홈 행사 섹션: 'events' 카테고리 최신 3건
  const {
    data:      homeEvents,
    isLoading: eventsLoading,
    error:     eventsError,
  } = useHomeEvents();

  // 홈 자료실 섹션: 회의록 + 기타자료실 최신 4건
  const {
    data:      archiveItems,
    isLoading: archiveLoading,
    error:     archiveError,
  } = useHomeArchive();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

      {/* ── 상단 그리드: 공지사항 위젯 + 퀵링크 + 급식 + 메인비주얼 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 좌측 컬럼 — 모바일에서는 슬라이드 아래로 이동 */}
        <div className="order-2 lg:order-1 lg:col-span-4 lg:self-start flex flex-col gap-4">
          <div className="h-[280px]">
            <Notices
              onNavigate={navigate}
              onSelectPost={(id) => navigate('notice-detail', id)}
            />
          </div>
          <QuickLinks onNavigate={navigate} />
        </div>

        {/* 우측 컬럼 - 메인 비주얼 — 모바일에서 최상단 */}
        <div className="order-1 lg:order-2 lg:col-span-8">
          <div className="h-full min-h-[400px] lg:min-h-[624px]">
            <MainVisual />
          </div>
        </div>
      </div>

      {/* ── 섹션: 진행 중인 행사 ── */}
      <section className="py-8">
        <div className="flex justify-between items-end mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">진행 중인 행사</h2>
            <p className="text-slate-500 mt-1">학생자치회가 주관하는 다양한 행사에 참여해보세요.</p>
          </div>
          <button
            onClick={() => navigate('events')}
            className="text-blue-600 text-sm font-medium hover:underline flex items-center gap-1"
          >
            전체보기 <ArrowRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {eventsLoading ? (
            /* 로딩: 스켈레톤 3개 */
            [...Array(3)].map((_, i) => <EventCardSkeleton key={i} />)
          ) : eventsError || homeEvents.length === 0 ? (
            /* 에러 또는 데이터 없음 */
            <HomeSectionEmpty message={eventsError ?? '현재 진행 중인 행사가 없습니다.'} />
          ) : (
            /* 실제 데이터: API에서 받은 게시글을 EventCard로 표시 */
            homeEvents.map((event) => {
              const status = event.eventStatus
                ? mapEventStatus(event.eventStatus)
                : deriveEventStatus(event.rawDate);
              return (
                // Fragment로 key를 분리 → React 19 JSX 타입 호환
                <Fragment key={event.id}>
                  <EventCard
                    id={event.id}
                    title={event.title}
                    date={event.date}
                    status={status}
                    imageUrl={event.imageUrl}
                    imageAlt={event.imageAlt}
                    onNavigate={navigate}
                  />
                </Fragment>
              );
            })
          )}
        </div>
      </section>

      {/* ── 섹션: 참여 카드 + 학생자치회 소개 ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
        {/* 참여 카드 (정적 내비게이션 링크) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            onClick={() => navigate('participation')}
            className="bg-blue-600 rounded-xl p-6 text-white shadow-lg hover:bg-blue-700 transition-colors cursor-pointer relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-30 transition-opacity">
              <MessageSquare size={80} />
            </div>
            <h3 className="text-xl font-bold mb-2 relative z-10">학생 건의함</h3>
            <p className="text-blue-100 text-sm mb-4 relative z-10">
              학교생활의 불편함이나<br />개선할 점을 들려주세요.
            </p>
            <span className="inline-flex items-center gap-1 text-sm font-bold bg-white/20 px-3 py-1.5 rounded-full backdrop-blur-sm relative z-10">
              건의하기 <ArrowRight size={14} />
            </span>
          </div>

          <div
            onClick={() => navigate('participation')}
            className="bg-indigo-600 rounded-xl p-6 text-white shadow-lg hover:bg-indigo-700 transition-colors cursor-pointer relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-30 transition-opacity">
              <ThumbsUp size={80} />
            </div>
            <h3 className="text-xl font-bold mb-2 relative z-10">행사 제안</h3>
            <p className="text-indigo-100 text-sm mb-4 relative z-10">
              여러분이 원하는 행사를<br />직접 기획하고 제안해보세요.
            </p>
            <span className="inline-flex items-center gap-1 text-sm font-bold bg-white/20 px-3 py-1.5 rounded-full backdrop-blur-sm relative z-10">
              제안하기 <ArrowRight size={14} />
            </span>
          </div>
        </div>

        {/* 학생자치회 소개 (정적 편집 텍스트) */}
        <div className="bg-white rounded-xl border border-slate-200 p-8 flex flex-col justify-center shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-slate-100 rounded-lg text-slate-700">
              <Users size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-800">학생자치회 소개</h3>
          </div>
          <p className="text-slate-600 leading-relaxed mb-6">
            이현중학교 학생자치회는 학생들의 자발적인 참여를 통해
            민주시민의 자질을 기르고, 즐거운 학교 문화를 만들어가는
            학생 대표 기구입니다.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('intro')}
              className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
            >
              조직도 보기
            </button>
            <button
              onClick={() => navigate('intro')}
              className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              연간 계획
            </button>
          </div>
        </div>
      </div>

      {/* ── 학교 기본정보 ── */}
      <SchoolInfoCard />

      {/* ── 학사일정 + 시간표 (2컬럼) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-start">
        <SchoolScheduleCard />
        <TimeTableCard />
      </div>

      {/* ── 오늘의 급식 ── */}
      <MealCard />

      {/* ── 섹션: 자료실 ── */}
      <section className="py-8">
        <div className="flex justify-between items-end mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">자료실</h2>
            <p className="text-slate-500 mt-1">회의록과 학생자치회 자료를 확인하세요.</p>
          </div>
          <button
            onClick={() => navigate('archive')}
            className="text-blue-600 text-sm font-medium hover:underline flex items-center gap-1"
          >
            더보기 <ArrowRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {archiveLoading ? (
            [...Array(4)].map((_, i) => <ArchiveItemSkeleton key={i} />)
          ) : archiveError || archiveItems.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-12 gap-3 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <FileText size={32} />
              <p className="text-sm">{archiveError ?? '등록된 자료가 없습니다.'}</p>
            </div>
          ) : (
            archiveItems.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-lg border border-slate-200 p-4 flex gap-3 items-center cursor-pointer hover:shadow-md hover:border-blue-200 transition-all group"
                onClick={() => navigate('archive')}
                role="button"
                tabIndex={0}
                aria-label={`자료실: ${item.title}`}
                onKeyDown={(e) => e.key === 'Enter' && navigate('archive')}
              >
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <FileText size={18} className="text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 text-sm truncate group-hover:text-blue-700 transition-colors">
                    {item.title}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{item.date}</p>
                </div>
                {item.categories[0] && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                    {item.categories[0]}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </section>

    </main>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// App — 루트 컴포넌트 & 라우터
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function App() {
  const [currentPage, setCurrentPage]       = useState('home');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  /**
   * 내비게이션 함수
   * - page:   이동할 페이지 키 (예: 'home', 'notices', 'notice-detail')
   * - postId: 게시글 상세 조회 시 ID (선택)
   */
  const navigate = useCallback((page: string, postId?: string) => {
    setCurrentPage(page);
    setSelectedPostId(postId ?? null);
  }, []);

  // 페이지 이동 시 최상단으로 스크롤
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage, selectedPostId]);

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage navigate={navigate} />;

      case 'intro':
        return <IntroPage />;

      case 'notices':
        return (
          <NoticesPage
            // 공지 목록에서 행 클릭 시 상세 페이지로 이동
            onSelectPost={(id) => navigate('notice-detail', id)}
          />
        );

      case 'notice-detail':
        // selectedPostId가 없으면 목록으로 fallback
        return selectedPostId ? (
          <NoticeDetailPage
            postId={selectedPostId}
            onBack={() => navigate('notices')}
          />
        ) : (
          <NoticesPage onSelectPost={(id) => navigate('notice-detail', id)} />
        );

      case 'participation':
        return <ParticipationPage onNavigate={navigate} />;

      case 'suggestion':
        return <SuggestionPage onBack={() => navigate('participation')} />;

      case 'event-proposal':
        return <EventProposalPage onBack={() => navigate('participation')} />;

      case 'events':
        return <EventsPage onSelectPost={(id) => navigate('event-detail', id)} />;

      case 'event-detail':
        return selectedPostId ? (
          <NoticeDetailPage
            postId={selectedPostId}
            onBack={() => navigate('events')}
          />
        ) : (
          <EventsPage onSelectPost={(id) => navigate('event-detail', id)} />
        );

      case 'ehbs':
        return (
          <EHBSPage
            onSelectPost={(id) => navigate('ehbs-detail', id)}
          />
        );

      case 'ehbs-detail':
        return selectedPostId ? (
          <NoticeDetailPage
            postId={selectedPostId}
            onBack={() => navigate('ehbs')}
          />
        ) : (
          <EHBSPage onSelectPost={(id) => navigate('ehbs-detail', id)} />
        );

      case 'archive':
        return <ArchivePage />;

      case 'sitemap':
        return <SitemapPage onNavigate={navigate} />;

      default:
        return <HomePage navigate={navigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <Header onNavigate={navigate} />
      {renderPage()}
      <Footer onNavigate={navigate} />
    </div>
  );
}
