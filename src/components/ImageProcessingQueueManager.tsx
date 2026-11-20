import React, { useState, useEffect, useRef } from 'react';
import { Product, ProductCategory, CatalogSettings } from '../types';
import {
  compressUploadedImage,
  cropAndCompressProductImage,
  isBoxValid,
  readFileAsWorkingDataUrl,
  dataUrlToFile,
} from '../utils/imageCropper';
import { saveProduct, logApiUsage } from '../utils/db';
import { CropAdjustModal } from './CropAdjustModal';
import {
  Play,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Copy,
  Check,
  ChevronRight,
  FileText,
  AlertCircle,
  X,
  FileQuestion,
  ListFilter,
  Crop,
  Trash2,
} from 'lucide-react';

export type ImageItemStatus = 'pending' | 'processing' | 'success' | 'needs_review' | 'failed';
export type MicroStep = 'reading' | 'resizing' | 'ai_analysis' | 'saving_db' | 'creating_product' | 'done';

export interface ImageQueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  thumbnailUrl?: string;
  status: ImageItemStatus;
  currentStep?: MicroStep;
  currentStepLabel?: string;
  errorReason?: string;
  durationSeconds?: number;
  startTime?: number;
  endTime?: number;
}

interface ImageProcessingQueueManagerProps {
  files: File[];
  mode: 'ai' | 'manual';
  settings: CatalogSettings;
  existingProducts: Product[];
  onProductsUpdated: (products: Product[]) => void;
  onClearQueue: () => void;
  onRemoveFile?: (fileToRemove: File) => void;
  onReplaceFile?: (oldFile: File, newFile: File) => void;
  onNavigateToIncomplete: () => void;
}

