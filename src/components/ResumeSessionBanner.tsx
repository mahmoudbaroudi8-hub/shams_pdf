import React from 'react';
import { BatchSession } from '../types';
import { AlertCircle, Play, X, RefreshCw, Layers } from 'lucide-react';

interface ResumeSessionBannerProps {
  session: BatchSession;
  onResume: (session: BatchSession) => void;
  onDismiss: (sessionId: string) => void;
}

export const ResumeSessionBanner: React.FC<ResumeSessionBannerProps> = ({
  session,
  onResume,
  onDismiss,
}) => {
  const completedBatches = session.batches.filter((b) => b.status === 'completed').length;
  const totalBatches = session.batches.length;
  const pendingOrFailed = totalBatches - completedBatches;

  return (
    <div
      dir="rtl"
      className="bg-gradient-to-r from-amber-50 via-white to-amber-50 border-b border-amber-200 px-4 py-3.5 shadow-xs"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-300">
            <AlertCircle size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 text-sm">
                عندك شغل ناقص: {pendingOrFailed} من أصل {totalBatches} دفعة
              </span>
              <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold px-2 py-0.5 rounded-full font-mono">
                {session.file_name}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              تم إنجاز {completedBatches} دفعة ({session.total_products_extracted} منتج محفوظة بالمتصفح). يمكنك الاستكمال فوراً من أول دفعة ناقصة.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => onDismiss(session.id)}
            className="flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <X size={14} />
            <span>الغي</span>
          </button>
          <button
            onClick={() => onResume(session)}
            className="flex-1 sm:flex-none px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm shadow-amber-600/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Play size={14} className="fill-current" />
            <span>كمّل الشغل الآن</span>
          </button>
        </div>
      </div>
    </div>
  );
};
