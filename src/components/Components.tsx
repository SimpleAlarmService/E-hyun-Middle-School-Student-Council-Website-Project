/**
 * EHSC Link — 공통 UI 컴포넌트
 * ──────────────────────────────────────────────────────────────
 *
 * 변경 내역 (WordPress API 연동 리팩터링):
 *  - [제거] Notice 타입 (더미 데이터 포함) → types/wordpress.ts의 PostCardData 사용
 *  - [제거] Event 타입 내부 더미 데이터
 *  - [제거] Notices 컴포넌트의 하드코딩된 공지 5건
 *  - [추가] Notices 컴포넌트 → useHomeNotices() 훅으로 실제 API 데이터 표시
 *  - [추가] Notices에 onNavigate prop (더보기 버튼 연결)
 *  - [추가] 로딩 스켈레톤, 에러 상태, 빈 상태 UI
 *  - [유지] TopBar, Header, MainVisual, QuickLinks, EventCard, Footer 구조·디자인 동일
 *
 * 설계 원칙:
 *  - MainVisual 슬라이드 텍스트는 사이트 브랜딩 문구로 정적 유지
 *    (추후 WordPress 슬라이더 플러그인 연동 시 API 대체 가능)
 *  - QuickLinks, Footer는 내비게이션/기관 정보로 정적 유지
 */

import {
  Megaphone,
  Calendar,
  Users,
  FileText,
  ChevronRight,
  Menu,
  X,
  Search,
  Map,
  Globe,
  MessageCircle,
  Lightbulb,
  Image as ImageIcon,
  AlertCircle,
  InboxIcon,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useHomeNotices } from '../hooks/useNotion';
import type { PostCardData } from '../types/notion';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 내부 공통 UI (로딩 / 에러 / 빈 상태)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 공지 목록 로딩 스켈레톤 */
const NoticesSkeleton = () => (
  <ul className="space-y-3 animate-pulse" aria-label="로딩 중">
    {[...Array(4)].map((_, i) => (
      <li key={i} className="flex items-start gap-3">
        <div className="w-10 h-4 bg-slate-200 rounded-full shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 bg-slate-200 rounded w-full" />
          <div className="h-2.5 bg-slate-100 rounded w-24" />
        </div>
      </li>
    ))}
  </ul>
);

/** 에러 상태 인라인 메시지 */
const InlineError = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center h-24 gap-2 text-slate-400">
    <AlertCircle size={20} className="text-red-400" />
    <p className="text-xs text-center">{message}</p>
  </div>
);

