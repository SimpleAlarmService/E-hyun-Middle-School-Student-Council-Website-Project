/**
 * EHSC Link — 통합검색 모달
 * ──────────────────────────────────────────────────────────────
 *
 * Worker의 /search-index 엔드포인트에서 전체 콘텐츠를 한 번 받아
 * 브라우저에서 실시간 검색합니다.
 *
 * 동작 흐름:
 *   1. 검색창 열기 → /search-index 1회 호출 (5분간 메모리 캐시)
 *   2. 검색어 입력 → 브라우저에서 즉시 필터링 (서버 추가 요청 없음)
 *   3. 결과 클릭   → 해당 페이지로 이동
 *
 * 검색 대상:
 *   공지사항 / 학생회 행사 / 스포츠라이트 / 체육대회·이현제
 *   회의록 / 기타자료실 / EHBS / 자율동아리 소개 / 동아리 활동
 *
 * 재배포 없이 Notion 글 변경이 최대 120초 후 반영됩니다.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, ChevronRight, AlertCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { WORKER_BASE_URL } from '../lib/config';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface SearchItem {
  id:       string;
  title:    string;
  category: string;
  summary:  string;
  content:  string;
  page:     string;
  pageId:   string | null;
  date:     string;
}

interface SearchResult extends SearchItem {
  score:              number;
  highlightedTitle:   string;
  highlightedSummary: string;
}

interface SearchModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  navigate: (page: string, id?: string) => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 모듈 레벨 인덱스 캐시
// 검색창을 여러 번 열어도 재요청하지 않습니다 (5분 유지)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let _cachedIndex: SearchItem[] | null = null;
let _cacheTime   = 0;
const CACHE_MS   = 5 * 60 * 1000; // 5분

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 유틸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 카테고리 배지 색상 */
function getCategoryClass(category: string): string {
  if (category.includes('공지'))                                                  return 'bg-red-50 text-red-600 border-red-100';
  if (category.includes('행사') || category.includes('스포츠') || category.includes('체육')) return 'bg-blue-50 text-blue-600 border-blue-100';
  if (category.includes('자료실') || category.includes('회의'))                   return 'bg-amber-50 text-amber-700 border-amber-100';
  if (category.includes('동아리') || category.includes('활동'))                   return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (category.includes('EHBS'))                                                 return 'bg-purple-50 text-purple-700 border-purple-100';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

/** HTML 특수문자 이스케이프 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 텍스트에서 검색어 강조 — <mark> 태그로 감쌉니다 */
function highlight(text: string, words: string[]): string {
  if (!text) return '';
  let result = escapeHtml(text);
  for (const word of words) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'gi'), '<mark>$&</mark>');
  }
  return result;
}

/**
 * 검색 필터링 + 점수 계산
 *
 * 점수 기준:
 *   - 제목 일치: 3점 (단어당)
 *   - 카테고리 일치: 2점
 *   - 요약 일치: 1점
 *
 * 모든 단어가 하나 이상의 필드에 포함될 때만 결과에 포함됩니다.
 */
