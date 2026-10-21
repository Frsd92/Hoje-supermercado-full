import 'server-only';
import { prisma } from '@/lib/prisma';
import { BlingIntegrationError, blingRequest, sendOrderToBling } from './bling';
import {
  getBlingDocumentUrl,
  getBlingNfceStatus,
  getBlingNfceStatusMessage,
  isEligiblePaidOrder,
} from './bling-nfce-utils.js';

async function saveInvoiceStatus(orderId, note) {
  const status = getBlingNfceStatus(note);
  const situation = Number(note?.situacao);
  const authorizedAt = status === 'authorized'
    ? (note.dataEmissao ? new Date(note.dataEmissao) : new Date())
    : null;
  return prisma.order.update({
    where: { id: orderId },
    data: {
      blingNfceStatus: status,
      blingNfceNumber: note.numero === undefined || note.numero === null ? undefined : String(note.numero),
      blingNfceAccessKey: note.chaveAcesso ? String(note.chaveAcesso) : undefined,
      blingNfceAuthorizedAt: authorizedAt,
      blingNfcePdfUrl: getBlingDocumentUrl(note.linkPDF || note.linkDanfe),
      blingNfceError: getBlingNfceStatusMessage(status, situation),
      blingNfceStartedAt: null,
    },
    select: {
      blingNfceId: true,
      blingNfceNumber: true,
      blingNfceAccessKey: true,
      blingNfceStatus: true,
      blingNfceAuthorizedAt: true,
      blingNfcePdfUrl: true,
      blingNfceError: true,
    },
  });
}

export async function refreshBlingNfceStatus(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, blingNfceId: true },
  });
  if (!order) throw new BlingIntegrationError('Pedido não encontrado.', 404);
  if (!order.blingNfceId) throw new BlingIntegrationError('Ainda não existe uma NFC-e vinculada a este pedido.', 409);

  const response = await blingRequest(`/nfce/${encodeURIComponent(order.blingNfceId)}`);
  const note = response?.data;
  if (!note) throw new BlingIntegrationError('O Bling não retornou os dados da NFC-e.', 502);
  return saveInvoiceStatus(order.id, note);
}

async function markAttemptFailure(orderId, error) {
  const uncertain = error instanceof BlingIntegrationError && error.uncertain;
  const message = error instanceof Error
    ? error.message.slice(0, 500)
    : 'Não foi possível concluir a emissão da NFC-e no Bling.';
  try {
    await prisma.order.updateMany({
      where: { id: orderId, blingNfceStatus: 'issuing' },
      data: {
        blingNfceStatus: uncertain ? 'uncertain' : 'failed',
        blingNfceError: message,
        blingNfceStartedAt: null,
      },
    });
    await prisma.order.updateMany({
      where: { id: orderId, blingSyncStatus: 'sending' },
      data: {
        blingSyncStatus: uncertain ? 'uncertain' : 'failed',
        blingSyncError: message,
        blingSyncStartedAt: null,
      },
    });
  } catch (saveError) {
    console.error('Não foi possível registrar o resultado da emissão automática da NFC-e:', saveError);
  }
  return { status: uncertain ? 'uncertain' : 'failed', error: message };
}

