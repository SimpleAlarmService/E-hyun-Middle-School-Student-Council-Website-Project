/**
 * useSchoolInfo — NEIS 학교기본정보 API 연동 훅
 * ──────────────────────────────────────────────────────────────
 *
 * API: https://open.neis.go.kr/hub/schoolInfo
 * 학교: 이현중학교 (경기도 용인시 수지구)
 *  - ATPT_OFCDC_SC_CODE : J10
 *  - SD_SCHUL_CODE      : 7751035
 *
 * 학교 기본정보는 거의 변하지 않으므로 컴포넌트 마운트 시 1회만 요청.
 */

import { useState, useEffect } from 'react';

const API_KEY    = '158eceb37c064b518eebf12f515ac7a8';
const ATPT_CODE  = 'J10';
const SCHUL_CODE = '7751035';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SchoolInfo {
  name:        string;   // 이현중학교
  engName:     string;   // E-Hyun Middle School
  type:        string;   // 중학교
  foundation:  string;   // 공립
  coedu:       string;   // 남여공학
  address:     string;   // 경기도 용인시 수지구 진산로34번길 39
  tel:         string;   // 031-266-8032
  fax:         string;   // 031-266-8036
  website:     string;   // https://...
  foundedDate: string;   // 2002.01.14
  anniversary: string;   // 2002.06.07
  supervisory: string;   // 경기도용인교육지원청
  office:      string;   // 경기도교육청
}

/** "YYYYMMDD" → "YYYY.MM.DD" */
function formatYmd(ymd: string): string {
  if (!ymd || ymd.length < 8) return ymd;
  return `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hook
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UseSchoolInfoReturn {
  info:      SchoolInfo | null;
  isLoading: boolean;
  error:     string | null;
}

export function useSchoolInfo(): UseSchoolInfoReturn {
  const [info,      setInfo]    = useState<SchoolInfo | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error,     setError]   = useState<string | null>(null);

  useEffect(() => {
    const url =
      `https://open.neis.go.kr/hub/schoolInfo` +
      `?KEY=${API_KEY}` +
      `&Type=json` +
      `&ATPT_OFCDC_SC_CODE=${ATPT_CODE}` +
      `&SD_SCHUL_CODE=${SCHUL_CODE}`;

    const controller = new AbortController();

    fetch(url, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`서버 오류 (HTTP ${res.status})`);
        return res.json();
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((json: any) => {
        const outer = json?.schoolInfo;
        if (!outer) throw new Error('데이터 없음');

        const row = outer.find((o: any) => Array.isArray(o.row))?.row?.[0];
        if (!row) throw new Error('학교 정보 없음');

        setInfo({
          name:        row.SCHUL_NM        ?? '',
          engName:     row.ENG_SCHUL_NM    ?? '',
          type:        row.SCHUL_KND_SC_NM ?? '',
          foundation:  row.FOND_SC_NM      ?? '',
          coedu:       row.COEDU_SC_NM     ?? '',
          address:     row.ORG_RDNMA       ?? '',
          tel:         row.ORG_TELNO       ?? '',
          fax:         row.ORG_FAXNO       ?? '',
          website:     row.HMPG_ADRES      ?? '',
          foundedDate: formatYmd(row.FOND_YMD   ?? ''),
          anniversary: formatYmd(row.FOAS_MEMRD ?? ''),
          supervisory: row.JU_ORG_NM       ?? '',
          office:      row.ATPT_OFCDC_SC_NM ?? '',
        });
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        console.warn('[useSchoolInfo] fetch failed:', err);
        setError('학교 정보를 불러올 수 없습니다.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  return { info, isLoading, error };
}
