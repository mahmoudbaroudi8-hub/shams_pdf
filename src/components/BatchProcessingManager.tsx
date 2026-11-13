import React, { useState, useEffect, useRef } from 'react';
import {
  BatchItem,
  BatchSession,
  CatalogSettings,
  Product,
  ProductCategory,
  ALL_CATEGORIES,
  PageImageItem,
  PageExtractionReport,
  StoredPdfFile,
  ApiUsageLog,
  SupplierComparisonItem,
  SupplierChangeType,
} from '../types';
import { SupplierChangesModal } from './SupplierChangesModal';
import { loadPdfDocument, renderPdfPageToImage } from '../utils/pdfExtractor';
import { cropAndCompressProductImage, isBoxValid } from '../utils/imageCropper';
import {
  saveBatchSession,
  saveStoredPdfFile,
  getStoredPdfFile,
  logApiUsage,
  findDuplicateProcessedFile,
  markFileProcessed,
  saveProduct,
  saveExtractionReport,
  getAllApiUsageLogs,
  saveSettings,
} from '../utils/db';
import { requestWakeLock, releaseWakeLock } from '../utils/wakeLock';
import { exportPartialCatalogPdf, exportPartialExcel } from '../utils/partialExport';
import { useUiFeedback } from './UiFeedbackProvider';
import {
  Play,
  Pause,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  Layers,
  Sparkles,
} from 'lucide-react';

interface BatchProcessingManagerProps {
  file: File | null;
  existingSession?: BatchSession | null;
  settings: CatalogSettings;
  existingProducts: Product[];
  onProductsUpdated: (products: Product[]) => void;
  onSettingsUpdated?: (settings: CatalogSettings) => void;
  onFinished?: () => void;
  onCancel?: () => void;
}

