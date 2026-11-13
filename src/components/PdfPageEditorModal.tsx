import React, { useEffect, useRef, useState } from 'react';
import { PDFDocument, rgb } from 'pdf-lib';
import {
  Check,
  Eraser,
  ImagePlus,
  Minus,
  Move,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Type as TypeIcon,
  Undo2,
  X,
} from 'lucide-react';
import { compressUploadedImage, loadImage } from '../utils/imageCropper';
import { loadPdfDocument } from '../utils/pdfExtractor';
import { useUiFeedback } from './UiFeedbackProvider';

interface PdfPageEditorModalProps {
  pdfBuffer: ArrayBuffer;
  pageNumber: number;
  totalPages: number;
  catalogName: string;
  onSaveModifiedPdf: (newBytes: Uint8Array, newPageCount: number) => Promise<void>;
  onClose: () => void;
}

interface WhiteoutOverlay {
  id: string;
  type: 'whiteout';
  xPct: number; // 0..1
  yPct: number; // 0..1
  wPct: number; // 0..1
  hPct: number; // 0..1
}

type BadgeStyleKey = 'white_dark' | 'emerald' | 'sky' | 'amber';

interface BadgeOverlay {
  id: string;
  type: 'badge';
  xPct: number; // 0..1
  yPct: number; // 0..1
  wPct: number; // 0..1
  hPct: number; // 0..1
  titleText: string;
  priceText: string;
  imageDataUrl?: string;
  styleKey: BadgeStyleKey;
  bgColor: string;
  textColor: string;
  borderColor: string;
  pngDataUrl: string;
}

type PageOverlay = WhiteoutOverlay | BadgeOverlay;

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const binStr = atob(base64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

function mapVisualRectToPdfBox(
  ov: { xPct: number; yPct: number; wPct: number; hPct: number },
  cropBox: { x: number; y: number; width: number; height: number },
  rotationAngle: number
): { x: number; y: number; width: number; height: number } {
  const angle = ((rotationAngle % 360) + 360) % 360;
  const vx1 = ov.xPct;
  const vx2 = ov.xPct + ov.wPct;
  const vy1 = ov.yPct;
  const vy2 = ov.yPct + ov.hPct;

  const toUnrotated = (vx: number, vy: number) => {
    switch (angle) {
      case 90:
        return { ux: vy, uy: vx };
      case 180:
        return { ux: 1 - vx, uy: vy };
      case 270:
        return { ux: 1 - vy, uy: 1 - vx };
      case 0:
      default:
        return { ux: vx, uy: 1 - vy };
    }
  };

  const p1 = toUnrotated(vx1, vy1);
  const p2 = toUnrotated(vx2, vy2);
  const minUx = Math.min(p1.ux, p2.ux);
  const maxUx = Math.max(p1.ux, p2.ux);
  const minUy = Math.min(p1.uy, p2.uy);
  const maxUy = Math.max(p1.uy, p2.uy);

  return {
    x: cropBox.x + minUx * cropBox.width,
    y: cropBox.y + minUy * cropBox.height,
    width: Math.max(1, (maxUx - minUx) * cropBox.width),
    height: Math.max(1, (maxUy - minUy) * cropBox.height),
  };
}

async function rotatePngForPdfPage(dataUrl: string, rotationAngle: number): Promise<string> {
  const angle = ((rotationAngle % 360) + 360) % 360;
  if (angle === 0) return dataUrl;

  const img = await loadImage(dataUrl);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  const canvas = document.createElement('canvas');
  if (angle === 90 || angle === 270) {
    canvas.width = srcH;
    canvas.height = srcW;
  } else {
    canvas.width = srcW;
    canvas.height = srcH;
  }

  const ctx = canvas.getContext('2d')!;
  if (angle === 90) {
    ctx.translate(0, srcW);
    ctx.rotate(-Math.PI / 2);
  } else if (angle === 180) {
    ctx.translate(srcW, srcH);
    ctx.rotate(Math.PI);
  } else if (angle === 270) {
    ctx.translate(srcH, 0);
    ctx.rotate(Math.PI / 2);
  }

  ctx.drawImage(img, 0, 0, srcW, srcH);
  return canvas.toDataURL('image/png');
}

function wrapArabicTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number = 2
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length >= maxLines) break;
    }
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }
  return lines.slice(0, maxLines);
}

