import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  DollarSign,
  FileText,
  Send,
  History,
  Settings,
  Files,
  Activity,
  Menu,
  X,
  MoreHorizontal,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  DownloadCloud,
  BookOpen,
  Sun,
  Moon,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

export type ActiveTab = 'upload' | 'pricing' | 'catalogs' | 'preview' | 'dispatch' | 'history' | 'pdftools' | 'usage';

interface NavItem {
  id: ActiveTab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string | number | null;
}

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  totalProductsCount: number;
  pricedProductsCount: number;
  onOpenSettings: () => void;
  isDesktopCollapsed?: boolean;
  onToggleDesktopCollapse?: () => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  isDrawerOpen?: boolean;
  onOpenDrawer?: () => void;
  onCloseDrawer?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  totalProductsCount,
  pricedProductsCount,
  onOpenSettings,
  isDesktopCollapsed = false,
  onToggleDesktopCollapse,
  isDarkMode = false,
  onToggleDarkMode,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLogoMenuOpen, setIsLogoMenuOpen] = useState(false);
  const logoMenuRef = useRef<HTMLDivElement>(null);

  // Close drawer and logo menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDrawerOpen(false);
        setIsLogoMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close logo navigation menu when clicking outside
  useEffect(() => {
    if (!isLogoMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (logoMenuRef.current && !logoMenuRef.current.contains(e.target as Node)) {
        setIsLogoMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isLogoMenuOpen]);

  // Prevent body scroll when drawer or full-page navigation menu is open
  useEffect(() => {
    if (isDrawerOpen || isLogoMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isDrawerOpen, isLogoMenuOpen]);

  const allNavItems: NavItem[] = [
    { id: 'upload', label: 'قراءة القوائم', shortLabel: 'قراءة', icon: UploadCloud, badge: null },
    {
      id: 'pricing',
      label: 'جدول التسعير',
      shortLabel: 'تسعير',
      icon: DollarSign,
      badge: totalProductsCount > 0 ? `${totalProductsCount}` : null,
    },
    { id: 'catalogs', label: 'كتالوجاتي', shortLabel: 'كتالوجاتي', icon: BookOpen, badge: null },
    { id: 'preview', label: 'معاينة الكتالوج', shortLabel: 'كتالوج', icon: FileText, badge: null },
    { id: 'dispatch', label: 'واتساب والإرسال', shortLabel: 'واتساب', icon: Send, badge: null },
    { id: 'history', label: 'سجل الإرسال', shortLabel: 'السجل', icon: History, badge: null },
    { id: 'pdftools', label: 'أدوات PDF', shortLabel: 'أدوات PDF', icon: Files, badge: null },
    { id: 'usage', label: 'استهلاك API', shortLabel: 'الاستهلاك', icon: Activity, badge: null },
  ];

  // The 4 main items for bottom bar on mobile
  const bottomBarItems: NavItem[] = [
    allNavItems[0], // قراءة
    allNavItems[1], // تسعير
    allNavItems[2], // كتالوجاتي
    allNavItems[3], // معاينة الكتالوج
  ];

  const handleSelectTab = (tab: ActiveTab) => {
    onTabChange(tab);
    setIsDrawerOpen(false);
    setIsLogoMenuOpen(false);
  };

  return (
    <>
      {/* 1) Top Header (Responsive) */}
      <header
        className={`no-print bg-white border-b border-slate-200 sticky top-0 shadow-2xs ${
          isLogoMenuOpen ? 'z-50' : 'z-30'
        }`}
      >
        <div className="w-full px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Right in RTL: Logo & Brand + Mobile Hamburger / Desktop Sidebar Toggle */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {/* Hamburger Button on Mobile (< 640px) - Touch target >= 44px */}
              <button
                type="button"
                onClick={() => setIsDrawerOpen(true)}
                className="sm:hidden shrink-0 flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl text-slate-700 hover:text-sky-600 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="فتح القائمة الرئيسية"
                title="القائمة"
              >
                <Menu size={24} />
              </button>

              {/* Desktop Sidebar Toggle (>= 640px) */}
              {onToggleDesktopCollapse && (
                <button
                  type="button"
                  onClick={onToggleDesktopCollapse}
                  className="hidden sm:flex shrink-0 items-center justify-center min-h-[40px] min-w-[40px] rounded-xl text-slate-600 hover:text-sky-600 hover:bg-slate-100 border border-slate-200/70 transition-colors cursor-pointer"
                  aria-label={isDesktopCollapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'}
                  title={isDesktopCollapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'}
                >
                  <Menu size={20} />
                </button>
              )}

              {/* Logo & Brand (Clicking the icon opens quick navigation menu) */}
              <div className="flex items-center gap-2 sm:gap-2.5 relative min-w-0" ref={logoMenuRef}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setIsLogoMenuOpen((prev) => !prev)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setIsLogoMenuOpen((prev) => !prev);
                    }
                  }}
                  aria-haspopup="menu"
                  aria-expanded={isLogoMenuOpen}
                  aria-label="فتح قائمة الانتقالات"
                  title="اضغط لفتح قائمة الانتقالات بين الصفحات"
                  className={`w-10 h-10 rounded-xl overflow-hidden border border-slate-200 bg-white flex items-center justify-center shadow-md shrink-0 cursor-pointer transition-all hover:scale-105 active:scale-95 ${
                    isLogoMenuOpen ? 'ring-2 ring-sky-400 ring-offset-2' : ''
                  }`}
                >
                  <img
                    src="/app-logo.png"
                    alt="شعار التطبيق"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <h1 className="font-extrabold text-slate-900 text-sm sm:text-base leading-tight truncate">
                    مولّد كتالوج أسعار البيع
                  </h1>
                  <p className="text-[11px] text-slate-500 font-medium hidden sm:block truncate">
                    لتجار وموزعي إكسسوارات الموبايل
                  </p>
                </div>

                {/* Full-Height Side Navigation Menu (قائمة جانبية) */}
                {isLogoMenuOpen && (
                  <div
                    role="menu"
                    aria-label="قائمة الانتقالات الجانبية"
                    className="fixed inset-0 z-50 animate-in fade-in duration-150"
                  >
                    {/* Clickable Backdrop */}
                    <div
                      className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
                      onClick={() => setIsLogoMenuOpen(false)}
                      aria-hidden="true"
                    />

                    {/* Right Side Panel (Full Page Height) */}
                    <div className="fixed inset-y-0 right-0 w-72 sm:w-80 max-w-[85vw] h-dvh bg-white shadow-2xl border-l border-slate-200 flex flex-col z-50 animate-in slide-in-from-right duration-200">
                      {/* Side Menu Header */}
                      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 shrink-0">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl overflow-hidden border border-slate-200 bg-white flex items-center justify-center shadow-xs shrink-0">
                            <img
                              src="/app-logo.png"
                              alt="شعار التطبيق"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div>
                            <h2 className="text-sm font-black text-slate-900">قائمة الانتقالات</h2>
                            <p className="text-[11px] text-slate-500 font-medium">التنقل السريع بين الصفحات</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setIsLogoMenuOpen(false)}
                          className="flex items-center justify-center min-h-[40px] min-w-[40px] rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                          aria-label="إغلاق قائمة الانتقالات"
                        >
                          <X size={18} />
                        </button>
                      </div>

                      {/* Side Menu Navigation Items */}
                      <div className="flex-1 overflow-y-auto p-3 space-y-1">
                        <div className="text-[11px] font-bold text-slate-400 px-2.5 py-1">
                          الصفحات والأدوات
                        </div>
                        {allNavItems.map((item) => {
                          const Icon = item.icon;
                          const isActive = activeTab === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              role="menuitem"
                              onClick={() => handleSelectTab(item.id)}
                              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition-all min-h-[44px] cursor-pointer ${
                                isActive
                                  ? 'bg-sky-50 text-sky-700 border-r-4 border-r-sky-600 border border-sky-200 shadow-2xs font-extrabold'
                                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <Icon
                                  size={18}
                                  className={`shrink-0 ${isActive ? 'text-sky-600' : 'text-slate-400'}`}
                                />
                                <span className="truncate">{item.label}</span>
                              </div>
                              {item.badge && (
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-mono shrink-0 ${
                                    isActive
                                      ? 'bg-sky-200 text-sky-900'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {item.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Side Menu Footer */}
                      <div className="p-3 border-t border-slate-100 bg-slate-50/60 space-y-1.5 shrink-0">
                        {onToggleDarkMode && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={onToggleDarkMode}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors min-h-[42px] cursor-pointer"
                          >
                            {isDarkMode ? (
                              <Sun size={18} className="text-amber-400 shrink-0" />
                            ) : (
                              <Moon size={18} className="text-orange-500 shrink-0" />
                            )}
                            <span>{isDarkMode ? 'الوضع النهاري (الفاتح)' : 'الوضع الداكن (Dark Mode)'}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setIsLogoMenuOpen(false);
                            onOpenSettings();
                          }}
                          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors min-h-[42px] cursor-pointer"
                        >
                          <Settings size={18} className="text-slate-400 shrink-0" />
                          <span>الإعدادات والنسخ الاحتياطي</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Left in RTL: Desktop Actions, Dark Mode & Settings */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <PWAInstallButton compactMobile />

              {onToggleDarkMode && (
                <button
                  type="button"
                  onClick={onToggleDarkMode}
                  className={`shrink-0 flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                    isDarkMode
                      ? 'bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700'
                      : 'text-slate-700 hover:text-sky-600 hover:bg-slate-100 border-transparent hover:border-slate-200'
                  }`}
                  title={isDarkMode ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الداكن'}
                  aria-label={isDarkMode ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الداكن'}
                >
                  {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                  <span className="hidden md:inline">
                    {isDarkMode ? 'نهاري' : 'داكن'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={onOpenSettings}
                className="shrink-0 flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-2.5 sm:px-3 py-2 text-slate-700 hover:text-sky-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-transparent hover:border-slate-200"
                title="الإعدادات والنسخ الاحتياطي"
                aria-label="الإعدادات والنسخ الاحتياطي"
              >
                <Settings size={18} />
                <span className="hidden sm:inline">الإعدادات</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 2) Right Drawer (Mobile < 640px) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 sm:hidden animate-in fade-in duration-200">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Panel Sliding from Right (RTL Start) */}
          <div className="fixed inset-y-0 right-0 max-w-xs w-full bg-white shadow-2xl flex flex-col z-50 animate-in slide-in-from-right duration-250 border-l border-slate-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl overflow-hidden border border-slate-200 bg-white flex items-center justify-center shadow-xs shrink-0">
                  <img
                    src="/app-logo.png"
                    alt="شعار التطبيق"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h2 className="font-bold text-sm text-slate-900">القائمة الرئيسية</h2>
                  <p className="text-[11px] text-slate-400">مولّد كتالوج الأسعار</p>
                </div>
              </div>

              {/* Close Button - Touch target >= 44px */}
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="إغلاق القائمة"
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Navigation List */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              <div className="text-[11px] font-bold text-slate-400 px-3 py-1">الأقسام والمهام</div>
              {allNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectTab(item.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition-all min-h-[44px] cursor-pointer ${
                      isActive
                        ? 'bg-sky-50 text-sky-700 border border-sky-200 shadow-2xs font-extrabold'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={18} className={isActive ? 'text-sky-600' : 'text-slate-400'} />
                      <span>{item.label}</span>
                    </div>

                    {item.badge && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-mono ${
                          isActive ? 'bg-sky-200 text-sky-900' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}

              <div className="pt-3 border-t border-slate-100 my-2">
                <div className="text-[11px] font-bold text-slate-400 px-3 py-1">التخصيص والتثبيت</div>

                {/* Dark Mode Toggle in Mobile Drawer */}
                {onToggleDarkMode && (
                  <button
                    type="button"
                    onClick={onToggleDarkMode}
                    className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors min-h-[44px] cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      {isDarkMode ? (
                        <Sun size={18} className="text-amber-400" />
                      ) : (
                        <Moon size={18} className="text-orange-500" />
                      )}
                      <span>{isDarkMode ? 'الوضع النهاري (الفاتح)' : 'الوضع الداكن (Dark Mode)'}</span>
                    </div>
                  </button>
                )}

                {/* Settings Link */}
                <button
                  type="button"
                  onClick={() => {
                    setIsDrawerOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors min-h-[44px] cursor-pointer"
                >
                  <Settings size={18} className="text-slate-400" />
                  <span>الإعدادات والنسخ الاحتياطي</span>
                </button>
              </div>
            </nav>

            {/* Drawer Footer with PWA Install */}
            <div className="p-3 border-t border-slate-100 bg-slate-50/60">
              <div className="w-full flex justify-center">
                <PWAInstallButton />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3) Fixed Bottom Navigation Bar (< 640px) */}
      <nav
        aria-label="شريط التنقل السفلي"
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg px-2 pb-safe"
      >
        <div className="grid grid-cols-5 items-center justify-around h-16 max-w-md mx-auto">
          {bottomBarItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`flex flex-col items-center justify-center min-h-[44px] py-1 rounded-xl transition-all cursor-pointer relative ${
                  isActive ? 'text-sky-600 font-extrabold' : 'text-slate-500 hover:text-slate-800 font-medium'
                }`}
              >
                <div className="relative">
                  <Icon size={20} className={isActive ? 'text-sky-600 stroke-[2.3]' : 'text-slate-400'} />
                  {item.badge && (
                    <span className="absolute -top-1.5 -left-2 bg-sky-600 text-white text-[9px] font-bold font-mono px-1 rounded-full min-w-[14px] text-center">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] mt-1 leading-none">{item.shortLabel}</span>
              </button>
            );
          })}

          {/* 5th Item: المزيد (Opens Drawer) */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="flex flex-col items-center justify-center min-h-[44px] py-1 rounded-xl text-slate-500 hover:text-slate-800 font-medium transition-all cursor-pointer"
          >
            <Menu size={20} className="text-slate-400" />
            <span className="text-[10px] mt-1 leading-none">المزيد</span>
          </button>
        </div>
      </nav>
    </>
  );
};

/* 4) Desktop Persistent Sidebar (>= 640px: all desktop, laptop, tablet & split-screen preview widths) */
interface DesktopSidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  totalProductsCount: number;
  pricedProductsCount: number;
  onOpenSettings: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeTab,
  onTabChange,
  totalProductsCount,
  pricedProductsCount,
  onOpenSettings,
  isCollapsed,
  onToggleCollapse,
  isDarkMode = false,
  onToggleDarkMode,
}) => {
  // Primary workflow pages
  const primaryNavItems: NavItem[] = [
    { id: 'upload', label: 'قراءة القوائم', shortLabel: 'قراءة', icon: UploadCloud, badge: null },
    {
      id: 'pricing',
      label: 'الأصناف والتسعير',
      shortLabel: 'الأصناف',
      icon: DollarSign,
      badge: totalProductsCount > 0 ? `${totalProductsCount}` : null,
    },
    { id: 'catalogs', label: 'كتالوجاتي', shortLabel: 'كتالوجاتي', icon: BookOpen, badge: null },
    { id: 'preview', label: 'معاينة الكتالوج', shortLabel: 'كتالوج', icon: FileText, badge: null },
    { id: 'dispatch', label: 'واتساب والإرسال', shortLabel: 'واتساب', icon: Send, badge: null },
    { id: 'history', label: 'سجل الإرسال', shortLabel: 'سجل', icon: History, badge: null },
  ];

  // Utility & usage pages
  const secondaryNavItems: NavItem[] = [
    { id: 'pdftools', label: 'أدوات PDF', shortLabel: 'PDF', icon: Files, badge: null },
    { id: 'usage', label: 'استهلاك API', shortLabel: 'الاستهلاك', icon: Activity, badge: null },
  ];

  return (
    <aside
      aria-label="قائمة الانتقالات الجانبية للكمبيوتر"
      className={`no-print hidden sm:flex flex-col border-l border-slate-200 bg-white transition-all duration-200 shrink-0 sticky top-16 h-[calc(100vh-4rem)] shadow-2xs z-20 ${
        isCollapsed ? 'w-16 lg:w-20' : 'w-52 md:w-60 lg:w-64'
      }`}
    >
      {/* Sidebar Header & Collapse Toggle */}
      <div className="p-3 border-b border-slate-100 flex items-center justify-between">
        {!isCollapsed && (
          <span className="text-xs font-black text-slate-800 px-2 tracking-wide">
            قائمة الصفحات
          </span>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className={`flex items-center justify-center min-h-[38px] min-w-[38px] text-slate-500 hover:text-sky-700 hover:bg-sky-50 rounded-xl transition-colors cursor-pointer ${
            isCollapsed ? 'mx-auto' : ''
          }`}
          title={isCollapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة لأيقونات فقط'}
          aria-label={isCollapsed ? 'توسيع القائمة' : 'طي القائمة'}
        >
          {isCollapsed ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      {/* Primary Nav items list */}
      <nav className="flex-1 overflow-y-auto p-2.5 space-y-1">
        {!isCollapsed && (
          <span className="text-[10px] font-bold text-slate-400 px-2 block mb-1">
            التنقل بين الصفحات
          </span>
        )}
        {primaryNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-extrabold transition-all min-h-[42px] cursor-pointer ${
                isActive
                  ? 'bg-sky-50 text-sky-700 border-r-4 border-r-sky-600 border border-sky-100 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
              } ${isCollapsed ? 'justify-center px-0' : 'justify-between'}`}
              title={item.label}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon
                  size={18}
                  className={`shrink-0 ${isActive ? 'text-sky-600' : 'text-slate-400'}`}
                />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </div>

              {!isCollapsed && item.badge && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-mono shrink-0 ${
                    isActive ? 'bg-sky-200 text-sky-900' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Divider & Secondary Items */}
        <div className="pt-2.5 mt-2.5 border-t border-slate-100 space-y-1">
          {!isCollapsed && (
            <span className="text-[10px] font-bold text-slate-400 px-2 block mb-1">
              الأدوات والاستهلاك
            </span>
          )}
          {secondaryNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all min-h-[40px] cursor-pointer ${
                  isActive
                    ? 'bg-sky-50 text-sky-700 border-r-4 border-r-sky-600 border border-sky-100 shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                } ${isCollapsed ? 'justify-center px-0' : 'justify-between'}`}
                title={item.label}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    size={18}
                    className={`shrink-0 ${isActive ? 'text-sky-600' : 'text-slate-400'}`}
                  />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Sidebar Footer: Theme Toggle, Settings & Backup */}
      <div className="p-2.5 border-t border-slate-100 bg-slate-50/50 space-y-1">
        {onToggleDarkMode && (
          <button
            type="button"
            onClick={onToggleDarkMode}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-extrabold text-slate-700 hover:bg-white hover:text-sky-600 hover:shadow-2xs rounded-xl transition-all min-h-[42px] cursor-pointer border border-transparent hover:border-slate-200 ${
              isCollapsed ? 'justify-center px-0' : ''
            }`}
            title={isDarkMode ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الداكن'}
          >
            {isDarkMode ? (
              <Sun size={18} className="text-amber-400 shrink-0" />
            ) : (
              <Moon size={18} className="text-orange-500 shrink-0" />
            )}
            {!isCollapsed && (
              <span className="truncate">{isDarkMode ? 'الوضع النهاري' : 'الوضع الداكن'}</span>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onOpenSettings}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-extrabold text-slate-700 hover:bg-white hover:text-sky-700 hover:shadow-2xs rounded-xl transition-all min-h-[44px] cursor-pointer border border-transparent hover:border-slate-200 ${
            isCollapsed ? 'justify-center px-0' : ''
          }`}
          title="الإعدادات والنسخ الاحتياطي"
        >
          <Settings size={18} className="text-slate-500 shrink-0" />
          {!isCollapsed && <span className="truncate">الإعدادات والنسخ الاحتياطي</span>}
        </button>
      </div>
    </aside>
  );
};
