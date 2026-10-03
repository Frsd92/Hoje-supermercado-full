import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { purchaseOrderSnapshot } from '@/features/erp/api/purchase-orders';
import { addInventoryLot, inventoryQuantityMilliUnits } from '@/features/erp/api/inventory-lots';
import { parsePurchaseOrderReceiptItems } from '@/features/erp/api/purchase-order-receipts';
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
        controlsExpiry: metadata?.controlsExpiry === true,
        controlsLot: metadata?.controlsLot === true,
        perishable: metadata?.perishable === true,
        location: metadata?.location || '',
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
  const parsed = parsePurchaseOrderReceiptItems(body?.items);
  if (!orderId || parsed.error) {
    return Response.json({ error: parsed.error || 'Informe a ordem e os lotes recebidos.' }, { status: 400 });
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
      if ([...parsed.receipts.keys()].some((itemId) => !order.items.some((item) => item.id === itemId))) {
        return { error: 'A lista contém linhas que não pertencem a esta ordem de compra.', status: 400 };
      }

      for (const item of order.items) {
        const receipt = parsed.receipts.get(item.id);
        if (!receipt || receipt.quantityMilliUnits === 0) continue;
        const remainingMilliUnits = inventoryQuantityMilliUnits(Number(item.quantity) - Number(item.receivedQuantity));
        if (remainingMilliUnits === null || receipt.quantityMilliUnits > remainingMilliUnits) {
          const remaining = Math.max(0, Number(item.quantity) - Number(item.receivedQuantity));
          return { error: `A quantidade recebida de "${item.product.title}" ultrapassa o saldo de ${remaining}.`, status: 400 };
        }

        const metadata = item.product.metadata || {};
        if (receipt.lots.some((lot) => metadata.controlsLot === true && !lot.lotCode)) {
          return { error: `Informe o código do lote de "${item.product.title}" para cada quantidade recebida.`, status: 400 };
        }
        if (receipt.lots.some((lot) => (metadata.controlsExpiry === true || metadata.perishable === true) && !lot.expiry)) {
          return { error: `Informe a validade de cada lote recebido de "${item.product.title}".`, status: 400 };
        }
      }

      const receivedLines = [];
      for (const item of order.items) {
        const receipt = parsed.receipts.get(item.id);
        if (!receipt || receipt.quantityMilliUnits === 0) continue;

        const oldQuantity = Number(item.product.quantity);
        const oldCost = Number(item.product.cost);
        const newCost = receipt.unitCost;
        for (const lot of receipt.lots) {
          await addInventoryLot(transaction, {
            productId: item.productId,
            quantity: lot.quantity,
            lotCode: lot.lotCode,
            expiry: lot.expiry,
            manufactureDate: lot.manufactureDate,
            location: lot.location || item.product.metadata?.location || '',
            source: `Ordem de compra ${order.code}`,
            actor,
          });
        }
        const updatedProduct = await transaction.product.update({
          where: { id: item.productId },
          data: { cost: newCost },
          select: { quantity: true },
        });
        const receivedQuantity = receipt.quantityMilliUnits / 1000;
        const lotSummary = receipt.lots.map((lot) => {
          const unit = item.product.metadata?.saleUnit === 'Quilograma' ? 'kg' : 'un.';
          const details = [
            lot.lotCode ? `lote ${lot.lotCode}` : 'lote sem código',
            lot.expiry ? `validade ${lot.expiry}` : 'validade não informada',
          ];
          return `${details.join(', ')}: ${lot.quantity} ${unit}`;
        }).join('; ');
        await transaction.productAuditLog.create({
          data: {
            productId: item.productId,
            productExternalId: item.product.externalId,
            productTitle: item.product.title,
            action: 'PURCHASE_RECEIPT',
            actor,
            changes: {
              quantity: { before: oldQuantity, after: Number(updatedProduct.quantity) },
              cost: { before: oldCost, after: newCost },
            },
            note: `Entrada da ordem ${order.code} (${order.supplier.name}); ${lotSummary}.`,
          },
        });
        await transaction.purchaseOrderItem.update({
          where: { id: item.id },
          data: {
            receivedQuantity: Number(item.receivedQuantity) + receivedQuantity,
            receivedUnitCost: newCost,
          },
        });
        receivedLines.push({
          product: item.product.title,
          quantity: receivedQuantity,
          cost: newCost,
          unit: item.product.metadata?.saleUnit === 'Quilograma' ? 'kg' : 'un.',
          lots: receipt.lots,
        });
      }
      if (!receivedLines.length) return { error: 'Informe ao menos uma quantidade de lote maior que zero.', status: 400 };

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
          note: `${fullyReceived ? 'Recebimento concluído' : 'Recebimento parcial'}: ${receivedLines.map((line) => `${line.product}, ${line.quantity} ${line.unit}, custo ${line.cost} (${line.lots.map((lot) => `${lot.lotCode || 'sem código'}, ${lot.quantity}${lot.expiry ? `, validade ${lot.expiry}` : ''}`).join('; ')})`).join('; ')}.`,
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
