import React, { useState, useEffect } from 'react';
import { Columns, LayoutGrid, Sparkles, SlidersHorizontal, Minus, Plus } from 'lucide-react';
import { GridSymmetryMode } from '../types';
import {
  clampGridColumns,
  clampGridRows,
  resolveEffectiveGridLayout,
} from '../utils/pdfGenerator';

export type GridLayoutMode = 'manual' | 'auto';
export type GridCols = number;
export type GridRows = number;

interface GridLayoutSelectorProps {
  columns: number;
  rows: number;
  mode?: GridLayoutMode;
  symmetry?: GridSymmetryMode;
  itemCount?: number;
  onChange: (columns: number, rows: number, mode?: GridLayoutMode, symmetry?: GridSymmetryMode) => void;
  onChangeSymmetry?: (symmetry: GridSymmetryMode) => void;
  compact?: boolean;
}

const ALL_PRESET_GRIDS: { cols: number; rows: number; label: string }[] = [
  { cols: 2, rows: 2, label: '2×2' },
  { cols: 2, rows: 3, label: '2×3' },
  { cols: 3, rows: 3, label: '3×3' },
  { cols: 3, rows: 4, label: '3×4' },
  { cols: 3, rows: 5, label: '3×5' },
  { cols: 4, rows: 3, label: '4×3' },
  { cols: 4, rows: 4, label: '4×4' },
  { cols: 4, rows: 5, label: '4×5' },
  { cols: 5, rows: 4, label: '5×4' },
  { cols: 5, rows: 5, label: '5×5' },
];

const EQUAL_PRESET_GRIDS: { cols: number; rows: number; label: string }[] = [
  { cols: 1, rows: 1, label: '1×1' },
  { cols: 2, rows: 2, label: '2×2' },
  { cols: 3, rows: 3, label: '3×3' },
  { cols: 4, rows: 4, label: '4×4' },
  { cols: 5, rows: 5, label: '5×5' },
  { cols: 6, rows: 6, label: '6×6' },
];

const DIFFERENT_PRESET_GRIDS: { cols: number; rows: number; label: string }[] = [
  { cols: 1, rows: 2, label: '1×2' },
  { cols: 2, rows: 3, label: '2×3' },
  { cols: 2, rows: 4, label: '2×4' },
  { cols: 3, rows: 2, label: '3×2' },
  { cols: 3, rows: 4, label: '3×4' },
  { cols: 3, rows: 5, label: '3×5' },
  { cols: 4, rows: 3, label: '4×3' },
  { cols: 4, rows: 5, label: '4×5' },
  { cols: 5, rows: 4, label: '5×4' },
];

