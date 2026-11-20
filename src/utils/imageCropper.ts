/**
 * Image processing utilities for full pages and cropping product photos
 */

export interface ImageSlice {
  sliceId: string;
  sliceIndex: number;
  totalSlices: number;
  dataUrl: string; // Base64 data URL
  base64Data: string; // Stripped base64 for Gemini
  mimeType: string;
  width: number;
  height: number;
  startY: number;
  endY: number;
}

/**
 * Loads an HTMLImageElement from a DataURL or blob URL
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('فشل تحميل الصورة'));
    img.src = src;
  });
}

/**
 * Validates if the bounding box [ymin, xmin, ymax, xmax] has at least 8% width and 8% height of the page.
 * Values are in 0-1000 scale, so 8% is 80 units.
 */
export function isBoxValid(box?: [number, number, number, number]): boolean {
  if (!box || !Array.isArray(box) || box.length !== 4) return false;
  const [ymin, xmin, ymax, xmax] = box;

  if (ymin >= ymax || xmin >= xmax) return false;

  const widthNormalized = (xmax - xmin) / 1000;
  const heightNormalized = (ymax - ymin) / 1000;

  // Must be at least 8% of the page dimension
  return widthNormalized >= 0.08 && heightNormalized >= 0.08;
}

/**
 * Crops a product photo from a full page using bounding box box_2d = [ymin, xmin, ymax, xmax] in 0-1000 scale.
 * Output: Compressed JPEG, max width 400px, 80% quality.
 */
export async function cropAndCompressProductImage(
  pageDataUrl: string,
  box: [number, number, number, number]
): Promise<string | undefined> {
  if (!box || box.length !== 4) return undefined;
  const [ymin, xmin, ymax, xmax] = box;

  // Sanity check coordinates
  if (ymin >= ymax || xmin >= xmax || (ymin === 0 && xmin === 0 && ymax === 0 && xmax === 0)) {
    return undefined;
  }

  try {
    const img = await loadImage(pageDataUrl);
    const imgWidth = img.naturalWidth || img.width;
    const imgHeight = img.naturalHeight || img.height;

    // Convert normalized 0-1000 coords to actual pixels
    const sourceX = Math.max(0, Math.floor((xmin / 1000) * imgWidth));
    const sourceY = Math.max(0, Math.floor((ymin / 1000) * imgHeight));
    const sourceWidth = Math.min(imgWidth - sourceX, Math.ceil(((xmax - xmin) / 1000) * imgWidth));
    const sourceHeight = Math.min(imgHeight - sourceY, Math.ceil(((ymax - ymin) / 1000) * imgHeight));

    if (sourceWidth < 20 || sourceHeight < 20) return undefined;

    // Target width 400px, preserve aspect ratio
    const targetWidth = 400;
    const scale = targetWidth / sourceWidth;
    const targetHeight = Math.round(sourceHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d')!;

    // Fill white background in case of transparency or rounded corners
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    // High quality interpolation
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      img,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      targetWidth,
      targetHeight
    );

    return canvas.toDataURL('image/jpeg', 0.8);
  } catch (err) {
    console.error('Error cropping product image:', err);
    return undefined;
  }
}

/**
 * Resizes any user uploaded photo to targetWidth (default 400px) with 80% JPEG compression.
 * Uses native createImageBitmap with resizeWidth when available for fast off-thread decoding,
 * falling back to HTMLImageElement if unsupported.
 */
