import * as pdfjsLib from 'pdfjs-dist';
import { PageImageItem } from '../types';
import { loadImage } from './imageCropper';

// Configure PDF.js worker dynamically matching the exact installed pdfjs-dist version (4.10.38)
try {
  const version = pdfjsLib.version || '4.10.38';
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
  console.log(`[PDF.js] Library version: ${pdfjsLib.version}, Worker: ${pdfjsLib.GlobalWorkerOptions.workerSrc}`);
} catch (e) {
  console.warn('PDF.js worker initialization notice:', e);
}

/**
 * Loads a PDF document and returns the proxy instance
 */
export async function loadPdfDocument(fileOrData: File | Blob | ArrayBuffer | Uint8Array): Promise<any> {
  let arrayBuffer: ArrayBuffer;
  if (fileOrData instanceof File || fileOrData instanceof Blob) {
    arrayBuffer = await fileOrData.arrayBuffer();
  } else if (fileOrData instanceof Uint8Array) {
    arrayBuffer = fileOrData.buffer as ArrayBuffer;
  } else {
    arrayBuffer = fileOrData;
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/cmaps/`,
    cMapPacked: true,
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
  // User instruction: scale 2 exactly
  const viewport = page.getViewport({ scale: 2.0 });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d')!;

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

  return {
    pageNumber: pageNum,
    totalPages: pdfDoc.numPages,
    dataUrl,
    base64Data,
    mimeType: 'image/jpeg',
    width: canvas.width,
    height: canvas.height,
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
