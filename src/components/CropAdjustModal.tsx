import React, { useState, useRef, useEffect } from 'react';
import { Product } from '../types';
import { compressUploadedImage, cropAndCompressProductImage, loadImage } from '../utils/imageCropper';
import { useUiFeedback } from './UiFeedbackProvider';
import {
  X,
  Check,
  Upload,
  Crop,
  RotateCcw,
  AlertTriangle,
  Maximize2,
  Sliders,
  CheckCircle2,
  Image as ImageIcon,
} from 'lucide-react';

interface CropAdjustModalProps {
  product: Product;
  onClose: () => void;
  onSave: (updatedProduct: Product) => void;
}

export const CropAdjustModal: React.FC<CropAdjustModalProps> = ({
  product,
  onClose,
  onSave,
}) => {
  const { toast } = useUiFeedback();
  // Use original source if available, otherwise current image
  const sourceImage = product.original_image_url || product.image_url || '';
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState<string | undefined>(product.image_url);
  const [isUploading, setIsUploading] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual box coordinates (0-1000)
  const defaultBox: [number, number, number, number] = product.raw_bounding_box || [100, 100, 900, 900];
  const [ymin, setYmin] = useState(defaultBox[0]);
  const [xmin, setXmin] = useState(defaultBox[1]);
  const [ymax, setYmax] = useState(defaultBox[2]);
  const [xmax, setXmax] = useState(defaultBox[3]);

  // Generate live crop preview whenever coordinates change
  useEffect(() => {
    let isCancelled = false;
    if (!sourceImage) return;

    if (ymin < ymax && xmin < xmax) {
      cropAndCompressProductImage(sourceImage, [ymin, xmin, ymax, xmax])
        .then((preview) => {
          if (!isCancelled && preview) {
            setCurrentPreviewUrl(preview);
          }
        })
        .catch(() => {});
    }

    return () => {
      isCancelled = true;
    };
  }, [sourceImage, ymin, xmin, ymax, xmax]);

  // Preset Handlers
  const handlePresetFull = () => {
    setYmin(20);
    setXmin(20);
    setYmax(980);
    setXmax(980);
  };

  const handlePresetCenter = () => {
    setYmin(150);
    setXmin(150);
    setYmax(850);
    setXmax(850);
  };

  const handlePresetTopHalf = () => {
    setYmin(50);
    setXmin(100);
    setYmax(650);
    setXmax(900);
  };

  // 1. "استخدم الصورة كاملة" Action
  const handleUseFullImage = () => {
    onSave({
      ...product,
      image_url: sourceImage,
      needs_crop_adjustment: false,
      updated_at: Date.now(),
    });
    onClose();
  };

  // 2. "تطبيق القص وحفظ الصورة" Action
  const handleApplyCrop = async () => {
    try {
      setIsCropping(true);
      const croppedUrl = await cropAndCompressProductImage(sourceImage, [ymin, xmin, ymax, xmax]);
      onSave({
        ...product,
        image_url: croppedUrl || sourceImage,
        raw_bounding_box: [ymin, xmin, ymax, xmax],
        box_2d: [ymin, xmin, ymax, xmax],
        needs_crop_adjustment: false,
        updated_at: Date.now(),
      });
      onClose();
    } catch {
      toast.error('تعذر قص الصورة.');
    } finally {
      setIsCropping(false);
    }
  };

  // 3. Upload replacement photo
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const compressedUrl = await compressUploadedImage(file, 400);
      onSave({
        ...product,
        image_url: compressedUrl,
        original_image_url: compressedUrl,
        needs_crop_adjustment: false,
        updated_at: Date.now(),
      });
      onClose();
    } catch {
      toast.error('تعذر قراءة الصورة المرفوعة.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-800">ضبط واقتصاص صورة المنتج</h3>
              {product.needs_crop_adjustment && (
                <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <AlertTriangle size={12} className="text-amber-700" />
                  يحتاج ضبط القص
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {product.name || 'منتج غير مسمى'} {product.code ? `(${product.code})` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Notice if flagged */}
        {product.needs_crop_adjustment && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">تنبيه: الصورة قد تكون إعلاناً أو بها عناصر وشارات أسعار متداخلة</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                يمكنك الضغط على <strong>"استخدم الصورة كاملة"</strong> إذا أردت إظهارها كما هي دون قص، أو حرك شريط القص لعزل المنتج فقط.
              </p>
            </div>
          </div>
        )}

        <div className="py-5 space-y-5">
          {/* Visual Comparison: Source & Crop Preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Left: Source with Crop Box Overlay */}
            <div className="flex flex-col items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
                <ImageIcon size={14} />
                الصورة الأصلية مع تحديد القص
              </span>
              <div className="relative w-48 h-48 bg-white rounded-lg border border-slate-300 overflow-hidden flex items-center justify-center shadow-2xs">
                {sourceImage ? (
                  <>
                    <img
                      src={sourceImage}
                      alt="Original"
                      className="w-full h-full object-contain"
                    />
                    {/* Visual Crop Box Overlay */}
                    <div
                      className="absolute border-2 border-emerald-500 bg-emerald-500/15 pointer-events-none transition-all duration-75"
                      style={{
                        top: `${ymin / 10}%`,
                        left: `${xmin / 10}%`,
                        width: `${Math.max(0, (xmax - xmin) / 10)}%`,
                        height: `${Math.max(0, (ymax - ymin) / 10)}%`,
                      }}
                    />
                  </>
                ) : (
                  <span className="text-xs text-slate-400">لا توجد صورة</span>
                )}
              </div>
              <div className="flex items-center gap-1 mt-2.5 text-[10px]">
                <button
                  type="button"
                  onClick={handlePresetFull}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 font-semibold cursor-pointer"
                >
                  الكاملة
                </button>
                <button
                  type="button"
                  onClick={handlePresetCenter}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 font-semibold cursor-pointer"
                >
                  الوسط
                </button>
                <button
                  type="button"
                  onClick={handlePresetTopHalf}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 font-semibold cursor-pointer"
                >
                  أعلى
                </button>
              </div>
            </div>

            {/* Right: Live Cropped Result */}
            <div className="flex flex-col items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
                <Crop size={14} />
                معاينة نتيجة القص المباشرة
              </span>
              <div className="w-48 h-48 bg-white rounded-lg border border-slate-300 overflow-hidden flex items-center justify-center p-2 shadow-2xs">
                {currentPreviewUrl ? (
                  <img
                    src={currentPreviewUrl}
                    alt="Cropped Preview"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-slate-400">جاري المعاينة...</span>
                )}
              </div>
              <span className="text-[10px] text-slate-400 mt-3">
                خلفية بيضاء نقية ومقاس خفيف مخصص للكتالوج
              </span>
            </div>
          </div>

          {/* Interactive Sliders for Crop Boundaries */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 pb-1 border-b border-slate-200">
              <span className="flex items-center gap-1.5">
                <Sliders size={14} />
                تحريك حدود القص (أبعاد 0 إلى 1000)
              </span>
              <button
                type="button"
                onClick={() => {
                  setYmin(100);
                  setXmin(100);
                  setYmax(900);
                  setXmax(900);
                }}
                className="text-[10px] text-sky-600 hover:text-sky-800 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw size={11} />
                إعادة ضبط
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                  <span>من الأعلى:</span>
                  <span className="font-mono">{ymin}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, ymax - 50)}
                  value={ymin}
                  onChange={(e) => setYmin(Number(e.target.value))}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                  <span>من الأسفل:</span>
                  <span className="font-mono">{ymax}</span>
                </div>
                <input
                  type="range"
                  min={Math.min(1000, ymin + 50)}
                  max="1000"
                  value={ymax}
                  onChange={(e) => setYmax(Number(e.target.value))}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                  <span>من اليسار:</span>
                  <span className="font-mono">{xmin}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, xmax - 50)}
                  value={xmin}
                  onChange={(e) => setXmin(Number(e.target.value))}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                  <span>من اليمين:</span>
                  <span className="font-mono">{xmax}</span>
                </div>
                <input
                  type="range"
                  min={Math.min(1000, xmin + 50)}
                  max="1000"
                  value={xmax}
                  onChange={(e) => setXmax(Number(e.target.value))}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Action: Upload replacement from device */}
          <div className="flex items-center gap-3 pt-1">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs border border-slate-200 transition-colors cursor-pointer"
            >
              <Upload size={14} />
              {isUploading ? 'جاري رفع وضغط الصورة...' : 'رفع صورة بديلة نظيفة من جهازي'}
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
          {/* Button: Use full image */}
          <button
            type="button"
            onClick={handleUseFullImage}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            title="استخدام الصورة الأصلية كاملة بدون أي قص وإزالة علامة التحذير"
          >
            <Maximize2 size={15} />
            استخدم الصورة كاملة
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleApplyCrop}
              disabled={isCropping}
              className="flex items-center justify-center gap-1.5 py-2.5 px-5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Check size={16} />
              {isCropping ? 'جاري حفظ القص...' : 'قص وحفظ الصورة'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
