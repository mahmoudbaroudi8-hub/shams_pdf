import React, { useState, useRef, useMemo } from 'react';
import {
  Product,
  CatalogSettings,
  DEFAULT_CATEGORIES,
  WatermarkType,
  WatermarkLayer,
  WatermarkPosition,
  HeaderLogoPosition,
  HeaderLogoShape,
  CardLogoPosition,
  CatalogSectionHeaderConfig,
  DEFAULT_SECTION_HEADER_CONFIG,
  CatalogCardConfig,
  DEFAULT_CARD_CONFIG,
  CategorySectionOverride,
  CompanyPhoneItem,
  GridSymmetryMode,
} from '../types';
import { saveSettings } from '../utils/db';
import {
  generateCatalogPdf,
  buildPreviewHtml,
  buildCatalogItemsSequence,
  paginateCatalogPageItems,
  resolveEffectiveGridLayout,
} from '../utils/pdfGenerator';
import { compressUploadedImage } from '../utils/imageCropper';
import { CatalogReviewModal } from './CatalogReviewModal';
import { GridLayoutSelector, GridCols, GridRows, GridLayoutMode } from './GridLayoutSelector';
import {
  SectionHeaderControlPanel,
  SectionEditorModal,
  SectionQuickSummary,
} from './SectionHeaderControls';
import { CardStyleControlPanel, CardDesignerModal } from './CardStyleControls';
import { LogoStudioModal, LogoStudioTab } from './LogoStudioModal';
import { CropAdjustModal } from './CropAdjustModal';
import { PdfBlobPreviewModal } from './PdfBlobPreviewModal';
import { PdfSplitExportModal } from './PdfSplitExportModal';
import { CatalogPngExportModal } from './CatalogPngExportModal';
import { ResponsiveA4Preview } from './ResponsiveA4Preview';
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
  Edit3,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  CreditCard,
  LayoutGrid,
  Image as ImageIcon,
  Images,
  CheckSquare,
  Split,
  RotateCcw,
  Move,
  Wand2,
  Building2,
  EyeOff,
  Phone,
  Plus,
  Trash2,
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
  const [previewPdfBlob, setPreviewPdfBlob] = useState<Blob | null>(null);
  const [showPdfPreviewModal, setShowPdfPreviewModal] = useState(false);
  const [previewPageOffset, setPreviewPageOffset] = useState(0);
  const [showAllPreviewPages, setShowAllPreviewPages] = useState(false);
  const [showBrowserPrintModal, setShowBrowserPrintModal] = useState(false);
  const [showCropWarningModal, setShowCropWarningModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showSectionEditorModal, setShowSectionEditorModal] = useState(false);
  const [showCardDesignerModal, setShowCardDesignerModal] = useState(false);
  const [showLogoStudioModal, setShowLogoStudioModal] = useState(false);
  const [logoStudioInitialTab, setLogoStudioInitialTab] = useState<LogoStudioTab>('header');
  const [showLogoImageEditor, setShowLogoImageEditor] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showPngExportModal, setShowPngExportModal] = useState(false);
  const [focusedProductId, setFocusedProductId] = useState<string | null>(null);
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({
    card: true,
    sections: true,
  });
  const [showMorePanels, setShowMorePanels] = useState(false);
  const [pendingPdfAction, setPendingPdfAction] = useState<(() => void) | null>(null);
  const [productsNeedingCropList, setProductsNeedingCropList] = useState<Product[]>([]);

  const togglePanelItem = (panelKey: string) => {
    setExpandedPanels((prev) => ({
      ...prev,
      [panelKey]: !prev[panelKey],
    }));
  };

  const allPanelKeys = ['card', 'sections', 'company', 'grid', 'logo', 'watermark', 'color', 'fields'];
  const areAllPanelsOpen = allPanelKeys.every((k) => expandedPanels[k]);

  const handleToggleAllPanels = () => {
    if (areAllPanelsOpen) {
      setExpandedPanels({});
    } else {
      setShowMorePanels(true);
      const next: Record<string, boolean> = {};
      allPanelKeys.forEach((k) => {
        next[k] = true;
      });
      setExpandedPanels(next);
    }
  };

  const triggerReviewBeforeAction = (action: () => void) => {
    setPendingPdfAction(() => action);
    setShowReviewModal(true);
  };

  const logoInputRef = useRef<HTMLInputElement>(null);
  const cancelGenerationRef = useRef<boolean>(false);
  const settingsRef = useRef<CatalogSettings>(settings);
  settingsRef.current = settings;

  // Eligible products: included in catalog, complete (has name) and selling_price > 0
  const eligibleProducts = products.filter(
    (p) => p.included_in_catalog && (p.selling_price || 0) > 0 && p.name?.trim()
  );

  const filteredProducts =
    activeCategoryFilter === 'الكل'
      ? eligibleProducts
      : eligibleProducts.filter((p) => p.category === activeCategoryFilter);

  const isGroupedByCategory = Boolean(settings.group_by_category);
  const sectionConfig: CatalogSectionHeaderConfig = {
    ...DEFAULT_SECTION_HEADER_CONFIG,
    ...(settings.section_header_config || {}),
    overrides: settings.section_header_config?.overrides || {},
  };
  const cardConfig: CatalogCardConfig = {
    ...DEFAULT_CARD_CONFIG,
    ...(settings.card_config || {}),
    per_product_overrides: settings.card_config?.per_product_overrides || {},
  };

  const activeSectionsCount = useMemo(() => {
    const set = new Set<string>();
    eligibleProducts.forEach((p) => set.add(p.category?.trim() || 'متنوعة'));
    return set.size;
  }, [eligibleProducts]);

  const sectionsSummary: SectionQuickSummary[] = useMemo(() => {
    const groups = new Map<string, number>();
    eligibleProducts.forEach((p) => {
      const catName = p.category?.trim() || 'متنوعة';
      groups.set(catName, (groups.get(catName) || 0) + 1);
    });
    const overrides = sectionConfig.overrides || {};
    const rankMap = new Map(categories.map((c, idx) => [c.name, idx]));

    const names = Array.from(groups.keys()).sort((a, b) => {
      const orderA = overrides[a]?.order ?? (rankMap.has(a) ? rankMap.get(a)! : 999);
      const orderB = overrides[b]?.order ?? (rankMap.has(b) ? rankMap.get(b)! : 999);
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b, 'ar');
    });

    return names.map((name) => {
      const def = categories.find((c) => c.name === name);
      const ov = overrides[name];
      return {
        name,
        title: ov?.title?.trim() || def?.catalog_title || def?.name || name,
        count: groups.get(name) || 0,
        color: ov?.color || def?.color || settings.primary_color || '#ea580c',
        hidden: Boolean(ov?.hidden),
      };
    });
  }, [eligibleProducts, categories, sectionConfig.overrides, settings.primary_color]);

  const catalogSequence = useMemo(
    () => buildCatalogItemsSequence(products, settings, undefined, activeCategoryFilter),
    [products, settings, activeCategoryFilter]
  );

  const visibleProductItemsCount = useMemo(
    () => catalogSequence.filter((it) => it.type === 'product').length,
    [catalogSequence]
  );

  const effectiveGridLayout = resolveEffectiveGridLayout({
    mode: settings.grid_layout_mode || 'manual',
    symmetry: settings.grid_symmetry || 'any',
    columns: settings.products_per_row || 4,
    rows: settings.rows_per_page,
    itemCount: visibleProductItemsCount || filteredProducts.length,
  });

  const totalCalculatedPages = useMemo(() => {
    return paginateCatalogPageItems(
      catalogSequence,
      effectiveGridLayout.cols,
      effectiveGridLayout.rows,
      sectionConfig
    ).length;
  }, [catalogSequence, effectiveGridLayout.cols, effectiveGridLayout.rows, sectionConfig]);

  const safePreviewOffset =
    previewPageOffset >= totalCalculatedPages
      ? Math.max(0, totalCalculatedPages - 2)
      : previewPageOffset;

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
      ...settingsRef.current,
      [key]: value,
    };
    settingsRef.current = updated;
    onSettingsUpdated(updated);
    await saveSettings(updated);
  };

  const updateSettingsBatch = async (patch: Partial<CatalogSettings>) => {
    const updated: CatalogSettings = {
      ...settingsRef.current,
      ...patch,
    };
    settingsRef.current = updated;
    onSettingsUpdated(updated);
    await saveSettings(updated);
  };

  const handleAddExtraPhone = () => {
    const currentList = settingsRef.current.extra_phones || [];
    const nextItem: CompanyPhoneItem = {
      id: `phone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: currentList.length === 0 ? 'مبيعات' : `موبايل ${currentList.length + 1}`,
      number: '',
      visible: true,
      is_whatsapp: false,
    };
    void updateSettingsBatch({ extra_phones: [...currentList, nextItem] });
  };

  const handleUpdateExtraPhone = (id: string, patch: Partial<CompanyPhoneItem>) => {
    const currentList = settingsRef.current.extra_phones || [];
    const nextList = currentList.map((item) => (item.id === id ? { ...item, ...patch } : item));
    void updateSettingsBatch({ extra_phones: nextList });
  };

  const handleDeleteExtraPhone = (id: string) => {
    const currentList = settingsRef.current.extra_phones || [];
    void updateSettingsBatch({
      extra_phones: currentList.filter((item) => item.id !== id),
    });
  };

  const updateGridLayout = async (
    cols: GridCols,
    rows: GridRows,
    mode?: GridLayoutMode,
    symmetry?: GridSymmetryMode
  ) => {
    const base = settingsRef.current;
    const updated: CatalogSettings = {
      ...base,
      products_per_row: cols,
      rows_per_page: rows,
      grid_layout_mode: mode ?? base.grid_layout_mode ?? 'manual',
      grid_symmetry: symmetry ?? base.grid_symmetry ?? 'any',
    };
    settingsRef.current = updated;
    onSettingsUpdated(updated);
    await saveSettings(updated);
  };

  const handleMoveSectionQuick = async (sectionName: string, direction: -1 | 1) => {
    const idx = sectionsSummary.findIndex((s) => s.name === sectionName);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= sectionsSummary.length) return;

    const reordered = [...sectionsSummary];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(targetIdx, 0, moved);

    const nextOverrides: Record<string, CategorySectionOverride> = {
      ...(sectionConfig.overrides || {}),
    };
    reordered.forEach((sec, orderIdx) => {
      nextOverrides[sec.name] = {
        ...(nextOverrides[sec.name] || {}),
        order: orderIdx,
      };
    });

    await updateSetting('section_header_config', {
      ...sectionConfig,
      overrides: nextOverrides,
    });
  };

  const handleReorderSectionsQuick = async (orderedSectionNames: string[]) => {
    const nextOverrides: Record<string, CategorySectionOverride> = {
      ...(sectionConfig.overrides || {}),
    };
    orderedSectionNames.forEach((name, orderIdx) => {
      nextOverrides[name] = {
        ...(nextOverrides[name] || {}),
        order: orderIdx,
      };
    });

    await updateSetting('section_header_config', {
      ...sectionConfig,
      overrides: nextOverrides,
    });
  };

  const handleToggleSectionHiddenQuick = async (sectionName: string) => {
    const currentOverrides = sectionConfig.overrides || {};
    const prevOv = currentOverrides[sectionName] || {};
    await updateSetting('section_header_config', {
      ...sectionConfig,
      overrides: {
        ...currentOverrides,
        [sectionName]: {
          ...prevOv,
          hidden: !prevOv.hidden,
        },
      },
    });
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
        setPreviewPdfBlob(blob);
        setShowPdfPreviewModal(true);
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
    <>
    <div className="space-y-6 print:hidden">
      {/* Top Banner & Main Actions */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
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
          {/* Quick Toggle: Group & Divide Elements by Categories */}
          <button
            type="button"
            onClick={() => updateSetting('group_by_category', !isGroupedByCategory)}
            className={`flex items-center gap-2 px-4 py-2.5 font-extrabold rounded-xl text-xs transition-all cursor-pointer border ${
              isGroupedByCategory
                ? 'bg-sky-600 hover:bg-sky-700 text-white border-sky-600 shadow-md shadow-sky-600/20'
                : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-200'
            }`}
            title="تقسيم العناصر في الـ PDF على حسب الأقسام مع عنوان في نص السطر"
          >
            {isGroupedByCategory ? <Check size={15} /> : <Layers size={15} />}
            <span>{isGroupedByCategory ? 'مقسّم حسب الأقسام ✓' : 'تقسيم العناصر حسب الأقسام'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSectionEditorModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs border border-slate-200 shadow-2xs transition-colors cursor-pointer"
            title="ترتيب، إظهار/إخفاء، وتعديل أسماء وألوان الأقسام في الـ PDF"
          >
            <Edit3 size={14} className="text-sky-600" />
            <span>ترتيب وإخفاء وتعديل الأقسام</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSplitModal(true)}
            disabled={isGeneratingPdf || eligibleProducts.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs shadow-xs transition-colors cursor-pointer"
            title="تقسيم الكتالوج وتصديره كعدة ملفات PDF حسب الأقسام أو عدد الصفحات"
          >
            <Split size={14} />
            <span>تقسيم لكذا ملف PDF</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPngExportModal(true)}
            disabled={isGeneratingPdf || eligibleProducts.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs shadow-xs transition-colors cursor-pointer"
            title="تقسيم كل صفحة إلى صورة PNG عالية الوضوح مع إمكانية تعديل كل صفحة قبل التنزيل"
          >
            <Images size={14} />
            <span>تقسيم كل صفحة PNG (صور واضحة)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFocusedProductId(null);
              setShowCardDesignerModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-800 font-extrabold rounded-xl text-xs border border-orange-200 shadow-2xs transition-colors cursor-pointer"
            title="تعديل شكل وعرض وألوان الكارت"
          >
            <Palette size={14} className="text-orange-600" />
            <span>تصميم الكارت (شكل وعرض ولون)</span>
          </button>

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
      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[390px_minmax(0,1fr)] gap-4 xl:gap-5 items-start">
        {/* Left: Scrollable & Collapsible Customization Panel matching screen and catalog preview height */}
        <div className="catalog-identity-panel min-w-0 w-full bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col overflow-hidden max-h-[60dvh] sm:max-h-[65dvh] xl:h-[calc(100dvh-6.5rem)] xl:max-h-[900px] xl:sticky xl:top-20">
          {/* Sticky Header */}
          <div className="catalog-identity-header px-4 py-3.5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2 shrink-0">
            <h3 className="font-extrabold text-slate-800 text-xs sm:text-sm flex items-center gap-2 min-w-0">
              <Sliders size={17} className="text-orange-600 shrink-0" />
              <span className="truncate">تخصيص مظهر وهوية الكتالوج</span>
            </h3>
            <button
              type="button"
              onClick={handleToggleAllPanels}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white hover:bg-orange-50 text-orange-700 border border-orange-200 transition-colors cursor-pointer shrink-0"
            >
              {areAllPanelsOpen ? 'طيّ الكل' : 'فتح الكل'}
            </button>
          </div>

          {/* Scrollable Accordion Elements List */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 overscroll-contain">
            {/* Item 1: Card Shape, Width & Colors */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => togglePanelItem('card')}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-2 bg-slate-50/70 hover:bg-orange-50/60 transition-colors cursor-pointer text-right"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CreditCard size={15} className="text-orange-600 shrink-0" />
                  <span className="text-xs font-extrabold text-slate-800 truncate">
                    شكل وعرض وألوان الكارت
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 shrink-0">
                    {cardConfig.width_percent}%
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 shrink-0">
                  <span>{expandedPanels.card ? 'إخفاء' : 'عرض المزيد'}</span>
                  {expandedPanels.card ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>
              {expandedPanels.card && (
                <div className="p-2.5 border-t border-slate-100">
                  <CardStyleControlPanel
                    config={cardConfig}
                    onChangeConfig={(next) => updateSetting('card_config', next)}
                    onOpenCardDesigner={() => {
                      setFocusedProductId(null);
                      setShowCardDesignerModal(true);
                    }}
                    gridCols={effectiveGridLayout.cols}
                    gridRows={effectiveGridLayout.rows}
                    gridMode={settings.grid_layout_mode || 'manual'}
                    gridSymmetry={settings.grid_symmetry || 'any'}
                    itemCount={visibleProductItemsCount || filteredProducts.length}
                    onChangeGrid={(cols, rows, mode, sym) =>
                      updateGridLayout(cols as GridCols, rows as GridRows, mode, sym)
                    }
                  />
                </div>
              )}
            </div>

            {/* Item 2: Category Section Division */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => togglePanelItem('sections')}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-2 bg-slate-50/70 hover:bg-orange-50/60 transition-colors cursor-pointer text-right"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Layers size={15} className="text-orange-600 shrink-0" />
                  <span className="text-xs font-extrabold text-slate-800 truncate">
                    تقسيم العناصر حسب الأقسام
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                      isGroupedByCategory
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {isGroupedByCategory ? 'مفعّل' : 'مغلق'}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 shrink-0">
                  <span>{expandedPanels.sections ? 'إخفاء' : 'عرض المزيد'}</span>
                  {expandedPanels.sections ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>
              {expandedPanels.sections && (
                <div className="p-2.5 border-t border-slate-100">
                  <SectionHeaderControlPanel
                    enabled={isGroupedByCategory}
                    onToggleEnabled={() => updateSetting('group_by_category', !isGroupedByCategory)}
                    config={sectionConfig}
                    onChangeConfig={(next) => updateSetting('section_header_config', next)}
                    primaryColor={settings.primary_color || '#ea580c'}
                    sectionCount={activeSectionsCount}
                    onOpenSectionEditor={() => setShowSectionEditorModal(true)}
                    sectionsSummary={sectionsSummary}
                    onMoveSectionQuick={handleMoveSectionQuick}
                    onReorderSectionsQuick={handleReorderSectionsQuick}
                    onToggleSectionHiddenQuick={handleToggleSectionHiddenQuick}
                    onOpenSplitModal={() => setShowSplitModal(true)}
                  />
                </div>
              )}
            </div>

            {/* Item 2B: Company Identity, Multi-Phones & Show/Hide Toggles */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => togglePanelItem('company')}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-2 bg-slate-50/70 hover:bg-orange-50/60 transition-colors cursor-pointer text-right"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 size={15} className="text-orange-600 shrink-0" />
                  <span className="text-xs font-extrabold text-slate-800 truncate">
                    بيانات الشركة والموبايلات (إظهار/إخفاء)
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 shrink-0">
                  <span>{expandedPanels.company ? 'إخفاء' : 'عرض المزيد'}</span>
                  {expandedPanels.company ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>
              {expandedPanels.company && (
                <div className="p-3 border-t border-slate-100 space-y-2.5 text-xs">
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-600 leading-relaxed">
                    عدّل تفاصيل الشركة وأضف أرقام موبايلات، وتحكم في إظهار أو إخفاء كل بيان من نفس العلامة مباشرة.
                  </div>

                  {/* Helper component inline renderer for each toggleable field */}
                  {[
                    {
                      label: 'اسم الشركة / المتجر',
                      value: settings.company_name || '',
                      visible: settings.show_company_name !== false,
                      placeholder: 'مثال: شركة النجم للإكسسوارات',
                      onChangeText: (val: string) =>
                        void updateSettingsBatch({ company_name: val, store_name: val }),
                      onToggleVisible: () =>
                        void updateSettingsBatch({
                          show_company_name: settings.show_company_name === false,
                        }),
                    },
                    {
                      label: 'نبذة عن النشاط',
                      value: settings.business_bio || '',
                      visible: settings.show_business_bio !== false,
                      placeholder: 'مثال: موزع معتمد بضمان الاستبدال الفوري',
                      onChangeText: (val: string) =>
                        void updateSettingsBatch({ business_bio: val }),
                      onToggleVisible: () =>
                        void updateSettingsBatch({
                          show_business_bio: settings.show_business_bio === false,
                        }),
                    },
                    {
                      label: 'عنوان الكتالوج',
                      value: settings.catalog_title || '',
                      visible: settings.show_catalog_title !== false,
                      placeholder: 'مثال: قائمة أسعار الجملة المعتمدة',
                      onChangeText: (val: string) =>
                        void updateSettingsBatch({ catalog_title: val }),
                      onToggleVisible: () =>
                        void updateSettingsBatch({
                          show_catalog_title: settings.show_catalog_title === false,
                        }),
                    },
                    {
                      label: 'سريان الأسعار (شارة التحديث)',
                      value: settings.price_validity_note || '',
                      visible: settings.show_price_validity !== false,
                      placeholder: 'مثال: حتى نهاية الشهر / تحديث يومي',
                      onChangeText: (val: string) =>
                        void updateSettingsBatch({ price_validity_note: val }),
                      onToggleVisible: () =>
                        void updateSettingsBatch({
                          show_price_validity: settings.show_price_validity === false,
                        }),
                    },
                    {
                      label: 'الهاتف الأساسي',
                      value: settings.phone || '',
                      visible: settings.show_phone !== false,
                      placeholder: '010XXXXXXXX',
                      dir: 'ltr' as const,
                      onChangeText: (val: string) => void updateSettingsBatch({ phone: val }),
                      onToggleVisible: () =>
                        void updateSettingsBatch({ show_phone: settings.show_phone === false }),
                    },
                    {
                      label: 'رقم الواتساب',
                      value: settings.whatsapp_number || '',
                      visible: settings.show_whatsapp !== false,
                      placeholder: '2010XXXXXXXX',
                      dir: 'ltr' as const,
                      onChangeText: (val: string) =>
                        void updateSettingsBatch({ whatsapp_number: val }),
                      onToggleVisible: () =>
                        void updateSettingsBatch({
                          show_whatsapp: settings.show_whatsapp === false,
                        }),
                    },
                    {
                      label: 'هاتف بديل',
                      value: settings.secondary_phone || '',
                      visible: settings.show_secondary_phone !== false,
                      placeholder: '011XXXXXXXX',
                      dir: 'ltr' as const,
                      onChangeText: (val: string) =>
                        void updateSettingsBatch({ secondary_phone: val }),
                      onToggleVisible: () =>
                        void updateSettingsBatch({
                          show_secondary_phone: settings.show_secondary_phone === false,
                        }),
                    },
                  ].map((field, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded-xl border transition-colors ${
                        field.visible
                          ? 'bg-white border-slate-200'
                          : 'bg-slate-50 border-slate-200/70 opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-bold text-slate-700">{field.label}</span>
                        <button
                          type="button"
                          onClick={field.onToggleVisible}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold cursor-pointer whitespace-nowrap transition-colors ${
                            field.visible
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-slate-100 border-slate-200 text-slate-500'
                          }`}
                          title={field.visible ? 'إخفاء من الكتالوج' : 'إظهار في الكتالوج'}
                        >
                          {field.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                          <span>{field.visible ? 'ظاهر' : 'مخفي'}</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        dir={field.dir || 'rtl'}
                        value={field.value}
                        onChange={(e) => field.onChangeText(e.target.value)}
                        placeholder={field.placeholder}
                        className={`w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] focus:outline-orange-500 ${
                          field.dir === 'ltr' ? 'font-mono text-left' : ''
                        }`}
                      />
                    </div>
                  ))}

                  {/* Extra Mobile Numbers List */}
                  <div className="p-2.5 rounded-xl border border-orange-200 bg-orange-50/40 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold text-slate-800 flex items-center gap-1.5">
                        <Phone size={12} className="text-orange-600" />
                        <span>أرقام موبايلات إضافية ({(settings.extra_phones || []).length})</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleAddExtraPhone}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-[10px] font-bold cursor-pointer whitespace-nowrap"
                      >
                        <Plus size={12} />
                        <span>إضافة موبايل</span>
                      </button>
                    </div>

                    {(settings.extra_phones || []).length === 0 ? (
                      <div className="text-[10px] text-slate-500 text-center py-1.5">
                        لا توجد أرقام إضافية بعد. اضغط «إضافة موبايل» لإدراج أرقام المبيعات أو الفروع.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {(settings.extra_phones || []).map((ep) => {
                          const isVis = ep.visible !== false;
                          return (
                            <div
                              key={ep.id}
                              className={`p-2 rounded-lg border bg-white space-y-1.5 ${
                                isVis ? 'border-slate-200' : 'border-slate-200/70 opacity-75'
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={ep.label || ''}
                                  onChange={(e) =>
                                    handleUpdateExtraPhone(ep.id, { label: e.target.value })
                                  }
                                  placeholder="الوصف (مبيعات / فرع)"
                                  className="w-24 px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-bold"
                                />
                                <input
                                  type="text"
                                  dir="ltr"
                                  value={ep.number}
                                  onChange={(e) =>
                                    handleUpdateExtraPhone(ep.id, { number: e.target.value })
                                  }
                                  placeholder="01XXXXXXXXX"
                                  className="flex-1 min-w-0 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-mono"
                                />
                              </div>
                              <div className="flex items-center justify-between gap-1.5">
                                <label className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(ep.is_whatsapp)}
                                    onChange={(e) =>
                                      handleUpdateExtraPhone(ep.id, {
                                        is_whatsapp: e.target.checked,
                                      })
                                    }
                                    className="rounded text-emerald-600 w-3.5 h-3.5 cursor-pointer"
                                  />
                                  <span>واتساب</span>
                                </label>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateExtraPhone(ep.id, { visible: !isVis })
                                    }
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold cursor-pointer whitespace-nowrap ${
                                      isVis
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                        : 'bg-slate-100 border-slate-200 text-slate-500'
                                    }`}
                                  >
                                    {isVis ? <Eye size={11} /> : <EyeOff size={11} />}
                                    <span>{isVis ? 'ظاهر' : 'مخفي'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteExtraPhone(ep.id)}
                                    className="p-1 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 cursor-pointer"
                                    title="حذف الرقم"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Address, Email, Tax/CR, Footer Note with Unified Show/Hide */}
                  {[
                    {
                      label: 'العنوان',
                      value: settings.address || '',
                      visible: settings.show_address !== false,
                      placeholder: 'المدينة - اسم الشارع - الدور',
                      onChangeText: (val: string) => void updateSettingsBatch({ address: val }),
                      onToggleVisible: () =>
                        void updateSettingsBatch({
                          show_address: settings.show_address === false,
                        }),
                    },
                    {
                      label: 'البريد الإلكتروني',
                      value: settings.email || '',
                      visible: settings.show_email !== false,
                      placeholder: 'sales@example.com',
                      dir: 'ltr' as const,
                      onChangeText: (val: string) => void updateSettingsBatch({ email: val }),
                      onToggleVisible: () =>
                        void updateSettingsBatch({ show_email: settings.show_email === false }),
                    },
                    {
                      label: 'السجل التجاري / الضريبي',
                      value: settings.tax_or_cr_number || '',
                      visible: settings.show_tax_or_cr !== false,
                      placeholder: 'س.ت: 12345',
                      onChangeText: (val: string) =>
                        void updateSettingsBatch({ tax_or_cr_number: val }),
                      onToggleVisible: () =>
                        void updateSettingsBatch({
                          show_tax_or_cr: settings.show_tax_or_cr === false,
                        }),
                    },
                    {
                      label: 'نص التذييل (أسفل الصفحات)',
                      value: settings.footer_note || '',
                      visible: settings.show_footer_note !== false,
                      placeholder: 'شروط الشحن أو الضمان...',
                      onChangeText: (val: string) =>
                        void updateSettingsBatch({ footer_note: val }),
                      onToggleVisible: () =>
                        void updateSettingsBatch({
                          show_footer_note: settings.show_footer_note === false,
                        }),
                    },
                  ].map((field, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded-xl border transition-colors ${
                        field.visible
                          ? 'bg-white border-slate-200'
                          : 'bg-slate-50 border-slate-200/70 opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-bold text-slate-700">{field.label}</span>
                        <button
                          type="button"
                          onClick={field.onToggleVisible}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold cursor-pointer whitespace-nowrap transition-colors ${
                            field.visible
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-slate-100 border-slate-200 text-slate-500'
                          }`}
                          title={field.visible ? 'إخفاء من الكتالوج' : 'إظهار في الكتالوج'}
                        >
                          {field.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                          <span>{field.visible ? 'ظاهر' : 'مخفي'}</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        dir={field.dir || 'rtl'}
                        value={field.value}
                        onChange={(e) => field.onChangeText(e.target.value)}
                        placeholder={field.placeholder}
                        className={`w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] focus:outline-orange-500 ${
                          field.dir === 'ltr' ? 'font-mono text-left' : ''
                        }`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Item 3: Grid Layout (Columns x Rows) */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => togglePanelItem('grid')}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-2 bg-slate-50/70 hover:bg-orange-50/60 transition-colors cursor-pointer text-right"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <LayoutGrid size={15} className="text-orange-600 shrink-0" />
                  <span className="text-xs font-extrabold text-slate-800 truncate">
                    عدد الأعمدة والصفوف بالصفحة
                  </span>
                  <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 shrink-0">
                    {effectiveGridLayout.cols}×{effectiveGridLayout.rows}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 shrink-0">
                  <span>{expandedPanels.grid ? 'إخفاء' : 'عرض المزيد'}</span>
                  {expandedPanels.grid ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>
              {expandedPanels.grid && (
                <div className="p-2.5 border-t border-slate-100">
                  <GridLayoutSelector
                    columns={(settings.products_per_row || 4) as GridCols}
                    rows={
                      (settings.rows_per_page ||
                        ((settings.products_per_row || 4) === 4 ? 4 : 3)) as GridRows
                    }
                    mode={settings.grid_layout_mode || 'manual'}
                    symmetry={settings.grid_symmetry || 'any'}
                    itemCount={visibleProductItemsCount || filteredProducts.length}
                    onChange={updateGridLayout}
                    compact
                  />
                </div>
              )}
            </div>

            {/* Item 4: Store Logo in Header */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => togglePanelItem('logo')}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-2 bg-slate-50/70 hover:bg-orange-50/60 transition-colors cursor-pointer text-right"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ImageIcon size={15} className="text-orange-600 shrink-0" />
                  <span className="text-xs font-extrabold text-slate-800 truncate">
                    شعار المتجر في الهيدر وتنسيقه
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 shrink-0">
                    {settings.logo_url ? 'مرفوع ✓' : 'بدون'}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 shrink-0">
                  <span>{expandedPanels.logo ? 'إخفاء' : 'عرض المزيد'}</span>
                  {expandedPanels.logo ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>
              {expandedPanels.logo && (
                <div className="p-3 border-t border-slate-100 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                      {settings.logo_url ? (
                        <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain p-1" />
                      ) : (
                        <Sparkles size={20} className="text-slate-300" />
                      )}
                    </div>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <input
                        type="file"
                        ref={logoInputRef}
                        onChange={handleLogoUpload}
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                      />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Upload size={13} />
                          <span>{settings.logo_url ? 'تغيير الشعار' : 'رفع الشعار'}</span>
                        </button>
                        {settings.logo_url && (
                          <button
                            type="button"
                            onClick={() => setShowLogoImageEditor(true)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-800 text-[11px] font-extrabold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Wand2 size={12} />
                            <span>تحرير الصورة</span>
                          </button>
                        )}
                      </div>
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

                  {settings.logo_url && (
                    <div className="pt-2.5 border-t border-slate-100 space-y-2.5 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setLogoStudioInitialTab('header');
                          setShowLogoStudioModal(true);
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Move size={14} />
                        <span>محرر وتحريك الشعار التفاعلي (هيدر / كروت / صفحة)</span>
                      </button>

                      <div>
                        <span className="block text-[11px] font-bold text-slate-700 mb-1">
                          موضع الشعار في الهيدر:
                        </span>
                        <div className="grid grid-cols-4 gap-1">
                          {[
                            { id: 'right', label: 'يمين' },
                            { id: 'center', label: 'وسط' },
                            { id: 'left', label: 'يسار' },
                            { id: 'hidden', label: 'إخفاء' },
                          ].map((pos) => {
                            const active = (settings.header_logo_position || 'right') === pos.id;
                            return (
                              <button
                                key={pos.id}
                                type="button"
                                onClick={() =>
                                  updateSetting('header_logo_position', pos.id as HeaderLogoPosition)
                                }
                                className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold border cursor-pointer whitespace-nowrap ${
                                  active
                                    ? 'border-orange-500 bg-orange-50 text-orange-800'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {pos.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {(settings.header_logo_position || 'right') !== 'hidden' && (
                        <>
                          <div>
                            <span className="block text-[11px] font-bold text-slate-700 mb-1">
                              شكل إطار الشعار:
                            </span>
                            <div className="grid grid-cols-3 gap-1.5">
                              {[
                                { id: 'rounded', label: 'مربع ناعم' },
                                { id: 'circle', label: 'دائري' },
                                { id: 'clean', label: 'حر بلا خلفية' },
                              ].map((sh) => {
                                const active = (settings.header_logo_shape || 'rounded') === sh.id;
                                return (
                                  <button
                                    key={sh.id}
                                    type="button"
                                    onClick={() =>
                                      updateSetting('header_logo_shape', sh.id as HeaderLogoShape)
                                    }
                                    className={`py-1 px-1.5 rounded-lg text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                                      active
                                        ? 'border-orange-500 bg-orange-50 text-orange-800'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                    }`}
                                  >
                                    {sh.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-0.5">
                                <span>الحجم:</span>
                                <span dir="ltr" className="font-mono tabular-nums bg-orange-100 text-orange-800 px-1.5 py-0.2 rounded">
                                  {settings.header_logo_size || 88}px
                                </span>
                              </div>
                              <input
                                type="range"
                                min={36}
                                max={180}
                                step={4}
                                value={settings.header_logo_size || 88}
                                onChange={(e) =>
                                  updateSetting('header_logo_size', parseInt(e.target.value, 10))
                                }
                                className="w-full accent-orange-600 cursor-pointer"
                              />
                            </div>

                            <div>
                              <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-0.5">
                                <span>البُعد والمسافة:</span>
                                <span dir="ltr" className="font-mono tabular-nums bg-orange-100 text-orange-800 px-1.5 py-0.2 rounded">
                                  {settings.header_logo_spacing ?? 14}px
                                </span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={48}
                                step={2}
                                value={settings.header_logo_spacing ?? 14}
                                onChange={(e) =>
                                  updateSetting('header_logo_spacing', parseInt(e.target.value, 10))
                                }
                                className="w-full accent-orange-600 cursor-pointer"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5 pt-1 border-t border-slate-100">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-600">
                                تحريك دقيق (أفقي / رأسي):
                              </span>
                              {((settings.header_logo_offset_x ?? 0) !== 0 ||
                                (settings.header_logo_offset_y ?? 0) !== 0) && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const updated: CatalogSettings = {
                                      ...settings,
                                      header_logo_offset_x: 0,
                                      header_logo_offset_y: 0,
                                    };
                                    await saveSettings(updated);
                                    onSettingsUpdated(updated);
                                  }}
                                  className="text-[10px] text-orange-700 hover:underline flex items-center gap-0.5 cursor-pointer"
                                >
                                  <RotateCcw size={10} />
                                  تصفير
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-0.5">
                                  <span>أفقي</span>
                                  <span dir="ltr" className="font-mono tabular-nums">
                                    {settings.header_logo_offset_x ?? 0}px
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min={-60}
                                  max={60}
                                  step={2}
                                  value={settings.header_logo_offset_x ?? 0}
                                  onChange={(e) =>
                                    updateSetting('header_logo_offset_x', parseInt(e.target.value, 10))
                                  }
                                  className="w-full accent-orange-600 cursor-pointer"
                                />
                              </div>
                              <div>
                                <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-0.5">
                                  <span>رأسي</span>
                                  <span dir="ltr" className="font-mono tabular-nums">
                                    {settings.header_logo_offset_y ?? 0}px
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min={-40}
                                  max={40}
                                  step={2}
                                  value={settings.header_logo_offset_y ?? 0}
                                  onChange={(e) =>
                                    updateSetting('header_logo_offset_y', parseInt(e.target.value, 10))
                                  }
                                  className="w-full accent-orange-600 cursor-pointer"
                                />
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Item 5: Floating / Background Logo Layer + Per-Card Logo Stamp */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => togglePanelItem('watermark')}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-2 bg-slate-50/70 hover:bg-orange-50/60 transition-colors cursor-pointer text-right"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles size={15} className="text-orange-600 shrink-0" />
                  <span className="text-xs font-extrabold text-slate-800 truncate">
                    طبقة الشعار (على الصفحة والكروت)
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 shrink-0">
                    {cardConfig.card_logo_enabled
                      ? 'على الكروت ✓'
                      : settings.watermark_type === 'none'
                        ? 'مغلق'
                        : (settings.watermark_layer || 'back') === 'front'
                          ? 'فوق المنتجات'
                          : 'تحت المنتجات'}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 shrink-0">
                  <span>{expandedPanels.watermark ? 'إخفاء' : 'عرض المزيد'}</span>
                  {expandedPanels.watermark ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>
              {expandedPanels.watermark && (
                <div className="p-3 border-t border-slate-100 space-y-3 text-xs">
                  {!settings.logo_url && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-900 flex items-center justify-between gap-2">
                      <span>ارفع شعار المتجر أولاً لإظهاره كطبقة على الصفحة أو الكروت.</span>
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-[11px] font-extrabold shrink-0 cursor-pointer"
                      >
                        رفع الشعار
                      </button>
                    </div>
                  )}

                  {/* Mode */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-bold text-slate-700">
                        طريقة عرض اللوجو على الصفحات:
                      </span>
                      {settings.logo_url && (
                        <button
                          type="button"
                          onClick={() => {
                            setLogoStudioInitialTab('page');
                            setShowLogoStudioModal(true);
                          }}
                          className="text-[10px] font-extrabold text-orange-700 hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <Move size={11} />
                          <span>تحريك تفاعلي</span>
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'none', label: 'إيقاف' },
                        { id: 'center', label: 'لوجو مفرد' },
                        { id: 'tiled', label: 'مكرر مائل' },
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => updateSetting('watermark_type', mode.id as WatermarkType)}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border transition-all cursor-pointer whitespace-nowrap ${
                            settings.watermark_type === mode.id
                              ? 'border-orange-500 bg-orange-50 text-orange-800 shadow-2xs ring-1 ring-orange-500'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {settings.watermark_type !== 'none' && (
                    <div className="space-y-3 pt-2.5 border-t border-slate-200">
                      {/* Layer Order: Front vs Back */}
                      <div>
                        <span className="block text-[11px] font-extrabold text-slate-800 mb-1.5">
                          ترتيب طبقة اللوجو بالنسبة للمنتجات:
                        </span>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            {
                              id: 'front' as WatermarkLayer,
                              title: 'طبقة علوية (فوق المنتجات)',
                              desc: 'يظهر اللوجو فوق الكروت والصور',
                            },
                            {
                              id: 'back' as WatermarkLayer,
                              title: 'طبقة سفلية (تحت المنتجات)',
                              desc: 'يظهر في الخلفية خلف الكروت',
                            },
                          ].map((opt) => {
                            const isSelected = (settings.watermark_layer || 'back') === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => updateSetting('watermark_layer', opt.id)}
                                className={`p-2 rounded-xl border text-right transition-all cursor-pointer ${
                                  isSelected
                                    ? 'border-orange-500 bg-orange-50 text-orange-950 ring-1 ring-orange-500'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <div className="font-extrabold text-[11px]">{opt.title}</div>
                                <div className="text-[10px] opacity-75 mt-0.5">{opt.desc}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Single logo position presets */}
                      {settings.watermark_type === 'center' && (
                        <div className="space-y-2">
                          <span className="block text-[11px] font-bold text-slate-700">
                            موضع اللوجو في الصفحة:
                          </span>
                          <div className="grid grid-cols-3 gap-1">
                            {[
                              { id: 'top-right', label: 'أعلى يمين' },
                              { id: 'top-center', label: 'أعلى وسط' },
                              { id: 'top-left', label: 'أعلى يسار' },
                              { id: 'center', label: 'المنتصف' },
                              { id: 'bottom-right', label: 'أسفل يمين' },
                              { id: 'bottom-left', label: 'أسفل يسار' },
                            ].map((pos) => {
                              const active = (settings.watermark_position || 'center') === pos.id;
                              return (
                                <button
                                  key={pos.id}
                                  type="button"
                                  onClick={() =>
                                    updateSetting('watermark_position', pos.id as WatermarkPosition)
                                  }
                                  className={`py-1 px-1.5 rounded-lg text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                                    active
                                      ? 'border-orange-500 bg-orange-600 text-white'
                                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  {pos.label}
                                </button>
                              );
                            })}
                          </div>

                          {/* Fine Offset X / Y */}
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div>
                              <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-0.5">
                                <span>إزاحة أفقية</span>
                                <span dir="ltr" className="font-mono tabular-nums">
                                  {settings.watermark_offset_x ?? 0}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min={-40}
                                max={40}
                                step={2}
                                value={settings.watermark_offset_x ?? 0}
                                onChange={(e) =>
                                  updateSetting('watermark_offset_x', parseInt(e.target.value, 10))
                                }
                                className="w-full accent-orange-600 cursor-pointer"
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-0.5">
                                <span>إزاحة رأسية</span>
                                <span dir="ltr" className="font-mono tabular-nums">
                                  {settings.watermark_offset_y ?? 0}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min={-40}
                                max={40}
                                step={2}
                                value={settings.watermark_offset_y ?? 0}
                                onChange={(e) =>
                                  updateSetting('watermark_offset_y', parseInt(e.target.value, 10))
                                }
                                className="w-full accent-orange-600 cursor-pointer"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Tiled gap control */}
                      {settings.watermark_type === 'tiled' && (
                        <div>
                          <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                            <span>تباعد وتكرار العلامة المائية:</span>
                            <span dir="ltr" className="font-mono tabular-nums bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                              {settings.watermark_gap ?? 100}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={60}
                            max={240}
                            step={10}
                            value={settings.watermark_gap ?? 100}
                            onChange={(e) =>
                              updateSetting('watermark_gap', parseInt(e.target.value, 10))
                            }
                            className="w-full accent-orange-600 cursor-pointer"
                          />
                        </div>
                      )}

                      {/* Opacity (3% - 100%) */}
                      <div>
                        <div className="flex justify-between items-center text-[11px] font-bold text-slate-700 mb-1">
                          <span>الشفافية (الوضوح):</span>
                          <div className="flex items-center gap-1">
                            {[0.08, 0.25, 0.6, 1].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => updateSetting('watermark_opacity', preset)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border cursor-pointer ${
                                  Math.abs((settings.watermark_opacity ?? 0.08) - preset) < 0.02
                                    ? 'bg-orange-600 text-white border-orange-600'
                                    : 'bg-slate-50 text-slate-600 border-slate-200'
                                }`}
                              >
                                {Math.round(preset * 100)}%
                              </button>
                            ))}
                            <span className="font-mono tabular-nums bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                              {Math.round((settings.watermark_opacity ?? 0.08) * 100)}%
                            </span>
                          </div>
                        </div>
                        <input
                          type="range"
                          min={0.03}
                          max={1}
                          step={0.02}
                          value={settings.watermark_opacity ?? 0.08}
                          onChange={(e) =>
                            updateSetting('watermark_opacity', parseFloat(e.target.value))
                          }
                          className="w-full accent-orange-600 cursor-pointer"
                        />
                      </div>

                      {/* Size */}
                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                          <span>حجم الشعار:</span>
                          <span className="font-mono tabular-nums bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                            {settings.watermark_size ?? 280}px
                          </span>
                        </div>
                        <input
                          type="range"
                          min={60}
                          max={600}
                          step={10}
                          value={settings.watermark_size ?? 280}
                          onChange={(e) =>
                            updateSetting('watermark_size', parseInt(e.target.value, 10))
                          }
                          className="w-full accent-orange-600 cursor-pointer"
                        />
                      </div>

                      {/* Rotation */}
                      <div>
                        <div className="flex justify-between items-center text-[11px] font-bold text-slate-700 mb-1">
                          <span>زاوية الدوران:</span>
                          <div className="flex items-center gap-1.5">
                            {(settings.watermark_rotation ?? 0) !== 0 && (
                              <button
                                type="button"
                                onClick={() => updateSetting('watermark_rotation', 0)}
                                className="text-[10px] text-orange-700 hover:underline flex items-center gap-0.5 cursor-pointer"
                              >
                                <RotateCcw size={10} />
                                تصفير
                              </button>
                            )}
                            <span dir="ltr" className="font-mono tabular-nums bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded">
                              {settings.watermark_rotation ?? (settings.watermark_type === 'tiled' ? -20 : 0)}°
                            </span>
                          </div>
                        </div>
                        <input
                          type="range"
                          min={-45}
                          max={45}
                          step={5}
                          value={
                            settings.watermark_rotation ??
                            (settings.watermark_type === 'tiled' ? -20 : 0)
                          }
                          onChange={(e) =>
                            updateSetting('watermark_rotation', parseInt(e.target.value, 10))
                          }
                          className="w-full accent-orange-600 cursor-pointer"
                        />
                      </div>
                    </div>
                  )}

                  {/* Per-Card Store Logo Stamp Controls */}
                  <div className="pt-2.5 border-t border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(cardConfig.card_logo_enabled)}
                          onChange={(e) =>
                            updateSetting('card_config', {
                              ...cardConfig,
                              card_logo_enabled: e.target.checked,
                            })
                          }
                          className="rounded text-orange-600 focus:ring-orange-500 w-4 h-4 cursor-pointer"
                        />
                        <span className="text-[11px] font-extrabold text-slate-800">
                          شعار المتجر على كل كارت
                        </span>
                      </label>

                      <button
                        type="button"
                        onClick={() => {
                          setLogoStudioInitialTab('card');
                          setShowLogoStudioModal(true);
                        }}
                        className="px-2 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 text-[10px] font-extrabold cursor-pointer whitespace-nowrap"
                      >
                        فتح محرر الكارت
                      </button>
                    </div>

                    {cardConfig.card_logo_enabled && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-1">
                          {(
                            [
                              { id: 'top-right', label: 'أعلى يمين' },
                              { id: 'top-center', label: 'أعلى وسط' },
                              { id: 'top-left', label: 'أعلى يسار' },
                              { id: 'center', label: 'المنتصف' },
                              { id: 'bottom-right', label: 'أسفل يمين' },
                              { id: 'bottom-left', label: 'أسفل يسار' },
                            ] as { id: CardLogoPosition; label: string }[]
                          ).map((pos) => (
                            <button
                              key={pos.id}
                              type="button"
                              onClick={() =>
                                updateSetting('card_config', {
                                  ...cardConfig,
                                  card_logo_position: pos.id,
                                })
                              }
                              className={`py-1 px-1 rounded-lg text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                                (cardConfig.card_logo_position ?? 'top-left') === pos.id
                                  ? 'border-orange-500 bg-orange-600 text-white'
                                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {pos.label}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateSetting('card_config', {
                                ...cardConfig,
                                card_logo_layer:
                                  (cardConfig.card_logo_layer ?? 'front') === 'front' ? 'back' : 'front',
                              })
                            }
                            className="py-1 px-2 rounded-lg text-[10px] font-bold border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                          >
                            الطبقة: {(cardConfig.card_logo_layer ?? 'front') === 'front' ? 'فوق المحتوى' : 'خلفية الكارت'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSetting('card_config', {
                                ...cardConfig,
                                card_logo_scope:
                                  (cardConfig.card_logo_scope ?? 'card') === 'card' ? 'image' : 'card',
                              })
                            }
                            className="py-1 px-2 rounded-lg text-[10px] font-bold border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                          >
                            النطاق: {(cardConfig.card_logo_scope ?? 'card') === 'card' ? 'الكارت كله' : 'إطار الصورة'}
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-0.5">
                              <span>الحجم</span>
                              <span className="font-mono tabular-nums">{cardConfig.card_logo_size ?? 26}px</span>
                            </div>
                            <input
                              type="range"
                              min={14}
                              max={90}
                              step={2}
                              value={cardConfig.card_logo_size ?? 26}
                              onChange={(e) =>
                                updateSetting('card_config', {
                                  ...cardConfig,
                                  card_logo_size: parseInt(e.target.value, 10),
                                })
                              }
                              className="w-full accent-orange-600 cursor-pointer"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-0.5">
                              <span>البُعد</span>
                              <span className="font-mono tabular-nums">{cardConfig.card_logo_inset ?? 6}px</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={24}
                              step={1}
                              value={cardConfig.card_logo_inset ?? 6}
                              onChange={(e) =>
                                updateSetting('card_config', {
                                  ...cardConfig,
                                  card_logo_inset: parseInt(e.target.value, 10),
                                })
                              }
                              className="w-full accent-orange-600 cursor-pointer"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-0.5">
                              <span>الشفافية</span>
                              <span className="font-mono tabular-nums">
                                {Math.round((cardConfig.card_logo_opacity ?? 0.85) * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0.08}
                              max={1}
                              step={0.04}
                              value={cardConfig.card_logo_opacity ?? 0.85}
                              onChange={(e) =>
                                updateSetting('card_config', {
                                  ...cardConfig,
                                  card_logo_opacity: parseFloat(e.target.value),
                                })
                              }
                              className="w-full accent-orange-600 cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Show More Secondary Properties Toggle */}
            <button
              type="button"
              onClick={() => setShowMorePanels((prev) => !prev)}
              className="w-full py-2 px-3 rounded-xl border border-dashed border-orange-300 bg-orange-50/50 hover:bg-orange-50 text-orange-800 text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>{showMorePanels ? 'عرض أقل من الخصائص' : 'عرض المزيد من الخصائص (2)'}</span>
              {showMorePanels ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {showMorePanels && (
              <div className="space-y-2.5 pt-0.5">

                {/* Item 6: Primary Color */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => togglePanelItem('color')}
                    className="w-full px-3 py-2.5 flex items-center justify-between gap-2 bg-slate-50/70 hover:bg-orange-50/60 transition-colors cursor-pointer text-right"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Palette size={15} className="text-orange-600 shrink-0" />
                      <span className="text-xs font-extrabold text-slate-800 truncate">
                        اللون الرئيسي للهيدر والأقسام
                      </span>
                      <span
                        className="w-4 h-4 rounded-full border border-white shadow-xs shrink-0"
                        style={{ backgroundColor: settings.primary_color || '#ea580c' }}
                      />
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 shrink-0">
                      <span>{expandedPanels.color ? 'إخفاء' : 'عرض المزيد'}</span>
                      {expandedPanels.color ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </button>
                  {expandedPanels.color && (
                    <div className="p-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                      {['#ea580c', '#059669', '#4f46e5', '#d97706', '#dc2626', '#0f172a'].map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => updateSetting('primary_color', color)}
                          className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                            settings.primary_color === color ? 'ring-2 ring-offset-2 ring-orange-500 scale-110' : ''
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Item 7: Card Elements Visibility & Brand */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => togglePanelItem('fields')}
                    className="w-full px-3 py-2.5 flex items-center justify-between gap-2 bg-slate-50/70 hover:bg-orange-50/60 transition-colors cursor-pointer text-right"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckSquare size={15} className="text-orange-600 shrink-0" />
                      <span className="text-xs font-extrabold text-slate-800 truncate">
                        عناصر الكارت الظاهرة والماركة
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 shrink-0">
                      <span>{expandedPanels.fields ? 'إخفاء' : 'عرض المزيد'}</span>
                      {expandedPanels.fields ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </button>
                  {expandedPanels.fields && (
                    <div className="p-3 border-t border-slate-100 space-y-2.5">
                      <label className="flex items-center justify-between text-xs font-semibold text-slate-700 cursor-pointer">
                        <span>إظهار صورة المنتج في الكارت</span>
                        <input
                          type="checkbox"
                          checked={settings.show_image ?? true}
                          onChange={(e) => updateSetting('show_image', e.target.checked)}
                          className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 w-4 h-4"
                        />
                      </label>
                      <label className="flex items-center justify-between text-xs font-semibold text-slate-700 cursor-pointer">
                        <span>إظهار كود الصنف في الكارت</span>
                        <input
                          type="checkbox"
                          checked={settings.show_code ?? true}
                          onChange={(e) => updateSetting('show_code', e.target.checked)}
                          className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 w-4 h-4"
                        />
                      </label>
                      <label className="flex items-center justify-between text-xs font-semibold text-slate-700 cursor-pointer">
                        <span>إظهار اسم القسم في الكارت</span>
                        <input
                          type="checkbox"
                          checked={settings.show_category ?? true}
                          onChange={(e) => updateSetting('show_category', e.target.checked)}
                          className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 w-4 h-4"
                        />
                      </label>
                      <label className="flex items-center justify-between text-xs font-semibold text-slate-700 cursor-pointer">
                        <span>إظهار اسم الماركة الأصلية</span>
                        <input
                          type="checkbox"
                          checked={settings.show_brand_on_card}
                          onChange={(e) => updateSetting('show_brand_on_card', e.target.checked)}
                          className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 w-4 h-4"
                        />
                      </label>
                      <label className="flex items-center justify-between text-xs font-semibold text-slate-700 cursor-pointer">
                        <span>عرض الموديلات المتاحة</span>
                        <input
                          type="checkbox"
                          checked={settings.show_available_models}
                          onChange={(e) => updateSetting('show_available_models', e.target.checked)}
                          className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 w-4 h-4"
                        />
                      </label>
                      <label className="flex items-center justify-between text-xs font-semibold text-slate-700 cursor-pointer">
                        <span>عرض المواصفات الفنية</span>
                        <input
                          type="checkbox"
                          checked={settings.show_specification}
                          onChange={(e) => updateSetting('show_specification', e.target.checked)}
                          className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 w-4 h-4"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Live Interactive Catalog Preview with Full Page Pagination */}
        <div className="min-w-0 w-full bg-slate-200/80 p-2.5 sm:p-4 rounded-2xl border border-slate-300 flex flex-col items-stretch">
          {/* Filter Bar for Preview */}
          <div className="w-full bg-white p-3 rounded-xl border border-slate-200 mb-3 flex flex-wrap items-center justify-between gap-2 text-xs shadow-2xs">
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
              <span className="font-bold text-slate-500 shrink-0">معاينة قسم:</span>
              {['الكل', ...categories.map((c) => c.name)].map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategoryFilter(cat);
                    setPreviewPageOffset(0);
                  }}
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
              {visibleProductItemsCount} منتج ({totalCalculatedPages} صفحة)
            </span>
          </div>

          {/* Speed Note, Pagination & Quick Section/Card Action Bar */}
          <div className="w-full mb-3 px-3 py-2 bg-orange-50 border border-orange-200 rounded-xl text-[11px] font-bold text-orange-900 flex flex-wrap items-center justify-between gap-2">
            <span>اضغط على أي كارت في المعاينة لتعديل لونه أو بياناته مباشرة.</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => updateSetting('group_by_category', !isGroupedByCategory)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border transition-colors cursor-pointer ${
                  isGroupedByCategory
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'bg-white text-orange-800 border-orange-300 hover:bg-orange-100'
                }`}
              >
                {isGroupedByCategory ? '✓ تقسيم الأقسام مفعّل' : 'تقسيم حسب الأقسام'}
              </button>
              <button
                type="button"
                onClick={() => setShowSectionEditorModal(true)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 cursor-pointer"
              >
                ترتيب/إخفاء الأقسام
              </button>
              <button
                type="button"
                onClick={() => setShowSplitModal(true)}
                disabled={eligibleProducts.length === 0}
                className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-white text-orange-700 border border-orange-300 hover:bg-orange-100 disabled:opacity-40 cursor-pointer"
              >
                تقسيم PDF
              </button>
              <button
                type="button"
                onClick={() => setShowPngExportModal(true)}
                disabled={eligibleProducts.length === 0}
                className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-white text-sky-700 border border-sky-300 hover:bg-sky-50 disabled:opacity-40 cursor-pointer"
              >
                صور PNG لكل صفحة
              </button>
              <button
                type="button"
                onClick={() => {
                  setFocusedProductId(null);
                  setShowCardDesignerModal(true);
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-white text-orange-700 border border-orange-300 hover:bg-orange-100 cursor-pointer"
              >
                تصميم الكارت
              </button>
            </div>
          </div>

          {/* Page Navigation Bar when catalog exceeds 2 pages */}
          {totalCalculatedPages > 2 && (
            <div className="w-full mb-3 px-3 py-2 bg-white border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs shadow-2xs">
              <div className="flex items-center gap-1.5">
                {!showAllPreviewPages && (
                  <>
                    <button
                      type="button"
                      disabled={safePreviewOffset === 0}
                      onClick={() => setPreviewPageOffset((o) => Math.max(0, o - 2))}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronRight size={14} />
                      السابق
                    </button>
                    <span className="px-2 font-extrabold text-slate-700">
                      صفحة {safePreviewOffset + 1}
                      {Math.min(totalCalculatedPages, safePreviewOffset + 2) > safePreviewOffset + 1
                        ? ` - ${Math.min(totalCalculatedPages, safePreviewOffset + 2)}`
                        : ''}{' '}
                      من {totalCalculatedPages}
                    </span>
                    <button
                      type="button"
                      disabled={safePreviewOffset + 2 >= totalCalculatedPages}
                      onClick={() =>
                        setPreviewPageOffset((o) =>
                          o + 2 < totalCalculatedPages ? o + 2 : o
                        )
                      }
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold disabled:opacity-40 cursor-pointer"
                    >
                      التالي
                      <ChevronLeft size={14} />
                    </button>
                  </>
                )}
                {showAllPreviewPages && (
                  <span className="font-extrabold text-orange-700">
                    عرض جميع الصفحات ({totalCalculatedPages} صفحة)
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowAllPreviewPages((v) => !v)}
                className="px-2.5 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 font-extrabold text-[11px] cursor-pointer"
              >
                {showAllPreviewPages ? 'عرض صفحتين للسرعة' : `عرض كل الصفحات (${totalCalculatedPages})`}
              </button>
            </div>
          )}

          {/* Actual Rendered Preview scaled proportionally to fit any screen cleanly */}
          <ResponsiveA4Preview
            html={buildPreviewHtml(
              products,
              settings,
              activeCategoryFilter,
              showAllPreviewPages ? 999 : 2,
              undefined,
              showAllPreviewPages ? 0 : safePreviewOffset
            )}
            onCardClick={(pid) => {
              setFocusedProductId(pid);
              setShowCardDesignerModal(true);
            }}
          />
        </div>
      </div>

      {/* Interactive PDF.js Preview Modal (Replaces flaky <iframe src={blobUrl}>) */}
      <PdfBlobPreviewModal
        isOpen={showPdfPreviewModal}
        pdfBlob={previewPdfBlob}
        title="معاينة ملف الـ PDF الناتج (مطابق للطباعة)"
        downloadFilename={`${(settings.store_name || 'كتالوج').replace(/\s+/g, '_')}${activeCategoryFilter !== 'الكل' ? `_${activeCategoryFilter}` : ''}.pdf`}
        onClose={() => {
          setShowPdfPreviewModal(false);
          setPreviewPdfBlob(null);
        }}
      />

      {/* Browser Native Print Modal Overlay */}
      {showBrowserPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center p-4 print:hidden">
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

      {/* Full Section Editor & Properties Modal */}
      <SectionEditorModal
        isOpen={showSectionEditorModal}
        onClose={() => setShowSectionEditorModal(false)}
        products={products}
        categories={categories}
        config={sectionConfig}
        primaryColor={settings.primary_color || '#ea580c'}
        onChangeConfig={(next) => updateSetting('section_header_config', next)}
        onProductsUpdated={onProductsUpdated}
        groupedEnabled={isGroupedByCategory}
        onToggleGrouped={() => updateSetting('group_by_category', !isGroupedByCategory)}
        onExportSingleSection={(catName) =>
          checkCropBeforeAction(() => handleDownloadPdf(catName), catName)
        }
        onOpenSplitModal={() => setShowSplitModal(true)}
      />

      {/* Multi-file Split PDF Export Modal */}
      <PdfSplitExportModal
        isOpen={showSplitModal}
        onClose={() => setShowSplitModal(false)}
        products={products}
        settings={settings}
        catalogTitle={settings.catalog_title || settings.store_name || settings.company_name}
        totalEstimatedPages={Math.max(1, totalCalculatedPages)}
      />

      {/* Split & Export Clear Editable PNG Pages Modal */}
      <CatalogPngExportModal
        isOpen={showPngExportModal}
        onClose={() => setShowPngExportModal(false)}
        products={products}
        settings={settings}
        onSettingsUpdated={async (updated) => {
          await saveSettings(updated);
          onSettingsUpdated(updated);
        }}
        categoryFilter={activeCategoryFilter}
        totalEstimatedPages={Math.max(1, totalCalculatedPages)}
      />

      {/* Card Designer Modal (Shape, Width, Colors & Per-Card Override) */}
      <CardDesignerModal
        isOpen={showCardDesignerModal}
        onClose={() => setShowCardDesignerModal(false)}
        config={cardConfig}
        onChangeConfig={(next) => updateSetting('card_config', next)}
        products={filteredProducts}
        initialProductId={focusedProductId}
        visibility={{
          show_image: settings.show_image ?? true,
          show_code: settings.show_code ?? true,
          show_category: settings.show_category ?? true,
          show_brand_on_card: settings.show_brand_on_card,
          show_specification: settings.show_specification,
          show_available_models: settings.show_available_models,
        }}
        onChangeVisibility={async (patch) => {
          const updated: CatalogSettings = {
            ...settings,
            ...patch,
          };
          await saveSettings(updated);
          onSettingsUpdated(updated);
        }}
        onProductsUpdated={onProductsUpdated}
        logoUrl={settings.logo_url}
        onOpenLogoStudio={() => {
          setShowCardDesignerModal(false);
          setLogoStudioInitialTab('card');
          setShowLogoStudioModal(true);
        }}
      />

      {/* Interactive Store Logo Studio Modal */}
      <LogoStudioModal
        isOpen={showLogoStudioModal}
        onClose={() => setShowLogoStudioModal(false)}
        settings={settings}
        onUpdateSettings={async (next) => {
          await saveSettings(next);
          onSettingsUpdated(next);
        }}
        sampleProduct={filteredProducts[0] || eligibleProducts[0] || null}
        initialTab={logoStudioInitialTab}
        onUploadLogoClick={() => logoInputRef.current?.click()}
        onOpenImageStudio={() => {
          if (!settings.logo_url) {
            logoInputRef.current?.click();
            return;
          }
          setShowLogoImageEditor(true);
        }}
      />

      {/* Store Logo Image Crop / Clean / Text Studio */}
      {showLogoImageEditor && settings.logo_url && (
        <CropAdjustModal
          initialImageUrl={settings.logo_url}
          initialRawUrl={settings.logo_url}
          initialCropBox={[0, 0, 1000, 1000]}
          outputFormat="png"
          targetMaxDimension={700}
          title="محرر صورة شعار المتجر الاحترافي"
          subtitle="قص، تنظيف الخلفية، تدوير، أو إضافة نصوص فوق شعار المتجر بصيغة شفافة PNG"
          onClose={() => setShowLogoImageEditor(false)}
          onSaveImageUrl={async (editedUrl) => {
            await updateSetting('logo_url', editedUrl);
            setShowLogoImageEditor(false);
            toast.success('تم تحديث صورة شعار المتجر وتطبيقها في الكتالوج');
          }}
        />
      )}
    </div>

    {/* Dedicated Print-Only Full Catalog Container */}
    {showBrowserPrintModal && (
      <div
        id="printable-catalog"
        className="hidden print:block"
        dangerouslySetInnerHTML={{
          __html: buildPreviewHtml(products, settings, activeCategoryFilter, 999),
        }}
      />
    )}
    </>
  );
};
