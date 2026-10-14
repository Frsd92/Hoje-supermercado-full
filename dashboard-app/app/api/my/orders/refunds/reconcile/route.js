import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { reconcilePendingPagarmeRefunds } from '@/features/erp/api/pagarme-refund-reconciliation';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: 'Login necessário.' }, { status: 401 });

  const result = await reconcilePendingPagarmeRefunds({
    orderWhere: {
      customerEmail: { equals: session.user.email.trim(), mode: 'insensitive' },
    },
  });
  return Response.json({ warning: result.failed > 0 || result.hasMore });
}
