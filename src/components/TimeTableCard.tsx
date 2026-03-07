/**
 * TimeTableCard — NEIS 시간표 카드
 * ──────────────────────────────────────────────────────────────
 *
 * - 학년(1·2·3) / 반(1~6) 선택 버튼
 * - 주간 이동 (← 이전 주 / 이번 주 / 다음 주 →)
 * - 월~금 × 교시 그리드 시간표
 * - 과목별 컬러 칩
 */

import { useState } from 'react';
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import {
  useTimeTable,
  getMondayOf,
  formatMMDD,
} from '../hooks/useTimeTable';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 과목 컬러 팔레트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SUBJECT_COLORS: Record<string, string> = {
  // 국어 계열
  '국어':       'bg-red-50    text-red-700    border-red-100',
  '문학':       'bg-red-50    text-red-700    border-red-100',
  '독서':       'bg-red-50    text-red-700    border-red-100',
  '화법과작문': 'bg-red-50    text-red-700    border-red-100',
  // 수학 계열
  '수학':       'bg-blue-50   text-blue-700   border-blue-100',
  // 영어 계열
  '영어':       'bg-green-50  text-green-700  border-green-100',
  '영어회화':   'bg-green-50  text-green-700  border-green-100',
  // 사회 계열
  '사회':       'bg-yellow-50 text-yellow-700 border-yellow-100',
  '역사':       'bg-yellow-50 text-yellow-700 border-yellow-100',
  '도덕':       'bg-yellow-50 text-yellow-700 border-yellow-100',
  '지리':       'bg-yellow-50 text-yellow-700 border-yellow-100',
  // 과학 계열
  '과학':       'bg-teal-50   text-teal-700   border-teal-100',
  '물리':       'bg-teal-50   text-teal-700   border-teal-100',
  '화학':       'bg-teal-50   text-teal-700   border-teal-100',
  '생물':       'bg-teal-50   text-teal-700   border-teal-100',
  '지구과학':   'bg-teal-50   text-teal-700   border-teal-100',
  // 체육·예술
  '체육':       'bg-orange-50 text-orange-700 border-orange-100',
  '음악':       'bg-purple-50 text-purple-700 border-purple-100',
  '미술':       'bg-pink-50   text-pink-700   border-pink-100',
  // 기술·가정·정보
  '기술':       'bg-slate-50  text-slate-700  border-slate-200',
  '가정':       'bg-slate-50  text-slate-700  border-slate-200',
  '정보':       'bg-indigo-50 text-indigo-700 border-indigo-100',
  // 기타
  '창체':       'bg-lime-50   text-lime-700   border-lime-100',
  '창의적체험활동': 'bg-lime-50 text-lime-700 border-lime-100',
  '진로':       'bg-lime-50   text-lime-700   border-lime-100',
  '자율':       'bg-lime-50   text-lime-700   border-lime-100',
  '동아리':     'bg-lime-50   text-lime-700   border-lime-100',
  '봉사':       'bg-lime-50   text-lime-700   border-lime-100',
};

const DEFAULT_COLOR = 'bg-slate-50 text-slate-600 border-slate-200';

function subjectColor(subject: string): string {
  // 완전 일치 먼저
  if (SUBJECT_COLORS[subject]) return SUBJECT_COLORS[subject];
  // 부분 일치
  for (const key of Object.keys(SUBJECT_COLORS)) {
    if (subject.includes(key)) return SUBJECT_COLORS[key];
  }
  return DEFAULT_COLOR;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 로딩 스켈레톤
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const Skeleton = () => (
  <div className="animate-pulse space-y-2 mt-3">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="flex gap-2">
        <div className="w-8 h-8 bg-slate-100 rounded shrink-0" />
        {[...Array(5)].map((_, j) => (
          <div key={j} className="flex-1 h-8 bg-slate-100 rounded" />
        ))}
      </div>
    ))}
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 요일 표기
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DAY_LABELS = ['월', '화', '수', '목', '금'];

