import React, { useMemo, useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, Laptop, X, Share, MoreVertical, PlusSquare } from 'lucide-react';

type DevicePlatform = 'ios' | 'android' | 'desktop';

interface PWAInstallButtonProps {
  compactMobile?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compactMobile = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showInstallModal, setShowInstallModal] = useState(false);

  const detectedPlatform: DevicePlatform = useMemo(() => {
    if (isIOS) return 'ios';
    if (typeof window !== 'undefined' && /android/i.test(window.navigator.userAgent)) {
      return 'android';
    }
    return 'desktop';
  }, [isIOS]);

  const [selectedGuideTab, setSelectedGuideTab] = useState<DevicePlatform>(detectedPlatform);

  // If already installed and running standalone, hide install button
  if (isInstalled) {
    return null;
  }

  // Direct 1-click native installation when supported (Chrome / Edge / Android / Windows / Mac)
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[38px] rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer animate-in fade-in shrink-0 ${
          compactMobile ? 'px-2.5 sm:px-3 py-1.5' : 'px-3 py-1.5'
        }`}
        title="تثبيت التطبيق على جهازك للعمل كتطبيق مستقل"
        aria-label="تثبيت التطبيق"
      >
        <Download size={15} />
        <span className={compactMobile ? 'hidden sm:inline' : ''}>تثبيت التطبيق</span>
      </button>
    );
  }

  // Fallback cross-device install button & guide modal (iOS Safari, macOS Safari, Firefox, or preview frames)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSelectedGuideTab(detectedPlatform);
          setShowInstallModal(true);
        }}
        className={`flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[38px] rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold border border-sky-200 transition-all cursor-pointer shrink-0 ${
          compactMobile ? 'px-2.5 sm:px-3 py-1.5' : 'px-3 py-1.5'
        }`}
        title="تثبيت البرنامج كتطبيق على الكمبيوتر والموبايل"
        aria-label="تثبيت التطبيق"
      >
        <Download size={15} className="text-sky-600" />
        <span className={compactMobile ? 'hidden sm:inline' : ''}>تثبيت التطبيق</span>
      </button>

      {showInstallModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in"
          dir="rtl"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200">
            {/* Header with new App Logo */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-3">
                <img
                  src="/app-logo.png"
                  alt="شعار التطبيق"
                  className="w-11 h-11 rounded-xl shadow-xs object-contain shrink-0"
                />
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900">
                    تثبيت البرنامج على جهازك
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    يعمل كتطبيق مستقل على الهاتف والكمبيوتر
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="إغلاق"
              >
                <X size={18} />
              </button>
            </div>

            {/* Device Selector Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl mb-4 text-xs font-bold">
              <button
                type="button"
                onClick={() => setSelectedGuideTab('desktop')}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all cursor-pointer ${
                  selectedGuideTab === 'desktop'
                    ? 'bg-white text-sky-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Laptop size={14} />
                <span>كمبيوتر</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedGuideTab('android')}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all cursor-pointer ${
                  selectedGuideTab === 'android'
                    ? 'bg-white text-sky-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone size={14} />
                <span>أندرويد</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedGuideTab('ios')}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all cursor-pointer ${
                  selectedGuideTab === 'ios'
                    ? 'bg-white text-sky-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone size={14} />
                <span>آيفون / آيباد</span>
              </button>
            </div>

            {/* Platform Instructions */}
            {selectedGuideTab === 'desktop' && (
              <div className="space-y-2.5 text-xs text-slate-700 leading-relaxed">
                <div className="flex items-start gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    1
                  </span>
                  <p>
                    في متصفح <strong>Chrome</strong> أو <strong>Edge</strong> على Windows أو Mac، افتح رابط التطبيق مباشرة في نافذة متصفح مستقلة.
                  </p>
                </div>
                <div className="flex items-start gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    2
                  </span>
                  <p>
                    اضغط على أيقونة <strong>التثبيت</strong> الموجودة في يمين شريط العنوان بالأعلى، أو افتح القائمة <MoreVertical size={13} className="inline" /> ← <strong>التطبيقات (Apps) / حفظ ومشاركة ← تثبيت</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    3
                  </span>
                  <p>
                    على <strong>Safari (Mac)</strong>: من الشريط العلوي اختر <strong>ملف (File) ← إضافة إلى شريط Dock</strong>.
                  </p>
                </div>
              </div>
            )}

            {selectedGuideTab === 'android' && (
              <div className="space-y-2.5 text-xs text-slate-700 leading-relaxed">
                <div className="flex items-start gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    1
                  </span>
                  <p>
                    افتح رابط التطبيق في متصفح <strong>Google Chrome</strong> أو <strong>Samsung Internet</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    2
                  </span>
                  <p>
                    اضغط على زر القائمة <MoreVertical size={13} className="inline" /> في أعلى المتصفح.
                  </p>
                </div>
                <div className="flex items-start gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    3
                  </span>
                  <p>
                    اختر <strong>"تثبيت التطبيق" (Install App)</strong> أو <strong>"الإضافة إلى الشاشة الرئيسية"</strong> ليظهر بشعار البرنامج على هاتفك.
                  </p>
                </div>
              </div>
            )}

            {selectedGuideTab === 'ios' && (
              <div className="space-y-2.5 text-xs text-slate-700 leading-relaxed">
                <div className="flex items-start gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    1
                  </span>
                  <p>
                    افتح التطبيق في متصفح <strong>Safari</strong> واضغط على زر <strong>المشاركة (Share)</strong>{' '}
                    <Share size={13} className="inline text-sky-600" />.
                  </p>
                </div>
                <div className="flex items-start gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    2
                  </span>
                  <p>
                    مرر للأسفل واختر <strong>"إضافة إلى الشاشة الرئيسية"</strong>{' '}
                    <PlusSquare size={13} className="inline text-sky-600" />.
                  </p>
                </div>
                <div className="flex items-start gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    3
                  </span>
                  <p>
                    اضغط <strong>إضافة (Add)</strong> بالأعلى لتثبيت التطبيق بشعاره مباشرة على الشاشة الرئيسية.
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowInstallModal(false)}
              className="mt-5 w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              فهمت، حسناً
            </button>
          </div>
        </div>
      )}
    </>
  );
};
