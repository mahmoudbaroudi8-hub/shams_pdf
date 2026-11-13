export interface CategoryDefinition {
  id: string;
  name: string; // الاسم الداخلي (مثال: 'كابل', 'جراب')
  catalog_title?: string; // عنوان القسم في الكتالوج (مثال: 'مجموعة الكابلات')
  icon?: string; // أيقونة مميزة
  color?: string; // لون مميز للقسم
  order: number; // ترتيب الظهور في الكتالوج
  created_at?: number;
}

export const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  { id: 'cat-airpods', name: 'ايربودز', catalog_title: 'مجموعة السماعات اللاسلكية والايربودز', icon: 'headphones', color: '#0284c7', order: 1 },
  { id: 'cat-mic', name: 'ميك', catalog_title: 'مجموعة المايكات اللاسلكية والسلكية', icon: 'mic', color: '#8b5cf6', order: 2 },
  { id: 'cat-pen', name: 'قلم', catalog_title: 'أقلام اللمس والأجهزة الذكية', icon: 'pen-tool', color: '#ec4899', order: 3 },
  { id: 'cat-headphone', name: 'هيدفون', catalog_title: 'سماعات الرأس والألعاب', icon: 'headphones', color: '#f97316', order: 4 },
  { id: 'cat-handsfree', name: 'هاند فري', catalog_title: 'سماعات الأذن والهاند فري', icon: 'volume-2', color: '#10b981', order: 5 },
  { id: 'cat-wall-charger', name: 'شاحن حيطة', catalog_title: 'شواحن الحائط السريعة', icon: 'zap', color: '#eab308', order: 6 },
  { id: 'cat-charger-head', name: 'رأس شاحن', catalog_title: 'رؤوس الشواحن والـ PD', icon: 'plug', color: '#6366f1', order: 7 },
  { id: 'cat-car-charger', name: 'شاحن سيارة', catalog_title: 'شواحن ولاعة السيارة', icon: 'car', color: '#14b8a6', order: 8 },
  { id: 'cat-cable', name: 'كابل', catalog_title: 'كابلات الشحن ونقل البيانات', icon: 'cable', color: '#3b82f6', order: 9 },
  { id: 'cat-powerbank', name: 'باوربانك', catalog_title: 'بنوك الطاقة والباوربانك', icon: 'battery-charging', color: '#06b6d4', order: 10 },
  { id: 'cat-other', name: 'متنوعة', catalog_title: 'إكسسوارات واستاندات متنوعة', icon: 'folder', color: '#64748b', order: 11 },
];

export const ALL_CATEGORIES: string[] = DEFAULT_CATEGORIES.map((c) => c.name);

export type ProductCategory = string;

export interface PricingTier {
  id: string;
  from: number;
  to: number;
  increase_type: 'fixed' | 'percent';
  value: number;
}

export interface TierTemplate {
  id: string;
  name: string;
  tiers: PricingTier[];
}

export interface StandardMapTier {
  id: string;
  from: number;
  to: number;
  increase: number; // Fixed EGP increase
}

export const DEFAULT_STANDARD_MAP: StandardMapTier[] = [
  { id: 'sm1', from: 0, to: 50, increase: 4 },
  { id: 'sm2', from: 50, to: 100, increase: 7 },
  { id: 'sm3', from: 100, to: 150, increase: 10 },
  { id: 'sm4', from: 150, to: 200, increase: 15 },
  { id: 'sm5', from: 200, to: 250, increase: 20 },
  { id: 'sm6', from: 250, to: 300, increase: 25 },
  { id: 'sm7', from: 300, to: 400, increase: 35 },
  { id: 'sm8', from: 400, to: 500, increase: 45 },
  { id: 'sm9', from: 500, to: 600, increase: 50 },
  { id: 'sm10', from: 600, to: 700, increase: 55 },
  { id: 'sm11', from: 700, to: 800, increase: 60 },
  { id: 'sm12', from: 800, to: 1000, increase: 70 },
  { id: 'sm13', from: 1000, to: 1500, increase: 110 },
  { id: 'sm14', from: 1500, to: 2000, increase: 150 },
  { id: 'sm15', from: 2000, to: 2500, increase: 200 },
  { id: 'sm16', from: 2500, to: 3000, increase: 250 },
  { id: 'sm17', from: 3000, to: 3500, increase: 300 },
  { id: 'sm18', from: 3500, to: 4000, increase: 400 },
];

