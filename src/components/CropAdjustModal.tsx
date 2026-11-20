import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Product } from '../types';
import {
  loadImage,
  readFileAsWorkingDataUrl,
  buildTransformedStudioCanvas,
  renderStudioImage,
  StudioMaskStroke,
  StudioTextLayer,
  STUDIO_FONT_OPTIONS,
  WORDART_PRESETS,
  createDefaultTextLayer,
  cloneTextLayers,
  textLayersEqual,
  drawStudioTextLayers,
  measureStudioTextLayerBox,
} from '../utils/imageCropper';
import { useUiFeedback } from './UiFeedbackProvider';
import {
  X,
  Check,
  Upload,
  Crop,
  RotateCcw,
  RotateCw,
  AlertTriangle,
  Maximize2,
  Minimize2,
  Sliders,
  Image as ImageIcon,
  Eraser,
  Paintbrush,
  Wand2,
  FlipHorizontal2,
  FlipVertical2,
  Trash2,
  Undo2,
  Redo2,
  Sparkles,
  Sun,
  ZoomIn,
  Pipette,
  Palette,
  ShieldCheck,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronLeft,
  Type,
  Plus,
  Copy,
  Bold,
  Italic,
  Underline,
  Move,
} from 'lucide-react';

export interface CropAdjustQueueNav {
  currentNumber: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  onNavigate: (direction: 'prev' | 'next', editedImageUrl?: string, rawSourceUrl?: string) => void;
}

export interface CropAdjustModalProps {
  product?: Product;
  initialImageUrl?: string;
  initialRawUrl?: string;
  initialCropBox?: [number, number, number, number];
  outputFormat?: 'png' | 'jpeg';
  targetMaxDimension?: number;
  workingMaxSide?: number;
  title?: string;
  subtitle?: string;
  queueNav?: CropAdjustQueueNav;
  onClose: () => void;
  onSave?: (updatedProduct: Product) => void;
  onSaveImageUrl?: (editedImageUrl: string, rawSourceUrl: string) => void;
  onRemoveImage?: () => void;
}

type StudioTab = 'crop' | 'erase' | 'text' | 'transform' | 'adjust';
type AspectPreset = 'free' | '1:1' | '4:3' | '3:4' | '16:9';
type EraseToolMode = 'keep' | 'bgMark' | 'erase' | 'restore' | 'paint' | 'eyedropper';
type DropperAction = 'removeColor' | 'setPaintColor' | 'setBgColor';
type DragHandle =
  | 'move'
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | null;

const ASPECT_RATIO_MAP: Record<AspectPreset, number | null> = {
  free: null,
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
};

const BG_COLOR_PRESETS: { value: string; label: string }[] = [
  { value: '#ffffff', label: 'أبيض نقي' },
  { value: 'transparent', label: 'شفاف PNG' },
  { value: '#f1f5f9', label: 'رمادي استوديو' },
  { value: '#fff7ed', label: 'برتقالي ناعم' },
  { value: '#fef3c7', label: 'كريمي دافئ' },
  { value: '#f0fdf4', label: 'أخضر فاتح' },
  { value: '#fdf2f8', label: 'وردي ناعم' },
  { value: '#0f172a', label: 'داكن فخم' },
];

const BRUSH_COLOR_PALETTE: string[] = [
  '#ffffff',
  '#0f172a',
  '#ea580c',
  '#ef4444',
  '#10b981',
  '#3b82f6',
  '#f59e0b',
  '#64748b',
];

const MULTI_COLOR_GRADIENTS: { label: string; colors: string[] }[] = [
  { label: 'ناري', colors: ['#ef4444', '#f97316', '#facc15'] },
  { label: 'ذهبي', colors: ['#fef08a', '#f59e0b', '#b45309'] },
  { label: 'قوس قزح', colors: ['#ec4899', '#8b5cf6', '#06b6d4'] },
  { label: 'بحري', colors: ['#1d4ed8', '#0ea5e9', '#10b981'] },
  { label: 'ملكي', colors: ['#9333ea', '#ec4899', '#f43f5e'] },
  { label: 'زمردي', colors: ['#059669', '#10b981', '#a3e635'] },
  { label: 'داكن معدني', colors: ['#0f172a', '#475569', '#94a3b8'] },
];

interface StudioHistorySnapshot {
  workingSourceUrl: string;
  cropBox: [number, number, number, number];
  aspectPreset: AspectPreset;
  zoom: number;
  rotation90: number;
  straightenDeg: number;
  flipH: boolean;
  flipV: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
  autoBgRemove: boolean;
  bgTolerance: number;
  edgeProtection: number;
  bgFeather: number;
  protectCenter: boolean;
  backgroundColor: string;
  targetRemoveColors: string[];
  strokes: StudioMaskStroke[];
  textLayers: StudioTextLayer[];
}

function cloneStudioSnapshot(snap: StudioHistorySnapshot): StudioHistorySnapshot {
  return {
    ...snap,
    cropBox: [...snap.cropBox] as [number, number, number, number],
    targetRemoveColors: [...snap.targetRemoveColors],
    strokes: snap.strokes.map((s) => ({
      ...s,
      points: s.points.map((p) => ({ ...p })),
    })),
    textLayers: cloneTextLayers(snap.textLayers || []),
  };
}

function snapshotsEqual(a: StudioHistorySnapshot, b: StudioHistorySnapshot): boolean {
  if (
    a.workingSourceUrl !== b.workingSourceUrl ||
    a.aspectPreset !== b.aspectPreset ||
    a.zoom !== b.zoom ||
    a.rotation90 !== b.rotation90 ||
    a.straightenDeg !== b.straightenDeg ||
    a.flipH !== b.flipH ||
    a.flipV !== b.flipV ||
    a.brightness !== b.brightness ||
    a.contrast !== b.contrast ||
    a.saturation !== b.saturation ||
    a.autoBgRemove !== b.autoBgRemove ||
    a.bgTolerance !== b.bgTolerance ||
    a.edgeProtection !== b.edgeProtection ||
    a.bgFeather !== b.bgFeather ||
    a.protectCenter !== b.protectCenter ||
    a.backgroundColor !== b.backgroundColor ||
    a.cropBox[0] !== b.cropBox[0] ||
    a.cropBox[1] !== b.cropBox[1] ||
    a.cropBox[2] !== b.cropBox[2] ||
    a.cropBox[3] !== b.cropBox[3] ||
    a.targetRemoveColors.length !== b.targetRemoveColors.length ||
    a.strokes.length !== b.strokes.length ||
    !textLayersEqual(a.textLayers || [], b.textLayers || [])
  ) {
    return false;
  }
  for (let i = 0; i < a.targetRemoveColors.length; i++) {
    if (a.targetRemoveColors[i] !== b.targetRemoveColors[i]) return false;
  }
  for (let i = 0; i < a.strokes.length; i++) {
    const sa = a.strokes[i];
    const sb = b.strokes[i];
    if (
      sa.id !== sb.id ||
      sa.mode !== sb.mode ||
      sa.color !== sb.color ||
      sa.opacity !== sb.opacity ||
      sa.radiusNormalized !== sb.radiusNormalized ||
      sa.points.length !== sb.points.length
    ) {
      return false;
    }
    for (let j = 0; j < sa.points.length; j++) {
      if (sa.points[j].x !== sb.points[j].x || sa.points[j].y !== sb.points[j].y) return false;
    }
  }
  return true;
}

