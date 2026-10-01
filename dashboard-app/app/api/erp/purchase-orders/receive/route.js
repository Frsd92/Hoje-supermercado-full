import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { purchaseOrderSnapshot } from '@/features/erp/api/purchase-orders';
import { prisma } from '@/lib/prisma';

const receiptOrderQuery = {
  include: {
    supplier: { select: { id: true, name: true } },
    items: { include: { product: { select: { id: true, externalId: true, title: true, quantity: true, cost: true, metadata: true } } } },
  },
};

function receiptAuditSnapshot(order) {
  const snapshot = purchaseOrderSnapshot(order);
  snapshot.items = snapshot.items.map((item) => {
    const { metadata, ...product } = item.product;
    return {
      ...item,
      product: {
        ...product,
        saleUnit: metadata?.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade',
      },
    };
  });
  return snapshot;
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const body = await request.json();
  const orderId = String(body?.orderId || '').trim();
  if (!orderId || !Array.isArray(body?.items) || !body.items.length) {
    return Response.json({ error: 'Informe a ordem e as quantidades recebidas.' }, { status: 400 });
  }
  const quantities = new Map();
  for (const item of body.items) {
    const itemId = String(item?.itemId || '').trim();
    const receivedQuantity = Number(item?.receivedQuantity);
    const unitCost = Number(String(item?.unitCost ?? '').replace(',', '.'));
    if (!itemId || !Number.isFinite(receivedQuantity) || receivedQuantity < 0 || Math.abs(receivedQuantity * 1000 - Math.round(receivedQuantity * 1000)) >= 1e-8
      || !Number.isFinite(unitCost) || unitCost < 0 || Math.abs(unitCost * 100 - Math.round(unitCost * 100)) >= 1e-8) {
      return Response.json({ error: 'Informe quantidade recebida e custo unitário válidos para cada linha.' }, { status: 400 });
    }
    if (quantities.has(itemId)) return Response.json({ error: 'Uma linha de produto foi informada mais de uma vez.' }, { status: 400 });
    quantities.set(itemId, { receivedQuantity, unitCost });
  }
  if (![...quantities.values()].some(({ receivedQuantity }) => receivedQuantity > 0)) {
    return Response.json({ error: 'Informe ao menos uma quantidade recebida maior que zero.' }, { status: 400 });
  }

  const actor = erpActorLabel(session?.user);
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const order = await transaction.purchaseOrder.findUnique({
        where: { id: orderId },
        ...receiptOrderQuery,
      });
      if (!order) return { error: 'Ordem de compra não encontrada.', status: 404 };
      if (!['Confirmado', 'Em Trânsito'].includes(order.status)) {
        return { error: 'Só ordens confirmadas ou em trânsito podem dar entrada no estoque.', status: 409 };
      }
      if ([...quantities.keys()].some((itemId) => !order.items.some((item) => item.id === itemId))) {
        return { error: 'A lista contém linhas que não pertencem a esta ordem de compra.', status: 400 };
      }
      for (const item of order.items) {
        const receipt = quantities.get(item.id);
        if (!receipt) continue;
        const remaining = Number(item.quantity) - Number(item.receivedQuantity);
        if (receipt.receivedQuantity > remaining) {
          return { error: `A quantidade recebida de "${item.product.title}" ultrapassa o saldo de ${remaining}.`, status: 400 };
        }
      }

      const receivedLines = [];
      for (const item of order.items) {
        const receipt = quantities.get(item.id);
        if (!receipt || receipt.receivedQuantity === 0) continue;

        const oldQuantity = Number(item.product.quantity);
        const oldCost = Number(item.product.cost);
        const newQuantity = Number((oldQuantity + receipt.receivedQuantity).toFixed(3));
        const newCost = receipt.unitCost;
        await transaction.product.update({
          where: { id: item.productId },
          data: { quantity: { increment: receipt.receivedQuantity }, cost: newCost },
        });
        await transaction.productAuditLog.create({
          data: {
            productId: item.productId,
            productExternalId: item.product.externalId,
            productTitle: item.product.title,
            action: 'PURCHASE_RECEIPT',
            actor,
            changes: {
              quantity: { before: oldQuantity, after: newQuantity },
              cost: { before: oldCost, after: newCost },
            },
            note: `Entrada da ordem ${order.code} (${order.supplier.name}); recebido ${receipt.receivedQuantity}.`,
          },
        });
        await transaction.purchaseOrderItem.update({
          where: { id: item.id },
          data: {
            receivedQuantity: Number(item.receivedQuantity) + receipt.receivedQuantity,
            receivedUnitCost: newCost,
          },
        });
        receivedLines.push({
          product: item.product.title,
          quantity: receipt.receivedQuantity,
          cost: newCost,
          unit: item.product.metadata?.saleUnit === 'Quilograma' ? 'kg' : 'un.',
        });
      }
      if (!receivedLines.length) return { error: 'Informe ao menos uma quantidade recebida maior que zero.', status: 400 };

      const freshItems = await transaction.purchaseOrderItem.findMany({ where: { purchaseOrderId: orderId } });
      const fullyReceived = freshItems.every((item) => Number(item.receivedQuantity) >= Number(item.quantity));
      const updated = await transaction.purchaseOrder.update({
        where: { id: orderId },
        data: {
          status: fullyReceived ? 'Recebido' : 'Em Trânsito',
          ...(fullyReceived ? { receivedAt: new Date() } : {}),
          updatedBy: actor,
        },
        ...receiptOrderQuery,
      });
      await transaction.purchaseOrderAuditLog.create({
        data: {
          purchaseOrderId: orderId,
          action: 'RECEIPT',
          actor,
          snapshot: receiptAuditSnapshot(updated),
          note: `${fullyReceived ? 'Recebimento concluído' : 'Recebimento parcial'}: ${receivedLines.map((line) => `${line.product}, ${line.quantity} ${line.unit}, custo ${line.cost}`).join('; ')}.`,
        },
      });
      return { order: updated };
    }, { isolationLevel: 'Serializable' });
    if (result.error) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ order: { id: result.order.id, code: result.order.code, status: result.order.status } }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    if (error?.code === 'P2034') return Response.json({ error: 'A ordem ou o estoque foi alterado ao mesmo tempo. Atualize a tela e confira os saldos antes de tentar novamente.' }, { status: 409 });
    console.error('Não foi possível registrar recebimento de ordem de compra:', error);
    return Response.json({ error: 'Não foi possível registrar o recebimento e atualizar o estoque.' }, { status: 500 });
  }
}
