import * as XLSX from 'xlsx';
import {
  ALL_CATEGORIES,
  CategoryDefinition,
  Product,
  ProductCategory,
} from '../types';

export interface ExcelImportSummary {
  totalRows: number;
  validUpdates: {
    product: Product;
    oldPrice: number;
    newPrice: number;
  }[];
  missingCodes: {
    code: string;
    rowNumber: number;
  }[];
  invalidPrices: {
    code: string;
    rowNumber: number;
    rawPrice: any;
    reason: string;
  }[];
}

export interface ExcelSheetImportResult {
  totalRows: number;
  updatedProducts: Product[];
  newProducts: Product[];
  skippedRows: number;
}

/**
 * Normalizes Arabic & English column headers:
 * - Unifies أ/إ/آ -> ا, ة -> ه, ى -> ي
 * - Strips Arabic diacritics & tatweel
 * - Strips unit notes in parentheses like (ج.م) / (EGP)
 * - Strips whitespace & punctuation
 */
function normalizeHeaderKey(key: string): string {
  return String(key ?? '')
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00A0]/g, '') // invisible directional / zero-width chars
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // diacritics & tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\([^)]*\)/g, '') // remove parenthetical notes like (ج.م)
    .trim()
    .toLowerCase()
    .replace(/[\s_\-:/\\.*#@!?,،؛]+/g, '');
}

const EXCLUDED_PARTIAL_QUALIFIERS = [
  'مورد',
  'تاجر',
  'شركه',
  'عميل',
  'زبون',
  'مندوب',
  'فاتوره',
  'مجموعه',
  'قسم',
  'تصنيف',
  'معتمد',
  'supplier',
  'vendor',
  'customer',
  'client',
  'invoice',
  'group',
  'category',
].map(normalizeHeaderKey);

function getFieldValue(
  row: Record<string, any>,
  aliases: string[],
  partialKeywords: string[] = [],
  applyNonProductExclusions = false
): any {
  const keys = Object.keys(row);
  const normalizedAliases = aliases.map(normalizeHeaderKey);

  // 1. Exact normalized match
  for (const k of keys) {
    if (normalizedAliases.includes(normalizeHeaderKey(k))) {
      return row[k];
    }
  }

  // 2. Partial normalized keyword fallback
  if (partialKeywords.length > 0) {
    const normalizedKeywords = partialKeywords.map(normalizeHeaderKey);
    for (const k of keys) {
      const nk = normalizeHeaderKey(k);
      if (!nk || nk.startsWith('__col')) continue;
      if (
        applyNonProductExclusions &&
        EXCLUDED_PARTIAL_QUALIFIERS.some((ex) => nk.includes(ex))
      ) {
        continue;
      }
      if (normalizedKeywords.some((kw) => nk.includes(kw))) {
        return row[k];
      }
    }
  }

  return undefined;
}

/**
 * Parses numeric prices safely:
 * - Handles Eastern Arabic numerals ٠-٩
 * - Converts Arabic decimal separator ٫ -> .
 * - Strips Arabic/Western thousands separators (٬ ,) and currency words (ج.م, EGP, LE)
 */
export function parseNumericPrice(raw: any): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 0 ? Math.round(raw * 100) / 100 : 0;
  }
  const normalized = String(raw ?? '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/[٬,]/g, '')
    .trim();

  if (!normalized) return 0;

  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
}

function resolveImportedCategory(
  rawCategory: string,
  name: string,
  availableCategories: string[]
): ProductCategory {
  const cleanRaw = (rawCategory || '').trim();
  if (cleanRaw) {
    const normRaw = normalizeHeaderKey(cleanRaw);
    const exactMatch = availableCategories.find(
      (c) => normalizeHeaderKey(c) === normRaw || c.trim().toLowerCase() === cleanRaw.toLowerCase()
    );
    if (exactMatch) return exactMatch;
    if (ALL_CATEGORIES.includes(cleanRaw)) return cleanRaw;
    return cleanRaw;
  }

  const text = `${name} ${cleanRaw}`.toLowerCase();
  if (text.includes('مايك') || text.includes('ميك') || text.includes('mic')) return 'ميك';
  if (text.includes('ايربودز') || text.includes('airpod') || text.includes('بودز')) return 'ايربودز';
  if (text.includes('هيدفون') || text.includes('headphone')) return 'هيدفون';
  if (text.includes('هاند فري') || text.includes('سماعة سلك')) return 'هاند فري';
  if (text.includes('شاحن سيارة') || text.includes('سيارة')) return 'شاحن سيارة';
  if (text.includes('رأس شاحن') || text.includes('راس شاحن') || text.includes('أدابتور') || text.includes('ادابتور')) return 'رأس شاحن';
  if (text.includes('شاحن')) return 'شاحن حيطة';
  if (text.includes('باوربانك') || text.includes('باور بانك') || text.includes('powerbank')) return 'باوربانك';
  if (text.includes('كابل') || text.includes('وصلة') || text.includes('وصله') || text.includes('cable')) return 'كابل';
  if (text.includes('قلم') || text.includes('stylus')) return 'قلم';
  return availableCategories[availableCategories.length - 1] || 'متنوعة';
}

