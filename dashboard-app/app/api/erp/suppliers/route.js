import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { supplierAuditSnapshot, supplierChanges, validateSupplier } from '@/features/erp/api/supplier-data';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

function duplicateResponse(error) {
  if (error?.code !== 'P2002') return null;
  const target = String(error.meta?.target || '');
  const field = target.includes('TaxId') ? 'CPF/CNPJ' : 'nome';
  return Response.json({ error: `Já existe um fornecedor cadastrado com este ${field}. Abra o registro existente para alterá-lo.` }, { status: 409, headers });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  try {
    const saoPauloParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const year = Number(saoPauloParts.find((part) => part.type === 'year')?.value);
    const month = Number(saoPauloParts.find((part) => part.type === 'month')?.value);
    const day = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', day: '2-digit' }).format(new Date()));
    const monthStart = new Date(Date.UTC(year, month - 1, 1, 3));
    const todayStart = new Date(Date.UTC(year, month - 1, day, 3));
    const [suppliers, monthlyOrders, pendingPurchaseOrders] = await Promise.all([
      prisma.supplier.findMany({ orderBy: [{ name: 'asc' }, { createdAt: 'desc' }] }),
      prisma.purchaseOrder.aggregate({
        where: { orderedAt: { gte: monthStart }, status: { notIn: ['Rascunho', 'Cancelado'] } },
        _sum: { total: true },
        _count: { id: true },
      }),
      prisma.purchaseOrder.count({ where: { status: { in: ['Aguardando Confirmação', 'Confirmado', 'Em Trânsito'] } } }),
    ]);
    const activeCategories = new Set(suppliers
      .filter((supplier) => supplier.status === 'Ativo')
      .flatMap((supplier) => supplier.categories)
      .map((category) => category.trim().toLocaleLowerCase('pt-BR'))
      .filter(Boolean));
    const metrics = {
      total: suppliers.length,
      active: suppliers.filter((supplier) => supplier.status === 'Ativo').length,
      inReview: suppliers.filter((supplier) => supplier.status === 'Em Análise').length,
      inactive: suppliers.filter((supplier) => supplier.status === 'Inativo').length,
      activeCategories: activeCategories.size,
      purchasesThisMonth: Number(monthlyOrders._sum.total || 0),
      purchaseOrdersThisMonth: monthlyOrders._count.id,
      pendingPurchaseOrders,
      overduePurchaseOrders: await prisma.purchaseOrder.count({
        where: {
          status: { in: ['Aguardando Confirmação', 'Confirmado', 'Em Trânsito'] },
          expectedDelivery: { lt: todayStart },
        },
      }),
    };
    return Response.json({ suppliers, metrics }, { headers });
  } catch (error) {
    console.error('Não foi possível carregar fornecedores persistidos:', error);
    return Response.json({ error: 'Não foi possível carregar os fornecedores do banco de dados.' }, { status: 500, headers });
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const body = await request.json();
  const validation = validateSupplier(body);
  if (validation.error) return Response.json({ error: validation.error }, { status: 400, headers });
  const actor = erpActorLabel(session?.user);

  try {
    const supplier = await prisma.$transaction(async (transaction) => {
      const created = await transaction.supplier.create({ data: { ...validation.data, createdBy: actor } });
      await transaction.supplierAuditLog.create({
        data: {
          supplierId: created.id,
          action: 'CREATE',
          actor,
          snapshot: supplierAuditSnapshot(created),
        },
      });
      return created;
    });
    return Response.json({ supplier }, { status: 201, headers });
  } catch (error) {
    const duplicate = duplicateResponse(error);
    if (duplicate) return duplicate;
    console.error('Não foi possível cadastrar fornecedor:', error);
    return Response.json({ error: 'Não foi possível cadastrar o fornecedor no banco de dados.' }, { status: 500, headers });
  }
}

export async function PUT(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const body = await request.json();
  const supplierId = String(body?.id || '').trim();
  if (!supplierId) return Response.json({ error: 'Selecione um fornecedor para alterar.' }, { status: 400, headers });
  const validation = validateSupplier(body);
  if (validation.error) return Response.json({ error: validation.error }, { status: 400, headers });
  const actor = erpActorLabel(session?.user);

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const current = await transaction.supplier.findUnique({ where: { id: supplierId } });
      if (!current) return null;
      const updated = await transaction.supplier.update({
        where: { id: supplierId },
        data: { ...validation.data, updatedBy: actor },
      });
      const changes = supplierChanges(supplierAuditSnapshot(current), supplierAuditSnapshot(updated));
      if (Object.keys(changes).length) {
        await transaction.supplierAuditLog.create({
          data: {
            supplierId,
            action: 'UPDATE',
            actor,
            changes,
          },
        });
      }
      return updated;
    });
    if (!result) return Response.json({ error: 'Fornecedor não encontrado.' }, { status: 404, headers });
    return Response.json({ supplier: result }, { headers });
  } catch (error) {
    const duplicate = duplicateResponse(error);
    if (duplicate) return duplicate;
    console.error('Não foi possível atualizar fornecedor:', error);
    return Response.json({ error: 'Não foi possível atualizar o fornecedor no banco de dados.' }, { status: 500, headers });
  }
}
