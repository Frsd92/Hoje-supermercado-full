import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const sinceValue = new URL(request.url).searchParams.get('since');
  const since = new Date(sinceValue || '');
  if (!sinceValue || Number.isNaN(since.getTime())) {
    return Response.json({ error: 'Informe um horário válido para verificar novos pedidos.' }, { status: 400 });
  }

  try {
    const checkedAt = new Date();
    const [total, orders] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gt: since, lte: checkedAt } } }),
      prisma.order.findMany({
        where: { createdAt: { gt: since, lte: checkedAt } },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: { id: true, createdAt: true },
      }),
    ]);

    return Response.json({
      checkedAt: checkedAt.toISOString(),
      total,
      orders: orders.map(({ id, createdAt }) => ({ id, createdAt: createdAt.toISOString() })),
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Não foi possível verificar novos pedidos no ERP:', error);
    return Response.json({ error: 'Não foi possível verificar novos pedidos agora.' }, { status: 500 });
  }
}
