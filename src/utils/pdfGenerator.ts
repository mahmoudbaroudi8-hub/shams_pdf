import { jsPDF } from 'jspdf';
import {
  Product,
  CatalogSettings,
  DEFAULT_CATEGORIES,
  SavedCatalog,
  CatalogSectionHeader,
  CatalogSectionHeaderConfig,
  DEFAULT_SECTION_HEADER_CONFIG,
  CatalogCardConfig,
  DEFAULT_CARD_CONFIG,
  CompanyPhoneItem,
  GridSymmetryMode,
} from '../types';

export const CANVAS_WIDTH = 1240;
export const CANVAS_HEIGHT = 1754;

/**
 * Preloads Arabic custom web fonts (Cairo, Tajawal) and waits for completion
 */
export async function ensureFontsLoaded(): Promise<void> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready;
      await Promise.all([
        document.fonts.load('bold 32px Cairo'),
        document.fonts.load('700 22px Cairo'),
        document.fonts.load('600 18px Cairo'),
        document.fonts.load('500 15px Cairo'),
        document.fonts.load('400 14px Cairo'),
        document.fonts.load('bold 24px Tajawal'),
        document.fonts.load('500 16px Tajawal'),
      ]);
    } catch (e) {
      console.warn('Font loading notice:', e);
    }
  }
}

/**
 * Loads an image URL into an HTMLImageElement once
 */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    let settled = false;
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:') && !src.startsWith('/')) {
      img.crossOrigin = 'anonymous';
    }
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 4500);
    img.onload = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(img);
      }
    };
    img.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    };
    img.src = src;
  });
}

/**
 * Compresses and downscales large images before PDF rendering (Requirement 5)
 * If image width/height exceeds maxDimension (e.g. 400px), it is resized onto an offscreen
 * canvas and converted to lightweight JPEG (0.8 quality) to keep the PDF file size small.
 */
export async function loadAndCompressImage(
  src: string,
  maxDimension = 400,
  quality = 0.8
): Promise<HTMLImageElement | null> {
  const rawImg = await loadImage(src);
  if (!rawImg) return null;

  // If already small enough (within bounds), keep as is
  if (rawImg.width <= maxDimension && rawImg.height <= maxDimension) {
    return rawImg;
  }

  try {
    const scale = Math.min(maxDimension / rawImg.width, maxDimension / rawImg.height);
    const targetW = Math.max(1, Math.round(rawImg.width * scale));
    const targetH = Math.max(1, Math.round(rawImg.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawImg;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(rawImg, 0, 0, targetW, targetH);

    const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
    canvas.width = 1;
    canvas.height = 1;

    const compressedImg = await loadImage(compressedDataUrl);
    return compressedImg || rawImg;
  } catch {
    return rawImg;
  }
}

/**
 * Preloads all product images and logo into an in-memory cache,
 * automatically compressing large images for optimized PDF performance.
 */
export async function preloadImagesCache(
  products: Product[],
  logoUrl?: string,
  maxProductDimension: number = 400
): Promise<Map<string, HTMLImageElement>> {
  const cache = new Map<string, HTMLImageElement>();
  const urlsToLoad = new Set<string>();

  if (logoUrl) urlsToLoad.add(logoUrl);
  for (const p of products) {
    if (p.image_url) urlsToLoad.add(p.image_url);
  }

  const entries = Array.from(urlsToLoad);
  const promises = entries.map(async (url) => {
    const isLogo = url === logoUrl;
    // Compress and downscale product images to keep PDF size small (higher res allowed for 2x PNG)
    const img = isLogo
      ? await loadImage(url)
      : await loadAndCompressImage(url, maxProductDimension, maxProductDimension > 450 ? 0.9 : 0.8);
    if (img) cache.set(url, img);
  });

  await Promise.all(promises);
  return cache;
}

/**
 * Calculates text wrapping in Canvas 2D with Arabic RTL support
 */
export function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number = 2
): string[] {
  if (!text) return [];
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine ? `${currentLine} ${words[i]}` : words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = words[i];
      if (lines.length === maxLines - 1) {
        // Last allowed line: append remaining words or truncate with ...
        const remaining = words.slice(i).join(' ');
        let lastLine = remaining;
        while (ctx.measureText(`${lastLine}...`).width > maxWidth && lastLine.length > 3) {
          lastLine = lastLine.slice(0, -1).trim();
        }
        lines.push(`${lastLine}...`);
        return lines;
      }
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Helper to draw rounded rectangle in Canvas
 */
export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string,
  stroke?: string,
  lineWidth: number = 1
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws image with aspect ratio 'contain' centered inside bounding box
 */
export function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  zoomScale: number = 1,
  fitMode: 'contain' | 'cover' = 'contain'
) {
  if (!img.width || !img.height || w <= 0 || h <= 0) return;
  const hRatio = w / img.width;
  const vRatio = h / img.height;
  const baseRatio = fitMode === 'cover' ? Math.max(hRatio, vRatio) : Math.min(hRatio, vRatio);
  const ratio = baseRatio * Math.max(0.5, Math.min(2, zoomScale || 1));
  const drawW = img.width * ratio;
  const drawH = img.height * ratio;
  const drawX = x + (w - drawW) / 2;
  const drawY = y + (h - drawH) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.restore();
}

export type CatalogPageItem =
  | { type: 'product'; product: Product }
  | {
      type: 'header';
      title: string;
      subtitle?: string;
      count?: number;
      color?: string;
      pageBreakBefore?: boolean;
      isCategoryAuto?: boolean;
    };

export function resolveSectionHeaderConfig(
  settings: CatalogSettings,
  customCatalog?: SavedCatalog | CustomCatalogOptions
): CatalogSectionHeaderConfig {
  return {
    ...DEFAULT_SECTION_HEADER_CONFIG,
    ...(settings.section_header_config || {}),
    ...(customCatalog?.section_header_config || {}),
    overrides: {
      ...(settings.section_header_config?.overrides || {}),
      ...(customCatalog?.section_header_config?.overrides || {}),
    },
  };
}

export function resolveCardConfig(
  settings: CatalogSettings,
  customCatalog?: SavedCatalog | CustomCatalogOptions
): CatalogCardConfig {
  return {
    ...DEFAULT_CARD_CONFIG,
    ...(settings.card_config || {}),
    ...(customCatalog?.card_config || {}),
    per_product_overrides: {
      ...(settings.card_config?.per_product_overrides || {}),
      ...(customCatalog?.card_config?.per_product_overrides || {}),
    },
  };
}

/**
 * Splits items into pages based on products_per_row, rows_per_page, and section headers.
 * Section headers span full width and will NEVER be stranded alone at the bottom of a page.
 */
export function paginateCatalogPageItems(
  items: CatalogPageItem[],
  productsPerRow: number = 4,
  rowsPerPage?: number,
  sectionConfig?: CatalogSectionHeaderConfig
): CatalogPageItem[][] {
  const maxRowsPerPage = rowsPerPage && rowsPerPage >= 1 ? rowsPerPage : (productsPerRow === 4 ? 4 : 3);
  const size = sectionConfig?.size || 'md';
  const headerWeight = size === 'sm' ? 0.34 : size === 'lg' ? 0.56 : 0.44;
  const pages: CatalogPageItem[][] = [];
  let currentPage: CatalogPageItem[] = [];
  let currentRowUsage = 0; // Product row = 1.0, Header = 0.34..0.56
  let productsInCurrentRow = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (item.type === 'header') {
      if (productsInCurrentRow > 0) {
        currentRowUsage += 1.0;
        productsInCurrentRow = 0;
      }

      // Optional explicit page break before each section, or avoid stranding header without >= 1 product row
      if (
        currentPage.length > 0 &&
        (item.pageBreakBefore || currentRowUsage + 1.0 + headerWeight > maxRowsPerPage + 0.05)
      ) {
        pages.push(currentPage);
        currentPage = [];
        currentRowUsage = 0;
        productsInCurrentRow = 0;
      }

      currentPage.push(item);
      currentRowUsage += headerWeight;
    } else {
      if (productsInCurrentRow === 0) {
        if (currentRowUsage + 1.0 > maxRowsPerPage + 0.05 && currentPage.length > 0) {
          pages.push(currentPage);
          currentPage = [];
          currentRowUsage = 0;
        }
      }

      currentPage.push(item);
      productsInCurrentRow++;

      if (productsInCurrentRow === productsPerRow) {
        currentRowUsage += 1.0;
        productsInCurrentRow = 0;
      }
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages.length > 0 ? pages : [[]];
}

export function clampGridColumns(cols?: number): number {
  const n = Math.round(Number(cols));
  if (!Number.isFinite(n) || n < 1) return 4;
  return Math.min(8, Math.max(1, n));
}

export function clampGridRows(rows?: number, cols?: number): number {
  const n = Math.round(Number(rows));
  if (!Number.isFinite(n) || n < 1) {
    return clampGridColumns(cols) === 4 ? 4 : 3;
  }
  return Math.min(10, Math.max(1, n));
}

export function resolveEffectiveGridLayout(options: {
  mode?: 'manual' | 'auto';
  symmetry?: GridSymmetryMode;
  columns?: number;
  rows?: number;
  itemCount: number;
  screenWidth?: number;
}): { cols: number; rows: number; fillEmptySpace: boolean } {
  const { mode = 'manual', symmetry = 'any', columns, rows, itemCount } = options;

  if (mode !== 'auto') {
    const c = clampGridColumns(columns);
    const r = symmetry === 'equal' ? clampGridRows(c, c) : clampGridRows(rows, c);
    return { cols: c, rows: r, fillEmptySpace: false };
  }

  const width =
    options.screenWidth ??
    (typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1200);
  const count = Math.max(1, itemCount);

  if (symmetry === 'equal') {
    if (count === 1) return { cols: 1, rows: 1, fillEmptySpace: true };
    if (count <= 4) return { cols: 2, rows: 2, fillEmptySpace: true };
    if (count <= 9) {
      return width < 500
        ? { cols: 2, rows: 2, fillEmptySpace: true }
        : { cols: 3, rows: 3, fillEmptySpace: true };
    }
    const candidates = width < 560 ? [2] : width < 960 ? [2, 3] : [3, 4, 5];
    let bestN = candidates[candidates.length - 1];
    let bestPenalty = Number.POSITIVE_INFINITY;
    for (const n of candidates) {
      const perPage = n * n;
      const remainder = count % perPage;
      const emptySlots = remainder === 0 ? 0 : perPage - remainder;
      const lastRowMod = count % n;
      const emptyInLastRow = lastRowMod === 0 ? 0 : n - lastRowMod;
      const penalty = emptySlots * 1.4 + emptyInLastRow * 2.0 + Math.abs(n - 3.5) * 0.4;
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestN = n;
      }
    }
    return { cols: bestN, rows: bestN, fillEmptySpace: true };
  }

  if (symmetry !== 'different') {
    if (count === 1) return { cols: 1, rows: 1, fillEmptySpace: true };
    if (count === 2) {
      return width < 480
        ? { cols: 1, rows: 2, fillEmptySpace: true }
        : { cols: 2, rows: 1, fillEmptySpace: true };
    }
    if (count === 3) {
      return width < 560
        ? { cols: 2, rows: 2, fillEmptySpace: true }
        : { cols: 3, rows: 1, fillEmptySpace: true };
    }
    if (count === 4) return { cols: 2, rows: 2, fillEmptySpace: true };
    if (count <= 6) {
      return width < 640
        ? { cols: 2, rows: 3, fillEmptySpace: true }
        : { cols: 3, rows: 2, fillEmptySpace: true };
    }
    if (count <= 8) {
      return width < 640
        ? { cols: 2, rows: 4, fillEmptySpace: true }
        : { cols: 4, rows: 2, fillEmptySpace: true };
    }
    if (count === 9) {
      return width < 540
        ? { cols: 2, rows: 5, fillEmptySpace: true }
        : { cols: 3, rows: 3, fillEmptySpace: true };
    }
    if (count <= 12) {
      return width < 640
        ? { cols: 2, rows: 6, fillEmptySpace: true }
        : width < 960
          ? { cols: 3, rows: 4, fillEmptySpace: true }
          : { cols: 4, rows: 3, fillEmptySpace: true };
    }
  } else {
    if (count <= 2) return { cols: 1, rows: 2, fillEmptySpace: true };
    if (count <= 6) {
      return width < 640
        ? { cols: 2, rows: 3, fillEmptySpace: true }
        : { cols: 3, rows: 2, fillEmptySpace: true };
    }
    if (count <= 8) {
      return width < 640
        ? { cols: 2, rows: 4, fillEmptySpace: true }
        : { cols: 4, rows: 2, fillEmptySpace: true };
    }
    if (count <= 12) {
      return width < 640
        ? { cols: 2, rows: 6, fillEmptySpace: true }
        : width < 960
          ? { cols: 3, rows: 4, fillEmptySpace: true }
          : { cols: 4, rows: 3, fillEmptySpace: true };
    }
  }

  // Larger catalogs: pick balanced cols suited for viewport + rows minimizing leftover empty slots
  const colCandidates = width < 560 ? [2] : width < 960 ? [2, 3] : [3, 4];
  const rowCandidates = width < 560 ? [3, 4, 5] : [3, 4, 5];

  let bestCols = colCandidates[colCandidates.length - 1];
  let bestRows = bestCols === 4 ? 3 : 4;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (const c of colCandidates) {
    for (const r of rowCandidates) {
      if (symmetry === 'different' && c === r) continue;
      const perPage = c * r;
      const remainder = count % perPage;
      const emptySlots = remainder === 0 ? 0 : perPage - remainder;
      const lastRowMod = count % c;
      const emptyInLastRow = lastRowMod === 0 ? 0 : c - lastRowMod;
      // Prefer moderate density (3*4 or 4*3) while strongly penalizing trailing empty cells
      const densityBalance = Math.abs(c - r) * 0.35;
      const penalty = emptySlots * 1.5 + emptyInLastRow * 2.0 + densityBalance;
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestCols = c;
        bestRows = r;
      }
    }
  }

  return { cols: bestCols, rows: bestRows, fillEmptySpace: true };
}

/**
 * Splits products into pages based on products_per_row and optional rowsPerPage (Backward compatible)
 */
export function paginateProducts(
  products: Product[],
  productsPerRow: number = 4,
  rowsPerPage?: number
): Product[][] {
  const items: CatalogPageItem[] = products.map((p) => ({ type: 'product', product: p }));
  const perRow = clampGridColumns(productsPerRow);
  const perCol = clampGridRows(rowsPerPage, perRow);
  const paginated = paginateCatalogPageItems(items, perRow, perCol);
  return paginated.map((pageItems) =>
    pageItems.filter((it): it is { type: 'product'; product: Product } => it.type === 'product').map((it) => it.product)
  );
}

export interface CustomCatalogOptions {
  title?: string;
  name?: string;
  columns_count?: number;
  rows_count?: number;
  grid_layout_mode?: 'manual' | 'auto';
  grid_symmetry?: GridSymmetryMode;
  show_code?: boolean;
  show_category?: boolean;
  show_image?: boolean;
  price_validity_note?: string;
  company_name?: string;
  business_bio?: string;
  phone?: string;
  whatsapp_number?: string;
  secondary_phone?: string;
  extra_phones?: CompanyPhoneItem[];
  address?: string;
  email?: string;
  tax_or_cr_number?: string;
  show_company_name?: boolean;
  show_business_bio?: boolean;
  show_catalog_title?: boolean;
  show_price_validity?: boolean;
  show_phone?: boolean;
  show_whatsapp?: boolean;
  show_secondary_phone?: boolean;
  show_address?: boolean;
  show_email?: boolean;
  show_tax_or_cr?: boolean;
  show_footer_note?: boolean;
  logo_url?: string;
  header_logo_position?: CatalogSettings['header_logo_position'];
  header_logo_size?: number;
  header_logo_shape?: CatalogSettings['header_logo_shape'];
  header_logo_bg?: CatalogSettings['header_logo_bg'];
  header_logo_border?: boolean;
  header_logo_padding?: number;
  header_logo_spacing?: number;
  header_logo_offset_x?: number;
  header_logo_offset_y?: number;
  header_logo_rotation?: number;
  header_logo_opacity?: number;
  header_logo_fit?: 'contain' | 'cover';
  watermark_type?: CatalogSettings['watermark_type'];
  watermark_layer?: 'back' | 'front';
  watermark_position?: CatalogSettings['watermark_position'];
  watermark_offset_x?: number;
  watermark_offset_y?: number;
  watermark_rotation?: number;
  watermark_opacity?: number;
  watermark_size?: number;
  watermark_gap?: number;
  primary_color?: string;
  footer_note?: string;
  manual_headers?: CatalogSectionHeader[];
  auto_category_headers?: boolean;
  section_header_config?: CatalogSectionHeaderConfig;
  card_config?: CatalogCardConfig;
}

interface CompanyContactEntry {
  label: string;
  value: string;
  isLtr: boolean;
}

