import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { activeNcmEntries, fetchOfficialNcmTable, findNcmEntries, matchNcmXmlItems, normalizeNcmCode, validateActiveNcm } from '@/features/erp/api/product-ncm';
import { parseSupplierInvoiceXml } from '@/features/erp/api/supplier-invoices';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });

  const params = new URL(request.url).searchParams;
  try {
    if (params.has('productId')) {
      const productId = params.get('productId')?.trim();
      if (!productId) return Response.json({ error: 'Informe o produto para consultar NF-e importadas.' }, { status: 400, headers });
      const product = await prisma.product.findFirst({
        where: { OR: [{ id: productId }, { externalId: productId }] },
        select: { id: true },
      });
      if (!product) return Response.json({ error: 'Produto não encontrado.' }, { status: 404, headers });
      const invoiceItems = await prisma.supplierInvoiceItem.findMany({
        where: { productId: product.id, ncm: { not: '' } },
        select: {
          ncm: true,
          description: true,
          supplierProductCode: true,
          ean: true,
          invoice: {
            select: {
              invoiceNumber: true,
              issuerName: true,
              issuedAt: true,
              protocolStatus: true,
              authorizationDataComplete: true,
            },
          },
        },
        orderBy: [{ invoice: { issuedAt: 'desc' } }, { lineNumber: 'asc' }],
        take: 20,
      });
      return Response.json({
        suggestions: invoiceItems.map((item) => ({
          ncm: normalizeNcmCode(item.ncm),
          description: item.description,
          supplierProductCode: item.supplierProductCode,
          ean: item.ean,
          invoiceNumber: item.invoice.invoiceNumber,
          issuerName: item.invoice.issuerName,
          issuedAt: item.invoice.issuedAt,
          protocolStatus: item.invoice.protocolStatus,
          authorizationDataComplete: item.invoice.authorizationDataComplete,
        })),
      }, { headers });
    }

    if (params.has('code')) {
      const validation = await validateActiveNcm(params.get('code'));
      return Response.json(validation, { status: validation.valid ? 200 : 422, headers });
    }

    const search = params.get('search') || '';
    if (search.trim().length < 2) return Response.json({ entries: [] }, { headers });
    const table = await fetchOfficialNcmTable();
    return Response.json({
      updatedAt: table.Data_Ultima_Atualizacao_NCM || null,
      entries: findNcmEntries(activeNcmEntries(table), search),
    }, { headers });
  } catch (error) {
    console.error('Não foi possível consultar ou validar o NCM:', error);
    return Response.json({
      error: 'Não foi possível consultar a tabela oficial da NCM ou as NF-e importadas. Tente novamente.',
    }, { status: 502, headers });
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });

  try {
    const formData = await request.formData();
    const xmlFile = formData.get('xml');
    if (!xmlFile || typeof xmlFile.arrayBuffer !== 'function' || !xmlFile.size) {
      return Response.json({ error: 'Selecione o XML de uma NF-e de fornecedor.' }, { status: 400, headers });
    }
    if (xmlFile.size > 2_000_000) {
      return Response.json({ error: 'O XML da NF-e deve ter até 2 MB.' }, { status: 413, headers });
    }

    let invoice;
    try {
      const bytes = new Uint8Array(await xmlFile.arrayBuffer());
      const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      invoice = parseSupplierInvoiceXml(xml);
    } catch (error) {
      return Response.json({ error: error.message || 'Não foi possível interpretar o XML da NF-e.' }, { status: 400, headers });
    }
    const items = matchNcmXmlItems(invoice.items, {
      barcode: formData.get('barcode'),
      sku: formData.get('sku'),
    });
    return Response.json({
      invoice: {
        number: invoice.invoiceNumber,
        issuerName: invoice.issuerName,
        issuedAt: invoice.issuedAt,
        authorized: invoice.authorized,
      },
      suggestions: items.filter((item) => item.ncm.length === 8),
    }, { headers });
  } catch (error) {
    console.error('Não foi possível importar sugestões de NCM do XML:', error);
    return Response.json({ error: 'Não foi possível ler as sugestões de NCM do XML.' }, { status: 500, headers });
  }
}
