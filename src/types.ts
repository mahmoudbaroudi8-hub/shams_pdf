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
  rounding: 0 | 1 | 5 | 10; // 0 = بدون تقريب (يقبل الكسور مثل 7.5 و 13)
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
export type WatermarkLayer = 'back' | 'front';
export type WatermarkPosition =
  | 'center'
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'bottom-center';
export type HeaderLogoPosition = 'right' | 'center' | 'left' | 'hidden';
export type HeaderLogoShape = 'rounded' | 'circle' | 'clean';
export type HeaderLogoBg = 'white' | 'transparent' | 'primary_tint';
export type CardLogoPosition =
  | 'top-right'
  | 'top-center'
  | 'top-left'
  | 'center'
  | 'bottom-right'
  | 'bottom-left';
export type CardLogoShape = 'clean' | 'rounded' | 'circle' | 'pill';

export interface CompanyPhoneItem {
  id: string;
  label?: string;
  number: string;
  visible: boolean;
  is_whatsapp?: boolean;
}

export interface CatalogSettings {
  // Store Identity (Manual)
  company_name: string;
  store_name: string;
  business_bio: string;
  phone: string;
  whatsapp_number: string;
  secondary_phone: string;
  extra_phones?: CompanyPhoneItem[];
  address: string;
  email: string;
  tax_or_cr_number: string;
  footer_note: string;
  catalog_title: string;
  show_company_name?: boolean;
  show_business_bio?: boolean;
  show_catalog_title?: boolean;
  show_price_validity?: boolean;
  show_phone?: boolean;
  show_whatsapp?: boolean;
  show_secondary_phone?: boolean;
  show_address?: boolean;
  show_email?: boolean;
  show_tax_or_cr?: boolean;
  show_footer_note?: boolean;
  logo_url: string;
  header_logo_position?: HeaderLogoPosition; // default: 'right'
  header_logo_size?: number; // 36..180 px (default 88)
  header_logo_shape?: HeaderLogoShape; // default: 'rounded'
  header_logo_bg?: HeaderLogoBg; // default: 'white'
  header_logo_border?: boolean; // default: true
  header_logo_padding?: number; // 0..16 px (default 4)
  header_logo_spacing?: number; // 0..48 px distance from text/edge (default 14)
  header_logo_offset_x?: number; // -60..60 px
  header_logo_offset_y?: number; // -40..40 px
  header_logo_rotation?: number; // -45..45 deg
  header_logo_opacity?: number; // 0.2..1.0
  header_logo_fit?: 'contain' | 'cover'; // default: 'contain'
  primary_color: string;
  products_per_row: number;
  rows_per_page?: number;
  grid_layout_mode?: 'manual' | 'auto';
  grid_symmetry?: GridSymmetryMode;
  show_available_models: boolean;
  show_specification: boolean;
  show_brand_on_card: boolean; // default: false (off by default)
  show_code?: boolean; // default: true
  show_category?: boolean; // default: true
  show_image?: boolean; // default: true
  group_by_category?: boolean; // تقسيم العناصر حسب الأقسام في الكتالوج PDF
  section_header_config?: CatalogSectionHeaderConfig; // خصائص وتعديلات عناوين الأقسام
  card_config?: CatalogCardConfig; // خصائص تصميم الكارت: الشكل، العرض، والألوان
  price_validity_note?: string; // e.g. "سارية حتى 30 نوفمبر"
  min_profit_margin_percent?: number; // حد أدنى لهامش الربح الافتراضي 10%
  last_backup_date?: number; // تاريخ آخر نسخة احتياطية
  
  // Image price interpretation setting: wholesale (default) or selling
  detected_price_target: 'wholesale' | 'selling';

  // Watermark & Floating Logo Layer Settings
  watermark_type: WatermarkType;
  watermark_layer?: WatermarkLayer; // 'back' (تحت المنتجات) | 'front' (فوق المنتجات)
  watermark_position?: WatermarkPosition; // position for single logo overlay
  watermark_offset_x?: number; // -50..50 %
  watermark_offset_y?: number; // -50..50 %
  watermark_rotation?: number; // -45..45 deg
  watermark_opacity: number; // 0.03 to 1.0 (3% to 100%)
  watermark_size: number; // size in px (e.g. 60 to 650)
  watermark_gap?: number; // 60..240 % spacing in tiled mode (default 100)

