import { timingSafeEqual } from 'node:crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { getGoogleMerchantConfig, syncGoogleMerchantProducts } from '@/features/erp/api/google-merchant';
import { getProductCatalog } from '@/features/erp/api/product-catalog';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

function isCronRequest(request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization') || '';
  if (!secret || !authorization.startsWith('Bearer ')) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function runSync() {
  try {
    const catalog = await getProductCatalog(prisma, { strict: true });
    const summary = await syncGoogleMerchantProducts(catalog);
    const failed = summary.errors.length > 0;
    return Response.json(summary, { status: failed ? 502 : 200, headers });
  } catch (error) {
    console.error('Não foi possível sincronizar o catálogo com o Google Merchant Center:', error);
    return Response.json({ error: error.message || 'Não foi possível sincronizar o catálogo.' }, { status: 500, headers });
  }
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });
  return runSync();
}

export async function GET(request) {
  if (!isCronRequest(request)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });
  const config = getGoogleMerchantConfig();
  if (config.missing.length) {
    return Response.json({ error: `Configuração pendente: ${config.missing.join(', ')}.` }, { status: 409, headers });
  }
  return runSync();
}
