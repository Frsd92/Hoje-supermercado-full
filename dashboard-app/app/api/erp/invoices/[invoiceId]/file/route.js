import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';

function safeFileName(value) {
  return String(value || 'danfe.pdf').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'danfe.pdf';
}

export async function GET(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });
  const { invoiceId } = await params;
  const type = new URL(request.url).searchParams.get('type') || 'danfe';
  if (!['xml', 'danfe'].includes(type)) return Response.json({ error: 'Selecione um tipo de arquivo válido.' }, { status: 400 });

  try {
    const invoice = await prisma.supplierInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        invoiceNumber: true,
        series: true,
        accessKey: true,
        xmlData: type === 'xml',
        danfeData: type === 'danfe',
        danfeFileName: type === 'danfe',
      },
    });
    if (!invoice) return Response.json({ error: 'Nota fiscal não encontrada.' }, { status: 404 });
    const data = type === 'xml' ? invoice.xmlData : invoice.danfeData;
    if (!data) return Response.json({ error: type === 'xml' ? 'XML da NF-e não encontrado.' : 'Esta nota não possui PDF do DANFE anexado.' }, { status: 404 });

    const fileName = type === 'xml'
      ? safeFileName(`NFe-${invoice.invoiceNumber}-${invoice.series}-${invoice.accessKey}.xml`)
      : safeFileName(invoice.danfeFileName);
    return new Response(data, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Type': type === 'xml' ? 'application/xml; charset=utf-8' : 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Não foi possível baixar arquivo da NF-e:', error);
    return Response.json({ error: 'Não foi possível baixar o arquivo da nota fiscal.' }, { status: 500 });
  }
}
