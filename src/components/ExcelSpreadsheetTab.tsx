import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Product,
  CatalogSettings,
  DEFAULT_CATEGORIES,
  ALL_CATEGORIES,
  PricingMethodType,
  PricingTier,
  StandardMapTier,
  DEFAULT_STANDARD_MAP,
} from '../types';
import {
  saveProduct,
  saveProductsBatch,
  deleteProduct,
  saveSettings,
  createAutoBackupSnapshot,
} from '../utils/db';
import {
  exportProductsToExcel,
  downloadExcelTemplate,
  parseExcelSheetToProducts,
  parsePastedSpreadsheetText,
  parseNumericPrice,
} from '../utils/excelHelper';
import { compressUploadedImage, readFileAsWorkingDataUrl } from '../utils/imageCropper';
import { CropAdjustModal } from './CropAdjustModal';
import { useUiFeedback } from './UiFeedbackProvider';
import {
  FileSpreadsheet,
  Download,
  Upload,
  Plus,
  CopyPlus,
  Trash2,
  ClipboardPaste,
  Search,
  ChevronRight,
  ImagePlus,
  Calculator,
  Check,
  X,
  FileDown,
  Filter,
  RefreshCw,
  Crop,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  Percent,
  TrendingUp,
  Layers,
  Eye,
} from 'lucide-react';

interface ExcelSpreadsheetTabProps {
  products: Product[];
  settings: CatalogSettings;
  onProductsUpdated: (newProducts: Product[]) => void;
  onSettingsUpdated?: (newSettings: CatalogSettings) => void;
  onNavigateToPricing: () => void;
}

type EditableField =
  | 'code'
  | 'name'
  | 'category'
  | 'group'
  | 'model'
  | 'specification'
  | 'wholesale_price'
  | 'selling_price';

interface ActiveCellInfo {
  productId: string;
  rowIndex: number;
  colLetter: string;
  fieldLabel: string;
  valuePreview: string;
}

const COLUMN_NAV_ORDER: EditableField[] = [
  'code',
  'name',
  'category',
  'group',
  'model',
  'specification',
  'wholesale_price',
  'selling_price',
];

const FIELD_META: Record<EditableField, { colLetter: string; label: string }> = {
  code: { colLetter: 'B', label: 'الكود' },
  name: { colLetter: 'C', label: 'اسم المنتج' },
  category: { colLetter: 'D', label: 'القسم' },
  group: { colLetter: 'E', label: 'الماركة' },
  model: { colLetter: 'F', label: 'الموديل' },
  specification: { colLetter: 'G', label: 'المواصفات' },
  wholesale_price: { colLetter: 'H', label: 'سعر الجملة' },
  selling_price: { colLetter: 'I', label: 'سعر البيع' },
};

interface ExcelInputCellProps {
  value: string | number;
  type?: 'text' | 'number';
  placeholder?: string;
  dir?: 'rtl' | 'ltr';
  alignClass?: string;
  cellKey: string;
  rowIndex: number;
  colIndex: number;
  colLetter: string;
  fieldLabel: string;
  productId: string;
  onFocusCell: (info: ActiveCellInfo) => void;
  onCommit: (val: string) => void;
  onNavigateGrid: (rowDelta: number, colDelta: number) => void;
  registerRef: (cellKey: string, el: HTMLElement | null) => void;
}