  // Pricing rules configuration
  allow_price_fractions?: boolean; // السماح بالكسور العشرية وأرقام الفكة في أسعار البيع
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

export type SectionHeaderStyle = 'line_divider' | 'solid_bar' | 'tinted_box' | 'underline';
export type SectionHeaderAlign = 'center' | 'right' | 'left';
export type SectionHeaderWidth = 'full' | 'half';
export type SectionHeaderSize = 'sm' | 'md' | 'lg';
export type SectionHeaderColorMode = 'primary' | 'category' | 'custom';
export type SectionHeaderTextColorMode = 'auto' | 'dark' | 'white' | 'accent';

export interface CategorySectionOverride {
  title?: string;
  subtitle?: string;
  color?: string;
  hidden?: boolean;
  hide_header?: boolean;
  order?: number;
  sort_products?: 'default' | 'price_asc' | 'price_desc' | 'name';
  page_break_before?: boolean;
}

export interface CatalogSectionHeaderConfig {
  style: SectionHeaderStyle;
  align: SectionHeaderAlign;
  width: SectionHeaderWidth;
  size: SectionHeaderSize;
  color_mode: SectionHeaderColorMode;
  custom_color?: string;
  text_color_mode?: SectionHeaderTextColorMode;
  show_count: boolean;
  show_subtitle: boolean;
  page_break_before: boolean;
  overrides?: Record<string, CategorySectionOverride>;
}

export const DEFAULT_SECTION_HEADER_CONFIG: CatalogSectionHeaderConfig = {
  style: 'line_divider',
  align: 'center',
  width: 'full',
  size: 'md',
  color_mode: 'primary',
  custom_color: '#ea580c',
  text_color_mode: 'auto',
  show_count: true,
  show_subtitle: true,
  page_break_before: false,
  overrides: {},
};

export type GridSymmetryMode = 'any' | 'equal' | 'different';
export type CardLayoutStyle = 'vertical' | 'horizontal' | 'badge_top' | 'overlay';
export type CardShapeStyle = 'rounded' | 'pill' | 'sharp' | 'shadow' | 'minimal';
export type CardPriceStyle = 'box' | 'solid_footer' | 'inline';
export type CardDensity = 'compact' | 'normal' | 'spacious';
export type CardPageFitMode = 'standard' | 'fill_page';

export interface ProductCardColorOverride {
  bg_color?: string;
  border_color?: string;
  title_color?: string;
  price_bg_color?: string;
  price_text_color?: string;
}

export interface CatalogCardConfig {
  layout: CardLayoutStyle;
  shape: CardShapeStyle;
  price_style: CardPriceStyle;
  text_align: 'right' | 'center';
  width_percent: number; // 50..100
  card_height_scale?: number; // 60..220
  page_fit_mode?: CardPageFitMode; // 'standard' | 'fill_page'
  uniform_row_cards?: boolean; // true = same card dimensions on partial/last rows
  padding: CardDensity;
  gap: CardDensity;
  border_width: number; // 0..3
  border_radius: number; // 0..24
  image_height_scale: number; // 50..200
  image_zoom?: number; // 70..180
  image_fit?: 'contain' | 'cover';
  font_scale?: number; // 80..150
  overlay_scrim_opacity?: number; // 0..85
  overlay_content_position?: 'bottom' | 'center' | 'top';
  overlay_text_tone?: 'white' | 'dark' | 'custom';
  card_logo_enabled?: boolean;
  card_logo_layer?: 'front' | 'back';
  card_logo_scope?: 'card' | 'image';
  card_logo_position?: CardLogoPosition;
  card_logo_size?: number; // 14..90 px
  card_logo_opacity?: number; // 0.08..1.0
  card_logo_inset?: number; // 0..24 px
  card_logo_offset_x?: number; // -30..30 px
  card_logo_offset_y?: number; // -30..30 px
  card_logo_rotation?: number; // -45..45 deg
  card_logo_shape?: CardLogoShape;
  card_logo_bg?: boolean;
  bg_color: string;
  border_color: string;
  title_color: string;
  price_bg_color: string;
  price_border_color: string;
  price_text_color: string;
  badge_bg_color: string;
  badge_text_color: string;
  per_product_overrides?: Record<string, ProductCardColorOverride>;
}

export const DEFAULT_CARD_CONFIG: CatalogCardConfig = {
  layout: 'vertical',
  shape: 'rounded',
  price_style: 'box',
  text_align: 'right',
  width_percent: 100,
  card_height_scale: 100,
  page_fit_mode: 'standard',
  uniform_row_cards: true,
  padding: 'normal',
  gap: 'normal',
  border_width: 1,
  border_radius: 8,
  image_height_scale: 100,
  image_zoom: 100,
  image_fit: 'contain',
  font_scale: 100,
  overlay_scrim_opacity: 60,
  overlay_content_position: 'bottom',
  overlay_text_tone: 'white',
  card_logo_enabled: false,
  card_logo_layer: 'front',
  card_logo_scope: 'card',
  card_logo_position: 'top-left',
  card_logo_size: 26,
  card_logo_opacity: 0.85,
  card_logo_inset: 6,
  card_logo_offset_x: 0,
  card_logo_offset_y: 0,
  card_logo_rotation: 0,
  card_logo_shape: 'rounded',
  card_logo_bg: true,
  bg_color: '#ffffff',
  border_color: '#e2e8f0',
  title_color: '#0f172a',
  price_bg_color: '#f0fdf4',
  price_border_color: '#bbf7d0',
  price_text_color: '#15803d',
  badge_bg_color: '#f1f5f9',
  badge_text_color: '#475569',
  per_product_overrides: {},
};

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
  section_header_config?: CatalogSectionHeaderConfig; // خصائص وتعديلات عناوين الأقسام لهذا الكتالوج
  card_config?: CatalogCardConfig; // خصائص تصميم الكارت لهذا الكتالوج

