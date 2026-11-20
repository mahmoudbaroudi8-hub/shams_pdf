import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CatalogSectionHeaderConfig,
  CategoryDefinition,
  CategorySectionOverride,
  DEFAULT_CATEGORIES,
  DEFAULT_SECTION_HEADER_CONFIG,
  Product,
  SectionHeaderAlign,
  SectionHeaderColorMode,
  SectionHeaderSize,
  SectionHeaderStyle,
  SectionHeaderTextColorMode,
  SectionHeaderWidth,
} from '../types';
import { updateProduct, saveProductsBatch } from '../utils/db';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FilePlus2,
  GripVertical,
  Layers,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Split,
  X,
} from 'lucide-react';

export interface SectionQuickSummary {
  name: string;
  title: string;
  count: number;
  color: string;
  hidden: boolean;
}

interface SectionHeaderControlPanelProps {
  enabled: boolean;
  onToggleEnabled: () => void;
  config: CatalogSectionHeaderConfig;
  onChangeConfig: (next: CatalogSectionHeaderConfig) => void;
  primaryColor: string;
  sectionCount: number;
  onOpenSectionEditor: () => void;
  sectionsSummary?: SectionQuickSummary[];
  onMoveSectionQuick?: (sectionName: string, direction: -1 | 1) => void;
  onReorderSectionsQuick?: (orderedSectionNames: string[]) => void;
  onToggleSectionHiddenQuick?: (sectionName: string) => void;
  onOpenSplitModal?: () => void;
}

