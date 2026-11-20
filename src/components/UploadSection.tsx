import React, { useState, useRef, useEffect } from 'react';
import {
  Product,
  ProductCategory,
  ALL_CATEGORIES,
  PageImageItem,
  PageExtractionReport,
  CatalogSettings,
  BatchSession,
} from '../types';
import { loadPdfDocument, renderPdfPageToImage, renderImageFileToPageItem } from '../utils/pdfExtractor';
import { cropAndCompressProductImage, isBoxValid } from '../utils/imageCropper';
import {
  saveProduct,
  saveProductsBatch,
  markFileProcessed,
  clearWorkspaceData,
  createAutoBackupSnapshot,
  logApiUsage,
  getAllExtractionReports,
  saveExtractionReport,
} from '../utils/db';
import { parseExcelSheetToProducts } from '../utils/excelHelper';
import { ManualProductModal } from './ManualProductModal';
import { IncompleteProductsTable } from './IncompleteProductsTable';
import { ImageProcessingQueueManager } from './ImageProcessingQueueManager';
import { BatchProcessingManager } from './BatchProcessingManager';
import { ExcelSpreadsheetTab } from './ExcelSpreadsheetTab';
import { useUiFeedback } from './UiFeedbackProvider';
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  Play,
  Pause,
  RefreshCw,
  RotateCcw,
  ChevronRight,
  Layers,
  FileCheck2,
  Image as ImageIcon,
  Plus,
  X,
  Bot,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';