export const ImageProcessingQueueManager: React.FC<ImageProcessingQueueManagerProps> = ({
  files,
  mode,
  settings,
  existingProducts,
  onProductsUpdated,
  onRemoveFile,
  onReplaceFile,
  onNavigateToIncomplete,
}) => {
  // Queue items state
  const [items, setItems] = useState<ImageQueueItem[]>(() =>
    files.map((file, idx) => ({
      id: `queue_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      file,
      name: file.name,
      size: file.size,
      thumbnailUrl: file.type?.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      status: 'pending',
    }))
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [currentStepName, setCurrentStepName] = useState<string>('في انتظار البدء');
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isStalled, setIsStalled] = useState(false);
  const [hasFinished, setHasFinished] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [filterView, setFilterView] = useState<'all' | 'failed' | 'needs_review'>('all');
  const [editingQueueItem, setEditingQueueItem] = useState<{
    item: ImageQueueItem;
    rawUrl: string;
  } | null>(null);

  const cancelRef = useRef(false);
  const lastProgressRef = useRef(Date.now());
  const timerIntervalRef = useRef<any>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const existingProductsRef = useRef<Product[]>(existingProducts);
  existingProductsRef.current = existingProducts;

  // Sync new incoming files (including newly appended files after previous batch finished)
  useEffect(() => {
    if (isProcessing) return;
    setItems((prev) => {
      const existingByFile = new Map(prev.map((it) => [it.file, it]));
      const nextItems = files.map((file, idx) => {
        const existing = existingByFile.get(file);
        if (existing) return existing;
        return {
          id: `queue_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          file,
          name: file.name,
          size: file.size,
          thumbnailUrl: file.type?.startsWith('image/') ? URL.createObjectURL(file) : undefined,
          status: 'pending' as ImageItemStatus,
        };
      });
      const hasNewPending = nextItems.some((it) => it.status === 'pending');
      if (hasNewPending && hasFinished) {
        setHasFinished(false);
      }
      return nextItems;
    });
  }, [files, isProcessing, hasFinished]);

  const handleOpenItemEditor = async (item: ImageQueueItem) => {
    if (isProcessing) return;
    try {
      const rawUrl = await readFileAsWorkingDataUrl(item.file, 1200);
      setEditingQueueItem({ item, rawUrl });
    } catch {
      if (item.thumbnailUrl) {
        setEditingQueueItem({ item, rawUrl: item.thumbnailUrl });
      }
    }
  };

  const handleRemoveQueueItem = (item: ImageQueueItem) => {
    if (isProcessing) return;
    setItems((prev) => prev.filter((it) => it.id !== item.id));
    onRemoveFile?.(item.file);
  };

  // Elapsed time & Watchdog timer
  useEffect(() => {
    if (isProcessing) {
      const startTime = Date.now() - elapsedSeconds * 1000;
      timerIntervalRef.current = setInterval(() => {
        const now = Date.now();
        setElapsedSeconds(Math.floor((now - startTime) / 1000));

        // 30-second stall watchdog
        if (now - lastProgressRef.current > 30000) {
          setIsStalled(true);
        } else {
          setIsStalled(false);
        }
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isProcessing]);

  // Counts
  const totalCount = items.length;
  const successCount = items.filter((i) => i.status === 'success').length;
  const needsReviewCount = items.filter((i) => i.status === 'needs_review').length;
  const failedCount = items.filter((i) => i.status === 'failed').length;
  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const processedCount = successCount + needsReviewCount + failedCount;

  // Percentage calculation
  const progressPercent = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;

  // Estimated remaining time in seconds
  const avgDurationPerImage =
    processedCount > 0 ? elapsedSeconds / processedCount : mode === 'ai' ? 3.5 : 0.8;
  const estimatedRemainingSec = Math.max(0, Math.round(pendingCount * avgDurationPerImage));

  // Format time MM:SS
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Fetch with AbortController 55s timeout
  const fetchWithAbort = async (url: string, init: RequestInit, timeoutMs = 55000): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('انتهت مهلة الاتصال بخدمة Gemini (55 ثانية)');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };

  // Human-readable error translator
  const formatFriendlyError = (err: any): string => {
    if (!err) return 'خطأ غير محدد';
    const msg = (err.message || String(err)).trim();

    if (msg.includes('انتهت المهلة') || msg.includes('انتهت مهلة') || msg.includes('timeout')) {
      return msg;
    }
    if (msg.includes('QuotaExceeded') || msg.includes('مساحة')) {
      return 'مساحة تخزين المتصفح ممتلئة (يرجى حذف بعض المنتجات القديمة)';
    }
    if (msg.includes('ليس صورة') || msg.includes('not an image')) {
      return 'الملف مش صورة صالحة أو امتداده غير مدعوم';
    }
    if (msg.includes('تالفة') || msg.includes('decode') || msg.includes('Corrupt')) {
      return 'ملف الصورة تالف أو تعذر فك تشفيره';
    }
    if (msg.includes('IndexedDB') || msg.includes('database')) {
      return 'فشل الحفظ في قاعدة بيانات المتصفح (IndexedDB)';
    }
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      return 'ضغط مؤقت على خدمة Gemini (تم تجاوز الحد المسموح)';
    }
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return 'انقطاع في الاتصال بالخادم المحلي';
    }

    return msg;
  };

  // Resolve category helper
  const resolveCategory = (rawCategory: string, name: string): ProductCategory => {
    const text = `${name} ${rawCategory}`.toLowerCase();
    if (text.includes('مايك') || text.includes('ميك') || text.includes('mic')) return 'ميك';
    if (text.includes('ايربودز') || text.includes('airpod')) return 'ايربودز';
    if (text.includes('هيدفون') || text.includes('headphone')) return 'هيدفون';
    if (text.includes('هاند فري') || text.includes('سماعة سلك')) return 'هاند فري';
    if (text.includes('شاحن سيارة')) return 'شاحن سيارة';
    if (text.includes('رأس شاحن') || text.includes('راس شاحن')) return 'رأس شاحن';
    if (text.includes('شاحن حيطة') || text.includes('شاحن')) return 'شاحن حيطة';
    if (text.includes('باوربانك') || text.includes('باور بانك')) return 'باوربانك';
    if (text.includes('كابل') || text.includes('وصلة')) return 'كابل';
    if (text.includes('قلم') || text.includes('stylus')) return 'قلم';
    return 'متنوعة';
  };

  // Start processing runner
  const startProcessingQueue = async (itemsToProcess?: ImageQueueItem[]) => {
    const queue = itemsToProcess || items;
    if (queue.length === 0) return;

    setIsProcessing(true);
    cancelRef.current = false;
    setHasFinished(false);
    setIsStalled(false);
    lastProgressRef.current = Date.now();

    let currentProductsList = [...existingProductsRef.current];
    const updatedItems = [...queue];

    // Calculate next unique IMG numeric sequence
    let nextImgNumber = currentProductsList.reduce((max, p) => {
      const match = /^IMG-(\d+)$/i.exec((p.code || '').trim());
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, currentProductsList.length);

    for (let i = 0; i < updatedItems.length; i++) {
      if (cancelRef.current) {
        break;
      }

      // Skip already successful items if retrying
      if (updatedItems[i].status === 'success') {
        continue;
      }

      const item = updatedItems[i];
      const imgFile = item.file;
      const itemStartTime = Date.now();

      setCurrentIndex(i);
      setCurrentFileName(item.name);
      lastProgressRef.current = Date.now();

      updatedItems[i] = {
        ...updatedItems[i],
        status: 'processing',
        startTime: itemStartTime,
        currentStep: 'reading',
        currentStepLabel: 'قراءة الملف',
      };
      setItems([...updatedItems]);
      setCurrentStepName('قراءة الملف');

      await new Promise((r) => setTimeout(r, 40));

      try {
        lastProgressRef.current = Date.now();
        if (cancelRef.current) break;

        // STEP 2: Downscaling image with createImageBitmap
        setCurrentStepName('تصغير الصورة');
        updatedItems[i] = {
          ...updatedItems[i],
          currentStep: 'resizing',
          currentStepLabel: 'تصغير الصورة وضغطها',
        };
        setItems([...updatedItems]);
        lastProgressRef.current = Date.now();

        const compressedBase64 = await compressUploadedImage(imgFile, 400);

        updatedItems[i] = {
          ...updatedItems[i],
          thumbnailUrl: compressedBase64,
        };
        setItems([...updatedItems]);

        let parsedName = '';
        let parsedBrand = '';
        let parsedCategory: ProductCategory = 'متنوعة';
        let parsedModel = '';
        let parsedSpec = '';
        let parsedWholesale = 0;
        let parsedSelling = 0;
        let priceNote: string | undefined = undefined;
        let hasMultiPrices = false;
        let manualPriceSet = false;
        let finalImageUrl = compressedBase64;
        let needsCropAdj = false;
        let validBox: [number, number, number, number] | undefined = undefined;

        // STEP 3: AI Analysis (if mode === 'ai')
        if (mode === 'ai') {
          setCurrentStepName('تحليل الذكاء الاصطناعي (Gemini)');
          updatedItems[i] = {
            ...updatedItems[i],
            currentStep: 'ai_analysis',
            currentStepLabel: 'تحليل الذكاء الاصطناعي (Gemini)',
          };
          setItems([...updatedItems]);
          lastProgressRef.current = Date.now();

          const rawBase64 = compressedBase64.split(',')[1] || compressedBase64;
          const primaryModel = settings.primary_model || 'gemini-4-hydrogen';
          const fallbackModel = settings.fallback_model || 'gemini-3.1-flash-lite';
          const modelsToTry =
            fallbackModel && fallbackModel !== primaryModel
              ? [primaryModel, fallbackModel]
              : [primaryModel];

          let resData: any = null;
          let lastError: Error | null = null;

          for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
            const activeModel = modelsToTry[attempt];
            const res = await fetchWithAbort('/api/gemini/extract-single-product-image', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-gemini-model': activeModel,
                ...(fallbackModel ? { 'x-gemini-fallback-model': fallbackModel } : {}),
              },
              body: JSON.stringify({
                imageBase64: rawBase64,
                mimeType: 'image/jpeg',
              }),
            });

            const json = await res.json().catch(() => ({}));
            if (res.ok) {
              resData = json;
              break;
            }

            const errMsg = json.friendlyMessage || json.error || `خطأ (${res.status})`;
            lastError = new Error(errMsg);

            const isNonRetriable =
              res.status === 401 ||
              json.isInvalidKey ||
              json.isDailyQuota;
            if (isNonRetriable) {
              throw lastError;
            }

            const isRetriable =
              res.status === 503 ||
              res.status === 504 ||
              res.status === 429 ||
              json.isOverloaded;
            if (isRetriable && attempt < modelsToTry.length - 1) {
              const waitMs = res.status === 429 ? Math.min(Math.max(Number(json.retryAfterSeconds) || 5, 3), 20) * 1000 : 2000;
              await new Promise((r) => setTimeout(r, waitMs));
              continue;
            }
            throw lastError;
          }

          if (!resData) {
            throw lastError || new Error('فشل تحليل الصورة عبر Gemini');
          }

          if (resData.usage) {
            const inputTokens = resData.usage.input_tokens || resData.usage.promptTokenCount || 0;
            const outputTokens = resData.usage.output_tokens || resData.usage.candidatesTokenCount || 0;
            const inputCostUsd =
              (inputTokens / 1_000_000) * (settings.gemini_input_cost_per_million_usd || 0.1);
            const outputCostUsd =
              (outputTokens / 1_000_000) * (settings.gemini_output_cost_per_million_usd || 0.4);
            const totalCostUsd = inputCostUsd + outputCostUsd;
            const totalCostEgp = totalCostUsd * (settings.usd_to_egp_rate || 50);

            await logApiUsage({
              id: `log_img_${Date.now()}_${i}`,
              timestamp: Date.now(),
              file_name: imgFile.name,
              model: resData.model || primaryModel,
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              total_tokens: inputTokens + outputTokens,
              cost_usd: totalCostUsd,
              cost_egp: totalCostEgp,
            }).catch(() => {});
          }

          const pData = resData.product || {};
          parsedName = (pData.name || '').trim();
          parsedBrand = (pData.brand || '').trim();
          parsedCategory = resolveCategory(pData.category || '', parsedName);
          parsedModel = (pData.model || '').trim();
          parsedSpec = (pData.specification || '').trim();
          hasMultiPrices = Boolean(pData.has_multiple_prices);
          validBox = pData.box_2d;

          if (hasMultiPrices) {
            parsedWholesale = 0;
            parsedSelling = 0;
            priceNote = 'أسعار متعددة';
          } else if (pData.detected_price && Number(pData.detected_price) > 0) {
            const detectedNum = Number(pData.detected_price);
            priceNote = 'سعر مقروء من الصورة، راجعه';
            if (settings.detected_price_target === 'selling') {
              parsedSelling = detectedNum;
              parsedWholesale = 0;
              manualPriceSet = true;
            } else {
              parsedWholesale = detectedNum;
              parsedSelling = 0;
            }
          }

          if (pData.crop_needs_adjustment || !validBox || !isBoxValid(validBox)) {
            finalImageUrl = compressedBase64;
            needsCropAdj = true;
          } else {
            const cropped = await cropAndCompressProductImage(compressedBase64, validBox);
            if (cropped) {
              finalImageUrl = cropped;
              needsCropAdj = false;
            } else {
              finalImageUrl = compressedBase64;
              needsCropAdj = true;
            }
          }

          // 2-second pause between Gemini calls
          if (i < updatedItems.length - 1 && !cancelRef.current) {
            await new Promise((r) => setTimeout(r, 2000));
          }
        }

        // STEP 4: Creating Product
        setCurrentStepName('إنشاء المنتج');
        updatedItems[i] = {
          ...updatedItems[i],
          currentStep: 'creating_product',
          currentStepLabel: 'إنشاء المنتج',
        };
        setItems([...updatedItems]);
        lastProgressRef.current = Date.now();

        nextImgNumber += 1;
        const isReadyForCatalog = Boolean(parsedName.trim() && parsedSelling > 0);

        const newProd: Product = {
          id: `img_prod_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          code: `IMG-${nextImgNumber.toString().padStart(3, '0')}`,
          name: parsedName,
          category: parsedCategory,
          group: parsedBrand,
          model: parsedModel,
          specification: parsedSpec,
          wholesale_price: parsedWholesale,
          selling_price: parsedSelling,
          manual_price_set: manualPriceSet,
          price_source_note: priceNote,
          has_multiple_prices: hasMultiPrices,
          included_in_catalog: isReadyForCatalog,
          image_url: finalImageUrl,
          original_image_url: compressedBase64,
          box_2d: validBox,
          raw_bounding_box: validBox,
          needs_crop_adjustment: needsCropAdj,
          source_file: imgFile.name,
          created_at: Date.now(),
          updated_at: Date.now(),
        };

        // STEP 5: Saving in Browser IndexedDB
        setCurrentStepName('حفظ في المتصفح');
        updatedItems[i] = {
          ...updatedItems[i],
          currentStep: 'saving_db',
          currentStepLabel: 'حفظ في IndexedDB',
        };
        setItems([...updatedItems]);
        lastProgressRef.current = Date.now();

        await saveProduct(newProd);
        currentProductsList.push(newProd);
        onProductsUpdated([...currentProductsList]);

        const itemDuration = (Date.now() - itemStartTime) / 1000;
        const isNeedReview = needsCropAdj || hasMultiPrices || !parsedName.trim() || parsedSelling <= 0;

        updatedItems[i] = {
          ...updatedItems[i],
          status: isNeedReview ? 'needs_review' : 'success',
          currentStep: 'done',
          currentStepLabel: isNeedReview ? 'تحتاج مراجعة / إكمال' : 'تم بنجاح',
          durationSeconds: Math.round(itemDuration * 10) / 10,
          endTime: Date.now(),
        };
        setItems([...updatedItems]);
        lastProgressRef.current = Date.now();
      } catch (itemError: any) {
        const itemDuration = (Date.now() - itemStartTime) / 1000;
        const friendlyReason = formatFriendlyError(itemError);

        updatedItems[i] = {
          ...updatedItems[i],
          status: 'failed',
          errorReason: friendlyReason,
          durationSeconds: Math.round(itemDuration * 10) / 10,
          endTime: Date.now(),
        };
        setItems([...updatedItems]);
        lastProgressRef.current = Date.now();
      }

      await new Promise((r) => setTimeout(r, 50));
    }

    const finalSuccessCount = updatedItems.filter((it) => it.status === 'success').length;
    const finalReviewCount = updatedItems.filter((it) => it.status === 'needs_review').length;
    const finalFailedCount = updatedItems.filter((it) => it.status === 'failed').length;

    setIsProcessing(false);
    setCurrentIndex(-1);
    setCurrentStepName('اكتملت العملية');
    setHasFinished(true);
    console.log(
      `[انتهاء الدفعة] نجح: ${finalSuccessCount} | مراجعة: ${finalReviewCount} | فشل: ${finalFailedCount}`
    );
  };

  // Cancel Handler
  const handleCancel = () => {
    cancelRef.current = true;
    setIsProcessing(false);
    setCurrentStepName('تم الإلغاء بواسطة المستخدم');
    setHasFinished(true);
    console.warn('⚠️ المستخدم ضغط على زر إلغاء العملية.');
  };

  // Retry failed only
  const handleRetryFailedOnly = () => {
    const failedOnes = items.filter((i) => i.status === 'failed');
    if (failedOnes.length === 0) return;

    // Reset status for failed items
    const resetList = items.map((i) => {
      if (i.status === 'failed') {
        return {
          ...i,
          status: 'pending' as ImageItemStatus,
          errorReason: undefined,
          durationSeconds: undefined,
        };
      }
      return i;
    });

    setItems(resetList);
    setHasFinished(false);
    startProcessingQueue(resetList);
  };

  // Copy Error Report to Clipboard
  const handleCopyErrorReport = () => {
    const failedList = items.filter((i) => i.status === 'failed');
    const reviewList = items.filter((i) => i.status === 'needs_review');

    const reportLines = [
      '=== تقرير تشغيل رفع ومعالجة الصور ===',
      `التاريخ: ${new Date().toLocaleString('ar-EG')}`,
      `الوضع: ${mode === 'ai' ? 'ذكاء اصطناعي (Gemini Flash)' : 'يدوي بدون AI'}`,
      `إجمالي الصور: ${items.length}`,
      `تمت بنجاح: ${successCount}`,
      `تحتاج مراجعة وإكمال: ${needsReviewCount}`,
      `فشلت: ${failedCount}`,
      `الوقت المستغرق: ${formatTime(elapsedSeconds)}`,
      '',
      '--- قائمة المشاكل والأخطاء ---',
      failedList.length === 0
        ? 'لا توجد أخطاء قاتلة.'
        : failedList
            .map(
              (f, idx) =>
                `${idx + 1}. [${f.name}] (${(f.size / 1024).toFixed(0)} KB) -> سبب الفشل: ${f.errorReason || 'غير محدد'}`
            )
            .join('\n'),
      '',
      '--- صور تحتاج مراجعة أو ضبط القص ---',
      reviewList.length === 0
        ? 'لا توجد ملاحظات.'
        : reviewList
            .map((r, idx) => `${idx + 1}. [${r.name}] -> تحتاج مراجعة أو ضبط القص / أسعار`)
            .join('\n'),
    ];

    const reportText = reportLines.join('\n');
    navigator.clipboard.writeText(reportText).then(() => {
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2500);
    });
  };

  // Filtered list for display
  const displayedItems = items.filter((item) => {
    if (filterView === 'failed') return item.status === 'failed';
    if (filterView === 'needs_review') return item.status === 'needs_review';
    return true;
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* 1. Live Progress Dashboard Card */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        {/* Header & Status Indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                isProcessing
                  ? 'bg-sky-100 text-sky-700 animate-pulse'
                  : hasFinished
                  ? failedCount > 0
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {isProcessing ? (
                <RefreshCw size={18} className="animate-spin text-sky-600" />
              ) : hasFinished ? (
                <CheckCircle2 size={18} className="text-emerald-600" />
              ) : (
                <Play size={18} />
              )}
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span>معالج رفع الصور والمنتجات</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-600">
                  {mode === 'ai' ? 'بـ Gemini Flash' : 'يدوي بدون AI'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isProcessing
                  ? `جاري العمل على: ${currentFileName || 'الصورة'} - (${currentStepName})`
                  : hasFinished
                  ? `اكتملت معالجة القائمة بالكامل`
                  : `جاهز للبدء مع ${items.length} صورة`}
              </p>
            </div>
          </div>

          {/* Action buttons during or after */}
          <div className="flex items-center gap-2">
            {!isProcessing && !hasFinished && (
              <button
                type="button"
                onClick={() => startProcessingQueue()}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <Play size={15} />
                بدء معالجة {items.length} صورة
              </button>
            )}

            {isProcessing && (
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer"
                title="إيقاف مؤقت أو إلغاء المعالجة والاحتفاظ بما تم حفظه"
              >
                <X size={15} />
                إلغاء العملية
              </button>
            )}

            {hasFinished && (
              <button
                type="button"
                onClick={onNavigateToIncomplete}
                className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer"
              >
                <span>مراجعة جدول المنتجات</span>
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>

        {/* 30-Second Stall Watchdog Alert Banner */}
        {isStalled && isProcessing && (
          <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-700 shrink-0" />
              <span>العملية متوقفة منذ 30 ثانية دون أي تقدم. قد تكون الصورة كبيرة أو الاتصال بطيئاً.</span>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="px-3 py-1 bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold rounded-lg text-xs cursor-pointer shrink-0"
            >
              إلغاء العملية
            </button>
          </div>
        )}

        {/* Main Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span className="flex items-center gap-1.5">
              <span>نسبة الإنجاز:</span>
              <span className="text-sky-700 font-mono text-sm">{progressPercent}%</span>
            </span>
            <span className="text-slate-500 font-semibold">
              صورة {processedCount} من أصل {totalCount}
            </span>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                failedCount > 0 ? 'bg-gradient-to-r from-amber-500 to-sky-600' : 'bg-sky-600'
              }`}
              style={{ width: `${Math.max(3, progressPercent)}%` }}
            />
          </div>

          {/* Times */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5 font-medium">
            <span className="flex items-center gap-1">
              <Clock size={12} className="text-slate-400" />
              الوقت المستغرق: <strong className="text-slate-700 font-mono">{formatTime(elapsedSeconds)}</strong>
            </span>
            {isProcessing && pendingCount > 0 && (
              <span>
                الوقت المتبقي تقريباً: <strong className="text-slate-700 font-mono">~{formatTime(estimatedRemainingSec)}</strong>
              </span>
            )}
          </div>
        </div>

        {/* 4 Small Stat Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          {/* 1. Success */}
          <div className="bg-emerald-50/80 border border-emerald-200 p-2.5 rounded-xl flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <CheckCircle2 size={16} />
            </div>
            <div>
              <span className="text-[10px] text-emerald-800 font-bold block">تمت بنجاح</span>
              <span className="text-base font-black text-emerald-950 font-mono">{successCount}</span>
            </div>
          </div>

          {/* 2. Needs Review */}
          <div className="bg-amber-50/80 border border-amber-200 p-2.5 rounded-xl flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <AlertTriangle size={16} />
            </div>
            <div>
              <span className="text-[10px] text-amber-800 font-bold block">تحتاج مراجعة</span>
              <span className="text-base font-black text-amber-950 font-mono">{needsReviewCount}</span>
            </div>
          </div>

          {/* 3. Pending */}
          <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
              <Clock size={16} />
            </div>
            <div>
              <span className="text-[10px] text-slate-600 font-bold block">في الانتظار</span>
              <span className="text-base font-black text-slate-900 font-mono">{pendingCount}</span>
            </div>
          </div>

          {/* 4. Failed */}
          <div className="bg-rose-50/80 border border-rose-200 p-2.5 rounded-xl flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center shrink-0">
              <XCircle size={16} />
            </div>
            <div>
              <span className="text-[10px] text-rose-800 font-bold block">فشلت</span>
              <span className="text-base font-black text-rose-950 font-mono">{failedCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Issue Report & Summary Card (Shown when finished or if errors exist) */}
      {(hasFinished || failedCount > 0) && (
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <FileText size={17} className="text-sky-600" />
              <h4 className="font-bold text-xs text-slate-800">
                تقرير ملخص المعالجة {hasFinished ? '(اكتملت الدفعة)' : ''}
              </h4>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Retry Failed Button */}
              {failedCount > 0 && (
                <button
                  type="button"
                  onClick={handleRetryFailedOnly}
                  disabled={isProcessing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50"
                  title="إعادة محاولة الصور التي فشلت فقط دون تكرار الناجحة"
                >
                  <RotateCcw size={13} />
                  إعادة محاولة الفاشلين فقط ({failedCount})
                </button>
              )}

              {/* Copy Report Button */}
              <button
                type="button"
                onClick={handleCopyErrorReport}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-lg text-xs border border-slate-300 transition-colors cursor-pointer"
                title="نسخ تقرير الأخطاء وتفاصيلها لإرساله للدعم الفني"
              >
                {copiedReport ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                {copiedReport ? 'تم نسخ التقرير!' : 'نسخ تقرير الأخطاء'}
              </button>
            </div>
          </div>

          {/* Quick summary notes */}
          <div className="text-xs text-slate-600 flex flex-wrap gap-4">
            <span>
              ✅ نجح: <strong>{successCount}</strong>
            </span>
            <span>
              ⚠️ تحتاج مراجعة أو ضبط القص: <strong>{needsReviewCount}</strong>
            </span>
            {failedCount > 0 && (
              <span className="text-rose-700 font-bold">
                ❌ فشل: <strong>{failedCount}</strong> (راجع أسباب الفشل أدناه)
              </span>
            )}
          </div>
        </div>
      )}

      {/* 3. Detailed Per-Image Live Status List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table / List Header with filters */}
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <ListFilter size={15} className="text-slate-500" />
            <span className="font-bold text-xs text-slate-800">
              قائمة حالة كل صورة ({displayedItems.length}):
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setFilterView('all')}
              className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                filterView === 'all'
                  ? 'bg-slate-800 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              الكل ({items.length})
            </button>

            {failedCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterView('failed')}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                  filterView === 'failed'
                    ? 'bg-rose-600 text-white'
                    : 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-200'
                }`}
              >
                الفاشلة ({failedCount})
              </button>
            )}

            {needsReviewCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterView('needs_review')}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                  filterView === 'needs_review'
                    ? 'bg-amber-600 text-white'
                    : 'bg-white text-amber-800 hover:bg-amber-50 border border-amber-200'
                }`}
              >
                تحتاج مراجعة ({needsReviewCount})
              </button>
            )}
          </div>
        </div>

        {/* Scrollable List */}
        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 text-xs">
          {displayedItems.length === 0 ? (
            <div className="p-8 text-center text-slate-400">لا توجد عناصر مطابقة للفلتر.</div>
          ) : (
            displayedItems.map((item) => {
              const isCurrent = isProcessing && item.id === items[currentIndex]?.id;

              return (
                <div
                  key={item.id}
                  className={`p-3 flex items-center justify-between gap-3 transition-colors ${
                    isCurrent
                      ? 'bg-sky-50/70 border-r-4 border-r-sky-600'
                      : item.status === 'failed'
                      ? 'bg-rose-50/30'
                      : 'hover:bg-slate-50/50'
                  }`}
                >
                  {/* Left: Thumbnail & Details */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <FileQuestion size={18} className="text-slate-300" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 truncate block max-w-xs" title={item.name}>
                          {item.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          ({(item.size / 1024).toFixed(0)} ك.ب)
                        </span>
                      </div>

                      {/* Micro-Step or Failure Reason */}
                      <div className="mt-0.5">
                        {item.status === 'processing' && (
                          <span className="text-[11px] text-sky-700 font-bold flex items-center gap-1">
                            <RefreshCw size={11} className="animate-spin text-sky-600" />
                            {item.currentStepLabel || 'جاري المعالجة...'}
                          </span>
                        )}

                        {item.status === 'failed' && (
                          <span className="text-[11px] text-rose-700 font-bold flex items-center gap-1 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 w-fit">
                            <AlertCircle size={11} />
                            سبب الفشل: {item.errorReason}
                          </span>
                        )}

                        {item.status === 'needs_review' && (
                          <span className="text-[11px] text-amber-700 font-bold flex items-center gap-1">
                            <AlertTriangle size={11} />
                            تم إنشاؤها (تحتاج مراجعة أو ضبط القص في الجدول)
                          </span>
                        )}

                        {item.status === 'success' && (
                          <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                            <CheckCircle2 size={11} />
                            تم إنشاء المنتج بالكامل وبنجاح
                          </span>
                        )}

                        {item.status === 'pending' && (
                          <span className="text-[11px] text-slate-400 font-medium">في الانتظار...</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions + Badge & Time Taken */}
                  <div className="flex items-center gap-2 shrink-0">
                    {!isProcessing && item.status !== 'processing' && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenItemEditor(item)}
                          className="flex items-center gap-1 px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                          title="قص وتعديل ومسح يدوي قبل الإضافة"
                        >
                          <Crop size={12} />
                          <span className="hidden sm:inline">قص وتعديل</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveQueueItem(item)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="إزالة الصورة من القائمة"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}

                    <div className="flex flex-col items-end gap-1 shrink-0">
                    {/* Status Badge */}
                    {item.status === 'success' && (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                        ✅ تمت
                      </span>
                    )}

                    {item.status === 'needs_review' && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded font-bold text-[10px]">
                        ⚠️ تحتاج مراجعة
                      </span>
                    )}

                    {item.status === 'processing' && (
                      <span className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded font-bold text-[10px] animate-pulse">
                        🔄 جاري المعالجة
                      </span>
                    )}

                    {item.status === 'failed' && (
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-300 rounded font-bold text-[10px]">
                        ❌ فشلت
                      </span>
                    )}

                    {item.status === 'pending' && (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-semibold text-[10px]">
                        ⏳ في الانتظار
                      </span>
                    )}

                    {/* Time taken */}
                    {item.durationSeconds !== undefined && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        {item.durationSeconds} ثانية
                      </span>
                    )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={listEndRef} />
        </div>
      </div>

      {/* Pro Image Studio Modal for Queued Photos */}
      {editingQueueItem && (() => {
        const editableItems = items.filter((it) => it.status !== 'processing');
        const currentEditableIdx = editableItems.findIndex((it) => it.id === editingQueueItem.item.id);

        return (
          <CropAdjustModal
            initialImageUrl={editingQueueItem.rawUrl}
            initialRawUrl={editingQueueItem.rawUrl}
            title="قص وتعديل الصورة قبل المعالجة"
            subtitle={editingQueueItem.item.name}
            queueNav={
              editableItems.length > 1 && currentEditableIdx >= 0
                ? {
                    currentNumber: currentEditableIdx + 1,
                    total: editableItems.length,
                    hasPrev: currentEditableIdx > 0,
                    hasNext: currentEditableIdx < editableItems.length - 1,
                    onNavigate: async (direction, editedUrl) => {
                      const oldItem = editingQueueItem.item;
                      if (editedUrl) {
                        const newFile = await dataUrlToFile(editedUrl, oldItem.name);
                        setItems((prev) =>
                          prev.map((it) =>
                            it.id === oldItem.id
                              ? { ...it, file: newFile, size: newFile.size, thumbnailUrl: editedUrl }
                              : it
                          )
                        );
                        onReplaceFile?.(oldItem.file, newFile);
                      }

                      const nextIdx = direction === 'prev' ? currentEditableIdx - 1 : currentEditableIdx + 1;
                      const targetItem = editableItems[nextIdx];
                      if (!targetItem) return;
                      try {
                        const nextRaw = await readFileAsWorkingDataUrl(targetItem.file, 1200);
                        setEditingQueueItem({ item: targetItem, rawUrl: nextRaw });
                      } catch {
                        if (targetItem.thumbnailUrl) {
                          setEditingQueueItem({ item: targetItem, rawUrl: targetItem.thumbnailUrl });
                        }
                      }
                    },
                  }
                : undefined
            }
            onClose={() => setEditingQueueItem(null)}
            onSaveImageUrl={async (editedUrl) => {
              const oldItem = editingQueueItem.item;
              const newFile = await dataUrlToFile(editedUrl, oldItem.name);
              setItems((prev) =>
                prev.map((it) =>
                  it.id === oldItem.id
                    ? { ...it, file: newFile, size: newFile.size, thumbnailUrl: editedUrl }
                    : it
                )
              );
              onReplaceFile?.(oldItem.file, newFile);
            }}
            onRemoveImage={() => {
              handleRemoveQueueItem(editingQueueItem.item);
            }}
          />
        );
      })()}
    </div>
  );
};
