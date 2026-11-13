import * as XLSX from 'xlsx';
import { Product, CatalogSettings, BatchSession } from '../types';
import { generateCatalogPdf } from './pdfGenerator';

/**
 * Builds placeholder product entries for pages that were not read
 */
function buildUnreadPagePlaceholders(session: BatchSession): Product[] {
  const uncompletedBatches = session.batches.filter((b) => b.status !== 'completed');
  const unreadItems: Product[] = [];

  uncompletedBatches.forEach((b) => {
    for (let pNum = b.page_start; pNum <= b.page_end; pNum++) {
      unreadItems.push({
        id: `unread_page_${session.id}_p${pNum}`,
        code: `P${pNum}`,
        name: `صفحة ${pNum} - لم تتم قراءتها`,
        category: 'صفحات لم تُقرأ',
        group: 'تصدير جزئي',
        selling_price: 0,
        wholesale_price: 0,
        page_number: pNum,
        source_file: session.file_name,
        notes: b.status === 'failed' ? `فشلت: ${b.error_message || 'خطأ'}` : 'لم تتم قراءتها بعد',
        included_in_catalog: true,
        created_at: new Date().toISOString(),
        is_unread_placeholder: true,
      } as any);
    }
  });

  return unreadItems;
}

/**
 * Exports partial PDF Catalog for completed batches, showing unread pages as clear notice lines/cards
 */
export async function exportPartialCatalogPdf(
  session: BatchSession,
  products: Product[],
  settings: CatalogSettings
): Promise<void> {
  const sessionProducts = products.filter((p) => p.source_file === session.file_name);
  const unreadPlaceholders = buildUnreadPagePlaceholders(session);

  if (sessionProducts.length === 0 && unreadPlaceholders.length === 0) {
    throw new Error('لا توجد بيانات متاحة في هذه الجلسة للتصدير.');
  }

  const completedBatches = session.batches.filter((b) => b.status === 'completed').length;
  const totalBatches = session.batches.length;
  const pendingOrFailed = totalBatches - completedBatches;

  // Combine completed products with unread page placeholders
  const exportList = [...sessionProducts, ...unreadPlaceholders];

  // Custom subtitle for partial export
  const partialSettings: CatalogSettings = {
    ...settings,
    catalog_title: `${settings.catalog_title || 'قائمة الأسعار'} (كتالوج جزئي)`,
    footer_note: `تنبيه: كتالوج جزئي (${completedBatches} من ${totalBatches} دفعة مكتملة). يوجد ${pendingOrFailed} دفعة لم تتم قراءتها. ${settings.footer_note || ''}`,
  };

  const filename = `كتالوج_جزئي_${session.file_name.replace(/\.[^/.]+$/, '')}_${completedBatches}من${totalBatches}.pdf`;

  await generateCatalogPdf(exportList, partialSettings, {
    filename,
    action: 'download',
  });
}

/**
 * Exports partial Excel Sheet for completed batches with unread pages shown clearly
 */
export function exportPartialExcel(
  session: BatchSession,
  products: Product[]
): void {
  const sessionProducts = products.filter((p) => p.source_file === session.file_name);
  const unreadPlaceholders = buildUnreadPagePlaceholders(session);

  if (sessionProducts.length === 0 && unreadPlaceholders.length === 0) {
    throw new Error('لا توجد بيانات متاحة في هذه الجلسة للتصدير.');
  }

  const completedBatches = session.batches.filter((b) => b.status === 'completed').length;
  const totalBatches = session.batches.length;

  const workbook = XLSX.utils.book_new();

  // Sheet 1: Products (Read products + Unread page lines)
  const rows: any[] = [];

  sessionProducts.forEach((p, idx) => {
    rows.push({
      '#': idx + 1,
      'كود المنتج': p.code || '',
      'اسم المنتج': p.name || '',
      'القسم': p.category || '',
      'الماركة': p.group || '',
      'الموديل': p.model || '',
      'المواصفات': p.specification || '',
      'سعر الجملة (ج.م)': p.wholesale_price || 0,
      'سعر البيع المقترح (ج.م)': p.selling_price || 0,
      'رقم الصفحة': p.page_number || '',
      'حالة القراءة': 'تمت القراءة بنجاح',
    });
  });

  // Append unread page notice lines
  unreadPlaceholders.forEach((u) => {
    rows.push({
      '#': rows.length + 1,
      'كود المنتج': u.code,
      'اسم المنتج': u.name,
      'القسم': 'صفحات لم تُقرأ',
      'الماركة': '-',
      'الموديل': '-',
      'المواصفات': 'لم تتم قراءة هذه الصفحة',
      'سعر الجملة (ج.م)': '-',
      'سعر البيع المقترح (ج.م)': '-',
      'رقم الصفحة': u.page_number || '',
      'حالة القراءة': '⚠️ لم تتم قراءتها',
    });
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);

  worksheet['!cols'] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 34 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 24 },
    { wch: 16 },
    { wch: 20 },
    { wch: 12 },
    { wch: 20 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'المنتجات المستخرجة');

  // Sheet 2: Batches status overview
  const batchRows = session.batches.map((b) => ({
    'رقم الدفعة': b.batch_index,
    'من صفحة': b.page_start,
    'إلى صفحة': b.page_end,
    'الحالة':
      b.status === 'completed'
        ? '✅ مكتملة'
        : b.status === 'failed'
        ? '❌ فشلت (لم تتم قراءتها)'
        : '⏳ في الانتظار (لم تتم قراءتها)',
    'عدد الأصناف المستخرجة': b.products_count,
    'سبب الخطأ إن وجد': b.error_message || '',
  }));

  const batchSheet = XLSX.utils.json_to_sheet(batchRows);
  batchSheet['!cols'] = [
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 25 },
    { wch: 22 },
    { wch: 35 },
  ];

  XLSX.utils.book_append_sheet(workbook, batchSheet, 'حالة الدفعات');

  const filename = `تصدير_جزئي_${session.file_name.replace(/\.[^/.]+$/, '')}_${completedBatches}من${totalBatches}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

