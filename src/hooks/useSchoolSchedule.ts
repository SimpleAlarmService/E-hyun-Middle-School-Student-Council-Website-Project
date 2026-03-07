/**
 * useSchoolSchedule — NEIS 학사일정 API 연동 훅
 * ──────────────────────────────────────────────────────────────
 *
 * API: https://open.neis.go.kr/hub/SchoolSchedule
 * 학교: 이현중학교 (J10 / 7751035)
 *
 * - 요청한 년·월의 학사일정을 fetch
 * - 토요휴업일 등 단순 휴업 항목은 필터링
 * - 연속된 동일 행사명은 날짜 범위로 묶어 반환
 */

import { useState, useEffect } from 'react';

const API_KEY    = '1f7460c79d28466197ebc84c86b7328b';
const ATPT_CODE  = 'J10';
const SCHUL_CODE = '7751035';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** SBTR_DD_SC_NM 분류 */
export type EventType =
  | '공휴일'
  | '휴업일'   // 방학 등
  | '행사'
  | '기타';

export interface ScheduleEvent {
  /** 시작일 YYYYMMDD */
  startYmd: string;
  /** 종료일 YYYYMMDD (단일 날 = startYmd와 동일) */
  endYmd:   string;
  /** 행사명 */
  name:     string;
  /** 상세 내용 */
  content:  string;
  /** 분류 */
  type:     EventType;
  /** 해당 학년 배열 (빈 배열 = 전학년) */
  grades:   string[];
}

export interface UseSchoolScheduleReturn {
  events:    ScheduleEvent[];
  isLoading: boolean;
  error:     string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 유틸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** "YYYYMMDD" → month padded last day (for API range) */
function lastDayOfMonth(year: number, month: number): string {
  // month 0-indexed
  const last = new Date(year, month + 1, 0).getDate();
  return `${year}${String(month + 1).padStart(2, '0')}${String(last).padStart(2, '0')}`;
}

function firstDayOfMonth(year: number, month: number): string {
  return `${year}${String(month + 1).padStart(2, '0')}01`;
}

/** SBTR_DD_SC_NM → EventType */
function toEventType(sc: string): EventType {
  if (sc === '공휴일')                    return '공휴일';
  if (sc === '휴업일')                    return '휴업일';
  if (sc === '해당없음' || sc === '')     return '행사';
  return '기타';
}

/** 필터: 학사일정에서 제외할 단순 행정 항목 */
const SKIP_NAMES = new Set(['토요휴업일', '정기휴업일', '일요일']);

/** 해당 학년 파싱 */
function parseGrades(r: Record<string, string>): string[] {
  const map: [string, string][] = [
    ['ONE_GRADE_EVENT_YN',   '1'],
    ['TW_GRADE_EVENT_YN',    '2'],
    ['THREE_GRADE_EVENT_YN', '3'],
  ];
  const result = map
    .filter(([k]) => r[k] === 'Y')
    .map(([, v]) => v);
  // 전체 학년이면 빈 배열 반환
  return result.length === 3 ? [] : result;
}

/**
 * 연속된 동일 EVENT_NM을 하나의 범위 이벤트로 묶기
 * (예: 겨울방학 45일치 → 1건)
 */
function groupConsecutive(
  raw: Array<{ ymd: string; name: string; content: string; type: EventType; grades: string[] }>,
): ScheduleEvent[] {
  const result: ScheduleEvent[] = [];
  let cur: ScheduleEvent | null = null;

  for (const item of raw) {
    if (cur && cur.name === item.name) {
      cur.endYmd = item.ymd;
    } else {
      if (cur) result.push(cur);
      cur = {
        startYmd: item.ymd,
        endYmd:   item.ymd,
        name:     item.name,
        content:  item.content,
        type:     item.type,
        grades:   item.grades,
      };
    }
  }
  if (cur) result.push(cur);
  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hook
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function useSchoolSchedule(
  year:  number,   // 표시할 연도 (예: 2026)
  month: number,   // 표시할 월 0-indexed (0=1월 … 11=12월)
): UseSchoolScheduleReturn {
  const [events,    setEvents]   = useState<ScheduleEvent[]>([]);
  const [isLoading, setLoading]  = useState(true);
  const [error,     setError]    = useState<string | null>(null);

  useEffect(() => {
    setEvents([]);
    setLoading(true);
    setError(null);

    const controller = new AbortController();

    async function fetchSchedule(ay: number) {
      const from = firstDayOfMonth(year, month);
      const to   = lastDayOfMonth(year, month);

      const url =
        `https://open.neis.go.kr/hub/SchoolSchedule` +
        `?KEY=${API_KEY}&Type=json` +
        `&ATPT_OFCDC_SC_CODE=${ATPT_CODE}` +
        `&SD_SCHUL_CODE=${SCHUL_CODE}` +
        `&AY=${ay}` +
        `&AA_FROM_YMD=${from}&AA_TO_YMD=${to}` +
        `&pSize=200`;

      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json: any = await res.json();

      const outer = json?.SchoolSchedule;
      if (!outer) return [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const head = outer.find((o: any) => Array.isArray(o.head));
      const code: string = head?.head?.[1]?.RESULT?.CODE ?? '';
      if (code === 'INFO-200') return [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = outer.find((o: any) => Array.isArray(o.row))?.row ?? [];
      return rows;
    }

    async function load() {
      // 학년도: 3월 이후면 해당 연도, 1-2월이면 전년도
      const ay = month >= 2 ? year : year - 1;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rows: any[] = await fetchSchedule(ay);

      // 데이터 없으면 반대 학년도 시도 (학교마다 등록 방식 다를 수 있음)
      if (rows.length === 0) {
        rows = await fetchSchedule(ay + 1);
      }

      const raw = rows
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((r: any) => !SKIP_NAMES.has(r.EVENT_NM))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => ({
          ymd:     r.AA_YMD as string,
          name:    r.EVENT_NM as string,
          content: r.EVENT_CNTNT as string,
          type:    toEventType(r.SBTR_DD_SC_NM),
          grades:  parseGrades(r),
        }));

      setEvents(groupConsecutive(raw));
    }

    load()
      .catch(err => {
        if (err.name === 'AbortError') return;
        console.warn('[useSchoolSchedule]', err);
        setError('학사일정을 불러올 수 없습니다.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [year, month]);

  return { events, isLoading, error };
}
