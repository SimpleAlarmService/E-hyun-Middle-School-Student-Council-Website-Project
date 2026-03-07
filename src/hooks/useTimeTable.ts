/**
 * useTimeTable — NEIS 중학교 시간표 API 연동 훅
 * ──────────────────────────────────────────────────────────────
 *
 * API: https://open.neis.go.kr/hub/misTimetable
 * 학교: 이현중학교 (J10 / 7751035)
 *
 * 선택한 학년·반·주(週)에 대해 월~금 5일치를 한 번에 요청합니다.
 * 현재 주 데이터가 없으면(학기 초 미등록 등) 최대 8주 전까지 소급해
 * 가장 최근 등록된 시간표를 자동으로 표시합니다.
 */

import { useState, useEffect } from 'react';
import { dateToYmd } from './useMealInfo';

const API_KEY    = 'f7280ed4b514484888fd99d94cdcb126';
const ATPT_CODE  = 'J10';
const SCHUL_CODE = '7751035';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 날짜 유틸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 해당 날짜가 속한 주의 월요일(Date)을 반환 */
export function getMondayOf(d: Date): Date {
  const day = d.getDay();               // 0=일 1=월 … 6=토
  const diff = day === 0 ? -6 : 1 - day; // 월요일로 보정
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

/** 날짜 → "MM.DD" 표시용 */
export function formatMMDD(d: Date): string {
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
}

/** 날짜로부터 학년도(AY)·학기(SEM) 자동 계산 */
function getAySem(d: Date): { ay: number; sem: number } {
  const m = d.getMonth() + 1; // 1-12
  const y = d.getFullYear();
  if (m >= 3 && m <= 8)  return { ay: y,     sem: 1 };
  if (m >= 9)             return { ay: y,     sem: 2 };
  return                         { ay: y - 1, sem: 2 };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * dayIndex 0=월 … 4=금
 * periodNo 1-7
 */
export type TimetableGrid = Record<number, Record<number, string>>;

export interface UseTimeTableReturn {
  grid:           TimetableGrid;  // { dayIdx: { period: subject } }
  weekDates:      Date[];         // 실제 표시 중인 주 월~금 Date 5개
  maxPeriod:      number;         // 해당 주 최대 교시
  isLoading:      boolean;
  error:          string | null;
  isFallback:     boolean;        // 요청한 주가 아닌 과거 데이터를 표시 중
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 내부 헬퍼
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 주어진 월요일 기준 월~금 Date 배열 반환 */
function weekDatesFrom(mon: Date): Date[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hook
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function useTimeTable(
  grade:   number,   // 1·2·3
  classNm: number,   // 반 번호
  monday:  Date,     // 표시하려는 주의 월요일 Date
): UseTimeTableReturn {
  const [grid,        setGrid]        = useState<TimetableGrid>({});
  const [displayMon,  setDisplayMon]  = useState<Date>(monday);
  const [isFallback,  setIsFallback]  = useState(false);
  const [isLoading,   setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    setGrid({});
    setLoading(true);
    setError(null);
    setIsFallback(false);

    const controller = new AbortController();

    /**
     * 한 주(5일)의 시간표를 fetch.
     * 반환값: { grid, hasData }
     *   - hasData=true  → 1개 이상 교시에 과목명이 있음
     *   - hasData=false → 모든 날 INFO-200 (등록된 데이터 없음)
     */
    async function fetchWeek(mon: Date): Promise<{ g: TimetableGrid; hasData: boolean }> {
      const { ay, sem } = getAySem(mon);
      const days = weekDatesFrom(mon);

      const fetchDay = async (d: Date, dayIdx: number) => {
        const ymd = dateToYmd(d);
        const url =
          `https://open.neis.go.kr/hub/misTimetable` +
          `?KEY=${API_KEY}&Type=json` +
          `&ATPT_OFCDC_SC_CODE=${ATPT_CODE}` +
          `&SD_SCHUL_CODE=${SCHUL_CODE}` +
          `&AY=${ay}&SEM=${sem}` +
          `&GRADE=${grade}&CLASS_NM=${classNm}` +
          `&ALL_TI_YMD=${ymd}`;

        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json: any = await res.json();

        const outer = json?.misTimetable;
        if (!outer) return { dayIdx, periods: {} as Record<number, string> };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const headBlock = outer.find((o: any) => Array.isArray(o.head));
        const code: string = headBlock?.head?.[1]?.RESULT?.CODE ?? '';
        if (code === 'INFO-200') return { dayIdx, periods: {} as Record<number, string> };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: any[] = outer.find((o: any) => Array.isArray(o.row))?.row ?? [];
        const periods: Record<number, string> = {};
        rows.forEach(r => {
          const p = parseInt(r.PERIO);
          if (!isNaN(p)) periods[p] = r.ITRT_CNTNT ?? '';
        });
        return { dayIdx, periods };
      };

      const results = await Promise.all(days.map((d, i) => fetchDay(d, i)));
      const g: TimetableGrid = {};
      results.forEach(({ dayIdx, periods }) => { g[dayIdx] = periods; });

      const hasData = results.some(r => Object.keys(r.periods).length > 0);
      return { g, hasData };
    }

    /**
     * 요청된 주부터 최대 8주 이전까지 소급하여 데이터가 있는 주를 찾는다.
     */
    async function findAndLoad() {
      let mon = new Date(monday);
      mon.setHours(0, 0, 0, 0);

      for (let attempt = 0; attempt < 9; attempt++) {
        const { g, hasData } = await fetchWeek(mon);
        if (hasData) {
          setGrid(g);
          setDisplayMon(new Date(mon));
          setIsFallback(attempt > 0);
          return;
        }
        // 1주 이전으로
        mon.setDate(mon.getDate() - 7);
      }

      // 9주 소급해도 없으면 빈 상태
      setGrid({});
      setDisplayMon(new Date(monday));
      setIsFallback(false);
    }

    findAndLoad()
      .catch(err => {
        if (err.name === 'AbortError') return;
        console.warn('[useTimeTable]', err);
        setError('시간표를 불러올 수 없습니다.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grade, classNm, dateToYmd(monday)]);

  const weekDates = weekDatesFrom(displayMon);

  const maxPeriod = Math.max(
    7,
    ...Object.values(grid).flatMap(d => Object.keys(d).map(Number)),
  );

  return { grid, weekDates, maxPeriod, isLoading, error, isFallback };
}
