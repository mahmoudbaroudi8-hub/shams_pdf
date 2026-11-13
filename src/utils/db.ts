import {
  Product,
  CatalogSettings,
  DispatchRecord,
  PageExtractionReport,
  PricingTier,
  DEFAULT_STANDARD_MAP,
  DEFAULT_CATEGORIES,
  CategoryDefinition,
  BatchSession,
  StoredPdfFile,
  ApiUsageLog,
  GeminiApiKeyItem,
  SavedCatalog,
  AutoBackupSnapshot,
} from '../types';

const DB_NAME = 'mobile_accessories_catalog_db';
const DB_VERSION = 5; // Incremented for auto_backups internal snapshots

export const DEFAULT_SETTINGS: CatalogSettings = {
  min_profit_margin_percent: 10, // الافتراضي: 10% هامش ربح أدنى للتحذير
  company_name: 'شركة المحترف لإكسسوارات الموبايل',
  store_name: 'المحترف ستور',
  business_bio: 'توزيع وتجارة جميع إكسسوارات الموبايل المعتمدة (شواحن، كابلات، سماعات، باوربانك)',
  phone: '01000000000',
  whatsapp_number: '201000000000',
  secondary_phone: '',
  address: 'شارع التحرير - وسط البلد',
  email: '',
  tax_or_cr_number: '',
  footer_note: 'الأسعار شاملة الضمان وسارية حتى نفاذ الكمية أو تحديث القائمة.',
  catalog_title: 'قائمة أسعار البيع المعتمدة',
  logo_url: '',
  primary_color: '#0284c7', // Sky-600
  products_per_row: 4,
  rows_per_page: 4,
  show_available_models: true,
  show_specification: true,
  show_brand_on_card: false, // Default: OFF (شيل اسم المورد من الكارت)
  detected_price_target: 'wholesale', // 'wholesale' (default) or 'selling'
  categories: DEFAULT_CATEGORIES,
  watermark_type: 'none',
  watermark_opacity: 0.06, // 6%
  watermark_size: 280,
  primary_model: 'gemini-4-hydrogen',
  fallback_model: 'gemini-3.1-flash-lite',
  api_keys: [],
  api_key_selection_mode: 'auto',
  active_api_key_id: '',
  default_batch_size: 5, // 5 صفحات في كل دفعة (حفظ النتائج معاً)
  pages_per_request: 1, // 1 صفحة في الطلب الواحد لـ Gemini (1 أو 2، الافتراضي 1)
  daily_request_limit: 20, // حد الطلبات اليومي (افتراضي 20 طلب)
  gemini_input_cost_per_million_usd: 0.10,
  gemini_output_cost_per_million_usd: 0.40,
  usd_to_egp_rate: 50.0,
  monthly_budget_egp: 500,
  global_pricing_rule: {
    method: 'standard_map',
    standard_map_tiers: DEFAULT_STANDARD_MAP,
    standard_map_fallback_percent: 10,
    rounding: 5,
  },
  current_standard_map: DEFAULT_STANDARD_MAP,
  standard_map_fallback_percent: 10,
  saved_standard_maps: [
    {
      id: 'default_std_map',
      name: 'الخريطة المعيارية الأساسية',
      tiers: DEFAULT_STANDARD_MAP,
      fallback_percent: 10,
    },
  ],
  saved_tier_templates: [
    {
      id: 'default_tiers',
      name: 'شرايح افتراضية للتجربة',
      tiers: [
        { id: 't1', from: 1, to: 50, increase_type: 'fixed', value: 15 },
        { id: 't2', from: 51, to: 150, increase_type: 'fixed', value: 25 },
        { id: 't3', from: 151, to: 300, increase_type: 'fixed', value: 40 },
        { id: 't4', from: 301, to: 1000, increase_type: 'percent', value: 20 },
      ],
    },
  ],
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('products')) {
        const productStore = db.createObjectStore('products', { keyPath: 'id' });
        productStore.createIndex('code', 'code', { unique: false });
        productStore.createIndex('category', 'category', { unique: false });
        productStore.createIndex('updated_at', 'updated_at', { unique: false });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains('dispatches')) {
        const dispatchStore = db.createObjectStore('dispatches', { keyPath: 'id' });
        dispatchStore.createIndex('created_at', 'created_at', { unique: false });
      }

      if (!db.objectStoreNames.contains('processed_files')) {
        db.createObjectStore('processed_files', { keyPath: 'filename' });
      }

      if (!db.objectStoreNames.contains('extraction_reports')) {
        const reportStore = db.createObjectStore('extraction_reports', { keyPath: 'id' });
        reportStore.createIndex('file_name', 'file_name', { unique: false });
        reportStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // New stores in DB_VERSION 3
      if (!db.objectStoreNames.contains('batch_sessions')) {
        const batchStore = db.createObjectStore('batch_sessions', { keyPath: 'id' });
        batchStore.createIndex('file_name', 'file_name', { unique: false });
        batchStore.createIndex('status', 'status', { unique: false });
        batchStore.createIndex('created_at', 'created_at', { unique: false });
      }

      if (!db.objectStoreNames.contains('pdf_files')) {
        db.createObjectStore('pdf_files', { keyPath: 'file_id' });
      }

      if (!db.objectStoreNames.contains('api_usage_logs')) {
        const usageStore = db.createObjectStore('api_usage_logs', { keyPath: 'id' });
        usageStore.createIndex('timestamp', 'timestamp', { unique: false });
        usageStore.createIndex('file_name', 'file_name', { unique: false });
      }

      if (!db.objectStoreNames.contains('catalogs')) {
        const catStore = db.createObjectStore('catalogs', { keyPath: 'id' });
        catStore.createIndex('name', 'name', { unique: false });
        catStore.createIndex('updated_at', 'updated_at', { unique: false });
      }

      if (!db.objectStoreNames.contains('auto_backups')) {
        const backupStore = db.createObjectStore('auto_backups', { keyPath: 'id' });
        backupStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Products operations
export async function getAllProducts(): Promise<Product[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    const request = store.getAll();
    request.onsuccess = () => {
      const results: Product[] = request.result || [];
      results.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveProduct(product: Product): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');
    const request = store.put(product);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export const updateProduct = saveProduct;

export async function saveProductsBatch(products: Product[]): Promise<void> {
  if (products.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');
    for (const product of products) {
      store.put(product);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteProduct(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllProducts(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'processed_files', 'extraction_reports'], 'readwrite');
    tx.objectStore('products').clear();
    tx.objectStore('processed_files').clear();
    tx.objectStore('extraction_reports').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearWorkspaceData(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ['products', 'processed_files', 'extraction_reports', 'batch_sessions', 'pdf_files', 'catalogs'],
      'readwrite'
    );
    tx.objectStore('products').clear();
    tx.objectStore('processed_files').clear();
    tx.objectStore('extraction_reports').clear();
    tx.objectStore('batch_sessions').clear();

    const catReq = tx.objectStore('catalogs').getAll();
    catReq.onsuccess = () => {
      const catalogs: SavedCatalog[] = catReq.result || [];
      const protectedPdfIds = new Set(
        catalogs.map((c) => c.pdf_file_id).filter((id): id is string => Boolean(id))
      );
      const pdfStore = tx.objectStore('pdf_files');
      const keysReq = pdfStore.getAllKeys();
      keysReq.onsuccess = () => {
        const keys = keysReq.result || [];
        for (const key of keys) {
          if (!protectedPdfIds.has(String(key))) {
            pdfStore.delete(key);
          }
        }
      };
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function isDeprecatedGeminiModel(model?: string): boolean {
  const m = (model || '').trim();
  if (!m) return true;
  return (
    m === 'gemini-3.8-flash' ||
    /^gemini-1\./i.test(m) ||
    /^gemini-2\./i.test(m) ||
    /^gemini-pro$/i.test(m)
  );
}

// Settings operations
export async function getSettings(): Promise<CatalogSettings> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const request = store.get('catalog_settings');
    request.onsuccess = async () => {
      let loaded: CatalogSettings = { ...DEFAULT_SETTINGS };
      if (request.result && request.result.value) {
        loaded = { ...DEFAULT_SETTINGS, ...request.result.value };
      }

      if (!loaded.categories || loaded.categories.length === 0) {
        loaded.categories = DEFAULT_CATEGORIES;
      }

      let hadMigration = false;
      if (isDeprecatedGeminiModel(loaded.primary_model)) {
        loaded.primary_model = 'gemini-4-hydrogen';
        hadMigration = true;
      }
      if (isDeprecatedGeminiModel(loaded.fallback_model)) {
        loaded.fallback_model = 'gemini-3.1-flash-lite';
        hadMigration = true;
      }

      if (hadMigration) {
        saveSettings(loaded).catch(() => {});
      }

      resolve(loaded);
    };
    request.onerror = () => resolve(DEFAULT_SETTINGS);
  });
}

export async function saveSettings(settings: CatalogSettings): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    const request = store.put({ key: 'catalog_settings', value: settings });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Dispatches log operations
export async function getAllDispatches(): Promise<DispatchRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dispatches', 'readonly');
    const store = tx.objectStore('dispatches');
    const request = store.getAll();
    request.onsuccess = () => {
      const records: DispatchRecord[] = request.result || [];
      records.sort((a, b) => b.created_at - a.created_at);
      resolve(records);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveDispatch(record: DispatchRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dispatches', 'readwrite');
    const store = tx.objectStore('dispatches');
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteDispatch(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dispatches', 'readwrite');
    const store = tx.objectStore('dispatches');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Processed files tracking
export async function isFileProcessed(filename: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('processed_files', 'readonly');
    const store = tx.objectStore('processed_files');
    const request = store.get(filename);
    request.onsuccess = () => resolve(Boolean(request.result));
    request.onerror = () => resolve(false);
  });
}

export async function markFileProcessed(
  filename: string,
  filesize?: number,
  lastModified?: number
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('processed_files', 'readwrite');
    const store = tx.objectStore('processed_files');
    const request = store.put({
      filename,
      processed_at: Date.now(),
      filesize,
      last_modified: lastModified,
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Extraction Reports operations
export async function getAllExtractionReports(): Promise<PageExtractionReport[]> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('extraction_reports', 'readonly');
    const store = tx.objectStore('extraction_reports');
    const request = store.getAll();
    request.onsuccess = () => {
      const results: PageExtractionReport[] = request.result || [];
      results.sort((a, b) => a.page_number - b.page_number);
      resolve(results);
    };
    request.onerror = () => resolve([]);
  });
}

export async function saveExtractionReport(report: PageExtractionReport): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('extraction_reports', 'readwrite');
    const store = tx.objectStore('extraction_reports');
    const request = store.put(report);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteProductsForPage(fileName: string, pageNumber: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');
    const req = store.getAll();
    req.onsuccess = () => {
      const all: Product[] = req.result || [];
      for (const p of all) {
        if (p.source_file === fileName && p.page_number === pageNumber) {
          store.delete(p.id);
        }
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Batch Sessions operations (المرحلة 1 و 2)
export async function getAllBatchSessions(): Promise<BatchSession[]> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('batch_sessions', 'readonly');
    const store = tx.objectStore('batch_sessions');
    const request = store.getAll();
    request.onsuccess = () => {
      const results: BatchSession[] = request.result || [];
      results.sort((a, b) => b.updated_at - a.updated_at);
      resolve(results);
    };
    request.onerror = () => resolve([]);
  });
}

export async function getBatchSession(id: string): Promise<BatchSession | null> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('batch_sessions', 'readonly');
    const store = tx.objectStore('batch_sessions');
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

export async function saveBatchSession(session: BatchSession): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('batch_sessions', 'readwrite');
    const store = tx.objectStore('batch_sessions');
    const request = store.put({ ...session, updated_at: Date.now() });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteBatchSession(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['batch_sessions', 'pdf_files'], 'readwrite');
    const sessionStore = tx.objectStore('batch_sessions');
    const pdfStore = tx.objectStore('pdf_files');
    const getReq = sessionStore.get(id);
    getReq.onsuccess = () => {
      const session: BatchSession | undefined = getReq.result;
      sessionStore.delete(id);
      if (session?.file_id) {
        pdfStore.delete(session.file_id);
      }
      pdfStore.delete(id);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Find any unfinished session that has incomplete/failed batches
export async function getUnfinishedBatchSession(): Promise<BatchSession | null> {
  const sessions = await getAllBatchSessions();
  const unfinished = sessions.find((s) => {
    if (s.status === 'completed') return false;
    const hasPending = s.batches.some((b) => b.status === 'pending' || b.status === 'failed' || b.status === 'processing');
    return hasPending;
  });
  return unfinished || null;
}

// PDF Raw File Storage (حفظ ملف الـ PDF الأصلي في المتصفح لاسترجاعه والاستكمال)
export async function saveStoredPdfFile(file: StoredPdfFile): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pdf_files', 'readwrite');
    const store = tx.objectStore('pdf_files');
    const request = store.put(file);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getStoredPdfFile(file_id: string): Promise<StoredPdfFile | null> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('pdf_files', 'readonly');
    const store = tx.objectStore('pdf_files');
    const request = store.get(file_id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

export async function deleteStoredPdfFile(file_id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pdf_files', 'readwrite');
    const store = tx.objectStore('pdf_files');
    const request = store.delete(file_id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// API Usage Logs (المرحلة 4: شاشة استهلاك API)
export async function logApiUsage(log: ApiUsageLog): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('api_usage_logs', 'readwrite');
    const store = tx.objectStore('api_usage_logs');
    const request = store.put(log);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAllApiUsageLogs(): Promise<ApiUsageLog[]> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('api_usage_logs', 'readonly');
    const store = tx.objectStore('api_usage_logs');
    const request = store.getAll();
    request.onsuccess = () => {
      const results: ApiUsageLog[] = request.result || [];
      results.sort((a, b) => b.timestamp - a.timestamp);
      resolve(results);
    };
    request.onerror = () => resolve([]);
  });
}

export async function clearApiUsageLogs(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('api_usage_logs', 'readwrite');
    const store = tx.objectStore('api_usage_logs');
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Check if a file with same name, size, and lastModified was already processed (Requirement 3)
export async function findDuplicateProcessedFile(
  fileName: string,
  fileSize: number,
  fileLastModified?: number
): Promise<{ processed: boolean; productsCount: number; date?: string; session?: BatchSession } | null> {
  const sessions = await getAllBatchSessions();
  const matched = sessions.find((s) => {
    const nameMatch = s.file_name === fileName;
    const sizeMatch = Math.abs(s.file_size - fileSize) < 100;
    const dateMatch =
      !fileLastModified || !s.file_last_modified
        ? true
        : Math.abs(s.file_last_modified - fileLastModified) < 2000;
    return nameMatch && sizeMatch && dateMatch;
  });

  if (matched && matched.total_products_extracted > 0) {
    return {
      processed: true,
      productsCount: matched.total_products_extracted,
      date: new Date(matched.updated_at).toLocaleDateString('ar-EG'),
      session: matched,
    };
  }

  // Also check processed_files store
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('processed_files', 'readonly');
    const store = tx.objectStore('processed_files');
    const req = store.get(fileName);
    req.onsuccess = async () => {
      const item = req.result;
      if (item) {
        const sizeMatch = !item.filesize || Math.abs(item.filesize - fileSize) < 100;
        const dateMatch =
          !fileLastModified || !item.last_modified
            ? true
            : Math.abs(item.last_modified - fileLastModified) < 2000;
        if (sizeMatch && dateMatch) {
          const allProds = await getAllProducts();
          const count = allProds.filter((p) => p.source_file === fileName).length;
          return resolve({
            processed: true,
            productsCount: count,
            date: item.processed_at ? new Date(item.processed_at).toLocaleDateString('ar-EG') : 'سابقاً',
          });
        }
      }
      resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

// Full Database Export without any API keys (Requirement 1: ممنوع منعا باتا وضع أي مفاتيح في الملف)
export async function exportDatabaseBackup(): Promise<string> {
  const products = await getAllProducts();
  const settings = await getSettings();
  const dispatches = await getAllDispatches();
  const reports = await getAllExtractionReports();
  const batchSessions = await getAllBatchSessions();
  const apiLogs = await getAllApiUsageLogs();

  // تصفية واستبعاد جميع المفاتيح نهائياً من ملف التصدير لحماية خصوصية وسرية المستخدم
  const sanitizedSettings: CatalogSettings = {
    ...settings,
    api_keys: [],
    active_api_key_id: '',
  };

  const backupData = {
    app: 'mobile_accessories_catalog',
    version: 4,
    exported_at: new Date().toISOString(),
    keys_included: false,
    settings: sanitizedSettings,
    products,
    dispatches,
    reports,
    batchSessions,
    apiLogs,
    catalogs: await getAllCatalogs(),
  };

  // Update last_backup_date in settings
  const updatedSettings: CatalogSettings = {
    ...settings,
    last_backup_date: Date.now(),
  };
  await saveSettings(updatedSettings);

  return JSON.stringify(backupData, null, 2);
}

/**
 * طلب تخزين دائم من المتصفح لضمان عدم مسح البيانات تلقائياً
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      return isPersisted;
    } catch (e) {
      console.warn('Persistent storage request failed:', e);
      return false;
    }
  }
  return false;
}

/**
 * حفظ تلقائي لآخر 5 نسخ داخل المتصفح قبل العمليات الخطيرة (ابدأ من جديد، حذف جماعي، استيراد أو دمج)
 */
export async function createAutoBackupSnapshot(reason: string): Promise<AutoBackupSnapshot> {
  const products = await getAllProducts();
  const catalogs = await getAllCatalogs();
  const settings = await getSettings();
  const dispatches = await getAllDispatches();

  // استبعاد المفاتيح تماماً من أي نسخة
  const sanitizedSettings: CatalogSettings = {
    ...settings,
    api_keys: [],
    active_api_key_id: '',
  };

  const snapshotData = {
    app: 'mobile_accessories_catalog',
    version: 5,
    exported_at: new Date().toISOString(),
    keys_included: false,
    settings: sanitizedSettings,
    products,
    catalogs,
    dispatches,
  };

  const snapshot: AutoBackupSnapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    reason,
    products_count: products.length,
    catalogs_count: catalogs.length,
    data_json: JSON.stringify(snapshotData),
  };

  const db = await openDB();

  // Save new snapshot
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('auto_backups', 'readwrite');
    const store = tx.objectStore('auto_backups');
    const req = store.put(snapshot);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  // Prune older snapshots to keep strictly the newest 5
  await new Promise<void>((resolve) => {
    const tx = db.transaction('auto_backups', 'readwrite');
    const store = tx.objectStore('auto_backups');
    const getAllReq = store.getAll();
    getAllReq.onsuccess = () => {
      const all: AutoBackupSnapshot[] = getAllReq.result || [];
      if (all.length > 5) {
        all.sort((a, b) => b.timestamp - a.timestamp);
        const toDelete = all.slice(5);
        for (const item of toDelete) {
          store.delete(item.id);
        }
      }
      resolve();
    };
    getAllReq.onerror = () => resolve();
  });

  return snapshot;
}

/**
 * قراءة جميع النسخ الاحتياطية التلقائية المحفوظة في المتصفح
 */
export async function getAutoBackupSnapshots(): Promise<AutoBackupSnapshot[]> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('auto_backups', 'readonly');
    const store = tx.objectStore('auto_backups');
    const req = store.getAll();
    req.onsuccess = () => {
      const all: AutoBackupSnapshot[] = req.result || [];
      all.sort((a, b) => b.timestamp - a.timestamp);
      resolve(all);
    };
    req.onerror = () => resolve([]);
  });
}

/**
 * استرجاع قاعدة البيانات من نسخة داخلية في المتصفح
 */
export async function restoreAutoBackupSnapshot(snapshotId: string): Promise<void> {
  const snapshots = await getAutoBackupSnapshots();
  const found = snapshots.find((s) => s.id === snapshotId);
  if (!found) {
    throw new Error('لم يتم العثور على النسخة الاحتياطية المحددة.');
  }

  const parsed = JSON.parse(found.data_json);
  if (!parsed || !Array.isArray(parsed.products)) {
    throw new Error('بيانات النسخة تالفة أو غير صالحة.');
  }

  // Preserve user's current API keys!
  const currentSettings = await getSettings();

  // Clear current products & catalogs
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['products', 'catalogs'], 'readwrite');
    tx.objectStore('products').clear();
    tx.objectStore('catalogs').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Restore products
  await saveProductsBatch(parsed.products);

  // Restore catalogs if any
  if (Array.isArray(parsed.catalogs) && parsed.catalogs.length > 0) {
    for (const cat of parsed.catalogs) {
      await saveCatalog(cat);
    }
  }

  // Restore settings without losing API keys
  if (parsed.settings) {
    const mergedSettings: CatalogSettings = {
      ...parsed.settings,
      api_keys: currentSettings.api_keys || [],
      active_api_key_id: currentSettings.active_api_key_id || '',
    };
    await saveSettings(mergedSettings);
  }
}

export interface ProjectImportAnalysis {
  isValid: boolean;
  error?: string;
  totalImported: number;
  newProducts: Product[];
  duplicateProducts: {
    existing: Product;
    incoming: Product;
    code: string;
    name: string;
    existingSellingPrice: number;
    incomingSellingPrice: number;
    hasPriceDiff: boolean;
  }[];
  dispatchesCount: number;
  reportsCount: number;
  importedCategories: CategoryDefinition[];
  rawBackupData: any;
}

/**
 * تحليل ملف النسخة الاحتياطية قبل الاستيراد ومقارنة الأكواد والأسعار (Requirement 5)
 */
export async function analyzeProjectImport(jsonString: string): Promise<ProjectImportAnalysis> {
  let data: any;
  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error('الملف ليس بصيغة JSON صالحة.');
  }

  if (!data || !Array.isArray(data.products)) {
    throw new Error('الملف المرفوع لا يحتوي على بيانات مشروع أو نسخة احتياطية صالحة لهذا التطبيق.');
  }

  const existingProducts = await getAllProducts();
  const existingCodeMap = new Map<string, Product>();
  for (const p of existingProducts) {
    if (p.code?.trim()) {
      existingCodeMap.set(p.code.trim().toLowerCase(), p);
    }
  }

  const newProducts: Product[] = [];
  const duplicateProducts: ProjectImportAnalysis['duplicateProducts'] = [];

  for (const incoming of data.products) {
    const code = incoming.code?.trim().toLowerCase();
    if (code && existingCodeMap.has(code)) {
      const existing = existingCodeMap.get(code)!;
      duplicateProducts.push({
        existing,
        incoming,
        code: incoming.code || existing.code || '',
        name: incoming.name || existing.name,
        existingSellingPrice: existing.selling_price || 0,
        incomingSellingPrice: incoming.selling_price || 0,
        hasPriceDiff: (existing.selling_price || 0) !== (incoming.selling_price || 0),
      });
    } else {
      newProducts.push(incoming);
    }
  }

  return {
    isValid: true,
    totalImported: data.products.length,
    newProducts,
    duplicateProducts,
    dispatchesCount: Array.isArray(data.dispatches) ? data.dispatches.length : 0,
    reportsCount: Array.isArray(data.reports) ? data.reports.length : 0,
    importedCategories: Array.isArray(data.settings?.categories) ? data.settings.categories : [],
    rawBackupData: data,
  };
}

/**
 * تنفيذ دمج المشروع بكود الصنف مع تطبيق خيار الأسعار للمكرر (Requirement 5)
 * مع ضمان عدم استيراد أي مفاتيح نهائياً وترك مفتاح المستخدم الحالي سليماً (Requirement 1)
 */
export async function executeProjectImportMerge(
  analysis: ProjectImportAnalysis,
  duplicatePriceChoice: 'keep_existing' | 'use_incoming'
): Promise<{ addedCount: number; updatedCount: number; totalCount: number; mergedProducts: Product[]; mergedSettings: CatalogSettings }> {
  const currentSettings = await getSettings();
  const existingProducts = await getAllProducts();

  // 1. تجميع قائمة المنتجات المدمجة
  let mergedProductsList = [...existingProducts];

  // إضافة الأصناف الجديدة
  if (analysis.newProducts.length > 0) {
    mergedProductsList = [...mergedProductsList, ...analysis.newProducts];
  }

  // معالجة الأصناف المكررة حسب اختيار المستخدم
  let updatedCount = 0;
  if (duplicatePriceChoice === 'use_incoming' && analysis.duplicateProducts.length > 0) {
    for (const dup of analysis.duplicateProducts) {
      const idx = mergedProductsList.findIndex((p) => p.id === dup.existing.id);
      if (idx !== -1) {
        mergedProductsList[idx] = {
          ...mergedProductsList[idx],
          selling_price: dup.incoming.selling_price,
          wholesale_price: dup.incoming.wholesale_price || mergedProductsList[idx].wholesale_price,
          name: dup.incoming.name || mergedProductsList[idx].name,
          specification: dup.incoming.specification || mergedProductsList[idx].specification,
          image_url: dup.incoming.image_url || mergedProductsList[idx].image_url,
          price_changed: true,
          updated_at: Date.now(),
        } as any;
        updatedCount++;
      }
    }
  }

  // حفظ الأصناف المدمجة في قاعدة البيانات
  await saveProductsBatch(mergedProductsList);

  // 2. دمج الأقسام والتصنيفات دون تكرار
  const existingCategoryNames = new Set(
    (currentSettings.categories || []).map((c) => c.name.trim().toLowerCase())
  );
  const mergedCategories = [...(currentSettings.categories || [])];
  for (const incCat of analysis.importedCategories) {
    if (!existingCategoryNames.has(incCat.name.trim().toLowerCase())) {
      mergedCategories.push(incCat);
      existingCategoryNames.add(incCat.name.trim().toLowerCase());
    }
  }

  // 3. تحديث الإعدادات مع الحفاظ التام والصارم على مفاتيح API الخاصة بالمستخدم
  const mergedSettings: CatalogSettings = {
    ...currentSettings,
    categories: mergedCategories,
    // الحفاظ الصارم على مفاتيح المستخدم الحالي وعدم استبدالها إطلاقاً
    api_keys: currentSettings.api_keys,
    active_api_key_id: currentSettings.active_api_key_id,
    api_key_selection_mode: currentSettings.api_key_selection_mode,
  };
  await saveSettings(mergedSettings);

  // 4. استيراد السجلات الإضافية كعمليات الإرسال وتقارير الاستخراج
  if (Array.isArray(analysis.rawBackupData.dispatches)) {
    for (const d of analysis.rawBackupData.dispatches) {
      await saveDispatch(d);
    }
  }

  return {
    addedCount: analysis.newProducts.length,
    updatedCount,
    totalCount: mergedProductsList.length,
    mergedProducts: mergedProductsList,
    mergedSettings,
  };
}

// ==========================================
// Saved Catalogs Operations (شاشة كتالوجاتي)
// ==========================================
export async function getAllCatalogs(): Promise<SavedCatalog[]> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('catalogs', 'readonly');
    const store = tx.objectStore('catalogs');
    const request = store.getAll();
    request.onsuccess = () => {
      const results: SavedCatalog[] = request.result || [];
      results.sort((a, b) => b.updated_at - a.updated_at);
      resolve(results);
    };
    request.onerror = () => resolve([]);
  });
}

export async function saveCatalog(catalog: SavedCatalog): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('catalogs', 'readwrite');
    const store = tx.objectStore('catalogs');
    const request = store.put(catalog);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteCatalog(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['catalogs', 'pdf_files'], 'readwrite');
    const catStore = tx.objectStore('catalogs');
    const pdfStore = tx.objectStore('pdf_files');
    const getReq = catStore.get(id);
    getReq.onsuccess = () => {
      const cat: SavedCatalog | undefined = getReq.result;
      catStore.delete(id);
      if (cat?.pdf_file_id) {
        pdfStore.delete(cat.pdf_file_id);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