export const SectionHeaderControlPanel: React.FC<SectionHeaderControlPanelProps> = ({
  enabled,
  onToggleEnabled,
  config,
  onChangeConfig,
  primaryColor,
  sectionCount,
  onOpenSectionEditor,
  sectionsSummary,
  onMoveSectionQuick,
  onReorderSectionsQuick,
  onToggleSectionHiddenQuick,
  onOpenSplitModal,
}) => {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const touchDragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      touchDragCleanupRef.current?.();
    };
  }, []);

  const mergedConfig: CatalogSectionHeaderConfig = {
    ...DEFAULT_SECTION_HEADER_CONFIG,
    ...config,
    overrides: config?.overrides || {},
  };

  const updateField = <K extends keyof CatalogSectionHeaderConfig>(
    key: K,
    value: CatalogSectionHeaderConfig[K]
  ) => {
    onChangeConfig({ ...mergedConfig, [key]: value });
  };

  const commitReorderQuick = (fromIdx: number, toIdx: number) => {
    if (!sectionsSummary || fromIdx === toIdx) return;
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= sectionsSummary.length || toIdx >= sectionsSummary.length) {
      return;
    }

    const reordered = [...sectionsSummary];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    if (onReorderSectionsQuick) {
      onReorderSectionsQuick(reordered.map((s) => s.name));
    } else {
      const nextOverrides: Record<string, CategorySectionOverride> = {
        ...(mergedConfig.overrides || {}),
      };
      reordered.forEach((sec, idx) => {
        nextOverrides[sec.name] = {
          ...(nextOverrides[sec.name] || {}),
          order: idx,
        };
      });
      onChangeConfig({
        ...mergedConfig,
        overrides: nextOverrides,
      });
    }
  };

  const handleQuickTouchHandlePointerDown = (
    e: React.PointerEvent<HTMLSpanElement>,
    fromIdx: number
  ) => {
    if (e.pointerType === 'mouse' || !sectionsSummary || sectionsSummary.length < 2) return;
    e.preventDefault();
    touchDragCleanupRef.current?.();

    let latestOverIdx: number | null = fromIdx;
    setDraggedIdx(fromIdx);
    setDragOverIdx(fromIdx);

    const onMove = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const row = el?.closest('[data-quick-section-idx]') as HTMLElement | null;
      if (row) {
        const idxAttr = parseInt(row.dataset.quickSectionIdx || '', 10);
        if (!Number.isNaN(idxAttr)) {
          latestOverIdx = idxAttr;
          setDragOverIdx(idxAttr);
        }
      }
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onCancel);
      touchDragCleanupRef.current = null;
    };

    const onEnd = () => {
      cleanup();
      if (latestOverIdx !== null && latestOverIdx !== fromIdx) {
        commitReorderQuick(fromIdx, latestOverIdx);
      }
      setDraggedIdx(null);
      setDragOverIdx(null);
    };

    const onCancel = () => {
      cleanup();
      setDraggedIdx(null);
      setDragOverIdx(null);
    };

    touchDragCleanupRef.current = cleanup;
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onCancel);
  };

  return (
    <div className="p-3.5 bg-sky-50/70 border border-sky-200 rounded-xl space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
          <Layers size={15} className="text-sky-600" />
          تقسيم الكتالوج حسب الأقسام
        </span>
        <button
          type="button"
          onClick={onToggleEnabled}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
            enabled
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
          }`}
        >
          {enabled ? <Check size={13} /> : <Layers size={13} />}
          <span>{enabled ? 'مفعّل' : 'تفعيل التقسيم'}</span>
        </button>
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        يقسم العناصر في الـ PDF حسب الأقسام مع عنوان فاصل قابل للتعديل والتحكم الكامل.
      </p>

      {enabled && (
        <div className="space-y-3 pt-2 border-t border-sky-200/80">
          {/* Header Style */}
          <div>
            <span className="block text-[11px] font-bold text-slate-700 mb-1.5">
              شكل عنوان القسم:
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'line_divider', label: 'في نص السطر (خط)' },
                  { id: 'solid_bar', label: 'شريط ملون' },
                  { id: 'tinted_box', label: 'إطار خفيف' },
                  { id: 'underline', label: 'خط سفلي' },
                ] as { id: SectionHeaderStyle; label: string }[]
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => updateField('style', st.id)}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                    mergedConfig.style === st.id
                      ? 'border-sky-600 bg-white text-sky-700 ring-1 ring-sky-500 shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Alignment */}
          <div>
            <span className="block text-[11px] font-bold text-slate-700 mb-1.5">
              موضع الكتابة في السطر:
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'right', label: 'يمين', Icon: AlignRight },
                  { id: 'center', label: 'نص السطر', Icon: AlignCenter },
                  { id: 'left', label: 'يسار', Icon: AlignLeft },
                ] as { id: SectionHeaderAlign; label: string; Icon: React.ComponentType<{ size?: number }> }[]
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => updateField('align', id)}
                  className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                    mergedConfig.align === id
                      ? 'border-sky-600 bg-white text-sky-700 ring-1 ring-sky-500 shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={13} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Width & Size */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="block text-[11px] font-bold text-slate-700 mb-1">عرض الفاصل:</span>
              <div className="grid grid-cols-2 gap-1">
                {(
                  [
                    { id: 'full', label: 'كامل' },
                    { id: 'half', label: 'نصف سطر' },
                  ] as { id: SectionHeaderWidth; label: string }[]
                ).map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => updateField('width', w.id)}
                    className={`py-1 px-1.5 rounded-lg text-[10px] font-bold border cursor-pointer ${
                      mergedConfig.width === w.id
                        ? 'border-sky-600 bg-white text-sky-700 ring-1 ring-sky-500'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-bold text-slate-700 mb-1">حجم العنوان:</span>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { id: 'sm', label: 'صغير' },
                    { id: 'md', label: 'وسط' },
                    { id: 'lg', label: 'كبير' },
                  ] as { id: SectionHeaderSize; label: string }[]
                ).map((sz) => (
                  <button
                    key={sz.id}
                    type="button"
                    onClick={() => updateField('size', sz.id)}
                    className={`py-1 px-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
                      mergedConfig.size === sz.id
                        ? 'border-sky-600 bg-white text-sky-700 ring-1 ring-sky-500'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {sz.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Color Mode & Text Color */}
          <div className="space-y-2">
            <span className="block text-[11px] font-bold text-slate-700">لون عناوين الأقسام:</span>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'primary', label: 'لون الكتالوج' },
                  { id: 'category', label: 'لون كل قسم' },
                  { id: 'custom', label: 'لون مخصص' },
                ] as { id: SectionHeaderColorMode; label: string }[]
              ).map((cm) => (
                <button
                  key={cm.id}
                  type="button"
                  onClick={() => updateField('color_mode', cm.id)}
                  className={`py-1 px-1.5 rounded-lg text-[10px] font-bold border cursor-pointer ${
                    mergedConfig.color_mode === cm.id
                      ? 'border-sky-600 bg-white text-sky-700 ring-1 ring-sky-500'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {cm.label}
                </button>
              ))}
            </div>

            {mergedConfig.color_mode === 'custom' && (
              <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-600">اختر اللون المخصص:</span>
                <input
                  type="color"
                  value={mergedConfig.custom_color || primaryColor || '#ea580c'}
                  onChange={(e) => updateField('custom_color', e.target.value)}
                  className="w-8 h-6 rounded border border-slate-200 cursor-pointer"
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-700 shrink-0">لون النص:</span>
              <select
                value={mergedConfig.text_color_mode || 'auto'}
                onChange={(e) =>
                  updateField('text_color_mode', e.target.value as SectionHeaderTextColorMode)
                }
                className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-700"
              >
                <option value="auto">تلقائي حسب الشكل</option>
                <option value="dark">أسود داكن</option>
                <option value="accent">نفس لون القسم</option>
                <option value="white">أبيض</option>
              </select>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-1.5 pt-1 text-xs">
            <label className="flex items-center justify-between cursor-pointer text-[11px] font-semibold text-slate-700">
              <span>إظهار عدد الأصناف (مثال: 12)</span>
              <input
                type="checkbox"
                checked={mergedConfig.show_count}
                onChange={(e) => updateField('show_count', e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4 cursor-pointer"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer text-[11px] font-semibold text-slate-700">
              <span>إظهار الوصف الفرعي لكل قسم</span>
              <input
                type="checkbox"
                checked={mergedConfig.show_subtitle}
                onChange={(e) => updateField('show_subtitle', e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4 cursor-pointer"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer text-[11px] font-semibold text-slate-700">
              <span>بدء كل قسم في صفحة PDF جديدة</span>
              <input
                type="checkbox"
                checked={mergedConfig.page_break_before}
                onChange={(e) => updateField('page_break_before', e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4 cursor-pointer"
              />
            </label>
          </div>
        </div>
      )}

      {/* Quick Inline Section Ordering (Drag & Drop + Arrows) & Show/Hide inside Sidebar */}
      {sectionsSummary && sectionsSummary.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-sky-200/70">
          <div className="flex items-center justify-between gap-1 text-[11px] font-extrabold text-slate-700">
            <span>ترتيب وإظهار/إخفاء الأقسام:</span>
            <span className="text-[10px] text-slate-500">
              اسحب للترتيب ({sectionsSummary.filter((s) => !s.hidden).length}/{sectionsSummary.length} ظاهر)
            </span>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-0.5">
            {sectionsSummary.map((sec, idx) => {
              const isDragging = draggedIdx === idx;
              const isDropTarget = dragOverIdx === idx && draggedIdx !== null && draggedIdx !== idx;
              return (
                <div
                  key={sec.name}
                  data-quick-section-idx={idx}
                  draggable={sectionsSummary.length > 1}
                  onDragStart={(e) => {
                    if ((e.target as HTMLElement).closest('button')) {
                      e.preventDefault();
                      return;
                    }
                    setDraggedIdx(idx);
                    setDragOverIdx(idx);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', sec.name);
                  }}
                  onDragOver={(e) => {
                    if (draggedIdx === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverIdx !== idx) {
                      setDragOverIdx(idx);
                    }
                  }}
                  onDragEnter={(e) => {
                    if (draggedIdx === null) return;
                    e.preventDefault();
                    setDragOverIdx(idx);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedIdx !== null && draggedIdx !== idx) {
                      commitReorderQuick(draggedIdx, idx);
                    }
                    setDraggedIdx(null);
                    setDragOverIdx(null);
                  }}
                  onDragEnd={() => {
                    setDraggedIdx(null);
                    setDragOverIdx(null);
                  }}
                  className={`flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] transition-all select-none ${
                    isDragging
                      ? 'opacity-50 scale-[0.98] bg-orange-50 border-orange-400 ring-1 ring-orange-400'
                      : isDropTarget
                        ? 'bg-orange-50/80 border-orange-500 ring-2 ring-orange-500/40 shadow-xs'
                        : sec.hidden
                          ? 'bg-slate-100/80 border-slate-200 opacity-60'
                          : 'bg-white border-slate-200 shadow-2xs hover:border-orange-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      onPointerDown={(e) => handleQuickTouchHandlePointerDown(e, idx)}
                      className="text-slate-400 hover:text-orange-600 cursor-grab active:cursor-grabbing shrink-0 touch-none p-0.5"
                      title="اسحب وأفلت لإعادة ترتيب القسم"
                    >
                      <GripVertical size={13} />
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: sec.color }}
                    />
                    <span className={`font-bold truncate ${sec.hidden ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                      {sec.title}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      ({sec.count})
                    </span>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    {onMoveSectionQuick && (
                      <>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onMoveSectionQuick(sec.name, -1)}
                          className="p-1 text-slate-500 hover:text-orange-600 disabled:opacity-25 cursor-pointer"
                          title="تقديم القسم للأعلى"
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          disabled={idx === sectionsSummary.length - 1}
                          onClick={() => onMoveSectionQuick(sec.name, 1)}
                          className="p-1 text-slate-500 hover:text-orange-600 disabled:opacity-25 cursor-pointer"
                          title="تأخير القسم للأسفل"
                        >
                          <ArrowDown size={12} />
                        </button>
                      </>
                    )}
                    {onToggleSectionHiddenQuick && (
                      <button
                        type="button"
                        onClick={() => onToggleSectionHiddenQuick(sec.name)}
                        className={`p-1 rounded cursor-pointer ${
                          sec.hidden
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={sec.hidden ? 'إظهار القسم في الـ PDF' : 'إخفاء القسم من الـ PDF'}
                      >
                        {sec.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Buttons: Edit Sections & Split into Multiple PDFs */}
      <div className="space-y-1.5 pt-1">
        <button
          type="button"
          onClick={onOpenSectionEditor}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-white hover:bg-sky-600 text-sky-700 hover:text-white border border-sky-300 rounded-xl text-xs font-extrabold shadow-2xs transition-all cursor-pointer"
        >
          <Edit3 size={14} />
          <span>تعديل خصائص وأصناف الأقسام ({sectionCount})</span>
        </button>
        {onOpenSplitModal && (
          <button
            type="button"
            onClick={onOpenSplitModal}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-extrabold shadow-xs transition-all cursor-pointer"
          >
            <Split size={14} />
            <span>تقسيم الـ PDF لكذا ملف</span>
          </button>
        )}
      </div>
    </div>
  );
};

interface SectionEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  categories: CategoryDefinition[];
  config: CatalogSectionHeaderConfig;
  primaryColor: string;
  onChangeConfig: (next: CatalogSectionHeaderConfig) => void;
  onProductsUpdated?: (products: Product[]) => void;
  groupedEnabled: boolean;
  onToggleGrouped?: () => void;
  onExportSingleSection?: (categoryName: string) => void;
  onOpenSplitModal?: () => void;
}

export const SectionEditorModal: React.FC<SectionEditorModalProps> = ({
  isOpen,
  onClose,
  products,
  categories,
  config,
  primaryColor,
  onChangeConfig,
  onProductsUpdated,
  groupedEnabled,
  onToggleGrouped,
  onExportSingleSection,
  onOpenSplitModal,
}) => {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [savingProdId, setSavingProdId] = useState<string | null>(null);
  const [draggedSecIdx, setDraggedSecIdx] = useState<number | null>(null);
  const [dragOverSecIdx, setDragOverSecIdx] = useState<number | null>(null);
  const modalTouchCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      modalTouchCleanupRef.current?.();
    };
  }, []);

  const mergedConfig: CatalogSectionHeaderConfig = {
    ...DEFAULT_SECTION_HEADER_CONFIG,
    ...config,
    overrides: config?.overrides || {},
  };

  const overrides = mergedConfig.overrides || {};

  const categoryDefMap = useMemo(() => {
    const list = categories.length > 0 ? categories : DEFAULT_CATEGORIES;
    return new Map(list.map((c, idx) => [c.name, { def: c, rank: idx }]));
  }, [categories]);

  // Build list of categories that actually have eligible/available products
  const sectionEntries = useMemo(() => {
    const map = new Map<string, Product[]>();
    products.forEach((p) => {
      if ((p as any).is_unread_placeholder) return;
      if (!p.name?.trim()) return;
      const catName = p.category?.trim() || 'متنوعة';
      if (!map.has(catName)) map.set(catName, []);
      map.get(catName)!.push(p);
    });

    const names = Array.from(map.keys()).sort((a, b) => {
      const orderA =
        overrides[a]?.order ?? (categoryDefMap.has(a) ? categoryDefMap.get(a)!.rank : 999);
      const orderB =
        overrides[b]?.order ?? (categoryDefMap.has(b) ? categoryDefMap.get(b)!.rank : 999);
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b, 'ar');
    });

    return names.map((name, idx) => {
      const prods = map.get(name) || [];
      const activeCount = prods.filter(
        (p) => p.included_in_catalog && (p.selling_price || 0) > 0
      ).length;
      const def = categoryDefMap.get(name)?.def;
      return {
        name,
        index: idx,
        defaultTitle: def?.catalog_title || def?.name || name,
        defaultColor: def?.color || primaryColor,
        products: prods,
        activeCount,
        override: overrides[name] || {},
      };
    });
  }, [products, overrides, categoryDefMap, primaryColor]);

  if (!isOpen) return null;

  const updateOverride = (catName: string, patch: Partial<CategorySectionOverride>) => {
    const prevOv = overrides[catName] || {};
    onChangeConfig({
      ...mergedConfig,
      overrides: {
        ...overrides,
        [catName]: { ...prevOv, ...patch },
      },
    });
  };

  const reorderSectionTo = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= sectionEntries.length ||
      toIndex >= sectionEntries.length
    ) {
      return;
    }

    const reordered = [...sectionEntries];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const nextOverrides: Record<string, CategorySectionOverride> = { ...overrides };
    reordered.forEach((entry, idx) => {
      nextOverrides[entry.name] = {
        ...(nextOverrides[entry.name] || {}),
        order: idx,
      };
    });

    onChangeConfig({
      ...mergedConfig,
      overrides: nextOverrides,
    });
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    reorderSectionTo(index, index + direction);
  };

  const handleModalTouchHandlePointerDown = (
    e: React.PointerEvent<HTMLSpanElement>,
    fromIdx: number
  ) => {
    if (e.pointerType === 'mouse' || sectionEntries.length < 2) return;
    e.preventDefault();
    modalTouchCleanupRef.current?.();

    let latestOverIdx: number | null = fromIdx;
    setDraggedSecIdx(fromIdx);
    setDragOverSecIdx(fromIdx);

    const onMove = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const card = el?.closest('[data-modal-section-idx]') as HTMLElement | null;
      if (card) {
        const idxAttr = parseInt(card.dataset.modalSectionIdx || '', 10);
        if (!Number.isNaN(idxAttr)) {
          latestOverIdx = idxAttr;
          setDragOverSecIdx(idxAttr);
        }
      }
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onCancel);
      modalTouchCleanupRef.current = null;
    };

    const onEnd = () => {
      cleanup();
      if (latestOverIdx !== null && latestOverIdx !== fromIdx) {
        reorderSectionTo(fromIdx, latestOverIdx);
      }
      setDraggedSecIdx(null);
      setDragOverSecIdx(null);
    };

    const onCancel = () => {
      cleanup();
      setDraggedSecIdx(null);
      setDragOverSecIdx(null);
    };

    modalTouchCleanupRef.current = cleanup;
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onCancel);
  };

  const handleResetAll = () => {
    onChangeConfig({
      ...DEFAULT_SECTION_HEADER_CONFIG,
      overrides: {},
    });
  };

  const handleQuickProductEdit = async (prod: Product, patch: Partial<Product>) => {
    const updated: Product = { ...prod, ...patch, updated_at: Date.now() };
    setSavingProdId(prod.id);
    try {
      await updateProduct(updated);
      if (onProductsUpdated) {
        onProductsUpdated(products.map((p) => (p.id === updated.id ? updated : p)));
      }
    } finally {
      setSavingProdId(null);
    }
  };

  const handleSetAllVisibility = (hiddenVal: boolean) => {
    const nextOverrides: Record<string, CategorySectionOverride> = { ...overrides };
    sectionEntries.forEach((sec) => {
      nextOverrides[sec.name] = { ...(nextOverrides[sec.name] || {}), hidden: hiddenVal };
    });
    onChangeConfig({ ...mergedConfig, overrides: nextOverrides });
  };

  const handleQuickAutoSortSections = (mode: 'alpha' | 'count_desc' | 'default') => {
    const sorted = [...sectionEntries];
    if (mode === 'alpha') {
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    } else if (mode === 'count_desc') {
      sorted.sort((a, b) => b.activeCount - a.activeCount);
    } else {
      sorted.sort((a, b) => {
        const rankA = categoryDefMap.get(a.name)?.rank ?? 999;
        const rankB = categoryDefMap.get(b.name)?.rank ?? 999;
        return rankA - rankB;
      });
    }
    const nextOverrides: Record<string, CategorySectionOverride> = { ...overrides };
    sorted.forEach((entry, idx) => {
      nextOverrides[entry.name] = {
        ...(nextOverrides[entry.name] || {}),
        order: idx,
      };
    });
    onChangeConfig({ ...mergedConfig, overrides: nextOverrides });
  };

  const handleMoveProductInSection = async (
    sectionProducts: Product[],
    prodIdx: number,
    delta: -1 | 1
  ) => {
    const targetIdx = prodIdx + delta;
    if (targetIdx < 0 || targetIdx >= sectionProducts.length) return;
    const ordered = [...sectionProducts].sort((a, b) => (a.card_index || 0) - (b.card_index || 0));
    const [moved] = ordered.splice(prodIdx, 1);
    ordered.splice(targetIdx, 0, moved);

    const updatedProds = ordered.map((p, idx) => ({
      ...p,
      card_index: idx + 1,
      updated_at: Date.now(),
    }));

    setSavingProdId(moved.id);
    try {
      await saveProductsBatch(updatedProds);
      if (onProductsUpdated) {
        const map = new Map(updatedProds.map((p) => [p.id, p]));
        onProductsUpdated(products.map((p) => map.get(p.id) || p));
      }
    } finally {
      setSavingProdId(null);
    }
  };

  const previewColor =
    mergedConfig.color_mode === 'custom'
      ? mergedConfig.custom_color || primaryColor
      : primaryColor;

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      dir="rtl"
    >
      <div className="bg-white w-full h-dvh sm:h-auto sm:max-h-[92vh] sm:max-w-4xl sm:rounded-3xl flex flex-col shadow-2xl border-0 sm:border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="px-3 py-2.5 sm:px-5 sm:py-4 border-b border-slate-200 flex items-center justify-between gap-2 sm:gap-3 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
              <SlidersHorizontal size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-slate-900 text-xs sm:text-base truncate">
                التحكم الكامل وتعديل أقسام الكتالوج وخصائصها
              </h3>
              <p className="hidden sm:block text-[11px] text-slate-500 truncate">
                عدّل أسماء الأقسام، الترتيب، الألوان، الوصف الفرعي، إظهار/إخفاء الأقسام، أو عدّل أصناف كل قسم مباشرة
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-xl cursor-pointer shrink-0"
            aria-label="إغلاق"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-3.5 sm:space-y-5">
          {/* Enable banner if disabled */}
          {!groupedEnabled && onToggleGrouped && (
            <div className="p-2.5 sm:p-3.5 bg-amber-50 border border-amber-200 rounded-xl sm:rounded-2xl flex flex-wrap items-center justify-between gap-2 sm:gap-3">
              <span className="text-[11px] sm:text-xs font-bold text-amber-900">
                تقسيم العناصر حسب الأقسام غير مفعّل حالياً في الكتالوج.
              </span>
              <button
                type="button"
                onClick={onToggleGrouped}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-[11px] sm:text-xs font-extrabold rounded-xl cursor-pointer shrink-0"
              >
                تفعيل التقسيم الآن
              </button>
            </div>
          )}

          {/* Live Preview + Style Quick Controls */}
          <div className="p-2.5 sm:p-4 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl space-y-2.5 sm:space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span className="text-[11px] sm:text-xs font-extrabold text-slate-800">
                معاينة شكل عنوان القسم في صفحة الـ PDF:
              </span>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 text-[11px] w-full sm:w-auto">
                {(
                  [
                    { id: 'line_divider', label: 'في نص السطر' },
                    { id: 'solid_bar', label: 'شريط ملون' },
                    { id: 'tinted_box', label: 'إطار خفيف' },
                    { id: 'underline', label: 'خط سفلي' },
                  ] as { id: SectionHeaderStyle; label: string }[]
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => onChangeConfig({ ...mergedConfig, style: st.id })}
                    className={`px-2.5 py-1.5 sm:py-1 rounded-lg font-bold border cursor-pointer text-center transition-colors ${
                      mergedConfig.style === st.id
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sample Render (Always crisp white paper & proportionally scaled on mobile) */}
            <div
              className="p-2 sm:p-3 rounded-xl border border-slate-200 overflow-hidden"
              style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
            >
              {(() => {
                const sampleTitle = 'سماعات الايربودز والأصلية';
                const sampleCount = mergedConfig.show_count ? ' (12)' : '';
                const sampleSub = mergedConfig.show_subtitle ? ' — خصم خاص للجملة' : '';
                const fullSampleText = `${sampleTitle}${sampleCount}${sampleSub}`;
                const widthCls =
                  mergedConfig.width === 'half'
                    ? mergedConfig.align === 'center'
                      ? 'w-[82%] sm:w-[58%] mx-auto'
                      : mergedConfig.align === 'left'
                        ? 'w-[82%] sm:w-[58%] mr-auto'
                        : 'w-[82%] sm:w-[58%] ml-auto'
                    : 'w-full';
                const justifyCls =
                  mergedConfig.align === 'center'
                    ? 'justify-center'
                    : mergedConfig.align === 'left'
                      ? 'justify-end'
                      : 'justify-start';
                const sizeCls =
                  mergedConfig.size === 'sm'
                    ? 'text-[10px] sm:text-xs py-0.5 sm:py-1'
                    : mergedConfig.size === 'lg'
                      ? 'text-xs sm:text-base py-1 sm:py-2'
                      : 'text-[11px] sm:text-sm py-1 sm:py-1.5';

                if (mergedConfig.style === 'solid_bar') {
                  return (
                    <div
                      className={`${widthCls} ${sizeCls} max-w-full min-w-0 px-2.5 sm:px-4 rounded-lg font-extrabold flex items-center ${justifyCls}`}
                      style={{
                        backgroundColor: previewColor,
                        color:
                          mergedConfig.text_color_mode === 'dark' ? '#0f172a' : '#ffffff',
                      }}
                    >
                      <span className="truncate">{fullSampleText}</span>
                    </div>
                  );
                }
                if (mergedConfig.style === 'tinted_box') {
                  return (
                    <div
                      className={`${widthCls} ${sizeCls} max-w-full min-w-0 px-2.5 sm:px-4 rounded-lg font-extrabold flex items-center ${justifyCls}`}
                      style={{
                        backgroundColor: `${previewColor}18`,
                        border: `1.5px solid ${previewColor}55`,
                        color:
                          mergedConfig.text_color_mode === 'accent'
                            ? previewColor
                            : '#0f172a',
                      }}
                    >
                      <span className="truncate">{fullSampleText}</span>
                    </div>
                  );
                }
                if (mergedConfig.style === 'underline') {
                  return (
                    <div
                      className={`${widthCls} ${sizeCls} max-w-full min-w-0 px-1.5 sm:px-2 font-extrabold flex items-center ${justifyCls}`}
                      style={{
                        borderBottom: `2.5px solid ${previewColor}`,
                        color:
                          mergedConfig.text_color_mode === 'dark' ? '#0f172a' : previewColor,
                      }}
                    >
                      <span className="truncate">{fullSampleText}</span>
                    </div>
                  );
                }
                return (
                  <div className={`${widthCls} max-w-full min-w-0 flex items-center gap-1.5 sm:gap-2.5 py-0.5 sm:py-1`}>
                    {mergedConfig.align !== 'right' && (
                      <div
                        className="flex-1 min-w-[14px] h-0.5 rounded-full"
                        style={{ backgroundColor: `${previewColor}88` }}
                      />
                    )}
                    <div
                      className={`min-w-0 max-w-[82%] sm:max-w-[88%] px-2.5 sm:px-4 rounded-full font-extrabold shadow-2xs truncate text-center ${sizeCls}`}
                      style={{
                        backgroundColor: '#ffffff',
                        border: `1.6px solid ${previewColor}`,
                        color:
                          mergedConfig.text_color_mode === 'accent'
                            ? previewColor
                            : '#0f172a',
                      }}
                    >
                      {fullSampleText}
                    </div>
                    {mergedConfig.align !== 'left' && (
                      <div
                        className="flex-1 min-w-[14px] h-0.5 rounded-full"
                        style={{ backgroundColor: `${previewColor}88` }}
                      />
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Alignment / Width / Size / Options quick row */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3 text-[11px] font-bold text-slate-700">
              <div className="grid grid-cols-3 sm:flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => onChangeConfig({ ...mergedConfig, align: 'right' })}
                  className={`px-2 py-1.5 sm:py-1 rounded-lg cursor-pointer text-center ${
                    mergedConfig.align === 'right' ? 'bg-sky-100 text-sky-800' : 'text-slate-600'
                  }`}
                >
                  يمين
                </button>
                <button
                  type="button"
                  onClick={() => onChangeConfig({ ...mergedConfig, align: 'center' })}
                  className={`px-2 py-1.5 sm:py-1 rounded-lg cursor-pointer text-center truncate ${
                    mergedConfig.align === 'center' ? 'bg-sky-100 text-sky-800' : 'text-slate-600'
                  }`}
                >
                  في نص السطر
                </button>
                <button
                  type="button"
                  onClick={() => onChangeConfig({ ...mergedConfig, align: 'left' })}
                  className={`px-2 py-1.5 sm:py-1 rounded-lg cursor-pointer text-center ${
                    mergedConfig.align === 'left' ? 'bg-sky-100 text-sky-800' : 'text-slate-600'
                  }`}
                >
                  يسار
                </button>
              </div>

              <div className="grid grid-cols-2 sm:flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => onChangeConfig({ ...mergedConfig, width: 'full' })}
                  className={`px-2 py-1.5 sm:py-1 rounded-lg cursor-pointer text-center ${
                    mergedConfig.width === 'full' ? 'bg-sky-100 text-sky-800' : 'text-slate-600'
                  }`}
                >
                  سطر كامل
                </button>
                <button
                  type="button"
                  onClick={() => onChangeConfig({ ...mergedConfig, width: 'half' })}
                  className={`px-2 py-1.5 sm:py-1 rounded-lg cursor-pointer text-center ${
                    mergedConfig.width === 'half' ? 'bg-sky-100 text-sky-800' : 'text-slate-600'
                  }`}
                >
                  نصف السطر
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-0.5 sm:pt-0">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mergedConfig.show_count}
                    onChange={(e) =>
                      onChangeConfig({ ...mergedConfig, show_count: e.target.checked })
                    }
                    className="rounded text-sky-600 cursor-pointer w-4 h-4 sm:w-3.5 sm:h-3.5"
                  />
                  <span>إظهار العدد</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mergedConfig.page_break_before}
                    onChange={(e) =>
                      onChangeConfig({ ...mergedConfig, page_break_before: e.target.checked })
                    }
                    className="rounded text-sky-600 cursor-pointer w-4 h-4 sm:w-3.5 sm:h-3.5"
                  />
                  <span>كل قسم في صفحة جديدة</span>
                </label>
              </div>
            </div>
          </div>

          {/* Per-Section List */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs sm:text-sm font-extrabold text-slate-800">
                  الأقسام الموجودة ({sectionEntries.length} قسم)
                </h4>
                <span className="text-[11px] text-slate-500">
                  التعديلات تنعكس فوراً في المعاينة والـ PDF (سواء بعناوين أقسام أو بدونها)
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => handleSetAllVisibility(false)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold cursor-pointer"
                >
                  إظهار الكل
                </button>
                <button
                  type="button"
                  onClick={() => handleSetAllVisibility(true)}
                  className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold cursor-pointer"
                >
                  إخفاء الكل
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAutoSortSections('count_desc')}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  ترتيب بالأكثر
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAutoSortSections('alpha')}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  أبجدي أ-ي
                </button>
                {onOpenSplitModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSplitModal();
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-extrabold cursor-pointer"
                  >
                    <Split size={12} />
                    <span>تقسيم لكذا ملف</span>
                  </button>
                )}
              </div>
            </div>

            {sectionEntries.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl text-xs text-slate-500">
                لا توجد أصناف مصنفة بعد في الكتالوج.
              </div>
            ) : (
              sectionEntries.map((sec, idx) => {
                const isHidden = Boolean(sec.override.hidden);
                const isHeaderHidden = Boolean(sec.override.hide_header);
                const isExpanded = expandedCategory === sec.name;
                const activeColor = sec.override.color || sec.defaultColor;
                const isDragging = draggedSecIdx === idx;
                const isDropTarget =
                  dragOverSecIdx === idx && draggedSecIdx !== null && draggedSecIdx !== idx;

                return (
                  <div
                    key={sec.name}
                    data-modal-section-idx={idx}
                    draggable={sectionEntries.length > 1}
                    onDragStart={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('input, select, textarea, button')) {
                        e.preventDefault();
                        return;
                      }
                      setDraggedSecIdx(idx);
                      setDragOverSecIdx(idx);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', sec.name);
                    }}
                    onDragOver={(e) => {
                      if (draggedSecIdx === null) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverSecIdx !== idx) {
                        setDragOverSecIdx(idx);
                      }
                    }}
                    onDragEnter={(e) => {
                      if (draggedSecIdx === null) return;
                      e.preventDefault();
                      setDragOverSecIdx(idx);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedSecIdx !== null && draggedSecIdx !== idx) {
                        reorderSectionTo(draggedSecIdx, idx);
                      }
                      setDraggedSecIdx(null);
                      setDragOverSecIdx(null);
                    }}
                    onDragEnd={() => {
                      setDraggedSecIdx(null);
                      setDragOverSecIdx(null);
                    }}
                    className={`border rounded-2xl transition-all ${
                      isDragging
                        ? 'opacity-50 scale-[0.99] bg-orange-50/50 border-orange-400 ring-2 ring-orange-400/50'
                        : isDropTarget
                          ? 'bg-orange-50/70 border-orange-500 ring-2 ring-orange-500/40 shadow-md'
                          : isHidden
                            ? 'bg-slate-50 border-slate-200 opacity-65'
                            : 'bg-white border-slate-200 shadow-2xs hover:border-orange-300'
                    }`}
                  >
                    <div className="p-3.5 flex flex-col gap-3">
                      {/* Row 1: Drag Handle, Reorder Arrows, Category Badge, Name, Visibility */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            onPointerDown={(e) => handleModalTouchHandlePointerDown(e, idx)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-orange-100 text-slate-400 hover:text-orange-600 cursor-grab active:cursor-grabbing shrink-0 touch-none"
                            title="اسحب وأفلت لإعادة ترتيب القسم"
                          >
                            <GripVertical size={15} />
                          </span>

                          <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                            <button
                              type="button"
                              onClick={() => moveSection(idx, -1)}
                              disabled={idx === 0}
                              className="p-1 text-slate-600 hover:text-sky-600 disabled:opacity-25 cursor-pointer"
                              title="تحريك القسم للأعلى"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSection(idx, 1)}
                              disabled={idx === sectionEntries.length - 1}
                              className="p-1 text-slate-600 hover:text-sky-600 disabled:opacity-25 cursor-pointer"
                              title="تحريك القسم للأسفل"
                            >
                              <ArrowDown size={14} />
                            </button>
                          </div>

                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0 border border-white shadow-xs"
                            style={{ backgroundColor: activeColor }}
                          />

                          <span className="text-xs font-extrabold text-slate-900">
                            {sec.name}
                          </span>

                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                            {sec.activeCount} مسعّر / {sec.products.length} إجمالي
                          </span>
                        </div>

                        {/* Action Toggles */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateOverride(sec.name, {
                                page_break_before: !Boolean(
                                  sec.override.page_break_before ?? mergedConfig.page_break_before
                                ),
                              })
                            }
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                              sec.override.page_break_before
                                ? 'bg-indigo-50 text-indigo-800 border-indigo-300'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                            title="بدء هذا القسم في صفحة PDF مستقلة جديدة"
                          >
                            <FilePlus2 size={12} />
                            <span>{sec.override.page_break_before ? 'بصفحة جديدة ✓' : 'صفحة جديدة'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              updateOverride(sec.name, { hide_header: !isHeaderHidden })
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                              isHeaderHidden
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                            title="إخفاء أو إظهار شريط عنوان هذا القسم فقط مع الإبقاء على أصنافه"
                          >
                            {isHeaderHidden ? 'العنوان مخفي' : 'إخفاء العنوان'}
                          </button>

                          <button
                            type="button"
                            onClick={() => updateOverride(sec.name, { hidden: !isHidden })}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                              isHidden
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                            title="إخفاء أو إظهار هذا القسم بالكامل من الكتالوج"
                          >
                            {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                            <span>{isHidden ? 'مخفي بالكامل' : 'ظاهر بالكتالوج'}</span>
                          </button>

                          {onExportSingleSection && !isHidden && sec.activeCount > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onExportSingleSection(sec.name);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 cursor-pointer"
                              title="تصدير ملف PDF مستقل لهذا القسم فقط"
                            >
                              <Download size={12} />
                              <span>PDF القسم</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCategory(isExpanded ? null : sec.name)
                            }
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 cursor-pointer"
                          >
                            <span>الأصناف ({sec.products.length})</span>
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        </div>
                      </div>

                      {/* Row 2: Title Edit, Subtitle Edit, Color & Product Sort */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            عنوان القسم في الـ PDF:
                          </label>
                          <input
                            type="text"
                            value={sec.override.title ?? ''}
                            onChange={(e) =>
                              updateOverride(sec.name, { title: e.target.value })
                            }
                            placeholder={sec.defaultTitle}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            وصف فرعي (اختياري):
                          </label>
                          <input
                            type="text"
                            value={sec.override.subtitle ?? ''}
                            onChange={(e) =>
                              updateOverride(sec.name, { subtitle: e.target.value })
                            }
                            placeholder="مثال: خصم خاص للكميات"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-700 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            ترتيب الأصناف:
                          </label>
                          <select
                            value={sec.override.sort_products || 'default'}
                            onChange={(e) =>
                              updateOverride(sec.name, {
                                sort_products: e.target.value as CategorySectionOverride['sort_products'],
                              })
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-[11px] font-bold text-slate-700 bg-white"
                          >
                            <option value="default">الافتراضي</option>
                            <option value="price_asc">الأرخص أولاً</option>
                            <option value="price_desc">الأغلى أولاً</option>
                            <option value="name">أبجدي</option>
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1">
                            <Palette size={11} />
                            لون القسم:
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={activeColor}
                              onChange={(e) =>
                                updateOverride(sec.name, { color: e.target.value })
                              }
                              className="w-9 h-7 rounded border border-slate-300 cursor-pointer shrink-0"
                            />
                            {sec.override.color && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateOverride(sec.name, { color: undefined })
                                }
                                className="text-[10px] font-bold text-slate-500 hover:text-red-600 cursor-pointer"
                                title="استعادة اللون الافتراضي"
                              >
                                مسح
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Products List inside this Section (supports show/hide, rename, price edit, and product reordering) */}
                      {isExpanded && (
                        <div className="pt-2 border-t border-slate-100 space-y-1.5 max-h-60 overflow-y-auto">
                          {(() => {
                            const sortedProds = [...sec.products].sort(
                              (a, b) => (a.card_index || 0) - (b.card_index || 0)
                            );
                            return sortedProds.map((prod, pIdx) => (
                              <div
                                key={prod.id}
                                className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs"
                              >
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    disabled={pIdx === 0 || savingProdId === prod.id}
                                    onClick={() => handleMoveProductInSection(sortedProds, pIdx, -1)}
                                    className="p-1 rounded bg-white border border-slate-200 text-slate-500 hover:text-orange-600 disabled:opacity-30 cursor-pointer"
                                    title="تحريك الصنف للأعلى"
                                  >
                                    <ArrowUp size={11} />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={pIdx === sortedProds.length - 1 || savingProdId === prod.id}
                                    onClick={() => handleMoveProductInSection(sortedProds, pIdx, 1)}
                                    className="p-1 rounded bg-white border border-slate-200 text-slate-500 hover:text-orange-600 disabled:opacity-30 cursor-pointer"
                                    title="تحريك الصنف للأسفل"
                                  >
                                    <ArrowDown size={11} />
                                  </button>
                                </div>

                                <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={prod.included_in_catalog}
                                    disabled={savingProdId === prod.id}
                                    onChange={(e) =>
                                      handleQuickProductEdit(prod, {
                                        included_in_catalog: e.target.checked,
                                      })
                                    }
                                    className="rounded text-sky-600 w-4 h-4 shrink-0 cursor-pointer"
                                  />
                                  <input
                                    type="text"
                                    defaultValue={prod.name}
                                    onBlur={(e) => {
                                      const nextName = e.target.value.trim();
                                      if (nextName && nextName !== prod.name) {
                                        handleQuickProductEdit(prod, { name: nextName });
                                      }
                                    }}
                                    className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-sky-500 focus:outline-none"
                                  />
                                </label>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <input
                                    type="number"
                                    min={0}
                                    defaultValue={prod.selling_price || 0}
                                    onBlur={(e) => {
                                      const nextPrice = Math.max(0, Number(e.target.value) || 0);
                                      if (nextPrice !== prod.selling_price) {
                                        handleQuickProductEdit(prod, {
                                          selling_price: nextPrice,
                                          manual_price_set: true,
                                        });
                                      }
                                    }}
                                    className="w-20 px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-extrabold text-emerald-700 text-center font-mono focus:ring-1 focus:ring-sky-500 focus:outline-none"
                                  />
                                  <span className="text-[10px] font-bold text-slate-500">ج.م</span>
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 py-2.5 sm:px-5 sm:py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetAll}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs font-bold text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>إعادة الضبط</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 sm:px-6 py-2 sm:py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold rounded-xl shadow-sm transition-colors cursor-pointer"
          >
            حفظ وإغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
