import React, { useEffect, useState, useRef } from 'react';
import {
  FileText,
  Download,
  X,
  ZoomIn,
  ZoomOut,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  AlertCircle,
  Maximize2,
  Layers,
} from 'lucide-react';
import { loadPdfDocument } from '../utils/pdfExtractor';

interface PdfBlobPreviewModalProps {
  isOpen: boolean;
  pdfBlob: Blob | null;
  title?: string;
  downloadFilename?: string;
  onClose: () => void;
}

interface RenderedPdfPage {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

export const PdfBlobPreviewModal: React.FC<PdfBlobPreviewModalProps> = ({
  isOpen,
  pdfBlob,
  title = 'معاينة ملف الـ PDF الناتج',
  downloadFilename = 'كتالوج_الأسعار.pdf',
  onClose,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [renderedPages, setRenderedPages] = useState<RenderedPdfPage[]>([]);
  const [renderProgress, setRenderProgress] = useState(0);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [viewMode, setViewMode] = useState<'scroll' | 'single'>('scroll');
  const [currentPage, setCurrentPage] = useState(1);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const pdfDocRef = useRef<any>(null);

  // Create safe download URL whenever pdfBlob changes
  useEffect(() => {
    if (!pdfBlob) {
      setBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(pdfBlob);
    setBlobUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [pdfBlob]);

  // Load & render PDF pages using PDF.js onto images (works reliably on mobile, PWA & iframes)
  useEffect(() => {
    if (!isOpen || !pdfBlob) {
      setRenderedPages([]);
      setTotalPages(0);
      setError(null);
      setRenderProgress(0);
      return;
    }

    let cancelled = false;

    const loadAndRender = async () => {
      setIsLoading(true);
      setError(null);
      setRenderedPages([]);
      setCurrentPage(1);
      setRenderProgress(0);

      try {
        const doc = await loadPdfDocument(pdfBlob);
        if (cancelled) return;
        pdfDocRef.current = doc;

        const numPages = doc.numPages || 0;
        setTotalPages(numPages);

        if (numPages === 0) {
          setError('ملف الـ PDF لا يحتوي على صفحات.');
          setIsLoading(false);
          return;
        }

        const collected: RenderedPdfPage[] = [];
        // Render crisp 1.5x scale pages progressively so first page appears instantly
        const renderScale = 1.5;

        for (let p = 1; p <= numPages; p++) {
          if (cancelled) return;
          const page = await doc.getPage(p);
          const viewport = page.getViewport({ scale: renderScale });

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(viewport.width));
          canvas.height = Math.max(1, Math.round(viewport.height));
          const ctx = canvas.getContext('2d');

          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({
              canvasContext: ctx,
              viewport,
              background: '#ffffff',
            }).promise;
          }

          if (cancelled) return;

          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          collected.push({
            pageNumber: p,
            dataUrl,
            width: canvas.width,
            height: canvas.height,
          });

          canvas.width = 1;
          canvas.height = 1;

          setRenderedPages([...collected]);
          setRenderProgress(Math.round((p / numPages) * 100));
          if (p === 1) {
            setIsLoading(false);
          }

          await new Promise((r) => setTimeout(r, 12));
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'تعذر فتح معاينة الـ PDF. يمكنك تنزيل الملف مباشرة.');
          setIsLoading(false);
        }
      }
    };

    loadAndRender();

    return () => {
      cancelled = true;
    };
  }, [isOpen, pdfBlob]);

  if (!isOpen || !pdfBlob) return null;

  const fileSizeKb = Math.round(pdfBlob.size / 1024);
  const fileSizeLabel =
    fileSizeKb >= 1024 ? `${(fileSizeKb / 1024).toFixed(1)} MB` : `${fileSizeKb} KB`;

  const visiblePages =
    viewMode === 'single'
      ? renderedPages.filter((p) => p.pageNumber === currentPage)
      : renderedPages;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-2 sm:p-4 print:hidden"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl max-w-5xl w-full h-[94vh] sm:h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Top Toolbar */}
        <div className="px-3 sm:px-5 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={18} className="text-orange-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-extrabold text-xs sm:text-sm truncate">{title}</h3>
              <p className="text-[10px] text-slate-300">
                {totalPages > 0 ? `${totalPages} صفحة` : 'جاري التحميل...'} • {fileSizeLabel}
                {renderProgress > 0 && renderProgress < 100 ? ` • تحميل الصفحات ${renderProgress}%` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* View mode toggle */}
            {totalPages > 1 && (
              <button
                type="button"
                onClick={() => setViewMode((m) => (m === 'scroll' ? 'single' : 'scroll'))}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold rounded-lg border border-slate-700 cursor-pointer"
                title="تبديل طريقة العرض"
              >
                {viewMode === 'scroll' ? <Maximize2 size={13} /> : <Layers size={13} />}
                <span className="hidden sm:inline">
                  {viewMode === 'scroll' ? 'صفحة واحدة' : 'كل الصفحات'}
                </span>
              </button>
            )}

            {/* Zoom controls */}
            <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
              <button
                type="button"
                onClick={() => setZoomPercent((z) => Math.max(50, z - 15))}
                className="p-1.5 hover:bg-slate-700 text-slate-200 cursor-pointer"
                title="تصغير"
              >
                <ZoomOut size={14} />
              </button>
              <span className="px-2 text-[11px] font-mono font-bold text-slate-100 min-w-[44px] text-center">
                {zoomPercent}%
              </span>
              <button
                type="button"
                onClick={() => setZoomPercent((z) => Math.min(180, z + 15))}
                className="p-1.5 hover:bg-slate-700 text-slate-200 cursor-pointer"
                title="تكبير"
              >
                <ZoomIn size={14} />
              </button>
            </div>

            {blobUrl && (
              <a
                href={blobUrl}
                download={downloadFilename}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-lg transition-colors"
              >
                <Download size={14} />
                <span>تنزيل PDF</span>
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              <X size={14} />
              <span className="hidden sm:inline">إغلاق</span>
            </button>
          </div>
        </div>

        {/* Single-Page Navigator Bar */}
        {viewMode === 'single' && totalPages > 1 && (
          <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-center gap-3 text-xs shrink-0">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="flex items-center gap-1 px-3 py-1 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight size={14} />
              السابقة
            </button>
            <span className="font-extrabold text-slate-800">
              صفحة {currentPage} من {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="flex items-center gap-1 px-3 py-1 bg-white border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              التالية
              <ChevronLeft size={14} />
            </button>
          </div>
        )}

        {/* Viewer Viewport */}
        <div className="flex-1 bg-slate-200/90 overflow-auto p-3 sm:p-6">
          {error ? (
            <div className="max-w-md mx-auto my-12 bg-white border border-red-200 rounded-2xl p-6 text-center space-y-4 shadow-sm">
              <AlertCircle size={34} className="text-red-500 mx-auto" />
              <div className="space-y-1">
                <h4 className="font-extrabold text-slate-800 text-sm">تعذر عرض المعاينة التفاعلية</h4>
                <p className="text-xs text-slate-600 leading-relaxed">{error}</p>
              </div>
              {blobUrl && (
                <a
                  href={blobUrl}
                  download={downloadFilename}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl"
                >
                  <Download size={15} />
                  تنزيل ملف الـ PDF مباشرة
                </a>
              )}
            </div>
          ) : isLoading && renderedPages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-3">
              <RefreshCw size={28} className="animate-spin text-orange-600" />
              <p className="text-xs font-bold">جاري تجهيز صفحات الـ PDF للمعاينة...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-5">
              {visiblePages.map((pg) => (
                <div
                  key={pg.pageNumber}
                  className="bg-white shadow-lg border border-slate-300 rounded-md overflow-hidden transition-all"
                  style={{
                    width: `min(100%, ${Math.round((760 * zoomPercent) / 100)}px)`,
                  }}
                >
                  <div className="px-3 py-1 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-600">
                    <span>صفحة {pg.pageNumber}</span>
                    <span className="text-slate-400">A4</span>
                  </div>
                  <img
                    src={pg.dataUrl}
                    alt={`صفحة ${pg.pageNumber}`}
                    className="w-full h-auto block bg-white"
                  />
                </div>
              ))}

              {renderProgress > 0 && renderProgress < 100 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-white/90 rounded-full border border-slate-300 text-xs font-bold text-slate-700 shadow-xs">
                  <RefreshCw size={13} className="animate-spin text-orange-600" />
                  <span>جاري تحميل باقي الصفحات ({renderedPages.length}/{totalPages})...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
