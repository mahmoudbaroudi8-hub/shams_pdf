import { jsPDF } from 'jspdf';
import { Product, CatalogSettings, DEFAULT_CATEGORIES, SavedCatalog, CatalogSectionHeader } from '../types';

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
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    // Timeout safeguard after 3s
    setTimeout(() => resolve(null), 3000);
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
  logoUrl?: string
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
    // Compress and downscale product images to max 400px to keep PDF size small
    const img = isLogo ? await loadImage(url) : await loadAndCompressImage(url, 400, 0.8);
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
  h: number
) {
  if (!img.width || !img.height) return;
  const hRatio = w / img.width;
  const vRatio = h / img.height;
  const ratio = Math.min(hRatio, vRatio);
  const drawW = img.width * ratio;
  const drawH = img.height * ratio;
  const drawX = x + (w - drawW) / 2;
  const drawY = y + (h - drawH) / 2;

  ctx.drawImage(img, drawX, drawY, drawW, drawH);
}

export type CatalogPageItem =
  | { type: 'product'; product: Product }
  | { type: 'header'; title: string; subtitle?: string; isCategoryAuto?: boolean };

/**
 * Splits items into pages based on products_per_row, rows_per_page, and section headers.
 * Section headers span full width and will NEVER be stranded alone at the bottom of a page.
 */
