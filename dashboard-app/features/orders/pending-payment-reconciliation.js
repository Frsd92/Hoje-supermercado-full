import { amountToCents } from './order-refund-utils.js';
import {
  getPagarmeOrder,
  getPagarmePaymentSnapshot,
  getPagarmePaymentStatus,
  getPagarmeRefundedCents,
  settleCombinedPaymentOrder,
} from '../payments/pagarme.js';
import { getPendingPaymentStatus, shouldCancelOrderForPaymentStatus, shouldReconcilePendingPayment } from './pending-payment-policy.mjs';
import { CARD_PAYMENT_METHODS, VOUCHER_PAYMENT_METHODS } from '../payments/card-methods.js';
import { prisma } from '@/lib/prisma';
import { issueBlingNfceForPaidOrder } from '../erp/api/bling-nfce.js';

const terminalUnpaidStatuses = new Set(['failed', 'canceled', 'expired']);
const onlinePaymentMethods = ['pix', 'cartao', 'combinado', ...CARD_PAYMENT_METHODS, ...VOUCHER_PAYMENT_METHODS];

export async function reconcilePendingOrderPayment(order, providerOrder, {
  now = Date.now(),
  prismaClient = prisma,
  issueInvoice = issueBlingNfceForPaidOrder,
} = {}) {
  const providerId = String(providerOrder?.id || '');
  if (!providerId || providerId !== order.pagarmeOrderId || String(providerOrder.code || '') !== order.id) {
    throw new Error('A cobrança consultada não corresponde ao pedido.');
  }

  let providerOrderForSnapshot = providerOrder;
  const providerAmountCents = Number(
    providerOrderForSnapshot.amount
    ?? providerOrderForSnapshot.charges?.reduce((total, charge) => total + (Number(charge.amount) || 0), 0),
  );
  const orderTotalCents = amountToCents(order.total);
  if (!Number.isSafeInteger(providerAmountCents) || providerAmountCents !== orderTotalCents) {
    throw new Error('O valor da cobrança não corresponde ao total do pedido.');
  }

  if (order.paymentMethod === 'combinado') {
    providerOrderForSnapshot = await settleCombinedPaymentOrder(order.id, providerOrderForSnapshot, {
      pixExpiresAt: order.paymentDetails?.pixExpiresAt,
      orderStatus: order.status,
      now,
    });
  }
  const snapshot = getPagarmePaymentSnapshot(providerOrderForSnapshot, {
    combinedPayment: order.paymentMethod === 'combinado',
  });
  const refundedCents = getPagarmeRefundedCents(providerOrderForSnapshot);
  const providerStatus = refundedCents > 0
    ? refundedCents >= orderTotalCents ? 'refunded' : 'partially_refunded'
    : getPagarmePaymentStatus(providerOrderForSnapshot);
  const paymentDetails = snapshot.paymentDetails || order.paymentDetails || null;
  const paymentStatus = getPendingPaymentStatus(providerStatus, order.paymentMethod, paymentDetails?.pixExpiresAt, now);

  const updateResult = await prismaClient.$transaction(async (transaction) => {
    const currentOrder = await transaction.order.findUnique({
      where: { id: order.id },
      select: {
        id: true,
        paymentStatus: true,
        pagarmeOrderId: true,
        status: true,
      },
    });
    if (!currentOrder || currentOrder.paymentStatus !== 'pending') {
      return { paymentStatus: currentOrder?.paymentStatus || paymentStatus, updated: false };
    }
    if (currentOrder.pagarmeOrderId !== providerId) {
      throw new Error('A cobrança do pedido mudou durante a consulta.');
    }

    const shouldCancelOrder = shouldCancelOrderForPaymentStatus(paymentStatus, currentOrder.status);
    const update = await transaction.order.updateMany({
      where: {
        id: currentOrder.id,
        paymentStatus: 'pending',
        pagarmeOrderId: providerId,
        status: currentOrder.status,
      },
      data: {
        pagarmeChargeId: snapshot.pagarmeChargeId || undefined,
        paymentStatus,
        paymentDetails: order.paymentMethod === 'combinado'
          ? paymentDetails || undefined
          : paymentStatus === 'pending' ? paymentDetails || undefined : null,
        refundedAmount: (refundedCents / 100).toFixed(2),
        ...(shouldCancelOrder
          ? { status: 'Cancelado', updatedBy: 'Expiração/recusa confirmada pela Pagar.me' }
          : {}),
      },
    });
    if (update.count !== 1) return { paymentStatus: currentOrder.paymentStatus, updated: false };

    if (terminalUnpaidStatuses.has(paymentStatus)) {
      await transaction.couponRedemption.deleteMany({ where: { orderId: currentOrder.id } });
    }

    return { paymentStatus, updated: true };
  }, { isolationLevel: 'Serializable' });

  if (updateResult.updated && updateResult.paymentStatus === 'paid') {
    try {
      await issueInvoice(order.id);
    } catch (error) {
      console.error('Não foi possível iniciar a emissão automática da NFC-e após reconciliar o pagamento:', error);
    }
  }
  return updateResult;
}

export async function reconcilePendingOnlinePayments({
  now = Date.now(),
  prismaClient = prisma,
  getProviderOrder = getPagarmeOrder,
} = {}) {
  const candidates = await prismaClient.order.findMany({
    where: {
      paymentStatus: 'pending',
      paymentMethod: { in: onlinePaymentMethods },
      pagarmeOrderId: { not: null },
    },
    select: {
      id: true,
      total: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      paymentDetails: true,
      pagarmeOrderId: true,
    },
    orderBy: { id: 'asc' },
  });
  const result = { checked: 0, expired: 0, updated: 0, errors: [] };

  for (const order of candidates) {
    if (!shouldReconcilePendingPayment(order, now)) continue;
    result.checked += 1;
    try {
      const providerOrder = await getProviderOrder(order.pagarmeOrderId);
      const reconciliation = await reconcilePendingOrderPayment(order, providerOrder, { now, prismaClient });
      if (reconciliation.updated) result.updated += 1;
      if (reconciliation.updated && reconciliation.paymentStatus === 'expired') result.expired += 1;
    } catch (error) {
      console.error(`Não foi possível reconciliar o pagamento pendente do pedido ${order.id}:`, error);
      result.errors.push(order.id);
    }
  }
  return result;
}
