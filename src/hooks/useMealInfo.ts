/**
 * useMealInfo — NEIS 급식 Open API 연동 훅
 * ──────────────────────────────────────────────────────────────
 *
 * API: https://open.neis.go.kr/hub/mealServiceDietInfo
 * 학교: 이현중학교 (경기도 용인시 수지구)
 *  - ATPT_OFCDC_SC_CODE : J10       (경기도교육청)
 *  - SD_SCHUL_CODE      : 7751035   (이현중학교)
 */

import { useState, useEffect } from 'react';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 상수 (하드코딩)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const API_KEY    = 'e60eb046cf814298acd33dd2e425bf00';
const ATPT_CODE  = 'J10';
const SCHUL_CODE = '7751035';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MealItem {
  name: string;
}

export interface MealInfo {
  mealType: string;   // "중식" | "조식" | "석식"
  date:     string;   // "YYYYMMDD"
  items:    MealItem[];
  calories: string;   // "652.6" (kcal)
  origin:   string;   // 원산지 정보 전문
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 날짜 유틸 (export — MealCard에서 공유)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Date → "YYYYMMDD" */
export function dateToYmd(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('');
}

/** "YYYYMMDD" → Date (로컬 시간) */
export function ymdToDate(ymd: string): Date {
  return new Date(
    parseInt(ymd.slice(0, 4)),
    parseInt(ymd.slice(4, 6)) - 1,
    parseInt(ymd.slice(6, 8)),
  );
}

/** 오늘 날짜를 "YYYYMMDD"로 반환 */
export function todayYmd(): string {
  return dateToYmd(new Date());
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 파싱 유틸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** DDISH_NM 파싱 — <br/> 또는 , 구분, 알레르기 번호 "(1.2.5)" 제거 */
function parseDishes(raw: string): MealItem[] {
  return raw
    .split(/<br\s*\/?>|,/)
    .map(s => s.replace(/\([\d\s.,]+\)/g, '').trim())
    .filter(s => s.length > 0)
    .map(name => ({ name }));
}

/** NTR_INFO에서 열량(kcal) 추출 */
function parseCalories(ntrInfo: string): string {
  const m = ntrInfo.match(/열량\(Kcal\)\s*[:\s]\s*([\d.]+)/);
  return m ? m[1] : '';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hook
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UseMealInfoReturn {
  meals:     MealInfo[] | null;
  isLoading: boolean;
  error:     string | null;
}

/** ymd: "YYYYMMDD" 형식 날짜. 바뀔 때마다 API 재요청. */
export function useMealInfo(ymd: string): UseMealInfoReturn {
  const [meals,     setMeals]   = useState<MealInfo[] | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error,     setError]   = useState<string | null>(null);

  useEffect(() => {
    setMeals(null);
    setLoading(true);
    setError(null);

    const url =
      `https://open.neis.go.kr/hub/mealServiceDietInfo` +
      `?KEY=${API_KEY}` +
      `&Type=json` +
      `&ATPT_OFCDC_SC_CODE=${ATPT_CODE}` +
      `&SD_SCHUL_CODE=${SCHUL_CODE}` +
      `&MLSV_YMD=${ymd}`;

    const controller = new AbortController();

    fetch(url, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`서버 오류 (HTTP ${res.status})`);
        return res.json();
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((json: any) => {
        const outer = json?.mealServiceDietInfo;
        if (!outer) { setMeals([]); return; }

        const headBlock = outer.find((o: any) => Array.isArray(o.head));
        const resultCode: string = headBlock?.head?.[1]?.RESULT?.CODE ?? '';

        if (resultCode === 'INFO-200') { setMeals([]); return; }
        if (resultCode && !resultCode.startsWith('INFO-000')) {
          throw new Error(`API 오류: ${resultCode}`);
        }

        const rows: any[] = outer.find((o: any) => Array.isArray(o.row))?.row ?? [];
        setMeals(rows.map(row => ({
          mealType: row.MMEAL_SC_NM ?? '',
          date:     row.MLSV_YMD    ?? '',
          items:    parseDishes(row.DDISH_NM  ?? ''),
          calories: parseCalories(row.NTR_INFO ?? ''),
          // <br/> → 줄바꿈으로 변환
          origin:   (row.ORPLC_INFO ?? '').replace(/<br\s*\/?>/gi, '\n'),
        })));
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        console.warn('[useMealInfo] fetch failed:', err);
        setError('급식 정보를 불러올 수 없습니다.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [ymd]);

  return { meals, isLoading, error };
}
