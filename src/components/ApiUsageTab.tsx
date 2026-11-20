import React, { useState, useMemo, useEffect } from 'react';
import { ApiUsageLog, CatalogSettings } from '../types';
import { saveSettings, clearApiUsageLogs } from '../utils/db';
import { useUiFeedback } from './UiFeedbackProvider';
import {
  Coins,
  TrendingUp,
  Calendar,
  Clock,
  Download,
  Trash2,
  SlidersHorizontal,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Search,
  Zap,
  Server,
  RefreshCw,
  Cpu,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

interface ApiUsageTabProps {
  logs: ApiUsageLog[];
  settings: CatalogSettings;
  onSettingsUpdated: (newSettings: CatalogSettings) => void;
  onLogsCleared: () => void;
}

export const ApiUsageTab: React.FC<ApiUsageTabProps> = ({
  logs,
  settings,
  onSettingsUpdated,
  onLogsCleared,
}) => {
  const { toast, confirm } = useUiFeedback();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCostSettingsModal, setShowCostSettingsModal] = useState(false);
  const [hasServerKey, setHasServerKey] = useState<boolean | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setHasServerKey(Boolean(data.hasServerKey)))
      .catch(() => setHasServerKey(false));
  }, []);

  const handleTestServerConnection = async () => {
    setIsTestingConnection(true);
    setConnectionResult(null);
    try {
      const res = await fetch('/api/gemini/test-key');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setHasServerKey(true);
        setConnectionResult({
          success: true,
          message: data.message || 'اتصال الخادم بـ Gemini API يعمل بشكل سليم.',
        });
        toast.success('اتصال الخادم بـ Gemini API يعمل بنجاح.');
      } else {
        setConnectionResult({
          success: false,
          message: data.friendlyMessage || data.error || 'تعذر الاتصال بخدمة Gemini على الخادم.',
        });
        toast.error(data.friendlyMessage || 'تعذر الاتصال بخدمة Gemini على الخادم.');
      }
    } catch {
      setConnectionResult({
        success: false,
        message: 'تعذر الوصول إلى الخادم لاختبار الاتصال.',
      });
      toast.error('تعذر الوصول إلى الخادم.');
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Settings for cost calculation
  const inputRate = settings.gemini_input_cost_per_million_usd ?? 0.10;
  const outputRate = settings.gemini_output_cost_per_million_usd ?? 0.40;
  const usdToEgp = settings.usd_to_egp_rate ?? 50.0;
  const monthlyBudget = settings.monthly_budget_egp ?? 500;

  // Form states for settings modal
  const [tempInputRate, setTempInputRate] = useState(inputRate);
  const [tempOutputRate, setTempOutputRate] = useState(outputRate);
  const [tempUsdToEgp, setTempUsdToEgp] = useState(usdToEgp);
  const [tempMonthlyBudget, setTempMonthlyBudget] = useState(monthlyBudget);
  const [tempDailyLimit, setTempDailyLimit] = useState(settings.daily_request_limit || 20);

  // Time boundaries
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  // Metrics calculation
  const metrics = useMemo(() => {
    let todayTokens = 0;
    let todayCostEgp = 0;
    let todayCostUsd = 0;
    let monthTokens = 0;
    let monthCostEgp = 0;
    let monthCostUsd = 0;
    let totalTokens = 0;
    let totalCostEgp = 0;
    let totalCostUsd = 0;

    let todayRequestsCount = 0;
    let todayOverloadedCount = 0;

    for (const log of logs) {
      if (log.success !== false) {
        totalTokens += log.total_tokens || 0;
        totalCostEgp += log.cost_egp || 0;
        totalCostUsd += log.cost_usd || 0;
      }

      if (log.timestamp >= startOfToday) {
        // Do not count failed attempts due to 503 / timeout in today's request count
        if (log.success !== false) {
          todayTokens += log.total_tokens || 0;
          todayCostEgp += log.cost_egp || 0;
          todayCostUsd += log.cost_usd || 0;
          todayRequestsCount += 1;
        } else {
          todayOverloadedCount += 1;
        }
      }

      if (log.timestamp >= startOfMonth && log.success !== false) {
        monthTokens += log.total_tokens || 0;
        monthCostEgp += log.cost_egp || 0;
        monthCostUsd += log.cost_usd || 0;
      }
    }

    const budgetPercent = monthlyBudget > 0 ? (monthCostEgp / monthlyBudget) * 100 : 0;
    const remainingBudgetEgp = Math.max(0, monthlyBudget - monthCostEgp);
    const dailyLimit = settings.daily_request_limit || 20;
    const remainingDailyRequests = Math.max(0, dailyLimit - todayRequestsCount);
    const dailyPercent = dailyLimit > 0 ? (todayRequestsCount / dailyLimit) * 100 : 0;
    const isDailyLimitReached = todayRequestsCount >= dailyLimit;

    return {
      todayTokens,
      todayCostEgp,
      todayCostUsd,
      todayRequestsCount,
      todayOverloadedCount,
      dailyLimit,
      remainingDailyRequests,
      dailyPercent,
      isDailyLimitReached,
      monthTokens,
      monthCostEgp,
      monthCostUsd,
      remainingBudgetEgp,
      totalTokens,
      totalCostEgp,
      totalCostUsd,
      budgetPercent,
      isBudget80: budgetPercent >= 80 && budgetPercent < 100,
      isBudget100: budgetPercent >= 100,
    };
  }, [logs, startOfToday, startOfMonth, monthlyBudget, settings.daily_request_limit]);

  // Breakdown by model
  const modelBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        model: string;
        successCount: number;
        failedCount: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        totalCostUsd: number;
        totalCostEgp: number;
        lastUsed: number;
      }
    >();

    for (const log of logs) {
      const m = log.model || settings.primary_model || 'gemini-4-hydrogen';
      const cur = map.get(m) || {
        model: m,
        successCount: 0,
        failedCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        totalCostEgp: 0,
        lastUsed: log.timestamp,
      };

      if (log.success === false) {
        cur.failedCount += 1;
      } else {
        cur.successCount += 1;
        cur.inputTokens += log.input_tokens || 0;
        cur.outputTokens += log.output_tokens || 0;
        cur.totalTokens += log.total_tokens || 0;
        cur.totalCostUsd += log.cost_usd || 0;
        cur.totalCostEgp += log.cost_egp || 0;
      }
      if (log.timestamp > cur.lastUsed) cur.lastUsed = log.timestamp;

      map.set(m, cur);
    }

    return Array.from(map.values()).sort((a, b) => b.lastUsed - a.lastUsed);
  }, [logs, settings.primary_model]);

  // Breakdown by file
  const fileBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        fileName: string;
        requestCount: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        totalCostEgp: number;
        lastUsed: number;
      }
    >();

    for (const log of logs) {
      const name = log.file_name || 'ملف غير معروف';
      const cur = map.get(name) || {
        fileName: name,
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        totalCostEgp: 0,
        lastUsed: log.timestamp,
      };

      cur.requestCount += 1;
      cur.inputTokens += log.input_tokens || 0;
      cur.outputTokens += log.output_tokens || 0;
      cur.totalTokens += log.total_tokens || 0;
      cur.totalCostEgp += log.cost_egp || 0;
      if (log.timestamp > cur.lastUsed) cur.lastUsed = log.timestamp;

      map.set(name, cur);
    }

    return Array.from(map.values()).sort((a, b) => b.lastUsed - a.lastUsed);
  }, [logs]);

  // Filtered raw logs
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter((l) =>
      l.file_name.toLowerCase().includes(q) ||
      l.model.toLowerCase().includes(q) ||
      (l.key_name && l.key_name.toLowerCase().includes(q))
    );
  }, [logs, searchQuery]);

  // Save cost settings
  const handleSaveCostSettings = async () => {
    const newSettings: CatalogSettings = {
      ...settings,
      gemini_input_cost_per_million_usd: tempInputRate,
      gemini_output_cost_per_million_usd: tempOutputRate,
      usd_to_egp_rate: tempUsdToEgp,
      monthly_budget_egp: tempMonthlyBudget,
      daily_request_limit: tempDailyLimit,
    };
    await saveSettings(newSettings);
    onSettingsUpdated(newSettings);
    setShowCostSettingsModal(false);
  };

  // Export CSV
  const handleExportCsv = () => {
    if (logs.length === 0) return;

    const headers = [
      'التاريخ والوقت',
      'اسم الملف',
      'الدفعة / الصفحة',
      'المفتاح المستخدم',
      'الموديل',
      'Input Tokens',
      'Output Tokens',
      'Total Tokens',
      'التكلفة بالدولار ($)',
      'التكلفة بالجنيه (ج.م)',
    ];

    const rows = logs.map((l) => [
      new Date(l.timestamp).toLocaleString('ar-EG'),
      `"${(l.file_name || '').replace(/"/g, '""')}"`,
      l.batch_number ? `دفعة ${l.batch_number}` : `صفحة ${l.page_number || 1}`,
      `"${(l.key_name || 'افتراضي').replace(/"/g, '""')}"`,
      l.model || 'gemini-4-hydrogen',
      l.input_tokens || 0,
      l.output_tokens || 0,
      l.total_tokens || 0,
      (l.cost_usd || 0).toFixed(6),
      (l.cost_egp || 0).toFixed(4),
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `سجل_استهلاك_Gemini_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  // Clear logs confirmation
  const handleClearLogs = async () => {
    const ok = await confirm({
      title: 'مسح سجل الاستهلاك',
      message: 'هل تريد مسح سجل الاستهلاك المحفوظ؟ لا يمكن التراجع عن هذا الإجراء.',
      confirmLabel: 'مسح السجل',
      danger: true,
    });
    if (ok) {
      await clearApiUsageLogs();
      onLogsCleared();
      toast.success('تم مسح سجل الاستهلاك.');
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Daily Request Limit Banner */}
      {metrics.isDailyLimitReached && (
        <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-900 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-700 shrink-0 font-bold">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h4 className="font-bold text-sm">
                تم الوصول لحد الطلبات اليومي المحدد ({metrics.todayRequestsCount} من أصل {metrics.dailyLimit} طلب اليوم)
              </h4>
              <p className="text-xs text-rose-700 mt-0.5">
                تتوقف المعالجة التلقائية تلقائياً لحماية حسابك من الاستهلاك المفاجئ. يمكنك زيادة حد الطلبات من الإعدادات أو استكمال القراءة غداً.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCostSettingsModal(true)}
            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shrink-0 transition-colors cursor-pointer"
          >
            تعديل الحد اليومي
          </button>
        </div>
      )}

      {/* Budget Warning Banner if 80% or 100% */}
      {metrics.isBudget100 && (
        <div className="p-4 bg-red-50 border-2 border-red-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-red-900 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-700 shrink-0 font-bold">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h4 className="font-bold text-sm">
                تنبيه: تم الوصول للحد الشهري المحدد بالكامل (100% - {metrics.monthCostEgp.toFixed(2)} ج.م من أصل {monthlyBudget} ج.م)
              </h4>
              <p className="text-xs text-red-700 mt-0.5">
                تتوقف المعالجة التلقائية لحماية رصيدك. يمكنك زيادة الحد الشهري أو متابعة المعالجة يدوياً.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCostSettingsModal(true)}
            className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shrink-0 transition-colors cursor-pointer"
          >
            تعديل الحد الشهري
          </button>
        </div>
      )}

      {metrics.isBudget80 && !metrics.isBudget100 && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800 shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h4 className="font-bold text-xs">
                تنبيه: استهلاك الشهر الحالي وصل إلى {metrics.budgetPercent.toFixed(0)}% من الحد المخصص ({metrics.monthCostEgp.toFixed(2)} ج.م من {monthlyBudget} ج.م)
              </h4>
              <p className="text-[11px] text-amber-800 mt-0.5">
                اقتربت من استهلاك الحد الشهري المحدد في الإعدادات.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCostSettingsModal(true)}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shrink-0 transition-colors cursor-pointer"
          >
            إعدادات الأسعار
          </button>
        </div>
      )}

      {/* Top Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
            <Coins size={20} className="text-sky-600" />
            شاشة استهلاك وحساب تكلفة الذكاء الاصطناعي (Gemini)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            متابعة دقيقة لكل توكن يُستهلك بالدولار والجنيه، مع عداد طلبات اليوم والتحكم بالحدود والميزانية.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowCostSettingsModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            <SlidersHorizontal size={14} />
            <span>أسعار التوكن والحدود</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <Download size={14} />
            <span>تصدير السجل CSV</span>
          </button>

          {logs.length > 0 && (
            <button
              onClick={handleClearLogs}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
              title="مسح سجل الاستهلاك"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Server Connection Status & Remaining Daily Quota Panel */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                hasServerKey === false
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              <Server size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xs sm:text-sm font-black text-slate-800">
                  حالة خدمة الذكاء الاصطناعي على الخادم (Server-Side API)
                </h3>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    hasServerKey === null
                      ? 'bg-slate-100 text-slate-600'
                      : hasServerKey
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {hasServerKey === null ? (
                    'جاري الفحص...'
                  ) : hasServerKey ? (
                    <>
                      <ShieldCheck size={12} /> متصل وجاهز للقراءة
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={12} /> غير مُعد على الخادم
                    </>
                  )}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                تُدار مفاتيح Gemini بأمان من الخادم عبر متغيرات البيئة (Secrets / .env) دون تخزينها في المتصفح.
                الموديل الأساسي: <span className="font-mono font-bold text-sky-700">{settings.primary_model || 'gemini-4-hydrogen'}</span>
                {' • '}
                الاحتياطي: <span className="font-mono font-bold text-indigo-700">{settings.fallback_model || 'gemini-3.1-flash-lite'}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestServerConnection}
            disabled={isTestingConnection}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 disabled:opacity-60"
          >
            <RefreshCw size={14} className={isTestingConnection ? 'animate-spin' : ''} />
            <span>{isTestingConnection ? 'جاري الاختبار...' : 'فحص اتصال API'}</span>
          </button>
        </div>

        {connectionResult && (
          <div
            className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
              connectionResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {connectionResult.success ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            <span>{connectionResult.message}</span>
          </div>
        )}
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today Used vs Remaining */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">استهلاك وطلبات اليوم</span>
            <Clock size={16} className="text-sky-600" />
          </div>
          <div className="text-xl font-black text-slate-800">
            {metrics.todayCostEgp.toFixed(2)} <span className="text-xs font-normal text-slate-500">ج.م</span>
            <span className="text-[11px] font-mono text-slate-400 mr-2">(${metrics.todayCostUsd.toFixed(4)})</span>
          </div>
          <div className="flex items-center justify-between text-xs font-bold mt-2 pt-2 border-t border-slate-100">
            <span className="text-slate-600">المتبقي اليوم:</span>
            <span
              className={`px-2 py-0.5 rounded-full font-mono text-[11px] ${
                metrics.isDailyLimitReached
                  ? 'bg-rose-100 text-rose-700 font-black'
                  : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {metrics.remainingDailyRequests} من {metrics.dailyLimit} متبقي
            </span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                metrics.isDailyLimitReached ? 'bg-rose-500' : 'bg-sky-500'
              }`}
              style={{ width: `${Math.min(100, metrics.dailyPercent)}%` }}
            />
          </div>
          {metrics.todayOverloadedCount > 0 && (
            <div className="text-[10px] text-amber-700 font-medium mt-1.5 bg-amber-50 rounded px-1.5 py-0.5 border border-amber-200">
              +{metrics.todayOverloadedCount} محاولة ملغاة لضغط مؤقت (لم تُحسب)
            </div>
          )}
          <div className="text-[11px] text-slate-500 font-mono mt-1.5">
            {metrics.todayRequestsCount} طلب ناجح • {metrics.todayTokens.toLocaleString('en-US')} Tokens
          </div>
        </div>

        {/* Card 2: This Month */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">الشهر الحالي</span>
            <Calendar size={16} className="text-indigo-600" />
          </div>
          <div className="text-xl font-black text-slate-800">
            {metrics.monthCostEgp.toFixed(2)} <span className="text-xs font-normal text-slate-500">ج.م</span>
            <span className="text-[11px] font-mono text-slate-400 mr-2">(${metrics.monthCostUsd.toFixed(4)})</span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-2 pt-2 border-t border-slate-100">
            {metrics.monthTokens.toLocaleString('en-US')} Tokens
          </div>
        </div>

        {/* Card 3: Monthly Budget Progress & Remaining */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">المتبقي من الميزانية</span>
            <TrendingUp size={16} className="text-emerald-600" />
          </div>
          <div className="text-xl font-black text-slate-800">
            {metrics.remainingBudgetEgp.toFixed(1)} <span className="text-xs font-normal text-slate-500">ج.م من {monthlyBudget}</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                metrics.budgetPercent >= 100
                  ? 'bg-red-600'
                  : metrics.budgetPercent >= 80
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(2, metrics.budgetPercent))}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-400 mt-1.5 block">
            تم استهلاك {metrics.budgetPercent.toFixed(1)}% من الميزانية الشهرية
          </span>
        </div>

        {/* Card 4: Total All Time */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">الإجمالي الكلي</span>
            <Zap size={16} className="text-amber-500" />
          </div>
          <div className="text-xl font-black text-slate-800">
            {metrics.totalCostEgp.toFixed(2)} <span className="text-xs font-normal text-slate-500">ج.م</span>
            <span className="text-[11px] font-mono text-slate-400 mr-2">(${metrics.totalCostUsd.toFixed(4)})</span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-2 pt-2 border-t border-slate-100">
            {metrics.totalTokens.toLocaleString('en-US')} Tokens ({logs.length} طلب)
          </div>
        </div>
      </div>

      {/* Breakdown by Model Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="font-bold text-slate-800 text-xs sm:text-sm flex items-center gap-2">
            <Cpu size={16} className="text-indigo-600" />
            الاستهلاك حسب الموديل ({modelBreakdown.length} موديل)
          </h3>
        </div>

        {modelBreakdown.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs">
            لم يتم تسجيل استخدام أي موديل بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">الموديل</th>
                  <th className="py-2.5 px-3">طلبات ناجحة</th>
                  <th className="py-2.5 px-3">Input Tokens</th>
                  <th className="py-2.5 px-3">Output Tokens</th>
                  <th className="py-2.5 px-3">إجمالي التوكن</th>
                  <th className="py-2.5 px-3">التكلفة ($)</th>
                  <th className="py-2.5 px-3">التكلفة (ج.م)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {modelBreakdown.map((item) => (
                  <tr key={item.model} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{item.model}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">
                      {item.successCount}
                      {item.failedCount > 0 && (
                        <span className="text-[10px] text-amber-600 mr-1">({item.failedCount} ملغى)</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{item.inputTokens.toLocaleString('en-US')}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{item.outputTokens.toLocaleString('en-US')}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{item.totalTokens.toLocaleString('en-US')}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">${item.totalCostUsd.toFixed(4)}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">{item.totalCostEgp.toFixed(2)} ج.م</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Breakdown by File Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="font-bold text-slate-800 text-xs sm:text-sm flex items-center gap-2">
            <FileText size={16} className="text-sky-600" />
            استهلاك وتكلفة كل ملف على حدة ({fileBreakdown.length} ملف)
          </h3>
        </div>

        {fileBreakdown.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            لا توجد سجلات استهلاك بعد. عند رفع ومعالجة الملفات ستظهر إحصاءات كل ملف هنا تلقائياً.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">اسم الملف</th>
                  <th className="py-2.5 px-3">عدد الطلبات / الصفحات</th>
                  <th className="py-2.5 px-3">Input Tokens</th>
                  <th className="py-2.5 px-3">Output Tokens</th>
                  <th className="py-2.5 px-3">إجمالي التوكن</th>
                  <th className="py-2.5 px-3">التكلفة (ج.م)</th>
                  <th className="py-2.5 px-3">آخر قراءة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fileBreakdown.map((item) => (
                  <tr key={item.fileName} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-800 flex items-center gap-1.5">
                      <FileText size={13} className="text-slate-400" />
                      <span className="truncate max-w-[240px]">{item.fileName}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-mono">{item.requestCount}</td>
                    <td className="py-2.5 px-3 text-slate-600 font-mono">
                      {item.inputTokens.toLocaleString('en-US')}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-mono">
                      {item.outputTokens.toLocaleString('en-US')}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-800 font-mono">
                      {item.totalTokens.toLocaleString('en-US')}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-emerald-700 font-mono">
                      {item.totalCostEgp.toFixed(2)} ج.م
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                      {new Date(item.lastUsed).toLocaleDateString('ar-EG')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Raw Logs Table with Search */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50">
          <h3 className="font-bold text-slate-800 text-xs sm:text-sm">
            سجل العمليات والطلبات التفصيلي ({filteredLogs.length} طلب)
          </h3>
          <div className="relative">
            <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="بحث باسم الملف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-8 pl-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs w-48 sm:w-60 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">لا توجد عمليات تطابق البحث.</div>
        ) : (
          <div className="overflow-x-auto max-h-[400px]">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px] sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3">الوقت والتاريخ</th>
                  <th className="py-2.5 px-3">اسم الملف</th>
                  <th className="py-2.5 px-3">الدفعة / الصفحة</th>
                  <th className="py-2.5 px-3">الموديل</th>
                  <th className="py-2.5 px-3">Input</th>
                  <th className="py-2.5 px-3">Output</th>
                  <th className="py-2.5 px-3">الإجمالي</th>
                  <th className="py-2.5 px-3">التكلفة (ج.م)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {filteredLogs.slice(0, 100).map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 text-slate-500 font-sans">
                      {new Date(l.timestamp).toLocaleTimeString('ar-EG')} -{' '}
                      {new Date(l.timestamp).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="py-2 px-3 font-sans font-medium text-slate-800 truncate max-w-[200px]">
                      {l.file_name}
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-600">
                      {l.batch_number ? `دفعة ${l.batch_number}` : `صفحة ${l.page_number || 1}`}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[10px] font-bold border border-slate-200">
                          {l.model || 'gemini-4-hydrogen'}
                        </span>
                        {l.success === false && (
                          <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">
                            ملغى (ضغط مؤقت)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-slate-600">{l.input_tokens.toLocaleString('en-US')}</td>
                    <td className="py-2 px-3 text-slate-600">{l.output_tokens.toLocaleString('en-US')}</td>
                    <td className="py-2 px-3 font-bold text-slate-900">{l.total_tokens.toLocaleString('en-US')}</td>
                    <td className="py-2 px-3 font-bold text-emerald-700">
                      {(l.cost_egp || 0).toFixed(4)} ج.م
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cost Settings Modal */}
      {showCostSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100" dir="rtl">
            <h3 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
              <SlidersHorizontal size={18} className="text-sky-600" />
              تعديل أسعار التوكن وسعر الصرف
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              اضبط أسعار Gemini الفعلية وسعر صرف الجنيه لحساب التكلفة بدقة.
            </p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  سعر مليون توكن دخل (Input Tokens) بالدولار ($):
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={tempInputRate}
                  onChange={(e) => setTempInputRate(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-800 focus:outline-sky-500"
                />
                <span className="text-[10px] text-slate-400">الافتراضي لـ Flash هو $0.075 لكل 1M توكن.</span>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  سعر مليون توكن خرج (Output Tokens) بالدولار ($):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={tempOutputRate}
                  onChange={(e) => setTempOutputRate(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-800 focus:outline-sky-500"
                />
                <span className="text-[10px] text-slate-400">الافتراضي لـ Flash هو $0.30 لكل 1M توكن.</span>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">سعر الدولار مقابل الجنيه (ج.م):</label>
                <input
                  type="number"
                  step="0.5"
                  value={tempUsdToEgp}
                  onChange={(e) => setTempUsdToEgp(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-800 focus:outline-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">الحد الشهري المسموح به (ج.م):</label>
                <input
                  type="number"
                  step="50"
                  value={tempMonthlyBudget}
                  onChange={(e) => setTempMonthlyBudget(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-800 focus:outline-sky-500"
                />
                <span className="text-[10px] text-slate-400">
                  يظهر تنبيه عند 80%، وعند 100% تتوقف المعالجة التلقائية لتنبيهك.
                </span>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">حد الطلبات اليومي لـ Gemini (طلب):</label>
                <input
                  type="number"
                  min="1"
                  max="1500"
                  step="1"
                  value={tempDailyLimit}
                  onChange={(e) => setTempDailyLimit(parseInt(e.target.value, 10) || 20)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-800 focus:outline-sky-500"
                />
                <span className="text-[10px] text-slate-400">
                  الافتراضي 20 طلب يومياً. يتوقف التطبيق فوراً عند الوصول لهذا الحد لحماية حسابك.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-5 border-t border-slate-100 mt-5">
              <button
                type="button"
                onClick={() => setShowCostSettingsModal(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveCostSettings}
                className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-xs"
              >
                حفظ الإعدادات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
