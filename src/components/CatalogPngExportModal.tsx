import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Product, CatalogSettings, SavedCatalog, WatermarkLayer } from '../types';
import { renderCatalogPagesAsPng, RenderedCatalogPagePng } from '../utils/pdfGenerator';
import { zipFilesAndDownload } from '../utils/pdfTools';
import { CropAdjustModal } from './CropAdjustModal';
import { useUiFeedback } from './UiFeedbackProvider';
import {
  X,
  Image as ImageIcon,
  Download,
  FolderArchive,
  Edit3,
  Eye,
  RefreshCw,
  Check,
  Sparkles,
  RotateCcw,
  Layers,
  AlertCircle,
  Images,
  XCircle,
} from 'lucide-react';

interface PngPageItem extends RenderedCatalogPagePng {
  originalDataUrl: string;
  isEdited: boolean;
  filename: string;
}

interface CatalogPngExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings: CatalogSettings;
  onSettingsUpdated?: (settings: CatalogSettings) => void;
  categoryFilter?: string;
  customCatalog?: SavedCatalog;
  totalEstimatedPages?: number;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const parts = dataUrl.split(',');
  const base64 = parts[1] || '';
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function estimateDataUrlKb(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || '';
  const bytes = Math.floor((base64.length * 3) / 4);
  return Math.max(1, Math.round(bytes / 1024));
}