export async function issueBlingNfceForPaidOrder(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new BlingIntegrationError('Pedido não encontrado.', 404);
  if (!isEligiblePaidOrder(order)) return { status: 'not_eligible' };
  if (order.blingNfceStatus === 'authorized') return { status: 'authorized' };
  if (order.blingNfceStatus === 'processing' || order.blingNfceStatus === 'uncertain') {
    return { status: order.blingNfceStatus };
  }
  if (order.blingNfceStatus === 'issuing') {
    const startedAt = order.blingNfceStartedAt?.getTime() || 0;
    if (!startedAt || Date.now() - startedAt <= 5 * 60 * 1000) return { status: 'issuing' };
    await prisma.order.updateMany({
      where: { id: order.id, blingNfceStatus: 'issuing', blingNfceStartedAt: order.blingNfceStartedAt },
      data: {
        blingNfceStatus: 'uncertain',
        blingNfceError: 'A tentativa expirou sem confirmação. Confira a NFC-e no Bling antes de tentar novamente.',
        blingNfceStartedAt: null,
      },
    });
    return { status: 'uncertain' };
  }
  if (!order.blingSalesOrderId && ['sending', 'uncertain'].includes(order.blingSyncStatus)) {
    if (order.blingSyncStatus === 'sending') {
      const startedAt = order.blingSyncStartedAt?.getTime() || 0;
      if (startedAt && Date.now() - startedAt <= 5 * 60 * 1000) return { status: 'issuing' };
    }
    await prisma.order.updateMany({
      where: { id: order.id, blingNfceStatus: 'not_issued' },
      data: {
        blingNfceStatus: 'uncertain',
        blingNfceError: 'A criação do pedido de venda não foi confirmada. Confira a referência no Bling antes de tentar novamente.',
      },
    });
    return { status: 'uncertain' };
  }

  const claim = await prisma.order.updateMany({
    where: {
      id: order.id,
      paymentStatus: 'paid',
      status: { not: 'Cancelado' },
      blingNfceStatus: { in: ['not_issued', 'failed'] },
    },
    data: {
      blingNfceStatus: 'issuing',
      blingNfceError: null,
      blingNfceStartedAt: new Date(),
      ...(order.blingSalesOrderId ? {} : {
        blingSyncStatus: 'sending',
        blingSyncError: null,
        blingSyncStartedAt: new Date(),
      }),
    },
  });
  if (!claim.count) return { status: 'in_progress' };

  let nfceId = order.blingNfceId;
  try {
    let salesOrderId = order.blingSalesOrderId;
    if (!salesOrderId) {
      const createdSalesOrder = await sendOrderToBling(order);
      const salesOrder = createdSalesOrder?.data;
      if (!salesOrder?.id) {
        throw new BlingIntegrationError('O Bling não confirmou a criação do pedido de venda.', 502, { uncertain: true });
      }
      salesOrderId = String(salesOrder.id);
      await prisma.order.update({
        where: { id: order.id },
        data: {
          blingSalesOrderId: salesOrderId,
          blingSalesOrderNumber: salesOrder.numero === undefined ? null : String(salesOrder.numero),
          blingSyncedAt: new Date(),
          blingSyncStatus: 'sent',
          blingSyncError: null,
          blingSyncStartedAt: null,
        },
      });
    }

    const latestOrder = await prisma.order.findUnique({
      where: { id: order.id },
      select: {
        paymentStatus: true,
        paymentMethod: true,
        pagarmeOrderId: true,
        status: true,
      },
    });
    if (!latestOrder || !isEligiblePaidOrder(latestOrder)) {
      const message = 'O pedido deixou de estar elegível para emissão automática antes da geração da NFC-e.';
      await prisma.order.update({
        where: { id: order.id },
        data: {
          blingNfceStatus: 'failed',
          blingNfceError: message,
          blingNfceStartedAt: null,
        },
      });
      return { status: 'failed', error: message };
    }

    if (!nfceId) {
      const generated = await blingRequest(`/pedidos/vendas/${encodeURIComponent(salesOrderId)}/gerar-nfce`, {
        method: 'POST',
      });
      const id = generated?.data?.idNotaFiscal ?? generated?.idNotaFiscal;
      if (!id) {
        throw new BlingIntegrationError('O Bling não confirmou o identificador da NFC-e gerada.', 502, { uncertain: true });
      }
      nfceId = String(id);
      await prisma.order.update({
        where: { id: order.id },
        data: {
          blingNfceId: nfceId,
          blingNfceStatus: 'issuing',
        },
      });
    }

    await blingRequest(`/nfce/${encodeURIComponent(nfceId)}/enviar`, { method: 'POST' });
    const invoice = await blingRequest(`/nfce/${encodeURIComponent(nfceId)}`);
    if (!invoice?.data) {
      throw new BlingIntegrationError('A NFC-e foi enviada, mas o Bling não confirmou sua situação.', 502, { uncertain: true });
    }
    const saved = await saveInvoiceStatus(order.id, invoice.data);
    return { status: saved.blingNfceStatus, invoice: saved };
  } catch (error) {
    if (nfceId) {
      try {
        const latest = await refreshBlingNfceStatus(order.id);
        return { status: latest.blingNfceStatus, invoice: latest };
      } catch (refreshError) {
        console.error('Não foi possível confirmar a situação da NFC-e após a falha de envio:', refreshError);
      }
      return markAttemptFailure(
        order.id,
        new BlingIntegrationError(
          'O envio da NFC-e foi iniciado, mas não foi possível confirmar a situação no Bling. Atualize antes de tentar novamente.',
          502,
          { uncertain: true },
        ),
      );
    }
    return markAttemptFailure(order.id, error);
  }
}

export async function retryBlingNfceForPaidOrder(orderId, { confirmNoInvoiceFound = false } = {}) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, blingNfceStatus: true, blingNfceId: true, blingSyncStatus: true },
  });
  if (!order) throw new BlingIntegrationError('Pedido não encontrado.', 404);
  if (order.blingNfceStatus === 'uncertain') {
    if (order.blingNfceId) {
      const status = await refreshBlingNfceStatus(orderId);
      if (status.blingNfceStatus !== 'failed') return { status: status.blingNfceStatus, invoice: status };
    } else if (!confirmNoInvoiceFound) {
      throw new BlingIntegrationError('Confira no Bling se existe um pedido de venda ou uma NFC-e para esta referência antes de autorizar outra tentativa.', 409, { uncertain: true });
    } else {
      await prisma.order.updateMany({
        where: { id: order.id, blingNfceStatus: 'uncertain' },
        data: {
          blingNfceStatus: 'failed',
          blingNfceStartedAt: null,
          ...(order.blingSyncStatus === 'uncertain' ? {
            blingSyncStatus: 'failed',
            blingSyncStartedAt: null,
          } : {}),
        },
      });
    }
  } else if (order.blingNfceStatus === 'processing' && order.blingNfceId) {
    const status = await refreshBlingNfceStatus(orderId);
    if (status.blingNfceStatus === 'authorized') return { status: 'authorized', invoice: status };
    if (status.blingNfceStatus === 'failed') return issueBlingNfceForPaidOrder(orderId);
    await prisma.order.updateMany({
      where: { id: order.id, blingNfceStatus: 'processing' },
      data: {
        blingNfceStatus: 'failed',
        blingNfceError: null,
      },
    });
  }
  return issueBlingNfceForPaidOrder(orderId);
}
