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
