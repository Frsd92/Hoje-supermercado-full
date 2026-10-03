const QUANTITY_SCALE = 1000;
const MAX_PRODUCT_QUANTITY_MILLI_UNITS = 999_999_999_999;

export function inventoryQuantityMilliUnits(value) {
  const quantity = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(quantity) || quantity < 0) return null;

  const scaledQuantity = quantity * QUANTITY_SCALE;
  const roundedQuantity = Math.round(scaledQuantity);
  if (Math.abs(scaledQuantity - roundedQuantity) >= 1e-7) return null;
  return roundedQuantity;
}

export function parseInventoryDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && Number.isNaN(value.getTime())) return undefined;
  const dateOnly = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return undefined;

  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  return date.toISOString().slice(0, 10) === dateOnly ? date : undefined;
}

export function inventoryDateOnly(value) {
  if (value === null || value === undefined || value === '') return '';
  const parsed = parseInventoryDate(value);
  return parsed?.toISOString().slice(0, 10) || '';
}

export function requiresInventoryExpiry(product) {
  const metadata = product?.metadata && typeof product.metadata === 'object' && !Array.isArray(product.metadata)
    ? product.metadata
    : product || {};
  return metadata.controlsExpiry === true || metadata.perishable === true;
}

export async function reconcileProductInventory(transaction, productId) {
  const [product, lots] = await Promise.all([
    transaction.product.findUnique({
      where: { id: productId },
      select: { id: true, metadata: true },
    }),
    transaction.productLot.findMany({
      where: { productId, quantity: { gt: 0 } },
      orderBy: [{ expiry: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { quantity: true, expiry: true, lotCode: true, manufactureDate: true },
    }),
  ]);
  if (!product) throw new Error('Produto do lote não encontrado.');

  const quantityMilliUnits = lots.reduce((total, lot) => {
    const lotQuantity = inventoryQuantityMilliUnits(lot.quantity);
    if (lotQuantity === null) throw new Error('O saldo de um lote não possui uma quantidade válida.');
    return total + lotQuantity;
  }, 0);
  if (quantityMilliUnits > MAX_PRODUCT_QUANTITY_MILLI_UNITS) {
    throw new Error('A soma dos lotes ultrapassa o limite de estoque permitido para o produto.');
  }

  const metadata = product.metadata && typeof product.metadata === 'object' && !Array.isArray(product.metadata)
    ? product.metadata
    : {};
  const onlyLot = lots.length === 1 ? lots[0] : null;
  return transaction.product.update({
    where: { id: productId },
    data: {
      quantity: quantityMilliUnits / QUANTITY_SCALE,
      expiry: lots.find((lot) => lot.expiry)?.expiry || null,
      metadata: {
        ...metadata,
        lot: onlyLot?.lotCode || '',
        manufactureDate: inventoryDateOnly(onlyLot?.manufactureDate),
      },
    },
  });
}

export async function addInventoryLot(transaction, {
  productId,
  lotCode,
  quantity,
  expiry,
  manufactureDate,
  location,
  actor,
  source,
  sourceReference,
}) {
  const quantityMilliUnits = inventoryQuantityMilliUnits(quantity);
  const expiryDate = parseInventoryDate(expiry);
  const manufactureDateValue = parseInventoryDate(manufactureDate);
  if (quantityMilliUnits === null || quantityMilliUnits <= 0) throw new Error('A quantidade do lote precisa ser maior que zero e ter até três casas decimais.');
  if (expiryDate === undefined || manufactureDateValue === undefined) throw new Error('Informe datas válidas para o lote.');

  const product = await transaction.product.findUnique({
    where: { id: productId },
    select: { id: true, externalId: true, title: true, metadata: true },
  });
  if (!product) throw new Error('Produto não encontrado.');
  if (requiresInventoryExpiry(product) && !expiryDate) {
    throw new Error(`Informe a validade do lote de "${product.title}".`);
  }

  const normalizedLotCode = String(lotCode || '').trim().toUpperCase();
  if (product.metadata?.controlsLot === true && !normalizedLotCode) {
    throw new Error(`Informe o código do lote de "${product.title}".`);
  }
  const identityKey = JSON.stringify([
    productId,
    normalizedLotCode.toLocaleUpperCase('pt-BR'),
    expiryDate?.toISOString().slice(0, 10) || '',
    manufactureDateValue?.toISOString().slice(0, 10) || '',
  ]);
  const identityWhere = {
    productId,
    lotCode: normalizedLotCode || null,
    expiry: expiryDate,
    manufactureDate: manufactureDateValue,
  };
  const existingLot = await transaction.productLot.findFirst({ where: identityWhere });
  const lot = existingLot
    ? await transaction.productLot.update({
      where: { id: existingLot.id },
      data: {
        quantity: { increment: quantityMilliUnits / QUANTITY_SCALE },
        ...(location ? { location: String(location).trim() } : {}),
      },
    })
    : await transaction.productLot.create({
      data: {
        productId,
        identityKey,
        lotCode: normalizedLotCode || null,
        quantity: quantityMilliUnits / QUANTITY_SCALE,
        expiry: expiryDate,
        manufactureDate: manufactureDateValue,
        location: String(location || '').trim() || null,
        source: String(source || 'MANUAL'),
        sourceReference: String(sourceReference || '').trim() || null,
        createdBy: String(actor || '').trim() || null,
      },
    });

  const updatedProduct = await reconcileProductInventory(transaction, productId);
  return {
    lot,
    product: updatedProduct,
    created: !existingLot,
    previousQuantity: existingLot ? Number(existingLot.quantity) : 0,
  };
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
}

function orderItemQuantityMilliUnits(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  return inventoryQuantityMilliUnits(quantity);
}

export function planFefoAllocations({ items, products, lots, today }) {
  const productsById = new Map();
  const productsByTitle = new Map();
  products.forEach((product) => {
    productsById.set(String(product.id), product);
    if (product.externalId) productsById.set(String(product.externalId), product);
    const normalizedTitle = normalizeText(product.title);
    if (productsByTitle.has(normalizedTitle)) {
      productsByTitle.set(normalizedTitle, null);
    } else {
      productsByTitle.set(normalizedTitle, product);
    }
  });

  const lotsByProduct = new Map();
  lots.forEach((lot) => {
    const current = lotsByProduct.get(lot.productId) || [];
    current.push(lot);
    lotsByProduct.set(lot.productId, current);
  });
  lotsByProduct.forEach((productLots) => productLots.sort((first, second) => {
    const firstExpiry = inventoryDateOnly(first.expiry);
    const secondExpiry = inventoryDateOnly(second.expiry);
    if (firstExpiry !== secondExpiry) {
      if (!firstExpiry) return 1;
      if (!secondExpiry) return -1;
      return firstExpiry.localeCompare(secondExpiry);
    }
    return String(first.createdAt || '').localeCompare(String(second.createdAt || ''))
      || String(first.id).localeCompare(String(second.id));
  }));

  const remainingByLot = new Map(lots.map((lot) => [lot.id, inventoryQuantityMilliUnits(lot.quantity)]));
  const allocations = [];
  const requiredByProduct = new Map();

  for (const [orderItemIndex, item] of items.entries()) {
    const itemProductId = String(item.productId || item.id || '').trim();
    const product = itemProductId
      ? productsById.get(itemProductId)
      : productsByTitle.get(normalizeText(item.name));
    if (!product) {
      return { error: `O produto "${item.name || itemProductId || 'sem identificação'}" não está vinculado ao catálogo; corrija o pedido antes da separação.` };
    }

    const quantityMilliUnits = orderItemQuantityMilliUnits(item.quantity);
    if (quantityMilliUnits === null) {
      return { error: `A quantidade de "${product.title}" no pedido é inválida.` };
    }
    requiredByProduct.set(product.id, (requiredByProduct.get(product.id) || 0) + quantityMilliUnits);

    const productLots = lotsByProduct.get(product.id) || [];
    const controlledExpiry = requiresInventoryExpiry(product);
    const datedAvailable = productLots.filter((lot) => {
      const quantity = remainingByLot.get(lot.id) || 0;
      const expiryDate = inventoryDateOnly(lot.expiry);
      return quantity > 0 && expiryDate && expiryDate >= today;
    });
    const undatedAvailable = productLots.filter((lot) => (
      (remainingByLot.get(lot.id) || 0) > 0 && !inventoryDateOnly(lot.expiry)
    ));
    const availableLots = controlledExpiry
      ? datedAvailable
      : productLots.filter((lot) => {
        const quantity = remainingByLot.get(lot.id) || 0;
        const expiryDate = inventoryDateOnly(lot.expiry);
        return quantity > 0 && (!expiryDate || expiryDate >= today);
      });

    const availableQuantity = availableLots.reduce((total, lot) => total + (remainingByLot.get(lot.id) || 0), 0);
    if (quantityMilliUnits > availableQuantity) {
      if (controlledExpiry && undatedAvailable.length) {
        return { error: `"${product.title}" possui saldo sem validade cadastrada. Corrija os lotes antes de iniciar a separação.` };
      }
      return { error: `Estoque válido insuficiente para "${product.title}". Disponível: ${(availableQuantity / QUANTITY_SCALE).toLocaleString('pt-BR')}; pedido: ${(quantityMilliUnits / QUANTITY_SCALE).toLocaleString('pt-BR')}.` };
    }

    let quantityToAllocate = quantityMilliUnits;
    for (const lot of availableLots) {
      if (quantityToAllocate === 0) break;
      const lotAvailable = remainingByLot.get(lot.id) || 0;
      const allocatedMilliUnits = Math.min(lotAvailable, quantityToAllocate);
      if (!allocatedMilliUnits) continue;
      remainingByLot.set(lot.id, lotAvailable - allocatedMilliUnits);
      quantityToAllocate -= allocatedMilliUnits;
      allocations.push({
        orderItemIndex,
        lotId: lot.id,
        productId: product.id,
        productTitle: product.title,
        lotCode: lot.lotCode || '',
        quantityMilliUnits: allocatedMilliUnits,
      });
    }
  }

  return { allocations, requiredByProduct };
}
