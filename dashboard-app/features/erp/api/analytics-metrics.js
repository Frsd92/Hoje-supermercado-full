export function summarizeProfitability({ orders, lineItems, revenue }) {
  const ordersWithoutItems = orders.filter((order) => !order.items.length && Number(order.totalAmount) > 0).length;
  const missingCostItems = lineItems.filter((item) => !item.costKnown).length + ordersWithoutItems;
  const cmv = lineItems.reduce((sum, item) => sum + (item.costKnown ? Number(item.cost) || 0 : 0), 0);
  const available = orders.length > 0 && lineItems.length > 0 && missingCostItems === 0;

  return {
    available,
    grossProfit: available ? revenue - cmv : null,
    margin: available && revenue ? ((revenue - cmv) / revenue) * 100 : null,
    cmv: available ? cmv : null,
    missingCostItems,
    knownCostItems: lineItems.filter((item) => item.costKnown).length,
    totalItems: lineItems.length,
  };
}
