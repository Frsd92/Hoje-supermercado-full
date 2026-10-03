import {
  inventoryDateOnly,
  inventoryQuantityMilliUnits,
  resolveInventoryExpiry,
} from './inventory-lots.js';

function parseUnitCost(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const unitCost = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(unitCost) || unitCost < 0 || Math.abs(unitCost * 100 - Math.round(unitCost * 100)) >= 1e-8) return null;
  return unitCost;
}

export function parsePurchaseOrderReceiptItems(items) {
  if (!Array.isArray(items) || !items.length) return { error: 'Informe a ordem e os lotes recebidos.' };
  const receipts = new Map();

  for (const item of items) {
    const itemId = String(item?.itemId || '').trim();
    const unitCost = parseUnitCost(item?.unitCost);
    if (!itemId || unitCost === null || !Array.isArray(item?.lots)) {
      return { error: 'Informe lotes recebidos e um custo unitário válido para cada linha.' };
    }
    if (receipts.has(itemId)) return { error: 'Uma linha de produto foi informada mais de uma vez.' };

    const lots = [];
    let quantityMilliUnits = 0;
    for (const lot of item.lots) {
      if (lot?.quantity === null || lot?.quantity === undefined || String(lot.quantity).trim() === '') {
        return { error: 'Informe uma quantidade para cada lote recebido.' };
      }
      const quantityMilli = inventoryQuantityMilliUnits(lot.quantity);
      if (quantityMilli === null || !Number.isSafeInteger(quantityMilli)) {
        return { error: 'Informe quantidades de lote válidas, com até três casas decimais.' };
      }
      if (quantityMilli === 0) continue;

      const dates = resolveInventoryExpiry({
        expiryMode: lot?.expiryMode || 'date',
        expiry: lot?.expiry,
        manufactureDate: lot?.manufactureDate,
        shelfLifeDays: lot?.shelfLifeDays,
      });
      if (dates.error) return { error: dates.error };
      lots.push({
        lotCode: String(lot?.lotCode || '').trim(),
        expiry: inventoryDateOnly(dates.expiry),
        manufactureDate: inventoryDateOnly(dates.manufactureDate),
        shelfLifeDays: dates.shelfLifeDays,
        location: String(lot?.location || '').trim(),
        quantity: quantityMilli / 1000,
      });
      quantityMilliUnits += quantityMilli;
      if (!Number.isSafeInteger(quantityMilliUnits)) return { error: 'A quantidade total dos lotes ultrapassa o limite permitido.' };
    }
    receipts.set(itemId, { lots, quantityMilliUnits, unitCost });
  }

  if (![...receipts.values()].some((receipt) => receipt.quantityMilliUnits > 0)) {
    return { error: 'Informe ao menos uma quantidade de lote maior que zero.' };
  }
  return { receipts };
}
