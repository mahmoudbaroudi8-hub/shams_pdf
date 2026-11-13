import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';

export interface MergePdfItem {
  id: string;
  name: string;
  size: number;
  buffer: ArrayBuffer;
  pageCount?: number;
}

/**
 * Merges multiple PDF files into one single PDF using pdf-lib (page copying without re-rendering)
 */
export async function mergePdfFiles(
  items: MergePdfItem[],
  outputFileName: string
): Promise<Blob> {
  if (items.length === 0) {
    throw new Error('يرجى اختيار ملفين PDF على الأقل للدمج.');
  }

  const mergedDoc = await PDFDocument.create();

  for (const item of items) {
    try {
      const srcDoc = await PDFDocument.load(item.buffer, { ignoreEncryption: true });
      const indices = srcDoc.getPageIndices();
      const copiedPages = await mergedDoc.copyPages(srcDoc, indices);
      for (const page of copiedPages) {
        mergedDoc.addPage(page);
      }
    } catch (err: any) {
      throw new Error(`تعذر قراءة أو دمج الملف "${item.name}": ${err.message || ''}`);
    }
  }

  const mergedBytes = await mergedDoc.save();
  return new Blob([mergedBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}

/**
 * Splits a PDF document by custom page ranges (1-indexed)
 */
export async function splitPdfByRanges(
  srcBuffer: ArrayBuffer,
  baseName: string,
  ranges: { start: number; end: number; label: string }[]
): Promise<{ filename: string; bytes: Uint8Array }[]> {
  const srcDoc = await PDFDocument.load(srcBuffer, { ignoreEncryption: true });
  const total = srcDoc.getPageCount();
  const results: { filename: string; bytes: Uint8Array }[] = [];

  for (const r of ranges) {
    const subDoc = await PDFDocument.create();
    const startIdx = Math.max(0, r.start - 1);
    const endIdx = Math.min(total - 1, r.end - 1);
    const indices: number[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      indices.push(i);
    }

    if (indices.length > 0) {
      const copied = await subDoc.copyPages(srcDoc, indices);
      copied.forEach((p) => subDoc.addPage(p));
      const bytes = await subDoc.save();
      const filename = `${baseName}_${r.label}.pdf`;
      results.push({ filename, bytes });
    }
  }

  return results;
}

/**
 * Splits a PDF document every N pages
 */
export async function splitPdfEveryNPages(
  srcBuffer: ArrayBuffer,
  baseName: string,
  pagesPerChunk: number
): Promise<{ filename: string; bytes: Uint8Array }[]> {
  const srcDoc = await PDFDocument.load(srcBuffer, { ignoreEncryption: true });
  const total = srcDoc.getPageCount();
  const ranges: { start: number; end: number; label: string }[] = [];

  let chunkIndex = 1;
  for (let p = 1; p <= total; p += pagesPerChunk) {
    const end = Math.min(total, p + pagesPerChunk - 1);
    ranges.push({
      start: p,
      end,
      label: `جزء_${chunkIndex}_(صفحات_${p}_إلى_${end})`,
    });
    chunkIndex++;
  }

  return await splitPdfByRanges(srcBuffer, baseName, ranges);
}

/**
 * Splits catalog PDF pages by product category
 */
export async function splitPdfByCategories(
  srcBuffer: ArrayBuffer,
  baseName: string,
  categoryPageMap: { category: string; pages: number[] }[]
): Promise<{ filename: string; bytes: Uint8Array }[]> {
  const srcDoc = await PDFDocument.load(srcBuffer, { ignoreEncryption: true });
  const total = srcDoc.getPageCount();
  const results: { filename: string; bytes: Uint8Array }[] = [];

  for (const item of categoryPageMap) {
    if (item.pages.length === 0) continue;
    const subDoc = await PDFDocument.create();
    const indices = item.pages
      .map((p) => p - 1)
      .filter((i) => i >= 0 && i < total);

    if (indices.length > 0) {
      const copied = await subDoc.copyPages(srcDoc, indices);
      copied.forEach((p) => subDoc.addPage(p));
      const bytes = await subDoc.save();
      const safeCatName = item.category.replace(/[/\\?%*:|"<>]/g, '_');
      results.push({
        filename: `${baseName}_قسم_${safeCatName}.pdf`,
        bytes,
      });
    }
  }

  return results;
}

/**
 * Zips an array of binary PDF files and triggers automatic download in browser
 */
export async function zipFilesAndDownload(
  files: { filename: string; bytes: Uint8Array }[],
  zipFilename: string
): Promise<void> {
  if (files.length === 0) {
    throw new Error('لا توجد ملفات لتنزيلها.');
  }

  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.filename, f.bytes);
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
