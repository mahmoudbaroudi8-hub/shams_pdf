import React, { useState, useMemo } from 'react';
import { Product, CatalogSettings, DispatchRecord, ALL_CATEGORIES, ProductCategory } from '../types';
import { generateCatalogPdf } from '../utils/pdfGenerator';
import { saveDispatch, saveProduct } from '../utils/db';
import { CatalogReviewModal } from './CatalogReviewModal';
import { useUiFeedback } from './UiFeedbackProvider';
import {
  Send,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Download,
  Share2,
  ExternalLink,
  Check,
  X,
  MessageCircle,
  HelpCircle,
  ShieldCheck,
} from 'lucide-react';

interface WhatsAppDispatchProps {
  products: Product[];
  settings: CatalogSettings;
  onDispatchRecorded: () => void;
  onProductsUpdated?: (products: Product[]) => void;
}

interface SplitItemConfig {
  id: string;
  title: string;
  categoryFilter?: string;
  selected: boolean;
  totalCount: number;
  unpricedCount: number;
  lossCount: number;
}

export const WhatsAppDispatch: React.FC<WhatsAppDispatchProps> = ({
  products,
  settings,
  onDispatchRecorded,
  onProductsUpdated,
}) => {
  const { toast, openExternalLink } = useUiFeedback();
  // Step 1: Selection & Mandatory Review
  // Step 2: Customer & WhatsApp Send
  // Step 3: Was it sent confirmation?
  const [currentStep, setCurrentStep] = useState<'review' | 'send' | 'confirm'>('review');

  // Splitting configuration
  const [includeUnified, setIncludeUnified] = useState(true);
  const [selectedSplitCategories, setSelectedSplitCategories] = useState<Set<string>>(
    new Set()
  );

  // Mandatory Review Confirmation
  const [hasReviewedAndApproved, setHasReviewedAndApproved] = useState(false);

  // Customer & Message Form
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customMessage, setCustomMessage] = useState(
    `أهلاً بحضرتك يا فندم! 🌸\nمرفق لسيادتكم كتالوج أحدث أسعار إكسسوارات الموبايل من ${settings.store_name}.\nالأسعار معتمدة ومحدثة، ويسعدنا تلقي طلباتكم واستفساراتكم في أي وقت!`
  );

  // Generating & sending state
  const [isGeneratingFile, setIsGeneratingFile] = useState<string | null>(null);
  const [downloadedPdfs, setDownloadedPdfs] = useState<string[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [pendingReviewItem, setPendingReviewItem] = useState<SplitItemConfig | null>(null);

  // Track dispatched items for logging
  const [lastDispatchedInfo, setLastDispatchedInfo] = useState<{
    customerName: string;
    customerPhone: string;
    categories: string[];
    productCount: number;
    items: Product[];
  } | null>(null);

  // Build list of split targets based on available products
  const availableCategories = useMemo(() => {
    const presentCats = new Set<string>();
    products.forEach((p) => {
      if (p.included_in_catalog) presentCats.add(p.category);
    });
    return Array.from(presentCats);
  }, [products]);

  // Compute stats for unified catalog and each category
  const reviewStats = useMemo(() => {
    const stats: SplitItemConfig[] = [];

    if (includeUnified) {
      const activeProducts = products.filter((p) => p.included_in_catalog);
      const unpriced = activeProducts.filter((p) => !p.selling_price || p.selling_price <= 0).length;
      const loss = activeProducts.filter(
        (p) => (p.selling_price || 0) > 0 && (p.selling_price || 0) < (p.wholesale_price || 0)
      ).length;

      stats.push({
        id: 'unified',
        title: 'الكتالوج الكامل الموحد (جميع الأقسام)',
        selected: true,
        totalCount: activeProducts.length,
        unpricedCount: unpriced,
        lossCount: loss,
      });
    }

    for (const cat of selectedSplitCategories) {
      const catProducts = products.filter((p) => p.included_in_catalog && p.category === cat);
      const unpriced = catProducts.filter((p) => !p.selling_price || p.selling_price <= 0).length;
      const loss = catProducts.filter(
        (p) => (p.selling_price || 0) > 0 && (p.selling_price || 0) < (p.wholesale_price || 0)
      ).length;

      stats.push({
        id: `cat_${cat}`,
        title: `كتالوج قسم: ${cat}`,
        categoryFilter: cat,
        selected: true,
        totalCount: catProducts.length,
        unpricedCount: unpriced,
        lossCount: loss,
      });
    }

    return stats;
  }, [products, includeUnified, selectedSplitCategories]);

  // Handle toggling category split
  const toggleSplitCategory = (cat: string) => {
    setSelectedSplitCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Trigger review before generating and opening WhatsApp
  const handleInitiateWhatsApp = (item: SplitItemConfig) => {
    if (!customerPhone.trim()) {
      toast.warning('يرجى كتابة رقم هاتف العميل أولاً (مثال: 01012345678 أو 201012345678).');
      return;
    }
    setPendingReviewItem(item);
    setShowReviewModal(true);
  };

  // Generate and send individual file after review
  const executeGenerateAndOpenWhatsApp = async (item: SplitItemConfig) => {
    try {
      setIsGeneratingFile(item.id);

      // Clean phone number: remove +, spaces, dashes. If starts with 01, prepend 20
      let cleanPhone = customerPhone.replace(/[^0-9]/g, '');
      if (cleanPhone.startsWith('01')) {
        cleanPhone = '20' + cleanPhone.slice(1);
      }

      const filename = `${settings.store_name}_${item.title.replace(/\s+/g, '_')}.pdf`;

      // 1. Generate Blob
      const pdfBlob = (await generateCatalogPdf(products, settings, {
        categoryFilter: item.categoryFilter,
        filename,
        action: 'blob',
      })) as Blob;

      // 2. Try Web Share API with files if mobile browser supports it
      let sharedViaApi = false;
      if (navigator.canShare && pdfBlob) {
        try {
          const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });
          if (navigator.canShare({ files: [pdfFile] })) {
            await navigator.share({
              files: [pdfFile],
              title: item.title,
              text: customMessage,
            });
            sharedViaApi = true;
          }
        } catch (e) {
          // Fallback to wa.me + download
          sharedViaApi = false;
        }
      }

      // If not shared via Web Share API, trigger download and open wa.me
      if (!sharedViaApi) {
        // Trigger automatic download to device
        const downloadUrl = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

        // Open WhatsApp web or app with pre-filled message safely outside iframe
        const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(customMessage)}`;
        openExternalLink({
          title: 'فتح محادثة واتساب',
          description: 'تم تنزيل ملف الكتالوج (PDF) على جهازك. افتح واتساب الآن وأرفق الملف في المحادثة.',
          url: waUrl,
          actionLabel: 'فتح واتساب الآن',
        });
      }

      setDownloadedPdfs((prev) => [...prev, item.id]);

      // Prepare dispatch record candidate
      const relevantProducts = products.filter((p) => {
        if (!p.included_in_catalog || (p.selling_price || 0) <= 0) return false;
        if (item.categoryFilter && p.category !== item.categoryFilter) return false;
        return true;
      });

      setLastDispatchedInfo({
        customerName: customerName.trim() || 'عميل واتساب',
        customerPhone: cleanPhone,
        categories: item.categoryFilter ? [item.categoryFilter] : ['جميع الأقسام'],
        productCount: relevantProducts.length,
        items: relevantProducts,
      });
    } catch (err: any) {
      toast.error(`حدث خطأ أثناء إعداد الملف: ${err.message || ''}`);
    } finally {
      setIsGeneratingFile(null);
    }
  };

  // Step 3 Confirmation: Was it actually sent?
  const handleConfirmSent = async (didSend: boolean) => {
    if (didSend && lastDispatchedInfo) {
      const record: DispatchRecord = {
        id: `disp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        customer_name: lastDispatchedInfo.customerName,
        customer_phone: lastDispatchedInfo.customerPhone,
        date: new Intl.DateTimeFormat('ar-EG', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date()),
        categories: lastDispatchedInfo.categories,
        product_count: lastDispatchedInfo.productCount,
        items_snapshot: lastDispatchedInfo.items.map((it) => ({
          code: it.code,
          name: it.name,
          category: it.category,
          selling_price: it.selling_price,
          wholesale_price: it.wholesale_price,
        })),
        created_at: Date.now(),
      };

      await saveDispatch(record);
      onDispatchRecorded();
      toast.success('تم تسجيل العملية بنجاح في سجل الإرسال.');
    }

    // Reset steps
    setCurrentStep('review');
    setHasReviewedAndApproved(false);
    setDownloadedPdfs([]);
    setLastDispatchedInfo(null);
  };

  return (
    <div className="space-y-6">
      {/* Step Header Indicator */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Send className="text-emerald-600" size={24} />
            المرحلة 4: التقسيم والمراجعة الإجبارية والإرسال عبر واتساب
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            اختر تقسيم الكتالوج حسب النوع أو كملف موحد، راجع الأسعار والتنبيهات، ثم أرسل للعميل مباشرة.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold">
          <div
            className={`px-3 py-1.5 rounded-lg border ${
              currentStep === 'review'
                ? 'bg-sky-600 text-white border-sky-600'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            1. المراجعة الإجبارية
          </div>
          <div
            className={`px-3 py-1.5 rounded-lg border ${
              currentStep === 'send'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            2. إرسال واتساب
          </div>
        </div>
      </div>

      {/* STEP 1: Mandatory Pre-send Review Screen */}
      {currentStep === 'review' && (
        <div className="space-y-5">
          {/* Splitting Options */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-800 text-sm">
              خيارات تقسيم وتوليد ملفات الـ PDF:
            </h3>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={includeUnified}
                  onChange={(e) => setIncludeUnified(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 w-4 h-4 cursor-pointer"
                />
                <span className="text-sm font-bold text-slate-800">كتالوج واحد كامل (جميع الأقسام)</span>
              </label>

              <div className="text-xs font-semibold text-slate-400">أو / ومع:</div>

              <div className="text-xs font-bold text-slate-600">تقسيم حسب النوع:</div>
              {availableCategories.map((cat) => (
                <label
                  key={cat}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
                    selectedSplitCategories.has(cat)
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSplitCategories.has(cat)}
                    onChange={() => toggleSplitCategory(cat)}
                    className="hidden"
                  />
                  <span>ملف منفصل لـ ({cat})</span>
                  {selectedSplitCategories.has(cat) && <Check size={14} />}
                </label>
              ))}
            </div>
          </div>

          {/* Mandatory Review Cards for each planned file */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <ShieldCheck size={20} className="text-amber-500" />
                شاشة المراجعة الإجبارية قبل الإرسال
              </h3>
              <span className="text-xs text-slate-500">
                يجب التأكد من خلو الملفات من أخطاء التسعير قبل المتابعة
              </span>
            </div>

            {reviewStats.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                يرجى تحديد خيار كتالوج واحد كامل أو اختيار أقسام لتوليدها.
              </div>
            ) : (
              <div className="space-y-3">
                {reviewStats.map((stat) => (
                  <div
                    key={stat.id}
                    className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">{stat.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        إجمالي المنتجات في هذا الملف: <span className="font-bold">{stat.totalCount}</span> منتج
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {/* Unpriced warning */}
                      {stat.unpricedCount > 0 ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-800 rounded-lg text-xs font-bold border border-red-200">
                          <AlertTriangle size={14} />
                          تحذير: {stat.unpricedCount} منتج بدون سعر بيع!
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold">
                          <Check size={13} />
                          جميع الأسعار محددة
                        </div>
                      )}

                      {/* Loss warning */}
                      {stat.lossCount > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-900 rounded-lg text-xs font-bold border border-amber-200">
                          <AlertTriangle size={14} />
                          {stat.lossCount} منتج بسعر أقل من الجملة!
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Approval Checkbox */}
            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasReviewedAndApproved}
                  onChange={(e) => setHasReviewedAndApproved(e.target.checked)}
                  className="rounded border-amber-400 text-emerald-600 focus:ring-emerald-500 w-5 h-5 cursor-pointer"
                />
                <div>
                  <span className="font-bold text-slate-800 text-sm">
                    أقر بأنني قمت بمراجعة الأسعار والأقسام وأنها جاهزة للإرسال للعملاء
                  </span>
                  <p className="text-xs text-slate-500">
                    الزر للمتابعة سيصبح متاحاً فور التأكيد.
                  </p>
                </div>
              </label>

              <button
                onClick={() => setCurrentStep('send')}
                disabled={!hasReviewedAndApproved || reviewStats.length === 0}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              >
                راجعت وتمام 🚀
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Customer Details & WhatsApp Dispatch */}
      {currentStep === 'send' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <MessageCircle size={20} className="text-emerald-600" />
                بيانات العميل ورسالة واتساب
              </h3>
              <button
                onClick={() => setCurrentStep('review')}
                className="text-xs text-sky-600 hover:underline font-semibold"
              >
                العودة للمراجعة
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم العميل:</label>
                <input
                  type="text"
                  placeholder="مثال: أستاذ محمود - محل الفرسان"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم واتساب العميل:</label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="01012345678 أو 201012345678"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-emerald-500 text-right"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                نص رسالة واتساب المرفقة (قابلة للتعديل):
              </label>
              <textarea
                rows={3}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-emerald-500"
              />
            </div>
          </div>

          {/* Simple Merchant Instructions Banner */}
          <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl flex items-start gap-3 text-sky-900 text-xs">
            <HelpCircle size={20} className="text-sky-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold">طريقة الإرسال البسيطة:</span>
              <p className="mt-1">
                1. عند الضغط على زر <strong className="text-emerald-700">"افتح واتساب"</strong>، سيتم تنزيل ملف الـ PDF فوراً على جهازك وفتح محادثة واتساب مع العميل ومعه نص الرسالة.
                <br />
                2. <strong className="underline">اسحب الملف داخل المحادثة</strong> (أو اضغط علامة الإرفاق 📎 في واتساب) ثم أرسل.
                <br />
                3. على الهاتف المحمول: إذا كان المتصفح يدعم مشاركة الملفات، سيُفتح واتساب والملف مرفق مباشرة!
              </p>
            </div>
          </div>

          {/* Files to Send */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-800 text-sm">الملفات الجاهزة للإرسال:</h3>

            <div className="space-y-3">
              {reviewStats.map((item) => {
                const isDownloading = isGeneratingFile === item.id;
                const wasDownloaded = downloadedPdfs.includes(item.id);

                return (
                  <div
                    key={item.id}
                    className="p-4 border border-slate-200 rounded-xl bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <FileText size={20} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">{item.title}</h4>
                        <p className="text-xs text-slate-500">
                          عدد المنتجات المتاحة: {item.totalCount} منتج مسعر
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleInitiateWhatsApp(item)}
                        disabled={isDownloading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <ExternalLink size={16} />
                        {isDownloading ? 'جاري تجهيز الـ PDF...' : 'افتح واتساب وأرفق الملف'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Finish & Record Dispatch Button */}
            {downloadedPdfs.length > 0 && (
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
                <button
                  onClick={() => setCurrentStep('confirm')}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold transition-all cursor-pointer"
                >
                  انتهيت من الإرسال (تسجيل في السجل)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: "اتبعت؟" Honest Follow-up Modal */}
      {currentStep === 'confirm' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
              <MessageCircle size={30} />
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-800">هل اتبعت الكتالوج للعميل بنجاح؟</h3>
              <p className="text-xs text-slate-500 mt-1">
                نحن لا ندّعي الإرسال التلقائي، بل نتأكد منك لتسجيل العملية وحفظ أسعار البيع المعتمدة في هذا التاريخ.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 text-right space-y-1">
              <div><strong>العميل:</strong> {customerName || 'عميل واتساب'}</div>
              <div><strong>الرقم:</strong> <span dir="ltr">{customerPhone}</span></div>
              <div><strong>عدد المنتجات:</strong> {lastDispatchedInfo?.productCount || 0} منتج</div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => handleConfirmSent(false)}
                className="py-2.5 px-4 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 font-bold text-sm cursor-pointer"
              >
                لا، لم يتم الإرسال
              </button>
              <button
                onClick={() => handleConfirmSent(true)}
                className="py-2.5 px-4 rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 font-bold text-sm shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                نعم، تم الإرسال وسجّل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory Pre-Dispatch Review Modal */}
      {showReviewModal && pendingReviewItem && (
        <CatalogReviewModal
          products={
            pendingReviewItem.categoryFilter
              ? products.filter(
                  (p) =>
                    p.included_in_catalog && p.category === pendingReviewItem.categoryFilter
                )
              : products.filter((p) => p.included_in_catalog)
          }
          settings={settings}
          actionTitle="إرسال واتساب"
          onClose={() => {
            setShowReviewModal(false);
            setPendingReviewItem(null);
          }}
          onConfirm={() => {
            const item = pendingReviewItem;
            setShowReviewModal(false);
            setPendingReviewItem(null);
            if (item) {
              executeGenerateAndOpenWhatsApp(item);
            }
          }}
          onProductsUpdated={(updatedList) => {
            if (onProductsUpdated) {
              const updatedMap = new Map(updatedList.map((p) => [p.id, p]));
              onProductsUpdated(products.map((p) => updatedMap.get(p.id) || p));
            }
          }}
        />
      )}
    </div>
  );
};
