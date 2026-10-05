function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;

  let normalized = String(value).trim().replace(/[^0-9,.-]/g, '');
  if (normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function roundMoney(value) {
  return Number(value.toFixed(2));
}

function dateTime(value) {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function getCouponRecipientStatus(expiresAt, redemption, now = new Date()) {
  if (redemption) return 'redeemed';

  const expiryTime = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  return Number.isFinite(expiryTime) && expiryTime > now.getTime() ? 'available' : 'expired';
}

export function summarizeCouponCampaign(campaign, sourceOrders = [], now = new Date()) {
  const code = String(campaign.code || '').trim().toUpperCase();
  const redemptionsByEmail = new Map();
  const ordersById = new Map();
  const ordersByEmail = new Map();
  const campaignOrders = (Array.isArray(sourceOrders) ? sourceOrders : [])
    .filter((order) => String(order.couponCode || '').trim().toUpperCase() === code);

  (Array.isArray(campaign.redemptions) ? campaign.redemptions : []).forEach((redemption) => {
    const email = normalizeEmail(redemption.email);
    if (email && !redemptionsByEmail.has(email)) redemptionsByEmail.set(email, redemption);
  });
  campaignOrders.forEach((order) => {
    ordersById.set(String(order.id), order);
    const email = normalizeEmail(order.customerEmail);
    if (!email) return;
    const customerOrders = ordersByEmail.get(email) || [];
    customerOrders.push(order);
    ordersByEmail.set(email, customerOrders);
  });
  ordersByEmail.forEach((orders) => {
    orders.sort((first, second) => dateTime(second.createdAt) - dateTime(first.createdAt));
  });

  const expiresAt = campaign.expiresAt instanceof Date ? campaign.expiresAt : new Date(campaign.expiresAt);
  const recipientStatuses = (Array.isArray(campaign.recipients) ? campaign.recipients : []).map((recipient) => {
    const email = normalizeEmail(recipient.email);
    const redemption = redemptionsByEmail.get(email) || null;
    const order = (redemption && ordersById.get(String(redemption.orderId)))
      || ordersByEmail.get(email)?.[0]
      || null;
    const status = getCouponRecipientStatus(expiresAt, redemption || order, now);
    return {
      email,
      status,
      redeemedAt: redemption?.createdAt || order?.createdAt || null,
      orderId: redemption?.orderId || order?.id || null,
      orderStatus: order?.status || null,
      orderTotal: order && order.status !== 'Cancelado' ? roundMoney(parseMoney(order.total)) : null,
      discountAmount: order && order.status !== 'Cancelado' ? roundMoney(parseMoney(order.couponDiscountAmount)) : null,
    };
  });

  const recipientsCount = recipientStatuses.length;
  const redeemedCount = recipientStatuses.filter((recipient) => recipient.status === 'redeemed').length;
  const availableCount = recipientStatuses.filter((recipient) => recipient.status === 'available').length;
  const expiredCount = recipientStatuses.filter((recipient) => recipient.status === 'expired').length;
  const activeOrders = campaignOrders.filter((order) => order.status !== 'Cancelado');
  const cancelledOrders = campaignOrders.filter((order) => order.status === 'Cancelado');
  const revenue = activeOrders.reduce((sum, order) => sum + parseMoney(order.total), 0);
  const discountGiven = activeOrders.reduce((sum, order) => sum + parseMoney(order.couponDiscountAmount), 0);
  const campaignStatus = expiresAt.getTime() <= now.getTime()
    ? 'expired'
    : recipientsCount > 0 && availableCount === 0
      ? 'fully_redeemed'
      : 'active';

  return {
    id: campaign.id,
    code,
    discountPercent: Number(campaign.discountPercent),
    message: campaign.message,
    createdAt: campaign.createdAt,
    expiresAt,
    status: campaignStatus,
    recipientsCount,
    redeemedCount,
    availableCount,
    expiredCount,
    redemptionRate: recipientsCount ? Number((redeemedCount / recipientsCount * 100).toFixed(1)) : 0,
    ordersCount: activeOrders.length,
    cancelledOrdersCount: cancelledOrders.length,
    revenue: roundMoney(revenue),
    discountGiven: roundMoney(discountGiven),
    recipientEmails: recipientStatuses.map((recipient) => recipient.email),
    recipientStatuses,
  };
}