export async function compressUploadedImage(file: File, targetWidth: number = 400): Promise<string> {
  if (!file) {
    throw new Error('الملف مفقود أو غير صالح');
  }

  // Check if file is an image
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error(`الملف ليس صورة صالحة (نوع الملف: ${file.type || 'غير معروف'})`);
  }

  // 1. Native createImageBitmap (high speed off-thread)
  if (typeof window !== 'undefined' && typeof window.createImageBitmap === 'function') {
    try {
      const probe = await window.createImageBitmap(file);
      const origW = probe.width;
      const origH = probe.height;
      probe.close();

      if (origW <= 0 || origH <= 0) {
        throw new Error('أبعاد الصورة غير صالحة أو الصورة تالفة');
      }

      const targetW = Math.min(targetWidth, origW);
      const targetH = Math.max(1, Math.round((origH / origW) * targetW));

      let bitmap: ImageBitmap;
      try {
        bitmap = await window.createImageBitmap(file, {
          resizeWidth: targetW,
          resizeHeight: targetH,
          resizeQuality: 'high',
        });
      } catch {
        bitmap = await window.createImageBitmap(file);
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('فشل إنشاء سياق رسم اللوحة (Canvas)');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, targetW, targetH);
      bitmap.close();

      return canvas.toDataURL('image/jpeg', 0.8);
    } catch (bitmapError: any) {
      console.warn('createImageBitmap failed, falling back to FileReader:', bitmapError?.message || bitmapError);
    }
  }

  // 2. Fallback using FileReader & Image
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) {
          return reject(new Error('فشل قراءة محتوى ملف الصورة'));
        }

        const img = new Image();
        img.onload = () => {
          try {
            const origW = img.naturalWidth || img.width;
            const origH = img.naturalHeight || img.height;

            if (origW <= 0 || origH <= 0) {
              return reject(new Error('الصورة تالفة أو أبعادها صفرية'));
            }

            const targetW = Math.min(targetWidth, origW);
            const targetH = Math.max(1, Math.round((origH / origW) * targetW));

            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('فشل إنشاء سياق الرسم'));

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, targetW, targetH);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, targetW, targetH);

            resolve(canvas.toDataURL('image/jpeg', 0.8));
          } catch (canvasErr: any) {
            reject(new Error(`فشل تصغير وضغط الصورة: ${canvasErr.message || canvasErr}`));
          }
        };

        img.onerror = () => {
          reject(new Error('الصورة تالفة أو صيغتها غير مدعومة بالمتصفح'));
        };

        img.src = dataUrl;
      } catch (err: any) {
        reject(new Error(`فشل معالجة الصورة: ${err.message || err}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('فشل قراءة الملف من القرص المحلي'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Reads an uploaded image file at higher working resolution (default 1200px max side)
 * for crisp interactive cropping, rotating, zooming, and manual erasing in the photo studio.
 */
export async function readFileAsWorkingDataUrl(file: File, maxDimension: number = 1200): Promise<string> {
  if (!file) throw new Error('الملف مفقود أو غير صالح');
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error(`الملف ليس صورة صالحة (${file.type})`);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return reject(new Error('فشل قراءة ملف الصورة'));

      const img = new Image();
      img.onload = () => {
        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;
        if (origW <= 0 || origH <= 0) return reject(new Error('أبعاد الصورة غير صالحة'));

        const scale = Math.min(1, maxDimension / Math.max(origW, origH));
        const targetW = Math.max(1, Math.round(origW * scale));
        const targetH = Math.max(1, Math.round(origH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('تعذر تهيئة لوحة الرسم'));

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);

        // Preserve PNG if source has transparency (png/webp), else high-quality JPEG
        const keepPng = file.type === 'image/png' || file.type === 'image/webp';
        resolve(keepPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = () => reject(new Error('تعذر فك تشفير الصورة'));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

/**
 * Converts a DataURL string back into a File object (for replacing queued upload files).
 */
export async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = blob.type.includes('png') ? 'png' : 'jpg';
  const cleanBase = filename.replace(/\.[^.]+$/, '') || 'product_image';
  return new File([blob], `${cleanBase}_edited.${ext}`, { type: blob.type || 'image/jpeg' });
}

export type StudioStrokeMode = 'erase' | 'restore' | 'paint' | 'keep' | 'bgMark';

export interface StudioMaskStroke {
  id: string;
  mode: StudioStrokeMode;
  radiusNormalized: number; // relative to image max dimension (0.008 .. 0.16)
  points: { x: number; y: number }[]; // normalized 0..1 on transformed base canvas
  color?: string; // hex color for 'paint' mode
  opacity?: number; // 0.1..1 for 'paint' mode
}

export interface StudioTransformParams {
  rotationDeg: number; // arbitrary angle -180..180
  flipH: boolean;
  flipV: boolean;
  brightness: number; // 100 = normal
  contrast: number; // 100 = normal
  saturation: number; // 100 = normal
  autoBgRemove: boolean;
  bgTolerance: number; // 5..80
  edgeProtection?: number; // 0..100 (Sobel contour barrier strength)
  bgFeather?: number; // 0..5 (edge alpha smoothing)
  protectCenter?: boolean; // boosts edge barrier near center subject
  targetRemoveColors?: string[]; // hex colors picked by eyedropper/palette to erase
  strokes: StudioMaskStroke[];
  showMaskGuides?: boolean; // draws keep (green) / bgMark (red) overlays for editor preview only
}

export type TextColorMode = 'solid' | 'gradient';
export type TextBgMode = 'none' | 'solid' | 'gradient';
export type TextGradientDirection = 'horizontal' | 'vertical' | 'diagonal';
export type TextBgShape = 'rounded' | 'pill' | 'sharp';

export interface StudioTextLayer {
  id: string;
  text: string;
  x: number; // 0..1 center X inside cropped frame
  y: number; // 0..1 center Y inside cropped frame
  fontFamily: string;
  fontSizePct: number; // 5..28 (% of min output side)
  fontWeight: 'normal' | 'bold' | '900';
  italic: boolean;
  underline: boolean;
  rotation: number; // -180..180 deg
  opacity: number; // 15..100
  colorMode: TextColorMode;
  color: string;
  gradientColors: string[]; // 2..4 colors for multi-color WordArt fill
  gradientDirection: TextGradientDirection;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number; // 1..12
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number; // 0..24
  shadowOffsetX: number; // -12..12
  shadowOffsetY: number; // -12..12
  bgMode: TextBgMode;
  bgColor: string;
  bgGradientColors: string[];
  bgOpacity: number; // 10..100
  bgPadding: number; // 4..32
  bgShape: TextBgShape;
  bgBorderEnabled: boolean;
  bgBorderColor: string;
}

export const STUDIO_FONT_OPTIONS: { id: string; label: string; sample: string }[] = [
  { id: 'Cairo', label: 'القاهرة (عصري واضح)', sample: 'عرض خاص' },
  { id: 'Changa', label: 'شانجا (عريض جريء)', sample: 'عرض خاص' },
  { id: 'Tajawal', label: 'تجوال (أنيق ناعم)', sample: 'عرض خاص' },
  { id: 'Lalezar', label: 'لاليزار (إعلانات بارز)', sample: 'عرض خاص' },
  { id: 'Reem Kufi', label: 'ريم كوفي (كوفي فاخر)', sample: 'عرض خاص' },
  { id: 'Amiri', label: 'أميري (كلاسيك فخم)', sample: 'عرض خاص' },
  { id: 'Alexandria', label: 'إسكندرية (هندسي)', sample: 'عرض خاص' },
  { id: 'Readex Pro', label: 'ريدكس برو (متوازن)', sample: 'عرض خاص' },
  { id: 'Montserrat', label: 'لاتيني عريض', sample: 'SALE 25%' },
  { id: 'monospace', label: 'آلة كاتبة / كود', sample: 'SKU-2026' },
];

export interface WordArtPreset {
  id: string;
  label: string;
  patch: Partial<StudioTextLayer>;
}

export const WORDART_PRESETS: WordArtPreset[] = [
  {
    id: 'word_gold',
    label: 'ذهبي فاخر',
    patch: {
      fontFamily: 'Changa',
      fontWeight: '900',
      colorMode: 'gradient',
      gradientColors: ['#fef08a', '#f59e0b', '#b45309'],
      gradientDirection: 'vertical',
      strokeEnabled: true,
      strokeColor: '#451a03',
      strokeWidth: 5,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.55)',
      shadowBlur: 8,
      shadowOffsetX: 2,
      shadowOffsetY: 3,
      bgMode: 'none',
    },
  },
  {
    id: 'word_fire',
    label: 'ناري متدرج',
    patch: {
      fontFamily: 'Lalezar',
      fontWeight: '900',
      colorMode: 'gradient',
      gradientColors: ['#ef4444', '#f97316', '#facc15'],
      gradientDirection: 'horizontal',
      strokeEnabled: true,
      strokeColor: '#ffffff',
      strokeWidth: 5,
      shadowEnabled: true,
      shadowColor: 'rgba(124,45,18,0.45)',
      shadowBlur: 8,
      shadowOffsetX: 2,
      shadowOffsetY: 3,
      bgMode: 'none',
    },
  },
  {
    id: 'word_rainbow',
    label: 'ملون WordArt',
    patch: {
      fontFamily: 'Cairo',
      fontWeight: '900',
      colorMode: 'gradient',
      gradientColors: ['#ec4899', '#8b5cf6', '#06b6d4'],
      gradientDirection: 'diagonal',
      strokeEnabled: true,
      strokeColor: '#ffffff',
      strokeWidth: 6,
      shadowEnabled: true,
      shadowColor: 'rgba(15,23,42,0.45)',
      shadowBlur: 10,
      shadowOffsetX: 2,
      shadowOffsetY: 4,
      bgMode: 'none',
    },
  },
  {
    id: 'word_ocean',
    label: 'أزرق سماوي',
    patch: {
      fontFamily: 'Alexandria',
      fontWeight: '900',
      colorMode: 'gradient',
      gradientColors: ['#1d4ed8', '#0ea5e9', '#10b981'],
      gradientDirection: 'horizontal',
      strokeEnabled: true,
      strokeColor: '#ffffff',
      strokeWidth: 5,
      shadowEnabled: true,
      shadowColor: 'rgba(15,23,42,0.35)',
      shadowBlur: 6,
      shadowOffsetX: 1,
      shadowOffsetY: 2,
      bgMode: 'none',
    },
  },
  {
    id: 'badge_discount',
    label: 'شارة خصم',
    patch: {
      fontFamily: 'Cairo',
      fontWeight: '900',
      colorMode: 'solid',
      color: '#ffffff',
      strokeEnabled: false,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.35)',
      shadowBlur: 4,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      bgMode: 'gradient',
      bgGradientColors: ['#dc2626', '#ea580c'],
      bgOpacity: 96,
      bgPadding: 14,
      bgShape: 'pill',
      bgBorderEnabled: true,
      bgBorderColor: '#fef08a',
    },
  },
  {
    id: 'badge_dark_luxury',
    label: 'ملصق ليلي',
    patch: {
      fontFamily: 'Reem Kufi',
      fontWeight: 'bold',
      colorMode: 'gradient',
      gradientColors: ['#fef08a', '#fbbf24'],
      gradientDirection: 'horizontal',
      strokeEnabled: false,
      shadowEnabled: false,
      bgMode: 'solid',
      bgColor: '#0f172a',
      bgOpacity: 92,
      bgPadding: 14,
      bgShape: 'rounded',
      bgBorderEnabled: true,
      bgBorderColor: '#fbbf24',
    },
  },
  {
    id: 'word_classic_outline',
    label: 'أبيض بارز',
    patch: {
      fontFamily: 'Cairo',
      fontWeight: '900',
      colorMode: 'solid',
      color: '#ffffff',
      strokeEnabled: true,
      strokeColor: '#0f172a',
      strokeWidth: 7,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.5)',
      shadowBlur: 6,
      shadowOffsetX: 2,
      shadowOffsetY: 3,
      bgMode: 'none',
    },
  },
  {
    id: 'word_clean_card',
    label: 'شريط فاتح',
    patch: {
      fontFamily: 'Tajawal',
      fontWeight: 'bold',
      colorMode: 'solid',
      color: '#0f172a',
      strokeEnabled: false,
      shadowEnabled: false,
      bgMode: 'solid',
      bgColor: '#ffffff',
      bgOpacity: 92,
      bgPadding: 12,
      bgShape: 'rounded',
      bgBorderEnabled: true,
      bgBorderColor: '#ea580c',
    },
  },
];

export function createDefaultTextLayer(overrides?: Partial<StudioTextLayer>): StudioTextLayer {
  return {
    id: `txt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    text: 'خصم خاص',
    x: 0.5,
    y: 0.18,
    fontFamily: 'Cairo',
    fontSizePct: 12,
    fontWeight: '900',
    italic: false,
    underline: false,
    rotation: 0,
    opacity: 100,
    colorMode: 'gradient',
    color: '#ea580c',
    gradientColors: ['#f97316', '#ec4899', '#8b5cf6'],
    gradientDirection: 'horizontal',
    strokeEnabled: true,
    strokeColor: '#ffffff',
    strokeWidth: 5,
    shadowEnabled: true,
    shadowColor: 'rgba(15,23,42,0.45)',
    shadowBlur: 7,
    shadowOffsetX: 2,
    shadowOffsetY: 3,
    bgMode: 'none',
    bgColor: '#0f172a',
    bgGradientColors: ['#dc2626', '#ea580c'],
    bgOpacity: 90,
    bgPadding: 12,
    bgShape: 'rounded',
    bgBorderEnabled: false,
    bgBorderColor: '#ffffff',
    ...overrides,
  };
}

export function cloneTextLayers(layers: StudioTextLayer[]): StudioTextLayer[] {
  return layers.map((l) => ({
    ...l,
    gradientColors: [...l.gradientColors],
    bgGradientColors: [...l.bgGradientColors],
  }));
}

export function textLayersEqual(a: StudioTextLayer[], b: StudioTextLayer[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const la = a[i];
    const lb = b[i];
    if (
      la.id !== lb.id ||
      la.text !== lb.text ||
      la.x !== lb.x ||
      la.y !== lb.y ||
      la.fontFamily !== lb.fontFamily ||
      la.fontSizePct !== lb.fontSizePct ||
      la.fontWeight !== lb.fontWeight ||
      la.italic !== lb.italic ||
      la.underline !== lb.underline ||
      la.rotation !== lb.rotation ||
      la.opacity !== lb.opacity ||
      la.colorMode !== lb.colorMode ||
      la.color !== lb.color ||
      la.gradientDirection !== lb.gradientDirection ||
      la.strokeEnabled !== lb.strokeEnabled ||
      la.strokeColor !== lb.strokeColor ||
      la.strokeWidth !== lb.strokeWidth ||
      la.shadowEnabled !== lb.shadowEnabled ||
      la.shadowColor !== lb.shadowColor ||
      la.shadowBlur !== lb.shadowBlur ||
      la.shadowOffsetX !== lb.shadowOffsetX ||
      la.shadowOffsetY !== lb.shadowOffsetY ||
      la.bgMode !== lb.bgMode ||
      la.bgColor !== lb.bgColor ||
      la.bgOpacity !== lb.bgOpacity ||
      la.bgPadding !== lb.bgPadding ||
      la.bgShape !== lb.bgShape ||
      la.bgBorderEnabled !== lb.bgBorderEnabled ||
      la.bgBorderColor !== lb.bgBorderColor ||
      la.gradientColors.length !== lb.gradientColors.length ||
      la.bgGradientColors.length !== lb.bgGradientColors.length
    ) {
      return false;
    }
    for (let k = 0; k < la.gradientColors.length; k++) {
      if (la.gradientColors[k] !== lb.gradientColors[k]) return false;
    }
    for (let k = 0; k < la.bgGradientColors.length; k++) {
      if (la.bgGradientColors[k] !== lb.bgGradientColors[k]) return false;
    }
  }
  return true;
}

export interface StudioRenderOptions extends StudioTransformParams {
  sourceUrl: string;
  cropBox: [number, number, number, number]; // [ymin, xmin, ymax, xmax] in 0..1000
  backgroundColor?: string; // '#ffffff' default, '#rrggbb', or 'transparent'
  textLayers?: StudioTextLayer[];
  targetMaxDimension?: number;
  workingMaxSide?: number;
  quality?: number;
  outputFormat?: 'png' | 'jpeg';
}

function parseHexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return [r, g, b];
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return [r, g, b];
  }
  return null;
}

