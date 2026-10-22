import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { syncProductToBling } from '@/features/erp/api/bling-products';
import { BlingIntegrationError } from '@/features/erp/api/bling';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(_request, { params }) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });

  try {
    const { productId } = await params;
    const result = await syncProductToBling(productId);
    const status = ['synced', 'partial', 'syncing'].includes(result.status) ? 200 : 502;
    return Response.json({ sync: result }, { status, headers });
  } catch (error) {
    console.error('Não foi possível sincronizar o produto com o Bling:', error);
    const status = error instanceof BlingIntegrationError ? error.status : 500;
    return Response.json({
      error: error.message || 'Não foi possível sincronizar o produto com o Bling.',
    }, { status, headers });
  }
}
