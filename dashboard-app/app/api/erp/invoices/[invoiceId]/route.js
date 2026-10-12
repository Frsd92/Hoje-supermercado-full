import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { inventoryQuantityMilliUnits, parseInventoryDate } from '@/features/erp/api/inventory-lots';
import { invoiceAuditSnapshot, supplierInvoiceQuery, supplierInvoiceView } from '@/features/erp/api/supplier-invoices';
import { normalizeSupplierTaxId } from '@/features/erp/api/supplier-data';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const maxInventoryMilliUnits = 999_999_999_999;

function responseError(message, status = 400) {
  return { error: message, status };
}

function parseMoney(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const raw = String(value).trim();
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount <= 9_999_999_999.99 ? amount : undefined;
}

function parseQuantity(value) {
  const milliUnits = inventoryQuantityMilliUnits(value);
  return milliUnits === null || milliUnits > maxInventoryMilliUnits ? null : milliUnits / 1000;
}

function parsePayableDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = parseInventoryDate(value);
  return date === undefined ? undefined : date;
}

function parseReceiptLots(value) {
  if (!Array.isArray(value) || value.length > 100) return { error: 'Informe lotes válidos para o recebimento.' };
  const lots = [];
  for (const lot of value) {
    const quantity = parseQuantity(lot?.quantity);
    if (quantity === null || quantity <= 0) return { error: 'Cada lote precisa ter uma quantidade positiva com até três casas decimais.' };
    const expiry = parseInventoryDate(lot?.expiry);
    const manufactureDate = parseInventoryDate(lot?.manufactureDate);
    if (expiry === undefined || manufactureDate === undefined) return { error: 'Informe datas válidas de fabricação e validade para os lotes.' };
    lots.push({
      quantity,
      lotCode: String(lot?.lotCode || '').trim().slice(0, 80),
      expiry,
      manufactureDate,
      location: String(lot?.location || '').trim().slice(0, 120),
    });
  }
  return { lots };
}

export async function GET(_request, { params }) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });
  const { invoiceId } = await params;

  try {
    const invoice = await prisma.supplierInvoice.findUnique({ where: { id: invoiceId }, ...supplierInvoiceQuery({ includeAudit: true }) });
    if (!invoice) return Response.json({ error: 'Nota fiscal não encontrada.' }, { status: 404, headers });
    return Response.json({ invoice: supplierInvoiceView(invoice) }, { headers });
  } catch (error) {
    console.error('Não foi possível carregar detalhes da NF-e:', error);
    return Response.json({ error: 'Não foi possível carregar os detalhes da nota fiscal.' }, { status: 500, headers });
  }
}

