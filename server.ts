import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Parse port and host from CLI args or env
const args = process.argv.slice(2);
let port = Number(process.env.PORT) || 3000;
let host = '0.0.0.0';

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
    const p = parseInt(args[i + 1], 10);
    if (!isNaN(p)) port = p;
    i++;
  } else if ((args[i] === '--host' || args[i] === '-h') && args[i + 1]) {
    host = args[i + 1];
    i++;
  }
}

app.use(express.json({ limit: '50mb' }));

const DEFAULT_PRIMARY_MODEL = 'gemini-4-hydrogen';

function normalizeGeminiModel(raw?: string): string {
  const m = (raw || '').trim();
  if (
    !m ||
    m === 'gemini-3.8-flash' ||
    /^gemini-1\./i.test(m) ||
    /^gemini-2\./i.test(m) ||
    /^gemini-pro$/i.test(m)
  ) {
    return DEFAULT_PRIMARY_MODEL;
  }
  return m;
}

// Helper to get Gemini client strictly from server environment secret
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('لم يتم العثور على مفتاح GEMINI_API_KEY في متغيرات الخادم (Secrets).');
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// مهلة 45 ثانية على طلب Gemini في السيرفر لمنع التعليق
async function generateContentWithTimeout(ai: any, params: any, timeoutMs = 45000) {
  let timer: any;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err: any = new Error('تجاوز الطلب مهلة 45 ثانية بسبب ضغط مؤقت على خوادم الموديل.');
      err.isTimeout = true;
      err.status = 503;
      reject(err);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      ai.models.generateContent(params),
      timeoutPromise,
    ]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// حساب الوقت المتبقي حتى منتصف الليل بتوقيت America/Los_Angeles للحصة اليومية
function getSecondsUntilPacificMidnight(): { seconds: number; waitTextArabic: string } {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const partObj: Record<string, string> = {};
    for (const p of parts) {
      partObj[p.type] = p.value;
    }
    const hour = parseInt(partObj.hour || '0', 10) % 24;
    const minute = parseInt(partObj.minute || '0', 10);
    const second = parseInt(partObj.second || '0', 10);

    const currentSeconds = hour * 3600 + minute * 60 + second;
    const remainingSeconds = Math.max(86400 - currentSeconds, 60);

    const totalHours = Math.floor(remainingSeconds / 3600);
    const totalMins = Math.floor((remainingSeconds % 3600) / 60);

    let waitTextArabic = '';
    if (totalHours > 0) {
      waitTextArabic = totalMins > 0 ? `${totalHours} ساعة و ${totalMins} دقيقة` : `${totalHours} ساعة`;
    } else {
      waitTextArabic = `${totalMins} دقيقة`;
    }

    return { seconds: remainingSeconds, waitTextArabic };
  } catch {
    return { seconds: 86400, waitTextArabic: 'عدة ساعات (حتى منتصف الليل)' };
  }
}

// فحص أخطاء بطلان المفتاح (400 مع خطأ مفتاح، 401، 403، غير صالح، معطل)
function isInvalidKeyError(error: any): boolean {
  const status = error?.status;
  const msg = (error?.message || String(error)).toLowerCase();
  if (status === 401 || status === 403) return true;
  if (status === 400 && (msg.includes('api_key') || msg.includes('api key') || msg.includes('invalid argument'))) return true;
  return (
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('api_key_service_blocked') ||
    msg.includes('invalid api key') ||
    msg.includes('permission_denied') ||
    msg.includes('key expired')
  );
}

