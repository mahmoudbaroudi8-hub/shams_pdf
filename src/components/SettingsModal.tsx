import React, { useState, useRef, useEffect } from 'react';
import {
  CatalogSettings,
  WatermarkType,
  WatermarkLayer,
  AutoBackupSnapshot,
  CompanyPhoneItem,
} from '../types';
import {
  saveSettings,
  exportDatabaseBackup,
  analyzeProjectImport,
  executeProjectImportMerge,
  ProjectImportAnalysis,
  clearWorkspaceData,
  createAutoBackupSnapshot,
  getAutoBackupSnapshots,
  restoreAutoBackupSnapshot,
  requestPersistentStorage,
} from '../utils/db';
import { useUiFeedback } from './UiFeedbackProvider';
import {
  Settings,
  Database,
  Download,
  Upload,
  Trash2,
  Check,
  X,
  Building2,
  Phone,
  MessageCircle,
  MapPin,
  Mail,
  FileText,
  Image as ImageIcon,
  Sliders,
  Eye,
  EyeOff,
  Plus,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  HardDrive,
  History,
} from 'lucide-react';

interface SettingsModalProps {
  settings: CatalogSettings;
  onSettingsUpdated: (settings: CatalogSettings) => void;
  onDataResetOrImported: () => void;
  totalProductsCount?: number;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onSettingsUpdated,
  onDataResetOrImported,
  totalProductsCount = 0,
  onClose,
}) => {
  const { toast, confirm } = useUiFeedback();
  const [activeTab, setActiveTab] = useState<'identity' | 'watermark' | 'system'>('identity');
  const [localSettings, setLocalSettings] = useState<CatalogSettings>(() => ({
    ...settings,
    primary_model: settings.primary_model || 'gemini-4-hydrogen',
    fallback_model: settings.fallback_model || 'gemini-3.1-flash-lite',
  }));

  const [hasServerKey, setHasServerKey] = useState<boolean | null>(null);
  const [isSavedNotice, setIsSavedNotice] = useState(false);

  // Pre-import merge states (Requirement 1 & 5)
  const [importAnalysis, setImportAnalysis] = useState<ProjectImportAnalysis | null>(null);
  const [duplicatePriceChoice, setDuplicatePriceChoice] = useState<'keep_existing' | 'use_incoming'>('keep_existing');
  const [isExecutingMerge, setIsExecutingMerge] = useState(false);

  // Backup & Reset states (Requirement 3)
  const [autoSnapshots, setAutoSnapshots] = useState<AutoBackupSnapshot[]>([]);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetTypedWord, setResetTypedWord] = useState('');
  const [isPersistent, setIsPersistent] = useState<boolean | null>(null);
  const [isRestoringSnapshot, setIsRestoringSnapshot] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  // Check server key & persistent storage & snapshots on mount
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setHasServerKey(Boolean(data.hasServerKey)))
      .catch(() => setHasServerKey(false));

    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then((persisted) => setIsPersistent(persisted)).catch(() => {});
    }

    getAutoBackupSnapshots().then((snaps) => setAutoSnapshots(snaps)).catch(() => {});
  }, []);

  const handleRequestStoragePersistence = async () => {
    const granted = await requestPersistentStorage();
    setIsPersistent(granted);
    if (granted) {
      toast.success('تم تفعيل التخزين الدائم بنجاح! المتصفح لن يقوم بحذف بياناتك تلقائياً.');
    } else {
      toast.info('تم إرسال الطلب للمتصفح. قد يعتمد القبول على سياسات المتصفح وتثبيت التطبيق.');
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setLocalSettings((prev) => ({ ...prev, logo_url: result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAllSettings = async () => {
    const cleanedSettings: CatalogSettings = {
      ...localSettings,
      primary_model: (localSettings.primary_model || '').trim() || 'gemini-4-hydrogen',
      fallback_model: (localSettings.fallback_model || '').trim() || 'gemini-3.1-flash-lite',
    };
    await saveSettings(cleanedSettings);
    onSettingsUpdated(cleanedSettings);

    setIsSavedNotice(true);
    setTimeout(() => {
      setIsSavedNotice(false);
      onClose();
    }, 800);
  };

  const handleExportBackup = async () => {
    try {
      // Strictly export without keys (Requirement 1 & 3)
      const backupJson = await exportDatabaseBackup();
      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = `${now.getHours()}-${now.getMinutes()}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `نسخة_مشروع_الكتالوج_${dateStr}_${timeStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      const updated = { ...localSettings, last_backup_date: Date.now() };
      setLocalSettings(updated);
      onSettingsUpdated(updated);
      toast.success('تم تصدير نسخة المشروع الاحتياطية بنجاح.');
    } catch {
      toast.error('تعذر تصدير نسخة المشروع.');
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      // Analyze project import by item codes (Requirement 5)
      const analysis = await analyzeProjectImport(text);
      if (!analysis.isValid) {
        toast.error(analysis.error || 'الملف غير صالح أو لا يحتوي على بنية مشروع صحيحة.');
        return;
      }
      setImportAnalysis(analysis);
      setDuplicatePriceChoice('keep_existing');
    } catch (err: any) {
      toast.error(`فشل قراءة ملف المشروع: ${err.message || 'الملف غير صالح'}`);
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmMerge = async () => {
    if (!importAnalysis) return;
    setIsExecutingMerge(true);
    try {
      // Auto snapshot before merge
      await createAutoBackupSnapshot('قبل استيراد ودمج المشروع');
      const result = await executeProjectImportMerge(importAnalysis, duplicatePriceChoice);
      setLocalSettings(result.mergedSettings);
      toast.success(
        `تم دمج المشروع بنجاح! أضيفت ${result.addedCount} أصناف جديدة، وتحديث ${result.updatedCount} صنف (الإجمالي ${result.totalCount}).`
      );
      setImportAnalysis(null);
      const updatedSnapshots = await getAutoBackupSnapshots();
      setAutoSnapshots(updatedSnapshots);
      onDataResetOrImported();
      onClose();
    } catch (err: any) {
      toast.error(`حدث خطأ أثناء الدمج: ${err.message || 'فشلت العملية'}`);
    } finally {
      setIsExecutingMerge(false);
    }
  };

  const handleRestoreSnapshot = async (snapshotId: string) => {
    const ok = await confirm({
      title: 'استرجاع نسخة احتياطية سابقة',
      message: 'هل أنت متأكد من استرجاع هذه النسخة المحفوظة؟ سيتم استبدال البيانات الحالية ببيانات النسخة مع حفظ لقطة أمان قبل التنفيذ.',
      confirmLabel: 'استرجاع الآن',
    });
    if (!ok) return;

    setIsRestoringSnapshot(true);
    try {
      await createAutoBackupSnapshot('قبل استرجاع نسخة سابقة');
      await restoreAutoBackupSnapshot(snapshotId);
      const updatedSnapshots = await getAutoBackupSnapshots();
      setAutoSnapshots(updatedSnapshots);
      toast.success('تم استرجاع النسخة بنجاح!');
      onDataResetOrImported();
      onClose();
    } catch (err: any) {
      toast.error(`فشل استرجاع النسخة: ${err.message || ''}`);
    } finally {
      setIsRestoringSnapshot(false);
    }
  };

  const handleExecuteReset = async () => {
    if (resetTypedWord.trim() !== 'مسح') {
      toast.warning('يرجى كتابة كلمة "مسح" باللغة العربية بالضبط لتأكيد الحذف.');
      return;
    }
    try {
      await createAutoBackupSnapshot('قبل ابدأ من جديد');
      await clearWorkspaceData();
      setShowResetDialog(false);
      setResetTypedWord('');
      toast.success('تم تفريغ مساحة العمل والبدء من جديد بنجاح.');
      onDataResetOrImported();
      onClose();
    } catch (err: any) {
      toast.error(`حدث خطأ أثناء تفريغ البيانات: ${err.message || ''}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600">
              <Settings size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">إعدادات الكتالوج والمتجر</h3>
              <p className="text-xs text-slate-500">تخصيص الهوية التجارية، العلامة المائية وقواعد البيانات</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 gap-2 bg-slate-50/60 pt-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('identity')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'identity'
                ? 'border-sky-600 text-sky-600 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Building2 size={16} />
            هوية المتجر والشعار
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('watermark')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'watermark'
                ? 'border-sky-600 text-sky-600 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Sliders size={16} />
            العلامة المائية والخلفية
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'system'
                ? 'border-sky-600 text-sky-600 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Database size={16} />
            الموديلات والنسخ الاحتياطي
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-slate-700">
          {/* TAB 1: STORE IDENTITY */}
          {activeTab === 'identity' && (
            <div className="space-y-4">
              <div className="bg-sky-50/70 border border-sky-100 rounded-xl p-3 text-xs text-sky-800 leading-relaxed">
                تظهر هذه البيانات في رأس وتذييل كل صفحة في كتالوج الـ PDF المطبوع. أي حقل تتركه فارغاً لن يظهر في الصفحة ولن يترك مكاناً فارغاً.
              </div>

              {/* Logo & Brand Name on Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">شعار المتجر (Logo):</label>
                  <div className="flex items-center gap-3">
                    {localSettings.logo_url ? (
                      <img
                        src={localSettings.logo_url}
                        alt="Logo"
                        className="w-14 h-14 object-contain rounded-lg border border-slate-200 bg-white p-1"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg border border-dashed border-slate-300 bg-white flex items-center justify-center text-slate-400">
                        <ImageIcon size={20} />
                      </div>
                    )}
                    <div className="space-y-1">
                      <input
                        type="file"
                        ref={logoInputRef}
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                      >
                        {localSettings.logo_url ? 'تغيير الشعار' : 'رفع صورة الشعار'}
                      </button>
                      {localSettings.logo_url && (
                        <button
                          type="button"
                          onClick={() => setLocalSettings((p) => ({ ...p, logo_url: '' }))}
                          className="block text-[11px] text-red-500 hover:underline cursor-pointer"
                        >
                          حذف الشعار
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Option to show brand name on cards (default off) */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localSettings.show_brand_on_card}
                      onChange={(e) =>
                        setLocalSettings((p) => ({ ...p, show_brand_on_card: e.target.checked }))
                      }
                      className="mt-0.5 w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        إظهار اسم الماركة على كروت المنتجات
                      </span>
                      <span className="text-[11px] text-slate-500 block leading-tight">
                        (مطفأ افتراضياً ليظهر الكتالوج باسم متجرك وشعارك الخاص فقط بدون اسم المورد أو الماركة)
                      </span>
                    </div>
                  </label>
                </div>

                {/* Detected image price target: wholesale (default) vs selling */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    السعر المكتوب على الصور هو:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        (localSettings.detected_price_target || 'wholesale') === 'wholesale'
                          ? 'border-sky-500 bg-sky-50/70 text-sky-900 font-bold'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name="detected_price_target"
                        value="wholesale"
                        checked={(localSettings.detected_price_target || 'wholesale') === 'wholesale'}
                        onChange={() =>
                          setLocalSettings((p) => ({ ...p, detected_price_target: 'wholesale' }))
                        }
                        className="mt-0.5 text-sky-600 focus:ring-sky-500 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold block">سعر جملة (افتراضي)</span>
                        <span className="text-[11px] text-slate-500 block leading-tight mt-0.5 font-normal">
                          يوضع في خانة "سعر الجملة" كاقتراح، ويُعلّم بـ "سعر مقروء من الصورة، راجعه".
                        </span>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        localSettings.detected_price_target === 'selling'
                          ? 'border-sky-500 bg-sky-50/70 text-sky-900 font-bold'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name="detected_price_target"
                        value="selling"
                        checked={localSettings.detected_price_target === 'selling'}
                        onChange={() =>
                          setLocalSettings((p) => ({ ...p, detected_price_target: 'selling' }))
                        }
                        className="mt-0.5 text-sky-600 focus:ring-sky-500 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold block">سعر بيع للجمهور</span>
                        <span className="text-[11px] text-slate-500 block leading-tight mt-0.5 font-normal">
                          يوضع في خانة "سعر البيع" مباشرة مع اعتباره سعراً يدوياً مثبتاً.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Company & Bio */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs font-bold text-slate-700">اسم الشركة / المحل:</label>
                    <button
                      type="button"
                      onClick={() =>
                        setLocalSettings((p) => ({
                          ...p,
                          show_company_name: p.show_company_name === false,
                        }))
                      }
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold cursor-pointer whitespace-nowrap ${
                        localSettings.show_company_name !== false
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-slate-100 border-slate-200 text-slate-500'
                      }`}
                    >
                      {localSettings.show_company_name !== false ? <Eye size={11} /> : <EyeOff size={11} />}
                      <span>{localSettings.show_company_name !== false ? 'ظاهر' : 'مخفي'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={localSettings.company_name}
                    onChange={(e) =>
                      setLocalSettings((p) => ({ ...p, company_name: e.target.value, store_name: e.target.value }))
                    }
                    placeholder="مثال: شركة النجم لإكسسوارات المحمول"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs font-bold text-slate-700">عنوان الكتالوج الرئيسي:</label>
                    <button
                      type="button"
                      onClick={() =>
                        setLocalSettings((p) => ({
                          ...p,
                          show_catalog_title: p.show_catalog_title === false,
                        }))
                      }
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold cursor-pointer whitespace-nowrap ${
                        localSettings.show_catalog_title !== false
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-slate-100 border-slate-200 text-slate-500'
                      }`}
                    >
                      {localSettings.show_catalog_title !== false ? <Eye size={11} /> : <EyeOff size={11} />}
                      <span>{localSettings.show_catalog_title !== false ? 'ظاهر' : 'مخفي'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={localSettings.catalog_title}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, catalog_title: e.target.value }))}
                    placeholder="مثال: قائمة أسعار الجملة المعتمدة"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs font-bold text-slate-700">نبذة قصيرة عن النشاط:</label>
                    <button
                      type="button"
                      onClick={() =>
                        setLocalSettings((p) => ({
                          ...p,
                          show_business_bio: p.show_business_bio === false,
                        }))
                      }
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold cursor-pointer whitespace-nowrap ${
                        localSettings.show_business_bio !== false
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-slate-100 border-slate-200 text-slate-500'
                      }`}
                    >
                      {localSettings.show_business_bio !== false ? <Eye size={11} /> : <EyeOff size={11} />}
                      <span>{localSettings.show_business_bio !== false ? 'ظاهر' : 'مخفي'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={localSettings.business_bio}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, business_bio: e.target.value }))}
                    placeholder="مثال: موزع معتمد لأفضل إكسسوارات الهواتف الذكية مع ضمان الاستبدال الفوري"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Contact Information */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Phone size={13} className="text-sky-600" />
                      رقم الهاتف الأساسي:
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setLocalSettings((p) => ({ ...p, show_phone: p.show_phone === false }))
                      }
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold cursor-pointer whitespace-nowrap ${
                        localSettings.show_phone !== false
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-slate-100 border-slate-200 text-slate-500'
                      }`}
                    >
                      {localSettings.show_phone !== false ? <Eye size={11} /> : <EyeOff size={11} />}
                      <span>{localSettings.show_phone !== false ? 'ظاهر' : 'مخفي'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    dir="ltr"
                    value={localSettings.phone}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="010XXXXXXXX"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <MessageCircle size={13} className="text-emerald-600" />
                      رقم الواتساب:
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setLocalSettings((p) => ({ ...p, show_whatsapp: p.show_whatsapp === false }))
                      }
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold cursor-pointer whitespace-nowrap ${
                        localSettings.show_whatsapp !== false
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-slate-100 border-slate-200 text-slate-500'
                      }`}
                    >
                      {localSettings.show_whatsapp !== false ? <Eye size={11} /> : <EyeOff size={11} />}
                      <span>{localSettings.show_whatsapp !== false ? 'ظاهر' : 'مخفي'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    dir="ltr"
                    value={localSettings.whatsapp_number}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, whatsapp_number: e.target.value }))}
                    placeholder="2010XXXXXXXX"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Phone size={13} className="text-slate-500" />
                      هاتف بديل:
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setLocalSettings((p) => ({
                          ...p,
                          show_secondary_phone: p.show_secondary_phone === false,
                        }))
                      }
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold cursor-pointer whitespace-nowrap ${
                        localSettings.show_secondary_phone !== false
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-slate-100 border-slate-200 text-slate-500'
                      }`}
                    >
                      {localSettings.show_secondary_phone !== false ? <Eye size={11} /> : <EyeOff size={11} />}
                      <span>{localSettings.show_secondary_phone !== false ? 'ظاهر' : 'مخفي'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    dir="ltr"
                    value={localSettings.secondary_phone}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, secondary_phone: e.target.value }))}
                    placeholder="011XXXXXXXX"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Extra Mobile Numbers Manager */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Phone size={14} className="text-sky-600" />
                    أرقام موبايلات إضافية ({(localSettings.extra_phones || []).length}):
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next: CompanyPhoneItem = {
                        id: `phone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                        label:
                          (localSettings.extra_phones || []).length === 0
                            ? 'مبيعات'
                            : `موبايل ${(localSettings.extra_phones || []).length + 1}`,
                        number: '',
                        visible: true,
                        is_whatsapp: false,
                      };
                      setLocalSettings((p) => ({
                        ...p,
                        extra_phones: [...(p.extra_phones || []), next],
                      }));
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    <Plus size={13} />
                    إضافة موبايل
                  </button>
                </div>

                {(localSettings.extra_phones || []).length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    يمكنك إضافة عدة أرقام موبايلات مع التحكم في إظهار أو إخفاء كل رقم على حدة.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(localSettings.extra_phones || []).map((ep) => {
                      const isVis = ep.visible !== false;
                      return (
                        <div
                          key={ep.id}
                          className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-white p-2 rounded-xl border border-slate-200"
                        >
                          <input
                            type="text"
                            value={ep.label || ''}
                            onChange={(e) =>
                              setLocalSettings((p) => ({
                                ...p,
                                extra_phones: (p.extra_phones || []).map((item) =>
                                  item.id === ep.id ? { ...item, label: e.target.value } : item
                                ),
                              }))
                            }
                            placeholder="الوصف (مبيعات / فرع)"
                            className="w-28 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                          />
                          <input
                            type="text"
                            dir="ltr"
                            value={ep.number}
                            onChange={(e) =>
                              setLocalSettings((p) => ({
                                ...p,
                                extra_phones: (p.extra_phones || []).map((item) =>
                                  item.id === ep.id ? { ...item, number: e.target.value } : item
                                ),
                              }))
                            }
                            placeholder="01XXXXXXXXX"
                            className="flex-1 min-w-[120px] p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                          />
                          <label className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={Boolean(ep.is_whatsapp)}
                              onChange={(e) =>
                                setLocalSettings((p) => ({
                                  ...p,
                                  extra_phones: (p.extra_phones || []).map((item) =>
                                    item.id === ep.id
                                      ? { ...item, is_whatsapp: e.target.checked }
                                      : item
                                  ),
                                }))
                              }
                              className="rounded text-emerald-600 w-3.5 h-3.5 cursor-pointer"
                            />
                            <span>واتساب</span>
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setLocalSettings((p) => ({
                                ...p,
                                extra_phones: (p.extra_phones || []).map((item) =>
                                  item.id === ep.id ? { ...item, visible: !isVis } : item
                                ),
                              }))
                            }
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold cursor-pointer whitespace-nowrap shrink-0 ${
                              isVis
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : 'bg-slate-100 border-slate-200 text-slate-500'
                            }`}
                          >
                            {isVis ? <Eye size={11} /> : <EyeOff size={11} />}
                            <span>{isVis ? 'ظاهر' : 'مخفي'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setLocalSettings((p) => ({
                                ...p,
                                extra_phones: (p.extra_phones || []).filter((item) => item.id !== ep.id),
                              }))
                            }
                            className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 cursor-pointer shrink-0"
                            title="حذف الرقم"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Address, Email & Tax */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <MapPin size={13} className="text-rose-500" />
                      العنوان:
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setLocalSettings((p) => ({ ...p, show_address: p.show_address === false }))
                      }
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold cursor-pointer whitespace-nowrap ${
                        localSettings.show_address !== false
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-slate-100 border-slate-200 text-slate-500'
                      }`}
                    >
                      {localSettings.show_address !== false ? <Eye size={11} /> : <EyeOff size={11} />}
                      <span>{localSettings.show_address !== false ? 'ظاهر' : 'مخفي'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={localSettings.address}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, address: e.target.value }))}
                    placeholder="المدينة - الشارع"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Mail size={13} className="text-indigo-500" />
                      البريد الإلكتروني:
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setLocalSettings((p) => ({ ...p, show_email: p.show_email === false }))
                      }
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold cursor-pointer whitespace-nowrap ${
                        localSettings.show_email !== false
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-slate-100 border-slate-200 text-slate-500'
                      }`}
                    >
                      {localSettings.show_email !== false ? <Eye size={11} /> : <EyeOff size={11} />}
                      <span>{localSettings.show_email !== false ? 'ظاهر' : 'مخفي'}</span>
                    </button>
                  </div>
                  <input
                    type="email"
                    dir="ltr"
                    value={localSettings.email}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, email: e.target.value }))}
                    placeholder="sales@example.com"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <FileText size={13} className="text-amber-600" />
                      السجل التجاري / الضريبي:
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setLocalSettings((p) => ({
                          ...p,
                          show_tax_or_cr: p.show_tax_or_cr === false,
                        }))
                      }
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold cursor-pointer whitespace-nowrap ${
                        localSettings.show_tax_or_cr !== false
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-slate-100 border-slate-200 text-slate-500'
                      }`}
                    >
                      {localSettings.show_tax_or_cr !== false ? <Eye size={11} /> : <EyeOff size={11} />}
                      <span>{localSettings.show_tax_or_cr !== false ? 'ظاهر' : 'مخفي'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={localSettings.tax_or_cr_number}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, tax_or_cr_number: e.target.value }))}
                    placeholder="س.ت: 12345 (اختياري)"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Footer Note */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    نص التذييل (الفوتر في أسفل كل صفحة):
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setLocalSettings((p) => ({
                        ...p,
                        show_footer_note: p.show_footer_note === false,
                      }))
                    }
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold cursor-pointer whitespace-nowrap ${
                      localSettings.show_footer_note !== false
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-slate-100 border-slate-200 text-slate-500'
                    }`}
                  >
                    {localSettings.show_footer_note !== false ? <Eye size={11} /> : <EyeOff size={11} />}
                    <span>{localSettings.show_footer_note !== false ? 'ظاهر' : 'مخفي'}</span>
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={localSettings.footer_note}
                  onChange={(e) => setLocalSettings((p) => ({ ...p, footer_note: e.target.value }))}
                  placeholder="ملاحظات الشحن، شروط الضمان، أو تاريخ سريان الأسعار"
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>
          )}

          {/* TAB 2: WATERMARK & BACKGROUND */}
          {activeTab === 'watermark' && (
            <div className="space-y-5">
              <div className="bg-sky-50/70 border border-sky-100 rounded-xl p-3 text-xs text-sky-800 leading-relaxed">
                العلامة المائية تعطي للكتالوج مظهراً احترافياً وتحمي صورك وأسعارك. يمكنك اختيار وضع الشعار الكبير في المنتصف أو تكراره مائلاً عبر الصفحة.
              </div>

              {/* Watermark Type Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-2">نوع العلامة المائية في الخلفية:</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'none', label: 'إيقاف العلامة المائية', desc: 'خلفية بيضاء نظيفة بدون علامات' },
                    { id: 'center', label: 'شعار كبير في المنتصف', desc: 'شعار واحد خافت في نص الصفحة' },
                    { id: 'tiled', label: 'شعار مكرر مائل', desc: 'نقشة متكررة ومائلة على كامل الصفحة' },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() =>
                        setLocalSettings((p) => ({ ...p, watermark_type: mode.id as WatermarkType }))
                      }
                      className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                        localSettings.watermark_type === mode.id
                          ? 'border-sky-500 bg-sky-50/60 ring-1 ring-sky-500'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-800">{mode.label}</div>
                      <div className="text-[11px] text-slate-500 mt-1">{mode.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sliders for Opacity and Size (Active only if not 'none') */}
              {localSettings.watermark_type !== 'none' && (
                <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  {/* Layer Selection: Front vs Back */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      ترتيب طبقة الشعار (الظهور بالنسبة للمنتجات):
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {
                          id: 'front' as WatermarkLayer,
                          label: 'طبقة علوية (فوق المنتجات)',
                          desc: 'يظهر الشعار فوق الكروت والصور',
                        },
                        {
                          id: 'back' as WatermarkLayer,
                          label: 'طبقة سفلية (تحت المنتجات)',
                          desc: 'يظهر في الخلفية خلف الكروت',
                        },
                      ].map((opt) => {
                        const isSelected = (localSettings.watermark_layer || 'back') === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              setLocalSettings((p) => ({ ...p, watermark_layer: opt.id }))
                            }
                            className={`p-2.5 rounded-xl border text-right cursor-pointer transition-all ${
                              isSelected
                                ? 'border-sky-500 bg-sky-50 text-sky-950 ring-1 ring-sky-500'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <div className="text-xs font-extrabold">{opt.label}</div>
                            <div className="text-[11px] opacity-75 mt-0.5">{opt.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Opacity Slider: 3% to 100% */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        درجة الشفافية (الوضوح):
                      </label>
                      <span className="text-xs font-bold font-mono bg-sky-100 text-sky-800 px-2 py-0.5 rounded">
                        {Math.round(localSettings.watermark_opacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.03}
                      max={1}
                      step={0.02}
                      value={localSettings.watermark_opacity}
                      onChange={(e) =>
                        setLocalSettings((p) => ({ ...p, watermark_opacity: parseFloat(e.target.value) }))
                      }
                      className="w-full accent-sky-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>3% (خافت جداً)</span>
                      <span>35% (متوسط)</span>
                      <span>100% (واضح كامل)</span>
                    </div>
                  </div>

                  {/* Size Slider: 60px to 600px */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        حجم الشعار في الصفحة:
                      </label>
                      <span className="text-xs font-bold font-mono bg-sky-100 text-sky-800 px-2 py-0.5 rounded">
                        {localSettings.watermark_size} بكسل
                      </span>
                    </div>
                    <input
                      type="range"
                      min={60}
                      max={600}
                      step={10}
                      value={localSettings.watermark_size}
                      onChange={(e) =>
                        setLocalSettings((p) => ({ ...p, watermark_size: parseInt(e.target.value, 10) }))
                      }
                      className="w-full accent-sky-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>60 بكسل (صغير)</span>
                      <span>280 بكسل (افتراضي)</span>
                      <span>600 بكسل (كبير)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Live Preview Box */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-100/70">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Eye size={14} className="text-sky-600" />
                    معاينة حية ومباشرة للعلامة المائية على صفحة الكتالوج:
                  </span>
                  {!localSettings.logo_url && (
                    <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                      يرجى رفع شعار أولاً لتظهر المعاينة
                    </span>
                  )}
                </div>

                <div className="relative w-full h-48 bg-white border border-slate-300 rounded-lg overflow-hidden flex flex-col justify-between p-3 shadow-inner">
                  {/* Simulated Watermark in Box */}
                  {localSettings.logo_url && localSettings.watermark_type === 'center' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
                      <img
                        src={localSettings.logo_url}
                        alt="Watermark Center"
                        style={{
                          width: `${localSettings.watermark_size * 0.4}px`,
                          opacity: localSettings.watermark_opacity,
                        }}
                        className="object-contain"
                      />
                    </div>
                  )}

                  {localSettings.logo_url && localSettings.watermark_type === 'tiled' && (
                    <div
                      className="absolute inset-0 pointer-events-none select-none z-0 overflow-hidden flex flex-wrap gap-8 items-center justify-center -rotate-12 scale-125"
                      style={{ opacity: localSettings.watermark_opacity }}
                    >
                      {Array.from({ length: 12 }).map((_, i) => (
                        <img
                          key={i}
                          src={localSettings.logo_url}
                          alt="Watermark Tile"
                          style={{ width: `${localSettings.watermark_size * 0.25}px` }}
                          className="object-contain"
                        />
                      ))}
                    </div>
                  )}

                  {/* Simulated Page Content on Top */}
                  <div className="relative z-10 flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      {localSettings.logo_url ? (
                        <img src={localSettings.logo_url} className="w-6 h-6 object-contain" alt="" />
                      ) : (
                        <div className="w-6 h-6 bg-slate-200 rounded" />
                      )}
                      <span className="text-xs font-bold text-slate-800">
                        {localSettings.company_name || 'اسم شركتك'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">صفحة 1 من 4</span>
                  </div>

                  <div className="relative z-10 grid grid-cols-3 gap-2 my-auto">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="bg-slate-50/80 border border-slate-200/90 rounded p-2 text-center">
                        <div className="w-8 h-8 bg-slate-200 mx-auto rounded mb-1" />
                        <div className="text-[10px] font-bold text-slate-700">شاحن سريع 30W</div>
                        <div className="text-[9px] text-sky-700 font-bold">120 ج.م</div>
                      </div>
                    ))}
                  </div>

                  <div className="relative z-10 border-t border-slate-100 pt-1 text-center text-[9px] text-slate-400">
                    {[
                      localSettings.show_phone !== false ? localSettings.phone || '010XXXXXXXX' : '',
                      localSettings.show_address !== false ? localSettings.address || 'العنوان المسجل' : '',
                    ]
                      .filter(Boolean)
                      .join(' • ') || 'بيانات التواصل مخفية'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MODELS & SYSTEM */}
          {activeTab === 'system' && (
            <div className="space-y-4">
              {/* Server-side Gemini API status */}
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                  hasServerKey === false
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}
              >
                {hasServerKey === false ? (
                  <ShieldAlert size={17} className="text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <ShieldCheck size={17} className="text-emerald-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <span className="font-bold block">
                    {hasServerKey === null
                      ? 'جاري التحقق من حالة خدمة Gemini على الخادم...'
                      : hasServerKey
                      ? 'الذكاء الاصطناعي مفعل بأمان عبر الخادم (Server-Side Gemini API)'
                      : 'مفتاح GEMINI_API_KEY غير مُعد في بيئة الخادم'}
                  </span>
                  <p className="text-[11px] opacity-85 leading-relaxed">
                    {hasServerKey === false
                      ? 'يرجى إضافة المتغير GEMINI_API_KEY داخل إعدادات أسرار المشروع (Settings > Secrets) في منصة الاستضافة لتفعيل قراءة PDF والصور تلقائياً.'
                      : 'تتم جميع طلبات Gemini من خلال الخادم بشكل آمن دون تخزين أو كشف أي مفاتيح في المتصفح.'}
                  </p>
                </div>
              </div>

              {/* Gemini Model Configuration (Primary & Fallback) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                    <Sparkles size={15} className="text-sky-600" />
                    موديلات الذكاء الاصطناعي (Gemini Models):
                  </h4>
                  <span className="text-[10px] text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full font-mono">
                    x-gemini-model
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  حدد اسم الموديل الأساسي للقراءة والموديل الاحتياطي الذي يعمل تلقائياً عند انشغال الموديل الأساسي.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      اسم الموديل الأساسي:
                    </label>
                    <input
                      type="text"
                      list="gemini-models-list"
                      value={localSettings.primary_model || 'gemini-4-hydrogen'}
                      onChange={(e) =>
                        setLocalSettings((p) => ({ ...p, primary_model: e.target.value.trim() }))
                      }
                      placeholder="gemini-4-hydrogen"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-1 focus:ring-sky-500"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      الافتراضي: <code className="font-mono text-sky-700 font-bold">gemini-4-hydrogen</code>
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      موديل احتياطي (Fallback Model):
                    </label>
                    <input
                      type="text"
                      list="gemini-models-list"
                      value={localSettings.fallback_model || 'gemini-3.1-flash-lite'}
                      onChange={(e) =>
                        setLocalSettings((p) => ({ ...p, fallback_model: e.target.value.trim() }))
                      }
                      placeholder="gemini-3.1-flash-lite"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-1 focus:ring-sky-500"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      الافتراضي: <code className="font-mono text-indigo-700 font-bold">gemini-3.1-flash-lite</code>
                    </span>
                  </div>

                  <datalist id="gemini-models-list">
                    <option value="gemini-4-hydrogen" />
                    <option value="gemini-3.1-flash-lite" />
                  </datalist>
                </div>
              </div>

              {/* Batch Processing Settings */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                  <Sliders size={15} className="text-sky-600" />
                  إعدادات القراءة على دفعات وطلبات Gemini:
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  الدفعة تجمع مجموعة صفحات معاً لتخزينها في المتصفح، بينما يحدد خيار طلب الـ API كم صفحة تُرسل في الطلب الواحد.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Default Batch Size */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      حجم الدفعة (حفظ النتائج معاً):
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={25}
                        value={localSettings.default_batch_size || 5}
                        onChange={(e) =>
                          setLocalSettings((p) => ({
                            ...p,
                            default_batch_size: Math.max(1, Number(e.target.value) || 5),
                          }))
                        }
                        className="w-20 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-center focus:ring-1 focus:ring-sky-500"
                      />
                      <span className="text-[11px] text-slate-500">صفحات بالدفعة (افتراضي: 5)</span>
                    </div>
                  </div>

                  {/* Pages per API request (1 or 2, default 1) */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      صفحات في الطلب الواحد لـ Gemini:
                    </label>
                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setLocalSettings((p) => ({ ...p, pages_per_request: 1 }))}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                          (localSettings.pages_per_request || 1) === 1
                            ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        1 صفحة (افتراضي)
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocalSettings((p) => ({ ...p, pages_per_request: 2 }))}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                          localSettings.pages_per_request === 2
                            ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        2 صفحتان (أقصى حد)
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-1">
                      لا يمكن إرسال أكثر من صفحتين في طلب واحد لضمان الدقة.
                    </span>
                  </div>

                  {/* Daily Request Limit */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-700">
                        حد الطلبات اليومي لـ Gemini (يوقف المعالجة عند الوصول إليه):
                      </label>
                      <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                        افتراضي: 20 طلب
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={1500}
                        value={localSettings.daily_request_limit || 20}
                        onChange={(e) =>
                          setLocalSettings((p) => ({
                            ...p,
                            daily_request_limit: Math.max(1, Number(e.target.value) || 20),
                          }))
                        }
                        className="w-24 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-center focus:ring-1 focus:ring-sky-500"
                      />
                      <span className="text-xs text-slate-500">
                        طلب يومياً. إذا وصلت لهذا الحد يتوقف التطبيق تلقائياً لحماية حسابك من التكلفة الزائدة.
                      </span>
                    </div>
                  </div>

                  {/* Minimum Profit Margin Threshold for Review & Supplier Warnings */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-700">
                        حد التحذير الأدنى لهامش الربح (%):
                      </label>
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        افتراضي: 10%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={90}
                        value={localSettings.min_profit_margin_percent ?? 10}
                        onChange={(e) =>
                          setLocalSettings((p) => ({
                            ...p,
                            min_profit_margin_percent: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-24 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-center focus:ring-1 focus:ring-emerald-500"
                      />
                      <span className="text-xs text-slate-500">
                        % — يظهر تحذير في شاشة "مراجعة" ومقارنة الموردين لأي صنف هامش ربحه أقل من هذا الحد.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Gemini API Token Costs & Monthly Budget */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                  <Sparkles size={15} className="text-indigo-600" />
                  أسعار توكن Gemini والميزانية الشهرية:
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  لحساب التكلفة التقديرية بالجنيه المصري ومتابعة الاستهلاك مع التنبيه عند 80% وإيقاف المعالجة عند 100%.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      سعر 1M توكن مدخل ($):
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={localSettings.gemini_input_cost_per_million_usd ?? 0.1}
                      onChange={(e) =>
                        setLocalSettings((p) => ({
                          ...p,
                          gemini_input_cost_per_million_usd: Number(e.target.value) || 0,
                        }))
                      }
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      سعر 1M توكن مخرج ($):
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={localSettings.gemini_output_cost_per_million_usd ?? 0.4}
                      onChange={(e) =>
                        setLocalSettings((p) => ({
                          ...p,
                          gemini_output_cost_per_million_usd: Number(e.target.value) || 0,
                        }))
                      }
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      سعر صرف الدولار (ج.م):
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={localSettings.usd_to_egp_rate ?? 50}
                      onChange={(e) =>
                        setLocalSettings((p) => ({
                          ...p,
                          usd_to_egp_rate: Number(e.target.value) || 50,
                        }))
                      }
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      الميزانية الشهرية (ج.م):
                    </label>
                    <input
                      type="number"
                      step="50"
                      value={localSettings.monthly_budget_egp ?? 500}
                      onChange={(e) =>
                        setLocalSettings((p) => ({
                          ...p,
                          monthly_budget_egp: Number(e.target.value) || 0,
                        }))
                      }
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-center"
                    />
                  </div>
                </div>
              </div>

              {/* Backup & Restore Section */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                  <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                    <Database size={15} className="text-sky-600" />
                    النسخ الاحتياطي وحماية البيانات:
                  </h4>
                  <div className="text-[11px] text-slate-600 flex items-center gap-1 font-medium">
                    <span>تاريخ آخر نسخة:</span>
                    <strong className="text-slate-800 font-bold">
                      {localSettings.last_backup_date
                        ? new Intl.DateTimeFormat('ar-EG', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(localSettings.last_backup_date)
                        : 'لم يتم أخذ نسخة حتى الآن'}
                    </strong>
                  </div>
                </div>

                {/* Persistent Storage Status & Action */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <HardDrive
                      size={18}
                      className={isPersistent ? 'text-emerald-600' : 'text-amber-500'}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">حالة التخزين في المتصفح:</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isPersistent
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isPersistent ? 'تخزين دائم مضمون (Persistent)' : 'تخزين عادي (مؤقت)'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        التخزين الدائم يمنع المتصفح من تفريغ بيانات الأصناف والكتالوجات عند انخفاض مساحة القرص.
                      </p>
                    </div>
                  </div>

                  {!isPersistent && (
                    <button
                      type="button"
                      onClick={handleRequestStoragePersistence}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold shrink-0 transition-colors cursor-pointer"
                    >
                      طلب تفعيل التخزين الدائم
                    </button>
                  )}
                </div>

                {/* Security Assurance Banner */}
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-start gap-2.5">
                  <ShieldCheck size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold text-emerald-900 text-xs flex items-center gap-1">
                      حماية أمنية مشددة: بدون مفاتيح API نهائياً
                    </span>
                    <p className="text-[11px] text-emerald-700 leading-relaxed">
                      يُمنع منعاً باتاً تصدير أي مفاتيح API داخل ملفات المشروع لحماية حسابك من التسريب. عند استيراد أي مشروع، يتم دمج المنتجات والكتالوجات فقط دون المساس بمفاتيحك الحالية المسجلة في هذا الجهاز.
                    </p>
                  </div>
                </div>

                {/* Action Buttons for Export / Import JSON */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    className="flex items-center justify-center gap-2 p-2.5 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs border border-slate-200 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Download size={15} className="text-sky-600" />
                    تصدير نسخة احتياطية (JSON)
                  </button>

                  <input
                    type="file"
                    ref={backupInputRef}
                    onChange={handleImportBackup}
                    accept=".json"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => backupInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 p-2.5 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs border border-slate-200 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Upload size={15} className="text-emerald-600" />
                    استيراد مشروع كامل
                  </button>
                </div>

                {/* Internal Browser Snapshots (Last 5) */}
                <div className="p-3 bg-slate-100/70 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <History size={14} className="text-indigo-600" />
                      النسخ التلقائية المحفوظة بالمتصفح (آخر 5 نسخ):
                    </h5>
                    <span className="text-[10px] text-slate-500 font-bold">
                      {autoSnapshots.length} من 5 نسخ
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    يحفظ النظام تلقائياً لقطة كاملة لقاعدتك قبل أي عملية خطيرة كحبل نجاة فوري.
                  </p>

                  {autoSnapshots.length === 0 ? (
                    <div className="p-3 bg-white rounded-lg text-center text-slate-400 text-xs border border-slate-200">
                      لا توجد نسخ تلقائية بعد (تنشأ تلقائياً قبل الحذف أو الاستيراد).
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {autoSnapshots.map((snap) => (
                        <div
                          key={snap.id}
                          className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-800 block">{snap.reason}</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {new Intl.DateTimeFormat('ar-EG', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              }).format(snap.timestamp)}{' '}
                              • {snap.products_count} صنف • {snap.catalogs_count} كتالوج
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRestoreSnapshot(snap.id)}
                            disabled={isRestoringSnapshot}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-md text-[11px] border border-indigo-200 transition-colors cursor-pointer"
                          >
                            استرجاع
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Danger Zone: Reset / Start Over */}
              <div className="p-4 bg-red-50/60 border border-red-200 rounded-xl space-y-2">
                <h4 className="font-bold text-red-900 text-xs flex items-center gap-1.5">
                  <Trash2 size={14} className="text-red-600" />
                  منطقة العمليات الحساسة (ابدأ من جديد):
                </h4>
                <p className="text-xs text-red-700 leading-relaxed">
                  مسح كل الأصناف المخزنة والبدء من جديد. محمي بحفظ تلقائي للنسخة الاحتياطية وكتابة كلمة تأكيد.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setResetTypedWord('');
                      setShowResetDialog(true);
                    }}
                    className="py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    <Trash2 size={14} />
                    ابدأ من جديد
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 bg-slate-50/50">
          <div>
            {isSavedNotice && (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                <Check size={16} /> تم حفظ الإعدادات بنجاح!
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSaveAllSettings}
              className="py-2 px-5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              <Check size={16} />
              حفظ جميع الإعدادات
            </button>
          </div>
        </div>
        {/* Pre-Import Merge Summary Modal (Requirement 5) */}
        {importAnalysis && (
          <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden text-right" dir="rtl">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-sky-50/60">
                <div className="flex items-center gap-2 text-sky-800">
                  <Database size={18} className="text-sky-600" />
                  <h3 className="font-bold text-sm">ملخص استيراد ودمج المشروع</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setImportAnalysis(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-4 overflow-y-auto text-xs text-slate-700">
                {/* Statistics Cards */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-[11px] text-slate-500">إجمالي في الملف</div>
                    <div className="text-lg font-bold text-slate-800 font-mono mt-0.5">
                      {importAnalysis.totalImported}
                    </div>
                  </div>
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <div className="text-[11px] text-emerald-600 font-medium">أصناف جديدة</div>
                    <div className="text-lg font-bold text-emerald-700 font-mono mt-0.5">
                      +{importAnalysis.newProducts.length}
                    </div>
                  </div>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="text-[11px] text-amber-700 font-medium">أصناف مكررة</div>
                    <div className="text-lg font-bold text-amber-800 font-mono mt-0.5">
                      {importAnalysis.duplicateProducts.length}
                    </div>
                  </div>
                </div>

                {/* Merge Policy for Duplicates */}
                {importAnalysis.duplicateProducts.length > 0 ? (
                  <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3">
                    <div className="font-bold text-amber-900 flex items-center gap-1.5">
                      <AlertTriangle size={15} className="text-amber-600" />
                      تحديد سياسة تسعير الأصناف المكررة بالكود:
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      تم العثور على {importAnalysis.duplicateProducts.length} صنف بنفس كود الصنف موجود مسبقاً في قاعدة بياناتك. اختر السعر المطلوب اعتماده:
                    </p>

                    <div className="space-y-2">
                      <label className="flex items-start gap-2.5 p-2.5 bg-white border border-amber-200 rounded-lg cursor-pointer hover:bg-amber-50/30 transition-colors">
                        <input
                          type="radio"
                          name="duplicateChoice"
                          value="keep_existing"
                          checked={duplicatePriceChoice === 'keep_existing'}
                          onChange={() => setDuplicatePriceChoice('keep_existing')}
                          className="mt-0.5 text-sky-600 focus:ring-sky-500"
                        />
                        <div className="space-y-0.5">
                          <span className="font-bold text-slate-800">
                            الاحتفاظ بالأسعار الحالية (الموصى به)
                          </span>
                          <p className="text-[11px] text-slate-500">
                            تجاهل أسعار الملف المستورد للأصناف المتطابقة كودياً، وإضافة الأصناف الجديدة فقط.
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 p-2.5 bg-white border border-amber-200 rounded-lg cursor-pointer hover:bg-amber-50/30 transition-colors">
                        <input
                          type="radio"
                          name="duplicateChoice"
                          value="use_incoming"
                          checked={duplicatePriceChoice === 'use_incoming'}
                          onChange={() => setDuplicatePriceChoice('use_incoming')}
                          className="mt-0.5 text-sky-600 focus:ring-sky-500"
                        />
                        <div className="space-y-0.5">
                          <span className="font-bold text-slate-800">
                            تحديث بالأسعار الجديدة من الملف
                          </span>
                          <p className="text-[11px] text-slate-500">
                            استبدال سعر البيع والجملة للأصناف المتطابقة بالأسعار الواردة في الملف المستورد.
                          </p>
                        </div>
                      </label>
                    </div>

                    {/* Preview Duplicates */}
                    <div className="mt-2 pt-2 border-t border-amber-200 max-h-36 overflow-y-auto space-y-1.5">
                      <div className="text-[11px] font-bold text-amber-900">معاينة بعض الأصناف المكررة:</div>
                      {importAnalysis.duplicateProducts.slice(0, 10).map((dup, i) => (
                        <div key={i} className="flex items-center justify-between p-1.5 bg-white rounded border border-amber-100 text-[11px]">
                          <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                            <span className="font-mono font-bold text-slate-700">[{dup.code}]</span>
                            <span className="truncate">{dup.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-slate-500">الحالي: {dup.existingSellingPrice} ج.م</span>
                            <span>←</span>
                            <span className="font-bold text-emerald-600">المستورد: {dup.incomingSellingPrice} ج.م</span>
                          </div>
                        </div>
                      ))}
                      {importAnalysis.duplicateProducts.length > 10 && (
                        <div className="text-[10px] text-center text-amber-700">
                          و {importAnalysis.duplicateProducts.length - 10} أصناف أخرى...
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs">
                    جميع الأصناف في الملف جديدة تماماً ولا يوجد أي تطابق أو تكرار في الأكواد.
                  </div>
                )}

                {/* Additional Information */}
                <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  • سيتم أيضاً دمج الأقسام والتصنيفات الجديدة تلقائياً.<br />
                  • مفاتيح API الخاصة بك على هذا الجهاز لن تتأثر ولن يتم استبدالها إطلاقاً.
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setImportAnalysis(null)}
                  disabled={isExecutingMerge}
                  className="py-2 px-4 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMerge}
                  disabled={isExecutingMerge}
                  className="py-2 px-5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
                >
                  {isExecutingMerge ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      جاري الدمج...
                    </>
                  ) : (
                    <>
                      <Check size={15} />
                      تأكيد دمج المشروع
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Reset / Start Over Confirmation Modal (Feature 3) */}
        {showResetDialog && (
          <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 text-right space-y-4 animate-in fade-in zoom-in-95"
              dir="rtl"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <AlertTriangle size={26} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-red-950">ابدأ من جديد (مسح البيانات)</h3>
                  <p className="text-xs text-red-700">عملية حساسة ولا يمكن التراجع عنها بعد التنفيذ.</p>
                </div>
              </div>

              <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2 text-xs text-red-900 leading-relaxed">
                <p>
                  <strong>تنبيه:</strong> سيتم حذف جميع الأصناف المسجلة حالياً وعددهم:{' '}
                  <span className="font-bold text-red-700 text-sm">{totalProductsCount} صنف</span>.
                </p>
                <p className="text-[11px] text-red-700">
                  سيقوم النظام تلقائياً بحفظ لقطة في المتصفح قبل المسح، ولكن ننصح بشدة بتنزيل نسخة احتياطية أولاً على جهازك.
                </p>
              </div>

              {/* Download Backup First Button */}
              <div>
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-xl text-xs border border-emerald-300 transition-colors cursor-pointer shadow-2xs"
                >
                  <Download size={15} />
                  نزّل نسخة الأول (احتياطياً)
                </button>
              </div>

              {/* Requirement: Type "مسح" in Arabic to enable deletion */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-xs font-bold text-slate-800">
                  لتأكيد الحذف، اكتب كلمة <span className="text-red-600 font-extrabold text-sm">&quot;مسح&quot;</span> في الحقل أدناه:
                </label>
                <input
                  type="text"
                  placeholder='اكتب كلمة "مسح"'
                  value={resetTypedWord}
                  onChange={(e) => setResetTypedWord(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-center focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowResetDialog(false);
                    setResetTypedWord('');
                  }}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  إلغاء وتراجع
                </button>
                <button
                  type="button"
                  onClick={handleExecuteReset}
                  disabled={resetTypedWord.trim() !== 'مسح'}
                  className="py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <Trash2 size={14} />
                  مسح وابدأ من جديد
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