interface UploadSectionProps {
  existingProducts: Product[];
  onProductsUpdated: (newProducts: Product[]) => void;
  onNavigateToPricing: () => void;
  settings: CatalogSettings;
  activeBatchSession?: BatchSession | null;
  onClearActiveBatchSession?: () => void;
  onSettingsUpdated?: (newSettings: CatalogSettings) => void;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  existingProducts,
  onProductsUpdated,
  onNavigateToPricing,
  settings,
  activeBatchSession,
  onClearActiveBatchSession,
  onSettingsUpdated,
}) => {
  const { toast, confirm } = useUiFeedback();
  const [activeView, setActiveView] = useState<
    'pdf_upload' | 'images_upload' | 'excel_sheet' | 'incomplete' | 'reports'
  >('pdf_upload');

  // PDF processing states
  const [filesQueue, setFilesQueue] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [totalPagesCount, setTotalPagesCount] = useState<number>(0);
  const [resumePageNumber, setResumePageNumber] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Standalone Images Queue states
  const [imageFilesQueue, setImageFilesQueue] = useState<File[]>([]);
  const [imageProcessingMode, setImageProcessingMode] = useState<'ai' | 'manual'>('ai');

  // Reports & Modals
  const [extractionReports, setExtractionReports] = useState<PageExtractionReport[]>([]);
  const [showManualModal, setShowManualModal] = useState(false);
  const [skipCoverAndBack, setSkipCoverAndBack] = useState(true);

  const pauseRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Load existing reports on mount
  useEffect(() => {
    getAllExtractionReports().then((reports) => setExtractionReports(reports));
  }, []);

  useEffect(() => {
    pauseRef.current = isPaused;
  }, [isPaused]);

  const categoryNames =
    settings.categories && settings.categories.length > 0
      ? settings.categories.map((c) => c.name)
      : ALL_CATEGORIES;

  // Count incomplete products (matches IncompleteProductsTable criteria)
  const incompleteCount = existingProducts.filter(
    (p) =>
      !p.name?.trim() ||
      !p.selling_price ||
      p.selling_price <= 0 ||
      Boolean(p.needs_crop_adjustment)
  ).length;

  const [activePdfBatchFile, setActivePdfBatchFile] = useState<File | null>(null);

  // Handle PDF, image, or Excel files selected
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const selected = Array.from(e.target.files);
    e.target.value = '';

    const isExcelFile = (f: File) => {
      const lower = f.name.toLowerCase();
      return (
        lower.endsWith('.xlsx') ||
        lower.endsWith('.xls') ||
        lower.endsWith('.csv') ||
        lower.endsWith('.tsv')
      );
    };

    const excelFiles = selected.filter(isExcelFile);
    const otherFiles = selected.filter((f) => !isExcelFile(f));

    if (excelFiles.length > 0) {
      let currentList = [...existingProducts];
      let totalAdded = 0;
      let totalUpdated = 0;

      for (const xl of excelFiles) {
        try {
          const result = await parseExcelSheetToProducts(xl, currentList, categoryNames);
          const { updatedProducts, newProducts } = result;
          if (updatedProducts.length > 0 || newProducts.length > 0) {
            const updatedMap = new Map(updatedProducts.map((p) => [p.id, p]));
            currentList = [...newProducts, ...currentList.map((p) => updatedMap.get(p.id) || p)];
            await saveProductsBatch([...newProducts, ...updatedProducts]);
            totalAdded += newProducts.length;
            totalUpdated += updatedProducts.length;
          }
        } catch (err: any) {
          toast.error(`تعذر استيراد "${xl.name}": ${err?.message || 'ملف إكسيل غير صالح'}`);
        }
      }

      if (totalAdded > 0 || totalUpdated > 0) {
        onProductsUpdated(currentList);
        toast.success(
          `تم استيراد الإكسيل بنجاح: إضافة ${totalAdded} صنف وتحديث ${totalUpdated} صنف.`
        );
        setActiveView('excel_sheet');
      }
    }

    if (otherFiles.length > 0) {
      setFilesQueue((prev) => [...prev, ...otherFiles]);
      const firstPdf = otherFiles.find((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
      if (firstPdf) {
        setActivePdfBatchFile(firstPdf);
      }
    }
  };

  // Handle multiple product images selected
  const handleImagesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const selected = Array.from(e.target.files);
    setImageFilesQueue((prev) => [...prev, ...selected]);
    e.target.value = '';
  };

  // Start fresh
  const handleStartFresh = async () => {
    const ok = await confirm({
      title: 'مسح مساحة العمل والبدء من جديد',
      message: 'هل تريد مسح جميع المنتجات والجلسات والتقارير السابقة والبدء من جديد؟ سيتم حفظ نسخة تلقائية احتياطية في المتصفح قبل المسح.',
      confirmLabel: 'مسح وابدأ من جديد',
      danger: true,
    });
    if (!ok) return;

    await createAutoBackupSnapshot('قبل ابدأ من جديد');
    await clearWorkspaceData();
    onProductsUpdated([]);
    onClearActiveBatchSession?.();
    setActivePdfBatchFile(null);
    setFilesQueue([]);
    setImageFilesQueue([]);
    setExtractionReports([]);
    setResumePageNumber(null);
    setCurrentPageIndex(0);
    setTotalPagesCount(0);
    setStatusMessage('تم مسح البيانات القديمة بنجاح! يمكنك الآن رفع ملفاتك والبدء بنظافة.');
    toast.success('تم مسح البيانات القديمة وحفظ لقطة احتياطية تلقائية بنجاح.');
  };

  // Resolve Category
  const resolveCategory = (rawCategory: string, name: string, sectionTitle: string): ProductCategory => {
    const textToCheck = `${name} ${rawCategory} ${sectionTitle}`.toLowerCase();
    if (
      textToCheck.includes('مايك') ||
      textToCheck.includes('ميك') ||
      textToCheck.includes('مايكات') ||
      textToCheck.includes('mic')
    ) {
      return 'ميك';
    }
    if (ALL_CATEGORIES.includes(rawCategory as ProductCategory)) {
      return rawCategory as ProductCategory;
    }
    if (textToCheck.includes('ايربودز') || textToCheck.includes('airpod')) return 'ايربودز';
    if (textToCheck.includes('هيدفون') || textToCheck.includes('headphone')) return 'هيدفون';
    if (textToCheck.includes('هاند فري') || textToCheck.includes('سماعة سلك')) return 'هاند فري';
    if (textToCheck.includes('شاحن سيارة')) return 'شاحن سيارة';
    if (textToCheck.includes('رأس شاحن') || textToCheck.includes('راس شاحن')) return 'رأس شاحن';
    if (textToCheck.includes('شاحن حيطة') || textToCheck.includes('شاحن')) return 'شاحن حيطة';
    if (textToCheck.includes('باوربانك') || textToCheck.includes('باور بانك')) return 'باوربانك';
    if (textToCheck.includes('كابل') || textToCheck.includes('وصلة')) return 'كابل';
    if (textToCheck.includes('قلم') || textToCheck.includes('stylus')) return 'قلم';
    return 'متنوعة';
  };

  // PDF/image direct page extraction runner
  const startProcessing = async (resumeFromPage?: number) => {
    if (filesQueue.length === 0) return;

    setIsProcessing(true);
    setIsPaused(false);
    pauseRef.current = false;

    let updatedProductsList = [...existingProducts];
    let currentReports = [...extractionReports];
    let hadFatalError = false;

    for (let fIdx = 0; fIdx < filesQueue.length; fIdx++) {
      if (pauseRef.current) break;

      const file = filesQueue[fIdx];
      setStatusMessage(`جاري فتح وتجهيز ملف "${file.name}"...`);

      const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
      let pdfDoc: any = null;
      let totalPages = 1;

      try {
        if (isPdf) {
          pdfDoc = await loadPdfDocument(file);
          totalPages = pdfDoc.numPages;
        }
      } catch (err: any) {
        toast.error(`تعذر فتح ملف "${file.name}": ${err.message || 'ملف غير صالح'}`);
        continue;
      }

      setTotalPagesCount(totalPages);
      const defaultStartPage = skipCoverAndBack && totalPages >= 3 ? 2 : 1;
      const startPage = resumeFromPage || resumePageNumber || defaultStartPage;
      const endPage = skipCoverAndBack && totalPages >= 3 ? totalPages - 1 : totalPages;

      for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        if (pauseRef.current) {
          setResumePageNumber(pageNum);
          setStatusMessage(`تم إيقاف المعالجة مؤقتاً عند صفحة ${pageNum}.`);
          setIsProcessing(false);
          return;
        }

        setCurrentPageIndex(pageNum);
        setStatusMessage(`جاري تحويل وقراءة صفحة ${pageNum} من ${totalPages}...`);

        let pageItem: PageImageItem;
        try {
          if (isPdf) {
            pageItem = await renderPdfPageToImage(pdfDoc, pageNum);
          } else {
            pageItem = await renderImageFileToPageItem(file);
          }
        } catch {
          continue;
        }

        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-gemini-model': settings.primary_model || 'gemini-4-hydrogen',
          };
          if (settings.fallback_model) {
            headers['x-gemini-fallback-model'] = settings.fallback_model;
          }

          const response = await fetch('/api/gemini/extract-products', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              imageBase64: pageItem.base64Data,
              mimeType: pageItem.mimeType,
              pageNumber: pageNum,
              totalPages: totalPages,
              isRetry: false,
            }),
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            const msg = data.friendlyMessage || `خطأ (${response.status})`;
            if (response.status === 401 || data.isInvalidKey || data.isDailyQuota) {
              setResumePageNumber(pageNum);
              setStatusMessage(msg);
              toast.error(msg);
              hadFatalError = true;
              break;
            }
            throw new Error(msg);
          }

          if (data.usage) {
            const inputTokens = data.usage.input_tokens || data.usage.promptTokenCount || 0;
            const outputTokens = data.usage.output_tokens || data.usage.candidatesTokenCount || 0;
            const inputCostUsd =
              (inputTokens / 1_000_000) * (settings.gemini_input_cost_per_million_usd || 0.1);
            const outputCostUsd =
              (outputTokens / 1_000_000) * (settings.gemini_output_cost_per_million_usd || 0.4);
            const totalCostUsd = inputCostUsd + outputCostUsd;
            const totalCostEgp = totalCostUsd * (settings.usd_to_egp_rate || 50);

            await logApiUsage({
              id: `log_upload_${Date.now()}_p${pageNum}`,
              timestamp: Date.now(),
              file_name: file.name,
              page_number: pageNum,
              model: data.model || settings.primary_model || 'gemini-4-hydrogen',
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              total_tokens: inputTokens + outputTokens,
              cost_usd: totalCostUsd,
              cost_egp: totalCostEgp,
            }).catch(() => {});
          }

          const rawProducts: any[] = data.products || [];
          const sectionTitle: string = data.section_title || '';

          const pageProducts: Product[] = [];
          for (let idx = 0; idx < rawProducts.length; idx++) {
            const item = rawProducts[idx];
            if (!item.name || typeof item.name !== 'string') continue;

            const cleanWholesale =
              typeof item.wholesale_price === 'number'
                ? item.wholesale_price
                : Number(String(item.wholesale_price).replace(/[^0-9.]/g, '')) || 0;

            const category = resolveCategory(item.category || '', item.name, sectionTitle);
            const box = item.box_2d as [number, number, number, number] | undefined;
            const boxOk = isBoxValid(box);

            let croppedImage: string | undefined = undefined;
            if (boxOk && box) {
              croppedImage = await cropAndCompressProductImage(pageItem.dataUrl, box);
            }

            const cardIndex = item.card_index || idx + 1;
            const newProduct: Product = {
              id: `prod_p${pageNum}_c${cardIndex}_${idx}_${Date.now()}`,
              code: item.code || `PRD-P${pageNum}-${cardIndex}`,
              name: item.name.trim(),
              category: category,
              group: item.group || '',
              model: item.model || '',
              specification: item.specification || '',
              wholesale_price: cleanWholesale,
              selling_price: 0,
              included_in_catalog: false,
              available_models: Array.isArray(item.available_models) ? item.available_models : [],
              image_url: croppedImage,
              box_2d: box,
              raw_bounding_box: box,
              page_number: pageNum,
              card_index: cardIndex,
              section_title: sectionTitle,
              needs_crop_adjustment: !boxOk || !croppedImage,
              source_file: file.name,
              created_at: Date.now(),
              updated_at: Date.now(),
            };

            await saveProduct(newProduct);
            pageProducts.push(newProduct);
          }

          const report: PageExtractionReport = {
            id: `${file.name}_p${pageNum}`,
            file_name: file.name,
            page_number: pageNum,
            section_title: sectionTitle || 'عام',
            cards_detected: rawProducts.length,
            products_saved: pageProducts.length,
            is_warning: pageProducts.length < 4,
            warning_message:
              pageProducts.length < 4
                ? `تم حفظ ${pageProducts.length} صنف فقط من هذه الصفحة (المعتاد 5-6 كروت).`
                : undefined,
            timestamp: Date.now(),
          };

          await saveExtractionReport(report);
          updatedProductsList = [...updatedProductsList, ...pageProducts];
          currentReports = [...currentReports.filter((r) => r.id !== report.id), report];

          onProductsUpdated(updatedProductsList);
          setExtractionReports(currentReports);

          await new Promise((r) => setTimeout(r, 2000));
        } catch (err: any) {
          console.error(err);
          const msg = err?.message || 'حدث خطأ أثناء قراءة الصفحة';
          setStatusMessage(`تعذر قراءة صفحة ${pageNum}: ${msg}`);
          toast.error(`صفحة ${pageNum}: ${msg}`);
        }
      }

      if (hadFatalError) break;
      await markFileProcessed(file.name, file.size, file.lastModified);
    }

    setIsProcessing(false);
    if (!hadFatalError) {
      setResumePageNumber(null);
      setStatusMessage('اكتملت قراءة صفحات الملف بنجاح!');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Subtabs */}
      <div className="bg-gradient-to-l from-sky-50 to-white p-5 rounded-2xl border border-sky-100 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-sky-600/20">
              <Layers size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                المرحلة 1: قراءة القوائم ورفع صور المنتجات
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                قراءة ملفات PDF، رفع صور متعددة دفعة واحدة، إضافة منتجات يدوياً، وإكمال البيانات الناقصة.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Button: Add Single Product Manually */}
            <button
              onClick={() => setShowManualModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs"
            >
              <Plus size={15} />
              إضافة منتج يدوي
            </button>

            {/* Start Fresh */}
            <button
              onClick={handleStartFresh}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-600 font-bold rounded-xl text-xs transition-colors cursor-pointer border border-slate-200 disabled:opacity-50"
              title="مسح المنتجات للبدء بنظافة"
            >
              <RotateCcw size={14} />
              ابدأ من جديد
            </button>
          </div>
        </div>

        {/* Navigation Tabs between PDF, Direct Images, Incomplete, and Reports (Single-row scrollable with >= 44px touch targets) */}
        <div className="flex items-center gap-2 pt-4 mt-2 border-t border-sky-100 overflow-x-auto no-scrollbar pb-1 flex-nowrap">
          <button
            type="button"
            onClick={() => setActiveView('pdf_upload')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 min-h-[44px] whitespace-nowrap cursor-pointer ${
              activeView === 'pdf_upload'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <FileText size={16} />
            <span>قراءة ملفات PDF ({filesQueue.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('images_upload')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 min-h-[44px] whitespace-nowrap cursor-pointer ${
              activeView === 'images_upload'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ImageIcon size={16} />
            <span>رفع صور منتجات ({imageFilesQueue.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('excel_sheet')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 min-h-[44px] whitespace-nowrap cursor-pointer ${
              activeView === 'excel_sheet'
                ? 'bg-[#107C41] text-white shadow-xs'
                : 'bg-white text-emerald-800 hover:bg-emerald-50 border border-emerald-200'
            }`}
          >
            <FileSpreadsheet size={16} />
            <span>شريط إكسيل وتصدير داخلي ({existingProducts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('incomplete')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 min-h-[44px] whitespace-nowrap cursor-pointer ${
              activeView === 'incomplete'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <AlertTriangle size={16} className={incompleteCount > 0 ? 'text-amber-400' : ''} />
            <span>منتجات تحتاج إكمال ({incompleteCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('reports')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 min-h-[44px] whitespace-nowrap cursor-pointer ${
              activeView === 'reports'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <FileCheck2 size={16} />
            <span>تقرير القراءة ({extractionReports.length} صفحة)</span>
          </button>
        </div>
      </div>

      {/* VIEW: DIRECT PRODUCT PHOTOS UPLOAD (USER REQUEST 2) */}
      {activeView === 'images_upload' && (
        <div className="space-y-5">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <ImageIcon size={18} className="text-sky-600" />
                  رفع صور منتجات متعددة مباشرة
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  حدد أي عدد من صور العلب أو المنتجات. كل صورة ستتحول لمنتج في الكتالوج.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={imageInputRef}
                  onChange={handleImagesSelected}
                  multiple
                  accept="image/*"
                  className="hidden"
                />
                <button
                  onClick={() => imageInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer"
                >
                  <UploadCloud size={16} />
                  اختيار صور المنتجات
                </button>
              </div>
            </div>

            {/* Mode Selection: AI extraction vs Manual skip */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-slate-800">
                طريقة معالجة الصور المختارة:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                    imageProcessingMode === 'ai'
                      ? 'border-sky-500 bg-white ring-1 ring-sky-500 text-sky-950 shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="image_mode"
                    checked={imageProcessingMode === 'ai'}
                    onChange={() => setImageProcessingMode('ai')}
                    className="mt-0.5 text-sky-600"
                  />
                  <div>
                    <span className="font-bold text-xs flex items-center gap-1.5">
                      <Bot size={15} className="text-sky-600" />
                      قراءة بالذكاء الاصطناعي (Gemini Flash)
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5 leading-relaxed">
                      يستخرج الاسم، الموديل، المواصفة وسعر الجملة فقط إن كان مكتوباً بوضوح على العلبة بدون تخمين (بفاصل ثانيتين).
                    </span>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                    imageProcessingMode === 'manual'
                      ? 'border-sky-500 bg-white ring-1 ring-sky-500 text-sky-950 shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="image_mode"
                    checked={imageProcessingMode === 'manual'}
                    onChange={() => setImageProcessingMode('manual')}
                    className="mt-0.5 text-sky-600"
                  />
                  <div>
                    <span className="font-bold text-xs flex items-center gap-1.5">
                      <UserCheck size={15} className="text-emerald-600" />
                      بدون ذكاء اصطناعي (تجاهل القراءة)
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5 leading-relaxed">
                      يتم حفظ المنتج بالصورة فقط مباشرة وتنتقل لجدول إكمال البيانات لكتابة الأسماء والأسعار يدوياً.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Selected Images Queue & Live Progress Dashboard */}
            {imageFilesQueue.length > 0 && (
              <div className="pt-2">
                <ImageProcessingQueueManager
                  files={imageFilesQueue}
                  mode={imageProcessingMode}
                  settings={settings}
                  existingProducts={existingProducts}
                  onProductsUpdated={onProductsUpdated}
                  onClearQueue={() => setImageFilesQueue([])}
                  onRemoveFile={(fileToRemove) =>
                    setImageFilesQueue((prev) => prev.filter((f) => f !== fileToRemove))
                  }
                  onReplaceFile={(oldFile, newFile) =>
                    setImageFilesQueue((prev) => prev.map((f) => (f === oldFile ? newFile : f)))
                  }
                  onNavigateToIncomplete={() => setActiveView('incomplete')}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW: INTERACTIVE EXCEL SPREADSHEET & INTERNAL EXPORT */}
      {activeView === 'excel_sheet' && (
        <ExcelSpreadsheetTab
          products={existingProducts}
          settings={settings}
          onProductsUpdated={onProductsUpdated}
          onSettingsUpdated={onSettingsUpdated}
          onNavigateToPricing={onNavigateToPricing}
        />
      )}

      {/* VIEW: INCOMPLETE PRODUCTS TABLE (USER REQUEST 2) */}
      {activeView === 'incomplete' && (
        <IncompleteProductsTable
          products={existingProducts}
          categories={categoryNames}
          onProductsUpdated={onProductsUpdated}
          onNavigateToCatalog={onNavigateToPricing}
        />
      )}

      {/* VIEW: PDF PROCESSING */}
      {activeView === 'pdf_upload' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={skipCoverAndBack}
                onChange={(e) => setSkipCoverAndBack(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4 cursor-pointer"
              />
              <span>تخطي الغلاف الأول والأخير تلقائياً (لوجو المورد)</span>
            </label>

            <div className="flex items-center gap-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFilesSelected}
                multiple
                accept=".pdf,.xlsx,.xls,.csv,.tsv,image/png,image/jpeg,image/webp"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing && !isPaused}
                className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs shadow-md shadow-sky-600/25 transition-all cursor-pointer disabled:opacity-50"
              >
                <UploadCloud size={16} />
                رفع ملف PDF
              </button>
            </div>
          </div>

          {/* Batched Processing Manager (Feature 1, 2, 3) */}
          {(activeBatchSession || activePdfBatchFile) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-800 bg-sky-50 px-3 py-1 rounded-lg border border-sky-200">
                  ⚡ وضع المعالجة على دفعات (حفظ فوري في المتصفح وحماية استيقاظ الشاشة)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActivePdfBatchFile(null);
                    onClearActiveBatchSession?.();
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  إخفاء المعالج
                </button>
              </div>

              <BatchProcessingManager
                file={activePdfBatchFile}
                existingSession={activeBatchSession}
                settings={settings}
                existingProducts={existingProducts}
                onProductsUpdated={onProductsUpdated}
                onSettingsUpdated={onSettingsUpdated}
                onCancel={() => {
                  setActivePdfBatchFile(null);
                  onClearActiveBatchSession?.();
                }}
              />
            </div>
          )}

          {/* Files Queue */}
          {filesQueue.length > 0 && !activePdfBatchFile && !activeBatchSession && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="font-bold text-slate-800 text-xs">قائمة ملفات PDF ({filesQueue.length} ملف)</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setActivePdfBatchFile(filesQueue[0])}
                    className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs"
                  >
                    <Layers size={14} />
                    معالجة على دفعات (موصى بها)
                  </button>
                  {!isProcessing ? (
                    <button
                      onClick={() => startProcessing(resumePageNumber || undefined)}
                      className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs"
                    >
                      <Play size={14} />
                      {resumePageNumber ? `كمّل من صفحة ${resumePageNumber}` : 'بدء قراءة الصفحات'}
                    </button>
                  ) : isPaused ? (
                    <button
                      onClick={() => startProcessing(resumePageNumber || undefined)}
                      className="flex items-center gap-2 px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                    >
                      <Play size={14} />
                      كمّل من صفحة {resumePageNumber || currentPageIndex}
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsPaused(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      <Pause size={14} />
                      إيقاف مؤقت
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filesQueue.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <FileText size={16} className="text-sky-600 shrink-0" />
                      <span className="font-bold text-slate-800 truncate">{file.name}</span>
                    </div>
                    {!isProcessing && (
                      <button
                        onClick={() => setFilesQueue((p) => p.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {isProcessing && (
            <div className="bg-white p-5 rounded-2xl border border-sky-200 shadow-md space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span className="flex items-center gap-2">
                  <RefreshCw className="animate-spin text-sky-600" size={16} />
                  {statusMessage}
                </span>
                <span className="bg-sky-50 text-sky-800 px-2.5 py-1 rounded-lg font-mono">
                  صفحة {currentPageIndex} من {totalPagesCount}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-sky-600 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${totalPagesCount > 0 ? (currentPageIndex / totalPagesCount) * 100 : 5}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW: EXTRACTION REPORTS */}
      {activeView === 'reports' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <h3 className="font-bold text-slate-800 text-xs flex items-center gap-2">
              <FileCheck2 size={16} className="text-sky-600" />
              سجل تقارير قراءة صفحات الكتالوج ({extractionReports.length} صفحة)
            </h3>
            <button
              onClick={onNavigateToPricing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs cursor-pointer"
            >
              الانتقال للتسعير
              <ChevronRight size={14} />
            </button>
          </div>

          {extractionReports.length === 0 ? (
            <div className="bg-white p-12 text-center text-slate-400 rounded-2xl border border-slate-200 text-xs">
              لا توجد صفحات مسجلة حتى الآن.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {extractionReports.map((report) => (
                <div
                  key={report.id}
                  className={`bg-white rounded-xl p-3.5 border transition-all text-xs flex flex-col justify-between ${
                    report.is_warning ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className="font-bold text-slate-800">صفحة {report.page_number}</span>
                      {report.is_warning ? (
                        <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded font-bold">
                          تنبيه: عدد قليل
                        </span>
                      ) : (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                          مكتمل
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">عنوان القسم:</span>
                      <span className="font-bold text-sky-900 block truncate">{report.section_title}</span>
                    </div>
                    <div className="flex justify-between bg-slate-50 p-2 rounded-lg text-center text-[11px]">
                      <span>كروت: <strong>{report.cards_detected}</strong></span>
                      <span>أصناف: <strong className="text-emerald-700">{report.products_saved}</strong></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual Product Creation Modal */}
      {showManualModal && (
        <ManualProductModal
          categories={categoryNames}
          onProductCreated={(newProd) => {
            onProductsUpdated([...existingProducts, newProd]);
          }}
          onClose={() => setShowManualModal(false)}
        />
      )}
    </div>
  );
};