async function renderBadgeToPng(
  titleText: string,
  priceText: string,
  bgColor: string,
  textColor: string,
  borderColor: string,
  imageDataUrl?: string
): Promise<{ dataUrl: string; aspectRatio: number }> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready.catch(() => {});
  }

  const cleanTitle = titleText.trim();
  const cleanPrice = priceText.trim();
  const hasPhoto = Boolean(imageDataUrl);

  const scale = 3;
  const titleFont = `700 ${14 * scale}px 'Cairo', 'Tajawal', Arial, sans-serif`;
  const priceFont = `900 ${18 * scale}px 'Cairo', 'Tajawal', Arial, sans-serif`;

  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = titleFont;
  const rawTitleW = cleanTitle ? probe.measureText(cleanTitle).width : 0;
  probe.font = priceFont;
  const rawPriceW = cleanPrice ? probe.measureText(cleanPrice).width : 0;

  const padX = 16 * scale;
  const padY = 10 * scale;

  let width: number;
  let height: number;
  let titleLines: string[] = [];

  if (hasPhoto) {
    // Full replacement product card layout
    const cardW = 190 * scale;
    const imgBoxH = 105 * scale;
    probe.font = titleFont;
    titleLines = cleanTitle ? wrapArabicTextLines(probe, cleanTitle, cardW - padX * 2, 2) : [];
    const titleH = titleLines.length * (19 * scale);
    const priceH = cleanPrice ? 30 * scale : 0;
    const gaps = (titleLines.length > 0 ? 8 * scale : 0) + (cleanPrice ? 8 * scale : 0);

    width = cardW;
    height = Math.ceil(padY * 2 + imgBoxH + titleH + priceH + gaps);
  } else {
    const maxTextW = Math.min(260 * scale, Math.max(rawTitleW, rawPriceW));
    width = Math.max(96 * scale, Math.ceil(maxTextW + padX * 2));
    probe.font = titleFont;
    titleLines = cleanTitle ? wrapArabicTextLines(probe, cleanTitle, width - padX * 2, 2) : [];
    const titleH = titleLines.length * (19 * scale);
    const priceH = cleanPrice ? 24 * scale : 0;
    const lineGap = titleLines.length > 0 && cleanPrice ? 6 * scale : 0;
    height = Math.max(40 * scale, Math.ceil(padY * 2 + titleH + lineGap + priceH));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const c2 = canvas.getContext('2d')!;
  const radius = 10 * scale;

  // Rounded rectangle card
  c2.beginPath();
  c2.moveTo(radius, 0);
  c2.lineTo(width - radius, 0);
  c2.quadraticCurveTo(width, 0, width, radius);
  c2.lineTo(width, height - radius);
  c2.quadraticCurveTo(width, height, width - radius, height);
  c2.lineTo(radius, height);
  c2.quadraticCurveTo(0, height, 0, height - radius);
  c2.lineTo(0, radius);
  c2.quadraticCurveTo(0, 0, radius, 0);
  c2.closePath();

  c2.fillStyle = bgColor;
  c2.fill();

  if (borderColor && borderColor !== 'transparent') {
    c2.lineWidth = 2 * scale;
    c2.strokeStyle = borderColor;
    c2.stroke();
  }

  let cursorY = padY;

  if (hasPhoto && imageDataUrl) {
    try {
      const img = await loadImage(imageDataUrl);
      const boxW = width - padX * 2;
      const boxH = 105 * scale;
      c2.fillStyle = '#ffffff';
      c2.fillRect(padX, cursorY, boxW, boxH);

      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const fitScale = Math.min((boxW - 8 * scale) / iw, (boxH - 8 * scale) / ih);
      const drawW = iw * fitScale;
      const drawH = ih * fitScale;
      c2.drawImage(
        img,
        padX + (boxW - drawW) / 2,
        cursorY + (boxH - drawH) / 2,
        drawW,
        drawH
      );
      cursorY += boxH + 8 * scale;
    } catch {
      // ignore failed photo draw and render text cleanly
    }
  }

  c2.textAlign = 'center';
  c2.textBaseline = 'middle';
  c2.direction = 'rtl';

  if (titleLines.length > 0) {
    c2.font = titleFont;
    c2.fillStyle = textColor;
    for (const line of titleLines) {
      c2.fillText(line, width / 2, cursorY + (19 * scale) / 2);
      cursorY += 19 * scale;
    }
    if (cleanPrice) {
      cursorY += hasPhoto ? 8 * scale : 6 * scale;
    }
  }

  if (cleanPrice) {
    if (hasPhoto) {
      const pillW = width - padX * 2;
      const pillH = 28 * scale;
      c2.fillStyle = '#dcfce7';
      c2.fillRect(padX, cursorY, pillW, pillH);
      c2.font = priceFont;
      c2.fillStyle = '#15803d';
      c2.fillText(cleanPrice, width / 2, cursorY + pillH / 2);
    } else {
      c2.font = priceFont;
      c2.fillStyle = textColor;
      const yPos = titleLines.length > 0 ? cursorY + (24 * scale) / 2 : height / 2;
      c2.fillText(cleanPrice, width / 2, yPos);
    }
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    aspectRatio: height / width,
  };
}

