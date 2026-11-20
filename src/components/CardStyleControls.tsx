import React, { useEffect, useMemo, useState } from 'react';
import {
  CardDensity,
  CardLayoutStyle,
  CardLogoPosition,
  CardLogoShape,
  CardPriceStyle,
  CardShapeStyle,
  CatalogCardConfig,
  DEFAULT_CARD_CONFIG,
  GridSymmetryMode,
  Product,
  ProductCardColorOverride,
} from '../types';
import { clampGridColumns, clampGridRows, resolveEffectiveGridLayout } from '../utils/pdfGenerator';
import { updateProduct } from '../utils/db';
import {
  AlignCenter,
  AlignRight,
  Check,
  CreditCard,
  Eye,
  LayoutGrid,
  Maximize2,
  Move,
  Palette,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Square,
  X,
  ZoomIn,
} from 'lucide-react';

export interface CardColorPreset {
  id: string;
  label: string;
  swatch: string;
  patch: Partial<CatalogCardConfig>;
}

export const CARD_COLOR_PRESETS: CardColorPreset[] = [
  {
    id: 'classic',
    label: 'كلاسيكي أبيض',
    swatch: '#15803d',
    patch: {
      bg_color: '#ffffff',
      border_color: '#e2e8f0',
      title_color: '#0f172a',
      price_bg_color: '#f0fdf4',
      price_border_color: '#bbf7d0',
      price_text_color: '#15803d',
      badge_bg_color: '#f1f5f9',
      badge_text_color: '#475569',
    },
  },
  {
    id: 'orange_warm',
    label: 'برتقالي دافئ',
    swatch: '#ea580c',
    patch: {
      bg_color: '#fff7ed',
      border_color: '#fed7aa',
      title_color: '#431407',
      price_bg_color: '#ea580c',
      price_border_color: '#ea580c',
      price_text_color: '#ffffff',
      badge_bg_color: '#ffedd5',
      badge_text_color: '#9a3412',
    },
  },
  {
    id: 'slate_modern',
    label: 'رمادي أنيق',
    swatch: '#0f172a',
    patch: {
      bg_color: '#f8fafc',
      border_color: '#cbd5e1',
      title_color: '#0f172a',
      price_bg_color: '#0f172a',
      price_border_color: '#0f172a',
      price_text_color: '#ffffff',
      badge_bg_color: '#e2e8f0',
      badge_text_color: '#334155',
    },
  },
  {
    id: 'gold_luxury',
    label: 'ذهبي فاخر',
    swatch: '#b45309',
    patch: {
      bg_color: '#fffbeb',
      border_color: '#fde68a',
      title_color: '#451a03',
      price_bg_color: '#b45309',
      price_border_color: '#b45309',
      price_text_color: '#ffffff',
      badge_bg_color: '#fef3c7',
      badge_text_color: '#92400e',
    },
  },
  {
    id: 'dark_pro',
    label: 'داكن فخم',
    swatch: '#1e293b',
    patch: {
      bg_color: '#1e293b',
      border_color: '#334155',
      title_color: '#f8fafc',
      price_bg_color: '#10b981',
      price_border_color: '#10b981',
      price_text_color: '#ffffff',
      badge_bg_color: '#334155',
      badge_text_color: '#cbd5e1',
    },
  },
];

export function mergeCardConfig(config?: CatalogCardConfig): CatalogCardConfig {
  return {
    ...DEFAULT_CARD_CONFIG,
    ...(config || {}),
    per_product_overrides: { ...(config?.per_product_overrides || {}) },
  };
}

export const CARD_SIZE_PRESETS: {
  id: string;
  label: string;
  patch: Partial<CatalogCardConfig>;
}[] = [
  {
    id: 'sm',
    label: 'صغير',
    patch: { card_height_scale: 85, image_height_scale: 85, font_scale: 90, page_fit_mode: 'standard' },
  },
  {
    id: 'md',
    label: 'متوسط',
    patch: { card_height_scale: 100, image_height_scale: 100, font_scale: 100, page_fit_mode: 'standard' },
  },
  {
    id: 'lg',
    label: 'كبير',
    patch: { card_height_scale: 145, image_height_scale: 135, font_scale: 115, page_fit_mode: 'standard' },
  },
  {
    id: 'xl',
    label: 'عملاق',
    patch: { card_height_scale: 195, image_height_scale: 165, font_scale: 125, page_fit_mode: 'fill_page' },
  },
];

interface CardStyleControlPanelProps {
  config?: CatalogCardConfig;
  onChangeConfig: (next: CatalogCardConfig) => void;
  onOpenCardDesigner: () => void;
  gridCols?: number;
  gridRows?: number;
  gridMode?: 'manual' | 'auto';
  gridSymmetry?: GridSymmetryMode;
  itemCount?: number;
  onChangeGrid?: (
    cols: number,
    rows: number,
    mode?: 'manual' | 'auto',
    symmetry?: GridSymmetryMode
  ) => void;
}