/**
 * Perceptual luminance + chrominance distance (shadow-tolerant: chroma weighted higher than luminance).
 */
function ycbcrDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  const dY = 0.299 * dr + 0.587 * dg + 0.114 * db;
  const dU = -0.1687 * dr - 0.3313 * dg + 0.5 * db;
  const dV = 0.5 * dr - 0.4187 * dg - 0.0813 * db;
  return Math.sqrt(0.45 * dY * dY + 1.85 * dU * dU + 1.85 * dV * dV);
}

function rasterizeStrokesToMask(
  strokes: StudioMaskStroke[],
  targetMode: 'keep' | 'bgMark',
  w: number,
  h: number
): Uint8Array | null {
  const matching = strokes.filter((s) => s.mode === targetMode && s.points.length > 0);
  if (matching.length === 0) return null;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const ctx = maskCanvas.getContext('2d');
  if (!ctx) return null;

  const maxDim = Math.max(w, h);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';

  for (const stroke of matching) {
    const radiusPx = Math.max(3, stroke.radiusNormalized * maxDim);
    ctx.lineWidth = radiusPx * 2;
    if (stroke.points.length === 1) {
      const p = stroke.points[0];
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, radiusPx, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * w, stroke.points[0].y * h);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * w, stroke.points[i].y * h);
      }
      ctx.stroke();
    }
  }

  const maskData = ctx.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    if (maskData[i * 4 + 3] > 25) mask[i] = 1;
  }
  return mask;
}