  // Catalog-specific settings (Requirement ب)
  company_name?: string;
  business_bio?: string;
  logo_url?: string;
  header_logo_position?: HeaderLogoPosition;
  header_logo_size?: number;
  header_logo_shape?: HeaderLogoShape;
  header_logo_bg?: HeaderLogoBg;
  header_logo_border?: boolean;
  header_logo_padding?: number;
  header_logo_spacing?: number;
  header_logo_offset_x?: number;
  header_logo_offset_y?: number;
  header_logo_rotation?: number;
  header_logo_opacity?: number;
  header_logo_fit?: 'contain' | 'cover';
  watermark_type?: WatermarkType;
  watermark_layer?: WatermarkLayer;
  watermark_position?: WatermarkPosition;
  watermark_offset_x?: number;
  watermark_offset_y?: number;
  watermark_rotation?: number;
  watermark_opacity?: number;
  watermark_size?: number;
  watermark_gap?: number;
  phone?: string;
  whatsapp_number?: string;
  secondary_phone?: string;
  extra_phones?: CompanyPhoneItem[];
  address?: string;
  email?: string;
  tax_or_cr_number?: string;
  show_company_name?: boolean;
  show_business_bio?: boolean;
  show_catalog_title?: boolean;
  show_price_validity?: boolean;
  show_phone?: boolean;
  show_whatsapp?: boolean;
  show_secondary_phone?: boolean;
  show_address?: boolean;
  show_email?: boolean;
  show_tax_or_cr?: boolean;
  show_footer_note?: boolean;
  price_validity_note?: string; // تاريخ سريان الأسعار
  columns_count?: number; // Custom 1..8 columns (default 4)
  rows_count?: number; // Custom 1..10 rows per page (default 4 for 4 cols, 3 otherwise)
  grid_layout_mode?: 'manual' | 'auto';
  grid_symmetry?: GridSymmetryMode;
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


