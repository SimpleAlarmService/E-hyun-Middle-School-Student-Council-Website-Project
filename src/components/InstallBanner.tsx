/**
 * EHSC Connect — PWA 설치 배너
 * ──────────────────────────────────────────────────────────────
 *
 * 두 가지 모드로 동작합니다.
 *
 * [모드 1] 자동 설치 프롬프트 (beforeinstallprompt 지원 브라우저)
 *   - Google Chrome, Microsoft Edge, Brave, Opera, Samsung Internet
 *   - "설치" 버튼 클릭 → 브라우저 기본 설치 다이얼로그 표시
 *
 * [모드 2] 수동 설치 안내 (beforeinstallprompt 미지원 브라우저)
 *   - LineageOS 기본 브라우저, Firefox 등 Android 브라우저
 *   - "방법 보기" 버튼 클릭 → 메뉴 → 홈 화면에 추가 안내 표시
 *   - (iOS Safari는 완전히 다른 흐름이므로 제외)
 *
 * 운영 참고:
 *   - DISMISSED_KEY 값을 바꾸면 배너 표시 여부가 초기화됩니다.
 */

import { useState, useEffect } from 'react';
import { Download, X, Menu } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

const DISMISSED_KEY = 'ehsc-pwa-install-dismissed-v2';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Android 기기인지 판별 (iOS 제외) */
function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

/** 이미 standalone 모드(설치된 앱)로 실행 중인지 판별 */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
  );
}

export const InstallBanner = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed]           = useState(false);
  const [installed, setInstalled]           = useState(false);
  const [showManual, setShowManual]         = useState(false); // 수동 안내 모달
  /** beforeinstallprompt 없는 Android → 수동 안내 모드 */
  const [manualMode, setManualMode]         = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === '1');
  }, []);

  useEffect(() => {
    // 이미 설치된 앱으로 실행 중이면 배너 불필요
    if (isStandalone()) { setInstalled(true); return; }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setManualMode(false);
    };
    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    // beforeinstallprompt가 300ms 내에 오지 않으면 → Android이면 수동 안내 모드
    const timer = setTimeout(() => {
      if (!deferredPrompt && isAndroid()) setManualMode(true);
    }, 300);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const isVisible =
    !dismissed && !installed &&
    (!!deferredPrompt || manualMode);

  return (
    <>
      {/* ── 설치 배너 ── */}
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
                {deferredPrompt ? (
                  /* 자동 프롬프트 지원 브라우저 */
                  <button
                    onClick={handleInstall}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700
                               text-white text-xs font-semibold rounded-lg
                               transition-colors focus:outline-none focus-visible:ring-2
                               focus-visible:ring-blue-500"
                  >
                    설치
                  </button>
                ) : (
                  /* 수동 안내 모드 (LineageOS 등) */
                  <button
                    onClick={() => setShowManual(true)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700
                               text-white text-xs font-semibold rounded-lg
                               transition-colors focus:outline-none focus-visible:ring-2
                               focus-visible:ring-blue-500"
                  >
                    방법 보기
                  </button>
                )}
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

      {/* ── 수동 설치 안내 모달 (LineageOS 등 지원) ── */}
      <AnimatePresence>
        {showManual && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center
                       bg-black/40 px-4 pb-6"
            onClick={() => setShowManual(false)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-800">홈 화면에 추가하는 방법</h2>
                <button
                  onClick={() => setShowManual(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
                  aria-label="닫기"
                >
                  <X size={16} />
                </button>
              </div>

              <ol className="space-y-3 text-sm text-slate-700">
                <li className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white
                                   flex items-center justify-center text-xs font-bold">1</span>
                  <span>
                    브라우저 오른쪽 상단의{' '}
                    <Menu size={13} className="inline mb-0.5" />{' '}
                    <strong>메뉴 버튼</strong>을 누르세요.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white
                                   flex items-center justify-center text-xs font-bold">2</span>
                  <span>
                    <strong>"홈 화면에 추가"</strong> 또는{' '}
                    <strong>"앱 설치"</strong> 항목을 선택하세요.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white
                                   flex items-center justify-center text-xs font-bold">3</span>
                  <span>
                    <strong>"추가"</strong> 또는 <strong>"설치"</strong>를 눌러 완료하세요.
                  </span>
                </li>
              </ol>

              <p className="mt-4 text-xs text-slate-400">
                브라우저 종류에 따라 메뉴 이름이 조금 다를 수 있어요.
              </p>

              <button
                onClick={() => { setShowManual(false); handleDismiss(); }}
                className="mt-4 w-full py-2.5 bg-slate-100 hover:bg-slate-200
                           text-slate-700 text-sm font-medium rounded-xl transition-colors"
              >
                확인했어요
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
