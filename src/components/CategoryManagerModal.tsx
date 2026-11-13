import React, { useState, useMemo, useEffect } from 'react';
import {
  FolderTree,
  Plus,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  GitMerge,
  Check,
  AlertTriangle,
  Eye,
  Layers,
  X,
  Undo2,
  Tag,
  Palette,
  Headphones,
  Mic,
  PenTool,
  Cable,
  Zap,
  Plug,
  Car,
  BatteryCharging,
  Shield,
  Smartphone,
  Box,
  Folder,
  CheckCircle2,
  HelpCircle,
  Package,
} from 'lucide-react';
import { Product, CatalogSettings, CategoryDefinition, DEFAULT_CATEGORIES } from '../types';
import { saveSettings, saveProductsBatch } from '../utils/db';

interface CategoryManagerModalProps {
  settings: CatalogSettings;
  products: Product[];
  onSettingsUpdated: (newSettings: CatalogSettings) => void;
  onProductsUpdated: (newProducts: Product[]) => void;
  onClose: () => void;
}

// Preset color options for category badges
const PRESET_COLORS = [
  { hex: '#0284c7', label: 'سماوي' },
  { hex: '#4f46e5', label: 'نيلي' },
  { hex: '#8b5cf6', label: 'بنفسجي' },
  { hex: '#059669', label: 'زمردي' },
  { hex: '#10b981', label: 'أخضر' },
  { hex: '#d97706', label: 'كهرماني' },
  { hex: '#f97316', label: 'برتقالي' },
  { hex: '#ec4899', label: 'وردي' },
  { hex: '#64748b', label: 'رمادي' },
  { hex: '#0f172a', label: 'داكن' },
];

