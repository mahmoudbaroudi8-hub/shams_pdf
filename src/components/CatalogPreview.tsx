import React, { useState, useRef, useMemo } from 'react';
import { Product, CatalogSettings, ALL_CATEGORIES, DEFAULT_CATEGORIES, WatermarkType } from '../types';
import { saveSettings } from '../utils/db';
import {
  generateCatalogPdf,
  buildPreviewHtml,
  paginateProducts,
  resolveEffectiveGridLayout,
} from '../utils/pdfGenerator';
import { compressUploadedImage } from '../utils/imageCropper';
import { CatalogReviewModal } from './CatalogReviewModal';
import { GridLayoutSelector, GridCols, GridRows, GridLayoutMode } from './GridLayoutSelector';
import { useUiFeedback } from './UiFeedbackProvider';
import {
  FileText,
  Download,
  Eye,
  Sliders,
  Sparkles,
  Upload,
  RefreshCw,
  Palette,
  Layers,
  AlertCircle,
  AlertTriangle,
  XCircle,
  Printer,
  X,
} from 'lucide-react';

interface CatalogPreviewProps {
  products: Product[];
  settings: CatalogSettings;
  onSettingsUpdated: (settings: CatalogSettings) => void;
  onProductsUpdated?: (products: Product[]) => void;
}

