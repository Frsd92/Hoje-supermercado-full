import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { reconcilePendingPagarmeRefunds } from '@/features/erp/api/pagarme-refund-reconciliation';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const result = await reconcilePendingPagarmeRefunds();
  return Response.json({ warning: result.failed > 0 || result.hasMore });
}