function buildWorksheetColumns(rows: Record<string, any>[]): XLSX.ColInfo[] {
  if (rows.length === 0) {
    return [
      { wch: 14 },
      { wch: 32 },
      { wch: 15 },
      { wch: 16 },
      { wch: 18 },
      { wch: 28 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
    ];
  }

  const headers = Object.keys(rows[0]);
  return headers.map((header) => {
    let maxLen = header.length + 4;
    for (const r of rows) {
      const val = String(r[header] ?? '');
      if (val.length + 2 > maxLen) {
        maxLen = val.length + 2;
      }
    }
    return { wch: Math.min(48, Math.max(12, maxLen)) };
  });
}

function decodeTextBytesSmart(bytes: Uint8Array): string {
  // Handle UTF-16 LE / BE BOM (e.g. Excel "Unicode Text" CSV exports)
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2)).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2)).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  let decoded = '';
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      decoded = new TextDecoder('windows-1256').decode(bytes);
    } catch {
      decoded = new TextDecoder().decode(bytes);
    }
  }
  return decoded.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Reads an Excel (.xlsx / .xls) or CSV/TSV or HTML-XLS file cleanly, auto-handling UTF-8, UTF-16 & Windows-1256
 */
async function readWorkbookSmart(file: File): Promise<XLSX.WorkBook> {
  const lowerName = (file.name || '').toLowerCase();
  const isTextTable =
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.tsv') ||
    lowerName.endsWith('.txt') ||
    file.type.includes('csv') ||
    file.type.includes('tab-separated-values');

  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new Error('الملف المرفوع فارغ (حجمه 0 بايت).');
  }

  const bytes = new Uint8Array(arrayBuffer);

  // Detect real binary Excel containers (ZIP-based .xlsx or OLE2/BIFF .xls)
  const isZipXlsx = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOle2Xls =
    bytes.length >= 4 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0;
  const isBiffXls = bytes.length >= 8 && bytes[0] === 0x09 && bytes[1] <= 0x08;
  const isBinaryExcel = isZipXlsx || isOle2Xls || isBiffXls;

  // Detect HTML/XML/text-disguised .xls exports (common in accounting / POS apps)
  const headProbe = new TextDecoder('latin1')
    .decode(bytes.subarray(0, Math.min(512, bytes.length)))
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();
  const looksLikeHtmlOrXml =
    headProbe.startsWith('<html') ||
    headProbe.startsWith('<!doctype') ||
    headProbe.startsWith('<table') ||
    headProbe.startsWith('<?xml');

  if (isTextTable || looksLikeHtmlOrXml || !isBinaryExcel) {
    const decoded = decodeTextBytesSmart(bytes);
    return XLSX.read(decoded, { type: 'string' });
  }

  return XLSX.read(arrayBuffer, { type: 'array' });
}

/**
 * Expands worksheet['!ref'] if any cells exist outside the declared !ref range
 */
function ensureFullSheetRange(worksheet: XLSX.WorkSheet): void {
  let maxR = -1;
  let maxC = -1;
  let minR = Number.MAX_SAFE_INTEGER;
  let minC = Number.MAX_SAFE_INTEGER;

  for (const key of Object.keys(worksheet)) {
    if (key.startsWith('!')) continue;
    try {
      const addr = XLSX.utils.decode_cell(key);
      if (addr.r >= 0 && addr.c >= 0) {
        if (addr.r < minR) minR = addr.r;
        if (addr.c < minC) minC = addr.c;
        if (addr.r > maxR) maxR = addr.r;
        if (addr.c > maxC) maxC = addr.c;
      }
    } catch {
      // ignore invalid keys
    }
  }

  if (maxR >= 0 && maxC >= 0) {
    const actualRange: XLSX.Range = {
      s: { r: Math.min(minR, 0), c: Math.min(minC, 0) },
      e: { r: maxR, c: maxC },
    };

    if (worksheet['!ref']) {
      try {
        const declared = XLSX.utils.decode_range(worksheet['!ref']);
        actualRange.s.r = Math.min(declared.s.r, minR);
        actualRange.s.c = Math.min(declared.s.c, minC);
        actualRange.e.r = Math.max(declared.e.r, maxR);
        actualRange.e.c = Math.max(declared.e.c, maxC);
      } catch {
        // use actualRange
      }
    }

    worksheet['!ref'] = XLSX.utils.encode_range(actualRange);
  }
}