// 오늘이 해당 dayIdx에 해당하는지 체크
function isToday(weekDates: Date[], dayIdx: number): boolean {
  const today = new Date();
  const d = weekDates[dayIdx];
  if (!d) return false;
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth()    === today.getMonth() &&
    d.getDate()     === today.getDate()
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TimeTableCard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GRADES  = [1, 2, 3];
const CLASSES = [1, 2, 3, 4, 5, 6];

export const TimeTableCard = () => {
  const [grade,   setGrade]   = useState<number>(1);
  const [classNm, setClassNm] = useState<number>(1);
  const [monday,  setMonday]  = useState<Date>(() => getMondayOf(new Date()));

  const { grid, weekDates, maxPeriod, isLoading, error, isFallback } = useTimeTable(grade, classNm, monday);

  const thisMonday = getMondayOf(new Date());
  // 사용자가 ← → 로 이번 주를 벗어났는지 체크 (monday 기준)
  const isThisWeek =
    monday.getFullYear() === thisMonday.getFullYear() &&
    monday.getMonth()    === thisMonday.getMonth() &&
    monday.getDate()     === thisMonday.getDate();

  const shiftWeek = (delta: number) => {
    const next = new Date(monday);
    next.setDate(monday.getDate() + delta * 7);
    setMonday(next);
  };

  // 주간 범위 표시 (월~금)
  const weekLabel =
    weekDates.length === 5
      ? `${formatMMDD(weekDates[0])} ~ ${formatMMDD(weekDates[4])}`
      : '';

  const periods = Array.from({ length: maxPeriod }, (_, i) => i + 1); // [1, 2, … maxPeriod]

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

      {/* ── 헤더 ─────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-8 h-8 bg-violet-50 text-violet-500 rounded-lg flex items-center justify-center shrink-0">
          <BookOpen size={16} />
        </div>
        <span className="font-bold text-slate-800 text-sm">시간표</span>
      </div>

      {/* ── 컨트롤 ───────────────────────────────────────────── */}
      <div className="px-5 pt-4 pb-3 space-y-3 border-b border-slate-100">

        {/* 학년 / 반 선택 */}
        <div className="flex flex-wrap items-center gap-3">
          {/* 학년 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium w-7 shrink-0">학년</span>
            <div className="flex gap-1">
              {GRADES.map(g => (
                <button
                  key={g}
                  onClick={() => setGrade(g)}
                  className={`w-8 h-8 text-xs font-semibold rounded-lg border transition-colors ${
                    grade === g
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="w-px h-5 bg-slate-200 hidden sm:block" />

          {/* 반 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium w-4 shrink-0">반</span>
            <div className="flex gap-1">
              {CLASSES.map(c => (
                <button
                  key={c}
                  onClick={() => setClassNm(c)}
                  className={`w-8 h-8 text-xs font-semibold rounded-lg border transition-colors ${
                    classNm === c
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 주간 이동 */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => shiftWeek(-1)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            aria-label="이전 주"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="text-sm font-medium text-slate-700">{weekLabel}</span>
            {!isThisWeek && (
              <button
                onClick={() => setMonday(getMondayOf(new Date()))}
                className="text-xs text-violet-600 font-medium px-2 py-0.5 rounded-full bg-violet-50 hover:bg-violet-100 transition-colors"
              >
                이번 주
              </button>
            )}
            {isFallback && (
              <span className="text-xs text-amber-600 font-medium px-2 py-0.5 rounded-full bg-amber-50 border border-amber-100">
                최근 등록 시간표
              </span>
            )}
          </div>

          <button
            onClick={() => shiftWeek(1)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            aria-label="다음 주"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* ── 시간표 본문 ─────────────────────────────────────── */}
      <div className="px-5 py-4 overflow-x-auto">

        {isLoading && <Skeleton />}

        {!isLoading && error && (
          <p className="text-sm text-slate-400 py-6 text-center">{error}</p>
        )}

        {!isLoading && !error && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {/* 교시 헤더 */}
                <th className="w-8 pb-2 text-center text-slate-400 font-medium" />
                {weekDates.map((d, i) => {
                  const today = isToday(weekDates, i);
                  return (
                    <th
                      key={i}
                      className={`pb-2 text-center font-semibold w-[18%] ${
                        today ? 'text-violet-600' : 'text-slate-500'
                      }`}
                    >
                      <div>{DAY_LABELS[i]}</div>
                      <div className={`text-[10px] font-normal ${today ? 'text-violet-400' : 'text-slate-400'}`}>
                        {formatMMDD(d)}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {periods.map(period => (
                <tr key={period}>
                  {/* 교시 번호 */}
                  <td className="pr-2 py-0.5 text-center text-slate-400 font-medium align-middle">
                    {period}
                  </td>
                  {weekDates.map((_, dayIdx) => {
                    const subject = grid[dayIdx]?.[period] ?? '';
                    const color   = subject ? subjectColor(subject) : '';
                    return (
                      <td key={dayIdx} className="py-0.5 px-0.5 align-middle">
                        {subject ? (
                          <div
                            className={`rounded-md border px-1 py-1 text-center leading-tight font-medium truncate ${color}`}
                            title={subject}
                          >
                            {subject}
                          </div>
                        ) : (
                          <div className="rounded-md py-1 text-center text-slate-200">—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* 데이터 없음 */}
              {!isLoading && periods.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    시간표 정보가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
};