// Available icons
const AVAILABLE_ICONS = [
  { id: 'headphones', icon: Headphones, label: 'سماعة' },
  { id: 'mic', icon: Mic, label: 'مايك' },
  { id: 'pen-tool', icon: PenTool, label: 'قلم' },
  { id: 'cable', icon: Cable, label: 'كابل' },
  { id: 'zap', icon: Zap, label: 'شاحن' },
  { id: 'plug', icon: Plug, label: 'رأس شاحن' },
  { id: 'car', icon: Car, label: 'شاحن سيارة' },
  { id: 'battery-charging', icon: BatteryCharging, label: 'باوربانك' },
  { id: 'shield', icon: Shield, label: 'اسكرينة/حماية' },
  { id: 'smartphone', icon: Smartphone, label: 'جراب/موبايل' },
  { id: 'box', icon: Box, label: 'باكيدج' },
  { id: 'folder', icon: Folder, label: 'مجلد/أخرى' },
];

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  settings,
  products,
  onSettingsUpdated,
  onProductsUpdated,
  onClose,
}) => {
  // Current categories sorted by order
  const categories = useMemo(() => {
    const list = settings.categories && settings.categories.length > 0
      ? settings.categories
      : DEFAULT_CATEGORIES;
    return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [settings.categories]);

  // Active view tab: 'list' or 'preview_order'
  const [activeTab, setActiveTab] = useState<'list' | 'preview_order'>('list');

  // Search filter inside categories modal
  const [searchFilter, setSearchFilter] = useState('');

  // Add / Edit Modal State
  const [isEditing, setIsEditing] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDefinition | null>(null);
  const [formName, setFormName] = useState('');
  const [formCatalogTitle, setFormCatalogTitle] = useState('');
  const [formColor, setFormColor] = useState('#0284c7');
  const [formIcon, setFormIcon] = useState('folder');
  const [formError, setFormError] = useState('');

  // Delete Modal State
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryDefinition | null>(null);
  const [targetCategoryForMove, setTargetCategoryForMove] = useState<string>('');

  // Merge Modal State
  const [categoryToMerge, setCategoryToMerge] = useState<CategoryDefinition | null>(null);
  const [targetCategoryForMerge, setTargetCategoryForMerge] = useState<string>('');

  // Undo Toast state
  const [undoData, setUndoData] = useState<{
    deletedCategory: CategoryDefinition;
    migratedProducts: { id: string; prevCategory: string }[];
    destinationCategory: string;
    undoExpiresAt: number;
  } | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState<number>(0);

  // Success message toast inside modal
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMessage({ type, text });
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // 10-second Countdown for Undo Toast
  useEffect(() => {
    if (!undoData) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((undoData.undoExpiresAt - Date.now()) / 1000));
      setUndoSecondsLeft(remaining);
      if (remaining <= 0) {
        setUndoData(null);
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [undoData]);

  // Product counts per category
  const productCountMap = useMemo(() => {
    const map = new Map<string, { total: number; eligibleForCatalog: number }>();
    categories.forEach((c) => {
      map.set(c.name, { total: 0, eligibleForCatalog: 0 });
    });

    products.forEach((p) => {
      const cat = p.category || 'متنوعة';
      const cur = map.get(cat) || { total: 0, eligibleForCatalog: 0 };
      cur.total += 1;
      if (p.included_in_catalog && (p.selling_price || 0) > 0 && p.name?.trim()) {
        cur.eligibleForCatalog += 1;
      }
      map.set(cat, cur);
    });

    return map;
  }, [categories, products]);

  // Helper to get Category Icon component
  const renderCategoryIcon = (iconId?: string, size = 16, className = '') => {
    const found = AVAILABLE_ICONS.find((i) => i.id === iconId);
    const IconComp = found ? found.icon : Folder;
    return <IconComp size={size} className={className} />;
  };

  // Re-index orders helper (1, 2, 3...)
  const reindexOrders = (cats: CategoryDefinition[]): CategoryDefinition[] => {
    return cats.map((c, idx) => ({ ...c, order: idx + 1 }));
  };

  // Open Add Dialog
  const handleOpenAdd = () => {
    setEditingCategory(null);
    setFormName('');
    setFormCatalogTitle('');
    setFormColor('#0284c7');
    setFormIcon('folder');
    setFormError('');
    setIsEditing(true);
  };

  // Open Edit Dialog
  const handleOpenEdit = (cat: CategoryDefinition) => {
    setEditingCategory(cat);
    setFormName(cat.name);
    setFormCatalogTitle(cat.catalog_title || '');
    setFormColor(cat.color || '#0284c7');
    setFormIcon(cat.icon || 'folder');
    setFormError('');
    setIsEditing(true);
  };

  // Save Add or Edit
  const handleSaveCategory = async () => {
    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError('يرجى كتابة اسم القسم.');
      return;
    }

    // Check if name already exists (excluding the category currently being edited)
    const exists = categories.some(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase() && c.id !== editingCategory?.id
    );
    if (exists) {
      setFormError('القسم ده موجود بالفعل! يرجى اختيار اسم مختلف.');
      return;
    }

    setFormError('');

    if (editingCategory) {
      // EDIT MODE
      const oldName = editingCategory.name;
      const isRenamed = oldName !== trimmedName;

      // 1. Update category definition
      const updatedCategories = categories.map((c) => {
        if (c.id === editingCategory.id) {
          return {
            ...c,
            name: trimmedName,
            catalog_title: formCatalogTitle.trim() || undefined,
            color: formColor,
            icon: formIcon,
          };
        }
        return c;
      });

      // 2. If renamed, update all products belonging to oldName
      let updatedProducts = products;
      if (isRenamed) {
        const toSaveBatch: Product[] = [];
        updatedProducts = products.map((p) => {
          if (p.category === oldName) {
            const upd = { ...p, category: trimmedName, updated_at: Date.now() };
            toSaveBatch.push(upd);
            return upd;
          }
          return p;
        });

        if (toSaveBatch.length > 0) {
          await saveProductsBatch(toSaveBatch);
          onProductsUpdated(updatedProducts);
        }
      }

      // 3. If renamed, update category_pricing_rules if present
      const updatedPricingRules = { ...(settings.category_pricing_rules || {}) };
      if (isRenamed && updatedPricingRules[oldName]) {
        updatedPricingRules[trimmedName] = updatedPricingRules[oldName];
        delete updatedPricingRules[oldName];
      }

      const newSettings: CatalogSettings = {
        ...settings,
        categories: updatedCategories,
        category_pricing_rules: updatedPricingRules,
      };

      await saveSettings(newSettings);
      onSettingsUpdated(newSettings);

      showFeedback(
        isRenamed
          ? `تم تعديل اسم القسم وتحديث ${products.filter((p) => p.category === oldName).length} منتج تلقائياً.`
          : 'تم حفظ تعديلات القسم بنجاح.'
      );
    } else {
      // ADD MODE
      const newCat: CategoryDefinition = {
        id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: trimmedName,
        catalog_title: formCatalogTitle.trim() || undefined,
        color: formColor,
        icon: formIcon,
        order: categories.length + 1,
        created_at: Date.now(),
      };

      const updatedCategories = [...categories, newCat];
      const newSettings: CatalogSettings = {
        ...settings,
        categories: updatedCategories,
      };

      await saveSettings(newSettings);
      onSettingsUpdated(newSettings);
      showFeedback(`تمت إضافة قسم "${trimmedName}" بنجاح.`);
    }

    setIsEditing(false);
  };

  // Move category Up
  const handleMoveUp = async (index: number) => {
    if (index <= 0) return;
    const newCats = [...categories];
    const temp = newCats[index - 1];
    newCats[index - 1] = newCats[index];
    newCats[index] = temp;

    const reordered = reindexOrders(newCats);
    const newSettings: CatalogSettings = { ...settings, categories: reordered };
    await saveSettings(newSettings);
    onSettingsUpdated(newSettings);
  };

  // Move category Down
  const handleMoveDown = async (index: number) => {
    if (index >= categories.length - 1) return;
    const newCats = [...categories];
    const temp = newCats[index + 1];
    newCats[index + 1] = newCats[index];
    newCats[index] = temp;

    const reordered = reindexOrders(newCats);
    const newSettings: CatalogSettings = { ...settings, categories: reordered };
    await saveSettings(newSettings);
    onSettingsUpdated(newSettings);
  };

  // Prompt delete
  const handlePromptDelete = (cat: CategoryDefinition) => {
    const stats = productCountMap.get(cat.name) || { total: 0, eligibleForCatalog: 0 };
    setCategoryToDelete(cat);

    // Pick first available other category as default migration target
    const otherCats = categories.filter((c) => c.id !== cat.id);
    const defaultTarget = otherCats.find((c) => c.name === 'متنوعة')?.name || otherCats[0]?.name || 'متنوعة';
    setTargetCategoryForMove(defaultTarget);
  };

  // Confirm delete and migration
  const handleConfirmDelete = async () => {
    if (!categoryToDelete) return;

    const catName = categoryToDelete.name;
    const count = (productCountMap.get(catName) || { total: 0 }).total;

    let updatedProducts = products;
    const migratedProducts: { id: string; prevCategory: string }[] = [];

    // If category has products, migrate them to targetCategoryForMove
    if (count > 0 && targetCategoryForMove) {
      const toSaveBatch: Product[] = [];
      updatedProducts = products.map((p) => {
        if (p.category === catName) {
          migratedProducts.push({ id: p.id, prevCategory: catName });
          const upd = { ...p, category: targetCategoryForMove, updated_at: Date.now() };
          toSaveBatch.push(upd);
          return upd;
        }
        return p;
      });

      if (toSaveBatch.length > 0) {
        await saveProductsBatch(toSaveBatch);
        onProductsUpdated(updatedProducts);
      }
    }

    // Remove category from settings
    const remainingCats = categories.filter((c) => c.id !== categoryToDelete.id);
    const reordered = reindexOrders(remainingCats);
    const newSettings: CatalogSettings = { ...settings, categories: reordered };
    await saveSettings(newSettings);
    onSettingsUpdated(newSettings);

    // Setup 10-second undo
    setUndoData({
      deletedCategory: categoryToDelete,
      migratedProducts,
      destinationCategory: targetCategoryForMove,
      undoExpiresAt: Date.now() + 10000,
    });
    setUndoSecondsLeft(10);

    showFeedback(
      count > 0
        ? `تم حذف قسم "${catName}" ونقل ${count} منتج إلى قسم "${targetCategoryForMove}".`
        : `تم حذف قسم "${catName}" بنجاح.`
    );

    setCategoryToDelete(null);
  };

  // Handle Undo of Category Deletion
  const handleUndoDelete = async () => {
    if (!undoData) return;

    const { deletedCategory, migratedProducts } = undoData;

    // 1. Restore category back at its original order position
    const restoredCategories = [...categories];
    const insertIndex = Math.min(
      restoredCategories.length,
      Math.max(0, (deletedCategory.order ?? restoredCategories.length + 1) - 1)
    );
    restoredCategories.splice(insertIndex, 0, deletedCategory);
    const reordered = reindexOrders(restoredCategories);

    const newSettings: CatalogSettings = { ...settings, categories: reordered };
    await saveSettings(newSettings);
    onSettingsUpdated(newSettings);

    // 2. Revert products back to deletedCategory.name
    if (migratedProducts.length > 0) {
      const migratedIds = new Set(migratedProducts.map((m) => m.id));
      const toSaveBatch: Product[] = [];
      const updatedProducts = products.map((p) => {
        if (migratedIds.has(p.id)) {
          const upd = { ...p, category: deletedCategory.name, updated_at: Date.now() };
          toSaveBatch.push(upd);
          return upd;
        }
        return p;
      });

      await saveProductsBatch(toSaveBatch);
      onProductsUpdated(updatedProducts);
    }

    showFeedback(`تم التراجع بنجاح! استُعيد قسم "${deletedCategory.name}" وكافة منتجاته.`);
    setUndoData(null);
  };

  // Open Merge Dialog
  const handleOpenMerge = (cat: CategoryDefinition) => {
    setCategoryToMerge(cat);
    const otherCats = categories.filter((c) => c.id !== cat.id);
    setTargetCategoryForMerge(otherCats[0]?.name || '');
  };

  // Confirm Merge
  const handleConfirmMerge = async () => {
    if (!categoryToMerge || !targetCategoryForMerge) return;

    const sourceName = categoryToMerge.name;
    const targetName = targetCategoryForMerge;
    const sourceCount = (productCountMap.get(sourceName) || { total: 0 }).total;

    // Migrate all products of sourceName to targetName
    const toSaveBatch: Product[] = [];
    const updatedProducts = products.map((p) => {
      if (p.category === sourceName) {
        const upd = { ...p, category: targetName, updated_at: Date.now() };
        toSaveBatch.push(upd);
        return upd;
      }
      return p;
    });

    if (toSaveBatch.length > 0) {
      await saveProductsBatch(toSaveBatch);
      onProductsUpdated(updatedProducts);
    }

    // Remove source category
    const remainingCats = categories.filter((c) => c.id !== categoryToMerge.id);
    const reordered = reindexOrders(remainingCats);
    const newSettings: CatalogSettings = { ...settings, categories: reordered };
    await saveSettings(newSettings);
    onSettingsUpdated(newSettings);

    showFeedback(`تم دمج قسم "${sourceName}" مع "${targetName}" ونقل ${sourceCount} منتج بنجاح.`);
    setCategoryToMerge(null);
  };

  // Filtered categories in list view
  const filteredCategories = useMemo(() => {
    if (!searchFilter.trim()) return categories;
    const q = searchFilter.toLowerCase();
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.catalog_title && c.catalog_title.toLowerCase().includes(q))
    );
  }, [categories, searchFilter]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div
        className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-sky-50/60 via-white to-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-md shadow-sky-600/20">
              <FolderTree size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-800">
                  إدارة الأقسام وترتيب الكتالوج
                </h2>
                <span className="bg-sky-100 text-sky-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {categories.length} قسم
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                رتّب، أضف، عدّل أو ادمج أقسام المنتجات. الترتيب هنا يتحكم مباشرة في صفحات الكتالوج.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar & Tabs */}
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setActiveTab('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'list'
                  ? 'bg-white text-slate-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers size={14} />
              قائمة الأقسام ({categories.length})
            </button>
            <button
              onClick={() => setActiveTab('preview_order')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'preview_order'
                  ? 'bg-white text-sky-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye size={14} />
              معاينة ترتيب الكتالوج
            </button>
          </div>

          {/* Action: Add Category */}
          <div className="flex items-center gap-2">
            {activeTab === 'list' && (
              <input
                type="text"
                placeholder="بحث في الأقسام..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-1.5 w-36 sm:w-44 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            )}
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs shadow-sky-600/20 cursor-pointer"
            >
              <Plus size={15} />
              إضافة قسم جديد
            </button>
          </div>
        </div>

        {/* Feedback message banner */}
        {feedbackMessage && (
          <div
            className={`px-5 py-2.5 text-xs font-bold flex items-center gap-2 border-b animate-in fade-in ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle size={16} className="text-red-600 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'list' ? (
            /* Category List View */
            <div className="space-y-2.5">
              {filteredCategories.length === 0 ? (
                <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <FolderTree size={36} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-semibold">لا توجد أقسام تطابق البحث</p>
                  <button
                    onClick={() => setSearchFilter('')}
                    className="text-xs text-sky-600 hover:underline mt-1 font-bold cursor-pointer"
                  >
                    مسح البحث
                  </button>
                </div>
              ) : (
                filteredCategories.map((cat, idx) => {
                  const stats = productCountMap.get(cat.name) || { total: 0, eligibleForCatalog: 0 };
                  const isFirst = idx === 0;
                  const isLast = idx === categories.length - 1;

                  return (
                    <div
                      key={cat.id}
                      className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all shadow-2xs hover:shadow-xs group"
                    >
                      {/* Left: Drag/Order Handle + Icon + Names */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* Order number */}
                        <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                          #{cat.order || idx + 1}
                        </div>

                        {/* Category Color & Icon */}
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs"
                          style={{ backgroundColor: cat.color || '#0284c7' }}
                        >
                          {renderCategoryIcon(cat.icon, 18, 'text-white')}
                        </div>

                        {/* Title details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800 text-sm">{cat.name}</span>
                            {cat.catalog_title && (
                              <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium truncate max-w-[260px]">
                                في الكتالوج: "{cat.catalog_title}"
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                            {stats.total > 0 ? (
                              <span className="font-semibold text-slate-700 bg-sky-50 text-sky-800 px-2 py-0.5 rounded-full text-[11px]">
                                {stats.total} منتج ({stats.eligibleForCatalog} بالكتالوج)
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">
                                فارغ (لن يظهر في الكتالوج)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions (Up, Down, Edit, Merge, Delete) */}
                      <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 w-full sm:w-auto justify-end">
                        {/* Move Up */}
                        <button
                          onClick={() => handleMoveUp(idx)}
                          disabled={isFirst}
                          className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                            isFirst
                              ? 'border-slate-100 text-slate-300 cursor-not-allowed bg-slate-50'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                          title="تحريك لأعلى"
                        >
                          <ArrowUp size={14} />
                        </button>

                        {/* Move Down */}
                        <button
                          onClick={() => handleMoveDown(idx)}
                          disabled={isLast}
                          className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                            isLast
                              ? 'border-slate-100 text-slate-300 cursor-not-allowed bg-slate-50'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                          title="تحريك لأسفل"
                        >
                          <ArrowDown size={14} />
                        </button>

                        {/* Edit */}
                        <button
                          onClick={() => handleOpenEdit(cat)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                          title="تعديل اسم وعنوان القسم"
                        >
                          <Edit2 size={13} className="text-sky-600" />
                          <span>تعديل</span>
                        </button>

                        {/* Merge */}
                        {categories.length > 1 && (
                          <button
                            onClick={() => handleOpenMerge(cat)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                            title="دمج مع قسم آخر"
                          >
                            <GitMerge size={13} className="text-indigo-600" />
                            <span>دمج</span>
                          </button>
                        )}

                        {/* Delete */}
                        <button
                          onClick={() => handlePromptDelete(cat)}
                          className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 transition-colors cursor-pointer"
                          title="حذف القسم"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Catalog Order Preview View */
            <div className="space-y-4">
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3.5 text-xs text-sky-900 flex items-start gap-2.5">
                <HelpCircle size={18} className="text-sky-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">معاينة تسلسل أقسام الكتالوج المطبوع وPDF:</p>
                  <p className="mt-0.5 text-sky-800">
                    يتم ترتيب صفحات الكتالوج تماماً بنفس التسلسل المعروض أدناه. أي قسم لا يحتوي على أي منتجات مسعرة يتم تخطيه تلقائياً ولا يظهر في الكتالوج النهائي.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {categories.map((cat, idx) => {
                  const stats = productCountMap.get(cat.name) || { total: 0, eligibleForCatalog: 0 };
                  const isVisibleInCatalog = stats.eligibleForCatalog > 0;

                  return (
                    <div
                      key={cat.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isVisibleInCatalog
                          ? 'bg-white border-slate-200 shadow-2xs'
                          : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-md bg-slate-800 text-white font-mono text-xs font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: cat.color || '#0284c7' }}
                          />
                          <span className="font-bold text-slate-800 text-sm">{cat.name}</span>
                        </div>

                        {isVisibleInCatalog ? (
                          <span className="text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Check size={12} /> {stats.eligibleForCatalog} منتج
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md">
                            مستبعد (فارغ)
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 pr-8">
                        <span className="text-slate-400">العنوان المطبوع: </span>
                        <span className="font-medium text-slate-700">
                          {cat.catalog_title || cat.name}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>
            إجمالي الأقسام النشطة: <strong className="text-slate-800">{categories.length}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            تم وإغلاق
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 1. Modal: Add / Edit Category Dialog */}
      {/* ======================================================== */}
      {isEditing && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-100">
          <div
            className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
            dir="rtl"
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                {editingCategory ? <Edit2 size={16} className="text-sky-600" /> : <Plus size={16} className="text-sky-600" />}
                {editingCategory ? `تعديل قسم "${editingCategory.name}"` : 'إضافة قسم جديد'}
              </h3>
              <button
                onClick={() => setIsEditing(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Form Error alert */}
              {formError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 flex items-center gap-2">
                  <AlertTriangle size={15} className="shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Internal Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم القسم الداخلي <span className="text-red-500">*</span>:
                </label>
                <input
                  type="text"
                  placeholder="مثال: كابل، جراب، اسكرينة..."
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    if (formError) setFormError('');
                  }}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-semibold"
                  autoFocus
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  الاسم المستخدم داخل الفلاتر وتصنيف المنتجات في الجداول.
                </span>
              </div>

              {/* Catalog Title (Optional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  عنوان القسم في الكتالوج (اختياري):
                </label>
                <input
                  type="text"
                  placeholder="مثال: مجموعة الكابلات وشواحن ستارت"
                  value={formCatalogTitle}
                  onChange={(e) => setFormCatalogTitle(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  إذا تُرك فارغاً سيتم استخدام الاسم الداخلي كعنوان في الكتالوج المطبوع.
                </span>
              </div>

              {/* Color Picker */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Palette size={14} />
                  لون القسم:
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setFormColor(c.hex)}
                      className={`w-7 h-7 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                        formColor === c.hex ? 'ring-2 ring-offset-2 ring-sky-500 scale-110' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.label}
                    >
                      {formColor === c.hex && <Check size={14} className="text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Icon Picker */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Tag size={14} />
                  أيقونة القسم:
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {AVAILABLE_ICONS.map((item) => {
                    const IconC = item.icon;
                    const isSelected = formIcon === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setFormIcon(item.id)}
                        className={`p-2 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                          isSelected
                            ? 'border-sky-500 bg-sky-50 text-sky-700 shadow-2xs font-bold'
                            : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                        }`}
                        title={item.label}
                      >
                        <IconC size={18} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-200 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveCategory}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-xs shadow-sky-600/20 cursor-pointer"
              >
                {editingCategory ? 'حفظ التعديلات' : 'إضافة القسم'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. Modal: Delete / Transfer Products Confirmation Dialog */}
      {/* ======================================================== */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-100">
          <div
            className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
            dir="rtl"
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-red-50 text-red-900">
              <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-red-700 shrink-0">
                <Trash2 size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm">حذف قسم "{categoryToDelete.name}"</h3>
                <p className="text-[11px] text-red-700 mt-0.5">تأكيد عملية الحذف وحماية المنتجات</p>
              </div>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-700">
              {(productCountMap.get(categoryToDelete.name) || { total: 0 }).total === 0 ? (
                <p className="text-slate-600 leading-relaxed">
                  هذا القسم فارغ تماماً (لا يحتوي على أي منتجات). هل أنت متأكد من رغبتك في حذفه نهائياً؟
                </p>
              ) : (
                <>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 font-medium">
                    ⚠️ يحتوي هذا القسم حالياً على{' '}
                    <strong className="font-bold text-amber-950">
                      {(productCountMap.get(categoryToDelete.name) || { total: 0 }).total} منتج
                    </strong>
                    . لحماية بياناتك، <strong>لن يتم حذف المنتجات أبداً</strong>.
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      اختر القسم البديل لنقل جميع هذه المنتجات إليه:
                    </label>
                    <select
                      value={targetCategoryForMove}
                      onChange={(e) => setTargetCategoryForMove(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                    >
                      {categories
                        .filter((c) => c.id !== categoryToDelete.id)
                        .map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} ({productCountMap.get(c.name)?.total || 0} منتج حالياً)
                          </option>
                        ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCategoryToDelete(null)}
                className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-200 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-xs shadow-red-600/20 cursor-pointer"
              >
                تأكيد الحذف {(productCountMap.get(categoryToDelete.name) || { total: 0 }).total > 0 && 'ونقل المنتجات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. Modal: Merge Categories Dialog */}
      {/* ======================================================== */}
      {categoryToMerge && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-100">
          <div
            className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
            dir="rtl"
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-indigo-50 text-indigo-900">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 shrink-0">
                <GitMerge size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm">دمج قسم "{categoryToMerge.name}" مع قسم آخر</h3>
                <p className="text-[11px] text-indigo-700 mt-0.5">نقل جميع المنتجات وإزالة القسم المفرّغ</p>
              </div>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-700">
              <p className="text-slate-600 leading-relaxed">
                سيتم نقل جميع المنتجات المنتمية لقسم{' '}
                <strong className="text-slate-900 font-bold">"{categoryToMerge.name}"</strong> (عددها{' '}
                <strong className="text-slate-900 font-bold">
                  {(productCountMap.get(categoryToMerge.name) || { total: 0 }).total} منتج
                </strong>
                ) إلى القسم المختار بالأسفل، وسيتم حذف قسم "{categoryToMerge.name}" تلقائياً بعد النقل.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  القسم المستهدف للدمج معه:
                </label>
                <select
                  value={targetCategoryForMerge}
                  onChange={(e) => setTargetCategoryForMerge(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                >
                  {categories
                    .filter((c) => c.id !== categoryToMerge.id)
                    .map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({productCountMap.get(c.name)?.total || 0} منتج حالياً)
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCategoryToMerge(null)}
                className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-200 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmMerge}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs shadow-indigo-600/20 cursor-pointer"
              >
                تأكيد الدمج والنقل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. 10-Second Undo Floating Toast */}
      {/* ======================================================== */}
      {undoData && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-70 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 text-xs font-semibold max-w-lg w-[90%] sm:w-auto animate-in slide-in-from-bottom duration-200">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate">
              تم حذف قسم <strong className="text-amber-300 font-bold">"{undoData.deletedCategory.name}"</strong>
              {undoData.migratedProducts.length > 0 && ` (ونقل ${undoData.migratedProducts.length} منتج)`}.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-24 bg-slate-700 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-amber-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${(undoSecondsLeft / 10) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 font-mono">{undoSecondsLeft}ث</span>
            </div>
          </div>
          <button
            onClick={handleUndoDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-colors cursor-pointer shrink-0"
          >
            <Undo2 size={14} />
            تراجع الآن
          </button>
        </div>
      )}
    </div>
  );
};