const KNOWN_HEADER_SCORE_TOKENS = [
  'كود',
  'باركود',
  'code',
  'sku',
  'اسم',
  'صنف',
  'منتج',
  'بيان',
  'name',
  'product',
  'title',
  'قسم',
  'فئه',
  'تصنيف',
  'نوع',
  'category',
  'ماركه',
  'براند',
  'شركه',
  'brand',
  'group',
  'موديل',
  'طراز',
  'model',
  'مواصفات',
  'وصف',
  'تفاصيل',
  'spec',
  'جمله',
  'شراء',
  'تكلفه',
  'wholesale',
  'cost',
  'بيع',
  'قطاعي',
  'جمهور',
  'سعر',
  'selling',
  'price',
  'مدرج',
  'included',
].map(normalizeHeaderKey);

function scoreHeaderRow(cells: any[]): number {
  let score = 0;
  const seen = new Set<string>();
  for (const rawCell of cells) {
    const text = normalizeHeaderKey(String(rawCell ?? ''));
    if (!text || text.length > 35 || /^\d+(\.\d+)?$/.test(text)) continue;
    if (KNOWN_HEADER_SCORE_TOKENS.some((tok) => text === tok || text.includes(tok))) {
      if (!seen.has(text)) {
        seen.add(text);
        score++;
      }
    }
  }
  return score;
}

/**
 * Checks whether a worksheet is purely the template's "الأقسام المتاحة" lookup tab
 */
function isLookupOnlySheet(sheetName: string, headerRow: string[]): boolean {
  if (normalizeHeaderKey(sheetName) === normalizeHeaderKey('الأقسام المتاحة')) {
    return true;
  }
  const normalizedHeaders = headerRow.map(normalizeHeaderKey);
  return (
    normalizedHeaders.includes(normalizeHeaderKey('اسم القسم المعتمد')) &&
    normalizedHeaders.length <= 3
  );
}

/**
 * Checks whether a row in the middle of a long sheet is just a repeated copy of the header row
 */
function isRepeatedHeaderRow(rowCells: any[], headerRow: string[]): boolean {
  let matches = 0;
  let nonEmptyHeaders = 0;
  for (let c = 0; c < headerRow.length; c++) {
    const h = headerRow[c];
    if (!h || h.startsWith('__col_')) continue;
    nonEmptyHeaders++;
    const cellVal = normalizeHeaderKey(String(rowCells[c] ?? ''));
    if (cellVal && cellVal === normalizeHeaderKey(h)) {
      matches++;
    }
  }
  return nonEmptyHeaders >= 2 && matches >= Math.min(3, nonEmptyHeaders);
}

/**
 * Converts a raw 2D matrix into positional row objects when no header row exists
 */
function mapHeaderlessMatrixToObjects(matrix: any[][]): Record<string, any>[] {
  const nonEmptyRows = matrix.filter((row) =>
    row.some((c) => String(c ?? '').trim() !== '')
  );

  return nonEmptyRows.map((rawCols, idx) => {
    const cols = rawCols.map((c) => String(c ?? '').trim());
    while (cols.length > 0 && cols[cols.length - 1] === '') {
      cols.pop();
    }

    let obj: Record<string, any>;
    if (cols.length <= 1) {
      obj = { 'اسم المنتج': cols[0] ?? '' };
    } else if (cols.length === 2) {
      obj = { 'اسم المنتج': cols[0], 'سعر البيع': cols[1] };
    } else if (cols.length === 3) {
      obj = { 'اسم المنتج': cols[0], 'سعر الجملة': cols[1], 'سعر البيع': cols[2] };
    } else if (cols.length === 4) {
      obj = {
        'الكود': cols[0],
        'اسم المنتج': cols[1],
        'سعر الجملة': cols[2],
        'سعر البيع': cols[3],
      };
    } else if (cols.length === 5) {
      obj = {
        'الكود': cols[0],
        'اسم المنتج': cols[1],
        'القسم': cols[2],
        'سعر الجملة': cols[3],
        'سعر البيع': cols[4],
      };
    } else if (cols.length === 6) {
      obj = {
        'الكود': cols[0],
        'اسم المنتج': cols[1],
        'القسم': cols[2],
        'الموديل': cols[3],
        'سعر الجملة': cols[4],
        'سعر البيع': cols[5],
      };
    } else {
      obj = {
        'الكود': cols[0],
        'اسم المنتج': cols[1],
        'القسم': cols[2],
        'الماركة': cols[3],
        'الموديل': cols[4],
        'المواصفات': cols[5],
        'سعر الجملة': cols[6],
        'سعر البيع': cols[7] ?? '',
      };
    }
    obj.__excelRowNumber = idx + 1;
    return obj;
  });
}

/**
 * Extracts ALL normalized row objects across ALL worksheets in a workbook:
 * - Expands truncated !ref ranges
 * - Reads ALL non-empty product sheets (skipping template category-lookup tabs)
 * - Scans top rows for real header row (handles company banner/title rows on top!)
 * - Skips repeated header rows mid-table
 * - Falls back cleanly to positional columns if sheet has no headers
 */
