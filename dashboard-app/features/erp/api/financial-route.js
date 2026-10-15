import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';
import { buildSupplierPayablesSummary } from './financial-liquidity.js';
import { buildAutomaticChartActivity, buildFinancialMetrics } from './financial-metrics.js';

function isValidDateFilter(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function previousYearDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const previousYear = year - 1;
  const lastDay = new Date(Date.UTC(previousYear, month, 0)).getUTCDate();
  return `${previousYear}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const searchParams = new URL(request.url).searchParams;
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';
  const comparePreviousYear = searchParams.get('compare') === 'previous-year';
  if (!isValidDateFilter(startDate) || !isValidDateFilter(endDate) || (startDate && endDate && startDate > endDate)) {
    return Response.json({ error: 'O período informado é inválido.' }, { status: 400 });
  }

  try {
    const [orders, campaigns, payables, expenses] = await Promise.all([
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
      prisma.supplierPayable.findMany({
        select: {
          amount: true,
          status: true,
          dueAt: true,
          paidAt: true,
          invoice: { select: { status: true } },
        },
      }),
      prisma.companyExpense.findMany({
        include: { category: { select: { id: true, code: true, name: true, expenseBehavior: true } } },
        orderBy: { competenceAt: 'asc' },
      }),
    ]);

    const financial = buildFinancialMetrics({ orders, campaigns, expenses, startDate, endDate });
    const comparisonFinancial = comparePreviousYear && startDate && endDate
      ? buildFinancialMetrics({
        orders,
        campaigns,
        expenses,
        startDate: previousYearDate(startDate),
        endDate: previousYearDate(endDate),
      })
      : null;

    return Response.json({
      financial,
      comparisonFinancial,
      automaticChartActivity: buildAutomaticChartActivity(orders),
      liquidity: buildSupplierPayablesSummary(payables.map((payable) => ({
        amount: payable.amount,
        status: payable.status,
        dueAt: payable.dueAt,
        paidAt: payable.paidAt,
        invoiceStatus: payable.invoice.status,
      }))),
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Não foi possível carregar os indicadores financeiros do banco de dados:', error);
    return Response.json({ error: 'Não foi possível carregar o financeiro agora. Tente novamente.' }, { status: 503 });
  }
}