const ExcelInputCell: React.FC<ExcelInputCellProps> = ({
  value,
  type = 'text',
  placeholder,
  dir = 'rtl',
  alignClass = 'text-right',
  cellKey,
  rowIndex,
  colIndex,
  colLetter,
  fieldLabel,
  productId,
  onFocusCell,
  onCommit,
  onNavigateGrid,
  registerRef,
}) => {
  const [draft, setDraft] = useState<string>(String(value ?? ''));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setDraft(String(value ?? ''));
    }
  }, [value, isFocused]);

  const commitIfChanged = () => {
    const original = String(value ?? '');
    if (draft !== original) {
      onCommit(draft);
    }
  };

  return (
    <input
      ref={(el) => registerRef(cellKey, el)}
      type={type === 'number' ? 'text' : 'text'}
      inputMode={type === 'number' ? 'decimal' : 'text'}
      dir={dir}
      value={draft}
      placeholder={placeholder}
      onFocus={(e) => {
        setIsFocused(true);
        e.currentTarget.select();
        onFocusCell({
          productId,
          rowIndex,
          colLetter,
          fieldLabel,
          valuePreview: draft,
        });
      }}
      onChange={(e) => {
        const nextVal = e.target.value;
        setDraft(nextVal);
        onFocusCell({
          productId,
          rowIndex,
          colLetter,
          fieldLabel,
          valuePreview: nextVal,
        });
      }}
      onBlur={() => {
        setIsFocused(false);
        commitIfChanged();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitIfChanged();
          onNavigateGrid(1, 0);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          commitIfChanged();
          onNavigateGrid(1, 0);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          commitIfChanged();
          onNavigateGrid(-1, 0);
        } else if (e.key === 'Escape') {
          setDraft(String(value ?? ''));
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      data-col-index={colIndex}
      className={`w-full h-9 px-2 text-xs bg-transparent outline-none transition-colors ${alignClass} ${
        type === 'number' ? 'font-mono font-bold text-slate-800' : 'text-slate-800'
      }`}
    />
  );
};

export const ExcelSpreadsheetTab: React.FC<ExcelSpreadsheetTabProps> = ({
  products,
  settings,
  onProductsUpdated,
  onSettingsUpdated,
  onNavigateToPricing,
}) => {
  const { toast, confirm } = useUiFeedback();

  // Live ref so rapid commits / row additions never drop updates
  const productsRef = useRef<Product[]>(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const categories = useMemo(
    () =>
      settings.categories && settings.categories.length > 0
        ? settings.categories
        : DEFAULT_CATEGORIES,
    [settings.categories]
  );

  const categoryNames = useMemo(
    () => (categories.length > 0 ? categories.map((c) => c.name) : ALL_CATEGORIES),
    [categories]
  );

  // Filters & Selection
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [onlyMissingPriceOrName, setOnlyMissingPriceOrName] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Quick Selling Pricing Controls (All 5 Stage-2 Methods in Compact Dropdown + Details)
  const [quickPricingMethod, setQuickPricingMethod] = useState<PricingMethodType>(
    settings.global_pricing_rule?.method || 'percent_markup'
  );
  const [quickMarkupPercent, setQuickMarkupPercent] = useState<string>('20');
  const [quickFixedAdd, setQuickFixedAdd] = useState<string>('30');
  const [quickProfitMargin, setQuickProfitMargin] = useState<string>('20');
  const [quickTiers, setQuickTiers] = useState<PricingTier[]>([
    { id: 'qt_1', from: 1, to: 50, increase_type: 'fixed', value: 15 },
    { id: 'qt_2', from: 51, to: 150, increase_type: 'fixed', value: 25 },
    { id: 'qt_3', from: 151, to: 300, increase_type: 'fixed', value: 40 },
    { id: 'qt_4', from: 301, to: 2000, increase_type: 'percent', value: 20 },
  ]);
  const [quickStandardMap, setQuickStandardMap] = useState<StandardMapTier[]>(() =>
    settings.current_standard_map && settings.current_standard_map.length > 0
      ? settings.current_standard_map
      : DEFAULT_STANDARD_MAP
  );
  const [quickFallbackPercent, setQuickFallbackPercent] = useState<number>(
    settings.standard_map_fallback_percent || 10
  );
  const [quickAllowFractions, setQuickAllowFractions] = useState<boolean>(
    settings.allow_price_fractions ?? true
  );
  const [quickRounding, setQuickRounding] = useState<0 | 1 | 5 | 10>(() => {
    const saved = settings.global_pricing_rule?.rounding;
    if (saved === 0 || saved === 1 || saved === 5 || saved === 10) return saved;
    return (settings.allow_price_fractions ?? true) ? 0 : 5;
  });
  const [quickOverrideExisting, setQuickOverrideExisting] = useState<boolean>(false);
  const [showQuickPricingDetails, setShowQuickPricingDetails] = useState<boolean>(false);

  useEffect(() => {
    if (settings.allow_price_fractions !== undefined) {
      setQuickAllowFractions(settings.allow_price_fractions);
    }
    const savedRounding = settings.global_pricing_rule?.rounding;
    if (savedRounding === 0 || savedRounding === 1 || savedRounding === 5 || savedRounding === 10) {
      setQuickRounding(savedRounding);
    }
    if (settings.current_standard_map && settings.current_standard_map.length > 0) {
      setQuickStandardMap(settings.current_standard_map);
    }
    if (settings.standard_map_fallback_percent !== undefined) {
      setQuickFallbackPercent(settings.standard_map_fallback_percent);
    }
  }, [
    settings.allow_price_fractions,
    settings.global_pricing_rule?.rounding,
    settings.current_standard_map,
    settings.standard_map_fallback_percent,
  ]);

  // Paste from Excel dialog & import loading state
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Formula bar / active cell tracking
  const [activeCell, setActiveCell] = useState<ActiveCellInfo | null>(null);
  const [saveStatusText, setSaveStatusText] = useState<string>('جاهز • الحفظ التلقائي مفعّل');

  // Grid cell DOM refs for Enter/Arrow navigation
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());
  const registerCellRef = (key: string, el: HTMLElement | null) => {
    if (el) {
      cellRefs.current.set(key, el);
    } else {
      cellRefs.current.delete(key);
    }
  };

  // Hidden inputs & Image Studio Modal state
  const excelFileInputRef = useRef<HTMLInputElement>(null);
  const rowImageInputRef = useRef<HTMLInputElement>(null);
  const pendingImageRowIdRef = useRef<string | null>(null);
  const [imageStudioTarget, setImageStudioTarget] = useState<{
    product: Product;
    initialRawUrl?: string;
  } | null>(null);

  // Filtered rows displayed in sheet
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
      if (onlyMissingPriceOrName && p.name?.trim() && p.selling_price > 0) return false;
      if (!q) return true;
      return (
        (p.code || '').toLowerCase().includes(q) ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.group || '').toLowerCase().includes(q) ||
        (p.model || '').toLowerCase().includes(q) ||
        (p.specification || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      );
    });
  }, [products, searchQuery, categoryFilter, onlyMissingPriceOrName]);

  // Totals for status bar
  const summaryStats = useMemo(() => {
    let totalWholesale = 0;
    let totalSelling = 0;
    let totalProfit = 0;
    let includedCount = 0;

    for (const p of filteredProducts) {
      totalWholesale += p.wholesale_price || 0;
      totalSelling += p.selling_price || 0;
      if ((p.selling_price || 0) > 0) {
        totalProfit += (p.selling_price || 0) - (p.wholesale_price || 0);
      }
      if (p.included_in_catalog) includedCount++;
    }

    return {
      count: filteredProducts.length,
      includedCount,
      totalWholesale: Math.round(totalWholesale),
      totalSelling: Math.round(totalSelling),
      totalProfit: Math.round(totalProfit),
    };
  }, [filteredProducts]);

  // Helper: Parse numeric string with Arabic numeral & decimal support
  const parsePriceValue = (raw: string): number => parseNumericPrice(raw);

  // Update a single cell and persist immediately
  const handleCellCommit = async (
    productId: string,
    field: EditableField,
    rawValue: string
  ) => {
    const currentList = productsRef.current;
    const target = currentList.find((p) => p.id === productId);
    if (!target) return;

    const updated: Product = {
      ...target,
      updated_at: Date.now(),
    };

    if (field === 'wholesale_price') {
      updated.wholesale_price = parsePriceValue(rawValue);
    } else if (field === 'selling_price') {
      const nextSell = parsePriceValue(rawValue);
      updated.selling_price = nextSell;
      updated.manual_price_set = nextSell > 0;
      if (nextSell > 0 && !target.included_in_catalog && updated.name.trim()) {
        updated.included_in_catalog = true;
      }
    } else if (field === 'code') {
      updated.code = rawValue.trim();
    } else if (field === 'name') {
      updated.name = rawValue.trim();
    } else if (field === 'category') {
      updated.category = rawValue;
    } else if (field === 'group') {
      updated.group = rawValue.trim();
    } else if (field === 'model') {
      updated.model = rawValue.trim();
    } else if (field === 'specification') {
      updated.specification = rawValue.trim();
    }

    const nextList = currentList.map((p) => (p.id === productId ? updated : p));
    productsRef.current = nextList;
    onProductsUpdated(nextList);

    try {
      await saveProduct(updated);
      setSaveStatusText(`تم حفظ "${updated.name || updated.code || 'الصف'}" تلقائياً`);
    } catch {
      toast.error('تعذر حفظ التعديل في قاعدة البيانات المحلية.');
    }
  };

  // Toggle included_in_catalog checkbox
  const handleToggleIncluded = async (productId: string) => {
    const currentList = productsRef.current;
    const target = currentList.find((p) => p.id === productId);
    if (!target) return;

    const updated: Product = {
      ...target,
      included_in_catalog: !target.included_in_catalog,
      updated_at: Date.now(),
    };

    const nextList = currentList.map((p) => (p.id === productId ? updated : p));
    productsRef.current = nextList;
    onProductsUpdated(nextList);
    await saveProduct(updated);
    setSaveStatusText('تم تحديث حالة الإدراج بالكتالوج');
  };

  // Keyboard navigation across grid
  const handleNavigateGrid = (
    currentRowIndex: number,
    currentField: EditableField,
    rowDelta: number,
    colDelta: number
  ) => {
    const colIdx = COLUMN_NAV_ORDER.indexOf(currentField);
    const nextRow = Math.max(0, Math.min(filteredProducts.length - 1, currentRowIndex + rowDelta));
    const nextColIdx = Math.max(0, Math.min(COLUMN_NAV_ORDER.length - 1, colIdx + colDelta));
    const nextField = COLUMN_NAV_ORDER[nextColIdx];
    const targetProd = filteredProducts[nextRow];
    if (!targetProd) return;

    const key = `${targetProd.id}:${nextField}`;
    const el = cellRefs.current.get(key);
    if (el) {
      el.focus();
    }
  };

  // Add N blank Excel rows at top of table so user immediately sees and edits them
  const handleAddBlankRows = async (count: number) => {
    const now = Date.now();
    const existingCodes = new Set(
      productsRef.current.map((p) => (p.code || '').trim().toLowerCase())
    );
    let seq = productsRef.current.length + 1;
    const defaultCat = categoryNames[0] || 'متنوعة';

    const newRows: Product[] = Array.from({ length: count }).map((_, idx) => {
      let code = '';
      while (true) {
        const candidate = `PRD-${String(seq).padStart(3, '0')}`;
        seq++;
        if (!existingCodes.has(candidate.toLowerCase())) {
          code = candidate;
          existingCodes.add(candidate.toLowerCase());
          break;
        }
      }
      return {
        id: `prod_sheet_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        code,
        name: '',
        category: categoryFilter !== 'ALL' ? categoryFilter : defaultCat,
        group: '',
        model: '',
        specification: '',
        wholesale_price: 0,
        selling_price: 0,
        included_in_catalog: false,
        available_models: [],
        source_file: 'جدول إكسيل الداخلي',
        created_at: now + idx,
        updated_at: now + idx,
      };
    });

    const nextList = [...newRows, ...productsRef.current];
    productsRef.current = nextList;
    onProductsUpdated(nextList);
    await saveProductsBatch(newRows);
    setSaveStatusText(`تمت إضافة ${count === 1 ? 'صف جديد' : `${count} صفوف جديدة`}`);

    setTimeout(() => {
      const firstNew = newRows[0];
      const nameInput = cellRefs.current.get(`${firstNew.id}:name`);
      nameInput?.focus();
    }, 50);
  };

  // Duplicate selected rows
  const handleDuplicateSelected = async () => {
    if (selectedIds.size === 0) {
      toast.warning('حدد صفاً واحداً على الأقل للتكرار.');
      return;
    }
    const now = Date.now();
    const copies: Product[] = [];
    productsRef.current.forEach((p, idx) => {
      if (selectedIds.has(p.id)) {
        copies.push({
          ...p,
          id: `prod_copy_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          code: p.code ? `${p.code}-2` : `COPY-${idx + 1}`,
          name: p.name ? `${p.name} (نسخة)` : '',
          created_at: now + idx,
          updated_at: now + idx,
        });
      }
    });

    const nextList = [...copies, ...productsRef.current];
    productsRef.current = nextList;
    onProductsUpdated(nextList);
    await saveProductsBatch(copies);
    toast.success(`تم تكرار ${copies.length} صف بنجاح.`);
  };

  // Delete single row
  const handleDeleteRow = async (product: Product) => {
    const ok = await confirm({
      title: 'حذف الصف من الجدول',
      message: `هل تريد حذف "${product.name || product.code || 'هذا الصف'}" نهائياً؟`,
      confirmLabel: 'حذف الصف',
      danger: true,
    });
    if (!ok) return;

    await deleteProduct(product.id);
    const nextList = productsRef.current.filter((p) => p.id !== product.id);
    productsRef.current = nextList;
    onProductsUpdated(nextList);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(product.id);
      return next;
    });
    toast.success('تم حذف الصف.');
  };

  // Delete multiple selected rows
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const ok = await confirm({
      title: 'حذف الصفوف المحددة',
      message: `هل أنت متأكد من حذف ${count} صف محدد من قائمة المنتجات؟ سيتم حفظ نسخة احتياطية تلقائية قبل الحذف.`,
      confirmLabel: `حذف ${count} صف`,
      danger: true,
    });
    if (!ok) return;

    await createAutoBackupSnapshot(`قبل حذف ${count} صف من شيت الإكسيل`);
    for (const id of selectedIds) {
      await deleteProduct(id);
    }

    const nextList = productsRef.current.filter((p) => !selectedIds.has(p.id));
    productsRef.current = nextList;
    onProductsUpdated(nextList);
    setSelectedIds(new Set());
    toast.success(`تم حذف ${count} صف بنجاح.`);
  };

  // Calculate Selling Price using any of the 5 Stage-2 pricing methods
  const calculateQuickSellingPrice = (wholesale: number): number => {
    if (wholesale <= 0) return 0;
    let price = wholesale;

    if (quickPricingMethod === 'standard_map') {
      if (wholesale > 4000) {
        price = wholesale * (1 + quickFallbackPercent / 100);
      } else {
        const matched = quickStandardMap.find((t) =>
          t.from === 0 ? wholesale >= 0 && wholesale <= t.to : wholesale > t.from && wholesale <= t.to
        );
        price = matched
          ? wholesale + matched.increase
          : wholesale * (1 + quickFallbackPercent / 100);
      }
    } else if (quickPricingMethod === 'percent_markup') {
      const pct = Math.max(0, Number(quickMarkupPercent) || 0);
      price = wholesale * (1 + pct / 100);
    } else if (quickPricingMethod === 'fixed_add') {
      const addAmt = Math.max(0, Number(quickFixedAdd) || 0);
      price = wholesale + addAmt;
    } else if (quickPricingMethod === 'profit_margin') {
      const marginPct = Number(quickProfitMargin) || 0;
      const fraction = Math.min(0.95, Math.max(0.01, marginPct / 100));
      price = wholesale / (1 - fraction);
    } else if (quickPricingMethod === 'tiers') {
      const matchedTier = quickTiers.find((t) => wholesale >= t.from && wholesale <= t.to);
      if (matchedTier) {
        price =
          matchedTier.increase_type === 'percent'
            ? wholesale * (1 + matchedTier.value / 100)
            : wholesale + matchedTier.value;
      } else {
        price = wholesale * 1.2;
      }
    }

    if (quickRounding === 0) {
      price = quickAllowFractions ? Math.round(price * 100) / 100 : Math.round(price);
    } else if (quickRounding === 1) {
      price = Math.round(price);
    } else {
      price = Math.round(price / quickRounding) * quickRounding;
    }

    return Math.max(wholesale, price);
  };

  // Determine target rows for quick pricing
  const quickTargetProducts = useMemo(() => {
    const base =
      selectedIds.size > 0
        ? filteredProducts.filter((p) => selectedIds.has(p.id))
        : filteredProducts;
    return base.filter((p) => {
      if ((p.wholesale_price || 0) <= 0) return false;
      if (selectedIds.size > 0) return true;
      return quickOverrideExisting || (p.selling_price || 0) <= 0;
    });
  }, [filteredProducts, selectedIds, quickOverrideExisting]);

  const quickPreviewSamples = useMemo(() => {
    return quickTargetProducts.slice(0, 3).map((p) => {
      const wholesale = p.wholesale_price || 0;
      const newSelling = calculateQuickSellingPrice(wholesale);
      const profit = Math.round((newSelling - wholesale) * 100) / 100;
      return {
        id: p.id,
        name: p.name || p.code || 'صنف بدون اسم',
        wholesale,
        newSelling,
        profit,
      };
    });
  }, [
    quickTargetProducts,
    quickPricingMethod,
    quickMarkupPercent,
    quickFixedAdd,
    quickProfitMargin,
    quickTiers,
    quickStandardMap,
    quickFallbackPercent,
    quickRounding,
    quickAllowFractions,
  ]);

  const canUndoQuickPricing = useMemo(
    () => products.some((p) => p.previous_selling_price_snapshot !== undefined),
    [products]
  );

  const handleUndoQuickPricing = async () => {
    const toRestore: Product[] = [];
    const nextList = productsRef.current.map((p) => {
      if (p.previous_selling_price_snapshot !== undefined) {
        const prevSell = p.previous_selling_price_snapshot;
        const { previous_selling_price_snapshot: _drop, ...rest } = p;
        const restored: Product = {
          ...rest,
          selling_price: prevSell,
          included_in_catalog: Boolean(p.name?.trim() && prevSell > 0),
          updated_at: Date.now(),
        };
        toRestore.push(restored);
        return restored;
      }
      return p;
    });
    if (toRestore.length === 0) return;
    productsRef.current = nextList;
    onProductsUpdated(nextList);
    await saveProductsBatch(toRestore);
    toast.success(`تم التراجع واسترجاع الأسعار السابقة لعدد ${toRestore.length} صنف.`);
  };

  // Apply quick selling pricing using selected Stage-2 method
  const handleApplyQuickMarkup = async () => {
    if (quickPricingMethod === 'percent_markup') {
      const pct = Number(quickMarkupPercent);
      if (!Number.isFinite(pct) || pct <= 0) {
        toast.warning('أدخل نسبة زيادة صحيحة أكبر من الصفر.');
        return;
      }
    } else if (quickPricingMethod === 'fixed_add') {
      const amt = Number(quickFixedAdd);
      if (!Number.isFinite(amt) || amt <= 0) {
        toast.warning('أدخل مبلغ زيادة ثابتاً أكبر من الصفر.');
        return;
      }
    } else if (quickPricingMethod === 'profit_margin') {
      const margin = Number(quickProfitMargin);
      if (!Number.isFinite(margin) || margin <= 0 || margin >= 95) {
        toast.warning('أدخل نسبة هامش ربح بين 1% و 94%.');
        return;
      }
    }

    if (quickTargetProducts.length === 0) {
      toast.info(
        selectedIds.size > 0
          ? 'الصفوف المحددة لا تحتوي على أسعار جملة صالحة.'
          : 'لا توجد صفوف بسعر جملة وبدون سعر بيع (يمكنك تحديد صفوف أو تفعيل استبدال المسعر من التفاصيل).'
      );
      return;
    }

    const targetIdSet = new Set(quickTargetProducts.map((p) => p.id));
    const modified: Product[] = [];
    const now = Date.now();

    const nextList = productsRef.current.map((p) => {
      if (!targetIdSet.has(p.id) || (p.wholesale_price || 0) <= 0) return p;
      const calculatedSelling = calculateQuickSellingPrice(p.wholesale_price);
      const updated: Product = {
        ...p,
        previous_selling_price_snapshot: p.selling_price || 0,
        selling_price: calculatedSelling,
        included_in_catalog: p.name.trim() ? true : p.included_in_catalog,
        updated_at: now,
      };
      modified.push(updated);
      return updated;
    });

    if (modified.length === 0) {
      toast.warning('لا توجد صفوف بسعر جملة أكبر من 0 لتطبيق التسعير عليها.');
      return;
    }

    productsRef.current = nextList;
    onProductsUpdated(nextList);
    await saveProductsBatch(modified);

    // Sync pricing rule, fractions & standard map back to shared settings
    const nextSettings: CatalogSettings = {
      ...settings,
      allow_price_fractions: quickAllowFractions,
      global_pricing_rule: {
        ...(settings.global_pricing_rule || {
          method: quickPricingMethod,
          value: Number(quickMarkupPercent) || 20,
          rounding: quickRounding,
        }),
        method: quickPricingMethod,
        rounding: quickRounding,
      },
      current_standard_map: quickStandardMap,
      standard_map_fallback_percent: quickFallbackPercent,
    };
    await saveSettings(nextSettings);
    onSettingsUpdated?.(nextSettings);

    const methodLabels: Record<PricingMethodType, string> = {
      standard_map: 'الخريطة المعيارية',
      percent_markup: `نسبة +${quickMarkupPercent}%`,
      fixed_add: `زيادة ثابتة +${quickFixedAdd} ج.م`,
      profit_margin: `هامش ربح ${quickProfitMargin}%`,
      tiers: 'الشرايح المخصصة',
    };
    toast.success(`تم تسعير ${modified.length} صنف بطريقة (${methodLabels[quickPricingMethod]}) بنجاح.`);
    setSaveStatusText(`تسعير ${modified.length} صنف (${methodLabels[quickPricingMethod]})`);
  };

  // Export internal Excel files
  const handleExportAllExcel = () => {
    if (productsRef.current.length === 0) {
      toast.warning('الجدول فارغ حالياً ولا توجد منتجات للتصدير.');
      return;
    }
    const dateTag = new Date().toISOString().slice(0, 10);
    exportProductsToExcel(productsRef.current, `شيت_المنتجات_الكامل_${dateTag}.xlsx`);
    toast.success(`تم تصدير ${productsRef.current.length} منتج إلى ملف Excel داخلي بنجاح.`);
  };

  const handleExportFilteredOrSelected = () => {
    const rowsToExport =
      selectedIds.size > 0
        ? filteredProducts.filter((p) => selectedIds.has(p.id))
        : filteredProducts;

    if (rowsToExport.length === 0) {
      toast.warning('لا توجد صفوف محددة أو مطابقة للتصفية لتصديرها.');
      return;
    }

    const dateTag = new Date().toISOString().slice(0, 10);
    const label = selectedIds.size > 0 ? 'المحدد' : 'المفلتر';
    exportProductsToExcel(rowsToExport, `شيت_المنتجات_${label}_${dateTag}.xlsx`);
    toast.success(`تم تصدير ${rowsToExport.length} صف (${label}) إلى Excel بنجاح.`);
  };

  // Process one or more Excel / CSV / TSV files sequentially
  const processExcelFiles = async (files: File[]) => {
    if (files.length === 0) return;
    try {
      setIsImporting(true);
      let workingList = [...productsRef.current];
      const allNew: Product[] = [];
      const allUpdatedMap = new Map<string, Product>();
      let totalSkipped = 0;

      for (const file of files) {
        try {
          const result = await parseExcelSheetToProducts(file, workingList, categoryNames);
          const { updatedProducts, newProducts, skippedRows } = result;
          totalSkipped += skippedRows;

          if (updatedProducts.length > 0 || newProducts.length > 0) {
            const batchUpdatedMap = new Map(updatedProducts.map((p) => [p.id, p]));
            workingList = [
              ...newProducts,
              ...workingList.map((p) => batchUpdatedMap.get(p.id) || p),
            ];
            for (const np of newProducts) allNew.push(np);
            for (const up of updatedProducts) allUpdatedMap.set(up.id, up);
          }
        } catch (err: any) {
          toast.error(`تعذر قراءة "${file.name}": ${err?.message || 'ملف إكسيل غير صالح'}`);
        }
      }

      const combinedUpdated = Array.from(allUpdatedMap.values());
      const sourceLabel =
        files.length === 1 ? `ملف "${files[0].name}"` : `${files.length} ملفات إكسيل`;
      await applyImportResult(
        {
          newProducts: allNew,
          updatedProducts: combinedUpdated,
          skippedRows: totalSkipped,
        },
        sourceLabel
      );
    } finally {
      setIsImporting(false);
    }
  };

  // Import Excel / CSV file(s) into sheet
  const handleImportExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;
    await processExcelFiles(files);
  };

  // Intercept multi-row / multi-column paste anywhere on the spreadsheet table
  const handleTableMultiRowPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData?.getData('text/plain') || '';
    if (text.includes('\t') || text.includes('\n')) {
      e.preventDefault();
      setPasteText(text);
      setShowPasteModal(true);
      toast.info('تم التقاط بيانات منسوخة من الإكسيل — راجعها واضغط "إدراج البيانات في الجدول".');
    }
  };

  // Handle Drag & Drop Excel file(s)
  const handleDropExcelFile = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles: File[] = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    if (droppedFiles.length === 0) return;
    const validFiles = droppedFiles.filter((file) => {
      const lower = file.name.toLowerCase();
      return (
        lower.endsWith('.xlsx') ||
        lower.endsWith('.xls') ||
        lower.endsWith('.csv') ||
        lower.endsWith('.tsv')
      );
    });
    if (validFiles.length === 0) {
      toast.warning('يرجى سحب ملفات إكسيل بصيغة .xlsx أو .xls أو .csv أو .tsv فقط.');
      return;
    }
    await processExcelFiles(validFiles);
  };

  // Apply pasted spreadsheet text
  const handleApplyPastedText = async () => {
    try {
      const result = parsePastedSpreadsheetText(pasteText, productsRef.current, categoryNames);
      await applyImportResult(result, 'اللصق المباشر');
      setPasteText('');
      setShowPasteModal(false);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحليل البيانات الملصقة.');
    }
  };

  // Merge imported/pasted products into DB & state
  const applyImportResult = async (
    result: { updatedProducts: Product[]; newProducts: Product[]; skippedRows: number },
    sourceLabel: string
  ) => {
    const { updatedProducts, newProducts, skippedRows } = result;
    if (updatedProducts.length === 0 && newProducts.length === 0) {
      toast.warning('لم يتم العثور على صفوف صالحة للاستيراد.');
      return;
    }

    const updatedMap = new Map(updatedProducts.map((p) => [p.id, p]));
    const newIdSet = new Set(newProducts.map((p) => p.id));
    const mergedExisting = productsRef.current
      .filter((p) => !newIdSet.has(p.id))
      .map((p) => updatedMap.get(p.id) || p);
    const finalList = [...newProducts, ...mergedExisting];

    productsRef.current = finalList;
    onProductsUpdated(finalList);
    await saveProductsBatch([...newProducts, ...updatedProducts]);

    // Clear active filters so the full imported table is immediately visible
    setSearchQuery('');
    setCategoryFilter('ALL');
    setOnlyMissingPriceOrName(false);
    setSelectedIds(new Set());

    toast.success(
      `تم الاستيراد من ${sourceLabel}: إضافة ${newProducts.length} صنف جديد، وتحديث ${updatedProducts.length} صنف${
        skippedRows > 0 ? ` (تخطي ${skippedRows} صف فارغ)` : ''
      }.`
    );
    setSaveStatusText(`استيراد مكتمل (+${newProducts.length} / تحديث ${updatedProducts.length})`);
  };

  // Upload or edit photo for specific row
  const handleTriggerRowImageUpload = (productId: string) => {
    pendingImageRowIdRef.current = productId;
    rowImageInputRef.current?.click();
  };

  const handleOpenRowImageCell = (product: Product) => {
    if (product.image_url) {
      setImageStudioTarget({
        product,
        initialRawUrl: product.original_image_url || product.image_url,
      });
    } else {
      handleTriggerRowImageUpload(product.id);
    }
  };

  const handleRemoveRowImage = async (product: Product) => {
    const updated: Product = {
      ...product,
      image_url: undefined,
      original_image_url: undefined,
      raw_bounding_box: undefined,
      box_2d: undefined,
      needs_crop_adjustment: false,
      updated_at: Date.now(),
    };
    const nextList = productsRef.current.map((p) => (p.id === product.id ? updated : p));
    productsRef.current = nextList;
    onProductsUpdated(nextList);
    await saveProduct(updated);
    toast.success('تمت إزالة صورة الصنف.');
  };

  const handleRowImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const targetId = pendingImageRowIdRef.current;
    pendingImageRowIdRef.current = null;
    if (!file || !targetId) return;

    try {
      const [hiResRaw, compressed] = await Promise.all([
        readFileAsWorkingDataUrl(file, 1200),
        compressUploadedImage(file, 480),
      ]);
      const currentList = productsRef.current;
      const target = currentList.find((p) => p.id === targetId);
      if (!target) return;

      const updated: Product = {
        ...target,
        image_url: compressed,
        original_image_url: hiResRaw,
        needs_crop_adjustment: false,
        updated_at: Date.now(),
      };
      const nextList = currentList.map((p) => (p.id === targetId ? updated : p));
      productsRef.current = nextList;
      onProductsUpdated(nextList);
      await saveProduct(updated);

      // Open pro studio right after upload so user can crop, rotate, erase, or adjust immediately
      setImageStudioTarget({
        product: updated,
        initialRawUrl: hiResRaw,
      });
    } catch (err: any) {
      toast.error(err?.message || 'فشل تحميل الصورة.');
    }
  };

  const allVisibleSelected =
    filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.has(p.id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const p of filteredProducts) next.delete(p.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const p of filteredProducts) next.add(p.id);
        return next;
      });
    }
  };

  const toggleRowSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDropExcelFile}
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-colors ${
        isDragOver ? 'border-[#107C41] ring-2 ring-[#107C41]/30' : 'border-emerald-200/80'
      }`}
    >
      {/* Hidden inputs */}
      <input
        ref={excelFileInputRef}
        type="file"
        multiple
        accept=".xlsx,.xls,.csv,.tsv"
        onChange={handleImportExcelFile}
        className="hidden"
      />
      <input
        ref={rowImageInputRef}
        type="file"
        accept="image/*"
        onChange={handleRowImageSelected}
        className="hidden"
      />

      {/* Classic Excel Green Ribbon Header */}
      <div className="bg-[#107C41] text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
            <FileSpreadsheet size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold leading-tight">
              شريط إكسيل التفاعلي والتصدير الداخلي
            </h3>
            <p className="text-[11px] text-emerald-100">
              إدخال وتعديل سريع مثل Excel • لصق مباشر • استيراد وتصدير داخلي .xlsx
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] bg-black/20 px-2.5 py-1 rounded-md text-emerald-50">
            <Check size={12} />
            {saveStatusText}
          </span>
          <button
            type="button"
            onClick={onNavigateToPricing}
            className="flex items-center gap-1 px-3 py-1.5 bg-white text-[#107C41] hover:bg-emerald-50 font-bold rounded-lg text-xs transition-colors cursor-pointer shadow-xs"
          >
            <span>معاينة الكتالوج والتسعير</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Excel Ribbon Toolbar Strips (Single Sleek Horizontal Row) */}
      <div className="bg-[#f3f6f4] border-b border-slate-200 px-2.5 py-2 flex flex-nowrap items-stretch gap-1.5 overflow-x-auto no-scrollbar">
        {/* Group 1: Rows */}
        <div className="shrink-0 flex flex-col justify-between bg-white border border-slate-200 rounded-xl px-2 py-1.5 gap-1">
          <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap">
            <button
              type="button"
              onClick={() => handleAddBlankRows(1)}
              className="flex items-center gap-1 px-2 py-1 bg-[#107C41] hover:bg-[#0c6333] text-white font-bold rounded-lg text-[11px] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus size={13} />
              صف جديد
            </button>
            <button
              type="button"
              onClick={() => handleAddBlankRows(5)}
              className="flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold rounded-lg text-[11px] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus size={12} />
              5 صفوف
            </button>
            <button
              type="button"
              onClick={handleDuplicateSelected}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold rounded-lg text-[11px] transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
              title="تكرار الصفوف المحددة"
            >
              <CopyPlus size={12} />
              تكرار
            </button>
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1 px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold rounded-lg text-[11px] transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
              title="حذف الصفوف المحددة"
            >
              <Trash2 size={12} />
              حذف ({selectedIds.size})
            </button>
          </div>
          <span className="text-[10px] text-slate-400 text-center font-semibold">الصفوف والتحرير</span>
        </div>

        {/* Group 2: Import / Paste */}
        <div className="shrink-0 flex flex-col justify-between bg-white border border-slate-200 rounded-xl px-2 py-1.5 gap-1">
          <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap">
            <button
              type="button"
              onClick={() => excelFileInputRef.current?.click()}
              disabled={isImporting}
              className="flex items-center gap-1 px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg text-[11px] transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
              title="استيراد ملفات Excel أو CSV"
            >
              {isImporting ? <RefreshCw size={12} className="animate-spin" /> : <Upload size={12} />}
              {isImporting ? 'استيراد...' : 'استيراد Excel'}
            </button>
            <button
              type="button"
              onClick={() => setShowPasteModal((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 border font-bold rounded-lg text-[11px] transition-colors cursor-pointer whitespace-nowrap ${
                showPasteModal
                  ? 'bg-amber-100 border-amber-300 text-amber-900'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
              }`}
              title="لصق صفوف منسوخة من Excel"
            >
              <ClipboardPaste size={12} />
              لصق
            </button>
            <button
              type="button"
              onClick={() => downloadExcelTemplate('قالب_إكسيل_المنتجات.xlsx', categories)}
              className="flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold rounded-lg text-[11px] transition-colors cursor-pointer whitespace-nowrap"
              title="تحميل نموذج إكسيل فارغ جاهز للتعبئة"
            >
              <FileDown size={12} />
              قالب
            </button>
          </div>
          <span className="text-[10px] text-slate-400 text-center font-semibold">استيراد ولصق</span>
        </div>

        {/* Group 3: Internal Excel Export */}
        <div className="shrink-0 flex flex-col justify-between bg-white border border-emerald-200 rounded-xl px-2 py-1.5 gap-1">
          <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap">
            <button
              type="button"
              onClick={handleExportAllExcel}
              className="flex items-center gap-1 px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-[11px] transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
              title="تصدير جميع المنتجات إلى ملف .xlsx"
            >
              <Download size={12} />
              تصدير الكل
            </button>
            <button
              type="button"
              onClick={handleExportFilteredOrSelected}
              className="flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold rounded-lg text-[11px] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download size={12} />
              {selectedIds.size > 0
                ? `المحدد (${selectedIds.size})`
                : 'المعروض'}
            </button>
          </div>
          <span className="text-[10px] text-emerald-700 text-center font-bold">تصدير داخلي Excel</span>
        </div>

        {/* Group 4: Compact Quick Selling Pricing (All 5 Stage-2 Methods + Details Drawer) */}
        <div className="shrink-0 flex flex-col justify-between bg-white border border-indigo-200/80 rounded-xl px-2 py-1.5 gap-1">
          <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap">
            {/* Compact Dropdown Menu of all 5 Stage-2 methods */}
            <select
              value={quickPricingMethod}
              onChange={(e) => setQuickPricingMethod(e.target.value as PricingMethodType)}
              className="h-[28px] max-w-[148px] px-1.5 text-[11px] font-bold bg-slate-50 border border-slate-300 rounded-lg text-slate-800 outline-none focus:border-indigo-500 cursor-pointer"
              title="اختر طريقة تسعير البيع"
            >
              <option value="standard_map">الخريطة المعيارية</option>
              <option value="percent_markup">(أ) نسبة الجملة (+%)</option>
              <option value="fixed_add">(ب) مبلغ ثابت (+ج.م)</option>
              <option value="profit_margin">(ج) هامش البيع (%)</option>
              <option value="tiers">(د) شرايح مخصصة</option>
            </select>

            {/* Quick Inline Input / Summary based on active method */}
            {quickPricingMethod === 'percent_markup' && (
              <div className="flex items-center border border-slate-300 rounded-lg bg-slate-50 overflow-hidden h-[28px]">
                <span className="px-1.5 text-[10px] font-bold text-slate-600 border-l border-slate-200 bg-slate-100 h-full flex items-center">
                  +%
                </span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  step="any"
                  value={quickMarkupPercent}
                  onChange={(e) => setQuickMarkupPercent(e.target.value)}
                  dir="ltr"
                  className="w-11 text-center text-[11px] font-mono font-bold bg-white outline-none h-full"
                />
              </div>
            )}

            {quickPricingMethod === 'fixed_add' && (
              <div className="flex items-center border border-slate-300 rounded-lg bg-slate-50 overflow-hidden h-[28px]">
                <span className="px-1.5 text-[10px] font-bold text-slate-600 border-l border-slate-200 bg-slate-100 h-full flex items-center">
                  +ج
                </span>
                <input
                  type="number"
                  min={1}
                  step="any"
                  value={quickFixedAdd}
                  onChange={(e) => setQuickFixedAdd(e.target.value)}
                  dir="ltr"
                  className="w-12 text-center text-[11px] font-mono font-bold bg-white outline-none h-full"
                />
              </div>
            )}

            {quickPricingMethod === 'profit_margin' && (
              <div className="flex items-center border border-slate-300 rounded-lg bg-slate-50 overflow-hidden h-[28px]">
                <span className="px-1.5 text-[10px] font-bold text-slate-600 border-l border-slate-200 bg-slate-100 h-full flex items-center">
                  %
                </span>
                <input
                  type="number"
                  min={1}
                  max={90}
                  step="any"
                  value={quickProfitMargin}
                  onChange={(e) => setQuickProfitMargin(e.target.value)}
                  dir="ltr"
                  className="w-11 text-center text-[11px] font-mono font-bold bg-white outline-none h-full"
                />
              </div>
            )}

            {quickPricingMethod === 'standard_map' && (
              <span className="h-[28px] px-1.5 inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold whitespace-nowrap">
                <Sparkles size={11} />
                {quickStandardMap.length} شريحة
              </span>
            )}

            {quickPricingMethod === 'tiers' && (
              <span className="h-[28px] px-1.5 inline-flex items-center gap-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-[10px] font-bold whitespace-nowrap">
                <Layers size={11} />
                {quickTiers.length} شرائح
              </span>
            )}

            {/* Compact Details Drawer Toggle */}
            <button
              type="button"
              onClick={() => setShowQuickPricingDetails((v) => !v)}
              className={`h-[28px] flex items-center gap-1 px-2 border font-bold rounded-lg text-[11px] transition-colors cursor-pointer whitespace-nowrap ${
                showQuickPricingDetails
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-700'
              }`}
              title="فتح تفاصيل طريقة التسعير، الشرائح، التقريب، والمعاينة"
            >
              <SlidersHorizontal size={11} />
              <span>تفاصيل</span>
              {showQuickPricingDetails ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>

            {/* Apply Quick Pricing Button */}
            <button
              type="button"
              onClick={handleApplyQuickMarkup}
              className="h-[28px] flex items-center gap-1 px-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-[11px] transition-colors cursor-pointer whitespace-nowrap"
              title="تطبيق طريقة تسعير البيع على الجملة للمحدد أو للأصناف بدون سعر بيع"
            >
              <Calculator size={12} />
              <span>تطبيق ({quickTargetProducts.length})</span>
            </button>

            {/* Undo Last Quick Pricing */}
            {canUndoQuickPricing && (
              <button
                type="button"
                onClick={handleUndoQuickPricing}
                className="h-[28px] flex items-center gap-1 px-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold rounded-lg text-[11px] transition-colors cursor-pointer whitespace-nowrap"
                title="تراجع عن آخر تسعير سريع"
              >
                <RotateCcw size={11} />
                <span>تراجع</span>
              </button>
            )}
          </div>
          <span className="text-[10px] text-slate-400 text-center font-semibold">
            زيادة سريعة على الجملة (طرق التسعير مختصرة)
          </span>
        </div>
      </div>

      {/* Collapsible Compact Pricing Method Details Panel */}
      {showQuickPricingDetails && (
        <div className="bg-slate-50 border-b border-slate-200 p-3.5 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <SlidersHorizontal size={14} className="text-indigo-600" />
                تفاصيل طريقة التسعير المختارة:
              </span>
              {[
                { id: 'standard_map', label: 'الخريطة المعيارية', icon: Sparkles },
                { id: 'percent_markup', label: '(أ) نسبة %', icon: Percent },
                { id: 'fixed_add', label: '(ب) مبلغ ثابت', icon: SlidersHorizontal },
                { id: 'profit_margin', label: '(ج) هامش البيع', icon: TrendingUp },
                { id: 'tiers', label: '(د) شرايح مخصصة', icon: Layers },
              ].map((m) => {
                const Icon = m.icon;
                const active = quickPricingMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setQuickPricingMethod(m.id as PricingMethodType)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon size={12} />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onNavigateToPricing}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-sky-200 text-sky-700 hover:bg-sky-50 text-[11px] font-bold cursor-pointer whitespace-nowrap"
              >
                <span>فتح جدول المرحلة 2 الكامل</span>
                <ChevronRight size={13} />
              </button>
              <button
                type="button"
                onClick={() => setShowQuickPricingDetails(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                title="إغلاق التفاصيل"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
            {/* Method Specific Details (Left 7 cols) */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-3 space-y-2.5">
              {quickPricingMethod === 'standard_map' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 text-xs">
                      شرائح الخريطة المعيارية (تُطبق الزيادة الثابتة تلقائياً حسب سعر الجملة):
                    </span>
                    <div className="flex items-center gap-1.5">
                      {settings.saved_standard_maps && settings.saved_standard_maps.length > 0 && (
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const tpl = settings.saved_standard_maps?.find((t) => t.id === e.target.value);
                            if (tpl) {
                              setQuickStandardMap([...tpl.tiers]);
                              setQuickFallbackPercent(tpl.fallback_percent || 10);
                            }
                          }}
                          className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold"
                        >
                          <option value="" disabled>خريطة محفوظة...</option>
                          {settings.saved_standard_maps.map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setQuickStandardMap(DEFAULT_STANDARD_MAP);
                          setQuickFallbackPercent(10);
                        }}
                        className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-bold text-slate-700 cursor-pointer"
                      >
                        الافتراضية
                      </button>
                    </div>
                  </div>
                  <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-right text-[11px]">
                      <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                        <tr>
                          <th className="p-1.5">من</th>
                          <th className="p-1.5">إلى</th>
                          <th className="p-1.5">الزيادة (+ ج.م)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {quickStandardMap.map((tier) => (
                          <tr key={tier.id}>
                            <td className="p-1">
                              <input
                                type="number"
                                value={tier.from}
                                onChange={(e) => {
                                  const v = Number(e.target.value) || 0;
                                  setQuickStandardMap((prev) =>
                                    prev.map((t) => (t.id === tier.id ? { ...t, from: v } : t))
                                  );
                                }}
                                className="w-16 p-1 border border-slate-200 rounded text-center font-mono font-bold"
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="number"
                                value={tier.to}
                                onChange={(e) => {
                                  const v = Number(e.target.value) || 0;
                                  setQuickStandardMap((prev) =>
                                    prev.map((t) => (t.id === tier.id ? { ...t, to: v } : t))
                                  );
                                }}
                                className="w-16 p-1 border border-slate-200 rounded text-center font-mono font-bold"
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="number"
                                value={tier.increase}
                                onChange={(e) => {
                                  const v = Number(e.target.value) || 0;
                                  setQuickStandardMap((prev) =>
                                    prev.map((t) => (t.id === tier.id ? { ...t, increase: v } : t))
                                  );
                                }}
                                className="w-16 p-1 border border-slate-200 rounded text-center font-mono font-bold text-emerald-700"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-600">
                    <span className="font-bold">فوق 4000 ج.م:</span>
                    <span>نسبة</span>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={quickFallbackPercent}
                      onChange={(e) => setQuickFallbackPercent(Number(e.target.value) || 10)}
                      className="w-14 p-1 border border-slate-200 rounded text-center font-mono font-bold"
                    />
                    <span>%</span>
                  </div>
                </div>
              )}

              {quickPricingMethod === 'percent_markup' && (
                <div className="space-y-2">
                  <div className="font-bold text-slate-800">(أ) نسبة مئوية مضافة على سعر الجملة</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {['10', '15', '20', '25', '35', '50'].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setQuickMarkupPercent(pct)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                          quickMarkupPercent === pct
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        +{pct}%
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    المعادلة: <strong>سعر البيع = الجملة × (1 + {quickMarkupPercent || 0}%)</strong>
                  </p>
                </div>
              )}

              {quickPricingMethod === 'fixed_add' && (
                <div className="space-y-2">
                  <div className="font-bold text-slate-800">(ب) مبلغ ثابت بالجنيه يُضاف فوق الجملة</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {['10', '15', '20', '30', '50', '100'].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setQuickFixedAdd(amt)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                          quickFixedAdd === amt
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        +{amt} ج.م
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    المعادلة: <strong>سعر البيع = الجملة + {quickFixedAdd || 0} ج.م</strong>
                  </p>
                </div>
              )}

              {quickPricingMethod === 'profit_margin' && (
                <div className="space-y-2">
                  <div className="font-bold text-slate-800">(ج) هامش ربح محسوب من سعر البيع النهائي</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {['15', '20', '25', '30', '35'].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setQuickProfitMargin(pct)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                          quickProfitMargin === pct
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        هامش {pct}%
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    المعادلة: <strong>سعر البيع = الجملة ÷ (1 − {quickProfitMargin || 0}%)</strong>
                  </p>
                </div>
              )}

              {quickPricingMethod === 'tiers' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">(د) شرايح مخصصة حسب فئة سعر الجملة</span>
                    <button
                      type="button"
                      onClick={() => {
                        const last = quickTiers[quickTiers.length - 1];
                        const nextFrom = last ? last.to + 1 : 1;
                        setQuickTiers((prev) => [
                          ...prev,
                          {
                            id: `qt_${Date.now()}`,
                            from: nextFrom,
                            to: nextFrom + 100,
                            increase_type: 'fixed',
                            value: 20,
                          },
                        ]);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-[10px] font-bold cursor-pointer"
                    >
                      <Plus size={11} />
                      شريحة
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {quickTiers.map((tier) => (
                      <div key={tier.id} className="flex flex-wrap items-center gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-200 text-[11px]">
                        <span className="text-slate-500">من</span>
                        <input
                          type="number"
                          value={tier.from}
                          onChange={(e) => {
                            const v = Number(e.target.value) || 0;
                            setQuickTiers((prev) => prev.map((t) => (t.id === tier.id ? { ...t, from: v } : t)));
                          }}
                          className="w-14 p-1 bg-white border border-slate-200 rounded text-center font-mono font-bold"
                        />
                        <span className="text-slate-500">إلى</span>
                        <input
                          type="number"
                          value={tier.to}
                          onChange={(e) => {
                            const v = Number(e.target.value) || 0;
                            setQuickTiers((prev) => prev.map((t) => (t.id === tier.id ? { ...t, to: v } : t)));
                          }}
                          className="w-14 p-1 bg-white border border-slate-200 rounded text-center font-mono font-bold"
                        />
                        <select
                          value={tier.increase_type}
                          onChange={(e) => {
                            const v = e.target.value as 'fixed' | 'percent';
                            setQuickTiers((prev) => prev.map((t) => (t.id === tier.id ? { ...t, increase_type: v } : t)));
                          }}
                          className="p-1 bg-white border border-slate-200 rounded text-[11px] font-bold"
                        >
                          <option value="fixed">+ ج.م</option>
                          <option value="percent">+ %</option>
                        </select>
                        <input
                          type="number"
                          value={tier.value}
                          onChange={(e) => {
                            const v = Number(e.target.value) || 0;
                            setQuickTiers((prev) => prev.map((t) => (t.id === tier.id ? { ...t, value: v } : t)));
                          }}
                          className="w-14 p-1 bg-white border border-slate-200 rounded text-center font-mono font-bold text-emerald-700"
                        />
                        {quickTiers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setQuickTiers((prev) => prev.filter((t) => t.id !== tier.id))}
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Rounding, Scope & Compact Preview (Right 5 cols) */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-3 space-y-2.5">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-bold text-slate-800 text-[11px]">الكسور والتقريب:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextAllow = !quickAllowFractions;
                      setQuickAllowFractions(nextAllow);
                      if (nextAllow && quickRounding > 1) setQuickRounding(0);
                      if (!nextAllow && quickRounding === 0) setQuickRounding(5);
                    }}
                    className={`px-2 py-0.5 rounded border text-[10px] font-bold cursor-pointer ${
                      quickAllowFractions
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-100 border-slate-300 text-slate-600'
                    }`}
                  >
                    {quickAllowFractions ? 'الكسور: مقبولة ✓' : 'الكسور: مقربة'}
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                  {[
                    { label: 'بدون تقريب', val: 0 },
                    { label: 'أقرب 1 ج', val: 1 },
                    { label: 'أقرب 5 ج', val: 5 },
                    { label: 'أقرب 10 ج', val: 10 },
                  ].map((r) => (
                    <button
                      key={r.val}
                      type="button"
                      onClick={() => {
                        setQuickRounding(r.val as 0 | 1 | 5 | 10);
                        if (r.val === 0 || r.val === 1) setQuickAllowFractions(true);
                      }}
                      className={`py-1 px-1.5 rounded border text-[10px] font-bold cursor-pointer ${
                        quickRounding === r.val
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {selectedIds.size === 0 && (
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quickOverrideExisting}
                    onChange={(e) => setQuickOverrideExisting(e.target.checked)}
                    className="rounded text-indigo-600 cursor-pointer"
                  />
                  <span>إعادة تسعير المعروض كله (حتى لو مسعر مسبقاً)</span>
                </label>
              )}

              {/* Compact 3-Row Sample Preview */}
              <div className="border-t border-slate-100 pt-2 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                  <span className="flex items-center gap-1">
                    <Eye size={12} className="text-sky-600" />
                    معاينة مختصرة ({quickTargetProducts.length} صنف):
                  </span>
                </div>
                {quickPreviewSamples.length === 0 ? (
                  <div className="text-[11px] text-slate-400">
                    لا توجد أصناف مطابقة بسعر جملة &gt; 0 حالياً.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {quickPreviewSamples.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-2 bg-slate-50 px-2 py-1 rounded text-[11px]"
                      >
                        <span className="truncate font-semibold text-slate-700 max-w-[140px]">
                          {s.name}
                        </span>
                        <span dir="ltr" className="font-mono text-slate-500 shrink-0">
                          {s.wholesale} ← <strong className="text-emerald-700">{s.newSelling}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inline Paste From Excel Panel */}
      {showPasteModal && (
        <div className="bg-amber-50/70 border-b border-amber-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <ClipboardPaste size={15} className="text-amber-700" />
                لصق مباشر من Microsoft Excel أو Google Sheets
              </h4>
              <p className="text-[11px] text-amber-800 mt-0.5">
                انسخ الصفوف من الإكسيل (Ctrl+C) والصقها هنا (Ctrl+V). يدعم اللصق بالعناوين أو بدونها (الاسم | الجملة | البيع، أو الكود | الاسم | القسم | الجملة | البيع).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPasteModal(false)}
              className="text-slate-500 hover:text-slate-800 p-1 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder={'مثال:\nPRD-201\tسماعة ايربودز برو\tايربودز\t260\t390\nPRD-202\tكابل تايب سي مجدول\tكابل\t35\t70'}
            className="w-full p-2.5 rounded-xl border border-amber-300 bg-white text-xs font-mono outline-none focus:ring-2 focus:ring-amber-400"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setPasteText('');
                setShowPasteModal(false);
              }}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-800 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleApplyPastedText}
              disabled={!pasteText.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#107C41] hover:bg-[#0c6333] text-white text-xs font-bold rounded-lg cursor-pointer disabled:opacity-50"
            >
              <Check size={14} />
              إدراج البيانات في الجدول
            </button>
          </div>
        </div>
      )}

      {/* Search, Filter & Excel Formula Bar */}
      <div className="bg-white border-b border-slate-200 px-3 py-2 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث في الشيت بالكود أو الاسم أو الماركة..."
                className="w-full pr-8 pl-2.5 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:border-[#107C41] focus:ring-1 focus:ring-[#107C41]"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-slate-400" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="py-1.5 px-2.5 text-xs border border-slate-300 rounded-lg bg-white font-bold text-slate-700 outline-none focus:border-[#107C41]"
              >
                <option value="ALL">كل الأقسام ({products.length})</option>
                {categoryNames.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer select-none px-2 py-1 rounded-lg hover:bg-slate-50 border border-slate-200">
              <input
                type="checkbox"
                checked={onlyMissingPriceOrName}
                onChange={(e) => setOnlyMissingPriceOrName(e.target.checked)}
                className="rounded text-[#107C41] focus:ring-[#107C41]"
              />
              <span>الناقصة فقط</span>
            </label>
          </div>

          <div className="text-[11px] text-slate-500 font-semibold">
            اضغط <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px]">Enter</kbd> للنزول للصف التالي و <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px]">Tab</kbd> للخلية المجاورة
          </div>
        </div>

        {/* Formula / Active Cell Bar */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
          <span className="font-mono font-bold text-[#107C41] bg-white border border-slate-300 px-2 py-0.5 rounded min-w-[52px] text-center">
            {activeCell ? `${activeCell.colLetter}${activeCell.rowIndex + 1}` : 'A1'}
          </span>
          <span className="text-slate-400 font-serif italic font-bold px-1">fx</span>
          <span className="text-slate-500 font-bold shrink-0">
            {activeCell ? `${activeCell.fieldLabel}:` : 'الخلية النشطة:'}
          </span>
          <span className="text-slate-800 truncate flex-1 font-medium">
            {activeCell ? activeCell.valuePreview || '(فارغ)' : 'انقر على أي خلية للكتابة مباشرة'}
          </span>
        </div>
      </div>

      {/* Excel Grid Table */}
      <div
        onPaste={handleTableMultiRowPaste}
        className="overflow-x-auto max-h-[600px] overflow-y-auto bg-slate-100/40"
      >
        <table className="w-full border-collapse text-xs min-w-[1120px] table-fixed">
          <thead className="sticky top-0 z-20 shadow-2xs">
            {/* Column Letters Header Row like Excel */}
            <tr className="bg-[#e8eeea] text-slate-600 text-[10px] font-mono font-bold text-center border-b border-slate-300">
              <th className="w-10 py-1 border-l border-slate-300">#</th>
              <th className="w-9 py-1 border-l border-slate-300">✓</th>
              <th className="w-16 py-1 border-l border-slate-300">A</th>
              <th className="w-28 py-1 border-l border-slate-300">B</th>
              <th className="w-56 py-1 border-l border-slate-300">C</th>
              <th className="w-28 py-1 border-l border-slate-300">D</th>
              <th className="w-28 py-1 border-l border-slate-300">E</th>
              <th className="w-28 py-1 border-l border-slate-300">F</th>
              <th className="w-44 py-1 border-l border-slate-300">G</th>
              <th className="w-24 py-1 border-l border-slate-300">H</th>
              <th className="w-24 py-1 border-l border-slate-300">I</th>
              <th className="w-20 py-1 border-l border-slate-300">J</th>
              <th className="w-16 py-1 border-l border-slate-300">K</th>
              <th className="w-12 py-1">حذف</th>
            </tr>
            {/* Field Names Header Row */}
            <tr className="bg-[#f3f6f4] text-slate-800 font-bold border-b-2 border-[#107C41]/40 text-right">
              <th className="py-2 px-1 text-center border-l border-slate-300 bg-[#e8eeea]">م</th>
              <th className="py-2 px-1 text-center border-l border-slate-300">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  className="rounded text-[#107C41] focus:ring-[#107C41] cursor-pointer"
                  title="تحديد كل المعروض"
                />
              </th>
              <th className="py-2 px-2 text-center border-l border-slate-300">الصورة</th>
              <th className="py-2 px-2 border-l border-slate-300">الكود</th>
              <th className="py-2 px-2 border-l border-slate-300">اسم المنتج</th>
              <th className="py-2 px-2 border-l border-slate-300">القسم</th>
              <th className="py-2 px-2 border-l border-slate-300">الماركة</th>
              <th className="py-2 px-2 border-l border-slate-300">الموديل</th>
              <th className="py-2 px-2 border-l border-slate-300">المواصفات</th>
              <th className="py-2 px-2 border-l border-slate-300 text-center">سعر الجملة</th>
              <th className="py-2 px-2 border-l border-slate-300 text-center">سعر البيع</th>
              <th className="py-2 px-2 border-l border-slate-300 text-center">الربح</th>
              <th className="py-2 px-1 border-l border-slate-300 text-center">بالكتالوج</th>
              <th className="py-2 px-1 text-center">إجراء</th>
            </tr>
          </thead>

          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={14} className="py-14 text-center bg-white text-slate-500">
                  <div className="flex flex-col items-center gap-3">
                    <FileSpreadsheet size={34} className="text-emerald-600/60" />
                    <div className="space-y-1">
                      <p className="font-bold text-slate-700 text-sm">
                        {searchQuery || categoryFilter !== 'ALL' || onlyMissingPriceOrName
                          ? 'لا توجد صفوف مطابقة للبحث أو التصفية الحالية'
                          : 'شيت الإكسيل فارغ حالياً'}
                      </p>
                      <p className="text-xs text-slate-500">
                        يمكنك سحب ملف Excel هنا مباشرة، أو استيراد ملف، أو لصق الصفوف، أو إنشاء صفوف للكتابة.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {(searchQuery || categoryFilter !== 'ALL' || onlyMissingPriceOrName) && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setCategoryFilter('ALL');
                            setOnlyMissingPriceOrName(false);
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs cursor-pointer"
                        >
                          <X size={14} />
                          مسح البحث والتصفية
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => excelFileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs cursor-pointer"
                      >
                        <Upload size={14} />
                        استيراد ملف Excel / CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddBlankRows(5)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#107C41] hover:bg-[#0c6333] text-white font-bold rounded-xl text-xs cursor-pointer"
                      >
                        <Plus size={14} />
                        إنشاء 5 صفوف فارغة
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              filteredProducts.map((product, rowIdx) => {
                const isSelected = selectedIds.has(product.id);
                const wholesale = product.wholesale_price || 0;
                const selling = product.selling_price || 0;
                const profit = selling > 0 ? Math.round((selling - wholesale) * 100) / 100 : 0;
                const isMissing = !product.name?.trim() || selling <= 0;

                return (
                  <tr
                    key={product.id}
                    className={`border-b border-slate-200 transition-colors ${
                      isSelected
                        ? 'bg-emerald-50/70'
                        : isMissing
                          ? 'bg-amber-50/35 hover:bg-amber-50/60'
                          : rowIdx % 2 === 0
                            ? 'bg-white hover:bg-slate-50'
                            : 'bg-slate-50/40 hover:bg-slate-100/60'
                    }`}
                  >
                    {/* Row index */}
                    <td className="text-center font-mono text-[11px] font-bold text-slate-500 bg-[#f3f6f4] border-l border-slate-300 select-none">
                      {rowIdx + 1}
                    </td>

                    {/* Select checkbox */}
                    <td className="text-center border-l border-slate-200">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRowSelect(product.id)}
                        className="rounded text-[#107C41] focus:ring-[#107C41] cursor-pointer"
                      />
                    </td>

                    {/* A: Photo cell with Pro Studio & Quick Remove */}
                    <td className="border-l border-slate-200 p-1 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenRowImageCell(product)}
                          className="w-9 h-8 rounded border border-slate-200 bg-white hover:border-[#107C41] flex items-center justify-center overflow-hidden cursor-pointer group relative"
                          title={
                            product.image_url
                              ? 'اضغط لفتح استوديو القص والتعديل والإزالة'
                              : 'اضغط لرفع صورة وتعديلها وقصها'
                          }
                        >
                          {product.image_url ? (
                            <>
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="w-full h-full object-contain"
                              />
                              <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Crop size={12} className="text-white" />
                              </span>
                            </>
                          ) : (
                            <ImagePlus size={14} className="text-slate-400 group-hover:text-[#107C41]" />
                          )}
                        </button>
                        {product.image_url && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRowImage(product)}
                            className="p-1 text-slate-300 hover:text-red-600 rounded transition-colors cursor-pointer"
                            title="إزالة صورة الصنف"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* B: Code */}
                    <td className="border-l border-slate-200 p-0 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#107C41] focus-within:bg-emerald-50/20">
                      <ExcelInputCell
                        value={product.code || ''}
                        dir="ltr"
                        alignClass="text-center font-mono"
                        placeholder="PRD-..."
                        cellKey={`${product.id}:code`}
                        rowIndex={rowIdx}
                        colIndex={0}
                        colLetter={FIELD_META.code.colLetter}
                        fieldLabel={FIELD_META.code.label}
                        productId={product.id}
                        onFocusCell={setActiveCell}
                        onCommit={(val) => handleCellCommit(product.id, 'code', val)}
                        onNavigateGrid={(rD, cD) => handleNavigateGrid(rowIdx, 'code', rD, cD)}
                        registerRef={registerCellRef}
                      />
                    </td>

                    {/* C: Name */}
                    <td className="border-l border-slate-200 p-0 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#107C41] focus-within:bg-emerald-50/20">
                      <ExcelInputCell
                        value={product.name || ''}
                        placeholder="اكتب اسم المنتج..."
                        cellKey={`${product.id}:name`}
                        rowIndex={rowIdx}
                        colIndex={1}
                        colLetter={FIELD_META.name.colLetter}
                        fieldLabel={FIELD_META.name.label}
                        productId={product.id}
                        onFocusCell={setActiveCell}
                        onCommit={(val) => handleCellCommit(product.id, 'name', val)}
                        onNavigateGrid={(rD, cD) => handleNavigateGrid(rowIdx, 'name', rD, cD)}
                        registerRef={registerCellRef}
                      />
                    </td>

                    {/* D: Category */}
                    <td className="border-l border-slate-200 p-0 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#107C41]">
                      <select
                        ref={(el) => registerCellRef(`${product.id}:category`, el)}
                        value={product.category || 'متنوعة'}
                        onFocus={() =>
                          setActiveCell({
                            productId: product.id,
                            rowIndex: rowIdx,
                            colLetter: FIELD_META.category.colLetter,
                            fieldLabel: FIELD_META.category.label,
                            valuePreview: product.category || '',
                          })
                        }
                        onChange={(e) => handleCellCommit(product.id, 'category', e.target.value)}
                        className="w-full h-9 px-1.5 text-xs bg-transparent outline-none font-semibold text-slate-700 cursor-pointer"
                      >
                        {!categoryNames.includes(product.category) && product.category && (
                          <option value={product.category}>{product.category}</option>
                        )}
                        {categoryNames.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* E: Group / Brand */}
                    <td className="border-l border-slate-200 p-0 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#107C41] focus-within:bg-emerald-50/20">
                      <ExcelInputCell
                        value={product.group || ''}
                        placeholder="الماركة"
                        cellKey={`${product.id}:group`}
                        rowIndex={rowIdx}
                        colIndex={3}
                        colLetter={FIELD_META.group.colLetter}
                        fieldLabel={FIELD_META.group.label}
                        productId={product.id}
                        onFocusCell={setActiveCell}
                        onCommit={(val) => handleCellCommit(product.id, 'group', val)}
                        onNavigateGrid={(rD, cD) => handleNavigateGrid(rowIdx, 'group', rD, cD)}
                        registerRef={registerCellRef}
                      />
                    </td>

                    {/* F: Model */}
                    <td className="border-l border-slate-200 p-0 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#107C41] focus-within:bg-emerald-50/20">
                      <ExcelInputCell
                        value={product.model || ''}
                        placeholder="الموديل"
                        cellKey={`${product.id}:model`}
                        rowIndex={rowIdx}
                        colIndex={4}
                        colLetter={FIELD_META.model.colLetter}
                        fieldLabel={FIELD_META.model.label}
                        productId={product.id}
                        onFocusCell={setActiveCell}
                        onCommit={(val) => handleCellCommit(product.id, 'model', val)}
                        onNavigateGrid={(rD, cD) => handleNavigateGrid(rowIdx, 'model', rD, cD)}
                        registerRef={registerCellRef}
                      />
                    </td>

                    {/* G: Specification */}
                    <td className="border-l border-slate-200 p-0 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#107C41] focus-within:bg-emerald-50/20">
                      <ExcelInputCell
                        value={product.specification || ''}
                        placeholder="المواصفات..."
                        cellKey={`${product.id}:specification`}
                        rowIndex={rowIdx}
                        colIndex={5}
                        colLetter={FIELD_META.specification.colLetter}
                        fieldLabel={FIELD_META.specification.label}
                        productId={product.id}
                        onFocusCell={setActiveCell}
                        onCommit={(val) => handleCellCommit(product.id, 'specification', val)}
                        onNavigateGrid={(rD, cD) =>
                          handleNavigateGrid(rowIdx, 'specification', rD, cD)
                        }
                        registerRef={registerCellRef}
                      />
                    </td>

                    {/* H: Wholesale Price */}
                    <td className="border-l border-slate-200 p-0 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#107C41] focus-within:bg-emerald-50/20">
                      <ExcelInputCell
                        value={wholesale || 0}
                        type="number"
                        dir="ltr"
                        alignClass="text-center"
                        cellKey={`${product.id}:wholesale_price`}
                        rowIndex={rowIdx}
                        colIndex={6}
                        colLetter={FIELD_META.wholesale_price.colLetter}
                        fieldLabel={FIELD_META.wholesale_price.label}
                        productId={product.id}
                        onFocusCell={setActiveCell}
                        onCommit={(val) => handleCellCommit(product.id, 'wholesale_price', val)}
                        onNavigateGrid={(rD, cD) =>
                          handleNavigateGrid(rowIdx, 'wholesale_price', rD, cD)
                        }
                        registerRef={registerCellRef}
                      />
                    </td>

                    {/* I: Selling Price */}
                    <td className="border-l border-slate-200 p-0 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#107C41] focus-within:bg-emerald-50/20">
                      <ExcelInputCell
                        value={selling || 0}
                        type="number"
                        dir="ltr"
                        alignClass="text-center"
                        cellKey={`${product.id}:selling_price`}
                        rowIndex={rowIdx}
                        colIndex={7}
                        colLetter={FIELD_META.selling_price.colLetter}
                        fieldLabel={FIELD_META.selling_price.label}
                        productId={product.id}
                        onFocusCell={setActiveCell}
                        onCommit={(val) => handleCellCommit(product.id, 'selling_price', val)}
                        onNavigateGrid={(rD, cD) =>
                          handleNavigateGrid(rowIdx, 'selling_price', rD, cD)
                        }
                        registerRef={registerCellRef}
                      />
                    </td>

                    {/* J: Calculated Profit (Read-only formula style) */}
                    <td className="border-l border-slate-200 px-2 text-center font-mono font-bold bg-slate-50/70">
                      <span
                        dir="ltr"
                        className={
                          selling <= 0
                            ? 'text-slate-400'
                            : profit > 0
                              ? 'text-emerald-700'
                              : profit < 0
                                ? 'text-red-600'
                                : 'text-slate-600'
                        }
                      >
                        {selling > 0 ? profit : '—'}
                      </span>
                    </td>

                    {/* K: Included in Catalog */}
                    <td className="border-l border-slate-200 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(product.included_in_catalog)}
                        onChange={() => handleToggleIncluded(product.id)}
                        className="rounded text-[#107C41] focus:ring-[#107C41] cursor-pointer"
                        title="إدراج في الكتالوج النهائي"
                      />
                    </td>

                    {/* Delete single row */}
                    <td className="text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(product)}
                        className="p-1.5 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                        title="حذف هذا الصف"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Excel Bottom Sheet & Totals Status Bar */}
      <div className="bg-[#f3f6f4] border-t border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="bg-white border border-emerald-300 border-t-2 border-t-[#107C41] text-[#107C41] font-bold px-3 py-1 rounded-t-md -mt-2 shadow-2xs">
            ورقة المنتجات الرئيسية ({summaryStats.count})
          </span>
          <span className="text-[11px] text-slate-500">
            مدرج بالكتالوج: <strong className="text-slate-800">{summaryStats.includedCount}</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[11px] font-bold text-slate-700">
          <span>
            إجمالي الجملة:{' '}
            <strong className="font-mono text-slate-900">
              {summaryStats.totalWholesale.toLocaleString('en-US')} ج.م
            </strong>
          </span>
          <span>
            إجمالي البيع:{' '}
            <strong className="font-mono text-sky-700">
              {summaryStats.totalSelling.toLocaleString('en-US')} ج.م
            </strong>
          </span>
          <span>
            صافي الربح التقديري:{' '}
            <strong className="font-mono text-[#107C41]">
              {summaryStats.totalProfit.toLocaleString('en-US')} ج.م
            </strong>
          </span>
        </div>
      </div>

      {/* Pro Image Studio Modal for Excel Spreadsheet Row Photos */}
      {imageStudioTarget && (
        <CropAdjustModal
          product={imageStudioTarget.product}
          initialRawUrl={imageStudioTarget.initialRawUrl}
          onClose={() => setImageStudioTarget(null)}
          onSave={async (updated) => {
            const nextList = productsRef.current.map((p) => (p.id === updated.id ? updated : p));
            productsRef.current = nextList;
            onProductsUpdated(nextList);
            await saveProduct(updated);
            setSaveStatusText(`تم تحديث صورة "${updated.name || updated.code || 'الصف'}"`);
          }}
        />
      )}
    </div>
  );
};