/** 빈 상태 인라인 메시지 */
const InlineEmpty = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center h-24 gap-2 text-slate-400">
    <InboxIcon size={20} />
    <p className="text-xs text-center">{message}</p>
  </div>
);


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Header
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const Header = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const menuItems = [
    { title: '학생자치회', id: 'intro',         subItems: ['학생회 소개', '부서 소개'] },
    { title: '공지사항',   id: 'notices',        subItems: [] },
    { title: '학생참여',   id: 'participation',  subItems: ['건의함', '행사 제안'] },
    { title: '학생회 행사',id: 'events',         subItems: ['스포츠라이트', '행사 안내', '체육대회/이현제'] },
    { title: '자료실',     id: 'archive',        subItems: ['회의록', '기타자료실'] },
    { title: 'EHBS',       id: 'ehbs',           subItems: [] },
  ];

  const handleNavigate = (id: string) => {
    onNavigate(id);
    setIsMenuOpen(false);
  };

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* 로고 */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleNavigate('home')}>
            <img src="/logo.png" alt="이현중학교 학생자치회 로고" className="w-10 h-10 object-contain" />
            <div className="flex flex-col">
              <span className="text-xl font-bold text-slate-900 leading-none tracking-tight">EHSC Connect</span>
              <span className="text-xs text-slate-500 font-medium mt-1">이현중학교 학생자치회</span>
            </div>
          </div>

          {/* 데스크톱 내비게이션 */}
          <nav className="hidden md:flex h-full">
            {menuItems.map((item) => (
              <div
                key={item.title}
                className="group relative h-full flex items-center px-5 cursor-pointer"
                onClick={() => handleNavigate(item.id)}
              >
                <span className="text-slate-700 font-semibold group-hover:text-blue-700 transition-colors text-base">
                  {item.title}
                </span>
                <div className="absolute top-full left-0 w-48 bg-white border border-slate-200 shadow-lg rounded-b-lg overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform translate-y-2 group-hover:translate-y-0">
                  {item.subItems.map((sub) => (
                    <div
                      key={sub}
                      className="block px-4 py-3 text-sm text-slate-600 hover:bg-slate-50 hover:text-blue-700 border-b border-slate-50 last:border-none"
                      onClick={(e) => { e.stopPropagation(); handleNavigate(item.id); }}
                    >
                      {sub}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* 모바일 햄버거 버튼 */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-md"
              aria-label={isMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* 모바일 드로어 */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden bg-white border-t border-slate-200 overflow-hidden"
          >
            <div className="px-4 py-4 space-y-4">
              {menuItems.map((item) => (
                <div key={item.title} className="border-b border-slate-100 pb-2 last:border-none">
                  <div
                    className="font-bold text-slate-800 mb-2 cursor-pointer hover:text-blue-600"
                    onClick={() => handleNavigate(item.id)}
                  >
                    {item.title}
                  </div>
                  <div className="pl-4 flex flex-col space-y-2">
                    {item.subItems.map((sub) => (
                      <div
                        key={sub}
                        className="text-sm text-slate-600 hover:text-blue-600 py-1 cursor-pointer"
                        onClick={() => handleNavigate(item.id)}
                      >
                        - {sub}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MainVisual (메인 배너 캐러셀)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 슬라이드 텍스트는 사이트 브랜딩 문구로 정적 유지합니다.
// 추후 WordPress 슬라이더 플러그인 또는 'banner' 카테고리 API로 대체 가능합니다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const MainVisual = () => {
  const [currentSlide, setCurrentSlide] = useState(0);

  // 슬라이드 배경색 (이미지 없어도 자연스럽게 보이도록 그라디언트 사용)
  const slides = [
    {
      id:       1,
      bg:       'from-blue-900 to-blue-700',
      image:    '/banner1.png',
      title:    '학생을 위한, 학생에 의한 자치회',
      subtitle: '2026학년도 이현중학교 학생자치회 공식 출범',
    },
    {
      id:       2,
      bg:       'from-slate-800 to-slate-600',
      title:    '함께 만드는 더 나은 학교',
      subtitle: '여러분의 소중한 의견이 학교를 변화시킵니다',
    },
    {
      id:       3,
      bg:       'from-indigo-900 to-indigo-700',
      title:    '즐거운 학교생활의 시작',
      subtitle: '다양한 행사와 동아리 활동에 참여해보세요',
    },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % slides.length);
  const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);

  return (
    <div className="relative h-[400px] md:h-[500px] w-full rounded-xl overflow-hidden group shadow-md">
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${index === currentSlide ? 'opacity-100' : 'opacity-0'}`}
        >
          {'image' in slide && slide.image ? (
            <>
              <img src={slide.image} alt={slide.title} className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40" />
            </>
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${slide.bg}`} />
          )}
          <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-12">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={index === currentSlide ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-2xl md:text-4xl font-bold text-white mb-2 drop-shadow-md">{slide.title}</h2>
              <p className="text-blue-100 text-sm md:text-lg drop-shadow-sm">{slide.subtitle}</p>
            </motion.div>
          </div>
        </div>
      ))}

      {/* 이전/다음 버튼 */}
      <button
        onClick={prevSlide}
        className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-2 rounded-full backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
        aria-label="이전 슬라이드"
      >
        <ChevronRight size={24} className="rotate-180" />
      </button>
      <button
        onClick={nextSlide}
        className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-2 rounded-full backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
        aria-label="다음 슬라이드"
      >
        <ChevronRight size={24} />
      </button>

      {/* 인디케이터 */}
      <div className="absolute bottom-4 right-4 flex gap-2">
        {slides.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentSlide(idx)}
            className={`w-2 h-2 rounded-full transition-all ${idx === currentSlide ? 'bg-white w-6' : 'bg-white/50 hover:bg-white/80'}`}
            aria-label={`슬라이드 ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Notices (공지사항 위젯)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// [변경] 하드코딩된 notices 배열 → useHomeNotices() 훅으로 교체
// [변경] 탭 필터: 카테고리 이름(한글) 부분 일치로 클라이언트 사이드 필터링
// [추가] onNavigate prop: '더보기' 버튼을 notices 페이지로 연결
// [추가] 로딩 스켈레톤 / 에러 / 빈 상태 UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 카테고리 이름을 탭 레이블에 매핑하는 배지 색상 */
function getNoticeBadgeClass(categoryName: string): string {
  if (categoryName.includes('공지')) return 'bg-red-50 text-red-600 border border-red-100';
  if (categoryName.includes('행사')) return 'bg-blue-50 text-blue-600 border border-blue-100';
  return 'bg-slate-100 text-slate-600 border border-slate-200';
}

export const Notices = ({
  onNavigate,
  onSelectPost,
}: {
  onNavigate?:   (page: string) => void;
  onSelectPost?: (postId: string) => void;
}) => {
  const [activeTab, setActiveTab] = useState('전체');
  const { data: posts, isLoading, error } = useHomeNotices();

  const tabs = ['전체', '공지', '행사', '안내'];

  /**
   * 탭 필터링: 카테고리 이름(한글)에 탭 텍스트가 포함되면 표시
   * 예: '공지사항' 카테고리 → '공지' 탭에 표시
   */
  const filteredPosts: PostCardData[] =
    activeTab === '전체'
      ? posts
      : posts.filter((p) =>
          p.categories.some((c) => c.includes(activeTab))
        );

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm h-full flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
          <Megaphone size={20} className="text-blue-600" />
          공지사항
        </h3>
        <button
          onClick={() => onNavigate?.('notices')}
          className="text-xs text-slate-500 hover:text-blue-600 flex items-center gap-0.5 transition-colors"
        >
          더보기 <ChevronRight size={14} />
        </button>
      </div>

      {/* 탭 */}
      <div className="px-5 pt-4">
        <div className="flex gap-4 border-b border-slate-100 text-sm">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 relative ${activeTab === tab ? 'text-blue-700 font-bold' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {tab}
              {activeTab === tab && (
                <motion.div layoutId="notices-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 본문 */}
      <div className="p-5 flex-1 overflow-y-auto">
        {isLoading ? (
          <NoticesSkeleton />
        ) : error ? (
          <InlineError message="공지사항을 불러오지 못했습니다." />
        ) : filteredPosts.length === 0 ? (
          <InlineEmpty message="등록된 공지사항이 없습니다." />
        ) : (
          <ul className="space-y-3">
            {filteredPosts.map((post) => {
              const catName = post.categories[0] ?? '';
              return (
                <li
                  key={post.id}
                  className="group cursor-pointer"
                  onClick={() => onSelectPost?.(post.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onSelectPost?.(post.id)}
                >
                  <div className="flex items-start gap-3">
                    {catName && (
                      <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium shrink-0 mt-0.5 ${getNoticeBadgeClass(catName)}`}>
                        {catName}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate group-hover:text-blue-700 transition-colors text-slate-700">
                        {post.title}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{post.date}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QuickLinks (바로가기)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const QuickLinks = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
  const links = [
    { id: 'intro',         icon: Users,      label: '학생회 소개', color: 'bg-indigo-50 text-indigo-600' },
    { id: 'events',        icon: Calendar,   label: '행사 참여',   color: 'bg-emerald-50 text-emerald-600' },
    { id: 'participation', icon: MessageCircle, label: '건의함',   color: 'bg-amber-50 text-amber-600' },
    { id: 'participation', icon: Lightbulb,  label: '행사 제안',   color: 'bg-rose-50 text-rose-600' },
    { id: 'archive',       icon: ImageIcon,  label: '활동 갤러리', color: 'bg-sky-50 text-sky-600' },
    { id: 'archive',       icon: FileText,   label: '회의록',      color: 'bg-slate-50 text-slate-600' },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
        <Search size={20} className="text-blue-600" />
        바로가기
      </h3>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {links.map((link) => (
          <button
            key={link.label}
            onClick={() => onNavigate(link.id)}
            className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-slate-50 transition-colors group border border-transparent hover:border-slate-100"
          >
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center mb-1.5 ${link.color} group-hover:scale-110 transition-transform`}>
              <link.icon size={18} />
            </div>
            <span className="text-[10px] sm:text-xs font-medium text-slate-600 text-center leading-tight">{link.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EventCard (행사 카드)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Props는 동일하게 유지합니다.
// 호출부(App.tsx)에서 API 데이터를 전달합니다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type EventStatus = 'upcoming' | 'ongoing' | 'ended';

export type EventCardProps = {
  id:          string;
  title:       string;
  date:        string;
  status:      EventStatus;
  imageUrl:    string;
  imageAlt?:   string;
  onNavigate?: (page: string) => void;
};

/** 행사 상태 배지 레이블 */
const STATUS_LABEL: Record<EventStatus, string> = {
  upcoming: 'D-Day',
  ongoing:  '진행중',
  ended:    '종료',
};

/** 행사 상태 배지 색상 */
const STATUS_CLASS: Record<EventStatus, string> = {
  upcoming: 'bg-blue-600 text-white',
  ongoing:  'bg-green-600 text-white',
  ended:    'bg-slate-500 text-white',
};

export const EventCard = ({ id, title, date, status, imageUrl, imageAlt, onNavigate }: EventCardProps) => (
  <div
    onClick={() => onNavigate?.('events')}
    className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-md transition-shadow group cursor-pointer"
    role="button"
    tabIndex={0}
    aria-label={`행사: ${title}`}
    onKeyDown={(e) => e.key === 'Enter' && onNavigate?.('events')}
  >
    <div className="h-40 overflow-hidden relative bg-slate-100">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={imageAlt ?? title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
      ) : (
        /* 대표 이미지 없을 때 placeholder */
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
          <Calendar size={32} className="text-slate-400" />
        </div>
      )}
      <div className="absolute top-2 right-2">
        <span className={`px-2 py-1 text-xs font-bold rounded-md shadow-sm ${STATUS_CLASS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>
    </div>
    <div className="p-4">
      <h4 className="font-bold text-slate-800 mb-1 truncate group-hover:text-blue-700">{title}</h4>
      <p className="text-sm text-slate-500 flex items-center gap-1">
        <Calendar size={14} /> {date}
      </p>
    </div>
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Footer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const Footer = ({ onNavigate }: { onNavigate?: (page: string) => void }) => (
  <footer className="bg-slate-900 text-slate-400 py-10 mt-12 border-t border-slate-800">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
        <div className="col-span-1 md:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <img src="/logo.png" alt="이현중학교 학생자치회 로고" className="w-8 h-8 object-contain" />
            <span className="text-lg font-bold text-white">EHSC Connect</span>
          </div>
          <p className="text-sm leading-relaxed mb-4 max-w-md">
            이현중학교 학생자치회는 학생들의 목소리를 대변하고,
            더 나은 학교 문화를 만들어가기 위해 노력합니다.
            여러분의 적극적인 참여가 우리 학교를 변화시킵니다.
          </p>
        </div>

        <div className="col-span-1 md:col-span-2">
          <h4 className="text-white font-bold mb-4">사이트맵</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 text-sm">
            {[
              { title: '학생자치회', page: 'intro',        subs: ['학생회 소개', '부서 소개'] },
              { title: '공지사항',   page: 'notices',      subs: [] },
              { title: '학생참여',   page: 'participation',subs: ['건의함', '행사 제안'] },
              { title: '학생회 행사',page: 'events',       subs: ['스포츠라이트', '행사 안내', '체육대회/이현제'] },
              { title: '자료실',     page: 'archive',      subs: ['회의록', '기타자료실'] },
            ].map(({ title, page, subs }) => (
              <div key={page}>
                <button
                  onClick={() => onNavigate?.(page)}
                  className="text-white font-semibold hover:text-blue-300 transition-colors text-left mb-2 block"
                >
                  {title}
                </button>
                <ul className="space-y-1">
                  {subs.map((sub) => (
                    <li key={sub}>
                      <button
                        onClick={() => onNavigate?.(page)}
                        className="text-slate-400 hover:text-white transition-colors text-left flex items-center gap-1"
                      >
                        <span className="text-slate-600">›</span> {sub}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-white font-bold mb-4">문의하기</h4>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Map size={16} className="mt-0.5 shrink-0" />
              <span>경기도 용인시 수지구 진산로34번길 39<br />이현중학교 별관2층 문화자치부</span>
            </li>
            <li className="flex items-center gap-2">
              <Globe size={16} className="shrink-0" />
              <a href="https://www.goeyi.kr/e-hyun-m/main.do" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                이현중학교 공식 홈페이지
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-800 pt-6 flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
        <p>© 2026 E-Hyun Middle School Student Council. All rights reserved.</p>
        <div className="flex gap-4">
          <span className="hover:text-white cursor-default">이용약관</span>
        </div>
      </div>
    </div>
  </footer>
);
