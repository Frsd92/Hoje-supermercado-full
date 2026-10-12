import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { invoiceAuditSnapshot, matchInvoiceProducts, parseSupplierInvoiceXml, supplierInvoiceQuery, supplierInvoiceView } from '@/features/erp/api/supplier-invoices';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const maxXmlSize = 2_000_000;
const maxDanfeSize = 2_000_000;
const maxRequestFileSize = 4_000_000;

function cleanFileName(value) {
  return String(value || 'danfe.pdf').replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 120) || 'danfe.pdf';
}

function dateOnly(value) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const requestedOffset = Number(new URL(request.url).searchParams.get('skip') || 0);
  const skip = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? Math.min(requestedOffset, 1_000_000) : 0;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  try {
    const [invoices, invoiceCount, invoicesByStatus, payableTotals, overduePayables] = await Promise.all([
      prisma.supplierInvoice.findMany({
        take: 500,
        skip,
        orderBy: [{ issuedAt: 'desc' }, { importedAt: 'desc' }],
        ...supplierInvoiceQuery(),
      }),
      prisma.supplierInvoice.count(),
      prisma.supplierInvoice.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.supplierPayable.aggregate({
        where: { status: { in: ['Aguardando lançamento', 'Em aberto', 'Em disputa', 'Em Análise'] } },
        _sum: { amount: true },
      }),
      prisma.supplierPayable.count({
        where: { status: 'Em aberto', dueAt: { lt: new Date(`${today}T00:00:00.000Z`) } },
      }),
    ]);
    const countByStatus = Object.fromEntries(invoicesByStatus.map((entry) => [entry.status, entry._count._all]));
    return Response.json({
      invoices: invoices.map(supplierInvoiceView),
      hasMore: skip + invoices.length < invoiceCount,
      nextOffset: skip + invoices.length,
      metrics: {
        total: invoiceCount,
        awaitingReview: (countByStatus['Aguardando conferência'] || 0) + (countByStatus['Aguardando validação fiscal'] || 0),
        posted: countByStatus['Lançada'] || 0,
        payableAmount: Number(payableTotals._sum.amount || 0),
        overduePayables,
        loaded: skip + invoices.length,
      },
    }, { headers });
  } catch (error) {
    console.error('Não foi possível carregar as notas fiscais de fornecedores:', error);
    return Response.json({ error: 'Não foi possível carregar as notas fiscais agora.' }, { status: 500, headers });
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Envie o XML da NF-e e, se disponível, o PDF do DANFE.' }, { status: 400, headers });
  }
  const xmlFile = formData.get('xml');
  const danfeFile = formData.get('danfe');
  if (!xmlFile || typeof xmlFile.arrayBuffer !== 'function' || !xmlFile.size) {
    return Response.json({ error: 'Selecione o arquivo XML da NF-e.' }, { status: 400, headers });
  }
  if (xmlFile.size > maxXmlSize) return Response.json({ error: 'O XML da NF-e deve ter até 2 MB.' }, { status: 413, headers });
  if (danfeFile && (typeof danfeFile.arrayBuffer !== 'function' || danfeFile.size > maxDanfeSize)) {
    return Response.json({ error: 'O PDF do DANFE deve ter até 2 MB.' }, { status: 413, headers });
  }
  if (xmlFile.size + (danfeFile?.size || 0) > maxRequestFileSize) {
    return Response.json({ error: 'A soma dos arquivos deve ter até 4 MB.' }, { status: 413, headers });
  }

  let invoiceData;
  let xmlBytes;
  let danfeBytes = null;
  try {
    xmlBytes = new Uint8Array(await xmlFile.arrayBuffer());
    const xmlText = new TextDecoder('utf-8', { fatal: true }).decode(xmlBytes);
    invoiceData = parseSupplierInvoiceXml(xmlText);
    if (danfeFile?.size) {
      danfeBytes = new Uint8Array(await danfeFile.arrayBuffer());
      if (new TextDecoder().decode(danfeBytes.slice(0, 5)) !== '%PDF-') {
        return Response.json({ error: 'O arquivo selecionado como DANFE não parece ser um PDF válido.' }, { status: 400, headers });
      }
    }
  } catch (error) {
    return Response.json({ error: error.message || 'Não foi possível ler os arquivos da NF-e.' }, { status: 400, headers });
  }

  const actor = erpActorLabel(session?.user);
  try {
    const [supplier, products] = await Promise.all([
      prisma.supplier.findFirst({
        where: {
          OR: [
            { identityTaxId: invoiceData.issuerTaxId },
            { taxId: invoiceData.issuerTaxId },
          ],
        },
        select: { id: true, name: true },
      }),
      prisma.product.findMany({
        where: { status: 'Ativo' },
        select: {
          id: true,
          barcode: true,
          productBarcodes: { select: { code: true } },
        },
      }),
    ]);
    const mappedItems = matchInvoiceProducts(invoiceData.items, products);
    const invoice = await prisma.$transaction(async (transaction) => {
      const created = await transaction.supplierInvoice.create({
        data: {
          accessKey: invoiceData.accessKey,
          invoiceNumber: invoiceData.invoiceNumber,
          series: invoiceData.series,
          issuerTaxId: invoiceData.issuerTaxId,
          issuerName: invoiceData.issuerName,
          recipientTaxId: invoiceData.recipientTaxId,
          issuedAt: invoiceData.issuedAt,
          authorizedAt: invoiceData.authorizedAt,
          protocolNumber: invoiceData.protocolNumber,
          protocolStatus: invoiceData.protocolStatus,
          authorizationDataComplete: invoiceData.authorizationDataComplete,
          total: invoiceData.total,
          status: invoiceData.authorized ? 'Aguardando conferência' : 'Aguardando validação fiscal',
          supplierId: supplier?.id || null,
          xmlData: xmlBytes,
          danfeData: danfeBytes,
          danfeFileName: danfeBytes ? cleanFileName(danfeFile.name) : null,
          importedBy: actor,
          items: {
            create: mappedItems.map((item) => ({
              lineNumber: item.lineNumber,
              supplierProductCode: item.supplierProductCode,
              ean: item.ean,
              description: item.description,
              ncm: item.ncm,
              cfop: item.cfop,
              unit: item.unit,
              invoiceQuantity: item.invoiceQuantity,
              invoiceLots: item.lots,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
              productId: item.productId,
              lotCode: item.lots.length === 1 ? item.lots[0].lotCode : null,
              expiry: item.lots.length === 1 && item.lots[0].expiry ? dateOnly(item.lots[0].expiry) : null,
              manufactureDate: item.lots.length === 1 && item.lots[0].manufactureDate ? dateOnly(item.lots[0].manufactureDate) : null,
            })),
          },
          payables: {
            create: invoiceData.installments.length
              ? invoiceData.installments.map((installment) => ({
                installment: installment.code,
                amount: installment.amount,
                dueAt: installment.dueAt ? dateOnly(installment.dueAt) : null,
                status: 'Aguardando lançamento',
              }))
              : [{
                installment: 'Única',
                amount: invoiceData.total,
                dueAt: null,
                status: 'Aguardando lançamento',
                notes: 'A NF-e não informa vencimento. Defina a condição conforme o documento e a negociação.',
              }],
          },
        },
        ...supplierInvoiceQuery(),
      });
      await transaction.supplierInvoiceAuditLog.create({
        data: {
          invoiceId: created.id,
          action: 'IMPORTADA',
          actor,
          snapshot: invoiceAuditSnapshot(created),
          note: `${invoiceData.authorized ? 'XML com protocolo de autorização informado; assinatura e situação atual ainda exigem conferência fiscal.' : 'XML sem protocolo de autorização de uso; lançamento de estoque bloqueado até validação fiscal.'}${danfeBytes ? ' PDF do DANFE anexado.' : ' PDF do DANFE ainda não anexado.'}`,
        },
      });
      return created;
    });
    return Response.json({ invoice: supplierInvoiceView(invoice) }, { status: 201, headers });
  } catch (error) {
    if (error?.code === 'P2002') {
      return Response.json({ error: 'Esta chave de acesso já foi importada. Abra a nota existente para conferir o histórico.' }, { status: 409, headers });
    }
    console.error('Não foi possível importar XML de NF-e:', error);
    return Response.json({ error: 'Não foi possível registrar a NF-e no banco de dados.' }, { status: 500, headers });
  }
}