export const CardStyleControlPanel: React.FC<CardStyleControlPanelProps> = ({
  config,
  onChangeConfig,
  onOpenCardDesigner,
  gridCols = 4,
  gridRows = 4,
  gridMode = 'manual',
  gridSymmetry = 'any',
  itemCount = 12,
  onChangeGrid,
}) => {
  const merged = mergeCardConfig(config);
  const overrideCount = Object.keys(merged.per_product_overrides || {}).length;
  const safeCols = clampGridColumns(gridCols);
  const safeRows = gridSymmetry === 'equal' ? clampGridRows(safeCols, safeCols) : clampGridRows(gridRows, safeCols);

  const updateField = <K extends keyof CatalogCardConfig>(
    key: K,
    value: CatalogCardConfig[K]
  ) => {
    onChangeConfig({ ...merged, [key]: value });
  };

  const handleGridSymmetryChange = (nextSym: GridSymmetryMode) => {
    if (!onChangeGrid) return;
    if (gridMode === 'auto') {
      const auto = resolveEffectiveGridLayout({
        mode: 'auto',
        symmetry: nextSym,
        columns: safeCols,
        rows: safeRows,
        itemCount: Math.max(1, itemCount),
      });
      onChangeGrid(auto.cols, auto.rows, 'auto', nextSym);
      return;
    }
    if (nextSym === 'equal') {
      onChangeGrid(safeCols, clampGridRows(safeCols, safeCols), 'manual', nextSym);
    } else if (nextSym === 'different' && safeCols === safeRows) {
      const altRows = safeCols >= 4 ? safeCols - 1 : safeCols + 1;
      onChangeGrid(safeCols, clampGridRows(altRows, safeCols), 'manual', nextSym);
    } else {
      onChangeGrid(safeCols, safeRows, 'manual', nextSym);
    }
  };

  const quickGridOptions =
    gridSymmetry === 'equal'
      ? [
          { cols: 1, rows: 1 },
          { cols: 2, rows: 2 },
          { cols: 3, rows: 3 },
          { cols: 4, rows: 4 },
          { cols: 5, rows: 5 },
        ]
      : gridSymmetry === 'different'
        ? [
            { cols: 1, rows: 2 },
            { cols: 2, rows: 3 },
            { cols: 2, rows: 4 },
            { cols: 3, rows: 4 },
            { cols: 4, rows: 3 },
          ]
        : [
            { cols: 2, rows: 2 },
            { cols: 2, rows: 3 },
            { cols: 3, rows: 3 },
            { cols: 3, rows: 4 },
            { cols: 4, rows: 4 },
          ];

  return (
    <div className="p-3.5 bg-orange-50/60 border border-orange-200 rounded-xl space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
          <CreditCard size={15} className="text-orange-600" />
          شكل وعرض وألوان الكارت
        </span>
        <button
          type="button"
          onClick={onOpenCardDesigner}
          className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-orange-600 hover:bg-orange-700 text-white shadow-2xs transition-colors cursor-pointer"
        >
          تخصيص متقدم
        </button>
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        تحكم في تخطيط الكارت وعرضه وألوانه، أو اضغط على أي كارت في المعاينة لتعديل لونه منفرداً.
      </p>

      {/* Quick Presets */}
      <div>
        <span className="block text-[11px] font-bold text-slate-700 mb-1.5">
          قوالب ألوان جاهزة للكارت:
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {CARD_COLOR_PRESETS.map((preset) => {
            const isActive =
              merged.bg_color === preset.patch.bg_color &&
              merged.price_bg_color === preset.patch.price_bg_color;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChangeConfig({ ...merged, ...preset.patch })}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                  isActive
                    ? 'border-orange-600 bg-white text-orange-700 ring-1 ring-orange-500 shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                  style={{ backgroundColor: preset.swatch }}
                />
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Layout & Shape */}
      <div className="space-y-2 pt-2 border-t border-orange-200/70">
        <div>
          <span className="block text-[11px] font-bold text-slate-700 mb-1">تخطيط الكارت:</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
            {(
              [
                { id: 'vertical', label: 'عمودي' },
                { id: 'horizontal', label: 'أفقي' },
                { id: 'badge_top', label: 'السعر أعلى' },
                { id: 'overlay', label: 'صورة كاملة' },
              ] as { id: CardLayoutStyle; label: string }[]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'overlay') {
                    onChangeConfig({ ...merged, layout: 'overlay', image_fit: 'cover' });
                  } else {
                    updateField('layout', item.id);
                  }
                }}
                className={`py-1.5 px-1.5 rounded-lg text-[10px] font-bold border cursor-pointer transition-all whitespace-nowrap ${
                  merged.layout === item.id
                    ? 'border-orange-600 bg-white text-orange-700 ring-1 ring-orange-500'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {merged.layout === 'overlay' && (
          <div className="p-2.5 bg-white/85 border border-orange-200 rounded-xl space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="block text-[10px] font-bold text-slate-700 mb-1">موضع التفاصيل:</span>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'bottom', label: 'أسفل' },
                      { id: 'center', label: 'وسط' },
                      { id: 'top', label: 'أعلى' },
                    ] as const
                  ).map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => updateField('overlay_content_position', pos.id)}
                      className={`py-1 px-1 rounded-lg text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                        (merged.overlay_content_position ?? 'bottom') === pos.id
                          ? 'border-orange-600 bg-orange-50 text-orange-700 ring-1 ring-orange-500'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-[10px] font-bold text-slate-700 mb-1">لون النص فوق الصورة:</span>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'white', label: 'أبيض' },
                      { id: 'dark', label: 'داكن' },
                      { id: 'custom', label: 'مخصص' },
                    ] as const
                  ).map((tone) => (
                    <button
                      key={tone.id}
                      type="button"
                      onClick={() => updateField('overlay_text_tone', tone.id)}
                      className={`py-1 px-1 rounded-lg text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                        (merged.overlay_text_tone ?? 'white') === tone.id
                          ? 'border-orange-600 bg-orange-50 text-orange-700 ring-1 ring-orange-500'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {tone.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[10px] font-bold text-slate-700 mb-0.5">
                <span>تعتيم الخلفية لوضوح النص:</span>
                <span className="font-mono tabular-nums bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                  {merged.overlay_scrim_opacity ?? 60}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={85}
                step={5}
                value={merged.overlay_scrim_opacity ?? 60}
                onChange={(e) => updateField('overlay_scrim_opacity', Number(e.target.value))}
                className="w-full accent-orange-600 cursor-pointer"
              />
            </div>
          </div>
        )}

        <div>
          <span className="block text-[11px] font-bold text-slate-700 mb-1">شكل الإطار والزوايا:</span>
          <div className="grid grid-cols-5 gap-1">
            {(
              [
                { id: 'rounded', label: 'ناعم' },
                { id: 'pill', label: 'دائري' },
                { id: 'sharp', label: 'حاد' },
                { id: 'shadow', label: 'بظل' },
                { id: 'minimal', label: 'بلا إطار' },
              ] as { id: CardShapeStyle; label: string }[]
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => updateField('shape', st.id)}
                className={`py-1 px-1 rounded-lg text-[10px] font-bold border cursor-pointer transition-all ${
                  merged.shape === st.id
                    ? 'border-orange-600 bg-white text-orange-700 ring-1 ring-orange-500'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Price Style & Alignment */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="block text-[11px] font-bold text-slate-700 mb-1">شكل السعر:</span>
          <div className="grid grid-cols-3 gap-1">
            {(
              [
                { id: 'box', label: 'صندوق' },
                { id: 'solid_footer', label: 'شريط' },
                { id: 'inline', label: 'مباشر' },
              ] as { id: CardPriceStyle; label: string }[]
            ).map((ps) => (
              <button
                key={ps.id}
                type="button"
                onClick={() => updateField('price_style', ps.id)}
                className={`py-1 px-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
                  merged.price_style === ps.id
                    ? 'border-orange-600 bg-white text-orange-700 ring-1 ring-orange-500'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {ps.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="block text-[11px] font-bold text-slate-700 mb-1">محاذاة النص:</span>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => updateField('text_align', 'right')}
              className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg text-[10px] font-bold border cursor-pointer ${
                merged.text_align === 'right'
                  ? 'border-orange-600 bg-white text-orange-700 ring-1 ring-orange-500'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <AlignRight size={11} />
              <span>يمين</span>
            </button>
            <button
              type="button"
              onClick={() => updateField('text_align', 'center')}
              className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg text-[10px] font-bold border cursor-pointer ${
                merged.text_align === 'center'
                  ? 'border-orange-600 bg-white text-orange-700 ring-1 ring-orange-500'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <AlignCenter size={11} />
              <span>وسط</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Card Size Presets & Expanded Sliders */}
      <div className="space-y-2.5 pt-2 border-t border-orange-200/70">
        <div>
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1">
            <span>مقاس الكارت السريع (صغير ← عملاق):</span>
            <span className="font-mono tabular-nums text-[10px] bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
              {merged.card_height_scale ?? 100}%
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {CARD_SIZE_PRESETS.map((sz) => {
              const active =
                (merged.card_height_scale ?? 100) === sz.patch.card_height_scale &&
                (merged.image_height_scale ?? 100) === sz.patch.image_height_scale;
              return (
                <button
                  key={sz.id}
                  type="button"
                  onClick={() => onChangeConfig({ ...merged, ...sz.patch })}
                  className={`py-1.5 px-1 rounded-lg text-[10px] font-extrabold border cursor-pointer transition-all whitespace-nowrap ${
                    active
                      ? 'border-orange-600 bg-white text-orange-700 ring-1 ring-orange-500'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {sz.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
              <span>عرض الكارت:</span>
              <span className="font-mono tabular-nums bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                {merged.width_percent}%
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={merged.width_percent}
              onChange={(e) => updateField('width_percent', Number(e.target.value))}
              className="w-full accent-orange-600 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
              <span>ارتفاع الكارت:</span>
              <span className="font-mono tabular-nums bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                {merged.card_height_scale ?? 100}%
              </span>
            </div>
            <input
              type="range"
              min={60}
              max={220}
              step={5}
              value={merged.card_height_scale ?? 100}
              onChange={(e) => updateField('card_height_scale', Number(e.target.value))}
              className="w-full accent-orange-600 cursor-pointer"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
              <span>ارتفاع الصورة:</span>
              <span className="font-mono tabular-nums bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                {merged.image_height_scale}%
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={200}
              step={5}
              value={merged.image_height_scale}
              onChange={(e) => updateField('image_height_scale', Number(e.target.value))}
              className="w-full accent-orange-600 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
              <span>تكبير الصورة:</span>
              <span className="font-mono tabular-nums bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                {merged.image_zoom ?? 100}%
              </span>
            </div>
            <input
              type="range"
              min={70}
              max={180}
              step={5}
              value={merged.image_zoom ?? 100}
              onChange={(e) => updateField('image_zoom', Number(e.target.value))}
              className="w-full accent-orange-600 cursor-pointer"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
              <span>حجم الخطوط:</span>
              <span className="font-mono tabular-nums bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                {merged.font_scale ?? 100}%
              </span>
            </div>
            <input
              type="range"
              min={80}
              max={150}
              step={5}
              value={merged.font_scale ?? 100}
              onChange={(e) => updateField('font_scale', Number(e.target.value))}
              className="w-full accent-orange-600 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
              <span>استدارة الزوايا:</span>
              <span className="font-mono tabular-nums bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                {merged.border_radius}px
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={24}
              step={2}
              value={merged.border_radius}
              onChange={(e) => updateField('border_radius', Number(e.target.value))}
              className="w-full accent-orange-600 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Page-Fit & Equal/Different Rows & Columns Coordination */}
      <div className="p-2.5 bg-white/85 border border-orange-200 rounded-xl space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-extrabold text-slate-800 flex items-center gap-1">
            <Maximize2 size={12} className="text-orange-600" />
            تنسيق ملائمة الصفحة والصفوف والأعمدة
          </span>
          {onChangeGrid && (
            <span dir="ltr" className="text-[10px] font-mono font-extrabold bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
              {safeCols}×{safeRows}
            </span>
          )}
        </div>

        {/* Page Fit & Uniform Cards */}
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <span className="block text-[10px] font-bold text-slate-600 mb-1">ارتفاع الكارت بالصفحة:</span>
            <div className="grid grid-cols-2 gap-1">
              {[
                { id: 'standard' as const, label: 'حر (مرن)' },
                { id: 'fill_page' as const, label: 'ملء الصفحة' },
              ].map((pf) => (
                <button
                  key={pf.id}
                  type="button"
                  onClick={() => updateField('page_fit_mode', pf.id)}
                  className={`py-1 px-1 rounded-lg text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                    (merged.page_fit_mode ?? 'standard') === pf.id
                      ? 'border-orange-600 bg-orange-50 text-orange-800 ring-1 ring-orange-500'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {pf.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-[10px] font-bold text-slate-600 mb-1">مقاس الصف الأخير:</span>
            <div className="grid grid-cols-2 gap-1">
              {[
                { val: true, label: 'كروت متشابهة' },
                { val: false, label: 'تمدد للعرض' },
              ].map((u) => (
                <button
                  key={String(u.val)}
                  type="button"
                  onClick={() => updateField('uniform_row_cards', u.val)}
                  className={`py-1 px-1 rounded-lg text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                    (merged.uniform_row_cards ?? true) === u.val
                      ? 'border-orange-600 bg-orange-50 text-orange-800 ring-1 ring-orange-500'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {u.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {onChangeGrid && (
          <div className="space-y-1.5 pt-1.5 border-t border-slate-100">
            <div className="grid grid-cols-3 gap-1">
              {[
                { id: 'equal' as const, label: 'متشابهة (صف=عمود)' },
                { id: 'different' as const, label: 'غير متشابهة' },
                { id: 'any' as const, label: 'مرن' },
              ].map((sym) => (
                <button
                  key={sym.id}
                  type="button"
                  onClick={() => handleGridSymmetryChange(sym.id)}
                  className={`py-1 px-1 rounded-lg text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                    gridSymmetry === sym.id
                      ? 'border-orange-600 bg-orange-50 text-orange-800 ring-1 ring-orange-500'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {sym.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-5 gap-1">
              {quickGridOptions.map((g) => {
                const active = gridMode !== 'auto' && safeCols === g.cols && safeRows === g.rows;
                return (
                  <button
                    key={`${g.cols}x${g.rows}`}
                    type="button"
                    onClick={() => onChangeGrid(g.cols, g.rows, 'manual', gridSymmetry)}
                    dir="ltr"
                    className={`py-1 px-1 rounded-lg text-[10px] font-mono font-extrabold border cursor-pointer ${
                      active
                        ? 'border-orange-600 bg-orange-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {g.cols}×{g.rows}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-1.5 items-center">
              <div className="flex items-center justify-between gap-1 bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1">
                <span className="text-[10px] font-bold text-slate-600">الأعمدة:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const nc = clampGridColumns(safeCols - 1);
                      const nr = gridSymmetry === 'equal' ? clampGridRows(nc, nc) : safeRows;
                      onChangeGrid(nc, nr, 'manual', gridSymmetry);
                    }}
                    disabled={safeCols <= 1}
                    className="w-5 h-5 rounded bg-white border border-slate-200 text-xs font-bold disabled:opacity-40 cursor-pointer"
                  >
                    -
                  </button>
                  <span dir="ltr" className="font-mono text-[11px] font-extrabold w-4 text-center">
                    {safeCols}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const nc = clampGridColumns(safeCols + 1);
                      const nr = gridSymmetry === 'equal' ? clampGridRows(nc, nc) : safeRows;
                      onChangeGrid(nc, nr, 'manual', gridSymmetry);
                    }}
                    disabled={safeCols >= 8}
                    className="w-5 h-5 rounded bg-white border border-slate-200 text-xs font-bold disabled:opacity-40 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-1 bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1">
                <span className="text-[10px] font-bold text-slate-600">الصفوف:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeGrid(safeCols, clampGridRows(safeRows - 1, safeCols), 'manual', gridSymmetry)
                    }
                    disabled={gridSymmetry === 'equal' || safeRows <= 1}
                    className="w-5 h-5 rounded bg-white border border-slate-200 text-xs font-bold disabled:opacity-40 cursor-pointer"
                  >
                    -
                  </button>
                  <span dir="ltr" className="font-mono text-[11px] font-extrabold w-4 text-center">
                    {safeRows}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeGrid(safeCols, clampGridRows(safeRows + 1, safeCols), 'manual', gridSymmetry)
                    }
                    disabled={gridSymmetry === 'equal' || safeRows >= 10}
                    className="w-5 h-5 rounded bg-white border border-slate-200 text-xs font-bold disabled:opacity-40 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Padding & Gap */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="block text-[11px] font-bold text-slate-700 mb-1">الحشو الداخلي:</span>
          <div className="grid grid-cols-3 gap-1">
            {(
              [
                { id: 'compact', label: 'ضيق' },
                { id: 'normal', label: 'وسط' },
                { id: 'spacious', label: 'واسع' },
              ] as { id: CardDensity; label: string }[]
            ).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => updateField('padding', d.id)}
                className={`py-1 px-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
                  merged.padding === d.id
                    ? 'border-orange-600 bg-white text-orange-700 ring-1 ring-orange-500'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="block text-[11px] font-bold text-slate-700 mb-1">المسافة بين الكروت:</span>
          <div className="grid grid-cols-3 gap-1">
            {(
              [
                { id: 'compact', label: 'ضيق' },
                { id: 'normal', label: 'وسط' },
                { id: 'spacious', label: 'واسع' },
              ] as { id: CardDensity; label: string }[]
            ).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => updateField('gap', d.id)}
                className={`py-1 px-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
                  merged.gap === d.id
                    ? 'border-orange-600 bg-white text-orange-700 ring-1 ring-orange-500'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Color Pickers */}
      <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-orange-200/70">
        {[
          { key: 'bg_color' as const, label: 'خلفية الكارت' },
          { key: 'border_color' as const, label: 'الإطار' },
          { key: 'title_color' as const, label: 'اسم الصنف' },
          { key: 'price_bg_color' as const, label: 'خلفية السعر' },
          { key: 'price_text_color' as const, label: 'لون السعر' },
          { key: 'badge_bg_color' as const, label: 'خلفية الشارة' },
        ].map(({ key, label }) => (
          <label
            key={key}
            className="flex items-center justify-between gap-1 bg-white px-2 py-1 rounded-lg border border-slate-200 cursor-pointer"
          >
            <span className="text-[10px] font-bold text-slate-600 truncate">{label}</span>
            <input
              type="color"
              value={merged[key]}
              onChange={(e) => {
                const val = e.target.value;
                if (key === 'price_bg_color') {
                  onChangeConfig({ ...merged, price_bg_color: val, price_border_color: val });
                } else {
                  updateField(key, val);
                }
              }}
              className="w-5 h-5 rounded border border-slate-200 cursor-pointer shrink-0"
            />
          </label>
        ))}
      </div>

      {/* Open Full Card Designer Button */}
      <button
        type="button"
        onClick={onOpenCardDesigner}
        className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-white hover:bg-orange-600 text-orange-700 hover:text-white border border-orange-300 rounded-xl text-xs font-extrabold shadow-2xs transition-all cursor-pointer"
      >
        <Palette size={14} />
        <span>
          تعديل متقدم للكارت / كارت محدد
          {overrideCount > 0 ? ` (${overrideCount} مخصص)` : ''}
        </span>
      </button>
    </div>
  );
};

export interface CardVisibilityOptions {
  show_image: boolean;
  show_code: boolean;
  show_category: boolean;
  show_brand_on_card?: boolean;
  show_specification?: boolean;
  show_available_models?: boolean;
}

interface CardDesignerModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: CatalogCardConfig;
  onChangeConfig: (next: CatalogCardConfig) => void;
  products: Product[];
  initialProductId?: string | null;
  visibility?: CardVisibilityOptions;
  onChangeVisibility?: (patch: Partial<CardVisibilityOptions>) => void;
  onProductsUpdated?: (products: Product[]) => void;
  logoUrl?: string;
  onOpenLogoStudio?: () => void;
}

export const CardDesignerModal: React.FC<CardDesignerModalProps> = ({
  isOpen,
  onClose,
  config,
  onChangeConfig,
  products,
  initialProductId,
  visibility,
  onChangeVisibility,
  onProductsUpdated,
  logoUrl,
  onOpenLogoStudio,
}) => {
  const merged = mergeCardConfig(config);
  const eligibleProducts = useMemo(
    () => products.filter((p) => !(p as any).is_unread_placeholder && p.name?.trim()),
    [products]
  );

  const [activeTab, setActiveTab] = useState<'global' | 'single'>(
    initialProductId ? 'single' : 'global'
  );
  const [selectedProductId, setSelectedProductId] = useState<string>(
    initialProductId || eligibleProducts[0]?.id || ''
  );
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState<number>(0);
  const [previewZoom, setPreviewZoom] = useState<number>(105);
  const [savingProduct, setSavingProduct] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (initialProductId) {
      setSelectedProductId(initialProductId);
      setActiveTab('single');
    } else if (!selectedProductId && eligibleProducts[0]?.id) {
      setSelectedProductId(eligibleProducts[0].id);
    }
  }, [isOpen, initialProductId, eligibleProducts, selectedProductId]);

  const targetProduct = useMemo(
    () => eligibleProducts.find((p) => p.id === selectedProductId) || eligibleProducts[0] || null,
    [eligibleProducts, selectedProductId]
  );

  useEffect(() => {
    if (targetProduct) {
      setEditName(targetProduct.name);
      setEditPrice(targetProduct.selling_price || 0);
    }
  }, [targetProduct]);

  if (!isOpen) return null;

  const updateGlobalField = <K extends keyof CatalogCardConfig>(
    key: K,
    value: CatalogCardConfig[K]
  ) => {
    onChangeConfig({ ...merged, [key]: value });
  };

  const singleOverride: ProductCardColorOverride = targetProduct
    ? merged.per_product_overrides?.[targetProduct.id] || {}
    : {};

  const updateSingleOverride = (patch: Partial<ProductCardColorOverride>) => {
    if (!targetProduct) return;
    const prevAll = merged.per_product_overrides || {};
    const nextSingle = { ...(prevAll[targetProduct.id] || {}), ...patch };
    onChangeConfig({
      ...merged,
      per_product_overrides: {
        ...prevAll,
        [targetProduct.id]: nextSingle,
      },
    });
  };

  const resetSingleOverride = () => {
    if (!targetProduct) return;
    const prevAll = { ...(merged.per_product_overrides || {}) };
    delete prevAll[targetProduct.id];
    onChangeConfig({
      ...merged,
      per_product_overrides: prevAll,
    });
  };

  const handleSaveSingleProductData = async () => {
    if (!targetProduct) return;
    const cleanName = editName.trim() || targetProduct.name;
    const cleanPrice = Math.max(0, Number(editPrice) || 0);
    setSavingProduct(true);
    try {
      const updated: Product = {
        ...targetProduct,
        name: cleanName,
        selling_price: cleanPrice,
        manual_price_set: cleanPrice !== targetProduct.selling_price ? true : targetProduct.manual_price_set,
        updated_at: Date.now(),
      };
      await updateProduct(updated);
      if (onProductsUpdated) {
        onProductsUpdated(products.map((p) => (p.id === updated.id ? updated : p)));
      }
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 1800);
    } finally {
      setSavingProduct(false);
    }
  };

  // Resolved preview values for the sample card
  const previewUseOverride = activeTab === 'single' && targetProduct;
  const previewBg = (previewUseOverride ? singleOverride.bg_color : undefined) || merged.bg_color;
  const previewBorder =
    (previewUseOverride ? singleOverride.border_color : undefined) || merged.border_color;
  const previewTitleColor =
    (previewUseOverride ? singleOverride.title_color : undefined) || merged.title_color;
  const previewPriceBg =
    (previewUseOverride ? singleOverride.price_bg_color : undefined) || merged.price_bg_color;
  const previewPriceText =
    (previewUseOverride ? singleOverride.price_text_color : undefined) || merged.price_text_color;

  const previewRadius =
    merged.shape === 'sharp'
      ? 0
      : merged.shape === 'pill'
        ? Math.max(16, merged.border_radius)
        : merged.border_radius;
  const previewBorderWidth = merged.shape === 'minimal' ? 0 : merged.border_width;
  const previewPadPx =
    merged.padding === 'compact' ? 8 : merged.padding === 'spacious' ? 16 : 12;
  const cardHeightScale = Math.min(2.2, Math.max(0.6, (merged.card_height_scale ?? 100) / 100));
  const previewFontScale = Math.min(1.5, Math.max(0.8, (merged.font_scale ?? 100) / 100));
  const previewImgZoom = Math.min(1.8, Math.max(0.7, (merged.image_zoom ?? 100) / 100));
  const previewImgFit = merged.image_fit === 'cover' ? 'cover' : 'contain';
  const previewZoomRatio = previewZoom / 100;
  const previewImgPx = Math.round(
    92 *
      (merged.image_height_scale / 100) *
      (0.75 + (cardHeightScale - 0.6) * 0.42) *
      previewZoomRatio
  );
  const previewHorizImgPct = Math.round(
    Math.min(60, Math.max(22, 38 * (merged.image_height_scale / 100)))
  );
  const previewMaxCardW = Math.round(280 * previewZoomRatio);
  const previewMinCardH = Math.round(220 * cardHeightScale * previewZoomRatio);

  const vis: CardVisibilityOptions = {
    show_image: visibility?.show_image ?? true,
    show_code: visibility?.show_code ?? true,
    show_category: visibility?.show_category ?? true,
    show_brand_on_card: visibility?.show_brand_on_card ?? false,
    show_specification: visibility?.show_specification ?? true,
    show_available_models: visibility?.show_available_models ?? true,
  };

  const sampleName = targetProduct?.name || 'سماعة بلوتوث أصلية شحن سريع';
  const samplePrice = activeTab === 'single' ? editPrice : targetProduct?.selling_price || 350;
  const sampleCode = targetProduct?.code || 'SH-102';
  const sampleCat = targetProduct?.category || 'ايربودز';
  const sampleImage = targetProduct?.image_url;

  const renderLivePriceNode = () => {
    if (merged.price_style === 'inline') {
      return (
        <div
          className="mb-1.5 font-black"
          style={{ color: previewPriceText, textAlign: merged.text_align }}
        >
          <span style={{ fontSize: `${Math.round(16 * previewFontScale)}px` }}>{samplePrice}</span>{' '}
          <span style={{ fontSize: `${Math.round(11 * previewFontScale)}px` }} className="font-bold">
            ج.م
          </span>
        </div>
      );
    }
    return (
      <div
        className="flex items-baseline justify-between px-2.5 py-1.5 mb-1.5"
        style={{
          backgroundColor: previewPriceBg,
          borderRadius: `${Math.min(8, previewRadius || 6)}px`,
          border:
            merged.price_style === 'solid_footer'
              ? 'none'
              : `1px solid ${merged.price_border_color}`,
          color: previewPriceText,
        }}
      >
        <span style={{ fontSize: `${Math.round(10 * previewFontScale)}px` }} className="font-bold">
          سعر البيع:
        </span>
        <span style={{ fontSize: `${Math.round(14 * previewFontScale)}px` }} className="font-black">
          {samplePrice}{' '}
          <span style={{ fontSize: `${Math.round(10 * previewFontScale)}px` }} className="font-bold">
            ج.م
          </span>
        </span>
      </div>
    );
  };

  const isImageScopedCardLogo =
    merged.card_logo_scope === 'image' && merged.layout !== 'overlay' && vis.show_image;
  const cardLogoLayer = merged.card_logo_layer ?? 'front';

  const renderLiveCardLogoStamp = () => {
    if (!merged.card_logo_enabled || !logoUrl) return null;
    const clSize = Math.min(
      96,
      Math.max(12, Math.round((merged.card_logo_size ?? 26) * previewZoomRatio))
    );
    const clInset = Math.min(28, Math.max(0, Math.round((merged.card_logo_inset ?? 6) * previewZoomRatio)));
    const clOffX = Math.round((merged.card_logo_offset_x ?? 0) * previewZoomRatio);
    const clOffY = Math.round((merged.card_logo_offset_y ?? 0) * previewZoomRatio);
    const clOpacity = Math.min(1, Math.max(0.08, merged.card_logo_opacity ?? 0.85));
    const clRot = Math.min(45, Math.max(-45, merged.card_logo_rotation ?? 0));
    const clShape = merged.card_logo_shape ?? 'rounded';
    const clBg = merged.card_logo_bg !== false && clShape !== 'clean';
    const clPos = merged.card_logo_position ?? 'top-left';
    const clRadius =
      clShape === 'circle' || clShape === 'pill'
        ? '9999px'
        : clShape === 'rounded'
          ? `${Math.max(4, Math.round(clSize * 0.22))}px`
          : '0px';
    const clPad = clBg ? Math.max(1, Math.round(clSize * 0.1)) : 0;

    const posStyle: React.CSSProperties = {};
    const transforms: string[] = [];
    if (clPos === 'top-right') {
      posStyle.top = `${clInset + clOffY}px`;
      posStyle.right = `${clInset - clOffX}px`;
    } else if (clPos === 'top-center') {
      posStyle.top = `${clInset + clOffY}px`;
      posStyle.left = '50%';
      transforms.push(`translateX(calc(-50% + ${clOffX}px))`);
    } else if (clPos === 'top-left') {
      posStyle.top = `${clInset + clOffY}px`;
      posStyle.left = `${clInset + clOffX}px`;
    } else if (clPos === 'center') {
      posStyle.top = '50%';
      posStyle.left = '50%';
      transforms.push(`translate(calc(-50% + ${clOffX}px), calc(-50% + ${clOffY}px))`);
    } else if (clPos === 'bottom-right') {
      posStyle.bottom = `${clInset - clOffY}px`;
      posStyle.right = `${clInset - clOffX}px`;
    } else {
      posStyle.bottom = `${clInset - clOffY}px`;
      posStyle.left = `${clInset + clOffX}px`;
    }
    if (clRot !== 0) {
      transforms.push(`rotate(${clRot}deg)`);
    }

    return (
      <div
        style={{
          position: 'absolute',
          ...posStyle,
          transform: transforms.length > 0 ? transforms.join(' ') : undefined,
          width: `${clSize}px`,
          height: `${clSize}px`,
          borderRadius: clRadius,
          padding: `${clPad}px`,
          background: clBg ? 'rgba(255,255,255,0.92)' : 'transparent',
          border: clBg ? '1px solid #e2e8f0' : 'none',
          boxShadow: clBg ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
          opacity: clOpacity,
          zIndex: cardLogoLayer === 'back' ? 0 : 4,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <img
          src={logoUrl}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[75] bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
              <SlidersHorizontal size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                مصمم الكارت: الشكل، العرض، والألوان
              </h3>
              <p className="text-[11px] text-slate-500">
                عدّل شكل كل الكروت أو خصّص ألوان وبيانات كارت محدد — التغييرات تظهر فوراً في الـ PDF
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-xl cursor-pointer"
            aria-label="إغلاق"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-100 bg-white flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('global')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === 'global'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <LayoutGrid size={14} />
            <span>تصميم كل الكروت (الشكل والعرض واللون)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('single')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === 'single'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Palette size={14} />
            <span>تخصيص كارت صنف محدد</span>
            {Object.keys(merged.per_product_overrides || {}).length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-white/25 text-[10px]">
                {Object.keys(merged.per_product_overrides || {}).length}
              </span>
            )}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Live Card Preview Column */}
          <div className="lg:col-span-5 bg-slate-100/90 border border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-between gap-3">
            <div className="w-full space-y-2">
              <div className="w-full flex items-center justify-between text-[11px] font-bold text-slate-600">
                <span className="flex items-center gap-1">
                  <Eye size={13} className="text-orange-600" />
                  معاينة حية لصورة الكارت
                </span>
                <span className="font-mono tabular-nums text-[10px] text-slate-500">
                  {merged.width_percent}% × {merged.card_height_scale ?? 100}% ·{' '}
                  {merged.layout === 'overlay'
                    ? `صورة كاملة · تكبير ${merged.image_zoom ?? 100}%`
                    : `صورة ${merged.image_height_scale}%`}
                </span>
              </div>

              {/* Card Display Preview Size Controller */}
              <div className="w-full bg-white/90 border border-slate-200 rounded-xl px-2.5 py-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-700">
                  <span className="flex items-center gap-1">
                    <ZoomIn size={13} className="text-orange-600" />
                    حجم عرض الكارت في المعاينة:
                  </span>
                  <div className="flex items-center gap-1">
                    {[75, 100, 125, 150].map((z) => (
                      <button
                        key={z}
                        type="button"
                        onClick={() => setPreviewZoom(z)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold border transition-colors cursor-pointer ${
                          previewZoom === z
                            ? 'bg-orange-600 text-white border-orange-600'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {z}%
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="range"
                  min={70}
                  max={160}
                  step={5}
                  value={previewZoom}
                  onChange={(e) => setPreviewZoom(Number(e.target.value))}
                  aria-label="حجم عرض الكارت في المعاينة"
                  className="w-full accent-orange-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Simulated Card */}
            <div className="w-full flex-1 flex items-center justify-center py-2 overflow-auto">
              {merged.layout === 'overlay' ? (
                (() => {
                  const overlayScrimAlpha = Math.min(
                    0.85,
                    Math.max(0, (merged.overlay_scrim_opacity ?? 60) / 100)
                  );
                  const overlayPos = merged.overlay_content_position ?? 'bottom';
                  const overlayTone = merged.overlay_text_tone ?? 'white';
                  const overlayTitleColor =
                    overlayTone === 'white'
                      ? '#ffffff'
                      : overlayTone === 'dark'
                        ? '#0f172a'
                        : previewTitleColor;
                  const overlayMetaColor =
                    overlayTone === 'white'
                      ? 'rgba(241, 245, 249, 0.92)'
                      : overlayTone === 'dark'
                        ? '#334155'
                        : merged.badge_text_color;
                  const overlayJustify =
                    overlayPos === 'top'
                      ? 'flex-start'
                      : overlayPos === 'center'
                        ? 'center'
                        : 'flex-end';
                  const overlayScrimCss =
                    overlayScrimAlpha <= 0
                      ? 'transparent'
                      : overlayPos === 'top'
                        ? `linear-gradient(to bottom, rgba(15,23,42,${Math.min(0.92, overlayScrimAlpha * 1.15)}) 0%, rgba(15,23,42,${(overlayScrimAlpha * 0.55).toFixed(2)}) 58%, rgba(15,23,42,0) 100%)`
                        : overlayPos === 'center'
                          ? `linear-gradient(to bottom, rgba(15,23,42,${(overlayScrimAlpha * 0.45).toFixed(2)}) 0%, rgba(15,23,42,${Math.min(0.9, overlayScrimAlpha * 1.05).toFixed(2)}) 50%, rgba(15,23,42,${(overlayScrimAlpha * 0.5).toFixed(2)}) 100%)`
                          : `linear-gradient(to top, rgba(15,23,42,${Math.min(0.92, overlayScrimAlpha * 1.18)}) 0%, rgba(15,23,42,${(overlayScrimAlpha * 0.55).toFixed(2)}) 56%, rgba(15,23,42,0) 100%)`;

                  return (
                    <div
                      style={{
                        position: 'relative',
                        overflow: 'hidden',
                        width: `${merged.width_percent}%`,
                        maxWidth: `${previewMaxCardW}px`,
                        minHeight: `${previewMinCardH}px`,
                        backgroundColor: previewBg,
                        border: `${previewBorderWidth}px solid ${previewBorder}`,
                        borderRadius: `${previewRadius}px`,
                        padding: `${previewPadPx}px`,
                        boxShadow:
                          merged.shape === 'shadow'
                            ? '0 8px 20px rgba(15, 23, 42, 0.14)'
                            : '0 1px 2px rgba(0,0,0,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: overlayJustify,
                      }}
                    >
                      {vis.show_image && (
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#f8fafc',
                          }}
                        >
                          {sampleImage ? (
                            <img
                              src={sampleImage}
                              alt={sampleName}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: previewImgFit,
                                transform: `scale(${previewImgZoom})`,
                                transformOrigin: 'center center',
                              }}
                            />
                          ) : (
                            <span className="text-[11px] text-slate-400">صورة المنتج</span>
                          )}
                        </div>
                      )}

                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          zIndex: 1,
                          pointerEvents: 'none',
                          background: overlayScrimCss,
                        }}
                      />

                      {renderLiveCardLogoStamp()}

                      <div style={{ position: 'relative', zIndex: 2, width: '100%' }}>
                        <h4
                          className="font-extrabold leading-snug mb-1 line-clamp-2"
                          style={{
                            color: overlayTitleColor,
                            textAlign: merged.text_align,
                            fontSize: `${Math.round(12 * previewFontScale)}px`,
                            textShadow:
                              overlayTone === 'white' ? '0 1px 3px rgba(0,0,0,0.45)' : 'none',
                          }}
                        >
                          {sampleName}
                        </h4>

                        {vis.show_brand_on_card && targetProduct?.group && (
                          <p
                            className="text-[10px] font-bold mb-0.5"
                            style={{ color: overlayMetaColor, textAlign: merged.text_align }}
                          >
                            {targetProduct.group}
                          </p>
                        )}

                        {vis.show_specification && targetProduct?.specification && (
                          <p
                            className="text-[10px] truncate mb-1"
                            style={{ color: overlayMetaColor, textAlign: merged.text_align }}
                          >
                            {targetProduct.specification}
                          </p>
                        )}

                        {vis.show_available_models &&
                          targetProduct?.available_models &&
                          targetProduct.available_models.length > 0 && (
                            <p
                              className="text-[9.5px] truncate mb-1"
                              style={{ color: overlayMetaColor, textAlign: merged.text_align }}
                            >
                              {targetProduct.available_models.slice(0, 3).join(' • ')}
                            </p>
                          )}

                        {renderLivePriceNode()}

                        {(vis.show_code || vis.show_category) && (
                          <div className="flex items-center justify-between gap-1 text-[9px] font-bold">
                            {vis.show_code ? (
                              <span
                                className="px-1.5 py-0.5 rounded"
                                style={{
                                  backgroundColor: merged.badge_bg_color,
                                  color: merged.badge_text_color,
                                }}
                              >
                                {sampleCode}
                              </span>
                            ) : (
                              <span />
                            )}
                            {vis.show_category && (
                              <span
                                className="px-1.5 py-0.5 rounded border"
                                style={{
                                  backgroundColor: merged.badge_bg_color,
                                  color: merged.badge_text_color,
                                  borderColor: previewBorder,
                                }}
                              >
                                {sampleCat}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    width: `${merged.width_percent}%`,
                    maxWidth: `${previewMaxCardW}px`,
                    minHeight: `${previewMinCardH}px`,
                    backgroundColor: previewBg,
                    border: `${previewBorderWidth}px solid ${previewBorder}`,
                    borderRadius: `${previewRadius}px`,
                    padding: `${previewPadPx}px`,
                    boxShadow:
                      merged.shape === 'shadow'
                        ? '0 8px 20px rgba(15, 23, 42, 0.10)'
                        : '0 1px 2px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: merged.layout === 'horizontal' ? 'row' : 'column',
                    justifyContent: 'space-between',
                    gap: merged.layout === 'horizontal' ? '10px' : '0px',
                  }}
                >
                  {!isImageScopedCardLogo && renderLiveCardLogoStamp()}

                  {merged.layout === 'badge_top' && (
                    <div style={{ position: 'relative', zIndex: 2 }}>{renderLivePriceNode()}</div>
                  )}

                  {vis.show_image && (
                    <div
                      className="flex items-center justify-center overflow-hidden shrink-0"
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        backgroundColor: '#fafafa',
                        border: '1px solid #f1f5f9',
                        width: merged.layout === 'horizontal' ? `${previewHorizImgPct}%` : '100%',
                        height: `${merged.layout === 'horizontal' ? Math.max(70, previewImgPx) : previewImgPx}px`,
                        borderRadius: `${Math.max(4, previewRadius - 2)}px`,
                        marginBottom: merged.layout === 'horizontal' ? '0px' : '8px',
                      }}
                    >
                      {isImageScopedCardLogo && cardLogoLayer === 'back' && renderLiveCardLogoStamp()}
                      {sampleImage ? (
                        <img
                          src={sampleImage}
                          alt={sampleName}
                          style={{
                            position: 'relative',
                            zIndex: 1,
                            width: previewImgFit === 'cover' ? '100%' : 'auto',
                            height: previewImgFit === 'cover' ? '100%' : 'auto',
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: previewImgFit,
                            transform: `scale(${previewImgZoom})`,
                            transformOrigin: 'center center',
                          }}
                        />
                      ) : (
                        <span className="relative z-[1] text-[11px] text-slate-400">صورة المنتج</span>
                      )}
                      {isImageScopedCardLogo && cardLogoLayer === 'front' && renderLiveCardLogoStamp()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0 flex flex-col justify-between" style={{ position: 'relative', zIndex: 2 }}>
                    <div>
                      <h4
                        className="font-extrabold leading-snug mb-1.5 line-clamp-2"
                        style={{
                          color: previewTitleColor,
                          textAlign: merged.text_align,
                          fontSize: `${Math.round(12 * previewFontScale)}px`,
                        }}
                      >
                        {sampleName}
                      </h4>

                      {vis.show_brand_on_card && targetProduct?.group && (
                        <p
                          className="text-[10px] font-bold mb-1"
                          style={{ color: merged.badge_text_color, textAlign: merged.text_align }}
                        >
                          {targetProduct.group}
                        </p>
                      )}

                      {vis.show_specification && targetProduct?.specification && (
                        <p
                          className="text-[10px] opacity-80 truncate mb-1"
                          style={{ color: merged.badge_text_color, textAlign: merged.text_align }}
                        >
                          {targetProduct.specification}
                        </p>
                      )}
                    </div>

                    <div>
                      {merged.layout !== 'badge_top' && renderLivePriceNode()}

                      {(vis.show_code || vis.show_category) && (
                        <div className="flex items-center justify-between gap-1 text-[9px] font-bold">
                          {vis.show_code ? (
                            <span
                              className="px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: merged.badge_bg_color,
                                color: merged.badge_text_color,
                              }}
                            >
                              {sampleCode}
                            </span>
                          ) : (
                            <span />
                          )}
                          {vis.show_category && (
                            <span
                              className="px-1.5 py-0.5 rounded border"
                              style={{
                                backgroundColor: merged.badge_bg_color,
                                color: merged.badge_text_color,
                                borderColor: previewBorder,
                              }}
                            >
                              {sampleCat}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="w-full text-[11px] text-slate-500 bg-white/80 rounded-xl p-2.5 border border-slate-200/80 text-center">
              تقدر تضغط على أي كارت في المعاينة الرئيسية للكتالوج لفتح إعدادات لونه مباشرة.
            </div>
          </div>

          {/* Controls Column */}
          <div className="lg:col-span-7 space-y-4">
            {activeTab === 'global' ? (
              <>
                {/* Presets */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                  <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-orange-600" />
                    ثيمات ألوان جاهزة للكروت:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    {CARD_COLOR_PRESETS.map((preset) => {
                      const isActive =
                        merged.bg_color === preset.patch.bg_color &&
                        merged.price_bg_color === preset.patch.price_bg_color;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => onChangeConfig({ ...merged, ...preset.patch })}
                          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[11px] font-bold border cursor-pointer transition-all ${
                            isActive
                              ? 'border-orange-600 bg-white text-orange-700 ring-1 ring-orange-500 shadow-2xs'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span
                            className="w-3 h-3 rounded-full shrink-0 border border-black/10"
                            style={{ backgroundColor: preset.swatch }}
                          />
                          <span className="truncate">{preset.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Shape & Layout */}
                <div className="p-3.5 bg-white border border-slate-200 rounded-2xl space-y-3">
                  <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <Square size={14} className="text-orange-600" />
                    الشكل والتخطيط
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="block text-[11px] font-bold text-slate-600 mb-1">
                        ترتيب محتوى الكارت:
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {(
                          [
                            { id: 'vertical', label: 'عمودي' },
                            { id: 'horizontal', label: 'أفقي' },
                            { id: 'badge_top', label: 'السعر أعلى' },
                            { id: 'overlay', label: 'صورة كاملة' },
                          ] as { id: CardLayoutStyle; label: string }[]
                        ).map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => {
                              if (l.id === 'overlay') {
                                onChangeConfig({ ...merged, layout: 'overlay', image_fit: 'cover' });
                              } else {
                                updateGlobalField('layout', l.id);
                              }
                            }}
                            className={`py-1.5 px-1.5 rounded-xl text-[11px] font-bold border cursor-pointer whitespace-nowrap ${
                              merged.layout === l.id
                                ? 'bg-orange-600 text-white border-orange-600'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            {l.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="block text-[11px] font-bold text-slate-600 mb-1">
                        شكل الإطار:
                      </span>
                      <div className="grid grid-cols-5 gap-1">
                        {(
                          [
                            { id: 'rounded', label: 'ناعم' },
                            { id: 'pill', label: 'دائري' },
                            { id: 'sharp', label: 'حاد' },
                            { id: 'shadow', label: 'بظل' },
                            { id: 'minimal', label: 'بلا إطار' },
                          ] as { id: CardShapeStyle; label: string }[]
                        ).map((sh) => (
                          <button
                            key={sh.id}
                            type="button"
                            onClick={() => updateGlobalField('shape', sh.id)}
                            className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border cursor-pointer ${
                              merged.shape === sh.id
                                ? 'bg-orange-600 text-white border-orange-600'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            {sh.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {merged.layout === 'overlay' && (
                    <div className="p-3 bg-orange-50/70 border border-orange-200/80 rounded-xl space-y-2.5">
                      <span className="block text-[11px] font-extrabold text-orange-800">
                        إعدادات الصورة الكاملة والنص فوقها:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                        <div>
                          <span className="block text-[10px] font-bold text-slate-700 mb-1">
                            موضع التفاصيل فوق الصورة:
                          </span>
                          <div className="grid grid-cols-3 gap-1">
                            {(
                              [
                                { id: 'bottom', label: 'أسفل' },
                                { id: 'center', label: 'وسط' },
                                { id: 'top', label: 'أعلى' },
                              ] as const
                            ).map((pos) => (
                              <button
                                key={pos.id}
                                type="button"
                                onClick={() =>
                                  updateGlobalField('overlay_content_position', pos.id)
                                }
                                className={`py-1.5 px-1 rounded-lg text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                                  (merged.overlay_content_position ?? 'bottom') === pos.id
                                    ? 'bg-orange-600 text-white border-orange-600'
                                    : 'bg-white text-slate-700 border-slate-200'
                                }`}
                              >
                                {pos.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="block text-[10px] font-bold text-slate-700 mb-1">
                            لون النص فوق الصورة:
                          </span>
                          <div className="grid grid-cols-3 gap-1">
                            {(
                              [
                                { id: 'white', label: 'أبيض' },
                                { id: 'dark', label: 'داكن' },
                                { id: 'custom', label: 'لون الكارت' },
                              ] as const
                            ).map((tone) => (
                              <button
                                key={tone.id}
                                type="button"
                                onClick={() => updateGlobalField('overlay_text_tone', tone.id)}
                                className={`py-1.5 px-1 rounded-lg text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                                  (merged.overlay_text_tone ?? 'white') === tone.id
                                    ? 'bg-orange-600 text-white border-orange-600'
                                    : 'bg-white text-slate-700 border-slate-200'
                                }`}
                              >
                                {tone.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-700 mb-1">
                            <span>تعتيم الخلفية لوضوح النص</span>
                            <span className="font-mono tabular-nums text-orange-700">
                              {merged.overlay_scrim_opacity ?? 60}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={85}
                            step={5}
                            value={merged.overlay_scrim_opacity ?? 60}
                            onChange={(e) =>
                              updateGlobalField('overlay_scrim_opacity', Number(e.target.value))
                            }
                            className="w-full accent-orange-600 cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="block text-[11px] font-bold text-slate-600 mb-1">
                        شكل السعر:
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { id: 'box', label: 'صندوق' },
                            { id: 'solid_footer', label: 'شريط' },
                            { id: 'inline', label: 'مباشر' },
                          ] as { id: CardPriceStyle; label: string }[]
                        ).map((ps) => (
                          <button
                            key={ps.id}
                            type="button"
                            onClick={() => updateGlobalField('price_style', ps.id)}
                            className={`py-1.5 px-2 rounded-xl text-[11px] font-bold border cursor-pointer ${
                              merged.price_style === ps.id
                                ? 'bg-orange-600 text-white border-orange-600'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            {ps.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="block text-[11px] font-bold text-slate-600 mb-1">
                        محاذاة النص ونمط الصورة:
                      </span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => updateGlobalField('text_align', 'right')}
                            className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-xl text-[10px] font-bold border cursor-pointer ${
                              merged.text_align === 'right'
                                ? 'bg-orange-600 text-white border-orange-600'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            <AlignRight size={11} />
                            <span>يمين</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => updateGlobalField('text_align', 'center')}
                            className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-xl text-[10px] font-bold border cursor-pointer ${
                              merged.text_align === 'center'
                                ? 'bg-orange-600 text-white border-orange-600'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            <AlignCenter size={11} />
                            <span>وسط</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => updateGlobalField('image_fit', 'contain')}
                            className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                              (merged.image_fit ?? 'contain') === 'contain'
                                ? 'bg-orange-600 text-white border-orange-600'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                            title="عرض الصورة كاملة داخل الإطار"
                          >
                            احتواء
                          </button>
                          <button
                            type="button"
                            onClick={() => updateGlobalField('image_fit', 'cover')}
                            className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                              merged.image_fit === 'cover'
                                ? 'bg-orange-600 text-white border-orange-600'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                            title="ملء إطار الصورة بالكامل"
                          >
                            ملء الإطار
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="block text-[11px] font-bold text-slate-600 mb-1">
                        الحشو الداخلي للكارت:
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { id: 'compact', label: 'ضيق' },
                            { id: 'normal', label: 'وسط' },
                            { id: 'spacious', label: 'واسع' },
                          ] as { id: CardDensity; label: string }[]
                        ).map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => updateGlobalField('padding', d.id)}
                            className={`py-1.5 px-2 rounded-xl text-[11px] font-bold border cursor-pointer ${
                              merged.padding === d.id
                                ? 'bg-orange-600 text-white border-orange-600'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="block text-[11px] font-bold text-slate-600 mb-1">
                        المسافة بين الكروت:
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { id: 'compact', label: 'ضيق' },
                            { id: 'normal', label: 'وسط' },
                            { id: 'spacious', label: 'واسع' },
                          ] as { id: CardDensity; label: string }[]
                        ).map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => updateGlobalField('gap', d.id)}
                            className={`py-1.5 px-2 rounded-xl text-[11px] font-bold border cursor-pointer ${
                              merged.gap === d.id
                                ? 'bg-orange-600 text-white border-orange-600'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Quick Size Presets + Expanded Size & Scale Sliders */}
                  <div className="pt-2 border-t border-slate-100 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
                      <div>
                        <span className="block text-[11px] font-bold text-slate-600 mb-1">
                          مقاس الكارت السريع:
                        </span>
                        <div className="grid grid-cols-4 gap-1">
                          {CARD_SIZE_PRESETS.map((sz) => {
                            const active =
                              (merged.card_height_scale ?? 100) === sz.patch.card_height_scale &&
                              (merged.image_height_scale ?? 100) === sz.patch.image_height_scale;
                            return (
                              <button
                                key={sz.id}
                                type="button"
                                onClick={() => onChangeConfig({ ...merged, ...sz.patch })}
                                className={`py-1.5 px-1.5 rounded-xl text-[11px] font-extrabold border cursor-pointer whitespace-nowrap ${
                                  active
                                    ? 'bg-orange-600 text-white border-orange-600'
                                    : 'bg-slate-50 text-slate-700 border-slate-200'
                                }`}
                              >
                                {sz.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="block text-[11px] font-bold text-slate-600 mb-1">
                            ملائمة الصفحة:
                          </span>
                          <div className="grid grid-cols-2 gap-1">
                            {[
                              { id: 'standard' as const, label: 'حر' },
                              { id: 'fill_page' as const, label: 'ملء الصفحة' },
                            ].map((pf) => (
                              <button
                                key={pf.id}
                                type="button"
                                onClick={() => updateGlobalField('page_fit_mode', pf.id)}
                                className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                                  (merged.page_fit_mode ?? 'standard') === pf.id
                                    ? 'bg-orange-600 text-white border-orange-600'
                                    : 'bg-slate-50 text-slate-700 border-slate-200'
                                }`}
                              >
                                {pf.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="block text-[11px] font-bold text-slate-600 mb-1">
                            تناسق الكروت:
                          </span>
                          <div className="grid grid-cols-2 gap-1">
                            {[
                              { val: true, label: 'متشابهة' },
                              { val: false, label: 'تمدد' },
                            ].map((u) => (
                              <button
                                key={String(u.val)}
                                type="button"
                                onClick={() => updateGlobalField('uniform_row_cards', u.val)}
                                className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                                  (merged.uniform_row_cards ?? true) === u.val
                                    ? 'bg-orange-600 text-white border-orange-600'
                                    : 'bg-slate-50 text-slate-700 border-slate-200'
                                }`}
                              >
                                {u.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                          <span>عرض الكارت</span>
                          <span className="font-mono tabular-nums text-orange-700">
                            {merged.width_percent}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={50}
                          max={100}
                          step={5}
                          value={merged.width_percent}
                          onChange={(e) => updateGlobalField('width_percent', Number(e.target.value))}
                          className="w-full accent-orange-600 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                          <span>ارتفاع الكارت</span>
                          <span className="font-mono tabular-nums text-orange-700">
                            {merged.card_height_scale ?? 100}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={60}
                          max={220}
                          step={5}
                          value={merged.card_height_scale ?? 100}
                          onChange={(e) =>
                            updateGlobalField('card_height_scale', Number(e.target.value))
                          }
                          className="w-full accent-orange-600 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                          <span>ارتفاع إطار الصورة</span>
                          <span className="font-mono tabular-nums text-orange-700">
                            {merged.image_height_scale}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={50}
                          max={200}
                          step={5}
                          value={merged.image_height_scale}
                          onChange={(e) =>
                            updateGlobalField('image_height_scale', Number(e.target.value))
                          }
                          className="w-full accent-orange-600 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                          <span>تكبير الصورة</span>
                          <span className="font-mono tabular-nums text-orange-700">
                            {merged.image_zoom ?? 100}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={70}
                          max={180}
                          step={5}
                          value={merged.image_zoom ?? 100}
                          onChange={(e) => updateGlobalField('image_zoom', Number(e.target.value))}
                          className="w-full accent-orange-600 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                          <span>حجم النصوص</span>
                          <span className="font-mono tabular-nums text-orange-700">
                            {merged.font_scale ?? 100}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={80}
                          max={150}
                          step={5}
                          value={merged.font_scale ?? 100}
                          onChange={(e) => updateGlobalField('font_scale', Number(e.target.value))}
                          className="w-full accent-orange-600 cursor-pointer"
                        />
                      </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                        <span>استدارة الزوايا</span>
                        <span className="font-mono tabular-nums text-orange-700">
                          {merged.border_radius}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={24}
                        step={2}
                        value={merged.border_radius}
                        onChange={(e) => updateGlobalField('border_radius', Number(e.target.value))}
                        className="w-full accent-orange-600 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                        <span>سُمك الإطار</span>
                        <span className="font-mono tabular-nums text-orange-700">
                          {merged.border_width}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={3}
                        step={1}
                        value={merged.border_width}
                        onChange={(e) => updateGlobalField('border_width', Number(e.target.value))}
                        className="w-full accent-orange-600 cursor-pointer"
                      />
                    </div>
                  </div>
                  </div>
                </div>

                {/* Global Colors */}
                <div className="p-3.5 bg-white border border-slate-200 rounded-2xl space-y-2.5">
                  <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <Palette size={14} className="text-orange-600" />
                    ألوان الكارت بالكامل:
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        { key: 'bg_color', label: 'خلفية الكارت' },
                        { key: 'border_color', label: 'لون الإطار' },
                        { key: 'title_color', label: 'لون اسم الصنف' },
                        { key: 'price_bg_color', label: 'خلفية السعر' },
                        { key: 'price_border_color', label: 'إطار السعر' },
                        { key: 'price_text_color', label: 'نص السعر' },
                        { key: 'badge_bg_color', label: 'خلفية الشارة' },
                        { key: 'badge_text_color', label: 'نص الشارة' },
                      ] as const
                    ).map(({ key, label }) => (
                      <label
                        key={key}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
                      >
                        <span className="text-[11px] font-bold text-slate-700">{label}</span>
                        <input
                          type="color"
                          value={merged[key]}
                          onChange={(e) => updateGlobalField(key, e.target.value)}
                          className="w-6 h-6 rounded border border-slate-300 cursor-pointer shrink-0"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                {/* Store Logo Stamp on Every Card */}
                <div className="p-3.5 bg-white border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(merged.card_logo_enabled)}
                        onChange={(e) => updateGlobalField('card_logo_enabled', e.target.checked)}
                        className="rounded text-orange-600 focus:ring-orange-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-xs font-extrabold text-slate-800">
                        ختم شعار المتجر على كل كارت
                      </span>
                    </label>

                    {onOpenLogoStudio && (
                      <button
                        type="button"
                        onClick={onOpenLogoStudio}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 text-[11px] font-bold cursor-pointer whitespace-nowrap"
                      >
                        <Move size={12} />
                        <span>تحريك وموضع تفاعلي</span>
                      </button>
                    )}
                  </div>

                  {!logoUrl && (
                    <div className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      ارفع شعار المتجر أولاً من قسم &quot;شعار المتجر في الهيدر&quot; ليظهر على الكروت.
                    </div>
                  )}

                  {merged.card_logo_enabled && (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <span className="block text-[11px] font-bold text-slate-600 mb-1">
                            نطاق الظهور:
                          </span>
                          <div className="grid grid-cols-2 gap-1.5">
                            {[
                              { id: 'card' as const, label: 'على الكارت كله' },
                              { id: 'image' as const, label: 'داخل إطار الصورة' },
                            ].map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => updateGlobalField('card_logo_scope', s.id)}
                                className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                                  (merged.card_logo_scope ?? 'card') === s.id
                                    ? 'bg-orange-600 text-white border-orange-600'
                                    : 'bg-slate-50 text-slate-700 border-slate-200'
                                }`}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="block text-[11px] font-bold text-slate-600 mb-1">
                            الطبقة وشكل الختم:
                          </span>
                          <div className="grid grid-cols-4 gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateGlobalField(
                                  'card_logo_layer',
                                  cardLogoLayer === 'front' ? 'back' : 'front'
                                )
                              }
                              className="py-1.5 px-1 rounded-xl text-[10px] font-bold border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                            >
                              {cardLogoLayer === 'front' ? 'أمامي' : 'خلفي'}
                            </button>
                            {(
                              [
                                { id: 'rounded', label: 'ناعم' },
                                { id: 'circle', label: 'دائري' },
                                { id: 'clean', label: 'حر' },
                              ] as { id: CardLogoShape; label: string }[]
                            ).map((sh) => (
                              <button
                                key={sh.id}
                                type="button"
                                onClick={() => updateGlobalField('card_logo_shape', sh.id)}
                                className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                                  (merged.card_logo_shape ?? 'rounded') === sh.id
                                    ? 'bg-orange-600 text-white border-orange-600'
                                    : 'bg-slate-50 text-slate-700 border-slate-200'
                                }`}
                              >
                                {sh.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div>
                        <span className="block text-[11px] font-bold text-slate-600 mb-1">
                          الموضع على الكارت:
                        </span>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
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
                              onClick={() => updateGlobalField('card_logo_position', pos.id)}
                              className={`py-1.5 px-1 rounded-lg text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                                (merged.card_logo_position ?? 'top-left') === pos.id
                                  ? 'bg-orange-600 text-white border-orange-600'
                                  : 'bg-slate-50 text-slate-700 border-slate-200'
                              }`}
                            >
                              {pos.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                            <span>حجم الشعار</span>
                            <span className="font-mono tabular-nums text-orange-700">
                              {merged.card_logo_size ?? 26}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min={14}
                            max={90}
                            step={2}
                            value={merged.card_logo_size ?? 26}
                            onChange={(e) =>
                              updateGlobalField('card_logo_size', Number(e.target.value))
                            }
                            className="w-full accent-orange-600 cursor-pointer"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                            <span>البُعد عن الحافة</span>
                            <span className="font-mono tabular-nums text-orange-700">
                              {merged.card_logo_inset ?? 6}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={24}
                            step={1}
                            value={merged.card_logo_inset ?? 6}
                            onChange={(e) =>
                              updateGlobalField('card_logo_inset', Number(e.target.value))
                            }
                            className="w-full accent-orange-600 cursor-pointer"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                            <span>الشفافية</span>
                            <span className="font-mono tabular-nums text-orange-700">
                              {Math.round((merged.card_logo_opacity ?? 0.85) * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.08}
                            max={1}
                            step={0.04}
                            value={merged.card_logo_opacity ?? 0.85}
                            onChange={(e) =>
                              updateGlobalField('card_logo_opacity', Number(e.target.value))
                            }
                            className="w-full accent-orange-600 cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Field Visibility Toggles (when callback provided) */}
                {onChangeVisibility && (
                  <div className="p-3.5 bg-white border border-slate-200 rounded-2xl space-y-2">
                    <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                      <Maximize2 size={14} className="text-orange-600" />
                      العناصر المعروضة داخل الكارت:
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      {[
                        { key: 'show_image' as const, label: 'صورة المنتج' },
                        { key: 'show_code' as const, label: 'كود الصنف' },
                        { key: 'show_category' as const, label: 'اسم القسم' },
                        { key: 'show_brand_on_card' as const, label: 'اسم الماركة' },
                        { key: 'show_specification' as const, label: 'المواصفات' },
                        { key: 'show_available_models' as const, label: 'الموديلات' },
                      ]
                        .filter((item) => visibility?.[item.key] !== undefined)
                        .map(({ key, label }) => (
                          <label
                            key={key}
                            className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer font-bold text-slate-700 text-[11px]"
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(vis[key])}
                              onChange={(e) => onChangeVisibility({ [key]: e.target.checked })}
                              className="rounded text-orange-600 focus:ring-orange-500 w-4 h-4 cursor-pointer"
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Single Card Override Tab */
              <div className="space-y-4">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                  <label className="block text-xs font-extrabold text-slate-800">
                    اختر الكارت / الصنف المراد تعديل لونه أو بياناته:
                  </label>
                  <select
                    value={targetProduct?.id || ''}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  >
                    {eligibleProducts.map((p) => {
                      const hasOv = Boolean(merged.per_product_overrides?.[p.id]);
                      return (
                        <option key={p.id} value={p.id}>
                          {hasOv ? '🎨 ' : ''}
                          {p.name} ({p.selling_price || 0} ج.م)
                        </option>
                      );
                    })}
                  </select>
                </div>

                {targetProduct ? (
                  <>
                    {/* Custom Colors for Selected Card Only */}
                    <div className="p-3.5 bg-white border border-slate-200 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                          <Palette size={14} className="text-orange-600" />
                          ألوان خاصة بهذا الكارت فقط:
                        </h4>
                        <button
                          type="button"
                          onClick={resetSingleOverride}
                          className="text-[11px] font-bold text-slate-500 hover:text-red-600 flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw size={12} />
                          <span>استعادة اللون العام</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {(
                          [
                            { key: 'bg_color', label: 'خلفية الكارت', fallback: merged.bg_color },
                            {
                              key: 'border_color',
                              label: 'لون الإطار',
                              fallback: merged.border_color,
                            },
                            {
                              key: 'title_color',
                              label: 'لون الاسم',
                              fallback: merged.title_color,
                            },
                            {
                              key: 'price_bg_color',
                              label: 'خلفية السعر',
                              fallback: merged.price_bg_color,
                            },
                            {
                              key: 'price_text_color',
                              label: 'لون السعر',
                              fallback: merged.price_text_color,
                            },
                          ] as const
                        ).map(({ key, label, fallback }) => (
                          <label
                            key={key}
                            className="flex items-center justify-between gap-2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
                          >
                            <span className="text-[11px] font-bold text-slate-700">{label}</span>
                            <input
                              type="color"
                              value={singleOverride[key] || fallback}
                              onChange={(e) => updateSingleOverride({ [key]: e.target.value })}
                              className="w-7 h-6 rounded border border-slate-300 cursor-pointer shrink-0"
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Quick Edit Name & Selling Price of This Product */}
                    <div className="p-3.5 bg-white border border-slate-200 rounded-2xl space-y-3">
                      <h4 className="text-xs font-extrabold text-slate-800">
                        تعديل اسم وسعر هذا الصنف مباشرة:
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                        <div className="sm:col-span-7">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            اسم المنتج في الكتالوج:
                          </label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            سعر البيع (ج.م):
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={editPrice}
                            onChange={(e) => setEditPrice(Number(e.target.value) || 0)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-extrabold text-emerald-700 text-center font-mono focus:ring-2 focus:ring-orange-500 focus:outline-none"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <button
                            type="button"
                            onClick={handleSaveSingleProductData}
                            disabled={savingProduct}
                            className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            {savedToast ? <Check size={14} /> : <Save size={14} />}
                            <span>{savedToast ? 'تم' : 'حفظ'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl text-xs text-slate-500">
                    لا توجد منتجات متاحة حالياً لتخصيصها.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onChangeConfig({ ...DEFAULT_CARD_CONFIG, per_product_overrides: {} })}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>استعادة الشكل الافتراضي بالكامل</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-extrabold rounded-xl shadow-sm cursor-pointer"
          >
            تم والحفظ في المعاينة والـ PDF
          </button>
        </div>
      </div>
    </div>
  );
};
