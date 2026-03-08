/**
 * SchoolInfoCard — 학교 기본정보 카드
 * ──────────────────────────────────────────────────────────────
 * NEIS schoolInfo API 데이터를 받아 주소·연락처·설립정보 등을 표시
 */

import React from 'react';
import { MapPin, Phone, Globe, Calendar, Building2, GraduationCap } from 'lucide-react';
import { useSchoolInfo } from '../hooks/useSchoolInfo';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 로딩 스켈레톤
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const Skeleton = () => (
  <div className="animate-pulse space-y-3">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-slate-100 rounded-xl shrink-0" />
      <div className="space-y-1.5">
        <div className="h-4 bg-slate-200 rounded w-32" />
        <div className="h-3 bg-slate-100 rounded w-48" />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2 pt-1">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-4 bg-slate-100 rounded" />
      ))}
    </div>
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 서브 컴포넌트: 정보 행
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}

const InfoRow = ({ icon, label, value, href }: InfoRowProps) => (
  <div className="flex items-start gap-2 text-sm">
    <span className="text-slate-400 shrink-0 mt-0.5">{icon}</span>
    <div className="min-w-0">
      <span className="text-xs text-slate-400 block leading-none mb-0.5">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline break-all leading-snug"
        >
          {value}
        </a>
      ) : (
        <span className="text-slate-700 break-all leading-snug">{value}</span>
      )}
    </div>
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SchoolInfoCard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const SchoolInfoCard = () => {
  const { info, isLoading, error } = useSchoolInfo();

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

      {/* ── 헤더 ─────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-50 text-blue-500 rounded-lg flex items-center justify-center shrink-0">
          <GraduationCap size={16} />
        </div>
        <span className="font-bold text-slate-800 text-sm">학교 기본정보</span>
      </div>

      {/* ── 본문 ─────────────────────────────────────────────── */}
      <div className="px-5 py-4">
        {isLoading && <Skeleton />}

        {!isLoading && error && (
          <p className="text-sm text-slate-400">{error}</p>
        )}

        {!isLoading && !error && info && (
          <div className="space-y-4">

            {/* 학교명 + 배지 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold text-slate-900">{info.name}</span>
              <span className="text-xs text-slate-500 font-medium">{info.engName}</span>
              <div className="flex gap-1 flex-wrap">
                {[info.type, info.foundation, info.coedu].filter(Boolean).map(tag => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium border border-blue-100"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* 상세 정보 그리드 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <InfoRow
                icon={<MapPin size={14} />}
                label="주소"
                value={info.address}
              />
              <InfoRow
                icon={<Phone size={14} />}
                label="전화"
                value={info.tel}
                href={`tel:${info.tel}`}
              />
              <InfoRow
                icon={<Globe size={14} />}
                label="홈페이지"
                value="학교 공식 홈페이지"
                href={info.website}
              />
              <InfoRow
                icon={<Phone size={14} />}
                label="팩스"
                value={info.fax}
              />
              <InfoRow
                icon={<Calendar size={14} />}
                label="설립일"
                value={info.foundedDate}
              />
              <InfoRow
                icon={<Calendar size={14} />}
                label="개교기념일"
                value={info.anniversary}
              />
              <InfoRow
                icon={<Building2 size={14} />}
                label="관할기관"
                value={info.supervisory}
              />
              <InfoRow
                icon={<Building2 size={14} />}
                label="교육청"
                value={info.office}
              />
            </div>

          </div>
        )}
      </div>
    </div>
  );
};