export interface StandardMapTemplate {
  id: string;
  name: string;
  tiers: StandardMapTier[];
  fallback_percent: number;
}

export type PricingMethodType = 'percent_markup' | 'fixed_add' | 'profit_margin' | 'tiers' | 'standard_map';

export interface PricingRuleConfig {
  method: PricingMethodType;
  percent_markup?: number; // (أ) نسبة زيادة على الجملة
  fixed_add?: number; // (ب) مبلغ ثابت يتضاف على الجملة
  profit_margin?: number; // (ج) نسبة ربح من سعر البيع: الجملة ÷ (1 - النسبة)
  tiers?: PricingTier[]; // (د) شرايح
  standard_map_tiers?: StandardMapTier[]; // الخريطة المعيارية
  standard_map_fallback_percent?: number; // فوق 4000
  rounding: 1 | 5 | 10;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  category: ProductCategory;
  group?: string; // الماركة (Brand)
  model?: string;
  specification?: string;
  wholesale_price: number;
  previous_wholesale_price?: number;
  wholesale_price_history?: { price: number; date: number }[]; // سجل آخر 5 تغييرات لسعر الشراء
  supplier?: string; // المورد التابع له هذا الصنف
  price_changed?: boolean;
  selling_price: number;
  manual_price_set?: boolean; // Flag to indicate if merchant typed price manually
  previous_selling_price_snapshot?: number; // Snapshot before last bulk pricing for undo
  included_in_catalog: boolean;
  available_models?: string[];
  image_url?: string; // Base64 compressed JPEG 400px width
  original_image_url?: string; // Full uncropped image URL for reverting or manual crop
  raw_bounding_box?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
  box_2d?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
  page_number?: number;
  card_index?: number;
  section_title?: string;
  needs_crop_adjustment?: boolean; // علامة: يحتاج ضبط القص
  price_source_note?: string; // 'سعر مقروء من الصورة، راجعه' | 'أسعار متعددة'
  has_multiple_prices?: boolean;
  is_potential_duplicate?: boolean;
  source_file?: string;
  source_slice_id?: string;
  discovered_new_category?: string; // إذا اكتشف الذكاء الاصطناعي نوعاً جديداً غير موجود في قائمة الأقسام
  created_at: number;
  updated_at: number;
}

export type WatermarkType = 'none' | 'center' | 'tiled';

export interface CatalogSettings {
  // Store Identity (Manual)
  company_name: string;
  store_name: string;
  business_bio: string;
  phone: string;
  whatsapp_number: string;
  secondary_phone: string;
  address: string;
  email: string;
  tax_or_cr_number: string;
  footer_note: string;
  catalog_title: string;
  logo_url: string;
  primary_color: string;
  products_per_row: number;
  rows_per_page?: number;
  grid_layout_mode?: 'manual' | 'auto';
  show_available_models: boolean;
  show_specification: boolean;
  show_brand_on_card: boolean; // default: false (off by default)
  show_code?: boolean; // default: true
  show_category?: boolean; // default: true
  show_image?: boolean; // default: true
  price_validity_note?: string; // e.g. "سارية حتى 30 نوفمبر"
  min_profit_margin_percent?: number; // حد أدنى لهامش الربح الافتراضي 10%
  last_backup_date?: number; // تاريخ آخر نسخة احتياطية
  
  // Image price interpretation setting: wholesale (default) or selling
  detected_price_target: 'wholesale' | 'selling';

  // Watermark Settings
  watermark_type: WatermarkType;
  watermark_opacity: number; // 0.03 to 0.15 (3% to 15%)
  watermark_size: number; // size in px (e.g. 150 to 450)

  // Pricing rules configuration
  global_pricing_rule?: PricingRuleConfig;
  category_pricing_rules?: Record<string, PricingRuleConfig>;
  categories?: CategoryDefinition[];
  saved_tier_templates?: TierTemplate[];
  saved_standard_maps?: StandardMapTemplate[];
  current_standard_map?: StandardMapTier[];
  standard_map_fallback_percent?: number;