function extractRowsFromWorkbook(workbook: XLSX.WorkBook): {
  rawRows: Record<string, any>[];
  headerRowOffset: number;
} {
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('الملف فارغ ولا يحتوي على أي أوراق عمل.');
  }

  const allRows: Record<string, any>[] = [];
  let firstHeaderOffset = 0;

  for (const sheetName of workbook.SheetNames) {
    if (normalizeHeaderKey(sheetName) === normalizeHeaderKey('الأقسام المتاحة')) {
      continue;
    }

    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    ensureFullSheetRange(worksheet);

    const matrix = XLSX.utils.sheet_to_json<any[]>(worksheet, {
      header: 1,
      raw: true,
      defval: '',
    });

    const hasAnyContent = matrix.some(
      (r) => Array.isArray(r) && r.some((cell) => String(cell ?? '').trim() !== '')
    );
    if (!hasAnyContent) continue;

    // Skip template lookup tabs even if renamed
    const firstNonEmptyRow = matrix.find(
      (r) => Array.isArray(r) && r.some((cell) => String(cell ?? '').trim() !== '')
    );
    if (
      firstNonEmptyRow &&
      isLookupOnlySheet(
        sheetName,
        firstNonEmptyRow.map((h) => String(h ?? '').trim())
      )
    ) {
      continue;
    }

    // Scan top rows to locate the best header row
    let bestHeaderIdx = -1;
    let bestScore = 0;
    const scanLimit = Math.min(15, matrix.length);
    for (let r = 0; r < scanLimit; r++) {
      const rowCells = matrix[r];
      if (!Array.isArray(rowCells)) continue;
      const sc = scoreHeaderRow(rowCells);
      if (sc > bestScore) {
        bestScore = sc;
        bestHeaderIdx = r;
      }
    }

    const STRONG_EXACT_HEADERS = new Set(
      [
        'اسم المنتج',
        'اسم الصنف',
        'المنتج',
        'الصنف',
        'الاسم',
        'البيان',
        'الكود',
        'سعر البيع',
        'سعر الجملة',
        'السعر',
        'name',
        'product',
        'productname',
        'price',
        'sellingprice',
      ].map(normalizeHeaderKey)
    );

    const hasStrongExactHeader =
      bestHeaderIdx === 0 &&
      matrix.length >= 2 &&
      Array.isArray(matrix[0]) &&
      matrix[0].some((cell) => STRONG_EXACT_HEADERS.has(normalizeHeaderKey(String(cell ?? ''))));

    if (bestHeaderIdx !== -1 && (bestScore >= 2 || (bestScore >= 1 && hasStrongExactHeader))) {
      const seenHeaders = new Set<string>();
      const headerRow = matrix[bestHeaderIdx].map((h, idx) => {
        const clean = String(h ?? '').trim() || `__col_${idx}`;
        let unique = clean;
        let suffix = 2;
        while (seenHeaders.has(unique)) {
          unique = `${clean}_${suffix++}`;
        }
        seenHeaders.add(unique);
        return unique;
      });

      if (isLookupOnlySheet(sheetName, headerRow)) {
        continue;
      }

      if (allRows.length === 0) {
        firstHeaderOffset = bestHeaderIdx + 1;
      }

      for (let r = bestHeaderIdx + 1; r < matrix.length; r++) {
        const rowCells = matrix[r];
        if (!Array.isArray(rowCells)) continue;
        const hasVal = rowCells.some((c) => String(c ?? '').trim() !== '');
        if (!hasVal) continue;
        if (isRepeatedHeaderRow(rowCells, headerRow)) continue;

        const obj: Record<string, any> = {};
        const colLimit = Math.max(headerRow.length, rowCells.length);
        for (let c = 0; c < colLimit; c++) {
          const colKey = c < headerRow.length ? headerRow[c] : `__col_${c}`;
          obj[colKey] = rowCells[c] !== undefined ? rowCells[c] : '';
        }
        obj.__excelRowNumber = r + 1;
        allRows.push(obj);
      }
    } else {
      // Fallback: Headerless worksheet -> positional mapping
      const fallbackRows = mapHeaderlessMatrixToObjects(matrix);
      allRows.push(...fallbackRows);
    }
  }

  if (allRows.length === 0) {
    throw new Error('ورقة العمل لا تحتوي على بيانات منتجات صالحة.');
  }

  return { rawRows: allRows, headerRowOffset: firstHeaderOffset };
}

/**
 * Exports products to an RTL formatted Excel (.xlsx) file
 */