export const CatalogPreview: React.FC<CatalogPreviewProps> = ({
  products,
  settings,
  onSettingsUpdated,
  onProductsUpdated,
}) => {
  const { toast } = useUiFeedback();
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('الكل');

  const categories = useMemo(() => {
    const list = settings.categories && settings.categories.length > 0
      ? settings.categories
      : DEFAULT_CATEGORIES;
    return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [settings.categories]);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressInfo, setProgressInfo] = useState<{ current: number; total: number; percent: number }>({
    current: 0,
    total: 0,
    percent: 0,
  });
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [showIframeModal, setShowIframeModal] = useState(false);
  const [showBrowserPrintModal, setShowBrowserPrintModal] = useState(false);
  const [showCropWarningModal, setShowCropWarningModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [pendingPdfAction, setPendingPdfAction] = useState<(() => void) | null>(null);
  const [productsNeedingCropList, setProductsNeedingCropList] = useState<Product[]>([]);

  const triggerReviewBeforeAction = (action: () => void) => {
    setPendingPdfAction(() => action);
    setShowReviewModal(true);
  };

  const logoInputRef = useRef<HTMLInputElement>(null);
  const cancelGenerationRef = useRef<boolean>(false);

  // Eligible products: included in catalog, complete (has name) and selling_price > 0
  const eligibleProducts = products.filter(
    (p) => p.included_in_catalog && (p.selling_price || 0) > 0 && p.name?.trim()
  );

  const filteredProducts =
    activeCategoryFilter === 'الكل'
      ? eligibleProducts
      : eligibleProducts.filter((p) => p.category === activeCategoryFilter);

  const effectiveGridLayout = resolveEffectiveGridLayout({
    mode: settings.grid_layout_mode || 'manual',
    columns: settings.products_per_row || 4,
    rows: settings.rows_per_page,
    itemCount: filteredProducts.length,
  });

  const totalCalculatedPages = paginateProducts(
    filteredProducts,
    effectiveGridLayout.cols,
    effectiveGridLayout.rows
  ).length;

  // Handle Logo Upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressUploadedImage(file);
      const updated: CatalogSettings = {
        ...settings,
        logo_url: compressed,
      };
      await saveSettings(updated);
      onSettingsUpdated(updated);
    } catch {
      toast.error('تعذر تحميل الشعار.');
    } finally {
      e.target.value = '';
    }
  };

  const updateSetting = async <K extends keyof CatalogSettings>(
    key: K,
    value: CatalogSettings[K]
  ) => {
    const updated: CatalogSettings = {
      ...settings,
      [key]: value,
    };
    await saveSettings(updated);
    onSettingsUpdated(updated);
  };

  const updateGridLayout = async (cols: GridCols, rows: GridRows, mode?: GridLayoutMode) => {
    const updated: CatalogSettings = {
      ...settings,
      products_per_row: cols,
      rows_per_page: rows,
      grid_layout_mode: mode ?? settings.grid_layout_mode ?? 'manual',
    };
    await saveSettings(updated);
    onSettingsUpdated(updated);
  };

  // Direct Canvas 2D PDF Generation
  const handleDownloadPdf = async (categoryToDownload: string = activeCategoryFilter) => {
    if (eligibleProducts.length === 0) {
      toast.warning('لا توجد منتجات مسعرة ومكتملة لعرضها في الكتالوج.');
      return;
    }

    cancelGenerationRef.current = false;
    setErrorMessage(null);

    try {
      setIsGeneratingPdf(true);
      setProgressInfo({ current: 0, total: 1, percent: 5 });

      const titleSlug = (settings.store_name || 'كتالوج').replace(/\s+/g, '_');
      const catSlug = categoryToDownload !== 'الكل' ? `_${categoryToDownload}` : '';
      const filename = `${titleSlug}${catSlug}_${new Date().toISOString().slice(0, 10)}.pdf`;

      await generateCatalogPdf(products, settings, {
        categoryFilter: categoryToDownload,
        filename,
        action: 'download',
        onProgress: (p) => {
          setProgressInfo({ current: p.currentPage, total: p.totalPages, percent: p.percent });
        },
        isCancelled: () => cancelGenerationRef.current,
      });
    } catch (err: any) {
      if (cancelGenerationRef.current) {
        toast.info('تم إلغاء عملية إنشاء ملف الـ PDF بناءً على طلبك.');
      } else {
        setErrorMessage(err.message || 'حدث خطأ أثناء رسم صفحات الـ PDF.');
      }
    } finally {
      setIsGeneratingPdf(false);
      setProgressInfo({ current: 0, total: 0, percent: 0 });
    }
  };

  // Generate PDF for Modal Preview
  const handleOpenPdfPreview = async () => {
    if (eligibleProducts.length === 0) {
      toast.warning('لا توجد منتجات مسعرة ومكتملة لعرضها في الكتالوج.');
      return;
    }

    cancelGenerationRef.current = false;
    setErrorMessage(null);

    try {
      setIsGeneratingPdf(true);
      setProgressInfo({ current: 0, total: 1, percent: 10 });

      const blob = await generateCatalogPdf(products, settings, {
        categoryFilter: activeCategoryFilter,
        action: 'blob',
        onProgress: (p) => {
          setProgressInfo({ current: p.currentPage, total: p.totalPages, percent: p.percent });
        },
        isCancelled: () => cancelGenerationRef.current,
      });

      if (blob instanceof Blob) {
        if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
        const url = URL.createObjectURL(blob);
        setPreviewBlobUrl(url);
        setShowIframeModal(true);
      }
    } catch (err: any) {
      if (!cancelGenerationRef.current) {
        setErrorMessage(err.message || 'تعذر تجهيز معاينة الـ PDF.');
      }
    } finally {
      setIsGeneratingPdf(false);
      setProgressInfo({ current: 0, total: 0, percent: 0 });
    }
  };

  const handleCancelGeneration = () => {
    cancelGenerationRef.current = true;
  };

  // Crop check interceptor before downloading or printing
  const checkCropBeforeAction = (
    actionFn: () => void,
    catFilter: string = activeCategoryFilter
  ) => {
    const list =
      catFilter === 'الكل'
        ? eligibleProducts
        : eligibleProducts.filter((p) => p.category === catFilter);

    const needingCrop = list.filter((p) => p.needs_crop_adjustment);
    if (needingCrop.length > 0) {
      setProductsNeedingCropList(needingCrop);
      setPendingAction(() => actionFn);
      setShowCropWarningModal(true);
      return;
    }

    actionFn();
  };

  // Browser Native Print
  const handleTriggerBrowserPrint = () => {
    setShowBrowserPrintModal(true);
    // Give time to render print content then trigger window.print
    setTimeout(() => {
      window.print();
    }, 400);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Main Actions */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="text-sky-600" size={24} />
            المرحلة 3: تصميم ومعاينة كتالوج الـ PDF المطبوع
          </h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            رسم مباشر فائق السرعة عبر محرك Canvas 2D (بدقة 1240×1754 بكسل A4)، بدون تجميد للشاشة وبدون مكتبات خارجية بطيئة.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Button: Browser Print / Save PDF */}
          <button
            onClick={() => checkCropBeforeAction(handleTriggerBrowserPrint, activeCategoryFilter)}
            disabled={isGeneratingPdf || eligibleProducts.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            title="فتح نافذة طباعة المتصفح النظيفة (Print CSS) لحفظه كـ PDF عبر المتصفح"
          >
            <Printer size={15} />
            طباعة / حفظ PDF من المتصفح
          </button>

          {/* Button: Preview as PDF */}
          <button
            onClick={() => checkCropBeforeAction(handleOpenPdfPreview, activeCategoryFilter)}
            disabled={isGeneratingPdf || eligibleProducts.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Eye size={15} />
            معاينة كـ PDF
          </button>

          {/* Button: Direct Download Canvas PDF */}
          <button
            onClick={() =>
              triggerReviewBeforeAction(() =>
                checkCropBeforeAction(() => handleDownloadPdf(activeCategoryFilter), activeCategoryFilter)
              )
            }
            disabled={isGeneratingPdf || eligibleProducts.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
          >
            {isGeneratingPdf ? <RefreshCw className="animate-spin" size={15} /> : <Download size={15} />}
            {isGeneratingPdf ? 'جاري الرسم والتوليد...' : 'تنزيل PDF مباشر (Canvas 2D)'}
          </button>
        </div>
      </div>

      {/* Error Callout (Simple Arabic) */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertCircle size={18} className="text-red-600 shrink-0" />
            <div>
              <span className="font-bold block">تعذر إنشاء ملف الـ PDF:</span>
              <span className="mt-0.5 block">{errorMessage}</span>
            </div>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs text-red-600 hover:underline font-bold"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Suggestion Banner when products > 100 */}
      {eligibleProducts.length > 100 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={20} />
            <div>
              <h4 className="text-xs font-bold">
                تنبيه لتوفير الوقت: عدد المنتجات كبير ({eligibleProducts.length} منتج)
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                يمكنك تحميل كتالوج مخصص لكل قسم لوحده لتسريع التوليد وتصغير حجم الملف:
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 self-stretch md:self-auto">
            {categories.map((c) => {
              const cat = c.name;
              const count = eligibleProducts.filter((p) => p.category === cat).length;
              if (count === 0) return null;
              return (
                <button
                  key={cat}
                  onClick={() => checkCropBeforeAction(() => handleDownloadPdf(cat), cat)}
                  disabled={isGeneratingPdf}
                  className="px-2.5 py-1 bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <Download size={12} />
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Progressive Generation Progress Bar with Cancel Button */}
      {isGeneratingPdf && (
        <div className="bg-sky-50 border border-sky-200 p-4 rounded-xl space-y-2.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-xs font-bold text-sky-900">
            <span className="flex items-center gap-2">
              <RefreshCw className="animate-spin text-sky-600" size={16} />
              رسم صفحة {progressInfo.current} من أصل {progressInfo.total}... ({progressInfo.percent}%)
            </span>
            <button
              onClick={handleCancelGeneration}
              className="flex items-center gap-1.5 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-lg text-xs transition-colors cursor-pointer"
            >
              <XCircle size={14} />
              إلغاء
            </button>
          </div>
          <div className="w-full bg-sky-200 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-sky-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.max(5, progressInfo.percent)}%` }}
            />
          </div>
        </div>
      )}

      {/* Main Grid: Customization Panel & Fast Lightweight Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Customization Panel */}
        <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 pb-3 border-b border-slate-100">
            <Sliders size={18} className="text-sky-600" />
            تخصيص مظهر وهوية الكتالوج
          </h3>

          {/* Logo Upload */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              شعار المتجر في الهيدر والعلامة المائية:
            </label>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                {settings.logo_url ? (
                  <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <Sparkles size={20} className="text-slate-300" />
                )}
              </div>
              <div className="space-y-1.5 flex-1">
                <input
                  type="file"
                  ref={logoInputRef}
                  onChange={handleLogoUpload}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <Upload size={14} />
                  {settings.logo_url ? 'تغيير الشعار' : 'رفع الشعار'}
                </button>
                {settings.logo_url && (
                  <button
                    type="button"
                    onClick={() => updateSetting('logo_url', '')}
                    className="block text-[11px] text-red-600 hover:underline cursor-pointer"
                  >
                    حذف الشعار
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Watermark Section */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Layers size={14} className="text-sky-600" />
              العلامة المائية في الخلفية:
            </label>

            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'none', label: 'إيقاف' },
                { id: 'center', label: 'في المنتصف' },
                { id: 'tiled', label: 'مكررة مائلة' },
              ].map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => updateSetting('watermark_type', mode.id as WatermarkType)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    settings.watermark_type === mode.id
                      ? 'border-sky-500 bg-white text-sky-700 shadow-2xs ring-1 ring-sky-500'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {settings.watermark_type !== 'none' && (
              <div className="space-y-3 pt-2 border-t border-slate-200 text-xs">
                <div>
                  <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                    <span>الشفافية:</span>
                    <span className="font-mono bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded">
                      {Math.round(settings.watermark_opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.03}
                    max={0.15}
                    step={0.01}
                    value={settings.watermark_opacity}
                    onChange={(e) => updateSetting('watermark_opacity', parseFloat(e.target.value))}
                    className="w-full accent-sky-600 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                    <span>حجم الشعار:</span>
                    <span className="font-mono bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded">
                      {settings.watermark_size}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={150}
                    max={450}
                    step={10}
                    value={settings.watermark_size}
                    onChange={(e) => updateSetting('watermark_size', parseInt(e.target.value, 10))}
                    className="w-full accent-sky-600 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Brand visibility toggle */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.show_brand_on_card}
                onChange={(e) => updateSetting('show_brand_on_card', e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4 cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-slate-800 block">
                  إظهار اسم الماركة الأصلية (START)
                </span>
                <span className="text-[11px] text-slate-500 block leading-tight">
                  مطفي افتراضياً ليظهر الكتالوج باسم متجرك فقط
                </span>
              </div>
            </label>
          </div>

          {/* Catalog Grid Layout (Columns x Rows) */}
          <GridLayoutSelector
            columns={(settings.products_per_row || 4) as GridCols}
            rows={
              (settings.rows_per_page ||
                ((settings.products_per_row || 4) === 4 ? 4 : 3)) as GridRows
            }
            mode={settings.grid_layout_mode || 'manual'}
            itemCount={filteredProducts.length}
            onChange={updateGridLayout}
            compact
          />

          {/* Primary Color */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Palette size={14} />
              اللون الرئيسي للهيدر والأقسام:
            </label>
            <div className="flex items-center gap-2">
              {['#ea580c', '#0284c7', '#059669', '#4f46e5', '#d97706', '#dc2626', '#0f172a'].map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => updateSetting('primary_color', color)}
                  className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                    settings.primary_color === color ? 'ring-2 ring-offset-2 ring-sky-500 scale-110' : ''
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Models & Specs Toggles */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="flex items-center justify-between text-xs font-semibold text-slate-700 cursor-pointer">
              <span>عرض الموديلات المتاحة في الكارت</span>
              <input
                type="checkbox"
                checked={settings.show_available_models}
                onChange={(e) => updateSetting('show_available_models', e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4"
              />
            </label>
            <label className="flex items-center justify-between text-xs font-semibold text-slate-700 cursor-pointer">
              <span>عرض المواصفات الفنية في الكارت</span>
              <input
                type="checkbox"
                checked={settings.show_specification}
                onChange={(e) => updateSetting('show_specification', e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4"
              />
            </label>
          </div>
        </div>

        {/* Right: Fast Live HTML Preview (First 2 Pages Only for Speed) */}
        <div className="lg:col-span-2 bg-slate-200/80 p-4 rounded-2xl border border-slate-300 overflow-y-auto max-h-[850px] flex flex-col items-center">
          {/* Filter Bar for Preview */}
          <div className="w-full max-w-[794px] bg-white p-3 rounded-xl border border-slate-200 mb-4 flex items-center justify-between gap-3 text-xs shadow-2xs">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="font-bold text-slate-500 shrink-0">معاينة قسم:</span>
              {['الكل', ...categories.map((c) => c.name)].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-md font-bold shrink-0 transition-all cursor-pointer ${
                    activeCategoryFilter === cat
                      ? 'bg-sky-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <span className="font-semibold text-slate-600 shrink-0">
              {filteredProducts.length} منتج مسعر ({totalCalculatedPages} صفحة)
            </span>
          </div>

          {/* Speed Note badge */}
          <div className="w-full max-w-[794px] mb-3 px-3 py-1.5 bg-sky-50 border border-sky-200 rounded-lg text-[11px] font-bold text-sky-800 flex items-center justify-between">
            <span>المعاينة السريعة تعرض أول صفحتين فقط لضمان سرعة واستجابة الشاشة أثناء التعديل.</span>
            <span>الكتالوج الكامل: {totalCalculatedPages} صفحة</span>
          </div>

          {/* Actual Rendered Preview (First 2 Pages Only) */}
          <div
            className="w-full flex flex-col items-center gap-6"
            dangerouslySetInnerHTML={{
              __html: buildPreviewHtml(products, settings, activeCategoryFilter, 2),
            }}
          />
        </div>
      </div>

      {/* PDF Iframe Modal for Live Preview */}
      {showIframeModal && previewBlobUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-4 bg-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-sky-400" />
                <span className="font-bold text-sm">معاينة ملف الـ PDF الناتج عبر Canvas 2D</span>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={previewBlobUrl}
                  download="معاينة_الكتالوج.pdf"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  <Download size={14} />
                  تنزيل الآن
                </a>
                <button
                  onClick={() => {
                    setShowIframeModal(false);
                    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
                    setPreviewBlobUrl(null);
                  }}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-200">
              <iframe src={previewBlobUrl} title="PDF Preview" className="w-full h-full border-none" />
            </div>
          </div>
        </div>
      )}

      {/* Browser Native Print Modal Overlay */}
      {showBrowserPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-700 mx-auto flex items-center justify-center">
              <Printer size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">جاري فتح نافذة طباعة المتصفح</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                تم تجهيز صفحات الكتالوج بقواعد الطباعة النظيفة (Print CSS). في نافذة الطباعة اختر <strong>"حفظ بتنسيق PDF" (Save as PDF)</strong> أو اختر طابعتك مباشرة.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => window.print()}
                className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors cursor-pointer"
              >
                إعادة فتح نافذة الطباعة
              </button>
              <button
                onClick={() => setShowBrowserPrintModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>

          {/* Hidden full printable catalog for window.print */}
          <div
            id="printable-catalog"
            className="hidden print:block"
            dangerouslySetInnerHTML={{
              __html: buildPreviewHtml(products, settings, activeCategoryFilter, 999),
            }}
          />
        </div>
      )}

      {/* Warning Modal Before Download If Products Need Crop Adjustment */}
      {showCropWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-amber-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-300">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  تنبيه: يوجد {productsNeedingCropList.length} منتج يحتاج ضبط القص
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  تم تعليم بعض المنتجات في هذا الكتالوج بأن صورها إعلانات أو تحتوي على عناصر متداخلة وقد تظهر بدون قص نظيف. هل ترغب في المتابعة وتنزيل الكتالوج أم التراجع لضبط الصور أولاً؟
                </p>
              </div>
            </div>

            {/* Mini preview list of needing crop items */}
            <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 bg-slate-50 rounded-xl border border-slate-200 mb-5">
              {productsNeedingCropList.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-xs bg-white p-1.5 rounded-lg border border-slate-200">
                  <div className="w-8 h-8 rounded bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-[8px] text-slate-300">بدون</span>
                    )}
                  </div>
                  <span className="font-bold text-slate-700 truncate flex-1">{p.name}</span>
                  <span className="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded font-mono">{p.code}</span>
                </div>
              ))}
              {productsNeedingCropList.length > 5 && (
                <p className="text-[11px] text-center text-slate-400 font-semibold pt-1">
                  و {productsNeedingCropList.length - 5} منتجات أخرى...
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowCropWarningModal(false);
                  setPendingAction(null);
                }}
                className="w-full sm:w-auto py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                مراجعة وضبط الصور أولاً
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCropWarningModal(false);
                  if (pendingAction) {
                    const fn = pendingAction;
                    setPendingAction(null);
                    fn();
                  }
                }}
                className="w-full sm:w-auto py-2.5 px-5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-md shadow-amber-600/20 transition-all cursor-pointer"
              >
                متابعة وتنزيل الكتالوج على أي حال
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Dispatch / Pre-Export Review Modal (Requirement 1) */}
      {showReviewModal && (
        <CatalogReviewModal
          products={filteredProducts}
          settings={settings}
          actionTitle="تحميل الكتالوج PDF"
          onConfirm={() => {
            setShowReviewModal(false);
            if (pendingPdfAction) {
              const fn = pendingPdfAction;
              setPendingPdfAction(null);
              fn();
            }
          }}
          onClose={() => {
            setShowReviewModal(false);
            setPendingPdfAction(null);
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