function resolveCompanyIdentityDisplay(
  settings: CatalogSettings,
  customCatalog?: SavedCatalog | CustomCatalogOptions
) {
  const showCompanyName = (customCatalog?.show_company_name ?? settings.show_company_name ?? true) !== false;
  const showBusinessBio = (customCatalog?.show_business_bio ?? settings.show_business_bio ?? true) !== false;
  const showCatalogTitle = (customCatalog?.show_catalog_title ?? settings.show_catalog_title ?? true) !== false;
  const showPriceValidity = (customCatalog?.show_price_validity ?? settings.show_price_validity ?? true) !== false;
  const showPhone = (customCatalog?.show_phone ?? settings.show_phone ?? true) !== false;
  const showWhatsapp = (customCatalog?.show_whatsapp ?? settings.show_whatsapp ?? true) !== false;
  const showSecondaryPhone = (customCatalog?.show_secondary_phone ?? settings.show_secondary_phone ?? true) !== false;
  const showAddress = (customCatalog?.show_address ?? settings.show_address ?? true) !== false;
  const showEmail = (customCatalog?.show_email ?? settings.show_email ?? true) !== false;
  const showTaxOrCr = (customCatalog?.show_tax_or_cr ?? settings.show_tax_or_cr ?? true) !== false;
  const showFooterNote = (customCatalog?.show_footer_note ?? settings.show_footer_note ?? true) !== false;

  const companyName =
    customCatalog?.company_name ?? (settings.company_name || settings.store_name || 'كتالوج أسعار البيع');
  const businessBio = customCatalog?.business_bio ?? settings.business_bio ?? '';
  const phone = customCatalog?.phone ?? settings.phone ?? '';
  const whatsapp = customCatalog?.whatsapp_number ?? settings.whatsapp_number ?? '';
  const secondaryPhone = customCatalog?.secondary_phone ?? settings.secondary_phone ?? '';
  const extraPhones = customCatalog?.extra_phones ?? settings.extra_phones ?? [];
  const address = customCatalog?.address ?? settings.address ?? '';
  const email = customCatalog?.email ?? settings.email ?? '';
  const taxOrCr = customCatalog?.tax_or_cr_number ?? settings.tax_or_cr_number ?? '';
  const catalogTitle =
    (customCatalog && 'name' in customCatalog && customCatalog.name) ||
    (customCatalog && 'title' in customCatalog && (customCatalog as CustomCatalogOptions).title) ||
    settings.catalog_title ||
    'قائمة أسعار البيع المعتمدة';
  const priceValidityNote = customCatalog?.price_validity_note ?? settings.price_validity_note ?? '';
  const footerNote = customCatalog?.footer_note ?? settings.footer_note ?? '';

  const contactEntries: CompanyContactEntry[] = [];
  if (showPhone && phone.trim()) {
    contactEntries.push({ label: 'هاتف', value: phone.trim(), isLtr: true });
  }
  if (showWhatsapp && whatsapp.trim()) {
    contactEntries.push({ label: 'واتساب', value: whatsapp.trim(), isLtr: true });
  }
  if (showSecondaryPhone && secondaryPhone.trim()) {
    contactEntries.push({ label: 'هاتف 2', value: secondaryPhone.trim(), isLtr: true });
  }
  if (Array.isArray(extraPhones)) {
    extraPhones.forEach((ep) => {
      const num = ep?.number?.trim();
      if (!num || ep.visible === false) return;
      const lbl = ep.label?.trim() || (ep.is_whatsapp ? 'واتساب' : 'موبايل');
      contactEntries.push({ label: lbl, value: num, isLtr: true });
    });
  }
  if (showAddress && address.trim()) {
    contactEntries.push({ label: 'العنوان', value: address.trim(), isLtr: false });
  }
  if (showEmail && email.trim()) {
    contactEntries.push({ label: '', value: email.trim(), isLtr: true });
  }
  if (showTaxOrCr && taxOrCr.trim()) {
    contactEntries.push({ label: '', value: taxOrCr.trim(), isLtr: false });
  }

  return {
    showCompanyName,
    showBusinessBio,
    showCatalogTitle,
    showPriceValidity,
    showFooterNote,
    companyName,
    businessBio,
    catalogTitle,
    priceValidityNote,
    footerNote,
    contactEntries,
  };
}

interface ResolvedHeaderLogoConfig {
  position: 'right' | 'center' | 'left' | 'hidden';
  size: number;
  shape: 'rounded' | 'circle' | 'clean';
  bg: 'white' | 'transparent' | 'primary_tint';
  border: boolean;
  padding: number;
  spacing: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  opacity: number;
  fit: 'contain' | 'cover';
}

export function resolveHeaderLogoConfig(
  settings: CatalogSettings,
  customCatalog?: SavedCatalog | CustomCatalogOptions
): ResolvedHeaderLogoConfig {
  const position =
    (customCatalog?.header_logo_position ?? settings.header_logo_position ?? 'right') as ResolvedHeaderLogoConfig['position'];
  const size = Math.min(180, Math.max(36, customCatalog?.header_logo_size ?? settings.header_logo_size ?? 88));
  const shape = (customCatalog?.header_logo_shape ?? settings.header_logo_shape ?? 'rounded') as ResolvedHeaderLogoConfig['shape'];
  const bg = (customCatalog?.header_logo_bg ?? settings.header_logo_bg ?? (shape === 'clean' ? 'transparent' : 'white')) as ResolvedHeaderLogoConfig['bg'];
  const border =
    customCatalog?.header_logo_border ?? settings.header_logo_border ?? (shape !== 'clean');
  const padding = Math.min(16, Math.max(0, customCatalog?.header_logo_padding ?? settings.header_logo_padding ?? (shape === 'clean' ? 0 : 4)));
  const spacing = Math.min(48, Math.max(0, customCatalog?.header_logo_spacing ?? settings.header_logo_spacing ?? 14));
  const offsetX = Math.min(60, Math.max(-60, customCatalog?.header_logo_offset_x ?? settings.header_logo_offset_x ?? 0));
  const offsetY = Math.min(40, Math.max(-40, customCatalog?.header_logo_offset_y ?? settings.header_logo_offset_y ?? 0));
  const rotation = Math.min(45, Math.max(-45, customCatalog?.header_logo_rotation ?? settings.header_logo_rotation ?? 0));
  const opacity = Math.min(1, Math.max(0.2, customCatalog?.header_logo_opacity ?? settings.header_logo_opacity ?? 1));
  const fit = (customCatalog?.header_logo_fit ?? settings.header_logo_fit ?? 'contain') as 'contain' | 'cover';
  return { position, size, shape, bg, border, padding, spacing, offsetX, offsetY, rotation, opacity, fit };
}

interface ResolvedWatermarkOverlay {
  type: 'none' | 'center' | 'tiled';
  layer: 'back' | 'front';
  position: NonNullable<CatalogSettings['watermark_position']>;
  offsetX: number;
  offsetY: number;
  rotation: number;
  opacity: number;
  size: number;
  gap: number;
}

export function resolveWatermarkOverlayConfig(
  settings: CatalogSettings,
  customCatalog?: SavedCatalog | CustomCatalogOptions
): ResolvedWatermarkOverlay {
  const type = customCatalog?.watermark_type ?? settings.watermark_type ?? 'none';
  const layer = customCatalog?.watermark_layer ?? settings.watermark_layer ?? 'back';
  const position = customCatalog?.watermark_position ?? settings.watermark_position ?? 'center';
  const offsetX = Math.max(-50, Math.min(50, customCatalog?.watermark_offset_x ?? settings.watermark_offset_x ?? 0));
  const offsetY = Math.max(-50, Math.min(50, customCatalog?.watermark_offset_y ?? settings.watermark_offset_y ?? 0));
  const rawRot = customCatalog?.watermark_rotation ?? settings.watermark_rotation;
  const rotation = typeof rawRot === 'number' && Number.isFinite(rawRot) ? rawRot : type === 'tiled' ? -20 : 0;
  const opacity = Math.min(1, Math.max(0.03, customCatalog?.watermark_opacity ?? settings.watermark_opacity ?? 0.08));
  const size = Math.min(700, Math.max(40, customCatalog?.watermark_size ?? settings.watermark_size ?? 280));
  const gap = Math.min(240, Math.max(60, customCatalog?.watermark_gap ?? settings.watermark_gap ?? 100));
  return { type, layer, position, offsetX, offsetY, rotation, opacity, size, gap };
}

function resolveWatermarkAnchorPercent(
  position: NonNullable<CatalogSettings['watermark_position']>,
  offsetX: number,
  offsetY: number
): { pctX: number; pctY: number } {
  let baseX = 50;
  let baseY = 50;
  switch (position) {
    case 'top-right':
      baseX = 84;
      baseY = 16;
      break;
    case 'top-left':
      baseX = 16;
      baseY = 16;
      break;
    case 'top-center':
      baseX = 50;
      baseY = 14;
      break;
    case 'bottom-right':
      baseX = 84;
      baseY = 84;
      break;
    case 'bottom-left':
      baseX = 16;
      baseY = 84;
      break;
    case 'bottom-center':
      baseX = 50;
      baseY = 86;
      break;
    default:
      baseX = 50;
      baseY = 50;
  }
  return {
    pctX: Math.max(4, Math.min(96, baseX + offsetX)),
    pctY: Math.max(4, Math.min(96, baseY + offsetY)),
  };
}