// اختبار مفتاح الخادم بطلب خفيف (قائمة الموديلات فقط وليس توليد)
async function testServerKey(res: any) {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        isInvalidKey: true,
        error: 'لم يتم العثور على GEMINI_API_KEY في متغيرات الخادم.',
        friendlyMessage: 'مفتاح GEMINI_API_KEY غير مُضاف في إعدادات البيئة (Secrets) على الخادم.',
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const list = await ai.models.list({ config: { pageSize: 2 } });
    let count = 0;
    for await (const _ of list) {
      count++;
      if (count >= 1) break;
    }

    return res.json({
      success: true,
      message: 'اتصال الخادم بـ Gemini API يعمل بشكل سليم ✅',
    });
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    const isInvalid = isInvalidKeyError(error);
    const { isDailyQuota, waitTextArabic } = parseQuotaAndDelay(error);

    let friendlyMessage = `فشل اختبار الاتصال: ${errorMsg}`;
    if (isInvalid) {
      friendlyMessage = 'مفتاح GEMINI_API_KEY على الخادم غير صالح أو منتهي الصلاحية.';
    } else if (isDailyQuota) {
      friendlyMessage = `الحصة اليومية لمفتاح الخادم قد نفدت (ستتجدد بعد ${waitTextArabic}).`;
    }

    return res.status(isInvalid ? 401 : isDailyQuota ? 429 : 500).json({
      success: false,
      isInvalidKey: isInvalid,
      isDailyQuota,
      error: errorMsg,
      friendlyMessage,
    });
  }
}

// فحص أخطاء الضغط المؤقت (503، UNAVAILABLE، high demand، المهلة)
function isOverloadedError(error: any): boolean {
  if (error?.isTimeout) return true;
  const status = error?.status;
  if (status === 503 || status === 504) return true;
  const msg = (error?.message || String(error)).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('مهلة 45 ثانية') ||
    msg.includes('deadline exceeded')
  );
}

// API Health & Config check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasServerKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5),
  });
});

// Test key endpoints (POST and GET) - tests server GEMINI_API_KEY only
app.post('/api/gemini/test-key', async (_req, res) => {
  return testServerKey(res);
});

app.get('/api/gemini/test-key', async (_req, res) => {
  return testServerKey(res);
});

