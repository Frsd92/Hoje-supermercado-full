import { randomUUID } from 'node:crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { canTransitionPurchaseOrder, isPurchaseOrderLate, purchaseOrderSnapshot, validatePurchaseOrder } from '@/features/erp/api/purchase-orders';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const pendingStatuses = ['Aguardando Confirmação', 'Confirmado', 'Em Trânsito'];

const snapshotQuery = {
  include: {
    supplier: { select: { id: true, name: true, email: true, phone: true, whatsapp: true } },
    items: { include: { product: { select: { id: true, externalId: true, title: true, sku: true, quantity: true, cost: true, metadata: true } } } },
  },
};

const dateValue = (value) => {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00.000-03:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

function diffValues(before, after) {
  const first = purchaseOrderSnapshot(presentOrder(before));
  const second = purchaseOrderSnapshot(presentOrder(after));
  return Object.fromEntries([...new Set([...Object.keys(first), ...Object.keys(second)])]
    .filter((key) => JSON.stringify(first[key]) !== JSON.stringify(second[key]))
    .map((key) => [key, {
      before: Object.hasOwn(first, key) ? first[key] : { __auditAbsent: true },
      after: Object.hasOwn(second, key) ? second[key] : { __auditAbsent: true },
    }]));
}

function presentOrder(order) {
    const overdue = pendingStatuses.includes(order.status) && isPurchaseOrderLate(order);
    return {
      ...order,
      displayStatus: overdue ? 'Em Atraso' : order.status,
      items: order.items.map((item) => {
        const { metadata, ...product } = item.product;
        return {
          ...item,
          product: {
            ...product,
            saleUnit: metadata?.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade',
            controlsExpiry: metadata?.controlsExpiry === true,
            controlsLot: metadata?.controlsLot === true,
            perishable: metadata?.perishable === true,
          },
        };
      }),
    };
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const supplierId = new URL(request.url).searchParams.get('supplierId')?.trim();
  try {
    const [orders, products] = await Promise.all([
      prisma.purchaseOrder.findMany({
        ...(supplierId ? { where: { supplierId } } : {}),
        ...snapshotQuery,
        orderBy: [{ orderedAt: 'desc' }, { code: 'desc' }],
      }),
      prisma.product.findMany({
        where: { status: 'Ativo' },
        select: { id: true, externalId: true, title: true, sku: true, cost: true, metadata: true },
        orderBy: { title: 'asc' },
      }),
    ]);
    const enriched = orders.map(presentOrder);
    const catalogProducts = products.map((product) => ({
      id: product.id,
      externalId: product.externalId,
      title: product.title,
      sku: product.sku || '',
      cost: Number(product.cost),
      status: 'Ativo',
      saleUnit: product.metadata?.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade',
    }));
    return Response.json({ orders: enriched, products: catalogProducts }, { headers });
  } catch (error) {
    console.error('Não foi possível carregar ordens de compra:', error);
    return Response.json({ error: 'Não foi possível carregar ordens de compra do banco de dados.' }, { status: 500, headers });
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const body = await request.json();
  const validation = validatePurchaseOrder(body);
  if (validation.error) return Response.json({ error: validation.error }, { status: 400, headers });
  const actor = erpActorLabel(session?.user);
  const codeDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).replaceAll('-', '');
  const code = `OC-${codeDate}-${randomUUID().slice(0, 6).toUpperCase()}`;

  try {
    const order = await prisma.$transaction(async (transaction) => {
      const supplier = await transaction.supplier.findUnique({ where: { id: validation.data.supplierId } });
      if (!supplier || supplier.status !== 'Ativo') {
        throw new Error('FORNECEDOR_NAO_ATIVO');
      }
      const productRecords = await transaction.product.findMany({
        where: {
          OR: [
            { id: { in: validation.data.items.map((item) => item.productId) } },
            { externalId: { in: validation.data.items.map((item) => item.productId) } },
          ],
        },
      });
      const products = new Map(productRecords.flatMap((product) => [
        [product.id, product],
        ...(product.externalId ? [[product.externalId, product]] : []),
      ]));
      const items = validation.data.items.map((item) => {
        const product = products.get(item.productId);
        if (!product || product.status !== 'Ativo') throw new Error('PRODUTO_NAO_ATIVO');
        return { productId: product.id, quantity: item.quantity, unitPrice: item.unitPrice };
      });
      const created = await transaction.purchaseOrder.create({
        data: {
          code,
          supplierId: supplier.id,
          status: 'Rascunho',
          expectedDelivery: validation.data.expectedDelivery,
          notes: validation.data.notes,
          total: validation.data.total,
          createdBy: actor,
          items: { create: items },
        },
        ...snapshotQuery,
      });
      await transaction.purchaseOrderAuditLog.create({
        data: {
          purchaseOrderId: created.id,
          action: 'CREATE',
          actor,
          snapshot: purchaseOrderSnapshot(presentOrder(created)),
        },
      });
      return created;
    });
    return Response.json({ order: presentOrder(order) }, { status: 201, headers });
  } catch (error) {
    if (error.message === 'FORNECEDOR_NAO_ATIVO') return Response.json({ error: 'Ordens de compra só podem ser abertas para fornecedores ativos.' }, { status: 409, headers });
    if (error.message === 'PRODUTO_NAO_ATIVO') return Response.json({ error: 'Todos os itens do pedido precisam ser produtos ativos do catálogo.' }, { status: 409, headers });
    console.error('Não foi possível criar ordem de compra:', error);
    return Response.json({ error: 'Não foi possível criar a ordem de compra.' }, { status: 500, headers });
  }
}

export async function PUT(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const body = await request.json();
  const orderId = String(body?.id || '').trim();
  if (!orderId) return Response.json({ error: 'Informe a ordem de compra que será alterada.' }, { status: 400, headers });
  const actor = erpActorLabel(session?.user);
  const expectedDelivery = body.expectedDelivery === undefined ? undefined : dateValue(body.expectedDelivery);
  if (expectedDelivery === undefined && body.expectedDelivery) return Response.json({ error: 'Informe uma data de entrega válida.' }, { status: 400, headers });

  try {
    const order = await prisma.$transaction(async (transaction) => {
      const current = await transaction.purchaseOrder.findUnique({ where: { id: orderId }, ...snapshotQuery });
      if (!current) return null;
      if (body.status && !canTransitionPurchaseOrder(current.status, body.status)) throw new Error('TRANSICAO_INVALIDA');
      if (body.status === 'Recebido') throw new Error('USE_RECEBIMENTO');
      if (body.status === 'Cancelado' && !String(body.reason || '').trim()) throw new Error('MOTIVO_CANCELAMENTO');
      const updated = await transaction.purchaseOrder.update({
        where: { id: orderId },
        data: {
          ...(body.status ? { status: body.status } : {}),
          ...(expectedDelivery !== undefined ? { expectedDelivery } : {}),
          ...(body.notes !== undefined ? { notes: String(body.notes || '').trim() || null } : {}),
          updatedBy: actor,
        },
        ...snapshotQuery,
      });
      const changes = diffValues(current, updated);
      if (Object.keys(changes).length) {
        await transaction.purchaseOrderAuditLog.create({
          data: {
            purchaseOrderId: orderId,
            action: body.status ? 'STATUS_CHANGE' : 'UPDATE',
            actor,
            changes,
            note: String(body.reason || '').trim() || null,
          },
        });
      }
      return updated;
    });
    if (!order) return Response.json({ error: 'Ordem de compra não encontrada.' }, { status: 404, headers });
    return Response.json({ order: presentOrder(order) }, { headers });
  } catch (error) {
    if (error.message === 'TRANSICAO_INVALIDA') return Response.json({ error: 'Essa mudança de status não é permitida no fluxo da ordem.' }, { status: 409, headers });
    if (error.message === 'USE_RECEBIMENTO') return Response.json({ error: 'Use a ação de recebimento para registrar quantidades e atualizar o estoque.' }, { status: 409, headers });
    if (error.message === 'MOTIVO_CANCELAMENTO') return Response.json({ error: 'Informe o motivo para cancelar a ordem de compra.' }, { status: 400, headers });
    console.error('Não foi possível atualizar ordem de compra:', error);
    return Response.json({ error: 'Não foi possível atualizar a ordem de compra.' }, { status: 500, headers });
  }
}