export const GridLayoutSelector: React.FC<GridLayoutSelectorProps> = ({
  columns,
  rows,
  mode = 'manual',
  symmetry = 'any',
  itemCount = 12,
  onChange,
  onChangeSymmetry,
  compact = false,
}) => {
  const safeCols = clampGridColumns(columns);
  const safeRows = symmetry === 'equal' ? clampGridRows(safeCols, safeCols) : clampGridRows(rows, safeCols);

  const [colsDraft, setColsDraft] = useState<string>(String(safeCols));
  const [rowsDraft, setRowsDraft] = useState<string>(String(safeRows));
  const [screenWidth, setScreenWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  useEffect(() => {
    setColsDraft(String(safeCols));
  }, [safeCols]);

  useEffect(() => {
    setRowsDraft(String(safeRows));
  }, [safeRows]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const autoResolved = resolveEffectiveGridLayout({
    mode: 'auto',
    symmetry,
    columns: safeCols,
    rows: safeRows,
    itemCount: Math.max(1, itemCount),
    screenWidth,
  });

  const displayCols = mode === 'auto' ? autoResolved.cols : safeCols;
  const displayRows = mode === 'auto' ? autoResolved.rows : safeRows;
  const totalPerPage = displayCols * displayRows;

  const applyManualChange = (nextCols: number, nextRows: number, nextSym: GridSymmetryMode = symmetry) => {
    const c = clampGridColumns(nextCols);
    const r = nextSym === 'equal' ? clampGridRows(c, c) : clampGridRows(nextRows, c);
    onChange(c, r, 'manual', nextSym);
  };

  const handleSelectSymmetry = (nextSym: GridSymmetryMode) => {
    if (onChangeSymmetry) {
      onChangeSymmetry(nextSym);
    }
    if (mode === 'auto') {
      const nextAuto = resolveEffectiveGridLayout({
        mode: 'auto',
        symmetry: nextSym,
        columns: safeCols,
        rows: safeRows,
        itemCount: Math.max(1, itemCount),
        screenWidth,
      });
      onChange(nextAuto.cols, nextAuto.rows, 'auto', nextSym);
      return;
    }
    if (nextSym === 'equal') {
      onChange(safeCols, clampGridRows(safeCols, safeCols), 'manual', nextSym);
    } else if (nextSym === 'different' && safeCols === safeRows) {
      const altRows = safeCols >= 4 ? safeCols - 1 : safeCols + 1;
      onChange(safeCols, clampGridRows(altRows, safeCols), 'manual', nextSym);
    } else {
      onChange(safeCols, safeRows, 'manual', nextSym);
    }
  };

  const commitColsInput = (raw: string) => {
    const parsed = parseInt(raw, 10);
    const clamped = clampGridColumns(Number.isFinite(parsed) ? parsed : safeCols);
    setColsDraft(String(clamped));
    applyManualChange(clamped, safeRows);
  };

  const commitRowsInput = (raw: string) => {
    const parsed = parseInt(raw, 10);
    const clamped = clampGridRows(Number.isFinite(parsed) ? parsed : safeRows, safeCols);
    setRowsDraft(String(clamped));
    applyManualChange(safeCols, clamped);
  };

  const activePresets =
    symmetry === 'equal'
      ? EQUAL_PRESET_GRIDS
      : symmetry === 'different'
        ? DIFFERENT_PRESET_GRIDS
        : ALL_PRESET_GRIDS;

  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-3'}>
      {/* Header + Live Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <LayoutGrid size={14} className="text-sky-600" />
          <span>تخطيط الشبكة في الصفحة (أعمدة × صفوف):</span>
        </label>
        <span
          className={`px-2 py-0.5 rounded-lg border text-[11px] font-extrabold ${
            mode === 'auto'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-sky-50 border-sky-200 text-sky-800'
          }`}
        >
          {mode === 'auto' ? 'تلقائي ' : ''}
          <span dir="ltr">
            {displayCols}×{displayRows}
          </span>{' '}
          ({totalPerPage} منتج/صفحة)
        </span>
      </div>

      {/* Mode Switch: Auto (Responsive & Zero Gaps) vs Manual */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
        <button
          type="button"
          onClick={() => onChange(autoResolved.cols, autoResolved.rows, 'auto', symmetry)}
          className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
            mode === 'auto'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Sparkles size={14} />
          <span>تلقائي (ملائم للشاشة)</span>
        </button>

        <button
          type="button"
          onClick={() => applyManualChange(safeCols, safeRows)}
          className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
            mode === 'manual'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <SlidersHorizontal size={14} />
          <span>يدوي (اكتب الأعمدة والصفوف)</span>
        </button>
      </div>

      {/* Symmetry Toggle: Equal (Square) vs Different vs Any */}
      <div className="space-y-1">
        <span className="block text-[10px] font-bold text-slate-600">
          تناسق الصفوف والأعمدة في الصفحة:
        </span>
        <div className="grid grid-cols-3 gap-1">
          {[
            { id: 'equal' as const, label: 'متشابهة (صف = عمود)' },
            { id: 'different' as const, label: 'غير متشابهة' },
            { id: 'any' as const, label: 'مرن (الكل)' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleSelectSymmetry(opt.id)}
              className={`py-1.5 px-1.5 rounded-lg text-[10px] font-extrabold border transition-all cursor-pointer whitespace-nowrap ${
                symmetry === opt.id
                  ? 'border-orange-600 bg-orange-50 text-orange-800 ring-1 ring-orange-500'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'auto' ? (
        <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-1.5 text-xs">
          <div className="flex items-center justify-between font-bold text-emerald-950">
            <span className="flex items-center gap-1.5">
              <Sparkles size={14} className="text-emerald-600" />
              التوزيع التلقائي الذكي مفعّل
            </span>
            <span className="font-mono bg-white px-2 py-0.5 rounded-md border border-emerald-200 text-emerald-800" dir="ltr">
              {autoResolved.cols} × {autoResolved.rows}
            </span>
          </div>
          <p className="text-[11px] text-emerald-800 leading-relaxed">
            يختار عدد الأعمدة والصفوف الأنسب لمقاس الشاشة وعدد المنتجات ({itemCount} منتج)
            {symmetry === 'equal'
              ? ' مع الحفاظ على صفوف وأعمدة متساوية.'
              : symmetry === 'different'
                ? ' بنظام صفوف وأعمدة غير متشابهة.'
                : ' ويمدّ الكروت تلقائياً لملائمة الصفحة.'}
          </p>
        </div>
      ) : (
        <>
          {/* Direct Manual Numeric Typing Inputs for Columns & Rows */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-2xl">
            {/* Columns Input */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Columns size={12} className="text-sky-600" />
                  {symmetry === 'equal' ? 'الأعمدة والصفوف معاً:' : 'عدد الأعمدة (بالعرض):'}
                </span>
                <span className="text-[10px] text-slate-400 font-semibold">1 إلى 8</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => applyManualChange(safeCols - 1, safeRows)}
                  disabled={safeCols <= 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  title="تقليل الأعمدة"
                >
                  <Minus size={13} />
                </button>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={colsDraft}
                  onChange={(e) => {
                    const val = e.target.value;
                    setColsDraft(val);
                    const n = parseInt(val, 10);
                    if (Number.isFinite(n) && n >= 1 && n <= 8) {
                      applyManualChange(n, safeRows);
                    }
                  }}
                  onBlur={() => commitColsInput(colsDraft)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitColsInput(colsDraft);
                  }}
                  dir="ltr"
                  className="flex-1 min-w-0 h-8 text-center text-sm font-mono font-extrabold bg-white border border-sky-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sky-900"
                />
                <button
                  type="button"
                  onClick={() => applyManualChange(safeCols + 1, safeRows)}
                  disabled={safeCols >= 8}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  title="زيادة الأعمدة"
                >
                  <Plus size={13} />
                </button>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => applyManualChange(c, safeRows)}
                    className={`py-1 rounded-lg text-[11px] font-extrabold border transition-all cursor-pointer ${
                      safeCols === c
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Rows Input */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                <span>عدد الصفوف (بالطول):</span>
                <span className="text-[10px] text-slate-400 font-semibold">
                  {symmetry === 'equal' ? 'مساوٍ للأعمدة' : '1 إلى 10'}
                </span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => applyManualChange(safeCols, safeRows - 1)}
                  disabled={symmetry === 'equal' || safeRows <= 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  title="تقليل الصفوف"
                >
                  <Minus size={13} />
                </button>
                <input
                  type="number"
                  min={1}
                  max={10}
                  disabled={symmetry === 'equal'}
                  value={rowsDraft}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRowsDraft(val);
                    const n = parseInt(val, 10);
                    if (Number.isFinite(n) && n >= 1 && n <= 10) {
                      applyManualChange(safeCols, n);
                    }
                  }}
                  onBlur={() => commitRowsInput(rowsDraft)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRowsInput(rowsDraft);
                  }}
                  dir="ltr"
                  className="flex-1 min-w-0 h-8 text-center text-sm font-mono font-extrabold bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-indigo-900 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => applyManualChange(safeCols, safeRows + 1)}
                  disabled={symmetry === 'equal' || safeRows >= 10}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  title="زيادة الصفوف"
                >
                  <Plus size={13} />
                </button>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[2, 3, 4, 5, 6].map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={symmetry === 'equal'}
                    onClick={() => applyManualChange(safeCols, r)}
                    className={`py-1 rounded-lg text-[11px] font-extrabold border transition-all cursor-pointer disabled:opacity-45 ${
                      safeRows === r
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Popular Presets */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {activePresets.map((preset) => {
              const active = safeCols === preset.cols && safeRows === preset.rows;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyManualChange(preset.cols, preset.rows)}
                  className={`py-1.5 px-2 rounded-xl border text-xs font-extrabold transition-all cursor-pointer flex flex-col items-center leading-tight ${
                    active
                      ? 'border-sky-500 bg-sky-50 text-sky-800 shadow-2xs ring-1 ring-sky-500'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span dir="ltr">{preset.label}</span>
                  <span className="text-[9px] font-semibold opacity-70">
                    {preset.cols * preset.rows} كارت
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

