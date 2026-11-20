import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BookOpen,
  Plus,
  Copy,
  Trash2,
  Edit3,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  FileDown,
  Share2,
  Layers,
  Check,
  Search,
  Filter,
  Eye,
  Settings as SettingsIcon,
  FileSpreadsheet,
  AlertTriangle,
  X,
  CheckSquare,
  Square,
  RefreshCw,
  FolderPlus,
  Calendar,
  Phone,
  Image as ImageIcon,
  Sparkles,
  ExternalLink,
  ChevronRight,
  ArrowUpDown,
  Tag,
  Upload,
  FileUp,
  FileText,
  Palette,
  Split,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PDFDocument } from 'pdf-lib';
import {
  Product,
  CatalogSettings,
  SavedCatalog,
  CatalogSectionHeader,
  DEFAULT_CATEGORIES,
  DEFAULT_SECTION_HEADER_CONFIG,
  DEFAULT_CARD_CONFIG,
  GridSymmetryMode,
} from '../types';
import {
  getAllCatalogs,
  saveCatalog,
  deleteCatalog,
  updateProduct,
  deleteProduct,
  getStoredPdfFile,
  saveStoredPdfFile,
  deleteStoredPdfFile,
} from '../utils/db';
import {
  generateCatalogPdf,
  buildPreviewHtml,
  buildCatalogItemsSequence,
  paginateCatalogPageItems,
  resolveEffectiveGridLayout,
  resolveSectionHeaderConfig,
} from '../utils/pdfGenerator';
import { convertPdfCatalogToProducts, PdfConversionProgress } from '../utils/pdfCatalogConverter';
import { compressUploadedImage } from '../utils/imageCropper';
import { CatalogReviewModal } from './CatalogReviewModal';
import { ManualProductModal } from './ManualProductModal';
import { UploadedPdfPagesPanel } from './UploadedPdfPagesPanel';
import { GridLayoutSelector, GridCols, GridRows, GridLayoutMode } from './GridLayoutSelector';
import { SectionEditorModal } from './SectionHeaderControls';
import { CardDesignerModal } from './CardStyleControls';
import { PdfSplitExportModal } from './PdfSplitExportModal';
import { ResponsiveA4Preview } from './ResponsiveA4Preview';
import { useUiFeedback } from './UiFeedbackProvider';

interface MyCatalogsProps {
  products: Product[];
  settings: CatalogSettings;
  onProductsUpdated: (prods: Product[]) => void;
  onSettingsUpdated: (settings: CatalogSettings) => void;
  onNavigateToPricing?: () => void;
}

