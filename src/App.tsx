import React, { useState, useEffect } from 'react';
import { Product, CatalogSettings, DispatchRecord, BatchSession, ApiUsageLog } from './types';
import {
  getAllProducts,
  getSettings,
  saveSettings,
  getAllDispatches,
  saveProductsBatch,
  DEFAULT_SETTINGS,
  getUnfinishedBatchSession,
  deleteBatchSession,
  getAllApiUsageLogs,
  clearApiUsageLogs,
  requestPersistentStorage,
  exportDatabaseBackup,
} from './utils/db';
import { Navbar, DesktopSidebar, ActiveTab } from './components/Navbar';
import { UploadSection } from './components/UploadSection';
import { PricingTable } from './components/PricingTable';
import { CatalogPreview } from './components/CatalogPreview';
import { WhatsAppDispatch } from './components/WhatsAppDispatch';
import { DispatchHistory } from './components/DispatchHistory';
import { SettingsModal } from './components/SettingsModal';
import { ResumeSessionBanner } from './components/ResumeSessionBanner';
import { PdfToolsTab } from './components/PdfToolsTab';
import { ApiUsageTab } from './components/ApiUsageTab';
import { MyCatalogs } from './components/MyCatalogs';
import { OfflineIndicator } from './components/OfflineIndicator';
import { useUiFeedback } from './components/UiFeedbackProvider';
import { Sparkles, PackagePlus, Database, Download, X } from 'lucide-react';

// Sample demo accessories data for initial run
const DEMO_PRODUCTS: Product[] = [
  {
    id: 'demo_1',
    code: 'EP-001',
    name: 'سماعة ايربودز برو لاسلكية عازلة للضوضاء',
    category: 'ايربودز',
    group: 'Joyroom Pro',
    model: 'JR-T03S Pro',
    specification: 'بلوتوث 5.3 مع بطارية تدوم حتى 25 ساعة مع الجراب',
    wholesale_price: 280,
    selling_price: 420,
    included_in_catalog: true,
    available_models: ['أبيض مع جراب سليكون هدية'],
    image_url: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=400&q=80',
    page_number: 2,
    card_index: 1,
    section_title: 'مجموعة ايربودزات و مايكات ستارت',
    created_at: Date.now() - 300000,
    updated_at: Date.now() - 300000,
  },
  {
    id: 'demo_2',
    code: 'MIC-002',
    name: 'مايك لاسلكي مزدوج بمشبك Type-C للايفون والاندرويد',
    category: 'ميك',
    group: 'START Wireless',
    model: 'K9 Wireless Mic',
    specification: 'تسجيل صوت نقي عازل للضوضاء بمدى 20 متر',
    wholesale_price: 110,
    selling_price: 185,
    included_in_catalog: true,
    available_models: ['Type-C', 'Lightning'],
    image_url: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=400&q=80',
    page_number: 2,
    card_index: 2,
    section_title: 'مجموعة ايربودزات و مايكات ستارت',
    created_at: Date.now() - 250000,
    updated_at: Date.now() - 250000,
  },
  {
    id: 'demo_3',
    code: 'CH-003',
    name: 'شاحن حيطة سريع 20 وات بي دي GaN ميني',
    category: 'شاحن حيطة',
    group: 'Joyroom Fast',
    model: 'JR-TCF05',
    specification: 'يدعم تقنية PD & QC3.0 مع حماية حرارية ذكية',
    wholesale_price: 95,
    selling_price: 160,
    included_in_catalog: true,
    available_models: ['Type-C to Lightning', 'Type-C to Type-C'],
    image_url: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=400&q=80',
    page_number: 3,
    card_index: 1,
    section_title: 'مجموعة شواحن ستارت',
    created_at: Date.now() - 200000,
    updated_at: Date.now() - 200000,
  },
  {
    id: 'demo_4',
    code: 'CB-004',
    name: 'كابل شحن سريع قماش مجدول 60 وات Type-C',
    category: 'كابل',
    group: 'Baseus Braided',
    model: '1.2M Type-C to Type-C',
    specification: 'سلك نحاسي نقي يتحمل الانثناء حتى 10,000 مرة',
    wholesale_price: 38,
    selling_price: 75,
    included_in_catalog: true,
    available_models: ['1.2 متر', '2 متر'],
    image_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
    page_number: 4,
    card_index: 1,
    section_title: 'مجموعة كابلات ستارت',
    created_at: Date.now() - 150000,
    updated_at: Date.now() - 150000,
  },
  {
    id: 'demo_5',
    code: 'PB-005',
    name: 'باوربانك شحن سريع 10000 مللي أمبير ديجيتال',
    category: 'باوربانك',
    group: 'START Power',
    model: 'ST-ES01',
    specification: 'شاشة رقمية لنسبة الشحن ومخرجين شحن سريع',
    wholesale_price: 340,
    selling_price: 490,
    included_in_catalog: true,
    available_models: ['أسود', 'أبيض'],
    image_url: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&w=400&q=80',
    page_number: 5,
    card_index: 1,
    section_title: 'مجموعة باوربانكات ستارت',
    created_at: Date.now() - 100000,
    updated_at: Date.now() - 100000,
  },
  {
    id: 'demo_6',
    code: 'PN-006',
    name: 'قلم تاتش مغناطيسي ذكي للأجهزة اللوحية',
    category: 'قلم',
    group: 'START Stylus',
    model: 'ST P010 Pro',
    specification: 'استجابة فائقة السرعة مع حساسية ميلان وبطارية طويلة',
    wholesale_price: 140,
    selling_price: 240,
    included_in_catalog: true,
    available_models: ['أبيض'],
    image_url: 'https://images.unsplash.com/photo-1585336261026-7756f7ef57d5?auto=format&fit=crop&w=400&q=80',
    page_number: 6,
    card_index: 1,
    section_title: 'مجموعة الأقلام والمتنوعات',
    created_at: Date.now() - 50000,
    updated_at: Date.now() - 50000,
  },
];