// Extract products from a single full page (scale 2) or pairs (max 2)
app.post('/api/gemini/extract-products', async (req, res) => {
  try {
    const {
      imageBase64,
      images, // قائمة صور (بحد أقصى 2 صفحة)
      mimeType = 'image/jpeg',
      pageNumber = 1,
      totalPages = 1,
      isRetry = false,
      catalogMode = 'supplier',
    } = req.body;
    const targetModel = normalizeGeminiModel(req.headers['x-gemini-model'] as string | undefined);

    const pageImages: { base64: string; mime: string; pageNum: number }[] = [];
    if (Array.isArray(images) && images.length > 0) {
      const capped = images.slice(0, 2);
      for (const img of capped) {
        if (img.imageBase64) {
          pageImages.push({
            base64: img.imageBase64,
            mime: img.mimeType || mimeType,
            pageNum: img.pageNumber || pageNumber,
          });
        }
      }
    } else if (imageBase64) {
      pageImages.push({
        base64: imageBase64,
        mime: mimeType,
        pageNum: pageNumber,
      });
    }

    if (pageImages.length === 0) {
      return res.status(400).json({
        error: 'لم يتم إرسال صورة الصفحة للتحليل.',
      });
    }

    const ai = getGeminiClient();

    const isMultiplePages = pageImages.length > 1;
    const pageNumbersStr = pageImages.map((p) => p.pageNum).join(' و ');
    const isReadyCatalog = catalogMode === 'ready_catalog';

    const prompt = `
أنت خبير تقني دقيق جداً في قراءة وتحليل قوائم وكتالوجات أسعار إكسسوارات الموبايل (كتالوجات START أو أي كتالوج أسعار بيع/جملة مصمم مسبقاً).
أمامك صورة ${isMultiplePages ? `صفحتين (${pageNumbersStr})` : `صفحة (${pageNumber})`} من الكتالوج بدقة عالية (إجمالي صفحات الملف ${totalPages}).

المطلوب:
1. استخرج عنوان القسم الرئيسي الموجود أعلى الصفحة أو شريط القسم فوق الكروت في حقل "section_title" (مثل: "مجموعة كابلات ستارت" أو "ايربودز" أو "شواحن").
2. إذا كانت الصفحة صفحة غلاف فقط أو شروط ضمان بدون أي كروت منتجات وأسعار، أرجع مصفوفة منتجات فارغة products: [].

قواعد هامة جداً لاستخراج كروت المنتجات:
${isReadyCatalog ? `- هذا كتالوج جاهز تم إعداده مسبقاً: قد تكون الكروت داخل شبكة من 2 أو 3 أو 4 أعمدة، وبكل كارت صورة منتج (في مربع أو إطار علوي أو دائري)، واسم المنتج، وسعره (مثل "سعر البيع: 420 ج.م" أو "420 ج.م" أو رقم السعر)، وقد يوجد كود الصنف وتصنيفه أسفل الكارت. استخرج السعر المكتوب في الكارت كرقم خالص في حقل "wholesale_price".` : `- في كل كارت: قد تكون صورة المنتج داخل إطار دائري (وكلمة أو شعار START فوقها) أو داخل مربع منتظم، واسم المنتج وموديله وسعره تحته. استخرج السعر المكتوب في حقل "wholesale_price".`}
- حدد رقم ترتيب الكارت في الصفحة في حقل "card_index" (1, 2, 3...).
${isMultiplePages ? '- حدد رقم الصفحة التابع لها كل منتج في حقل "page_number".' : ''}
- مربع حدود صورة المنتج "box_2d":
  اطلب مصفوفة من 4 أرقام [ymin, xmin, ymax, xmax] بقيم من 0 إلى 1000 للصورة الفوتوغرافية للمنتج فقط داخل الكارت.
  ممنوع تماماً أن يتضمن المربع كلمة START أو أي نصوص أو عناوين من فوق الصورة، وممنوع أن يتضمن اسم المنتج أو السعر من تحتها.
  يجب أن يكون حجم الصورة كافياً وواضحاً (على الأقل 8% من أبعاد الصفحة).

- التصنيف (category) يجب أن يكون حصراً واحداً من هذه الخيارات الـ 11:
  ["ايربودز", "ميك", "قلم", "هيدفون", "هاند فري", "شاحن حيطة", "رأس شاحن", "شاحن سيارة", "كابل", "باوربانك", "متنوعة"]
  قاعدة إلزامية: إذا كان اسم المنتج أو الكارت يحتوي على "مايك" أو "ميك" أو "مايكات" أو "Microphone"، فإن التصنيف (category) يجب أن يكون "ميك" ولا تضعه أبداً في "متنوعة" أو "أخرى".

- كروت الأسعار المتعددة (مهم جداً):
  إذا كان الكارت يحتوي على سعرين أو أكثر لتوصيلات أو مقاسات مختلفة (مثل "شاحن ST102: MICRO 68 / TC 70" أو كابل Micro / Type-C):
  أنشئ لكل سعر صنفاً منفصلاً تماماً في مصفوفة المنتجات، كلاهما يشترك في نفس box_2d ونفس card_index:
  * الصنف الأول: name: "شاحن ST102 ميكرو", model: "ST102 Micro", wholesale_price: 68
  * الصنف الثاني: name: "شاحن ST102 تايب سي", model: "ST102 Type-C", wholesale_price: 70

- تصحيح الأخطاء المطبعية واللغة:
  * صحح الحروف المقلوبة إن وجدت (مثل "حنشاراس" -> "شاحن رأس").
  * صحح سعات الباوربانك الخاطئة مطبعياً (مثل ST-ES01 المكتوب 1000mah اكتبه 10000mAh، و ST-ES03 المكتوب 3000mah اكتبه 30000mAh).
  * صحح كلمة "MICRI" إلى "Micro USB".
${isRetry ? '- تنبيه إعادة محاولة: تأكد من دقة وحجم مربع الصورة box_2d بحيث يغطي الصورة الفوتوغرافية بالكامل دون أن يكون صغيراً جداً.' : ''}
`;

    const contents: any[] = [];
    for (const pImg of pageImages) {
      contents.push({
        inlineData: {
          mimeType: pImg.mime,
          data: pImg.base64,
        },
      });
    }
    contents.push({ text: prompt });

    const response = await generateContentWithTimeout(
      ai,
      {
        model: targetModel,
        contents,
        config: {
          systemInstruction: 'أنت محلل بيانات متخصص في قراءة صفحات قوائم أسعار إكسسوارات الموبايل بدقة وبشكل شامل لكل صفحة.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            description: 'بيانات الصفحة وعنوان القسم والمنتجات المعروضة فيها',
            properties: {
              section_title: {
                type: Type.STRING,
                description: 'عنوان القسم أعلى الصفحة إن وجد (مثل مجموعة كابلات ستارت)',
              },
              is_cover_page: {
                type: Type.BOOLEAN,
                description: 'هل الصفحة مجرد غلاف أو شعار بدون منتجات',
              },
              products: {
                type: Type.ARRAY,
                description: 'قائمة المنتجات المستخرجة من الصفحة',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    card_index: {
                      type: Type.INTEGER,
                      description: 'ترتيب الكارت في الصفحة (1, 2, 3...)',
                    },
                    page_number: {
                      type: Type.INTEGER,
                      description: 'رقم الصفحة التي وجد بها المنتج',
                    },
                    code: { type: Type.STRING, description: 'كود المنتج' },
                    name: { type: Type.STRING, description: 'اسم المنتج التجاري المصحح' },
                    category: {
                      type: Type.STRING,
                      description: 'واحد من: ايربودز، ميك، قلم، هيدفون، هاند فري، شاحن حيطة، رأس شاحن، شاحن سيارة، كابل، باوربانك، متنوعة',
                    },
                    group: { type: Type.STRING, description: 'المجموعة أو الماركة' },
                    model: { type: Type.STRING, description: 'الموديل أو التوصيلة' },
                    specification: { type: Type.STRING, description: 'المواصفة والسعة الصحيحة' },
                    wholesale_price: { type: Type.NUMBER, description: 'سعر الجملة كرقم فقط' },
                    available_models: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: 'الموديلات المتاحة',
                    },
                    box_2d: {
                      type: Type.ARRAY,
                      items: { type: Type.INTEGER },
                      description: '[ymin, xmin, ymax, xmax] من 0 إلى 1000 للصورة الفوتوغرافية فقط',
                    },
                  },
                  required: ['card_index', 'name', 'category', 'wholesale_price'],
                },
              },
            },
            required: ['products'],
          },
        },
      },
      45000
    );

    const responseText = (response.text ?? '{}').trim();
    let parsedData: any = {};
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      const jsonStart = responseText.indexOf('{');
      const jsonEnd = responseText.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        try {
          parsedData = JSON.parse(responseText.slice(jsonStart, jsonEnd + 1));
        } catch {
          parsedData = { products: [] };
        }
      }
    }

    const sectionTitle = sanitizeMarketingText(parsedData.section_title || '');
    const rawProducts = Array.isArray(parsedData.products) ? parsedData.products : [];
    const sanitizedProducts = rawProducts.map((p: any) => ({
      ...p,
      page_number: p.page_number || pageNumber,
      name: sanitizeMarketingText(p.name || ''),
      model: sanitizeModelText(p.model || ''),
      specification: sanitizeMarketingText(p.specification || ''),
      wholesale_price: cleanPriceNumber(p.wholesale_price) || 0,
      group: sanitizeMarketingText(p.group || ''),
      box_2d: sanitizeBox2d(p.box_2d),
    }));

    // استخراج معلومات استهلاك التوكن لتوثيقها ومتابعة الميزانية
    const usage = response.usageMetadata
      ? {
          input_tokens: response.usageMetadata.promptTokenCount || 0,
          output_tokens: response.usageMetadata.candidatesTokenCount || 0,
          total_tokens: response.usageMetadata.totalTokenCount || 0,
        }
      : { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

    return res.json({
      success: true,
      section_title: sectionTitle,
      is_cover_page: Boolean(parsedData.is_cover_page),
      products: sanitizedProducts,
      pageNumber,
      totalPages,
      model: targetModel,
      usage,
    });
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    const targetModel = normalizeGeminiModel(req.headers['x-gemini-model'] as string | undefined);
    const isInvalidKey = isInvalidKeyError(error);

    if (isInvalidKey) {
      return res.status(401).json({
        success: false,
        isInvalidKey: true,
        isDailyQuota: false,
        isRateLimit: false,
        isOverloaded: false,
        model: targetModel,
        error: errorMsg,
        friendlyMessage: 'مفتاح GEMINI_API_KEY على الخادم غير صالح أو مفقود. يرجى مراجعة أسرار البيئة (Secrets).',
      });
    }

    const { isDailyQuota, isRateLimit, retryAfterSeconds, waitTextArabic, rawDelayString } =
      parseQuotaAndDelay(error);
    const isOverloaded = !isDailyQuota && isOverloadedError(error);

    const status = isDailyQuota || isRateLimit ? 429 : isOverloaded ? 503 : 500;

    let friendlyMessage = `تعذر استخراج بيانات الصفحة: ${errorMsg}`;
    if (isDailyQuota) {
      friendlyMessage = `الحصة اليومية للذكاء الاصطناعي خلصت، كمّل بعد ${waitTextArabic}.`;
    } else if (isOverloaded) {
      friendlyMessage = 'الموديل مضغوط أو استغرق وقتاً طويلاً (أكثر من 45 ثانية). سيتم إعادة المحاولة تلقائياً.';
    } else if (isRateLimit) {
      friendlyMessage = 'ضغط مؤقت على حد الدقيقة، سننتظر ثوانٍ ونعاود المحاولة تلقائياً.';
    }

    return res.status(status).json({
      success: false,
      isInvalidKey: false,
      isOverloaded,
      isRateLimit,
      isQuotaExceeded: isDailyQuota,
      isDailyQuota,
      retryAfterSeconds,
      waitTextArabic,
      rawDelayString,
      model: targetModel,
      error: errorMsg,
      friendlyMessage,
    });
  }
});

