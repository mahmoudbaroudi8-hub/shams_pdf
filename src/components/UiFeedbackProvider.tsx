import React, { createContext, useCallback, useContext, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Info,
  X,
  XCircle,
} from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface ExternalLinkOptions {
  title: string;
  description?: string;
  url: string;
  actionLabel?: string;
}

interface UiFeedbackContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
  };
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  openExternalLink: (options: ExternalLinkOptions) => void;
}

const UiFeedbackContext = createContext<UiFeedbackContextValue | null>(null);

export const UiFeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);
  const [externalLinkState, setExternalLinkState] = useState<ExternalLinkOptions | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const pushToast = useCallback((variant: ToastVariant, message: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, variant, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (message: string) => pushToast('success', message),
    error: (message: string) => pushToast('error', message),
    warning: (message: string) => pushToast('warning', message),
    info: (message: string) => pushToast('info', message),
  };

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ options, resolve });
    });
  }, []);

  const handleConfirmDecision = (accepted: boolean) => {
    if (!confirmState) return;
    const { resolve } = confirmState;
    setConfirmState(null);
    resolve(accepted);
  };

  const openExternalLink = useCallback((options: ExternalLinkOptions) => {
    setCopiedLink(false);
    setExternalLinkState(options);
  }, []);

  const handleCopyLink = async () => {
    if (!externalLinkState?.url) return;
    try {
      await navigator.clipboard.writeText(externalLinkState.url);
      setCopiedLink(true);
      pushToast('success', 'تم نسخ الرابط بنجاح.');
    } catch {
      pushToast('warning', 'تعذر نسخ الرابط تلقائياً، يمكنك استخدام زر الفتح مباشرة.');
    }
  };

  return (
    <UiFeedbackContext.Provider value={{ toast, confirm, openExternalLink }}>
      {children}

      {/* Non-blocking RTL Toast Stack */}
      <div
        dir="rtl"
        className="fixed bottom-20 sm:bottom-5 left-4 right-4 sm:right-auto sm:left-5 z-100 flex flex-col gap-2 max-w-md pointer-events-none"
      >
        {toasts.map((t) => {
          const styles =
            t.variant === 'success'
              ? 'bg-emerald-950/95 border-emerald-700 text-emerald-50'
              : t.variant === 'error'
              ? 'bg-rose-950/95 border-rose-700 text-rose-50'
              : t.variant === 'warning'
              ? 'bg-amber-950/95 border-amber-700 text-amber-50'
              : 'bg-slate-900/95 border-slate-700 text-slate-50';

          const Icon =
            t.variant === 'success'
              ? CheckCircle2
              : t.variant === 'error'
              ? XCircle
              : t.variant === 'warning'
              ? AlertTriangle
              : Info;

          const iconColor =
            t.variant === 'success'
              ? 'text-emerald-400'
              : t.variant === 'error'
              ? 'text-rose-400'
              : t.variant === 'warning'
              ? 'text-amber-400'
              : 'text-sky-400';

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-2xl border shadow-xl backdrop-blur-sm text-xs font-semibold leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-150 ${styles}`}
            >
              <Icon size={17} className={`shrink-0 mt-0.5 ${iconColor}`} />
              <span className="flex-1 whitespace-pre-line">{t.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="opacity-70 hover:opacity-100 p-0.5 rounded cursor-pointer shrink-0"
                aria-label="إغلاق التنبيه"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal */}
      {confirmState && (
        <div
          dir="rtl"
          className="fixed inset-0 z-110 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div
              className={`px-5 py-4 border-b flex items-center gap-3 ${
                confirmState.options.danger
                  ? 'bg-rose-50 border-rose-100 text-rose-950'
                  : 'bg-amber-50 border-amber-100 text-amber-950'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  confirmState.options.danger
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                <AlertTriangle size={18} />
              </div>
              <h3 className="font-bold text-sm">{confirmState.options.title}</h3>
            </div>

            <div className="p-5">
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {confirmState.options.message}
              </p>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleConfirmDecision(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                {confirmState.options.cancelLabel || 'إلغاء'}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDecision(true)}
                className={`px-5 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition-colors cursor-pointer ${
                  confirmState.options.danger
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-sky-600 hover:bg-sky-700'
                }`}
              >
                {confirmState.options.confirmLabel || 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safe External Link Modal (iFrame-compatible) */}
      {externalLinkState && (
        <div
          dir="rtl"
          className="fixed inset-0 z-110 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-100 bg-emerald-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-emerald-950">
                <ExternalLink size={18} className="text-emerald-700" />
                <h3 className="font-bold text-sm">{externalLinkState.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setExternalLinkState(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {externalLinkState.description && (
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                  {externalLinkState.description}
                </p>
              )}

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-mono text-slate-600 break-all max-h-24 overflow-y-auto" dir="ltr">
                {externalLinkState.url}
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
              >
                <Copy size={14} />
                <span>{copiedLink ? 'تم النسخ' : 'نسخ الرابط'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExternalLinkState(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
                >
                  إغلاق
                </button>
                <a
                  href={externalLinkState.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setExternalLinkState(null)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
                >
                  <ExternalLink size={14} />
                  <span>{externalLinkState.actionLabel || 'فتح الرابط الآن'}</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </UiFeedbackContext.Provider>
  );
};

export function useUiFeedback(): UiFeedbackContextValue {
  const ctx = useContext(UiFeedbackContext);
  if (!ctx) {
    throw new Error('useUiFeedback must be used within a UiFeedbackProvider');
  }
  return ctx;
}