function drawCanvasWatermarkLayer(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  logoImg: HTMLImageElement,
  wm: ResolvedWatermarkOverlay
) {
  if (wm.type === 'none') return;
  ctx.save();
  ctx.globalAlpha = wm.opacity;

  if (wm.type === 'center') {
    const drawSize = wm.size * 1.45;
    const { pctX, pctY } = resolveWatermarkAnchorPercent(wm.position, wm.offsetX, wm.offsetY);
    const cx = (pctX / 100) * W;
    const cy = (pctY / 100) * H;
    ctx.translate(cx, cy);
    if (wm.rotation !== 0) {
      ctx.rotate((wm.rotation * Math.PI) / 180);
    }
    drawImageContain(ctx, logoImg, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
  } else if (wm.type === 'tiled') {
    const tileSize = Math.max(60, Math.min(340, Math.round(wm.size * 0.58)));
    const gapFactor = Math.max(0.6, Math.min(2.4, wm.gap / 100));
    const stepX = Math.max(tileSize + 24, Math.round(tileSize * 1.85 * gapFactor));
    const stepY = Math.max(tileSize + 20, Math.round(tileSize * 1.72 * gapFactor));
    const shiftX = (wm.offsetX / 100) * stepX;
    const shiftY = (wm.offsetY / 100) * stepY;
    const rot = wm.rotation === 0 ? -20 : wm.rotation;
    ctx.translate(W / 2, H / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.translate(-W / 2 + shiftX, -H / 2 + shiftY);

    for (let tx = -420; tx < W + 420; tx += stepX) {
      for (let ty = -420; ty < H + 420; ty += stepY) {
        drawImageContain(ctx, logoImg, tx, ty, tileSize, tileSize);
      }
    }
  }

  ctx.restore();
}

function drawCanvasCardLogoStamp(
  ctx: CanvasRenderingContext2D,
  logoImg: HTMLImageElement | undefined,
  cardConfig: CatalogCardConfig,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
) {
  if (!logoImg || !cardConfig.card_logo_enabled) return;
  const rawSize = Math.min(90, Math.max(14, cardConfig.card_logo_size ?? 26));
  const size = Math.min(Math.min(boxW, boxH) * 0.85, Math.round(rawSize * 1.38));
  const inset = Math.min(32, Math.max(0, Math.round((cardConfig.card_logo_inset ?? 6) * 1.35)));
  const offX = Math.round((cardConfig.card_logo_offset_x ?? 0) * 1.35);
  const offY = Math.round((cardConfig.card_logo_offset_y ?? 0) * 1.35);
  const opacity = Math.min(1, Math.max(0.08, cardConfig.card_logo_opacity ?? 0.85));
  const rotation = Math.min(45, Math.max(-45, cardConfig.card_logo_rotation ?? 0));
  const shape = cardConfig.card_logo_shape ?? 'rounded';
  const showBg = cardConfig.card_logo_bg !== false && shape !== 'clean';
  const pos = cardConfig.card_logo_position ?? 'top-left';

  let lx = boxX + inset;
  let ly = boxY + inset;
  switch (pos) {
    case 'top-right':
      lx = boxX + boxW - inset - size;
      ly = boxY + inset;
      break;
    case 'top-center':
      lx = boxX + (boxW - size) / 2;
      ly = boxY + inset;
      break;
    case 'top-left':
      lx = boxX + inset;
      ly = boxY + inset;
      break;
    case 'center':
      lx = boxX + (boxW - size) / 2;
      ly = boxY + (boxH - size) / 2;
      break;
    case 'bottom-right':
      lx = boxX + boxW - inset - size;
      ly = boxY + boxH - inset - size;
      break;
    case 'bottom-left':
      lx = boxX + inset;
      ly = boxY + boxH - inset - size;
      break;
  }
  lx += offX;
  ly += offY;

  const pad = showBg ? Math.max(2, Math.round(size * 0.1)) : 0;
  const radius =
    shape === 'circle' || shape === 'pill'
      ? size / 2
      : shape === 'rounded'
        ? Math.max(4, Math.round(size * 0.22))
        : 0;

  ctx.save();
  ctx.globalAlpha = opacity;
  const cx = lx + size / 2;
  const cy = ly + size / 2;
  ctx.translate(cx, cy);
  if (rotation !== 0) {
    ctx.rotate((rotation * Math.PI) / 180);
  }
  const rx = -size / 2;
  const ry = -size / 2;

  if (showBg) {
    drawRoundedRect(ctx, rx, ry, size, size, radius, 'rgba(255,255,255,0.9)', '#e2e8f0', 1);
  }
  if (radius > 0) {
    ctx.beginPath();
    ctx.moveTo(rx + radius, ry);
    ctx.lineTo(rx + size - radius, ry);
    ctx.quadraticCurveTo(rx + size, ry, rx + size, ry + radius);
    ctx.lineTo(rx + size, ry + size - radius);
    ctx.quadraticCurveTo(rx + size, ry + size, rx + size - radius, ry + size);
    ctx.lineTo(rx + radius, ry + size);
    ctx.quadraticCurveTo(rx, ry + size, rx, ry + size - radius);
    ctx.lineTo(rx, ry + radius);
    ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
    ctx.closePath();
    ctx.clip();
  }
  drawImageContain(ctx, logoImg, rx + pad, ry + pad, Math.max(4, size - pad * 2), Math.max(4, size - pad * 2));
  ctx.restore();
}

/**
 * Renders a complete A4 page directly onto a Canvas (1240 × 1754 px)
 * Strict 10mm margins (60px), snug card heights, RTL ordering, no cut-offs.
 */
export function renderPageToCanvas(
  ctx: CanvasRenderingContext2D,
  pageItems: (Product | CatalogPageItem)[],
  settings: CatalogSettings,
  pageIndex: number,
  totalPages: number,
  imageCache: Map<string, HTMLImageElement>,
  categoryFilter?: string,
  customCatalog?: SavedCatalog | CustomCatalogOptions
) {
  const W = CANVAS_WIDTH;
  const H = CANVAS_HEIGHT;

  // Custom overrides
  const primaryColor = customCatalog?.primary_color || settings.primary_color || '#ea580c';
  const sectionConfig = resolveSectionHeaderConfig(settings, customCatalog);
  const cardConfig = resolveCardConfig(settings, customCatalog);
  const identity = resolveCompanyIdentityDisplay(settings, customCatalog);
  const companyName = identity.companyName;
  const businessBio = identity.businessBio;
  const catalogTitle = identity.catalogTitle;
  const priceValidityNote = identity.priceValidityNote;
  const footerNote = identity.footerNote;
  const logoUrl = customCatalog?.logo_url ?? settings.logo_url;
  const hdrLogo = resolveHeaderLogoConfig(settings, customCatalog);
  const wmConfig = resolveWatermarkOverlayConfig(settings, customCatalog);
  const logoImg = logoUrl ? imageCache.get(logoUrl) : undefined;

  const productsPerRow = clampGridColumns(customCatalog?.columns_count || settings.products_per_row || 4);
  const rowsPerPage = clampGridRows(
    customCatalog?.rows_count || settings.rows_per_page,
    productsPerRow
  );
  const fillEmptySpace =
    (customCatalog?.grid_layout_mode || settings.grid_layout_mode) === 'auto';
  const isPageFit = fillEmptySpace || cardConfig.page_fit_mode === 'fill_page';
  const keepUniformCards = cardConfig.uniform_row_cards !== false;
  const showImage =
    customCatalog?.show_image !== undefined ? customCatalog.show_image : (settings.show_image ?? true);
  const showCode =
    customCatalog?.show_code !== undefined ? customCatalog.show_code : (settings.show_code ?? true);
  const showCategory =
    customCatalog?.show_category !== undefined
      ? customCatalog.show_category
      : (settings.show_category ?? true);

  // 1. Background fill
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 2. Watermark / Logo Layer (when set to 'back' = تحت المنتجات)
  if (wmConfig.layer === 'back' && wmConfig.type !== 'none' && logoImg) {
    drawCanvasWatermarkLayer(ctx, W, H, logoImg, wmConfig);
  }

  // 3. Exact 10mm margins = 60 px (Requirement أ)
  const MARGIN_PX = 60;
  const headerY = MARGIN_PX;
  const contactCount = identity.contactEntries.length;
  const contactLineStep = contactCount >= 6 ? 17 : contactCount === 5 ? 19 : 22;
  const contactLinesHeight = contactCount > 0 ? 24 + contactCount * contactLineStep : 0;
  const headerBottom = headerY + Math.max(115, hdrLogo.size + 24, contactLinesHeight);

  ctx.save();
  // Header Divider Bar
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(MARGIN_PX, headerBottom);
  ctx.lineTo(W - MARGIN_PX, headerBottom);
  ctx.stroke();

  // Header Logo (right, center, left, or hidden with shape, spacing, offsets, rotation & opacity)
  const logoSize = hdrLogo.size;
  const baseLogoY = headerY + Math.max(4, Math.round((headerBottom - headerY - logoSize) / 2) - 4);
  let textRightX = W - MARGIN_PX;
  let contactLeftX = MARGIN_PX;

  if (logoImg && hdrLogo.position !== 'hidden') {
    const baseLogoX =
      hdrLogo.position === 'left'
        ? MARGIN_PX
        : hdrLogo.position === 'center'
          ? Math.round((W - logoSize) / 2)
          : W - MARGIN_PX - logoSize;
    const logoX = baseLogoX + hdrLogo.offsetX;
    const logoY = baseLogoY + hdrLogo.offsetY;
    const logoRadius =
      hdrLogo.shape === 'circle' ? logoSize / 2 : hdrLogo.shape === 'rounded' ? 12 : 0;
    const logoFill =
      hdrLogo.bg === 'transparent'
        ? undefined
        : hdrLogo.bg === 'primary_tint'
          ? `${primaryColor}14`
          : '#ffffff';
    const logoStroke = hdrLogo.border
      ? hdrLogo.bg === 'primary_tint'
        ? `${primaryColor}55`
        : '#e2e8f0'
      : undefined;

    ctx.save();
    ctx.globalAlpha = hdrLogo.opacity;
    ctx.translate(logoX + logoSize / 2, logoY + logoSize / 2);
    if (hdrLogo.rotation !== 0) {
      ctx.rotate((hdrLogo.rotation * Math.PI) / 180);
    }
    const rx = -logoSize / 2;
    const ry = -logoSize / 2;
    if (logoFill || logoStroke) {
      drawRoundedRect(ctx, rx, ry, logoSize, logoSize, logoRadius, logoFill, logoStroke, 1.5);
    }
    if (logoRadius > 0) {
      ctx.beginPath();
      ctx.moveTo(rx + logoRadius, ry);
      ctx.lineTo(rx + logoSize - logoRadius, ry);
      ctx.quadraticCurveTo(rx + logoSize, ry, rx + logoSize, ry + logoRadius);
      ctx.lineTo(rx + logoSize, ry + logoSize - logoRadius);
      ctx.quadraticCurveTo(rx + logoSize, ry + logoSize, rx + logoSize - logoRadius, ry + logoSize);
      ctx.lineTo(rx + logoRadius, ry + logoSize);
      ctx.quadraticCurveTo(rx, ry + logoSize, rx, ry + logoSize - logoRadius);
      ctx.lineTo(rx, ry + logoRadius);
      ctx.quadraticCurveTo(rx, ry, rx + logoRadius, ry);
      ctx.closePath();
      ctx.clip();
    }
    const padPx = hdrLogo.padding;
    drawImageContain(
      ctx,
      logoImg,
      rx + padPx,
      ry + padPx,
      Math.max(10, logoSize - padPx * 2),
      Math.max(10, logoSize - padPx * 2),
      1,
      hdrLogo.fit
    );
    ctx.restore();

    if (hdrLogo.position === 'left') {
      contactLeftX = MARGIN_PX + logoSize + hdrLogo.spacing;
    } else if (hdrLogo.position === 'right') {
      textRightX = Math.max(W * 0.42, baseLogoX - hdrLogo.spacing);
    }
  }

  // Company Header Text Block (Right side RTL with dynamic Y so hidden elements collapse cleanly)
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  let textCursorY = headerY + 32;

  if (identity.showCompanyName && companyName.trim()) {
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 28px Cairo, Tajawal, sans-serif';
    ctx.fillText(companyName, textRightX, textCursorY);
    textCursorY += 24;
  }

  // Business Bio
  if (identity.showBusinessBio && businessBio.trim()) {
    ctx.fillStyle = '#64748b';
    ctx.font = '500 14px Cairo, Tajawal, sans-serif';
    const bioLines = wrapTextLines(ctx, businessBio, 480, 1);
    if (bioLines[0]) {
      ctx.fillText(bioLines[0], textRightX, textCursorY);
      textCursorY += 24;
    }
  }

  // Catalog Title & Subtitle
  if (identity.showCatalogTitle) {
    ctx.fillStyle = primaryColor;
    ctx.font = 'bold 16px Cairo, Tajawal, sans-serif';
    let categorySubtitle = '';
    if (categoryFilter && categoryFilter !== 'الكل') {
      const categoryDef = (settings.categories || DEFAULT_CATEGORIES).find((c) => c.name === categoryFilter);
      categorySubtitle = ` - ${categoryDef?.catalog_title || categoryDef?.name || categoryFilter}`;
    }
    const fullTitle = `${catalogTitle}${categorySubtitle}`;
    if (fullTitle.trim()) {
      ctx.fillText(fullTitle, textRightX, textCursorY);
      textCursorY += 10;
    }
  }

  // Price validity date badge if configured & visible
  if (identity.showPriceValidity && priceValidityNote.trim()) {
    ctx.save();
    ctx.font = 'bold 11px Cairo, sans-serif';
    const badgeText = `سارية حتى: ${priceValidityNote}`;
    const badgeW = ctx.measureText(badgeText).width + 16;
    drawRoundedRect(ctx, textRightX - badgeW, textCursorY, badgeW, 20, 4, '#fef3c7', '#fde68a', 1);
    ctx.fillStyle = '#92400e';
    ctx.fillText(badgeText, textRightX - 8, textCursorY + 14);
    ctx.restore();
  }

  // Left Side of Header: Contact Info Badges (Only visible & non-empty fields, supporting extra_phones & address/email/tax visibility)
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#334155';
  const contactFontPx = contactCount >= 6 ? 11 : contactCount === 5 ? 12 : 13;
  ctx.font = `600 ${contactFontPx}px Cairo, Tajawal, sans-serif`;

  let contactY = headerY + 24;
  const maxContactLines = Math.min(identity.contactEntries.length, 8);
  for (let c = 0; c < maxContactLines; c++) {
    const entry = identity.contactEntries[c];
    const lineText = entry.label ? `${entry.label}: ${entry.value}` : entry.value;
    ctx.fillText(lineText, contactLeftX, contactY);
    contactY += contactLineStep;
  }
  ctx.restore();

  // 4. Products Grid Math (Strict 10mm print area, responsive to custom columns/rows & auto fill-without-gaps)
  const totalCols = productsPerRow;
  const gapMult = cardConfig.gap === 'compact' ? 0.65 : cardConfig.gap === 'spacious' ? 1.45 : 1;
  const baseGapX = totalCols >= 6 ? 8 : totalCols === 5 ? 10 : totalCols === 4 ? 14 : totalCols === 3 ? 16 : 20;
  const baseGapY = rowsPerPage >= 7 ? 6 : rowsPerPage >= 6 ? 8 : rowsPerPage === 5 ? 10 : 14;
  const gapX = Math.max(4, Math.round(baseGapX * gapMult));
  const gapY = Math.max(4, Math.round(baseGapY * gapMult));
  const sizeScale = sectionConfig.size === 'sm' ? 0.86 : sectionConfig.size === 'lg' ? 1.24 : 1;
  const baseBannerH = rowsPerPage >= 6 ? 28 : rowsPerPage === 5 ? 32 : 38;
  const bannerH = Math.round(baseBannerH * sizeScale);
  const usableW = W - MARGIN_PX * 2; // 1120 px
  const baseCardW = Math.floor((usableW - gapX * (totalCols - 1)) / totalCols);
  const totalGridW = totalCols * baseCardW + (totalCols - 1) * gapX;
  const baseOffsetMarginX = MARGIN_PX + Math.floor((usableW - totalGridW) / 2);

  // Standardize items to CatalogPageItem format and group into visual rows
  const normalizedItems: CatalogPageItem[] = pageItems.map((it) => {
    if ('type' in it && (it.type === 'header' || it.type === 'product')) {
      return it as CatalogPageItem;
    }
    return { type: 'product', product: it as Product };
  });

  type VisualRow =
    | { type: 'header'; title: string; subtitle?: string; count?: number; color?: string }
    | { type: 'products'; products: Product[] };

  const visualRows: VisualRow[] = [];
  let rowBuffer: Product[] = [];
  for (const it of normalizedItems) {
    if (it.type === 'header') {
      if (rowBuffer.length > 0) {
        visualRows.push({ type: 'products', products: rowBuffer });
        rowBuffer = [];
      }
      visualRows.push({
        type: 'header',
        title: it.title,
        subtitle: it.subtitle,
        count: it.count,
        color: it.color,
      });
    } else {
      rowBuffer.push(it.product);
      if (rowBuffer.length === totalCols) {
        visualRows.push({ type: 'products', products: rowBuffer });
        rowBuffer = [];
      }
    }
  }
  if (rowBuffer.length > 0) {
    visualRows.push({ type: 'products', products: rowBuffer });
  }

  const pageHeaderCount = visualRows.filter((r) => r.type === 'header').length;
  const pageProdRows = visualRows.filter((r) => r.type === 'products').length;

  const gridTop = 195;
  const usableH = H - MARGIN_PX - 14 - gridTop; // 1485 px
  const headersUsedH = pageHeaderCount * (bannerH + gapY);
  const actualFitCardH =
    pageProdRows > 0
      ? Math.floor((usableH - headersUsedH - Math.max(0, pageProdRows - 1) * gapY) / pageProdRows)
      : 280;
  const fullPageFitCardH =
    rowsPerPage > 0
      ? Math.floor((usableH - headersUsedH - Math.max(0, rowsPerPage - 1) * gapY) / rowsPerPage)
      : actualFitCardH;
  const idealCardH = showImage
    ? totalCols >= 6
      ? 200
      : totalCols >= 5
        ? 240
        : totalCols === 4
          ? 275
          : totalCols === 3
            ? 340
            : totalCols === 2
              ? 430
              : 540
    : 155;

  const cardHeightScale = Math.min(2.2, Math.max(0.6, (cardConfig.card_height_scale || 100) / 100));
  const scaledIdealCardH = Math.round(idealCardH * cardHeightScale);

  // Page-fit mode fills the usable page height; uniform cards keep identical dimensions on trailing rows
  const cardH = isPageFit
    ? keepUniformCards
      ? Math.max(84, Math.min(actualFitCardH, Math.round(fullPageFitCardH * cardHeightScale)))
      : Math.max(90, Math.min(actualFitCardH, Math.round(actualFitCardH * Math.min(1, cardHeightScale))))
    : Math.max(68, Math.min(scaledIdealCardH, actualFitCardH));
  const isCompactCard = cardH < 230 || totalCols >= 5 || rowsPerPage >= 6;
  const isMicroCard = cardH < 150 || totalCols >= 7 || rowsPerPage >= 8;

  let curY = gridTop;

  visualRows.forEach((vRow) => {
    if (vRow.type === 'header') {
      const hdrColor = vRow.color || primaryColor;
      const hdrStyle = sectionConfig.style || 'line_divider';
      const hdrAlign = sectionConfig.align || 'center';
      const hdrWidth = sectionConfig.width === 'half' ? Math.round(totalGridW * 0.54) : totalGridW;
      const hdrX =
        sectionConfig.width === 'half'
          ? hdrAlign === 'center'
            ? baseOffsetMarginX + Math.floor((totalGridW - hdrWidth) / 2)
            : hdrAlign === 'right'
              ? baseOffsetMarginX + totalGridW - hdrWidth
              : baseOffsetMarginX
          : baseOffsetMarginX;

      const baseFontSize = rowsPerPage >= 6 ? 13 : rowsPerPage === 5 ? 14 : 16;
      const fontSize = Math.round(
        baseFontSize * (sectionConfig.size === 'sm' ? 0.88 : sectionConfig.size === 'lg' ? 1.2 : 1)
      );
      const countText =
        sectionConfig.show_count && typeof vRow.count === 'number' ? ` (${vRow.count})` : '';
      const subText = sectionConfig.show_subtitle && vRow.subtitle ? ` — ${vRow.subtitle}` : '';
      const fullLabel = `${vRow.title}${countText}${subText}`;

      const resolveTextColor = (defaultCol: string) => {
        if (sectionConfig.text_color_mode === 'white') return '#ffffff';
        if (sectionConfig.text_color_mode === 'dark') return '#0f172a';
        if (sectionConfig.text_color_mode === 'accent') return hdrColor;
        return defaultCol;
      };

      ctx.save();
      ctx.direction = 'rtl';
      ctx.font = `800 ${fontSize}px Cairo, Tajawal, sans-serif`;

      if (hdrStyle === 'solid_bar') {
        drawRoundedRect(ctx, hdrX, curY, hdrWidth, bannerH, 8, hdrColor);
        ctx.fillStyle = resolveTextColor('#ffffff');
        ctx.textAlign = hdrAlign === 'center' ? 'center' : hdrAlign === 'left' ? 'left' : 'right';
        const tx =
          hdrAlign === 'center'
            ? hdrX + hdrWidth / 2
            : hdrAlign === 'left'
              ? hdrX + 16
              : hdrX + hdrWidth - 16;
        ctx.fillText(fullLabel, tx, curY + Math.round(bannerH * 0.66));
      } else if (hdrStyle === 'tinted_box') {
        drawRoundedRect(ctx, hdrX, curY, hdrWidth, bannerH, 8, `${hdrColor}1a`, `${hdrColor}66`, 1.5);
        // Accent side stripe matching alignment
        if (hdrAlign === 'right') {
          drawRoundedRect(ctx, hdrX + hdrWidth - 6, curY + 4, 4, bannerH - 8, 2, hdrColor);
        } else if (hdrAlign === 'left') {
          drawRoundedRect(ctx, hdrX + 2, curY + 4, 4, bannerH - 8, 2, hdrColor);
        }
        ctx.fillStyle = resolveTextColor('#0f172a');
        ctx.textAlign = hdrAlign === 'center' ? 'center' : hdrAlign === 'left' ? 'left' : 'right';
        const tx =
          hdrAlign === 'center'
            ? hdrX + hdrWidth / 2
            : hdrAlign === 'left'
              ? hdrX + 16
              : hdrX + hdrWidth - 16;
        ctx.fillText(fullLabel, tx, curY + Math.round(bannerH * 0.66));
      } else if (hdrStyle === 'underline') {
        ctx.strokeStyle = hdrColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(hdrX, curY + bannerH - 3);
        ctx.lineTo(hdrX + hdrWidth, curY + bannerH - 3);
        ctx.stroke();

        ctx.fillStyle = resolveTextColor(hdrColor);
        ctx.textAlign = hdrAlign === 'center' ? 'center' : hdrAlign === 'left' ? 'left' : 'right';
        const tx =
          hdrAlign === 'center'
            ? hdrX + hdrWidth / 2
            : hdrAlign === 'left'
              ? hdrX + 6
              : hdrX + hdrWidth - 6;
        ctx.fillText(fullLabel, tx, curY + Math.round(bannerH * 0.62));
      } else {
        // Default: 'line_divider' ("مكتوبة في نص سطر")
        const midY = curY + Math.round(bannerH / 2);
        const textW = Math.min(hdrWidth - 28, ctx.measureText(fullLabel).width + 32);
        const pillH = Math.max(22, bannerH - 4);
        const pillY = curY + Math.round((bannerH - pillH) / 2);

        // Horizontal divider line across section width
        ctx.strokeStyle = `${hdrColor}88`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hdrX, midY);
        ctx.lineTo(hdrX + hdrWidth, midY);
        ctx.stroke();

        // Pill/Badge housing title at aligned position
        const pillX =
          hdrAlign === 'center'
            ? hdrX + Math.round((hdrWidth - textW) / 2)
            : hdrAlign === 'left'
              ? hdrX
              : hdrX + hdrWidth - textW;

        drawRoundedRect(ctx, pillX, pillY, textW, pillH, Math.round(pillH / 2), '#ffffff', hdrColor, 1.8);
        ctx.fillStyle = resolveTextColor('#0f172a');
        ctx.textAlign = 'center';
        ctx.fillText(fullLabel, pillX + textW / 2, pillY + Math.round(pillH * 0.68));
      }

      ctx.restore();
      curY += bannerH + gapY;
      return;
    }

    const rowProducts = vRow.products;
    // Stretch partial rows horizontally only when page-fit/auto is active AND uniform row cards is off
    const stretchRowHoriz = isPageFit && !keepUniformCards;
    const rowColsCount = stretchRowHoriz ? rowProducts.length : totalCols;
    const rowCardW = Math.floor((usableW - gapX * (rowColsCount - 1)) / rowColsCount);
    const rowGridW = rowColsCount * rowCardW + (rowColsCount - 1) * gapX;
    const rowOffsetX = MARGIN_PX + Math.floor((usableW - rowGridW) / 2);

    rowProducts.forEach((prod, colIdx) => {
      const slotCardX = W - rowOffsetX - (colIdx + 1) * rowCardW - colIdx * gapX;
      const widthScale = Math.min(100, Math.max(50, cardConfig.width_percent || 100)) / 100;
      const effectiveCardW = Math.round(rowCardW * widthScale);
      const cardX = slotCardX + Math.floor((rowCardW - effectiveCardW) / 2);
      const cardY = curY;

      const isUnread = Boolean((prod as any).is_unread_placeholder);
      const padBase = isMicroCard ? 4 : isCompactCard ? 6 : 8;
      const padMult = cardConfig.padding === 'compact' ? 0.7 : cardConfig.padding === 'spacious' ? 1.4 : 1;
      const pad = Math.max(3, Math.round(padBase * padMult));
      const fontScale = Math.min(1.5, Math.max(0.8, (cardConfig.font_scale || 100) / 100));
      const nameLineH = Math.round((isMicroCard ? 12 : isCompactCard ? 15 : 18) * fontScale);
      const priceBoxH = Math.round((isMicroCard ? 20 : isCompactCard ? 26 : 32) * (0.85 + (fontScale - 0.85) * 0.6));
      const badgeH = showCode || showCategory ? (isMicroCard ? 13 : isCompactCard ? 16 : 18) : 0;
      const hasBrandLine = Boolean(settings.show_brand_on_card && prod.group);
      const hasSpecLine = Boolean(settings.show_specification && prod.specification);
      const hasModelsLine = Boolean(
        settings.show_available_models && prod.available_models && prod.available_models.length > 0
      );
      const extraLineH = isMicroCard ? 11 : 13;
      const extraMetaH =
        (hasBrandLine ? extraLineH : 0) +
        (hasSpecLine ? extraLineH : 0) +
        (hasModelsLine ? extraLineH : 0);

      const textBudgetH =
        pad * 2 +
        nameLineH * 2 +
        extraMetaH +
        (isMicroCard ? 4 : isCompactCard ? 6 : 10) +
        priceBoxH +
        (isMicroCard ? 4 : isCompactCard ? 6 : 8) +
        (badgeH > 0 ? badgeH + (isMicroCard ? 3 : isCompactCard ? 5 : 6) : 2);

      if (isUnread) {
        drawRoundedRect(ctx, cardX, cardY, effectiveCardW, cardH, 8, '#fffbeb', '#fde68a', 1.5);

        const imgBoxH = showImage ? Math.max(36, cardH - textBudgetH) : 40;
        const imgBoxW = effectiveCardW - pad * 2;
        const imgBoxX = cardX + pad;
        const imgBoxY = cardY + pad;

        drawRoundedRect(ctx, imgBoxX, imgBoxY, imgBoxW, imgBoxH, 6, '#fef3c7', '#fcd34d', 1);

        ctx.save();
        ctx.fillStyle = '#b45309';
        ctx.font = `bold ${isMicroCard ? 16 : 22}px Cairo, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('⚠️', cardX + effectiveCardW / 2, imgBoxY + imgBoxH / 2 + 6);
        ctx.restore();

        let curContentY = imgBoxY + imgBoxH + 14;
        ctx.save();
        ctx.direction = 'rtl';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#92400e';
        ctx.font = `bold ${isMicroCard ? 10 : isCompactCard ? 11.5 : 13}px Cairo, Tajawal, sans-serif`;
        ctx.fillText(prod.name || 'صفحة لم تتم قراءتها', cardX + effectiveCardW - pad, curContentY);

        curContentY += 18;
        drawRoundedRect(ctx, cardX + pad, curContentY, effectiveCardW - pad * 2, 24, 6, '#fef3c7', '#fde68a', 1);
        ctx.fillStyle = '#b45309';
        ctx.font = `bold ${isMicroCard ? 10 : 11.5}px Cairo, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('لم تتم قراءتها', cardX + effectiveCardW / 2, curContentY + 16);

        ctx.restore();
        return;
      }

      // Per-product overrides merged with cardConfig
      const prodOv = cardConfig.per_product_overrides?.[prod.id];
      const cardBg = prodOv?.bg_color || cardConfig.bg_color || '#ffffff';
      const cardBorderColor = prodOv?.border_color || cardConfig.border_color || '#e2e8f0';
      const cardTitleColor = prodOv?.title_color || cardConfig.title_color || '#0f172a';
      const priceBg = prodOv?.price_bg_color || cardConfig.price_bg_color || '#f0fdf4';
      const priceBorder = cardConfig.price_border_color || '#bbf7d0';
      const priceText = prodOv?.price_text_color || cardConfig.price_text_color || '#15803d';
      const badgeBg = cardConfig.badge_bg_color || '#f1f5f9';
      const badgeText = cardConfig.badge_text_color || '#475569';

      const effectiveRadius =
        cardConfig.shape === 'sharp'
          ? 0
          : cardConfig.shape === 'pill'
            ? Math.max(16, cardConfig.border_radius ?? 16)
            : Math.max(0, cardConfig.border_radius ?? 8);
      const effectiveBorderWidth =
        cardConfig.shape === 'minimal' ? 0 : Math.max(0, cardConfig.border_width ?? 1.2);

      // Card Outer Box (with optional soft shadow)
      ctx.save();
      if (cardConfig.shape === 'shadow') {
        ctx.shadowColor = 'rgba(15, 23, 42, 0.10)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
      }
      drawRoundedRect(
        ctx,
        cardX,
        cardY,
        effectiveCardW,
        cardH,
        effectiveRadius,
        cardBg,
        effectiveBorderWidth > 0 ? cardBorderColor : undefined,
        effectiveBorderWidth
      );
      ctx.restore();

      // Clip all inner card elements strictly inside the rounded card boundary
      ctx.save();
      const clipInset = Math.max(0.5, effectiveBorderWidth * 0.5);
      const cr = Math.max(0, effectiveRadius - clipInset);
      const cx = cardX + clipInset;
      const cy = cardY + clipInset;
      const cw = Math.max(1, effectiveCardW - clipInset * 2);
      const ch = Math.max(1, cardH - clipInset * 2);
      ctx.beginPath();
      ctx.moveTo(cx + cr, cy);
      ctx.lineTo(cx + cw - cr, cy);
      ctx.quadraticCurveTo(cx + cw, cy, cx + cw, cy + cr);
      ctx.lineTo(cx + cw, cy + ch - cr);
      ctx.quadraticCurveTo(cx + cw, cy + ch, cx + cw - cr, cy + ch);
      ctx.lineTo(cx + cr, cy + ch);
      ctx.quadraticCurveTo(cx, cy + ch, cx, cy + ch - cr);
      ctx.lineTo(cx, cy + cr);
      ctx.quadraticCurveTo(cx, cy, cx + cr, cy);
      ctx.closePath();
      ctx.clip();

      if (cardConfig.card_logo_enabled && (cardConfig.card_logo_layer ?? 'front') === 'back' && cardConfig.card_logo_scope !== 'image') {
        drawCanvasCardLogoStamp(ctx, logoImg, cardConfig, cardX, cardY, effectiveCardW, cardH);
      }

      const contentW = effectiveCardW - pad * 2;
      const contentX = cardX + pad;
      const isCenter = cardConfig.text_align === 'center';
      const imgScale = Math.min(2.0, Math.max(0.5, (cardConfig.image_height_scale || 100) / 100));
      const imgZoomScale = Math.min(1.8, Math.max(0.7, (cardConfig.image_zoom || 100) / 100));
      const imgFitMode: 'contain' | 'cover' = cardConfig.image_fit === 'cover' ? 'cover' : 'contain';

      const fitSingleLine = (text: string, maxW: number): string => {
        if (!text) return '';
        if (ctx.measureText(text).width <= maxW) return text;
        let out = text;
        while (out.length > 2 && ctx.measureText(`${out}…`).width > maxW) {
          out = out.slice(0, -1);
        }
        return `${out}…`;
      };

      const drawPriceSection = (px: number, py: number, pw: number) => {
        if (cardConfig.price_style === 'inline') {
          ctx.save();
          ctx.direction = 'ltr';
          ctx.textAlign = isCenter ? 'center' : 'left';
          ctx.fillStyle = priceText;
          ctx.font = `900 ${Math.round((isMicroCard ? 12.5 : isCompactCard ? 16 : 20) * fontScale)}px Cairo, Tajawal, sans-serif`;
          ctx.fillText(
            `${prod.selling_price || 0} ج.م`,
            isCenter ? px + pw / 2 : px + 4,
            py + (isMicroCard ? 15 : isCompactCard ? 19 : 23)
          );
          ctx.restore();
          return;
        }

        const isSolid = cardConfig.price_style === 'solid_footer';
        const boxFill = priceBg;
        const boxStroke = isSolid ? undefined : priceBorder;
        drawRoundedRect(ctx, px, py, pw, priceBoxH, Math.min(8, effectiveRadius || 6), boxFill, boxStroke, 1);

        ctx.save();
        if (pw > 95) {
          ctx.direction = 'rtl';
          ctx.textAlign = 'right';
          ctx.fillStyle = priceText;
          ctx.font = `600 ${Math.round((isMicroCard ? 8.5 : isCompactCard ? 10 : 11) * fontScale)}px Cairo, sans-serif`;
          ctx.fillText('سعر البيع:', px + pw - 6, py + Math.round(priceBoxH * 0.66));
        }
        ctx.direction = 'ltr';
        ctx.textAlign = pw > 95 ? 'left' : 'center';
        ctx.fillStyle = priceText;
        ctx.font = `bold ${Math.round((isMicroCard ? 12 : isCompactCard ? 15.5 : 19) * fontScale)}px Cairo, Tajawal, sans-serif`;
        ctx.fillText(
          `${prod.selling_price || 0} ج.م`,
          pw > 95 ? px + 6 : px + pw / 2,
          py + Math.round(priceBoxH * 0.72)
        );
        ctx.restore();
      };

      const drawBadgesSection = (bx: number, by: number, bw: number) => {
        if (!(showCode || showCategory) || by + badgeH > cardY + cardH - 2) return;
        const badgeFontSize = isMicroCard ? 7.5 : isCompactCard ? 9 : 10;
        ctx.save();
        if (showCode && prod.code) {
          ctx.font = `bold ${badgeFontSize}px Cairo, Tajawal, monospace`;
          const maxCodeW = showCategory && prod.category ? bw * 0.52 : bw;
          const codeW = Math.min(maxCodeW, ctx.measureText(prod.code).width + 8);
          const fittedCode = fitSingleLine(prod.code, Math.max(12, codeW - 6));
          drawRoundedRect(ctx, bx + bw - codeW, by, codeW, badgeH, 3, badgeBg);
          ctx.fillStyle = badgeText;
          ctx.direction = 'rtl';
          ctx.textAlign = 'right';
          ctx.fillText(fittedCode, bx + bw - 4, by + (isMicroCard ? 9.5 : isCompactCard ? 11 : 13));
        }

        if (showCategory && prod.category) {
          ctx.font = `600 ${badgeFontSize}px Cairo, sans-serif`;
          const maxCatW = showCode && prod.code ? bw * 0.44 : bw;
          const catW = Math.min(maxCatW, ctx.measureText(prod.category).width + 8);
          const fittedCat = fitSingleLine(prod.category, Math.max(12, catW - 6));
          drawRoundedRect(ctx, bx, by, catW, badgeH, 3, badgeBg, cardBorderColor, 0.8);
          ctx.fillStyle = badgeText;
          ctx.direction = 'rtl';
          ctx.textAlign = 'right';
          ctx.fillText(fittedCat, bx + catW - 4, by + (isMicroCard ? 9.5 : isCompactCard ? 11 : 13));
        }
        ctx.restore();
      };

      const drawExtraMetaLines = (
        mx: number,
        my: number,
        mw: number,
        overrideColor?: string
      ): number => {
        let nextY = my;
        if (!hasBrandLine && !hasSpecLine && !hasModelsLine) return nextY;
        ctx.save();
        ctx.direction = 'rtl';
        ctx.textAlign = isCenter ? 'center' : 'right';
        ctx.fillStyle = overrideColor || badgeText;
        const metaX = isCenter ? mx + mw / 2 : mx + mw;

        if (hasBrandLine && prod.group) {
          ctx.font = `bold ${isMicroCard ? 8 : 9.5}px Cairo, sans-serif`;
          ctx.fillText(fitSingleLine(prod.group, mw), metaX, nextY + 9);
          nextY += extraLineH;
        }
        if (hasSpecLine && prod.specification) {
          ctx.font = `500 ${isMicroCard ? 8 : 9}px Cairo, sans-serif`;
          ctx.fillText(fitSingleLine(prod.specification, mw), metaX, nextY + 9);
          nextY += extraLineH;
        }
        if (hasModelsLine && prod.available_models) {
          ctx.font = `500 ${isMicroCard ? 8 : 9}px Cairo, sans-serif`;
          ctx.fillText(fitSingleLine(prod.available_models.slice(0, 3).join(' • '), mw), metaX, nextY + 9);
          nextY += extraLineH;
        }
        ctx.restore();
        return nextY;
      };

      if (cardConfig.layout === 'overlay') {
        // Full-bleed card image with product name & details overlaid on measured contrast scrim
        if (showImage) {
          if (prod.image_url) {
            const pImg = imageCache.get(prod.image_url);
            if (pImg) {
              drawImageContain(
                ctx,
                pImg,
                cardX,
                cardY,
                effectiveCardW,
                cardH,
                imgZoomScale,
                imgFitMode
              );
            }
          } else {
            ctx.save();
            ctx.fillStyle = '#94a3b8';
            ctx.font = `${isMicroCard ? 9 : 12}px Cairo, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('بدون صورة', cardX + effectiveCardW / 2, cardY + Math.round(cardH * 0.42));
            ctx.restore();
          }
        }

        const scrimAlpha = Math.min(0.85, Math.max(0, (cardConfig.overlay_scrim_opacity ?? 60) / 100));
        const overlayPos = cardConfig.overlay_content_position || 'bottom';
        const overlayTone = cardConfig.overlay_text_tone || 'white';
        const overlayTitleColor =
          overlayTone === 'white' ? '#ffffff' : overlayTone === 'dark' ? '#0f172a' : cardTitleColor;
        const overlayMetaColor =
          overlayTone === 'white'
            ? 'rgba(241, 245, 249, 0.92)'
            : overlayTone === 'dark'
              ? '#334155'
              : badgeText;

        if (scrimAlpha > 0) {
          ctx.save();
          if (overlayPos === 'top') {
            const grad = ctx.createLinearGradient(0, cardY, 0, cardY + cardH * 0.88);
            grad.addColorStop(0, `rgba(15, 23, 42, ${Math.min(0.92, scrimAlpha * 1.15)})`);
            grad.addColorStop(0.55, `rgba(15, 23, 42, ${scrimAlpha * 0.58})`);
            grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
            ctx.fillStyle = grad;
          } else if (overlayPos === 'center') {
            const grad = ctx.createLinearGradient(0, cardY, 0, cardY + cardH);
            grad.addColorStop(0, `rgba(15, 23, 42, ${scrimAlpha * 0.45})`);
            grad.addColorStop(0.5, `rgba(15, 23, 42, ${Math.min(0.9, scrimAlpha * 1.05)})`);
            grad.addColorStop(1, `rgba(15, 23, 42, ${scrimAlpha * 0.5})`);
            ctx.fillStyle = grad;
          } else {
            const grad = ctx.createLinearGradient(0, cardY + cardH * 0.14, 0, cardY + cardH);
            grad.addColorStop(0, 'rgba(15, 23, 42, 0)');
            grad.addColorStop(0.45, `rgba(15, 23, 42, ${scrimAlpha * 0.55})`);
            grad.addColorStop(1, `rgba(15, 23, 42, ${Math.min(0.92, scrimAlpha * 1.18)})`);
            ctx.fillStyle = grad;
          }
          ctx.fillRect(cardX, cardY, effectiveCardW, cardH);
          ctx.restore();
        }

        ctx.save();
        ctx.font = `bold ${Math.round((isMicroCard ? 10 : isCompactCard ? 12 : 13.5) * fontScale)}px Cairo, Tajawal, sans-serif`;
        const overlayNameLines = wrapTextLines(ctx, prod.name, contentW, 2);
        ctx.restore();

        const metaRowsCount =
          (hasBrandLine ? 1 : 0) + (hasSpecLine ? 1 : 0) + (hasModelsLine ? 1 : 0);
        const totalOverlayH =
          overlayNameLines.length * nameLineH +
          metaRowsCount * extraLineH +
          4 +
          priceBoxH +
          (badgeH > 0 ? badgeH + 5 : 0);

        let curOverlayY =
          overlayPos === 'top'
            ? cardY + pad
            : overlayPos === 'center'
              ? Math.max(cardY + pad, cardY + Math.round((cardH - totalOverlayH) / 2))
              : Math.max(cardY + pad, cardY + cardH - pad - totalOverlayH);

        ctx.save();
        ctx.direction = 'rtl';
        ctx.textAlign = isCenter ? 'center' : 'right';
        ctx.fillStyle = overlayTitleColor;
        if (overlayTone === 'white') {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetY = 1;
        }
        ctx.font = `bold ${Math.round((isMicroCard ? 10 : isCompactCard ? 12 : 13.5) * fontScale)}px Cairo, Tajawal, sans-serif`;
        for (const nLine of overlayNameLines) {
          ctx.fillText(
            nLine,
            isCenter ? contentX + contentW / 2 : contentX + contentW,
            curOverlayY + (isMicroCard ? 9 : isCompactCard ? 11 : 13)
          );
          curOverlayY += nameLineH;
        }
        ctx.restore();

        curOverlayY = drawExtraMetaLines(contentX, curOverlayY, contentW, overlayMetaColor);
        curOverlayY += 4;
        drawPriceSection(contentX, curOverlayY, contentW);
        drawBadgesSection(contentX, curOverlayY + priceBoxH + 5, contentW);
        if (cardConfig.card_logo_enabled && (cardConfig.card_logo_layer ?? 'front') === 'front') {
          drawCanvasCardLogoStamp(ctx, logoImg, cardConfig, cardX, cardY, effectiveCardW, cardH);
        }
        ctx.restore();

        if (effectiveBorderWidth > 0) {
          drawRoundedRect(
            ctx,
            cardX,
            cardY,
            effectiveCardW,
            cardH,
            effectiveRadius,
            undefined,
            cardBorderColor,
            effectiveBorderWidth
          );
        }
        return;
      }

      if (cardConfig.layout === 'horizontal') {
        // Horizontal card: Image width responds to image_height_scale (24%..56%)
        const gapInner = 8;
        const imgW = showImage
          ? Math.round(contentW * Math.min(0.56, Math.max(0.24, 0.38 * imgScale)))
          : 0;
        const infoW = showImage ? contentW - imgW - gapInner : contentW;
        const imgX = contentX + contentW - imgW;
        const infoX = contentX;
        const innerH = cardH - pad * 2;
        const innerImgPad = imgFitMode === 'cover' ? 0 : 3;

        if (showImage) {
          drawRoundedRect(ctx, imgX, cardY + pad, imgW, innerH, Math.max(4, effectiveRadius - 2), '#fafafa', '#f1f5f9', 1);
          if (cardConfig.card_logo_enabled && (cardConfig.card_logo_layer ?? 'front') === 'back' && cardConfig.card_logo_scope === 'image') {
            drawCanvasCardLogoStamp(ctx, logoImg, cardConfig, imgX, cardY + pad, imgW, innerH);
          }
          if (prod.image_url) {
            const pImg = imageCache.get(prod.image_url);
            if (pImg) {
              drawImageContain(
                ctx,
                pImg,
                imgX + innerImgPad,
                cardY + pad + innerImgPad,
                imgW - innerImgPad * 2,
                innerH - innerImgPad * 2,
                imgZoomScale,
                imgFitMode
              );
            }
          } else {
            ctx.save();
            ctx.fillStyle = '#cbd5e1';
            ctx.font = `${isMicroCard ? 9 : 11}px Cairo, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('بدون صورة', imgX + imgW / 2, cardY + pad + innerH / 2 + 4);
            ctx.restore();
          }
          if (cardConfig.card_logo_enabled && (cardConfig.card_logo_layer ?? 'front') === 'front' && cardConfig.card_logo_scope === 'image') {
            drawCanvasCardLogoStamp(ctx, logoImg, cardConfig, imgX, cardY + pad, imgW, innerH);
          }
        }

        let infoY = cardY + pad + 2;
        ctx.save();
        ctx.direction = 'rtl';
        ctx.textAlign = isCenter ? 'center' : 'right';
        ctx.fillStyle = cardTitleColor;
        ctx.font = `bold ${Math.round((isMicroCard ? 10 : isCompactCard ? 12 : 13.5) * fontScale)}px Cairo, Tajawal, sans-serif`;
        const nameLines = wrapTextLines(ctx, prod.name, infoW, 2);
        for (const nLine of nameLines) {
          ctx.fillText(nLine, isCenter ? infoX + infoW / 2 : infoX + infoW, infoY + (isMicroCard ? 9 : 12));
          infoY += nameLineH;
        }
        ctx.restore();

        infoY = drawExtraMetaLines(infoX, infoY + 2, infoW);
        infoY = Math.max(infoY + 4, cardY + cardH - pad - priceBoxH - (badgeH > 0 ? badgeH + 6 : 0));
        drawPriceSection(infoX, infoY, infoW);
        drawBadgesSection(infoX, infoY + priceBoxH + 5, infoW);
        if (cardConfig.card_logo_enabled && (cardConfig.card_logo_layer ?? 'front') === 'front' && (cardConfig.card_logo_scope !== 'image' || !showImage)) {
          drawCanvasCardLogoStamp(ctx, logoImg, cardConfig, cardX, cardY, effectiveCardW, cardH);
        }
        ctx.restore();
        return;
      }

      let curContentY = cardY + pad;

      // Badge-top layout: Price bar above image
      if (cardConfig.layout === 'badge_top') {
        drawPriceSection(contentX, curContentY, contentW);
        curContentY += priceBoxH + (isMicroCard ? 4 : 6);
      }

      // 1. Image (allows growing into spare single-line/compact spacing when imgScale > 1)
      if (showImage) {
        const availableImgH = Math.max(32, cardH - textBudgetH);
        const minCompactTextH =
          pad * 2 + nameLineH + extraMetaH + priceBoxH + (badgeH > 0 ? badgeH + 4 : 2) + 8;
        const maxAllowedImgH = Math.max(availableImgH, cardH - minCompactTextH);
        const imgBoxH = Math.min(maxAllowedImgH, Math.max(24, Math.round(availableImgH * imgScale)));
        const innerImgPad = imgFitMode === 'cover' ? 0 : 3;
        drawRoundedRect(ctx, contentX, curContentY, contentW, imgBoxH, Math.max(4, effectiveRadius - 2), '#fafafa', '#f1f5f9', 1);
        if (cardConfig.card_logo_enabled && (cardConfig.card_logo_layer ?? 'front') === 'back' && cardConfig.card_logo_scope === 'image') {
          drawCanvasCardLogoStamp(ctx, logoImg, cardConfig, contentX, curContentY, contentW, imgBoxH);
        }

        if (prod.image_url) {
          const pImg = imageCache.get(prod.image_url);
          if (pImg) {
            drawImageContain(
              ctx,
              pImg,
              contentX + innerImgPad,
              curContentY + innerImgPad,
              contentW - innerImgPad * 2,
              imgBoxH - innerImgPad * 2,
              imgZoomScale,
              imgFitMode
            );
          }
        } else {
          ctx.save();
          ctx.fillStyle = '#cbd5e1';
          ctx.font = `${isMicroCard ? 9 : isCompactCard ? 10.5 : 12}px Cairo, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('بدون صورة', cardX + effectiveCardW / 2, curContentY + imgBoxH / 2 + 4);
          ctx.restore();
        }
        if (cardConfig.card_logo_enabled && (cardConfig.card_logo_layer ?? 'front') === 'front' && cardConfig.card_logo_scope === 'image') {
          drawCanvasCardLogoStamp(ctx, logoImg, cardConfig, contentX, curContentY, contentW, imgBoxH);
        }
        curContentY += imgBoxH + (isMicroCard ? 4 : isCompactCard ? 6 : 8);
      } else {
        curContentY += 4;
      }

      // 2. Product Name (Max 2 lines, tight)
      ctx.save();
      ctx.direction = 'rtl';
      ctx.textAlign = isCenter ? 'center' : 'right';
      ctx.fillStyle = cardTitleColor;
      ctx.font = `bold ${Math.round((isMicroCard ? 10 : isCompactCard ? 12 : 13.5) * fontScale)}px Cairo, Tajawal, sans-serif`;
      const nameLines = wrapTextLines(ctx, prod.name, contentW, 2);
      for (const nLine of nameLines) {
        ctx.fillText(
          nLine,
          isCenter ? contentX + contentW / 2 : contentX + contentW,
          curContentY + (isMicroCard ? 9 : isCompactCard ? 11 : 13)
        );
        curContentY += nameLineH;
      }
      if (nameLines.length === 1) {
        curContentY += isCompactCard ? 2 : 4;
      }
      ctx.restore();

      curContentY = drawExtraMetaLines(contentX, curContentY, contentW);

      // 3. Selling Price (when not badge_top)
      if (cardConfig.layout !== 'badge_top') {
        const bottomReserved = pad + priceBoxH + (badgeH > 0 ? badgeH + 5 : 0);
        curContentY = Math.min(curContentY + (isMicroCard ? 2 : isCompactCard ? 4 : 6), cardY + cardH - bottomReserved);
        drawPriceSection(contentX, curContentY, contentW);
        curContentY += priceBoxH + (isMicroCard ? 3 : isCompactCard ? 5 : 6);
      } else {
        curContentY += isMicroCard ? 3 : 6;
      }

      // 4. Badges (Code & Category)
      drawBadgesSection(contentX, curContentY, contentW);
      if (cardConfig.card_logo_enabled && (cardConfig.card_logo_layer ?? 'front') === 'front' && (cardConfig.card_logo_scope !== 'image' || !showImage)) {
        drawCanvasCardLogoStamp(ctx, logoImg, cardConfig, cardX, cardY, effectiveCardW, cardH);
      }
      ctx.restore();
    });

    curY += cardH + gapY;
  });

  // 5. Footer Section (Inside 10mm margins)
  ctx.save();
  const footerY = H - MARGIN_PX;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(MARGIN_PX, footerY);
  ctx.lineTo(W - MARGIN_PX, footerY);
  ctx.stroke();

  // Footer Note on right
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = '500 13px Cairo, sans-serif';
  if (identity.showFooterNote && footerNote) {
    ctx.fillText(footerNote, W - MARGIN_PX, footerY + 24);
  }

  // Page numbering on left
  ctx.direction = 'rtl';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px Cairo, sans-serif';
  const footerPageLabel =
    identity.showCompanyName && companyName
      ? `${companyName} • صفحة ${pageIndex + 1} من ${totalPages}`
      : `صفحة ${pageIndex + 1} من ${totalPages}`;
  ctx.fillText(footerPageLabel, MARGIN_PX, footerY + 24);
  ctx.restore();

  // 6. Top Logo / Watermark Layer (when set to 'front' = طبقة علوية فوق المنتجات)
  if (wmConfig.layer === 'front' && wmConfig.type !== 'none' && logoImg) {
    drawCanvasWatermarkLayer(ctx, W, H, logoImg, wmConfig);
  }
}

/**
 * Options for progressive Canvas 2D PDF generation
 */
export interface GeneratePdfOptions {
  categoryFilter?: string;
  filename?: string;
  action?: 'download' | 'blob';
  customCatalog?: SavedCatalog;
  skipAutoSort?: boolean;
  onProgress?: (progress: { currentPage: number; totalPages: number; percent: number }) => void;
  isCancelled?: () => boolean;
}

/**
 * Builds the sequence of items (headers and products) for catalog rendering
 */
export function buildCatalogItemsSequence(
  products: Product[],
  settings: CatalogSettings,
  customCatalog?: SavedCatalog,
  categoryFilter?: string
): CatalogPageItem[] {
  const sectionConfig = resolveSectionHeaderConfig(settings, customCatalog);
  const overrides = sectionConfig.overrides || {};
  const categoryList =
    settings.categories && settings.categories.length > 0 ? settings.categories : DEFAULT_CATEGORIES;
  const categoryDefMap = new Map(categoryList.map((c) => [c.name, c]));
  const primaryColor = customCatalog?.primary_color || settings.primary_color || '#ea580c';

  const resolveCategoryHeaderMeta = (catName: string, count: number) => {
    const def = categoryDefMap.get(catName);
    const ov = overrides[catName];
    const title = ov?.title?.trim() || def?.catalog_title || def?.name || catName;
    const subtitle = sectionConfig.show_subtitle ? ov?.subtitle?.trim() || undefined : undefined;
    const color =
      ov?.color ||
      (sectionConfig.color_mode === 'category'
        ? def?.color || primaryColor
        : sectionConfig.color_mode === 'custom'
          ? sectionConfig.custom_color || primaryColor
          : primaryColor);

    return {
      title,
      subtitle,
      count: sectionConfig.show_count ? count : undefined,
      color,
      pageBreakBefore: Boolean(ov?.page_break_before ?? sectionConfig.page_break_before),
    };
  };

  if (customCatalog) {
    // 1. Map available products
    const prodMap = new Map<string, Product>();
    products.forEach((p) => {
      if (p.id) prodMap.set(p.id, p);
    });

    // 2. Resolve items based on saved product_ids order
    const selectedProds: Product[] = [];
    customCatalog.product_ids.forEach((id) => {
      const found = prodMap.get(id);
      if (found) {
        selectedProds.push(found);
      }
    });

    let filtered = selectedProds.filter((p) => {
      const catName = p.category?.trim() || 'متنوعة';
      return !overrides[catName]?.hidden;
    });
    if (categoryFilter && categoryFilter !== 'الكل') {
      filtered = filtered.filter((p) => p.category === categoryFilter);
    }

    // Count items per category for display badges
    const catCountMap = new Map<string, number>();
    filtered.forEach((p) => {
      const c = p.category?.trim() || 'متنوعة';
      catCountMap.set(c, (catCountMap.get(c) || 0) + 1);
    });

    const items: CatalogPageItem[] = [];
    const manualHeaders = customCatalog.manual_headers || [];

    // Check for any manual header at position 0 (before all products)
    const topHeaders = manualHeaders.filter((h) => !h.after_product_id);
    topHeaders.forEach((h) => {
      items.push({ type: 'header', title: h.title, subtitle: h.subtitle, color: primaryColor });
    });

    let lastCategory = '';
    for (let i = 0; i < filtered.length; i++) {
      const prod = filtered[i];

      // Automatic category header if enabled
      if (customCatalog.auto_category_headers) {
        const prodCat = prod.category?.trim() || 'متنوعة';
        if (prodCat !== lastCategory) {
          lastCategory = prodCat;
          if (!overrides[prodCat]?.hide_header) {
            const meta = resolveCategoryHeaderMeta(prodCat, catCountMap.get(prodCat) || 0);
            items.push({
              type: 'header',
              ...meta,
              isCategoryAuto: true,
            });
          }
        }
      }

      items.push({ type: 'product', product: prod });

      // Check for manual headers placed right after this product
      if (prod.id) {
        const afterHeaders = manualHeaders.filter((h) => h.after_product_id === prod.id);
        afterHeaders.forEach((h) => {
          items.push({ type: 'header', title: h.title, subtitle: h.subtitle, color: primaryColor });
        });
      }
    }

    return items;
  }

  // Standard Catalog sequence
  let filtered = products.filter(
    (p) =>
      Boolean((p as any).is_unread_placeholder) ||
      (p.included_in_catalog && (p.selling_price || 0) > 0 && p.name?.trim())
  );
  if (categoryFilter && categoryFilter !== 'الكل') {
    filtered = filtered.filter((p) => p.category === categoryFilter || Boolean((p as any).is_unread_placeholder));
  }

  const sortedCategories = [...categoryList].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const categoryRankMap = new Map<string, number>();
  sortedCategories.forEach((cat, idx) => {
    categoryRankMap.set(cat.name, idx);
  });

  if (settings.group_by_category) {
    // Group products by category with full section overrides (order, hidden, sort_products, title, color)
    const groupsMap = new Map<string, Product[]>();
    filtered.forEach((p) => {
      const catName = p.category?.trim() || 'متنوعة';
      if (overrides[catName]?.hidden) return;
      if (!groupsMap.has(catName)) groupsMap.set(catName, []);
      groupsMap.get(catName)!.push(p);
    });

    const orderedCatNames = Array.from(groupsMap.keys()).sort((a, b) => {
      const orderA = overrides[a]?.order ?? (categoryRankMap.has(a) ? categoryRankMap.get(a)! : 999);
      const orderB = overrides[b]?.order ?? (categoryRankMap.has(b) ? categoryRankMap.get(b)! : 999);
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b, 'ar');
    });

    const items: CatalogPageItem[] = [];
    orderedCatNames.forEach((catName) => {
      const groupProds = [...(groupsMap.get(catName) || [])];
      const sortMode = overrides[catName]?.sort_products || 'default';
      if (sortMode === 'price_asc') {
        groupProds.sort((a, b) => (a.selling_price || 0) - (b.selling_price || 0));
      } else if (sortMode === 'price_desc') {
        groupProds.sort((a, b) => (b.selling_price || 0) - (a.selling_price || 0));
      } else if (sortMode === 'name') {
        groupProds.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      } else {
        groupProds.sort((a, b) => (a.card_index || 0) - (b.card_index || 0));
      }

      if (!overrides[catName]?.hide_header) {
        const meta = resolveCategoryHeaderMeta(catName, groupProds.length);
        items.push({
          type: 'header',
          ...meta,
          isCategoryAuto: true,
        });
      }

      groupProds.forEach((p) => items.push({ type: 'product', product: p }));
    });

    return items;
  }

  // Even when section headers are off, ALWAYS respect section hidden, section order, and per-section sort!
  const ungroupedVisible = filtered.filter((p) => {
    const catName = p.category?.trim() || 'متنوعة';
    return !overrides[catName]?.hidden;
  });

  ungroupedVisible.sort((a, b) => {
    const catA = a.category?.trim() || 'متنوعة';
    const catB = b.category?.trim() || 'متنوعة';
    const orderA = overrides[catA]?.order ?? (categoryRankMap.has(catA) ? categoryRankMap.get(catA)! : 999);
    const orderB = overrides[catB]?.order ?? (categoryRankMap.has(catB) ? categoryRankMap.get(catB)! : 999);
    if (orderA !== orderB) return orderA - orderB;
    if (catA !== catB) return catA.localeCompare(catB, 'ar');
    const sortMode = overrides[catA]?.sort_products || 'default';
    if (sortMode === 'price_asc') return (a.selling_price || 0) - (b.selling_price || 0);
    if (sortMode === 'price_desc') return (b.selling_price || 0) - (a.selling_price || 0);
    if (sortMode === 'name') return a.name.localeCompare(b.name, 'ar');
    return (a.card_index || 0) - (b.card_index || 0);
  });

  return ungroupedVisible.map((p) => ({ type: 'product', product: p }));
}

/**
 * Renders the PDF page-by-page directly onto an HTML5 <canvas> (1240 × 1754 px)
 * using the Canvas 2D API, converting each page to JPEG (0.85) into jsPDF.
 * No html2canvas or html2pdf is used!
 */
export async function generateCatalogPdf(
  products: Product[],
  settings: CatalogSettings,
  options: GeneratePdfOptions = {}
): Promise<Blob | void> {
  const {
    categoryFilter,
    filename = 'كتالوج_الأسعار.pdf',
    action = 'download',
    customCatalog,
    onProgress,
    isCancelled,
  } = options;

  // Build items sequence
  const catalogItems = buildCatalogItemsSequence(products, settings, customCatalog, categoryFilter);

  if (catalogItems.length === 0) {
    throw new Error('لا توجد منتجات مسعرة ومكتملة لعرضها في الكتالوج.');
  }

  const productItemsCount = catalogItems.filter((it) => it.type === 'product').length;
  const activeSymmetry = customCatalog?.grid_symmetry || settings.grid_symmetry || 'any';
  const resolvedLayout = resolveEffectiveGridLayout({
    mode: customCatalog?.grid_layout_mode || settings.grid_layout_mode || 'manual',
    symmetry: activeSymmetry,
    columns: customCatalog?.columns_count || settings.products_per_row || 4,
    rows: customCatalog?.rows_count || settings.rows_per_page,
    itemCount: productItemsCount,
    screenWidth: 1200, // A4 PDF uses print-proportioned auto grid with zero empty spaces
  });
  const activeCols = resolvedLayout.cols;
  const activeRows = resolvedLayout.rows;
  const activeMode = resolvedLayout.fillEmptySpace ? 'auto' : 'manual';

  const activeSettings: CatalogSettings = {
    ...settings,
    company_name: customCatalog?.company_name || settings.company_name,
    business_bio:
      customCatalog?.business_bio !== undefined ? customCatalog.business_bio : settings.business_bio,
    logo_url: customCatalog?.logo_url !== undefined ? customCatalog.logo_url : settings.logo_url,
    phone: customCatalog?.phone !== undefined ? customCatalog.phone : settings.phone,
    whatsapp_number:
      customCatalog?.whatsapp_number !== undefined
        ? customCatalog.whatsapp_number
        : settings.whatsapp_number,
    secondary_phone:
      customCatalog?.secondary_phone !== undefined
        ? customCatalog.secondary_phone
        : settings.secondary_phone,
    extra_phones:
      customCatalog?.extra_phones !== undefined ? customCatalog.extra_phones : settings.extra_phones,
    address: customCatalog?.address !== undefined ? customCatalog.address : settings.address,
    email: customCatalog?.email !== undefined ? customCatalog.email : settings.email,
    tax_or_cr_number:
      customCatalog?.tax_or_cr_number !== undefined
        ? customCatalog.tax_or_cr_number
        : settings.tax_or_cr_number,
    price_validity_note: customCatalog?.price_validity_note ?? settings.price_validity_note,
    primary_color: customCatalog?.primary_color || settings.primary_color,
    footer_note: customCatalog?.footer_note ?? settings.footer_note,
    products_per_row: activeCols,
    rows_per_page: activeRows,
    grid_layout_mode: activeMode,
    grid_symmetry: activeSymmetry,
    show_code: customCatalog?.show_code !== undefined ? customCatalog.show_code : settings.show_code,
    show_category:
      customCatalog?.show_category !== undefined ? customCatalog.show_category : settings.show_category,
    show_image:
      customCatalog?.show_image !== undefined ? customCatalog.show_image : settings.show_image,
    show_company_name: customCatalog?.show_company_name ?? settings.show_company_name,
    show_business_bio: customCatalog?.show_business_bio ?? settings.show_business_bio,
    show_catalog_title: customCatalog?.show_catalog_title ?? settings.show_catalog_title,
    show_price_validity: customCatalog?.show_price_validity ?? settings.show_price_validity,
    show_phone: customCatalog?.show_phone ?? settings.show_phone,
    show_whatsapp: customCatalog?.show_whatsapp ?? settings.show_whatsapp,
    show_secondary_phone: customCatalog?.show_secondary_phone ?? settings.show_secondary_phone,
    show_address: customCatalog?.show_address ?? settings.show_address,
    show_email: customCatalog?.show_email ?? settings.show_email,
    show_tax_or_cr: customCatalog?.show_tax_or_cr ?? settings.show_tax_or_cr,
    show_footer_note: customCatalog?.show_footer_note ?? settings.show_footer_note,
  };

  // 1. Preload fonts
  await ensureFontsLoaded();

  // 2. Preload images cache (each image loaded once)
  const productObjects = catalogItems
    .filter((item): item is { type: 'product'; product: Product } => item.type === 'product')
    .map((item) => item.product);

  const imageCache = await preloadImagesCache(productObjects, activeSettings.logo_url);

  // 3. Paginate items with page-break awareness
  const sectionConfig = resolveSectionHeaderConfig(activeSettings, customCatalog);
  const pages = paginateCatalogPageItems(catalogItems, activeCols, activeRows, sectionConfig);
  const totalPages = pages.length;

  // 4. Initialize jsPDF (A4 portrait: 210 × 297 mm)
  const pdfDoc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  // 5. Create reusable single Canvas (1240 × 1754 px)
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('تعذر إنشاء سياق الرسم 2D على المتصفح.');
  }

  try {
    for (let i = 0; i < totalPages; i++) {
      // Check cancellation token
      if (isCancelled && isCancelled()) {
        throw new Error('تم إلغاء عملية إنشاء ملف الـ PDF من قبل المستخدم.');
      }

      // Clear canvas before each page
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Render page onto canvas
      renderPageToCanvas(ctx, pages[i], activeSettings, i, totalPages, imageCache, categoryFilter, customCatalog);

      // Convert to JPEG quality 0.85
      const imgData = canvas.toDataURL('image/jpeg', 0.85);

      // Add to jsPDF
      if (i > 0) {
        pdfDoc.addPage('a4', 'portrait');
      }
      pdfDoc.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');

      // Clear canvas buffer
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Notify progress
      if (onProgress) {
        onProgress({
          currentPage: i + 1,
          totalPages,
          percent: Math.round(((i + 1) / totalPages) * 100),
        });
      }

      // Small pause (20ms) between pages to keep the UI smooth and responsive
      await new Promise((r) => setTimeout(r, 20));
    }

    if (action === 'blob') {
      return pdfDoc.output('blob');
    } else {
      pdfDoc.save(filename);
    }
  } catch (err: any) {
    throw new Error(err.message || 'حدث خطأ غير متوقع أثناء رسم وتوليد الـ PDF.');
  } finally {
    // Release canvas memory
    canvas.width = 1;
    canvas.height = 1;
  }
}

export interface RenderedCatalogPagePng {
  pageNumber: number; // 1-indexed
  totalPages: number;
  dataUrl: string;
  width: number;
  height: number;
  productCount: number;
}

export interface RenderCatalogPngOptions {
  categoryFilter?: string;
  customCatalog?: SavedCatalog;
  scale?: 1 | 2;
  pageNumbers?: number[]; // 1-indexed subset; empty/undefined renders all pages
  onProgress?: (progress: { currentPage: number; totalPages: number; percent: number }) => void;
  isCancelled?: () => boolean;
}

/**
 * Renders catalog pages directly to crystal-clear lossless PNG images (1240x1754 or 2480x3508)
 */
export async function renderCatalogPagesAsPng(
  products: Product[],
  settings: CatalogSettings,
  options: RenderCatalogPngOptions = {}
): Promise<RenderedCatalogPagePng[]> {
  const {
    categoryFilter,
    customCatalog,
    scale = 2,
    pageNumbers,
    onProgress,
    isCancelled,
  } = options;

  const catalogItems = buildCatalogItemsSequence(products, settings, customCatalog, categoryFilter);
  if (catalogItems.length === 0) {
    throw new Error('لا توجد منتجات مسعرة ومكتملة لعرضها في الكتالوج.');
  }

  const productItemsCount = catalogItems.filter((it) => it.type === 'product').length;
  const activeSymmetry = customCatalog?.grid_symmetry || settings.grid_symmetry || 'any';
  const resolvedLayout = resolveEffectiveGridLayout({
    mode: customCatalog?.grid_layout_mode || settings.grid_layout_mode || 'manual',
    symmetry: activeSymmetry,
    columns: customCatalog?.columns_count || settings.products_per_row || 4,
    rows: customCatalog?.rows_count || settings.rows_per_page,
    itemCount: productItemsCount,
    screenWidth: 1200,
  });
  const activeCols = resolvedLayout.cols;
  const activeRows = resolvedLayout.rows;
  const activeMode = resolvedLayout.fillEmptySpace ? 'auto' : 'manual';

  const activeSettings: CatalogSettings = {
    ...settings,
    company_name: customCatalog?.company_name || settings.company_name,
    business_bio:
      customCatalog?.business_bio !== undefined ? customCatalog.business_bio : settings.business_bio,
    logo_url: customCatalog?.logo_url !== undefined ? customCatalog.logo_url : settings.logo_url,
    phone: customCatalog?.phone !== undefined ? customCatalog.phone : settings.phone,
    whatsapp_number:
      customCatalog?.whatsapp_number !== undefined
        ? customCatalog.whatsapp_number
        : settings.whatsapp_number,
    secondary_phone:
      customCatalog?.secondary_phone !== undefined
        ? customCatalog.secondary_phone
        : settings.secondary_phone,
    extra_phones:
      customCatalog?.extra_phones !== undefined ? customCatalog.extra_phones : settings.extra_phones,
    address: customCatalog?.address !== undefined ? customCatalog.address : settings.address,
    email: customCatalog?.email !== undefined ? customCatalog.email : settings.email,
    tax_or_cr_number:
      customCatalog?.tax_or_cr_number !== undefined
        ? customCatalog.tax_or_cr_number
        : settings.tax_or_cr_number,
    price_validity_note: customCatalog?.price_validity_note ?? settings.price_validity_note,
    primary_color: customCatalog?.primary_color || settings.primary_color,
    footer_note: customCatalog?.footer_note ?? settings.footer_note,
    products_per_row: activeCols,
    rows_per_page: activeRows,
    grid_layout_mode: activeMode,
    grid_symmetry: activeSymmetry,
    show_code: customCatalog?.show_code !== undefined ? customCatalog.show_code : settings.show_code,
    show_category:
      customCatalog?.show_category !== undefined ? customCatalog.show_category : settings.show_category,
    show_image:
      customCatalog?.show_image !== undefined ? customCatalog.show_image : settings.show_image,
    show_company_name: customCatalog?.show_company_name ?? settings.show_company_name,
    show_business_bio: customCatalog?.show_business_bio ?? settings.show_business_bio,
    show_catalog_title: customCatalog?.show_catalog_title ?? settings.show_catalog_title,
    show_price_validity: customCatalog?.show_price_validity ?? settings.show_price_validity,
    show_phone: customCatalog?.show_phone ?? settings.show_phone,
    show_whatsapp: customCatalog?.show_whatsapp ?? settings.show_whatsapp,
    show_secondary_phone: customCatalog?.show_secondary_phone ?? settings.show_secondary_phone,
    show_address: customCatalog?.show_address ?? settings.show_address,
    show_email: customCatalog?.show_email ?? settings.show_email,
    show_tax_or_cr: customCatalog?.show_tax_or_cr ?? settings.show_tax_or_cr,
    show_footer_note: customCatalog?.show_footer_note ?? settings.show_footer_note,
  };

  await ensureFontsLoaded();

  const productObjects = catalogItems
    .filter((item): item is { type: 'product'; product: Product } => item.type === 'product')
    .map((item) => item.product);

  const imageCache = await preloadImagesCache(
    productObjects,
    activeSettings.logo_url,
    scale >= 2 ? 780 : 450
  );

  const sectionConfig = resolveSectionHeaderConfig(activeSettings, customCatalog);
  const pages = paginateCatalogPageItems(catalogItems, activeCols, activeRows, sectionConfig);
  const totalPages = pages.length;

  const targetIndices =
    pageNumbers && pageNumbers.length > 0
      ? pageNumbers
          .map((n) => Math.round(n) - 1)
          .filter((idx) => idx >= 0 && idx < totalPages)
      : pages.map((_, idx) => idx);

  if (targetIndices.length === 0) {
    throw new Error('لم يتم تحديد صفحات صالحة للتصدير.');
  }

  const outW = CANVAS_WIDTH * scale;
  const outH = CANVAS_HEIGHT * scale;
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('تعذر إنشاء سياق الرسم 2D لتجهيز صور PNG.');
  }

  const results: RenderedCatalogPagePng[] = [];
  try {
    for (let k = 0; k < targetIndices.length; k++) {
      if (isCancelled && isCancelled()) {
        throw new Error('تم إلغاء عملية استخراج صور PNG بناءً على طلبك.');
      }

      const pageIdx = targetIndices[k];
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, outW, outH);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      renderPageToCanvas(
        ctx,
        pages[pageIdx],
        activeSettings,
        pageIdx,
        totalPages,
        imageCache,
        categoryFilter,
        customCatalog
      );

      const dataUrl = canvas.toDataURL('image/png');
      const productCount = pages[pageIdx].filter((it) => it.type === 'product').length;
      results.push({
        pageNumber: pageIdx + 1,
        totalPages,
        dataUrl,
        width: outW,
        height: outH,
        productCount,
      });

      if (onProgress) {
        onProgress({
          currentPage: k + 1,
          totalPages: targetIndices.length,
          percent: Math.round(((k + 1) / targetIndices.length) * 100),
        });
      }

      await new Promise((r) => setTimeout(r, 16));
    }

    return results;
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds HTML for previewing pages in the UI
 */
export function buildPreviewHtml(
  products: Product[],
  settings: CatalogSettings,
  categoryFilter?: string,
  maxPages: number = 2,
  customCatalog?: SavedCatalog,
  startPage: number = 0
): string {
  const layoutMode = customCatalog?.grid_layout_mode || settings.grid_layout_mode || 'manual';
  const activeSymmetry = customCatalog?.grid_symmetry || settings.grid_symmetry || 'any';
  const rawCols = customCatalog?.columns_count || settings.products_per_row || 4;
  const rawRows = customCatalog?.rows_count || settings.rows_per_page;

  const tempSettings: CatalogSettings = {
    ...settings,
    products_per_row: clampGridColumns(rawCols),
    rows_per_page: clampGridRows(rawRows, rawCols),
    grid_layout_mode: layoutMode,
    grid_symmetry: activeSymmetry,
  };

  const catalogItems = buildCatalogItemsSequence(products, tempSettings, customCatalog, categoryFilter);
  const productItemsCount = catalogItems.filter((it) => it.type === 'product').length;
  const resolvedLayout = resolveEffectiveGridLayout({
    mode: layoutMode,
    symmetry: activeSymmetry,
    columns: rawCols,
    rows: rawRows,
    itemCount: productItemsCount,
  });
  const activeCols = resolvedLayout.cols;
  const activeRows = resolvedLayout.rows;

  const activeSettings: CatalogSettings = {
    ...settings,
    company_name: customCatalog?.company_name || settings.company_name,
    business_bio:
      customCatalog?.business_bio !== undefined ? customCatalog.business_bio : settings.business_bio,
    logo_url: customCatalog?.logo_url !== undefined ? customCatalog.logo_url : settings.logo_url,
    phone: customCatalog?.phone !== undefined ? customCatalog.phone : settings.phone,
    whatsapp_number:
      customCatalog?.whatsapp_number !== undefined
        ? customCatalog.whatsapp_number
        : settings.whatsapp_number,
    secondary_phone:
      customCatalog?.secondary_phone !== undefined
        ? customCatalog.secondary_phone
        : settings.secondary_phone,
    extra_phones:
      customCatalog?.extra_phones !== undefined ? customCatalog.extra_phones : settings.extra_phones,
    address: customCatalog?.address !== undefined ? customCatalog.address : settings.address,
    email: customCatalog?.email !== undefined ? customCatalog.email : settings.email,
    tax_or_cr_number:
      customCatalog?.tax_or_cr_number !== undefined
        ? customCatalog.tax_or_cr_number
        : settings.tax_or_cr_number,
    price_validity_note: customCatalog?.price_validity_note ?? settings.price_validity_note,
    primary_color: customCatalog?.primary_color || settings.primary_color,
    footer_note: customCatalog?.footer_note ?? settings.footer_note,
    products_per_row: activeCols,
    rows_per_page: activeRows,
    grid_layout_mode: resolvedLayout.fillEmptySpace ? 'auto' : 'manual',
    grid_symmetry: activeSymmetry,
    show_code: customCatalog?.show_code !== undefined ? customCatalog.show_code : settings.show_code,
    show_category:
      customCatalog?.show_category !== undefined ? customCatalog.show_category : settings.show_category,
    show_image:
      customCatalog?.show_image !== undefined ? customCatalog.show_image : settings.show_image,
    show_company_name: customCatalog?.show_company_name ?? settings.show_company_name,
    show_business_bio: customCatalog?.show_business_bio ?? settings.show_business_bio,
    show_catalog_title: customCatalog?.show_catalog_title ?? settings.show_catalog_title,
    show_price_validity: customCatalog?.show_price_validity ?? settings.show_price_validity,
    show_phone: customCatalog?.show_phone ?? settings.show_phone,
    show_whatsapp: customCatalog?.show_whatsapp ?? settings.show_whatsapp,
    show_secondary_phone: customCatalog?.show_secondary_phone ?? settings.show_secondary_phone,
    show_address: customCatalog?.show_address ?? settings.show_address,
    show_email: customCatalog?.show_email ?? settings.show_email,
    show_tax_or_cr: customCatalog?.show_tax_or_cr ?? settings.show_tax_or_cr,
    show_footer_note: customCatalog?.show_footer_note ?? settings.show_footer_note,
  };

  const sectionConfig = resolveSectionHeaderConfig(activeSettings, customCatalog);
  const pages = paginateCatalogPageItems(catalogItems, activeCols, activeRows, sectionConfig);
  const safeStart = Math.max(0, Math.min(startPage, Math.max(0, pages.length - 1)));
  const previewPages = pages.slice(safeStart, safeStart + Math.max(1, maxPages));

  if (previewPages.length === 0 || catalogItems.length === 0) {
    return `<div class="text-center p-12 text-slate-500 font-medium">لا توجد منتجات مسعرة لعرضها في المعاينة.</div>`;
  }

  return previewPages
    .map((pageItems, idx) =>
      buildSinglePreviewPageHtml(
        pageItems,
        activeSettings,
        safeStart + idx,
        pages.length,
        categoryFilter,
        customCatalog
      )
    )
    .join('<div class="my-6 border-b-4 border-dashed border-slate-300 no-print"></div>');
}

/**
 * Generates lightweight HTML for a single preview page
 * matching exact 10mm margins, snug cards layout, and responsive fill-without-gaps mode
 */
export function buildSinglePreviewPageHtml(
  pageItems: CatalogPageItem[],
  settings: CatalogSettings,
  pageIndex: number,
  totalPages: number,
  categoryFilter?: string,
  customCatalog?: SavedCatalog
): string {
  const primaryColor = customCatalog?.primary_color || settings.primary_color || '#ea580c';
  const sectionConfig = resolveSectionHeaderConfig(settings, customCatalog);
  const cardConfig = resolveCardConfig(settings, customCatalog);
  const identity = resolveCompanyIdentityDisplay(settings, customCatalog);
  const companyName = identity.companyName;
  const businessBio = identity.businessBio;
  const logoUrl = customCatalog?.logo_url ?? settings.logo_url;
  const catalogTitle = identity.catalogTitle;
  const footerNote = identity.footerNote;
  const gridCols = clampGridColumns(customCatalog?.columns_count || settings.products_per_row || 4);
  const gridRows = clampGridRows(customCatalog?.rows_count || settings.rows_per_page, gridCols);
  const fillEmptySpace =
    (customCatalog?.grid_layout_mode || settings.grid_layout_mode) === 'auto';
  const isPageFit = fillEmptySpace || cardConfig.page_fit_mode === 'fill_page';
  const keepUniformCards = cardConfig.uniform_row_cards !== false;
  const stretchRowCards = isPageFit && !keepUniformCards;
  const isDense = gridRows >= 5 || gridCols >= 5;
  const isMicro = gridRows >= 7 || gridCols >= 7;
  const baseCardPad = isMicro ? 4 : isDense ? 6 : 8;
  const cardPad = Math.max(
    3,
    Math.round(
      baseCardPad * (cardConfig.padding === 'compact' ? 0.7 : cardConfig.padding === 'spacious' ? 1.4 : 1)
    )
  );
  const baseGridGap = isMicro ? 4 : gridRows >= 6 ? 6 : gridRows === 5 ? 8 : 10;
  const gridGap = Math.max(
    3,
    Math.round(
      baseGridGap * (cardConfig.gap === 'compact' ? 0.65 : cardConfig.gap === 'spacious' ? 1.45 : 1)
    )
  );
  const showImage = customCatalog?.show_image !== undefined ? customCatalog.show_image : (settings.show_image ?? true);
  const showCode = customCatalog?.show_code !== undefined ? customCatalog.show_code : (settings.show_code ?? true);
  const showCategory = customCatalog?.show_category !== undefined ? customCatalog.show_category : (settings.show_category ?? true);
  const cardHeightScale = Math.min(2.2, Math.max(0.6, (cardConfig.card_height_scale || 100) / 100));
  const previewFontScale = Math.min(1.5, Math.max(0.8, (cardConfig.font_scale || 100) / 100));
  const previewImgZoom = Math.min(1.8, Math.max(0.7, (cardConfig.image_zoom || 100) / 100));
  const previewImgFit: 'contain' | 'cover' = cardConfig.image_fit === 'cover' ? 'cover' : 'contain';
  const imgHeightScaleRatio = Math.min(2.0, Math.max(0.5, (cardConfig.image_height_scale || 100) / 100));

  const previewHeadersCount = pageItems.filter((it) => it.type === 'header').length;
  const usablePreviewBodyH = 890;
  const previewRowSlotH = Math.max(
    96,
    Math.floor((usablePreviewBodyH - previewHeadersCount * 42 - Math.max(0, gridRows - 1) * gridGap) / gridRows)
  );
  const idealPreviewCardH = showImage
    ? isMicro
      ? 115
      : isDense
        ? 162
        : gridCols <= 2
          ? 300
          : gridCols === 3
            ? 245
            : 205
    : 112;
  const targetPreviewCardH = isPageFit
    ? Math.max(88, Math.min(usablePreviewBodyH, Math.round(previewRowSlotH * (cardHeightScale < 1 ? cardHeightScale : Math.min(1.35, cardHeightScale)))))
    : Math.max(76, Math.min(usablePreviewBodyH, Math.round(idealPreviewCardH * cardHeightScale)));

  const estTextReserveH = Math.round((isMicro ? 66 : isDense ? 80 : 94) * previewFontScale) + cardPad * 2;
  const availablePreviewImgH = Math.max(38, targetPreviewCardH - estTextReserveH);
  const baseImgH = isMicro
    ? 44
    : gridRows >= 6
      ? 56
      : gridRows === 5
        ? 68
        : gridCols <= 2
          ? 130
          : gridCols === 3
            ? 105
            : 88;
  const desiredPreviewImgH = Math.round(
    Math.max(baseImgH, availablePreviewImgH) * imgHeightScaleRatio
  );
  const previewImgH = Math.max(
    28,
    Math.min(Math.max(baseImgH, targetPreviewCardH - Math.round(74 * previewFontScale)), desiredPreviewImgH)
  );
  const priceValidity = customCatalog?.price_validity_note || settings.price_validity_note;

  let categorySubtitle = '';
  if (categoryFilter && categoryFilter !== 'الكل') {
    const categoryDef = (settings.categories || DEFAULT_CATEGORIES).find((c) => c.name === categoryFilter);
    categorySubtitle = ` - ${categoryDef?.catalog_title || categoryDef?.name || categoryFilter}`;
  }

  const renderCardHtml = (item: CatalogPageItem): string => {
    if (item.type === 'header') {
      const hdrColor = item.color || primaryColor;
      const hdrStyle = sectionConfig.style || 'line_divider';
      const hdrAlign = sectionConfig.align || 'center';
      const isHalf = sectionConfig.width === 'half';
      const sizeScale = sectionConfig.size === 'sm' ? 0.88 : sectionConfig.size === 'lg' ? 1.18 : 1;
      const titleFontSize = Math.round((isDense ? 12.5 : 14) * sizeScale);
      const countBadge =
        sectionConfig.show_count && typeof item.count === 'number'
          ? ` <span style="font-size: ${Math.max(10, titleFontSize - 2)}px; opacity: 0.82; font-weight: 700;">(${item.count})</span>`
          : '';
      const subSpan =
        sectionConfig.show_subtitle && item.subtitle
          ? `<span style="font-size: ${Math.max(9.5, titleFontSize - 3)}px; opacity: 0.78; font-weight: 600; margin-inline-start: 6px;">— ${escapeHtml(item.subtitle)}</span>`
          : '';

      const resolveHtmlTextColor = (fallback: string) => {
        if (sectionConfig.text_color_mode === 'white') return '#ffffff';
        if (sectionConfig.text_color_mode === 'dark') return '#0f172a';
        if (sectionConfig.text_color_mode === 'accent') return hdrColor;
        return fallback;
      };

      const widthCss = isHalf
        ? hdrAlign === 'center'
          ? 'width: 56%; margin-left: auto; margin-right: auto;'
          : hdrAlign === 'left'
            ? 'width: 56%; margin-right: auto; margin-left: 0;'
            : 'width: 56%; margin-left: auto; margin-right: 0;'
        : 'width: 100%;';

      const justifyCss =
        hdrAlign === 'center' ? 'center' : hdrAlign === 'left' ? 'flex-end' : 'flex-start';

      if (hdrStyle === 'solid_bar') {
        return `
          <div style="grid-column: 1 / -1; ${widthCss} background: ${escapeHtml(hdrColor)}; border-radius: 8px; padding: ${Math.round((isDense ? 5 : 7) * sizeScale)}px 14px; margin: 3px 0; display: flex; align-items: center; justify-content: ${justifyCss}; gap: 6px; color: ${resolveHtmlTextColor('#ffffff')};">
            <span style="font-size: ${titleFontSize}px; font-weight: 800;">${escapeHtml(item.title)}${countBadge}</span>
            ${subSpan}
          </div>
        `;
      }

      if (hdrStyle === 'tinted_box') {
        const borderSide =
          hdrAlign === 'center'
            ? `border: 1.5px solid ${escapeHtml(hdrColor)}55;`
            : hdrAlign === 'left'
              ? `border: 1px solid ${escapeHtml(hdrColor)}40; border-left: 4px solid ${escapeHtml(hdrColor)};`
              : `border: 1px solid ${escapeHtml(hdrColor)}40; border-right: 4px solid ${escapeHtml(hdrColor)};`;
        return `
          <div style="grid-column: 1 / -1; ${widthCss} background: ${escapeHtml(hdrColor)}18; ${borderSide} border-radius: 8px; padding: ${Math.round((isDense ? 5 : 7) * sizeScale)}px 14px; margin: 3px 0; display: flex; align-items: center; justify-content: ${justifyCss}; gap: 6px; color: ${resolveHtmlTextColor('#0f172a')};">
            <span style="font-size: ${titleFontSize}px; font-weight: 800;">${escapeHtml(item.title)}${countBadge}</span>
            ${subSpan}
          </div>
        `;
      }

      if (hdrStyle === 'underline') {
        return `
          <div style="grid-column: 1 / -1; ${widthCss} border-bottom: 2.5px solid ${escapeHtml(hdrColor)}; padding: ${Math.round((isDense ? 3 : 5) * sizeScale)}px 4px; margin: 3px 0; display: flex; align-items: center; justify-content: ${justifyCss}; gap: 6px; color: ${resolveHtmlTextColor(hdrColor)};">
            <span style="font-size: ${titleFontSize}px; font-weight: 800;">${escapeHtml(item.title)}${countBadge}</span>
            ${subSpan}
          </div>
        `;
      }

      // Default: 'line_divider' ("مكتوبة في نص سطر")
      const lineRight = hdrAlign === 'right' ? '0' : '1';
      const lineLeft = hdrAlign === 'left' ? '0' : '1';
      return `
        <div style="grid-column: 1 / -1; ${widthCss} max-width: 100%; min-width: 0; margin: 4px 0; display: flex; align-items: center; gap: 10px;">
          ${hdrAlign !== 'right' ? `<div style="flex: ${lineRight}; min-width: 14px; height: 2px; background: ${escapeHtml(hdrColor)}88; border-radius: 99px;"></div>` : ''}
          <div style="background: #ffffff; border: 1.8px solid ${escapeHtml(hdrColor)}; border-radius: 999px; padding: ${Math.round((isDense ? 3 : 5) * sizeScale)}px 14px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; color: ${resolveHtmlTextColor('#0f172a')}; max-width: calc(100% - 28px); min-width: 0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
            <span style="font-size: ${titleFontSize}px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.title)}${countBadge}</span>
            ${subSpan}
          </div>
          ${hdrAlign !== 'left' ? `<div style="flex: ${lineLeft}; min-width: 14px; height: 2px; background: ${escapeHtml(hdrColor)}88; border-radius: 99px;"></div>` : ''}
        </div>
      `;
    }

    const p = item.product;
    if ((p as any).is_unread_placeholder) {
      return `
        <div class="print-card" style="border: 1.5px dashed #f59e0b; border-radius: 8px; padding: ${cardPad}px; background: #fffbeb; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; page-break-inside: avoid; height: 100%;">
          <div style="height: ${previewImgH}px; flex: ${fillEmptySpace ? '1' : '0 0 auto'}; width: 100%; background: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 6px; color: #b45309;">
            <span style="font-size: 20px;">⚠️</span>
            <span style="font-size: 10.5px; font-weight: 700; margin-top: 2px;">صفحة لم تُقرأ</span>
          </div>
          <h3 style="font-size: 11px; font-weight: 700; color: #92400e; margin: 0 0 5px 0; line-height: 1.25; text-align: right;">
            ${escapeHtml(p.name)}
          </h3>
          <div style="text-align: center; padding: 4px; background: #fef3c7; border-radius: 6px; border: 1px solid #fde68a; color: #b45309; font-size: 11.5px; font-weight: 800; margin-bottom: 5px;">
            لم تتم قراءتها
          </div>
          <div style="font-size: 9px; color: #a16207; text-align: center;">
            تصدير جزئي
          </div>
        </div>
      `;
    }

    const prodOv = cardConfig.per_product_overrides?.[p.id];
    const cardBg = prodOv?.bg_color || cardConfig.bg_color || '#ffffff';
    const cardBorderColor = prodOv?.border_color || cardConfig.border_color || '#e2e8f0';
    const cardTitleColor = prodOv?.title_color || cardConfig.title_color || '#0f172a';
    const priceBg = prodOv?.price_bg_color || cardConfig.price_bg_color || '#f0fdf4';
    const priceBorder = cardConfig.price_border_color || '#bbf7d0';
    const priceText = prodOv?.price_text_color || cardConfig.price_text_color || '#15803d';
    const badgeBg = cardConfig.badge_bg_color || '#f1f5f9';
    const badgeText = cardConfig.badge_text_color || '#475569';

    const effectiveRadius =
      cardConfig.shape === 'sharp'
        ? 0
        : cardConfig.shape === 'pill'
          ? Math.max(16, cardConfig.border_radius ?? 16)
          : Math.max(0, cardConfig.border_radius ?? 8);
    const effectiveBorderWidth =
      cardConfig.shape === 'minimal' ? 0 : Math.max(0, cardConfig.border_width ?? 1);
    const cardShadow =
      cardConfig.shape === 'shadow' ? 'box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);' : '';
    const cardWidthPct = Math.min(100, Math.max(50, cardConfig.width_percent || 100));
    const widthCss = cardWidthPct < 100 ? `width: ${cardWidthPct}%; margin-left: auto; margin-right: auto;` : 'width: 100%;';
    const textAlignCss = cardConfig.text_align === 'center' ? 'center' : 'right';
    const horizImgWidthPct = Math.round(
      Math.min(60, Math.max(22, 38 * imgHeightScaleRatio))
    );
    const cardMinHeightCss =
      isPageFit || cardHeightScale !== 1
        ? `min-height: ${targetPreviewCardH}px;`
        : '';
    const imgElementStyle =
      previewImgFit === 'cover'
        ? `width: 100%; height: 100%; object-fit: cover; display: block; transform: scale(${previewImgZoom}); transform-origin: center center;`
        : `max-height: ${stretchRowCards ? '280px' : `${previewImgH}px`}; max-width: 100%; object-fit: contain; display: block; margin: 0 auto; transform: scale(${previewImgZoom}); transform-origin: center center;`;

    const priceHtml =
      cardConfig.price_style === 'inline'
        ? `<div style="text-align: ${textAlignCss}; margin-bottom: ${isDense ? 4 : 6}px; color: ${escapeHtml(priceText)};">
             <span style="font-size: ${Math.round((isMicro ? 12 : isDense ? 13.5 : 15.5) * previewFontScale)}px; font-weight: 900;">${escapeHtml(p.selling_price || 0)}</span>
             <span style="font-size: ${Math.round((isMicro ? 8 : isDense ? 9 : 10) * previewFontScale)}px; font-weight: 700;">ج.م</span>
           </div>`
        : `<div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: ${isDense ? 4 : 6}px; padding: ${isDense ? '2px 6px' : '4px 8px'}; background: ${escapeHtml(priceBg)}; border-radius: ${Math.min(8, effectiveRadius || 6)}px; ${cardConfig.price_style === 'solid_footer' ? '' : `border: 1px solid ${escapeHtml(priceBorder)};`}">
             <span style="font-size: ${Math.round((isMicro ? 8 : isDense ? 9 : 10) * previewFontScale)}px; font-weight: 600; color: ${escapeHtml(priceText)};">سعر البيع:</span>
             <div style="display: flex; align-items: baseline; gap: 2px;">
               <span style="font-size: ${Math.round((isMicro ? 11 : isDense ? 12.5 : 14.5) * previewFontScale)}px; font-weight: 900; color: ${escapeHtml(priceText)};">${escapeHtml(p.selling_price || 0)}</span>
               <span style="font-size: ${Math.round((isMicro ? 7.5 : isDense ? 8.5 : 9.5) * previewFontScale)}px; font-weight: 700; color: ${escapeHtml(priceText)};">ج.م</span>
             </div>
           </div>`;

    const badgesHtml =
      showCode || showCategory
        ? `<div style="display: flex; justify-content: space-between; align-items: center; font-size: ${isMicro ? 7.5 : isDense ? 8.5 : 9}px; gap: 4px;">
             ${showCode ? `<span style="background: ${escapeHtml(badgeBg)}; color: ${escapeHtml(badgeText)}; font-weight: 700; padding: 1px 5px; border-radius: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.code || 'PRD')}</span>` : '<span></span>'}
             ${showCategory ? `<span style="background: ${escapeHtml(badgeBg)}; color: ${escapeHtml(badgeText)}; border: 1px solid ${escapeHtml(cardBorderColor)}; padding: 1px 5px; border-radius: 3px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.category || 'متنوعة')}</span>` : ''}
           </div>`
        : '';

    const extraInfoHtml = `
      ${settings.show_brand_on_card && p.group ? `<div style="font-size: 9px; color: ${escapeHtml(badgeText)}; font-weight: 700; margin-bottom: 2px; text-align: ${textAlignCss};">${escapeHtml(p.group)}</div>` : ''}
      ${settings.show_specification && p.specification ? `<div style="font-size: 8.5px; color: ${escapeHtml(badgeText)}; opacity: 0.85; margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: ${textAlignCss};">${escapeHtml(p.specification)}</div>` : ''}
      ${settings.show_available_models && p.available_models && p.available_models.length > 0 ? `<div style="font-size: 8.5px; color: ${escapeHtml(badgeText)}; opacity: 0.85; margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: ${textAlignCss};">${escapeHtml(p.available_models.slice(0, 3).join(' • '))}</div>` : ''}
    `;

    const cardLogoLayer = cardConfig.card_logo_layer ?? 'front';
    const cardLogoScope = cardConfig.card_logo_scope ?? 'card';
    const buildCardLogoHtml = (): string => {
      if (!cardConfig.card_logo_enabled || !logoUrl) return '';
      const clSize = Math.min(78, Math.max(12, Math.round((cardConfig.card_logo_size ?? 26) * 0.92)));
      const clInset = Math.min(24, Math.max(0, Math.round((cardConfig.card_logo_inset ?? 6) * 0.9)));
      const clOffX = Math.round((cardConfig.card_logo_offset_x ?? 0) * 0.9);
      const clOffY = Math.round((cardConfig.card_logo_offset_y ?? 0) * 0.9);
      const clOpacity = Math.min(1, Math.max(0.08, cardConfig.card_logo_opacity ?? 0.85));
      const clRot = Math.min(45, Math.max(-45, cardConfig.card_logo_rotation ?? 0));
      const clShape = cardConfig.card_logo_shape ?? 'rounded';
      const clBg = cardConfig.card_logo_bg !== false && clShape !== 'clean';
      const clPos = cardConfig.card_logo_position ?? 'top-left';
      const clRadius =
        clShape === 'circle' || clShape === 'pill'
          ? '9999px'
          : clShape === 'rounded'
            ? `${Math.max(3, Math.round(clSize * 0.22))}px`
            : '0px';
      const clPad = clBg ? Math.max(1, Math.round(clSize * 0.1)) : 0;

      let posCss = '';
      let baseTransform = '';
      if (clPos === 'top-right') {
        posCss = `top: ${clInset + clOffY}px; right: ${clInset - clOffX}px;`;
      } else if (clPos === 'top-center') {
        posCss = `top: ${clInset + clOffY}px; left: 50%;`;
        baseTransform = `translateX(calc(-50% + ${clOffX}px))`;
      } else if (clPos === 'top-left') {
        posCss = `top: ${clInset + clOffY}px; left: ${clInset + clOffX}px;`;
      } else if (clPos === 'center') {
        posCss = `top: 50%; left: 50%;`;
        baseTransform = `translate(calc(-50% + ${clOffX}px), calc(-50% + ${clOffY}px))`;
      } else if (clPos === 'bottom-right') {
        posCss = `bottom: ${clInset - clOffY}px; right: ${clInset - clOffX}px;`;
      } else {
        posCss = `bottom: ${clInset - clOffY}px; left: ${clInset + clOffX}px;`;
      }
      const rotCss = clRot !== 0 ? ` rotate(${clRot}deg)` : '';
      const transformCss =
        baseTransform || rotCss ? `transform: ${`${baseTransform}${rotCss}`.trim()};` : '';
      const zIndex = cardLogoLayer === 'back' ? 0 : 4;
      const boxBgCss = clBg
        ? 'background: rgba(255,255,255,0.9); border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(15,23,42,0.08);'
        : '';
      return `
        <div style="position: absolute; ${posCss} ${transformCss} width: ${clSize}px; height: ${clSize}px; border-radius: ${clRadius}; padding: ${clPad}px; ${boxBgCss} opacity: ${clOpacity}; z-index: ${zIndex}; overflow: hidden; display: flex; align-items: center; justify-content: center; pointer-events: none; box-sizing: border-box;">
          <img src="${escapeHtml(logoUrl)}" alt="" style="width: 100%; height: 100%; object-fit: contain; display: block;" />
        </div>
      `;
    };
    const cardLogoHtml = buildCardLogoHtml();
    const isImageScopedLogo = cardLogoScope === 'image' && cardConfig.layout !== 'overlay' && showImage;
    const cardLevelLogoHtml = !isImageScopedLogo ? cardLogoHtml : '';
    const imageLevelLogoBackHtml = isImageScopedLogo && cardLogoLayer === 'back' ? cardLogoHtml : '';
    const imageLevelLogoFrontHtml = isImageScopedLogo && cardLogoLayer === 'front' ? cardLogoHtml : '';

    const imageBoxHtml = showImage
      ? `<div style="position: relative; ${stretchRowCards ? `min-height: ${previewImgH}px; flex: 1;` : `height: ${previewImgH}px;`} width: 100%; background: #fafafa; border: 1px solid #f1f5f9; border-radius: ${Math.max(4, effectiveRadius - 2)}px; display: flex; align-items: center; justify-content: center; margin-bottom: ${isDense ? 4 : 6}px; overflow: hidden;">
           ${imageLevelLogoBackHtml}
           ${
             p.image_url
               ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" style="position: relative; z-index: 1; ${imgElementStyle}" />`
               : '<span style="position: relative; z-index: 1; font-size: 10px; color: #cbd5e1;">بدون صورة</span>'
           }
           ${imageLevelLogoFrontHtml}
         </div>`
      : '';

    const titleFontPx = Math.round((isMicro ? 9.5 : isDense ? 10.5 : 11.5) * previewFontScale);
    const titleBoxMinH = Math.round((isMicro ? 22 : isDense ? 25 : 28) * previewFontScale);
    const titleHtml = `<h3 style="font-size: ${titleFontPx}px; font-weight: 700; color: ${escapeHtml(cardTitleColor)}; margin: 0 0 4px 0; line-height: 1.25; min-height: ${titleBoxMinH}px; max-height: ${titleBoxMinH}px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; text-align: ${textAlignCss};" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</h3>`;

    if (cardConfig.layout === 'overlay') {
      const overlayScrimAlpha = Math.min(
        0.85,
        Math.max(0, (cardConfig.overlay_scrim_opacity ?? 60) / 100)
      );
      const overlayPos = cardConfig.overlay_content_position || 'bottom';
      const overlayTone = cardConfig.overlay_text_tone || 'white';
      const overlayTitleColor =
        overlayTone === 'white' ? '#ffffff' : overlayTone === 'dark' ? '#0f172a' : cardTitleColor;
      const overlayMetaColor =
        overlayTone === 'white'
          ? 'rgba(241, 245, 249, 0.92)'
          : overlayTone === 'dark'
            ? '#334155'
            : badgeText;
      const overlayJustify =
        overlayPos === 'top' ? 'flex-start' : overlayPos === 'center' ? 'center' : 'flex-end';
      const overlayScrimCss =
        overlayScrimAlpha <= 0
          ? 'transparent'
          : overlayPos === 'top'
            ? `linear-gradient(to bottom, rgba(15,23,42,${Math.min(0.92, overlayScrimAlpha * 1.15)}) 0%, rgba(15,23,42,${(overlayScrimAlpha * 0.55).toFixed(2)}) 58%, rgba(15,23,42,0) 100%)`
            : overlayPos === 'center'
              ? `linear-gradient(to bottom, rgba(15,23,42,${(overlayScrimAlpha * 0.45).toFixed(2)}) 0%, rgba(15,23,42,${Math.min(0.9, overlayScrimAlpha * 1.05).toFixed(2)}) 50%, rgba(15,23,42,${(overlayScrimAlpha * 0.5).toFixed(2)}) 100%)`
              : `linear-gradient(to top, rgba(15,23,42,${Math.min(0.92, overlayScrimAlpha * 1.18)}) 0%, rgba(15,23,42,${(overlayScrimAlpha * 0.55).toFixed(2)}) 56%, rgba(15,23,42,0) 100%)`;
      const overlayMinH = Math.max(targetPreviewCardH, Math.round((isMicro ? 120 : isDense ? 170 : 225) * cardHeightScale));
      const overlayExtraHtml = `
        ${settings.show_brand_on_card && p.group ? `<div style="font-size: 9px; color: ${escapeHtml(overlayMetaColor)}; font-weight: 700; margin-bottom: 2px; text-align: ${textAlignCss};">${escapeHtml(p.group)}</div>` : ''}
        ${settings.show_specification && p.specification ? `<div style="font-size: 8.5px; color: ${escapeHtml(overlayMetaColor)}; margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: ${textAlignCss};">${escapeHtml(p.specification)}</div>` : ''}
        ${settings.show_available_models && p.available_models && p.available_models.length > 0 ? `<div style="font-size: 8.5px; color: ${escapeHtml(overlayMetaColor)}; margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: ${textAlignCss};">${escapeHtml(p.available_models.slice(0, 3).join(' • '))}</div>` : ''}
      `;
      const overlayTitleHtml = `<h3 style="font-size: ${titleFontPx}px; font-weight: 800; color: ${escapeHtml(overlayTitleColor)}; margin: 0 0 4px 0; line-height: 1.25; max-height: ${titleBoxMinH}px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; text-align: ${textAlignCss}; ${overlayTone === 'white' ? 'text-shadow: 0 1px 3px rgba(0,0,0,0.45);' : ''}" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</h3>`;
      const overlayBgImgCss = `width: 100%; height: 100%; object-fit: ${previewImgFit}; display: block; transform: scale(${previewImgZoom}); transform-origin: center center;`;

      return `
        <div class="print-card" data-product-id="${escapeHtml(p.id)}" title="اضغط لتعديل لون وبيانات هذا الكارت" style="position: relative; border: ${effectiveBorderWidth}px solid ${escapeHtml(cardBorderColor)}; border-radius: ${effectiveRadius}px; padding: ${cardPad}px; background: ${escapeHtml(cardBg)}; ${cardShadow} ${widthCss} min-height: ${overlayMinH}px; overflow: hidden; display: flex; flex-direction: column; justify-content: ${overlayJustify}; box-sizing: border-box; page-break-inside: avoid; cursor: pointer; ${stretchRowCards ? 'height: 100%;' : ''}">
          ${
            showImage
              ? `<div style="position: absolute; inset: 0; z-index: 0; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                   ${
                     p.image_url
                       ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" style="${overlayBgImgCss}" />`
                       : '<span style="font-size: 10px; color: #94a3b8;">بدون صورة</span>'
                   }
                 </div>`
              : ''
          }
          <div style="position: absolute; inset: 0; z-index: 1; pointer-events: none; background: ${overlayScrimCss};"></div>
          ${cardLogoLayer === 'back' ? cardLevelLogoHtml : ''}
          <div style="position: relative; z-index: 2; width: 100%;">
            ${overlayTitleHtml}
            ${overlayExtraHtml}
            ${priceHtml}
            ${badgesHtml}
          </div>
          ${cardLogoLayer === 'front' ? cardLevelLogoHtml : ''}
        </div>
      `;
    }

    if (cardConfig.layout === 'horizontal') {
      return `
        <div class="print-card" data-product-id="${escapeHtml(p.id)}" title="اضغط لتعديل لون وبيانات هذا الكارت" style="position: relative; border: ${effectiveBorderWidth}px solid ${escapeHtml(cardBorderColor)}; border-radius: ${effectiveRadius}px; padding: ${cardPad}px; background: ${escapeHtml(cardBg)}; ${cardShadow} ${widthCss} ${cardMinHeightCss} overflow: hidden; display: flex; flex-direction: row; align-items: stretch; gap: 8px; box-sizing: border-box; page-break-inside: avoid; cursor: pointer; ${stretchRowCards ? 'height: 100%;' : ''}">
          ${cardLogoLayer === 'back' ? cardLevelLogoHtml : ''}
          ${
            showImage
              ? `<div style="position: relative; z-index: 2; width: ${horizImgWidthPct}%; min-height: ${Math.max(54, Math.round(previewImgH * 0.85))}px; background: #fafafa; border: 1px solid #f1f5f9; border-radius: ${Math.max(4, effectiveRadius - 2)}px; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                   ${imageLevelLogoBackHtml}
                   ${
                     p.image_url
                       ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" style="position: relative; z-index: 1; ${imgElementStyle}" />`
                       : '<span style="position: relative; z-index: 1; font-size: 9px; color: #cbd5e1;">بدون صورة</span>'
                   }
                   ${imageLevelLogoFrontHtml}
                 </div>`
              : ''
          }
          <div style="position: relative; z-index: 2; flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              ${titleHtml}
              ${extraInfoHtml}
            </div>
            <div>
              ${priceHtml}
              ${badgesHtml}
            </div>
          </div>
          ${cardLogoLayer === 'front' ? cardLevelLogoHtml : ''}
        </div>
      `;
    }

    return `
      <div class="print-card" data-product-id="${escapeHtml(p.id)}" title="اضغط لتعديل لون وبيانات هذا الكارت" style="position: relative; border: ${effectiveBorderWidth}px solid ${escapeHtml(cardBorderColor)}; border-radius: ${effectiveRadius}px; padding: ${cardPad}px; background: ${escapeHtml(cardBg)}; ${cardShadow} ${widthCss} ${cardMinHeightCss} overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; page-break-inside: avoid; cursor: pointer; ${stretchRowCards ? 'height: 100%;' : ''}">
        ${cardLogoLayer === 'back' ? cardLevelLogoHtml : ''}
        ${cardConfig.layout === 'badge_top' ? `<div style="position: relative; z-index: 2;">${priceHtml}</div>` : ''}
        <div style="position: relative; z-index: 2; display: flex; flex-direction: column; ${stretchRowCards ? 'flex: 1;' : ''}">${imageBoxHtml}</div>
        <div style="position: relative; z-index: 2;">
          ${titleHtml}
          ${extraInfoHtml}
          ${cardConfig.layout !== 'badge_top' ? priceHtml : ''}
          ${badgesHtml}
        </div>
        ${cardLogoLayer === 'front' ? cardLevelLogoHtml : ''}
      </div>
    `;
  };

  let gridBodyHtml = '';
  if (stretchRowCards) {
    // Auto fill-without-gaps mode: group into rows so partial rows stretch horizontally & rows stretch vertically
    type RowGroup = { type: 'header'; item: CatalogPageItem } | { type: 'products'; items: CatalogPageItem[] };
    const rowGroups: RowGroup[] = [];
    let buf: CatalogPageItem[] = [];
    for (const it of pageItems) {
      if (it.type === 'header') {
        if (buf.length > 0) {
          rowGroups.push({ type: 'products', items: buf });
          buf = [];
        }
        rowGroups.push({ type: 'header', item: it });
      } else {
        buf.push(it);
        if (buf.length === gridCols) {
          rowGroups.push({ type: 'products', items: buf });
          buf = [];
        }
      }
    }
    if (buf.length > 0) {
      rowGroups.push({ type: 'products', items: buf });
    }

    gridBodyHtml = `
      <div style="display: flex; flex-direction: column; gap: ${gridGap}px; flex: 1;">
        ${rowGroups
          .map((grp) => {
            if (grp.type === 'header') {
              return renderCardHtml(grp.item);
            }
            return `
              <div style="display: grid; grid-template-columns: repeat(${grp.items.length}, minmax(0, 1fr)); gap: ${gridGap}px; flex: 1; align-items: stretch;">
                ${grp.items.map(renderCardHtml).join('')}
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  } else {
    gridBodyHtml = `
      <div style="display: grid; grid-template-columns: repeat(${gridCols}, minmax(0, 1fr)); gap: ${gridGap}px; flex: 1; align-content: ${isPageFit ? 'space-between' : 'start'}; justify-items: stretch;">
        ${pageItems.map(renderCardHtml).join('')}
      </div>
    `;
  }

  const wm = resolveWatermarkOverlayConfig(settings, customCatalog);
  const hdrLogo = resolveHeaderLogoConfig(settings, customCatalog);
  const headerLogoSizePx = Math.min(115, Math.max(24, Math.round(hdrLogo.size * 0.62)));
  const headerLogoSpacingPx = Math.round(hdrLogo.spacing * 0.62);
  const headerLogoPadPx = Math.round(hdrLogo.padding * 0.62);
  const headerLogoOffXPx = Math.round(hdrLogo.offsetX * 0.62);
  const headerLogoOffYPx = Math.round(hdrLogo.offsetY * 0.62);

  let watermarkLayerHtml = '';
  if (wm.type !== 'none' && logoUrl) {
    const zIdx = wm.layer === 'front' ? 25 : 0;
    if (wm.type === 'center') {
      const previewLogoSize = Math.round(wm.size * 1.45 * 0.64);
      const { pctX, pctY } = resolveWatermarkAnchorPercent(wm.position, wm.offsetX, wm.offsetY);
      watermarkLayerHtml = `
        <div style="position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: ${zIdx};">
          <img src="${escapeHtml(logoUrl)}" alt="" style="position: absolute; left: ${pctX}%; top: ${pctY}%; width: ${previewLogoSize}px; height: ${previewLogoSize}px; object-fit: contain; opacity: ${wm.opacity}; transform: translate(-50%, -50%) rotate(${wm.rotation}deg);" />
        </div>
      `;
    } else if (wm.type === 'tiled') {
      const tilePx = Math.max(40, Math.min(210, Math.round(wm.size * 0.58 * 0.64)));
      const gapFactor = Math.max(0.6, Math.min(2.4, wm.gap / 100));
      const gapPx = Math.max(16, Math.round(tilePx * 0.95 * gapFactor));
      const rot = wm.rotation === 0 ? -20 : wm.rotation;
      const shiftX = Math.round((wm.offsetX / 100) * 140);
      const shiftY = Math.round((wm.offsetY / 100) * 140);
      const tiles = Array.from({ length: 16 })
        .map(
          () =>
            `<img src="${escapeHtml(logoUrl)}" alt="" style="width: ${tilePx}px; height: ${tilePx}px; object-fit: contain;" />`
        )
        .join('');
      watermarkLayerHtml = `
        <div style="position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: ${zIdx};">
          <div style="position: absolute; inset: -30%; display: grid; grid-template-columns: repeat(4, 1fr); place-items: center; gap: ${gapPx}px; opacity: ${wm.opacity}; transform: translate(${shiftX}px, ${shiftY}px) rotate(${rot}deg);">
            ${tiles}
          </div>
        </div>
      `;
    }
  }

  const hdrRadius =
    hdrLogo.shape === 'circle' ? '9999px' : hdrLogo.shape === 'rounded' ? '8px' : '0px';
  const hdrBgCss =
    hdrLogo.bg === 'transparent'
      ? 'transparent'
      : hdrLogo.bg === 'primary_tint'
        ? `${escapeHtml(primaryColor)}14`
        : '#ffffff';
  const hdrBorderCss = hdrLogo.border
    ? `border: 1px solid ${hdrLogo.bg === 'primary_tint' ? `${escapeHtml(primaryColor)}55` : '#e2e8f0'};`
    : 'border: none;';
  const hdrTransformCss =
    headerLogoOffXPx !== 0 || headerLogoOffYPx !== 0 || hdrLogo.rotation !== 0
      ? `transform: translate(${headerLogoOffXPx}px, ${headerLogoOffYPx}px) rotate(${hdrLogo.rotation}deg);`
      : '';

  const headerLogoImgHtml =
    logoUrl && hdrLogo.position !== 'hidden'
      ? `<div style="width: ${headerLogoSizePx}px; height: ${headerLogoSizePx}px; border-radius: ${hdrRadius}; ${hdrBorderCss} background: ${hdrBgCss}; padding: ${headerLogoPadPx}px; opacity: ${hdrLogo.opacity}; ${hdrTransformCss} flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; box-sizing: border-box;">
           <img src="${escapeHtml(logoUrl)}" alt="شعار" style="width: 100%; height: 100%; object-fit: ${hdrLogo.fit}; display: block;" />
         </div>`
      : '';

  const contactHtmlLines = identity.contactEntries
    .map((entry) => {
      const valueHtml = entry.isLtr
        ? `<span dir="ltr">${escapeHtml(entry.value)}</span>`
        : escapeHtml(entry.value);
      return entry.label
        ? `<div>${escapeHtml(entry.label)}: ${valueHtml}</div>`
        : `<div>${valueHtml}</div>`;
    })
    .join('');

  return `
    <div class="a4-preview-page print-page" dir="rtl" style="font-family: 'Cairo', sans-serif; background: #fff; width: 100%; max-width: 794px; min-height: ${stretchRowCards ? '960px' : '1122px'}; padding: clamp(16px, 4vw, 38px); box-sizing: border-box; position: relative; display: flex; flex-direction: column; justify-content: space-between; margin: 0 auto; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border-radius: 4px; overflow: hidden;">
      ${watermarkLayerHtml}
      
      <!-- Header: 10mm margins -->
      <div style="position: relative; z-index: 2; border-bottom: 2.5px solid ${escapeHtml(primaryColor)}; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: ${headerLogoSpacingPx}px; min-width: 0;">
          ${hdrLogo.position === 'right' ? headerLogoImgHtml : ''}
          <div>
            ${identity.showCompanyName && companyName ? `<h1 style="font-size: 19px; font-weight: 800; color: #0f172a; margin: 0;">${escapeHtml(companyName)}</h1>` : ''}
            ${identity.showBusinessBio && businessBio ? `<p style="font-size: 11px; color: #64748b; margin: 2px 0 0 0;">${escapeHtml(businessBio)}</p>` : ''}
            ${
              identity.showCatalogTitle || (identity.showPriceValidity && priceValidity)
                ? `<div style="display: flex; align-items: center; gap: 8px; margin-top: 3px; flex-wrap: wrap;">
                    ${
                      identity.showCatalogTitle
                        ? `<span style="font-size: 12px; font-weight: 700; color: ${escapeHtml(primaryColor)};">
                            ${escapeHtml(catalogTitle)}${escapeHtml(categorySubtitle)}
                          </span>`
                        : ''
                    }
                    ${
                      identity.showPriceValidity && priceValidity
                        ? `<span style="font-size: 10px; font-weight: 700; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; padding: 1px 7px; border-radius: 9999px;">📅 سارية حتى: ${escapeHtml(priceValidity)}</span>`
                        : ''
                    }
                  </div>`
                : ''
            }
          </div>
        </div>

        ${hdrLogo.position === 'center' ? `<div style="display: flex; align-items: center; justify-content: center;">${headerLogoImgHtml}</div>` : ''}

        <div style="display: flex; align-items: center; gap: ${headerLogoSpacingPx}px;">
          <div style="text-align: left; font-size: ${identity.contactEntries.length >= 5 ? '10px' : '11px'}; color: #475569; display: flex; flex-direction: column; gap: 2px;">
            ${contactHtmlLines}
          </div>
          ${hdrLogo.position === 'left' ? headerLogoImgHtml : ''}
        </div>
      </div>

      <!-- Products Grid strictly within 10mm print area -->
      <div style="position: relative; z-index: 2; flex: 1; display: flex; flex-direction: column;">
        ${gridBodyHtml}
      </div>

      <!-- Footer: inside 10mm margins -->
      <div style="position: relative; z-index: 2; margin-top: 14px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #64748b; gap: 8px; flex-wrap: wrap;">
        <div>${identity.showFooterNote ? escapeHtml(footerNote || '') : ''}</div>
        <div style="font-weight: 700; color: #0f172a;">${
          identity.showCompanyName && companyName
            ? `${escapeHtml(companyName)} • صفحة ${pageIndex + 1} من ${totalPages}`
            : `صفحة ${pageIndex + 1} من ${totalPages}`
        }</div>
      </div>
    </div>
  `;
}