  // Model Settings (الأساسي والاحتياطي)
  primary_model?: string; // افتراضي: 'gemini-4-hydrogen'
  fallback_model?: string; // افتراضي: 'gemini-3.1-flash-lite'

  // Gemini API Keys & Selection Mode (إدارة مفاتيح API ووضع الاختيار)
  api_keys?: GeminiApiKeyItem[];
  api_key_selection_mode?: ApiKeySelectionMode; // 'manual' | 'auto' (الافتراضي: 'auto')
  active_api_key_id?: string; // المفتاح المختار في الوضع اليدوي

  // Batch Processing & API Cost Settings
  default_batch_size?: number; // افتراضي: 5 صفحات في الدفعة (حفظ النتائج معاً)
  pages_per_request?: 1 | 2; // صفحات في الطلب الواحد لـ Gemini (1 أو 2، الافتراضي 1)
  daily_request_limit?: number; // حد الطلبات اليومي لـ Gemini (افتراضي: 20 طلب)
  gemini_input_cost_per_million_usd?: number; // سعر مليون توكن دخل (افتراضي: $0.10)
  gemini_output_cost_per_million_usd?: number; // سعر مليون توكن خرج (افتراضي: $0.40)
  usd_to_egp_rate?: number; // سعر صرف الدولار مقابل الجنيه (افتراضي: 50.0 ج.م)
  monthly_budget_egp?: number; // الحد الشهري بالجنيه (افتراضي: 500 ج.م)
}

export type ApiKeyStatus = 'active' | 'quota_exhausted' | 'invalid';

export interface GeminiApiKeyItem {
  id: string;
  name: string;
  key: string; // المفتاح السري (يُخزن في المتصفح فقط)
  project?: string; // المشروع على Google للتجميع (اختياري)
  status: ApiKeyStatus;
  quota_reset_at?: number | null; // وقت انتهاء الحصة والتجديد
  quota_reset_text?: string; // نص وقت التجديد
  today_requests_count: number; // عدد طلبات اليوم للمفتاح
  last_used_at?: number;
  enabled: boolean; // تفعيل / تعطيل
}

export type ApiKeySelectionMode = 'manual' | 'auto';

export interface DispatchItemSnapshot {
  code: string;
  name: string;
  category: string;
  selling_price: number;
  wholesale_price: number;
}

export interface DispatchRecord {
  id: string;
  customer_name: string;
  customer_phone: string;
  date: string;
  categories: string[];
  product_count: number;
  items_snapshot: DispatchItemSnapshot[];
  created_at: number;
}

export interface FailedFile {
  id: string;
  filename: string;
  reason: string;
  timestamp: number;
}

export interface PageImageItem {
  pageNumber: number;
  totalPages: number;
  dataUrl: string;
  base64Data: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface PageExtractionReport {
  id: string;
  file_name: string;
  page_number: number;
  section_title: string;
  cards_detected: number;
  products_saved: number;
  is_warning: boolean;
  warning_message?: string;
  timestamp: number;
}

export interface BatchItem {
  batch_index: number;
  page_start: number;
  page_end: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  retry_count: number;
  products_count: number;
  token_usage?: {
    input: number;
    output: number;
    total: number;
  };
  completed_at?: number;
}

export interface BatchSession {
  id: string; // معرف الجلسة
  file_name: string;
  file_size: number;
  file_last_modified?: number; // تاريخ آخر تعديل للكشف الدقيق عن التكرار
  file_id: string; // يشير إلى الملف المخزن في pdf_files store
  total_pages: number;
  batch_size: number;
  batches: BatchItem[];
  supplier_name?: string; // المورد التابع له هذا الملف
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  total_products_extracted: number;
  created_at: number;
  updated_at: number;
}

export interface StoredPdfFile {
  file_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  array_buffer: ArrayBuffer;
  saved_at: number;
}

export interface ApiUsageLog {
  id: string;
  timestamp: number;
  file_name: string;
  batch_number?: number;
  page_number?: number;
  model: string;
  key_name?: string; // اسم المفتاح المستخدم بدلاً من قيمته
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  cost_egp: number;
  success?: boolean; // false إذا كانت المحاولة فاشلة بسبب ضغط أو مهلة
  failure_reason?: string;
}

export interface CatalogSectionHeader {
  id: string;
  title: string;
  subtitle?: string;
  insert_before_product_id?: string; // Product id that this header precedes
  after_product_id?: string; // Product id that this header succeeds
}

export interface SavedCatalog {
  id: string;
  name: string; // e.g. "جملة نوفمبر"
  source_type?: 'builder' | 'uploaded_pdf'; // default 'builder'; 'uploaded_pdf' for externally imported PDFs
  pdf_file_id?: string; // Reference to StoredPdfFile in IndexedDB pdf_files store
  pdf_filename?: string;
  pdf_page_count?: number;
  pdf_size_bytes?: number;
  created_at: number;
  updated_at: number;
  product_ids: string[]; // Selected product IDs in ordered sequence (used directly or as continuation pages for uploaded PDFs)
  manual_headers?: CatalogSectionHeader[];
  auto_category_headers?: boolean; // Default true: header at start of each category