export const PdfPageEditorModal: React.FC<PdfPageEditorModalProps> = ({
  pdfBuffer,
  pageNumber,
  totalPages,
  catalogName,
  onSaveModifiedPdf,
  onClose,
}) => {
  const { toast } = useUiFeedback();

  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pageDataUrl, setPageDataUrl] = useState<string | null>(null);
  const [pageAspect, setPageAspect] = useState<number>(297 / 210); // height / width

  const [activeTool, setActiveTool] = useState<'whiteout' | 'badge' | 'move'>('whiteout');
  const [overlays, setOverlays] = useState<PageOverlay[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Badge / product card creator & editor inputs
  const [badgeTitle, setBadgeTitle] = useState('');
  const [badgePrice, setBadgePrice] = useState('');
  const [badgeStyle, setBadgeStyle] = useState<BadgeStyleKey>('white_dark');
  const [badgeImageUrl, setBadgeImageUrl] = useState<string | undefined>(undefined);
  const badgePhotoInputRef = useRef<HTMLInputElement>(null);

  // Drawing / dragging state
  const stageRef = useRef<HTMLDivElement>(null);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [dragState, setDragState] = useState<{
    id: string;
    startX: number;
    startY: number;
    origXPct: number;
    origYPct: number;
  } | null>(null);

  // Render the selected PDF page at scale 2.0
  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      setIsLoadingPage(true);
      try {
        const pdfDoc = await loadPdfDocument(pdfBuffer.slice(0));
        if (cancelled) return;
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2.0 });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({
            canvasContext: ctx,
            viewport,
            background: '#ffffff',
          }).promise;
        }

        if (!cancelled) {
          setPageAspect(canvas.height / canvas.width);
          setPageDataUrl(canvas.toDataURL('image/jpeg', 0.92));
        }
        canvas.width = 1;
        canvas.height = 1;
      } catch {
        if (!cancelled) toast.error('تعذر تحميل الصفحة للتعديل.');
      } finally {
        if (!cancelled) setIsLoadingPage(false);
      }
    };
    render();
    return () => {
      cancelled = true;
    };
  }, [pdfBuffer, pageNumber]);

  const getBadgeColors = (style: BadgeStyleKey) => {
    switch (style) {
      case 'emerald':
        return { bg: '#ecfdf5', text: '#047857', border: '#10b981' };
      case 'sky':
        return { bg: '#f0f9ff', text: '#0369a1', border: '#0284c7' };
      case 'amber':
        return { bg: '#fffbeb', text: '#b45309', border: '#f59e0b' };
      case 'white_dark':
      default:
        return { bg: '#ffffff', text: '#0f172a', border: '#cbd5e1' };
    }
  };

  // Sync editor inputs whenever a badge overlay is selected
  useEffect(() => {
    const sel = overlays.find((o) => o.id === selectedId);
    if (sel && sel.type === 'badge') {
      setBadgeTitle(sel.titleText);
      setBadgePrice(sel.priceText);
      setBadgeStyle(sel.styleKey);
      setBadgeImageUrl(sel.imageDataUrl);
    }
  }, [selectedId]);

  const getRelativePoint = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  };

  const handleBadgePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressUploadedImage(file, 360);
      setBadgeImageUrl(compressed);
    } catch {
      toast.error('تعذر قراءة أو ضغط صورة المنتج.');
    }
  };

  const placeBadgeAt = async (xPct: number, yPct: number) => {
    if (!badgeTitle.trim() && !badgePrice.trim() && !badgeImageUrl) {
      toast.warning('اكتب اسم الصنف أو السعر أو أضف صورة أولاً.');
      return;
    }

    const colors = getBadgeColors(badgeStyle);
    const rendered = await renderBadgeToPng(
      badgeTitle,
      badgePrice,
      colors.bg,
      colors.text,
      colors.border,
      badgeImageUrl
    );

    const wPct = badgeImageUrl ? 0.24 : 0.22;
    const hPct = (wPct * rendered.aspectRatio) / pageAspect;

    const clampedX = Math.min(1 - wPct, Math.max(0, xPct - wPct / 2));
    const clampedY = Math.min(1 - hPct, Math.max(0, yPct - hPct / 2));

    const newOverlay: BadgeOverlay = {
      id: `badge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'badge',
      xPct: clampedX,
      yPct: clampedY,
      wPct,
      hPct,
      titleText: badgeTitle.trim(),
      priceText: badgePrice.trim(),
      imageDataUrl: badgeImageUrl,
      styleKey: badgeStyle,
      bgColor: colors.bg,
      textColor: colors.text,
      borderColor: colors.border,
      pngDataUrl: rendered.dataUrl,
    };

    setOverlays((prev) => [...prev, newOverlay]);
    setSelectedId(newOverlay.id);
    setActiveTool('move');
  };

  const updateSelectedBadge = async () => {
    const sel = overlays.find((o) => o.id === selectedId);
    if (!sel || sel.type !== 'badge') return;
    if (!badgeTitle.trim() && !badgePrice.trim() && !badgeImageUrl) {
      toast.warning('أدخل اسماً أو سعراً أو صورة لتحديث الشارة.');
      return;
    }

    const colors = getBadgeColors(badgeStyle);
    const rendered = await renderBadgeToPng(
      badgeTitle,
      badgePrice,
      colors.bg,
      colors.text,
      colors.border,
      badgeImageUrl
    );

    const nextH = (sel.wPct * rendered.aspectRatio) / pageAspect;
    setOverlays((prev) =>
      prev.map((ov) =>
        ov.id === sel.id
          ? {
              ...ov,
              titleText: badgeTitle.trim(),
              priceText: badgePrice.trim(),
              imageDataUrl: badgeImageUrl,
              styleKey: badgeStyle,
              bgColor: colors.bg,
              textColor: colors.text,
              borderColor: colors.border,
              pngDataUrl: rendered.dataUrl,
              hPct: nextH,
              yPct: Math.min(1 - nextH, ov.yPct),
            }
          : ov
      )
    );
    toast.success('تم تحديث محتوى الشارة المحددة.');
  };

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && (e.target as HTMLElement).dataset.stageBg !== 'true') {
      return;
    }
    const pt = getRelativePoint(e.clientX, e.clientY);

    if (activeTool === 'whiteout') {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrawStart(pt);
      setDrawCurrent(pt);
      setSelectedId(null);
    } else if (activeTool === 'badge') {
      void placeBadgeAt(pt.x, pt.y);
    } else {
      setSelectedId(null);
    }
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragState) {
      const pt = getRelativePoint(e.clientX, e.clientY);
      const dx = pt.x - dragState.startX;
      const dy = pt.y - dragState.startY;
      setOverlays((prev) =>
        prev.map((ov) => {
          if (ov.id !== dragState.id) return ov;
          const nextX = Math.min(1 - ov.wPct, Math.max(0, dragState.origXPct + dx));
          const nextY = Math.min(1 - ov.hPct, Math.max(0, dragState.origYPct + dy));
          return { ...ov, xPct: nextX, yPct: nextY };
        })
      );
      return;
    }

    if (drawStart) {
      setDrawCurrent(getRelativePoint(e.clientX, e.clientY));
    }
  };

  const handleStagePointerUp = () => {
    if (dragState) {
      setDragState(null);
      return;
    }

    if (drawStart && drawCurrent) {
      const xPct = Math.min(drawStart.x, drawCurrent.x);
      const yPct = Math.min(drawStart.y, drawCurrent.y);
      const wPct = Math.abs(drawCurrent.x - drawStart.x);
      const hPct = Math.abs(drawCurrent.y - drawStart.y);

      if (wPct >= 0.02 && hPct >= 0.015) {
        const newWhiteout: WhiteoutOverlay = {
          id: `wo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'whiteout',
          xPct,
          yPct,
          wPct,
          hPct,
        };
        setOverlays((prev) => [...prev, newWhiteout]);
        setSelectedId(newWhiteout.id);
      }
      setDrawStart(null);
      setDrawCurrent(null);
    }
  };

  const addQuickWhiteoutBox = () => {
    const newWhiteout: WhiteoutOverlay = {
      id: `wo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'whiteout',
      xPct: 0.35,
      yPct: 0.35,
      wPct: 0.25,
      hPct: 0.18,
    };
    setOverlays((prev) => [...prev, newWhiteout]);
    setSelectedId(newWhiteout.id);
    setActiveTool('move');
  };

  const resizeSelected = (deltaW: number, deltaH?: number) => {
    if (!selectedId) return;
    setOverlays((prev) =>
      prev.map((ov) => {
        if (ov.id !== selectedId) return ov;
        if (ov.type === 'badge') {
          const nextW = Math.min(0.75, Math.max(0.08, ov.wPct + deltaW));
          const ratio = ov.hPct / ov.wPct;
          const nextH = nextW * ratio;
          return {
            ...ov,
            wPct: nextW,
            hPct: nextH,
            xPct: Math.min(1 - nextW, ov.xPct),
            yPct: Math.min(1 - nextH, ov.yPct),
          };
        } else {
          const dH = deltaH !== undefined ? deltaH : deltaW * 0.7;
          const nextW = Math.min(0.95, Math.max(0.03, ov.wPct + deltaW));
          const nextH = Math.min(0.95, Math.max(0.02, ov.hPct + dH));
          return {
            ...ov,
            wPct: nextW,
            hPct: nextH,
            xPct: Math.min(1 - nextW, ov.xPct),
            yPct: Math.min(1 - nextH, ov.yPct),
          };
        }
      })
    );
  };

  const removeOverlay = (id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleSaveToPdf = async () => {
    if (overlays.length === 0) {
      toast.info('لم تقم بإضافة أي تعديلات أو مسح على هذه الصفحة بعد.');
      return;
    }

    setIsSaving(true);
    try {
      const pdfDoc = await PDFDocument.load(pdfBuffer.slice(0), { ignoreEncryption: true });
      const pdfPage = pdfDoc.getPage(pageNumber - 1);
      const cropBox = pdfPage.getCropBox();
      const rotationAngle = pdfPage.getRotation().angle || 0;

      // 1. Apply all whiteout (delete product/area) patches first with full rotation support
      for (const ov of overlays) {
        if (ov.type === 'whiteout') {
          const rect = mapVisualRectToPdfBox(ov, cropBox, rotationAngle);
          pdfPage.drawRectangle({
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            color: rgb(1, 1, 1),
          });
        }
      }

      // 2. Apply all text/price/product card overlays (rotated to match upright orientation if page is rotated)
      for (const ov of overlays) {
        if (ov.type === 'badge') {
          const finalPngUrl = await rotatePngForPdfPage(ov.pngDataUrl, rotationAngle);
          const pngBytes = dataUrlToUint8Array(finalPngUrl);
          const pngImage = await pdfDoc.embedPng(pngBytes);
          const rect = mapVisualRectToPdfBox(ov, cropBox, rotationAngle);

          pdfPage.drawImage(pngImage, {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          });
        }
      }

      const finalBytes = await pdfDoc.save();
      await onSaveModifiedPdf(finalBytes, pdfDoc.getPageCount());
      toast.success(`تم حفظ تعديلات الصفحة ${pageNumber} في ملف الـ PDF بنجاح!`);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'حدث خطأ أثناء حفظ تعديلات الصفحة.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedOverlay = overlays.find((o) => o.id === selectedId) || null;
  const isEditingExistingBadge = selectedOverlay?.type === 'badge';

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-70 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
    >
      <div className="bg-white rounded-3xl max-w-5xl w-full h-[94vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
        {/* Top Bar */}
        <div className="px-4 sm:px-6 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Pencil size={18} className="text-sky-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm truncate">
                تعديل محتوى صفحة {pageNumber} من {totalPages} — {catalogName}
              </h3>
              <p className="text-[11px] text-slate-300">
                امسح أي منتج أو سعر قديم من الصفحة، أو أضف سعر / كارت منتج جديد بالصورة مباشرة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOverlays((prev) => prev.slice(0, -1))}
              disabled={overlays.length === 0 || isSaving}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-xs font-bold cursor-pointer"
              title="تراجع عن آخر تعديل"
            >
              <Undo2 size={14} />
              <span className="hidden sm:inline">تراجع</span>
            </button>

            <button
              type="button"
              onClick={handleSaveToPdf}
              disabled={isSaving || overlays.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 rounded-xl text-xs font-extrabold cursor-pointer shadow-xs"
            >
              {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              <span>حفظ التعديلات في الـ PDF ({overlays.length})</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg cursor-pointer"
              aria-label="إغلاق"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tools & Controls Bar */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Tool Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTool('whiteout')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                activeTool === 'whiteout'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Eraser size={15} />
              <span>1. مسح / حذف منتج من الصفحة</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTool('badge')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                activeTool === 'badge'
                  ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <TypeIcon size={15} />
              <span>2. إضافة سعر أو منتج بديل</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTool('move')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                activeTool === 'move'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Move size={15} />
              <span>تحريك / ضبط الحجم</span>
            </button>

            {activeTool === 'whiteout' && (
              <button
                type="button"
                onClick={addQuickWhiteoutBox}
                className="px-2.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold cursor-pointer"
                title="إضافة مربع مسح أبيض في المنتصف لتسحبه وتكبره"
              >
                + مربع مسح جاهز
              </button>
            )}
          </div>

          {/* Selected Overlay Size / Delete Controls */}
          {selectedOverlay && (
            <div className="flex flex-wrap items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl">
              <span className="text-[11px] font-bold text-slate-600 ml-1">
                {selectedOverlay.type === 'whiteout' ? 'مقاس المسح:' : 'حجم الشارة:'}
              </span>

              {selectedOverlay.type === 'whiteout' ? (
                <>
                  <button
                    type="button"
                    onClick={() => resizeSelected(0.03, 0)}
                    className="px-1.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-bold text-slate-700 cursor-pointer"
                    title="توسيع العرض"
                  >
                    عرض +
                  </button>
                  <button
                    type="button"
                    onClick={() => resizeSelected(-0.03, 0)}
                    className="px-1.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-bold text-slate-700 cursor-pointer"
                    title="تضييق العرض"
                  >
                    عرض -
                  </button>
                  <button
                    type="button"
                    onClick={() => resizeSelected(0, 0.03)}
                    className="px-1.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-bold text-slate-700 cursor-pointer"
                    title="زيادة الارتفاع"
                  >
                    طول +
                  </button>
                  <button
                    type="button"
                    onClick={() => resizeSelected(0, -0.03)}
                    className="px-1.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-bold text-slate-700 cursor-pointer"
                    title="تقليل الارتفاع"
                  >
                    طول -
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => resizeSelected(0.03)}
                    className="p-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 cursor-pointer"
                    title="تكبير"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => resizeSelected(-0.03)}
                    className="p-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 cursor-pointer"
                    title="تصغير"
                  >
                    <Minus size={14} />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => removeOverlay(selectedOverlay.id)}
                className="p-1 bg-rose-50 hover:bg-rose-100 rounded-lg text-rose-600 cursor-pointer"
                title="حذف هذا العنصر"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Badge / Replacement Card Form Bar */}
        {(activeTool === 'badge' || isEditingExistingBadge) && (
          <div className="px-4 py-2.5 bg-sky-50 border-b border-sky-200 flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={badgePhotoInputRef}
              accept="image/*"
              onChange={handleBadgePhotoSelected}
              className="hidden"
            />
            <input
              type="text"
              value={badgeTitle}
              onChange={(e) => setBadgeTitle(e.target.value)}
              placeholder="اسم الصنف أو الملاحظة (اختياري)"
              className="px-3 py-1.5 bg-white border border-sky-200 rounded-xl text-xs font-bold focus:outline-sky-500 min-w-[170px]"
            />
            <input
              type="text"
              value={badgePrice}
              onChange={(e) => setBadgePrice(e.target.value)}
              placeholder="السعر الجديد (مثال: 185 ج.م)"
              className="px-3 py-1.5 bg-white border border-sky-200 rounded-xl text-xs font-extrabold text-emerald-700 focus:outline-sky-500 w-40"
            />
            <select
              value={badgeStyle}
              onChange={(e) => setBadgeStyle(e.target.value as BadgeStyleKey)}
              className="px-2.5 py-1.5 bg-white border border-sky-200 rounded-xl text-xs font-bold text-slate-700"
            >
              <option value="white_dark">أبيض بنص أسود</option>
              <option value="emerald">أخضر للأسعار</option>
              <option value="sky">أزرق سماوي</option>
              <option value="amber">أصفر عروض</option>
            </select>

            <button
              type="button"
              onClick={() => badgePhotoInputRef.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-sky-200 text-sky-800 rounded-xl text-xs font-bold cursor-pointer"
              title="أضف صورة لعمل كارت منتج كامل بديل فوق المساحة الممسوحة"
            >
              <ImagePlus size={14} />
              <span>{badgeImageUrl ? 'تغيير الصورة' : '+ صورة منتج'}</span>
            </button>
            {badgeImageUrl && (
              <button
                type="button"
                onClick={() => setBadgeImageUrl(undefined)}
                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg cursor-pointer"
                title="إزالة الصورة"
              >
                <X size={13} />
              </button>
            )}

            {isEditingExistingBadge ? (
              <button
                type="button"
                onClick={() => void updateSelectedBadge()}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl cursor-pointer"
              >
                تحديث الشارة المحددة
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void placeBadgeAt(0.5, 0.5)}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold rounded-xl cursor-pointer"
              >
                + ضعها في الصفحة (أو اضغط مباشرة على مكانها)
              </button>
            )}
          </div>
        )}

        {/* Hint Strip */}
        <div className="px-4 py-1.5 bg-slate-100 text-[11px] font-bold text-slate-600 text-center">
          {activeTool === 'whiteout' &&
            'اسحب بالإصبع أو الماوس فوق أي منتج أو سعر قديم لتغطيته بالأبيض وحذفه من الصفحة، ثم اضغط "حفظ التعديلات".'}
          {activeTool === 'badge' &&
            'اكتب السعر أو الاسم (ويمكنك إرفاق صورة) بالأعلى ثم اضغط في أي مكان على الصفحة لوضعه فوقها.'}
          {activeTool === 'move' &&
            'اسحب أي مربع أو شارة لتحريك مكانها، واضغط على أي شارة لتعديل نصها أو سعرها أو حجمها بالأعلى.'}
        </div>

        {/* Interactive Stage */}
        <div className="flex-1 bg-slate-200 overflow-auto p-3 sm:p-6 flex items-start justify-center">
          {isLoadingPage || !pageDataUrl ? (
            <div className="my-auto text-center space-y-2 text-slate-600">
              <RefreshCw size={28} className="animate-spin mx-auto text-sky-600" />
              <p className="text-xs font-bold">جاري تجهيز الصفحة للتعديل...</p>
            </div>
          ) : (
            <div
              ref={stageRef}
              onPointerDown={handleStagePointerDown}
              onPointerMove={handleStagePointerMove}
              onPointerUp={handleStagePointerUp}
              className={`relative bg-white shadow-xl rounded-lg overflow-hidden select-none touch-none max-w-2xl w-full ${
                activeTool === 'whiteout'
                  ? 'cursor-crosshair'
                  : activeTool === 'badge'
                  ? 'cursor-cell'
                  : 'cursor-default'
              }`}
            >
              <img
                src={pageDataUrl}
                alt={`صفحة ${pageNumber}`}
                data-stage-bg="true"
                draggable={false}
                className="w-full h-auto block pointer-events-none"
              />

              {/* Active drawing preview for whiteout */}
              {drawStart && drawCurrent && (
                <div
                  className="absolute bg-white/90 border-2 border-dashed border-rose-500 pointer-events-none"
                  style={{
                    left: `${Math.min(drawStart.x, drawCurrent.x) * 100}%`,
                    top: `${Math.min(drawStart.y, drawCurrent.y) * 100}%`,
                    width: `${Math.abs(drawCurrent.x - drawStart.x) * 100}%`,
                    height: `${Math.abs(drawCurrent.y - drawStart.y) * 100}%`,
                  }}
                />
              )}

              {/* Placed Overlays */}
              {overlays.map((ov) => {
                const isSelected = ov.id === selectedId;
                return (
                  <div
                    key={ov.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedId(ov.id);
                      const pt = getRelativePoint(e.clientX, e.clientY);
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      setDragState({
                        id: ov.id,
                        startX: pt.x,
                        startY: pt.y,
                        origXPct: ov.xPct,
                        origYPct: ov.yPct,
                      });
                    }}
                    style={{
                      left: `${ov.xPct * 100}%`,
                      top: `${ov.yPct * 100}%`,
                      width: `${ov.wPct * 100}%`,
                      height: `${ov.hPct * 100}%`,
                    }}
                    className={`absolute cursor-move transition-shadow ${
                      ov.type === 'whiteout'
                        ? 'bg-white border border-dashed border-rose-400/80'
                        : ''
                    } ${isSelected ? 'ring-2 ring-sky-500 shadow-lg z-20' : 'z-10'}`}
                  >
                    {ov.type === 'badge' && (
                      <img
                        src={ov.pngDataUrl}
                        alt={ov.priceText || ov.titleText}
                        draggable={false}
                        className="w-full h-full object-contain pointer-events-none"
                      />
                    )}
                    {isSelected && (
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeOverlay(ov.id);
                        }}
                        className="absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-md cursor-pointer"
                        title="إزالة"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
