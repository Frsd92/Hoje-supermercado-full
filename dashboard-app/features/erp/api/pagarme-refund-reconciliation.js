import { randomUUID } from 'crypto';
import { getPagarmeOrder, getPagarmeRefundedCents } from '../../payments/pagarme.js';
import { amountToCents, refundRequestStatus } from '../../orders/order-refund-utils.js';
import { prisma } from '../../../lib/prisma.js';

const maximumOrdersPerSync = 20;
const syncConcurrency = 5;

async function reconcileOrder(orderId, database, fetchGatewayOrder) {
  const order = await database.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      total: true,
      refundedAmount: true,
      pagarmeOrderId: true,
      pagarmeChargeId: true,
    },
  });
  if (!order?.pagarmeOrderId || !order.pagarmeChargeId) {
    throw new Error('Pedido sem identificadores completos da Pagar.me.');
  }

  const gatewayOrder = await fetchGatewayOrder(order.pagarmeOrderId);
  const charges = Array.isArray(gatewayOrder?.charges) ? gatewayOrder.charges : [];
  if (String(gatewayOrder?.id || '') !== order.pagarmeOrderId
    || !charges.some((charge) => String(charge?.id || '') === order.pagarmeChargeId)) {
    throw new Error('A consulta da Pagar.me não corresponde à cobrança do pedido.');
  }

  const refundedCents = getPagarmeRefundedCents({
    ...gatewayOrder,
    charges: charges.filter((charge) => String(charge?.id || '') === order.pagarmeChargeId),
  });
  const totalCents = amountToCents(order.total);
  if (refundedCents <= 0 || refundedCents > totalCents) return false;

  return database.$transaction(async (transaction) => {
    const currentOrder = await transaction.order.findUnique({
      where: { id: order.id },
      select: { id: true, total: true, refundedAmount: true, paymentStatus: true },
    });
    if (!currentOrder) return false;

    const currentRefundedCents = amountToCents(currentOrder.refundedAmount);
    const currentTotalCents = amountToCents(currentOrder.total);
    const paymentStatus = refundedCents >= currentTotalCents ? 'refunded' : 'partially_refunded';
    if (currentRefundedCents !== refundedCents || currentOrder.paymentStatus !== paymentStatus) {
      await transaction.order.update({
        where: { id: currentOrder.id },
        data: {
          refundedAmount: (refundedCents / 100).toFixed(2),
          paymentStatus,
        },
      });
    }

    const refundRequests = await transaction.orderRefundRequest.findMany({
      where: { orderId: currentOrder.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, amount: true, status: true },
    });
    let availableRefundCents = Math.max(
      0,
      refundedCents - refundRequests
        .filter((request) => request.status === refundRequestStatus.completed)
        .reduce((sum, request) => sum + amountToCents(request.amount), 0),
    );
    let completedCount = 0;

    for (const refundRequest of refundRequests) {
      if (refundRequest.status !== refundRequestStatus.gatewayProcessing) continue;
      const requestCents = amountToCents(refundRequest.amount);
      if (requestCents <= 0 || requestCents > availableRefundCents) continue;

      const updated = await transaction.orderRefundRequest.updateMany({
        where: { id: refundRequest.id, status: refundRequestStatus.gatewayProcessing },
        data: { status: refundRequestStatus.completed },
      });
      if (updated.count !== 1) continue;

      await transaction.orderRefundEvent.create({
        data: {
          id: randomUUID(),
          refundRequestId: refundRequest.id,
          action: refundRequestStatus.completed,
          actor: 'Pagar.me',
          note: 'Estorno confirmado pela consulta autenticada à Pagar.me.',
        },
      });
      availableRefundCents -= requestCents;
      completedCount += 1;
    }

    return completedCount > 0 || currentRefundedCents !== refundedCents || currentOrder.paymentStatus !== paymentStatus;
  });
}

export async function reconcilePendingPagarmeRefunds({
  database = prisma,
  fetchGatewayOrder = getPagarmeOrder,
  orderWhere,
} = {}) {
  let pendingOrders;
  try {
    pendingOrders = await database.orderRefundRequest.findMany({
      where: {
        status: refundRequestStatus.gatewayProcessing,
        ...(orderWhere ? { order: orderWhere } : {}),
      },
      distinct: ['orderId'],
      orderBy: { createdAt: 'asc' },
      take: maximumOrdersPerSync + 1,
      select: { orderId: true },
    });
  } catch (error) {
    console.error('Não foi possível localizar estornos pendentes para reconciliar:', error);
    return { checked: 0, updated: 0, failed: 1, hasMore: true };
  }

  const hasMore = pendingOrders.length > maximumOrdersPerSync;
  const orderIds = pendingOrders.slice(0, maximumOrdersPerSync).map(({ orderId }) => orderId);
  let updated = 0;
  let failed = 0;

  for (let offset = 0; offset < orderIds.length; offset += syncConcurrency) {
    const batch = orderIds.slice(offset, offset + syncConcurrency);
    const results = await Promise.all(batch.map(async (orderId) => {
      try {
        return await reconcileOrder(orderId, database, fetchGatewayOrder);
      } catch (error) {
        console.error(`Não foi possível confirmar o estorno do pedido ${orderId}:`, error);
        return null;
      }
    }));
    updated += results.filter((result) => result === true).length;
    failed += results.filter((result) => result === null).length;
  }

  return { checked: orderIds.length, updated, failed, hasMore };
}