  // Catalog-specific settings (Requirement ب)
  company_name?: string;
  business_bio?: string;
  logo_url?: string;
  phone?: string;
  whatsapp_number?: string;
  price_validity_note?: string; // تاريخ سريان الأسعار
  columns_count?: number; // Custom 1..8 columns (default 4)
  rows_count?: number; // Custom 1..10 rows per page (default 4 for 4 cols, 3 otherwise)
  grid_layout_mode?: 'manual' | 'auto';
  show_code?: boolean; // default true
  show_category?: boolean; // default true
  show_image?: boolean; // default true
  primary_color?: string;
  footer_note?: string;
}

// ---------------------------------------------------------------------------
// Auto-Backup Snapshot (داخل المتصفح - آخر 5 نسخ قبل أي عملية خطيرة)
// ---------------------------------------------------------------------------
export interface AutoBackupSnapshot {
  id: string;
  timestamp: number;
  reason: string; // e.g. "قبل ابدأ من جديد", "قبل حذف جماعي", "قبل استيراد ودمج"
  products_count: number;
  catalogs_count?: number;
  data_json: string;
}

// ---------------------------------------------------------------------------
// Supplier Comparison (مقارنة قائمة المورد الجديدة بالقديمة)
// ---------------------------------------------------------------------------
export type SupplierChangeType = 'new' | 'disappeared' | 'price_increased' | 'price_decreased' | 'margin_dropped' | 'unchanged';

export interface SupplierComparisonItem {
  product_id?: string;
  code: string;
  name: string;
  category: string;
  supplier: string;
  old_wholesale_price: number;
  new_wholesale_price: number;
  diff_amount: number; // بالجنيه
  diff_percent: number; // النسبة المئوية %
  current_selling_price: number;
  suggested_selling_price: number; // اقتراح تطبيق نفس نسبة الربح القديمة
  applied_selling_price: number; // السعر المعتمد بعد التأكيد
  change_type: SupplierChangeType;
  current_margin_percent: number;
  previous_margin_percent: number;
  is_selling_price_updated?: boolean; // علامة: تم التعديل بتأكيد المستخدم
}

// ---------------------------------------------------------------------------
// Catalog Pre-dispatch Audit (شاشة المراجعة قبل الإرسال)
// ---------------------------------------------------------------------------
export type AuditIssueSeverity = 'error' | 'warning';

export interface CatalogAuditIssue {
  id: string;
  product_id: string;
  product_name: string;
  product_code?: string;
  product_image?: string;
  product_category?: string;
  product_wholesale_price?: number;
  product_selling_price?: number;
  severity: AuditIssueSeverity;
  type:
    | 'zero_or_missing_selling_price'
    | 'selling_below_wholesale'
    | 'duplicate_code'
    | 'missing_category'
    | 'low_profit_margin'
    | 'missing_image'
    | 'unusual_price_vs_median'
    | 'unread_page_placeholder';
  message: string;
  details?: string;
  ignored?: boolean;
}


