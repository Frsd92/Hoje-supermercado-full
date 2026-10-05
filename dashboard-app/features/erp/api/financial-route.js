import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';
import { buildFinancialMetrics } from './financial-metrics.js';

function isValidDateFilter(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const searchParams = new URL(request.url).searchParams;
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';
  if (!isValidDateFilter(startDate) || !isValidDateFilter(endDate) || (startDate && endDate && startDate > endDate)) {
    return Response.json({ error: 'O período informado é inválido.' }, { status: 400 });
  }

  try {
    const [orders, campaigns] = await Promise.all([
      prisma.order.findMany({
        include: { items: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      prisma.couponCampaign.findMany({
        select: {
          id: true,
          code: true,
          discountPercent: true,
          _count: { select: { recipients: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return Response.json({
      financial: buildFinancialMetrics({ orders, campaigns, startDate, endDate }),
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Não foi possível carregar os indicadores financeiros do banco de dados:', error);
    return Response.json({ error: 'Não foi possível carregar o financeiro agora. Tente novamente.' }, { status: 503 });
  }
}
