import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { addInventoryLot, inventoryQuantityMilliUnits } from '@/features/erp/api/inventory-lots';
import { invoiceAuditSnapshot, supplierInvoiceQuery, supplierInvoiceView } from '@/features/erp/api/supplier-invoices';
import { purchaseOrderSnapshot } from '@/features/erp/api/purchase-orders';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
export async function POST(_request, { params }) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });
  const { invoiceId } = await params;
  const actor = erpActorLabel(session?.user);

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const invoice = await transaction.supplierInvoice.findUnique({ where: { id: invoiceId }, ...supplierInvoiceQuery() });
      if (!invoice) return { error: 'Nota fiscal não encontrada.', status: 404 };
      if (invoice.status === 'Lançada') return { error: 'Esta nota fiscal já foi lançada.', status: 409 };
      if (!invoice.authorizationDataComplete) return { error: 'O lançamento está bloqueado: confirme a autorização de uso com o responsável fiscal antes de lançar estoque.', status: 409 };
      if (!invoice.supplierId) return { error: 'Associe a NF-e ao fornecedor cadastrado antes de lançar.', status: 409 };
      if (!invoice.items.length) return { error: 'A nota não possui itens para lançamento.', status: 409 };

      const prepared = [];
      let hasDiscrepancy = false;
      for (const item of invoice.items) {
        const billed = inventoryQuantityMilliUnits(item.invoiceQuantity);
        const accepted = inventoryQuantityMilliUnits(item.acceptedQuantity);
        const missing = inventoryQuantityMilliUnits(item.missingQuantity);
        const damaged = inventoryQuantityMilliUnits(item.damagedQuantity);
        const returned = inventoryQuantityMilliUnits(item.returnedQuantity);
        if ([billed, accepted, missing, damaged, returned].some((value) => value === null)
          || billed !== accepted + missing + damaged + returned) {
          return { error: `Conclua a conferência e registre a quantidade total de "${item.description}" antes de lançar.`, status: 409 };
        }
        if (!item.productId || !item.product || item.product.status !== 'Ativo') {
          return { error: `Associe "${item.description}" a um produto ativo do catálogo.`, status: 409 };
        }
        const acceptedQuantity = accepted / 1000;
        const unitCost = item.approvedUnitCost === null ? null : Number(item.approvedUnitCost);
        if (acceptedQuantity > 0 && (!Number.isFinite(unitCost) || unitCost < 0)) {
          return { error: `Informe o custo unitário aprovado de "${item.description}".`, status: 409 };
        }
        if (acceptedQuantity > 0 && !item.receiptLots.length) {
          const metadata = item.product.metadata || {};
          if (metadata.controlsLot === true || metadata.controlsExpiry === true || metadata.perishable === true) {
            return { error: `Cadastre lote e validade para "${item.description}" antes de lançar.`, status: 409 };
          }
        }
        const totalLotQuantity = item.receiptLots.reduce((sum, lot) => {
          const quantity = inventoryQuantityMilliUnits(lot.quantity);
          return quantity === null ? null : sum + quantity;
        }, 0);
        if (acceptedQuantity > 0 && item.receiptLots.length && totalLotQuantity !== accepted) {
          return { error: `A quantidade dos lotes de "${item.description}" mudou. Atualize a conferência antes de lançar.`, status: 409 };
        }
        if (missing + damaged + returned > 0) hasDiscrepancy = true;
        prepared.push({ item, acceptedQuantity, unitCost });
      }

      const receivedGroups = new Map();
      for (const entry of prepared) {
        if (!entry.acceptedQuantity) continue;
        const productId = entry.item.productId;
        const current = receivedGroups.get(productId) || {
          quantityMilliUnits: 0,
          unitCost: entry.unitCost,
          lots: [],
        };
        if (current.unitCost !== entry.unitCost) {
          return { error: `As linhas recebidas do mesmo produto "${entry.item.description}" têm custos aprovados diferentes. Unifique o custo antes de lançar para atualizar o cadastro sem ambiguidade.`, status: 409 };
        }
        current.quantityMilliUnits += inventoryQuantityMilliUnits(entry.acceptedQuantity);
        current.lots.push(...(entry.item.receiptLots.length ? entry.item.receiptLots : [{
          quantity: entry.acceptedQuantity,
          lotCode: entry.item.lotCode || '',
          expiry: entry.item.expiry,
          manufactureDate: entry.item.manufactureDate,
          location: entry.item.product.metadata?.location || '',
        }]));
        receivedGroups.set(productId, current);
      }

      const productIds = [...receivedGroups.keys()];
      const products = await transaction.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, externalId: true, title: true, status: true, quantity: true, cost: true, metadata: true },
      });
      const productsById = new Map(products.map((product) => [product.id, product]));
      for (const entry of prepared) {
        if (entry.acceptedQuantity <= 0) continue;
        const product = productsById.get(entry.item.productId);
        if (!product || product.status !== 'Ativo') {
          return { error: `O produto associado a "${entry.item.description}" não está ativo.`, status: 409 };
        }
      }

      let purchaseOrder = null;
      if (invoice.purchaseOrderId) {
        purchaseOrder = await transaction.purchaseOrder.findUnique({
          where: { id: invoice.purchaseOrderId },
          include: {
            supplier: { select: { id: true, name: true } },
            items: { include: { product: { select: { title: true } } } },
          },
        });
        if (!purchaseOrder || purchaseOrder.supplierId !== invoice.supplierId || !['Confirmado', 'Em Trânsito'].includes(purchaseOrder.status)) {
          return { error: 'A ordem vinculada não está disponível para recebimento. Corrija o vínculo antes do lançamento.', status: 409 };
        }
        const remainingByItem = new Map(purchaseOrder.items.map((item) => [
          item.id,
          inventoryQuantityMilliUnits(Number(item.quantity) - Number(item.receivedQuantity)),
        ]));
        for (const entry of prepared) {
          let remaining = inventoryQuantityMilliUnits(entry.acceptedQuantity);
          if (remaining === null || !remaining) continue;
          const candidates = purchaseOrder.items.filter((item) => item.productId === entry.item.productId);
          if (!candidates.length) return { error: `"${entry.item.description}" não consta na ordem ${purchaseOrder.code}. Remova o vínculo ou corrija a ordem.`, status: 409 };
          for (const orderItem of candidates) {
            const available = remainingByItem.get(orderItem.id);
            if (available === null || available === undefined) continue;
            const allocated = Math.min(available, remaining);
            remainingByItem.set(orderItem.id, available - allocated);
            remaining -= allocated;
            if (!remaining) break;
          }
          if (remaining > 0) return { error: `A quantidade conferida de "${entry.item.description}" ultrapassa o saldo da ordem ${purchaseOrder.code}.`, status: 409 };
        }
      }

      const postedAt = new Date();
      for (const [productId, group] of receivedGroups) {
        const product = productsById.get(productId);
        const oldCost = Number(product.cost);
        for (const lot of group.lots) {
          await addInventoryLot(transaction, {
            productId: product.id,
            quantity: lot.quantity,
            lotCode: lot.lotCode || '',
            expiry: lot.expiry,
            manufactureDate: lot.manufactureDate,
            location: lot.location || product.metadata?.location || '',
            actor,
            source: `NF-e ${invoice.invoiceNumber}/${invoice.series}`,
            sourceReference: invoice.accessKey,
          });
        }
        const updatedProduct = await transaction.product.update({
          where: { id: product.id },
          data: { cost: group.unitCost },
          select: { quantity: true },
        });
        const unit = product.metadata?.saleUnit === 'Quilograma' ? 'kg' : 'un.';
        await transaction.productAuditLog.create({
          data: {
            productId: product.id,
            productExternalId: product.externalId,
            productTitle: product.title,
            action: 'PURCHASE_RECEIPT',
            actor,
            changes: {
              quantity: { before: Number(product.quantity), after: Number(updatedProduct.quantity) },
              cost: { before: oldCost, after: group.unitCost },
            },
            note: `Entrada da NF-e ${invoice.invoiceNumber}/${invoice.series} — ${invoice.supplier.name}; ${group.quantityMilliUnits / 1000} ${unit} aceitos.`,
          },
        });
      }

      if (purchaseOrder) {
        for (const [productId, group] of receivedGroups) {
          const productOrderItems = purchaseOrder.items.filter((item) => item.productId === productId);
          let remaining = group.quantityMilliUnits;
          for (const item of productOrderItems) {
            const currentMilli = inventoryQuantityMilliUnits(item.receivedQuantity);
            const totalMilli = inventoryQuantityMilliUnits(item.quantity);
            const allocated = Math.min(totalMilli - currentMilli, remaining);
            if (allocated <= 0) continue;
            await transaction.purchaseOrderItem.update({
              where: { id: item.id },
              data: {
                receivedQuantity: (currentMilli + allocated) / 1000,
                receivedUnitCost: group.unitCost,
              },
            });
            remaining -= allocated;
            if (!remaining) break;
          }
        }
        const freshOrderItems = await transaction.purchaseOrderItem.findMany({ where: { purchaseOrderId: purchaseOrder.id } });
        const fullyReceived = freshOrderItems.every((item) => Number(item.receivedQuantity) >= Number(item.quantity));
        const updatedOrder = await transaction.purchaseOrder.update({
          where: { id: purchaseOrder.id },
          data: {
            status: fullyReceived ? 'Recebido' : 'Em Trânsito',
            ...(fullyReceived ? { receivedAt: postedAt } : {}),
            updatedBy: actor,
          },
          include: { supplier: true, items: { include: { product: true } } },
        });
        await transaction.purchaseOrderAuditLog.create({
          data: {
            purchaseOrderId: purchaseOrder.id,
            action: 'RECEIPT',
            actor,
            snapshot: purchaseOrderSnapshot(updatedOrder),
            note: `Recebimento pela NF-e ${invoice.invoiceNumber}/${invoice.series} (${invoice.accessKey}).`,
          },
        });
      }

      const updatedPayables = await transaction.supplierPayable.findMany({
        where: { invoiceId },
        select: { id: true, installment: true, amount: true, dueAt: true, status: true },
      });
      for (const payable of updatedPayables) {
        const nextStatus = payable.status === 'Paga' || payable.status === 'Em disputa'
          ? payable.status
          : hasDiscrepancy ? 'Em disputa' : payable.dueAt ? 'Em aberto' : 'Em Análise';
        await transaction.supplierPayable.update({ where: { id: payable.id }, data: { status: nextStatus } });
      }
      const saved = await transaction.supplierInvoice.update({
        where: { id: invoiceId },
        data: { status: 'Lançada', postedBy: actor, postedAt },
        ...supplierInvoiceQuery(),
      });
      await transaction.supplierInvoiceAuditLog.create({
        data: {
          invoiceId,
          action: 'LANCAMENTO_CONFIRMADO',
          actor,
          snapshot: invoiceAuditSnapshot(saved),
          note: `Responsável confirmou o lançamento do estoque e custo${hasDiscrepancy ? '; contas a pagar preservadas pelo valor integral da NF-e e marcadas em disputa por divergência.' : '.'} A autorização informada no XML não substitui a validação fiscal oficial.`,
        },
      });
      const auditedInvoice = await transaction.supplierInvoice.findUnique({
        where: { id: invoiceId },
        include: {
          ...supplierInvoiceQuery({ includeAudit: true }),
          auditLogs: { orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 100 },
        },
      });
      return { invoice: auditedInvoice };
    }, { isolationLevel: 'Serializable' });

    if (result.error) return Response.json({ error: result.error }, { status: result.status, headers });
    return Response.json({ invoice: supplierInvoiceView(result.invoice) }, { headers });
  } catch (error) {
    if (error?.code === 'P2034') return Response.json({ error: 'A nota ou o estoque foi alterado ao mesmo tempo. Atualize a tela e revise os saldos antes de tentar novamente.' }, { status: 409, headers });
    console.error('Não foi possível lançar a NF-e no estoque:', error);
    return Response.json({ error: 'Não foi possível lançar a nota fiscal e atualizar o estoque.' }, { status: 500, headers });
  }
}