export function paginateCatalogPageItems(
  items: CatalogPageItem[],
  productsPerRow: number = 4,
  rowsPerPage?: number
): CatalogPageItem[][] {
  const maxRowsPerPage = rowsPerPage && rowsPerPage >= 1 ? rowsPerPage : (productsPerRow === 4 ? 4 : 3);
  const headerWeight = 0.45;
  const pages: CatalogPageItem[][] = [];
  let currentPage: CatalogPageItem[] = [];
  let currentRowUsage = 0; // Product row = 1.0, Header = 0.45
  let productsInCurrentRow = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (item.type === 'header') {
      if (productsInCurrentRow > 0) {
        currentRowUsage += 1.0;
        productsInCurrentRow = 0;
      }

      // Check if header + at least 1 product row fits on current page
      if (currentRowUsage + 1.0 + headerWeight > maxRowsPerPage + 0.05 && currentPage.length > 0) {
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
  columns?: number;
  rows?: number;
  itemCount: number;
  screenWidth?: number;
}): { cols: number; rows: number; fillEmptySpace: boolean } {
  const { mode = 'manual', columns, rows, itemCount } = options;

  if (mode !== 'auto') {
    const c = clampGridColumns(columns);
    const r = clampGridRows(rows, c);
    return { cols: c, rows: r, fillEmptySpace: false };
  }

  const width =
    options.screenWidth ??
    (typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1200);
  const count = Math.max(1, itemCount);

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

  // Larger catalogs: pick balanced cols suited for viewport + rows minimizing leftover empty slots
  const colCandidates = width < 560 ? [2] : width < 960 ? [2, 3] : [3, 4];
  const rowCandidates = width < 560 ? [3, 4, 5] : [3, 4, 5];

  let bestCols = colCandidates[colCandidates.length - 1];
  let bestRows = 4;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (const c of colCandidates) {
    for (const r of rowCandidates) {
      const perPage = c * r;
      const remainder = count % perPage;
      const emptySlots = remainder === 0 ? 0 : perPage - remainder;
      const lastRowMod = count % c;
      const emptyInLastRow = lastRowMod === 0 ? 0 : c - lastRowMod;
      // Prefer moderate density (3*4 or 4*4) while strongly penalizing trailing empty cells
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
  show_code?: boolean;
  show_category?: boolean;
  show_image?: boolean;
  price_validity_note?: string;
  company_name?: string;
  business_bio?: string;
  phone?: string;
  whatsapp_number?: string;
  logo_url?: string;
  primary_color?: string;
  footer_note?: string;
  manual_headers?: CatalogSectionHeader[];
  auto_category_headers?: boolean;
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
  const primaryColor = customCatalog?.primary_color || settings.primary_color || '#0284c7';
  const companyName = customCatalog?.company_name || settings.company_name || settings.store_name || 'كتالوج أسعار البيع';
  const businessBio = customCatalog?.business_bio ?? settings.business_bio;
  const phone = customCatalog?.phone ?? settings.phone;
  const whatsapp = customCatalog?.whatsapp_number ?? settings.whatsapp_number;
  const catalogTitle =
    (customCatalog && 'name' in customCatalog && customCatalog.name) ||
    (customCatalog && 'title' in customCatalog && (customCatalog as any).title) ||
    settings.catalog_title ||
    'قائمة أسعار البيع المعتمدة';
  const priceValidityNote = customCatalog?.price_validity_note;
  const footerNote = customCatalog?.footer_note ?? settings.footer_note;
  const logoUrl = customCatalog?.logo_url ?? settings.logo_url;

  const productsPerRow = clampGridColumns(customCatalog?.columns_count || settings.products_per_row || 4);
  const rowsPerPage = clampGridRows(
    customCatalog?.rows_count || settings.rows_per_page,
    productsPerRow
  );
  const fillEmptySpace =
    (customCatalog?.grid_layout_mode || settings.grid_layout_mode) === 'auto';
  const showImage = customCatalog?.show_image !== false;
  const showCode = customCatalog?.show_code !== false;
  const showCategory = customCatalog?.show_category !== false;

  // 1. Background fill
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 2. Watermark Background
  if (settings.watermark_type !== 'none' && logoUrl) {
    const logoImg = imageCache.get(logoUrl);
    if (logoImg) {
      ctx.save();
      const opacity = Math.min(0.15, Math.max(0.03, settings.watermark_opacity || 0.06));
      ctx.globalAlpha = opacity;

      if (settings.watermark_type === 'center') {
        const size = (settings.watermark_size || 280) * 1.6;
        const cx = (W - size) / 2;
        const cy = (H - size) / 2;
        drawImageContain(ctx, logoImg, cx, cy, size, size);
      } else if (settings.watermark_type === 'tiled') {
        ctx.translate(W / 2, H / 2);
        ctx.rotate((-20 * Math.PI) / 180);
        ctx.translate(-W / 2, -H / 2);

        const tileW = 160;
        const tileH = 160;
        for (let tx = -200; tx < W + 200; tx += 300) {
          for (let ty = -200; ty < H + 200; ty += 280) {
            drawImageContain(ctx, logoImg, tx, ty, tileW, tileH);
          }
        }
      }
      ctx.restore();
    }
  }

  // 3. Exact 10mm margins = 60 px (Requirement أ)
  const MARGIN_PX = 60;
  const headerY = MARGIN_PX;
  const headerBottom = headerY + 115;

  ctx.save();
  // Header Divider Bar
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(MARGIN_PX, headerBottom);
  ctx.lineTo(W - MARGIN_PX, headerBottom);
  ctx.stroke();

  // Logo (Right side in RTL)
  const logoSize = 88;
  const logoX = W - MARGIN_PX - logoSize;
  const logoY = headerY + 10;
  let textRightX = W - MARGIN_PX;

  if (logoUrl) {
    const logoImg = imageCache.get(logoUrl);
    if (logoImg) {
      drawRoundedRect(ctx, logoX, logoY, logoSize, logoSize, 12, '#ffffff', '#e2e8f0', 1.5);
      drawImageContain(ctx, logoImg, logoX + 6, logoY + 6, logoSize - 12, logoSize - 12);
      textRightX = logoX - 18;
    }
  }

  // Company Name
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 28px Cairo, Tajawal, sans-serif';
  ctx.fillText(companyName, textRightX, headerY + 34);

  // Business Bio
  if (businessBio) {
    ctx.fillStyle = '#64748b';
    ctx.font = '500 14px Cairo, Tajawal, sans-serif';
    const bioLines = wrapTextLines(ctx, businessBio, 480, 1);
    if (bioLines[0]) {
      ctx.fillText(bioLines[0], textRightX, headerY + 58);
    }
  }

  // Catalog Title & Subtitle
  ctx.fillStyle = primaryColor;
  ctx.font = 'bold 16px Cairo, Tajawal, sans-serif';
  let categorySubtitle = '';
  if (categoryFilter && categoryFilter !== 'الكل') {
    const categoryDef = (settings.categories || DEFAULT_CATEGORIES).find((c) => c.name === categoryFilter);
    categorySubtitle = ` - ${categoryDef?.catalog_title || categoryDef?.name || categoryFilter}`;
  }
  const fullTitle = `${catalogTitle}${categorySubtitle}`;
  ctx.fillText(fullTitle, textRightX, headerY + 84);

  // Price validity date badge if configured
  if (priceValidityNote) {
    ctx.save();
    ctx.font = 'bold 11px Cairo, sans-serif';
    const badgeText = `سارية حتى: ${priceValidityNote}`;
    const badgeW = ctx.measureText(badgeText).width + 16;
    drawRoundedRect(ctx, textRightX - badgeW, headerY + 92, badgeW, 20, 4, '#fef3c7', '#fde68a', 1);
    ctx.fillStyle = '#92400e';
    ctx.fillText(badgeText, textRightX - 8, headerY + 106);
    ctx.restore();
  }

  // Left Side of Header: Contact Info Badges (Only non-empty fields)
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#334155';
  ctx.font = '600 13px Cairo, Tajawal, sans-serif';

  const contactLines: string[] = [];
  if (phone) contactLines.push(`هاتف: ${phone}`);
  if (whatsapp) contactLines.push(`واتساب: ${whatsapp}`);
  if (settings.secondary_phone) contactLines.push(`هاتف 2: ${settings.secondary_phone}`);
  if (settings.address) contactLines.push(settings.address);
  if (settings.email) contactLines.push(settings.email);

  let contactY = headerY + 26;
  for (let c = 0; c < Math.min(contactLines.length, 4); c++) {
    ctx.fillText(contactLines[c], MARGIN_PX, contactY);
    contactY += 22;
  }
  ctx.restore();

  // 4. Products Grid Math (Strict 10mm print area, responsive to custom columns/rows & auto fill-without-gaps)
  const totalCols = productsPerRow;
  const gapX = totalCols >= 6 ? 8 : totalCols === 5 ? 10 : totalCols === 4 ? 14 : totalCols === 3 ? 16 : 20;
  const gapY = rowsPerPage >= 7 ? 6 : rowsPerPage >= 6 ? 8 : rowsPerPage === 5 ? 10 : 14;
  const bannerH = rowsPerPage >= 6 ? 26 : rowsPerPage === 5 ? 28 : 34;
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
    | { type: 'header'; title: string; subtitle?: string }
    | { type: 'products'; products: Product[] };

  const visualRows: VisualRow[] = [];
  let rowBuffer: Product[] = [];
  for (const it of normalizedItems) {
    if (it.type === 'header') {
      if (rowBuffer.length > 0) {
        visualRows.push({ type: 'products', products: rowBuffer });
        rowBuffer = [];
      }
      visualRows.push({ type: 'header', title: it.title, subtitle: it.subtitle });
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
  const budgetFitCardH = Math.floor((usableH - Math.max(0, rowsPerPage - 1) * gapY) / rowsPerPage);
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

  // In auto mode, stretch cards to fill the full usable page height so there are zero empty spaces!
  const cardH = fillEmptySpace
    ? Math.max(90, actualFitCardH)
    : Math.max(68, Math.min(idealCardH, budgetFitCardH, actualFitCardH));
  const isCompactCard = cardH < 230 || totalCols >= 5 || rowsPerPage >= 6;
  const isMicroCard = cardH < 150 || totalCols >= 7 || rowsPerPage >= 8;

  let curY = gridTop;

  visualRows.forEach((vRow) => {
    if (vRow.type === 'header') {
      drawRoundedRect(ctx, baseOffsetMarginX, curY, totalGridW, bannerH, 6, primaryColor);
      ctx.save();
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${rowsPerPage >= 5 ? 13 : 14}px Cairo, Tajawal, sans-serif`;
      ctx.fillText(vRow.title, baseOffsetMarginX + totalGridW - 14, curY + (rowsPerPage >= 5 ? 19 : 23));
      ctx.restore();

      curY += bannerH + gapY;
      return;
    }

    const rowProducts = vRow.products;
    // In auto fill-without-gaps mode, partial rows expand horizontally to cover full width seamlessly
    const rowColsCount = fillEmptySpace ? rowProducts.length : totalCols;
    const rowCardW = Math.floor((usableW - gapX * (rowColsCount - 1)) / rowColsCount);
    const rowGridW = rowColsCount * rowCardW + (rowColsCount - 1) * gapX;
    const rowOffsetX = MARGIN_PX + Math.floor((usableW - rowGridW) / 2);

    rowProducts.forEach((prod, colIdx) => {
      const cardX = W - rowOffsetX - (colIdx + 1) * rowCardW - colIdx * gapX;
      const cardY = curY;

      const isUnread = Boolean((prod as any).is_unread_placeholder);
      const pad = isMicroCard ? 4 : isCompactCard ? 6 : 8;
      const nameLineH = isMicroCard ? 12 : isCompactCard ? 15 : 18;
      const priceBoxH = isMicroCard ? 20 : isCompactCard ? 26 : 32;
      const badgeH = showCode || showCategory ? (isMicroCard ? 13 : isCompactCard ? 16 : 18) : 0;
      const textBudgetH =
        pad +
        nameLineH * 2 +
        (isMicroCard ? 3 : isCompactCard ? 5 : 8) +
        priceBoxH +
        (isMicroCard ? 3 : isCompactCard ? 5 : 8) +
        (badgeH > 0 ? badgeH + (isMicroCard ? 3 : isCompactCard ? 5 : 6) : 2);

      if (isUnread) {
        drawRoundedRect(ctx, cardX, cardY, rowCardW, cardH, 8, '#fffbeb', '#fde68a', 1.5);

        const imgBoxH = showImage ? Math.max(36, cardH - textBudgetH) : 40;
        const imgBoxW = rowCardW - pad * 2;
        const imgBoxX = cardX + pad;
        const imgBoxY = cardY + pad;

        drawRoundedRect(ctx, imgBoxX, imgBoxY, imgBoxW, imgBoxH, 6, '#fef3c7', '#fcd34d', 1);

        ctx.save();
        ctx.fillStyle = '#b45309';
        ctx.font = `bold ${isMicroCard ? 16 : 22}px Cairo, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('⚠️', cardX + rowCardW / 2, imgBoxY + imgBoxH / 2 + 6);
        ctx.restore();

        let curContentY = imgBoxY + imgBoxH + 14;
        ctx.save();
        ctx.direction = 'rtl';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#92400e';
        ctx.font = `bold ${isMicroCard ? 10 : isCompactCard ? 11.5 : 13}px Cairo, Tajawal, sans-serif`;
        ctx.fillText(prod.name || 'صفحة لم تتم قراءتها', cardX + rowCardW - pad, curContentY);

        curContentY += 18;
        drawRoundedRect(ctx, cardX + pad, curContentY, rowCardW - pad * 2, 24, 6, '#fef3c7', '#fde68a', 1);
        ctx.fillStyle = '#b45309';
        ctx.font = `bold ${isMicroCard ? 10 : 11.5}px Cairo, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('لم تتم قراءتها', cardX + rowCardW / 2, curContentY + 16);

        ctx.restore();
        return;
      }

      // Normal Product Card (Snug border and content)
      drawRoundedRect(ctx, cardX, cardY, rowCardW, cardH, 8, '#ffffff', '#e2e8f0', 1.2);

      let curContentY = cardY + pad;
      const contentW = rowCardW - pad * 2;
      const contentX = cardX + pad;

      // 1. Image
      if (showImage) {
        const imgBoxH = Math.max(32, cardH - textBudgetH);
        drawRoundedRect(ctx, contentX, curContentY, contentW, imgBoxH, 6, '#fafafa', '#f1f5f9', 1);

        if (prod.image_url) {
          const pImg = imageCache.get(prod.image_url);
          if (pImg) {
            drawImageContain(ctx, pImg, contentX + 4, curContentY + 4, contentW - 8, imgBoxH - 8);
          }
        } else {
          ctx.save();
          ctx.fillStyle = '#cbd5e1';
          ctx.font = `${isMicroCard ? 9 : isCompactCard ? 10.5 : 12}px Cairo, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('بدون صورة', cardX + rowCardW / 2, curContentY + imgBoxH / 2 + 4);
          ctx.restore();
        }
        curContentY += imgBoxH + (isMicroCard ? 4 : isCompactCard ? 6 : 8);
      } else {
        curContentY += 4;
      }

      // 2. Product Name (Max 2 lines, tight)
      ctx.save();
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${isMicroCard ? 10 : isCompactCard ? 12 : 13.5}px Cairo, Tajawal, sans-serif`;
      const nameLines = wrapTextLines(ctx, prod.name, contentW, 2);
      for (const nLine of nameLines) {
        ctx.fillText(nLine, contentX + contentW, curContentY + (isMicroCard ? 9 : isCompactCard ? 11 : 13));
        curContentY += nameLineH;
      }
      if (nameLines.length === 1) {
        curContentY += isCompactCard ? 2 : 4;
      }

      // 3. Selling Price (Tight under name)
      curContentY += isMicroCard ? 2 : isCompactCard ? 4 : 6;
      drawRoundedRect(ctx, contentX, curContentY, contentW, priceBoxH, 6, '#f0fdf4', '#bbf7d0', 1);

      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#166534';
      ctx.font = `600 ${isMicroCard ? 8.5 : isCompactCard ? 10 : 11}px Cairo, sans-serif`;
      if (contentW > 95) {
        ctx.fillText('سعر البيع:', contentX + contentW - 5, curContentY + (isMicroCard ? 13 : isCompactCard ? 17 : 21));
      }

      ctx.direction = 'ltr';
      ctx.textAlign = contentW > 95 ? 'left' : 'center';
      ctx.fillStyle = '#15803d';
      ctx.font = `bold ${isMicroCard ? 12 : isCompactCard ? 15.5 : 19}px Cairo, Tajawal, sans-serif`;
      ctx.fillText(
        `${prod.selling_price || 0} ج.م`,
        contentW > 95 ? contentX + 6 : cardX + rowCardW / 2,
        curContentY + (isMicroCard ? 14 : isCompactCard ? 18 : 23)
      );

      curContentY += priceBoxH + (isMicroCard ? 3 : isCompactCard ? 5 : 8);

      // 4. Badges (Code & Category)
      if ((showCode || showCategory) && curContentY + badgeH <= cardY + cardH - 2) {
        const badgeFontSize = isMicroCard ? 7.5 : isCompactCard ? 9 : 10;
        if (showCode && prod.code) {
          ctx.font = `bold ${badgeFontSize}px Cairo, Tajawal, monospace`;
          const codeW = Math.min(contentW * 0.55, ctx.measureText(prod.code).width + 8);
          drawRoundedRect(ctx, contentX + contentW - codeW, curContentY, codeW, badgeH, 3, '#f1f5f9');
          ctx.fillStyle = '#475569';
          ctx.direction = 'rtl';
          ctx.textAlign = 'right';
          ctx.fillText(prod.code, contentX + contentW - 4, curContentY + (isMicroCard ? 9.5 : isCompactCard ? 11 : 13));
        }

        if (showCategory && prod.category) {
          ctx.font = `600 ${badgeFontSize}px Cairo, sans-serif`;
          const catW = Math.min(contentW * 0.45, ctx.measureText(prod.category).width + 8);
          drawRoundedRect(ctx, contentX, curContentY, catW, badgeH, 3, '#f8fafc', '#e2e8f0', 1);
          ctx.fillStyle = '#64748b';
          ctx.direction = 'rtl';
          ctx.textAlign = 'right';
          ctx.fillText(prod.category, contentX + catW - 4, curContentY + (isMicroCard ? 9.5 : isCompactCard ? 11 : 13));
        }
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
  if (footerNote) {
    ctx.fillText(footerNote, W - MARGIN_PX, footerY + 24);
  }

  // Page numbering on left
  ctx.direction = 'rtl';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px Cairo, sans-serif';
  ctx.fillText(
    `${companyName} • صفحة ${pageIndex + 1} من ${totalPages}`,
    MARGIN_PX,
    footerY + 24
  );
  ctx.restore();
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

    let filtered = selectedProds;
    if (categoryFilter && categoryFilter !== 'الكل') {
      filtered = filtered.filter((p) => p.category === categoryFilter);
    }

    const items: CatalogPageItem[] = [];
    const manualHeaders = customCatalog.manual_headers || [];

    // Check for any manual header at position 0 (before all products)
    const topHeaders = manualHeaders.filter((h) => !h.after_product_id);
    topHeaders.forEach((h) => {
      items.push({ type: 'header', title: h.title, subtitle: h.subtitle });
    });

    let lastCategory = '';
    for (let i = 0; i < filtered.length; i++) {
      const prod = filtered[i];

      // Automatic category header if enabled
      if (customCatalog.auto_category_headers) {
        const prodCat = prod.category?.trim() || 'بدون تصنيف';
        if (prodCat !== lastCategory) {
          lastCategory = prodCat;
          // Avoid duplicate if a manual header was just added with the same name
          items.push({
            type: 'header',
            title: prodCat,
            isCategoryAuto: true,
          });
        }
      }

      items.push({ type: 'product', product: prod });

      // Check for manual headers placed right after this product
      if (prod.id) {
        const afterHeaders = manualHeaders.filter((h) => h.after_product_id === prod.id);
        afterHeaders.forEach((h) => {
          items.push({ type: 'header', title: h.title, subtitle: h.subtitle });
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

  const sortedCategories = [...(settings.categories && settings.categories.length > 0 ? settings.categories : DEFAULT_CATEGORIES)]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  
  const categoryRankMap = new Map<string, number>();
  sortedCategories.forEach((cat, idx) => {
    categoryRankMap.set(cat.name, idx);
  });

  filtered.sort((a, b) => {
    const rankA = categoryRankMap.has(a.category) ? categoryRankMap.get(a.category)! : 999;
    const rankB = categoryRankMap.has(b.category) ? categoryRankMap.get(b.category)! : 999;
    if (rankA !== rankB) return rankA - rankB;
    return (a.card_index || 0) - (b.card_index || 0);
  });

  return filtered.map((p) => ({ type: 'product', product: p }));
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
  const resolvedLayout = resolveEffectiveGridLayout({
    mode: customCatalog?.grid_layout_mode || settings.grid_layout_mode || 'manual',
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
    price_validity_note: customCatalog?.price_validity_note ?? settings.price_validity_note,
    primary_color: customCatalog?.primary_color || settings.primary_color,
    footer_note: customCatalog?.footer_note ?? settings.footer_note,
    products_per_row: activeCols,
    rows_per_page: activeRows,
    grid_layout_mode: activeMode,
    show_code: customCatalog?.show_code !== undefined ? customCatalog.show_code : settings.show_code,
    show_category:
      customCatalog?.show_category !== undefined ? customCatalog.show_category : settings.show_category,
    show_image:
      customCatalog?.show_image !== undefined ? customCatalog.show_image : settings.show_image,
  };

  // 1. Preload fonts
  await ensureFontsLoaded();

  // 2. Preload images cache (each image loaded once)
  const productObjects = catalogItems
    .filter((item): item is { type: 'product'; product: Product } => item.type === 'product')
    .map((item) => item.product);

  const imageCache = await preloadImagesCache(productObjects, activeSettings.logo_url);

  // 3. Paginate items with page-break awareness
  const pages = paginateCatalogPageItems(catalogItems, activeCols, activeRows);
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
  customCatalog?: SavedCatalog
): string {
  const layoutMode = customCatalog?.grid_layout_mode || settings.grid_layout_mode || 'manual';
  const rawCols = customCatalog?.columns_count || settings.products_per_row || 4;
  const rawRows = customCatalog?.rows_count || settings.rows_per_page;

  const tempSettings: CatalogSettings = {
    ...settings,
    products_per_row: clampGridColumns(rawCols),
    rows_per_page: clampGridRows(rawRows, rawCols),
    grid_layout_mode: layoutMode,
  };

  const catalogItems = buildCatalogItemsSequence(products, tempSettings, customCatalog, categoryFilter);
  const productItemsCount = catalogItems.filter((it) => it.type === 'product').length;
  const resolvedLayout = resolveEffectiveGridLayout({
    mode: layoutMode,
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
    price_validity_note: customCatalog?.price_validity_note ?? settings.price_validity_note,
    primary_color: customCatalog?.primary_color || settings.primary_color,
    footer_note: customCatalog?.footer_note ?? settings.footer_note,
    products_per_row: activeCols,
    rows_per_page: activeRows,
    grid_layout_mode: resolvedLayout.fillEmptySpace ? 'auto' : 'manual',
    show_code: customCatalog?.show_code !== undefined ? customCatalog.show_code : settings.show_code,
    show_category:
      customCatalog?.show_category !== undefined ? customCatalog.show_category : settings.show_category,
    show_image:
      customCatalog?.show_image !== undefined ? customCatalog.show_image : settings.show_image,
  };

  const pages = paginateCatalogPageItems(catalogItems, activeCols, activeRows);
  const previewPages = pages.slice(0, maxPages);

  if (previewPages.length === 0) {
    return `<div class="text-center p-12 text-slate-500 font-medium">لا توجد منتجات مسعرة لعرضها في المعاينة.</div>`;
  }

  return previewPages
    .map((pageItems, idx) =>
      buildSinglePreviewPageHtml(pageItems, activeSettings, idx, pages.length, categoryFilter, customCatalog)
    )
    .join('<div class="my-6 border-b-4 border-dashed border-slate-300"></div>');
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
  const primaryColor = customCatalog?.primary_color || settings.primary_color || '#0284c7';
  const companyName = customCatalog?.company_name || settings.company_name || settings.store_name || 'كتالوج الأسعار';
  const businessBio = customCatalog?.business_bio ?? settings.business_bio;
  const logoUrl = customCatalog?.logo_url ?? settings.logo_url;
  const phone = customCatalog?.phone ?? settings.phone;
  const whatsappNumber = customCatalog?.whatsapp_number ?? settings.whatsapp_number;
  const catalogTitle = customCatalog?.name || settings.catalog_title || 'قائمة الأسعار';
  const footerNote = customCatalog?.footer_note ?? settings.footer_note;
  const gridCols = clampGridColumns(customCatalog?.columns_count || settings.products_per_row || 4);
  const gridRows = clampGridRows(customCatalog?.rows_count || settings.rows_per_page, gridCols);
  const fillEmptySpace =
    (customCatalog?.grid_layout_mode || settings.grid_layout_mode) === 'auto';
  const isDense = gridRows >= 5 || gridCols >= 5;
  const isMicro = gridRows >= 7 || gridCols >= 7;
  const previewImgH = isMicro
    ? 44
    : gridRows >= 6
      ? 56
      : gridRows === 5
        ? 68
        : gridCols <= 2
          ? 120
          : gridCols === 3
            ? 95
            : 85;
  const cardPad = isMicro ? 4 : isDense ? 6 : 8;
  const gridGap = isMicro ? 4 : gridRows >= 6 ? 6 : gridRows === 5 ? 8 : 10;
  const showImage = customCatalog?.show_image !== undefined ? customCatalog.show_image : (settings.show_image ?? true);
  const showCode = customCatalog?.show_code !== undefined ? customCatalog.show_code : (settings.show_code ?? true);
  const showCategory = customCatalog?.show_category !== undefined ? customCatalog.show_category : (settings.show_category ?? true);
  const priceValidity = customCatalog?.price_validity_note || settings.price_validity_note;

  let categorySubtitle = '';
  if (categoryFilter && categoryFilter !== 'الكل') {
    const categoryDef = (settings.categories || DEFAULT_CATEGORIES).find((c) => c.name === categoryFilter);
    categorySubtitle = ` - ${categoryDef?.catalog_title || categoryDef?.name || categoryFilter}`;
  }

  const renderCardHtml = (item: CatalogPageItem): string => {
    if (item.type === 'header') {
      return `
        <div style="grid-column: 1 / -1; background: ${escapeHtml(primaryColor)}15; border-right: 4px solid ${escapeHtml(primaryColor)}; border-radius: 6px; padding: ${isDense ? '6px 10px' : '8px 12px'}; margin: 2px 0; display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: ${isDense ? 12.5 : 14}px; font-weight: 800; color: #0f172a;">${escapeHtml(item.title)}</span>
          ${item.subtitle ? `<span style="font-size: 11px; color: #64748b;">${escapeHtml(item.subtitle)}</span>` : ''}
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

    return `
      <div class="print-card" style="border: 1px solid #e2e8f0; border-radius: 8px; padding: ${cardPad}px; background: #fff; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; page-break-inside: avoid; ${fillEmptySpace ? 'height: 100%;' : ''}">
        ${
          showImage
            ? `
        <div style="${fillEmptySpace ? `min-height: ${previewImgH}px; flex: 1;` : `height: ${previewImgH}px;`} width: 100%; background: #fafafa; border: 1px solid #f1f5f9; border-radius: 6px; display: flex; align-items: center; justify-content: center; margin-bottom: ${isDense ? 4 : 6}px; overflow: hidden;">
          ${
            p.image_url
              ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" style="max-height: ${fillEmptySpace ? '180px' : `${previewImgH}px`}; max-width: 100%; object-fit: contain; display: block; margin: 0 auto;" />`
              : '<span style="font-size: 10px; color: #cbd5e1;">بدون صورة</span>'
          }
        </div>
        `
            : ''
        }

        <div>
          <h3 style="font-size: ${isMicro ? 9.5 : isDense ? 10.5 : 11.5}px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0; line-height: 1.25; min-height: ${isMicro ? 22 : isDense ? 25 : 28}px; max-height: ${isMicro ? 22 : isDense ? 25 : 28}px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; text-align: right;" title="${escapeHtml(p.name)}">
            ${escapeHtml(p.name)}
          </h3>

          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: ${isDense ? 4 : 6}px; padding: ${isDense ? '2px 5px' : '3px 6px'}; background: #f0fdf4; border-radius: 6px; border: 1px solid #bbf7d0;">
            <span style="font-size: ${isMicro ? 8 : isDense ? 9 : 10}px; font-weight: 600; color: #166534;">سعر البيع:</span>
            <div style="display: flex; align-items: baseline; gap: 2px;">
              <span style="font-size: ${isMicro ? 11 : isDense ? 12.5 : 14.5}px; font-weight: 900; color: #15803d;">${escapeHtml(p.selling_price || 0)}</span>
              <span style="font-size: ${isMicro ? 7.5 : isDense ? 8.5 : 9.5}px; font-weight: 700; color: #15803d;">ج.م</span>
            </div>
          </div>

          ${
            showCode || showCategory
              ? `
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: ${isMicro ? 7.5 : isDense ? 8.5 : 9}px; gap: 4px;">
            ${showCode ? `<span style="background: #f1f5f9; color: #475569; font-weight: 700; padding: 1px 5px; border-radius: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.code || 'PRD')}</span>` : '<span></span>'}
            ${showCategory ? `<span style="background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; padding: 1px 5px; border-radius: 3px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.category || 'متنوعة')}</span>` : ''}
          </div>
          `
              : ''
          }
        </div>
      </div>
    `;
  };

  let gridBodyHtml = '';
  if (fillEmptySpace) {
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
      <div style="display: grid; grid-template-columns: repeat(${gridCols}, minmax(0, 1fr)); gap: ${gridGap}px; flex: 1; align-content: start; justify-items: stretch;">
        ${pageItems.map(renderCardHtml).join('')}
      </div>
    `;
  }

  return `
    <div class="a4-preview-page print-page" dir="rtl" style="font-family: 'Cairo', sans-serif; background: #fff; width: 100%; max-width: 794px; min-height: ${fillEmptySpace ? '960px' : '1122px'}; padding: clamp(16px, 4vw, 38px); box-sizing: border-box; position: relative; display: flex; flex-direction: column; justify-content: space-between; margin: 0 auto; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border-radius: 4px;">
      
      <!-- Header: 10mm margins -->
      <div style="border-bottom: 2.5px solid ${escapeHtml(primaryColor)}; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          ${
            logoUrl
              ? `<img src="${escapeHtml(logoUrl)}" alt="شعار" style="width: 50px; height: 50px; object-fit: contain; border-radius: 8px; border: 1px solid #e2e8f0; padding: 2px;" />`
              : ''
          }
          <div>
            <h1 style="font-size: 19px; font-weight: 800; color: #0f172a; margin: 0;">${escapeHtml(companyName)}</h1>
            ${businessBio ? `<p style="font-size: 11px; color: #64748b; margin: 2px 0 0 0;">${escapeHtml(businessBio)}</p>` : ''}
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 3px; flex-wrap: wrap;">
              <span style="font-size: 12px; font-weight: 700; color: ${escapeHtml(primaryColor)};">
                ${escapeHtml(catalogTitle)}${escapeHtml(categorySubtitle)}
              </span>
              ${
                priceValidity
                  ? `<span style="font-size: 10px; font-weight: 700; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; padding: 1px 7px; border-radius: 9999px;">📅 سارية حتى: ${escapeHtml(priceValidity)}</span>`
                  : ''
              }
            </div>
          </div>
        </div>

        <div style="text-align: left; font-size: 11px; color: #475569; display: flex; flex-direction: column; gap: 2px;">
          ${phone ? `<div>هاتف: <span dir="ltr">${escapeHtml(phone)}</span></div>` : ''}
          ${whatsappNumber ? `<div>واتساب: <span dir="ltr">${escapeHtml(whatsappNumber)}</span></div>` : ''}
          ${settings.address ? `<div>${escapeHtml(settings.address)}</div>` : ''}
        </div>
      </div>

      <!-- Products Grid strictly within 10mm print area -->
      ${gridBodyHtml}

      <!-- Footer: inside 10mm margins -->
      <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #64748b; gap: 8px; flex-wrap: wrap;">
        <div>${escapeHtml(footerNote || '')}</div>
        <div style="font-weight: 700; color: #0f172a;">${escapeHtml(companyName)} • صفحة ${pageIndex + 1} من ${totalPages}</div>
      </div>
    </div>
  `;
}