function searchItems(items: SearchItem[], query: string): SearchResult[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const results: SearchResult[] = [];

  for (const item of items) {
    const titleLow   = item.title.toLowerCase();
    const catLow     = item.category.toLowerCase();
    const summaryLow = item.summary.toLowerCase();
    const contentLow = item.content.toLowerCase();
    const combined   = `${titleLow} ${catLow} ${summaryLow} ${contentLow}`;

    if (!words.every((w) => combined.includes(w))) continue;

    let score = 0;
    for (const w of words) {
      if (titleLow.includes(w))   score += 3;
      if (catLow.includes(w))     score += 2;
      if (summaryLow.includes(w)) score += 1;
    }

    const excerptSrc = item.summary || item.content.slice(0, 120);
    results.push({
      ...item,
      score,
      highlightedTitle:   highlight(item.title, words),
      highlightedSummary: highlight(excerptSrc,  words),
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 10);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const SearchModal = ({ isOpen, onClose, navigate }: SearchModalProps) => {
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState<SearchResult[]>([]);
  const [indexData, setIndexData] = useState<SearchItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── 인덱스 로드 (모달 첫 열림 시 1회) ─────────────────────
  useEffect(() => {
    if (!isOpen) return;

    // 유효한 캐시가 있으면 재사용
    if (_cachedIndex && Date.now() - _cacheTime < CACHE_MS) {
      setIndexData(_cachedIndex);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    (async () => {
      try {
        const res = await fetch(`${WORKER_BASE_URL}/search-index`);
        if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
        const data: SearchItem[] = await res.json();
        _cachedIndex = data;
        _cacheTime   = Date.now();
        setIndexData(data);
      } catch (err) {
        setLoadError(
          err instanceof Error
            ? err.message
            : '검색 데이터를 불러오지 못했습니다.',
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isOpen]);

  // ── 모달 열림/닫힘 처리 ────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 80);
      document.body.style.overflow = 'hidden';
    } else {
      setQuery('');
      setResults([]);
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // ── Esc 키 닫기 ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── 검색 실행 (debounce 300ms) ─────────────────────────────
  useEffect(() => {
    if (!indexData || !query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setResults(searchItems(indexData, query));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, indexData]);

  // ── 결과 클릭 ──────────────────────────────────────────────
  const handleResultClick = useCallback((result: SearchResult) => {
    navigate(result.page, result.pageId ?? undefined);
    onClose();
  }, [navigate, onClose]);

  // ── 렌더 ───────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 배경 오버레이 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* 검색 패널 */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="통합검색"
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="fixed top-[8vh] left-1/2 -translate-x-1/2 w-full max-w-2xl z-[70] px-4"
          >
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">

              {/* ── 검색 입력창 ── */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                <Search size={20} className="text-slate-400 shrink-0" aria-hidden="true" />
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="공지사항, 행사, 동아리 등을 검색하세요..."
                  className="flex-1 text-base text-slate-800 placeholder-slate-400 outline-none bg-transparent"
                  aria-label="검색어 입력"
                  autoComplete="off"
                />
                {query && (
                  <button
                    onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                    aria-label="검색어 지우기"
                  >
                    <X size={16} />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="ml-1 px-3 py-1 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-300 rounded-lg transition-colors"
                  aria-label="검색창 닫기"
                >
                  닫기
                </button>
              </div>

              {/* ── 결과 영역 ── */}
              <div className="max-h-[60vh] overflow-y-auto overscroll-contain">

                {loadError ? (
                  /* 로드 오류 */
                  <div className="flex flex-col items-center gap-3 py-12 px-6 text-slate-500">
                    <AlertCircle size={28} className="text-amber-400" />
                    <p className="text-sm text-center whitespace-pre-line leading-relaxed">
                      {loadError}
                    </p>
                  </div>

                ) : isLoading ? (
                  /* 인덱스 로딩 중 */
                  <div className="flex flex-col items-center gap-3 py-12 text-slate-400 text-sm">
                    <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    검색 데이터 로딩 중...
                  </div>

                ) : !query.trim() ? (
                  /* 검색어 없음 — 사용 안내 */
                  <div className="px-6 py-10 text-center text-slate-400 text-sm leading-relaxed">
                    <Search size={36} className="mx-auto mb-4 text-slate-200" aria-hidden="true" />
                    <p className="font-medium text-slate-500 mb-1">통합검색</p>
                    <p>공지사항, 학생회 행사, 자율동아리,</p>
                    <p>자료실 등 사이트 전체를 한 번에 검색합니다.</p>
                  </div>

                ) : results.length === 0 ? (
                  /* 결과 없음 */
                  <div className="px-6 py-10 text-center text-slate-400 text-sm">
                    <p>
                      <span className="font-medium text-slate-600">'{query}'</span>에
                      대한 검색 결과가 없습니다.
                    </p>
                    <p className="mt-1 text-xs text-slate-300">
                      다른 검색어로 다시 시도해 보세요.
                    </p>
                  </div>

                ) : (
                  /* 검색 결과 목록 */
                  <div>
                    <div className="px-5 py-2.5 text-[11px] text-slate-400 bg-slate-50 border-b border-slate-100">
                      검색 결과 {results.length}건
                    </div>
                    <ul role="listbox" aria-label="검색 결과">
                      {results.map((result, idx) => (
                        <li
                          key={idx}
                          role="option"
                          aria-selected="false"
                          onClick={() => handleResultClick(result)}
                          onKeyDown={(e) => e.key === 'Enter' && handleResultClick(result)}
                          tabIndex={0}
                          className="group flex items-start gap-4 px-5 py-4 cursor-pointer
                                     hover:bg-blue-50 transition-colors
                                     border-b border-slate-50 last:border-none
                                     focus:outline-none focus:bg-blue-50"
                        >
                          <div className="flex-1 min-w-0">
                            {/* 카테고리 배지 + 날짜 */}
                            <div className="flex items-center gap-2 mb-1.5">
                              {result.category && (
                                <span
                                  className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${getCategoryClass(result.category)}`}
                                >
                                  {result.category}
                                </span>
                              )}
                              {result.date && (
                                <span className="text-[10px] text-slate-400">{result.date}</span>
                              )}
                            </div>

                            {/* 제목 (키워드 강조) */}
                            <p
                              className="font-semibold text-slate-800 truncate
                                         group-hover:text-blue-700 transition-colors text-[15px]
                                         [&_mark]:bg-yellow-100 [&_mark]:text-yellow-800
                                         [&_mark]:px-0.5 [&_mark]:rounded"
                              dangerouslySetInnerHTML={{ __html: result.highlightedTitle }}
                            />

                            {/* 요약 (키워드 강조) */}
                            {result.highlightedSummary && (
                              <p
                                className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed
                                           [&_mark]:bg-yellow-100 [&_mark]:text-yellow-800
                                           [&_mark]:px-0.5 [&_mark]:rounded"
                                dangerouslySetInnerHTML={{ __html: result.highlightedSummary }}
                              />
                            )}
                          </div>

                          <ChevronRight
                            size={16}
                            className="text-slate-300 group-hover:text-blue-500
                                       transition-colors shrink-0 mt-1"
                            aria-hidden="true"
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* ── 하단 힌트 ── */}
              <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/70
                              flex items-center justify-between text-[11px] text-slate-400">
                <span>Esc — 닫기</span>
                <span>Enter — 이동</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
