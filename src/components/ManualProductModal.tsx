import React, { useState, useRef } from 'react';
import { Product, ProductCategory, ALL_CATEGORIES } from '../types';
import { compressUploadedImage, readFileAsWorkingDataUrl } from '../utils/imageCropper';
import { saveProduct } from '../utils/db';
import { CropAdjustModal } from './CropAdjustModal';
import { Plus, X, Upload, Check, ImageIcon, Crop, Trash2 } from 'lucide-react';
import { useUiFeedback } from './UiFeedbackProvider';

interface ManualProductModalProps {
  categories?: string[];
  onProductCreated: (product: Product) => void;
  onClose: () => void;
}

export const ManualProductModal: React.FC<ManualProductModalProps> = ({
  categories,
  onProductCreated,
  onClose,
}) => {
  const { toast } = useUiFeedback();
  const availableCategories = categories && categories.length > 0 ? categories : ALL_CATEGORIES;
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState<ProductCategory>(availableCategories[availableCategories.length - 1] || 'متنوعة');
  const [model, setModel] = useState('');
  const [specification, setSpecification] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [rawImageUrl, setRawImageUrl] = useState<string>('');
  const [isImageEditorOpen, setIsImageEditorOpen] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      setIsCompressing(true);
      const [workingUrl, compressed] = await Promise.all([
        readFileAsWorkingDataUrl(file, 1200),
        compressUploadedImage(file, 520),
      ]);
      setRawImageUrl(workingUrl);
      setImageUrl(compressed);
      setIsImageEditorOpen(true);
    } catch {
      toast.error('تعذر تحميل الصورة.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.warning('يرجى كتابة اسم المنتج على الأقل.');
      return;
    }

    const isComplete = Boolean(name.trim() && sellingPrice > 0);

    const newProduct: Product = {
      id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      code: `MAN-${Date.now().toString().slice(-4)}`,
      name: name.trim(),
      group: brand.trim(),
      category,
      model: model.trim(),
      specification: specification.trim(),
      wholesale_price: wholesalePrice,
      selling_price: sellingPrice,
      manual_price_set: sellingPrice > 0,
      included_in_catalog: isComplete,
      image_url: imageUrl || undefined,
      original_image_url: rawImageUrl || imageUrl || undefined,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    await saveProduct(newProduct);
    onProductCreated(newProduct);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Plus size={18} className="text-sky-600" />
            إضافة منتج يدوي جديد
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="py-4 space-y-4 text-xs">
          {/* Photo Upload + Pro Editor */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">صورة المنتج:</label>
            <div className="flex flex-wrap items-center gap-3">
              <div
                onClick={() => (imageUrl ? setIsImageEditorOpen(true) : fileInputRef.current?.click())}
                className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer hover:border-sky-500 transition-colors"
                title={imageUrl ? 'اضغط لتعديل وقص الصورة' : 'اضغط لرفع صورة'}
              >
                {imageUrl ? (
                  <img src={imageUrl} alt="Preview" className="w-full h-full object-contain p-1" />
                ) : (
                  <ImageIcon size={20} className="text-slate-300" />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageSelected}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCompressing}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer flex items-center gap-1.5"
                >
                  <Upload size={13} />
                  {isCompressing ? 'جاري التحميل...' : imageUrl ? 'تغيير الصورة' : 'رفع صورة للمنتج'}
                </button>

                {imageUrl && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsImageEditorOpen(true)}
                      className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-bold rounded-lg cursor-pointer flex items-center gap-1.5"
                    >
                      <Crop size={13} />
                      قص وتعديل وإزالة
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImageUrl('');
                        setRawImageUrl('');
                      }}
                      className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold rounded-lg cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 size={13} />
                      إزالة
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Name & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                اسم المنتج: <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: شاحن سريع 30 وات"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-sky-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">القسم / النوع:</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-sky-500"
              >
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Brand, Model & Specs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">الماركة (اختياري):</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="مثال: YISON أو JOYROOM"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-sky-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">الموديل (اختياري):</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="مثال: GT-112"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-sky-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">المواصفة / السعة (اختياري):</label>
              <input
                type="text"
                value={specification}
                onChange={(e) => setSpecification(e.target.value)}
                placeholder="مثال: 10000mAh أو 20W"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-sky-500"
              />
            </div>
          </div>

          {/* Prices */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">سعر الجملة (ج.م):</label>
              <input
                type="number"
                min="0"
                step="any"
                value={wholesalePrice || ''}
                onChange={(e) => setWholesalePrice(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:bg-white focus:outline-sky-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                سعر البيع للجمهور (ج.م): <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={sellingPrice || ''}
                onChange={(e) => setSellingPrice(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-emerald-700 focus:bg-white focus:outline-emerald-500"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-[11px] leading-relaxed">
            * المنتجات التي ينقصها الاسم أو سعر البيع لن تدخل في كتالوج الـ PDF المطبوع حتى يتم تحديد سعر البيع واسم الصنف.
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 py-2 px-5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-md transition-colors cursor-pointer"
            >
              <Check size={16} />
              حفظ المنتج
            </button>
          </div>
        </form>
      </div>

      {isImageEditorOpen && (
        <CropAdjustModal
          initialImageUrl={imageUrl}
          initialRawUrl={rawImageUrl || imageUrl}
          title="تعديل وقص صورة المنتج الجديد"
          subtitle={name || 'منتج يدوي'}
          onClose={() => setIsImageEditorOpen(false)}
          onSaveImageUrl={(editedUrl, sourceUrl) => {
            setImageUrl(editedUrl);
            setRawImageUrl(sourceUrl);
          }}
          onRemoveImage={() => {
            setImageUrl('');
            setRawImageUrl('');
          }}
        />
      )}
    </div>
  );
};
