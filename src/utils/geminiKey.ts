// مفتاح Gemini الخاص بالجهاز: بيتخزن في المتصفح (localStorage) على الجهاز ده بس،
// وبيتبعت للسيرفر في هيدر x-gemini-api-key مع كل طلب ذكاء اصطناعي.
const STORAGE_KEY = 'device_gemini_api_key';
const CHANGE_EVENT = 'device-gemini-key-changed';

export function getDeviceGeminiKey(): string {
  try {
    return (localStorage.getItem(STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setDeviceGeminiKey(key: string): void {
  try {
    const k = key.trim();
    if (k) localStorage.setItem(STORAGE_KEY, k);
    else localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* التخزين غير متاح */
  }
}

export function clearDeviceGeminiKey(): void {
  setDeviceGeminiKey('');
}

export function onDeviceGeminiKeyChange(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}

// بيضيف المفتاح تلقائيًا لأي طلب رايح على /api/gemini/ من غير ما نعدل كل مكان بيبعت طلب
export function installGeminiKeyInjector(): void {
  if (typeof window === 'undefined' || (window as any).__geminiKeyInjected) return;
  (window as any).__geminiKeyInjected = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      const key = getDeviceGeminiKey();
      if (key && url.includes('/api/gemini/')) {
        const headers = new Headers(
          init?.headers || (input instanceof Request ? input.headers : undefined)
        );
        headers.set('x-gemini-api-key', key);
        return originalFetch(input, { ...init, headers });
      }
    } catch {
      /* لو حصل أي خطأ نكمل الطلب العادي */
    }
    return originalFetch(input, init);
  };
}
