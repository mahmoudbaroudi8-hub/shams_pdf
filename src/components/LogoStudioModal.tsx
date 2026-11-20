import React, { useEffect, useRef, useState } from 'react';
import {
  CardLogoPosition,
  CardLogoShape,
  CatalogCardConfig,
  CatalogSettings,
  DEFAULT_CARD_CONFIG,
  HeaderLogoBg,
  HeaderLogoPosition,
  HeaderLogoShape,
  Product,
  WatermarkLayer,
  WatermarkPosition,
  WatermarkType,
} from '../types';
import { mergeCardConfig } from './CardStyleControls';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CreditCard,
  Eye,
  Image as ImageIcon,
  Layers,
  Move,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Wand2,
  X,
} from 'lucide-react';

export type LogoStudioTab = 'header' | 'card' | 'page';

interface LogoStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: CatalogSettings;
  onUpdateSettings: (next: CatalogSettings) => void | Promise<void>;
  sampleProduct?: Product | null;
  initialTab?: LogoStudioTab;
  onUploadLogoClick: () => void;
  onOpenImageStudio: () => void;
}

export const LogoStudioModal: React.FC<LogoStudioModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  sampleProduct,
  initialTab = 'header',
  onUploadLogoClick,
  onOpenImageStudio,
}) => {
  const [activeTab, setActiveTab] = useState<LogoStudioTab>(initialTab);
  const [previewScope, setPreviewScope] = useState<'page' | 'card'>(
    initialTab === 'card' ? 'card' : 'page'
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    target: 'header' | 'card' | 'watermark';
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    containerW: number;
    containerH: number;
  } | null>(null);
  const pageSurfaceRef = useRef<HTMLDivElement>(null);
  const cardSurfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setPreviewScope(initialTab === 'card' ? 'card' : 'page');
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const cardConfig: CatalogCardConfig = mergeCardConfig(settings.card_config);
  const primaryColor = settings.primary_color || '#ea580c';

  const hdrPos = (settings.header_logo_position ?? 'right') as HeaderLogoPosition;
  const hdrSize = settings.header_logo_size ?? 88;
  const hdrShape = (settings.header_logo_shape ?? 'rounded') as HeaderLogoShape;
  const hdrBg = (settings.header_logo_bg ??
    (hdrShape === 'clean' ? 'transparent' : 'white')) as HeaderLogoBg;
  const hdrBorder = settings.header_logo_border ?? hdrShape !== 'clean';
  const hdrPad = settings.header_logo_padding ?? (hdrShape === 'clean' ? 0 : 4);
  const hdrSpacing = settings.header_logo_spacing ?? 14;
  const hdrOffX = settings.header_logo_offset_x ?? 0;
  const hdrOffY = settings.header_logo_offset_y ?? 0;
  const hdrRot = settings.header_logo_rotation ?? 0;
  const hdrOpacity = settings.header_logo_opacity ?? 1;
  const hdrFit = settings.header_logo_fit ?? 'contain';

  const cardLogoEnabled = Boolean(cardConfig.card_logo_enabled);
  const cardLogoLayer = cardConfig.card_logo_layer ?? 'front';
  const cardLogoScope = cardConfig.card_logo_scope ?? 'card';
  const cardLogoPos = (cardConfig.card_logo_position ?? 'top-left') as CardLogoPosition;
  const cardLogoSize = cardConfig.card_logo_size ?? 26;
  const cardLogoOpacity = cardConfig.card_logo_opacity ?? 0.85;
  const cardLogoInset = cardConfig.card_logo_inset ?? 6;
  const cardLogoOffX = cardConfig.card_logo_offset_x ?? 0;
  const cardLogoOffY = cardConfig.card_logo_offset_y ?? 0;
  const cardLogoRot = cardConfig.card_logo_rotation ?? 0;
  const cardLogoShape = (cardConfig.card_logo_shape ?? 'rounded') as CardLogoShape;
  const cardLogoBg = cardConfig.card_logo_bg !== false && cardLogoShape !== 'clean';

  const wmType = settings.watermark_type ?? 'none';
  const wmLayer = (settings.watermark_layer ?? 'back') as WatermarkLayer;
  const wmPos = (settings.watermark_position ?? 'center') as WatermarkPosition;
  const wmOffX = settings.watermark_offset_x ?? 0;
  const wmOffY = settings.watermark_offset_y ?? 0;
  const wmOpacity = settings.watermark_opacity ?? 0.08;
  const wmSize = settings.watermark_size ?? 280;
  const wmRot = settings.watermark_rotation ?? (wmType === 'tiled' ? -20 : 0);
  const wmGap = settings.watermark_gap ?? 100;

  const patchSettings = (patch: Partial<CatalogSettings>) => {
    onUpdateSettings({ ...settings, ...patch });
  };

  const patchCardConfig = (patch: Partial<CatalogCardConfig>) => {
    onUpdateSettings({
      ...settings,
      card_config: {
        ...cardConfig,
        ...patch,
      },
    });
  };

  const handleSelectTab = (tab: LogoStudioTab) => {
    setActiveTab(tab);
    setPreviewScope(tab === 'card' ? 'card' : 'page');
  };

  // Pointer Drag Handlers for Direct Visual Moving
  const beginDrag = (
    target: 'header' | 'card' | 'watermark',
    e: React.PointerEvent<HTMLElement>
  ) => {
    if (!settings.logo_url) return;
    e.preventDefault();
    e.stopPropagation();
    const containerEl = target === 'card' ? cardSurfaceRef.current : pageSurfaceRef.current;
    const rect = containerEl?.getBoundingClientRect();
    const origX =
      target === 'header' ? hdrOffX : target === 'card' ? cardLogoOffX : wmOffX;
    const origY =
      target === 'header' ? hdrOffY : target === 'card' ? cardLogoOffY : wmOffY;

    dragRef.current = {
      target,
      startX: e.clientX,
      startY: e.clientY,
      origX,
      origY,
      containerW: rect?.width || 360,
      containerH: rect?.height || 480,
    };
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragRef.current;
    if (!st) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;

    if (st.target === 'header') {
      // Page preview width is roughly 360..420 vs PDF 1240 -> ~2.6x sensitivity -> damped clean px
      const nextX = Math.max(-60, Math.min(60, Math.round(st.origX + dx * 1.4)));
      const nextY = Math.max(-40, Math.min(40, Math.round(st.origY + dy * 1.4)));
      patchSettings({ header_logo_offset_x: nextX, header_logo_offset_y: nextY });
    } else if (st.target === 'card') {
      const nextX = Math.max(-30, Math.min(30, Math.round(st.origX + dx * 0.75)));
      const nextY = Math.max(-30, Math.min(30, Math.round(st.origY + dy * 0.75)));
      patchCardConfig({ card_logo_offset_x: nextX, card_logo_offset_y: nextY });
    } else if (st.target === 'watermark') {
      const pctDx = Math.round((dx / st.containerW) * 100);
      const pctDy = Math.round((dy / st.containerH) * 100);
      const nextX = Math.max(-45, Math.min(45, st.origX + pctDx));
      const nextY = Math.max(-45, Math.min(45, st.origY + pctDy));
      patchSettings({ watermark_offset_x: nextX, watermark_offset_y: nextY });
    }
  };

  const endDrag = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  const nudgeActiveLogo = (dx: number, dy: number) => {
    if (activeTab === 'header') {
      patchSettings({
        header_logo_offset_x: Math.max(-60, Math.min(60, hdrOffX + dx * 4)),
        header_logo_offset_y: Math.max(-40, Math.min(40, hdrOffY + dy * 4)),
      });
    } else if (activeTab === 'card') {
      patchCardConfig({
        card_logo_offset_x: Math.max(-30, Math.min(30, cardLogoOffX + dx * 2)),
        card_logo_offset_y: Math.max(-30, Math.min(30, cardLogoOffY + dy * 2)),
      });
    } else {
      patchSettings({
        watermark_offset_x: Math.max(-45, Math.min(45, wmOffX + dx * 2)),
        watermark_offset_y: Math.max(-45, Math.min(45, wmOffY + dy * 2)),
      });
    }
  };

  const resetActiveOffset = () => {
    if (activeTab === 'header') {
      patchSettings({ header_logo_offset_x: 0, header_logo_offset_y: 0, header_logo_rotation: 0 });
    } else if (activeTab === 'card') {
      patchCardConfig({ card_logo_offset_x: 0, card_logo_offset_y: 0, card_logo_rotation: 0 });
    } else {
      patchSettings({ watermark_offset_x: 0, watermark_offset_y: 0 });
    }
  };

  const applyCoordinatedPreset = (
    presetId: 'balanced_pro' | 'protected_tiled' | 'card_stamp' | 'clean_header'
  ) => {
    if (presetId === 'balanced_pro') {
      onUpdateSettings({
        ...settings,
        header_logo_position: 'right',
        header_logo_size: 92,
        header_logo_shape: 'rounded',
        header_logo_bg: 'white',
        header_logo_border: true,
        header_logo_padding: 4,
        header_logo_spacing: 16,
        header_logo_offset_x: 0,
        header_logo_offset_y: 0,
        header_logo_rotation: 0,
        header_logo_opacity: 1,
        watermark_type: 'center',
        watermark_layer: 'back',
        watermark_position: 'center',
        watermark_offset_x: 0,
        watermark_offset_y: 0,
        watermark_opacity: 0.08,
        watermark_size: 300,
        watermark_rotation: 0,
        card_config: {
          ...cardConfig,
          card_logo_enabled: true,
          card_logo_layer: 'front',
          card_logo_scope: 'card',
          card_logo_position: 'top-left',
          card_logo_size: 24,
          card_logo_opacity: 0.85,
          card_logo_inset: 6,
          card_logo_offset_x: 0,
          card_logo_offset_y: 0,
          card_logo_rotation: 0,
          card_logo_shape: 'rounded',
          card_logo_bg: true,
        },
      });
    } else if (presetId === 'protected_tiled') {
      onUpdateSettings({
        ...settings,
        header_logo_position: 'right',
        header_logo_size: 84,
        header_logo_shape: 'clean',
        header_logo_bg: 'transparent',
        header_logo_border: false,
        header_logo_padding: 0,
        header_logo_spacing: 14,
        header_logo_offset_x: 0,
        header_logo_offset_y: 0,
        header_logo_rotation: 0,
        header_logo_opacity: 1,
        watermark_type: 'tiled',
        watermark_layer: 'front',
        watermark_opacity: 0.09,
        watermark_size: 200,
        watermark_rotation: -20,
        watermark_gap: 115,
        card_config: {
          ...cardConfig,
          card_logo_enabled: true,
          card_logo_layer: 'back',
          card_logo_scope: 'card',
          card_logo_position: 'center',
          card_logo_size: 56,
          card_logo_opacity: 0.14,
          card_logo_inset: 0,
          card_logo_offset_x: 0,
          card_logo_offset_y: 0,
          card_logo_rotation: -15,
          card_logo_shape: 'clean',
          card_logo_bg: false,
        },
      });
    } else if (presetId === 'card_stamp') {
      onUpdateSettings({
        ...settings,
        header_logo_position: 'right',
        header_logo_size: 96,
        header_logo_shape: 'circle',
        header_logo_bg: 'primary_tint',
        header_logo_border: true,
        header_logo_padding: 5,
        header_logo_spacing: 16,
        header_logo_offset_x: 0,
        header_logo_offset_y: 0,
        header_logo_rotation: 0,
        header_logo_opacity: 1,
        watermark_type: 'none',
        card_config: {
          ...cardConfig,
          card_logo_enabled: true,
          card_logo_layer: 'front',
          card_logo_scope: 'image',
          card_logo_position: 'top-left',
          card_logo_size: 28,
          card_logo_opacity: 0.95,
          card_logo_inset: 5,
          card_logo_offset_x: 0,
          card_logo_offset_y: 0,
          card_logo_rotation: 0,
          card_logo_shape: 'circle',
          card_logo_bg: true,
        },
      });
    } else {
      onUpdateSettings({
        ...settings,
        header_logo_position: 'right',
        header_logo_size: 88,
        header_logo_shape: 'clean',
        header_logo_bg: 'transparent',
        header_logo_border: false,
        header_logo_padding: 0,
        header_logo_spacing: 14,
        header_logo_offset_x: 0,
        header_logo_offset_y: 0,
        header_logo_rotation: 0,
        header_logo_opacity: 1,
        watermark_type: 'none',
        card_config: {
          ...cardConfig,
          card_logo_enabled: false,
        },
      });
    }
  };

  // Watermark coordinates for miniature page preview
  const resolveAnchorPct = (pos: WatermarkPosition, ox: number, oy: number) => {
    let bx = 50;
    let by = 50;
    if (pos === 'top-right') {
      bx = 84;
      by = 16;
    } else if (pos === 'top-left') {
      bx = 16;
      by = 16;
    } else if (pos === 'top-center') {
      bx = 50;
      by = 14;
    } else if (pos === 'bottom-right') {
      bx = 84;
      by = 84;
    } else if (pos === 'bottom-left') {
      bx = 16;
      by = 84;
    } else if (pos === 'bottom-center') {
      bx = 50;
      by = 86;
    }
    return {
      x: Math.max(4, Math.min(96, bx + ox)),
      y: Math.max(4, Math.min(96, by + oy)),
    };
  };

  const wmAnchor = resolveAnchorPct(wmPos, wmOffX, wmOffY);

  // Helper for rendering a miniature/enlarged Card Logo overlay box in React
  const renderReactCardLogoNode = (scaleMultiplier: number, draggable: boolean) => {
    if (!cardLogoEnabled || !settings.logo_url) return null;
    const sz = Math.round(cardLogoSize * scaleMultiplier);
    const ins = Math.round(cardLogoInset * scaleMultiplier);
    const ox = Math.round(cardLogoOffX * scaleMultiplier);
    const oy = Math.round(cardLogoOffY * scaleMultiplier);
    const pad = cardLogoBg ? Math.max(1, Math.round(sz * 0.1)) : 0;
    const rad =
      cardLogoShape === 'circle' || cardLogoShape === 'pill'
        ? '9999px'
        : cardLogoShape === 'rounded'
          ? `${Math.max(3, Math.round(sz * 0.22))}px`
          : '0px';

    const style: React.CSSProperties = {
      position: 'absolute',
      width: `${sz}px`,
      height: `${sz}px`,
      borderRadius: rad,
      padding: `${pad}px`,
      opacity: cardLogoOpacity,
      zIndex: cardLogoLayer === 'back' ? 1 : 5,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: cardLogoBg ? 'rgba(255,255,255,0.92)' : 'transparent',
      border: cardLogoBg ? '1px solid #e2e8f0' : 'none',
      boxShadow: cardLogoBg ? '0 2px 6px rgba(15,23,42,0.12)' : 'none',
      cursor: draggable ? (isDragging ? 'grabbing' : 'grab') : 'default',
      touchAction: 'none',
    };

    let baseTransform = '';
    if (cardLogoPos === 'top-right') {
      style.top = `${ins + oy}px`;
      style.right = `${ins - ox}px`;
    } else if (cardLogoPos === 'top-center') {
      style.top = `${ins + oy}px`;
      style.left = '50%';
      baseTransform = `translateX(calc(-50% + ${ox}px))`;
    } else if (cardLogoPos === 'top-left') {
      style.top = `${ins + oy}px`;
      style.left = `${ins + ox}px`;
    } else if (cardLogoPos === 'center') {
      style.top = '50%';
      style.left = '50%';
      baseTransform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
    } else if (cardLogoPos === 'bottom-right') {
      style.bottom = `${ins - oy}px`;
      style.right = `${ins - ox}px`;
    } else {
      style.bottom = `${ins - oy}px`;
      style.left = `${ins + ox}px`;
    }
    const rotStr = cardLogoRot !== 0 ? ` rotate(${cardLogoRot}deg)` : '';
    if (baseTransform || rotStr) {
      style.transform = `${baseTransform}${rotStr}`.trim();
    }

    return (
      <div
        style={style}
        onPointerDown={draggable ? (e) => beginDrag('card', e) : undefined}
        title={draggable ? 'اسحب الشعار لتحريكه داخل الكارت' : undefined}
        className={draggable ? 'ring-1 ring-orange-500/70 hover:ring-2 hover:ring-orange-500' : ''}
      >
        <img
          src={settings.logo_url}
          alt="شعار المتجر"
          className="w-full h-full object-contain pointer-events-none select-none"
        />
      </div>
    );
  };

  // Helper for Miniature Header Logo in Page Preview
  const renderMiniHeaderLogo = (interactive: boolean) => {
    if (!settings.logo_url || hdrPos === 'hidden') return null;
    const scale = 0.36;
    const sz = Math.max(18, Math.round(hdrSize * scale));
    const pad = Math.round(hdrPad * scale);
    const ox = Math.round(hdrOffX * scale);
    const oy = Math.round(hdrOffY * scale);
    const rad =
      hdrShape === 'circle' ? '9999px' : hdrShape === 'rounded' ? '6px' : '0px';
    const bgCol =
      hdrBg === 'transparent'
        ? 'transparent'
        : hdrBg === 'primary_tint'
          ? `${primaryColor}18`
          : '#ffffff';

    return (
      <div
        onPointerDown={interactive ? (e) => beginDrag('header', e) : undefined}
        title={interactive ? 'اسحب الشعار لتعديل موقعه وإزاحته في الهيدر' : undefined}
        style={{
          width: `${sz}px`,
          height: `${sz}px`,
          borderRadius: rad,
          padding: `${pad}px`,
          backgroundColor: bgCol,
          border: hdrBorder
            ? `1px solid ${hdrBg === 'primary_tint' ? `${primaryColor}66` : '#cbd5e1'}`
            : 'none',
          opacity: hdrOpacity,
          transform: `translate(${ox}px, ${oy}px) rotate(${hdrRot}deg)`,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          cursor: interactive ? (isDragging ? 'grabbing' : 'grab') : 'default',
          touchAction: 'none',
        }}
        className={
          interactive ? 'ring-2 ring-orange-500/80 ring-offset-1 shadow-xs' : ''
        }
      >
        <img
          src={settings.logo_url}
          alt="شعار الهيدر"
          style={{ objectFit: hdrFit }}
          className="w-full h-full pointer-events-none select-none"
        />
      </div>
    );
  };

  const sampleName = sampleProduct?.name || 'شاحن سريع PD أصلي 30 واط';
  const samplePrice = sampleProduct?.selling_price || 280;
  const sampleCode = sampleProduct?.code || 'CH-30W';
  const sampleCat = sampleProduct?.category || 'شواحن';
  const sampleImage = sampleProduct?.image_url;

  const isEnlargedImageScoped =
    cardLogoScope === 'image' && cardConfig.layout !== 'overlay';

  return (
    <div
      className="fixed inset-0 z-[76] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in duration-150"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Top Studio Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 bg-slate-50/90 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
              <Move size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-slate-900 text-sm sm:text-base truncate">
                محرر ومنسّق شعار المتجر (الهيدر، الصفحة، والكروت)
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                تحكم كامل بالسحب المباشر، البُعد، الحجم، الشكل، التدوير، وظهور الشعار على الكروت
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onUploadLogoClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer whitespace-nowrap"
            >
              <Upload size={13} />
              <span>{settings.logo_url ? 'تغيير الشعار' : 'رفع شعار'}</span>
            </button>

            {settings.logo_url && (
              <button
                type="button"
                onClick={onOpenImageStudio}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-300 cursor-pointer whitespace-nowrap"
              >
                <Wand2 size={13} />
                <span>تعديل الصورة (قص/تنظيف/نص)</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-xl cursor-pointer"
              aria-label="إغلاق"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5"
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {/* Left Column: Live Interactive Canvas & D-Pad */}
          <div className="lg:col-span-5 bg-slate-100/90 border border-slate-200 rounded-2xl p-3.5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold text-slate-700 flex items-center gap-1.5">
                <Eye size={14} className="text-orange-600" />
                معاينة تفاعلية (اسحب بالماوس)
              </span>

              <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setPreviewScope('page')}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold cursor-pointer whitespace-nowrap ${
                    previewScope === 'page'
                      ? 'bg-orange-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  الصفحة كاملة
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewScope('card')}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold cursor-pointer whitespace-nowrap ${
                    previewScope === 'card'
                      ? 'bg-orange-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  كارت مُكبر
                </button>
              </div>
            </div>

            {!settings.logo_url ? (
              <div className="flex-1 min-h-[300px] bg-white border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center p-6 text-center gap-3">
                <ImageIcon size={36} className="text-slate-300" />
                <div className="text-xs font-bold text-slate-600">
                  ارفع شعار متجرك أولاً لتجربة التحريك والتنسيق المباشر على الصفحة والكروت
                </div>
                <button
                  type="button"
                  onClick={onUploadLogoClick}
                  className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-extrabold cursor-pointer"
                >
                  رفع شعار المتجر الآن
                </button>
              </div>
            ) : previewScope === 'page' ? (
              /* Miniature Interactive A4 Page */
              <div className="flex-1 flex items-center justify-center py-1">
                <div
                  ref={pageSurfaceRef}
                  className="a4-preview-page relative w-full max-w-[330px] aspect-[1/1.414] bg-white rounded-lg border border-slate-300 shadow-md p-4 flex flex-col justify-between overflow-hidden select-none"
                >
                  {/* Simulated Page Watermark Layer */}
                  {wmType === 'center' && (
                    <div
                      onPointerDown={
                        activeTab === 'page' ? (e) => beginDrag('watermark', e) : undefined
                      }
                      title={activeTab === 'page' ? 'اسحب لتحريك الشعار في الصفحة' : undefined}
                      style={{
                        position: 'absolute',
                        left: `${wmAnchor.x}%`,
                        top: `${wmAnchor.y}%`,
                        width: `${Math.round(wmSize * 0.32)}px`,
                        height: `${Math.round(wmSize * 0.32)}px`,
                        opacity: wmOpacity,
                        transform: `translate(-50%, -50%) rotate(${wmRot}deg)`,
                        zIndex: wmLayer === 'front' ? 20 : 1,
                        pointerEvents: activeTab === 'page' ? 'auto' : 'none',
                        cursor:
                          activeTab === 'page'
                            ? isDragging
                              ? 'grabbing'
                              : 'grab'
                            : 'default',
                        touchAction: 'none',
                      }}
                      className={
                        activeTab === 'page'
                          ? 'ring-2 ring-orange-500/75 rounded-lg p-0.5'
                          : ''
                      }
                    >
                      <img
                        src={settings.logo_url}
                        alt=""
                        className="w-full h-full object-contain pointer-events-none"
                      />
                    </div>
                  )}

                  {wmType === 'tiled' && (
                    <div
                      onPointerDown={
                        activeTab === 'page' ? (e) => beginDrag('watermark', e) : undefined
                      }
                      style={{
                        position: 'absolute',
                        inset: '-30%',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        placeItems: 'center',
                        gap: `${Math.max(8, Math.round(wmSize * 0.14 * (wmGap / 100)))}px`,
                        opacity: wmOpacity,
                        transform: `translate(${Math.round((wmOffX / 100) * 60)}px, ${Math.round((wmOffY / 100) * 60)}px) rotate(${wmRot === 0 ? -20 : wmRot}deg)`,
                        zIndex: wmLayer === 'front' ? 20 : 1,
                        pointerEvents: activeTab === 'page' ? 'auto' : 'none',
                        cursor: activeTab === 'page' ? 'grab' : 'default',
                      }}
                    >
                      {Array.from({ length: 16 }).map((_, i) => (
                        <img
                          key={i}
                          src={settings.logo_url}
                          alt=""
                          style={{
                            width: `${Math.max(16, Math.round(wmSize * 0.14))}px`,
                            height: `${Math.max(16, Math.round(wmSize * 0.14))}px`,
                          }}
                          className="object-contain pointer-events-none"
                        />
                      ))}
                    </div>
                  )}

                  {/* Simulated Header */}
                  <div
                    className="relative z-10 pb-2 mb-2 flex items-center justify-between gap-2"
                    style={{ borderBottom: `2px solid ${primaryColor}` }}
                  >
                    <div
                      className="flex items-center min-w-0"
                      style={{ gap: `${Math.round(hdrSpacing * 0.45)}px` }}
                    >
                      {hdrPos === 'right' && renderMiniHeaderLogo(activeTab === 'header')}
                      <div className="min-w-0">
                        <div className="text-[10px] font-extrabold text-slate-900 truncate">
                          {settings.company_name || 'اسم المتجر'}
                        </div>
                        <div
                          className="text-[8px] font-bold truncate"
                          style={{ color: primaryColor }}
                        >
                          {settings.catalog_title || 'قائمة الأسعار'}
                        </div>
                      </div>
                    </div>

                    {hdrPos === 'center' && renderMiniHeaderLogo(activeTab === 'header')}

                    <div
                      className="flex items-center shrink-0"
                      style={{ gap: `${Math.round(hdrSpacing * 0.45)}px` }}
                    >
                      <div className="text-[7px] text-slate-500 text-left leading-tight">
                        <div>{settings.phone || '0100000000'}</div>
                        <div>واتساب</div>
                      </div>
                      {hdrPos === 'left' && renderMiniHeaderLogo(activeTab === 'header')}
                    </div>
                  </div>

                  {/* Simulated Mini Product Cards Grid */}
                  <div className="relative z-10 grid grid-cols-2 gap-2 flex-1 content-start py-1">
                    {[1, 2, 3, 4].map((n) => (
                      <div
                        key={n}
                        className="relative rounded-lg border border-slate-200 bg-white/95 p-1.5 flex flex-col justify-between overflow-hidden min-h-[84px]"
                      >
                        {!isEnlargedImageScoped &&
                          cardLogoLayer === 'back' &&
                          renderReactCardLogoNode(0.45, false)}
                        <div className="relative z-[2] h-10 bg-slate-50 rounded border border-slate-100 flex items-center justify-center overflow-hidden mb-1">
                          {isEnlargedImageScoped &&
                            cardLogoLayer === 'back' &&
                            renderReactCardLogoNode(0.42, false)}
                          {sampleImage ? (
                            <img
                              src={sampleImage}
                              alt=""
                              className="max-h-full max-w-full object-contain relative z-[1]"
                            />
                          ) : (
                            <span className="text-[7px] text-slate-300 relative z-[1]">منتج {n}</span>
                          )}
                          {isEnlargedImageScoped &&
                            cardLogoLayer === 'front' &&
                            renderReactCardLogoNode(0.42, false)}
                        </div>
                        <div className="relative z-[2]">
                          <div className="text-[7.5px] font-bold text-slate-800 truncate">
                            {n === 1 ? sampleName : `منتج إكسسوار ${n}`}
                          </div>
                          <div
                            className="mt-0.5 px-1 py-0.5 rounded text-[7.5px] font-black text-center"
                            style={{
                              backgroundColor: cardConfig.price_bg_color,
                              color: cardConfig.price_text_color,
                            }}
                          >
                            {samplePrice + n * 25} ج.م
                          </div>
                        </div>
                        {!isEnlargedImageScoped &&
                          cardLogoLayer === 'front' &&
                          renderReactCardLogoNode(0.45, false)}
                      </div>
                    ))}
                  </div>

                  {/* Simulated Footer */}
                  <div className="relative z-10 pt-1.5 border-t border-slate-200 flex justify-between text-[7px] text-slate-500">
                    <span className="truncate max-w-[170px]">{settings.footer_note}</span>
                    <span className="font-bold text-slate-800">صفحة 1 من 4</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Enlarged Interactive Product Card Preview for Card Logo Dragging */
              <div className="flex-1 flex flex-col items-center justify-center py-2">
                <div
                  ref={cardSurfaceRef}
                  className="a4-preview-page relative w-full max-w-[270px] min-h-[290px] rounded-xl flex flex-col justify-between overflow-hidden select-none shadow-md"
                  style={{
                    backgroundColor: cardConfig.bg_color,
                    border: `${cardConfig.shape === 'minimal' ? 0 : cardConfig.border_width}px solid ${cardConfig.border_color}`,
                    borderRadius: `${cardConfig.border_radius}px`,
                    padding: '12px',
                  }}
                >
                  {!isEnlargedImageScoped &&
                    cardLogoLayer === 'back' &&
                    renderReactCardLogoNode(1.15, true)}

                  <div className="relative z-[2] h-36 w-full rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden mb-2.5">
                    {isEnlargedImageScoped &&
                      cardLogoLayer === 'back' &&
                      renderReactCardLogoNode(1.15, true)}
                    {sampleImage ? (
                      <img
                        src={sampleImage}
                        alt={sampleName}
                        className="max-h-full max-w-full object-contain relative z-[1] pointer-events-none"
                      />
                    ) : (
                      <span className="text-xs text-slate-400 relative z-[1]">صورة المنتج</span>
                    )}
                    {isEnlargedImageScoped &&
                      cardLogoLayer === 'front' &&
                      renderReactCardLogoNode(1.15, true)}
                  </div>

                  <div className="relative z-[2] space-y-2">
                    <h4
                      className="text-sm font-extrabold leading-snug line-clamp-2"
                      style={{ color: cardConfig.title_color, textAlign: cardConfig.text_align }}
                    >
                      {sampleName}
                    </h4>

                    <div
                      className="flex items-baseline justify-between px-3 py-1.5 rounded-lg"
                      style={{
                        backgroundColor: cardConfig.price_bg_color,
                        color: cardConfig.price_text_color,
                        border: `1px solid ${cardConfig.price_border_color}`,
                      }}
                    >
                      <span className="text-[11px] font-bold">سعر البيع:</span>
                      <span className="text-sm font-black tabular-nums">{samplePrice} ج.م</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-bold">
                      <span
                        className="px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: cardConfig.badge_bg_color,
                          color: cardConfig.badge_text_color,
                        }}
                      >
                        {sampleCode}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded border"
                        style={{
                          backgroundColor: cardConfig.badge_bg_color,
                          color: cardConfig.badge_text_color,
                          borderColor: cardConfig.border_color,
                        }}
                      >
                        {sampleCat}
                      </span>
                    </div>
                  </div>

                  {!isEnlargedImageScoped &&
                    cardLogoLayer === 'front' &&
                    renderReactCardLogoNode(1.15, true)}
                </div>
              </div>
            )}

            {/* Quick D-Pad Nudge Bar */}
            {settings.logo_url && (
              <div className="bg-white border border-slate-200 rounded-xl p-2 flex items-center justify-between gap-2 text-[10px]">
                <span className="font-bold text-slate-700">
                  تحريك دقيق (
                  {activeTab === 'header'
                    ? 'شعار الهيدر'
                    : activeTab === 'card'
                      ? 'شعار الكارت'
                      : 'طبقة الصفحة'}
                  ):
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => nudgeActiveLogo(1, 0)}
                    className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-orange-50 text-slate-700 cursor-pointer"
                    title="تحريك لليمين"
                  >
                    <ArrowRight size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => nudgeActiveLogo(0, -1)}
                    className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-orange-50 text-slate-700 cursor-pointer"
                    title="تحريك للأعلى"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => nudgeActiveLogo(0, 1)}
                    className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-orange-50 text-slate-700 cursor-pointer"
                    title="تحريك للأسفل"
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => nudgeActiveLogo(-1, 0)}
                    className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-orange-50 text-slate-700 cursor-pointer"
                    title="تحريك لليسار"
                  >
                    <ArrowLeft size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={resetActiveOffset}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold cursor-pointer"
                    title="إعادة الإزاحة للمنتصف (0)"
                  >
                    <RotateCcw size={11} />
                    <span>تصفير</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Tabs & Rich Controls */}
          <div className="lg:col-span-7 flex flex-col gap-3.5">
            {/* Section Tabs */}
            <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => handleSelectTab('header')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'header'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                <ImageIcon size={14} />
                <span>شعار الهيدر</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTab('card')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'card'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                <CreditCard size={14} />
                <span>الشعار على الكروت</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTab('page')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'page'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                <Layers size={14} />
                <span>طبقة الصفحة والتنسيق</span>
              </button>
            </div>

            {/* TAB 1: HEADER LOGO */}
            {activeTab === 'header' && (
              <div className="space-y-3.5 bg-slate-50/70 border border-slate-200 rounded-2xl p-3.5">
                <div>
                  <span className="block text-[11px] font-bold text-slate-700 mb-1.5">
                    موضع شعار المتجر في الهيدر:
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'right', label: 'يمين' },
                        { id: 'center', label: 'المنتصف' },
                        { id: 'left', label: 'يسار' },
                        { id: 'hidden', label: 'إخفاء' },
                      ] as { id: HeaderLogoPosition; label: string }[]
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => patchSettings({ header_logo_position: p.id })}
                        className={`py-2 px-2 rounded-xl text-xs font-bold border cursor-pointer whitespace-nowrap ${
                          hdrPos === p.id
                            ? 'bg-orange-600 text-white border-orange-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sliders: Size, Spacing (Distance), Offsets X/Y */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                      <span>حجم الشعار:</span>
                      <span className="font-mono tabular-nums text-orange-700">{hdrSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={36}
                      max={180}
                      step={4}
                      value={hdrSize}
                      onChange={(e) =>
                        patchSettings({ header_logo_size: parseInt(e.target.value, 10) })
                      }
                      className="w-full accent-orange-600 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                      <span>البُعد / المسافة عن النص:</span>
                      <span className="font-mono tabular-nums text-orange-700">
                        {hdrSpacing}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={48}
                      step={2}
                      value={hdrSpacing}
                      onChange={(e) =>
                        patchSettings({ header_logo_spacing: parseInt(e.target.value, 10) })
                      }
                      className="w-full accent-orange-600 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                      <span>تحريك أفقي (يمين / يسار):</span>
                      <span dir="ltr" className="font-mono tabular-nums text-orange-700">
                        {hdrOffX}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-60}
                      max={60}
                      step={2}
                      value={hdrOffX}
                      onChange={(e) =>
                        patchSettings({ header_logo_offset_x: parseInt(e.target.value, 10) })
                      }
                      className="w-full accent-orange-600 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                      <span>تحريك رأسي (أعلى / أسفل):</span>
                      <span dir="ltr" className="font-mono tabular-nums text-orange-700">
                        {hdrOffY}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-40}
                      max={40}
                      step={2}
                      value={hdrOffY}
                      onChange={(e) =>
                        patchSettings({ header_logo_offset_y: parseInt(e.target.value, 10) })
                      }
                      className="w-full accent-orange-600 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Shape, Background, Fit, Border */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <span className="block text-[11px] font-bold text-slate-700 mb-1">
                      شكل الإطار:
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: 'rounded', label: 'ناعم' },
                          { id: 'circle', label: 'دائري' },
                          { id: 'clean', label: 'حر شفاف' },
                        ] as { id: HeaderLogoShape; label: string }[]
                      ).map((sh) => (
                        <button
                          key={sh.id}
                          type="button"
                          onClick={() =>
                            patchSettings({
                              header_logo_shape: sh.id,
                              header_logo_border: sh.id !== 'clean',
                              header_logo_bg: sh.id === 'clean' ? 'transparent' : 'white',
                            })
                          }
                          className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold border cursor-pointer whitespace-nowrap ${
                            hdrShape === sh.id
                              ? 'bg-orange-600 text-white border-orange-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          {sh.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="block text-[11px] font-bold text-slate-700 mb-1">
                      خلفية الشعار والملاءمة:
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: 'white', label: 'أبيض' },
                          { id: 'primary_tint', label: 'لون الهوية' },
                          { id: 'transparent', label: 'شفاف' },
                        ] as { id: HeaderLogoBg; label: string }[]
                      ).map((bg) => (
                        <button
                          key={bg.id}
                          type="button"
                          onClick={() => patchSettings({ header_logo_bg: bg.id })}
                          className={`py-1.5 px-1 rounded-lg text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                            hdrBg === bg.id
                              ? 'bg-orange-600 text-white border-orange-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          {bg.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Padding, Fit, Opacity, Rotation, Border toggle */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-200 items-end">
                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-700 mb-1">
                      <span>حشو داخلي</span>
                      <span className="font-mono tabular-nums text-orange-700">{hdrPad}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={16}
                      step={1}
                      value={hdrPad}
                      onChange={(e) =>
                        patchSettings({ header_logo_padding: parseInt(e.target.value, 10) })
                      }
                      className="w-full accent-orange-600 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-700 mb-1">
                      <span>الوضوح</span>
                      <span className="font-mono tabular-nums text-orange-700">
                        {Math.round(hdrOpacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={1}
                      step={0.05}
                      value={hdrOpacity}
                      onChange={(e) =>
                        patchSettings({ header_logo_opacity: parseFloat(e.target.value) })
                      }
                      className="w-full accent-orange-600 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-700 mb-1">
                      <span>تدوير</span>
                      <span dir="ltr" className="font-mono tabular-nums text-orange-700">
                        {hdrRot}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-45}
                      max={45}
                      step={3}
                      value={hdrRot}
                      onChange={(e) =>
                        patchSettings({ header_logo_rotation: parseInt(e.target.value, 10) })
                      }
                      className="w-full accent-orange-600 cursor-pointer"
                    />
                  </div>

                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        patchSettings({ header_logo_fit: hdrFit === 'cover' ? 'contain' : 'cover' })
                      }
                      className={`flex-1 py-1.5 px-1.5 rounded-lg text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                        hdrFit === 'cover'
                          ? 'bg-orange-600 text-white border-orange-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {hdrFit === 'cover' ? 'ملء الإطار' : 'احتواء'}
                    </button>
                    <button
                      type="button"
                      onClick={() => patchSettings({ header_logo_border: !hdrBorder })}
                      className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                        hdrBorder
                          ? 'bg-orange-100 text-orange-800 border-orange-300'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      إطار
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: STORE LOGO ON PRODUCT CARDS */}
            {activeTab === 'card' && (
              <div className="space-y-3.5 bg-slate-50/70 border border-slate-200 rounded-2xl p-3.5">
                <div className="flex items-center justify-between gap-2 bg-white p-3 rounded-xl border border-slate-200">
                  <div>
                    <div className="text-xs font-extrabold text-slate-800">
                      إظهار شعار المتجر على كل كارت منتج
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      يظهر في المعاينة والـ PDF حسب الموضع والطبقة والبُعد المختار
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => patchCardConfig({ card_logo_enabled: !cardLogoEnabled })}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer transition-colors whitespace-nowrap ${
                      cardLogoEnabled
                        ? 'bg-orange-600 text-white border-orange-600'
                        : 'bg-slate-100 text-slate-700 border-slate-300'
                    }`}
                  >
                    {cardLogoEnabled ? 'مفعّل ✓' : 'تشغيل على الكروت'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="block text-[11px] font-bold text-slate-700 mb-1">
                      نطاق الظهور داخل الكارت:
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'card', label: 'على الكارت بالكامل' },
                        { id: 'image', label: 'داخل إطار الصورة' },
                      ].map((sc) => (
                        <button
                          key={sc.id}
                          type="button"
                          onClick={() =>
                            patchCardConfig({
                              card_logo_enabled: true,
                              card_logo_scope: sc.id as 'card' | 'image',
                            })
                          }
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border cursor-pointer whitespace-nowrap ${
                            cardLogoScope === sc.id
                              ? 'bg-orange-600 text-white border-orange-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          {sc.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="block text-[11px] font-bold text-slate-700 mb-1">
                      ترتيب الطبقة:
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'front', label: 'فوق المحتوى' },
                        { id: 'back', label: 'خلفية تحت المحتوى' },
                      ].map((ly) => (
                        <button
                          key={ly.id}
                          type="button"
                          onClick={() =>
                            patchCardConfig({
                              card_logo_enabled: true,
                              card_logo_layer: ly.id as 'front' | 'back',
                            })
                          }
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border cursor-pointer whitespace-nowrap ${
                            cardLogoLayer === ly.id
                              ? 'bg-orange-600 text-white border-orange-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          {ly.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <span className="block text-[11px] font-bold text-slate-700 mb-1">
                    موضع الشعار على الكارت:
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
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
                          patchCardConfig({ card_logo_enabled: true, card_logo_position: pos.id })
                        }
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border cursor-pointer whitespace-nowrap ${
                          cardLogoPos === pos.id
                            ? 'bg-orange-600 text-white border-orange-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                      <span>الحجم</span>
                      <span className="font-mono tabular-nums text-orange-700">
                        {cardLogoSize}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={14}
                      max={90}
                      step={2}
                      value={cardLogoSize}
                      onChange={(e) =>
                        patchCardConfig({
                          card_logo_enabled: true,
                          card_logo_size: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full accent-orange-600 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                      <span>البُعد عن الحافة</span>
                      <span className="font-mono tabular-nums text-orange-700">
                        {cardLogoInset}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      step={1}
                      value={cardLogoInset}
                      onChange={(e) =>
                        patchCardConfig({ card_logo_inset: parseInt(e.target.value, 10) })
                      }
                      className="w-full accent-orange-600 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                      <span>الشفافية</span>
                      <span className="font-mono tabular-nums text-orange-700">
                        {Math.round(cardLogoOpacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.08}
                      max={1}
                      step={0.04}
                      value={cardLogoOpacity}
                      onChange={(e) =>
                        patchCardConfig({ card_logo_opacity: parseFloat(e.target.value) })
                      }
                      className="w-full accent-orange-600 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                      <span>إزاحة أفقية</span>
                      <span dir="ltr" className="font-mono tabular-nums text-orange-700">
                        {cardLogoOffX}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-30}
                      max={30}
                      step={1}
                      value={cardLogoOffX}
                      onChange={(e) =>
                        patchCardConfig({ card_logo_offset_x: parseInt(e.target.value, 10) })
                      }
                      className="w-full accent-orange-600 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                      <span>إزاحة رأسية</span>
                      <span dir="ltr" className="font-mono tabular-nums text-orange-700">
                        {cardLogoOffY}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-30}
                      max={30}
                      step={1}
                      value={cardLogoOffY}
                      onChange={(e) =>
                        patchCardConfig({ card_logo_offset_y: parseInt(e.target.value, 10) })
                      }
                      className="w-full accent-orange-600 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                      <span>الدوران</span>
                      <span dir="ltr" className="font-mono tabular-nums text-orange-700">
                        {cardLogoRot}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-45}
                      max={45}
                      step={3}
                      value={cardLogoRot}
                      onChange={(e) =>
                        patchCardConfig({ card_logo_rotation: parseInt(e.target.value, 10) })
                      }
                      className="w-full accent-orange-600 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 items-end">
                  <div>
                    <span className="block text-[11px] font-bold text-slate-700 mb-1">
                      شكل ختم الكارت:
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: 'rounded', label: 'ناعم' },
                          { id: 'circle', label: 'دائري' },
                          { id: 'clean', label: 'حر شفاف' },
                        ] as { id: CardLogoShape; label: string }[]
                      ).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            patchCardConfig({
                              card_logo_shape: s.id,
                              card_logo_bg: s.id !== 'clean',
                            })
                          }
                          className={`py-1.5 px-1 rounded-lg text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                            cardLogoShape === s.id
                              ? 'bg-orange-600 text-white border-orange-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => patchCardConfig({ card_logo_bg: !cardLogoBg })}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer whitespace-nowrap ${
                      cardLogoBg
                        ? 'bg-orange-100 text-orange-900 border-orange-300'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {cardLogoBg ? '✓ خلفية بيضاء للوضوح' : 'بدون خلفية بيضاء'}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: PAGE WATERMARK LAYER & COORDINATED PRESETS */}
            {activeTab === 'page' && (
              <div className="space-y-3.5 bg-slate-50/70 border border-slate-200 rounded-2xl p-3.5">
                {/* Coordinated Presets */}
                <div>
                  <span className="text-[11px] font-extrabold text-slate-800 flex items-center gap-1.5 mb-1.5">
                    <Sparkles size={13} className="text-orange-600" />
                    تنسيقات ملائمة ومتناغمة بنقرة واحدة:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {[
                      { id: 'balanced_pro', label: 'رسمي متوازن' },
                      { id: 'card_stamp', label: 'ختم على الكروت' },
                      { id: 'protected_tiled', label: 'حماية مائلة' },
                      { id: 'clean_header', label: 'هيدر نظيف فقط' },
                    ].map((pr) => (
                      <button
                        key={pr.id}
                        type="button"
                        onClick={() =>
                          applyCoordinatedPreset(
                            pr.id as
                              | 'balanced_pro'
                              | 'protected_tiled'
                              | 'card_stamp'
                              | 'clean_header'
                          )
                        }
                        className="py-2 px-2 rounded-xl text-[11px] font-bold border border-orange-200 bg-white hover:bg-orange-50 text-slate-700 cursor-pointer whitespace-nowrap"
                      >
                        {pr.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Page Watermark Mode & Layer */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <span className="block text-[11px] font-bold text-slate-700 mb-1">
                      طريقة عرض الشعار على الصفحات:
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: 'none', label: 'إيقاف' },
                          { id: 'center', label: 'مفرد' },
                          { id: 'tiled', label: 'مكرر مائل' },
                        ] as { id: WatermarkType; label: string }[]
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => patchSettings({ watermark_type: m.id })}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border cursor-pointer whitespace-nowrap ${
                            wmType === m.id
                              ? 'bg-orange-600 text-white border-orange-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="block text-[11px] font-bold text-slate-700 mb-1">
                      ترتيب طبقة الصفحة:
                    </span>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { id: 'front', label: 'فوق المنتجات' },
                        { id: 'back', label: 'تحت المنتجات' },
                      ].map((ly) => (
                        <button
                          key={ly.id}
                          type="button"
                          onClick={() =>
                            patchSettings({ watermark_layer: ly.id as WatermarkLayer })
                          }
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border cursor-pointer whitespace-nowrap ${
                            wmLayer === ly.id
                              ? 'bg-orange-600 text-white border-orange-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          {ly.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {wmType !== 'none' && (
                  <>
                    {wmType === 'center' && (
                      <div>
                        <span className="block text-[11px] font-bold text-slate-700 mb-1">
                          موضع اللوجو المفرد:
                        </span>
                        <div className="grid grid-cols-3 gap-1">
                          {[
                            { id: 'top-right', label: 'أعلى يمين' },
                            { id: 'top-center', label: 'أعلى وسط' },
                            { id: 'top-left', label: 'أعلى يسار' },
                            { id: 'center', label: 'المنتصف' },
                            { id: 'bottom-right', label: 'أسفل يمين' },
                            { id: 'bottom-left', label: 'أسفل يسار' },
                          ].map((pos) => (
                            <button
                              key={pos.id}
                              type="button"
                              onClick={() =>
                                patchSettings({ watermark_position: pos.id as WatermarkPosition })
                              }
                              className={`py-1 px-1.5 rounded-lg text-[10px] font-bold border cursor-pointer whitespace-nowrap ${
                                wmPos === pos.id
                                  ? 'bg-orange-600 text-white border-orange-600'
                                  : 'bg-white text-slate-700 border-slate-200'
                              }`}
                            >
                              {pos.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
                      <div>
                        <div className="flex justify-between text-[10px] font-bold text-slate-700 mb-1">
                          <span>حجم الشعار</span>
                          <span className="font-mono tabular-nums text-orange-700">
                            {wmSize}px
                          </span>
                        </div>
                        <input
                          type="range"
                          min={60}
                          max={600}
                          step={10}
                          value={wmSize}
                          onChange={(e) =>
                            patchSettings({ watermark_size: parseInt(e.target.value, 10) })
                          }
                          className="w-full accent-orange-600 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] font-bold text-slate-700 mb-1">
                          <span>الشفافية</span>
                          <span className="font-mono tabular-nums text-orange-700">
                            {Math.round(wmOpacity * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.03}
                          max={1}
                          step={0.02}
                          value={wmOpacity}
                          onChange={(e) =>
                            patchSettings({ watermark_opacity: parseFloat(e.target.value) })
                          }
                          className="w-full accent-orange-600 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] font-bold text-slate-700 mb-1">
                          <span>الدوران</span>
                          <span dir="ltr" className="font-mono tabular-nums text-orange-700">
                            {wmRot}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-45}
                          max={45}
                          step={5}
                          value={wmRot}
                          onChange={(e) =>
                            patchSettings({ watermark_rotation: parseInt(e.target.value, 10) })
                          }
                          className="w-full accent-orange-600 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] font-bold text-slate-700 mb-1">
                          <span>إزاحة أفقية</span>
                          <span dir="ltr" className="font-mono tabular-nums text-orange-700">
                            {wmOffX}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-45}
                          max={45}
                          step={2}
                          value={wmOffX}
                          onChange={(e) =>
                            patchSettings({ watermark_offset_x: parseInt(e.target.value, 10) })
                          }
                          className="w-full accent-orange-600 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] font-bold text-slate-700 mb-1">
                          <span>إزاحة رأسية</span>
                          <span dir="ltr" className="font-mono tabular-nums text-orange-700">
                            {wmOffY}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-45}
                          max={45}
                          step={2}
                          value={wmOffY}
                          onChange={(e) =>
                            patchSettings({ watermark_offset_y: parseInt(e.target.value, 10) })
                          }
                          className="w-full accent-orange-600 cursor-pointer"
                        />
                      </div>

                      {wmType === 'tiled' && (
                        <div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-700 mb-1">
                            <span>تباعد التكرار</span>
                            <span className="font-mono tabular-nums text-orange-700">
                              {wmGap}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={60}
                            max={240}
                            step={5}
                            value={wmGap}
                            onChange={(e) =>
                              patchSettings({ watermark_gap: parseInt(e.target.value, 10) })
                            }
                            className="w-full accent-orange-600 cursor-pointer"
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => applyCoordinatedPreset('clean_header')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>استعادة التنسيق الافتراضي للشعار</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-extrabold rounded-xl shadow-xs cursor-pointer"
          >
            تطبيق وحفظ في المعاينة والـ PDF
          </button>
        </div>
      </div>
    </div>
  );
};
