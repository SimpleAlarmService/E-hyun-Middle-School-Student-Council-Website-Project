/**
 * MealCard — 오늘의 급식 정보 카드
 * ──────────────────────────────────────────────────────────────
 *
 * - 날짜 선택: ← 이전 날 / → 다음 날 버튼 + "오늘" 버튼
 * - NEIS 급식 API에서 선택한 날짜의 중식 데이터 표시
 * - 메뉴 아이템을 chip 형태로 표시
 * - 열량, 원산지 정보 확장 표시
 * - 오류/데이터 없음 상태도 레이아웃 깨짐 없이 처리
 */

import React, { useState } from 'react';
import {
  UtensilsCrossed,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useMealInfo, todayYmd, dateToYmd, ymdToDate } from '../hooks/useMealInfo';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 날짜 포맷 유틸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const KO_DAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** "YYYYMMDD" → "M월 D일 (요일)" */
function formatDate(ymd: string): string {
  const d = ymdToDate(ymd);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${KO_DAYS[d.getDay()]})`;
}

/** "YYYYMMDD" → "YYYY-MM-DD" (input[type=date] value 형식) */
function ymdToInputValue(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/** "YYYY-MM-DD" → "YYYYMMDD" */
function inputValueToYmd(val: string): string {
  return val.replace(/-/g, '');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 로딩 스켈레톤
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MealSkeleton = () => (
  <div className="flex flex-wrap gap-2 animate-pulse">
    {[80, 60, 110, 70, 65, 90, 55].map((w, i) => (
      <div key={i} className="h-6 bg-slate-100 rounded-full" style={{ width: `${w}px` }} />
    ))}
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MealCard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const MealCard = () => {
  const [selectedYmd, setSelectedYmd] = useState<string>(todayYmd);
  const [showOrigin,  setShowOrigin]  = useState(false);
  const [showPicker,  setShowPicker]  = useState(false);

  const { meals, isLoading, error } = useMealInfo(selectedYmd);

  // 중식 우선, 없으면 첫 번째 식사
  const lunch = meals?.find(m => m.mealType === '중식') ?? meals?.[0] ?? null;

  const today   = todayYmd();
  const isToday = selectedYmd === today;

  const goToPrev = () => {
    const d = ymdToDate(selectedYmd);
    d.setDate(d.getDate() - 1);
    setSelectedYmd(dateToYmd(d));
    setShowOrigin(false);
  };

  const goToNext = () => {
    const d = ymdToDate(selectedYmd);
    d.setDate(d.getDate() + 1);
    setSelectedYmd(dateToYmd(d));
    setShowOrigin(false);
  };

  const goToToday = () => {
    setSelectedYmd(today);
    setShowOrigin(false);
  };

  const handleDateInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    setSelectedYmd(inputValueToYmd(e.target.value));
    setShowOrigin(false);
    setShowPicker(false);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden w-full">

      {/* ── 헤더 ─────────────────────────────────────────────── */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100 gap-2">

        {/* 좌측: 아이콘 + 타이틀 */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 bg-orange-50 text-orange-500 rounded-lg flex items-center justify-center">
            <UtensilsCrossed size={14} />
          </div>
          <span className="font-bold text-slate-800 text-sm">급식</span>
          {lunch && (
            <span className="text-xs font-semibold px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded-full">
              {lunch.mealType}
            </span>
          )}
        </div>

        {/* 중앙: 날짜 네비게이션 */}
        <div className="flex items-center gap-1 flex-1 justify-center">
          {/* 이전 날 */}
          <button
            onClick={goToPrev}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="이전 날"
          >
            <ChevronLeft size={15} />
          </button>

          {/* 날짜 표시 (클릭 시 날짜 입력창 토글) */}
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap"
            title="날짜 직접 선택"
          >
            {formatDate(selectedYmd)}
          </button>

          {/* 다음 날 */}
          <button
            onClick={goToNext}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="다음 날"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        {/* 우측: 오늘 버튼 (오늘이 아닐 때만) */}
        <div className="shrink-0 w-10 flex justify-end">
          {!isToday && (
            <button
              onClick={goToToday}
              className="text-xs font-semibold px-2 py-1 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors"
            >
              오늘
            </button>
          )}
        </div>
      </div>

      {/* ── 날짜 직접 선택 입력창 ────────────────────────────── */}
      {showPicker && (
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
          <span className="text-xs text-slate-500 shrink-0">날짜 선택</span>
          <input
            type="date"
            value={ymdToInputValue(selectedYmd)}
            onChange={handleDateInput}
            className="flex-1 text-xs border border-slate-200 bg-white rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            autoFocus
          />
          <button
            onClick={() => setShowPicker(false)}
            className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors shrink-0"
          >
            닫기
          </button>
        </div>
      )}

      {/* ── 본문 ─────────────────────────────────────────────── */}
      <div className="px-4 py-4">

        {/* 로딩 */}
        {isLoading && <MealSkeleton />}

        {/* 오류 */}
        {!isLoading && error && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <AlertCircle size={15} className="shrink-0" />
            <span>급식 정보를 불러올 수 없습니다.</span>
          </div>
        )}

        {/* 급식 없음 (주말·방학) */}
        {!isLoading && !error && !lunch && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <UtensilsCrossed size={15} className="shrink-0" />
            <span>급식 정보가 없습니다.</span>
          </div>
        )}

        {/* 메뉴 표시 */}
        {!isLoading && !error && lunch && (
          <div className="space-y-3">

            {/* 메뉴 chip 목록 */}
            <div className="flex flex-wrap gap-1.5">
              {lunch.items.map((item, i) => (
                <span
                  key={i}
                  className="text-xs px-2.5 py-1 bg-orange-50 text-orange-700 rounded-full font-medium border border-orange-100 leading-none"
                >
                  {item.name}
                </span>
              ))}
            </div>

            {/* 열량 + 원산지 토글 */}
            <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-50">
              {lunch.calories ? (
                <span className="flex items-center gap-1">
                  🔥 <span className="font-semibold text-slate-600">{lunch.calories} kcal</span>
                </span>
              ) : <span />}

              {lunch.origin && (
                <button
                  onClick={() => setShowOrigin(!showOrigin)}
                  className="flex items-center gap-1 hover:text-slate-600 transition-colors"
                >
                  원산지 정보
                  {showOrigin ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              )}
            </div>

            {/* 원산지 정보 (펼침) */}
            {showOrigin && lunch.origin && (
              <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 leading-relaxed whitespace-pre-line border border-slate-100">
                {lunch.origin}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
