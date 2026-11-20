import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Product,
  ProductCategory,
  ALL_CATEGORIES,
  DEFAULT_CATEGORIES,
  CategoryDefinition,
  CatalogSettings,
  PricingTier,
  TierTemplate,
  StandardMapTier,
  StandardMapTemplate,
  DEFAULT_STANDARD_MAP,
  PricingMethodType,
} from '../types';
import { saveProduct, saveProductsBatch, deleteProduct, saveSettings, createAutoBackupSnapshot } from '../utils/db';
import { exportProductsToExcel, parseExcelForPriceUpdates, ExcelImportSummary } from '../utils/excelHelper';
import { CropAdjustModal } from './CropAdjustModal';
import { EditProductModal } from './EditProductModal';
import { CategoryManagerModal } from './CategoryManagerModal';
import { CatalogReviewModal } from './CatalogReviewModal';
import { useUiFeedback } from './UiFeedbackProvider';
import {
  Search,
  SlidersHorizontal,
  Download,
  Upload,
  Trash2,
  Edit2,
  CheckSquare,
  Square,
  AlertTriangle,
  RotateCcw,
  Crop,
  Check,
  X,
  Plus,
  Percent,
  Layers,
  HelpCircle,
  Eye,
  Sparkles,
  RefreshCw,
  TrendingUp,
  Maximize2,
  Tag,
  FolderTree,
  FolderInput,
} from 'lucide-react';

interface PricingTableProps {
  products: Product[];
  onProductsUpdated: (products: Product[]) => void;
  settings?: CatalogSettings;
  onSettingsUpdated?: (settings: CatalogSettings) => void;
}