export const BatchProcessingManager: React.FC<BatchProcessingManagerProps> = ({
  file,
  existingSession,
  settings,
  existingProducts,
  onProductsUpdated,
  onFinished,
  onCancel,
}) => {
  const { toast } = useUiFeedback();
  const [session, setSession] = useState<BatchSession | null>(existingSession || null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [retryInfo, setRetryInfo] = useState<string | null>(null);
  const [dailyQuotaNotice, setDailyQuotaNotice] = useState<string | null>(null);
  const [dailyLimitNotice, setDailyLimitNotice] = useState<string | null>(null);
  const [modelBusyNotice, setModelBusyNotice] = useState<string | null>(null);
  const [budgetExceeded, setBudgetExceeded] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState<{
    previousSession?: BatchSession;
    newFile: File;
    productsCount: number;
    date?: string;
  } | null>(null);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Supplier & Comparison State
  const [supplierName, setSupplierName] = useState<string>(() => existingSession?.supplier_name || '');
  const [showSupplierChangesModal, setShowSupplierChangesModal] = useState(false);
  const [supplierChangesList, setSupplierChangesList] = useState<SupplierComparisonItem[]>([]);

  const pauseRef = useRef(false);
  pauseRef.current = isPaused;

  // Compute Supplier Changes helper (compares current list from new file against prior list)
  const computeSupplierChanges = (
    currentProducts: Product[],
    priorProducts: Product[],
    activeSupplier: string
  ): SupplierComparisonItem[] => {
    const minMargin = settings.min_profit_margin_percent ?? 10;
    const comparisonItems: SupplierComparisonItem[] = [];

    const previousSupplierProducts = activeSupplier
      ? priorProducts.filter((p) => p.supplier === activeSupplier)
      : priorProducts;

    const hasExistingSupplierList = previousSupplierProducts.length > 0;
    const matchedOldIds = new Set<string>();

    for (const newProd of currentProducts) {
      // Find matching product in supplier's previous list (or by exact code in all prior products)
      const oldProd =
        previousSupplierProducts.find(
          (p) =>
            p.id === newProd.id ||
            (p.code && newProd.code && p.code.toLowerCase() === newProd.code.toLowerCase()) ||
            p.name.trim().toLowerCase() === newProd.name.trim().toLowerCase()
        ) ||
        priorProducts.find(
          (p) =>
            p.id === newProd.id ||
            (p.code && newProd.code && p.code.toLowerCase() === newProd.code.toLowerCase())
        );

      if (!oldProd) {
        // Only mark as 'new' comparison if this supplier already had an older list
        if (hasExistingSupplierList) {
          comparisonItems.push({
            product_id: newProd.id,
            code: newProd.code,
            name: newProd.name,
            category: newProd.category,
            supplier: activeSupplier || newProd.supplier || 'المورد',
            old_wholesale_price: 0,
            new_wholesale_price: newProd.wholesale_price,
            diff_amount: newProd.wholesale_price,
            diff_percent: 100,
            change_type: 'new',
            current_selling_price: newProd.selling_price || 0,
            suggested_selling_price: Math.round(newProd.wholesale_price * (1 + minMargin / 100)),
            applied_selling_price: newProd.selling_price || 0,
            current_margin_percent: 0,
            previous_margin_percent: 0,
            is_selling_price_updated: false,
          });
        }
      } else {
        matchedOldIds.add(oldProd.id);
        const oldWholesale = oldProd.wholesale_price || 0;
        const newWholesale = newProd.wholesale_price || 0;
        const diffAmount = newWholesale - oldWholesale;
        const diffPercent = oldWholesale > 0 ? (diffAmount / oldWholesale) * 100 : 0;

        const oldSelling = oldProd.selling_price || 0;
        const oldMarginRatio =
          oldSelling > 0 && oldWholesale > 0
            ? (oldSelling - oldWholesale) / oldWholesale
            : minMargin / 100;
        const suggestedSelling = Math.round(newWholesale * (1 + Math.max(0.05, oldMarginRatio)));

        const currentMarginPercent =
          oldSelling > 0 ? Math.round(((oldSelling - newWholesale) / oldSelling) * 1000) / 10 : 0;
        const previousMarginPercent =
          oldSelling > 0 ? Math.round(((oldSelling - oldWholesale) / oldSelling) * 1000) / 10 : 0;

        let changeType: SupplierChangeType = 'unchanged';
        if (diffAmount > 0) {
          changeType = 'price_increased';
        } else if (diffAmount < 0) {
          changeType = 'price_decreased';
        } else if (oldSelling > 0 && currentMarginPercent < minMargin) {
          changeType = 'margin_dropped';
        }

        if (changeType !== 'unchanged' || (oldSelling > 0 && currentMarginPercent < minMargin)) {
          comparisonItems.push({
            product_id: newProd.id,
            code: newProd.code,
            name: newProd.name,
            category: newProd.category,
            supplier: activeSupplier || newProd.supplier || oldProd.supplier || 'المورد',
            old_wholesale_price: oldWholesale,
            new_wholesale_price: newWholesale,
            diff_amount: Math.abs(diffAmount),
            diff_percent: Math.abs(Math.round(diffPercent * 10) / 10),
            change_type:
              currentMarginPercent < minMargin && oldSelling > 0
                ? 'margin_dropped'
                : changeType,
            current_selling_price: oldSelling,
            suggested_selling_price: suggestedSelling,
            applied_selling_price: oldSelling,
            current_margin_percent: currentMarginPercent,
            previous_margin_percent: previousMarginPercent,
            is_selling_price_updated: false,
          });
        }
      }
    }

    // Disappeared products (only if supplier already had products in prior list)
    if (hasExistingSupplierList) {
      for (const oldProd of previousSupplierProducts) {
        if (!matchedOldIds.has(oldProd.id)) {
          const oldSelling = oldProd.selling_price || 0;
          const prevMargin =
            oldSelling > 0
              ? Math.round(((oldSelling - oldProd.wholesale_price) / oldSelling) * 1000) / 10
              : 0;
          comparisonItems.push({
            product_id: oldProd.id,
            code: oldProd.code,
            name: oldProd.name,
            category: oldProd.category,
            supplier: activeSupplier || oldProd.supplier || 'المورد',
            old_wholesale_price: oldProd.wholesale_price,
            new_wholesale_price: 0,
            diff_amount: oldProd.wholesale_price,
            diff_percent: 100,
            change_type: 'disappeared',
            current_selling_price: oldSelling,
            suggested_selling_price: oldSelling,
            applied_selling_price: oldSelling,
            current_margin_percent: 0,
            previous_margin_percent: prevMargin,
            is_selling_price_updated: false,
          });
        }
      }
    }

    return comparisonItems;
  };

  // Manual check helper for existing saved products
  const computeExistingSupplierChanges = (
    allProducts: Product[],
    activeSupplier: string
  ): SupplierComparisonItem[] => {
    const minMargin = settings.min_profit_margin_percent ?? 10;
    const filtered = activeSupplier
      ? allProducts.filter((p) => p.supplier === activeSupplier)
      : allProducts;
    const results: SupplierComparisonItem[] = [];

    for (const p of filtered) {
      const oldW = p.previous_wholesale_price ?? 0;
      const newW = p.wholesale_price || 0;
      const selling = p.selling_price || 0;
      const currentMargin = selling > 0 ? Math.round(((selling - newW) / selling) * 1000) / 10 : 0;
      const previousMargin = selling > 0 && oldW > 0 ? Math.round(((selling - oldW) / selling) * 1000) / 10 : currentMargin;

      if (oldW > 0 && oldW !== newW) {
        const diff = newW - oldW;
        const pct = Math.abs(Math.round((diff / oldW) * 1000) / 10);
        const oldMarginRatio = selling > 0 ? (selling - oldW) / oldW : minMargin / 100;
        const suggested = Math.round(newW * (1 + Math.max(0.05, oldMarginRatio)));
        results.push({
          product_id: p.id,
          code: p.code,
          name: p.name,
          category: p.category,
          supplier: activeSupplier || p.supplier || 'المورد',
          old_wholesale_price: oldW,
          new_wholesale_price: newW,
          diff_amount: Math.abs(diff),
          diff_percent: pct,
          change_type:
            selling > 0 && currentMargin < minMargin
              ? 'margin_dropped'
              : diff > 0
              ? 'price_increased'
              : 'price_decreased',
          current_selling_price: selling,
          suggested_selling_price: suggested,
          applied_selling_price: selling,
          current_margin_percent: currentMargin,
          previous_margin_percent: previousMargin,
          is_selling_price_updated: false,
        });
      } else if (selling > 0 && currentMargin < minMargin) {
        const suggested = Math.round(newW * (1 + minMargin / 100));
        results.push({
          product_id: p.id,
          code: p.code,
          name: p.name,
          category: p.category,
          supplier: activeSupplier || p.supplier || 'المورد',
          old_wholesale_price: newW,
          new_wholesale_price: newW,
          diff_amount: 0,
          diff_percent: 0,
          change_type: 'margin_dropped',
          current_selling_price: selling,
          suggested_selling_price: suggested,
          applied_selling_price: selling,
          current_margin_percent: currentMargin,
          previous_margin_percent: previousMargin,
          is_selling_price_updated: false,
        });
      }
    }

    return results;
  };

  // Resolve Category Helper
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

  // Initialize session from file
  useEffect(() => {
    if (existingSession) {
      setSession(existingSession);
      return;
    }

    if (!file) return;

    const initNewFile = async () => {
      // 1. Check duplicate file (Name + Size + LastModified - Requirement 3)
      const duplicate = await findDuplicateProcessedFile(file.name, file.size, file.lastModified);
      if (duplicate && duplicate.processed) {
        setDuplicateModal({
          previousSession: duplicate.session,
          newFile: file,
          productsCount: duplicate.productsCount,
          date: duplicate.date,
        });
        return;
      }

      await setupSessionForFile(file);
    };

    initNewFile();
  }, [file, existingSession]);

  const setupSessionForFile = async (targetFile: File) => {
    try {
      setStatusMessage('جاري تحليل ملف PDF وتجهيز الدفعات...');
      const buffer = await targetFile.arrayBuffer();
      const pdfDoc = await loadPdfDocument(targetFile);
      const totalPages = pdfDoc.numPages;

      // Save raw PDF file in IndexedDB
      const fileId = `pdf_${Date.now()}_${targetFile.name}`;
      const storedPdf: StoredPdfFile = {
        file_id: fileId,
        file_name: targetFile.name,
        file_size: targetFile.size,
        mime_type: targetFile.type || 'application/pdf',
        array_buffer: buffer,
        saved_at: Date.now(),
      };
      await saveStoredPdfFile(storedPdf);

      // Split pages into batches (e.g. 5 pages per batch)
      const batchSize = Math.max(1, settings.default_batch_size || 5);
      // Skip cover (1) and back (totalPages) if totalPages >= 3
      const startPage = totalPages >= 3 ? 2 : 1;
      const endPage = totalPages >= 3 ? totalPages - 1 : totalPages;

      const batches: BatchItem[] = [];
      let batchNum = 1;
      for (let p = startPage; p <= endPage; p += batchSize) {
        const pEnd = Math.min(p + batchSize - 1, endPage);
        batches.push({
          batch_index: batchNum,
          page_start: p,
          page_end: pEnd,
          status: 'pending',
          retry_count: 0,
          products_count: 0,
        });
        batchNum++;
      }

      const newSession: BatchSession = {
        id: `session_${Date.now()}`,
        file_name: targetFile.name,
        file_size: targetFile.size,
        file_last_modified: targetFile.lastModified,
        file_id: fileId,
        total_pages: totalPages,
        batch_size: batchSize,
        batches,
        status: 'idle',
        total_products_extracted: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      await saveBatchSession(newSession);
      setSession(newSession);
      setStatusMessage(`تم تجهيز ${batches.length} دفعة لملف "${targetFile.name}". جاهز للبدء.`);
    } catch (err: any) {
      console.error(err);
      setStatusMessage(`خطأ في قراءة ملف PDF: ${err.message || 'ملف غير صالح'}`);
    }
  };

  // Duplicate modal options
  const handleUseDuplicatePrevious = () => {
    if (!duplicateModal) return;
    setStatusMessage('تم استخدام المنتجات المحفوظة مسبقاً لهذا الملف بنجاح.');
    setDuplicateModal(null);
    onFinished?.();
  };

  const handleRereadDuplicate = async () => {
    if (!duplicateModal) return;
    const f = duplicateModal.newFile;
    setDuplicateModal(null);
    await setupSessionForFile(f);
  };

  // Check Monthly Budget
  const checkBudgetThreshold = async (): Promise<boolean> => {
    if (!settings.monthly_budget_egp || settings.monthly_budget_egp <= 0) return true;

    const logs = await getAllApiUsageLogs();
    const currentMonthTimestamp = new Date();
    currentMonthTimestamp.setDate(1);
    currentMonthTimestamp.setHours(0, 0, 0, 0);

    const monthlyLogs = logs.filter((l) => l.timestamp >= currentMonthTimestamp.getTime());
    const totalCostEgp = monthlyLogs.reduce((sum, l) => sum + (l.cost_egp || 0), 0);

    if (totalCostEgp >= settings.monthly_budget_egp) {
      setBudgetExceeded(true);
      return false;
    }
    return true;
  };

  // Check Daily Request Limit
  const checkDailyRequestLimit = async (): Promise<boolean> => {
    const limit = settings.daily_request_limit || 20;
    const logs = await getAllApiUsageLogs();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayCount = logs.filter((l) => l.timestamp >= startOfToday).length;

    if (todayCount >= limit) {
      setDailyLimitNotice(
        `تم الوصول لحد الطلبات اليومي المحدد (${todayCount}/${limit} طلب). تم إيقاف المعالجة للحفاظ على حسابك.`
      );
      return false;
    }
    return true;
  };

  // Server-side Gemini caller with primary -> fallback model retry on transient 503/429
  const callGeminiWithRetry = async (
    pageItems: PageImageItem[],
    totalPages: number,
    pNum: number,
    currentFileNameStr: string,
    batchNum: number
  ): Promise<{ data: any; usage?: any; model: string }> => {
    if (pauseRef.current) throw new Error('PAUSED');

    const primaryModel = settingsRef.current.primary_model || 'gemini-4-hydrogen';
    const fallbackModel = settingsRef.current.fallback_model || 'gemini-3.1-flash-lite';

    const attemptsPlan = [
      { model: primaryModel, delay: 0, desc: 'الأساسي' },
      { model: primaryModel, delay: 10000, desc: 'الأساسي (إعادة أولى بعد 10 ثوانٍ)' },
      { model: primaryModel, delay: 20000, desc: 'الأساسي (إعادة ثانية بعد 20 ثانية)' },
      { model: fallbackModel, delay: 2000, desc: `الاحتياطي (${fallbackModel})` },
    ];

    for (let i = 0; i < attemptsPlan.length; i++) {
      if (pauseRef.current) throw new Error('PAUSED');

      const plan = attemptsPlan[i];
      if (plan.delay > 0) {
        setRetryInfo(
          `الموديل الأساسي مضغوط. جاري المحاولة (${i + 1}/4) عبر الموديل ${plan.desc}...`
        );
        await new Promise((resolve) => setTimeout(resolve, plan.delay));
        if (pauseRef.current) throw new Error('PAUSED');
      }

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-gemini-model': plan.model,
        };
        if (fallbackModel) headers['x-gemini-fallback-model'] = fallbackModel;

        const cappedItems = pageItems.slice(0, 2);
        const bodyPayload =
          cappedItems.length === 1
            ? {
                imageBase64: cappedItems[0].base64Data,
                mimeType: cappedItems[0].mimeType,
                pageNumber: cappedItems[0].pageNumber,
                totalPages,
                isRetry: i > 0,
              }
            : {
                images: cappedItems.map((p) => ({
                  imageBase64: p.base64Data,
                  mimeType: p.mimeType,
                  pageNumber: p.pageNumber,
                })),
                pageNumber: cappedItems[0].pageNumber,
                totalPages,
                isRetry: i > 0,
              };

        const response = await fetch('/api/gemini/extract-products', {
          method: 'POST',
          headers,
          body: JSON.stringify(bodyPayload),
        });

        const resData = await response.json().catch(() => ({}));
        const errorMsg = resData.error || resData.friendlyMessage || '';

        // 1. Daily quota limit -> stop immediately without retrying
        const isDaily =
          resData.isDailyQuota ||
          /per\s*day/i.test(errorMsg) ||
          /daily\s*(?:limit|quota)/i.test(errorMsg);

        if (isDaily) {
          const waitText = resData.waitTextArabic || 'عدة ساعات';
          const qErr: any = new Error(
            resData.friendlyMessage || `تم استنفاد الحصة اليومية لـ Gemini، يمكنك المتابعة بعد ${waitText}.`
          );
          qErr.isDailyQuota = true;
          throw qErr;
        }

        // 2. Non-retriable server API key error (401/403 or invalid key)
        const isInvalid =
          resData.isInvalidKey ||
          response.status === 401 ||
          (response.status === 400 && /API_KEY_INVALID|API key not valid/i.test(errorMsg)) ||
          (response.status === 403 && /PERMISSION_DENIED|expired/i.test(errorMsg));

        if (isInvalid) {
          const authErr: any = new Error(
            resData.friendlyMessage ||
              'مفتاح GEMINI_API_KEY على الخادم غير مُعد أو غير صالح. يرجى ضبطه في Secrets.'
          );
          authErr.isServerAuthError = true;
          throw authErr;
        }

        // 3. Overload / timeout -> retry plan
        const isOverloaded =
          resData.isOverloaded === true ||
          response.status === 503 ||
          response.status === 504 ||
          /503|unavailable|high demand|overloaded|مهلة/i.test(errorMsg);

        if (isOverloaded) {
          await logApiUsage({
            id: `log_overload_${Date.now()}_p${pNum}_${i}`,
            timestamp: Date.now(),
            file_name: currentFileNameStr,
            batch_number: batchNum,
            page_number: pNum,
            model: plan.model,
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            cost_usd: 0,
            cost_egp: 0,
            success: false,
            failure_reason: 'overloaded_or_timeout',
          }).catch(() => {});

          if (i < attemptsPlan.length - 1) {
            continue;
          } else {
            const haltErr: any = new Error('الموديل مشغول حالياً، جرّب بعد قليل أو غيّر الموديل من الإعدادات');
            haltErr.isModelOverloadedHalt = true;
            throw haltErr;
          }
        }

        // 4. Per-minute rate limit (429) -> honor retryAfterSeconds and retry
        if (response.status === 429) {
          if (i < attemptsPlan.length - 1) {
            const waitSec = Math.min(Math.max(Number(resData.retryAfterSeconds) || 10, 5), 60);
            setRetryInfo(`ضغط مؤقت على الخدمة (429). سننتظر ${waitSec} ثانية ونعاود المحاولة...`);
            await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
            continue;
          }
        }

        if (!response.ok) {
          throw new Error(resData.friendlyMessage || `خطأ (${response.status})`);
        }

        setRetryInfo(null);
        return { data: resData, usage: resData.usage, model: resData.model || plan.model };
      } catch (err: any) {
        if (
          err.message === 'PAUSED' ||
          err.isDailyQuota ||
          err.isModelOverloadedHalt ||
          err.isServerAuthError
        ) {
          setRetryInfo(null);
          throw err;
        }
        if (i < attemptsPlan.length - 1) {
          continue;
        } else {
          setRetryInfo(null);
          throw err;
        }
      }
    }

    throw new Error('فشلت جميع محاولات الاتصال بـ Gemini');
  };

  // Main runner: process pending or failed batches
  const runBatches = async (onlyFailed = false) => {
    if (!session) return;

    // Reset temporary notices
    setDailyQuotaNotice(null);
    setDailyLimitNotice(null);
    setModelBusyNotice(null);

    // 1. Check budget limit
    const budgetOk = await checkBudgetThreshold();
    if (!budgetOk) {
      setStatusMessage('تم إيقاف المعالجة لأن استهلاك الشهر وصل إلى 100% من الميزانية المحددة في الإعدادات.');
      return;
    }

    // 2. Check daily request limit
    const dailyOk = await checkDailyRequestLimit();
    if (!dailyOk) {
      return;
    }

    // Wake Lock
    await requestWakeLock();
    setIsProcessing(true);
    setIsPaused(false);
    pauseRef.current = false;

    // Load PDF Document from IndexedDB or file
    let pdfDoc: any = null;
    try {
      const storedPdf = await getStoredPdfFile(session.file_id);
      if (storedPdf) {
        pdfDoc = await loadPdfDocument(storedPdf.array_buffer);
      } else if (file) {
        pdfDoc = await loadPdfDocument(file);
      } else {
        throw new Error('ملف الـ PDF الأصلي غير موجود في التخزين المؤقت.');
      }
    } catch (err: any) {
      setStatusMessage(`تعذر فتح ملف الـ PDF: ${err.message}`);
      setIsProcessing(false);
      await releaseWakeLock();
      return;
    }

    const currentSession: BatchSession = {
      ...session,
      status: 'running',
      updated_at: Date.now(),
    };
    await saveBatchSession(currentSession);
    setSession({ ...currentSession });

    const priorProductsSnapshot = [...existingProducts];
    let updatedProducts = [...existingProducts];
    const sessionExtractedProducts: Product[] = [];

    // Filter batches to process
    const batchesToProcess = currentSession.batches.filter((b) =>
      onlyFailed ? b.status === 'failed' : b.status !== 'completed'
    );

    // Number of pages per API request: 1 or 2 (default 1). Never more than 2!
    const pagesPerRequest = Math.min(2, Math.max(1, settings.pages_per_request || 1));

    for (let bIdx = 0; bIdx < batchesToProcess.length; bIdx++) {
      if (pauseRef.current) break;

      const batch = batchesToProcess[bIdx];
      const batchRef = currentSession.batches.find((b) => b.batch_index === batch.batch_index);
      if (!batchRef) continue;

      batchRef.status = 'processing';
      await saveBatchSession(currentSession);
      setSession({ ...currentSession });

      setStatusMessage(
        `جاري معالجة الدفعة ${batchRef.batch_index} من ${currentSession.batches.length} (الصفحات ${batchRef.page_start} إلى ${batchRef.page_end})...`
      );

      let batchExtractedCount = 0;
      let batchFailed = false;
      let batchErrorMessage = '';

      // Process pages in batch: step by pagesPerRequest (1 or 2)
      for (let pNum = batchRef.page_start; pNum <= batchRef.page_end; pNum += pagesPerRequest) {
        if (pauseRef.current) break;

        // Check daily request limit before each API call
        const limitAllowed = await checkDailyRequestLimit();
        if (!limitAllowed) {
          pauseRef.current = true;
          batchRef.status = 'pending';
          break;
        }

        try {
          // Render 1 or 2 pages
          const pageItems: PageImageItem[] = [];
          const p1Item = await renderPdfPageToImage(pdfDoc, pNum);
          pageItems.push(p1Item);

          if (pagesPerRequest === 2 && pNum + 1 <= batchRef.page_end) {
            const p2Item = await renderPdfPageToImage(pdfDoc, pNum + 1);
            pageItems.push(p2Item);
          }

          const pageLabels = pageItems.map((p) => p.pageNumber).join(' و ');
          setStatusMessage(
            `جاري إرسال صفحة ${pageLabels} إلى Gemini (${pageItems.length} صفحة بالطلب)...`
          );

          const { data, usage, model: usedModel } = await callGeminiWithRetry(
            pageItems,
            currentSession.total_pages,
            pNum,
            currentSession.file_name,
            batchRef.batch_index
          );
          const rawProducts: any[] = data.products || [];
          const sectionTitle: string = data.section_title || '';

          // Record API usage log
          if (usage) {
            const inputTokens = usage.input_tokens || usage.promptTokenCount || 0;
            const outputTokens = usage.output_tokens || usage.candidatesTokenCount || 0;
            const inputCostUsd =
              (inputTokens / 1_000_000) * (settings.gemini_input_cost_per_million_usd || 0.1);
            const outputCostUsd =
              (outputTokens / 1_000_000) * (settings.gemini_output_cost_per_million_usd || 0.4);
            const totalCostUsd = inputCostUsd + outputCostUsd;
            const totalCostEgp = totalCostUsd * (settings.usd_to_egp_rate || 50);

            const usageLog: ApiUsageLog = {
              id: `log_${Date.now()}_p${pNum}`,
              timestamp: Date.now(),
              file_name: currentSession.file_name,
              batch_number: batchRef.batch_index,
              page_number: pNum,
              model: usedModel || settings.primary_model || 'gemini-4-hydrogen',
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              total_tokens: inputTokens + outputTokens,
              cost_usd: totalCostUsd,
              cost_egp: totalCostEgp,
            };
            await logApiUsage(usageLog);
          }

          // Process and save products
          const extractedProducts: Product[] = [];
          for (let idx = 0; idx < rawProducts.length; idx++) {
            const item = rawProducts[idx];
            if (!item.name || typeof item.name !== 'string') continue;

            const cleanWholesale =
              typeof item.wholesale_price === 'number'
                ? item.wholesale_price
                : Number(String(item.wholesale_price).replace(/[^0-9.]/g, '')) || 0;

            const itemPageNum = item.page_number || pNum;
            const category = resolveCategory(item.category || '', item.name, sectionTitle);
            const box = item.box_2d as [number, number, number, number] | undefined;
            const boxOk = isBoxValid(box);

            // Find matching page item for cropping
            const matchedPageItem =
              pageItems.find((pi) => pi.pageNumber === itemPageNum) || pageItems[0];

            let croppedImage: string | undefined = undefined;
            if (boxOk && box && matchedPageItem) {
              croppedImage = await cropAndCompressProductImage(matchedPageItem.dataUrl, box);
            }

            const cardIndex = item.card_index || idx + 1;
            const pCode = (item.code || `PRD-P${itemPageNum}-${cardIndex}`).trim();
            const pName = item.name.trim();

            const curSupplier = currentSession.supplier_name || supplierName.trim();
            const existingMatch = priorProductsSnapshot.find(
              (ep) =>
                (ep.code && ep.code.toLowerCase() === pCode.toLowerCase()) ||
                (curSupplier && ep.supplier === curSupplier && ep.name.trim().toLowerCase() === pName.toLowerCase())
            );

            let priceHistory = existingMatch?.wholesale_price_history || [];
            let priceChanged = false;
            let prevWholesale = existingMatch?.wholesale_price;
            let existingSelling = existingMatch?.selling_price || 0;
            let wasIncluded = existingMatch?.included_in_catalog || false;

            if (existingMatch && existingMatch.wholesale_price && existingMatch.wholesale_price !== cleanWholesale) {
              priceChanged = true;
              const nextHistory = [...(existingMatch.wholesale_price_history || [])];
              nextHistory.push({ price: existingMatch.wholesale_price, date: Date.now() });
              priceHistory = nextHistory.slice(-5);
            }

            const newProduct: Product = {
              id: existingMatch ? existingMatch.id : `prod_p${itemPageNum}_c${cardIndex}_${idx}_${Date.now()}`,
              code: pCode,
              name: pName,
              category,
              group: item.group || '',
              model: item.model || '',
              specification: item.specification || '',
              supplier: curSupplier || existingMatch?.supplier || '',
              wholesale_price: cleanWholesale,
              previous_wholesale_price: prevWholesale,
              wholesale_price_history: priceHistory,
              price_changed: priceChanged,
              selling_price: existingSelling,
              included_in_catalog: wasIncluded,
              available_models: Array.isArray(item.available_models) ? item.available_models : [],
              image_url: croppedImage || existingMatch?.image_url,
              box_2d: box,
              raw_bounding_box: box,
              page_number: itemPageNum,
              card_index: cardIndex,
              section_title: sectionTitle,
              needs_crop_adjustment: !boxOk || !croppedImage,
              source_file: currentSession.file_name,
              created_at: existingMatch?.created_at || Date.now(),
              updated_at: Date.now(),
            };

            await saveProduct(newProduct);
            extractedProducts.push(newProduct);
          }

          // Save page extraction reports
          for (const pi of pageItems) {
            const pageProds = extractedProducts.filter((p) => p.page_number === pi.pageNumber);
            const report: PageExtractionReport = {
              id: `${currentSession.file_name}_p${pi.pageNumber}`,
              file_name: currentSession.file_name,
              page_number: pi.pageNumber,
              section_title: sectionTitle || 'عام',
              cards_detected: pageProds.length,
              products_saved: pageProds.length,
              is_warning: pageProds.length < 4,
              warning_message:
                pageProds.length < 4
                  ? `تم حفظ ${pageProds.length} صنف فقط من هذه الصفحة.`
                  : undefined,
              timestamp: Date.now(),
            };
            await saveExtractionReport(report);
          }

          batchExtractedCount += extractedProducts.length;
          sessionExtractedProducts.push(...extractedProducts);
          // Upsert by id so existing products are updated cleanly without duplicate IDs
          const extractedMap = new Map(extractedProducts.map((p) => [p.id, p]));
          updatedProducts = updatedProducts.map((p) => extractedMap.get(p.id) || p);
          extractedProducts.forEach((p) => {
            if (!updatedProducts.some((up) => up.id === p.id)) {
              updatedProducts.push(p);
            }
          });
          onProductsUpdated(updatedProducts);

          // Calm delay between requests
          await new Promise((r) => setTimeout(r, 1500));
        } catch (pageErr: any) {
          if (pageErr.isDailyQuota) {
            setDailyQuotaNotice(pageErr.message);
            setStatusMessage(pageErr.message);
            pauseRef.current = true;
            batchRef.status = 'pending';
            break;
          }

          if (pageErr.isServerAuthError) {
            setStatusMessage(pageErr.message);
            toast.error(pageErr.message);
            pauseRef.current = true;
            batchRef.status = 'pending';
            break;
          }

          if (pageErr.isModelOverloadedHalt) {
            setModelBusyNotice('الموديل مشغول حالياً، جرّب بعد قليل أو غيّر الموديل من الإعدادات');
            setStatusMessage('الموديل مشغول حالياً، جرّب بعد قليل أو غيّر الموديل من الإعدادات');
            pauseRef.current = true;
            batchRef.status = 'pending';
            break;
          }

          if (pageErr.message === 'PAUSED') {
            break;
          }

          batchFailed = true;
          batchErrorMessage = pageErr.message || 'خطأ أثناء استخراج الصفحة';
          console.error(`Page error:`, pageErr);
        }
      }

      if (pauseRef.current) {
        batchRef.status = 'pending';
        await saveBatchSession(currentSession);
        setSession({ ...currentSession });
        break;
      }

      if (batchFailed) {
        batchRef.status = 'failed';
        batchRef.error_message = batchErrorMessage;
        batchRef.retry_count = (batchRef.retry_count || 0) + 1;
      } else {
        batchRef.status = 'completed';
        batchRef.products_count = batchExtractedCount;
        batchRef.error_message = undefined;
        batchRef.completed_at = Date.now();
      }

      currentSession.total_products_extracted = currentSession.batches.reduce(
        (sum, b) => sum + (b.products_count || 0),
        0
      );
      currentSession.updated_at = Date.now();
      await saveBatchSession(currentSession);
      setSession({ ...currentSession });
    }

    // Check completion status
    const allDone = currentSession.batches.every((b) => b.status === 'completed');
    const hasFailures = currentSession.batches.some((b) => b.status === 'failed');

    if (allDone) {
      currentSession.status = 'completed';
      await markFileProcessed(currentSession.file_name, currentSession.file_size, currentSession.file_last_modified);
      setStatusMessage('اكتملت جميع الدفعات بنجاح!');

      const curSupplier = currentSession.supplier_name || supplierName.trim();
      const changes = computeSupplierChanges(sessionExtractedProducts, priorProductsSnapshot, curSupplier);
      if (changes.length > 0) {
        setSupplierChangesList(changes);
        setShowSupplierChangesModal(true);
      }

      onFinished?.();
    } else if (hasFailures) {
      currentSession.status = 'failed';
      setStatusMessage('اكتملت بعض الدفعات مع وجود دفعات فشلت. يمكنك الضغط على "أعد المحاولة للفاشل بس".');
    } else if (pauseRef.current) {
      currentSession.status = 'paused';
    }

    await saveBatchSession(currentSession);
    setSession({ ...currentSession });
    setIsProcessing(false);
    await releaseWakeLock();
  };

  const handlePause = () => {
    setIsPaused(true);
    pauseRef.current = true;
    setStatusMessage('جاري إنهاء الصفحة الحالية والإيقاف المؤقت...');
  };

  // Stats calculation
  const completedBatches = session?.batches.filter((b) => b.status === 'completed').length || 0;
  const failedBatches = session?.batches.filter((b) => b.status === 'failed').length || 0;
  const pendingBatches = session?.batches.filter((b) => b.status === 'pending').length || 0;
  const totalBatches = session?.batches.length || 0;
  const percent = totalBatches > 0 ? Math.round((completedBatches / totalBatches) * 100) : 0;

  // Partial Export Handlers
  const handleExportPartialPdf = async () => {
    if (!session) return;
    try {
      setStatusMessage('جاري إنشاء كتالوج جزئي للـ PDF...');
      await exportPartialCatalogPdf(session, existingProducts, settings);
      setStatusMessage('تم تحميل الكتالوج الجزئي بنجاح!');
      toast.success('تم تحميل الكتالوج الجزئي بنجاح!');
    } catch (err: any) {
      toast.error(`تعذر تصدير الكتالوج الجزئي: ${err.message}`);
    }
  };

  const handleExportPartialExcel = () => {
    if (!session) return;
    try {
      exportPartialExcel(session, existingProducts);
      setStatusMessage('تم تحميل ملف Excel الجزئي بنجاح!');
      toast.success('تم تحميل ملف Excel الجزئي بنجاح!');
    } catch (err: any) {
      toast.error(`تعذر تصدير Excel الجزئي: ${err.message}`);
    }
  };

  if (duplicateModal) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-4 text-slate-800">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
            <AlertTriangle size={22} />
          </div>
          <div>
            <h3 className="font-bold text-base text-amber-900">
              هذا الملف تمت قراءته مسبقاً!
            </h3>
            <p className="text-xs text-amber-800 mt-1">
              تم العثور على تحليل سابق لنفس الملف &quot;{duplicateModal.newFile.name}&quot;
              {duplicateModal.date ? ` بتاريخ ${duplicateModal.date}` : ''} ويحتوي على {duplicateModal.productsCount} منتج محفوظ.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleUseDuplicatePrevious}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs"
          >
            استخدام المنتجات السابقة مباشرة
          </button>
          <button
            onClick={handleRereadDuplicate}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl cursor-pointer"
          >
            إعادة القراءة من البداية
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-8 text-center text-slate-500">
        <RefreshCw size={24} className="animate-spin mx-auto text-sky-600 mb-2" />
        <p className="text-xs font-bold">جاري تجهيز الدفعات...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-5">
      {/* Daily Quota Exhausted Alert */}
      {dailyQuotaNotice && (
        <div className="p-4 bg-red-50 border-2 border-red-300 rounded-2xl text-red-900 flex items-start gap-3 animate-in fade-in">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-700 shrink-0 font-bold">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h4 className="font-bold text-sm">تنبيه: {dailyQuotaNotice}</h4>
            <p className="text-xs text-red-700 mt-0.5">
              تم إيقاف المعالجة فوراً وحفظ جميع ما تم إنجازه في المتصفح. يمكنك الضغط على زر &quot;استكمال باقي الدفعات&quot; لاحقاً بعد انتهاء فترة الانتظار.
            </p>
          </div>
        </div>
      )}

      {/* Daily Limit Reached Alert */}
      {dailyLimitNotice && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-amber-900 flex items-start gap-3 animate-in fade-in">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800 shrink-0 font-bold">
            <AlertCircle size={20} />
          </div>
          <div>
            <h4 className="font-bold text-sm">تنبيه الحد اليومي للطلبات</h4>
            <p className="text-xs text-amber-800 mt-0.5">{dailyLimitNotice}</p>
          </div>
        </div>
      )}

      {/* Model Busy Alert with Resume Button (User Request) */}
      {modelBusyNotice && (
        <div className="p-4 bg-amber-50 border-2 border-amber-400 rounded-2xl text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-200/80 flex items-center justify-center text-amber-900 shrink-0 font-bold">
              <Clock size={20} />
            </div>
            <div>
              <h4 className="font-bold text-sm">{modelBusyNotice}</h4>
              <p className="text-xs text-amber-800 mt-0.5">
                خوادم الذكاء الاصطناعي تشهد ضغطاً مؤقتاً. تم حفظ كافة الدفعات المنجزة، ويمكنك متابعة العمل الآن أو تغيير الموديل من الإعدادات.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              onClick={() => {
                setModelBusyNotice(null);
                runBatches(false);
              }}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <Play size={14} />
              <span>كمّل</span>
            </button>
          </div>
        </div>
      )}

      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
            <Layers size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <span>المعالجة على دفعات: {session.file_name}</span>
              <span className="text-[11px] font-normal text-slate-500">
                ({session.total_pages} صفحة / {session.batch_size} صفحات بالدفعة /{' '}
                {settings.pages_per_request === 2 ? 'صفحتان بالطلب' : 'صفحة بالطلب'})
              </span>
            </h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-sky-50 text-sky-900 border border-sky-200 text-xs font-bold font-mono">
                <Sparkles size={12} className="text-sky-600" />
                الموديل: {settingsRef.current.primary_model || 'gemini-4-hydrogen'}
              </span>
              <span className="text-xs text-slate-500">
                • كل دفعة تُحفظ في المتصفح فوراً، والشاشة مستيقظة تلقائياً.
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {!isProcessing ? (
            <button
              onClick={() => runBatches(false)}
              className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
            >
              <Play size={14} />
              {completedBatches > 0 ? 'استكمال باقي الدفعات' : 'بدء تشغيل الدفعات'}
            </button>
          ) : (
            <button
              onClick={handlePause}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
            >
              <Pause size={14} />
              إيقاف مؤقت
            </button>
          )}

          {failedBatches > 0 && !isProcessing && (
            <button
              onClick={() => runBatches(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
            >
              <RotateCcw size={14} />
              أعد المحاولة للفاشل بس ({failedBatches})
            </button>
          )}
        </div>
      </div>

      {/* Supplier & Price Comparison Bar */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1">
          <label className="font-bold text-slate-700 whitespace-nowrap">اسم المورد:</label>
          <input
            type="text"
            placeholder="اكتب اسم المورد (مثال: التقنية، دبي، الصفا...)"
            value={supplierName}
            onChange={(e) => {
              const val = e.target.value;
              setSupplierName(val);
              if (session) {
                const updatedSession: BatchSession = { ...session, supplier_name: val };
                setSession(updatedSession);
                saveBatchSession(updatedSession);
              }
            }}
            className="w-full sm:max-w-xs p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-sky-500"
          />
        </div>
        <div className="flex items-center gap-2">
          {supplierChangesList.length > 0 && (
            <button
              onClick={() => setShowSupplierChangesModal(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              📊 مراجعة التغييرات ({supplierChangesList.length})
            </button>
          )}
          <button
            onClick={() => {
              const curSupplier = session?.supplier_name || supplierName.trim();
              const changes = computeExistingSupplierChanges(existingProducts, curSupplier);
              setSupplierChangesList(changes);
              if (changes.length > 0) {
                setShowSupplierChangesModal(true);
              } else {
                toast.info('لا توجد تغييرات أسعار مكتشفة لهذا المورد حتى الآن.');
              }
            }}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-lg text-xs cursor-pointer transition-colors"
          >
            فحص تغييرات الأسعار الآن
          </button>
        </div>
      </div>

      {/* Progress Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <span className="text-[11px] text-slate-500 block">إجمالي الدفعات</span>
          <span className="text-lg font-bold text-slate-800">{totalBatches}</span>
        </div>
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
          <span className="text-[11px] text-emerald-700 font-bold block flex items-center gap-1">
            <CheckCircle2 size={13} /> تمت بنجاح
          </span>
          <span className="text-lg font-bold text-emerald-800">{completedBatches}</span>
        </div>
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
          <span className="text-[11px] text-rose-700 font-bold block flex items-center gap-1">
            <AlertCircle size={13} /> فشلت
          </span>
          <span className="text-lg font-bold text-rose-800">{failedBatches}</span>
        </div>
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
          <span className="text-[11px] text-amber-700 font-bold block flex items-center gap-1">
            <Clock size={13} /> في الانتظار
          </span>
          <span className="text-lg font-bold text-amber-800">{pendingBatches}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
          <span>{statusMessage || 'جاهز للمعالجة'}</span>
          <span className="font-mono text-sky-700">{percent}%</span>
        </div>
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="bg-sky-600 h-full rounded-full transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Rate Limit Retry notice (transient) */}
      {retryInfo && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
          <RefreshCw size={14} className="animate-spin text-amber-600 shrink-0" />
          <span>{retryInfo}</span>
        </div>
      )}

      {/* Budget Exceeded Warning */}
      {budgetExceeded && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <AlertCircle size={15} /> تم الوصول للحد الأقصى للميزانية الشهرية (100%)
          </p>
          <p className="text-[11px] text-red-700">
            يمكنك رفع الميزانية من الإعدادات أو استكمال القراءة يدوياً بدون ذكاء اصطناعي.
          </p>
        </div>
      )}

      {/* Batches Table / Grid */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-800">تفاصيل الدفعات:</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto p-1">
          {session.batches.map((batch) => {
            const isCompleted = batch.status === 'completed';
            const isFailed = batch.status === 'failed';
            const isProcessingBatch = batch.status === 'processing';

            return (
              <div
                key={batch.batch_index}
                className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                  isCompleted
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                    : isFailed
                    ? 'bg-rose-50/60 border-rose-200 text-rose-950'
                    : isProcessingBatch
                    ? 'bg-sky-50 border-sky-300 text-sky-950 animate-pulse'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <div>
                  <span className="font-bold block">
                    دفعة {batch.batch_index} (صفحة {batch.page_start} - {batch.page_end})
                  </span>
                  <span className="text-[11px] opacity-75">
                    {isCompleted
                      ? `✅ تمت (${batch.products_count || 0} صنف)`
                      : isFailed
                      ? `❌ ${batch.error_message || 'فشلت'}`
                      : isProcessingBatch
                      ? '⏳ جاري المعالجة...'
                      : '⏳ في الانتظار'}
                  </span>
                </div>

                {isCompleted && <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />}
                {isFailed && <AlertCircle size={16} className="text-rose-600 shrink-0" />}
                {isProcessingBatch && (
                  <RefreshCw size={15} className="animate-spin text-sky-600 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Feature 3: Partial Export Actions */}
      {completedBatches > 0 && (
        <div className="p-4 bg-gradient-to-l from-sky-50 to-indigo-50 border border-sky-200 rounded-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-xs text-sky-900 flex items-center gap-1.5">
                <Sparkles size={15} className="text-sky-600" />
                تصدير جزئي فوري (صدّر اللي خلص بس)
              </h4>
              <p className="text-[11px] text-sky-800 mt-0.5">
                يمكنك تحميل كتالوج PDF وExcel فوري يحتوي على الدفعات المكتملة فقط ({completedBatches} من {totalBatches} دفعة)
                مع تنبيه واضح بأن باقي الملف قيد المعالجة.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleExportPartialPdf}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
              >
                <FileText size={14} />
                تصدير PDF جزئي
              </button>

              <button
                onClick={handleExportPartialExcel}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
              >
                <FileSpreadsheet size={14} />
                تصدير Excel جزئي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feature 2: Supplier Changes Comparison Modal */}
      {showSupplierChangesModal && (
        <SupplierChangesModal
          supplierName={session.supplier_name || supplierName || 'المورد'}
          items={supplierChangesList}
          allProducts={existingProducts}
          settings={settings}
          onApplyChanges={(updated) => {
            onProductsUpdated(updated);
            setShowSupplierChangesModal(false);
          }}
          onClose={() => setShowSupplierChangesModal(false)}
        />
      )}
    </div>
  );
};