// تحليل خطأ الحصة اليومية وحساب فترة الانتظار بدقة
function parseQuotaAndDelay(error: any) {
  const errorMsg = error?.message || String(error);
  const status = error?.status || 500;

  const isPerMinute = Boolean(
    errorMsg.match(/per\s*minute|PerMinute|RPM|TPM/i)
  );

  const isDailyQuota = Boolean(
    !isPerMinute &&
    (
      errorMsg.match(/per\s*day/i) ||
      errorMsg.match(/daily\s*(?:quota|limit)/i) ||
      errorMsg.match(/quota\s*metric\s*.*per\s*day/i) ||
      errorMsg.match(/GenerateRequestsPerDay/i) ||
      (errorMsg.includes('RESOURCE_EXHAUSTED') && (errorMsg.includes('day') || errorMsg.includes('Daily')))
    )
  );

  const isRateLimit = status === 429 || errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED');

  let retryAfterSeconds: number | null = null;
  let rawDelayString = '';

  const hmsMatch = errorMsg.match(/([0-9]+)\s*h\s*([0-9]+)\s*m\s*([0-9]+)?\s*s?/i);
  if (hmsMatch) {
    const hours = parseInt(hmsMatch[1], 10) || 0;
    const mins = parseInt(hmsMatch[2], 10) || 0;
    const secs = parseInt(hmsMatch[3] || '0', 10) || 0;
    retryAfterSeconds = hours * 3600 + mins * 60 + secs;
    rawDelayString = `${hours}h${mins}m${secs}s`;
  }

  if (!retryAfterSeconds) {
    const sMatch = errorMsg.match(/(?:retry(?:Delay)?(?:\s*in|\s*after|[:=\s]*["']?))\s*([0-9]+(?:\.[0-9]+)?)\s*s/i);
    if (sMatch && sMatch[1]) {
      retryAfterSeconds = Math.round(parseFloat(sMatch[1]));
      rawDelayString = `${retryAfterSeconds}s`;
    }
  }

  if (!retryAfterSeconds && Array.isArray(error?.errorDetails)) {
    for (const detail of error.errorDetails) {
      if (detail?.retryDelay) {
        const sMatch = String(detail.retryDelay).match(/([0-9]+)/);
        if (sMatch) {
          retryAfterSeconds = parseInt(sMatch[1], 10);
          rawDelayString = String(detail.retryDelay);
        }
      }
    }
  }

  let waitTextArabic = '';
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    const totalHours = Math.floor(retryAfterSeconds / 3600);
    const totalMins = Math.floor((retryAfterSeconds % 3600) / 60);
    const totalSecs = retryAfterSeconds % 60;

    if (totalHours > 0) {
      waitTextArabic = totalMins > 0 
        ? `${totalHours} ساعة و ${totalMins} دقيقة` 
        : `${totalHours} ساعة`;
    } else if (totalMins > 0) {
      waitTextArabic = `${totalMins} دقيقة`;
    } else {
      waitTextArabic = `${totalSecs} ثانية`;
    }
  }

  // إذا كانت حصة يومية ولم نجد وقتاً محدداً في رسالة الخطأ، نحسب بدقة لمنتصف الليل بتوقيت America/Los_Angeles
  if (isDailyQuota && (!retryAfterSeconds || retryAfterSeconds <= 0)) {
    const pacific = getSecondsUntilPacificMidnight();
    retryAfterSeconds = pacific.seconds;
    waitTextArabic = pacific.waitTextArabic;
  }

  if (isDailyQuota && !waitTextArabic) {
    waitTextArabic = 'عدة ساعات (حتى بداية اليوم التالي بتوقيت كاليفورنيا)';
  }

  return {
    isDailyQuota,
    isRateLimit,
    retryAfterSeconds: retryAfterSeconds || (isDailyQuota ? 86400 : 20),
    waitTextArabic,
    rawDelayString,
  };
}

// Helpers to sanitize text and numbers
function convertArabicIndicDigits(str: string): string {
  if (!str) return '';
  const arabicIndic = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let res = String(str);
  for (let i = 0; i < 10; i++) {
    res = res.replaceAll(arabicIndic[i], String(i));
  }
  return res;
}

function cleanPriceNumber(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return isNaN(val) || val <= 0 ? null : Math.round(val * 100) / 100;
  }
  if (typeof val === 'string') {
    const converted = convertArabicIndicDigits(val);
    const cleaned = converted.replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) || num <= 0 ? null : Math.round(num * 100) / 100;
  }
  return null;
}

function sanitizeMarketingText(str: string): string {
  if (!str) return '';
  return str
    .replace(/(?:أقوى\s*العروض|عرض\s*خاص|أفضل\s*سعر|لفترة\s*محدودة|خصم\s*خاص|تخفيضات\s*كبرى|سعر\s*حارق|الأكثر\s*مبيعاً|بأقل\s*سعر)/gi, '')
    .trim();
}

function sanitizeModelText(str: string): string {
  if (!str) return '';
  const trimmed = str.trim();
  if (
    /^(?:xy-123|xy|model|موديل|مثال|يتم ترك|غير معروف|لا يوجد|n\/a|none)$/i.test(trimmed) ||
    trimmed.includes('يتم ترك هذا فارغاً') ||
    trimmed.includes('مثال')
  ) {
    return '';
  }
  return trimmed;
}

function sanitizeBox2d(raw: any): [number, number, number, number] | undefined {
  if (!Array.isArray(raw) || raw.length !== 4) return undefined;
  const clamp = (n: number) => Math.max(0, Math.min(1000, Math.round(n)));
  const [ymin, xmin, ymax, xmax] = raw.map((n: any) => clamp(Number(n) || 0));
  if (ymin < ymax && xmin < xmax) {
    return [ymin, xmin, ymax, xmax];
  }
  return undefined;
}

// Extract single product details from a standalone product photo (package, box, or card)
app.post('/api/gemini/extract-single-product-image', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    const targetModel = normalizeGeminiModel(req.headers['x-gemini-model'] as string | undefined);

    if (!imageBase64) {
      return res.status(400).json({ error: 'لم يتم إرسال صورة المنتج.' });
    }

    const ai = getGeminiClient();

    const prompt = `
أنت خبير فاحص لصور وعلب إكسسوارات الموبايل (علب كرتونية، صور منتجات فوتوغرافية، ملصقات، إعلانات، كروت أصناف).
قم بتحليل الصورة المرفقة بدقة واستخرج البيانات التالية وفق قواعد حاسمة:

1. السعر المكتوب على الصورة (detected_price و has_multiple_prices):
   - ابحث بدقة عن أي شارة، بادج، دائرة، ملصق، أو مربع مكتوب فيه سعر (مثل: "٩٠ ج"، "١٥ ج.م فقط"، "90 EGP"، "25 LE"، إلخ).
   - حوّل الأرقام المكتوبة بالأرقام العربية (٠، ١، ٢، ٣، ٤، ٥، ٦، ٧، ٨، ٩) إلى أرقام إنجليزية (0، 1، 2، 3، 4، 5، 6، 7، 8، 9).
   - إذا كان هناك سعر واحد واضح ومحدد للمنتج، ضعه في "detected_price" كرقم خالص (مثال: 90 أو 15).
   - إذا كان هناك أكثر من سعر مختلف ظاهر في نفس الصورة، اترك "detected_price" فارغاً (null) وضع "has_multiple_prices: true".
   - إذا لم يوجد أي سعر مكتوب على الصورة، اجعل detected_price: null و has_multiple_prices: false.

2. الموديل (model):
   - خذه فقط إذا كان مكتوباً بوضوح على العلبة أو المنتج نفسه (مثل GT-112، ST102، JR-T03S).
   - إذا لم يكن واضحاً اتركه فارغاً تماماً "".
   - تحذير حاسم: لا تنقل أي نص فيه تعليمات أو أمثلة (مثل "XY-123" أو "يتم ترك هذا فارغاً..." أو "Model") واعتبره ليس بيانات.

3. الاسم والمواصفات (name و specification):
   - name: اسم المنتج التجاري بكلام قصير ومباشر لما هو ظاهر على العلبة فقط (مثال: "شاحن سريع 20 وات PD" أو "سماعة ايربودز لاسلكية").
   - specification: مواصفات تقنية موجزة إن وجدت (مثل: "20W PD", "10000mAh", "1.2m").
   - ممنوع منعاً باتاً كتابة أي جمل تسويقية مثل "أقوى العروض"، "عرض خاص"، "لفترة محدودة"، إلخ.

4. الماركة (brand):
   - حقل منفصل باسم الماركة المكتوب على العلبة أو المنتج (مثل: YISON، JOYROOM، START، ANKER، LDNIO، BASEUS).
   - إن لم تكن الماركة واضحة اتركها فارغة "".

5. القص ومربع الحدود (box_2d و crop_needs_adjustment):
   - box_2d: مصفوفة [ymin, xmin, ymax, xmax] بقيم من 0 إلى 1000 لاقتطاع المنتج الفوتوغرافي نفسه فقط.
   - استبعد تماماً من القص الشارات التي فيها أسعار وشعارات الإعلان والبنرات والشرايط التسويقية.
   - crop_needs_adjustment: ضع true إذا كان المنتج مغطى جزئياً بملصقات/شارات، أو إذا كانت الصورة إعلاناً مزدحماً بدون مكان نظيف لاقتطاع المنتج دون بتر جزء منه. إذا كان المنتج واضحاً وقابلاً للقص بنظافة ضع false.
`;

    const response = await generateContentWithTimeout(
      ai,
      {
        model: targetModel,
        contents: [
          {
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
          { text: prompt },
        ],
        config: {
          systemInstruction: 'أنت فاحص دقيق لصور إكسسوارات الهواتف تستخرج الأسعار والموديلات والقص بدون اختلاق أو عبارات تسويقية.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            description: 'بيانات المنتج والصورة والأسعار المستخرجة',
            properties: {
              name: { type: Type.STRING, description: 'اسم المنتج التجاري القصير المباشر' },
              brand: { type: Type.STRING, description: 'الماركة المكتوبة على العلبة (مثل YISON)' },
              category: {
                type: Type.STRING,
                description: 'واحد من: ايربودز، ميك، قلم، هيدفون، هاند فري، شاحن حيطة، رأس شاحن، شاحن سيارة، كابل، باوربانك، متنوعة',
              },
              model: { type: Type.STRING, description: 'كود الموديل الحقيقي المطبوع فقط إن وجد' },
              specification: { type: Type.STRING, description: 'المواصفة الفنية المباشرة' },
              detected_price: { type: Type.NUMBER, description: 'السعر المقروء بالأرقام الإنجليزية إن وجد وكان سعراً واحداً' },
              has_multiple_prices: { type: Type.BOOLEAN, description: 'هل يوجد أكثر من سعر مختلف على الصورة' },
              box_2d: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
                description: '[ymin, xmin, ymax, xmax] من 0 إلى 1000 لاقتطاع المنتج فقط مستبعداً شارات الأسعار والإعلانات',
              },
              crop_needs_adjustment: {
                type: Type.BOOLEAN,
                description: 'هل الصورة إعلان أو مغطاة جزئياً وتحتاج ضبط القص يدوياً',
              },
            },
            required: ['name', 'category', 'has_multiple_prices', 'crop_needs_adjustment'],
          },
        },
      },
      45000
    );

    const responseText = (response.text ?? '{}').trim();
    let parsed: any = {};
    try {
      parsed = JSON.parse(responseText);
    } catch {
      const jsonStart = responseText.indexOf('{');
      const jsonEnd = responseText.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        try {
          parsed = JSON.parse(responseText.slice(jsonStart, jsonEnd + 1));
        } catch {
          parsed = {};
        }
      }
    }

    // Apply sanitization
    const cleanedName = sanitizeMarketingText(parsed.name || '');
    const cleanedBrand = (parsed.brand || '').trim();
    const cleanedModel = sanitizeModelText(parsed.model || '');
    const cleanedSpec = sanitizeMarketingText(parsed.specification || '');
    const hasMultiplePrices = Boolean(parsed.has_multiple_prices);
    const cleanedPrice = hasMultiplePrices ? null : cleanPriceNumber(parsed.detected_price);

    // Box validation with [0..1000] clamping
    const validBox = sanitizeBox2d(parsed.box_2d);

    const usage = response.usageMetadata
      ? {
          input_tokens: response.usageMetadata.promptTokenCount || 0,
          output_tokens: response.usageMetadata.candidatesTokenCount || 0,
          total_tokens: response.usageMetadata.totalTokenCount || 0,
        }
      : { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

    return res.json({
      success: true,
      model: targetModel,
      usage,
      product: {
        name: cleanedName,
        brand: cleanedBrand,
        category: parsed.category || 'متنوعة',
        model: cleanedModel,
        specification: cleanedSpec,
        detected_price: cleanedPrice,
        has_multiple_prices: hasMultiplePrices,
        box_2d: validBox,
        crop_needs_adjustment: Boolean(parsed.crop_needs_adjustment) || !validBox,
      },
    });
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    const targetModel = normalizeGeminiModel(req.headers['x-gemini-model'] as string | undefined);
    const isInvalidKey = isInvalidKeyError(error);

    if (isInvalidKey) {
      return res.status(401).json({
        success: false,
        isInvalidKey: true,
        isDailyQuota: false,
        isRateLimit: false,
        isOverloaded: false,
        model: targetModel,
        error: errorMsg,
        friendlyMessage: 'مفتاح GEMINI_API_KEY على الخادم غير صالح أو مفقود. يرجى مراجعة أسرار البيئة (Secrets).',
      });
    }

    const { isDailyQuota, isRateLimit, retryAfterSeconds, waitTextArabic, rawDelayString } =
      parseQuotaAndDelay(error);
    const isOverloaded = !isDailyQuota && isOverloadedError(error);

    const status = isDailyQuota || isRateLimit ? 429 : isOverloaded ? 503 : 500;

    let friendlyMessage = `تعذر قراءة الصورة: ${errorMsg}`;
    if (isDailyQuota) {
      friendlyMessage = `الحصة اليومية للمفتاح خلصت، كمّل بعد ${waitTextArabic}.`;
    } else if (isOverloaded) {
      friendlyMessage = 'الموديل مضغوط أو استغرق وقتاً طويلاً (أكثر من 45 ثانية). سيتم إعادة المحاولة تلقائياً.';
    } else if (isRateLimit) {
      friendlyMessage = 'ضغط مؤقت على خدمة Gemini، سننتظر ثانية ونحاول مجدداً.';
    }

    return res.status(status).json({
      success: false,
      isInvalidKey: false,
      isOverloaded,
      isRateLimit,
      isQuotaExceeded: isDailyQuota,
      isDailyQuota,
      retryAfterSeconds,
      waitTextArabic,
      rawDelayString,
      model: targetModel,
      error: errorMsg,
      friendlyMessage,
    });
  }
});

// Setup Vite middleware in dev or static serving in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, host, () => {
    console.log(`  ➜  Local:   http://localhost:${port}/`);
    console.log(`  ➜  Network: http://${host}:${port}/`);
    console.log(`Server listening on http://${host}:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