export default function App() {
  const { toast } = useUiFeedback();
  const [activeTab, setActiveTab] = useState<ActiveTab>('upload');
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<CatalogSettings>(DEFAULT_SETTINGS);
  const [dispatches, setDispatches] = useState<DispatchRecord[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoadingDB, setIsLoadingDB] = useState(true);
  const [unfinishedSession, setUnfinishedSession] = useState<BatchSession | null>(null);
  const [activeBatchSession, setActiveBatchSession] = useState<BatchSession | null>(null);
  const [apiUsageLogs, setApiUsageLogs] = useState<ApiUsageLog[]>([]);
  const [dismissBackupReminder, setDismissBackupReminder] = useState(false);

  // Initialize data from IndexedDB
  const loadInitialData = async () => {
    try {
      setIsLoadingDB(true);
      const [storedProducts, storedSettings, storedDispatches, pendingSession, storedLogs] =
        await Promise.all([
          getAllProducts(),
          getSettings(),
          getAllDispatches(),
          getUnfinishedBatchSession(),
          getAllApiUsageLogs(),
        ]);

      setProducts(storedProducts);
      setSettings(storedSettings);
      setDispatches(storedDispatches);
      setUnfinishedSession(pendingSession);
      setApiUsageLogs(storedLogs);

      // Request persistent browser storage
      await requestPersistentStorage();
    } catch (err) {
      console.error('Failed to initialize database:', err);
    } finally {
      setIsLoadingDB(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Quick Backup Now (timestamped JSON)
  const handleQuickBackup = async () => {
    try {
      const jsonString = await exportDatabaseBackup();
      const blob = new Blob([jsonString], { type: 'application/json' });
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = `${now.getHours()}-${now.getMinutes()}`;
      const filename = `catalog_backup_${dateStr}_${timeStr}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      const updated: CatalogSettings = { ...settings, last_backup_date: Date.now() };
      setSettings(updated);
      setDismissBackupReminder(true);
      toast.success('تم تنزيل النسخة الاحتياطية بنجاح وتحديث تاريخ آخر نسخة.');
    } catch (err: any) {
      toast.error(`فشل أخذ النسخة الاحتياطية: ${err.message || ''}`);
    }
  };

  // Seed Demo Data helper
  const handleLoadDemoData = async () => {
    await saveProductsBatch(DEMO_PRODUCTS);
    setProducts(DEMO_PRODUCTS);
    setActiveTab('pricing');
  };

  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('catalog_theme') === 'dark';
    } catch {
      return false;
    }
  });

  const [accentTheme, setAccentTheme] = useState<'orange' | 'blue'>(() => {
    try {
      const saved = localStorage.getItem('catalog_accent_theme');
      return saved === 'blue' ? 'blue' : 'orange';
    } catch {
      return 'orange';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    if (accentTheme === 'orange') {
      root.classList.add('theme-orange');
    } else {
      root.classList.remove('theme-orange');
    }
    try {
      localStorage.setItem('catalog_theme', isDarkMode ? 'dark' : 'light');
      localStorage.setItem('catalog_accent_theme', accentTheme);
    } catch {
      // ignore storage quota errors
    }
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute(
        'content',
        isDarkMode ? '#0b1220' : accentTheme === 'orange' ? '#ea580c' : '#0284c7'
      );
    }
  }, [isDarkMode, accentTheme]);

  const toggleDarkMode = () => setIsDarkMode((prev) => !prev);
  const toggleAccentTheme = () => setAccentTheme((prev) => (prev === 'orange' ? 'blue' : 'orange'));

  const pricedProductsCount = products.filter((p) => (p.selling_price || 0) > 0).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-['Cairo',sans-serif] overflow-x-clip" dir="rtl">
      <OfflineIndicator />
      {/* Top Header & Mobile Nav Bar + Drawer */}
      <Navbar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        totalProductsCount={products.length}
        pricedProductsCount={pricedProductsCount}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isDesktopCollapsed={isDesktopCollapsed}
        onToggleDesktopCollapse={() => setIsDesktopCollapsed((prev) => !prev)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
        accentTheme={accentTheme}
        onToggleAccentTheme={toggleAccentTheme}
      />

      {/* Main Container with Desktop Sidebar */}
      <div className="flex-1 flex w-full">
        {/* Desktop Sidebar (Persistent on right >= 1024px, collapsible) */}
        <DesktopSidebar
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab)}
          totalProductsCount={products.length}
          pricedProductsCount={pricedProductsCount}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isCollapsed={isDesktopCollapsed}
          onToggleCollapse={() => setIsDesktopCollapsed((prev) => !prev)}
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
          accentTheme={accentTheme}
          onToggleAccentTheme={toggleAccentTheme}
        />

        {/* Main Content Area with pb-28 on mobile (< 640px) so bottom bar doesn't overlay */}
        <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 pb-28 sm:pb-8">
        {isLoadingDB ? (
          <div className="p-16 flex flex-col items-center justify-center text-slate-400">
            <div className="w-10 h-10 border-3 border-sky-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm font-semibold">جاري فتح وتجهيز قاعدة البيانات المحلية...</p>
          </div>
        ) : (
          <>
            {/* Feature 2: Incomplete batch session banner on app reopen */}
            {unfinishedSession && (
              <ResumeSessionBanner
                session={unfinishedSession}
                onResume={() => {
                  setActiveBatchSession(unfinishedSession);
                  setActiveTab('upload');
                  setUnfinishedSession(null);
                }}
                onDismiss={async () => {
                  if (unfinishedSession) {
                    await deleteBatchSession(unfinishedSession.id);
                    setUnfinishedSession(null);
                  }
                }}
              />
            )}

            {/* Feature 3: 7-day Backup Reminder Banner on Home Page */}
            {products.length > 0 &&
              !dismissBackupReminder &&
              (!settings.last_backup_date ||
                Date.now() - settings.last_backup_date > 7 * 86400 * 1000) && (
                <div className="mb-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                      <Database size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-amber-950 text-sm flex items-center gap-2">
                        <span>تذكير بالنسخ الاحتياطي الدوري</span>
                        <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                          {settings.last_backup_date ? 'أكثر من 7 أيام' : 'لم تُحفظ نسخة بعد'}
                        </span>
                      </h4>
                      <p className="text-xs text-amber-800 mt-0.5">
                        لحماية بيانات الأسعار والتعديلات والكتالوجات من المسح العفوي، نزّل نسخة احتياطية دورية (ملف JSON خالٍ تماماً من مفاتيح API).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      onClick={handleQuickBackup}
                      className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs transition-colors"
                    >
                      <Download size={14} />
                      نسخة احتياطية الآن
                    </button>
                    <button
                      onClick={() => setDismissBackupReminder(true)}
                      className="p-2 text-amber-700 hover:text-amber-950 hover:bg-amber-100 rounded-xl transition-colors cursor-pointer"
                      title="إغلاق التنبيه مؤقتاً"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              )}

            {/* If zero products, show friendly welcome card with sample loader */}
            {products.length === 0 && activeTab === 'upload' && (
              <div className="mb-6 p-5 bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">
                      مرحباً بك! التطبيق جاهز لقراءة أول قائمة أسعار لديك.
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      يمكنك أيضاً تجربة التطبيق فوراً بعينة إكسسوارات جاهزة بضغطة زر لرؤية التسعير والكتالوج.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleLoadDemoData}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-sky-700 font-bold text-xs rounded-xl border border-sky-200 shadow-2xs transition-all shrink-0 cursor-pointer"
                >
                  <PackagePlus size={16} />
                  تحميل عينة إكسسوارات للتجربة
                </button>
              </div>
            )}

            {/* View based on active tab */}
            {activeTab === 'upload' && (
              <UploadSection
                existingProducts={products}
                onProductsUpdated={(newProds) => setProducts(newProds)}
                onNavigateToPricing={() => setActiveTab('pricing')}
                settings={settings}
                activeBatchSession={activeBatchSession}
                onClearActiveBatchSession={() => setActiveBatchSession(null)}
                onSettingsUpdated={(newSettings) => setSettings(newSettings)}
              />
            )}

            {activeTab === 'pricing' && (
              <PricingTable
                products={products}
                onProductsUpdated={(newProds) => setProducts(newProds)}
                settings={settings}
                onSettingsUpdated={(newSettings) => setSettings(newSettings)}
              />
            )}

            {activeTab === 'catalogs' && (
              <MyCatalogs
                products={products}
                settings={settings}
                onProductsUpdated={(newProds) => setProducts(newProds)}
                onSettingsUpdated={(newSettings) => setSettings(newSettings)}
                onNavigateToPricing={() => setActiveTab('pricing')}
              />
            )}

            {activeTab === 'preview' && (
              <CatalogPreview
                products={products}
                settings={settings}
                onSettingsUpdated={(newSettings) => setSettings(newSettings)}
                onProductsUpdated={(newProds) => setProducts(newProds)}
              />
            )}

            {activeTab === 'pdftools' && <PdfToolsTab products={products} settings={settings} />}

            {activeTab === 'usage' && (
              <ApiUsageTab
                logs={apiUsageLogs}
                settings={settings}
                onSettingsUpdated={(newSettings) => setSettings(newSettings)}
                onLogsCleared={() => setApiUsageLogs([])}
              />
            )}

            {activeTab === 'dispatch' && (
              <WhatsAppDispatch
                products={products}
                settings={settings}
                onProductsUpdated={(newProds) => setProducts(newProds)}
                onDispatchRecorded={async () => {
                  const updatedDispatches = await getAllDispatches();
                  setDispatches(updatedDispatches);
                }}
              />
            )}

            {activeTab === 'history' && (
              <DispatchHistory
                dispatches={dispatches}
                onDispatchesUpdated={(newDispatches) => setDispatches(newDispatches)}
              />
            )}
          </>
        )}
      </main>
      </div>

      {/* Settings & Backup Modal */}
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          onSettingsUpdated={(newSettings) => setSettings(newSettings)}
          onDataResetOrImported={loadInitialData}
          totalProductsCount={products.length}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
}