function triggerDataUrlDownload(dataUrl: string, filename: string) {
  const bytes = dataUrlToUint8Array(dataUrl);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const CatalogPngExportModal: React.FC<CatalogPngExportModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
  onSettingsUpdated,
  categoryFilter = 'الكل',
  customCatalog,
  totalEstimatedPages = 1,
}) => {
  const { toast } = useUiFeedback();
  const [scale, setScale] = useState<1 | 2>(2);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [pages, setPages] = useState<PngPageItem[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [progressInfo, setProgressInfo] = useState({ current: 0, total: 1, percent: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewPageNumber, setPreviewPageNumber] = useState<number | null>(null);
  const [editingPageIndex, setEditingPageIndex] = useState<number | null>(null);

  const cancelRef = useRef(false);

  const baseSlug = useMemo(() => {
    const raw =
      customCatalog?.name ||
      settings.catalog_title ||
      settings.store_name ||
      settings.company_name ||
      'كتالوج';
    const catPart = categoryFilter && categoryFilter !== 'الكل' ? `_${categoryFilter}` : '';
    return `${raw}${catPart}`
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[/\\?%*:|"<>]/g, '_');
  }, [customCatalog?.name, settings.catalog_title, settings.store_name, settings.company_name, categoryFilter]);

  const allEstimatedList = useMemo(
    () => Array.from({ length: Math.max(1, totalEstimatedPages) }, (_, i) => i + 1),
    [totalEstimatedPages]
  );

  const runRenderPngPages = async (
    overrideScale: 1 | 2 = scale,
    overrideSettings: CatalogSettings = settings,
    targetPages?: number[]
  ) => {
    cancelRef.current = false;
    setIsRendering(true);
    setErrorMsg(null);
    setProgressInfo({ current: 0, total: Math.max(1, totalEstimatedPages), percent: 5 });

    try {
      const pageList =
        targetPages && targetPages.length > 0
          ? targetPages
          : selectedPages.length > 0 && selectedPages.length < allEstimatedList.length
            ? selectedPages
            : undefined;

      const rendered = await renderCatalogPagesAsPng(products, overrideSettings, {
        categoryFilter,
        customCatalog,
        scale: overrideScale,
        pageNumbers: pageList,
        onProgress: (p) =>
          setProgressInfo({ current: p.currentPage, total: p.totalPages, percent: p.percent }),
        isCancelled: () => cancelRef.current,
      });

      const mapped: PngPageItem[] = rendered.map((r) => ({
        ...r,
        originalDataUrl: r.dataUrl,
        isEdited: false,
        filename: `${baseSlug}_صفحة_${r.pageNumber}.png`,
      }));
      setPages(mapped);
    } catch (err: any) {
      if (!cancelRef.current) {
        setErrorMsg(err?.message || 'حدث خطأ أثناء تحويل صفحات الكتالوج إلى صور PNG.');
      }
    } finally {
      setIsRendering(false);
    }
  };

  // Auto-generate crisp PNG pages as soon as the modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSelectedPages(allEstimatedList);
    setPreviewPageNumber(null);
    setEditingPageIndex(null);
    void runRenderPngPages(scale, settings, allEstimatedList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const activeLayer: WatermarkLayer = settings.watermark_layer || 'back';
  const hasWatermarkLogo = Boolean(settings.logo_url && settings.watermark_type !== 'none');

  const handleToggleLayerQuick = async (layer: WatermarkLayer) => {
    const nextSettings: CatalogSettings = {
      ...settings,
      watermark_layer: layer,
      watermark_type:
        settings.watermark_type === 'none' && settings.logo_url ? 'center' : settings.watermark_type,
    };
    if (onSettingsUpdated) {
      onSettingsUpdated(nextSettings);
    }
    await runRenderPngPages(scale, nextSettings);
  };

  const handleTogglePageNumber = (pageNum: number) => {
    setSelectedPages((prev) =>
      prev.includes(pageNum) ? prev.filter((n) => n !== pageNum) : [...prev, pageNum].sort((a, b) => a - b)
    );
  };

  const handleDownloadAllSequential = async () => {
    if (pages.length === 0) return;
    setIsDownloadingAll(true);
    try {
      for (let i = 0; i < pages.length; i++) {
        triggerDataUrlDownload(pages[i].dataUrl, pages[i].filename);
        await new Promise((r) => setTimeout(r, 220));
      }
      toast.success(`تم تنزيل ${pages.length} صور PNG واضحة بنجاح!`);
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const handleDownloadAllZip = async () => {
    if (pages.length === 0) return;
    try {
      await zipFilesAndDownload(
        pages.map((p) => ({
          filename: p.filename,
          bytes: dataUrlToUint8Array(p.dataUrl),
        })),
        `${baseSlug}_صور_PNG_${pages.length}_صفحات.zip`
      );
      toast.success(`تم تنزيل جميع الصفحات (${pages.length} صور PNG) داخل ملف ZIP بنجاح!`);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر ضغط صور PNG في ملف ZIP.');
    }
  };

  const handleRevertPage = (idx: number) => {
    setPages((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, dataUrl: item.originalDataUrl, isEdited: false } : item
      )
    );
    toast.info('تمت استعادة النسخة الأصلية من الصفحة.');
  };

  const editingPage = editingPageIndex !== null ? pages[editingPageIndex] : null;
  const previewPage =
    previewPageNumber !== null ? pages.find((p) => p.pageNumber === previewPageNumber) || null : null;

  return (
    <>
      <div
        className="fixed inset-0 z-[74] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 print:hidden"
        dir="rtl"
      >
        <div className="bg-white rounded-3xl max-w-6xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
                <Images size={21} />
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-slate-900 text-sm sm:text-base truncate">
                  تقسيم صفحات الكتالوج إلى صور PNG واضحة وقابلة للتعديل
                </h3>
                <p className="text-[11px] text-slate-500">
                  تحويل كل صفحة من الكتالوج إلى صورة PNG مستقلة فائقة الوضوح مع إمكانية تعديل كل صفحة قبل التنزيل
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                cancelRef.current = true;
                onClose();
              }}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-xl cursor-pointer"
              aria-label="إغلاق"
            >
              <X size={20} />
            </button>
          </div>

          {/* Controls Toolbar */}
          <div className="px-4 sm:px-5 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
            {/* Quality & Re-render controls */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-slate-700">دقة ووضوح الصور:</span>
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  disabled={isRendering}
                  onClick={() => {
                    setScale(1);
                    void runRenderPngPages(1, settings);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    scale === 1
                      ? 'bg-white text-orange-700 shadow-2xs border border-orange-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  قياسي (1240×1754)
                </button>
                <button
                  type="button"
                  disabled={isRendering}
                  onClick={() => {
                    setScale(2);
                    void runRenderPngPages(2, settings);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                    scale === 2
                      ? 'bg-orange-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  فائق الوضوح 2× (2480×3508 HD)
                </button>
              </div>

              {/* Quick Logo Layer Switcher when logo exists */}
              {settings.logo_url && (
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1">
                  <Layers size={13} className="text-orange-600" />
                  <span className="text-[11px] font-bold text-slate-600">طبقة اللوجو:</span>
                  <button
                    type="button"
                    disabled={isRendering}
                    onClick={() => void handleToggleLayerQuick('front')}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold cursor-pointer ${
                      hasWatermarkLogo && activeLayer === 'front'
                        ? 'bg-orange-600 text-white'
                        : 'bg-white text-slate-700 border border-slate-200'
                    }`}
                  >
                    فوق المنتجات
                  </button>
                  <button
                    type="button"
                    disabled={isRendering}
                    onClick={() => void handleToggleLayerQuick('back')}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold cursor-pointer ${
                      hasWatermarkLogo && activeLayer === 'back'
                        ? 'bg-orange-600 text-white'
                        : 'bg-white text-slate-700 border border-slate-200'
                    }`}
                  >
                    تحت المنتجات
                  </button>
                </div>
              )}
            </div>

            {/* Refresh / Re-render */}
            <button
              type="button"
              disabled={isRendering || selectedPages.length === 0}
              onClick={() => void runRenderPngPages(scale, settings, selectedPages)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={isRendering ? 'animate-spin' : ''} />
              <span>تحديث وإعادة رسم الصفحات المحددة</span>
            </button>
          </div>

          {/* Page Picker Strip when > 1 page */}
          {allEstimatedList.length > 1 && (
            <div className="px-4 sm:px-5 py-2.5 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-2 text-[11px] shrink-0">
              <span className="font-extrabold text-slate-700">الصفحات المحددة ({selectedPages.length} من {allEstimatedList.length}):</span>
              <button
                type="button"
                onClick={() => setSelectedPages(allEstimatedList)}
                className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                الكل
              </button>
              <div className="flex flex-wrap items-center gap-1">
                {allEstimatedList.map((num) => {
                  const checked = selectedPages.includes(num);
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleTogglePageNumber(num)}
                      className={`px-2 py-0.5 rounded-md font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
                        checked
                          ? 'bg-orange-50 border-orange-400 text-orange-800'
                          : 'bg-white border-slate-200 text-slate-400'
                      }`}
                    >
                      {checked && <Check size={10} />}
                      <span>صفحة {num}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Body: Progress / Errors / PNG Pages Grid */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-100/70 space-y-4">
            {errorMsg && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs font-bold text-red-700 flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {isRendering && (
              <div className="p-4 bg-white border border-orange-200 rounded-2xl space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between text-xs font-extrabold text-orange-900">
                  <span className="flex items-center gap-2">
                    <RefreshCw size={15} className="animate-spin text-orange-600" />
                    <span>
                      جاري استخراج صورة الصفحة {progressInfo.current} من {progressInfo.total} بدقة PNG عالية... ({progressInfo.percent}%)
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      cancelRef.current = true;
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 text-[11px] font-bold cursor-pointer"
                  >
                    <XCircle size={13} />
                    <span>إلغاء</span>
                  </button>
                </div>
                <div className="w-full h-2.5 bg-orange-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-600 rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(8, progressInfo.percent)}%` }}
                  />
                </div>
              </div>
            )}

            {!isRendering && pages.length === 0 && !errorMsg && (
              <div className="text-center py-14 text-slate-500 text-xs font-bold">
                اختر الصفحات واضغط على «تحديث وإعادة رسم الصفحات المحددة» لتجهيز صور PNG.
              </div>
            )}

            {pages.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pages.map((page, idx) => {
                  const kb = estimateDataUrlKb(page.dataUrl);
                  return (
                    <div
                      key={page.pageNumber}
                      className={`bg-white rounded-2xl border overflow-hidden shadow-xs flex flex-col transition-all ${
                        page.isEdited ? 'border-orange-400 ring-1 ring-orange-300' : 'border-slate-200'
                      }`}
                    >
                      {/* Top card header */}
                      <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/70">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2 py-0.5 rounded-lg bg-orange-600 text-white text-[11px] font-extrabold shrink-0">
                            صفحة {page.pageNumber} / {page.totalPages}
                          </span>
                          {page.isEdited && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-extrabold flex items-center gap-0.5 shrink-0">
                              <Sparkles size={10} />
                              معدّلة
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono font-bold text-slate-500 shrink-0">
                          {page.width}×{page.height} • {kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`}
                        </span>
                      </div>

                      {/* PNG Preview */}
                      <div
                        onClick={() => setPreviewPageNumber(page.pageNumber)}
                        className="relative bg-slate-100 aspect-[1240/1754] max-h-[340px] w-full flex items-center justify-center overflow-hidden cursor-zoom-in group"
                        title="اضغط للتكبير"
                      >
                        <img
                          src={page.dataUrl}
                          alt={`صفحة ${page.pageNumber}`}
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/15 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 rounded-xl bg-white/95 text-slate-900 text-[11px] font-extrabold shadow-md flex items-center gap-1.5">
                            <Eye size={13} className="text-orange-600" />
                            <span>معاينة مكبرة</span>
                          </span>
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="p-3 border-t border-slate-100 bg-white space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                          <span className="truncate">{page.filename}</span>
                          <span className="shrink-0">{page.productCount} منتج</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingPageIndex(idx)}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 text-xs font-extrabold cursor-pointer transition-colors"
                          >
                            <Edit3 size={13} />
                            <span>تعديل الصورة</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => triggerDataUrlDownload(page.dataUrl, page.filename)}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer transition-colors"
                          >
                            <Download size={13} />
                            <span>تنزيل PNG</span>
                          </button>

                          {page.isEdited && (
                            <button
                              type="button"
                              onClick={() => handleRevertPage(idx)}
                              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                              title="استعادة الصورة الأصلية قبل التعديل"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Bulk Download Bar */}
          <div className="px-4 sm:px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                cancelRef.current = true;
                onClose();
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/70 cursor-pointer"
            >
              إغلاق
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isRendering || isDownloadingAll || pages.length === 0}
                onClick={() => void handleDownloadAllSequential()}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-extrabold cursor-pointer disabled:opacity-50"
                title="ينزّل كل صفحة كملف PNG مستقل واحدة تلو الأخرى"
              >
                <ImageIcon size={15} className="text-orange-600" />
                <span>
                  {isDownloadingAll
                    ? 'جاري التنزيل...'
                    : `تنزيل ${pages.length} صور منفردة (PNG)`}
                </span>
              </button>

              <button
                type="button"
                disabled={isRendering || pages.length === 0}
                onClick={() => void handleDownloadAllZip()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-md cursor-pointer disabled:opacity-50"
              >
                <FolderArchive size={15} />
                <span>تنزيل الكل مضغوط (ZIP - {pages.length} صور PNG)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen Crisp Preview Overlay */}
      {previewPage && (
        <div
          className="fixed inset-0 z-[80] bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-4"
          dir="rtl"
          onClick={() => setPreviewPageNumber(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-4xl w-full max-h-[94vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50">
              <span className="font-extrabold text-sm text-slate-900">
                معاينة صفحة {previewPage.pageNumber} من {previewPage.totalPages} ({previewPage.width}×{previewPage.height} PNG)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const idx = pages.findIndex((p) => p.pageNumber === previewPage.pageNumber);
                    setPreviewPageNumber(null);
                    if (idx >= 0) setEditingPageIndex(idx);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-extrabold cursor-pointer"
                >
                  <Edit3 size={13} />
                  <span>تعديل هذه الصفحة</span>
                </button>
                <button
                  type="button"
                  onClick={() => triggerDataUrlDownload(previewPage.dataUrl, previewPage.filename)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
                >
                  <Download size={13} />
                  <span>تنزيل PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewPageNumber(null)}
                  className="p-1.5 rounded-xl text-slate-500 hover:bg-slate-200 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-200 p-4 flex items-center justify-center">
              <img
                src={previewPage.dataUrl}
                alt={`معاينة صفحة ${previewPage.pageNumber}`}
                className="max-w-full max-h-full object-contain rounded shadow-lg bg-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* Built-in Studio Editor (CropAdjustModal) for editing any page PNG */}
      {editingPage && editingPageIndex !== null && (
        <CropAdjustModal
          initialImageUrl={editingPage.dataUrl}
          initialRawUrl={editingPage.originalDataUrl}
          initialCropBox={[0, 0, 1000, 1000]}
          outputFormat="png"
          targetMaxDimension={Math.max(editingPage.width, editingPage.height)}
          workingMaxSide={Math.max(editingPage.width, editingPage.height)}
          title={`تعديل صورة الصفحة ${editingPage.pageNumber} من ${editingPage.totalPages}`}
          subtitle="قص أو تلوين أو مسح أو تعديل الخلفية على هذه الصفحة مع أزرار السابق ولاحق والتنقل بين الصفحات"
          queueNav={
            pages.length > 1
              ? {
                  currentNumber: editingPageIndex + 1,
                  total: pages.length,
                  hasPrev: editingPageIndex > 0,
                  hasNext: editingPageIndex < pages.length - 1,
                  onNavigate: (direction, editedUrl) => {
                    if (editedUrl) {
                      setPages((prev) =>
                        prev.map((item, i) =>
                          i === editingPageIndex
                            ? { ...item, dataUrl: editedUrl, isEdited: true }
                            : item
                        )
                      );
                    }
                    setEditingPageIndex((prevIdx) => {
                      if (prevIdx === null) return null;
                      return direction === 'next'
                        ? Math.min(pages.length - 1, prevIdx + 1)
                        : Math.max(0, prevIdx - 1);
                    });
                  },
                }
              : undefined
          }
          onClose={() => setEditingPageIndex(null)}
          onSaveImageUrl={(editedUrl) => {
            setPages((prev) =>
              prev.map((item, i) =>
                i === editingPageIndex ? { ...item, dataUrl: editedUrl, isEdited: true } : item
              )
            );
            setEditingPageIndex(null);
            toast.success(`تم حفظ تعديلات صفحة ${editingPage.pageNumber} بصيغة PNG!`);
          }}
        />
      )}
    </>
  );
};