export interface PrecisionBgOptions {
  tolerance: number;
  edgeProtection: number; // 0..100
  feather: number; // 0..5
  protectCenter: boolean;
  keepMask?: Uint8Array | null;
  bgMarkMask?: Uint8Array | null;
  targetRemoveColors?: string[];
  enableBorderAutoRemove: boolean;
}

/**
 * Edge-aware precision background remover with Sobel contour barrier,
 * YCbCr shadow tolerance, user-drawn foreground protection ('keep'),
 * user-drawn background seeds ('bgMark'), picked color keying, and boundary defringing.
 */
export function removeBackgroundPrecision(
  imageData: ImageData,
  opts: PrecisionBgOptions
): void {
  const { width, height, data } = imageData;
  if (width < 4 || height < 4) return;

  const totalPixels = width * height;
  const keepMask = opts.keepMask || null;
  const bgMarkMask = opts.bgMarkMask || null;

  // 1. Precompute luminance & Sobel gradient edge barrier map
  const lum = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    lum[i] = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
  }

  const edgeMag = new Uint8Array(totalPixels);
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const p = row + x;
      const tl = lum[p - width - 1];
      const t = lum[p - width];
      const tr = lum[p - width + 1];
      const l = lum[p - 1];
      const r = lum[p + 1];
      const bl = lum[p + width - 1];
      const b = lum[p + width];
      const br = lum[p + width + 1];

      const gx = -tl + tr - 2 * l + 2 * r - bl + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      edgeMag[p] = Math.min(255, (Math.abs(gx) + Math.abs(gy)) >> 2);
    }
  }

  // 2. Collect representative background color clusters from borders + bgMarkMask
  const bgClusters: [number, number, number][] = [];
  const addClusterColor = (r: number, g: number, b: number, minGap = 24) => {
    for (const c of bgClusters) {
      if (ycbcrDist(r, g, b, c[0], c[1], c[2]) < minGap) return;
    }
    if (bgClusters.length < 10) bgClusters.push([r, g, b]);
  };

  if (opts.enableBorderAutoRemove) {
    const stepX = Math.max(1, Math.floor(width / 18));
    const stepY = Math.max(1, Math.floor(height / 18));
    const borderSamples: [number, number, number][] = [];

    for (let x = 0; x < width; x += stepX) {
      for (const y of [0, height - 1]) {
        const pos = y * width + x;
        if (keepMask && keepMask[pos]) continue;
        const idx = pos * 4;
        if (data[idx + 3] > 20) borderSamples.push([data[idx], data[idx + 1], data[idx + 2]]);
      }
    }
    for (let y = 0; y < height; y += stepY) {
      for (const x of [0, width - 1]) {
        const pos = y * width + x;
        if (keepMask && keepMask[pos]) continue;
        const idx = pos * 4;
        if (data[idx + 3] > 20) borderSamples.push([data[idx], data[idx + 1], data[idx + 2]]);
      }
    }

    // Rank border colors by frequency so dominant background tones lead
    const scored = borderSamples.map((s) => {
      let count = 0;
      for (const o of borderSamples) {
        if (ycbcrDist(s[0], s[1], s[2], o[0], o[1], o[2]) <= 26) count++;
      }
      return { s, count };
    });
    scored.sort((a, b) => b.count - a.count);
    for (const item of scored) {
      if (item.count >= Math.max(2, Math.floor(borderSamples.length * 0.1))) {
        addClusterColor(item.s[0], item.s[1], item.s[2], 22);
      }
      if (bgClusters.length >= 4) break;
    }
    if (bgClusters.length === 0 && scored.length > 0) {
      addClusterColor(scored[0].s[0], scored[0].s[1], scored[0].s[2], 20);
    }
  }

  // Sample foreground colors from user's 'keep' brush strokes so white-on-white / similar colors stay protected
  const fgPalette: [number, number, number][] = [];
  if (keepMask) {
    const stride = Math.max(1, Math.floor(totalPixels / 8000));
    for (let pos = 0; pos < totalPixels; pos += stride) {
      if (!keepMask[pos]) continue;
      const idx = pos * 4;
      if (data[idx + 3] < 30) continue;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      let found = false;
      for (const f of fgPalette) {
        if (ycbcrDist(r, g, b, f[0], f[1], f[2]) < 22) {
          found = true;
          break;
        }
      }
      if (!found) {
        fgPalette.push([r, g, b]);
        if (fgPalette.length >= 16) break;
      }
    }
  }

  // Sample extra background colors from user's 'bgMark' strokes
  if (bgMarkMask) {
    const stride = Math.max(1, Math.floor(totalPixels / 8000));
    for (let pos = 0; pos < totalPixels; pos += stride) {
      if (!bgMarkMask[pos]) continue;
      const idx = pos * 4;
      if (data[idx + 3] < 20) continue;
      addClusterColor(data[idx], data[idx + 1], data[idx + 2], 18);
    }
  }

  // Parsed user-picked target colors to erase
  const targetColorsRgb: [number, number, number][] = [];
  if (opts.targetRemoveColors && opts.targetRemoveColors.length > 0) {
    for (const hex of opts.targetRemoveColors) {
      const rgb = parseHexToRgb(hex);
      if (rgb) targetColorsRgb.push(rgb);
    }
  }

  const maxDist = Math.max(10, opts.tolerance * 1.9);
  const edgeStrength = (opts.edgeProtection ?? 65) / 100;
  const cx = width / 2;
  const cy = height / 2;

  const nearestBgDist = (r: number, g: number, b: number): { dist: number; rgb: [number, number, number] } => {
    let best = Infinity;
    let bestRgb: [number, number, number] = [255, 255, 255];
    for (const c of bgClusters) {
      const d = ycbcrDist(r, g, b, c[0], c[1], c[2]);
      if (d < best) {
        best = d;
        bestRgb = c;
      }
    }
    return { dist: best, rgb: bestRgb };
  };

  const nearestFgDist = (r: number, g: number, b: number): number => {
    if (fgPalette.length === 0) return Infinity;
    let best = Infinity;
    for (const f of fgPalette) {
      const d = ycbcrDist(r, g, b, f[0], f[1], f[2]);
      if (d < best) best = d;
    }
    return best;
  };

  const isBg = new Uint8Array(totalPixels);
  const bgDistMap = new Float32Array(totalPixels);
  bgDistMap.fill(999);
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  const trySeed = (pos: number, forceSeed: boolean) => {
    if (visited[pos]) return;
    if (keepMask && keepMask[pos]) return;

    const idx = pos * 4;
    if (data[idx + 3] === 0) {
      visited[pos] = 1;
      isBg[pos] = 1;
      bgDistMap[pos] = 0;
      queue[tail++] = pos;
      return;
    }

    if (forceSeed) {
      visited[pos] = 1;
      isBg[pos] = 1;
      bgDistMap[pos] = 0;
      queue[tail++] = pos;
      return;
    }

    if (bgClusters.length === 0) return;
    const { dist } = nearestBgDist(data[idx], data[idx + 1], data[idx + 2]);
    if (dist <= maxDist * 1.15) {
      visited[pos] = 1;
      isBg[pos] = 1;
      bgDistMap[pos] = dist;
      queue[tail++] = pos;
    }
  };

  // Seed borders if auto background remove is active
  if (opts.enableBorderAutoRemove && bgClusters.length > 0) {
    for (let x = 0; x < width; x++) {
      trySeed(x, false);
      trySeed((height - 1) * width + x, false);
    }
    for (let y = 1; y < height - 1; y++) {
      trySeed(y * width, false);
      trySeed(y * width + (width - 1), false);
    }
  }

  // Seed explicit user 'bgMark' strokes
  if (bgMarkMask) {
    for (let pos = 0; pos < totalPixels; pos++) {
      if (bgMarkMask[pos]) {
        trySeed(pos, true);
      }
    }
  }

  // 3. Edge-Aware BFS propagation (stops at Sobel product contours & foreground-matched colors)
  while (head < tail) {
    const pos = queue[head++];
    const x = pos % width;
    const y = (pos - x) / width;
    const pIdx = pos * 4;
    const pR = data[pIdx];
    const pG = data[pIdx + 1];
    const pB = data[pIdx + 2];

    const checkNeighbor = (npos: number, nx: number, ny: number) => {
      if (visited[npos]) return;
      if (keepMask && keepMask[npos]) return;

      const idx = npos * 4;
      if (data[idx + 3] === 0) {
        visited[npos] = 1;
        isBg[npos] = 1;
        bgDistMap[npos] = 0;
        queue[tail++] = npos;
        return;
      }

      const nr = data[idx];
      const ng = data[idx + 1];
      const nb = data[idx + 2];

      const { dist: bgDist } = nearestBgDist(nr, ng, nb);
      const localStep = ycbcrDist(pR, pG, pB, nr, ng, nb);

      // Center protection dampens penetration across subtle interior boundaries unless user marked bgMark
      let centerFactor = 1;
      if (opts.protectCenter && !(bgMarkMask && bgMarkMask[npos])) {
        const dxN = (nx - cx) / Math.max(1, cx);
        const dyN = (ny - cy) / Math.max(1, cy);
        const radial = dxN * dxN + dyN * dyN; // < 0.45 is interior product zone
        if (radial < 0.45) centerFactor = 0.78;
      }

      // Sobel edge barrier: strong edge drastically restricts flood threshold
      const edgePenalty = edgeMag[npos] * (0.48 * edgeStrength) * (centerFactor < 1 ? 1.3 : 1);
      const allowedDist = Math.max(6, maxDist * centerFactor - edgePenalty);

      // Foreground comparison if user drew 'keep' product markers
      if (fgPalette.length > 0) {
        const fgDist = nearestFgDist(nr, ng, nb);
        if (fgDist + 8 < bgDist && !(bgMarkMask && bgMarkMask[npos])) {
          return;
        }
      }

      const matchesGlobal = bgDist <= allowedDist;
      const matchesSmoothGradient =
        localStep <= 11 && bgDist <= allowedDist * 1.32 && edgeMag[npos] < 24;

      if (matchesGlobal || matchesSmoothGradient) {
        visited[npos] = 1;
        isBg[npos] = 1;
        bgDistMap[npos] = bgDist;
        queue[tail++] = npos;
      }
    };

    if (x > 0) checkNeighbor(pos - 1, x - 1, y);
    if (x < width - 1) checkNeighbor(pos + 1, x + 1, y);
    if (y > 0) checkNeighbor(pos - width, x, y - 1);
    if (y < height - 1) checkNeighbor(pos + width, x, y + 1);
  }

  // 4. Target Color Keying (if user picked specific colors to erase via dropper/palette)
  if (targetColorsRgb.length > 0) {
    const keyMax = Math.max(10, opts.tolerance * 1.45);
    for (let pos = 0; pos < totalPixels; pos++) {
      if (isBg[pos]) continue;
      if (keepMask && keepMask[pos]) continue;
      const idx = pos * 4;
      if (data[idx + 3] === 0) continue;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      let best = Infinity;
      for (const tc of targetColorsRgb) {
        const d = ycbcrDist(r, g, b, tc[0], tc[1], tc[2]);
        if (d < best) best = d;
      }
      if (best <= keyMax) {
        isBg[pos] = 1;
        bgDistMap[pos] = best;
      }
    }
  }

  // 5. Pinhole cleanup: restore isolated 1-pixel holes inside solid foreground
  const cleanedBg = new Uint8Array(isBg);
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const pos = row + x;
      if (keepMask && keepMask[pos]) {
        cleanedBg[pos] = 0;
        continue;
      }
      if (bgMarkMask && bgMarkMask[pos]) {
        cleanedBg[pos] = 1;
        continue;
      }
      if (isBg[pos] === 1) {
        const fgNeighbors =
          (1 - isBg[pos - 1]) +
          (1 - isBg[pos + 1]) +
          (1 - isBg[pos - width]) +
          (1 - isBg[pos + width]);
        if (fgNeighbors >= 3) cleanedBg[pos] = 0;
      }
    }
  }

  // 6. Apply Alpha + Soft Feathering + Color Defringing around product silhouette
  const featherRadius = Math.max(0, Math.min(4, Math.round(opts.feather ?? 2)));
  const mainBgRgb: [number, number, number] = bgClusters[0] || [255, 255, 255];

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const pos = row + x;
      const idx = pos * 4;
      if (data[idx + 3] === 0) continue;

      if (cleanedBg[pos] === 1) {
        data[idx + 3] = 0;
        continue;
      }

      if (featherRadius > 0 && x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        // Check proximity to removed background to anti-alias edges cleanly
        let bgNeighborCount = 0;
        const rSpan = Math.min(2, featherRadius);
        let totalChecked = 0;
        for (let dy = -rSpan; dy <= rSpan; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -rSpan; dx <= rSpan; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            totalChecked++;
            if (cleanedBg[ny * width + nx] === 1) bgNeighborCount++;
          }
        }

        if (bgNeighborCount > 0 && totalChecked > 0) {
          const bgRatio = bgNeighborCount / totalChecked;
          // Gently soften only outer silhouette fringe pixels
          if (bgRatio >= 0.22) {
            const keepFactor = Math.max(0.28, 1 - bgRatio * (0.45 + featherRadius * 0.08));
            const newAlpha = Math.round(data[idx + 3] * keepFactor);
            data[idx + 3] = newAlpha;

            // Defringe halo: pull color away from background tint
            const af = Math.max(0.45, newAlpha / 255);
            data[idx] = Math.max(0, Math.min(255, Math.round((data[idx] - (1 - af) * mainBgRgb[0]) / af)));
            data[idx + 1] = Math.max(0, Math.min(255, Math.round((data[idx + 1] - (1 - af) * mainBgRgb[1]) / af)));
            data[idx + 2] = Math.max(0, Math.min(255, Math.round((data[idx + 2] - (1 - af) * mainBgRgb[2]) / af)));
          }
        }
      }
    }
  }
}