export const CropAdjustModal: React.FC<CropAdjustModalProps> = ({
  product,
  initialImageUrl,
  initialRawUrl,
  initialCropBox,
  outputFormat,
  targetMaxDimension = 560,
  workingMaxSide = 1100,
  title,
  subtitle,
  queueNav,
  onClose,
  onSave,
  onSaveImageUrl,
  onRemoveImage,
}) => {
  const { toast } = useUiFeedback();

  const buildInitialSnapshot = useCallback(
    (sourceOverride?: string): StudioHistorySnapshot => {
      const box: [number, number, number, number] =
        initialCropBox && initialCropBox[0] < initialCropBox[2] && initialCropBox[1] < initialCropBox[3]
          ? ([...initialCropBox] as [number, number, number, number])
          : product?.raw_bounding_box &&
              product.raw_bounding_box[0] < product.raw_bounding_box[2] &&
              product.raw_bounding_box[1] < product.raw_bounding_box[3]
            ? ([...product.raw_bounding_box] as [number, number, number, number])
            : [40, 40, 960, 960];

      return {
        workingSourceUrl:
          sourceOverride ??
          initialRawUrl ??
          initialImageUrl ??
          product?.original_image_url ??
          product?.image_url ??
          '',
        cropBox: box,
        aspectPreset: 'free',
        zoom: 1,
        rotation90: 0,
        straightenDeg: 0,
        flipH: false,
        flipV: false,
        brightness: 100,
        contrast: 100,
        saturation: 100,
        autoBgRemove: false,
        bgTolerance: 26,
        edgeProtection: 72,
        bgFeather: 2,
        protectCenter: true,
        backgroundColor: '#ffffff',
        targetRemoveColors: [],
        strokes: [],
        textLayers: [],
      };
    },
    [initialImageUrl, initialRawUrl, product]
  );

  // Source high-res working image inside the studio
  const [workingSourceUrl, setWorkingSourceUrl] = useState<string>(
    () => buildInitialSnapshot().workingSourceUrl
  );

  const [loadedImg, setLoadedImg] = useState<HTMLImageElement | null>(null);
  const [baseSize, setBaseSize] = useState<{ w: number; h: number }>({ w: 400, h: 400 });

  // Studio tabs & tools
  const [activeTab, setActiveTab] = useState<StudioTab>('crop');
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>('free');

  // Crop box in 0..1000 relative to the transformed base canvas
  const [cropBox, setCropBox] = useState<[number, number, number, number]>(
    () => buildInitialSnapshot().cropBox
  );
  const [zoom, setZoom] = useState<number>(1);

  // Transform & Adjust state
  const [rotation90, setRotation90] = useState<number>(0); // 0, 90, 180, 270
  const [straightenDeg, setStraightenDeg] = useState<number>(0); // -45 .. 45
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [saturation, setSaturation] = useState<number>(100);

  // Erase, precision BG removal, interactive subject/BG markers, colors & background state
  const [autoBgRemove, setAutoBgRemove] = useState<boolean>(false);
  const [bgTolerance, setBgTolerance] = useState<number>(26);
  const [edgeProtection, setEdgeProtection] = useState<number>(72);
  const [bgFeather, setBgFeather] = useState<number>(2);
  const [protectCenter, setProtectCenter] = useState<boolean>(true);
  const [backgroundColor, setBackgroundColor] = useState<string>('#ffffff');
  const [eraseTool, setEraseTool] = useState<EraseToolMode>('erase');
  const [dropperAction, setDropperAction] = useState<DropperAction>('removeColor');
  const [activeColor, setActiveColor] = useState<string>('#ea580c');
  const [paintOpacity, setPaintOpacity] = useState<number>(100);
  const [targetRemoveColors, setTargetRemoveColors] = useState<string[]>([]);
  const [brushSize, setBrushSize] = useState<number>(26); // visual px-equivalent (6..80)
  const [strokes, setStrokes] = useState<StudioMaskStroke[]>([]);
  const [textLayers, setTextLayers] = useState<StudioTextLayer[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [fontsLoadedTick, setFontsLoadedTick] = useState<number>(0);
  const [showMaskGuides, setShowMaskGuides] = useState<boolean>(true);
  const [confirmRemoveStep, setConfirmRemoveStep] = useState<boolean>(false);

  // Live previews & status
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [mobilePreviewCollapsed, setMobilePreviewCollapsed] = useState<boolean>(false);

  // Unified Continuous Edit History (Undo / Redo from start to end of all edits)
  const buildInitialSnapshotRef = useRef(buildInitialSnapshot);
  buildInitialSnapshotRef.current = buildInitialSnapshot;
  const initialSnapRef = useRef<StudioHistorySnapshot>(buildInitialSnapshot());
  const latestSnapRef = useRef<StudioHistorySnapshot>(cloneStudioSnapshot(initialSnapRef.current));
  const historyRef = useRef<StudioHistorySnapshot[]>([cloneStudioSnapshot(initialSnapRef.current)]);
  const historyIdxRef = useRef<number>(0);
  const [historyMeta, setHistoryMeta] = useState<{ index: number; total: number }>({
    index: 0,
    total: 1,
  });
  const sliderCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevInitKeyRef = useRef<string>(
    `${initialRawUrl ?? ''}||${initialImageUrl ?? ''}||${product?.id ?? ''}`
  );

  const applySnapshot = useCallback((snap: StudioHistorySnapshot) => {
    const copy = cloneStudioSnapshot(snap);
    latestSnapRef.current = copy;
    setWorkingSourceUrl(copy.workingSourceUrl);
    setCropBox(copy.cropBox);
    setAspectPreset(copy.aspectPreset);
    setZoom(copy.zoom);
    setRotation90(copy.rotation90);
    setStraightenDeg(copy.straightenDeg);
    setFlipH(copy.flipH);
    setFlipV(copy.flipV);
    setBrightness(copy.brightness);
    setContrast(copy.contrast);
    setSaturation(copy.saturation);
    setAutoBgRemove(copy.autoBgRemove);
    setBgTolerance(copy.bgTolerance);
    setEdgeProtection(copy.edgeProtection);
    setBgFeather(copy.bgFeather);
    setProtectCenter(copy.protectCenter);
    setBackgroundColor(copy.backgroundColor);
    setTargetRemoveColors(copy.targetRemoveColors);
    setStrokes(copy.strokes);
    setTextLayers(copy.textLayers || []);
  }, []);

  const previewPatch = useCallback(
    (
      updater:
        | Partial<StudioHistorySnapshot>
        | ((prev: StudioHistorySnapshot) => StudioHistorySnapshot)
    ) => {
      const base = cloneStudioSnapshot(latestSnapRef.current);
      const next =
        typeof updater === 'function'
          ? cloneStudioSnapshot(updater(base))
          : cloneStudioSnapshot({ ...base, ...updater });
      applySnapshot(next);
    },
    [applySnapshot]
  );

  const commitPendingPreview = useCallback(() => {
    if (sliderCommitTimerRef.current) {
      clearTimeout(sliderCommitTimerRef.current);
      sliderCommitTimerRef.current = null;
    }
    const current = cloneStudioSnapshot(latestSnapRef.current);
    const activeSaved = historyRef.current[historyIdxRef.current];
    if (activeSaved && snapshotsEqual(current, activeSaved)) return;

    const trimmed = historyRef.current.slice(0, historyIdxRef.current + 1);
    trimmed.push(current);
    if (trimmed.length > 80) trimmed.shift();
    historyRef.current = trimmed;
    historyIdxRef.current = trimmed.length - 1;
    setHistoryMeta({ index: historyIdxRef.current, total: trimmed.length });
  }, []);

  const scheduleSliderCommit = useCallback(() => {
    if (sliderCommitTimerRef.current) {
      clearTimeout(sliderCommitTimerRef.current);
    }
    sliderCommitTimerRef.current = setTimeout(() => {
      sliderCommitTimerRef.current = null;
      commitPendingPreview();
    }, 280);
  }, [commitPendingPreview]);

  const commitPatch = useCallback(
    (
      updater:
        | Partial<StudioHistorySnapshot>
        | ((prev: StudioHistorySnapshot) => StudioHistorySnapshot)
    ) => {
      if (sliderCommitTimerRef.current) {
        clearTimeout(sliderCommitTimerRef.current);
        sliderCommitTimerRef.current = null;
      }
      const base = cloneStudioSnapshot(latestSnapRef.current);
      const next =
        typeof updater === 'function'
          ? cloneStudioSnapshot(updater(base))
          : cloneStudioSnapshot({ ...base, ...updater });
      if (snapshotsEqual(base, next)) return;

      applySnapshot(next);
      const trimmed = historyRef.current.slice(0, historyIdxRef.current + 1);
      trimmed.push(cloneStudioSnapshot(next));
      if (trimmed.length > 80) trimmed.shift();
      historyRef.current = trimmed;
      historyIdxRef.current = trimmed.length - 1;
      setHistoryMeta({ index: historyIdxRef.current, total: trimmed.length });
    },
    [applySnapshot]
  );

  const handleUndo = useCallback(() => {
    if (sliderCommitTimerRef.current) {
      clearTimeout(sliderCommitTimerRef.current);
      sliderCommitTimerRef.current = null;
    }
    // If there is an uncommitted live drag/slider tweak, revert cleanly to current saved checkpoint first
    const currentCheckpoint = historyRef.current[historyIdxRef.current];
    if (currentCheckpoint && !snapshotsEqual(latestSnapRef.current, currentCheckpoint)) {
      applySnapshot(currentCheckpoint);
      return;
    }
    if (historyIdxRef.current <= 0) return;
    const prevIdx = historyIdxRef.current - 1;
    historyIdxRef.current = prevIdx;
    setHistoryMeta({ index: prevIdx, total: historyRef.current.length });
    applySnapshot(historyRef.current[prevIdx]);
  }, [applySnapshot]);

  const handleRedo = useCallback(() => {
    if (sliderCommitTimerRef.current) {
      clearTimeout(sliderCommitTimerRef.current);
      sliderCommitTimerRef.current = null;
    }
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    const nextIdx = historyIdxRef.current + 1;
    historyIdxRef.current = nextIdx;
    setHistoryMeta({ index: nextIdx, total: historyRef.current.length });
    applySnapshot(historyRef.current[nextIdx]);
  }, [applySnapshot]);

  // Sync if caller opens modal with new initial url / switches queued item
  useEffect(() => {
    const nextInitKey = `${initialRawUrl ?? ''}||${initialImageUrl ?? ''}||${product?.id ?? ''}`;
    if (prevInitKeyRef.current === nextInitKey) return;
    prevInitKeyRef.current = nextInitKey;

    const fresh = buildInitialSnapshotRef.current();
    initialSnapRef.current = cloneStudioSnapshot(fresh);
    if (sliderCommitTimerRef.current) {
      clearTimeout(sliderCommitTimerRef.current);
      sliderCommitTimerRef.current = null;
    }
    historyRef.current = [cloneStudioSnapshot(fresh)];
    historyIdxRef.current = 0;
    setHistoryMeta({ index: 0, total: 1 });
    applySnapshot(fresh);
    setConfirmRemoveStep(false);
  }, [initialRawUrl, initialImageUrl, product?.id, applySnapshot]);

  // Keyboard shortcuts: Ctrl+Z (السابق) and Ctrl+Y / Ctrl+Shift+Z (لاحق)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  // DOM refs
  const stageCanvasRef = useRef<HTMLCanvasElement>(null);
  const textOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const textStageOverlayRef = useRef<HTMLDivElement>(null);
  const cleanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active drag state for interactive crop handles
  const dragStateRef = useRef<{
    handle: DragHandle;
    startX: number;
    startY: number;
    startBox: [number, number, number, number];
    rectW: number;
    rectH: number;
  } | null>(null);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);

  // Active drag state for interactive WordArt text layers
  const textDragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    rectW: number;
    rectH: number;
  } | null>(null);

  // Active manual brush stroke ref
  const activeStrokeRef = useRef<StudioMaskStroke | null>(null);
  const [cursorPreview, setCursorPreview] = useState<{ x: number; y: number } | null>(null);

  const totalRotation = rotation90 + straightenDeg;
  const canUndo = historyMeta.index > 0;
  const canRedo = historyMeta.index < historyMeta.total - 1;

  // Load image element whenever workingSourceUrl changes
  useEffect(() => {
    let cancelled = false;
    if (!workingSourceUrl) {
      setLoadedImg(null);
      return;
    }
    loadImage(workingSourceUrl)
      .then((img) => {
        if (!cancelled) {
          setLoadedImg(img);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadedImg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workingSourceUrl]);

  // Draw the transformed base canvas onto the visible stage <canvas>
  useEffect(() => {
    if (!loadedImg || !stageCanvasRef.current) return;
    const baseClean = buildTransformedStudioCanvas(
      loadedImg,
      {
        rotationDeg: totalRotation,
        flipH,
        flipV,
        brightness,
        contrast,
        saturation,
        autoBgRemove,
        bgTolerance,
        edgeProtection,
        bgFeather,
        protectCenter,
        targetRemoveColors,
        strokes,
        showMaskGuides: false,
      },
      680
    );
    cleanCanvasRef.current = baseClean;

    const canvas = stageCanvasRef.current;
    canvas.width = baseClean.width;
    canvas.height = baseClean.height;
    setBaseSize({ w: baseClean.width, h: baseClean.height });
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, baseClean.width, baseClean.height);
      ctx.drawImage(baseClean, 0, 0);

      // Draw translucent interactive keep (green) / bgMark (red) selection guides in Erase tab only
      if (activeTab === 'erase' && showMaskGuides && strokes.length > 0) {
        const maxDim = Math.max(baseClean.width, baseClean.height);
        for (const stroke of strokes) {
          if (stroke.mode !== 'keep' && stroke.mode !== 'bgMark') continue;
          if (!stroke.points || stroke.points.length === 0) continue;
          const radiusPx = Math.max(3, stroke.radiusNormalized * maxDim);
          ctx.save();
          ctx.globalAlpha = 0.42;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          const guideColor = stroke.mode === 'keep' ? '#10b981' : '#ef4444';
          ctx.strokeStyle = guideColor;
          ctx.fillStyle = guideColor;
          ctx.lineWidth = radiusPx * 2;
          if (stroke.points.length === 1) {
            const p = stroke.points[0];
            ctx.beginPath();
            ctx.arc(p.x * baseClean.width, p.y * baseClean.height, radiusPx, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.moveTo(stroke.points[0].x * baseClean.width, stroke.points[0].y * baseClean.height);
            for (let i = 1; i < stroke.points.length; i++) {
              ctx.lineTo(stroke.points[i].x * baseClean.width, stroke.points[i].y * baseClean.height);
            }
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }
  }, [
    loadedImg,
    totalRotation,
    flipH,
    flipV,
    brightness,
    contrast,
    saturation,
    autoBgRemove,
    bgTolerance,
    edgeProtection,
    bgFeather,
    protectCenter,
    targetRemoveColors,
    strokes,
    activeTab,
    showMaskGuides,
  ]);

  // Ensure Google Fonts are ready for Canvas rendering when text layers exist
  useEffect(() => {
    if (textLayers.length === 0 || typeof document === 'undefined' || !('fonts' in document)) return;
    let cancelled = false;
    Promise.all(
      textLayers.map((l) =>
        document.fonts
          .load(`${l.fontWeight === '900' ? '900' : '700'} 28px "${l.fontFamily}"`)
          .catch(() => undefined)
      )
    ).then(() => {
      if (!cancelled) setFontsLoadedTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [textLayers]);

  // Draw live WordArt text overlay canvas aligned to cropBox on the main stage
  useEffect(() => {
    const overlayCanvas = textOverlayCanvasRef.current;
    if (!overlayCanvas || baseSize.w <= 0 || baseSize.h <= 0) return;

    const cropW = Math.max(120, Math.round(((cropBox[3] - cropBox[1]) / 1000) * baseSize.w));
    const cropH = Math.max(120, Math.round(((cropBox[2] - cropBox[0]) / 1000) * baseSize.h));
    overlayCanvas.width = cropW;
    overlayCanvas.height = cropH;
    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cropW, cropH);
    if (textLayers.length > 0) {
      drawStudioTextLayers(ctx, cropW, cropH, textLayers);
    }
  }, [textLayers, cropBox, baseSize, activeTab, fontsLoadedTick]);

  // Update mini live result preview
  useEffect(() => {
    if (!workingSourceUrl) {
      setCroppedPreviewUrl('');
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      renderStudioImage({
        sourceUrl: workingSourceUrl,
        cropBox,
        rotationDeg: totalRotation,
        flipH,
        flipV,
        brightness,
        contrast,
        saturation,
        autoBgRemove,
        bgTolerance,
        edgeProtection,
        bgFeather,
        protectCenter,
        targetRemoveColors,
        strokes,
        textLayers,
        backgroundColor,
        workingMaxSide: 540,
        targetMaxDimension: 320,
        quality: 0.84,
      })
        .then((url) => {
          if (!cancelled) setCroppedPreviewUrl(url);
        })
        .catch(() => {});
    }, 90);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    workingSourceUrl,
    cropBox,
    totalRotation,
    flipH,
    flipV,
    brightness,
    contrast,
    saturation,
    autoBgRemove,
    bgTolerance,
    edgeProtection,
    bgFeather,
    protectCenter,
    targetRemoveColors,
    strokes,
    textLayers,
    backgroundColor,
    fontsLoadedTick,
  ]);

  // Apply aspect ratio constraint to a box around its center
  const applyAspectToBox = useCallback(
    (
      box: [number, number, number, number],
      ratio: number | null
    ): [number, number, number, number] => {
      if (!ratio || baseSize.w <= 0 || baseSize.h <= 0) return box;
      const [ymin, xmin, ymax, xmax] = box;
      const cx = (xmin + xmax) / 2;
      const cy = (ymin + ymax) / 2;
      const curPxW = ((xmax - xmin) / 1000) * baseSize.w;
      let targetPxW = curPxW;
      let targetPxH = targetPxW / ratio;
      if (targetPxH > baseSize.h * 0.96) {
        targetPxH = baseSize.h * 0.92;
        targetPxW = targetPxH * ratio;
      }
      if (targetPxW > baseSize.w * 0.96) {
        targetPxW = baseSize.w * 0.92;
        targetPxH = targetPxW / ratio;
      }
      const nw = (targetPxW / baseSize.w) * 1000;
      const nh = (targetPxH / baseSize.h) * 1000;
      const nXmin = Math.max(0, Math.min(1000 - nw, cx - nw / 2));
      const nYmin = Math.max(0, Math.min(1000 - nh, cy - nh / 2));
      return [
        Math.round(nYmin),
        Math.round(nXmin),
        Math.round(Math.min(1000, nYmin + nh)),
        Math.round(Math.min(1000, nXmin + nw)),
      ];
    },
    [baseSize]
  );

  const handleSelectAspect = (preset: AspectPreset) => {
    const ratio = ASPECT_RATIO_MAP[preset];
    commitPatch((prev) => ({
      ...prev,
      aspectPreset: preset,
      cropBox: ratio ? applyAspectToBox(prev.cropBox, ratio) : prev.cropBox,
    }));
  };

  // Zoom slider maps smoothly to centered crop box scaling when in crop mode
  const handleZoomChange = (nextZoom: number) => {
    const clamped = Math.max(1, Math.min(3, nextZoom));
    previewPatch((prev) => {
      const [ymin, xmin, ymax, xmax] = prev.cropBox;
      const cx = (xmin + xmax) / 2;
      const cy = (ymin + ymax) / 2;
      const span = 1000 / clamped;
      const ratio = ASPECT_RATIO_MAP[prev.aspectPreset];
      let nBox: [number, number, number, number] = [
        Math.max(0, cy - span / 2),
        Math.max(0, cx - span / 2),
        Math.min(1000, cy + span / 2),
        Math.min(1000, cx + span / 2),
      ];
      if (nBox[2] - nBox[0] < span) {
        if (nBox[0] === 0) nBox[2] = Math.min(1000, span);
        else nBox[0] = Math.max(0, 1000 - span);
      }
      if (nBox[3] - nBox[1] < span) {
        if (nBox[1] === 0) nBox[3] = Math.min(1000, span);
        else nBox[1] = Math.max(0, 1000 - span);
      }
      if (ratio) {
        nBox = applyAspectToBox(nBox, ratio);
      }
      return {
        ...prev,
        zoom: clamped,
        cropBox: [
          Math.round(nBox[0]),
          Math.round(nBox[1]),
          Math.round(nBox[2]),
          Math.round(nBox[3]),
        ],
      };
    });
    scheduleSliderCommit();
  };

  // Pointer handlers for interactive crop frame (touch & mouse)
  const handleCropPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    handle: DragHandle
  ) => {
    if (activeTab !== 'crop' || !stageBoxRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = stageBoxRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startBox: [...cropBox] as [number, number, number, number],
      rectW: rect.width,
      rectH: rect.height,
    };
    setIsDraggingCrop(true);
  };

  const handleCropPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || !drag.handle) return;
    e.preventDefault();

    const dx = ((e.clientX - drag.startX) / drag.rectW) * 1000;
    const dy = ((e.clientY - drag.startY) / drag.rectH) * 1000;
    const [sy1, sx1, sy2, sx2] = drag.startBox;
    const minSpan = 70; // min 7% box size
    const ratio = ASPECT_RATIO_MAP[aspectPreset];

    let y1 = sy1;
    let x1 = sx1;
    let y2 = sy2;
    let x2 = sx2;

    if (drag.handle === 'move') {
      const boxW = sx2 - sx1;
      const boxH = sy2 - sy1;
      x1 = Math.max(0, Math.min(1000 - boxW, sx1 + dx));
      y1 = Math.max(0, Math.min(1000 - boxH, sy1 + dy));
      x2 = x1 + boxW;
      y2 = y1 + boxH;
    } else {
      if (drag.handle.includes('n')) y1 = Math.max(0, Math.min(sy2 - minSpan, sy1 + dy));
      if (drag.handle.includes('s')) y2 = Math.min(1000, Math.max(sy1 + minSpan, sy2 + dy));
      if (drag.handle.includes('w')) x1 = Math.max(0, Math.min(sx2 - minSpan, sx1 + dx));
      if (drag.handle.includes('e')) x2 = Math.min(1000, Math.max(sx1 + minSpan, sx2 + dx));

      // Maintain locked aspect ratio if selected
      if (ratio && baseSize.w > 0 && baseSize.h > 0) {
        const pxW = ((x2 - x1) / 1000) * baseSize.w;
        const pxH = ((y2 - y1) / 1000) * baseSize.h;
        if (drag.handle === 'n' || drag.handle === 's') {
          const targetNormW = ((pxH * ratio) / baseSize.w) * 1000;
          const cx = (x1 + x2) / 2;
          x1 = Math.max(0, cx - targetNormW / 2);
          x2 = Math.min(1000, x1 + targetNormW);
          if (x2 === 1000) x1 = Math.max(0, 1000 - targetNormW);
        } else {
          const targetNormH = ((pxW / ratio) / baseSize.h) * 1000;
          if (drag.handle.includes('n')) {
            y1 = Math.max(0, y2 - targetNormH);
          } else {
            y2 = Math.min(1000, y1 + targetNormH);
            if (y2 === 1000) y1 = Math.max(0, 1000 - targetNormH);
          }
        }
      }
    }

    previewPatch({ cropBox: [Math.round(y1), Math.round(x1), Math.round(y2), Math.round(x2)] });
  };

  const handleCropPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore if already released
    }
    dragStateRef.current = null;
    setIsDraggingCrop(false);
    commitPendingPreview();
  };

  // Pointer handlers for manual Brush Erase / Restore / Paint / Subject Keep / Bg Mark / Eyedropper
  const getNormalizedCanvasPoint = (clientX: number, clientY: number) => {
    const canvas = stageCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { x, y, rect };
  };

  const sampleCanvasHexAt = (normX: number, normY: number): string | null => {
    const sourceCanvas = cleanCanvasRef.current || stageCanvasRef.current;
    if (!sourceCanvas) return null;
    const ctx = sourceCanvas.getContext('2d');
    if (!ctx) return null;
    const px = Math.max(0, Math.min(sourceCanvas.width - 1, Math.round(normX * (sourceCanvas.width - 1))));
    const py = Math.max(0, Math.min(sourceCanvas.height - 1, Math.round(normY * (sourceCanvas.height - 1))));
    const pixel = ctx.getImageData(px, py, 1, 1).data;
    if (pixel[3] < 20) return null;
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(pixel[0])}${toHex(pixel[1])}${toHex(pixel[2])}`;
  };

  const handleBrushPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTab !== 'erase') return;
    e.preventDefault();
    const pt = getNormalizedCanvasPoint(e.clientX, e.clientY);
    if (!pt) return;

    if (eraseTool === 'eyedropper') {
      const picked = sampleCanvasHexAt(pt.x, pt.y);
      if (!picked) {
        toast.warning('هذه المنطقة شفافة بالفعل — اختر لوناً من الصورة.');
        return;
      }
      setActiveColor(picked);
      if (dropperAction === 'removeColor') {
        commitPatch((prev) => ({
          ...prev,
          targetRemoveColors: prev.targetRemoveColors.includes(picked)
            ? prev.targetRemoveColors
            : [...prev.targetRemoveColors, picked],
        }));
        toast.success(`تم التقاط وإزالة اللون (${picked}) من الصورة`);
      } else if (dropperAction === 'setBgColor') {
        commitPatch({ backgroundColor: picked });
        toast.success(`تم تعيين (${picked}) كلون للخلفية`);
      } else {
        setEraseTool('paint');
        toast.success(`تم اختيار اللون (${picked}) للفرشاة`);
      }
      return;
    }

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const radiusNormalized = Math.max(0.009, (brushSize / 2) / Math.max(pt.rect.width, pt.rect.height));
    const stroke: StudioMaskStroke = {
      id: `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      mode: eraseTool,
      radiusNormalized,
      points: [{ x: pt.x, y: pt.y }],
      ...(eraseTool === 'paint' ? { color: activeColor, opacity: paintOpacity / 100 } : {}),
    };
    activeStrokeRef.current = stroke;
    previewPatch((prev) => ({
      ...prev,
      strokes: [...prev.strokes, stroke],
    }));
    setCursorPreview({ x: e.clientX - pt.rect.left, y: e.clientY - pt.rect.top });
  };

  const handleBrushPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTab !== 'erase') return;
    const pt = getNormalizedCanvasPoint(e.clientX, e.clientY);
    if (pt) {
      setCursorPreview({ x: e.clientX - pt.rect.left, y: e.clientY - pt.rect.top });
    }
    const active = activeStrokeRef.current;
    if (!active || !pt) return;
    e.preventDefault();

    const last = active.points[active.points.length - 1];
    if (Math.hypot(pt.x - last.x, pt.y - last.y) < 0.004) return;
    active.points.push({ x: pt.x, y: pt.y });
    const pointsCopy = active.points.map((p) => ({ ...p }));
    previewPatch((prev) => ({
      ...prev,
      strokes: prev.strokes.map((s) => (s.id === active.id ? { ...active, points: pointsCopy } : s)),
    }));
  };

  const handleBrushPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeStrokeRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      activeStrokeRef.current = null;
      commitPendingPreview();
    }
  };

  // Upload replacement / new image directly INTO the studio
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      setIsUploading(true);
      const hiResUrl = await readFileAsWorkingDataUrl(file, 1200);
      commitPatch({
        workingSourceUrl: hiResUrl,
        cropBox: [25, 25, 975, 975],
        aspectPreset: 'free',
        zoom: 1,
        rotation90: 0,
        straightenDeg: 0,
        flipH: false,
        flipV: false,
        brightness: 100,
        contrast: 100,
        saturation: 100,
        autoBgRemove: false,
        bgTolerance: 26,
        edgeProtection: 72,
        bgFeather: 2,
        protectCenter: true,
        backgroundColor: '#ffffff',
        targetRemoveColors: [],
        strokes: [],
        textLayers: [],
      });
      setSelectedTextId(null);
      setConfirmRemoveStep(false);
      toast.success('تم تحميل الصورة داخل المحرر — اضبط القص أو المسح ثم اضغط حفظ.');
    } catch (err: any) {
      toast.error(err?.message || 'تعذر قراءة الصورة المرفوعة.');
    } finally {
      setIsUploading(false);
    }
  };

  // WordArt Text Layer Helpers
  const activeTextLayer =
    textLayers.find((t) => t.id === selectedTextId) || textLayers[0] || null;

  const updateTextLayer = (
    layerId: string,
    patch: Partial<StudioTextLayer>,
    commitImmediately: boolean = false
  ) => {
    const updater = (prev: StudioHistorySnapshot): StudioHistorySnapshot => ({
      ...prev,
      textLayers: (prev.textLayers || []).map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
    });
    if (commitImmediately) {
      commitPatch(updater);
    } else {
      previewPatch(updater);
      scheduleSliderCommit();
    }
  };

  const handleAddTextLayer = (overrides?: Partial<StudioTextLayer>) => {
    const ySlots = [0.18, 0.82, 0.5, 0.32];
    const nextY = overrides?.y ?? ySlots[textLayers.length % ySlots.length];
    const newLayer = createDefaultTextLayer({
      y: nextY,
      ...overrides,
    });
    commitPatch((prev) => ({
      ...prev,
      textLayers: [...(prev.textLayers || []), newLayer],
    }));
    setSelectedTextId(newLayer.id);
    setActiveTab('text');
  };

  const handleDuplicateTextLayer = (layer: StudioTextLayer) => {
    const copy = createDefaultTextLayer({
      ...layer,
      id: `txt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      x: Math.min(0.9, layer.x + 0.06),
      y: Math.min(0.9, layer.y + 0.08),
      gradientColors: [...layer.gradientColors],
      bgGradientColors: [...layer.bgGradientColors],
    });
    commitPatch((prev) => ({
      ...prev,
      textLayers: [...(prev.textLayers || []), copy],
    }));
    setSelectedTextId(copy.id);
  };

  const handleDeleteTextLayer = (layerId: string) => {
    const remaining = textLayers.filter((l) => l.id !== layerId);
    commitPatch((prev) => ({
      ...prev,
      textLayers: (prev.textLayers || []).filter((l) => l.id !== layerId),
    }));
    setSelectedTextId(remaining[0]?.id ?? null);
  };

  const handleTextDragStart = (e: React.PointerEvent<HTMLDivElement>, layer: StudioTextLayer) => {
    if (activeTab !== 'text' || !textStageOverlayRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedTextId(layer.id);
    const rect = textStageOverlayRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    textDragRef.current = {
      id: layer.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: layer.x,
      origY: layer.y,
      rectW: rect.width,
      rectH: rect.height,
    };
  };

  const handleTextDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = textDragRef.current;
    if (!drag) return;
    e.preventDefault();
    const dx = (e.clientX - drag.startX) / drag.rectW;
    const dy = (e.clientY - drag.startY) / drag.rectH;
    const nx = Math.max(0.03, Math.min(0.97, drag.origX + dx));
    const ny = Math.max(0.03, Math.min(0.97, drag.origY + dy));
    previewPatch((prev) => ({
      ...prev,
      textLayers: (prev.textLayers || []).map((l) =>
        l.id === drag.id ? { ...l, x: nx, y: ny } : l
      ),
    }));
  };

  const handleTextDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!textDragRef.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    textDragRef.current = null;
    commitPendingPreview();
  };

  // Reset all edits (recorded in history so user can still press السابق to undo reset!)
  const handleResetAll = () => {
    commitPatch((prev) => ({
      ...prev,
      cropBox: [25, 25, 975, 975],
      aspectPreset: 'free',
      zoom: 1,
      rotation90: 0,
      straightenDeg: 0,
      flipH: false,
      flipV: false,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      autoBgRemove: false,
      bgTolerance: 26,
      edgeProtection: 72,
      bgFeather: 2,
      protectCenter: true,
      backgroundColor: '#ffffff',
      targetRemoveColors: [],
      strokes: [],
      textLayers: [],
    }));
    setSelectedTextId(null);
  };

  // Auto color enhance
  const handleAutoEnhance = () => {
    commitPatch({
      brightness: 106,
      contrast: 114,
      saturation: 112,
    });
    toast.success('تم تطبيق التحسين التلقائي للإضاءة والألوان.');
  };

  // Save final cropped & edited photo
  const handleSaveFinal = async () => {
    if (!workingSourceUrl) {
      toast.warning('لا توجد صورة لحفظها. يمكنك رفع صورة أولاً.');
      return;
    }
    try {
      setIsSaving(true);
      const renderedUrl = await renderStudioImage({
        sourceUrl: workingSourceUrl,
        cropBox,
        rotationDeg: totalRotation,
        flipH,
        flipV,
        brightness,
        contrast,
        saturation,
        autoBgRemove,
        bgTolerance,
        edgeProtection,
        bgFeather,
        protectCenter,
        targetRemoveColors,
        strokes,
        textLayers,
        backgroundColor,
        targetMaxDimension,
        workingMaxSide,
        outputFormat,
        quality: 0.92,
      });

      if (onSaveImageUrl) {
        onSaveImageUrl(renderedUrl, workingSourceUrl);
      }
      if (product && onSave) {
        onSave({
          ...product,
          image_url: renderedUrl,
          original_image_url: workingSourceUrl,
          raw_bounding_box: cropBox,
          box_2d: cropBox,
          needs_crop_adjustment: false,
          updated_at: Date.now(),
        });
      }
      toast.success('تم حفظ الصورة بعد القص والتعديل الاحترافي بنجاح.');
      onClose();
    } catch {
      toast.error('تعذر معالجة وحفظ الصورة.');
    } finally {
      setIsSaving(false);
    }
  };

  // Use full image without crop (keeping transforms/eraser/background color if any)
  const handleUseFullImage = async () => {
    if (!workingSourceUrl) return;
    try {
      setIsSaving(true);
      const renderedUrl = await renderStudioImage({
        sourceUrl: workingSourceUrl,
        cropBox: [0, 0, 1000, 1000],
        rotationDeg: totalRotation,
        flipH,
        flipV,
        brightness,
        contrast,
        saturation,
        autoBgRemove,
        bgTolerance,
        edgeProtection,
        bgFeather,
        protectCenter,
        targetRemoveColors,
        strokes,
        textLayers,
        backgroundColor,
        targetMaxDimension,
        workingMaxSide,
        outputFormat,
        quality: 0.92,
      });

      if (onSaveImageUrl) {
        onSaveImageUrl(renderedUrl, workingSourceUrl);
      }
      if (product && onSave) {
        onSave({
          ...product,
          image_url: renderedUrl,
          original_image_url: workingSourceUrl,
          raw_bounding_box: [0, 0, 1000, 1000],
          box_2d: [0, 0, 1000, 1000],
          needs_crop_adjustment: false,
          updated_at: Date.now(),
        });
      }
      toast.success('تم اعتماد الصورة كاملة بنجاح.');
      onClose();
    } catch {
      toast.error('تعذر حفظ الصورة الكاملة.');
    } finally {
      setIsSaving(false);
    }
  };

  // Remove image from product
  const handleConfirmRemoveImage = () => {
    if (!confirmRemoveStep) {
      setConfirmRemoveStep(true);
      return;
    }
    if (onRemoveImage) {
      onRemoveImage();
    }
    if (product && onSave) {
      onSave({
        ...product,
        image_url: undefined,
        original_image_url: undefined,
        raw_bounding_box: undefined,
        box_2d: undefined,
        needs_crop_adjustment: false,
        updated_at: Date.now(),
      });
    }
    toast.success('تمت إزالة صورة المنتج.');
    onClose();
  };

  // Switch between queued images before processing (auto-saving edits if user modified current photo)
  const handleQueueSwitch = async (direction: 'prev' | 'next') => {
    if (!queueNav || isSaving) return;
    if (direction === 'prev' && !queueNav.hasPrev) return;
    if (direction === 'next' && !queueNav.hasNext) return;

    const hasModified =
      historyIdxRef.current > 0 ||
      (historyRef.current[0] && !snapshotsEqual(latestSnapRef.current, historyRef.current[0]));

    if (hasModified && workingSourceUrl) {
      try {
        setIsSaving(true);
        const renderedUrl = await renderStudioImage({
          sourceUrl: workingSourceUrl,
          cropBox,
          rotationDeg: totalRotation,
          flipH,
          flipV,
          brightness,
          contrast,
          saturation,
          autoBgRemove,
          bgTolerance,
          edgeProtection,
          bgFeather,
          protectCenter,
          targetRemoveColors,
          strokes,
          textLayers,
          backgroundColor,
          targetMaxDimension,
          workingMaxSide,
          outputFormat,
          quality: 0.92,
        });
        queueNav.onNavigate(direction, renderedUrl, workingSourceUrl);
      } catch {
        queueNav.onNavigate(direction);
      } finally {
        setIsSaving(false);
      }
    } else {
      queueNav.onNavigate(direction);
    }
  };

  const displayTitle = title || 'استوديو تعديل وقص صورة المنتج الاحترافي';
  const displaySubtitle =
    subtitle ||
    (product ? `${product.name || 'منتج غير مسمى'} ${product.code ? `(${product.code})` : ''}` : '');

  const topPct = cropBox[0] / 10;
  const leftPct = cropBox[1] / 10;
  const widthPct = Math.max(1, (cropBox[3] - cropBox[1]) / 10);
  const heightPct = Math.max(1, (cropBox[2] - cropBox[0]) / 10);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4"
      dir="rtl"
    >
      <div className="bg-white w-full h-dvh sm:h-auto sm:max-h-[95vh] sm:max-w-5xl sm:rounded-2xl shadow-2xl border-0 sm:border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Studio Header */}
        <div className="flex items-center justify-between px-3 py-2 sm:px-5 sm:py-3 border-b border-slate-200 bg-slate-50 shrink-0 gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0">
                <Crop size={14} />
              </div>
              <h3 className="text-xs sm:text-base font-bold text-slate-800 truncate">
                {displayTitle}
              </h3>
              {product?.needs_crop_adjustment && (
                <span className="hidden sm:inline-flex bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full items-center gap-1 shrink-0">
                  <AlertTriangle size={11} className="text-amber-700" />
                  يحتاج ضبط القص
                </span>
              )}
            </div>
            {displaySubtitle && (
              <p className="hidden sm:block text-[11px] text-slate-500 mt-0.5 truncate">{displaySubtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Continuous Edit History Controls: السابق (Undo) & لاحق (Redo) from start to end */}
            <div className="flex items-center bg-white border border-slate-300 rounded-xl p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={handleUndo}
                disabled={!canUndo}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 sm:py-1 rounded-lg text-[11px] sm:text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:hover:bg-transparent cursor-pointer transition-colors"
                title="رجوع السابق في التعديل (Ctrl+Z)"
              >
                <Undo2 size={14} className="text-sky-600" />
                <span className="hidden sm:inline">السابق</span>
              </button>

              <span
                className="text-[10px] font-mono font-bold text-slate-500 px-1 sm:px-1.5 border-x border-slate-200 select-none"
                title="موضع الخطوة في سجل التعديلات"
              >
                {historyMeta.index + 1}/{historyMeta.total}
              </span>

              <button
                type="button"
                onClick={handleRedo}
                disabled={!canRedo}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 sm:py-1 rounded-lg text-[11px] sm:text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:hover:bg-transparent cursor-pointer transition-colors"
                title="لاحق بعد السابق - إعادة الخطوة (Ctrl+Y)"
              >
                <span className="hidden sm:inline">لاحق</span>
                <Redo2 size={14} className="text-sky-600" />
              </button>
            </div>

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
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-[11px] sm:text-xs font-bold cursor-pointer transition-colors"
              title="رفع صورة جديدة أو بديلة للتعديل"
            >
              <Upload size={14} className="text-sky-600" />
              <span className="hidden sm:inline">{isUploading ? 'جاري التحميل...' : 'رفع / تغيير'}</span>
            </button>

            <button
              type="button"
              onClick={handleResetAll}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-[11px] sm:text-xs font-bold cursor-pointer"
              title="إعادة ضبط كافة التعديلات"
            >
              <RotateCcw size={14} />
              <span className="hidden md:inline">إعادة ضبط</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
              aria-label="إغلاق"
            >
              <X size={19} />
            </button>
          </div>
        </div>

        {/* Split Studio Body: Pinned Preview Stage + Spacious Scrollable Editing Tools */}
        <div className="flex-1 min-h-0 flex flex-col p-2 sm:p-4 gap-2 sm:gap-3.5 overflow-hidden">
          {/* Interactive Canvas Stage + Live Final Result Preview (Pinned at top, collapsible on mobile to maximize tools) */}
          <div className="shrink-0 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3.5 items-stretch">
            {/* Main Interactive Darkroom Viewport */}
            <div
              className={`sm:col-span-8 bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-800 overflow-hidden select-none relative flex flex-col ${
                mobilePreviewCollapsed
                  ? 'p-2 sm:p-3.5 items-stretch sm:items-center justify-center sm:min-h-[250px] lg:min-h-[290px]'
                  : 'p-2 sm:p-3.5 items-center justify-center min-h-[168px] sm:min-h-[250px] lg:min-h-[290px]'
              }`}
            >
              {/* Mobile Collapsed Summary Strip */}
              {mobilePreviewCollapsed && (
                <div className="flex sm:hidden items-center justify-between gap-2 w-full">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-10 h-10 rounded-lg border border-slate-700 overflow-hidden flex items-center justify-center shrink-0 bg-white"
                      style={backgroundColor === 'transparent' ? undefined : { backgroundColor }}
                    >
                      {croppedPreviewUrl ? (
                        <img src={croppedPreviewUrl} alt="" className="max-w-full max-h-full object-contain" />
                      ) : (
                        <ImageIcon size={16} className="text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">معاينة مصغّرة لتوسيع أدوات التعديل</div>
                      <div className="text-[10px] text-slate-300 font-mono">
                        {Math.round(widthPct)}% × {Math.round(heightPct)}%
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobilePreviewCollapsed(false)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600 text-white text-[11px] font-bold shrink-0 cursor-pointer"
                  >
                    <Maximize2 size={13} />
                    <span>إظهار الصورة</span>
                  </button>
                </div>
              )}

              {/* Helper hint pill + mobile collapse toggle */}
              <div
                className={`${
                  mobilePreviewCollapsed ? 'hidden sm:flex' : 'flex'
                } w-full flex-wrap items-center justify-between gap-1.5 text-[10px] sm:text-[11px] text-slate-300 mb-1.5 px-0.5`}
              >
                <span className="font-bold flex items-center gap-1.5 min-w-0 truncate">
                  {activeTab === 'crop' && (
                    <>
                      <Crop size={12} className="text-sky-400 shrink-0" />
                      <span className="truncate">اسحب الزوايا أو الحواف للقص</span>
                    </>
                  )}
                  {activeTab === 'erase' && (
                    <>
                      <Eraser size={12} className="text-amber-400 shrink-0" />
                      <span className="truncate">
                        {eraseTool === 'keep' && 'لوّن بالأخضر فوق المنتج لحمايته'}
                        {eraseTool === 'bgMark' && 'لوّن بالأحمر فوق الخلفية لإزالتها'}
                        {eraseTool === 'erase' && 'مرر لمسح أي شارة أو خلفية'}
                        {eraseTool === 'restore' && 'مرر لاستعادة الأجزاء الأصلية'}
                        {eraseTool === 'paint' && 'مرر للتلوين باللون المختار'}
                        {eraseTool === 'eyedropper' && 'انقر لالتقاط لون من الصورة'}
                      </span>
                    </>
                  )}
                  {activeTab === 'text' && (
                    <>
                      <Type size={12} className="text-sky-400 shrink-0" />
                      <span className="truncate">أضف نص WordArt وخصّص الخط والألوان والخلفية واسحبه فوق الصورة</span>
                    </>
                  )}
                  {activeTab === 'transform' && (
                    <>
                      <RotateCw size={12} className="text-sky-400 shrink-0" />
                      <span className="truncate">اضبط زاوية الميل والقلب الأفقي والرأسي</span>
                    </>
                  )}
                  {activeTab === 'adjust' && (
                    <>
                      <Sun size={12} className="text-amber-400 shrink-0" />
                      <span className="truncate">حسّن السطوع والتباين والألوان</span>
                    </>
                  )}
                </span>

                <div className="flex items-center gap-1 shrink-0">
                  {activeTab === 'erase' && (
                    <>
                      {strokes.some((s) => s.mode === 'keep' || s.mode === 'bgMark') && (
                        <button
                          type="button"
                          onClick={() => setShowMaskGuides((v) => !v)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-200 border border-slate-700 cursor-pointer"
                        >
                          {showMaskGuides ? <EyeOff size={11} /> : <Eye size={11} />}
                          <span className="hidden sm:inline">{showMaskGuides ? 'إخفاء العلامات' : 'إظهار العلامات'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          commitPatch((prev) => ({
                            ...prev,
                            backgroundColor: prev.backgroundColor === 'transparent' ? '#ffffff' : 'transparent',
                          }))
                        }
                        className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-200 border border-slate-700 cursor-pointer"
                      >
                        {backgroundColor === 'transparent' ? 'شفاف ✓' : 'شفافية'}
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setMobilePreviewCollapsed(true)}
                    className="sm:hidden flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-sky-300 border border-slate-700 cursor-pointer"
                    title="تصغير الصورة لإعطاء مساحة أكبر لقائمة التعديل"
                  >
                    <Minimize2 size={11} />
                    <span>توسيع الأدوات</span>
                  </button>
                </div>
              </div>

              <div className={mobilePreviewCollapsed ? 'hidden sm:flex sm:w-full sm:justify-center' : 'w-full flex justify-center'}>
                {!workingSourceUrl ? (
                  <div className="flex flex-col items-center justify-center py-5 sm:py-10 text-center space-y-2.5">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center border border-slate-700">
                      <ImageIcon size={26} />
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-slate-200">لا توجد صورة لهذا المنتج حالياً</p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs cursor-pointer"
                    >
                      <Upload size={15} />
                      اختر صورة من الجهاز للتعديل والقص
                    </button>
                  </div>
                ) : (
                  <div
                    ref={stageBoxRef}
                    className="relative inline-flex items-center justify-center max-w-full max-h-[150px] sm:max-h-[235px] lg:max-h-[275px] rounded-xl overflow-hidden shadow-lg"
                    style={
                      backgroundColor === 'transparent'
                        ? {
                            backgroundImage:
                              'linear-gradient(45deg, #cbd5e1 25%, transparent 25%), linear-gradient(-45deg, #cbd5e1 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #cbd5e1 75%), linear-gradient(-45deg, transparent 75%, #cbd5e1 75%)',
                            backgroundSize: '16px 16px',
                            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                            backgroundColor: '#f8fafc',
                          }
                        : { backgroundColor }
                    }
                  >
                    <canvas
                      ref={stageCanvasRef}
                      onPointerDown={handleBrushPointerDown}
                      onPointerMove={handleBrushPointerMove}
                      onPointerUp={handleBrushPointerUp}
                      onPointerCancel={handleBrushPointerUp}
                      onPointerLeave={() => setCursorPreview(null)}
                      className={`block max-w-full max-h-[150px] sm:max-h-[235px] lg:max-h-[275px] w-auto h-auto object-contain touch-none ${
                        activeTab === 'erase' ? 'cursor-crosshair' : ''
                      }`}
                    />

                    {/* Live circular brush cursor preview in Erase Mode */}
                    {activeTab === 'erase' && cursorPreview && eraseTool !== 'eyedropper' && (
                      <div
                        className="pointer-events-none absolute rounded-full border-2 shadow-sm -translate-x-1/2 -translate-y-1/2"
                        style={{
                          left: cursorPreview.x,
                          top: cursorPreview.y,
                          width: brushSize,
                          height: brushSize,
                          borderColor:
                            eraseTool === 'keep' || eraseTool === 'restore'
                              ? '#10b981'
                              : eraseTool === 'paint'
                              ? activeColor
                              : '#ef4444',
                          backgroundColor:
                            eraseTool === 'keep' || eraseTool === 'restore'
                              ? 'rgba(16,185,129,0.22)'
                              : eraseTool === 'paint'
                              ? `${activeColor}44`
                              : 'rgba(239,68,68,0.22)',
                        }}
                      />
                    )}

                    {/* Interactive Crop Overlay (Mobile Photos Style with generous 40px touch handles) */}
                    {activeTab === 'crop' && (
                      <div className="absolute inset-0 select-none touch-none" dir="ltr">
                        {/* Dark Scrim outside crop frame using 4 strips */}
                        <div
                          className="absolute left-0 right-0 top-0 bg-black/60 pointer-events-none"
                          style={{ height: `${topPct}%` }}
                        />
                        <div
                          className="absolute left-0 right-0 bottom-0 bg-black/60 pointer-events-none"
                          style={{ height: `${Math.max(0, 100 - topPct - heightPct)}%` }}
                        />
                        <div
                          className="absolute left-0 bg-black/60 pointer-events-none"
                          style={{
                            top: `${topPct}%`,
                            height: `${heightPct}%`,
                            width: `${leftPct}%`,
                          }}
                        />
                        <div
                          className="absolute right-0 bg-black/60 pointer-events-none"
                          style={{
                            top: `${topPct}%`,
                            height: `${heightPct}%`,
                            width: `${Math.max(0, 100 - leftPct - widthPct)}%`,
                          }}
                        />

                        {/* Draggable Crop Box */}
                        <div
                          onPointerDown={(e) => handleCropPointerDown(e, 'move')}
                          onPointerMove={handleCropPointerMove}
                          onPointerUp={handleCropPointerUp}
                          onPointerCancel={handleCropPointerUp}
                          className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(234,88,12,0.8)] cursor-move touch-none"
                          style={{
                            top: `${topPct}%`,
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            height: `${heightPct}%`,
                          }}
                        >
                          {/* Rule-of-Thirds 3x3 Grid */}
                          <div
                            className={`absolute inset-0 pointer-events-none transition-opacity ${
                              isDraggingCrop ? 'opacity-90' : 'opacity-45'
                            }`}
                          >
                            <div className="absolute top-1/3 left-0 right-0 h-px bg-white/70" />
                            <div className="absolute top-2/3 left-0 right-0 h-px bg-white/70" />
                            <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/70" />
                            <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/70" />
                          </div>

                          {/* 4 Corner Handles (Big 40px touch hit targets + crisp L-brackets) */}
                          <div
                            onPointerDown={(e) => handleCropPointerDown(e, 'nw')}
                            onPointerMove={handleCropPointerMove}
                            onPointerUp={handleCropPointerUp}
                            className="absolute -top-4 -left-4 w-10 h-10 flex items-center justify-center cursor-nwse-resize touch-none"
                          >
                            <span className="w-4 h-4 border-t-4 border-l-4 border-sky-500 rounded-tl-xs bg-transparent" />
                          </div>
                          <div
                            onPointerDown={(e) => handleCropPointerDown(e, 'ne')}
                            onPointerMove={handleCropPointerMove}
                            onPointerUp={handleCropPointerUp}
                            className="absolute -top-4 -right-4 w-10 h-10 flex items-center justify-center cursor-nesw-resize touch-none"
                          >
                            <span className="w-4 h-4 border-t-4 border-r-4 border-sky-500 rounded-tr-xs bg-transparent" />
                          </div>
                          <div
                            onPointerDown={(e) => handleCropPointerDown(e, 'sw')}
                            onPointerMove={handleCropPointerMove}
                            onPointerUp={handleCropPointerUp}
                            className="absolute -bottom-4 -left-4 w-10 h-10 flex items-center justify-center cursor-nesw-resize touch-none"
                          >
                            <span className="w-4 h-4 border-b-4 border-l-4 border-sky-500 rounded-bl-xs bg-transparent" />
                          </div>
                          <div
                            onPointerDown={(e) => handleCropPointerDown(e, 'se')}
                            onPointerMove={handleCropPointerMove}
                            onPointerUp={handleCropPointerUp}
                            className="absolute -bottom-4 -right-4 w-10 h-10 flex items-center justify-center cursor-nwse-resize touch-none"
                          >
                            <span className="w-4 h-4 border-b-4 border-r-4 border-sky-500 rounded-br-xs bg-transparent" />
                          </div>

                          {/* 4 Side Edge Handles */}
                          <div
                            onPointerDown={(e) => handleCropPointerDown(e, 'n')}
                            onPointerMove={handleCropPointerMove}
                            onPointerUp={handleCropPointerUp}
                            className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-12 h-7 flex items-center justify-center cursor-ns-resize touch-none"
                          >
                            <span className="w-7 h-1.5 rounded-full bg-white shadow" />
                          </div>
                          <div
                            onPointerDown={(e) => handleCropPointerDown(e, 's')}
                            onPointerMove={handleCropPointerMove}
                            onPointerUp={handleCropPointerUp}
                            className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 w-12 h-7 flex items-center justify-center cursor-ns-resize touch-none"
                          >
                            <span className="w-7 h-1.5 rounded-full bg-white shadow" />
                          </div>
                          <div
                            onPointerDown={(e) => handleCropPointerDown(e, 'w')}
                            onPointerMove={handleCropPointerMove}
                            onPointerUp={handleCropPointerUp}
                            className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-7 h-12 flex items-center justify-center cursor-ew-resize touch-none"
                          >
                            <span className="w-1.5 h-7 rounded-full bg-white shadow" />
                          </div>
                          <div
                            onPointerDown={(e) => handleCropPointerDown(e, 'e')}
                            onPointerMove={handleCropPointerMove}
                            onPointerUp={handleCropPointerUp}
                            className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-12 flex items-center justify-center cursor-ew-resize touch-none"
                          >
                            <span className="w-1.5 h-7 rounded-full bg-white shadow" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Live WordArt Text Overlay Canvas & Interactive Drag Handles (aligned to cropBox) */}
                    {(textLayers.length > 0 || activeTab === 'text') && (
                      <div
                        ref={textStageOverlayRef}
                        dir="ltr"
                        className={`absolute overflow-hidden ${
                          activeTab === 'text'
                            ? 'pointer-events-auto border border-dashed border-sky-400/75 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]'
                            : 'pointer-events-none'
                        }`}
                        style={{
                          top: `${topPct}%`,
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          height: `${heightPct}%`,
                        }}
                      >
                        <canvas
                          ref={textOverlayCanvasRef}
                          className="w-full h-full block pointer-events-none"
                        />

                        {activeTab === 'text' &&
                          textLayers.map((layer) => {
                            if (!layer.text.trim()) return null;
                            const isSelected = activeTextLayer?.id === layer.id;
                            const ovCanvas = textOverlayCanvasRef.current;
                            const cw = ovCanvas?.width || Math.max(120, baseSize.w);
                            const ch = ovCanvas?.height || Math.max(120, baseSize.h);
                            const ctx = ovCanvas?.getContext('2d');
                            let boxNormW = 0.28;
                            let boxNormH = 0.14;
                            if (ctx) {
                              const measured = measureStudioTextLayerBox(ctx, cw, ch, layer);
                              boxNormW = Math.max(0.16, Math.min(0.96, measured.boxW / cw));
                              boxNormH = Math.max(0.1, Math.min(0.88, measured.boxH / ch));
                            }
                            return (
                              <div
                                key={layer.id}
                                onPointerDown={(e) => handleTextDragStart(e, layer)}
                                onPointerMove={handleTextDragMove}
                                onPointerUp={handleTextDragEnd}
                                onPointerCancel={handleTextDragEnd}
                                style={{
                                  left: `${layer.x * 100}%`,
                                  top: `${layer.y * 100}%`,
                                  width: `${boxNormW * 100}%`,
                                  height: `${boxNormH * 100}%`,
                                  transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
                                }}
                                className={`absolute cursor-move touch-none rounded-md transition-colors ${
                                  isSelected
                                    ? 'border-2 border-dashed border-sky-400 bg-sky-400/10 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]'
                                    : 'border border-dashed border-white/40 hover:border-sky-300'
                                }`}
                                title="اسحب لتحريك النص"
                              />
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Side Result Live Card Preview (Slim strip on mobile when stage visible, hidden when collapsed so tools get max space) */}
            <div
              className={`${
                mobilePreviewCollapsed ? 'hidden sm:flex' : 'flex'
              } sm:col-span-4 bg-slate-50 rounded-xl sm:rounded-2xl border border-slate-200 p-2 sm:p-3.5 flex-row sm:flex-col items-center sm:items-stretch justify-between gap-2 sm:gap-3`}
            >
              <div className="flex sm:flex-col items-center sm:items-stretch gap-2 sm:gap-2 flex-1 min-w-0">
                <div
                  className="w-11 h-11 shrink-0 sm:w-full sm:h-auto sm:aspect-square sm:max-h-[160px] lg:max-h-[180px] sm:mx-auto sm:order-2 rounded-lg sm:rounded-xl border border-slate-200 p-1 sm:p-2 flex items-center justify-center overflow-hidden shadow-2xs"
                  style={
                    backgroundColor === 'transparent'
                      ? {
                          backgroundImage:
                            'linear-gradient(45deg, #cbd5e1 25%, transparent 25%), linear-gradient(-45deg, #cbd5e1 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #cbd5e1 75%), linear-gradient(-45deg, transparent 75%, #cbd5e1 75%)',
                          backgroundSize: '14px 14px',
                          backgroundPosition: '0 0, 0 7px, 7px -7px, -7px 0px',
                          backgroundColor: '#f8fafc',
                        }
                      : { backgroundColor }
                  }
                >
                  {croppedPreviewUrl ? (
                    <img
                      src={croppedPreviewUrl}
                      alt="Final preview"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <span className="text-[9px] sm:text-xs text-slate-400">معاينة</span>
                  )}
                </div>

                <div className="flex-1 min-w-0 sm:order-1 space-y-0.5 sm:space-y-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[11px] sm:text-xs font-bold text-slate-700 flex items-center gap-1 truncate">
                      <Sparkles size={13} className="text-sky-600 shrink-0" />
                      <span className="truncate">النتيجة في الكتالوج</span>
                    </span>
                    <span className="text-[10px] font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600 shrink-0">
                      {Math.round(widthPct)}% × {Math.round(heightPct)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 sm:hidden truncate">
                    {backgroundColor === 'transparent' ? 'خلفية شفافة PNG' : 'معاينة مطابقة للكتالوج'}
                  </p>
                </div>

                <p className="hidden sm:block sm:order-3 text-[11px] text-slate-500 text-center leading-relaxed">
                  {backgroundColor === 'transparent'
                    ? 'خلفية شفافة (PNG) جاهزة للتصدير والتركيب في الكتالوج.'
                    : 'معاينة مطابقة بلون الخلفية المختار وجاهزة للكتالوج.'}
                </p>
              </div>

              {/* Quick Remove Image Action inside preview panel */}
              {(workingSourceUrl || product?.image_url) && (
                <button
                  type="button"
                  onClick={handleConfirmRemoveImage}
                  className={`shrink-0 sm:w-full flex items-center justify-center gap-1 py-1.5 px-2.5 sm:py-2 sm:px-3 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold border transition-all cursor-pointer ${
                    confirmRemoveStep
                      ? 'bg-red-600 text-white border-red-700 shadow-xs'
                      : 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'
                  }`}
                  title="إزالة صورة المنتج"
                >
                  <Trash2 size={13} />
                  <span className="sm:hidden">{confirmRemoveStep ? 'تأكيد الحذف؟' : 'إزالة'}</span>
                  <span className="hidden sm:inline">
                    {confirmRemoveStep ? 'اضغط مرة أخرى لتأكيد إزالة الصورة نهائياً' : 'إزالة صورة المنتج'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Mobile-Style Studio Tool Tabs: Fixed Tab Bar + Spacious Scrollable Tools List */}
          <div className="flex-1 min-h-0 bg-slate-50 rounded-xl sm:rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
            {/* Pinned Tab Switcher */}
            <div className="shrink-0 p-1.5 sm:p-2.5 border-b border-slate-200/80 bg-slate-100/80">
              <div className="grid grid-cols-5 gap-1 sm:gap-1.5 bg-slate-200/70 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveTab('crop')}
                  title="قص وأبعاد"
                  className={`flex flex-col items-center justify-center gap-1 py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-bold leading-tight min-h-[44px] sm:min-h-[48px] transition-all cursor-pointer ${
                    activeTab === 'crop'
                      ? 'bg-white text-sky-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Crop size={15} className="shrink-0" />
                  <span className="whitespace-nowrap">قص</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('erase')}
                  title="ممحاة وإزالة"
                  className={`flex flex-col items-center justify-center gap-1 py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-bold leading-tight min-h-[44px] sm:min-h-[48px] transition-all cursor-pointer ${
                    activeTab === 'erase'
                      ? 'bg-white text-sky-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Eraser size={15} className="shrink-0" />
                  <span className="whitespace-nowrap">ممحاة</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('text');
                    if (textLayers.length === 0) {
                      handleAddTextLayer();
                    } else if (!selectedTextId) {
                      setSelectedTextId(textLayers[0].id);
                    }
                  }}
                  title="نص WordArt"
                  className={`flex flex-col items-center justify-center gap-1 py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-bold leading-tight min-h-[44px] sm:min-h-[48px] transition-all cursor-pointer relative ${
                    activeTab === 'text'
                      ? 'bg-white text-sky-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Type size={15} className="shrink-0" />
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span>نص</span>
                    {textLayers.length > 0 && (
                      <span className="inline-flex items-center justify-center bg-sky-600 text-white text-[9px] font-mono font-bold px-1.5 rounded-full leading-tight">
                        {textLayers.length}
                      </span>
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('transform')}
                  title="تدوير وقلب"
                  className={`flex flex-col items-center justify-center gap-1 py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-bold leading-tight min-h-[44px] sm:min-h-[48px] transition-all cursor-pointer ${
                    activeTab === 'transform'
                      ? 'bg-white text-sky-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <RotateCw size={15} className="shrink-0" />
                  <span className="whitespace-nowrap">تدوير</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('adjust')}
                  title="إضاءة وألوان"
                  className={`flex flex-col items-center justify-center gap-1 py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-bold leading-tight min-h-[44px] sm:min-h-[48px] transition-all cursor-pointer ${
                    activeTab === 'adjust'
                      ? 'bg-white text-sky-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sliders size={15} className="shrink-0" />
                  <span className="whitespace-nowrap">ألوان</span>
                </button>
              </div>
            </div>

            {/* Dedicated Scrollable Editing Tools List */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2.5 sm:p-3.5 space-y-3">
              {/* TAB 1: CROP & ASPECT */}
              {activeTab === 'crop' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <span className="block text-xs font-bold text-slate-700">نسبة القص:</span>
                    <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'free', label: 'قص حر' },
                          { id: '1:1', label: '1:1 مربع' },
                          { id: '4:3', label: '4:3' },
                          { id: '3:4', label: '3:4' },
                          { id: '16:9', label: '16:9' },
                        ] as { id: AspectPreset; label: string }[]
                      ).map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleSelectAspect(preset.id)}
                          className={`px-3 py-2 sm:py-1.5 rounded-xl sm:rounded-lg text-xs font-bold border min-h-[40px] sm:min-h-0 transition-all cursor-pointer ${
                            aspectPreset === preset.id
                              ? 'bg-sky-600 text-white border-sky-700 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        commitPatch({
                          aspectPreset: 'free',
                          cropBox: [15, 15, 985, 985],
                          zoom: 1,
                        })
                      }
                      className="px-3 py-2.5 sm:py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl sm:rounded-lg text-xs font-bold text-slate-700 min-h-[40px] sm:min-h-0 cursor-pointer"
                    >
                      كامل الصورة
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        commitPatch({
                          cropBox: [140, 140, 860, 860],
                          zoom: 1.15,
                        })
                      }
                      className="px-3 py-2.5 sm:py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl sm:rounded-lg text-xs font-bold text-slate-700 min-h-[40px] sm:min-h-0 cursor-pointer"
                    >
                      تركيز الوسط
                    </button>
                  </div>

                  {/* Zoom Slider */}
                  <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1 shrink-0">
                      <ZoomIn size={15} className="text-sky-600" />
                      تكبير:
                    </span>
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.05"
                      value={zoom}
                      onChange={(e) => handleZoomChange(Number(e.target.value))}
                      onPointerUp={commitPendingPreview}
                      onTouchEnd={commitPendingPreview}
                      onKeyUp={commitPendingPreview}
                      onBlur={commitPendingPreview}
                      className="flex-1 h-2 sm:h-1.5 accent-sky-600 cursor-pointer"
                    />
                    <span className="text-xs font-mono font-bold text-slate-700 w-12 text-center">
                      {zoom.toFixed(1)}x
                    </span>
                  </div>
                </div>
              )}

              {/* TAB 2: PRECISION BACKGROUND REMOVAL, SUBJECT/BG SELECTION, COLOR BRUSH & BACKGROUND COLOR */}
              {activeTab === 'erase' && (
                <div className="space-y-3">
                  {/* 1. Precision Background Isolation & Edge Protection */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center justify-between gap-2">
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            commitPatch((prev) => ({
                              ...prev,
                              autoBgRemove: !prev.autoBgRemove,
                            }))
                          }
                          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-xl text-xs font-bold border min-h-[42px] sm:min-h-0 transition-all cursor-pointer ${
                            autoBgRemove
                              ? 'bg-sky-600 text-white border-sky-700 shadow-xs'
                              : 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100'
                          }`}
                        >
                          <Wand2 size={14} />
                          <span>{autoBgRemove ? 'عزل تلقائي مفعّل ✓' : 'إزالة الخلفية ذكياً'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            commitPatch((prev) => ({
                              ...prev,
                              protectCenter: !prev.protectCenter,
                            }))
                          }
                          className={`flex items-center justify-center gap-1.5 px-2.5 py-2.5 sm:py-1.5 rounded-xl sm:rounded-lg text-[11px] sm:text-xs font-bold border min-h-[42px] sm:min-h-0 cursor-pointer transition-all ${
                            protectCenter
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}
                          title="يمنع تسرّب العزل إلى داخل المنتج نفسه حتى مع الألوان الفاتحة"
                        >
                          <ShieldCheck size={14} />
                          <span>{protectCenter ? 'حماية المنتج ✓' : 'حماية متوقفة'}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!autoBgRemove) commitPatch({ autoBgRemove: true });
                            setEraseTool('keep');
                          }}
                          className={`flex items-center justify-center gap-1 px-2.5 py-2.5 sm:py-1.5 rounded-xl sm:rounded-lg text-xs font-bold border min-h-[40px] sm:min-h-0 cursor-pointer ${
                            eraseTool === 'keep'
                              ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          <ShieldCheck size={14} />
                          تحديد المنتج (أخضر)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!autoBgRemove) commitPatch({ autoBgRemove: true });
                            setEraseTool('bgMark');
                          }}
                          className={`flex items-center justify-center gap-1 px-2.5 py-2.5 sm:py-1.5 rounded-xl sm:rounded-lg text-xs font-bold border min-h-[40px] sm:min-h-0 cursor-pointer ${
                            eraseTool === 'bgMark'
                              ? 'bg-red-600 text-white border-red-700 shadow-2xs'
                              : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                          }`}
                        >
                          <Eraser size={14} />
                          تحديد الخلفية (أحمر)
                        </button>
                      </div>
                    </div>

                    {(autoBgRemove ||
                      targetRemoveColors.length > 0 ||
                      strokes.some((s) => s.mode === 'bgMark' || s.mode === 'keep')) && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-bold text-slate-600 shrink-0 w-24 sm:w-auto">حساسية العزل:</span>
                          <input
                            type="range"
                            min="6"
                            max="65"
                            value={bgTolerance}
                            onChange={(e) => {
                              previewPatch({ bgTolerance: Number(e.target.value) });
                              scheduleSliderCommit();
                            }}
                            onPointerUp={commitPendingPreview}
                            onTouchEnd={commitPendingPreview}
                            onKeyUp={commitPendingPreview}
                            onBlur={commitPendingPreview}
                            className="flex-1 h-2 sm:h-1.5 accent-sky-600 cursor-pointer"
                          />
                          <span className="text-xs font-mono font-bold text-slate-700 w-7 text-center">
                            {bgTolerance}
                          </span>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-bold text-slate-600 shrink-0 w-24 sm:w-auto">حماية الحواف:</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={edgeProtection}
                            onChange={(e) => {
                              previewPatch({ edgeProtection: Number(e.target.value) });
                              scheduleSliderCommit();
                            }}
                            onPointerUp={commitPendingPreview}
                            onTouchEnd={commitPendingPreview}
                            onKeyUp={commitPendingPreview}
                            onBlur={commitPendingPreview}
                            className="flex-1 h-2 sm:h-1.5 accent-emerald-600 cursor-pointer"
                          />
                          <span className="text-xs font-mono font-bold text-slate-700 w-9 text-center">
                            {edgeProtection}%
                          </span>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-bold text-slate-600 shrink-0 w-24 sm:w-auto">تنعيم الحافة:</span>
                          <input
                            type="range"
                            min="0"
                            max="4"
                            step="1"
                            value={bgFeather}
                            onChange={(e) => {
                              previewPatch({ bgFeather: Number(e.target.value) });
                              scheduleSliderCommit();
                            }}
                            onPointerUp={commitPendingPreview}
                            onTouchEnd={commitPendingPreview}
                            onKeyUp={commitPendingPreview}
                            onBlur={commitPendingPreview}
                            className="flex-1 h-2 sm:h-1.5 accent-sky-600 cursor-pointer"
                          />
                          <span className="text-xs font-mono font-bold text-slate-700 w-6 text-center">
                            {bgFeather}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. Manual Tools, Colored Brush & Eyedropper */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-3">
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEraseTool('erase')}
                          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded-xl sm:rounded-lg text-xs font-bold border min-h-[40px] sm:min-h-0 cursor-pointer ${
                            eraseTool === 'erase'
                              ? 'bg-red-600 text-white border-red-700'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Eraser size={14} />
                          ممحاة يدوية
                        </button>

                        <button
                          type="button"
                          onClick={() => setEraseTool('restore')}
                          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded-xl sm:rounded-lg text-xs font-bold border min-h-[40px] sm:min-h-0 cursor-pointer ${
                            eraseTool === 'restore'
                              ? 'bg-emerald-600 text-white border-emerald-700'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Paintbrush size={14} />
                          استعادة الأصل
                        </button>

                        <button
                          type="button"
                          onClick={() => setEraseTool('paint')}
                          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded-xl sm:rounded-lg text-xs font-bold border min-h-[40px] sm:min-h-0 cursor-pointer ${
                            eraseTool === 'paint'
                              ? 'bg-sky-600 text-white border-sky-700'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Palette size={14} />
                          فرشاة بالألوان
                        </button>

                        <button
                          type="button"
                          onClick={() => setEraseTool('eyedropper')}
                          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded-xl sm:rounded-lg text-xs font-bold border min-h-[40px] sm:min-h-0 cursor-pointer ${
                            eraseTool === 'eyedropper'
                              ? 'bg-amber-600 text-white border-amber-700'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Pipette size={14} />
                          قطارة من الصورة
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleUndo}
                          disabled={!canUndo}
                          className="flex items-center gap-1 px-3 py-2 sm:py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl sm:rounded-lg text-xs font-bold cursor-pointer disabled:opacity-40"
                          title="رجوع السابق"
                        >
                          <Undo2 size={14} />
                          السابق
                        </button>
                        <button
                          type="button"
                          onClick={handleRedo}
                          disabled={!canRedo}
                          className="flex items-center gap-1 px-3 py-2 sm:py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl sm:rounded-lg text-xs font-bold cursor-pointer disabled:opacity-40"
                          title="لاحق بعد السابق"
                        >
                          لاحق
                          <Redo2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => commitPatch({ strokes: [], targetRemoveColors: [] })}
                          disabled={strokes.length === 0 && targetRemoveColors.length === 0}
                          className="mr-auto px-3 py-2 sm:py-1.5 bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-700 rounded-xl sm:rounded-lg text-xs font-bold cursor-pointer disabled:opacity-40"
                        >
                          مسح التعديلات
                        </button>
                      </div>
                    </div>

                    {/* Brush Size & Paint Opacity / Eyedropper Action */}
                    <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
                      {eraseTool !== 'eyedropper' ? (
                        <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
                          <span className="text-xs font-bold text-slate-600 shrink-0">حجم الفرشاة:</span>
                          <input
                            type="range"
                            min="8"
                            max="76"
                            value={brushSize}
                            onChange={(e) => setBrushSize(Number(e.target.value))}
                            className="flex-1 h-2 sm:h-1.5 accent-sky-600 cursor-pointer"
                          />
                          <span className="text-xs font-mono font-bold text-slate-700 w-8 text-center">
                            {brushSize}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2 flex-1">
                          <span className="text-xs font-bold text-slate-600 ml-1">عند النقر بالقطارة:</span>
                          {(
                            [
                              { id: 'removeColor', label: 'إزالة هذا اللون' },
                              { id: 'setBgColor', label: 'تعيينه لون الخلفية' },
                              { id: 'setPaintColor', label: 'التلوين به' },
                            ] as { id: DropperAction; label: string }[]
                          ).map((act) => (
                            <button
                              key={act.id}
                              type="button"
                              onClick={() => setDropperAction(act.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                                dropperAction === act.id
                                  ? 'bg-amber-600 text-white border-amber-700'
                                  : 'bg-slate-50 text-slate-700 border-slate-200'
                              }`}
                            >
                              {act.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {eraseTool === 'paint' && (
                        <div className="flex items-center gap-2.5 min-w-[180px] w-full sm:w-auto">
                          <span className="text-xs font-bold text-slate-600 shrink-0">الشفافية:</span>
                          <input
                            type="range"
                            min="15"
                            max="100"
                            value={paintOpacity}
                            onChange={(e) => setPaintOpacity(Number(e.target.value))}
                            className="flex-1 sm:w-28 h-2 sm:h-1.5 accent-sky-600 cursor-pointer"
                          />
                          <span className="text-xs font-mono font-bold text-slate-700 w-9 text-center">
                            {paintOpacity}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Color Palette Row inside Eraser & Remove Tab */}
                    <div className="space-y-2.5 pt-2 border-t border-slate-100">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-600 ml-1">لوحة الألوان:</span>
                        {BRUSH_COLOR_PALETTE.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => setActiveColor(hex)}
                            className={`w-8 h-8 sm:w-7 sm:h-7 rounded-full border-2 transition-transform cursor-pointer ${
                              activeColor.toLowerCase() === hex.toLowerCase()
                                ? 'border-sky-600 scale-110 ring-2 ring-sky-200'
                                : 'border-slate-300'
                            }`}
                            style={{ backgroundColor: hex }}
                            title={hex}
                          />
                        ))}
                        <label
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
                          title="اختيار أي لون مخصص"
                        >
                          <input
                            type="color"
                            value={activeColor}
                            onChange={(e) => setActiveColor(e.target.value)}
                            className="w-5 h-5 p-0 border-0 rounded cursor-pointer bg-transparent"
                          />
                          <span>مخصص</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEraseTool('paint')}
                          className="px-3 py-2 sm:py-1.5 rounded-xl sm:rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-xs font-bold cursor-pointer"
                        >
                          تلوين باللون المختار
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            commitPatch((prev) => ({
                              ...prev,
                              targetRemoveColors: prev.targetRemoveColors.includes(activeColor)
                                ? prev.targetRemoveColors
                                : [...prev.targetRemoveColors, activeColor],
                            }));
                            toast.success(`تمت إضافة اللون (${activeColor}) لقائمة الإزالة`);
                          }}
                          className="px-3 py-2 sm:py-1.5 rounded-xl sm:rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold cursor-pointer"
                        >
                          إزالة هذا اللون
                        </button>
                      </div>
                    </div>

                    {/* Active Target Removed Colors Chips */}
                    {targetRemoveColors.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-xs font-bold text-slate-500">ألوان يتم إزالتها:</span>
                        {targetRemoveColors.map((hex) => (
                          <span
                            key={hex}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-mono text-slate-700"
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-slate-300"
                              style={{ backgroundColor: hex }}
                            />
                            {hex}
                            <button
                              type="button"
                              onClick={() =>
                                commitPatch((prev) => ({
                                  ...prev,
                                  targetRemoveColors: prev.targetRemoveColors.filter((c) => c !== hex),
                                }))
                              }
                              className="text-slate-400 hover:text-red-600 cursor-pointer p-0.5"
                              aria-label="إلغاء إزالة اللون"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 3. Custom Final Background Color Picker ("لون الخلفية اللي أنا عايزها") */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2.5">
                    <span className="block text-xs font-bold text-slate-700">لون الخلفية النهائية:</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {BG_COLOR_PRESETS.map((preset) => {
                        const selected = backgroundColor.toLowerCase() === preset.value.toLowerCase();
                        const isTrans = preset.value === 'transparent';
                        return (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => commitPatch({ backgroundColor: preset.value })}
                            className={`flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl sm:rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              selected
                                ? 'border-sky-600 ring-2 ring-sky-200 bg-sky-50 text-sky-900'
                                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <span
                              className="w-4 h-4 rounded-sm border border-slate-300 shrink-0"
                              style={
                                isTrans
                                  ? {
                                      backgroundImage:
                                        'linear-gradient(45deg, #cbd5e1 25%, transparent 25%), linear-gradient(-45deg, #cbd5e1 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #cbd5e1 75%), linear-gradient(-45deg, transparent 75%, #cbd5e1 75%)',
                                      backgroundSize: '8px 8px',
                                      backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                                      backgroundColor: '#ffffff',
                                    }
                                  : { backgroundColor: preset.value }
                              }
                            />
                            <span>{preset.label}</span>
                          </button>
                        );
                      })}

                      <label className="flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl sm:rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-bold text-slate-800 cursor-pointer">
                        <input
                          type="color"
                          value={backgroundColor === 'transparent' ? '#ffffff' : backgroundColor}
                          onChange={(e) => {
                            previewPatch({ backgroundColor: e.target.value });
                            scheduleSliderCommit();
                          }}
                          onBlur={commitPendingPreview}
                          className="w-5 h-5 p-0 border-0 rounded cursor-pointer bg-transparent"
                        />
                        <span>أي لون مخصص</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: WORDART RICH TEXT STUDIO (مثل الوورد: نوع الخط، لون واحد/متعدد، حدود، ظل، خلفية) */}
              {activeTab === 'text' && (
                <div className="space-y-3">
                  {/* Text Layers Bar & Add Button */}
                  <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleAddTextLayer()}
                        className="flex items-center gap-1 px-3 py-2 sm:py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl sm:rounded-lg text-xs font-bold cursor-pointer shadow-2xs shrink-0"
                      >
                        <Plus size={14} />
                        <span>إضافة نص</span>
                      </button>

                      {textLayers.map((layer, idx) => {
                        const isSelected = activeTextLayer?.id === layer.id;
                        const label = layer.text.trim() || `نص ${idx + 1}`;
                        return (
                          <button
                            key={layer.id}
                            type="button"
                            onClick={() => setSelectedTextId(layer.id)}
                            className={`max-w-[135px] truncate px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-sky-50 text-sky-800 border-sky-400 ring-1 ring-sky-200'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                            title={label}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {activeTextLayer && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDuplicateTextLayer(activeTextLayer)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                          title="تكرار هذا النص"
                        >
                          <Copy size={13} />
                          <span className="hidden sm:inline">تكرار</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTextLayer(activeTextLayer.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold cursor-pointer"
                          title="حذف هذا النص"
                        >
                          <Trash2 size={13} />
                          <span className="hidden sm:inline">حذف</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {!activeTextLayer ? (
                    <div className="bg-white p-5 rounded-xl border border-slate-200 text-center space-y-3">
                      <p className="text-xs font-bold text-slate-600">
                        أضف نصاً احترافياً على الصورة مثل WordArt (خصم، سعر، عرض، علامة مائية...)
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddTextLayer({ text: 'خصم 20%' })}
                          className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer"
                        >
                          + نص متدرج ملون
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleAddTextLayer({
                              text: 'عرض خاص',
                              ...WORDART_PRESETS[4].patch,
                            })
                          }
                          className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold cursor-pointer"
                        >
                          + شارة خصم بخلفية
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* 1. Text Content & WordArt Presets */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-700">محتوى النص:</span>
                            <div className="flex flex-wrap items-center gap-1">
                              {['خصم 20%', 'جديد 🔥', 'أصلي 100%', 'عرض خاص'].map((snippet) => (
                                <button
                                  key={snippet}
                                  type="button"
                                  onClick={() => updateTextLayer(activeTextLayer.id, { text: snippet }, true)}
                                  className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-sky-50 text-[10px] font-bold text-slate-600 hover:text-sky-700 border border-slate-200 cursor-pointer"
                                >
                                  {snippet}
                                </button>
                              ))}
                            </div>
                          </div>
                          <textarea
                            rows={2}
                            value={activeTextLayer.text}
                            onChange={(e) => updateTextLayer(activeTextLayer.id, { text: e.target.value })}
                            onBlur={commitPendingPreview}
                            placeholder="اكتب النص هنا... (يمكنك كتابة أكثر من سطر)"
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                          />
                        </div>

                        {/* WordArt Style Gallery (مثل WordArt في الوورد) */}
                        <div className="space-y-1.5">
                          <span className="block text-xs font-bold text-slate-700">
                            قوالب WordArt جاهزة (بضغطة واحدة):
                          </span>
                          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                            {WORDART_PRESETS.map((preset) => {
                              const grad = preset.patch.gradientColors;
                              const isBgBadge = preset.patch.bgMode && preset.patch.bgMode !== 'none';
                              const previewBg =
                                preset.patch.bgMode === 'gradient' && preset.patch.bgGradientColors
                                  ? `linear-gradient(135deg, ${preset.patch.bgGradientColors.join(', ')})`
                                  : preset.patch.bgMode === 'solid'
                                    ? preset.patch.bgColor
                                    : undefined;
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() => updateTextLayer(activeTextLayer.id, preset.patch, true)}
                                  className="flex flex-col items-center justify-center p-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:border-sky-400 hover:bg-sky-50/40 transition-all cursor-pointer gap-1"
                                  title={preset.label}
                                >
                                  <div
                                    className="w-full py-1 rounded-lg flex items-center justify-center"
                                    style={{
                                      background: previewBg || '#1e293b',
                                    }}
                                  >
                                    <span
                                      className="text-sm font-black leading-none px-1"
                                      style={{
                                        fontFamily: preset.patch.fontFamily || 'Cairo',
                                        color: isBgBadge
                                          ? preset.patch.color || '#fbbf24'
                                          : grad
                                            ? 'transparent'
                                            : preset.patch.color || '#ffffff',
                                        backgroundImage:
                                          !isBgBadge && grad
                                            ? `linear-gradient(135deg, ${grad.join(', ')})`
                                            : undefined,
                                        WebkitBackgroundClip: !isBgBadge && grad ? 'text' : undefined,
                                        backgroundClip: !isBgBadge && grad ? 'text' : undefined,
                                      }}
                                    >
                                      أبجد
                                    </span>
                                  </div>
                                  <span className="text-[9px] font-bold text-slate-600 truncate w-full text-center">
                                    {preset.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* 2. Font Family & Typography Formatting */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-3">
                        <div className="space-y-1.5">
                          <span className="block text-xs font-bold text-slate-700">نوع الخط:</span>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                            {STUDIO_FONT_OPTIONS.map((font) => {
                              const active = activeTextLayer.fontFamily === font.id;
                              return (
                                <button
                                  key={font.id}
                                  type="button"
                                  onClick={() =>
                                    updateTextLayer(activeTextLayer.id, { fontFamily: font.id }, true)
                                  }
                                  className={`px-2 py-1.5 rounded-xl border text-right transition-all cursor-pointer ${
                                    active
                                      ? 'bg-sky-50 border-sky-500 text-sky-800 ring-1 ring-sky-200'
                                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  <div
                                    className="text-xs font-bold truncate"
                                    style={{ fontFamily: `"${font.id}", "Cairo", sans-serif` }}
                                  >
                                    {font.sample}
                                  </div>
                                  <div className="text-[9px] text-slate-500 truncate">{font.label}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Weight, Italic, Underline & Sliders */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                          <span className="text-xs font-bold text-slate-600 ml-1">التنسيق:</span>
                          {(
                            [
                              { id: 'normal', label: 'عادي' },
                              { id: 'bold', label: 'عريض' },
                              { id: '900', label: 'سميك جداً' },
                            ] as { id: StudioTextLayer['fontWeight']; label: string }[]
                          ).map((w) => (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() =>
                                updateTextLayer(activeTextLayer.id, { fontWeight: w.id }, true)
                              }
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer flex items-center gap-1 ${
                                activeTextLayer.fontWeight === w.id
                                  ? 'bg-sky-600 text-white border-sky-700'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {w.id !== 'normal' && <Bold size={12} />}
                              <span>{w.label}</span>
                            </button>
                          ))}

                          <button
                            type="button"
                            onClick={() =>
                              updateTextLayer(
                                activeTextLayer.id,
                                { italic: !activeTextLayer.italic },
                                true
                              )
                            }
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer flex items-center gap-1 ${
                              activeTextLayer.italic
                                ? 'bg-sky-600 text-white border-sky-700'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                            title="مائل"
                          >
                            <Italic size={13} />
                            <span>مائل</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              updateTextLayer(
                                activeTextLayer.id,
                                { underline: !activeTextLayer.underline },
                                true
                              )
                            }
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer flex items-center gap-1 ${
                              activeTextLayer.underline
                                ? 'bg-sky-600 text-white border-sky-700'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                            title="تسطير أسفل النص"
                          >
                            <Underline size={13} />
                            <span>تحته خط</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-600 shrink-0">الحجم:</span>
                            <input
                              type="range"
                              min="5"
                              max="28"
                              step="0.5"
                              value={activeTextLayer.fontSizePct}
                              onChange={(e) =>
                                updateTextLayer(activeTextLayer.id, {
                                  fontSizePct: Number(e.target.value),
                                })
                              }
                              onPointerUp={commitPendingPreview}
                              onTouchEnd={commitPendingPreview}
                              className="flex-1 h-2 sm:h-1.5 accent-sky-600 cursor-pointer"
                            />
                            <span className="text-xs font-mono font-bold text-slate-700 w-9 text-center">
                              {Math.round(activeTextLayer.fontSizePct)}%
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-600 shrink-0">الدوران:</span>
                            <input
                              type="range"
                              min="-180"
                              max="180"
                              step="1"
                              value={activeTextLayer.rotation}
                              onChange={(e) =>
                                updateTextLayer(activeTextLayer.id, {
                                  rotation: Number(e.target.value),
                                })
                              }
                              onPointerUp={commitPendingPreview}
                              onTouchEnd={commitPendingPreview}
                              className="flex-1 h-2 sm:h-1.5 accent-sky-600 cursor-pointer"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateTextLayer(activeTextLayer.id, { rotation: 0 }, true)
                              }
                              className="text-xs font-mono font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 cursor-pointer min-w-[38px]"
                              title="إرجاع الدوران إلى 0°"
                            >
                              {activeTextLayer.rotation}°
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-600 shrink-0">الشفافية:</span>
                            <input
                              type="range"
                              min="15"
                              max="100"
                              step="1"
                              value={activeTextLayer.opacity}
                              onChange={(e) =>
                                updateTextLayer(activeTextLayer.id, {
                                  opacity: Number(e.target.value),
                                })
                              }
                              onPointerUp={commitPendingPreview}
                              onTouchEnd={commitPendingPreview}
                              className="flex-1 h-2 sm:h-1.5 accent-sky-600 cursor-pointer"
                            />
                            <span className="text-xs font-mono font-bold text-slate-700 w-9 text-center">
                              {activeTextLayer.opacity}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 3. Text Fill Color: Solid vs Multi-Color Gradient (لون واحد / لون متعدد) */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-700">لون النص:</span>
                          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                            <button
                              type="button"
                              onClick={() =>
                                updateTextLayer(activeTextLayer.id, { colorMode: 'solid' }, true)
                              }
                              className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                                activeTextLayer.colorMode === 'solid'
                                  ? 'bg-white text-sky-700 shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              لون واحد
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateTextLayer(activeTextLayer.id, { colorMode: 'gradient' }, true)
                              }
                              className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                                activeTextLayer.colorMode === 'gradient'
                                  ? 'bg-white text-sky-700 shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              لون متعدد (تدرج)
                            </button>
                          </div>
                        </div>

                        {activeTextLayer.colorMode === 'solid' ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {BRUSH_COLOR_PALETTE.map((hex) => (
                              <button
                                key={hex}
                                type="button"
                                onClick={() =>
                                  updateTextLayer(activeTextLayer.id, { color: hex }, true)
                                }
                                className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                                  activeTextLayer.color.toLowerCase() === hex.toLowerCase()
                                    ? 'border-sky-600 scale-110 ring-2 ring-sky-200'
                                    : 'border-slate-300'
                                }`}
                                style={{ backgroundColor: hex }}
                                title={hex}
                              />
                            ))}
                            <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer">
                              <input
                                type="color"
                                value={activeTextLayer.color}
                                onChange={(e) =>
                                  updateTextLayer(activeTextLayer.id, { color: e.target.value })
                                }
                                onBlur={commitPendingPreview}
                                className="w-5 h-5 p-0 border-0 rounded cursor-pointer bg-transparent"
                              />
                              <span>مخصص</span>
                            </label>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {/* Multi-color gradient presets */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              {MULTI_COLOR_GRADIENTS.map((g) => (
                                <button
                                  key={g.label}
                                  type="button"
                                  onClick={() =>
                                    updateTextLayer(
                                      activeTextLayer.id,
                                      { gradientColors: [...g.colors] },
                                      true
                                    )
                                  }
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:border-sky-400 text-[11px] font-bold text-slate-700 cursor-pointer"
                                >
                                  <span
                                    className="w-5 h-3.5 rounded-sm border border-black/15 shrink-0"
                                    style={{
                                      backgroundImage: `linear-gradient(90deg, ${g.colors.join(', ')})`,
                                    }}
                                  />
                                  <span>{g.label}</span>
                                </button>
                              ))}
                            </div>

                            {/* Individual gradient stops + direction */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                              <div className="flex flex-wrap items-center gap-2">
                                {activeTextLayer.gradientColors.map((col, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 border border-slate-200"
                                  >
                                    <input
                                      type="color"
                                      value={col}
                                      onChange={(e) => {
                                        const nextCols = [...activeTextLayer.gradientColors];
                                        nextCols[idx] = e.target.value;
                                        updateTextLayer(activeTextLayer.id, {
                                          gradientColors: nextCols,
                                        });
                                      }}
                                      onBlur={commitPendingPreview}
                                      className="w-5 h-5 p-0 border-0 rounded cursor-pointer bg-transparent"
                                    />
                                    <span className="text-[11px] font-bold text-slate-700">
                                      لون {idx + 1}
                                    </span>
                                    {activeTextLayer.gradientColors.length > 2 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const nextCols = activeTextLayer.gradientColors.filter(
                                            (_, cIdx) => cIdx !== idx
                                          );
                                          updateTextLayer(
                                            activeTextLayer.id,
                                            { gradientColors: nextCols },
                                            true
                                          );
                                        }}
                                        className="text-slate-400 hover:text-red-600 cursor-pointer"
                                        title="حذف اللون"
                                      >
                                        <X size={12} />
                                      </button>
                                    )}
                                  </div>
                                ))}

                                {activeTextLayer.gradientColors.length < 4 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateTextLayer(
                                        activeTextLayer.id,
                                        {
                                          gradientColors: [
                                            ...activeTextLayer.gradientColors,
                                            '#06b6d4',
                                          ],
                                        },
                                        true
                                      )
                                    }
                                    className="px-2 py-1 rounded-lg border border-dashed border-sky-400 text-[11px] font-bold text-sky-700 hover:bg-sky-50 cursor-pointer"
                                  >
                                    + إضافة لون
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                {(
                                  [
                                    { id: 'horizontal', label: 'أفقي ↔' },
                                    { id: 'vertical', label: 'عمودي ↕' },
                                    { id: 'diagonal', label: 'مائل ↗' },
                                  ] as { id: StudioTextLayer['gradientDirection']; label: string }[]
                                ).map((dir) => (
                                  <button
                                    key={dir.id}
                                    type="button"
                                    onClick={() =>
                                      updateTextLayer(
                                        activeTextLayer.id,
                                        { gradientDirection: dir.id },
                                        true
                                      )
                                    }
                                    className={`px-2 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                                      activeTextLayer.gradientDirection === dir.id
                                        ? 'bg-sky-600 text-white border-sky-700'
                                        : 'bg-slate-50 text-slate-700 border-slate-200'
                                    }`}
                                  >
                                    {dir.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 4. WordArt Outline & Drop Shadow */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Outline / Stroke */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  updateTextLayer(
                                    activeTextLayer.id,
                                    { strokeEnabled: !activeTextLayer.strokeEnabled },
                                    true
                                  )
                                }
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                                  activeTextLayer.strokeEnabled
                                    ? 'bg-sky-600 text-white border-sky-700'
                                    : 'bg-slate-50 text-slate-700 border-slate-200'
                                }`}
                              >
                                {activeTextLayer.strokeEnabled
                                  ? 'حدود خارجية مفعّلة ✓'
                                  : 'إضافة حدود للنص'}
                              </button>

                              {activeTextLayer.strokeEnabled && (
                                <label className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer">
                                  <input
                                    type="color"
                                    value={activeTextLayer.strokeColor}
                                    onChange={(e) =>
                                      updateTextLayer(activeTextLayer.id, {
                                        strokeColor: e.target.value,
                                      })
                                    }
                                    onBlur={commitPendingPreview}
                                    className="w-4 h-4 p-0 border-0 rounded cursor-pointer bg-transparent"
                                  />
                                  <span>لون الإطار</span>
                                </label>
                              )}
                            </div>

                            {activeTextLayer.strokeEnabled && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-600 shrink-0">
                                  سمك الإطار:
                                </span>
                                <input
                                  type="range"
                                  min="1"
                                  max="12"
                                  step="1"
                                  value={activeTextLayer.strokeWidth}
                                  onChange={(e) =>
                                    updateTextLayer(activeTextLayer.id, {
                                      strokeWidth: Number(e.target.value),
                                    })
                                  }
                                  onPointerUp={commitPendingPreview}
                                  onTouchEnd={commitPendingPreview}
                                  className="flex-1 h-2 sm:h-1.5 accent-sky-600 cursor-pointer"
                                />
                                <span className="text-xs font-mono font-bold text-slate-700 w-6 text-center">
                                  {activeTextLayer.strokeWidth}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Shadow */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  updateTextLayer(
                                    activeTextLayer.id,
                                    { shadowEnabled: !activeTextLayer.shadowEnabled },
                                    true
                                  )
                                }
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                                  activeTextLayer.shadowEnabled
                                    ? 'bg-sky-600 text-white border-sky-700'
                                    : 'bg-slate-50 text-slate-700 border-slate-200'
                                }`}
                              >
                                {activeTextLayer.shadowEnabled ? 'ظل النص مفعّل ✓' : 'إضافة ظل للنص'}
                              </button>

                              {activeTextLayer.shadowEnabled && (
                                <label className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer">
                                  <input
                                    type="color"
                                    value={
                                      activeTextLayer.shadowColor.startsWith('#')
                                        ? activeTextLayer.shadowColor
                                        : '#0f172a'
                                    }
                                    onChange={(e) =>
                                      updateTextLayer(activeTextLayer.id, {
                                        shadowColor: e.target.value,
                                      })
                                    }
                                    onBlur={commitPendingPreview}
                                    className="w-4 h-4 p-0 border-0 rounded cursor-pointer bg-transparent"
                                  />
                                  <span>لون الظل</span>
                                </label>
                              )}
                            </div>

                            {activeTextLayer.shadowEnabled && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-600 shrink-0">
                                  نعومة الظل:
                                </span>
                                <input
                                  type="range"
                                  min="0"
                                  max="22"
                                  step="1"
                                  value={activeTextLayer.shadowBlur}
                                  onChange={(e) =>
                                    updateTextLayer(activeTextLayer.id, {
                                      shadowBlur: Number(e.target.value),
                                    })
                                  }
                                  onPointerUp={commitPendingPreview}
                                  onTouchEnd={commitPendingPreview}
                                  className="flex-1 h-2 sm:h-1.5 accent-sky-600 cursor-pointer"
                                />
                                <span className="text-xs font-mono font-bold text-slate-700 w-6 text-center">
                                  {activeTextLayer.shadowBlur}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 5. Text Background Box (خلفية النص: بدون / لون واحد / لون متعدد) */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-700">خلفية النص:</span>
                          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                            {(
                              [
                                { id: 'none', label: 'بدون خلفية' },
                                { id: 'solid', label: 'لون واحد' },
                                { id: 'gradient', label: 'لون متعدد' },
                              ] as { id: StudioTextLayer['bgMode']; label: string }[]
                            ).map((mode) => (
                              <button
                                key={mode.id}
                                type="button"
                                onClick={() =>
                                  updateTextLayer(activeTextLayer.id, { bgMode: mode.id }, true)
                                }
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                                  activeTextLayer.bgMode === mode.id
                                    ? 'bg-white text-sky-700 shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                {mode.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {activeTextLayer.bgMode !== 'none' && (
                          <div className="space-y-2.5 pt-2 border-t border-slate-100">
                            {/* Background colors */}
                            {activeTextLayer.bgMode === 'solid' ? (
                              <div className="flex flex-wrap items-center gap-2">
                                {BRUSH_COLOR_PALETTE.map((hex) => (
                                  <button
                                    key={hex}
                                    type="button"
                                    onClick={() =>
                                      updateTextLayer(activeTextLayer.id, { bgColor: hex }, true)
                                    }
                                    className={`w-7 h-7 rounded-full border-2 cursor-pointer ${
                                      activeTextLayer.bgColor.toLowerCase() === hex.toLowerCase()
                                        ? 'border-sky-600 scale-110 ring-2 ring-sky-200'
                                        : 'border-slate-300'
                                    }`}
                                    style={{ backgroundColor: hex }}
                                    title={hex}
                                  />
                                ))}
                                <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer">
                                  <input
                                    type="color"
                                    value={activeTextLayer.bgColor}
                                    onChange={(e) =>
                                      updateTextLayer(activeTextLayer.id, {
                                        bgColor: e.target.value,
                                      })
                                    }
                                    onBlur={commitPendingPreview}
                                    className="w-5 h-5 p-0 border-0 rounded cursor-pointer bg-transparent"
                                  />
                                  <span>لون مخصص</span>
                                </label>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                {activeTextLayer.bgGradientColors.map((col, idx) => (
                                  <label
                                    key={idx}
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
                                  >
                                    <input
                                      type="color"
                                      value={col}
                                      onChange={(e) => {
                                        const nextCols = [...activeTextLayer.bgGradientColors];
                                        nextCols[idx] = e.target.value;
                                        updateTextLayer(activeTextLayer.id, {
                                          bgGradientColors: nextCols,
                                        });
                                      }}
                                      onBlur={commitPendingPreview}
                                      className="w-4 h-4 p-0 border-0 rounded cursor-pointer bg-transparent"
                                    />
                                    <span>خلفية {idx + 1}</span>
                                  </label>
                                ))}
                                {MULTI_COLOR_GRADIENTS.slice(0, 4).map((g) => (
                                  <button
                                    key={g.label}
                                    type="button"
                                    onClick={() =>
                                      updateTextLayer(
                                        activeTextLayer.id,
                                        { bgGradientColors: [...g.colors] },
                                        true
                                      )
                                    }
                                    className="w-7 h-7 rounded-lg border border-slate-300 cursor-pointer"
                                    style={{
                                      backgroundImage: `linear-gradient(135deg, ${g.colors.join(', ')})`,
                                    }}
                                    title={g.label}
                                  />
                                ))}
                              </div>
                            )}

                            {/* Background shape, padding, opacity & border */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-600 ml-1">الشكل:</span>
                              {(
                                [
                                  { id: 'rounded', label: 'حواف ناعمة' },
                                  { id: 'pill', label: 'كبسولة دائرية' },
                                  { id: 'sharp', label: 'مستطيل حاد' },
                                ] as { id: StudioTextLayer['bgShape']; label: string }[]
                              ).map((sh) => (
                                <button
                                  key={sh.id}
                                  type="button"
                                  onClick={() =>
                                    updateTextLayer(activeTextLayer.id, { bgShape: sh.id }, true)
                                  }
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                                    activeTextLayer.bgShape === sh.id
                                      ? 'bg-sky-600 text-white border-sky-700'
                                      : 'bg-slate-50 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  {sh.label}
                                </button>
                              ))}

                              <button
                                type="button"
                                onClick={() =>
                                  updateTextLayer(
                                    activeTextLayer.id,
                                    { bgBorderEnabled: !activeTextLayer.bgBorderEnabled },
                                    true
                                  )
                                }
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer mr-auto ${
                                  activeTextLayer.bgBorderEnabled
                                    ? 'bg-sky-50 text-sky-800 border-sky-400'
                                    : 'bg-slate-50 text-slate-600 border-slate-200'
                                }`}
                              >
                                {activeTextLayer.bgBorderEnabled ? 'إطار الخلفية ✓' : '+ إطار للخلفية'}
                              </button>

                              {activeTextLayer.bgBorderEnabled && (
                                <input
                                  type="color"
                                  value={activeTextLayer.bgBorderColor}
                                  onChange={(e) =>
                                    updateTextLayer(activeTextLayer.id, {
                                      bgBorderColor: e.target.value,
                                    })
                                  }
                                  onBlur={commitPendingPreview}
                                  className="w-6 h-6 p-0 border border-slate-300 rounded cursor-pointer bg-transparent"
                                  title="لون إطار الخلفية"
                                />
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-600 shrink-0">
                                  شفافية الخلفية:
                                </span>
                                <input
                                  type="range"
                                  min="15"
                                  max="100"
                                  value={activeTextLayer.bgOpacity}
                                  onChange={(e) =>
                                    updateTextLayer(activeTextLayer.id, {
                                      bgOpacity: Number(e.target.value),
                                    })
                                  }
                                  onPointerUp={commitPendingPreview}
                                  onTouchEnd={commitPendingPreview}
                                  className="flex-1 h-2 sm:h-1.5 accent-sky-600 cursor-pointer"
                                />
                                <span className="text-xs font-mono font-bold text-slate-700 w-9 text-center">
                                  {activeTextLayer.bgOpacity}%
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-600 shrink-0">
                                  اتساع الخلفية:
                                </span>
                                <input
                                  type="range"
                                  min="4"
                                  max="30"
                                  value={activeTextLayer.bgPadding}
                                  onChange={(e) =>
                                    updateTextLayer(activeTextLayer.id, {
                                      bgPadding: Number(e.target.value),
                                    })
                                  }
                                  onPointerUp={commitPendingPreview}
                                  onTouchEnd={commitPendingPreview}
                                  className="flex-1 h-2 sm:h-1.5 accent-sky-600 cursor-pointer"
                                />
                                <span className="text-xs font-mono font-bold text-slate-700 w-7 text-center">
                                  {activeTextLayer.bgPadding}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 6. Quick Placement Helpers */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                            <Move size={13} className="text-sky-600" />
                            موضع سريع (أو اسحب النص مباشرة فوق الصورة):
                          </span>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-7 gap-1.5">
                          {[
                            { label: 'أعلى يمين', x: 0.78, y: 0.16 },
                            { label: 'أعلى وسط', x: 0.5, y: 0.16 },
                            { label: 'أعلى يسار', x: 0.22, y: 0.16 },
                            { label: 'المنتصف', x: 0.5, y: 0.5 },
                            { label: 'أسفل يمين', x: 0.78, y: 0.84 },
                            { label: 'أسفل وسط', x: 0.5, y: 0.84 },
                            { label: 'أسفل يسار', x: 0.22, y: 0.84 },
                          ].map((pos) => (
                            <button
                              key={pos.label}
                              type="button"
                              onClick={() =>
                                updateTextLayer(
                                  activeTextLayer.id,
                                  { x: pos.x, y: pos.y },
                                  true
                                )
                              }
                              className="px-2 py-1.5 rounded-lg bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-300 text-[11px] font-bold text-slate-700 hover:text-sky-800 cursor-pointer"
                            >
                              {pos.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TAB 4: ROTATE & FLIP */}
              {activeTab === 'transform' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        commitPatch((prev) => ({
                          ...prev,
                          rotation90: (prev.rotation90 - 90 + 360) % 360,
                        }))
                      }
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 min-h-[42px] sm:min-h-0 cursor-pointer"
                    >
                      <RotateCcw size={15} />
                      تدوير 90° يسار
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        commitPatch((prev) => ({
                          ...prev,
                          rotation90: (prev.rotation90 + 90) % 360,
                        }))
                      }
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 min-h-[42px] sm:min-h-0 cursor-pointer"
                    >
                      <RotateCw size={15} />
                      تدوير 90° يمين
                    </button>
                    <button
                      type="button"
                      onClick={() => commitPatch((prev) => ({ ...prev, flipH: !prev.flipH }))}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-xl text-xs font-bold border min-h-[42px] sm:min-h-0 cursor-pointer ${
                        flipH
                          ? 'bg-sky-600 text-white border-sky-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <FlipHorizontal2 size={15} />
                      قلب أفقي
                    </button>
                    <button
                      type="button"
                      onClick={() => commitPatch((prev) => ({ ...prev, flipV: !prev.flipV }))}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-xl text-xs font-bold border min-h-[42px] sm:min-h-0 cursor-pointer ${
                        flipV
                          ? 'bg-sky-600 text-white border-sky-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <FlipVertical2 size={15} />
                      قلب رأسي
                    </button>
                  </div>

                  {/* Fine Straighten Slider */}
                  <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-xs font-bold text-slate-700 shrink-0">ضبط الميل:</span>
                    <input
                      type="range"
                      min="-45"
                      max="45"
                      step="1"
                      value={straightenDeg}
                      onChange={(e) => {
                        previewPatch({ straightenDeg: Number(e.target.value) });
                        scheduleSliderCommit();
                      }}
                      onPointerUp={commitPendingPreview}
                      onTouchEnd={commitPendingPreview}
                      onKeyUp={commitPendingPreview}
                      onBlur={commitPendingPreview}
                      className="flex-1 h-2 sm:h-1.5 accent-sky-600 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => commitPatch({ straightenDeg: 0 })}
                      className="text-xs font-mono font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-200 cursor-pointer"
                      title="اضغط لإرجاع الزاوية إلى 0"
                    >
                      {straightenDeg > 0 ? `+${straightenDeg}°` : `${straightenDeg}°`}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 4: BRIGHTNESS / CONTRAST / SATURATION */}
              {activeTab === 'adjust' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handleAutoEnhance}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
                    >
                      <Sparkles size={14} />
                      تحسين تلقائي ذكي
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        commitPatch({
                          brightness: 100,
                          contrast: 100,
                          saturation: 100,
                        })
                      }
                      className="text-xs font-bold text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 cursor-pointer"
                    >
                      استرجاع الألوان الأصلية
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <div className="flex justify-between text-xs font-bold text-slate-700 mb-1.5">
                        <span>السطوع</span>
                        <span className="font-mono">{brightness}%</span>
                      </div>
                      <input
                        type="range"
                        min="60"
                        max="145"
                        value={brightness}
                        onChange={(e) => {
                          previewPatch({ brightness: Number(e.target.value) });
                          scheduleSliderCommit();
                        }}
                        onPointerUp={commitPendingPreview}
                        onTouchEnd={commitPendingPreview}
                        onKeyUp={commitPendingPreview}
                        onBlur={commitPendingPreview}
                        className="w-full h-2 sm:h-1.5 accent-sky-600 cursor-pointer"
                      />
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <div className="flex justify-between text-xs font-bold text-slate-700 mb-1.5">
                        <span>التباين</span>
                        <span className="font-mono">{contrast}%</span>
                      </div>
                      <input
                        type="range"
                        min="60"
                        max="150"
                        value={contrast}
                        onChange={(e) => {
                          previewPatch({ contrast: Number(e.target.value) });
                          scheduleSliderCommit();
                        }}
                        onPointerUp={commitPendingPreview}
                        onTouchEnd={commitPendingPreview}
                        onKeyUp={commitPendingPreview}
                        onBlur={commitPendingPreview}
                        className="w-full h-2 sm:h-1.5 accent-sky-600 cursor-pointer"
                      />
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <div className="flex justify-between text-xs font-bold text-slate-700 mb-1.5">
                        <span>التشبع اللوني</span>
                        <span className="font-mono">{saturation}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="170"
                        value={saturation}
                        onChange={(e) => {
                          previewPatch({ saturation: Number(e.target.value) });
                          scheduleSliderCommit();
                        }}
                        onPointerUp={commitPendingPreview}
                        onTouchEnd={commitPendingPreview}
                        onKeyUp={commitPendingPreview}
                        onBlur={commitPendingPreview}
                        className="w-full h-2 sm:h-1.5 accent-sky-600 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-5 sm:py-3 border-t border-slate-200 bg-slate-50 shrink-0">
          {queueNav && queueNav.total > 1 && (
            <div className="flex items-center justify-between w-full sm:w-auto bg-white border border-slate-300 rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => handleQueueSwitch('prev')}
                disabled={!queueNav.hasPrev || isSaving}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-35 cursor-pointer"
                title="حفظ والانتقال للصورة السابقة في القائمة"
              >
                <ChevronRight size={14} />
                <span>السابقة</span>
              </button>
              <span className="text-[11px] font-mono font-bold text-slate-600 px-2 border-x border-slate-200">
                {queueNav.currentNumber} / {queueNav.total}
              </span>
              <button
                type="button"
                onClick={() => handleQueueSwitch('next')}
                disabled={!queueNav.hasNext || isSaving}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-35 cursor-pointer"
                title="حفظ والانتقال للصورة التالية في القائمة"
              >
                <span>التالية</span>
                <ChevronLeft size={14} />
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto sm:mr-auto justify-between sm:justify-end">
            <button
              type="button"
              onClick={handleUseFullImage}
              disabled={!workingSourceUrl || isSaving}
              className="flex items-center justify-center gap-1 py-2.5 sm:py-2 px-2.5 sm:px-3.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold rounded-xl text-[11px] sm:text-xs transition-colors cursor-pointer disabled:opacity-40 shrink-0"
            >
              <Maximize2 size={14} />
              <span className="sm:hidden">بدون قص</span>
              <span className="hidden sm:inline">اعتماد الصورة كاملة بدون قص</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="py-2.5 sm:py-2 px-3 sm:px-4 rounded-xl text-slate-600 hover:bg-slate-200/70 text-[11px] sm:text-xs font-bold transition-colors cursor-pointer shrink-0"
            >
              إلغاء
            </button>

            <button
              type="button"
              onClick={handleSaveFinal}
              disabled={!workingSourceUrl || isSaving}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 py-2.5 sm:py-2 px-4 sm:px-6 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Check size={16} />
              {isSaving ? 'جاري الحفظ...' : 'تطبيق وحفظ الصورة'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
