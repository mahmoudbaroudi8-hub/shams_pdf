import React, { useState, useRef } from 'react';
import { Product, CatalogSettings } from '../types';
import {
  mergePdfFiles,
  splitPdfByRanges,
  splitPdfEveryNPages,
  splitPdfByCategories,
  zipFilesAndDownload,
  MergePdfItem,
} from '../utils/pdfTools';
import {
  Files,
  Split,
  ArrowUp,
  ArrowDown,
  Trash2,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  RefreshCw,
  FolderArchive,
  Layers,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';

interface PdfToolsTabProps {
  products: Product[];
  settings: CatalogSettings;
}

export const PdfToolsTab: React.FC<PdfToolsTabProps> = ({ products, settings }) => {
  const [activeSubTab, setActiveSubTab] = useState<'merge' | 'split'>('merge');

  // Merge state
  const [mergeFiles, setMergeFiles] = useState<MergePdfItem[]>([]);
  const [mergedOutputName, setMergedOutputName] = useState('الكتالوج_المدمج_النهائي');
  const [isMerging, setIsMerging] = useState(false);
  const [mergeSuccess, setMergeSuccess] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const mergeInputRef = useRef<HTMLInputElement>(null);

  // Split state
  const [splitFile, setSplitFile] = useState<{ name: string; buffer: ArrayBuffer; totalPages: number } | null>(null);
  const [splitMode, setSplitMode] = useState<'every_n' | 'range' | 'category'>('every_n');
  const [pagesPerChunk, setPagesPerChunk] = useState<number>(2);
  const [customRangesText, setCustomRangesText] = useState('1-3, 4-6');
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitSuccess, setSplitSuccess] = useState<string | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);
  const splitInputRef = useRef<HTMLInputElement>(null);

  // Handle files selected for merge
  const handleMergeFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const selected = Array.from(e.target.files);
    setMergeError(null);
    setMergeSuccess(null);

    const newItems: MergePdfItem[] = [];
    for (const f of selected) {
      if (!f.name.toLowerCase().endsWith('.pdf')) continue;
      try {
        const buffer = await f.arrayBuffer();
        const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        newItems.push({
          id: `${f.name}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: f.name,
          size: f.size,
          buffer,
          pageCount: doc.getPageCount(),
        });
      } catch (err: any) {
        setMergeError(`تعذر قراءة ملف "${f.name}": تأكد أنه ملف PDF صالح.`);
      }
    }

    setMergeFiles((prev) => [...prev, ...newItems]);
    e.target.value = '';
  };

  // Move merge file up
  const moveFileUp = (index: number) => {
    if (index === 0) return;
    setMergeFiles((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  // Move merge file down
  const moveFileDown = (index: number) => {
    if (index >= mergeFiles.length - 1) return;
    setMergeFiles((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  // Remove file from merge
  const removeMergeFile = (index: number) => {
    setMergeFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Execute merge
  const handleExecuteMerge = async () => {
    if (mergeFiles.length < 2) {
      setMergeError('يرجى إضافة ملفين PDF على الأقل لتنفيذ عملية الدمج.');
      return;
    }

    setIsMerging(true);
    setMergeError(null);
    setMergeSuccess(null);

    try {
      const safeName = mergedOutputName.trim() || 'الكتالوج_المدمج';
      const filename = safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`;

      const blob = await mergePdfFiles(mergeFiles, filename);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      const totalPages = mergeFiles.reduce((acc, f) => acc + (f.pageCount || 0), 0);
      setMergeSuccess(`تم دمج ${mergeFiles.length} ملفات بنجاح في ملف واحد يحتوي على ${totalPages} صفحة!`);
    } catch (err: any) {
      setMergeError(err.message || 'فشل دمج الملفات.');
    } finally {
      setIsMerging(false);
    }
  };

  // Handle single file selected for split
  const handleSplitFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setSplitError(null);
    setSplitSuccess(null);

    try {
      const buffer = await file.arrayBuffer();
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const totalPages = doc.getPageCount();

      setSplitFile({
        name: file.name.replace(/\.[^/.]+$/, ''),
        buffer,
        totalPages,
      });

      // default suggested range text
      if (totalPages > 2) {
        const half = Math.ceil(totalPages / 2);
        setCustomRangesText(`1-${half}, ${half + 1}-${totalPages}`);
      } else {
        setCustomRangesText(`1-1, 2-${totalPages}`);
      }
    } catch (err: any) {
      setSplitError(`تعذر فتح الملف للتقسيم: ${err.message || 'ملف غير صالح'}`);
    }

    e.target.value = '';
  };

  // Execute split
  const handleExecuteSplit = async () => {
    if (!splitFile) {
      setSplitError('يرجى اختيار ملف PDF أولاً.');
      return;
    }

    setIsSplitting(true);
    setSplitError(null);
    setSplitSuccess(null);

    try {
      let splitResults: { filename: string; bytes: Uint8Array }[] = [];

      if (splitMode === 'every_n') {
        const n = Math.max(1, pagesPerChunk);
        splitResults = await splitPdfEveryNPages(splitFile.buffer, splitFile.name, n);
      } else if (splitMode === 'range') {
        // Parse ranges like "1-3, 4-6, 7-10"
        const parts = customRangesText.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean);
        const parsedRanges: { start: number; end: number; label: string }[] = [];

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const match = part.match(/^([0-9]+)\s*[-–]\s*([0-9]+)$/);
          if (match) {
            const start = parseInt(match[1], 10);
            const end = parseInt(match[2], 10);
            parsedRanges.push({
              start,
              end,
              label: `جزء_${i + 1}_(صفحات_${start}_إلى_${end})`,
            });
          } else {
            const single = parseInt(part, 10);
            if (!isNaN(single)) {
              parsedRanges.push({
                start: single,
                end: single,
                label: `صفحة_${single}`,
              });
            }
          }
        }

        if (parsedRanges.length === 0) {
          throw new Error('يرجى إدخال نطاق صفحات صحيح مثل "1-3, 4-6".');
        }

        splitResults = await splitPdfByRanges(splitFile.buffer, splitFile.name, parsedRanges);
      } else if (splitMode === 'category') {
        // Group available products pages by category
        const catMap = new Map<string, Set<number>>();
        products.forEach((p) => {
          if (p.page_number && p.category) {
            const cur = catMap.get(p.category) || new Set<number>();
            cur.add(p.page_number);
            catMap.set(p.category, cur);
          }
        });

        const categoryPageMap = Array.from(catMap.entries()).map(([category, pageSet]) => ({
          category,
          pages: Array.from(pageSet).sort((a, b) => a - b),
        }));

        if (categoryPageMap.length === 0) {
          throw new Error('لم يتم العثور على أرقام صفحات مقسمة حسب الأقسام لهذا الملف في التطبيق. استخدم التقسيم بالمدى أو كل N صفحات.');
        }

        splitResults = await splitPdfByCategories(splitFile.buffer, splitFile.name, categoryPageMap);
      }

      if (splitResults.length === 0) {
        throw new Error('لم ينتج أي ملفات عن التقسيم.');
      }

      // Download all split files in a single ZIP
      const zipName = `${splitFile.name}_مقسم_${splitResults.length}_أجزاء.zip`;
      await zipFilesAndDownload(splitResults, zipName);

      setSplitSuccess(`تم تقسيم الملف إلى ${splitResults.length} أجزاء بنجاح وتنزيلها مضغوطة في ملف ZIP!`);
    } catch (err: any) {
      setSplitError(err.message || 'فشل تقسيم الملف.');
    } finally {
      setIsSplitting(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
            <Files size={20} className="text-sky-600" />
            أدوات ملفات الـ PDF الاحترافية (دمج وتقسيم)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            دمج وتقسيم ملفات الكتالوج بجودة أصلية وبدون إعادة رسم، للحفاظ على دقة وسلامة الخط العربي بنسبة 100%.
          </p>
        </div>

        {/* Sub-tabs toggle */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start sm:self-center">
          <button
            onClick={() => setActiveSubTab('merge')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'merge'
                ? 'bg-white text-slate-800 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Files size={15} />
            <span>دمج ملفات PDF</span>
          </button>

          <button
            onClick={() => setActiveSubTab('split')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'split'
                ? 'bg-white text-slate-800 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Split size={15} />
            <span>تقسيم ملف PDF</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: MERGE PDF FILES */}
      {/* ======================================================== */}
      {activeSubTab === 'merge' && (
        <div className="space-y-5">
          {mergeSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{mergeSuccess}</span>
            </div>
          )}

          {mergeError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs font-bold text-red-700 flex items-center gap-2 animate-in fade-in">
              <AlertTriangle size={16} className="text-red-600 shrink-0" />
              <span>{mergeError}</span>
            </div>
          )}

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-sm text-slate-800">قائمة الملفات المراد دمجها بالترتيب:</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ارفع الملفات ثم استخدم الأسهم لتحديد الترتيب الذي ستظهر به الصفحات في الكتالوج النهائي.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={mergeInputRef}
                  accept=".pdf"
                  multiple
                  onChange={handleMergeFilesSelected}
                  className="hidden"
                />
                <button
                  onClick={() => mergeInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <Upload size={14} />
                  <span>إضافة ملفات PDF للدمج</span>
                </button>
              </div>
            </div>

            {mergeFiles.length === 0 ? (
              <div
                onClick={() => mergeInputRef.current?.click()}
                className="p-10 text-center border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <Files size={36} className="mx-auto mb-2 text-slate-300" />
                <p className="font-bold text-sm text-slate-700">اضغط لاختيار ملفات PDF للدمج</p>
                <p className="text-xs text-slate-400 mt-1">يمكنك اختيار ملفين أو أكثر ودمجهم في ملف واحد مرتب</p>
              </div>
            ) : (
              <div className="space-y-2">
                {mergeFiles.map((file, idx) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold hover:border-slate-300 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-md bg-slate-200 text-slate-700 font-mono font-bold flex items-center justify-center text-xs">
                        {idx + 1}
                      </span>
                      <FileCheck size={18} className="text-sky-600 shrink-0" />
                      <div>
                        <p className="text-slate-800 font-bold truncate max-w-xs sm:max-w-md">{file.name}</p>
                        <span className="text-[11px] text-slate-400">
                          {file.pageCount} صفحة • {(file.size / 1024 / 1024).toFixed(2)} ميجابايت
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => moveFileUp(idx)}
                        disabled={idx === 0}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700"
                        title="تحريك لأعلى"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        onClick={() => moveFileDown(idx)}
                        disabled={idx === mergeFiles.length - 1}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700"
                        title="تحريك لأسفل"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        onClick={() => removeMergeFile(idx)}
                        className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                        title="إزالة من القائمة"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {mergeFiles.length > 0 && (
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 shrink-0">اسم الملف المدمج:</span>
                  <input
                    type="text"
                    value={mergedOutputName}
                    onChange={(e) => setMergedOutputName(e.target.value)}
                    placeholder="اسم الملف..."
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-sky-500 w-64"
                  />
                  <span className="text-xs text-slate-400 font-mono">.pdf</span>
                </div>

                <button
                  onClick={handleExecuteMerge}
                  disabled={isMerging || mergeFiles.length < 2}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  {isMerging ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>جاري الدمج والحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Download size={15} />
                      <span>دمج وتنزيل الملف الآن ({mergeFiles.length} ملفات)</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: SPLIT PDF FILE */}
      {/* ======================================================== */}
      {activeSubTab === 'split' && (
        <div className="space-y-5">
          {splitSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{splitSuccess}</span>
            </div>
          )}

          {splitError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs font-bold text-red-700 flex items-center gap-2 animate-in fade-in">
              <AlertTriangle size={16} className="text-red-600 shrink-0" />
              <span>{splitError}</span>
            </div>
          )}

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <div>
              <h3 className="font-bold text-sm text-slate-800">اختيار ملف الـ PDF المراد تقسيمه:</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                قسّم الكتالوجات الكبيرة لأجزاء صغيرة بالمدى أو بعدد الصفحات، ويتم تنزيلها جميعاً بملف مضغوط ZIP.
              </p>
            </div>

            <input
              type="file"
              ref={splitInputRef}
              accept=".pdf"
              onChange={handleSplitFileSelected}
              className="hidden"
            />

            {!splitFile ? (
              <div
                onClick={() => splitInputRef.current?.click()}
                className="p-10 text-center border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <Split size={36} className="mx-auto mb-2 text-slate-300" />
                <p className="font-bold text-sm text-slate-700">اضغط لاختيار ملف PDF لتقسيمه</p>
                <p className="text-xs text-slate-400 mt-1">يدعم التقسيم بالمدى أو كل N صفحات في ثوانٍ</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-sky-50/70 border border-sky-200 rounded-xl">
                  <div className="flex items-center gap-2.5">
                    <FileCheck size={20} className="text-sky-600" />
                    <div>
                      <p className="text-slate-800 font-bold text-xs">{splitFile.name}.pdf</p>
                      <p className="text-[11px] text-sky-800">إجمالي عدد الصفحات: {splitFile.totalPages} صفحة</p>
                    </div>
                  </div>

                  <button
                    onClick={() => splitInputRef.current?.click()}
                    className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    تغيير الملف
                  </button>
                </div>

                {/* Split Modes */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-700">طريقة التقسيم:</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <label
                      className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                        splitMode === 'every_n' ? 'border-sky-500 bg-sky-50/50 font-bold text-sky-900' : 'border-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="splitMode"
                        checked={splitMode === 'every_n'}
                        onChange={() => setSplitMode('every_n')}
                        className="text-sky-600 focus:ring-sky-500"
                      />
                      <span>كل N صفحات في ملف منفصل</span>
                    </label>

                    <label
                      className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                        splitMode === 'range' ? 'border-sky-500 bg-sky-50/50 font-bold text-sky-900' : 'border-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="splitMode"
                        checked={splitMode === 'range'}
                        onChange={() => setSplitMode('range')}
                        className="text-sky-600 focus:ring-sky-500"
                      />
                      <span>بالمدى (مثل 1-3، 4-6)</span>
                    </label>

                    <label
                      className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                        splitMode === 'category' ? 'border-sky-500 bg-sky-50/50 font-bold text-sky-900' : 'border-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="splitMode"
                        checked={splitMode === 'category'}
                        onChange={() => setSplitMode('category')}
                        className="text-sky-600 focus:ring-sky-500"
                      />
                      <span>حسب نوع المنتج (الأقسام)</span>
                    </label>
                  </div>
                </div>

                {/* Sub configuration inputs */}
                {splitMode === 'every_n' && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <label className="block font-bold text-slate-700 mb-1">عدد الصفحات في كل جزء:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max={splitFile.totalPages}
                        value={pagesPerChunk}
                        onChange={(e) => setPagesPerChunk(parseInt(e.target.value, 10) || 1)}
                        className="p-2 bg-white border border-slate-200 rounded-xl font-bold w-28 text-center"
                      />
                      <span className="text-slate-500">
                        صفحة (سيتم إنتاج حوالي {Math.ceil(splitFile.totalPages / (pagesPerChunk || 1))} ملفات)
                      </span>
                    </div>
                  </div>
                )}

                {splitMode === 'range' && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <label className="block font-bold text-slate-700 mb-1">
                      اكتب نطاقات الصفحات مفصولة بفواصل (مثل: 1-3, 4-6, 7-10):
                    </label>
                    <input
                      type="text"
                      value={customRangesText}
                      onChange={(e) => setCustomRangesText(e.target.value)}
                      placeholder="1-3, 4-6, 7-10"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-xs font-bold"
                    />
                  </div>
                )}

                {splitMode === 'category' && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
                    <p className="font-bold text-slate-800 mb-1">تقسيم صفحات الكتالوج آلياً حسب الأقسام:</p>
                    <p>
                      يقوم بفحص صفحات المنتجات المسجلة في التطبيق وفصل صفحات كل قسم (كابلات، شواحن، سماعات...) في ملف PDF مستقل باسم القسم.
                    </p>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                  <button
                    onClick={handleExecuteSplit}
                    disabled={isSplitting}
                    className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-600/20 transition-all cursor-pointer"
                  >
                    {isSplitting ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        <span>جاري التقسيم والضغط...</span>
                      </>
                    ) : (
                      <>
                        <FolderArchive size={15} />
                        <span>تقسيم وتنزيل في ملف ZIP</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
