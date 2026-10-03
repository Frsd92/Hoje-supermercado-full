import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import {
  addInventoryLot,
  inventoryDateOnly,
  inventoryQuantityMilliUnits,
  parseInventoryDate,
  reconcileProductInventory,
  requiresInventoryExpiry,
} from '@/features/erp/api/inventory-lots';
import { prisma } from '@/lib/prisma';

const responseHeaders = { 'Cache-Control': 'private, no-store, max-age=0' };

class InventoryLotRequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function recordMetadata(record) {
  return record?.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
    ? record.metadata
    : {};
}

function serializeProduct(product) {
  const metadata = recordMetadata(product);
  return {
    id: product.id,
    externalId: product.externalId || product.id,
    title: product.title,
    sku: product.sku || '',
    quantity: Number(product.quantity),
    status: product.status,
    saleUnit: metadata.saleUnit === 'Quilograma' ? 'kg' : 'un.',
    categories: product.categories || [],
    controlsExpiry: metadata.controlsExpiry === true,
    controlsLot: metadata.controlsLot === true,
    perishable: metadata.perishable === true,
    location: String(metadata.location || ''),
  };
}

function serializeLot(lot) {
  const product = serializeProduct(lot.product);
  return {
    id: lot.id,
    productId: lot.productId,
    productExternalId: product.externalId,
    productTitle: product.title,
    productSku: product.sku,
    productQuantity: product.quantity,
    saleUnit: product.saleUnit,
    categories: product.categories,
    controlsExpiry: product.controlsExpiry,
    controlsLot: product.controlsLot,
    perishable: product.perishable,
    lotCode: lot.lotCode || '',
    quantity: Number(lot.quantity),
    expiry: inventoryDateOnly(lot.expiry),
    manufactureDate: inventoryDateOnly(lot.manufactureDate),
    location: lot.location || '',
    source: lot.source,
  };
}

function lotIdentityKey(productId, lotCode, expiry, manufactureDate) {
  return JSON.stringify([
    productId,
    lotCode.toLocaleUpperCase('pt-BR'),
    inventoryDateOnly(expiry),
    inventoryDateOnly(manufactureDate),
  ]);
}

async function findProduct(transaction, productReference) {
  return transaction.product.findFirst({
    where: { OR: [{ id: productReference }, { externalId: productReference }] },
  });
}

