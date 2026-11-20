import React, { useState, useRef } from 'react';
import { Product, ProductCategory, ALL_CATEGORIES } from '../types';
import { saveProduct, deleteProduct } from '../utils/db';
import { CropAdjustModal } from './CropAdjustModal';
import { useUiFeedback } from './UiFeedbackProvider';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Filter,
  Trash2,
  Crop,
  Maximize2,
  Tag,
  Info,
} from 'lucide-react';

interface IncompleteProductsTableProps {
  products: Product[];
  categories?: string[];
  onProductsUpdated: (products: Product[]) => void;
  onNavigateToCatalog: () => void;
}

export const IncompleteProductsTable: React.FC<IncompleteProductsTableProps> = ({
  products,
  categories,
  onProductsUpdated,
  onNavigateToCatalog,
}) => {
  const { toast, confirm } = useUiFeedback();
  const [filterOnlyIncomplete, setFilterOnlyIncomplete] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [cropModalProduct, setCropModalProduct] = useState<Product | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const productsRef = useRef<Product[]>(products);
  productsRef.current = products;

  const availableCategories =
    categories && categories.length > 0 ? categories : ALL_CATEGORIES;

  // Incomplete check: missing name or selling_price <= 0 or crop needs adjustment
  const isIncomplete = (p: Product) =>
    !p.name?.trim() || !p.selling_price || p.selling_price <= 0 || Boolean(p.needs_crop_adjustment);

  const incompleteCount = products.filter(isIncomplete).length;
  const needsCropCount = products.filter((p) => p.needs_crop_adjustment).length;

  const filteredProducts = products.filter((p) => {
    if (filterOnlyIncomplete && !isIncomplete(p)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name?.toLowerCase().includes(q);
      const matchModel = p.model?.toLowerCase().includes(q);
      const matchBrand = p.group?.toLowerCase().includes(q);
      const matchCat = p.category?.toLowerCase().includes(q);
      if (!matchName && !matchModel && !matchBrand && !matchCat) return false;
    }
    return true;
  });

  // Inline update helper
  const handleFieldChange = async (
    product: Product,
    field: keyof Product,
    value: any
  ) => {
    const updated: Product = {
      ...product,
      [field]: value,
      updated_at: Date.now(),
    };

    // If merchant manually typed selling_price, mark manual flag and clear warning note if applicable
    if (field === 'selling_price') {
      updated.manual_price_set = true;
      if (updated.price_source_note === 'أسعار متعددة' && Number(value) > 0) {
        updated.price_source_note = undefined;
      }
    }

    // Auto-update included_in_catalog based on completeness
    if (updated.name?.trim() && (updated.selling_price || 0) > 0) {
      updated.included_in_catalog = true;
    } else {
      updated.included_in_catalog = false;
    }

    await saveProduct(updated);
    const nextProducts = productsRef.current.map((p) => (p.id === product.id ? updated : p));
    productsRef.current = nextProducts;
    onProductsUpdated(nextProducts);
  };

  // Jump to next yellow/empty input
  const handleJumpToNextEmpty = () => {
    if (!tableRef.current) return;
    const inputs = Array.from(
      tableRef.current.querySelectorAll<HTMLInputElement>('input.empty-field')
    );
    if (inputs.length > 0) {
      const activeIdx = inputs.indexOf(document.activeElement as HTMLInputElement);
      const nextInput = inputs[(activeIdx + 1) % inputs.length];
      nextInput.focus();
      nextInput.select();
    }
  };

  // Direct action: use full image without crop
  const handleUseFullImageDirectly = async (p: Product) => {
    const full = p.original_image_url || p.image_url;
    const updated: Product = {
      ...p,
      image_url: full,
      needs_crop_adjustment: false,
      updated_at: Date.now(),
    };
    await saveProduct(updated);
    const nextProducts = productsRef.current.map((item) => (item.id === p.id ? updated : item));
    productsRef.current = nextProducts;
    onProductsUpdated(nextProducts);
  };

  const handleDeleteProduct = async (id: string) => {
    const ok = await confirm({
      title: 'حذف المنتج',
      message: 'هل تريد حذف هذا المنتج؟',
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!ok) return;
    await deleteProduct(id);
    const nextProducts = productsRef.current.filter((p) => p.id !== id);
    productsRef.current = nextProducts;
    onProductsUpdated(nextProducts);
    toast.success('تم حذف المنتج.');
  };

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-800">
              منتجات تحتاج مراجعة وإكمال البيانات
            </h3>
            {incompleteCount > 0 ? (
              <span className="bg-amber-100 text-amber-900 font-bold px-2.5 py-0.5 rounded-full text-xs flex items-center gap-1 border border-amber-300">
                <AlertTriangle size={13} className="text-amber-700" />
                {incompleteCount} منتج يحتاج إكمال
              </span>
            ) : (
              <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full text-xs flex items-center gap-1">
                <CheckCircle2 size={13} />
                جميع المنتجات مكتملة!
              </span>
            )}

            {needsCropCount > 0 && (
              <span className="bg-rose-100 text-rose-900 font-bold px-2.5 py-0.5 rounded-full text-xs flex items-center gap-1 border border-rose-300">
                <Crop size={13} className="text-rose-700" />
                {needsCropCount} يحتاج ضبط القص
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            الخانات الفارغة مميزة باللون الأصفر. يمكنك الكتابة فيها مباشرة والضغط على زر "التالي" للانتقال السريع.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Button: Jump to Next Empty */}
          {incompleteCount > 0 && (
            <button
              onClick={handleJumpToNextEmpty}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs"
              title="الانتقال التلقائي للخانة الصفراء الفارغة التالية"
            >
              <span>الخانة التالية (التالي)</span>
              <ChevronLeft size={16} />
            </button>
          )}

          {/* Toggle incomplete only */}
          <button
            onClick={() => setFilterOnlyIncomplete((p) => !p)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              filterOnlyIncomplete
                ? 'bg-sky-50 text-sky-800 border-sky-300'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Filter size={14} />
            المنتجات الناقصة فقط ({incompleteCount})
          </button>
        </div>
      </div>

      {/* Table */}
      <div
        ref={tableRef}
        className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
      >
        {filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2" />
            <p className="text-sm font-bold text-slate-700">لا توجد منتجات ناقصة تطابق الفلتر الحالي!</p>
            <p className="text-xs text-slate-400 mt-1">جميع بيانات المنتجات مكتملة وجاهزة للكتالوج.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3 w-28 text-center">الصورة والقص</th>
                  <th className="p-3 min-w-[190px]">اسم المنتج <span className="text-red-500">*</span></th>
                  <th className="p-3 w-32">الماركة</th>
                  <th className="p-3 w-32">النوع / القسم</th>
                  <th className="p-3 w-28">الموديل</th>
                  <th className="p-3 w-36">سعر الجملة</th>
                  <th className="p-3 w-36">سعر البيع <span className="text-red-500">*</span></th>
                  <th className="p-3 w-24 text-center">الحالة</th>
                  <th className="p-3 w-14 text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((p) => {
                  const isMissingName = !p.name?.trim();
                  const isMissingSelling = !p.selling_price || p.selling_price <= 0;
                  const isReady = !isMissingName && !isMissingSelling && !p.needs_crop_adjustment;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Photo & Crop Actions */}
                      <td className="p-2 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="relative w-14 h-14 bg-white rounded-lg border border-slate-200 overflow-hidden flex items-center justify-center p-0.5 shadow-2xs">
                            {p.image_url ? (
                              <img src={p.image_url} alt="" className="w-full h-full object-contain" />
                            ) : (
                              <span className="text-[10px] text-slate-300">بدون</span>
                            )}
                            {p.needs_crop_adjustment && (
                              <div
                                className="absolute top-0 right-0 bg-rose-600 text-white p-0.5 rounded-bl text-[8px]"
                                title="يحتاج ضبط القص"
                              >
                                <AlertTriangle size={10} />
                              </div>
                            )}
                          </div>

                          {/* Quick Crop Buttons if needs adjustment */}
                          {p.needs_crop_adjustment ? (
                            <div className="flex flex-col gap-1 w-full max-w-[105px]">
                              <button
                                type="button"
                                onClick={() => handleUseFullImageDirectly(p)}
                                className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[9px] rounded border border-slate-300 transition-colors cursor-pointer flex items-center justify-center gap-1 truncate"
                                title="استخدم الصورة كاملة بدون قص"
                              >
                                <Maximize2 size={10} />
                                الصورة كاملة
                              </button>
                              <button
                                type="button"
                                onClick={() => setCropModalProduct(p)}
                                className="px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[9px] rounded border border-amber-300 transition-colors cursor-pointer flex items-center justify-center gap-1 truncate"
                                title="اضبط القص بإيدي"
                              >
                                <Crop size={10} />
                                اضبط القص
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setCropModalProduct(p)}
                              className="text-[10px] text-slate-400 hover:text-sky-600 transition-colors flex items-center gap-0.5 cursor-pointer"
                            >
                              <Crop size={10} />
                              تعديل
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Name input */}
                      <td className="p-2">
                        <input
                          type="text"
                          value={p.name}
                          onChange={(e) => handleFieldChange(p, 'name', e.target.value)}
                          placeholder="اكتب اسم المنتج هنا..."
                          className={`w-full p-2 rounded-lg font-bold text-xs border transition-colors ${
                            isMissingName
                              ? 'empty-field bg-amber-100 border-amber-400 text-amber-950 placeholder-amber-700/60 focus:bg-white'
                              : 'bg-white border-slate-200 text-slate-800 focus:border-sky-500'
                          }`}
                        />
                      </td>

                      {/* Brand (الماركة) */}
                      <td className="p-2">
                        <input
                          type="text"
                          value={p.group || ''}
                          onChange={(e) => handleFieldChange(p, 'group', e.target.value)}
                          placeholder="الماركة (مثل YISON)"
                          className={`w-full p-2 rounded-lg text-xs border transition-colors ${
                            !p.group?.trim()
                              ? 'empty-field bg-amber-100/70 border-amber-300 text-amber-900 placeholder-amber-700/50 focus:bg-white'
                              : 'bg-white border-slate-200 text-slate-700 focus:border-sky-500'
                          }`}
                        />
                      </td>

                      {/* Category select */}
                      <td className="p-2">
                        <select
                          value={p.category}
                          onChange={(e) => handleFieldChange(p, 'category', e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg font-semibold text-xs focus:border-sky-500"
                        >
                          {!availableCategories.includes(p.category) && p.category && (
                            <option value={p.category}>{p.category}</option>
                          )}
                          {availableCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Model input */}
                      <td className="p-2">
                        <input
                          type="text"
                          value={p.model || ''}
                          onChange={(e) => handleFieldChange(p, 'model', e.target.value)}
                          placeholder="الموديل (مثل GT-112)"
                          className={`w-full p-2 rounded-lg text-xs border transition-colors ${
                            !p.model?.trim()
                              ? 'empty-field bg-amber-100/70 border-amber-300 text-amber-900 placeholder-amber-700/50 focus:bg-white'
                              : 'bg-white border-slate-200 text-slate-700 focus:border-sky-500'
                          }`}
                        />
                      </td>

                      {/* Wholesale price input with detected price badge */}
                      <td className="p-2">
                        <div className="space-y-1">
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              value={p.wholesale_price || ''}
                              onChange={(e) =>
                                handleFieldChange(p, 'wholesale_price', Number(e.target.value) || 0)
                              }
                              placeholder="0"
                              className={`w-full p-2 pl-7 rounded-lg text-xs font-bold border transition-colors ${
                                !p.wholesale_price || p.wholesale_price <= 0
                                  ? 'empty-field bg-amber-100 border-amber-400 text-amber-950 placeholder-amber-700/60 focus:bg-white'
                                  : 'bg-white border-slate-200 text-slate-700 focus:border-sky-500'
                              }`}
                            />
                            <span className="absolute left-2 top-2 text-[10px] text-slate-400">ج</span>
                          </div>

                          {/* Price Notes */}
                          {p.price_source_note === 'سعر مقروء من الصورة، راجعه' && (
                            <div className="flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded text-[9px] font-bold">
                              <Tag size={10} className="text-amber-700 shrink-0" />
                              <span className="truncate">سعر مقروء من الصورة، راجعه</span>
                            </div>
                          )}

                          {p.price_source_note === 'أسعار متعددة' && (
                            <div className="flex items-center gap-1 bg-orange-50 text-orange-900 border border-orange-300 px-1.5 py-0.5 rounded text-[9px] font-bold">
                              <AlertTriangle size={10} className="text-orange-700 shrink-0" />
                              <span className="truncate">أسعار متعددة (حدد السعر)</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Selling price input */}
                      <td className="p-2">
                        <div className="space-y-1">
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              value={p.selling_price || ''}
                              onChange={(e) =>
                                handleFieldChange(p, 'selling_price', Number(e.target.value) || 0)
                              }
                              placeholder="0"
                              className={`w-full p-2 pl-7 rounded-lg text-xs font-black border transition-colors ${
                                isMissingSelling
                                  ? 'empty-field bg-amber-100 border-amber-400 text-amber-950 placeholder-amber-700/60 focus:bg-white'
                                  : 'bg-white border-slate-200 text-emerald-700 focus:border-emerald-500'
                              }`}
                            />
                            <span className="absolute left-2 top-2 text-[10px] text-slate-400">ج</span>
                          </div>

                          {p.manual_price_set && (
                            <span className="text-[9px] text-slate-400 block text-center">
                              سعر يدوي
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-2 text-center">
                        {isReady ? (
                          <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                            جاهز
                          </span>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-bold text-[10px] border border-amber-300">
                              ناقص
                            </span>
                            {p.needs_crop_adjustment && (
                              <span className="text-[8px] text-rose-700 font-bold">
                                يحتاج قص
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Delete */}
                      <td className="p-2 text-center">
                        <button
                          onClick={() => handleDeleteProduct(p.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Crop Adjust Modal */}
      {cropModalProduct && (
        <CropAdjustModal
          product={cropModalProduct}
          onClose={() => setCropModalProduct(null)}
          onSave={async (updated) => {
            await saveProduct(updated);
            const nextProducts = productsRef.current.map((p) => (p.id === updated.id ? updated : p));
            productsRef.current = nextProducts;
            onProductsUpdated(nextProducts);
          }}
        />
      )}
    </div>
  );
};