export function exportProductsToExcel(
  products: Product[],
  filename = 'اسعار_المنتجات.xlsx'
): void {
  const rows = products.map((p) => {
    const wholesale = p.wholesale_price || 0;
    const selling = p.selling_price || 0;
    const profit = selling > 0 ? Math.round((selling - wholesale) * 100) / 100 : 0;

    return {
      'الكود': p.code || '',
      'اسم المنتج': p.name || '',
      'القسم': p.category || 'متنوعة',
      'الماركة': p.group || '',
      'الموديل': p.model || '',
      'المواصفات': p.specification || '',
      'سعر الجملة': wholesale,
      'سعر البيع': selling,
      'الربح بالجنيه': profit,
      'مدرج بالكتالوج': p.included_in_catalog ? 'نعم' : 'لا',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = buildWorksheetColumns(rows);
  if (!worksheet['!views']) worksheet['!views'] = [];
  worksheet['!views'].push({ rightToLeft: true });

  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(workbook, worksheet, 'قائمة المنتجات');

  XLSX.writeFile(workbook, filename);
}

/**
 * Generates and downloads a clean Excel template (.xlsx) ready to be filled offline and re-imported
 */
export function downloadExcelTemplate(
  filename = 'قالب_إكسيل_المنتجات.xlsx',
  categories?: CategoryDefinition[]
): void {
  const sampleRows = [
    {
      'الكود': 'PRD-101',
      'اسم المنتج': 'سماعة ايربودز برو لاسلكية',
      'القسم': categories?.[0]?.name || 'ايربودز',
      'الماركة': 'Joyroom',
      'الموديل': 'JR-T03S',
      'المواصفات': 'بلوتوث 5.3 عازل للضوضاء مع جراب حماية',
      'سعر الجملة': 250,
      'سعر البيع': 380,
      'مدرج بالكتالوج': 'نعم',
    },
    {
      'الكود': 'PRD-102',
      'اسم المنتج': 'كابل شحن سريع قماش Type-C',
      'القسم': 'كابل',
      'الماركة': 'Baseus',
      'الموديل': '1.2M 60W',
      'المواصفات': 'ضمان استبدال سلك مجدول يتحمل الشد',
      'سعر الجملة': 40,
      'سعر البيع': 75,
      'مدرج بالكتالوج': 'نعم',
    },
  ];

  const mainSheet = XLSX.utils.json_to_sheet(sampleRows);
  mainSheet['!cols'] = buildWorksheetColumns(sampleRows);
  mainSheet['!views'] = [{ rightToLeft: true }];

  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(workbook, mainSheet, 'بيانات المنتجات');

  const categoryRows = (categories && categories.length > 0 ? categories.map((c) => c.name) : ALL_CATEGORIES).map(
    (name, idx) => ({
      'م': idx + 1,
      'اسم القسم المعتمد': name,
    })
  );
  const catSheet = XLSX.utils.json_to_sheet(categoryRows);
  catSheet['!cols'] = [{ wch: 8 }, { wch: 28 }];
  catSheet['!views'] = [{ rightToLeft: true }];
  XLSX.utils.book_append_sheet(workbook, catSheet, 'الأقسام المتاحة');

  XLSX.writeFile(workbook, filename);
}

/**
 * Parses an uploaded Excel (.xlsx / .xls / .csv) file into updated & newly added products
 */
export async function parseExcelSheetToProducts(
  file: File,
  existingProducts: Product[],
  availableCategoryNames: string[] = ALL_CATEGORIES
): Promise<ExcelSheetImportResult> {
  const workbook = await readWorkbookSmart(file);
  const { rawRows } = extractRowsFromWorkbook(workbook);

  return mapRawObjectRowsToProducts(
    rawRows,
    existingProducts,
    availableCategoryNames,
    file.name
  );
}

/**
 * Parses tab-separated (TSV) or CSV text copied directly from Excel / Google Sheets
 */
export function parsePastedSpreadsheetText(
  rawText: string,
  existingProducts: Product[],
  availableCategoryNames: string[] = ALL_CATEGORIES
): ExcelSheetImportResult {
  const cleanText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!cleanText) {
    throw new Error('لا توجد بيانات ملصقة للتحليل.');
  }

  const hasTabs = cleanText.includes('\t');
  let matrix: string[][];

  if (hasTabs) {
    matrix = cleanText
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => line.split('\t').map((cell) => cell.trim()));
  } else {
    const wb = XLSX.read(cleanText, { type: 'string' });
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const rawMatrix = XLSX.utils.sheet_to_json<any[]>(firstSheet, {
      header: 1,
      raw: true,
      defval: '',
    });
    matrix = rawMatrix
      .filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''))
      .map((r) => r.map((c) => String(c ?? '').trim()));
  }

  if (matrix.length === 0) {
    throw new Error('النص الملصق فارغ.');
  }

  let rawObjects: Record<string, any>[];
  const headerScore = scoreHeaderRow(matrix[0]);

  if (headerScore >= 2 && matrix.length >= 2) {
    const headers = matrix[0];
    rawObjects = matrix.slice(1).map((cols, idx) => {
      const obj: Record<string, any> = {};
      headers.forEach((h, cIdx) => {
        obj[h || `__col_${cIdx}`] = cols[cIdx] ?? '';
      });
      obj.__excelRowNumber = idx + 2;
      return obj;
    });
  } else {
    rawObjects = mapHeaderlessMatrixToObjects(matrix);
  }

  return mapRawObjectRowsToProducts(
    rawObjects,
    existingProducts,
    availableCategoryNames,
    'لصق من إكسيل'
  );
}