export const PricingTable: React.FC<PricingTableProps> = ({
  products,
  onProductsUpdated,
  settings,
  onSettingsUpdated,
}) => {
  const { toast, confirm } = useUiFeedback();

  // Safe numeric coercion (handles numbers, numeric strings, and Arabic digits ٠-٩)
  const toSafeNum = (val: any): number => {
    if (typeof val === 'number') return Number.isFinite(val) ? Math.round(val * 100) / 100 : 0;
    if (val === null || val === undefined || val === '') return 0;
    const normalized = String(val)
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/٫/g, '.')
      .replace(/[^0-9.-]/g, '');
    const n = Number(normalized);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  };

  // Live ref so rapid inline edits across rows never drop updates
  const productsRef = useRef<Product[]>(products);
  productsRef.current = products;

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('الكل');
  const [onlyWithoutPrice, setOnlyWithoutPrice] = useState(false);
  const [onlyPriceChanged, setOnlyPriceChanged] = useState(false);
  const [onlyNeedsCrop, setOnlyNeedsCrop] = useState(false);
  const [onlyPotentialDuplicate, setOnlyPotentialDuplicate] = useState(false);

  // Selected row IDs for batch actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals
  const [cropModalProduct, setCropModalProduct] = useState<Product | null>(null);
  const [editModalProduct, setEditModalProduct] = useState<Product | null>(null);

  // Bulk Pricing State
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<'all' | 'selected' | ProductCategory>('all');
  const [pricingMethod, setPricingMethod] = useState<PricingMethodType>('standard_map');
  const [markupPercent, setMarkupPercent] = useState<number>(25); // (أ)
  const [fixedAddAmount, setFixedAddAmount] = useState<number>(30); // (ب)
  const [profitMarginPercent, setProfitMarginPercent] = useState<number>(20); // (ج)
  const [allowFractions, setAllowFractions] = useState<boolean>(
    settings?.allow_price_fractions ?? true
  );
  const [rounding, setRounding] = useState<0 | 1 | 5 | 10>(() => {
    const saved = settings?.global_pricing_rule?.rounding;
    if (saved === 0 || saved === 1 || saved === 5 || saved === 10) return saved;
    return (settings?.allow_price_fractions ?? true) ? 0 : 5;
  });
  const [overrideManualPrices, setOverrideManualPrices] = useState<boolean>(false);

  useEffect(() => {
    if (settings?.allow_price_fractions !== undefined) {
      setAllowFractions(settings.allow_price_fractions);
    }
    const savedRounding = settings?.global_pricing_rule?.rounding;
    if (savedRounding === 0 || savedRounding === 1 || savedRounding === 5 || savedRounding === 10) {
      setRounding(savedRounding);
    }
    if (settings?.current_standard_map && settings.current_standard_map.length > 0) {
      setStandardMapTiers(settings.current_standard_map);
    }
    if (settings?.standard_map_fallback_percent !== undefined) {
      setStandardFallbackPercent(settings.standard_map_fallback_percent);
    }
  }, [
    settings?.allow_price_fractions,
    settings?.global_pricing_rule?.rounding,
    settings?.current_standard_map,
    settings?.standard_map_fallback_percent,
  ]);

  // Custom Tiers State (د)
  const [tiers, setTiers] = useState<PricingTier[]>([
    { id: '1', from: 1, to: 50, increase_type: 'fixed', value: 15 },
    { id: '2', from: 51, to: 150, increase_type: 'fixed', value: 25 },
    { id: '3', from: 151, to: 300, increase_type: 'fixed', value: 40 },
    { id: '4', from: 301, to: 2000, increase_type: 'percent', value: 20 },
  ]);
  const [newTemplateName, setNewTemplateName] = useState('');

  // Standard Map State (الخريطة المعيارية)
  const [standardMapTiers, setStandardMapTiers] = useState<StandardMapTier[]>(() => {
    return settings?.current_standard_map && settings.current_standard_map.length > 0
      ? settings.current_standard_map
      : DEFAULT_STANDARD_MAP;
  });
  const [standardFallbackPercent, setStandardFallbackPercent] = useState<number>(() => {
    return settings?.standard_map_fallback_percent || 10;
  });
  const [newStandardMapName, setNewStandardMapName] = useState('');

  // Category Manager & Bulk Move state
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [isBulkMoveModalOpen, setIsBulkMoveModalOpen] = useState(false);
  const [bulkMoveTargetCategory, setBulkMoveTargetCategory] = useState<string>('');

  // Active categories list sorted by order
  const categories = useMemo(() => {
    const list = settings?.categories && settings.categories.length > 0
      ? settings.categories
      : DEFAULT_CATEGORIES;
    return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [settings?.categories]);

  // Excel Upload Review Modal & Export Audit Review Modal
  const [excelSummary, setExcelSummary] = useState<ExcelImportSummary | null>(null);
  const [excelFileName, setExcelFileName] = useState('');
  const [showExcelReviewModal, setShowExcelReviewModal] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);

  // Check if undo is available
  const canUndo = useMemo(() => {
    return products.some((p) => p.previous_selling_price_snapshot !== undefined);
  }, [products]);

  // Quick filter counts (using safe numeric coercion)
  const quickFilterCounts = useMemo(() => {
    let withoutPrice = 0;
    let needsCrop = 0;
    let duplicate = 0;
    let priceChanged = 0;
    for (const p of products) {
      if (toSafeNum(p.selling_price) <= 0) withoutPrice++;
      if (p.needs_crop_adjustment) needsCrop++;
      if (p.is_potential_duplicate) duplicate++;
      if (p.price_changed) priceChanged++;
    }
    return { withoutPrice, needsCrop, duplicate, priceChanged };
  }, [products]);

  // Dynamic category tabs: include configured categories + any unlisted categories present on products
  const categoryTabs = useMemo(() => {
    const knownNames = categories.map((c) => c.name);
    const knownSet = new Set(knownNames.map((n) => n.trim()));
    const extraNames: string[] = [];
    let hasUncategorized = false;

    for (const p of products) {
      const catName = (p.category || '').trim();
      if (!catName) {
        hasUncategorized = true;
      } else if (!knownSet.has(catName)) {
        knownSet.add(catName);
        extraNames.push(catName);
      }
    }

    const tabs = ['الكل', ...knownNames, ...extraNames];
    if (hasUncategorized && !knownSet.has('بدون قسم')) {
      tabs.push('بدون قسم');
    }
    return tabs;
  }, [categories, products]);

  // Auto-clear empty/stale filters when products exist so Stage 2 table never gets stuck blank (0 / N)
  useEffect(() => {
    if (products.length === 0) return;
    if (onlyWithoutPrice && quickFilterCounts.withoutPrice === 0) setOnlyWithoutPrice(false);
    if (onlyNeedsCrop && quickFilterCounts.needsCrop === 0) setOnlyNeedsCrop(false);
    if (onlyPotentialDuplicate && quickFilterCounts.duplicate === 0) setOnlyPotentialDuplicate(false);
    if (onlyPriceChanged && quickFilterCounts.priceChanged === 0) setOnlyPriceChanged(false);
    if (selectedCategory !== 'الكل') {
      const target = selectedCategory.trim();
      const catCount = products.filter((p) => {
        const c = (p.category || '').trim();
        return target === 'بدون قسم' ? !c : c === target;
      }).length;
      if (catCount === 0) {
        setSelectedCategory('الكل');
      }
    }
  }, [
    products,
    onlyWithoutPrice,
    onlyNeedsCrop,
    onlyPotentialDuplicate,
    onlyPriceChanged,
    selectedCategory,
    quickFilterCounts,
  ]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const sellingNum = toSafeNum(p.selling_price);
      if (selectedCategory !== 'الكل') {
        const prodCat = (p.category || '').trim();
        const targetCat = selectedCategory.trim();
        if (targetCat === 'بدون قسم') {
          if (prodCat) return false;
        } else if (prodCat !== targetCat) {
          return false;
        }
      }
      if (onlyWithoutPrice && sellingNum > 0) return false;
      if (onlyPriceChanged && !p.price_changed) return false;
      if (onlyNeedsCrop && !p.needs_crop_adjustment) return false;
      if (onlyPotentialDuplicate && !p.is_potential_duplicate) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = p.name?.toLowerCase().includes(q);
        const matchModel = p.model?.toLowerCase().includes(q);
        const matchCode = p.code?.toLowerCase().includes(q);
        const matchGroup = p.group?.toLowerCase().includes(q);
        if (!matchName && !matchModel && !matchCode && !matchGroup) return false;
      }
      return true;
    });
  }, [products, selectedCategory, onlyWithoutPrice, onlyPriceChanged, onlyNeedsCrop, onlyPotentialDuplicate, searchQuery]);

  const hasAnyActiveFilter = Boolean(
    selectedCategory !== 'الكل' ||
      onlyWithoutPrice ||
      onlyPriceChanged ||
      onlyNeedsCrop ||
      onlyPotentialDuplicate ||
      searchQuery.trim()
  );

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (selectedCategory !== 'الكل') {
      chips.push({
        key: 'cat',
        label: `القسم: ${selectedCategory}`,
        clear: () => setSelectedCategory('الكل'),
      });
    }
    if (onlyWithoutPrice) {
      chips.push({
        key: 'noPrice',
        label: 'بدون سعر بيع',
        clear: () => setOnlyWithoutPrice(false),
      });
    }
    if (onlyNeedsCrop) {
      chips.push({
        key: 'crop',
        label: 'يحتاج ضبط القص',
        clear: () => setOnlyNeedsCrop(false),
      });
    }
    if (onlyPotentialDuplicate) {
      chips.push({
        key: 'dup',
        label: 'مكرر محتمل',
        clear: () => setOnlyPotentialDuplicate(false),
      });
    }
    if (onlyPriceChanged) {
      chips.push({
        key: 'changed',
        label: 'سعر الجملة تغير',
        clear: () => setOnlyPriceChanged(false),
      });
    }
    if (searchQuery.trim()) {
      chips.push({
        key: 'search',
        label: `بحث: "${searchQuery.trim()}"`,
        clear: () => setSearchQuery(''),
      });
    }
    return chips;
  }, [selectedCategory, onlyWithoutPrice, onlyNeedsCrop, onlyPotentialDuplicate, onlyPriceChanged, searchQuery]);

  const resetAllFilters = () => {
    setSelectedCategory('الكل');
    setOnlyWithoutPrice(false);
    setOnlyPriceChanged(false);
    setOnlyNeedsCrop(false);
    setOnlyPotentialDuplicate(false);
    setSearchQuery('');
  };

  // Summary Pricing Stats for visible rows (plus overall total fallback check)
  const pricingStats = useMemo(() => {
    let withWholesale = 0;
    let pricedCount = 0;
    let totalWholesale = 0;
    let totalSelling = 0;
    let totalProfit = 0;
    for (const p of filteredProducts) {
      const w = toSafeNum(p.wholesale_price);
      const s = toSafeNum(p.selling_price);
      if (w > 0) {
        withWholesale++;
        totalWholesale += w;
      }
      if (s > 0) {
        pricedCount++;
        totalSelling += s;
        totalProfit += s - w;
      }
    }
    const avgMargin = totalSelling > 0 ? (totalProfit / totalSelling) * 100 : 0;
    return {
      withWholesale,
      pricedCount,
      totalWholesale: Math.round(totalWholesale),
      totalSelling: Math.round(totalSelling),
      totalProfit: Math.round(totalProfit),
      avgMargin,
    };
  }, [filteredProducts]);

  // Bulk selection helpers
  const handleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Inline update wholesale price
  const handleWholesalePriceChange = async (product: Product, newPriceRaw: string) => {
    const val = toSafeNum(newPriceRaw);
    const updated: Product = {
      ...product,
      wholesale_price: val,
      updated_at: Date.now(),
    };
    const nextList = productsRef.current.map((p) => (p.id === product.id ? updated : p));
    productsRef.current = nextList;
    onProductsUpdated(nextList);
    await saveProduct(updated);
  };

  // Inline update selling price (Marks as manually set only when > 0)
  const handleSellingPriceChange = async (product: Product, newPriceRaw: string) => {
    const parsed = toSafeNum(newPriceRaw);
    const val = allowFractions ? parsed : Math.round(parsed);
    const updated: Product = {
      ...product,
      selling_price: val,
      manual_price_set: val > 0,
      included_in_catalog: Boolean(product.name?.trim() && val > 0),
      updated_at: Date.now(),
    };
    const nextList = productsRef.current.map((p) => (p.id === product.id ? updated : p));
    productsRef.current = nextList;
    onProductsUpdated(nextList);
    await saveProduct(updated);
  };

  // Toggle selling price fractions acceptance (e.g., 7, 13, 7.5 vs rounded)
  const handleTogglePriceFractions = async () => {
    const nextAllow = !allowFractions;
    const nextRounding: 0 | 1 | 5 | 10 = nextAllow ? 0 : rounding === 0 ? 5 : rounding;
    setAllowFractions(nextAllow);
    setRounding(nextRounding);

    if (settings && onSettingsUpdated) {
      const updatedSettings: CatalogSettings = {
        ...settings,
        allow_price_fractions: nextAllow,
        global_pricing_rule: {
          ...(settings.global_pricing_rule || {
            method: pricingMethod,
            value: markupPercent,
            rounding: nextRounding,
          }),
          rounding: nextRounding,
        },
      };
      await saveSettings(updatedSettings);
      onSettingsUpdated(updatedSettings);
    }

    toast.success(
      nextAllow
        ? 'تم تفعيل قبول الكسور في أسعار البيع (يقبل أرقام مثل 7 و13 و7.5).'
        : 'تم إغلاق الكسور في أسعار البيع وتفعيل التقريب.'
    );
  };

  // Toggle included in catalog
  const handleToggleInclude = async (product: Product) => {
    const updated: Product = {
      ...product,
      included_in_catalog: !product.included_in_catalog,
      updated_at: Date.now(),
    };
    const nextList = productsRef.current.map((p) => (p.id === product.id ? updated : p));
    productsRef.current = nextList;
    onProductsUpdated(nextList);
    await saveProduct(updated);
  };

  // Delete product
  const handleDeleteProduct = async (id: string) => {
    const ok = await confirm({
      title: 'حذف المنتج',
      message: 'هل أنت متأكد من حذف هذا المنتج؟',
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!ok) return;
    await deleteProduct(id);
    const nextList = productsRef.current.filter((p) => p.id !== id);
    productsRef.current = nextList;
    onProductsUpdated(nextList);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    toast.success('تم حذف المنتج.');
  };

  // Bulk delete selected products (with auto backup snapshot)
  const handleBulkDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({
      title: 'حذف جماعي للمنتجات',
      message: `هل أنت متأكد من حذف (${selectedIds.size}) صنف محدد؟ سيتم حفظ نسخة احتياطية تلقائية في المتصفح قبل الحذف.`,
      confirmLabel: 'حذف المحدد',
      danger: true,
    });
    if (!ok) return;
    await createAutoBackupSnapshot(`قبل الحذف الجماعي (${selectedIds.size} صنف)`);
    for (const id of selectedIds) {
      await deleteProduct(id);
    }
    const nextList = productsRef.current.filter((p) => !selectedIds.has(p.id));
    productsRef.current = nextList;
    onProductsUpdated(nextList);
    setSelectedIds(new Set());
    toast.success('تم حذف الأصناف المحددة وحفظ نسخة احتياطية.');
  };

  // Change category of a single product directly from row
  const handleSingleProductCategoryChange = async (product: Product, newCategory: string) => {
    const updated: Product = {
      ...product,
      category: newCategory,
      updated_at: Date.now(),
    };
    const nextList = productsRef.current.map((p) => (p.id === product.id ? updated : p));
    productsRef.current = nextList;
    onProductsUpdated(nextList);
    await saveProduct(updated);
  };

  // Bulk move selected products to a category
  const handleBulkMoveConfirm = async () => {
    if (!bulkMoveTargetCategory || selectedIds.size === 0) return;
    const targetCat = bulkMoveTargetCategory;
    const toSaveBatch: Product[] = [];
    const updatedProducts = products.map((p) => {
      if (selectedIds.has(p.id)) {
        const upd = { ...p, category: targetCat, updated_at: Date.now() };
        toSaveBatch.push(upd);
        return upd;
      }
      return p;
    });

    await saveProductsBatch(toSaveBatch);
    onProductsUpdated(updatedProducts);
    setSelectedIds(new Set());
    setIsBulkMoveModalOpen(false);
  };

  // Pricing Calculation Function (Including Standard Map)
  const calculatePrice = (wholesale: number): number => {
    if (wholesale <= 0) return 0;
    let price = wholesale;

    if (pricingMethod === 'standard_map') {
      // Standard Map: Upper limit is included in bracket (wholesale > from && wholesale <= to)
      if (wholesale > 4000) {
        price = wholesale * (1 + standardFallbackPercent / 100);
      } else {
        const matched = standardMapTiers.find((t) =>
          t.from === 0 ? wholesale >= 0 && wholesale <= t.to : wholesale > t.from && wholesale <= t.to
        );
        if (matched) {
          price = wholesale + matched.increase;
        } else {
          price = wholesale * (1 + standardFallbackPercent / 100);
        }
      }
    } else if (pricingMethod === 'percent_markup') {
      // (أ) Markup on wholesale: wholesale * (1 + markup / 100)
      price = wholesale * (1 + markupPercent / 100);
    } else if (pricingMethod === 'fixed_add') {
      // (ب) Fixed add-on
      price = wholesale + fixedAddAmount;
    } else if (pricingMethod === 'profit_margin') {
      // (ج) Margin on selling price: wholesale / (1 - margin / 100)
      const fraction = Math.min(0.95, Math.max(0.01, profitMarginPercent / 100));
      price = wholesale / (1 - fraction);
    } else if (pricingMethod === 'tiers') {
      // (د) Custom tiers
      const matchedTier = tiers.find((t) => wholesale >= t.from && wholesale <= t.to);
      if (matchedTier) {
        if (matchedTier.increase_type === 'percent') {
          price = wholesale * (1 + matchedTier.value / 100);
        } else {
          price = wholesale + matchedTier.value;
        }
      } else {
        price = wholesale * 1.2;
      }
    }

    // Apply Rounding (supports fractions / unrounded 0, 1, 5, 10)
    if (rounding === 0) {
      price = allowFractions ? Math.round(price * 100) / 100 : Math.round(price);
    } else if (rounding === 1) {
      price = Math.round(price);
    } else {
      price = Math.round(price / rounding) * rounding;
    }

    return Math.max(wholesale, price);
  };

  // Target products for preview & execution
  const targetProducts = useMemo(() => {
    let list: Product[] = [];
    if (bulkTarget === 'selected') {
      list = products.filter((p) => selectedIds.has(p.id));
    } else if (bulkTarget === 'all') {
      list = [...products];
    } else {
      list = products.filter((p) => p.category === bulkTarget);
    }

    // Filter out manual prices if not override
    if (!overrideManualPrices) {
      list = list.filter((p) => !p.manual_price_set);
    }
    return list;
  }, [products, selectedIds, bulkTarget, overrideManualPrices]);

  // Count skipped manual prices
  const skippedManualCount = useMemo(() => {
    if (overrideManualPrices) return 0;
    let list: Product[] = [];
    if (bulkTarget === 'selected') {
      list = products.filter((p) => selectedIds.has(p.id));
    } else if (bulkTarget === 'all') {
      list = [...products];
    } else {
      list = products.filter((p) => p.category === bulkTarget);
    }
    return list.filter((p) => p.manual_price_set).length;
  }, [products, selectedIds, bulkTarget, overrideManualPrices]);

  // Preview samples (first 4 items)
  const previewSamples = useMemo(() => {
    return targetProducts.slice(0, 4).map((p) => {
      const wholesale = toSafeNum(p.wholesale_price);
      const currentSelling = toSafeNum(p.selling_price);
      const newPrice = wholesale > 0 ? calculatePrice(wholesale) : currentSelling;
      return {
        id: p.id,
        name: p.name,
        wholesale,
        currentSelling,
        newSelling: newPrice,
        profit: newPrice - wholesale,
        margin: newPrice > 0 ? (((newPrice - wholesale) / newPrice) * 100).toFixed(1) : '0',
      };
    });
  }, [targetProducts, pricingMethod, markupPercent, fixedAddAmount, profitMarginPercent, tiers, standardMapTiers, standardFallbackPercent, rounding, allowFractions]);

  // Apply Bulk Pricing
  const handleApplyBulkPricing = async () => {
    if (targetProducts.length === 0) {
      toast.warning('لا توجد منتجات لتطبيق التسعير عليها (قد تكون جميعها مسعرة يدوياً وأنت لم تختر استبدالها).');
      return;
    }

    const updatedList: Product[] = targetProducts.map((p) => {
      const wholesale = toSafeNum(p.wholesale_price);
      const existingSelling = toSafeNum(p.selling_price);
      const calculated = wholesale > 0 ? calculatePrice(wholesale) : existingSelling;
      return {
        ...p,
        previous_selling_price_snapshot: existingSelling, // Save snapshot for undo
        selling_price: calculated,
        included_in_catalog: Boolean(p.name?.trim() && calculated > 0),
        updated_at: Date.now(),
      };
    });

    await saveProductsBatch(updatedList);

    // Save current standard map & fraction/rounding settings if modified
    if (settings && onSettingsUpdated) {
      const updatedSettings: CatalogSettings = {
        ...settings,
        allow_price_fractions: allowFractions,
        global_pricing_rule: {
          ...(settings.global_pricing_rule || {
            method: pricingMethod,
            value: markupPercent,
            rounding,
          }),
          method: pricingMethod,
          rounding,
        },
        current_standard_map: standardMapTiers,
        standard_map_fallback_percent: standardFallbackPercent,
      };
      await saveSettings(updatedSettings);
      onSettingsUpdated(updatedSettings);
    }

    const updateMap = new Map(updatedList.map((p) => [p.id, p]));
    const allUpdated = productsRef.current.map((p) => updateMap.get(p.id) || p);
    productsRef.current = allUpdated;
    onProductsUpdated(allUpdated);
    setShowBulkModal(false);
    toast.success(`تم تطبيق التسعير على ${updatedList.length} منتج بنجاح.`);
  };

  // Undo Last Bulk Pricing Action
  const handleUndoLastPricing = async () => {
    const toRevert = products.filter((p) => p.previous_selling_price_snapshot !== undefined);
    if (toRevert.length === 0) {
      toast.info('لا توجد عملية تسعير سابقة يمكن التراجع عنها.');
      return;
    }

    const ok = await confirm({
      title: 'التراجع عن آخر عملية تسعير',
      message: `هل تريد التراجع عن آخر عملية تسعير واسترجاع الأسعار السابقة لـ ${toRevert.length} منتج؟`,
      confirmLabel: 'تراجع واسترجاع',
    });
    if (!ok) return;

    const reverted = toRevert.map((p) => ({
      ...p,
      selling_price: p.previous_selling_price_snapshot || 0,
      previous_selling_price_snapshot: undefined,
      included_in_catalog: Boolean(p.name?.trim() && (p.previous_selling_price_snapshot || 0) > 0),
      updated_at: Date.now(),
    }));

    await saveProductsBatch(reverted);
    const updateMap = new Map(reverted.map((p) => [p.id, p]));
    const allUpdated = products.map((p) => updateMap.get(p.id) || p);
    onProductsUpdated(allUpdated);
    toast.success(`تم استرجاع الأسعار السابقة لـ ${toRevert.length} منتج.`);
  };

  // Standard Map actions
  const handleResetStandardMapToDefault = async () => {
    const ok = await confirm({
      title: 'استعادة الخريطة الافتراضية',
      message: 'هل تريد استعادة خريطة التسعير المعيارية الأصلية؟',
      confirmLabel: 'استعادة',
    });
    if (ok) {
      setStandardMapTiers([...DEFAULT_STANDARD_MAP]);
      setStandardFallbackPercent(10);
      toast.success('تمت استعادة خريطة التسعير المعيارية الأصلية.');
    }
  };

  const handleAddStandardMapRow = () => {
    const last = standardMapTiers[standardMapTiers.length - 1];
    const newFrom = last ? last.to : 0;
    const newTo = newFrom + 500;
    setStandardMapTiers((prev) => [
      ...prev,
      {
        id: `sm_${Date.now()}`,
        from: newFrom,
        to: newTo,
        increase: (last?.increase || 50) + 50,
      },
    ]);
  };

  const handleRemoveStandardMapRow = (id: string) => {
    setStandardMapTiers((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSaveStandardMapAsTemplate = async () => {
    if (!newStandardMapName.trim()) {
      toast.warning('يرجى كتابة اسم لحفظ الخريطة.');
      return;
    }
    if (!settings || !onSettingsUpdated) return;

    const newTemplate: StandardMapTemplate = {
      id: `std_map_${Date.now()}`,
      name: newStandardMapName.trim(),
      tiers: [...standardMapTiers],
      fallback_percent: standardFallbackPercent,
    };

    const updatedSettings: CatalogSettings = {
      ...settings,
      saved_standard_maps: [...(settings.saved_standard_maps || []), newTemplate],
    };

    await saveSettings(updatedSettings);
    onSettingsUpdated(updatedSettings);
    setNewStandardMapName('');
    toast.success(`تم حفظ خريطة "${newTemplate.name}" بنجاح!`);
  };

  const handleLoadStandardMapTemplate = (tpl: StandardMapTemplate) => {
    setStandardMapTiers([...tpl.tiers]);
    setStandardFallbackPercent(tpl.fallback_percent || 10);
  };

  // Custom Tiers actions
  const handleAddCustomTier = () => {
    const lastTier = tiers[tiers.length - 1];
    const newFrom = lastTier ? lastTier.to + 1 : 1;
    const newTo = newFrom + 100;
    setTiers((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        from: newFrom,
        to: newTo,
        increase_type: 'fixed',
        value: 20,
      },
    ]);
  };

  // Excel Handlers
  const handleExcelFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setExcelFileName(file.name);
      const summary = await parseExcelForPriceUpdates(file, products);
      setExcelSummary(summary);
    } catch (err: any) {
      toast.error(err.message || 'تعذر قراءة ملف الإكسيل.');
    } finally {
      e.target.value = '';
    }
  };

  const confirmApplyExcelUpdates = async () => {
    if (!excelSummary) return;

    const updatedList = excelSummary.validUpdates.map((item) => ({
      ...item.product,
      previous_selling_price_snapshot: item.product.selling_price,
      selling_price: item.newPrice,
      manual_price_set: true,
      included_in_catalog: Boolean(item.product.name?.trim() && item.newPrice > 0),
      updated_at: Date.now(),
    }));

    await saveProductsBatch(updatedList);
    const updateMap = new Map(updatedList.map((p) => [p.id, p]));
    const allUpdated = products.map((p) => updateMap.get(p.id) || p);
    onProductsUpdated(allUpdated);
    setExcelSummary(null);
    toast.success(`تم تحديث أسعار ${updatedList.length} منتج من ملف الإكسيل بنجاح.`);
  };

  const handleUseFullImageDirectly = async (p: Product) => {
    const full = p.original_image_url || p.image_url;
    const updated: Product = {
      ...p,
      image_url: full,
      needs_crop_adjustment: false,
      updated_at: Date.now(),
    };
    await saveProduct(updated);
    onProductsUpdated(products.map((item) => (item.id === p.id ? updated : item)));
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <SlidersHorizontal className="text-sky-600" size={24} />
            المرحلة 2: جدول تسعير المنتجات وحساب هوامش الربح
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            سعر الجملة محمي وظاهر لك فقط. يمكنك استخدام "الخريطة المعيارية" الجاهزة، أو النسب، أو تعديل السعر في الجدول مباشرة.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Bulk Pricing Button */}
          <button
            onClick={() => setShowBulkModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-600/20 transition-all cursor-pointer whitespace-nowrap"
          >
            <Sparkles size={16} />
            تسعير جماعي (الخريطة المعيارية والخيارات)
          </button>

          {/* Selling Price Fractions Toggle Button */}
          <button
            type="button"
            onClick={handleTogglePriceFractions}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
              allowFractions
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
            title="التحكم في قبول الكسور في أسعار البيع (مثل 7 أو 13 أو 7.5 أو بدون كسور)"
          >
            <Percent size={15} className={allowFractions ? 'text-emerald-600' : 'text-slate-500'} />
            <span>{allowFractions ? 'الكسور في البيع: مقبولة ✓' : 'الكسور في البيع: مقربة'}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                allowFractions ? 'bg-emerald-200/70 text-emerald-900' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {allowFractions ? '7 / 13 / 7.5' : 'أقرب 5/10'}
            </span>
          </button>

          {/* Undo Last Action Button */}
          {canUndo && (
            <button
              onClick={handleUndoLastPricing}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold border border-amber-200 transition-colors cursor-pointer"
              title="التراجع عن آخر تطبيق للأسعار واسترجاع الأسعار القديمة"
            >
              <RotateCcw size={15} />
              تراجع عن آخر تطبيق
            </button>
          )}

          {/* Export Excel (with mandatory review modal) */}
          <button
            onClick={() => setShowExcelReviewModal(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            title="تصدير إكسيل بالأسعار"
          >
            <Download size={15} />
            تصدير إكسيل
          </button>

          {/* Import Excel */}
          <input
            type="file"
            ref={excelInputRef}
            onChange={handleExcelFileSelected}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />
          <button
            onClick={() => excelInputRef.current?.click()}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            title="تحديث الأسعار من شيت إكسيل"
          >
            <Upload size={15} />
            استيراد إكسيل
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        {/* Search & Quick Toggles */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-3 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="ابحث بالاسم، الموديل، كود الصنف أو الماركة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-sky-500 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!onlyWithoutPrice && quickFilterCounts.withoutPrice === 0) {
                  toast.info('كل المنتجات الحالية مسعرة بالفعل.');
                  return;
                }
                setOnlyWithoutPrice((prev) => !prev);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                onlyWithoutPrice
                  ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                  : quickFilterCounts.withoutPrice === 0
                  ? 'bg-slate-50 text-slate-400 border-slate-200 opacity-65'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
              title={onlyWithoutPrice ? 'فلتر نشط — اضغط للإلغاء' : 'عرض المنتجات التي لم يتم تحديد سعر بيع لها'}
            >
              {onlyWithoutPrice && <Check size={13} />}
              <span>بدون سعر بيع ({quickFilterCounts.withoutPrice})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!onlyNeedsCrop && quickFilterCounts.needsCrop === 0) {
                  toast.info('لا توجد منتجات تحتاج ضبط القص حالياً.');
                  return;
                }
                setOnlyNeedsCrop((prev) => !prev);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                onlyNeedsCrop
                  ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                  : quickFilterCounts.needsCrop === 0
                  ? 'bg-slate-50 text-slate-400 border-slate-200 opacity-65'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
              title={onlyNeedsCrop ? 'فلتر نشط — اضغط للإلغاء' : 'عرض المنتجات التي تحتاج ضبط القص'}
            >
              {onlyNeedsCrop && <Check size={13} />}
              <span>يحتاج ضبط القص ({quickFilterCounts.needsCrop})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!onlyPotentialDuplicate && quickFilterCounts.duplicate === 0) {
                  toast.info('لا توجد منتجات مكررة محتملة حالياً.');
                  return;
                }
                setOnlyPotentialDuplicate((prev) => !prev);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                onlyPotentialDuplicate
                  ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                  : quickFilterCounts.duplicate === 0
                  ? 'bg-slate-50 text-slate-400 border-slate-200 opacity-65'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
              title={onlyPotentialDuplicate ? 'فلتر نشط — اضغط للإلغاء' : 'عرض المنتجات المكررة المحتملة'}
            >
              {onlyPotentialDuplicate && <Check size={13} />}
              <span>مكرر محتمل ({quickFilterCounts.duplicate})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!onlyPriceChanged && quickFilterCounts.priceChanged === 0) {
                  toast.info('لا توجد منتجات تغير سعر الجملة الخاص بها حالياً.');
                  return;
                }
                setOnlyPriceChanged((prev) => !prev);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                onlyPriceChanged
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                  : quickFilterCounts.priceChanged === 0
                  ? 'bg-slate-50 text-slate-400 border-slate-200 opacity-65'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
              title={onlyPriceChanged ? 'فلتر نشط — اضغط للإلغاء' : 'عرض المنتجات التي تغير سعر جملتها'}
            >
              {onlyPriceChanged && <Check size={13} />}
              <span>سعر الجملة تغير ({quickFilterCounts.priceChanged})</span>
            </button>
          </div>
        </div>

        {/* Categories Bar */}
        <div className="flex flex-wrap items-center gap-1.5 pb-1 border-t border-slate-100 pt-3">
          <button
            onClick={() => setIsCategoryManagerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-300 rounded-lg text-xs font-bold transition-all shadow-2xs shrink-0 cursor-pointer ml-1"
            title="إدارة الأقسام والترتيب"
          >
            <FolderTree size={14} className="text-sky-600" />
            <span>إدارة الأقسام ({categories.length})</span>
          </button>

          <span className="text-xs font-bold text-slate-400 shrink-0 ml-1">الأقسام:</span>
          {categoryTabs.map((cat) => {
            const count =
              cat === 'الكل'
                ? products.length
                : products.filter((p) => {
                    const prodCat = (p.category || '').trim();
                    return cat === 'بدون قسم' ? !prodCat : prodCat === cat.trim();
                  }).length;
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                    : 'bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

        {/* Selection Bar */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-1 font-semibold text-sky-600 hover:underline cursor-pointer"
            >
              {selectedIds.size === filteredProducts.length && filteredProducts.length > 0 ? (
                <CheckSquare size={15} />
              ) : (
                <Square size={15} />
              )}
              تحديد / إلغاء تحديد الكل ({filteredProducts.length})
            </button>

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    setBulkMoveTargetCategory(categories[0]?.name || 'متنوعة');
                    setIsBulkMoveModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  <FolderInput size={14} className="text-amber-700" />
                  <span>نقل ({selectedIds.size}) لقسم...</span>
                </button>
                <button
                  onClick={handleBulkDeleteSelected}
                  className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  <Trash2 size={14} className="text-rose-600" />
                  <span>حذف المحدد ({selectedIds.size})</span>
                </button>
              </div>
            )}
          </div>

          <div>
            <span className="font-bold text-slate-700">{selectedIds.size}</span> منتج محدد حالياً
          </div>
        </div>
      </div>

      {/* Pricing & Profit Margins Live Summary Bar + Active Filter Reset */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700">
            المعروض: <span className="font-mono text-slate-900">{filteredProducts.length}</span> /{' '}
            <span className="font-mono">{products.length}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 font-bold text-amber-900">
            لها جملة: <span className="font-mono">{pricingStats.withWholesale}</span>
            {pricingStats.totalWholesale > 0 && (
              <span className="mr-1.5 font-mono text-[11px]">
                ({pricingStats.totalWholesale.toLocaleString('en-US')} ج.م)
              </span>
            )}
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 font-bold text-emerald-800">
            مسعّرة للبيع: <span className="font-mono">{pricingStats.pricedCount}</span>
            {pricingStats.totalSelling > 0 && (
              <span className="mr-1.5 font-mono text-[11px]">
                ({pricingStats.totalSelling.toLocaleString('en-US')} ج.م)
              </span>
            )}
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-sky-50 border border-sky-200 font-bold text-sky-800">
            صافي الربح: <span className="font-mono">{pricingStats.totalProfit.toLocaleString('en-US')} ج.م</span>{' '}
            <span className="text-[11px] opacity-80">({pricingStats.avgMargin.toFixed(1)}%)</span>
          </div>
        </div>

        {hasAnyActiveFilter && (
          <button
            type="button"
            onClick={resetAllFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold cursor-pointer transition-colors"
          >
            <X size={14} />
            إلغاء كل الفلاتر وعرض الكل ({products.length})
          </button>
        )}
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredProducts.length === 0 ? (
          <div className="p-10 text-center text-slate-400 space-y-3">
            <p className="text-base font-semibold text-slate-700">
              {products.length > 0
                ? `توجد (${products.length}) منتجات ولكنها مخفية بسبب الفلاتر النشطة حالياً.`
                : 'لا توجد منتجات مضافة حتى الآن.'}
            </p>
            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.clear}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-300 text-xs font-bold hover:bg-amber-100 cursor-pointer"
                    title="اضغط لإلغاء هذا الفلتر"
                  >
                    <span>{chip.label}</span>
                    <X size={13} />
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs">
              {products.length > 0
                ? 'اضغط على الزر أدناه لإلغاء الفلاتر وإظهار جميع الأصناف وأسعارها.'
                : 'يمكنك رفع ملفات أو إضافة منتجات من المرحلة 1.'}
            </p>
            {hasAnyActiveFilter && products.length > 0 && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
              >
                <RotateCcw size={14} />
                عرض كل المنتجات ({products.length})
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile / Tablet Cards View (< 1280px so sidebar screens never clip price columns) */}
            <div className="block xl:hidden divide-y divide-slate-100">
              {filteredProducts.map((product) => {
                const isSelected = selectedIds.has(product.id);
                const wholesale = toSafeNum(product.wholesale_price);
                const selling = toSafeNum(product.selling_price);
                const profitAmount = selling - wholesale;
                const profitMargin = selling > 0 ? (profitAmount / selling) * 100 : 0;

                const isLoss = selling > 0 && selling < wholesale;
                const isLowProfit = selling > 0 && profitMargin < 5 && !isLoss;

                return (
                  <div
                    key={product.id}
                    className={`p-4 transition-colors space-y-3 ${
                      isSelected ? 'bg-sky-50/50' : 'bg-white'
                    }`}
                  >
                    {/* Header: Checkbox + Thumbnail + Name + Code */}
                    <div className="flex items-start gap-3">
                      <div className="pt-1">
                        <label className="min-w-[44px] min-h-[44px] -m-2 flex items-center justify-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(product.id)}
                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-5 h-5 cursor-pointer"
                          />
                        </label>
                      </div>

                      <div
                        onClick={() => setCropModalProduct(product)}
                        className="w-16 h-16 shrink-0 bg-white rounded-xl border border-slate-200 overflow-hidden flex items-center justify-center p-1 cursor-pointer hover:border-sky-500 transition-all relative group shadow-2xs"
                        title="اضغط لضبط أو تعديل الصورة"
                      >
                        {product.image_url ? (
                          <img src={product.image_url} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <Crop size={20} className="text-slate-300" />
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl">
                          <Crop size={16} className="text-white" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="font-bold text-slate-800 text-sm leading-snug">
                            {product.name}
                          </span>
                          {product.manual_price_set && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                              يدوي
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 text-[11px]">
                            {product.code}
                          </span>
                          {product.group && (
                            <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-bold text-[10px]">
                              {product.group}
                            </span>
                          )}
                          {product.model && (
                            <span className="bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded font-medium text-[11px]">
                              {product.model}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Crop Alert if needed */}
                    {product.needs_crop_adjustment && (
                      <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                        <span className="text-xs text-amber-900 font-bold flex items-center gap-1">
                          <AlertTriangle size={13} className="text-amber-700" />
                          يحتاج ضبط القص للتناسب مع الكتالوج:
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUseFullImageDirectly(product)}
                            className="min-h-[44px] flex-1 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <Maximize2 size={13} />
                            الصورة كاملة
                          </button>
                          <button
                            type="button"
                            onClick={() => setCropModalProduct(product)}
                            className="min-h-[44px] flex-1 px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-950 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <Crop size={13} />
                            اضبط القص
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Category Selection */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">القسم / التصنيف:</label>
                      <select
                        value={product.category}
                        onChange={(e) => handleSingleProductCategoryChange(product, e.target.value)}
                        className="w-full min-h-[44px] bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3 py-2 cursor-pointer focus:ring-2 focus:ring-sky-500 focus:outline-none transition-all"
                      >
                        {categories.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                        {!categories.some((c) => c.name === product.category) && (
                          <option value={product.category}>{product.category}</option>
                        )}
                      </select>
                    </div>

                    {/* Pricing Grid */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50/80 p-3 rounded-xl border border-slate-200/80">
                      {/* Wholesale (Editable Inline!) */}
                      <div>
                        <span className="text-[11px] font-bold text-amber-800 block mb-1">
                          سعر الجملة (خاص):
                        </span>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            dir="ltr"
                            value={wholesale > 0 ? wholesale : ''}
                            onChange={(e) => handleWholesalePriceChange(product, e.target.value)}
                            placeholder="0"
                            className="w-full min-h-[44px] py-2 pl-9 pr-2.5 text-center font-mono rounded-xl text-sm font-bold border border-amber-200 bg-white text-slate-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                          />
                          <span className="absolute left-2.5 top-3 text-xs font-bold text-slate-400 pointer-events-none">
                            ج.م
                          </span>
                        </div>
                        {product.price_changed && (
                          <div className="inline-flex items-center gap-1 mt-1 text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded">
                            <AlertTriangle size={10} />
                            كان {product.previous_wholesale_price || 0}
                          </div>
                        )}
                        {product.price_source_note && (
                          <div className="text-[10px] text-amber-800 font-medium mt-1">
                            {product.price_source_note}
                          </div>
                        )}
                      </div>

                      {/* Selling Price Input */}
                      <div>
                        <span className="text-[11px] font-bold text-slate-700 block mb-1">
                          سعر البيع للجمهور:
                        </span>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            step={allowFractions ? 'any' : '1'}
                            dir="ltr"
                            value={selling > 0 ? selling : ''}
                            onChange={(e) => handleSellingPriceChange(product, e.target.value)}
                            placeholder="حدد السعر"
                            className={`w-full min-h-[44px] py-2 pl-9 pr-2.5 text-center font-mono rounded-xl text-sm font-bold border transition-all ${
                              selling <= 0
                                ? 'border-amber-300 bg-amber-50/50 text-amber-900'
                                : isLoss
                                ? 'border-red-400 bg-red-50 text-red-700'
                                : 'border-slate-300 bg-white text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                            }`}
                          />
                          <span className="absolute left-2.5 top-3 text-xs font-bold text-slate-400 pointer-events-none">
                            ج.م
                          </span>
                        </div>
                      </div>

                      {/* Profit summary */}
                      <div className="col-span-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                        <span className="text-slate-500">الربح المتوقع:</span>
                        {selling > 0 ? (
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-black text-sm ${
                                isLoss ? 'text-red-600' : isLowProfit ? 'text-amber-600' : 'text-emerald-600'
                              }`}
                            >
                              {Number(profitAmount.toFixed(2))} ج.م {isLoss && '(خسارة)'}
                            </span>
                            <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-bold text-slate-600 text-[11px]">
                              هامش: {profitMargin.toFixed(1)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">لم يتم التسعير</span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Actions Row */}
                    <div className="flex items-center gap-2 pt-1">
                      {/* Catalog Toggle button (min-h-[44px]) */}
                      <button
                        type="button"
                        onClick={() => handleToggleInclude(product)}
                        className={`min-h-[44px] flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          product.included_in_catalog
                            ? 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <Check size={16} className={product.included_in_catalog ? 'opacity-100' : 'opacity-40'} />
                        {product.included_in_catalog ? 'في الكتالوج' : 'مستبعد'}
                      </button>

                      {/* Edit button */}
                      <button
                        type="button"
                        onClick={() => setEditModalProduct(product)}
                        className="min-h-[44px] min-w-[44px] p-2 bg-slate-100 hover:bg-sky-50 text-slate-600 hover:text-sky-600 rounded-xl transition-colors flex items-center justify-center cursor-pointer"
                        title="تعديل"
                      >
                        <Edit2 size={16} />
                      </button>

                      {/* Crop button */}
                      <button
                        type="button"
                        onClick={() => setCropModalProduct(product)}
                        className="min-h-[44px] min-w-[44px] p-2 bg-slate-100 hover:bg-sky-50 text-slate-600 hover:text-sky-600 rounded-xl transition-colors flex items-center justify-center cursor-pointer"
                        title="قص وتدوير"
                      >
                        <Crop size={16} />
                      </button>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(product.id)}
                        className="min-h-[44px] min-w-[44px] p-2 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-xl transition-colors flex items-center justify-center cursor-pointer"
                        title="حذف"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View (>= 1280px) */}
            <div className="hidden xl:block overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-xs">
                  <tr>
                    <th className="py-3 px-2.5 w-10 text-center">#</th>
                    <th className="py-3 px-2 w-16 text-center">الصورة</th>
                    <th className="py-3 px-2.5">اسم المنتج والموديل</th>
                    <th className="py-3 px-2">النوع</th>
                    <th className="py-3 px-2">
                      <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md font-bold">
                        سعر الجملة (خاص)
                      </span>
                    </th>
                    <th className="py-3 px-2">سعر البيع للجمهور</th>
                    <th className="py-3 px-2">الربح المتوقع</th>
                    <th className="py-3 px-2 text-center">بالكتالوج</th>
                    <th className="py-3 px-2.5 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((product) => {
                    const isSelected = selectedIds.has(product.id);
                    const wholesale = toSafeNum(product.wholesale_price);
                    const selling = toSafeNum(product.selling_price);
                    const profitAmount = selling - wholesale;
                    const profitMargin = selling > 0 ? (profitAmount / selling) * 100 : 0;

                    const isLoss = selling > 0 && selling < wholesale;
                    const isLowProfit = selling > 0 && profitMargin < 5 && !isLoss;

                    return (
                      <tr
                        key={product.id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          isSelected ? 'bg-sky-50/40' : ''
                        }`}
                      >
                        <td className="py-2.5 px-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(product.id)}
                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4 cursor-pointer"
                          />
                        </td>

                        <td className="py-2 px-2 text-center">
                          <div
                            onClick={() => setCropModalProduct(product)}
                            className="w-12 h-12 xl:w-14 xl:h-14 mx-auto bg-white rounded-lg border border-slate-200 overflow-hidden flex items-center justify-center p-1 cursor-pointer hover:border-sky-500 transition-all group relative"
                            title="اضغط لتعديل أو ضبط الصورة"
                          >
                            {product.image_url ? (
                              <img src={product.image_url} alt="" className="w-full h-full object-contain" />
                            ) : (
                              <Crop size={18} className="text-slate-300" />
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-lg">
                              <Crop size={16} className="text-white" />
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 px-2.5 min-w-[180px] max-w-[280px]">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="font-semibold text-slate-800 text-sm leading-snug">
                              {product.name}
                            </span>
                            {product.manual_price_set && (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                                يدوي
                              </span>
                            )}
                          </div>

                          {/* Crop alert and quick action buttons */}
                          {product.needs_crop_adjustment && (
                            <div className="flex flex-wrap items-center gap-1.5 my-1.5 p-1.5 bg-amber-50 border border-amber-300 rounded-lg">
                              <span className="text-[10px] text-amber-900 font-bold flex items-center gap-1">
                                <AlertTriangle size={11} className="text-amber-700" />
                                يحتاج ضبط القص:
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUseFullImageDirectly(product)}
                                className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-800 text-[10px] font-bold rounded border border-slate-300 transition-colors cursor-pointer flex items-center gap-1"
                                title="استخدم الصورة كاملة بدون قص"
                              >
                                <Maximize2 size={10} />
                                استخدم الصورة كاملة
                              </button>
                              <button
                                type="button"
                                onClick={() => setCropModalProduct(product)}
                                className="px-2 py-0.5 bg-amber-200 hover:bg-amber-300 text-amber-950 text-[10px] font-bold rounded transition-colors cursor-pointer flex items-center gap-1"
                                title="اضبط القص بإيدي"
                              >
                                <Crop size={10} />
                                اضبط القص بإيدي
                              </button>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-slate-500">
                            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                              {product.code}
                            </span>
                            {product.group && (
                              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-bold text-[10px]">
                                الماركة: {product.group}
                              </span>
                            )}
                            {product.model && (
                              <span className="bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded font-medium">
                                الموديل: {product.model}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2.5 px-2">
                          <select
                            value={product.category}
                            onChange={(e) => handleSingleProductCategoryChange(product, e.target.value)}
                            className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold rounded-lg px-2 py-1.5 cursor-pointer focus:ring-2 focus:ring-sky-500 focus:outline-none transition-all max-w-[130px] truncate"
                            title="تغيير قسم المنتج"
                          >
                            {categories.map((c) => (
                              <option key={c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                            {!categories.some((c) => c.name === product.category) && (
                              <option value={product.category}>{product.category}</option>
                            )}
                          </select>
                        </td>

                        <td className="py-2.5 px-2">
                          <div className="relative w-24 2xl:w-28">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              dir="ltr"
                              value={wholesale > 0 ? wholesale : ''}
                              onChange={(e) => handleWholesalePriceChange(product, e.target.value)}
                              placeholder="0"
                              className="w-full py-1.5 pl-8 pr-2 text-center font-mono rounded-lg text-sm font-bold border border-amber-200 bg-white text-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                            />
                            <span className="absolute left-2 top-2 text-[11px] font-bold text-slate-400 pointer-events-none">
                              ج.م
                            </span>
                          </div>
                          {product.price_changed && (
                            <div className="inline-flex items-center gap-1 mt-0.5 text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded">
                              <AlertTriangle size={10} />
                              تغير من {product.previous_wholesale_price || 0} ج.م
                            </div>
                          )}
                          {product.price_source_note === 'سعر مقروء من الصورة، راجعه' && (
                            <div className="inline-flex items-center gap-1 mt-1 text-[9px] bg-amber-50 text-amber-900 border border-amber-300 font-bold px-1.5 py-0.5 rounded">
                              <Tag size={10} className="text-amber-700" />
                              سعر مقروء من الصورة، راجعه
                            </div>
                          )}
                          {product.price_source_note === 'أسعار متعددة' && (
                            <div className="inline-flex items-center gap-1 mt-1 text-[9px] bg-orange-50 text-orange-900 border border-orange-300 font-bold px-1.5 py-0.5 rounded">
                              <AlertTriangle size={10} className="text-orange-700" />
                              أسعار متعددة
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-2">
                          <div className="relative w-24 2xl:w-28">
                            <input
                              type="number"
                              min="0"
                              step={allowFractions ? 'any' : '1'}
                              dir="ltr"
                              value={selling > 0 ? selling : ''}
                              onChange={(e) => handleSellingPriceChange(product, e.target.value)}
                              placeholder="حدد السعر"
                              className={`w-full py-1.5 pl-8 pr-2 text-center font-mono rounded-lg text-sm font-bold border transition-all ${
                                selling <= 0
                                  ? 'border-amber-300 bg-amber-50/50 text-amber-900'
                                  : isLoss
                                  ? 'border-red-400 bg-red-50 text-red-700'
                                  : 'border-slate-300 bg-white text-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                              }`}
                            />
                            <span className="absolute left-2 top-2 text-[11px] font-bold text-slate-400 pointer-events-none">
                              ج.م
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 px-2 whitespace-nowrap">
                          {selling > 0 ? (
                            <div>
                              <div
                                className={`text-sm font-black flex items-center gap-1 tabular-nums ${
                                  isLoss ? 'text-red-600' : isLowProfit ? 'text-amber-600' : 'text-emerald-600'
                                }`}
                              >
                                {Number(profitAmount.toFixed(2))} ج.م
                                {isLoss && <span className="text-[10px] font-bold">(خسارة!)</span>}
                              </div>
                              <div className="text-[11px] text-slate-500 tabular-nums">
                                هامش: {profitMargin.toFixed(1)}%
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>

                        <td className="py-2.5 px-2 text-center">
                          <button
                            onClick={() => handleToggleInclude(product)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors mx-auto cursor-pointer ${
                              product.included_in_catalog
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                            title="تضمين في كتالوج الـ PDF"
                          >
                            <Check size={18} className={product.included_in_catalog ? 'opacity-100' : 'opacity-20'} />
                          </button>
                        </td>

                        <td className="py-2.5 px-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setEditModalProduct(product)}
                              className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer"
                              title="تعديل"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => setCropModalProduct(product)}
                              className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer"
                              title="ضبط القص والصورة"
                            >
                              <Crop size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(product.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="حذف"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Enhanced Bulk Pricing Modal (Standard Map + 4 Methods + Category Rules + Preview & Undo) */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                  <SlidersHorizontal size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">التسعير الجماعي (الخريطة المعيارية والخيارات)</h3>
                  <p className="text-xs text-slate-500">اختر طريقة تسعير لتطبيقها بنقرة واحدة مع المعاينة والتراجع</p>
                </div>
              </div>
              <button
                onClick={() => setShowBulkModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-sm text-slate-700">
              {/* Target Scope */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  تطبيق هذه القاعدة على:
                </label>
                <select
                  value={bulkTarget}
                  onChange={(e) => setBulkTarget(e.target.value as any)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-sky-500 cursor-pointer"
                >
                  <option value="all">جميع المنتجات في البرنامج ({products.length} منتج)</option>
                  <option value="selected">المنتجات المحددة حالياً ({selectedIds.size} منتج)</option>
                  <optgroup label="أقسام مخصصة (قاعدة خاصة بكل فئة):">
                    {categories.map((c) => (
                      <option key={c.name} value={c.name}>
                        قسم {c.name} فقط ({products.filter((p) => p.category === c.name).length} منتج)
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Pricing Methods Tabs (Standard Map First!) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  اختر طريقة تسعير البيع:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { id: 'standard_map', title: 'الخريطة المعيارية (تلقائية)', icon: Sparkles, highlight: true },
                    { id: 'percent_markup', title: '(أ) نسبة على الجملة', icon: Percent },
                    { id: 'fixed_add', title: '(ب) مبلغ ثابت بالجنيه', icon: SlidersHorizontal },
                    { id: 'profit_margin', title: '(ج) هامش من سعر البيع', icon: TrendingUp },
                    { id: 'tiers', title: '(د) شرايح أعملها بنفسي', icon: Layers },
                  ].map((m) => {
                    const Icon = m.icon;
                    const isSelected = pricingMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPricingMethod(m.id as PricingMethodType)}
                        className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                          isSelected
                            ? 'border-sky-500 bg-sky-50 text-sky-800 font-bold ring-1 ring-sky-500 shadow-2xs'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-1 mb-1">
                          <Icon size={15} className={isSelected ? 'text-sky-600' : 'text-slate-400'} />
                          {m.highlight && (
                            <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1 rounded">
                              جاهزة
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] leading-tight">{m.title}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Parameter Configuration per method */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                {/* 1. STANDARD PRICING MAP (الخريطة المعيارية) */}
                {pricingMethod === 'standard_map' && (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <div>
                        <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                          <Sparkles size={14} className="text-sky-600" />
                          الخريطة المعيارية المعتمدة لإكسسوارات الموبايل:
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          الحد الأعلى بيدخل في شريحته (مثال: سعر جملة 100ج يقع في شريحة 50-100 ويزيد 7ج).
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleResetStandardMapToDefault}
                          className="text-[11px] text-sky-700 bg-white border border-sky-200 hover:bg-sky-50 font-bold px-2.5 py-1 rounded-lg cursor-pointer flex items-center gap-1"
                        >
                          <RefreshCw size={12} />
                          استعادة الخريطة الأصلية
                        </button>
                        <button
                          type="button"
                          onClick={handleAddStandardMapRow}
                          className="text-[11px] text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50 font-bold px-2.5 py-1 rounded-lg cursor-pointer flex items-center gap-1"
                        >
                          <Plus size={12} />
                          إضافة صف
                        </button>
                      </div>
                    </div>

                    {/* Standard Map Table */}
                    <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl bg-white">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                          <tr>
                            <th className="p-2 w-12 text-center">#</th>
                            <th className="p-2">سعر الجملة من</th>
                            <th className="p-2">إلى (الحد الأعلى)</th>
                            <th className="p-2">الزيادة الثابتة (ج.م)</th>
                            <th className="p-2 w-10 text-center">حذف</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {standardMapTiers.map((tier, idx) => (
                            <tr key={tier.id} className="hover:bg-slate-50">
                              <td className="p-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                              <td className="p-2">
                                <input
                                  type="number"
                                  value={tier.from}
                                  onChange={(e) => {
                                    const val = Number(e.target.value) || 0;
                                    setStandardMapTiers((prev) =>
                                      prev.map((t) => (t.id === tier.id ? { ...t, from: val } : t))
                                    );
                                  }}
                                  className="w-20 p-1 border border-slate-200 rounded text-center font-bold"
                                />
                                <span className="mr-1 text-slate-500">ج.م</span>
                              </td>
                              <td className="p-2">
                                <input
                                  type="number"
                                  value={tier.to}
                                  onChange={(e) => {
                                    const val = Number(e.target.value) || 0;
                                    setStandardMapTiers((prev) =>
                                      prev.map((t) => (t.id === tier.id ? { ...t, to: val } : t))
                                    );
                                  }}
                                  className="w-20 p-1 border border-slate-200 rounded text-center font-bold"
                                />
                                <span className="mr-1 text-slate-500">ج.م</span>
                              </td>
                              <td className="p-2">
                                <input
                                  type="number"
                                  value={tier.increase}
                                  onChange={(e) => {
                                    const val = Number(e.target.value) || 0;
                                    setStandardMapTiers((prev) =>
                                      prev.map((t) => (t.id === tier.id ? { ...t, increase: val } : t))
                                    );
                                  }}
                                  className="w-20 p-1 border border-slate-200 rounded text-center font-bold text-emerald-700"
                                />
                                <span className="mr-1 text-slate-500">+ ج.م</span>
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveStandardMapRow(tier.id)}
                                  className="text-slate-400 hover:text-red-600 cursor-pointer"
                                >
                                  <X size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Fallback for wholesale > 4000 */}
                    <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 text-xs">
                      <span className="font-bold text-slate-700">فوق 4000 ج.م:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">نسبة زيادة مئوية:</span>
                        <input
                          type="number"
                          min="1"
                          max="90"
                          value={standardFallbackPercent}
                          onChange={(e) => setStandardFallbackPercent(Number(e.target.value) || 10)}
                          className="w-16 p-1 border border-slate-200 rounded text-center font-bold"
                        />
                        <span className="font-bold text-slate-500">%</span>
                      </div>
                    </div>

                    {/* Save & Load Standard Map Templates */}
                    <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                      {settings?.saved_standard_maps && settings.saved_standard_maps.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-500">تحميل خريطة محفوظة:</span>
                          <select
                            onChange={(e) => {
                              const tpl = settings.saved_standard_maps?.find((t) => t.id === e.target.value);
                              if (tpl) handleLoadStandardMapTemplate(tpl);
                            }}
                            defaultValue=""
                            className="p-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                          >
                            <option value="" disabled>اختر خريطة...</option>
                            {settings.saved_standard_maps.map((tpl) => (
                              <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 flex-1 max-w-xs">
                        <input
                          type="text"
                          placeholder="اسم لحفظ هذه الخريطة..."
                          value={newStandardMapName}
                          onChange={(e) => setNewStandardMapName(e.target.value)}
                          className="flex-1 p-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                        <button
                          type="button"
                          onClick={handleSaveStandardMapAsTemplate}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-xs shrink-0 cursor-pointer"
                        >
                          حفظ الخريطة
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. (أ) Markup on Wholesale */}
                {pricingMethod === 'percent_markup' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      نسبة الزيادة على سعر الجملة (%):
                    </label>
                    <div className="relative max-w-xs">
                      <input
                        type="number"
                        min="1"
                        value={markupPercent}
                        onChange={(e) => setMarkupPercent(Number(e.target.value) || 0)}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm"
                      />
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">%</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      المعادلة: سعر البيع = سعر الجملة × (1 + {markupPercent}%).
                    </p>
                  </div>
                )}

                {/* 3. (ب) Fixed Add-on */}
                {pricingMethod === 'fixed_add' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      المبلغ المضاف على سعر الجملة (ج.م):
                    </label>
                    <div className="relative max-w-xs">
                      <input
                        type="number"
                        min="1"
                        value={fixedAddAmount}
                        onChange={(e) => setFixedAddAmount(Number(e.target.value) || 0)}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm"
                      />
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">ج.م</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      المعادلة: سعر البيع = سعر الجملة + {fixedAddAmount} جنيه.
                    </p>
                  </div>
                )}

                {/* 4. (ج) Profit Margin on Selling Price */}
                {pricingMethod === 'profit_margin' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-800">
                      نسبة هامش الربح المطلوب من سعر البيع (%):
                    </label>
                    <div className="relative max-w-xs">
                      <input
                        type="number"
                        min="1"
                        max="90"
                        value={profitMarginPercent}
                        onChange={(e) => setProfitMarginPercent(Number(e.target.value) || 0)}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm"
                      />
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">%</span>
                    </div>
                    <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
                      المعادلة: <strong>سعر البيع = الجملة ÷ (1 − النسبة)</strong>. هامش الربح يُحسب من سعر البيع النهائي.
                    </div>
                  </div>
                )}

                {/* 5. (د) Custom Tiers */}
                {pricingMethod === 'tiers' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800">شرايح مخصصة:</label>
                      <button
                        type="button"
                        onClick={handleAddCustomTier}
                        className="flex items-center gap-1 px-2.5 py-1 bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold rounded-lg text-xs cursor-pointer"
                      >
                        <Plus size={14} />
                        إضافة شريحة
                      </button>
                    </div>
                    <div className="space-y-2">
                      {tiers.map((tier, idx) => (
                        <div key={tier.id} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200 text-xs">
                          <span className="text-slate-400 font-bold">{idx + 1}.</span>
                          <span className="text-slate-500">من</span>
                          <input
                            type="number"
                            value={tier.from}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              setTiers((prev) => prev.map((t) => (t.id === tier.id ? { ...t, from: val } : t)));
                            }}
                            className="w-16 p-1 border rounded text-center font-bold"
                          />
                          <span className="text-slate-500">إلى</span>
                          <input
                            type="number"
                            value={tier.to}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              setTiers((prev) => prev.map((t) => (t.id === tier.id ? { ...t, to: val } : t)));
                            }}
                            className="w-16 p-1 border rounded text-center font-bold"
                          />
                          <select
                            value={tier.increase_type}
                            onChange={(e) => {
                              const val = e.target.value as 'fixed' | 'percent';
                              setTiers((prev) => prev.map((t) => (t.id === tier.id ? { ...t, increase_type: val } : t)));
                            }}
                            className="p-1 border rounded text-xs"
                          >
                            <option value="fixed">يزيد مبلغ ثابت (ج.م)</option>
                            <option value="percent">يزيد نسبة (%)</option>
                          </select>
                          <input
                            type="number"
                            value={tier.value}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              setTiers((prev) => prev.map((t) => (t.id === tier.id ? { ...t, value: val } : t)));
                            }}
                            className="w-16 p-1 border rounded text-center font-bold"
                          />
                          {tiers.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setTiers((prev) => prev.filter((t) => t.id !== tier.id))}
                              className="text-slate-400 hover:text-red-600"
                            >
                              <X size={15} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rounding & Fractions Rule */}
                <div className="pt-2.5 border-t border-slate-200 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-800">
                      نظام الكسور والتقريب في أسعار البيع:
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const nextAllow = !allowFractions;
                        setAllowFractions(nextAllow);
                        if (nextAllow && rounding > 1) setRounding(0);
                        if (!nextAllow && rounding === 0) setRounding(5);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors ${
                        allowFractions
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'bg-slate-100 border-slate-300 text-slate-700'
                      }`}
                    >
                      {allowFractions ? 'قبول الكسور: مفعّل ✓' : 'قبول الكسور: مغلق (تقريب)'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'بدون تقريب (يقبل الكسور مثل 7.5 و 13)', val: 0 },
                      { label: 'لأقرب 1 جنيه (مثل 7 و 13)', val: 1 },
                      { label: 'لأقرب 5 جنيه', val: 5 },
                      { label: 'لأقرب 10 جنيه', val: 10 },
                    ].map((r) => (
                      <button
                        key={r.val}
                        type="button"
                        onClick={() => {
                          setRounding(r.val as 0 | 1 | 5 | 10);
                          if (r.val === 0 || r.val === 1) {
                            setAllowFractions(true);
                          }
                        }}
                        className={`py-1.5 px-2 rounded-lg border text-center text-[11px] font-bold transition-all cursor-pointer ${
                          rounding === r.val
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-2xs'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Pre-Application Preview & Manual Price Protection */}
              <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-sky-200 pb-2.5">
                  <span className="font-bold text-xs text-sky-950 flex items-center gap-1.5">
                    <Eye size={15} className="text-sky-700" />
                    معاينة قبل التطبيق الفعلي:
                  </span>
                  <div className="text-xs font-bold text-sky-900">
                    سيتم تسعير <strong>{targetProducts.length}</strong> منتج
                    {skippedManualCount > 0 && (
                      <span className="text-amber-800 font-semibold mr-1.5">
                        (تم استثناء {skippedManualCount} منتج لأنك كتبتها يدوياً)
                      </span>
                    )}
                  </div>
                </div>

                {/* Checkbox: Override manual prices (Default: false) */}
                <label className="flex items-center gap-2 cursor-pointer bg-white p-2.5 rounded-lg border border-sky-200">
                  <input
                    type="checkbox"
                    checked={overrideManualPrices}
                    onChange={(e) => setOverrideManualPrices(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-600 border-slate-300 focus:ring-sky-500 cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 block">
                      استبدل الأسعار التي كتبتها يدوياً
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      (مطفأ افتراضياً حتى لا يتم مسح أي أسعار حددتها بنفسك)
                    </span>
                  </div>
                </label>

                {/* Preview sample table */}
                {previewSamples.length > 0 && (
                  <div className="overflow-x-auto bg-white rounded-lg border border-slate-200 text-xs">
                    <table className="w-full text-right">
                      <thead className="bg-slate-100 text-slate-700 font-bold">
                        <tr>
                          <th className="p-2">اسم الصنف</th>
                          <th className="p-2">سعر الجملة</th>
                          <th className="p-2">السعر الحالي</th>
                          <th className="p-2 text-emerald-700">السعر الجديد المقترح</th>
                          <th className="p-2">هامش الربح</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewSamples.map((s) => (
                          <tr key={s.id}>
                            <td className="p-2 font-medium max-w-[180px] truncate">{s.name}</td>
                            <td className="p-2">{s.wholesale} ج.م</td>
                            <td className="p-2 text-slate-500">{s.currentSelling ? `${s.currentSelling} ج.م` : '-'}</td>
                            <td className="p-2 font-bold text-emerald-700">{s.newSelling} ج.م</td>
                            <td className="p-2 font-semibold text-slate-700">+{s.profit} ج.م ({s.margin}%)</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 bg-slate-50">
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="py-2 px-4 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleApplyBulkPricing}
                className="flex items-center gap-2 py-2.5 px-6 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-600/20 transition-all cursor-pointer"
              >
                <Check size={16} />
                تطبيق التسعير الآن على ({targetProducts.length}) منتج
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Upload Review Modal */}
      {excelSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">مراجعة تحديث الأسعار من إكسيل</h3>
                <p className="text-xs text-slate-500">الملف: {excelFileName}</p>
              </div>
              <button
                onClick={() => setExcelSummary(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-4 space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                  <p className="text-xs font-semibold text-emerald-700">صفوف ستتحدث</p>
                  <p className="text-2xl font-black text-emerald-800 mt-1">
                    {excelSummary.validUpdates.length}
                  </p>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center">
                  <p className="text-xs font-semibold text-amber-700">أكواد غير موجودة</p>
                  <p className="text-2xl font-black text-amber-800 mt-1">
                    {excelSummary.missingCodes.length}
                  </p>
                </div>
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-center">
                  <p className="text-xs font-semibold text-red-700">أسعار خاطئة/فارغة</p>
                  <p className="text-2xl font-black text-red-800 mt-1">
                    {excelSummary.invalidPrices.length}
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                تتم المطابقة على عمود "الكود" الموجود في شيت الإكسيل لتعديل سعر البيع مباشرة.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={() => setExcelSummary(null)}
                className="py-2 px-4 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={confirmApplyExcelUpdates}
                disabled={excelSummary.validUpdates.length === 0}
                className="flex items-center gap-2 py-2 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <Check size={16} />
                تأكيد وتحديث ({excelSummary.validUpdates.length}) منتج
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Crop Modal */}
      {cropModalProduct && (
        <CropAdjustModal
          product={cropModalProduct}
          onClose={() => setCropModalProduct(null)}
          onSave={async (updated) => {
            await saveProduct(updated);
            const nextList = productsRef.current.map((p) => (p.id === updated.id ? updated : p));
            productsRef.current = nextList;
            onProductsUpdated(nextList);
          }}
        />
      )}

      {/* Edit Product Details Modal */}
      {editModalProduct && (
        <EditProductModal
          product={editModalProduct}
          availableCategories={categories.map((c) => c.name)}
          onClose={() => setEditModalProduct(null)}
          onSave={async (updated) => {
            await saveProduct(updated);
            onProductsUpdated(products.map((p) => (p.id === updated.id ? updated : p)));
          }}
        />
      )}

      {/* Category Manager Modal */}
      {isCategoryManagerOpen && settings && onSettingsUpdated && (
        <CategoryManagerModal
          settings={settings}
          products={products}
          onSettingsUpdated={onSettingsUpdated}
          onProductsUpdated={onProductsUpdated}
          onClose={() => setIsCategoryManagerOpen(false)}
        />
      )}

      {/* Bulk Move Category Modal */}
      {isBulkMoveModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-100">
          <div
            className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
            dir="rtl"
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50 text-amber-900">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-800">
                  <FolderInput size={18} />
                </div>
                <h3 className="font-bold text-sm">نقل ({selectedIds.size}) منتج محدد إلى قسم جديد</h3>
              </div>
              <button
                onClick={() => setIsBulkMoveModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-700">
              <p className="text-slate-600 leading-relaxed">
                حدد القسم الذي ترغب في نقل كافة المنتجات المحددة (عددها{' '}
                <strong className="text-slate-900 font-bold">{selectedIds.size}</strong>) إليه مباشرة:
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">القسم المستهدف:</label>
                <select
                  value={bulkMoveTargetCategory}
                  onChange={(e) => setBulkMoveTargetCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                >
                  {categories.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({products.filter((p) => p.category === c.name).length} منتج حالياً)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsBulkMoveModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-200 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleBulkMoveConfirm}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs shadow-amber-600/20 cursor-pointer"
              >
                <Check size={14} />
                تأكيد النقل الآن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Export Review Modal before Excel download */}
      {showExcelReviewModal && settings && (
        <CatalogReviewModal
          products={filteredProducts}
          settings={settings}
          actionTitle="تحميل إكسيل"
          onConfirm={() => {
            setShowExcelReviewModal(false);
            exportProductsToExcel(filteredProducts);
          }}
          onClose={() => setShowExcelReviewModal(false)}
          onProductsUpdated={(updatedList) => {
            const updatedMap = new Map(updatedList.map((p) => [p.id, p]));
            onProductsUpdated(products.map((p) => updatedMap.get(p.id) || p));
          }}
        />
      )}
    </div>
  );
};
