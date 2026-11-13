import { CatalogSettings, CategoryDefinition, DEFAULT_CATEGORIES, Product } from '../types';
import { getStoredPdfFile, logApiUsage, saveProductsBatch } from './db';
import { cropAndCompressProductImage, isBoxValid } from './imageCropper';
import { loadPdfDocument, renderPdfPageToImage } from './pdfExtractor';

export interface PdfConversionProgress {
  currentPage: number;
  totalPages: number;
  extractedCount: number;
  message: string;
}

function resolveExtractedCategory(
  rawCategory: string,
  name: string,
  sectionTitle: string,
  categoriesList?: CategoryDefinition[]
): string {
  const activeCategories =
    categoriesList && categoriesList.length > 0 ? categoriesList : DEFAULT_CATEGORIES;

  const combined = `${name} ${sectionTitle} ${rawCategory}`.toLowerCase();

  if (
    combined.includes('مايك') ||
    combined.includes('ميك') ||
    combined.includes('mic') ||
    combined.includes('مايكات') ||
    combined.includes('microphone')
  ) {
    return 'ميك';
  }
  if (combined.includes('ايربودز') || combined.includes('airpod') || combined.includes('بودز')) {
    return 'ايربودز';
  }
  if (combined.includes('هيدفون') || combined.includes('headphone')) return 'هيدفون';
  if (combined.includes('هاند فري') || combined.includes('هاندفري') || combined.includes('سماعة سلك')) {
    return 'هاند فري';
  }
  if (combined.includes('قلم') || combined.includes('pencil') || combined.includes('stylus')) {
    return 'قلم';
  }
  if (combined.includes('سيارة') || combined.includes('عربية') || combined.includes('ولاعة')) {
    return 'شاحن سيارة';
  }
  if (combined.includes('رأس شاحن') || combined.includes('راس شاحن') || combined.includes('ادابتور')) {
    return 'رأس شاحن';
  }
  if (combined.includes('شاحن') || combined.includes('charger')) return 'شاحن حيطة';
  if (combined.includes('كابل') || combined.includes('cable') || combined.includes('سلك شحن')) {
    return 'كابل';
  }
  if (combined.includes('باوربانك') || combined.includes('باور بانك') || combined.includes('powerbank')) {
    return 'باوربانك';
  }

  const exactMatch = activeCategories.find(
    (c) => c.name.trim().toLowerCase() === (rawCategory || '').trim().toLowerCase()
  );
  if (exactMatch) return exactMatch.name;

  return 'متنوعة';
}

