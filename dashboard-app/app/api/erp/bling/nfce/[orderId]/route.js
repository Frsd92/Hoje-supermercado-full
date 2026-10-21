import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import {
  refreshBlingNfceStatus,
  retryBlingNfceForPaidOrder,
} from '@/features/erp/api/bling-nfce';
import { BlingIntegrationError } from '@/features/erp/api/bling';
import { hasErpAccess } from '@/features/erp/access';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

function serializeInvoice(invoice) {
  if (!invoice) return null;
  return {
    ...invoice,
    blingNfceAuthorizedAt: invoice.blingNfceAuthorizedAt?.toISOString() || null,
  };
}

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });

  const { orderId } = await params;
  if (!orderId || orderId.length > 120) {
    return Response.json({ error: 'Identificador do pedido inválido.' }, { status: 400, headers });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400, headers });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400, headers });
  }

  try {
    if (body.action === 'refresh') {
      const invoice = await refreshBlingNfceStatus(orderId);
      return Response.json({ invoice: serializeInvoice(invoice) }, { headers });
    }
    if (body.action === 'issue' || body.action === 'retry') {
      const result = await retryBlingNfceForPaidOrder(orderId, {
        confirmNoInvoiceFound: body.confirmNoInvoiceFound === true,
      });
      return Response.json({
        status: result.status,
        invoice: serializeInvoice(result.invoice),
        message: result.status === 'authorized'
          ? 'NFC-e autorizada pela SEFAZ.'
          : result.status === 'processing'
            ? 'O Bling ainda está processando a autorização da NFC-e.'
            : result.status === 'uncertain'
              ? 'Confira a situação do pedido e da NFC-e no Bling antes de tentar novamente.'
              : 'A emissão da NFC-e foi iniciada.',
      }, { headers });
    }
    return Response.json({ error: 'Ação inválida.' }, { status: 400, headers });
  } catch (error) {
    console.error('Não foi possível atualizar a NFC-e do pedido:', {
      status: error instanceof BlingIntegrationError ? error.status : 500,
    });
    return Response.json({
      error: error instanceof Error ? error.message : 'Não foi possível atualizar a NFC-e.',
    }, {
      status: error instanceof BlingIntegrationError ? error.status : 500,
      headers,
    });
  }
}
