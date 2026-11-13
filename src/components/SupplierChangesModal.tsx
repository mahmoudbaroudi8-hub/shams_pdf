import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  PlusCircle,
  MinusCircle,
  FileSpreadsheet,
  Check,
  X,
  Search,
  Filter,
  CheckCircle2,
  Edit2,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product, SupplierComparisonItem, CatalogSettings } from '../types';
import { updateProduct } from '../utils/db';

interface SupplierChangesModalProps {
  supplierName: string;
  items: SupplierComparisonItem[];
  allProducts: Product[];
  settings: CatalogSettings;
  onApplyChanges: (updatedProducts: Product[]) => void;
  onClose: () => void;
}

export const SupplierChangesModal: React.FC<SupplierChangesModalProps> = ({
  supplierName,
  items: initialItems,
  allProducts,
  settings,
  onApplyChanges,
  onClose,
}) => {
  const [items, setItems] = useState<SupplierComparisonItem[]>(initialItems);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<
    'all' | 'increased' | 'decreased' | 'new' | 'disappeared' | 'margin_dropped'
  >('all');
  const [minPercentFilter, setMinPercentFilter] = useState<number>(0);

  // Stats
  const increasedCount = useMemo(
    () => items.filter((i) => i.change_type === 'price_increased').length,
    [items]
  );
  const decreasedCount = useMemo(
    () => items.filter((i) => i.change_type === 'price_decreased').length,
    [items]
  );
  const newCount = useMemo(
    () => items.filter((i) => i.change_type === 'new').length,
    [items]
  );
  const disappearedCount = useMemo(
    () => items.filter((i) => i.change_type === 'disappeared').length,
    [items]
  );
  const marginDroppedCount = useMemo(
    () => items.filter((i) => i.change_type === 'margin_dropped').length,
    [items]
  );

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.code.toLowerCase().includes(searchQuery.toLowerCase());

      let matchType = true;
      if (activeFilter === 'increased') matchType = item.change_type === 'price_increased';
      if (activeFilter === 'decreased') matchType = item.change_type === 'price_decreased';
      if (activeFilter === 'new') matchType = item.change_type === 'new';
      if (activeFilter === 'disappeared') matchType = item.change_type === 'disappeared';
      if (activeFilter === 'margin_dropped') matchType = item.change_type === 'margin_dropped';

      let matchPercent = true;
      if (minPercentFilter > 0) {
        matchPercent = item.diff_percent >= minPercentFilter;
      }

      return matchSearch && matchType && matchPercent;
    });
  }, [items, searchQuery, activeFilter, minPercentFilter]);

  // Apply suggested price for a single item
  const handleApplySuggestedPrice = (targetItem: SupplierComparisonItem) => {
    setItems((prev) =>
      prev.map((it) =>
        it === targetItem
          ? {
              ...it,
              applied_selling_price: it.suggested_selling_price,
              is_selling_price_updated: true,
            }
          : it
      )
    );
  };

  // Keep current selling price as is
  const handleKeepCurrentPrice = (targetItem: SupplierComparisonItem) => {
    setItems((prev) =>
      prev.map((it) =>
        it === targetItem
          ? {
              ...it,
              applied_selling_price: it.current_selling_price,
              is_selling_price_updated: false,
            }
          : it
      )
    );
  };

  // Change applied price manually
  const handleCustomPriceChange = (targetItem: SupplierComparisonItem, val: number) => {
    setItems((prev) =>
      prev.map((it) =>
        it === targetItem
          ? {
              ...it,
              applied_selling_price: val,
              is_selling_price_updated: true,
            }
          : it
      )
    );
  };

  // Bulk Apply suggested prices to all items whose price increased
  const handleBulkApplySuggested = () => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.change_type === 'price_increased' || it.change_type === 'margin_dropped') {
          return {
            ...it,
            applied_selling_price: it.suggested_selling_price,
            is_selling_price_updated: true,
          };
        }
        return it;
      })
    );
  };

  // Bulk Keep current for all
  const handleBulkKeepCurrent = () => {
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        applied_selling_price: it.current_selling_price,
        is_selling_price_updated: false,
      }))
    );
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    const rows = items.map((it, idx) => ({
      'م': idx + 1,
      'المورد': it.supplier || supplierName,
      'كود الصنف': it.code,
      'اسم المنتج': it.name,
      'القسم': it.category,
      'سعر الشراء القديم': it.old_wholesale_price,
      'سعر الشراء الجديد': it.new_wholesale_price,
      'الفرق بالجنيه': it.diff_amount,
      'نسبة التغيير %': `${it.diff_percent}%`,
      'سعر البيع الحالي': it.current_selling_price,
      'سعر البيع المقترح': it.suggested_selling_price,
      'السعر المعتمد': it.applied_selling_price,
      'الحالة':
        it.change_type === 'new'
          ? 'صنف جديد'
          : it.change_type === 'disappeared'
          ? 'صنف اختفى'
          : it.change_type === 'price_increased'
          ? 'سعر الشراء زاد'
          : it.change_type === 'price_decreased'
          ? 'سعر الشراء انخفض'
          : it.change_type === 'margin_dropped'
          ? 'هامش الربح انخفض عن الحد'
          : 'ثابت',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'تغييرات الأسعار');
    XLSX.writeFile(workbook, `مقارنة_أسعار_${supplierName}_${new Date().toLocaleDateString('ar-EG')}.xlsx`);
  };

  // Confirm and Save all confirmed changes into Database
  const handleConfirmAll = async () => {
    const updatedMap = new Map<string, number>();
    items.forEach((it) => {
      if (it.product_id && it.is_selling_price_updated) {
        updatedMap.set(it.product_id, it.applied_selling_price);
      }
    });

    const nextProducts = allProducts.map((p) => {
      if (updatedMap.has(p.id)) {
        return {
          ...p,
          selling_price: updatedMap.get(p.id)!,
          manual_price_set: true,
          price_changed: true,
          updated_at: Date.now(),
        };
      }
      return p;
    });

    // Save modified products
    for (const p of nextProducts) {
      if (updatedMap.has(p.id)) {
        await updateProduct(p);
      }
    }

    onApplyChanges(nextProducts);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5" dir="rtl">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 overflow-hidden text-right">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Sparkles size={22} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base">
                مقارنة قائمة المورد الجديدة بالقديمة: {supplierName}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                كشف الأصناف الجديدة، التي اختفت، وتغييرات أسعار الشراء مع اقتراح أسعار البيع
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

        {/* Stats bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
          <div
            onClick={() => setActiveFilter(activeFilter === 'increased' ? 'all' : 'increased')}
            className={`p-2 rounded-2xl border transition-all cursor-pointer ${
              activeFilter === 'increased'
                ? 'bg-rose-50 border-rose-300 text-rose-800'
                : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            <span className="text-[10px] font-bold block">سعر الشراء زاد 📈</span>
            <span className="text-base font-black font-mono block mt-0.5">{increasedCount}</span>
          </div>

          <div
            onClick={() => setActiveFilter(activeFilter === 'decreased' ? 'all' : 'decreased')}
            className={`p-2 rounded-2xl border transition-all cursor-pointer ${
              activeFilter === 'decreased'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            <span className="text-[10px] font-bold block">سعر الشراء انخفض 📉</span>
            <span className="text-base font-black font-mono block mt-0.5">{decreasedCount}</span>
          </div>

          <div
            onClick={() => setActiveFilter(activeFilter === 'margin_dropped' ? 'all' : 'margin_dropped')}
            className={`p-2 rounded-2xl border transition-all cursor-pointer ${
              activeFilter === 'margin_dropped'
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            <span className="text-[10px] font-bold block">هامش ربح مهدد ⚠️</span>
            <span className="text-base font-black font-mono block mt-0.5">{marginDroppedCount}</span>
          </div>

          <div
            onClick={() => setActiveFilter(activeFilter === 'new' ? 'all' : 'new')}
            className={`p-2 rounded-2xl border transition-all cursor-pointer ${
              activeFilter === 'new'
                ? 'bg-sky-50 border-sky-300 text-sky-800'
                : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            <span className="text-[10px] font-bold block">أصناف جديدة ✨</span>
            <span className="text-base font-black font-mono block mt-0.5">{newCount}</span>
          </div>

          <div
            onClick={() => setActiveFilter(activeFilter === 'disappeared' ? 'all' : 'disappeared')}
            className={`p-2 rounded-2xl border transition-all cursor-pointer ${
              activeFilter === 'disappeared'
                ? 'bg-slate-200 border-slate-300 text-slate-800'
                : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            <span className="text-[10px] font-bold block">أصناف اختفت 🚫</span>
            <span className="text-base font-black font-mono block mt-0.5">{disappearedCount}</span>
          </div>
        </div>

        {/* Filter & Action Controls */}
        <div className="p-4 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="بحث بالاسم أو الكود..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-9 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-sky-500"
              />
            </div>

            {/* Filter by min percent increase */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 text-[11px] font-bold">زيادة أكثر من:</span>
              <select
                value={minPercentFilter}
                onChange={(e) => setMinPercentFilter(Number(e.target.value))}
                className="p-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
              >
                <option value={0}>الكل</option>
                <option value={5}>+5%</option>
                <option value={10}>+10%</option>
                <option value={20}>+20%</option>
                <option value={30}>+30%</option>
              </select>
            </div>
          </div>

          {/* Quick Bulk Actions & Excel Export */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleBulkApplySuggested}
              className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              title="تطبيق نفس نسبة الربح القديمة على كل الأصناف التي زادت"
            >
              طبّق النسبة القديمة للكل
            </button>

            <button
              type="button"
              onClick={handleBulkKeepCurrent}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              title="تثبيت سعر البيع الحالي لجميع الأصناف"
            >
              سيب سعر البيع الحالي للكل
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <FileSpreadsheet size={15} className="text-emerald-600" />
              <span>إكسيل</span>
            </button>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              لا توجد أصناف مطابقة للفلتر المحدد
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isUpdated = item.is_selling_price_updated;
              return (
                <div
                  key={`${item.code}_${idx}`}
                  className={`p-3 rounded-2xl border transition-all ${
                    item.change_type === 'price_increased'
                      ? 'bg-rose-50/40 border-rose-200'
                      : item.change_type === 'margin_dropped'
                      ? 'bg-amber-50/40 border-amber-200'
                      : item.change_type === 'price_decreased'
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : item.change_type === 'new'
                      ? 'bg-sky-50/40 border-sky-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Item Information */}
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.change_type === 'price_increased' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white">
                            شراء زاد (+{item.diff_amount} ج.م / +{item.diff_percent}%)
                          </span>
                        )}
                        {item.change_type === 'price_decreased' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white">
                            شراء انخفض ({item.diff_amount} ج.م / {item.diff_percent}%)
                          </span>
                        )}
                        {item.change_type === 'margin_dropped' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white">
                            هامش ربح أصبح {item.current_margin_percent}% فقط!
                          </span>
                        )}
                        {item.change_type === 'new' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-600 text-white">
                            صنف جديد بالقائمة
                          </span>
                        )}
                        {item.change_type === 'disappeared' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-500 text-white">
                            اختفى من قائمة المورد الجديدة
                          </span>
                        )}

                        <span className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200">
                          {item.code}
                        </span>
                        <h4 className="text-xs font-black text-slate-900 truncate">
                          {item.name}
                        </h4>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-600 font-medium">
                        <div>
                          الشراء القديم:{' '}
                          <span className="font-mono font-bold">{item.old_wholesale_price} ج.م</span>
                        </div>
                        <div>
                          الشراء الجديد:{' '}
                          <span className="font-mono font-bold text-slate-900">
                            {item.new_wholesale_price} ج.م
                          </span>
                        </div>
                        <div>
                          سعر البيع الحالي:{' '}
                          <span className="font-mono font-bold text-emerald-700">
                            {item.current_selling_price} ج.م
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Pricing Decision Actions */}
                    {item.change_type !== 'disappeared' && (
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0 bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
                        <div className="text-right">
                          <label className="block text-[10px] font-bold text-slate-500">
                            سعر البيع المعتمد:
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={item.applied_selling_price || 0}
                              onChange={(e) =>
                                handleCustomPriceChange(item, Number(e.target.value) || 0)
                              }
                              className={`w-20 p-1 border rounded-lg text-xs font-mono font-black text-center ${
                                isUpdated
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                                  : 'border-slate-300 text-slate-800'
                              }`}
                            />
                            <span className="text-[11px] font-bold text-slate-400">ج.م</span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => handleApplySuggestedPrice(item)}
                            className="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-800 text-[10px] font-bold rounded border border-sky-200 transition-colors cursor-pointer"
                            title={`اقتراح الحفاظ على نسبة الربح القديمة: ${item.suggested_selling_price} ج.م`}
                          >
                            اقتراح الربح ({item.suggested_selling_price} ج.م)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleKeepCurrentPrice(item)}
                            className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded transition-colors cursor-pointer"
                          >
                            تثبيت الحالي
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            🔒 لن يتم تعديل أي سعر بيع في قاعدة البيانات إلا بعد تأكيدك بالضغط على الزر الأخضر.
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-white rounded-xl border border-slate-200 cursor-pointer"
            >
              إغلاق دون تعديل الأسعار
            </button>

            <button
              type="button"
              onClick={handleConfirmAll}
              className="flex items-center gap-1.5 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-emerald-600/20 cursor-pointer"
            >
              <Check size={16} />
              <span>اعتماد وتحديث الأسعار المحددة</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