async function writeInventoryAudit(transaction, { product, lot, actor, action, beforeQuantity, note }) {
  await transaction.productAuditLog.create({
    data: {
      productId: product.id,
      productExternalId: product.externalId,
      productTitle: product.title,
      action,
      actor,
      changes: {
        inventoryLot: {
          after: {
            id: lot.id,
            lotCode: lot.lotCode,
            quantity: Number(lot.quantity),
            expiry: inventoryDateOnly(lot.expiry),
            manufactureDate: inventoryDateOnly(lot.manufactureDate),
          },
        },
        stockTotal: { before: beforeQuantity, after: Number(product.quantity) },
      },
      note,
    },
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: responseHeaders });

  try {
    const [lots, products] = await Promise.all([
      prisma.productLot.findMany({
        where: { quantity: { gt: 0 } },
        include: {
          product: {
            select: {
              id: true,
              externalId: true,
              title: true,
              sku: true,
              quantity: true,
              status: true,
              categories: true,
              metadata: true,
            },
          },
        },
        orderBy: [{ expiry: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.product.findMany({
        select: {
          id: true,
          externalId: true,
          title: true,
          sku: true,
          quantity: true,
          status: true,
          categories: true,
          metadata: true,
        },
        orderBy: { title: 'asc' },
      }),
    ]);

    return Response.json({
      lots: lots.map(serializeLot),
      products: products.map(serializeProduct),
    }, { headers: responseHeaders });
  } catch (error) {
    console.error('Não foi possível carregar os lotes de estoque:', error);
    return Response.json({ error: 'Não foi possível carregar os lotes de estoque.' }, { status: 500, headers: responseHeaders });
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: responseHeaders });

  const body = await request.json();
  const productReference = String(body?.productId || '').trim();
  const quantityMilliUnits = inventoryQuantityMilliUnits(body?.quantity);
  const expiry = parseInventoryDate(body?.expiry);
  const manufactureDate = parseInventoryDate(body?.manufactureDate);
  if (!productReference || quantityMilliUnits === null || quantityMilliUnits <= 0) {
    return Response.json({ error: 'Selecione o produto e informe uma quantidade de lote maior que zero, com até três casas decimais.' }, { status: 400, headers: responseHeaders });
  }
  if (expiry === undefined || manufactureDate === undefined) {
    return Response.json({ error: 'Informe datas válidas para o lote.' }, { status: 400, headers: responseHeaders });
  }

  const actor = erpActorLabel(session?.user);
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const product = await findProduct(transaction, productReference);
      if (!product) throw new InventoryLotRequestError('Produto não encontrado.', 404);
      if (requiresInventoryExpiry(product) && !expiry) {
        throw new InventoryLotRequestError(`Informe a validade do lote de "${product.title}".`);
      }
      const lotCode = String(body?.lotCode || '').trim().toUpperCase();
      const metadata = recordMetadata(product);
      if (metadata.controlsLot === true && !lotCode) {
        throw new InventoryLotRequestError(`Informe o código do lote de "${product.title}".`);
      }

      const beforeQuantity = Number(product.quantity);
      const added = await addInventoryLot(transaction, {
        productId: product.id,
        lotCode,
        quantity: quantityMilliUnits / 1000,
        expiry,
        manufactureDate,
        location: String(body?.location || '').trim() || metadata.location || '',
        actor,
        source: 'MANUAL',
        sourceReference: 'ERP validade',
      });
      const updatedProduct = { ...product, quantity: added.product.quantity };
      const note = `${added.created ? 'Lote cadastrado' : 'Saldo adicionado ao lote'}${lotCode ? ` ${lotCode}` : ''} de ${product.title}: +${quantityMilliUnits / 1000}${expiry ? `; validade ${inventoryDateOnly(expiry)}` : ''}.`;
      await writeInventoryAudit(transaction, {
        product: updatedProduct,
        lot: added.lot,
        actor,
        action: added.created ? 'INVENTORY_LOT_CREATED' : 'INVENTORY_LOT_RECEIPT',
        beforeQuantity,
        note,
      });
      return { product: updatedProduct, lot: { ...added.lot, product: updatedProduct } };
    }, { isolationLevel: 'Serializable' });

    return Response.json({ lot: serializeLot(result.lot), product: serializeProduct(result.product) }, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof InventoryLotRequestError) return Response.json({ error: error.message }, { status: error.status, headers: responseHeaders });
    if (error?.code === 'P2034') return Response.json({ error: 'O estoque foi alterado ao mesmo tempo. Atualize a tela antes de registrar o lote.' }, { status: 409, headers: responseHeaders });
    if (error?.code === 'P2002') return Response.json({ error: 'Este lote já está sendo atualizado. Atualize a tela e tente novamente.' }, { status: 409, headers: responseHeaders });
    console.error('Não foi possível registrar o lote de estoque:', error);
    return Response.json({ error: error.message || 'Não foi possível registrar o lote de estoque.' }, { status: 500, headers: responseHeaders });
  }
}

