/**
 * useTimeTable — NEIS 중학교 시간표 API 연동 훅
 * ──────────────────────────────────────────────────────────────
 *
 * API: https://open.neis.go.kr/hub/misTimetable
 * 학교: 이현중학교 (J10 / 7751035)
 *
 * 전략:
 *  1. 요청한 주를 먼저 fetch
 *  2. 데이터가 없으면(학기 초 미등록·방학 등) 이전 학기의 앵커 날짜부터
 *     8주 치를 동시에(병렬) 요청해 가장 최근 등록 시간표를 표시
 *  → 최대 2번의 네트워크 왕복으로 데이터를 찾음 (순차 탐색 대비 빠름)
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
  const diff = day === 0 ? -6 : 1 - day;
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

/**
 * 이전 학기에서 시작할 "앵커" 날짜 계산.
 * 한국 학사 일정 기준:
 *   1학기(3–8월): 이전 학기는 2학기 → 11월 말부터 역탐색
 *   2학기(9–2월): 이전 학기는 1학기 → 6월 말부터 역탐색
 */
function prevSemesterAnchor(d: Date): Date {
  const { ay, sem } = getAySem(d);
  if (sem === 1) {
    // 현재 1학기 → 이전은 (ay-1)년 2학기, 11월 말 기준
    return new Date(ay - 1, 10, 24); // 11월 24일
  } else {
    // 현재 2학기 → 이전은 ay년 1학기, 6월 말 기준
    return new Date(ay, 5, 23); // 6월 23일
  }
}

/** 주어진 월요일 기준 월~금 Date 배열 */
function weekDatesFrom(mon: Date): Date[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** dayIndex 0=월 … 4=금, periodNo 1-7 */
export type TimetableGrid = Record<number, Record<number, string>>;

export interface UseTimeTableReturn {
  grid:       TimetableGrid;
  weekDates:  Date[];      // 실제 표시 중인 주 월~금
  maxPeriod:  number;
  isLoading:  boolean;
  error:      string | null;
  isFallback: boolean;     // 과거 데이터를 표시 중
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hook
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function useTimeTable(
  grade:   number,
  classNm: number,
  monday:  Date,
): UseTimeTableReturn {
  const [grid,       setGrid]       = useState<TimetableGrid>({});
  const [displayMon, setDisplayMon] = useState<Date>(monday);
  const [isFallback, setIsFallback] = useState(false);
  const [isLoading,  setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    setGrid({});
    setDisplayMon(new Date(monday)); // 요청한 주로 즉시 리셋
    setLoading(true);
    setError(null);
    setIsFallback(false);

    const controller = new AbortController();

    /** 한 주(월~금) 5일치 fetch → { g, hasData } */
    async function fetchWeek(mon: Date): Promise<{ g: TimetableGrid; hasData: boolean }> {
      const { ay, sem } = getAySem(mon);
      const days = weekDatesFrom(mon);

      const fetchDay = async (d: Date, dayIdx: number) => {
        const url =
          `https://open.neis.go.kr/hub/misTimetable` +
          `?KEY=${API_KEY}&Type=json` +
          `&ATPT_OFCDC_SC_CODE=${ATPT_CODE}` +
          `&SD_SCHUL_CODE=${SCHUL_CODE}` +
          `&AY=${ay}&SEM=${sem}` +
          `&GRADE=${grade}&CLASS_NM=${classNm}` +
          `&ALL_TI_YMD=${dateToYmd(d)}`;

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

    async function findAndLoad() {
      const startMon = getMondayOf(new Date(monday));

      // ── Step 1: 요청한 주 시도 ────────────────────────────
      const currentResult = await fetchWeek(startMon);
      if (currentResult.hasData) {
        setGrid(currentResult.g);
        setDisplayMon(new Date(startMon));
        setIsFallback(false);
        return;
      }

      // ── Step 2: 이전 학기 앵커부터 8주 치 병렬 탐색 ──────
      const anchor = getMondayOf(prevSemesterAnchor(monday));
      const candidateMondays: Date[] = Array.from({ length: 8 }, (_, i) => {
        const d = new Date(anchor);
        d.setDate(anchor.getDate() - i * 7);
        return d;
      });

      const parallelResults = await Promise.all(
        candidateMondays.map(async (mon) => ({
          mon,
          ...(await fetchWeek(mon)),
        })),
      );

      // 가장 최근(앞쪽) 주 중 데이터가 있는 것을 선택
      for (const { mon, g, hasData } of parallelResults) {
        if (hasData) {
          setGrid(g);
          setDisplayMon(new Date(mon));
          setIsFallback(true);
          return;
        }
      }

      // 모든 탐색 실패 → 빈 상태
      setGrid({});
      setDisplayMon(new Date(startMon));
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