async function extractSinglePageWithRetry(
  pageNumber: number,
  totalPages: number,
  base64Data: string,
  mimeType: string,
  settings: CatalogSettings,
  onStatusUpdate?: (msg: string) => void
): Promise<any> {
  const primaryModel = settings.primary_model || 'gemini-4-hydrogen';
  const fallbackModel = settings.fallback_model || 'gemini-3.1-flash-lite';
  const maxAttempts = 3;
  let lastErrorMsg = `تعذر قراءة صفحة ${pageNumber}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const useFallback = attempt >= 2 && fallbackModel && fallbackModel !== primaryModel;
    const modelToUse = useFallback ? fallbackModel : primaryModel;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-gemini-model': modelToUse,
    };
    if (fallbackModel) {
      headers['x-gemini-fallback-model'] = fallbackModel;
    }

    try {
      const response = await fetch('/api/gemini/extract-products', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          imageBase64: base64Data,
          mimeType,
          pageNumber,
          totalPages,
          isRetry: attempt > 1,
          catalogMode: 'ready_catalog',
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        return data;
      }

      lastErrorMsg =
        data.friendlyMessage || data.error || `تعذر قراءة صفحة ${pageNumber} (${response.status})`;

      const retryable =
        response.status === 429 ||
        response.status === 503 ||
        response.status === 502 ||
        response.status === 504 ||
        response.status === 500;

      if (!retryable || attempt >= maxAttempts) {
        throw new Error(lastErrorMsg);
      }

      const retryWaitSec = Math.min(8, Math.max(2, Number(data.retryAfterSeconds) || attempt * 2));
      onStatusUpdate?.(
        `ضغط مؤقت على الخادم في صفحة ${pageNumber} — إعادة المحاولة (${attempt}/${maxAttempts}) بالنموذج الاحتياطي بعد ${retryWaitSec} ثوانٍ...`
      );
      await new Promise((r) => setTimeout(r, retryWaitSec * 1000));
    } catch (err: any) {
      lastErrorMsg = err?.message || lastErrorMsg;
      if (attempt >= maxAttempts) {
        throw new Error(lastErrorMsg);
      }
      onStatusUpdate?.(
        `إعادة محاولة قراءة صفحة ${pageNumber} (${attempt}/${maxAttempts})...`
      );
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }

  throw new Error(lastErrorMsg);
}

/**
 * Extracts all products and cropped photos from an imported PDF catalog using Gemini Vision,
 * saves each page incrementally into IndexedDB, and returns the created Product list ready to be edited/deleted/priced.
 */
export async function convertPdfCatalogToProducts(
  pdfFileId: string,
  catalogName: string,
  settings: CatalogSettings,
  priceMode: 'selling' | 'wholesale',
  onProgress?: (progress: PdfConversionProgress) => void
): Promise<Product[]> {
  const stored = await getStoredPdfFile(pdfFileId);
  if (!stored || !stored.array_buffer) {
    throw new Error('لم يتم العثور على ملف الـ PDF في التخزين المحلي.');
  }

  const pdfDoc = await loadPdfDocument(stored.array_buffer.slice(0));
  const totalPages = pdfDoc.numPages || 0;
  if (totalPages === 0) {
    throw new Error('ملف الـ PDF لا يحتوي على أي صفحات.');
  }

  const allExtracted: Product[] = [];
  const failedPages: number[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.({
      currentPage: pageNum,
      totalPages,
      extractedCount: allExtracted.length,
      message: `جاري قراءة واستخراج منتجات صفحة ${pageNum} من ${totalPages}...`,
    });

    const pageItem = await renderPdfPageToImage(pdfDoc, pageNum);

    let data: any;
    try {
      data = await extractSinglePageWithRetry(
        pageNum,
        totalPages,
        pageItem.base64Data,
        pageItem.mimeType,
        settings,
        (retryMsg) =>
          onProgress?.({
            currentPage: pageNum,
            totalPages,
            extractedCount: allExtracted.length,
            message: retryMsg,
          })
      );
    } catch (pageErr: any) {
      failedPages.push(pageNum);
      // If we haven't extracted anything yet and page 1 failed outright, abort immediately with the real error
      if (allExtracted.length === 0 && pageNum === totalPages) {
        throw pageErr;
      }
      // If a single page fails mid-way after previous pages succeeded, keep going for remaining pages
      onProgress?.({
        currentPage: pageNum,
        totalPages,
        extractedCount: allExtracted.length,
        message: `تنبيه: تعذر قراءة صفحة ${pageNum}، جاري متابعة باقي الصفحات...`,
      });
      continue;
    }

    if (data.usage) {
      const inputTokens = data.usage.input_tokens || 0;
      const outputTokens = data.usage.output_tokens || 0;
      const inputCostUsd =
        (inputTokens / 1_000_000) * (settings.gemini_input_cost_per_million_usd || 0.1);
      const outputCostUsd =
        (outputTokens / 1_000_000) * (settings.gemini_output_cost_per_million_usd || 0.4);
      const totalCostUsd = inputCostUsd + outputCostUsd;
      const totalCostEgp = totalCostUsd * (settings.usd_to_egp_rate || 50);

      await logApiUsage({
        id: `log_catconv_${Date.now()}_p${pageNum}`,
        timestamp: Date.now(),
        file_name: catalogName,
        page_number: pageNum,
        model: data.model || settings.primary_model || 'gemini-4-hydrogen',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        cost_usd: totalCostUsd,
        cost_egp: totalCostEgp,
      }).catch(() => {});
    }

    const rawProducts: any[] = Array.isArray(data.products) ? data.products : [];
    const sectionTitle: string = data.section_title || '';
    const pageProducts: Product[] = [];

    for (let idx = 0; idx < rawProducts.length; idx++) {
      const item = rawProducts[idx];
      if (!item.name || typeof item.name !== 'string') continue;

      const cleanNum =
        typeof item.wholesale_price === 'number'
          ? item.wholesale_price
          : Number(String(item.wholesale_price || '0').replace(/[^0-9.]/g, '')) || 0;

      const category = resolveExtractedCategory(
        item.category || '',
        item.name,
        sectionTitle,
        settings.categories
      );

      const box = item.box_2d as [number, number, number, number] | undefined;
      const boxOk = isBoxValid(box);

      let croppedImage: string | undefined = undefined;
      if (boxOk && box) {
        croppedImage = await cropAndCompressProductImage(pageItem.dataUrl, box);
      }

      const cardIndex = item.card_index || idx + 1;
      const now = Date.now();

      const product: Product = {
        id: `catpdf_${now}_p${pageNum}_c${cardIndex}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
        code: (item.code || `CAT-P${pageNum}-${cardIndex}`).trim(),
        name: item.name.trim(),
        category,
        group: item.group || '',
        model: item.model || '',
        specification: item.specification || '',
        wholesale_price: priceMode === 'wholesale' ? cleanNum : 0,
        selling_price: priceMode === 'selling' ? cleanNum : 0,
        manual_price_set: priceMode === 'selling' && cleanNum > 0,
        included_in_catalog: true,
        available_models: Array.isArray(item.available_models) ? item.available_models : [],
        image_url: croppedImage,
        box_2d: box,
        raw_bounding_box: box,
        page_number: pageNum,
        card_index: cardIndex,
        section_title: sectionTitle,
        needs_crop_adjustment: !boxOk || !croppedImage,
        source_file: catalogName,
        created_at: now,
        updated_at: now,
      };

      pageProducts.push(product);
      allExtracted.push(product);
    }

    // Incremental save per page so partial progress is never lost
    if (pageProducts.length > 0) {
      await saveProductsBatch(pageProducts);
    }

    onProgress?.({
      currentPage: pageNum,
      totalPages,
      extractedCount: allExtracted.length,
      message: `تم استخراج ${allExtracted.length} صنف حتى صفحة ${pageNum} من ${totalPages}`,
    });

    if (pageNum < totalPages) {
      await new Promise((r) => setTimeout(r, 700));
    }
  }

  if (allExtracted.length === 0) {
    if (failedPages.length > 0) {
      throw new Error(
        `تعذر استخراج المنتجات بسبب فشل الاتصال في الصفحات (${failedPages.join('، ')}). يرجى المحاولة مرة أخرى.`
      );
    }
    throw new Error('لم يتم العثور على كروت منتجات واضحة داخل صفحات هذا الـ PDF.');
  }

  return allExtracted;
}