export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });
  const { invoiceId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Não foi possível ler os dados de conferência.' }, { status: 400, headers });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Informe os dados de conferência da nota.' }, { status: 400, headers });
  }

  const actor = erpActorLabel(session?.user);
  try {
    const outcome = await prisma.$transaction(async (transaction) => {
      const invoice = await transaction.supplierInvoice.findUnique({
        where: { id: invoiceId },
        ...supplierInvoiceQuery({ includeAudit: true }),
      });
      if (!invoice) return responseError('Nota fiscal não encontrada.', 404);
      if (invoice.status === 'Lançada') return responseError('Uma nota já lançada não pode ser alterada. Registre devoluções ou ajustes como nova movimentação.', 409);

      const supplierId = body.supplierId === undefined ? invoice.supplierId : String(body.supplierId || '').trim() || null;
      const purchaseOrderId = body.purchaseOrderId === undefined ? invoice.purchaseOrderId : String(body.purchaseOrderId || '').trim() || null;

      let supplier = null;
      if (supplierId) {
        supplier = await transaction.supplier.findUnique({
          where: { id: supplierId },
          select: { id: true, name: true, taxId: true, identityTaxId: true },
        });
        if (!supplier) return responseError('O fornecedor selecionado não existe.', 400);
        const supplierTaxId = normalizeSupplierTaxId(supplier.taxId || supplier.identityTaxId);
        if (supplierTaxId !== invoice.issuerTaxId) {
          return responseError('O CPF/CNPJ do fornecedor não corresponde ao emitente da NF-e. Confira o cadastro antes de continuar.', 409);
        }
      }

      let purchaseOrder = null;
      if (purchaseOrderId) {
        purchaseOrder = await transaction.purchaseOrder.findUnique({
          where: { id: purchaseOrderId },
          select: { id: true, code: true, supplierId: true, status: true },
        });
        if (!purchaseOrder) return responseError('A ordem de compra selecionada não existe.', 400);
        if (!supplierId || purchaseOrder.supplierId !== supplierId) return responseError('A ordem de compra precisa pertencer ao fornecedor emitente da NF-e.', 409);
        if (!['Confirmado', 'Em Trânsito'].includes(purchaseOrder.status)) return responseError('Associe somente uma ordem confirmada ou em trânsito.', 409);
      }

      const updates = Array.isArray(body.items) ? body.items : [];
      if (updates.length && (updates.length !== invoice.items.length || updates.some((item) => !invoice.items.some((line) => line.id === item?.id)))) {
        return responseError('A lista precisa conter exatamente todos os itens desta nota.', 400);
      }
      const payableUpdates = Array.isArray(body.payables) ? body.payables : [];
      if (payableUpdates.length && (payableUpdates.length !== invoice.payables.length
        || payableUpdates.some((entry) => !invoice.payables.some((payable) => payable.id === entry?.id)))) {
        return responseError('A lista precisa conter exatamente todas as parcelas desta nota.', 400);
      }
      const updateById = new Map(updates.map((item) => [item.id, item]));
      const payableById = new Map(payableUpdates.map((entry) => [entry.id, entry]));
      const prepared = [];
      for (const line of invoice.items) {
        const update = updateById.get(line.id);
        if (!update) continue;
        const quantities = {};
        for (const field of ['acceptedQuantity', 'missingQuantity', 'damagedQuantity', 'returnedQuantity']) {
          const quantity = parseQuantity(update[field] ?? 0);
          if (quantity === null) return responseError(`A quantidade do item "${line.description}" deve ter até três casas decimais.`, 400);
          quantities[field] = quantity;
        }
        const invoiceQuantity = parseQuantity(line.invoiceQuantity);
        if (invoiceQuantity === null) return responseError(`A quantidade fiscal do item "${line.description}" não pode ser lançada com precisão de estoque superior a três casas.`, 409);
        const accounted = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
        if (accounted - invoiceQuantity > 0.000001) {
          return responseError(`A soma recebido/faltante/avariado/devolvido do item "${line.description}" supera a quantidade faturada.`, 400);
        }

        const productId = update.productId === null || update.productId === '' ? null : String(update.productId || '').trim();
        let product = null;
        if (productId) {
          product = await transaction.product.findUnique({
            where: { id: productId },
            select: { id: true, title: true, status: true, metadata: true },
          });
          if (!product || product.status !== 'Ativo') return responseError('Relacione cada item a um produto ativo do catálogo.', 400);
        }
        const approvedUnitCost = parseMoney(update.approvedUnitCost);
        if (approvedUnitCost === undefined) return responseError(`Informe um custo unitário válido para "${line.description}".`, 400);
        if (quantities.acceptedQuantity > 0 && product && approvedUnitCost === null) {
          return responseError(`Informe o custo de aquisição aprovado para "${line.description}".`, 400);
        }

        const lotResult = parseReceiptLots(update.receiptLots || []);
        if (lotResult.error) return responseError(`${line.description}: ${lotResult.error}`, 400);
        const lotTotalMilli = lotResult.lots.reduce((sum, lot) => sum + Math.round(lot.quantity * 1000), 0);
        if (lotResult.lots.length && lotTotalMilli !== Math.round(quantities.acceptedQuantity * 1000)) {
          return responseError(`A soma dos lotes de "${line.description}" deve ser igual à quantidade aceita.`, 400);
        }
        const discrepancyNote = String(update.discrepancyNote || '').trim().slice(0, 1000);
        if (quantities.missingQuantity + quantities.damagedQuantity + quantities.returnedQuantity > 0 && !discrepancyNote) {
          return responseError(`Registre uma observação para a falta, avaria ou devolução de "${line.description}".`, 400);
        }
        if (quantities.acceptedQuantity > 0 && product) {
          const metadata = product.metadata || {};
          if (metadata.controlsLot === true && (!lotResult.lots.length || lotResult.lots.some((lot) => !lot.lotCode))) {
            return responseError(`Informe o lote de cada quantidade aceita de "${line.description}".`, 400);
          }
          if ((metadata.controlsExpiry === true || metadata.perishable === true) && (!lotResult.lots.length || lotResult.lots.some((lot) => !lot.expiry))) {
            return responseError(`Informe a validade de cada lote aceito de "${line.description}".`, 400);
          }
        }
        prepared.push({
          line,
          product,
          productId,
          quantities,
          approvedUnitCost,
          discrepancyNote: discrepancyNote || null,
          receiptLots: lotResult.lots,
        });
      }
      const preparedPayables = [];
      for (const payable of invoice.payables) {
        const update = payableById.get(payable.id);
        if (!update) continue;
        const dueAt = parsePayableDate(update.dueAt);
        if (dueAt === undefined) return responseError(`Informe uma data de vencimento válida para a parcela ${payable.installment}.`, 400);
        const status = String(update.status || payable.status);
        if (!['Aguardando lançamento', 'Em aberto', 'Em disputa', 'Em Análise', 'Paga'].includes(status)) {
          return responseError(`Selecione uma situação válida para a parcela ${payable.installment}.`, 400);
        }
        const paymentMethod = String(update.paymentMethod || '').trim().slice(0, 80);
        const paidAt = parsePayableDate(update.paidAt);
        if (paidAt === undefined) return responseError(`Informe uma data de pagamento válida para a parcela ${payable.installment}.`, 400);
        if (status === 'Paga' && (!paidAt || !paymentMethod)) {
          return responseError(`Para dar baixa na parcela ${payable.installment}, informe a data e a forma de pagamento.`, 400);
        }
        if (status === 'Em aberto' && !dueAt) return responseError(`Informe o vencimento da parcela ${payable.installment} antes de deixá-la em aberto.`, 400);
        preparedPayables.push({
          id: payable.id,
          installment: payable.installment,
          data: {
            dueAt,
            status,
            paidAt: status === 'Paga' ? paidAt : null,
            paymentMethod: paymentMethod || null,
            paymentReference: String(update.paymentReference || '').trim().slice(0, 120) || null,
            notes: String(update.notes || '').trim().slice(0, 1000) || null,
          },
        });
      }

      for (const update of prepared) {
        await transaction.supplierInvoiceItem.update({
          where: { id: update.line.id },
          data: {
            ...update.quantities,
            productId: update.productId,
            approvedUnitCost: update.approvedUnitCost,
            discrepancyNote: update.discrepancyNote,
            receiptLots: {
              deleteMany: {},
              ...(update.receiptLots.length ? { create: update.receiptLots.map((lot) => ({
                quantity: lot.quantity,
                lotCode: lot.lotCode || null,
                expiry: lot.expiry,
                manufactureDate: lot.manufactureDate,
                location: lot.location || null,
              })) } : {}),
            },
          },
        });
      }
      for (const payable of preparedPayables) {
        await transaction.supplierPayable.update({ where: { id: payable.id }, data: payable.data });
      }

      await transaction.supplierInvoice.update({
        where: { id: invoiceId },
        data: { supplierId, purchaseOrderId },
      });
      const updated = await transaction.supplierInvoice.findUnique({
        where: { id: invoiceId },
        ...supplierInvoiceQuery({ includeAudit: true }),
      });
      const allMapped = updated.items.every((line) => Boolean(line.productId));
      const allQuantitiesAccounted = updated.items.every((line) => {
        const amount = Number(line.acceptedQuantity) + Number(line.missingQuantity)
          + Number(line.damagedQuantity) + Number(line.returnedQuantity);
        return Math.abs(amount - Number(line.invoiceQuantity)) < 0.000001;
      });
      const allAcceptedItemsCosted = updated.items.every((line) => Number(line.acceptedQuantity) === 0 || line.approvedUnitCost !== null);
      const nextStatus = updated.authorizationDataComplete && updated.supplierId && allMapped && allQuantitiesAccounted && allAcceptedItemsCosted
        ? 'Pronta para lançamento'
        : updated.authorizationDataComplete ? 'Aguardando conferência' : 'Aguardando validação fiscal';
      const saved = await transaction.supplierInvoice.update({
        where: { id: invoiceId },
        data: { status: nextStatus },
        ...supplierInvoiceQuery({ includeAudit: true }),
      });
      await transaction.supplierInvoiceAuditLog.create({
        data: {
          invoiceId,
          action: 'CONFERENCIA_ATUALIZADA',
          actor,
          snapshot: invoiceAuditSnapshot(saved),
          note: String(body.note || (preparedPayables.length
            ? 'Dados de conferência, vínculo comercial e parcelas de contas a pagar atualizados; os valores originais da NF-e foram preservados.'
            : 'Dados de conferência e vínculo comercial atualizados.')).trim().slice(0, 1000),
        },
      });
      const auditedInvoice = await transaction.supplierInvoice.findUnique({
        where: { id: invoiceId },
        ...supplierInvoiceQuery({ includeAudit: true }),
      });
      return { invoice: auditedInvoice };
    }, { isolationLevel: 'Serializable' });

    if (outcome.error) return Response.json({ error: outcome.error }, { status: outcome.status, headers });
    return Response.json({ invoice: supplierInvoiceView(outcome.invoice) }, { headers });
  } catch (error) {
    if (error?.code === 'P2034') return Response.json({ error: 'A nota ou o estoque foi alterado ao mesmo tempo. Atualize a tela e revise os dados antes de tentar novamente.' }, { status: 409, headers });
    console.error('Não foi possível salvar a conferência da NF-e:', error);
    return Response.json({ error: 'Não foi possível salvar a conferência da nota fiscal.' }, { status: 500, headers });
  }
}