export const MyCatalogs: React.FC<MyCatalogsProps> = ({
  products,
  settings,
  onProductsUpdated,
  onSettingsUpdated,
  onNavigateToPricing,
}) => {
  const { toast, confirm, openExternalLink } = useUiFeedback();
  // Catalogs state
  const [catalogs, setCatalogs] = useState<SavedCatalog[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'editor' | 'preview'>('editor');

  // Modals state
  const [showNewCatalogModal, setShowNewCatalogModal] = useState(false);
  const [showUploadPdfModal, setShowUploadPdfModal] = useState(false);
  const [showCatalogSettingsModal, setShowCatalogSettingsModal] = useState(false);
  const [showAddHeaderModal, setShowAddHeaderModal] = useState(false);
  const [showEditProductModal, setShowEditProductModal] = useState(false);
  const [showManualProductModal, setShowManualProductModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showSectionEditorModal, setShowSectionEditorModal] = useState(false);
  const [showCardDesignerModal, setShowCardDesignerModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitExternalBuffer, setSplitExternalBuffer] = useState<ArrayBuffer | null>(null);
  const [isPreparingSplit, setIsPreparingSplit] = useState(false);
  const [focusedProductId, setFocusedProductId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Upload external PDF state
  const [uploadPdfFile, setUploadPdfFile] = useState<File | null>(null);
  const [uploadPdfBuffer, setUploadPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [uploadPdfPageCount, setUploadPdfPageCount] = useState<number>(0);
  const [uploadPdfName, setUploadPdfName] = useState<string>('');
  const [uploadPdfValidity, setUploadPdfValidity] = useState<string>('سارية لمدة 15 يوماً');
  const [uploadPdfActionMode, setUploadPdfActionMode] = useState<'pdf_pages' | 'ai_convert'>('pdf_pages');
  const [uploadPdfPriceMode, setUploadPdfPriceMode] = useState<'selling' | 'wholesale'>('selling');
  const [isImportingPdf, setIsImportingPdf] = useState(false);
  const [isUploadingEditPhoto, setIsUploadingEditPhoto] = useState(false);
  const uploadPdfInputRef = useRef<HTMLInputElement>(null);
  const editProductPhotoInputRef = useRef<HTMLInputElement>(null);
  const catalogsRef = useRef<SavedCatalog[]>([]);

  // Form states
  const [newCatalogName, setNewCatalogName] = useState('');
  const [headerTitle, setHeaderTitle] = useState('');
  const [headerSubtitle, setHeaderSubtitle] = useState('');
  const [headerPositionIndex, setHeaderPositionIndex] = useState<number>(0);

  // Product picker filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('الكل');

  // PDF Generation, AI Conversion & Merge State
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [isConvertingPdfToEditable, setIsConvertingPdfToEditable] = useState(false);
  const [conversionProgress, setConversionProgress] = useState<PdfConversionProgress | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeCatalogA, setMergeCatalogA] = useState<string>('');
  const [mergeCatalogB, setMergeCatalogB] = useState<string>('');

  // Current active catalog
  const currentCatalog = useMemo(() => {
    return catalogs.find((c) => c.id === selectedCatalogId) || null;
  }, [catalogs, selectedCatalogId]);

  useEffect(() => {
    catalogsRef.current = catalogs;
  }, [catalogs]);

  // Load catalogs from IndexedDB on mount
  const loadCatalogs = async () => {
    try {
      const saved = await getAllCatalogs();
      catalogsRef.current = saved;
      setCatalogs(saved);
    } catch (err) {
      console.error('Failed to load catalogs:', err);
    }
  };

  useEffect(() => {
    loadCatalogs();
  }, []);

  const showToast = (msg: string) => {
    toast.success(msg);
  };

  // ----------------------------------------------------
  // Catalog Management Operations
  // ----------------------------------------------------
  const handleCreateCatalog = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = newCatalogName.trim();
    if (!name) return;

    // Default: pre-select all priced products with included_in_catalog=true
    const defaultProductIds = products
      .filter((p) => p.included_in_catalog && (p.selling_price || 0) > 0)
      .map((p) => p.id);

    const newCat: SavedCatalog = {
      id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      product_ids: defaultProductIds,
      manual_headers: [],
      auto_category_headers: true,
      company_name: settings.company_name || settings.store_name,
      business_bio: settings.business_bio,
      logo_url: settings.logo_url,
      phone: settings.phone,
      whatsapp_number: settings.whatsapp_number,
      price_validity_note: 'سارية لمدة 15 يوماً',
      columns_count: (settings.products_per_row || 4) as GridCols,
      rows_count: (settings.rows_per_page || ((settings.products_per_row || 4) === 4 ? 4 : 3)) as GridRows,
      grid_layout_mode: settings.grid_layout_mode || 'manual',
      show_code: settings.show_code ?? true,
      show_category: settings.show_category ?? true,
      show_image: settings.show_image ?? true,
      primary_color: settings.primary_color || '#ea580c',
      footer_note: settings.footer_note || 'الأسعار قابلة للتغيير وفق تحديثات السوق',
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    try {
      await saveCatalog(newCat);
      const nextList = [newCat, ...catalogsRef.current];
      catalogsRef.current = nextList;
      setCatalogs(nextList);
      setSelectedCatalogId(newCat.id);
      setNewCatalogName('');
      setShowNewCatalogModal(false);
      showToast(`تم إنشاء الكتالوج "${newCat.name}" بنجاح!`);
    } catch (err: any) {
      toast.error('تعذر إنشاء الكتالوج: ' + err.message);
    }
  };

  const handleSelectExternalPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const buf = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(buf.slice(0), { ignoreEncryption: true });
      const pages = pdfDoc.getPageCount();
      if (pages <= 0) {
        toast.error('ملف الـ PDF المختار لا يحتوي على صفحات.');
        return;
      }

      setUploadPdfFile(file);
      setUploadPdfBuffer(buf);
      setUploadPdfPageCount(pages);
      if (!uploadPdfName.trim()) {
        setUploadPdfName(file.name.replace(/\.pdf$/i, ''));
      }
    } catch (err: any) {
      toast.error('تعذر قراءة ملف الـ PDF. تأكد من أن الملف غير تالف أو محمي بكلمة مرور.');
    }
  };

  const resetUploadPdfModal = () => {
    setShowUploadPdfModal(false);
    setUploadPdfFile(null);
    setUploadPdfBuffer(null);
    setUploadPdfPageCount(0);
    setUploadPdfName('');
    setUploadPdfValidity('سارية لمدة 15 يوماً');
    setUploadPdfActionMode('pdf_pages');
    setUploadPdfPriceMode('selling');
  };

  const runPdfConversionForCatalog = async (
    targetCatalog: SavedCatalog,
    convertMode: 'replace' | 'copy',
    priceMode: 'selling' | 'wholesale'
  ) => {
    if (!targetCatalog.pdf_file_id) return;

    setIsConvertingPdfToEditable(true);
    setConversionProgress({
      currentPage: 1,
      totalPages: targetCatalog.pdf_page_count || 1,
      extractedCount: 0,
      message: 'جاري تجهيز صفحات الـ PDF للقراءة بالذكاء الاصطناعي...',
    });

    try {
      const oldPdfFileId = targetCatalog.pdf_file_id;
      const extracted = await convertPdfCatalogToProducts(
        oldPdfFileId,
        targetCatalog.name,
        settings,
        priceMode,
        (prog) => setConversionProgress(prog)
      );

      const nextProducts = [...extracted, ...products];
      onProductsUpdated(nextProducts);

      const combinedProductIds = [
        ...extracted.map((p) => p.id),
        ...(targetCatalog.product_ids || []),
      ];

      if (convertMode === 'replace') {
        const updatedCat: SavedCatalog = {
          ...targetCatalog,
          source_type: 'builder',
          pdf_file_id: undefined,
          pdf_filename: undefined,
          pdf_page_count: undefined,
          pdf_size_bytes: undefined,
          product_ids: combinedProductIds,
          updated_at: Date.now(),
        };
        await saveCatalog(updatedCat);
        const nextList = catalogsRef.current.map((c) => (c.id === updatedCat.id ? updatedCat : c));
        catalogsRef.current = nextList;
        setCatalogs(nextList);
        await deleteStoredPdfFile(oldPdfFileId).catch(() => {});
        showToast(
          `تم استخراج ${extracted.length} صنف وتحويل الكتالوج للتعديل الكامل! يمكنك الآن تعديل أو حذف أو إضافة أي منتج.`
        );
      } else {
        const copyCat: SavedCatalog = {
          ...targetCatalog,
          id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: `(قابل للتعديل) ${targetCatalog.name}`,
          source_type: 'builder',
          pdf_file_id: undefined,
          pdf_filename: undefined,
          pdf_page_count: undefined,
          pdf_size_bytes: undefined,
          product_ids: combinedProductIds,
          created_at: Date.now(),
          updated_at: Date.now(),
        };
        await saveCatalog(copyCat);
        const nextList = [copyCat, ...catalogsRef.current];
        catalogsRef.current = nextList;
        setCatalogs(nextList);
        setSelectedCatalogId(copyCat.id);
        setActiveSubTab('editor');
        showToast(
          `تم استخراج ${extracted.length} صنف وإنشاء نسخة تفاعلية قابلة للتعديل مع الاحتفاظ بالملف الأصلي!`
        );
      }
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحويل صفحات الـ PDF إلى منتجات.');
    } finally {
      setIsConvertingPdfToEditable(false);
      setConversionProgress(null);
    }
  };

  const handleConvertPdfToEditableCatalog = async (
    convertMode: 'replace' | 'copy',
    priceMode: 'selling' | 'wholesale'
  ) => {
    if (!currentCatalog) return;
    await runPdfConversionForCatalog(currentCatalog, convertMode, priceMode);
  };

  const handleCreatePdfCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadPdfFile || !uploadPdfBuffer) {
      toast.warning('يرجى اختيار ملف PDF أولاً.');
      return;
    }

    const name = uploadPdfName.trim() || uploadPdfFile.name.replace(/\.pdf$/i, '');
    setIsImportingPdf(true);

    try {
      const catId = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const pdfFileId = `catalog_pdf_${catId}`;

      await saveStoredPdfFile({
        file_id: pdfFileId,
        file_name: uploadPdfFile.name,
        file_size: uploadPdfBuffer.byteLength,
        mime_type: 'application/pdf',
        array_buffer: uploadPdfBuffer,
        saved_at: Date.now(),
      });

      const newCat: SavedCatalog = {
        id: catId,
        name,
        source_type: 'uploaded_pdf',
        pdf_file_id: pdfFileId,
        pdf_filename: uploadPdfFile.name,
        pdf_page_count: uploadPdfPageCount,
        pdf_size_bytes: uploadPdfBuffer.byteLength,
        product_ids: [],
        manual_headers: [],
        auto_category_headers: true,
        company_name: settings.company_name || settings.store_name,
        business_bio: settings.business_bio,
        logo_url: settings.logo_url,
        phone: settings.phone,
        whatsapp_number: settings.whatsapp_number,
        price_validity_note: uploadPdfValidity.trim() || 'سارية لمدة 15 يوماً',
        columns_count: (settings.products_per_row || 4) as GridCols,
        rows_count: (settings.rows_per_page || ((settings.products_per_row || 4) === 4 ? 4 : 3)) as GridRows,
        show_code: settings.show_code ?? true,
        show_category: settings.show_category ?? true,
        show_image: settings.show_image ?? true,
        primary_color: settings.primary_color || '#ea580c',
        footer_note: settings.footer_note || 'الأسعار قابلة للتغيير وفق تحديثات السوق',
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const shouldAiConvert = uploadPdfActionMode === 'ai_convert';
      const chosenPriceMode = uploadPdfPriceMode;

      await saveCatalog(newCat);
      const nextList = [newCat, ...catalogsRef.current];
      catalogsRef.current = nextList;
      setCatalogs(nextList);
      setSelectedCatalogId(newCat.id);
      setActiveSubTab('editor');
      resetUploadPdfModal();

      if (shouldAiConvert) {
        await runPdfConversionForCatalog(newCat, 'replace', chosenPriceMode);
      } else {
        showToast(`تمت إضافة الكتالوج "${newCat.name}" (${uploadPdfPageCount} صفحة) ويمكنك عرضه وتكملته الآن!`);
      }
    } catch (err: any) {
      toast.error('تعذر حفظ ملف الـ PDF: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setIsImportingPdf(false);
    }
  };

  const handleDuplicateCatalog = async (targetCat: SavedCatalog) => {
    const newId = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let copiedPdfFileId = targetCat.pdf_file_id;

    try {
      if (targetCat.source_type === 'uploaded_pdf' && targetCat.pdf_file_id) {
        const stored = await getStoredPdfFile(targetCat.pdf_file_id);
        if (stored && stored.array_buffer) {
          copiedPdfFileId = `catalog_pdf_${newId}`;
          await saveStoredPdfFile({
            ...stored,
            file_id: copiedPdfFileId,
            array_buffer: stored.array_buffer.slice(0),
            saved_at: Date.now(),
          });
        }
      }

      const copyCat: SavedCatalog = {
        ...targetCat,
        id: newId,
        pdf_file_id: copiedPdfFileId,
        name: `(نسخة) ${targetCat.name}`,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      await saveCatalog(copyCat);
      const nextList = [copyCat, ...catalogsRef.current];
      catalogsRef.current = nextList;
      setCatalogs(nextList);
      showToast(`تم نسخ الكتالوج كـ "${copyCat.name}"`);
    } catch (err: any) {
      toast.error('تعذر نسخ الكتالوج: ' + err.message);
    }
  };

  const handleDeleteCatalog = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'حذف الكتالوج',
      message: `هل أنت متأكد من حذف الكتالوج "${name}"؟`,
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!ok) return;

    try {
      const target = catalogsRef.current.find((c) => c.id === id);
      await deleteCatalog(id);
      if (target?.pdf_file_id) {
        const stillUsed = catalogsRef.current.some(
          (c) => c.id !== id && c.pdf_file_id === target.pdf_file_id
        );
        if (!stillUsed) {
          await deleteStoredPdfFile(target.pdf_file_id).catch(() => {});
        }
      }
      const nextList = catalogsRef.current.filter((c) => c.id !== id);
      catalogsRef.current = nextList;
      setCatalogs(nextList);
      if (selectedCatalogId === id) {
        setSelectedCatalogId(null);
      }
      showToast(`تم حذف الكتالوج "${name}"`);
    } catch (err: any) {
      toast.error('تعذر حذف الكتالوج: ' + err.message);
    }
  };

  const handleUpdateCurrentCatalog = async (updatedFields: Partial<SavedCatalog>) => {
    const targetId = selectedCatalogId;
    if (!targetId) return;
    const latest = catalogsRef.current.find((c) => c.id === targetId);
    if (!latest) return;

    const updated: SavedCatalog = {
      ...latest,
      ...updatedFields,
      updated_at: Date.now(),
    };

    const nextList = catalogsRef.current.map((c) => (c.id === updated.id ? updated : c));
    catalogsRef.current = nextList;
    setCatalogs(nextList);

    try {
      await saveCatalog(updated);
    } catch (err) {
      console.error('Failed to update catalog:', err);
    }
  };

  // ----------------------------------------------------
  // Product Selection & Order in Catalog
  // ----------------------------------------------------
  const toggleProductInCatalog = (productId: string) => {
    if (!currentCatalog) return;
    const exists = currentCatalog.product_ids.includes(productId);
    let nextIds: string[];
    if (exists) {
      nextIds = currentCatalog.product_ids.filter((id) => id !== productId);
    } else {
      nextIds = [...currentCatalog.product_ids, productId];
    }
    handleUpdateCurrentCatalog({ product_ids: nextIds });
  };

  const handleSelectAllFiltered = (filteredProds: Product[]) => {
    if (!currentCatalog) return;
    const currentSet = new Set(currentCatalog.product_ids);
    filteredProds.forEach((p) => currentSet.add(p.id));
    handleUpdateCurrentCatalog({ product_ids: Array.from(currentSet) });
    showToast(`تم تحديد ${filteredProds.length} صنف`);
  };

  const handleDeselectAllFiltered = (filteredProds: Product[]) => {
    if (!currentCatalog) return;
    const filteredIds = new Set(filteredProds.map((p) => p.id));
    const nextIds = currentCatalog.product_ids.filter((id) => !filteredIds.has(id));
    handleUpdateCurrentCatalog({ product_ids: nextIds });
    showToast(`تم إلغاء تحديد الأصناف المعروضة`);
  };

  // Reordering helpers
  const moveItemInCatalog = (fromIndex: number, toIndex: number) => {
    if (!currentCatalog) return;
    if (toIndex < 0 || toIndex >= currentCatalog.product_ids.length) return;

    const nextIds = [...currentCatalog.product_ids];
    const [moved] = nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, moved);
    handleUpdateCurrentCatalog({ product_ids: nextIds });
  };

  const moveItemToExtremes = (index: number, position: 'top' | 'bottom') => {
    if (!currentCatalog) return;
    const nextIds = [...currentCatalog.product_ids];
    const [moved] = nextIds.splice(index, 1);
    if (position === 'top') {
      nextIds.unshift(moved);
    } else {
      nextIds.push(moved);
    }
    handleUpdateCurrentCatalog({ product_ids: nextIds });
  };

  // Auto Sorting
  const handleAutoSort = (mode: 'category' | 'name' | 'price_asc' | 'price_desc') => {
    if (!currentCatalog) return;
    const prodMap = new Map(products.map((p) => [p.id, p]));
    const catProds = currentCatalog.product_ids
      .map((id) => prodMap.get(id))
      .filter((p): p is Product => Boolean(p));

    if (mode === 'category') {
      const sortedCategories = [...(settings.categories && settings.categories.length > 0 ? settings.categories : DEFAULT_CATEGORIES)]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const rankMap = new Map<string, number>();
      sortedCategories.forEach((cat, idx) => rankMap.set(cat.name, idx));

      catProds.sort((a, b) => {
        const rankA = rankMap.has(a.category) ? rankMap.get(a.category)! : 999;
        const rankB = rankMap.has(b.category) ? rankMap.get(b.category)! : 999;
        if (rankA !== rankB) return rankA - rankB;
        return a.name.localeCompare(b.name, 'ar');
      });
    } else if (mode === 'name') {
      catProds.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    } else if (mode === 'price_asc') {
      catProds.sort((a, b) => (a.selling_price || 0) - (b.selling_price || 0));
    } else if (mode === 'price_desc') {
      catProds.sort((a, b) => (b.selling_price || 0) - (a.selling_price || 0));
    }

    handleUpdateCurrentCatalog({ product_ids: catProds.map((p) => p.id) });
    showToast('تم ترتيب الأصناف بنجاح!');
  };

  // ----------------------------------------------------
  // Manual Section Headers
  // ----------------------------------------------------
  const handleAddManualHeader = () => {
    if (!currentCatalog || !headerTitle.trim()) return;

    const afterProdId =
      headerPositionIndex > 0 && headerPositionIndex <= currentCatalog.product_ids.length
        ? currentCatalog.product_ids[headerPositionIndex - 1]
        : undefined;

    const newHeader: CatalogSectionHeader = {
      id: `hdr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: headerTitle.trim(),
      subtitle: headerSubtitle.trim() || undefined,
      after_product_id: afterProdId,
    };

    const nextHeaders = [...(currentCatalog.manual_headers || []), newHeader];
    handleUpdateCurrentCatalog({ manual_headers: nextHeaders });
    setHeaderTitle('');
    setHeaderSubtitle('');
    setShowAddHeaderModal(false);
    showToast(`تمت إضافة الفاصل "${newHeader.title}"`);
  };

  const handleDeleteManualHeader = (headerId: string) => {
    if (!currentCatalog) return;
    const nextHeaders = (currentCatalog.manual_headers || []).filter((h) => h.id !== headerId);
    handleUpdateCurrentCatalog({ manual_headers: nextHeaders });
  };

  // ----------------------------------------------------
  // In-place Product Editing & Deletion
  // ----------------------------------------------------
  const handleEditProductPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editingProduct) return;

    setIsUploadingEditPhoto(true);
    try {
      const compressed = await compressUploadedImage(file, 400);
      setEditingProduct((prev) =>
        prev ? { ...prev, image_url: compressed, original_image_url: compressed } : prev
      );
      toast.success('تم ضغط ورفع صورة المنتج بنجاح');
    } catch (err: any) {
      toast.error(err?.message || 'تعذر قراءة أو ضغط الصورة المختارة.');
    } finally {
      setIsUploadingEditPhoto(false);
    }
  };

  const handleSaveProductEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    const cleanName = editingProduct.name.trim();
    if (!cleanName) {
      toast.warning('يرجى كتابة اسم الصنف.');
      return;
    }

    const cleanSelling = Math.max(0, Number(editingProduct.selling_price) || 0);
    const cleanWholesale = Math.max(0, Number(editingProduct.wholesale_price) || 0);

    try {
      const updated: Product = {
        ...editingProduct,
        name: cleanName,
        code: (editingProduct.code || '').trim(),
        category: (editingProduct.category || 'متنوعة').trim(),
        group: (editingProduct.group || '').trim(),
        model: (editingProduct.model || '').trim(),
        specification: (editingProduct.specification || '').trim(),
        wholesale_price: cleanWholesale,
        selling_price: cleanSelling,
        manual_price_set: true,
        included_in_catalog: cleanSelling > 0,
        image_url: editingProduct.image_url?.trim() || undefined,
        updated_at: Date.now(),
      };
      await updateProduct(updated);

      // Update parent list
      const nextProds = products.map((p) => (p.id === updated.id ? updated : p));
      onProductsUpdated(nextProds);

      setShowEditProductModal(false);
      setEditingProduct(null);
      showToast('تم حفظ تعديل الصنف في قاعدة البيانات بنجاح');
    } catch (err: any) {
      toast.error('تعذر تحديث الصنف: ' + err.message);
    }
  };

  const handlePermanentDeleteProduct = async (product: Product) => {
    const ok = await confirm({
      title: 'حذف الصنف نهائياً',
      message: `هل تريد حذف الصنف "${product.name}" نهائياً من قاعدة البيانات بالكامل؟\nسيتم حذفه من هذا الكتالوج ومن جدول التسعير وجميع الكتالوجات الأخرى.`,
      confirmLabel: 'حذف نهائي',
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteProduct(product.id);
      const nextProds = products.filter((p) => p.id !== product.id);
      onProductsUpdated(nextProds);

      // Also remove from current catalog
      if (currentCatalog) {
        const nextIds = currentCatalog.product_ids.filter((id) => id !== product.id);
        await handleUpdateCurrentCatalog({ product_ids: nextIds });
      }
      showToast(`تم حذف الصنف "${product.name}" نهائياً`);
    } catch (err: any) {
      toast.error('تعذر حذف الصنف: ' + err.message);
    }
  };

  // ----------------------------------------------------
  // Export: PDF, Excel, WhatsApp Share with Mandatory Review
  // ----------------------------------------------------
  const [pendingReviewAction, setPendingReviewAction] = useState<{
    action: 'pdf' | 'excel' | 'whatsapp';
    title: string;
  } | null>(null);

  const buildCatalogPdfBlob = async (
    cat: SavedCatalog,
    onProgressCallback?: (p: { percent: number }) => void
  ): Promise<Blob> => {
    if (cat.source_type === 'uploaded_pdf' && cat.pdf_file_id) {
      const stored = await getStoredPdfFile(cat.pdf_file_id);
      if (!stored || !stored.array_buffer) {
        throw new Error('ملف الـ PDF المرفق غير موجود في التخزين المحلي.');
      }

      const prodMap = new Map(products.map((p) => [p.id, p]));
      const continuationProducts = (cat.product_ids || [])
        .map((id) => prodMap.get(id))
        .filter((p): p is Product => Boolean(p));

      if (continuationProducts.length === 0) {
        onProgressCallback?.({ percent: 100 });
        return new Blob([stored.array_buffer.slice(0)], { type: 'application/pdf' });
      }

      onProgressCallback?.({ percent: 25 });
      const continuationBlob = (await generateCatalogPdf(products, settings, {
        filename: `${cat.name.replace(/\s+/g, '_')}_cont.pdf`,
        customCatalog: cat,
        action: 'blob',
        onProgress: (p) =>
          onProgressCallback?.({ percent: Math.min(90, 25 + Math.round(p.percent * 0.65)) }),
      })) as Blob;

      const continuationBytes = await continuationBlob.arrayBuffer();
      const mergedPdf = await PDFDocument.create();

      const baseDoc = await PDFDocument.load(stored.array_buffer.slice(0), {
        ignoreEncryption: true,
      });
      const basePages = await mergedPdf.copyPages(baseDoc, baseDoc.getPageIndices());
      basePages.forEach((p) => mergedPdf.addPage(p));

      const contDoc = await PDFDocument.load(continuationBytes, {
        ignoreEncryption: true,
      });
      const contPages = await mergedPdf.copyPages(contDoc, contDoc.getPageIndices());
      contPages.forEach((p) => mergedPdf.addPage(p));

      const mergedBytes = await mergedPdf.save();
      onProgressCallback?.({ percent: 100 });
      return new Blob([new Uint8Array(mergedBytes)], { type: 'application/pdf' });
    }

    return (await generateCatalogPdf(products, settings, {
      filename: `${cat.name.replace(/\s+/g, '_')}.pdf`,
      customCatalog: cat,
      action: 'blob',
      onProgress: onProgressCallback,
    })) as Blob;
  };

  const handleDownloadPdf = () => {
    if (currentCatalog?.source_type === 'uploaded_pdf' && selectedProductsInOrder.length === 0) {
      executeDownloadPdf();
      return;
    }
    setPendingReviewAction({ action: 'pdf', title: 'تحميل PDF' });
  };

  const handleDownloadExcel = () => {
    setPendingReviewAction({ action: 'excel', title: 'تحميل إكسيل' });
  };

  const handleShareWhatsApp = () => {
    if (currentCatalog?.source_type === 'uploaded_pdf' && selectedProductsInOrder.length === 0) {
      executeShareWhatsApp();
      return;
    }
    setPendingReviewAction({ action: 'whatsapp', title: 'مشاركة على واتساب' });
  };

  const handleOpenSplitModal = async () => {
    if (!currentCatalog) return;
    if (currentCatalog.source_type === 'uploaded_pdf') {
      setIsPreparingSplit(true);
      try {
        const blob = await buildCatalogPdfBlob(currentCatalog);
        const buf = await blob.arrayBuffer();
        setSplitExternalBuffer(buf);
        setShowSplitModal(true);
      } catch (err: any) {
        toast.error(err?.message || 'تعذر تجهيز ملف الـ PDF للتقسيم.');
      } finally {
        setIsPreparingSplit(false);
      }
    } else {
      setSplitExternalBuffer(null);
      setShowSplitModal(true);
    }
  };

  const handleExportSingleSectionPdf = async (categoryName: string) => {
    if (!currentCatalog) return;
    setIsGeneratingPdf(true);
    setPdfProgress(15);
    try {
      const safeCat = categoryName.replace(/\s+/g, '_');
      const fileName = `${currentCatalog.name.replace(/\s+/g, '_')}_قسم_${safeCat}.pdf`;
      await generateCatalogPdf(products, settings, {
        filename: fileName,
        categoryFilter: categoryName,
        customCatalog: currentCatalog,
        action: 'download',
        onProgress: (p) => setPdfProgress(p.percent),
      });
      showToast(`تم تحميل PDF قسم "${categoryName}" بنجاح!`);
    } catch (err: any) {
      toast.error('تعذر تحميل PDF القسم: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setIsGeneratingPdf(false);
      setPdfProgress(0);
    }
  };

  const executeDownloadPdf = async () => {
    if (!currentCatalog) return;
    setIsGeneratingPdf(true);
    setPdfProgress(10);

    try {
      const blob = await buildCatalogPdfBlob(currentCatalog, (p) => setPdfProgress(p.percent));
      const fileName = `${currentCatalog.name.replace(/\s+/g, '_')}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast('تم تحميل الكتالوج بصيغة PDF بنجاح!');
    } catch (err: any) {
      toast.error('خطأ أثناء إنشاء الـ PDF: ' + err.message);
    } finally {
      setIsGeneratingPdf(false);
      setPdfProgress(0);
    }
  };

  const executeDownloadExcel = () => {
    if (!currentCatalog) return;
    const prodMap = new Map(products.map((p) => [p.id, p]));
    const catalogProds = currentCatalog.product_ids
      .map((id) => prodMap.get(id))
      .filter((p): p is Product => Boolean(p));

    if (catalogProds.length === 0) {
      toast.warning('لا توجد أصناف في هذا الكتالوج لتصديرها.');
      return;
    }

    const rows = catalogProds.map((p, idx) => ({
      'م': idx + 1,
      'كود الصنف': p.code || '',
      'اسم المنتج': p.name,
      'القسم': p.category || 'متنوع',
      'الموديل': p.model || '',
      'سعر الجملة': p.wholesale_price || 0,
      'سعر البيع': p.selling_price || 0,
      'المواصفات': p.specification || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'الأصناف');
    XLSX.writeFile(workbook, `${currentCatalog.name.replace(/\s+/g, '_')}.xlsx`);
    showToast('تم تصدير ملف الإكسيل بنجاح!');
  };

  const executeShareWhatsApp = async () => {
    if (!currentCatalog) return;

    setIsGeneratingPdf(true);
    setPdfProgress(20);

    try {
      const blob = await buildCatalogPdfBlob(currentCatalog, (p) => setPdfProgress(p.percent));

      const fileName = `${currentCatalog.name.replace(/\s+/g, '_')}.pdf`;
      const file = new File([blob], fileName, { type: 'application/pdf' });

      // Check if Web Share API with files is supported
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: currentCatalog.name,
          text: `السلام عليكم، مرفق كتالوج أسعار ${currentCatalog.company_name || 'إكسسوارات الموبايل'}: ${currentCatalog.name}`,
          files: [file],
        });
        showToast('تم فتح قائمة المشاركة بنجاح');
      } else {
        // Fallback: download the file and open WhatsApp Web safely outside iframe
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);

        const text = encodeURIComponent(
          `السلام عليكم، تم تجهيز وتنزيل كتالوج الأسعار "${currentCatalog.name}". برجاء إرسال الملف المرفق.`
        );
        const targetPhone = currentCatalog.whatsapp_number || settings.whatsapp_number || '';
        const waUrl = targetPhone ? `https://wa.me/${targetPhone.replace(/\D/g, '')}?text=${text}` : `https://wa.me/?text=${text}`;
        openExternalLink({
          title: 'فتح واتساب للمشاركة',
          description: 'تم تنزيل ملف الكتالوج (PDF) على جهازك. افتح واتساب الآن وأرفق الملف في المحادثة.',
          url: waUrl,
          actionLabel: 'فتح واتساب الآن',
        });
        showToast('تم تنزيل الـ PDF وتجهيز رابط واتساب');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        toast.error('حدث خطأ أثناء المشاركة: ' + err.message);
      }
    } finally {
      setIsGeneratingPdf(false);
      setPdfProgress(0);
    }
  };

  // ----------------------------------------------------
  // Merge 2 Catalogs Feature (pdf-lib)
  // ----------------------------------------------------
  const handleMergeTwoCatalogs = async () => {
    if (!mergeCatalogA || !mergeCatalogB || mergeCatalogA === mergeCatalogB) {
      toast.warning('يرجى اختيار كتالوجين مختلفين للدمج.');
      return;
    }

    const catA = catalogs.find((c) => c.id === mergeCatalogA);
    const catB = catalogs.find((c) => c.id === mergeCatalogB);

    if (!catA || !catB) {
      toast.error('تعذر العثور على بيانات الكتالوجات المحددة.');
      return;
    }

    setIsMerging(true);

    try {
      const blobA = await buildCatalogPdfBlob(catA);
      const blobB = await buildCatalogPdfBlob(catB);

      // Merge with pdf-lib
      const bytesA = await blobA.arrayBuffer();
      const bytesB = await blobB.arrayBuffer();

      const mergedPdf = await PDFDocument.create();
      const docA = await PDFDocument.load(bytesA, { ignoreEncryption: true });
      const docB = await PDFDocument.load(bytesB, { ignoreEncryption: true });

      const pagesA = await mergedPdf.copyPages(docA, docA.getPageIndices());
      pagesA.forEach((p) => mergedPdf.addPage(p));

      const pagesB = await mergedPdf.copyPages(docB, docB.getPageIndices());
      pagesB.forEach((p) => mergedPdf.addPage(p));

      const mergedBytes = await mergedPdf.save();
      const mergedBlob = new Blob([new Uint8Array(mergedBytes)], { type: 'application/pdf' });

      // Download merged PDF
      const url = URL.createObjectURL(mergedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `كتالوج_مدمج_${catA.name}_مع_${catB.name}.pdf`.replace(/\s+/g, '_');
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      setShowMergeModal(false);
      showToast('تم دمج الكتالوجين بنجاح وتحميل الملف!');
    } catch (err: any) {
      toast.error('خطأ أثناء دمج الكتالوجين: ' + err.message);
    } finally {
      setIsMerging(false);
    }
  };

  // ----------------------------------------------------
  // Filtered Products for the Checkbox Picker
  // ----------------------------------------------------
  const filteredAvailableProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.code && p.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchCat =
        selectedCategoryFilter === 'الكل' || p.category === selectedCategoryFilter;

      return matchSearch && matchCat;
    });
  }, [products, searchQuery, selectedCategoryFilter]);

  // Selected Products Sequence for Current Catalog
  const selectedProductsInOrder = useMemo(() => {
    if (!currentCatalog) return [];
    const prodMap = new Map(products.map((p) => [p.id, p]));
    return currentCatalog.product_ids
      .map((id) => prodMap.get(id))
      .filter((p): p is Product => Boolean(p));
  }, [products, currentCatalog]);

  // Unique categories list
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  // Preview HTML (render full catalog up to 50 pages)
  const previewHtml = useMemo(() => {
    if (!currentCatalog) return '';
    return buildPreviewHtml(products, settings, undefined, 50, currentCatalog);
  }, [products, settings, currentCatalog]);

  const estimatedTotalPages = useMemo(() => {
    if (!currentCatalog) return 1;
    const seq = buildCatalogItemsSequence(products, settings, currentCatalog);
    const eff = resolveEffectiveGridLayout({
      mode: currentCatalog.grid_layout_mode || settings.grid_layout_mode || 'manual',
      symmetry: currentCatalog.grid_symmetry || settings.grid_symmetry || 'any',
      columns: currentCatalog.columns_count || settings.products_per_row || 4,
      rows: currentCatalog.rows_count ?? settings.rows_per_page,
      itemCount: seq.filter((i) => i.type === 'product').length,
    });
    const productPages =
      selectedProductsInOrder.length > 0
        ? paginateCatalogPageItems(
            seq,
            eff.cols,
            eff.rows,
            resolveSectionHeaderConfig(settings, currentCatalog)
          ).length
        : 0;
    const uploadedPages =
      currentCatalog.source_type === 'uploaded_pdf' ? currentCatalog.pdf_page_count || 1 : 0;
    return Math.max(1, uploadedPages + productPages);
  }, [currentCatalog, products, settings, selectedProductsInOrder.length]);

  // ====================================================
  // RENDER: 1) Catalogs List View (when none selected)
  // ====================================================
  if (!currentCatalog) {
    return (
      <div className="space-y-6">
        {/* Header Banner */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-50 text-sky-700 text-xs font-bold rounded-full border border-sky-100">
              <BookOpen size={14} />
              <span>إدارة وتخصيص الكتالوجات</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              كتالوجاتي
            </h2>
            <p className="text-sm text-slate-500 max-w-xl">
              أنشئ كتالوجات مخصصة بأسماء مختلفة (مثل: جملة، قطاعي، عروض المحلات)، رتّب الأصناف بالأزرار، وأضف أشرطة فواصل الأقسام، واطبع PDF بهوامش 10مم دقيقة.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => setShowMergeModal(true)}
              disabled={catalogs.length < 2}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-2xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title={catalogs.length < 2 ? 'تحتاج إلى كتالوجين على الأقل للدمج' : 'اجمع كتالوجين في ملف واحد'}
            >
              <Layers size={17} className="text-indigo-600" />
              <span>دمج كتالوجين</span>
            </button>

            <button
              onClick={() => setShowUploadPdfModal(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-2xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              title="أضف ملف PDF عملته من جهاز آخر لعرضه وحذف أو إضافة صفحات وأصناف جديدة عليه"
            >
              <FileUp size={17} />
              <span>إضافة PDF جاهز</span>
            </button>

            <button
              onClick={() => {
                setNewCatalogName(`كتالوج ${new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}`);
                setShowNewCatalogModal(true);
              }}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold rounded-2xl shadow-md shadow-sky-600/20 transition-all cursor-pointer"
            >
              <Plus size={18} />
              <span>+ إنشاء كتالوج جديد</span>
            </button>
          </div>
        </div>

        {/* Catalogs List Grid */}
        {catalogs.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto">
              <FolderPlus size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">لا توجد كتالوجات محفوظة بعد</h3>
            <p className="text-xs text-slate-500">
              أنشئ أول كتالوج لك الآن أو أضف ملف PDF جاهز عملته من جهاز آخر لعرضه وتكملته وحفظه هنا.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                onClick={() => {
                  setNewCatalogName('كتالوج الجملة الرئيسي');
                  setShowNewCatalogModal(true);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                <Plus size={16} />
                <span>ابدأ بإنشاء كتالوجك الأول</span>
              </button>

              <button
                onClick={() => setShowUploadPdfModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                <FileUp size={16} />
                <span>إضافة PDF من جهاز آخر</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {catalogs.map((cat) => {
              const count = cat.product_ids?.length || 0;
              const isUploadedPdf = cat.source_type === 'uploaded_pdf';
              return (
                <div
                  key={cat.id}
                  className="bg-white border border-slate-200 hover:border-sky-300 rounded-3xl p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span
                          className="w-3 h-3 rounded-full inline-block mb-1"
                          style={{ backgroundColor: isUploadedPdf ? '#4f46e5' : cat.primary_color || '#ea580c' }}
                        />
                        <h3 className="font-extrabold text-slate-900 text-base group-hover:text-sky-600 transition-colors">
                          {cat.name}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          آخر تعديل: {new Date(cat.updated_at).toLocaleDateString('ar-EG')}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDuplicateCatalog(cat)}
                          title="نسخ الكتالوج"
                          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteCatalog(cat.id, cat.name)}
                          title="حذف الكتالوج"
                          className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Metadata tags */}
                    <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                      {isUploadedPdf ? (
                        <>
                          <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg">
                            📄 PDF مستورد • {cat.pdf_page_count || 1} صفحة
                          </span>
                          {count > 0 && (
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
                              ➕ {count} صنف تكميلي
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
                            📦 {count} صنف
                          </span>
                          <span className="px-2.5 py-1 bg-sky-50 text-sky-700 rounded-lg" dir="ltr">
                            {cat.grid_layout_mode === 'auto'
                              ? '✨ تلقائي'
                              : `🏛️ ${cat.columns_count || 4}×${cat.rows_count || ((cat.columns_count || 4) === 4 ? 4 : 3)}`}
                          </span>
                        </>
                      )}
                      {cat.price_validity_note && (
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg">
                          📅 {cat.price_validity_note}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-5 mt-5 border-t border-slate-100 flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedCatalogId(cat.id);
                        setActiveSubTab('editor');
                      }}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                        isUploadedPdf
                          ? 'bg-indigo-600 hover:bg-indigo-700'
                          : 'bg-sky-600 hover:bg-sky-700'
                      }`}
                    >
                      <Edit3 size={15} />
                      <span>{isUploadedPdf ? 'عرض وتكملة الـ PDF' : 'تخصيص الأصناف'}</span>
                    </button>

                    <button
                      onClick={() => {
                        setSelectedCatalogId(cat.id);
                        setActiveSubTab('preview');
                      }}
                      className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
                      title={isUploadedPdf ? 'عرض الـ PDF' : 'معاينة A4'}
                    >
                      <Eye size={17} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: New Catalog */}
        {showNewCatalogModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-slate-900 text-lg">إنشاء كتالوج جديد</h3>
                <button
                  onClick={() => setShowNewCatalogModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateCatalog} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    اسم الكتالوج (مثال: جملة المحلات، عروض نوفمبر، إكسسوارات مميزة)
                  </label>
                  <input
                    type="text"
                    required
                    value={newCatalogName}
                    onChange={(e) => setNewCatalogName(e.target.value)}
                    placeholder="اكتب اسم الكتالوج..."
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    autoFocus
                  />
                </div>

                <div className="p-3 bg-sky-50 border border-sky-100 rounded-xl text-xs text-sky-800 space-y-1">
                  <p className="font-bold">✨ نصيحة:</p>
                  <p>
                    سيتم تلقائياً تفعيل كل الأصناف المسعرة، ويمكنك بعد إنشائه استبعاد أي أصناف وترتيب الباقي وإضافة فواصل مخصصة.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewCatalogModal(false)}
                    className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold rounded-xl shadow-md shadow-sky-600/20"
                  >
                    إنشاء الكتالوج
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Merge 2 Catalogs */}
        {showMergeModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Layers size={20} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">
                      اجمع كتالوجين في ملف واحد
                    </h3>
                    <p className="text-xs text-slate-500">
                      دمج فوري بدون فقدان جودة باستخدام محرك PDF المدمج
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowMergeModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    الكتالوج الأول (يظهر في البداية):
                  </label>
                  <select
                    value={mergeCatalogA}
                    onChange={(e) => setMergeCatalogA(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">-- اختر الكتالوج الأول --</option>
                    {catalogs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (
                        {c.source_type === 'uploaded_pdf'
                          ? `PDF جاهز • ${c.pdf_page_count || 1} صفحة`
                          : `${c.product_ids?.length || 0} صنف`}
                        )
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    الكتالوج الثاني (يُضاف بعد الأول):
                  </label>
                  <select
                    value={mergeCatalogB}
                    onChange={(e) => setMergeCatalogB(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">-- اختر الكتالوج الثاني --</option>
                    {catalogs
                      .filter((c) => c.id !== mergeCatalogA)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (
                          {c.source_type === 'uploaded_pdf'
                            ? `PDF جاهز • ${c.pdf_page_count || 1} صفحة`
                            : `${c.product_ids?.length || 0} صنف`}
                          )
                        </option>
                      ))}
                  </select>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                  💡 سيتم تجميع كافة صفحات الكتالوجين في ملف PDF واحد متصل ومناسب للإرسال للعملاء.
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMergeModal(false)}
                  disabled={isMerging}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleMergeTwoCatalogs}
                  disabled={isMerging || !mergeCatalogA || !mergeCatalogB}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-xl shadow-md shadow-indigo-600/20 disabled:opacity-50"
                >
                  {isMerging ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>جارِ الدمج...</span>
                    </>
                  ) : (
                    <>
                      <FileDown size={16} />
                      <span>دمج وتحميل الـ PDF الآن</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Upload External Ready PDF as Catalog */}
        {showUploadPdfModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <FileUp size={20} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">
                      إضافة كتالوج PDF من جهاز آخر
                    </h3>
                    <p className="text-xs text-slate-500">
                      اعرضه، احذف أو أضف صفحات، وكمل عليه أصناف جديدة كأنك عملته هنا
                    </p>
                  </div>
                </div>
                <button
                  onClick={resetUploadPdfModal}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreatePdfCatalog} className="space-y-4">
                <input
                  type="file"
                  ref={uploadPdfInputRef}
                  accept=".pdf,application/pdf"
                  onChange={handleSelectExternalPdf}
                  className="hidden"
                />

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    1. اختر ملف الـ PDF الجاهز من جهازك:
                  </label>
                  <button
                    type="button"
                    onClick={() => uploadPdfInputRef.current?.click()}
                    className={`w-full p-5 border-2 border-dashed rounded-2xl text-center transition-all cursor-pointer flex flex-col items-center gap-2 ${
                      uploadPdfFile
                        ? 'border-indigo-400 bg-indigo-50/50 text-indigo-900'
                        : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    {uploadPdfFile ? (
                      <>
                        <FileText size={28} className="text-indigo-600" />
                        <span className="text-xs font-extrabold">{uploadPdfFile.name}</span>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">
                          {uploadPdfPageCount} صفحة • {(uploadPdfFile.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                        <span className="text-[11px] text-indigo-600 underline">اضغط لتغيير الملف</span>
                      </>
                    ) : (
                      <>
                        <Upload size={26} className="text-slate-400" />
                        <span className="text-xs font-bold">اضغط لاختيار ملف PDF من جهازك</span>
                        <span className="text-[11px] text-slate-400">يتم حفظه بالكامل في المتصفح بدون فقدان جودة</span>
                      </>
                    )}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    2. اسم الكتالوج في قائمتك:
                  </label>
                  <input
                    type="text"
                    required
                    value={uploadPdfName}
                    onChange={(e) => setUploadPdfName(e.target.value)}
                    placeholder="مثال: كتالوج جملة الشتاء (المستكمل)"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    3. ملاحظة صلاحية الأسعار (اختياري):
                  </label>
                  <input
                    type="text"
                    value={uploadPdfValidity}
                    onChange={(e) => setUploadPdfValidity(e.target.value)}
                    placeholder="سارية لمدة 15 يوماً"
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    4. كيف تريد فتح الكتالوج بعد الاستيراد؟
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setUploadPdfActionMode('pdf_pages')}
                      className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                        uploadPdfActionMode === 'pdf_pages'
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-950'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-extrabold text-xs">فتح سريع كصفحات PDF</div>
                      <div className="text-[11px] opacity-80 mt-0.5">
                        عرض وتعديل مباشر على الصفحات + إضافة صفحات أو منتجات تكميلية
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setUploadPdfActionMode('ai_convert')}
                      className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                        uploadPdfActionMode === 'ai_convert'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-extrabold text-xs">استخراج المنتجات فوراً (AI)</div>
                      <div className="text-[11px] opacity-80 mt-0.5">
                        تحويل كل كارت لمنتج حقيقي لتعدل الأسعار والصور وتحذف وتضيف بحرية
                      </div>
                    </button>
                  </div>

                  {uploadPdfActionMode === 'ai_convert' && (
                    <div className="mt-2 p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-bold text-emerald-900">نوع الأسعار داخل الملف:</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setUploadPdfPriceMode('selling')}
                          className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                            uploadPdfPriceMode === 'selling'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white text-slate-700 border border-slate-200'
                          }`}
                        >
                          أسعار بيع جاهزة
                        </button>
                        <button
                          type="button"
                          onClick={() => setUploadPdfPriceMode('wholesale')}
                          className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                            uploadPdfPriceMode === 'wholesale'
                              ? 'bg-sky-600 text-white'
                              : 'bg-white text-slate-700 border border-slate-200'
                          }`}
                        >
                          أسعار جملة
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={resetUploadPdfModal}
                    disabled={isImportingPdf}
                    className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isImportingPdf || !uploadPdfFile}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl shadow-md shadow-indigo-600/20"
                  >
                    {isImportingPdf ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        <span>جاري الحفظ...</span>
                      </>
                    ) : (
                      <>
                        <FileUp size={15} />
                        <span>
                          {uploadPdfActionMode === 'ai_convert'
                            ? 'حفظ واستخراج المنتجات الآن'
                            : 'حفظ وفتح الكتالوج'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ====================================================
  // RENDER: 2) Active Catalog Editor & Customizer View
  // ====================================================
  return (
    <div className="space-y-6">
      {/* Progress Overlay for PDF Generation */}
      {isGeneratingPdf && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl text-center space-y-4">
            <RefreshCw size={36} className="text-sky-600 animate-spin mx-auto" />
            <h3 className="font-extrabold text-slate-900 text-base">جارِ توليد ملف الـ PDF...</h3>
            <p className="text-xs text-slate-500">
              رسم صفحات الكتالوج بدقة 10مم عالية الجودة
            </p>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
              <div
                className="bg-sky-600 h-full transition-all duration-300"
                style={{ width: `${pdfProgress}%` }}
              />
            </div>
            <span className="text-xs font-bold text-slate-700">{pdfProgress}%</span>
          </div>
        </div>
      )}

      {/* Progress Overlay for AI PDF-to-Catalog Extraction */}
      {isConvertingPdfToEditable && (
        <div className="fixed inset-0 z-70 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl text-center space-y-4">
            <Sparkles size={38} className="text-emerald-600 animate-pulse mx-auto" />
            <h3 className="font-extrabold text-slate-900 text-base">
              جاري استخراج المنتجات من صفحات الـ PDF...
            </h3>
            <p className="text-xs font-bold text-slate-600">
              {conversionProgress?.message || 'يرجى الانتظار وعدم إغلاق الصفحة...'}
            </p>
            {conversionProgress && conversionProgress.totalPages > 0 && (
              <>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-emerald-600 h-full transition-all duration-300"
                    style={{
                      width: `${Math.round(
                        (conversionProgress.currentPage / conversionProgress.totalPages) * 100
                      )}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                  <span>
                    صفحة {conversionProgress.currentPage} من {conversionProgress.totalPages}
                  </span>
                  <span className="text-emerald-700">
                    تم استخراج {conversionProgress.extractedCount} صنف
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Top Bar: Back button, Name edit, Action Buttons */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-xs flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3.5">
        {/* Right side in RTL: Title & Back */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedCatalogId(null)}
            className="p-2.5 hover:bg-slate-100 text-slate-600 rounded-2xl transition-colors cursor-pointer"
            title="العودة لقائمة الكتالوجات"
          >
            <ChevronRight size={22} />
          </button>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={currentCatalog.name}
                onChange={(e) => handleUpdateCurrentCatalog({ name: e.target.value })}
                className="font-black text-lg sm:text-xl text-slate-900 border-b border-dashed border-slate-300 hover:border-sky-500 focus:border-sky-600 focus:outline-none bg-transparent"
                title="اضغط لتعديل اسم الكتالوج مباشرة"
              />
              {currentCatalog.source_type === 'uploaded_pdf' ? (
                <>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    📄 {currentCatalog.pdf_page_count || 1} صفحة PDF
                  </span>
                  {selectedProductsInOrder.length > 0 && (
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700">
                      + {selectedProductsInOrder.length} صنف تكميلي
                    </span>
                  )}
                </>
              ) : (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700">
                  {currentCatalog.product_ids?.length || 0} صنف مختار
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              يتم حفظ التغييرات تلقائياً في IndexedDB
            </p>
          </div>
        </div>

        {/* Center: Sub-Tabs */}
        <div className="flex items-center justify-center bg-slate-100 p-1 rounded-2xl">
          <button
            onClick={() => setActiveSubTab('editor')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${
              activeSubTab === 'editor'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Edit3 size={15} />
            <span>
              {currentCatalog.source_type === 'uploaded_pdf' ? 'عرض وتكملة الـ PDF' : 'الأصناف والترتيب'}
            </span>
          </button>
          <button
            onClick={() => setActiveSubTab('preview')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${
              activeSubTab === 'preview'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye size={15} />
            <span>
              {currentCatalog.source_type === 'uploaded_pdf' ? 'عرض الكتالوج كامل' : 'معاينة A4 حية'}
            </span>
          </button>
        </div>

        {/* Left side in RTL: Action Buttons (Requirement د) */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowCatalogSettingsModal(true)}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            title="تخصيص الشعار، بيانات التواصل، وصلاحية الأسعار لهذا الكتالوج"
          >
            <SettingsIcon size={16} />
            <span className="hidden sm:inline">إعدادات الكتالوج</span>
          </button>

          {!(currentCatalog.source_type === 'uploaded_pdf' && selectedProductsInOrder.length === 0) && (
            <button
              onClick={handleDownloadExcel}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              title="تحميل أصناف الكتالوج فقط بملف إكسيل"
            >
              <FileSpreadsheet size={16} className="text-emerald-600" />
              <span className="hidden sm:inline">إكسيل</span>
            </button>
          )}

          <button
            onClick={handleShareWhatsApp}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-xs cursor-pointer"
            title="مشاركة الكتالوج كملف PDF على واتساب مباشرة"
          >
            <Share2 size={16} />
            <span>مشاركة واتساب</span>
          </button>

          <button
            type="button"
            onClick={() => void handleOpenSplitModal()}
            disabled={isPreparingSplit}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold shadow-xs transition-all cursor-pointer"
            title="تقسيم هذا الكتالوج إلى عدة ملفات PDF حسب الأقسام أو الصفحات"
          >
            {isPreparingSplit ? <RefreshCw size={15} className="animate-spin" /> : <Split size={15} />}
            <span>تقسيم لكذا ملف</span>
          </button>

          <button
            onClick={handleDownloadPdf}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-sky-600/20 transition-all cursor-pointer"
          >
            <FileDown size={16} />
            <span>تحميل PDF</span>
          </button>

          <button
            onClick={() => handleDeleteCatalog(currentCatalog.id, currentCatalog.name)}
            className="p-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl transition-colors cursor-pointer"
            title="حذف هذا الكتالوج"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* ==================================================== */}
      {/* Sub-Tab 1: Product Picker, Ordering, Section Headers */}
      {/* ==================================================== */}
      {activeSubTab === 'editor' && (
        <div className="space-y-6">
          {currentCatalog.source_type === 'uploaded_pdf' && (
            <>
              <UploadedPdfPagesPanel
                catalog={currentCatalog}
                mode="manage"
                onPdfUpdated={handleUpdateCurrentCatalog}
                onDeleteCatalog={() => handleDeleteCatalog(currentCatalog.id, currentCatalog.name)}
                onConvertToEditableCatalog={handleConvertPdfToEditableCatalog}
                isConvertingToEditable={isConvertingPdfToEditable}
              />

              <div className="bg-indigo-50/80 border border-indigo-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <h4 className="font-extrabold text-indigo-950 text-xs sm:text-sm">
                    ➕ تكملة الكتالوج بأصناف إضافية من منتجاتك أو إضافة منتج جديد
                  </h4>
                  <p className="text-[11px] text-indigo-800">
                    أي أصناف تختارها أو تضيفها بالأسفل سيتم إلحاقها تلقائياً كصفحات A4 جديدة بعد صفحات الـ PDF المستورد عند التحميل أو المشاركة.
                  </p>
                </div>
                <span className="px-3 py-1 bg-white border border-indigo-200 rounded-xl text-xs font-extrabold text-indigo-700 shrink-0">
                  المضاف للتكملة: {selectedProductsInOrder.length} صنف
                </span>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
            {/* Right Panel: Product Picker with Checkboxes (5 cols) */}
            <div className="xl:col-span-5 bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">
                  1. اختيار أو إضافة الأصناف
                </h3>
                <p className="text-[11px] text-slate-500">
                  تم تحديد {currentCatalog.product_ids?.length || 0} من أصل {products.length} صنف
                </p>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowManualProductModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-extrabold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer shadow-2xs"
                  title="إضافة منتج جديد بالاسم والصورة والسعر مباشرة لهذا الكتالوج"
                >
                  <Plus size={12} />
                  <span>منتج جديد</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectAllFiltered(filteredAvailableProducts)}
                  className="px-2.5 py-1 text-[11px] font-bold bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-lg transition-colors cursor-pointer"
                  title="تحديد كل الأصناف المعروضة بالفلتر الحالي"
                >
                  تحديد كل النوع
                </button>
                <button
                  type="button"
                  onClick={() => handleDeselectAllFiltered(filteredAvailableProducts)}
                  className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  title="إلغاء تحديد كل الأصناف المعروضة"
                >
                  إلغاء الكل
                </button>
              </div>
            </div>

            {/* Search and Category Filter */}
            <div className="space-y-2">
              <div className="relative">
                <Search size={16} className="absolute right-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="بحث باسم الصنف أو الكود..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pr-10 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              {/* Category selector */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryFilter('الكل')}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategoryFilter === 'الكل'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  الكل ({products.length})
                </button>
                {availableCategories.map((cat) => {
                  const catCount = products.filter((p) => p.category === cat).length;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategoryFilter(cat)}
                      className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors cursor-pointer ${
                        selectedCategoryFilter === cat
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat} ({catCount})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Checkbox List */}
            <div className="max-h-[580px] overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100">
              {filteredAvailableProducts.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  لا توجد نتائج مطابقة للبحث أو الفلتر
                </div>
              ) : (
                filteredAvailableProducts.map((prod) => {
                  const isChecked = currentCatalog.product_ids.includes(prod.id);
                  return (
                    <label
                      key={prod.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors pt-2.5 ${
                        isChecked ? 'bg-sky-50/70 border border-sky-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleProductInCatalog(prod.id)}
                          className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                        />
                        {prod.image_url ? (
                          <img
                            src={prod.image_url}
                            alt={prod.name}
                            className="w-9 h-9 object-contain rounded-lg border border-slate-200 bg-white shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center text-[10px] shrink-0">
                            بدون
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{prod.name}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                            {prod.code && (
                              <span className="font-mono bg-slate-100 px-1 rounded">{prod.code}</span>
                            )}
                            <span>{prod.category || 'متنوع'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-left font-extrabold text-xs text-emerald-700">
                          {prod.selling_price || 0} ج.م
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingProduct({ ...prod });
                            setShowEditProductModal(true);
                          }}
                          className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer"
                          title="تعديل بيانات الصنف"
                        >
                          <Edit3 size={13} />
                        </button>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Left Panel: Selected Sequence, Section Headers & Reordering (7 cols) */}
          <div className="xl:col-span-7 bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">
                  2. ترتيب الأصناف وفواصل الأقسام (Section Headers)
                </h3>
                <p className="text-[11px] text-slate-500">
                  رتب الأصناف بالأسهم، أو استخدم الترتيب التلقائي، وأضف أشرطة فواصل عريضة
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddHeaderModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition-colors cursor-pointer border border-indigo-200"
                >
                  <Plus size={14} />
                  <span>+ شريط فاصل مخصص</span>
                </button>
              </div>
            </div>

            {/* Quick Auto-Sort Controls & Category Auto-header toggle */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200">
              {/* Category auto headers switch + Section Properties */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !currentCatalog.auto_category_headers;
                    handleUpdateCurrentCatalog({ auto_category_headers: nextVal });
                    if (nextVal) handleAutoSort('category');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                    currentCatalog.auto_category_headers
                      ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <Layers size={14} />
                  <span>
                    {currentCatalog.auto_category_headers
                      ? 'مقسّم حسب الأقسام ✓'
                      : 'تقسيم العناصر حسب الأقسام'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowSectionEditorModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-sky-50 text-sky-700 border border-sky-200 transition-colors cursor-pointer"
                >
                  <Edit3 size={13} />
                  <span>ترتيب وإخفاء وتعديل الأقسام</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFocusedProductId(null);
                    setShowCardDesignerModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 transition-colors cursor-pointer"
                >
                  <Palette size={13} />
                  <span>تصميم الكارت (شكل وعرض ولون)</span>
                </button>
              </div>

              {/* Auto sort buttons */}
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-slate-400 font-bold hidden sm:inline">ترتيب سريع:</span>
                <button
                  type="button"
                  onClick={() => handleAutoSort('category')}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg font-bold text-slate-700 cursor-pointer"
                >
                  حسب القسم
                </button>
                <button
                  type="button"
                  onClick={() => handleAutoSort('name')}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg font-bold text-slate-700 cursor-pointer"
                >
                  أ-ي
                </button>
                <button
                  type="button"
                  onClick={() => handleAutoSort('price_asc')}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg font-bold text-slate-700 cursor-pointer"
                >
                  السعر ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleAutoSort('price_desc')}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg font-bold text-slate-700 cursor-pointer"
                >
                  السعر ↓
                </button>
              </div>
            </div>

            {/* Manual Headers List (if any) */}
            {(currentCatalog.manual_headers || []).length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-500">الفواصل المخصصة الحالية:</span>
                <div className="flex flex-wrap gap-2">
                  {currentCatalog.manual_headers?.map((h) => (
                    <div
                      key={h.id}
                      className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl text-xs font-bold"
                    >
                      <span>🏷️ {h.title}</span>
                      <button
                        onClick={() => handleDeleteManualHeader(h.id)}
                        className="text-indigo-400 hover:text-rose-600 transition-colors"
                        title="حذف هذا الفاصل"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ordered Products List */}
            <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
              {selectedProductsInOrder.length === 0 ? (
                <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl space-y-2">
                  <p className="text-xs font-bold text-slate-600">
                    لم تقم باختيار أي أصناف لهذا الكتالوج بعد!
                  </p>
                  <p className="text-[11px] text-slate-400">
                    حدد الأصناف من القائمة اليمنى وسيظهر ترتيبها هنا تلقائياً.
                  </p>
                </div>
              ) : (
                selectedProductsInOrder.map((prod, index) => {
                  return (
                    <div
                      key={prod.id}
                      className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs group"
                    >
                      {/* Product Info & Thumbnail */}
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-bold text-slate-400 w-5 text-center shrink-0">
                          {index + 1}
                        </span>

                        {prod.image_url ? (
                          <img
                            src={prod.image_url}
                            alt={prod.name}
                            className="w-11 h-11 object-contain rounded-xl border border-slate-200 bg-slate-50 shrink-0"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center text-[10px] shrink-0">
                            بدون صورة
                          </div>
                        )}

                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-900 truncate" title={prod.name}>
                            {prod.name}
                          </h4>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                            <span className="font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                              {prod.selling_price || 0} ج.م
                            </span>
                            {prod.code && (
                              <span className="font-mono bg-slate-100 px-1 rounded">{prod.code}</span>
                            )}
                            <span>{prod.category || 'متنوع'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Controls: Reorder Arrows, Edit In-place, Remove & Delete */}
                      <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                        {/* Move To Top */}
                        <button
                          type="button"
                          onClick={() => moveItemToExtremes(index, 'top')}
                          disabled={index === 0}
                          className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-20"
                          title="نقل لأول الكتالوج"
                        >
                          <ChevronsUp size={16} />
                        </button>
                        {/* Move Up */}
                        <button
                          type="button"
                          onClick={() => moveItemInCatalog(index, index - 1)}
                          disabled={index === 0}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-20"
                          title="تحريك لأعلى"
                        >
                          <ArrowUp size={16} />
                        </button>
                        {/* Move Down */}
                        <button
                          type="button"
                          onClick={() => moveItemInCatalog(index, index + 1)}
                          disabled={index === selectedProductsInOrder.length - 1}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-20"
                          title="تحريك لأسفل"
                        >
                          <ArrowDown size={16} />
                        </button>
                        {/* Move To Bottom */}
                        <button
                          type="button"
                          onClick={() => moveItemToExtremes(index, 'bottom')}
                          disabled={index === selectedProductsInOrder.length - 1}
                          className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-20"
                          title="نقل لآخر الكتالوج"
                        >
                          <ChevronsDown size={16} />
                        </button>

                        <div className="h-5 w-px bg-slate-200 mx-1" />

                        {/* In-place Edit Product (Requirement ج) */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProduct({ ...prod });
                            setShowEditProductModal(true);
                          }}
                          className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer"
                          title="تعديل بيانات الصنف مباشرة"
                        >
                          <Edit3 size={15} />
                        </button>

                        {/* Action 1: Remove from this catalog only (Requirement ج) */}
                        <button
                          type="button"
                          onClick={() => toggleProductInCatalog(prod.id)}
                          className="px-2 py-1 text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer"
                          title="استبعاد هذا الصنف من هذا الكتالوج فقط، مع الإبقاء عليه في قاعدة البيانات"
                        >
                          شيله من الكتالوج ده بس
                        </button>

                        {/* Action 2: Permanent delete from database (Requirement ج) */}
                        <button
                          type="button"
                          onClick={() => handlePermanentDeleteProduct(prod)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="حذف الصنف نهائياً من قاعدة البيانات بالكامل"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* Sub-Tab 2: Live Interactive A4 Preview Tab */}
      {/* ==================================================== */}
      {activeSubTab === 'preview' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                {currentCatalog.source_type === 'uploaded_pdf'
                  ? 'معاينة الكتالوج الكامل (ملف الـ PDF + أي صفحات تكميلية)'
                  : 'معاينة صفحات الـ PDF (A4 - هوامش 10مم دقيقة)'}
              </h3>
              <p className="text-xs text-slate-500">
                {currentCatalog.source_type === 'uploaded_pdf'
                  ? 'يعرض صفحات الـ PDF المستورد أولاً، ثم تتبعه الصفحات التكميلية للأصناف المضافة'
                  : 'هذه المعاينة تطابق بالملي ملف الـ PDF الذي سيتم تنزيله، بشبكة متساوية وفواصل عريضة'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSectionEditorModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer"
              >
                <Edit3 size={14} className="text-orange-600" />
                <span>ترتيب/إخفاء الأقسام</span>
              </button>

              <button
                type="button"
                onClick={() => void handleOpenSplitModal()}
                disabled={isPreparingSplit}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold cursor-pointer"
              >
                {isPreparingSplit ? <RefreshCw size={14} className="animate-spin" /> : <Split size={14} />}
                <span>تقسيم لكذا ملف</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFocusedProductId(null);
                  setShowCardDesignerModal(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 rounded-xl text-xs font-extrabold cursor-pointer"
              >
                <Palette size={15} className="text-orange-600" />
                <span>تصميم الكارت (شكل وعرض ولون)</span>
              </button>

              <button
                onClick={handleDownloadPdf}
                className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-orange-600/20 cursor-pointer"
              >
                <FileDown size={16} />
                <span>تحميل الكتالوج PDF</span>
              </button>
            </div>
          </div>

          {/* Quick Live Grid Layout Controller right above Preview */}
          {(currentCatalog.source_type !== 'uploaded_pdf' || selectedProductsInOrder.length > 0) && (
            <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xs">
              <GridLayoutSelector
                columns={(currentCatalog.columns_count || settings.products_per_row || 4) as GridCols}
                rows={
                  (currentCatalog.rows_count ||
                    settings.rows_per_page ||
                    ((currentCatalog.columns_count || settings.products_per_row || 4) === 4 ? 4 : 3)) as GridRows
                }
                mode={(currentCatalog.grid_layout_mode || settings.grid_layout_mode || 'manual') as GridLayoutMode}
                symmetry={(currentCatalog.grid_symmetry || settings.grid_symmetry || 'any') as GridSymmetryMode}
                itemCount={selectedProductsInOrder.length}
                onChange={(cols, rows, mode, symmetry) =>
                  handleUpdateCurrentCatalog({
                    columns_count: cols,
                    rows_count: rows,
                    grid_layout_mode: mode ?? currentCatalog.grid_layout_mode ?? 'manual',
                    grid_symmetry: symmetry ?? currentCatalog.grid_symmetry ?? 'any',
                  })
                }
                compact
              />
            </div>
          )}

          {currentCatalog.source_type === 'uploaded_pdf' ? (
            <div className="space-y-6">
              <UploadedPdfPagesPanel
                catalog={currentCatalog}
                mode="preview"
                onPdfUpdated={handleUpdateCurrentCatalog}
                onDeleteCatalog={() => handleDeleteCatalog(currentCatalog.id, currentCatalog.name)}
              />

              {selectedProductsInOrder.length > 0 && (
                <div className="space-y-3">
                  <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 text-xs font-extrabold text-orange-900">
                    ➕ الصفحات التكميلية المضافة للأصناف ({selectedProductsInOrder.length} صنف) — اضغط على أي كارت لتعديل لونه وبياناته
                  </div>
                  <div className="p-3 sm:p-4 bg-slate-200/70 rounded-3xl">
                    <ResponsiveA4Preview
                      html={previewHtml}
                      onCardClick={(pid) => {
                        setFocusedProductId(pid);
                        setShowCardDesignerModal(true);
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 sm:p-4 bg-slate-200/70 rounded-3xl">
              <ResponsiveA4Preview
                html={previewHtml}
                onCardClick={(pid) => {
                  setFocusedProductId(pid);
                  setShowCardDesignerModal(true);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* Modal: Add Manual Section Header */}
      {/* ==================================================== */}
      {showAddHeaderModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 text-base">
                إضافة شريط فاصل مخصص (Section Header)
              </h3>
              <button
                onClick={() => setShowAddHeaderModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  عنوان الفاصل (مثال: عروض خاصة، وصل حديثاً، شواحن أصلية):
                </label>
                <input
                  type="text"
                  required
                  value={headerTitle}
                  onChange={(e) => setHeaderTitle(e.target.value)}
                  placeholder="اكتب عنوان الفاصل..."
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  نص فرعي توضيحي (اختياري):
                </label>
                <input
                  type="text"
                  value={headerSubtitle}
                  onChange={(e) => setHeaderSubtitle(e.target.value)}
                  placeholder="مثال: خصم 10% عند شراء أكثر من 5 قطع"
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  موضع الفاصل في الكتالوج:
                </label>
                <select
                  value={headerPositionIndex}
                  onChange={(e) => setHeaderPositionIndex(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value={0}>في بداية الكتالوج (أول صفحة قبل جميع الأصناف)</option>
                  {selectedProductsInOrder.map((p, idx) => (
                    <option key={p.id} value={idx + 1}>
                      بعد الصنف رقم {idx + 1}: {p.name.slice(0, 35)}...
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-800">
                🏷️ يظهر هذا الفاصل كشريط عريض كامل العرض عبر كافة الأعمدة، ولا ينفصل وحيداً أسفل الصفحة.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddHeaderModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleAddManualHeader}
                disabled={!headerTitle.trim()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-xl shadow-md shadow-indigo-600/20 disabled:opacity-50"
              >
                إضافة الفاصل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* Modal: In-place Full Product Edit */}
      {/* ==================================================== */}
      {showEditProductModal && editingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-base">
                تعديل بيانات الصنف بالكامل
              </h3>
              <button
                type="button"
                onClick={() => setShowEditProductModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProductEdit} className="space-y-3.5">
              {/* Photo Upload + Preview */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="w-16 h-16 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                  {editingProduct.image_url ? (
                    <img
                      src={editingProduct.image_url}
                      alt="معاينة"
                      className="w-full h-full object-contain p-1"
                    />
                  ) : (
                    <ImageIcon size={22} className="text-slate-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <input
                    type="file"
                    ref={editProductPhotoInputRef}
                    accept="image/*"
                    onChange={handleEditProductPhotoUpload}
                    className="hidden"
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => editProductPhotoInputRef.current?.click()}
                      disabled={isUploadingEditPhoto}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                    >
                      <Upload size={13} />
                      <span>{isUploadingEditPhoto ? 'جاري الضغط...' : 'رفع صورة من الجهاز'}</span>
                    </button>
                    {editingProduct.image_url && (
                      <button
                        type="button"
                        onClick={() => setEditingProduct({ ...editingProduct, image_url: '' })}
                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-xl cursor-pointer"
                      >
                        مسح الصورة
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={editingProduct.image_url || ''}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, image_url: e.target.value })
                    }
                    placeholder="أو الصق رابط الصورة هنا (https://...)"
                    className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المنتج:</label>
                <input
                  type="text"
                  required
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    سعر البيع (ج.م):
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="any"
                    value={editingProduct.selling_price ?? 0}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        selling_price: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs font-extrabold text-emerald-700 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    سعر الجملة (ج.م):
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={editingProduct.wholesale_price ?? 0}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        wholesale_price: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">كود الصنف:</label>
                  <input
                    type="text"
                    value={editingProduct.code || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, code: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">القسم / الفئة:</label>
                  <select
                    value={editingProduct.category || 'متنوعة'}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, category: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  >
                    {(settings.categories && settings.categories.length > 0
                      ? settings.categories
                      : DEFAULT_CATEGORIES
                    ).map((cat) => (
                      <option key={cat.id} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                    {editingProduct.category &&
                      !(
                        settings.categories && settings.categories.length > 0
                          ? settings.categories
                          : DEFAULT_CATEGORIES
                      ).some((c) => c.name === editingProduct.category) && (
                        <option value={editingProduct.category}>{editingProduct.category}</option>
                      )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الماركة:</label>
                  <input
                    type="text"
                    value={editingProduct.group || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, group: e.target.value })}
                    placeholder="مثال: Joyroom"
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الموديل:</label>
                  <input
                    type="text"
                    value={editingProduct.model || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, model: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  المواصفات / السعة:
                </label>
                <input
                  type="text"
                  value={editingProduct.specification || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, specification: e.target.value })
                  }
                  placeholder="مثال: 20W PD شحن سريع أو 10000mAh"
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-sky-50 border border-sky-100 rounded-xl text-xs text-sky-800">
                💾 يتم حفظ التعديلات مباشرة في قاعدة البيانات وتنعكس فوراً في المعاينة وملفات الـ PDF والإكسيل.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditProductModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold rounded-xl shadow-md shadow-sky-600/20 cursor-pointer"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* Modal: Catalog-Specific Settings (Company, Bio, Logo, Phone, Validity) */}
      {/* ==================================================== */}
      {showCatalogSettingsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  إعدادات وتخصيص الكتالوج
                </h3>
                <p className="text-xs text-slate-500">{currentCatalog.name}</p>
              </div>
              <button
                onClick={() => setShowCatalogSettingsModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم الشركة / المحل في ترويسة الكتالوج:
                </label>
                <input
                  type="text"
                  value={currentCatalog.company_name || ''}
                  onChange={(e) => handleUpdateCurrentCatalog({ company_name: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  الوصف أو النبذة (Bio):
                </label>
                <input
                  type="text"
                  value={currentCatalog.business_bio || ''}
                  onChange={(e) => handleUpdateCurrentCatalog({ business_bio: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              {/* Price Validity Date (Requirement ب) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  📅 تاريخ صلاحية الأسعار (مثال: سارية حتى 30 نوفمبر):
                </label>
                <input
                  type="text"
                  value={currentCatalog.price_validity_note || ''}
                  onChange={(e) =>
                    handleUpdateCurrentCatalog({ price_validity_note: e.target.value })
                  }
                  placeholder="سارية حتى 30 نوفمبر"
                  className="w-full px-3.5 py-2 border border-emerald-300 bg-emerald-50/50 rounded-xl text-xs font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف:</label>
                  <input
                    type="text"
                    value={currentCatalog.phone || ''}
                    onChange={(e) => handleUpdateCurrentCatalog({ phone: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم واتساب:</label>
                  <input
                    type="text"
                    value={currentCatalog.whatsapp_number || ''}
                    onChange={(e) =>
                      handleUpdateCurrentCatalog({ whatsapp_number: e.target.value })
                    }
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Catalog Grid Layout (Columns x Rows) */}
              <GridLayoutSelector
                columns={(currentCatalog.columns_count || settings.products_per_row || 4) as GridCols}
                rows={
                  (currentCatalog.rows_count ||
                    settings.rows_per_page ||
                    ((currentCatalog.columns_count || settings.products_per_row || 4) === 4 ? 4 : 3)) as GridRows
                }
                mode={(currentCatalog.grid_layout_mode || settings.grid_layout_mode || 'manual') as GridLayoutMode}
                symmetry={(currentCatalog.grid_symmetry || settings.grid_symmetry || 'any') as GridSymmetryMode}
                itemCount={selectedProductsInOrder.length}
                onChange={(cols, rows, mode, symmetry) =>
                  handleUpdateCurrentCatalog({
                    columns_count: cols,
                    rows_count: rows,
                    grid_layout_mode: mode ?? currentCatalog.grid_layout_mode ?? 'manual',
                    grid_symmetry: symmetry ?? currentCatalog.grid_symmetry ?? 'any',
                  })
                }
              />

              {/* Element visibility checkboxes */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  عناصر الكارت المعروضة:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={currentCatalog.show_image ?? true}
                      onChange={(e) => handleUpdateCurrentCatalog({ show_image: e.target.checked })}
                      className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                    <span>الصورة</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={currentCatalog.show_code ?? true}
                      onChange={(e) => handleUpdateCurrentCatalog({ show_code: e.target.checked })}
                      className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                    <span>كود الصنف</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={currentCatalog.show_category ?? true}
                      onChange={(e) =>
                        handleUpdateCurrentCatalog({ show_category: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                    <span>اسم القسم</span>
                  </label>
                </div>
              </div>

              {/* Logo URL */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  شعار الكتالوج (Logo URL):
                </label>
                <input
                  type="text"
                  value={currentCatalog.logo_url || ''}
                  onChange={(e) => handleUpdateCurrentCatalog({ logo_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              {/* Primary Color */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  لون الهوية للكتالوج:
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={currentCatalog.primary_color || '#ea580c'}
                    onChange={(e) => handleUpdateCurrentCatalog({ primary_color: e.target.value })}
                    className="w-10 h-10 rounded-xl cursor-pointer border border-slate-300"
                  />
                  <span className="text-xs font-mono font-bold text-slate-700">
                    {currentCatalog.primary_color || '#ea580c'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowCatalogSettingsModal(false);
                  showToast('تم حفظ إعدادات الكتالوج');
                }}
                className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold rounded-xl shadow-md shadow-sky-600/20"
              >
                إغلاق وحفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Dispatch / Pre-Export Review Modal (Requirement 1) */}
      {pendingReviewAction && (
        <CatalogReviewModal
          products={selectedProductsInOrder}
          settings={settings}
          actionTitle={pendingReviewAction.title}
          onConfirm={() => {
            const act = pendingReviewAction.action;
            setPendingReviewAction(null);
            if (act === 'pdf') executeDownloadPdf();
            else if (act === 'excel') executeDownloadExcel();
            else if (act === 'whatsapp') executeShareWhatsApp();
          }}
          onClose={() => setPendingReviewAction(null)}
          onProductsUpdated={onProductsUpdated}
        />
      )}

      {/* Quick In-Catalog Manual Product Creation Modal */}
      {showManualProductModal && (
        <ManualProductModal
          onProductCreated={(newProd) => {
            onProductsUpdated([newProd, ...products]);
            const latest = catalogsRef.current.find((c) => c.id === selectedCatalogId);
            if (latest) {
              const nextIds = [...(latest.product_ids || []), newProd.id];
              void handleUpdateCurrentCatalog({ product_ids: nextIds });
            }
            showToast(`تمت إضافة "${newProd.name}" وإدراجه في الكتالوج!`);
          }}
          onClose={() => setShowManualProductModal(false)}
        />
      )}

      {/* Full Section Editor & Properties Modal */}
      {currentCatalog && (
        <SectionEditorModal
          isOpen={showSectionEditorModal}
          onClose={() => setShowSectionEditorModal(false)}
          products={selectedProductsInOrder}
          categories={settings.categories && settings.categories.length > 0 ? settings.categories : DEFAULT_CATEGORIES}
          config={{
            ...DEFAULT_SECTION_HEADER_CONFIG,
            ...(settings.section_header_config || {}),
            ...(currentCatalog.section_header_config || {}),
            overrides: {
              ...(settings.section_header_config?.overrides || {}),
              ...(currentCatalog.section_header_config?.overrides || {}),
            },
          }}
          primaryColor={currentCatalog.primary_color || settings.primary_color || '#ea580c'}
          onChangeConfig={(next) => {
            const ovs = next.overrides || {};
            const prodMap = new Map(products.map((p) => [p.id, p]));
            const sortedCats = [...(settings.categories && settings.categories.length > 0 ? settings.categories : DEFAULT_CATEGORIES)]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            const rankMap = new Map<string, number>();
            sortedCats.forEach((c, i) => rankMap.set(c.name, i));

            const catProds = currentCatalog.product_ids
              .map((id) => prodMap.get(id))
              .filter((p): p is Product => Boolean(p));

            catProds.sort((a, b) => {
              const catA = a.category?.trim() || 'متنوعة';
              const catB = b.category?.trim() || 'متنوعة';
              const orderA = ovs[catA]?.order ?? (rankMap.has(catA) ? rankMap.get(catA)! : 999);
              const orderB = ovs[catB]?.order ?? (rankMap.has(catB) ? rankMap.get(catB)! : 999);
              if (orderA !== orderB) return orderA - orderB;
              if (catA !== catB) return catA.localeCompare(catB, 'ar');
              const sMode = ovs[catA]?.sort_products || 'default';
              if (sMode === 'price_asc') return (a.selling_price || 0) - (b.selling_price || 0);
              if (sMode === 'price_desc') return (b.selling_price || 0) - (a.selling_price || 0);
              if (sMode === 'name') return a.name.localeCompare(b.name, 'ar');
              return 0;
            });

            void handleUpdateCurrentCatalog({
              section_header_config: next,
              product_ids: currentCatalog.auto_category_headers
                ? catProds.map((p) => p.id)
                : currentCatalog.product_ids,
            });
          }}
          onProductsUpdated={onProductsUpdated}
          groupedEnabled={Boolean(currentCatalog.auto_category_headers)}
          onToggleGrouped={() => {
            const nextVal = !currentCatalog.auto_category_headers;
            void handleUpdateCurrentCatalog({ auto_category_headers: nextVal });
            if (nextVal) handleAutoSort('category');
          }}
          onExportSingleSection={
            currentCatalog.source_type === 'uploaded_pdf' && selectedProductsInOrder.length === 0
              ? undefined
              : handleExportSingleSectionPdf
          }
          onOpenSplitModal={() => void handleOpenSplitModal()}
        />
      )}

      {/* Multi-file Split PDF Export Modal */}
      {currentCatalog && (
        <PdfSplitExportModal
          isOpen={showSplitModal}
          onClose={() => {
            setShowSplitModal(false);
            setSplitExternalBuffer(null);
          }}
          products={products}
          settings={settings}
          customCatalog={currentCatalog}
          externalPdfBuffer={splitExternalBuffer}
          catalogTitle={currentCatalog.name}
          totalEstimatedPages={estimatedTotalPages}
        />
      )}

      {/* Card Designer Modal (Shape, Width, Colors & Per-Card Override) */}
      {currentCatalog && (
        <CardDesignerModal
          isOpen={showCardDesignerModal}
          onClose={() => setShowCardDesignerModal(false)}
          config={{
            ...DEFAULT_CARD_CONFIG,
            ...(settings.card_config || {}),
            ...(currentCatalog.card_config || {}),
            per_product_overrides: {
              ...(settings.card_config?.per_product_overrides || {}),
              ...(currentCatalog.card_config?.per_product_overrides || {}),
            },
          }}
          onChangeConfig={(next) => {
            void handleUpdateCurrentCatalog({ card_config: next });
          }}
          products={selectedProductsInOrder}
          initialProductId={focusedProductId}
          visibility={{
            show_image: currentCatalog.show_image ?? true,
            show_code: currentCatalog.show_code ?? true,
            show_category: currentCatalog.show_category ?? true,
          }}
          onChangeVisibility={(patch) => {
            void handleUpdateCurrentCatalog({
              ...(patch.show_image !== undefined ? { show_image: patch.show_image } : {}),
              ...(patch.show_code !== undefined ? { show_code: patch.show_code } : {}),
              ...(patch.show_category !== undefined ? { show_category: patch.show_category } : {}),
            });
          }}
          onProductsUpdated={onProductsUpdated}
        />
      )}
    </div>
  );
};
