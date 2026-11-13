import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Edit3,
  Check,
  X,
  EyeOff,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Image as ImageIcon,
  DollarSign,
  Tag,
  Layers,
} from 'lucide-react';
import { Product, CatalogSettings, CatalogAuditIssue } from '../types';
import { updateProduct } from '../utils/db';
import { useUiFeedback } from './UiFeedbackProvider';

interface CatalogReviewModalProps {
  products: Product[];
  settings: CatalogSettings;
  actionTitle: string; // e.g. "تحميل PDF" | "تحميل إكسيل" | "إرسال واتساب"
  onConfirm: () => void;
  onClose: () => void;
  onProductsUpdated?: (prods: Product[]) => void;
}

export const CatalogReviewModal: React.FC<CatalogReviewModalProps> = ({
  products,
  settings,
  actionTitle,
  onConfirm,
  onClose,
  onProductsUpdated,
}) => {
  const { toast } = useUiFeedback();
  const [activeFilter, setActiveFilter] = useState<'all' | 'errors' | 'warnings'>('all');
  const [ignoredIssues, setIgnoredIssues] = useState<Set<string>>(new Set());
  const [confirmedDespiteErrors, setConfirmedDespiteErrors] = useState(false);

  // In-place quick edit state
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editSellingPrice, setEditSellingPrice] = useState<number>(0);
  const [editWholesalePrice, setEditWholesalePrice] = useState<number>(0);
  const [editCategory, setEditCategory] = useState<string>('');
  const [editCode, setEditCode] = useState<string>('');

  const minMarginPercent = settings.min_profit_margin_percent ?? 10;

  // Calculate medians per category for price anomaly detection
  const categoryMedians = useMemo(() => {
    const map = new Map<string, number>();
    const byCat = new Map<string, number[]>();

    products.forEach((p) => {
      const cat = p.category?.trim() || 'متنوع';
      const price = Number(p.selling_price) || 0;
      if (price > 0) {
        if (!byCat.has(cat)) byCat.set(cat, []);
        byCat.get(cat)!.push(price);
      }
    });

    byCat.forEach((prices, cat) => {
      if (prices.length > 0) {
        const sorted = [...prices].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
        map.set(cat, median);
      }
    });

    return map;
  }, [products]);

  // Find duplicate codes
  const codeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => {
      const code = p.code?.trim().toLowerCase();
      if (code) {
        counts.set(code, (counts.get(code) || 0) + 1);
      }
    });
    return counts;
  }, [products]);

  // Run audit issues detection
  const auditIssues = useMemo(() => {
    const list: CatalogAuditIssue[] = [];

    products.forEach((p) => {
      const pId = p.id;
      const wholesale = Number(p.wholesale_price) || 0;
      const selling = Number(p.selling_price) || 0;
      const isUnread = Boolean((p as any).is_unread_placeholder);

      // Check unread placeholder
      if (isUnread) {
        list.push({
          id: `unread_${pId}`,
          product_id: pId,
          product_name: p.name,
          product_code: p.code,
          product_image: p.image_url,
          product_category: p.category,
          severity: 'warning',
          type: 'unread_page_placeholder',
          message: 'صفحة لم تُقرأ بسبب فشل قراءة الدفعة في وقت سابق',
          details: 'سيظهر هذا الصنف في الكتالوج كصفحة معلقة',
        });
        return;
      }

      // 1. ERROR: Zero or missing selling price
      if (selling <= 0) {
        list.push({
          id: `no_price_${pId}`,
          product_id: pId,
          product_name: p.name,
          product_code: p.code,
          product_image: p.image_url,
          product_category: p.category,
          product_wholesale_price: wholesale,
          product_selling_price: selling,
          severity: 'error',
          type: 'zero_or_missing_selling_price',
          message: 'صنف من غير سعر بيع أو سعره صفر',
          details: `سعر البيع الحالي: ${selling} ج.م`,
        });
      }

      // 2. ERROR: Selling price <= Wholesale price
      if (wholesale > 0 && selling > 0 && selling <= wholesale) {
        list.push({
          id: `loss_price_${pId}`,
          product_id: pId,
          product_name: p.name,
          product_code: p.code,
          product_image: p.image_url,
          product_category: p.category,
          product_wholesale_price: wholesale,
          product_selling_price: selling,
          severity: 'error',
          type: 'selling_below_wholesale',
          message: 'سعر البيع أقل من أو يساوي سعر الشراء (خسارة أو بدون ربح)',
          details: `سعر البيع: ${selling} ج.م / سعر الشراء: ${wholesale} ج.م`,
        });
      }

      // 3. ERROR: Duplicate product code
      const codeKey = p.code?.trim().toLowerCase();
      if (codeKey && (codeCounts.get(codeKey) || 0) > 1) {
        list.push({
          id: `dup_code_${pId}`,
          product_id: pId,
          product_name: p.name,
          product_code: p.code,
          product_image: p.image_url,
          product_category: p.category,
          severity: 'error',
          type: 'duplicate_code',
          message: `كود مكرر (${p.code}) موجود في أكثر من صنف`,
          details: 'تكرار الأكواد قد يسبب التباساً عند طلب العميل',
        });
      }

      // 4. ERROR: Missing category
      if (!p.category || !p.category.trim()) {
        list.push({
          id: `no_cat_${pId}`,
          product_id: pId,
          product_name: p.name,
          product_code: p.code,
          product_image: p.image_url,
          severity: 'error',
          type: 'missing_category',
          message: 'صنف بدون نوع / قسم محدد',
          details: 'لن يتم تصنيفه بشكل صحيح في فواصل الأقسام',
        });
      }

      // 5. WARNING: Low profit margin < threshold
      if (wholesale > 0 && selling > wholesale) {
        const margin = Math.round(((selling - wholesale) / selling) * 100);
        if (margin < minMarginPercent) {
          list.push({
            id: `low_margin_${pId}`,
            product_id: pId,
            product_name: p.name,
            product_code: p.code,
            product_image: p.image_url,
            product_category: p.category,
            product_wholesale_price: wholesale,
            product_selling_price: selling,
            severity: 'warning',
            type: 'low_profit_margin',
            message: `هامش ربح منخفض (${margin}%) أقل من الحد الأدنى (${minMarginPercent}%)`,
            details: `الربح: ${selling - wholesale} ج.م`,
          });
        }
      }

      // 6. WARNING: Missing image
      if (!p.image_url) {
        list.push({
          id: `no_img_${pId}`,
          product_id: pId,
          product_name: p.name,
          product_code: p.code,
          product_category: p.category,
          severity: 'warning',
          type: 'missing_image',
          message: 'صنف بدون صورة',
          details: 'سيظهر في الكتالوج بمربع "بدون صورة"',
        });
      }

      // 7. WARNING: Unusual price vs category median (> 3x or < 1/3)
      const cat = p.category?.trim() || 'متنوع';
      const median = categoryMedians.get(cat);
      if (median && median > 0 && selling > 0) {
        if (selling > median * 3) {
          list.push({
            id: `high_price_${pId}`,
            product_id: pId,
            product_name: p.name,
            product_code: p.code,
            product_image: p.image_url,
            product_category: p.category,
            product_selling_price: selling,
            severity: 'warning',
            type: 'unusual_price_vs_median',
            message: `سعر بيع مرتفع جداً بالنسبة لقسم "${cat}" (${selling} ج.م مقابل وسيط ${Math.round(median)} ج.م)`,
            details: 'أكثر من 3 أضعاف السعر الوسيط لهذا النوع',
          });
        } else if (selling < median / 3) {
          list.push({
            id: `low_price_${pId}`,
            product_id: pId,
            product_name: p.name,
            product_code: p.code,
            product_image: p.image_url,
            product_category: p.category,
            product_selling_price: selling,
            severity: 'warning',
            type: 'unusual_price_vs_median',
            message: `سعر بيع منخفض جداً بالنسبة لقسم "${cat}" (${selling} ج.م مقابل وسيط ${Math.round(median)} ج.م)`,
            details: 'أقل من ثلث السعر الوسيط لهذا النوع',
          });
        }
      }
    });

    return list;
  }, [products, minMarginPercent, categoryMedians, codeCounts]);

  // Counts
  const activeIssues = useMemo(() => {
    return auditIssues.filter((issue) => !ignoredIssues.has(issue.id));
  }, [auditIssues, ignoredIssues]);

  const activeErrors = useMemo(() => {
    return activeIssues.filter((i) => i.severity === 'error');
  }, [activeIssues]);

  const activeWarnings = useMemo(() => {
    return activeIssues.filter((i) => i.severity === 'warning');
  }, [activeIssues]);

  const displayedIssues = useMemo(() => {
    if (activeFilter === 'errors') return auditIssues.filter((i) => i.severity === 'error');
    if (activeFilter === 'warnings') return auditIssues.filter((i) => i.severity === 'warning');
    return auditIssues;
  }, [auditIssues, activeFilter]);

  // Ignore toggle
  const toggleIgnore = (issueId: string) => {
    setIgnoredIssues((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });
  };

  // Start in-place edit
  const startEditing = (pId: string) => {
    const prod = products.find((p) => p.id === pId);
    if (!prod) return;
    setEditingProductId(pId);
    setEditSellingPrice(prod.selling_price || 0);
    setEditWholesalePrice(prod.wholesale_price || 0);
    setEditCategory(prod.category || '');
    setEditCode(prod.code || '');
  };

  // Save in-place edit
  const handleSaveEdit = async () => {
    if (!editingProductId) return;
    const prod = products.find((p) => p.id === editingProductId);
    if (!prod) return;

    const updated: Product = {
      ...prod,
      selling_price: editSellingPrice,
      wholesale_price: editWholesalePrice,
      category: editCategory.trim() || 'متنوع',
      code: editCode.trim(),
      manual_price_set: true,
      updated_at: Date.now(),
    };

    try {
      await updateProduct(updated);
      const nextProds = products.map((p) => (p.id === updated.id ? updated : p));
      onProductsUpdated?.(nextProds);
      setEditingProductId(null);
    } catch (err: any) {
      toast.error('تعذر حفظ التعديل: ' + err.message);
    }
  };

  // Can proceed?
  const canProceed = activeErrors.length === 0 || confirmedDespiteErrors;

  return (
    <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5" dir="rtl">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 overflow-hidden text-right">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <ShieldAlert size={22} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base">
                مراجعة الكتالوج قبل {actionTitle}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                فحص تلقائي لاكتشاف أخطاء التسعير، الأكواد المكررة، وهامش الربح
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Summary Bar (Requirement 1: ملخص عدد الأصناف والأخطاء والتحذيرات) */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-3 gap-3 text-center">
          <div className="p-2.5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-500 block">إجمالي الأصناف</span>
            <span className="text-lg font-black text-slate-800 font-mono mt-0.5 block">
              {products.length}
            </span>
          </div>

          <div
            className={`p-2.5 rounded-2xl border shadow-2xs transition-colors cursor-pointer ${
              activeErrors.length > 0
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-white border-slate-200 text-slate-400'
            }`}
            onClick={() => setActiveFilter(activeFilter === 'errors' ? 'all' : 'errors')}
          >
            <span className="text-[11px] font-bold block">الأخطاء الحرجة</span>
            <span className="text-lg font-black font-mono mt-0.5 block">
              {activeErrors.length}
            </span>
          </div>

          <div
            className={`p-2.5 rounded-2xl border shadow-2xs transition-colors cursor-pointer ${
              activeWarnings.length > 0
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-white border-slate-200 text-slate-400'
            }`}
            onClick={() => setActiveFilter(activeFilter === 'warnings' ? 'all' : 'warnings')}
          >
            <span className="text-[11px] font-bold block">التحذيرات</span>
            <span className="text-lg font-black font-mono mt-0.5 block">
              {activeWarnings.length}
            </span>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex border-b border-slate-100 px-6 gap-2 bg-white pt-2">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeFilter === 'all'
                ? 'border-sky-600 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            كل الملاحظات ({auditIssues.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('errors')}
            className={`px-3 py-1.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeFilter === 'errors'
                ? 'border-rose-600 text-rose-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            الأخطاء فقط ({activeErrors.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('warnings')}
            className={`px-3 py-1.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeFilter === 'warnings'
                ? 'border-amber-600 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            التحذيرات فقط ({activeWarnings.length})
          </button>
        </div>

        {/* Issues List Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
          {displayedIssues.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} />
              </div>
              <h4 className="font-extrabold text-slate-900 text-base">الكتالوج سليم 100%!</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                لم يتم العثور على أي أخطاء أو أسعار غريبة أو هوامش منخفضة. يمكنك إتمام {actionTitle} بأمان تام.
              </p>
            </div>
          ) : (
            displayedIssues.map((issue) => {
              const isIgnored = ignoredIssues.has(issue.id);
              const isEditing = editingProductId === issue.product_id;

              return (
                <div
                  key={issue.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isIgnored
                      ? 'bg-slate-50/70 border-slate-200 opacity-60'
                      : issue.severity === 'error'
                      ? 'bg-rose-50/50 border-rose-200'
                      : 'bg-amber-50/40 border-amber-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Item Thumbnail & Message */}
                    <div className="flex items-start gap-3 min-w-0">
                      {issue.product_image ? (
                        <img
                          src={issue.product_image}
                          alt={issue.product_name}
                          className="w-12 h-12 object-contain rounded-xl bg-white border border-slate-200 shrink-0 p-0.5"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center shrink-0">
                          <ImageIcon size={18} />
                        </div>
                      )}

                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              issue.severity === 'error'
                                ? 'bg-rose-600 text-white'
                                : 'bg-amber-500 text-white'
                            }`}
                          >
                            {issue.severity === 'error' ? 'خطأ يمنع التصدير' : 'تحذير'}
                          </span>
                          {issue.product_code && (
                            <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                              {issue.product_code}
                            </span>
                          )}
                          <h4 className="text-xs font-extrabold text-slate-900 truncate">
                            {issue.product_name}
                          </h4>
                        </div>

                        <p className="text-xs font-bold text-slate-800 leading-snug">
                          {issue.message}
                        </p>
                        {issue.details && (
                          <p className="text-[11px] text-slate-500">{issue.details}</p>
                        )}
                      </div>
                    </div>

                    {/* Actions: Edit in-place / Ignore */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEditing(issue.product_id)}
                        className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-sky-700 text-[11px] font-bold rounded-xl border border-slate-200 shadow-2xs transition-colors cursor-pointer flex items-center gap-1"
                        title="تعديل هذا الصنف من نفس الشاشة"
                      >
                        <Edit3 size={13} />
                        <span>تعديل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleIgnore(issue.id)}
                        className={`px-2.5 py-1.5 text-[11px] font-bold rounded-xl border transition-colors cursor-pointer ${
                          isIgnored
                            ? 'bg-slate-200 text-slate-700 border-slate-300'
                            : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                        title={isIgnored ? 'إلغاء التجاهل' : 'تجاهل هذه الملاحظة للمتابعة'}
                      >
                        {isIgnored ? 'تراجع' : 'تجاهل'}
                      </button>
                    </div>
                  </div>

                  {/* In-place Quick Editor if this item is being edited */}
                  {isEditing && (
                    <div className="mt-3 pt-3 border-t border-slate-200/80 bg-white p-3 rounded-xl space-y-3">
                      <span className="text-[11px] font-extrabold text-sky-800 block">
                        تعديل سريع للصنف:
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            سعر البيع (ج.م):
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={editSellingPrice}
                            onChange={(e) => setEditSellingPrice(Number(e.target.value) || 0)}
                            className="w-full p-1.5 border border-slate-300 rounded-lg text-xs font-bold text-emerald-700 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            سعر الشراء (ج.م):
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={editWholesalePrice}
                            onChange={(e) => setEditWholesalePrice(Number(e.target.value) || 0)}
                            className="w-full p-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            القسم / النوع:
                          </label>
                          <input
                            type="text"
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="w-full p-1.5 border border-slate-300 rounded-lg text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            كود الصنف:
                          </label>
                          <input
                            type="text"
                            value={editCode}
                            onChange={(e) => setEditCode(e.target.value)}
                            className="w-full p-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingProductId(null)}
                          className="px-3 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg"
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          className="px-4 py-1 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg shadow-2xs"
                        >
                          حفظ التعديل الآن
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer with Safeguard & Confirmation */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/70 space-y-3">
          {activeErrors.length > 0 && (
            <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-rose-50 border border-rose-200 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmedDespiteErrors}
                onChange={(e) => setConfirmedDespiteErrors(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
              <span className="text-xs font-extrabold text-rose-900 leading-snug">
                أنا متأكد من المتابعة رغم وجود {activeErrors.length} أخطاء حرجة قد تسبب التباساً أو خسارة في الأسعار.
              </span>
            </label>
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-white rounded-xl border border-slate-200 cursor-pointer"
            >
              العودة وتعديل الأصناف
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={!canProceed}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                canProceed
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Check size={16} />
              <span>متابعة وتنفيذ {actionTitle}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
