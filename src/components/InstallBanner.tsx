/**
 * EHSC Connect — PWA 설치 배너
 * ──────────────────────────────────────────────────────────────
 *
 * 브라우저가 PWA 설치 가능 조건을 만족했을 때 화면 하단에 작은 배너를 표시합니다.
 *
 * ✅ 지원 브라우저 (Chromium 기반 전체 — beforeinstallprompt 공통 지원):
 *   - Google Chrome
 *   - Microsoft Edge
 *   - Brave
 *   - Opera
 *   - Samsung Internet
 *   - 기타 Chromium 기반 브라우저
 *
 * ❌ 미지원 (beforeinstallprompt 이벤트 없음):
 *   - iOS Safari → Safari 공유 메뉴 → "홈 화면에 추가" 로 직접 설치
 *   - Firefox
 *
 * 동작 흐름:
 *   1. 브라우저가 beforeinstallprompt 이벤트 발생 → 배너 표시
 *   2. "설치" 버튼 클릭 → 브라우저 설치 프롬프트 실행
 *   3. "×" 닫기 클릭 → localStorage 기록, 이후 방문 미표시
 *   4. appinstalled 이벤트 발생 → 배너 자동 제거
 *
 * 운영 참고:
 *   - DISMISSED_KEY 값을 바꾸면 배너 표시 여부가 초기화됩니다.
 */

import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

// localStorage 키 — 버전을 바꾸면 닫았던 사용자에게도 다시 표시됩니다.
const DISMISSED_KEY = 'ehsc-pwa-install-dismissed-v1';

// BeforeInstallPromptEvent 타입 (TypeScript 공식 타입 없음)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallBanner = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [installed, setInstalled] = useState(false);

  // localStorage는 SSR 환경 대비 useEffect 내부에서 읽습니다.
  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === '1');
  }, []);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, '1');
  };

  const isVisible = !!deferredPrompt && !dismissed && !installed;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 88, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 88, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4"
          role="complementary"
          aria-label="앱 설치 안내"
        >
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg
                          flex items-center gap-3 px-4 py-3">
            {/* 아이콘 */}
            <div className="shrink-0 w-9 h-9 bg-blue-50 rounded-lg
                            flex items-center justify-center">
              <Download size={17} className="text-blue-600" aria-hidden="true" />
            </div>

            {/* 텍스트 */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 leading-tight">
                앱으로 설치하기
              </p>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                홈 화면에 추가하면 더 편리하게 이용할 수 있어요
              </p>
            </div>

            {/* 버튼 영역 */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleInstall}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700
                           text-white text-xs font-semibold rounded-lg
                           transition-colors focus:outline-none focus-visible:ring-2
                           focus-visible:ring-blue-500"
              >
                설치
              </button>
              <button
                onClick={handleDismiss}
                className="p-1.5 text-slate-400 hover:text-slate-600
                           transition-colors rounded-md
                           focus:outline-none focus-visible:ring-2
                           focus-visible:ring-slate-400"
                aria-label="설치 안내 닫기"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
