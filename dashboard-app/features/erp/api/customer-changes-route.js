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
    return Response.json({ error: 'Informe um horário válido para verificar alterações cadastrais.' }, { status: 400 });
  }

  try {
    const checkedAt = new Date();
    const where = {
      eventOrigin: 'CUSTOMER_PROFILE',
      occurredAt: { gt: since, lte: checkedAt },
    };
    const [total, records] = await Promise.all([
      prisma.activityAuditLog.count({ where }),
      prisma.activityAuditLog.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: 500,
        select: { id: true, occurredAt: true },
      }),
    ]);

    return Response.json({
      checkedAt: checkedAt.toISOString(),
      total,
      changes: records.map(({ id, occurredAt }) => ({ id, occurredAt: occurredAt.toISOString() })),
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Não foi possível verificar alterações cadastrais de clientes:', error);
    return Response.json({ error: 'Não foi possível verificar alterações cadastrais agora.' }, { status: 500 });
  }
}
