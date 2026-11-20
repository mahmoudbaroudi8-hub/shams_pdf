import React, { useMemo, useState, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import {
  Product,
  CatalogSettings,
  SavedCatalog,
  DEFAULT_CATEGORIES,
  DEFAULT_SECTION_HEADER_CONFIG,
} from '../types';
import { generateCatalogPdf, resolveSectionHeaderConfig } from '../utils/pdfGenerator';
import { splitPdfEveryNPages, splitPdfByRanges, zipFilesAndDownload } from '../utils/pdfTools';
import { PdfBlobPreviewModal } from './PdfBlobPreviewModal';
import { useUiFeedback } from './UiFeedbackProvider';
import {
  Split,
  X,
  Layers,
  Files,
  Download,
  FolderArchive,
  Eye,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Check,
  RotateCcw,
} from 'lucide-react';

interface SplitOutputItem {
  id: string;
  filename: string;
  bytes: Uint8Array;
  pageCount: number;
}

interface PdfSplitExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings: CatalogSettings;
  customCatalog?: SavedCatalog;
  externalPdfBuffer?: ArrayBuffer | null;
  catalogTitle?: string;
  totalEstimatedPages?: number;
}

export const PdfSplitExportModal: React.FC<PdfSplitExportModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
  customCatalog,
  externalPdfBuffer,
  catalogTitle,
  totalEstimatedPages = 1,
}) => {
  const { toast } = useUiFeedback();

  const hasExternalOnlyPdf = Boolean(
    externalPdfBuffer &&
      (!customCatalog || (customCatalog.product_ids?.length || 0) === 0)
  );

  const [splitMode, setSplitMode] = useState<'by_category' | 'every_n' | 'ranges'>(
    hasExternalOnlyPdf ? 'every_n' : 'by_category'
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [pagesPerChunk, setPagesPerChunk] = useState<number>(2);
  const [customRangesText, setCustomRangesText] = useState<string>('1-2, 3-4');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [outputFiles, setOutputFiles] = useState<SplitOutputItem[]>([]);
  const [previewItem, setPreviewItem] = useState<{ blob: Blob; filename: string } | null>(null);

  const sectionConfig = useMemo(
    () => resolveSectionHeaderConfig(settings, customCatalog),
    [settings, customCatalog]
  );

  // Build ordered list of visible sections
  const availableSections = useMemo(() => {
    const overrides = sectionConfig.overrides || {};
    const catList =
      settings.categories && settings.categories.length > 0
        ? settings.categories
        : DEFAULT_CATEGORIES;
    const rankMap = new Map(catList.map((c, idx) => [c.name, idx]));

    const sourceProducts = customCatalog
      ? (() => {
          const map = new Map(products.map((p) => [p.id, p]));
          return customCatalog.product_ids
            .map((id) => map.get(id))
            .filter((p): p is Product => Boolean(p));
        })()
      : products.filter(
          (p) => p.included_in_catalog && (p.selling_price || 0) > 0 && p.name?.trim()
        );

    const groups = new Map<string, number>();
    sourceProducts.forEach((p) => {
      if ((p as any).is_unread_placeholder) return;
      const catName = p.category?.trim() || 'متنوعة';
      if (overrides[catName]?.hidden) return;
      groups.set(catName, (groups.get(catName) || 0) + 1);
    });

    const ordered = Array.from(groups.keys()).sort((a, b) => {
      const oA = overrides[a]?.order ?? (rankMap.has(a) ? rankMap.get(a)! : 999);
      const oB = overrides[b]?.order ?? (rankMap.has(b) ? rankMap.get(b)! : 999);
      if (oA !== oB) return oA - oB;
      return a.localeCompare(b, 'ar');
    });

    return ordered.map((name) => {
      const def = catList.find((c) => c.name === name);
      const ov = overrides[name];
      return {
        name,
        title: ov?.title?.trim() || def?.catalog_title || def?.name || name,
        color: ov?.color || def?.color || settings.primary_color || '#ea580c',
        count: groups.get(name) || 0,
      };
    });
  }, [products, settings, customCatalog, sectionConfig]);

  // Reset modal defaults on open
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setOutputFiles([]);
    setProgressPercent(0);
    setProgressText('');
    setSelectedCategories(availableSections.map((s) => s.name));
    if (hasExternalOnlyPdf || availableSections.length === 0) {
      setSplitMode('every_n');
    }
    if (totalEstimatedPages > 1) {
      const half = Math.ceil(totalEstimatedPages / 2);
      setCustomRangesText(`1-${half}, ${half + 1}-${totalEstimatedPages}`);
    } else {
      setCustomRangesText('1-1');
    }
  }, [isOpen, hasExternalOnlyPdf, availableSections.length, totalEstimatedPages]);

  if (!isOpen) return null;

  const baseSlug = (
    catalogTitle ||
    customCatalog?.name ||
    settings.store_name ||
    settings.company_name ||
    'كتالوج'
  )
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[/\\?%*:|"<>]/g, '_');

  const toggleCategorySelection = (catName: string) => {
    setSelectedCategories((prev) =>
      prev.includes(catName) ? prev.filter((c) => c !== catName) : [...prev, catName]
    );
  };

  const countPdfPages = async (bytes: Uint8Array): Promise<number> => {
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      return doc.getPageCount();
    } catch {
      return 1;
    }
  };

  const handleRunSplit = async () => {
    setErrorMsg(null);
    setIsProcessing(true);
    setProgressPercent(5);
    setOutputFiles([]);

    try {
      if (splitMode === 'by_category') {
        if (selectedCategories.length === 0) {
          throw new Error('يرجى تحديد قسم واحد على الأقل لتقسيمه إلى ملف PDF.');
        }

        const results: SplitOutputItem[] = [];
        for (let i = 0; i < selectedCategories.length; i++) {
          const catName = selectedCategories[i];
          const secMeta = availableSections.find((s) => s.name === catName);
          const safeCat = catName.replace(/[/\\?%*:|"<>]/g, '_');
          setProgressText(
            `جاري إنشاء ملف القسم ${i + 1} من ${selectedCategories.length}: ${secMeta?.title || catName}...`
          );

          const blob = (await generateCatalogPdf(products, settings, {
            categoryFilter: catName,
            customCatalog,
            action: 'blob',
          })) as Blob;

          const bytes = new Uint8Array(await blob.arrayBuffer());
          const pCount = await countPdfPages(bytes);
          results.push({
            id: `cat_${i}_${catName}`,
            filename: `${baseSlug}_قسم_${safeCat}.pdf`,
            bytes,
            pageCount: pCount,
          });
          setProgressPercent(Math.round(((i + 1) / selectedCategories.length) * 100));
        }
        setOutputFiles(results);
        toast.success(`تم تجهيز ${results.length} ملفات PDF مستقلة حسب الأقسام!`);
      } else {
        // Need full PDF buffer (either externalPdfBuffer or freshly generated)
        let sourceBuffer: ArrayBuffer;
        if (externalPdfBuffer) {
          sourceBuffer = externalPdfBuffer.slice(0);
          setProgressPercent(25);
        } else {
          setProgressText('جاري تجهيز صفحات الكتالوج بالكامل قبل التقسيم...');
          const fullBlob = (await generateCatalogPdf(products, settings, {
            customCatalog,
            action: 'blob',
            onProgress: (p) => {
              setProgressPercent(Math.round(p.percent * 0.7));
              setProgressText(`تجهيز صفحة ${p.currentPage} من ${p.totalPages}...`);
            },
          })) as Blob;
          sourceBuffer = await fullBlob.arrayBuffer();
        }

        setProgressText('جاري قصّ وتقسيم الملف إلى عدة ملفات...');
        const srcDoc = await PDFDocument.load(sourceBuffer.slice(0), { ignoreEncryption: true });
        const actualTotalPages = srcDoc.getPageCount();

        let splitChunks: { filename: string; bytes: Uint8Array }[] = [];
        if (splitMode === 'every_n') {
          const n = Math.max(1, Math.min(actualTotalPages, Math.round(pagesPerChunk) || 1));
          splitChunks = await splitPdfEveryNPages(sourceBuffer, baseSlug, n);
        } else {
          const parts = customRangesText
            .split(/[,،\n]/)
            .map((s) => s.trim())
            .filter(Boolean);
          const parsedRanges: { start: number; end: number; label: string }[] = [];

          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const match = part.match(/^([0-9]+)\s*[-–]\s*([0-9]+)$/);
            if (match) {
              const start = Math.max(1, parseInt(match[1], 10));
              const end = Math.min(actualTotalPages, parseInt(match[2], 10));
              if (start <= end) {
                parsedRanges.push({
                  start,
                  end,
                  label: `جزء_${i + 1}_(صفحات_${start}_إلى_${end})`,
                });
              }
            } else {
              const single = parseInt(part, 10);
              if (!isNaN(single) && single >= 1 && single <= actualTotalPages) {
                parsedRanges.push({
                  start: single,
                  end: single,
                  label: `صفحة_${single}`,
                });
              }
            }
          }

          if (parsedRanges.length === 0) {
            throw new Error(
              `يرجى إدخال نطاق صفحات صالح بين 1 و ${actualTotalPages} (مثال: 1-2, 3-${actualTotalPages}).`
            );
          }
          splitChunks = await splitPdfByRanges(sourceBuffer, baseSlug, parsedRanges);
        }

        if (splitChunks.length === 0) {
          throw new Error('لم ينتج أي ملفات عن عملية التقسيم.');
        }

        const results: SplitOutputItem[] = [];
        for (let i = 0; i < splitChunks.length; i++) {
          const chunk = splitChunks[i];
          const pCount = await countPdfPages(chunk.bytes);
          results.push({
            id: `chunk_${i}_${chunk.filename}`,
            filename: chunk.filename,
            bytes: chunk.bytes,
            pageCount: pCount,
          });
        }

        setProgressPercent(100);
        setOutputFiles(results);
        toast.success(`تم تقسيم الملف إلى ${results.length} ملفات PDF بنجاح!`);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء تقسيم ملف الـ PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadSingleFile = (item: SplitOutputItem) => {
    const blob = new Blob([item.bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const handleDownloadAllZip = async () => {
    try {
      await zipFilesAndDownload(
        outputFiles.map((f) => ({ filename: f.filename, bytes: f.bytes })),
        `${baseSlug}_مقسم_${outputFiles.length}_ملفات.zip`
      );
      toast.success('تم تنزيل جميع الملفات مضغوطة في ملف ZIP بنجاح!');
    } catch (err: any) {
      toast.error(err?.message || 'تعذر ضغط الملفات.');
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[72] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 print:hidden"
        dir="rtl"
      >
        <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
                <Split size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-slate-900 text-sm sm:text-base truncate">
                  تقسيم وتصدير الـ PDF إلى عدة ملفات
                </h3>
                <p className="text-[11px] text-slate-500">
                  افصل كل قسم في ملف PDF مستقل أو قسّم الصفحات على عدة ملفات ونزّلها منفردة أو في ZIP
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-xl cursor-pointer"
              aria-label="إغلاق"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
            {errorMsg && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs font-bold text-red-700 flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {outputFiles.length === 0 ? (
              <>
                {/* Split Mode Selector */}
                <div className="space-y-2">
                  <label className="block text-xs font-extrabold text-slate-800">
                    اختر طريقة تقسيم الملف:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {!hasExternalOnlyPdf && availableSections.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSplitMode('by_category')}
                        className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                          splitMode === 'by_category'
                            ? 'bg-orange-50 border-orange-500 ring-1 ring-orange-500 text-orange-950'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-extrabold text-xs">
                          <Layers size={15} className="text-orange-600" />
                          <span>ملف لكل قسم</span>
                        </div>
                        <p className="text-[11px] opacity-80 mt-1">
                          تصدير كل قسم مختار كملف PDF منفصل بنفس التصميم والألوان
                        </p>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setSplitMode('every_n')}
                      className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                        splitMode === 'every_n'
                          ? 'bg-orange-50 border-orange-500 ring-1 ring-orange-500 text-orange-950'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-extrabold text-xs">
                        <Files size={15} className="text-orange-600" />
                        <span>كل N صفحات في ملف</span>
                      </div>
                      <p className="text-[11px] opacity-80 mt-1">
                        مثال: كل صفحة أو صفحتين في ملف مستقل للإرسال السريع
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSplitMode('ranges')}
                      className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                        splitMode === 'ranges'
                          ? 'bg-orange-50 border-orange-500 ring-1 ring-orange-500 text-orange-950'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-extrabold text-xs">
                        <Split size={15} className="text-orange-600" />
                        <span>نطاق صفحات مخصص</span>
                      </div>
                      <p className="text-[11px] opacity-80 mt-1">
                        حدد الصفحات يدوياً مثل: 1-2، 3-5، 6
                      </p>
                    </button>
                  </div>
                </div>

                {/* Mode 1: By Category Sections */}
                {splitMode === 'by_category' && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-slate-800">
                        الأقسام المتاحة للتصدير ({selectedCategories.length} من {availableSections.length} محدد):
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedCategories(availableSections.map((s) => s.name))}
                          className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          تحديد الكل
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedCategories([])}
                          className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                        >
                          إلغاء الكل
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-0.5">
                      {availableSections.map((sec, idx) => {
                        const checked = selectedCategories.includes(sec.name);
                        return (
                          <button
                            key={sec.name}
                            type="button"
                            onClick={() => toggleCategorySelection(sec.name)}
                            className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                              checked
                                ? 'bg-white border-orange-400 shadow-2xs'
                                : 'bg-slate-100/70 border-slate-200 opacity-65'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                                  checked
                                    ? 'bg-orange-600 border-orange-600 text-white'
                                    : 'bg-white border-slate-300'
                                }`}
                              >
                                {checked && <Check size={11} />}
                              </span>
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: sec.color }}
                              />
                              <span className="text-xs font-extrabold text-slate-800 truncate">
                                {idx + 1}. {sec.title}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0">
                              {sec.count} صنف
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mode 2: Every N Pages */}
                {splitMode === 'every_n' && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 text-xs">
                    <label className="block font-extrabold text-slate-800">
                      عدد الصفحات في كل ملف PDF:
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, totalEstimatedPages)}
                        value={pagesPerChunk}
                        onChange={(e) =>
                          setPagesPerChunk(Math.max(1, parseInt(e.target.value, 10) || 1))
                        }
                        className="w-24 px-3 py-2 rounded-xl bg-white border border-slate-300 font-extrabold text-center text-sm"
                      />
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 5].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setPagesPerChunk(preset)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                              pagesPerChunk === preset
                                ? 'bg-orange-600 text-white border-orange-600'
                                : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            {preset === 1 ? 'صفحة بكل ملف' : `كل ${preset} صفحات`}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      التقدير المتوقع: سيتم تقسيم ~{totalEstimatedPages} صفحة إلى حوالي{' '}
                      <strong>{Math.ceil(Math.max(1, totalEstimatedPages) / Math.max(1, pagesPerChunk))}</strong>{' '}
                      ملفات PDF.
                    </p>
                  </div>
                )}

                {/* Mode 3: Custom Ranges */}
                {splitMode === 'ranges' && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="font-extrabold text-slate-800">
                        أدخل نطاقات الصفحات مفصولة بفاصلة (إجمالي متوقع {totalEstimatedPages} صفحة):
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const list = Array.from(
                              { length: Math.max(1, totalEstimatedPages) },
                              (_, i) => `${i + 1}`
                            );
                            setCustomRangesText(list.join(', '));
                          }}
                          className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          كل صفحة لوحدها
                        </button>
                        {totalEstimatedPages >= 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              const half = Math.ceil(totalEstimatedPages / 2);
                              setCustomRangesText(`1-${half}, ${half + 1}-${totalEstimatedPages}`);
                            }}
                            className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            نصفين متساويين
                          </button>
                        )}
                      </div>
                    </div>

                    <input
                      type="text"
                      dir="ltr"
                      value={customRangesText}
                      onChange={(e) => setCustomRangesText(e.target.value)}
                      placeholder="1-2, 3-5, 6"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-xs font-bold text-left focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                )}

                {/* Processing Progress */}
                {isProcessing && (
                  <div className="p-4 bg-orange-50 border border-orange-200 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-orange-900">
                      <span className="flex items-center gap-2">
                        <RefreshCw size={15} className="animate-spin text-orange-600" />
                        <span>{progressText || 'جاري المعالجة والتقسيم...'}</span>
                      </span>
                      <span className="font-mono">{progressPercent}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-orange-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-orange-600 rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(6, progressPercent)}%` }}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Generated Files Result View */
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-emerald-900">
                    <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                    <div>
                      <h4 className="font-extrabold text-xs sm:text-sm">
                        جاهز! تم تقسيم الملف إلى {outputFiles.length} ملفات PDF مستقلة
                      </h4>
                      <p className="text-[11px] text-emerald-800">
                        يمكنك تنزيل كل ملف لوحده أو معاينته أو تنزيلها كلها دفعة واحدة في ملف ZIP
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadAllZip}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow-md cursor-pointer shrink-0"
                  >
                    <FolderArchive size={15} />
                    <span>تنزيل الكل (ZIP)</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
                  {outputFiles.map((file, idx) => {
                    const kb = Math.max(1, Math.round(file.bytes.byteLength / 1024));
                    return (
                      <div
                        key={file.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap sm:flex-nowrap items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-orange-100 text-orange-800 font-mono font-extrabold text-xs flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="font-extrabold text-xs text-slate-900 truncate">
                              {file.filename}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {file.pageCount} صفحة • {kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewItem({
                                blob: new Blob([file.bytes.buffer as ArrayBuffer], {
                                  type: 'application/pdf',
                                }),
                                filename: file.filename,
                              })
                            }
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-[11px] font-bold cursor-pointer"
                          >
                            <Eye size={13} />
                            <span>معاينة</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadSingleFile(file)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-[11px] font-extrabold cursor-pointer"
                          >
                            <Download size={13} />
                            <span>تنزيل</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
            {outputFiles.length > 0 ? (
              <button
                type="button"
                onClick={() => setOutputFiles([])}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                <RotateCcw size={14} />
                <span>تقسيم بطريقة أخرى</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-xl cursor-pointer disabled:opacity-40"
              >
                إغلاق
              </button>
            )}

            {outputFiles.length === 0 ? (
              <button
                type="button"
                onClick={handleRunSplit}
                disabled={isProcessing}
                className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl shadow-md cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    <span>جاري التقسيم...</span>
                  </>
                ) : (
                  <>
                    <Split size={15} />
                    <span>بدء تقسيم وتجهيز الملفات</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-extrabold rounded-xl cursor-pointer"
              >
                تم
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Preview any individual split PDF file */}
      <PdfBlobPreviewModal
        isOpen={Boolean(previewItem)}
        pdfBlob={previewItem?.blob || null}
        title={previewItem ? `معاينة: ${previewItem.filename}` : undefined}
        downloadFilename={previewItem?.filename || 'ملف_مقسم.pdf'}
        onClose={() => setPreviewItem(null)}
      />
    </>
  );
};
