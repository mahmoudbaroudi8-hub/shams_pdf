import React, { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FilePlus2,
  FileText,
  Maximize2,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
  ZoomIn,
  X,
  ArrowRight,
  ArrowLeft,
  Split,
} from 'lucide-react';
import { SavedCatalog } from '../types';
import { getStoredPdfFile, saveStoredPdfFile } from '../utils/db';
import { loadPdfDocument } from '../utils/pdfExtractor';
import { PdfPageEditorModal } from './PdfPageEditorModal';
import { PdfSplitExportModal } from './PdfSplitExportModal';
import { useUiFeedback } from './UiFeedbackProvider';

interface UploadedPdfPagesPanelProps {
  catalog: SavedCatalog;
  mode: 'manage' | 'preview';
  onPdfUpdated: (updates: Partial<SavedCatalog>) => Promise<void>;
  onDeleteCatalog: () => void;
  onConvertToEditableCatalog?: (
    convertMode: 'replace' | 'copy',
    priceMode: 'selling' | 'wholesale'
  ) => Promise<void>;
  isConvertingToEditable?: boolean;
}

interface RenderedThumb {
  pageNumber: number;
  dataUrl: string;
}

export const UploadedPdfPagesPanel: React.FC<UploadedPdfPagesPanelProps> = ({
  catalog,
  mode,
  onPdfUpdated,
  onDeleteCatalog,
  onConvertToEditableCatalog,
  isConvertingToEditable = false,
}) => {
  const { toast, confirm } = useUiFeedback();

  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number>(catalog.pdf_page_count || 0);
  const [fileSize, setFileSize] = useState<number>(catalog.pdf_size_bytes || 0);
  const [thumbs, setThumbs] = useState<RenderedThumb[]>([]);
  const [renderProgress, setRenderProgress] = useState<number>(0);

  // Full-size single-page reader modal state
  const [zoomPageNumber, setZoomPageNumber] = useState<number | null>(null);
  const [zoomDataUrl, setZoomDataUrl] = useState<string | null>(null);
  const [isLoadingZoom, setIsLoadingZoom] = useState(false);

  // Direct PDF page overlay editor modal state
  const [editingPageNumber, setEditingPageNumber] = useState<number | null>(null);
  const [editingPdfBuffer, setEditingPdfBuffer] = useState<ArrayBuffer | null>(null);

  // AI Convert modal state
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertPriceMode, setConvertPriceMode] = useState<'selling' | 'wholesale'>('selling');
  const [convertMode, setConvertMode] = useState<'replace' | 'copy'>('replace');

  // Append position
  const [appendPosition, setAppendPosition] = useState<'end' | 'start'>('end');
  const appendInputRef = useRef<HTMLInputElement>(null);

  // Keep latest ArrayBuffer ref for fast zoom rendering without extra IDB reads
  const pdfBufferRef = useRef<ArrayBuffer | null>(null);
  const lastPdfFileIdRef = useRef<string | undefined>(undefined);
  const [pdfRenderRevision, setPdfRenderRevision] = useState(0);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitPdfBuffer, setSplitPdfBuffer] = useState<ArrayBuffer | null>(null);

  const handleOpenSplitModal = async () => {
    let buf = pdfBufferRef.current;
    if (!buf && catalog.pdf_file_id) {
      const stored = await getStoredPdfFile(catalog.pdf_file_id);
      buf = stored?.array_buffer || null;
      pdfBufferRef.current = buf;
    }
    if (!buf) {
      toast.error('تعذر تحميل ملف الـ PDF لتقسيمه.');
      return;
    }
    setSplitPdfBuffer(buf.slice(0));
    setShowSplitModal(true);
  };

  useEffect(() => {
    let cancelled = false;

    const loadAndRender = async () => {
      if (!catalog.pdf_file_id) {
        setError('لم يتم العثور على معرف ملف الـ PDF لهذا الكتالوج.');
        setIsLoading(false);
        return;
      }

      const switchedFile = lastPdfFileIdRef.current !== catalog.pdf_file_id;
      lastPdfFileIdRef.current = catalog.pdf_file_id;
      if (switchedFile) {
        setIsLoading(true);
        setThumbs([]);
      }
      setError(null);
      setRenderProgress(0);

      try {
        const stored = await getStoredPdfFile(catalog.pdf_file_id);
        if (!stored || !stored.array_buffer) {
          if (!cancelled) {
            setError('ملف الـ PDF غير موجود في التخزين المحلي لهذا المتصفح.');
            setIsLoading(false);
          }
          return;
        }

        pdfBufferRef.current = stored.array_buffer;
        setFileSize(stored.file_size || stored.array_buffer.byteLength);

        const pdfDoc = await loadPdfDocument(stored.array_buffer.slice(0));
        if (cancelled) return;

        const total = pdfDoc.numPages || 0;
        setPageCount(total);
        setIsLoading(false);

        const thumbScale = mode === 'preview' ? 1.25 : 0.85;
        const collected: RenderedThumb[] = [];

        for (let p = 1; p <= total; p++) {
          if (cancelled) return;
          const page = await pdfDoc.getPage(p);
          const viewport = page.getViewport({ scale: thumbScale });

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
          collected.push({
            pageNumber: p,
            dataUrl: canvas.toDataURL('image/jpeg', 0.84),
          });
          canvas.width = 1;
          canvas.height = 1;

          setThumbs([...collected]);
          setRenderProgress(Math.round((p / total) * 100));

          // Yield briefly so UI remains responsive on multi-page PDFs
          await new Promise((r) => setTimeout(r, 10));
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'تعذر قراءة صفحات ملف الـ PDF.');
          setIsLoading(false);
        }
      }
    };

    loadAndRender();
    return () => {
      cancelled = true;
    };
  }, [catalog.pdf_file_id, mode, pdfRenderRevision]);

  // High-resolution zoom viewer render
  useEffect(() => {
    let cancelled = false;
    if (!zoomPageNumber) {
      setZoomDataUrl(null);
      return;
    }

    const renderHighRes = async () => {
      setIsLoadingZoom(true);
      try {
        let buf = pdfBufferRef.current;
        if (!buf && catalog.pdf_file_id) {
          const stored = await getStoredPdfFile(catalog.pdf_file_id);
          buf = stored?.array_buffer || null;
          pdfBufferRef.current = buf;
        }
        if (!buf || cancelled) return;

        const pdfDoc = await loadPdfDocument(buf.slice(0));
        if (cancelled) return;

        const targetPage = Math.min(Math.max(1, zoomPageNumber), pdfDoc.numPages);
        const page = await pdfDoc.getPage(targetPage);
        const viewport = page.getViewport({ scale: 2.0 });

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

        if (!cancelled) {
          setZoomDataUrl(canvas.toDataURL('image/jpeg', 0.92));
        }
        canvas.width = 1;
        canvas.height = 1;
      } catch {
        if (!cancelled) {
          toast.error('تعذر عرض الصفحة بالدقة العالية.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingZoom(false);
        }
      }
    };

    renderHighRes();
    return () => {
      cancelled = true;
    };
  }, [zoomPageNumber, catalog.pdf_file_id, pdfRenderRevision]);

  // Persist modified PDF bytes back to IndexedDB and update catalog metadata
  const saveModifiedPdfBytes = async (newBytes: Uint8Array, newPageCount: number) => {
    if (!catalog.pdf_file_id) return;
    const newBuffer = newBytes.buffer.slice(
      newBytes.byteOffset,
      newBytes.byteOffset + newBytes.byteLength
    ) as ArrayBuffer;

    await saveStoredPdfFile({
      file_id: catalog.pdf_file_id,
      file_name: catalog.pdf_filename || `${catalog.name}.pdf`,
      file_size: newBuffer.byteLength,
      mime_type: 'application/pdf',
      array_buffer: newBuffer,
      saved_at: Date.now(),
    });

    pdfBufferRef.current = newBuffer;
    setPageCount(newPageCount);
    setFileSize(newBuffer.byteLength);
    setPdfRenderRevision((r) => r + 1);

    await onPdfUpdated({
      pdf_page_count: newPageCount,
      pdf_size_bytes: newBuffer.byteLength,
    });
  };

  // Append pages from external PDF file(s)
  const handleAppendPdfFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0 || !catalog.pdf_file_id) return;

    setIsMutating(true);
    try {
      const stored = await getStoredPdfFile(catalog.pdf_file_id);
      if (!stored) {
        toast.error('تعذر العثور على الملف الأساسي في المتصفح.');
        return;
      }

      const mergedDoc = await PDFDocument.create();

      const appendIncomingFiles = async () => {
        for (const f of files) {
          const buf = await f.arrayBuffer();
          const incDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
          const copied = await mergedDoc.copyPages(incDoc, incDoc.getPageIndices());
          copied.forEach((p) => mergedDoc.addPage(p));
        }
      };

      const appendBaseFile = async () => {
        const baseDoc = await PDFDocument.load(stored.array_buffer.slice(0), {
          ignoreEncryption: true,
        });
        const copied = await mergedDoc.copyPages(baseDoc, baseDoc.getPageIndices());
        copied.forEach((p) => mergedDoc.addPage(p));
      };

      if (appendPosition === 'start') {
        await appendIncomingFiles();
        await appendBaseFile();
      } else {
        await appendBaseFile();
        await appendIncomingFiles();
      }

      const finalBytes = await mergedDoc.save();
      const totalPages = mergedDoc.getPageCount();
      await saveModifiedPdfBytes(finalBytes, totalPages);
      toast.success(`تمت إضافة الصفحات بنجاح! إجمالي الصفحات الآن ${totalPages} صفحة.`);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر قراءة أو إضافة صفحات الـ PDF المرفوعة.');
    } finally {
      setIsMutating(false);
    }
  };

  // Delete a specific page (1-indexed)
  const handleDeletePage = async (pageNum: number) => {
    if (!catalog.pdf_file_id) return;

    if (pageCount <= 1) {
      const okDeleteWhole = await confirm({
        title: 'هذه آخر صفحة في الكتالوج',
        message: 'لا يمكن ترك ملف الـ PDF فارغاً بدون صفحات. هل تريد حذف الكتالوج بالكامل؟',
        confirmLabel: 'حذف الكتالوج بالكامل',
        danger: true,
      });
      if (okDeleteWhole) {
        onDeleteCatalog();
      }
      return;
    }

    const ok = await confirm({
      title: `حذف صفحة ${pageNum}`,
      message: `هل تريد حذف الصفحة رقم (${pageNum}) من هذا الـ PDF نهائياً؟`,
      confirmLabel: 'حذف الصفحة',
      danger: true,
    });
    if (!ok) return;

    setIsMutating(true);
    try {
      const stored = await getStoredPdfFile(catalog.pdf_file_id);
      if (!stored) return;

      const srcDoc = await PDFDocument.load(stored.array_buffer.slice(0), {
        ignoreEncryption: true,
      });
      const keepIndices = srcDoc
        .getPageIndices()
        .filter((idx) => idx !== pageNum - 1);

      const nextDoc = await PDFDocument.create();
      const copied = await nextDoc.copyPages(srcDoc, keepIndices);
      copied.forEach((p) => nextDoc.addPage(p));

      const finalBytes = await nextDoc.save();
      await saveModifiedPdfBytes(finalBytes, nextDoc.getPageCount());

      if (zoomPageNumber === pageNum) {
        setZoomPageNumber(null);
      } else if (zoomPageNumber && zoomPageNumber > pageNum) {
        setZoomPageNumber(zoomPageNumber - 1);
      }

      toast.success(`تم حذف الصفحة ${pageNum} بنجاح.`);
    } catch (err: any) {
      toast.error(err?.message || 'حدث خطأ أثناء حذف الصفحة.');
    } finally {
      setIsMutating(false);
    }
  };

  // Swap/move page earlier or later (direction: -1 or +1)
  const handleMovePage = async (pageNum: number, delta: -1 | 1) => {
    if (!catalog.pdf_file_id) return;
    const fromIdx = pageNum - 1;
    const toIdx = fromIdx + delta;
    if (toIdx < 0 || toIdx >= pageCount) return;

    setIsMutating(true);
    try {
      const stored = await getStoredPdfFile(catalog.pdf_file_id);
      if (!stored) return;

      const srcDoc = await PDFDocument.load(stored.array_buffer.slice(0), {
        ignoreEncryption: true,
      });
      const order = srcDoc.getPageIndices();
      const temp = order[fromIdx];
      order[fromIdx] = order[toIdx];
      order[toIdx] = temp;

      const nextDoc = await PDFDocument.create();
      const copied = await nextDoc.copyPages(srcDoc, order);
      copied.forEach((p) => nextDoc.addPage(p));

      const finalBytes = await nextDoc.save();
      await saveModifiedPdfBytes(finalBytes, nextDoc.getPageCount());
      toast.success('تم تحديث ترتيب الصفحات.');
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تعديل ترتيب الصفحات.');
    } finally {
      setIsMutating(false);
    }
  };

  const openPageEditor = async (pageNum: number) => {
    let buf = pdfBufferRef.current;
    if (!buf && catalog.pdf_file_id) {
      const stored = await getStoredPdfFile(catalog.pdf_file_id);
      buf = stored?.array_buffer || null;
      pdfBufferRef.current = buf;
    }
    if (!buf) {
      toast.error('تعذر تحميل ملف الـ PDF لفتحه في المحرر.');
      return;
    }
    setEditingPdfBuffer(buf.slice(0));
    setEditingPageNumber(pageNum);
  };

  const formattedSize =
    fileSize >= 1024 * 1024
      ? `${(fileSize / 1024 / 1024).toFixed(2)} MB`
      : `${Math.max(1, Math.round(fileSize / 1024))} KB`;

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-extrabold">
              <FileText size={13} />
              <span>ملف PDF مستورد من جهاز آخر</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
              {pageCount} صفحة • {formattedSize}
            </span>
          </div>
          <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
            {mode === 'preview'
              ? 'معاينة صفحات الـ PDF المرفق'
              : 'عرض وتعديل صفحات الـ PDF (مسح منتج • تعديل/إضافة سعر • إضافة صفحات)'}
          </h3>
          <p className="text-xs text-slate-500">
            اضغط أيقونة القلم (✏️) على أي صفحة لمسح منتج أو إضافة سعر مباشرة، أو حوّل الملف بالكامل لمنتجات تفاعلية بالذكاء الاصطناعي.
          </p>
        </div>

        {/* Add PDF Pages & AI Convert Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            type="file"
            ref={appendInputRef}
            accept=".pdf,application/pdf"
            multiple
            onChange={handleAppendPdfFiles}
            className="hidden"
          />

          <select
            value={appendPosition}
            onChange={(e) => setAppendPosition(e.target.value as 'end' | 'start')}
            className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-sky-500"
            title="مكان إضافة الصفحات الجديدة"
          >
            <option value="end">إضافة في نهاية الـ PDF</option>
            <option value="start">إضافة في بداية الـ PDF</option>
          </select>

          <button
            type="button"
            onClick={() => appendInputRef.current?.click()}
            disabled={isMutating}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            {isMutating ? <RefreshCw size={15} className="animate-spin" /> : <FilePlus2 size={15} />}
            <span>+ إضافة صفحات PDF</span>
          </button>

          <button
            type="button"
            onClick={handleOpenSplitModal}
            disabled={isMutating || pageCount === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl shadow-xs transition-colors cursor-pointer"
            title="تقسيم صفحات هذا الـ PDF إلى عدة ملفات مستقلة"
          >
            <Split size={15} />
            <span>تقسيم لكذا ملف</span>
          </button>

          {mode === 'manage' && onConvertToEditableCatalog && (
            <button
              type="button"
              onClick={() => setShowConvertModal(true)}
              disabled={isConvertingToEditable || isMutating}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl shadow-xs transition-colors cursor-pointer"
              title="اقرأ كل منتجات الـ PDF بالذكاء الاصطناعي لتعدل الأسماء والأسعار وتحذف وتضيف أصناف بحرية"
            >
              <Sparkles size={15} />
              <span>تحويل لكتالوج قابل للتعديل (AI)</span>
            </button>
          )}
        </div>
      </div>

      {/* Render Progress */}
      {!isLoading && thumbs.length < pageCount && pageCount > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 bg-sky-50 border border-sky-200 rounded-xl text-xs font-bold text-sky-800">
          <RefreshCw size={14} className="animate-spin shrink-0" />
          <span className="flex-1">
            جاري عرض الصفحات ({thumbs.length} من {pageCount})...
          </span>
          <span className="font-mono">{renderProgress}%</span>
        </div>
      )}

      {/* Body */}
      {isLoading ? (
        <div className="p-12 text-center space-y-3 text-slate-500">
          <RefreshCw size={28} className="animate-spin mx-auto text-sky-600" />
          <p className="text-xs font-bold">جاري تحميل صفحات ملف الـ PDF...</p>
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 space-y-3">
          <p className="text-sm font-bold">{error}</p>
          <button
            type="button"
            onClick={onDeleteCatalog}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer"
          >
            <Trash2 size={14} />
            <span>حذف هذا الكتالوج</span>
          </button>
        </div>
      ) : (
        <div
          className={`grid gap-4 ${
            mode === 'preview'
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
          }`}
        >
          {thumbs.map((t) => (
            <div
              key={t.pageNumber}
              className="group bg-slate-50 border border-slate-200 hover:border-sky-400 rounded-2xl p-2.5 flex flex-col justify-between transition-all shadow-2xs"
            >
              {/* Page Preview Image */}
              <div
                onClick={() => setZoomPageNumber(t.pageNumber)}
                className="relative bg-white border border-slate-200 rounded-xl overflow-hidden cursor-pointer aspect-[210/297] flex items-center justify-center"
                title="اضغط للتكبير والعرض الكامل"
              >
                <img
                  src={t.dataUrl}
                  alt={`صفحة ${t.pageNumber}`}
                  className="w-full h-full object-contain"
                />
                <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/15 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 text-white px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1">
                    <ZoomIn size={13} />
                    تكبير وعرض
                  </span>
                </div>
                <span className="absolute top-2 right-2 bg-slate-900/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                  صفحة {t.pageNumber}
                </span>
              </div>

              {/* Page Controls */}
              <div className="pt-2.5 flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleMovePage(t.pageNumber, -1)}
                    disabled={isMutating || t.pageNumber <= 1}
                    className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                    title="تقديم الصفحة (للأمام)"
                  >
                    <ArrowRight size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMovePage(t.pageNumber, 1)}
                    disabled={isMutating || t.pageNumber >= pageCount}
                    className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                    title="تأخير الصفحة (للخلف)"
                  >
                    <ArrowLeft size={13} />
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openPageEditor(t.pageNumber)}
                    disabled={isMutating}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-[11px] font-bold cursor-pointer"
                    title="تعديل الصفحة: مسح منتج أو إضافة سعر/نص مباشرة"
                  >
                    <Pencil size={12} />
                    <span>تعديل</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomPageNumber(t.pageNumber)}
                    className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                    title="عرض الصفحة مكبرة"
                  >
                    <Maximize2 size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePage(t.pageNumber)}
                    disabled={isMutating}
                    className="p-1.5 rounded-lg bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40 cursor-pointer"
                    title="حذف هذه الصفحة"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* High-Resolution Interactive Single-Page Viewer Modal */}
      {zoomPageNumber !== null && (
        <div
          dir="rtl"
          className="fixed inset-0 z-70 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
        >
          <div className="bg-white rounded-3xl max-w-4xl w-full h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
            <div className="px-4 sm:px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Eye size={18} className="text-sky-400 shrink-0" />
                <div className="min-w-0">
                  <h4 className="font-bold text-sm truncate">{catalog.name}</h4>
                  <p className="text-[11px] text-slate-300">
                    صفحة {zoomPageNumber} من {pageCount}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const p = zoomPageNumber;
                    setZoomPageNumber(null);
                    openPageEditor(p);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 rounded-lg text-xs font-bold cursor-pointer"
                  title="مسح منتج أو إضافة سعر داخل هذه الصفحة"
                >
                  <Pencil size={14} />
                  <span className="hidden sm:inline">تعديل الصفحة</span>
                </button>

                <button
                  type="button"
                  onClick={() => setZoomPageNumber((p) => (p && p > 1 ? p - 1 : p))}
                  disabled={zoomPageNumber <= 1}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-35 rounded-lg text-xs font-bold cursor-pointer"
                >
                  <ChevronRight size={15} />
                  <span className="hidden sm:inline">السابقة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setZoomPageNumber((p) => (p && p < pageCount ? p + 1 : p))}
                  disabled={zoomPageNumber >= pageCount}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-35 rounded-lg text-xs font-bold cursor-pointer"
                >
                  <span className="hidden sm:inline">التالية</span>
                  <ChevronLeft size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => handleDeletePage(zoomPageNumber)}
                  disabled={isMutating}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 rounded-lg text-xs font-bold cursor-pointer"
                  title="حذف الصفحة المعروضة"
                >
                  <Trash2 size={14} />
                  <span className="hidden sm:inline">حذف الصفحة</span>
                </button>

                <button
                  type="button"
                  onClick={() => setZoomPageNumber(null)}
                  className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg cursor-pointer"
                  aria-label="إغلاق المعاينة"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-200 overflow-auto p-4 flex items-start justify-center">
              {isLoadingZoom || !zoomDataUrl ? (
                <div className="my-auto text-center space-y-2 text-slate-600">
                  <RefreshCw size={28} className="animate-spin mx-auto text-sky-600" />
                  <p className="text-xs font-bold">جاري تحميل الصفحة بدقة عالية...</p>
                </div>
              ) : (
                <img
                  src={zoomDataUrl}
                  alt={`صفحة ${zoomPageNumber}`}
                  className="max-w-full h-auto rounded-xl shadow-lg bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Direct In-Page PDF Editor Modal */}
      {editingPageNumber !== null && editingPdfBuffer && (
        <PdfPageEditorModal
          pdfBuffer={editingPdfBuffer}
          pageNumber={editingPageNumber}
          totalPages={pageCount}
          catalogName={catalog.name}
          onSaveModifiedPdf={saveModifiedPdfBytes}
          onClose={() => {
            setEditingPageNumber(null);
            setEditingPdfBuffer(null);
          }}
        />
      )}

      {/* AI Convert to Full Editable Catalog Modal */}
      {showConvertModal && onConvertToEditableCatalog && (
        <div
          dir="rtl"
          className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    تحويل الـ PDF لكتالوج منتجات تفاعلي بالكامل
                  </h3>
                  <p className="text-xs text-slate-500">
                    قراءة كل منتج وصورته وسعره بالذكاء الاصطناعي لتعمل عليه كأنك أنشأته هنا
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConvertModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  1. الأسعار المكتوبة داخل ملف الـ PDF هي:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setConvertPriceMode('selling')}
                    className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                      convertPriceMode === 'selling'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-extrabold text-xs">أسعار بيع جاهزة للعملاء</div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      كتالوج أعددته من جهاز آخر بأسعار البيع النهائية
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConvertPriceMode('wholesale')}
                    className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                      convertPriceMode === 'wholesale'
                        ? 'bg-sky-50 border-sky-500 text-sky-950'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-extrabold text-xs">أسعار جملة (مورد)</div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      لتسعيرها وإضافة هامش الربح من جدول التسعير
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  2. طريقة الحفظ بعد الاستخراج:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setConvertMode('replace')}
                    className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                      convertMode === 'replace'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-950'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-extrabold text-xs">تحويل هذا الكتالوج بالكامل</div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      فتح جميع المنتجات هنا لتعديل أو حذف أو إضافة أي منتج مباشرة
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConvertMode('copy')}
                    className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                      convertMode === 'copy'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-950'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-extrabold text-xs">إنشاء نسخة تفاعلية جديدة</div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      يحتفظ بالـ PDF الأصلي كما هو وينشئ كتالوجاً جديداً للتعديل
                    </div>
                  </button>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900">
                💡 بعد التحويل ستظهر لك كل المنتجات بأسمائها وصورها وأسعارها، ويمكنك تعديل أي منتج، حذف أي صنف، إضافة منتجات جديدة، تغيير الأعمدة، أو تصدير إكسيل و PDF جديد.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConvertModal(false)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConvertModal(false);
                  onConvertToEditableCatalog(convertMode, convertPriceMode);
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                <Sparkles size={15} />
                <span>بدء الاستخراج والتحويل الآن ({pageCount} صفحة)</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Multi-file Split PDF Modal */}
      <PdfSplitExportModal
        isOpen={showSplitModal}
        onClose={() => {
          setShowSplitModal(false);
          setSplitPdfBuffer(null);
        }}
        products={[]}
        settings={{
          company_name: catalog.company_name || catalog.name,
          store_name: catalog.name,
          business_bio: catalog.business_bio || '',
          phone: catalog.phone || '',
          whatsapp_number: catalog.whatsapp_number || '',
          secondary_phone: '',
          address: '',
          email: '',
          tax_or_cr_number: '',
          footer_note: catalog.footer_note || '',
          catalog_title: catalog.name,
          logo_url: catalog.logo_url || '',
          primary_color: catalog.primary_color || '#ea580c',
          watermark_type: 'none',
          watermark_opacity: 0.08,
          watermark_size: 250,
          products_per_row: catalog.columns_count || 4,
          show_available_models: false,
          show_specification: false,
          show_brand_on_card: false,
          detected_price_target: 'wholesale',
        }}
        externalPdfBuffer={splitPdfBuffer}
        catalogTitle={catalog.name}
        totalEstimatedPages={Math.max(1, pageCount)}
      />
    </div>
  );
};
