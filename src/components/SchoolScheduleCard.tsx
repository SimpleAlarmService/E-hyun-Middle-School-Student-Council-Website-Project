/**
 * SchoolScheduleCard — 학사일정 카드
 * ──────────────────────────────────────────────────────────────
 *
 * - 월 단위 학사일정 표시 (← 이전달 / 이번달 / 다음달 →)
 * - 공휴일·휴업일·행사 등 색상 배지로 구분
 * - 연속 행사는 날짜 범위로 묶어 표시
 */

import { useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useSchoolSchedule, type ScheduleEvent, type EventType } from '../hooks/useSchoolSchedule';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 배지 스타일
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TYPE_STYLE: Record<EventType, string> = {
  '공휴일': 'bg-red-50   text-red-600   border-red-100',
  '휴업일': 'bg-amber-50 text-amber-600 border-amber-100',
  '행사':   'bg-blue-50  text-blue-600  border-blue-100',
  '기타':   'bg-slate-50 text-slate-500 border-slate-200',
};

const TYPE_DOT: Record<EventType, string> = {
  '공휴일': 'bg-red-400',
  '휴업일': 'bg-amber-400',
  '행사':   'bg-blue-400',
  '기타':   'bg-slate-300',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 날짜 포맷 유틸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** "YYYYMMDD" → Date */
function ymdToDate(ymd: string): Date {
  return new Date(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(4, 6)) - 1,
    Number(ymd.slice(6, 8)),
  );
}

/** "YYYYMMDD" → "M/D" */
function fmtShort(ymd: string): string {
  const d = ymdToDate(ymd);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 날짜 범위 문자열 */
function dateRangeLabel(ev: ScheduleEvent): string {
  if (ev.startYmd === ev.endYmd) return fmtShort(ev.startYmd);
  return `${fmtShort(ev.startYmd)} – ${fmtShort(ev.endYmd)}`;
}

/** 오늘이 해당 이벤트 기간 내인지 */
function isOngoing(ev: ScheduleEvent): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = ymdToDate(ev.startYmd);
  const end   = ymdToDate(ev.endYmd);
  return start <= today && today <= end;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 스켈레톤
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const Skeleton = () => (
  <div className="space-y-2 animate-pulse">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="flex items-center gap-3 py-2">
        <div className="w-14 h-4 bg-slate-100 rounded shrink-0" />
        <div className="flex-1 h-4 bg-slate-100 rounded" />
        <div className="w-10 h-5 bg-slate-100 rounded-full shrink-0" />
      </div>
    ))}
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SchoolScheduleCard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const SchoolScheduleCard = () => {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  const { events, isLoading, error } = useSchoolSchedule(year, month);

  const thisYear  = now.getFullYear();
  const thisMonth = now.getMonth();
  const isThisMonth = year === thisYear && month === thisMonth;

  const shiftMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m > 11) { m = 0;  y++; }
    if (m < 0)  { m = 11; y--; }
    setMonth(m);
    setYear(y);
  };

  const monthLabel = `${year}년 ${month + 1}월`;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

      {/* ── 헤더 ─────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-50 text-emerald-500 rounded-lg flex items-center justify-center shrink-0">
          <CalendarDays size={16} />
        </div>
        <span className="font-bold text-slate-800 text-sm">학사일정</span>
      </div>

      {/* ── 월 내비게이션 ────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <button
          onClick={() => shiftMonth(-1)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          aria-label="이전 달"
        >
          <ChevronLeft size={18} />
        </button>

        <span className="text-sm font-semibold text-slate-700">{monthLabel}</span>

        <button
          onClick={() => shiftMonth(1)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          aria-label="다음 달"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* 이번 달 태그 — 네비게이션 아래 별도 행 */}
      {!isThisMonth && (
        <div className="flex justify-center pb-2">
          <button
            onClick={() => { setYear(thisYear); setMonth(thisMonth); }}
            className="text-xs text-emerald-600 font-medium px-2.5 py-0.5 rounded-full bg-emerald-50 hover:bg-emerald-100 transition-colors"
          >
            이번 달로
          </button>
        </div>
      )}

      {/* ── 일정 목록 ────────────────────────────────────────── */}
      <div className="px-5 py-4">

        {isLoading && <Skeleton />}

        {!isLoading && error && (
          <p className="text-sm text-slate-400 py-6 text-center">{error}</p>
        )}

        {!isLoading && !error && events.length === 0 && (
          <p className="text-sm text-slate-400 py-6 text-center">
            이번 달 학사일정이 없습니다.
          </p>
        )}

        {!isLoading && !error && events.length > 0 && (
          <ul className="divide-y divide-slate-50">
            {events.map((ev, i) => {
              const ongoing = isOngoing(ev);
              return (
                <li
                  key={i}
                  className={`flex items-center gap-3 py-2.5 ${ongoing ? 'opacity-100' : 'opacity-90'}`}
                >
                  {/* 날짜 */}
                  <div className="w-[72px] shrink-0 text-right">
                    <span className={`text-xs font-semibold tabular-nums ${ongoing ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {dateRangeLabel(ev)}
                    </span>
                  </div>

                  {/* 구분선 + 도트 */}
                  <div className="flex flex-col items-center shrink-0">
                    <div className={`w-2 h-2 rounded-full ${TYPE_DOT[ev.type]} ${ongoing ? 'ring-2 ring-offset-1 ring-emerald-300' : ''}`} />
                  </div>

                  {/* 이름 + 학년 */}
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <span className={`text-sm font-medium truncate ${ongoing ? 'text-slate-900' : 'text-slate-700'}`}>
                      {ev.name}
                    </span>
                    {ev.grades.length > 0 && (
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {ev.grades.join('·')}학년
                      </span>
                    )}
                  </div>

                  {/* 타입 배지 */}
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 ${TYPE_STYLE[ev.type]}`}>
                    {ev.type}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
