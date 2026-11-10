import { timingSafeEqual } from 'node:crypto';
import { reconcilePendingOnlinePayments } from '@/features/orders/pending-payment-reconciliation';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

function isCronRequest(request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization') || '';
  if (!secret || !authorization.startsWith('Bearer ')) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request) {
  if (!isCronRequest(request)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });
  if (!process.env.PAGARME_SECRET_KEY) {
    return Response.json({ error: 'Consulta de pagamentos não configurada.' }, { status: 503, headers });
  }

  try {
    const result = await reconcilePendingOnlinePayments();
    return Response.json(result, { status: result.errors.length ? 502 : 200, headers });
  } catch (error) {
    console.error('Não foi possível reconciliar os pagamentos online pendentes:', error);
    return Response.json({ error: 'Não foi possível reconciliar os pagamentos agora.' }, { status: 500, headers });
  }
}
