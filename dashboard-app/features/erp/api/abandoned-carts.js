export const abandonedCartIdleThresholdHours = 24;
const staleCartAfterMs = abandonedCartIdleThresholdHours * 60 * 60 * 1000;

function normalizedItems(items) {
  return items.map((item) => ({
    name: String(item.name || 'Produto sem nome'),
    quantity: item.saleUnit === 'Quilograma'
      ? Math.max(0.1, Math.round((Number(item.quantity) || 0.1) * 10) / 10)
      : Math.max(1, Number(item.quantity) || 1),
    saleUnit: item.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade',
  }));
}

function activityTimestamp(value) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function summarizeAbandonedCarts({
  customerCarts,
  guestCarts,
  profilesByEmail,
  customerOrdersForInsights,
  now,
}) {
  const nowTimestamp = now.getTime();
  const customers = customerCarts
    .filter((cart) => typeof cart.email === 'string' && cart.email.includes('@') && Array.isArray(cart.items) && cart.items.length > 0)
    .map((cart) => {
      const email = cart.email.trim().toLowerCase();
      const timestamp = activityTimestamp(cart.updatedAt);
      const customerOrders = customerOrdersForInsights.get(email) || [];
      return {
        type: 'customer',
        email: cart.email,
        name: profilesByEmail.get(email)?.fullName || customerOrders[0]?.customerName || cart.email,
        updatedAt: timestamp === null ? null : new Date(timestamp).toISOString(),
        stale: timestamp !== null && nowTimestamp - timestamp >= staleCartAfterMs,
        items: normalizedItems(cart.items),
      };
    });
  const visitors = guestCarts
    .filter((cart) => Array.isArray(cart.items) && cart.items.length > 0)
    .map((cart) => {
      const timestamp = activityTimestamp(cart.updatedAt);
      return {
        type: 'guest',
        email: null,
        name: 'Visitante sem cadastro',
        updatedAt: timestamp === null ? null : new Date(timestamp).toISOString(),
        stale: timestamp !== null && nowTimestamp - timestamp >= staleCartAfterMs,
        items: normalizedItems(cart.items),
      };
    });
  const allCarts = [...customers, ...visitors];
  const abandonedCarts = allCarts.filter((cart) => cart.stale);
  const abandonedCartProducts = new Map();

  abandonedCarts.forEach((cart) => cart.items.forEach((item) => {
    const current = abandonedCartProducts.get(item.name) || { label: item.name, carts: 0, quantity: 0, saleUnit: item.saleUnit };
    current.carts += 1;
    current.quantity += item.quantity;
    abandonedCartProducts.set(item.name, current);
  }));

  return {
    available: true,
    idleThresholdHours: abandonedCartIdleThresholdHours,
    total: abandonedCarts.length,
    customers: abandonedCarts.filter((cart) => cart.type === 'customer'),
    carts: abandonedCarts,
    guestCarts: abandonedCarts.filter((cart) => cart.type === 'guest').length,
    cartsWithoutActivityDate: allCarts.filter((cart) => cart.updatedAt === null).length,
    topProducts: [...abandonedCartProducts.values()]
      .sort((first, second) => second.carts - first.carts || second.quantity - first.quantity)
      .slice(0, 10),
  };
}
