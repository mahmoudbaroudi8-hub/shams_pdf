import React, { useState } from 'react';
import { Product, ProductCategory, ALL_CATEGORIES } from '../types';
import { X, Check, Edit2 } from 'lucide-react';
import { useUiFeedback } from './UiFeedbackProvider';

interface EditProductModalProps {
  product: Product;
  availableCategories?: string[];
  onClose: () => void;
  onSave: (updated: Product) => void;
}

export const EditProductModal: React.FC<EditProductModalProps> = ({
  product,
  availableCategories,
  onClose,
  onSave,
}) => {
  const { toast } = useUiFeedback();
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState<ProductCategory>(product.category);
  const [group, setGroup] = useState(product.group || '');
  const [model, setModel] = useState(product.model || '');
  const [specification, setSpecification] = useState(product.specification || '');
  const [supplier, setSupplier] = useState(product.supplier || '');
  const [wholesalePrice, setWholesalePrice] = useState(product.wholesale_price);
  const [sellingPrice, setSellingPrice] = useState(product.selling_price);
  const [availableModelsStr, setAvailableModelsStr] = useState(
    (product.available_models || []).join(' ، ')
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.warning('يرجى إدخال اسم المنتج.');
      return;
    }

    const available_models = availableModelsStr
      .split(/[,،\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const newWholesale = Number(wholesalePrice) || 0;
    let updatedHistory = product.wholesale_price_history || [];
    let prevWholesale = product.previous_wholesale_price;
    let priceChanged = product.price_changed;

    if (product.wholesale_price > 0 && newWholesale !== product.wholesale_price) {
      prevWholesale = product.wholesale_price;
      priceChanged = true;
      updatedHistory = [
        ...updatedHistory,
        { price: product.wholesale_price, date: Date.now() },
      ].slice(-5);
    }

    onSave({
      ...product,
      name: name.trim(),
      category,
      group: group.trim(),
      model: model.trim(),
      specification: specification.trim(),
      supplier: supplier.trim(),
      wholesale_price: newWholesale,
      previous_wholesale_price: prevWholesale,
      wholesale_price_history: updatedHistory,
      price_changed: priceChanged,
      selling_price: Number(sellingPrice) || 0,
      available_models,
      updated_at: Date.now(),
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Edit2 size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">تعديل بيانات ومواصفات المنتج</h3>
              <p className="text-xs text-slate-500">كود: {product.code}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="py-4 space-y-4 text-xs font-semibold">
          {/* Name */}
          <div>
            <label className="block text-slate-700 mb-1 font-bold">اسم المنتج التجاري:</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: شاحن سريع 20 وات بي دي"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-sky-500 focus:bg-white"
            />
          </div>

          {/* Category & Brand */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 mb-1 font-bold">القسم / التصنيف:</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-sky-500"
              >
                {(availableCategories && availableCategories.length > 0
                  ? Array.from(new Set([...availableCategories, category]))
                  : ALL_CATEGORIES
                ).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 mb-1 font-bold">الماركة (مثل YISON أو JOYROOM):</label>
              <input
                type="text"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="مثال: YISON, START, JOYROOM"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-sky-500"
              />
            </div>
          </div>

          {/* Model & Specification */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 mb-1 font-bold">الموديل أو التوافق:</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="مثال: ST102 TC أو ST-ES01"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-sky-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-1 font-bold">المواصفة والسعة الصحيحة:</label>
              <input
                type="text"
                value={specification}
                onChange={(e) => setSpecification(e.target.value)}
                placeholder="مثال: 10000mAh أو 20W PD"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-sky-500"
              />
            </div>
          </div>

          {/* Prices */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 mb-1 font-bold text-amber-800">
                سعر الجملة (خاص بك):
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={wholesalePrice}
                  onChange={(e) => setWholesalePrice(Number(e.target.value))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-amber-500"
                />
                <span className="absolute left-2.5 top-2.5 text-slate-400 font-bold">ج.م</span>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 mb-1 font-bold text-emerald-800">
                سعر البيع للجمهور:
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(Number(e.target.value))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-emerald-700 focus:outline-emerald-500"
                />
                <span className="absolute left-2.5 top-2.5 text-slate-400 font-bold">ج.م</span>
              </div>
            </div>
          </div>

          {/* Supplier & Available Models */}
          <div>
            <label className="block text-slate-700 mb-1 font-bold">المورد (اسم المورد أو الشركة):</label>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="مثال: شركة التقنية، الصفا، دبي..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-sky-500"
            />
          </div>

          {product.wholesale_price_history && product.wholesale_price_history.length > 0 && (
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1.5">
              <div className="text-[11px] font-bold text-amber-900">
                سجل تغييرات سعر الشراء (آخر {product.wholesale_price_history.length} تغييرات):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {product.wholesale_price_history.map((h, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 bg-white border border-amber-200 rounded-lg text-[10px] font-mono text-slate-700"
                  >
                    {h.price} ج.م ({new Date(h.date).toLocaleDateString('ar-EG')})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Available Models */}
          <div>
            <label className="block text-slate-700 mb-1 font-bold">
              الموديلات المتاحة (افصل بينها بفاصلة):
            </label>
            <textarea
              rows={2}
              value={availableModelsStr}
              onChange={(e) => setAvailableModelsStr(e.target.value)}
              placeholder="مثال: iPhone 13 ، iPhone 14 ، iPhone 15"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-sky-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 py-2 px-5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-600/20 cursor-pointer"
            >
              <Check size={14} />
              حفظ التعديلات
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
