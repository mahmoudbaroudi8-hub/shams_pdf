import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PageImageItem } from '../types';
import { loadImage } from './imageCropper';

// Configure PDF.js worker using local Vite-bundled module URL (works 100% offline & in PWAs/iframes)
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
} catch (e) {
  console.warn('PDF.js worker initialization notice:', e);
}

/**
 * Loads a PDF document safely (cloning binary buffer so pdf.js worker never detaches caller data)
 */
export async function loadPdfDocument(
  fileOrData: File | Blob | ArrayBuffer | Uint8Array
): Promise<any> {
  let bytesCopy: Uint8Array;
  if (fileOrData instanceof File || fileOrData instanceof Blob) {
    const ab = await fileOrData.arrayBuffer();
    bytesCopy = new Uint8Array(ab);
  } else if (fileOrData instanceof Uint8Array) {
    bytesCopy = fileOrData.slice();
  } else {
    bytesCopy = new Uint8Array(fileOrData.slice(0));
  }

  const version = pdfjsLib.version || '4.10.38';
  const loadingTask = pdfjsLib.getDocument({
    data: bytesCopy,
    cMapUrl: `https://unpkg.com/pdfjs-dist@${version}/cmaps/`,
    cMapPacked: true,
    useWorkerFetch: false,
    isEvalSupported: false,
  });

  return await loadingTask.promise;
}

/**
 * Converts a specific page of a PDF document to a high-res image (scale: 2)
 * without slicing or overlap.
 */
export async function renderPdfPageToImage(
  pdfDoc: any,
  pageNum: number
): Promise<PageImageItem> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 2.0 });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('تعذر تهيئة لوحة الرسم لعرض صفحة الـ PDF.');
  }

  // Crisp white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx,
    viewport: viewport,
    background: '#ffffff',
  }).promise;

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const base64Data = dataUrl.split(',')[1] || '';
  const width = canvas.width;
  const height = canvas.height;

  canvas.width = 1;
  canvas.height = 1;

  return {
    pageNumber: pageNum,
    totalPages: pdfDoc.numPages,
    dataUrl,
    base64Data,
    mimeType: 'image/jpeg',
    width,
    height,
  };
}

/**
 * Converts an uploaded image file into a PageImageItem (single page representation)
 */
export async function renderImageFileToPageItem(file: File): Promise<PageImageItem> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const dataUrl = e.target?.result as string;
        const img = await loadImage(dataUrl);

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const outDataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const base64Data = outDataUrl.split(',')[1] || '';

        resolve({
          pageNumber: 1,
          totalPages: 1,
          dataUrl: outDataUrl,
          base64Data,
          mimeType: 'image/jpeg',
          width: canvas.width,
          height: canvas.height,
        });
      } catch {
        reject(new Error('تعذر معالجة ملف الصورة المرفوع.'));
      }
    };
    reader.onerror = () => reject(new Error('فشل قراءة الملف.'));
    reader.readAsDataURL(file);
  });
}