const PLACEHOLDER_CODES = new Set([
  '-',
  '--',
  '—',
  '_',
  '0',
  'لا يوجد',
  'لايوجد',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
]);

function mapRawObjectRowsToProducts(
  rawRows: Record<string, any>[],
  existingProducts: Product[],
  availableCategoryNames: string[],
  sourceLabel: string
): ExcelSheetImportResult {
  const byCode = new Map<string, Product>();
  const byName = new Map<string, Product>();
  for (const p of existingProducts) {
    if (p.code?.trim() && !PLACEHOLDER_CODES.has(p.code.trim().toLowerCase())) {
      byCode.set(p.code.trim().toLowerCase(), p);
    }
    if (p.name?.trim()) {
      byName.set(p.name.trim().toLowerCase(), p);
    }
  }

  const now = Date.now();
  const updatedById = new Map<string, Product>();
  const newById = new Map<string, Product>();
  const touchedIdsInBatch = new Set<string>();
  let skippedRows = 0;
  let nextAutoSeq = existingProducts.length + 1;

  const generateUniqueAutoCode = (basePrefix = 'XLS'): string => {
    while (true) {
      const candidate = `${basePrefix}-${String(nextAutoSeq).padStart(3, '0')}`;
      nextAutoSeq++;
      if (!byCode.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
  };

  rawRows.forEach((row, index) => {
    const rawCodeCandidate = String(
      getFieldValue(
        row,
        [
          'الكود',
          'كود',
          'كود الصنف',
          'كود المنتج',
          'رقم الصنف',
          'الباركود',
          'باركود',
          'رمز الصنف',
          'code',
          'sku',
          'barcode',
          'item_code',
          'product_code',
          'id',
        ],
        ['كود', 'باركود', 'sku', 'code', 'barcode'],
        true
      ) ?? ''
    ).trim();

    const rawCode = PLACEHOLDER_CODES.has(rawCodeCandidate.toLowerCase())
      ? ''
      : rawCodeCandidate;

    const rawName = String(
      getFieldValue(
        row,
        [
          'اسم المنتج',
          'الاسم',
          'المنتج',
          'الصنف',
          'اسم الصنف',
          'البيان',
          'بيان',
          'البند',
          'اسم البند',
          'البضاعة',
          'name',
          'title',
          'product',
          'item',
          'productname',
          'itemname',
        ],
        ['اسم', 'صنف', 'منتج', 'بيان', 'بند', 'product', 'item'],
        true
      ) ?? ''
    ).trim();

    const rawCategory = String(
      getFieldValue(
        row,
        ['القسم', 'النوع', 'التصنيف', 'الفئة', 'نوع الصنف', 'category', 'type'],
        ['قسم', 'فئه', 'تصنيف', 'category']
      ) ?? ''
    ).trim();

    const rawGroup = String(
      getFieldValue(
        row,
        ['الماركة', 'الشركة', 'العلامة', 'العلامة التجارية', 'البراند', 'المصنع', 'group', 'brand'],
        ['مارك', 'براند', 'علامه', 'brand']
      ) ?? ''
    ).trim();

    const rawModel = String(
      getFieldValue(
        row,
        ['الموديل', 'الطراز', 'الإصدار', 'model', 'variant'],
        ['موديل', 'طراز', 'model']
      ) ?? ''
    ).trim();

    const rawSpec = String(
      getFieldValue(
        row,
        [
          'المواصفات',
          'الوصف',
          'التفاصيل',
          'ملاحظات',
          'specification',
          'specifications',
          'specs',
          'description',
          'details',
        ],
        ['مواصف', 'وصف', 'تفاصيل', 'spec']
      ) ?? ''
    ).trim();

    const rawWholesale = getFieldValue(
      row,
      [
        'سعر الجملة',
        'الجملة',
        'جملة',
        'سعر الشراء',
        'الشراء',
        'التكلفة',
        'سعر التكلفة',
        'سعر التاجر',
        'سعر المورد',
        'wholesale_price',
        'wholesale',
        'cost',
      ],
      ['جمل', 'شراء', 'تكلف', 'wholesale', 'cost']
    );

    const rawSelling = getFieldValue(
      row,
      [
        'سعر البيع',
        'البيع',
        'بيع',
        'سعر الجمهور',
        'سعر المستهلك',
        'القطاعي',
        'سعر القطاعي',
        'السعر',
        'سعر',
        'selling_price',
        'price',
        'sellingprice',
      ],
      ['بيع', 'جمهور', 'قطاع', 'مستهلك', 'selling']
    );

    const rawIncluded = String(
      getFieldValue(
        row,
        ['مدرج بالكتالوج', 'مدرج', 'في الكتالوج', 'مفعل', 'included', 'included_in_catalog', 'active'],
        ['مدرج', 'كتالوج', 'included']
      ) ?? ''
    )
      .trim()
      .toLowerCase();

    const hasWholesale =
      rawWholesale !== undefined && rawWholesale !== null && String(rawWholesale).trim() !== '';
    const hasSelling =
      rawSelling !== undefined && rawSelling !== null && String(rawSelling).trim() !== '';

    const parsedWholesale = hasWholesale ? parseNumericPrice(rawWholesale) : 0;
    const parsedSelling = hasSelling ? parseNumericPrice(rawSelling) : 0;

    if (!rawCode && !rawName && !rawSpec && !rawModel && parsedWholesale <= 0 && parsedSelling <= 0) {
      skippedRows++;
      return;
    }

    const effectiveName = rawName || rawSpec || rawModel;
    const codeMatch = rawCode ? byCode.get(rawCode.toLowerCase()) : undefined;
    const nameCandidate = effectiveName ? byName.get(effectiveName.toLowerCase()) : undefined;

    // Never collapse two DIFFERENT product names inside the SAME import batch just because they shared a generic/supplier code
    const codeMatchConflictsInBatch = Boolean(
      codeMatch &&
        touchedIdsInBatch.has(codeMatch.id) &&
        effectiveName &&
        codeMatch.name &&
        normalizeHeaderKey(effectiveName) !== normalizeHeaderKey(codeMatch.name)
    );

    // Never collapse rows that have DIFFERENT explicit codes or DIFFERENT variant details (model/category/group/spec/price) just because they share a product name like "شاحن"
    let safeNameMatch: Product | undefined = undefined;
    if (nameCandidate) {
      const existingCode = (nameCandidate.code || '').trim().toLowerCase();
      const incomingCode = rawCode.toLowerCase();
      const isAutoExistingCode =
        !existingCode ||
        existingCode.startsWith('xls-') ||
        existingCode.startsWith('prd-p') ||
        PLACEHOLDER_CODES.has(existingCode);

      const hasConflictingExplicitCode = Boolean(
        incomingCode && existingCode && existingCode !== incomingCode && !isAutoExistingCode
      );

      const hasDifferentDetailsInSameBatch =
        touchedIdsInBatch.has(nameCandidate.id) &&
        (Boolean(incomingCode && existingCode !== incomingCode) ||
          (rawModel &&
            normalizeHeaderKey(rawModel) !== normalizeHeaderKey(nameCandidate.model || '')) ||
          (rawCategory &&
            normalizeHeaderKey(rawCategory) !==
              normalizeHeaderKey(nameCandidate.category || '')) ||
          (rawGroup &&
            normalizeHeaderKey(rawGroup) !== normalizeHeaderKey(nameCandidate.group || '')) ||
          (rawSpec &&
            normalizeHeaderKey(rawSpec) !==
              normalizeHeaderKey(nameCandidate.specification || '')) ||
          (hasWholesale && parsedWholesale !== (nameCandidate.wholesale_price || 0)) ||
          (hasSelling && parsedSelling !== (nameCandidate.selling_price || 0)));

      if (!hasConflictingExplicitCode && !hasDifferentDetailsInSameBatch) {
        safeNameMatch = nameCandidate;
      }
    }

    const matched = codeMatchConflictsInBatch ? safeNameMatch : codeMatch || safeNameMatch;

    if (matched) {
      const base = newById.get(matched.id) || updatedById.get(matched.id) || matched;
      const nextWholesale = hasWholesale ? parsedWholesale : base.wholesale_price;
      const nextSelling = hasSelling ? parsedSelling : base.selling_price;
      const nextIncluded =
        rawIncluded === 'لا' || rawIncluded === 'no' || rawIncluded === 'false' || rawIncluded === '0'
          ? false
          : rawIncluded === 'نعم' || rawIncluded === 'yes' || rawIncluded === 'true' || rawIncluded === '1'
            ? true
            : nextSelling > 0
              ? true
              : base.included_in_catalog;

      const updated: Product = {
        ...base,
        code: rawCode || base.code,
        name: effectiveName || base.name,
        category: rawCategory
          ? resolveImportedCategory(rawCategory, effectiveName || base.name, availableCategoryNames)
          : base.category,
        group: rawGroup || base.group,
        model: rawModel || base.model,
        specification: rawSpec || base.specification,
        wholesale_price: nextWholesale,
        selling_price: nextSelling,
        manual_price_set: hasSelling ? true : base.manual_price_set,
        included_in_catalog: nextIncluded,
        updated_at: now + index,
      };

      if (newById.has(updated.id)) {
        newById.set(updated.id, updated);
      } else {
        updatedById.set(updated.id, updated);
      }
      touchedIdsInBatch.add(updated.id);
      if (updated.code) byCode.set(updated.code.trim().toLowerCase(), updated);
      if (updated.name) byName.set(updated.name.trim().toLowerCase(), updated);
    } else {
      const finalName = effectiveName || rawCode;
      if (!finalName) {
        skippedRows++;
        return;
      }

      const generatedCode = codeMatchConflictsInBatch
        ? generateUniqueAutoCode(rawCode || 'XLS')
        : rawCode || generateUniqueAutoCode('XLS');

      const nextIncluded =
        rawIncluded === 'لا' || rawIncluded === 'no' || rawIncluded === 'false' || rawIncluded === '0'
          ? false
          : rawIncluded === 'نعم' || rawIncluded === 'yes' || rawIncluded === 'true' || rawIncluded === '1'
            ? true
            : parsedSelling > 0;

      const created: Product = {
        id: `prod_xls_${now}_${index}_${Math.random().toString(36).slice(2, 6)}`,
        code: generatedCode,
        name: finalName,
        category: resolveImportedCategory(rawCategory, finalName, availableCategoryNames),
        group: rawGroup,
        model: rawModel,
        specification: rawSpec,
        wholesale_price: parsedWholesale,
        selling_price: parsedSelling,
        manual_price_set: parsedSelling > 0,
        included_in_catalog: nextIncluded,
        available_models: [],
        source_file: sourceLabel,
        created_at: now + index,
        updated_at: now + index,
      };
      newById.set(created.id, created);
      touchedIdsInBatch.add(created.id);
      if (created.code && !codeMatchConflictsInBatch) {
        byCode.set(created.code.trim().toLowerCase(), created);
      }
      if (created.name) {
        byName.set(created.name.trim().toLowerCase(), created);
      }
    }
  });

  return {
    totalRows: rawRows.length,
    updatedProducts: Array.from(updatedById.values()),
    newProducts: Array.from(newById.values()),
    skippedRows,
  };
}

/**
 * Parses an uploaded Excel file, validates rows against existing products,
 * and prepares a review summary before applying updates.
 */
export async function parseExcelForPriceUpdates(
  file: File,
  existingProducts: Product[]
): Promise<ExcelImportSummary> {
  const workbook = await readWorkbookSmart(file);
  const { rawRows, headerRowOffset } = extractRowsFromWorkbook(workbook);

  const productMap = new Map<string, Product>();
  for (const p of existingProducts) {
    if (p.code) {
      productMap.set(String(p.code).trim().toLowerCase(), p);
    }
  }

  const validUpdates: ExcelImportSummary['validUpdates'] = [];
  const missingCodes: ExcelImportSummary['missingCodes'] = [];
  const invalidPrices: ExcelImportSummary['invalidPrices'] = [];

  rawRows.forEach((row, index) => {
    const rowNumber = row.__excelRowNumber || headerRowOffset + index + 1;

    const rawCodeVal = getFieldValue(
      row,
      ['الكود', 'كود', 'كود الصنف', 'الباركود', 'code', 'sku', 'id'],
      ['كود', 'code', 'sku'],
      true
    );
    const rawCode = String(rawCodeVal ?? '').trim();

    if (!rawCode) {
      return;
    }

    const rawPrice = getFieldValue(
      row,
      [
        'سعر البيع',
        'البيع',
        'بيع',
        'سعر الجمهور',
        'الجمهور',
        'سعر القطاعي',
        'القطاعي',
        'سعر المستهلك',
        'السعر',
        'سعر',
        'selling_price',
        'price',
      ],
      ['بيع', 'جمهور', 'قطاعي', 'مستهلك', 'selling', 'price']
    );

    const matchedProduct = productMap.get(rawCode.toLowerCase());

    if (!matchedProduct) {
      missingCodes.push({
        code: rawCode,
        rowNumber,
      });
      return;
    }

    if (rawPrice === '' || rawPrice === null || rawPrice === undefined) {
      invalidPrices.push({
        code: rawCode,
        rowNumber,
        rawPrice,
        reason: 'سعر البيع فارغ',
      });
      return;
    }

    const parsedPrice = parseNumericPrice(rawPrice);

    if (parsedPrice <= 0) {
      invalidPrices.push({
        code: rawCode,
        rowNumber,
        rawPrice,
        reason: 'السعر ليس رقماً صحيحاً أو أقل من الصفر',
      });
      return;
    }

    validUpdates.push({
      product: matchedProduct,
      oldPrice: matchedProduct.selling_price || 0,
      newPrice: parsedPrice,
    });
  });

  return {
    totalRows: rawRows.length,
    validUpdates,
    missingCodes,
    invalidPrices,
  };
}
