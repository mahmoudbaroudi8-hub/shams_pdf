import React, { useState } from 'react';
import { DispatchRecord } from '../types';
import { deleteDispatch } from '../utils/db';
import * as XLSX from 'xlsx';
import { useUiFeedback } from './UiFeedbackProvider';
import {
  History,
  Download,
  Trash2,
  Eye,
  FileSpreadsheet,
  FileCode,
  Calendar,
  User,
  Phone,
  Package,
  X,
} from 'lucide-react';

interface DispatchHistoryProps {
  dispatches: DispatchRecord[];
  onDispatchesUpdated: (dispatches: DispatchRecord[]) => void;
}

export const DispatchHistory: React.FC<DispatchHistoryProps> = ({
  dispatches,
  onDispatchesUpdated,
}) => {
  const { toast, confirm } = useUiFeedback();
  const [selectedRecord, setSelectedRecord] = useState<DispatchRecord | null>(null);

  // Delete a dispatch record
  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'حذف سجل الإرسال',
      message: 'هل أنت متأكد من حذف هذا السجل؟',
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!ok) return;
    await deleteDispatch(id);
    onDispatchesUpdated(dispatches.filter((d) => d.id !== id));
    if (selectedRecord?.id === id) setSelectedRecord(null);
    toast.success('تم حذف السجل.');
  };

  // Export all dispatches to Excel
  const handleExportExcel = () => {
    if (dispatches.length === 0) {
      toast.warning('لا توجد عمليات إرسال مسجلة للتصدير.');
      return;
    }

    // Flatten rows for accounting system
    const rows: any[] = [];
    dispatches.forEach((d) => {
      if (d.items_snapshot && d.items_snapshot.length > 0) {
        d.items_snapshot.forEach((item) => {
          rows.push({
            'رقم العملية': d.id,
            'اسم العميل': d.customer_name,
            'رقم الهاتف': d.customer_phone,
            'تاريخ الإرسال': d.date,
            'الأقسام المرسلة': d.categories.join(' - '),
            'كود المنتج': item.code,
            'اسم المنتج': item.name,
            'القسم': item.category,
            'سعر البيع وقت الإرسال': item.selling_price,
            'سعر الجملة وقت الإرسال': item.wholesale_price,
            'الربح': item.selling_price - item.wholesale_price,
          });
        });
      } else {
        rows.push({
          'رقم العملية': d.id,
          'اسم العميل': d.customer_name,
          'رقم الهاتف': d.customer_phone,
          'تاريخ الإرسال': d.date,
          'الأقسام المرسلة': d.categories.join(' - '),
          'عدد المنتجات': d.product_count,
        });
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'سجل_عمليات_الإرسال');

    // RTL
    if (!worksheet['!views']) worksheet['!views'] = [];
    worksheet['!views'].push({ rightToLeft: true });

    XLSX.writeFile(workbook, `سجل_ارسال_الكتالوجات_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Export to JSON for developer / accounting API import
  const handleExportJson = () => {
    if (dispatches.length === 0) {
      toast.warning('لا توجد عمليات إرسال مسجلة للتصدير.');
      return;
    }

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(dispatches, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `سجل_الارسال_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <History className="text-sky-600" size={24} />
            سجل إرسال الكتالوجات للعملاء
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            سجل دقيق بكل إرسالية وأسعار البيع والجملة المعتمدة وقت إرسالها للعميل، جاهز للتصدير والربط مع البرامج المحاسبية.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet size={16} />
            تصدير لإكسيل (محاسبي)
          </button>
          <button
            onClick={handleExportJson}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            <FileCode size={16} />
            تصدير JSON
          </button>
        </div>
      </div>

      {/* Dispatches Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {dispatches.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <History size={36} className="mx-auto mb-2 text-slate-300 stroke-1" />
            <p className="text-base font-semibold">لا توجد عمليات إرسال مسجلة حتى الآن.</p>
            <p className="text-xs mt-1">عند إرسال كتالوج لأي عميل عبر واتساب وتأكيد العملية ستظهر هنا تلقائياً.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-xs">
                <tr>
                  <th className="py-3 px-4">اسم العميل</th>
                  <th className="py-3 px-3">رقم الهاتف</th>
                  <th className="py-3 px-3">التاريخ والوقت</th>
                  <th className="py-3 px-3">الأقسام المرسلة</th>
                  <th className="py-3 px-3 text-center">عدد المنتجات</th>
                  <th className="py-3 px-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dispatches.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <User size={15} className="text-slate-400" />
                        <span>{record.customer_name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 font-mono text-xs text-slate-600" dir="ltr">
                      {record.customer_phone}
                    </td>
                    <td className="py-3.5 px-3 text-xs text-slate-500">
                      {record.date}
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {record.categories.map((cat, idx) => (
                          <span
                            key={idx}
                            className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-semibold"
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-center font-bold text-slate-700">
                      {record.product_count}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setSelectedRecord(record)}
                          className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer"
                          title="عرض تفاصيل المنتجات والأسعار"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(record.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="حذف السجل"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details Snapshot Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  تفاصيل أسعار الإرسالية لـ ({selectedRecord.customer_name})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  التاريخ: {selectedRecord.date} | الهاتف: {selectedRecord.customer_phone}
                </p>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-4 flex-1 overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">كود</th>
                    <th className="py-2 px-3">الاسم</th>
                    <th className="py-2 px-3">القسم</th>
                    <th className="py-2 px-3">سعر البيع المعتمد</th>
                    <th className="py-2 px-3">سعر الجملة وقتها</th>
                    <th className="py-2 px-3">الربح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedRecord.items_snapshot.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono text-slate-500">{item.code}</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">{item.name}</td>
                      <td className="py-2 px-3 text-slate-600">{item.category}</td>
                      <td className="py-2 px-3 font-bold text-emerald-600">{item.selling_price} ج.م</td>
                      <td className="py-2 px-3 text-slate-600">{item.wholesale_price} ج.م</td>
                      <td className="py-2 px-3 font-bold text-slate-700">
                        {item.selling_price - item.wholesale_price} ج.م
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedRecord(null)}
                className="py-2 px-5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