/**
 * Legacy simple solid background helper alias kept for compatibility.
 */
export function removeSolidBackgroundSmart(imageData: ImageData, tolerance: number): void {
  removeBackgroundPrecision(imageData, {
    tolerance,
    edgeProtection: 65,
    feather: 2,
    protectCenter: true,
    enableBorderAutoRemove: true,
  });
}

/**
 * Draws the transformed base image (rotation, flip, color filters, precision bg removal,
 * manual erase/restore/colored paint strokes, and optional editor guide overlays).
 */
export function buildTransformedStudioCanvas(
  img: HTMLImageElement,
  params: StudioTransformParams,
  maxWorkingSide: number = 960
): HTMLCanvasElement {
  const rawW = img.naturalWidth || img.width;
  const rawH = img.naturalHeight || img.height;
  const downScale = Math.min(1, maxWorkingSide / Math.max(rawW, rawH));
  const w = Math.max(1, Math.round(rawW * downScale));
  const h = Math.max(1, Math.round(rawH * downScale));

  const rad = (params.rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const rotW = Math.max(1, Math.round(w * cos + h * sin));
  const rotH = Math.max(1, Math.round(w * sin + h * cos));

  // 1. Original transformed image (kept for 'restore' brush strokes)
  const originalTransformed = document.createElement('canvas');
  originalTransformed.width = rotW;
  originalTransformed.height = rotH;
  const oCtx = originalTransformed.getContext('2d')!;
  oCtx.imageSmoothingEnabled = true;
  oCtx.imageSmoothingQuality = 'high';
  oCtx.save();
  oCtx.translate(rotW / 2, rotH / 2);
  oCtx.rotate(rad);
  oCtx.scale(params.flipH ? -1 : 1, params.flipV ? -1 : 1);
  if (params.brightness !== 100 || params.contrast !== 100 || params.saturation !== 100) {
    oCtx.filter = `brightness(${params.brightness}%) contrast(${params.contrast}%) saturate(${params.saturation}%)`;
  }
  oCtx.drawImage(img, -w / 2, -h / 2, w, h);
  oCtx.restore();

  // 2. Working canvas
  const workCanvas = document.createElement('canvas');
  workCanvas.width = rotW;
  workCanvas.height = rotH;
  const wCtx = workCanvas.getContext('2d')!;
  wCtx.drawImage(originalTransformed, 0, 0);

  const strokes = params.strokes || [];
  const hasKeepStrokes = strokes.some((s) => s.mode === 'keep' && s.points.length > 0);
  const hasBgMarkStrokes = strokes.some((s) => s.mode === 'bgMark' && s.points.length > 0);
  const hasTargetColors = !!(params.targetRemoveColors && params.targetRemoveColors.length > 0);

  if (params.autoBgRemove || hasBgMarkStrokes || hasTargetColors) {
    const keepMask = hasKeepStrokes ? rasterizeStrokesToMask(strokes, 'keep', rotW, rotH) : null;
    const bgMarkMask = hasBgMarkStrokes ? rasterizeStrokesToMask(strokes, 'bgMark', rotW, rotH) : null;
    const imgData = wCtx.getImageData(0, 0, rotW, rotH);
    removeBackgroundPrecision(imgData, {
      tolerance: params.bgTolerance,
      edgeProtection: params.edgeProtection ?? 65,
      feather: params.bgFeather ?? 2,
      protectCenter: params.protectCenter ?? true,
      keepMask,
      bgMarkMask,
      targetRemoveColors: params.targetRemoveColors,
      enableBorderAutoRemove: params.autoBgRemove,
    });
    wCtx.putImageData(imgData, 0, 0);
  }

  // 3. Apply manual erase / restore / colored paint brush strokes in chronological order
  const maxDim = Math.max(rotW, rotH);
  for (const stroke of strokes) {
    if (!stroke.points || stroke.points.length === 0) continue;
    if (stroke.mode === 'keep' || stroke.mode === 'bgMark') continue;
    const radiusPx = Math.max(3, stroke.radiusNormalized * maxDim);

    if (stroke.mode === 'erase') {
      wCtx.save();
      wCtx.globalCompositeOperation = 'destination-out';
      wCtx.lineCap = 'round';
      wCtx.lineJoin = 'round';
      wCtx.strokeStyle = 'rgba(0,0,0,1)';
      wCtx.fillStyle = 'rgba(0,0,0,1)';
      wCtx.lineWidth = radiusPx * 2;

      if (stroke.points.length === 1) {
        const p = stroke.points[0];
        wCtx.beginPath();
        wCtx.arc(p.x * rotW, p.y * rotH, radiusPx, 0, Math.PI * 2);
        wCtx.fill();
      } else {
        wCtx.beginPath();
        wCtx.moveTo(stroke.points[0].x * rotW, stroke.points[0].y * rotH);
        for (let i = 1; i < stroke.points.length; i++) {
          wCtx.lineTo(stroke.points[i].x * rotW, stroke.points[i].y * rotH);
        }
        wCtx.stroke();
      }
      wCtx.restore();
    } else if (stroke.mode === 'paint') {
      wCtx.save();
      wCtx.globalCompositeOperation = 'source-over';
      wCtx.globalAlpha = Math.max(0.1, Math.min(1, stroke.opacity ?? 1));
      wCtx.lineCap = 'round';
      wCtx.lineJoin = 'round';
      const paintColor = stroke.color || '#ffffff';
      wCtx.strokeStyle = paintColor;
      wCtx.fillStyle = paintColor;
      wCtx.lineWidth = radiusPx * 2;

      if (stroke.points.length === 1) {
        const p = stroke.points[0];
        wCtx.beginPath();
        wCtx.arc(p.x * rotW, p.y * rotH, radiusPx, 0, Math.PI * 2);
        wCtx.fill();
      } else {
        wCtx.beginPath();
        wCtx.moveTo(stroke.points[0].x * rotW, stroke.points[0].y * rotH);
        for (let i = 1; i < stroke.points.length; i++) {
          wCtx.lineTo(stroke.points[i].x * rotW, stroke.points[i].y * rotH);
        }
        wCtx.stroke();
      }
      wCtx.restore();
    } else if (stroke.mode === 'restore') {
      wCtx.save();
      wCtx.beginPath();
      if (stroke.points.length === 1) {
        const p = stroke.points[0];
        wCtx.arc(p.x * rotW, p.y * rotH, radiusPx, 0, Math.PI * 2);
      } else {
        for (let i = 0; i < stroke.points.length; i++) {
          const p = stroke.points[i];
          wCtx.moveTo(p.x * rotW + radiusPx, p.y * rotH);
          wCtx.arc(p.x * rotW, p.y * rotH, radiusPx, 0, Math.PI * 2);
          if (i > 0) {
            const prev = stroke.points[i - 1];
            const steps = Math.max(
              1,
              Math.ceil(Math.hypot((p.x - prev.x) * rotW, (p.y - prev.y) * rotH) / Math.max(2, radiusPx * 0.35))
            );
            for (let s = 1; s < steps; s++) {
              const t = s / steps;
              const ix = (prev.x + (p.x - prev.x) * t) * rotW;
              const iy = (prev.y + (p.y - prev.y) * t) * rotH;
              wCtx.moveTo(ix + radiusPx, iy);
              wCtx.arc(ix, iy, radiusPx, 0, Math.PI * 2);
            }
          }
        }
      }
      wCtx.clip();
      wCtx.drawImage(originalTransformed, 0, 0);
      wCtx.restore();
    }
  }

  // 4. Optional guide strokes visualization ONLY in editor preview (never exported)
  if (params.showMaskGuides && (hasKeepStrokes || hasBgMarkStrokes)) {
    for (const stroke of strokes) {
      if (stroke.mode !== 'keep' && stroke.mode !== 'bgMark') continue;
      if (stroke.points.length === 0) continue;
      const radiusPx = Math.max(3, stroke.radiusNormalized * maxDim);
      wCtx.save();
      wCtx.globalCompositeOperation = 'source-over';
      wCtx.globalAlpha = 0.42;
      wCtx.lineCap = 'round';
      wCtx.lineJoin = 'round';
      const guideColor = stroke.mode === 'keep' ? '#10b981' : '#ef4444';
      wCtx.strokeStyle = guideColor;
      wCtx.fillStyle = guideColor;
      wCtx.lineWidth = radiusPx * 2;
      if (stroke.points.length === 1) {
        const p = stroke.points[0];
        wCtx.beginPath();
        wCtx.arc(p.x * rotW, p.y * rotH, radiusPx, 0, Math.PI * 2);
        wCtx.fill();
      } else {
        wCtx.beginPath();
        wCtx.moveTo(stroke.points[0].x * rotW, stroke.points[0].y * rotH);
        for (let i = 1; i < stroke.points.length; i++) {
          wCtx.lineTo(stroke.points[i].x * rotW, stroke.points[i].y * rotH);
        }
        wCtx.stroke();
      }
      wCtx.restore();
    }
  }

  return workCanvas;
}

/**
 * Renders the final cropped, rotated, background-cleaned, and custom-background-composited catalog product image.
 * Supports solid hex backgrounds (e.g. '#ffffff', '#0f172a', '#fff7ed') or 'transparent' (exports PNG).
 */
export async function renderStudioImage(options: StudioRenderOptions): Promise<string> {
  const img = await loadImage(options.sourceUrl);
  const baseCanvas = buildTransformedStudioCanvas(
    img,
    { ...options, showMaskGuides: false },
    options.workingMaxSide ?? 1100
  );
  const bw = baseCanvas.width;
  const bh = baseCanvas.height;

  const [ymin, xmin, ymax, xmax] = options.cropBox;
  const sx = Math.max(0, Math.floor((xmin / 1000) * bw));
  const sy = Math.max(0, Math.floor((ymin / 1000) * bh));
  const sw = Math.max(10, Math.min(bw - sx, Math.ceil(((xmax - xmin) / 1000) * bw)));
  const sh = Math.max(10, Math.min(bh - sy, Math.ceil(((ymax - ymin) / 1000) * bh)));

  const maxOut = options.targetMaxDimension || 560;
  const outScale = Math.min(1.5, maxOut / Math.max(sw, sh));
  const outW = Math.max(1, Math.round(sw * outScale));
  const outH = Math.max(1, Math.round(sh * outScale));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const ctx = outCanvas.getContext('2d')!;

  const bgColor = options.backgroundColor || '#ffffff';
  const isTransparent = bgColor === 'transparent';

  if (!isTransparent) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, outW, outH);
  } else {
    ctx.clearRect(0, 0, outW, outH);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(baseCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

  if (options.textLayers && options.textLayers.length > 0) {
    drawStudioTextLayers(ctx, outW, outH, options.textLayers);
  }

  return isTransparent || options.outputFormat === 'png'
    ? outCanvas.toDataURL('image/png')
    : outCanvas.toDataURL('image/jpeg', options.quality ?? 0.88);
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function buildDirectionalGradient(
  ctx: CanvasRenderingContext2D,
  colors: string[],
  direction: TextGradientDirection,
  spanW: number,
  spanH: number
): CanvasGradient | string {
  const valid = colors.filter(Boolean);
  if (valid.length === 0) return '#0f172a';
  if (valid.length === 1) return valid[0];

  const hw = Math.max(4, spanW / 2);
  const hh = Math.max(4, spanH / 2);
  let grad: CanvasGradient;
  if (direction === 'vertical') {
    grad = ctx.createLinearGradient(0, -hh, 0, hh);
  } else if (direction === 'diagonal') {
    grad = ctx.createLinearGradient(-hw, -hh, hw, hh);
  } else {
    grad = ctx.createLinearGradient(-hw, 0, hw, 0);
  }
  valid.forEach((c, idx) => {
    grad.addColorStop(idx / (valid.length - 1), c);
  });
  return grad;
}

export function measureStudioTextLayerBox(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  layer: StudioTextLayer
): { boxW: number; boxH: number; fontSizePx: number; lineHeight: number; maxLineW: number; lines: string[] } {
  const minDim = Math.max(40, Math.min(width, height));
  const fontSizePx = Math.max(10, (layer.fontSizePct / 100) * minDim);
  const weight = layer.fontWeight === '900' ? '900' : layer.fontWeight === 'bold' ? '700' : '400';
  ctx.font = `${layer.italic ? 'italic ' : ''}${weight} ${fontSizePx}px "${layer.fontFamily}", "Cairo", sans-serif`;

  const lines = (layer.text || '').split('\n');
  let maxLineW = fontSizePx * 0.6;
  for (const line of lines) {
    const w = ctx.measureText(line || ' ').width;
    if (w > maxLineW) maxLineW = w;
  }
  const lineHeight = fontSizePx * 1.24;
  const totalTextH = Math.max(lineHeight, lines.length * lineHeight);

  const hasBg = layer.bgMode !== 'none';
  const padY = hasBg ? (layer.bgPadding / 100) * fontSizePx * 1.9 + fontSizePx * 0.14 : fontSizePx * 0.16;
  const padX = hasBg ? (layer.bgPadding / 100) * fontSizePx * 2.8 + fontSizePx * 0.35 : fontSizePx * 0.24;

  return {
    boxW: maxLineW + padX * 2,
    boxH: totalTextH + padY * 2,
    fontSizePx,
    lineHeight,
    maxLineW,
    lines,
  };
}

/**
 * Renders all WordArt / styled text layers onto a 2D canvas of size (width x height).
 * Coordinates layer.x / layer.y are normalized 0..1 relative to (width, height).
 */
export function drawStudioTextLayers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  textLayers: StudioTextLayer[]
): void {
  if (!textLayers || textLayers.length === 0) return;

  for (const layer of textLayers) {
    if (!layer.text || !layer.text.trim()) continue;

    ctx.save();
    const { boxW, boxH, fontSizePx, lineHeight, maxLineW, lines } = measureStudioTextLayerBox(
      ctx,
      width,
      height,
      layer
    );
    const totalTextH = lines.length * lineHeight;
    const cx = layer.x * width;
    const cy = layer.y * height;

    ctx.translate(cx, cy);
    if (layer.rotation) {
      ctx.rotate((layer.rotation * Math.PI) / 180);
    }
    ctx.globalAlpha = Math.max(0.05, Math.min(1, layer.opacity / 100));

    // 1. Optional Background Box (solid or multi-color gradient)
    if (layer.bgMode !== 'none') {
      ctx.save();
      ctx.globalAlpha *= Math.max(0.05, Math.min(1, layer.bgOpacity / 100));
      const radius =
        layer.bgShape === 'sharp'
          ? 0
          : layer.bgShape === 'pill'
            ? Math.min(boxW, boxH) / 2
            : Math.min(boxW, boxH) * 0.24;

      drawRoundedRectPath(ctx, -boxW / 2, -boxH / 2, boxW, boxH, radius);

      if (layer.bgMode === 'gradient') {
        ctx.fillStyle = buildDirectionalGradient(
          ctx,
          layer.bgGradientColors,
          layer.gradientDirection,
          boxW,
          boxH
        );
      } else {
        ctx.fillStyle = layer.bgColor || '#0f172a';
      }
      ctx.fill();

      if (layer.bgBorderEnabled) {
        ctx.lineWidth = Math.max(1.5, fontSizePx * 0.08);
        ctx.strokeStyle = layer.bgBorderColor || '#ffffff';
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Font & Direction Setup
    const weight = layer.fontWeight === '900' ? '900' : layer.fontWeight === 'bold' ? '700' : '400';
    ctx.font = `${layer.italic ? 'italic ' : ''}${weight} ${fontSizePx}px "${layer.fontFamily}", "Cairo", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    try {
      ctx.direction = /[\u0600-\u06FF]/.test(layer.text) ? 'rtl' : 'ltr';
    } catch {
      // ignore on older canvas implementations
    }

    const fillStyle: CanvasGradient | string =
      layer.colorMode === 'gradient'
        ? buildDirectionalGradient(
            ctx,
            layer.gradientColors,
            layer.gradientDirection,
            maxLineW,
            totalTextH
          )
        : layer.color || '#ffffff';

    const shadowScale = Math.max(0.5, fontSizePx / 32);
    const applyShadow = () => {
      if (!layer.shadowEnabled) return;
      ctx.shadowColor = layer.shadowColor || 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = Math.max(0, layer.shadowBlur * shadowScale);
      ctx.shadowOffsetX = layer.shadowOffsetX * shadowScale;
      ctx.shadowOffsetY = layer.shadowOffsetY * shadowScale;
    };
    const clearShadow = () => {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    };

    const startY = -totalTextH / 2 + lineHeight / 2;

    // 3. WordArt Outline / Stroke (with shadow cast cleanly behind outline)
    if (layer.strokeEnabled && layer.strokeWidth > 0) {
      ctx.save();
      applyShadow();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.miterLimit = 2;
      ctx.lineWidth = Math.max(1.5, (layer.strokeWidth / 12) * fontSizePx * 0.34);
      ctx.strokeStyle = layer.strokeColor || '#0f172a';
      lines.forEach((line, idx) => {
        if (!line) return;
        ctx.strokeText(line, 0, startY + idx * lineHeight);
      });
      ctx.restore();
    }

    // 4. Text Fill (solid or multi-color gradient)
    ctx.save();
    if (!layer.strokeEnabled || layer.strokeWidth <= 0) {
      applyShadow();
    } else {
      clearShadow();
    }
    ctx.fillStyle = fillStyle;
    lines.forEach((line, idx) => {
      if (!line) return;
      const ly = startY + idx * lineHeight;
      ctx.fillText(line, 0, ly);

      if (layer.underline) {
        const lw = ctx.measureText(line).width;
        const barH = Math.max(1.5, fontSizePx * 0.085);
        clearShadow();
        ctx.fillRect(-lw / 2, ly + fontSizePx * 0.44, lw, barH);
      }
    });
    ctx.restore();

    ctx.restore();
  }
}