export async function PATCH(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: responseHeaders });

  const body = await request.json();
  const lotId = String(body?.lotId || '').trim();
  const quantityMilliUnits = inventoryQuantityMilliUnits(body?.quantity);
  const expiry = parseInventoryDate(body?.expiry);
  const manufactureDate = parseInventoryDate(body?.manufactureDate);
  if (!lotId || quantityMilliUnits === null) {
    return Response.json({ error: 'Informe o lote e uma quantidade válida, com até três casas decimais.' }, { status: 400, headers: responseHeaders });
  }
  if (expiry === undefined || manufactureDate === undefined) {
    return Response.json({ error: 'Informe datas válidas para o lote.' }, { status: 400, headers: responseHeaders });
  }

  const actor = erpActorLabel(session?.user);
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const currentLot = await transaction.productLot.findUnique({
        where: { id: lotId },
        include: {
          product: {
            select: {
              id: true,
              externalId: true,
              title: true,
              sku: true,
              quantity: true,
              status: true,
              categories: true,
              metadata: true,
            },
          },
        },
      });
      if (!currentLot) throw new InventoryLotRequestError('Lote não encontrado.', 404);
      if (requiresInventoryExpiry(currentLot.product) && quantityMilliUnits > 0 && !expiry) {
        throw new InventoryLotRequestError(`Informe a validade do lote de "${currentLot.product.title}".`);
      }

      const lotCode = String(body?.lotCode || '').trim().toUpperCase();
      const metadata = recordMetadata(currentLot.product);
      if (metadata.controlsLot === true && quantityMilliUnits > 0 && !lotCode) {
        throw new InventoryLotRequestError(`Informe o código do lote de "${currentLot.product.title}".`);
      }
      const duplicate = await transaction.productLot.findFirst({
        where: {
          productId: currentLot.productId,
          lotCode: lotCode || null,
          expiry,
          manufactureDate,
          id: { not: lotId },
        },
        select: { id: true },
      });
      if (duplicate) throw new InventoryLotRequestError('Já existe outro lote com este código e estas datas. Edite o lote existente para consolidar as quantidades.', 409);

      const beforeQuantity = Number(currentLot.product.quantity);
      const updatedLot = await transaction.productLot.update({
        where: { id: lotId },
        data: {
          identityKey: lotIdentityKey(currentLot.productId, lotCode, expiry, manufactureDate),
          lotCode: lotCode || null,
          quantity: quantityMilliUnits / 1000,
          expiry,
          manufactureDate,
          location: String(body?.location || '').trim() || null,
        },
        include: { product: { select: { id: true, externalId: true, title: true, sku: true, quantity: true, status: true, categories: true, metadata: true } } },
      });
      const updatedProduct = await reconcileProductInventory(transaction, currentLot.productId);
      const note = `Lote ${lotCode || currentLot.lotCode || currentLot.id} de "${currentLot.product.title}" atualizado: quantidade ${Number(currentLot.quantity)} → ${quantityMilliUnits / 1000}; validade ${inventoryDateOnly(currentLot.expiry) || 'não informada'} → ${inventoryDateOnly(expiry) || 'não informada'}.`;
      await writeInventoryAudit(transaction, {
        product: { ...currentLot.product, quantity: updatedProduct.quantity },
        lot: updatedLot,
        actor,
        action: 'INVENTORY_LOT_UPDATED',
        beforeQuantity,
        note,
      });
      return { lot: { ...updatedLot, product: updatedProduct }, product: updatedProduct };
    }, { isolationLevel: 'Serializable' });

    return Response.json({ lot: serializeLot(result.lot), product: serializeProduct(result.product) }, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof InventoryLotRequestError) return Response.json({ error: error.message }, { status: error.status, headers: responseHeaders });
    if (error?.code === 'P2034') return Response.json({ error: 'O estoque foi alterado ao mesmo tempo. Atualize a tela antes de salvar o lote.' }, { status: 409, headers: responseHeaders });
    if (error?.code === 'P2002') return Response.json({ error: 'Já existe um lote com estes dados. Atualize a tela e tente novamente.' }, { status: 409, headers: responseHeaders });
    console.error('Não foi possível atualizar o lote de estoque:', error);
    return Response.json({ error: error.message || 'Não foi possível atualizar o lote de estoque.' }, { status: 500, headers: responseHeaders });
  }
}
