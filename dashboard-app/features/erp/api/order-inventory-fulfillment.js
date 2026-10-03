import { planFefoAllocations, reconcileProductInventory } from './inventory-lots.js';

export async function allocateOrderInventory(transaction, order, actor, today) {
  if (!Array.isArray(order.items) || order.items.length === 0) {
    return { error: 'Este pedido não possui itens para separar.' };
  }
  const existingFulfillment = await transaction.inventoryOrderFulfillment.findUnique({
    where: { orderId: order.id },
    select: { orderId: true },
  });
  if (existingFulfillment) return { alreadyAllocated: true };

  const references = [...new Set((order.items || [])
    .flatMap((item) => [item.productId, item.id])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
  const legacyTitles = [...new Set((order.items || [])
    .filter((item) => !String(item.productId || item.id || '').trim())
    .map((item) => String(item.name || '').trim())
    .filter(Boolean))];
  const productFilters = [];
  if (references.length) {
    productFilters.push(
      { id: { in: references } },
      { externalId: { in: references } },
    );
  }
  if (legacyTitles.length) productFilters.push({ title: { in: legacyTitles } });
  const products = await transaction.product.findMany({
    where: { OR: productFilters.length ? productFilters : [{ id: '__no-product-reference__' }] },
    select: { id: true, externalId: true, title: true, quantity: true, metadata: true },
  });
  const lots = products.length
    ? await transaction.productLot.findMany({
      where: { productId: { in: products.map((product) => product.id) }, quantity: { gt: 0 } },
      orderBy: [{ expiry: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, productId: true, lotCode: true, quantity: true, expiry: true, createdAt: true },
    })
    : [];
  const plan = planFefoAllocations({
    items: order.items,
    products,
    lots,
    today,
  });
  if (plan.error) return { error: plan.error };

  await transaction.inventoryOrderFulfillment.create({ data: { orderId: order.id, actor } });
  for (const allocation of plan.allocations) {
    const quantity = allocation.quantityMilliUnits / 1000;
    const updatedLot = await transaction.productLot.updateMany({
      where: { id: allocation.lotId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (updatedLot.count !== 1) throw new Error('O saldo de um lote mudou durante a separação do pedido.');
  }
  if (plan.allocations.length) {
    await transaction.inventoryLotAllocation.createMany({
      data: plan.allocations.map((allocation) => ({
        orderId: order.id,
        orderItemIndex: allocation.orderItemIndex,
        lotId: allocation.lotId,
        productId: allocation.productId,
        productTitle: allocation.productTitle,
        lotCode: allocation.lotCode || null,
        quantity: allocation.quantityMilliUnits / 1000,
      })),
    });
  }

  for (const productId of plan.requiredByProduct.keys()) {
    const product = products.find((entry) => entry.id === productId);
    if (!product) continue;
    const updatedProduct = await reconcileProductInventory(transaction, productId);
    const productAllocations = plan.allocations.filter((allocation) => allocation.productId === productId);
    await transaction.productAuditLog.create({
      data: {
        productId,
        productExternalId: product.externalId,
        productTitle: product.title,
        action: 'ORDER_FULFILLMENT',
        actor,
        changes: {
          quantity: { before: Number(product.quantity), after: Number(updatedProduct.quantity) },
        },
        note: `Baixa FEFO para o pedido ${order.id}: ${productAllocations.map((allocation) => `${allocation.quantityMilliUnits / 1000} ${allocation.lotCode ? `do lote ${allocation.lotCode}` : 'sem código de lote'}`).join('; ')}.`,
      },
    });
  }
  return { alreadyAllocated: false };
}
