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

export function isRealizedCouponOrder(order) {
  if (!order) return false;
  return order.status !== 'Cancelado'
    && !['pending', 'failed', 'canceled'].includes(String(order.paymentStatus || '').toLowerCase());
}

function isProcessingCouponOrder(order) {
  if (!order) return false;
  return String(order.paymentStatus || '').toLowerCase() === 'pending' && order.status !== 'Cancelado';
}

function getNetRevenue(order) {
  const total = Math.max(0, parseMoney(order.total));
  const refundedAmount = Math.min(total, Math.max(0, parseMoney(order.refundedAmount)));
  return roundMoney(total - refundedAmount);
}

export function getCouponRecipientStatus(expiresAt, redemption, now = new Date()) {
  if (redemption) {
    if (isProcessingCouponOrder(redemption)) return 'processing';
    if (isRealizedCouponOrder(redemption)) return 'redeemed';
  }

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
  const realizedOrders = campaignOrders.filter(isRealizedCouponOrder);
  const displayableOrders = campaignOrders.filter((order) => (
    isRealizedCouponOrder(order) || isProcessingCouponOrder(order)
  ));
  const allOrdersById = new Map(campaignOrders.map((order) => [String(order.id), order]));

  (Array.isArray(campaign.redemptions) ? campaign.redemptions : []).forEach((redemption) => {
    const email = normalizeEmail(redemption.email);
    const linkedOrder = allOrdersById.get(String(redemption.orderId));
    const validOrder = !linkedOrder || isRealizedCouponOrder(linkedOrder) || isProcessingCouponOrder(linkedOrder);
    if (email && validOrder && !redemptionsByEmail.has(email)) {
      redemptionsByEmail.set(email, {
        ...redemption,
        ...(linkedOrder ? { status: linkedOrder.status, paymentStatus: linkedOrder.paymentStatus } : {}),
      });
    }
  });
  displayableOrders.forEach((order) => {
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
      orderTotal: isRealizedCouponOrder(order) ? roundMoney(parseMoney(order.total)) : null,
      discountAmount: isRealizedCouponOrder(order) ? roundMoney(parseMoney(order.couponDiscountAmount)) : null,
    };
  });

  const recipientsCount = recipientStatuses.length;
  const redeemedCount = recipientStatuses.filter((recipient) => recipient.status === 'redeemed').length;
  const processingCount = recipientStatuses.filter((recipient) => recipient.status === 'processing').length;
  const availableCount = recipientStatuses.filter((recipient) => recipient.status === 'available').length;
  const expiredCount = recipientStatuses.filter((recipient) => recipient.status === 'expired').length;
  const activeOrders = realizedOrders;
  const cancelledOrders = campaignOrders.filter((order) => (
    order.status === 'Cancelado' || ['failed', 'canceled'].includes(String(order.paymentStatus || '').toLowerCase())
  ));
  const revenue = activeOrders.reduce((sum, order) => sum + getNetRevenue(order), 0);
  const discountGiven = activeOrders.reduce((sum, order) => sum + parseMoney(order.couponDiscountAmount), 0);
  const campaignStatus = expiresAt.getTime() <= now.getTime()
    ? 'expired'
    : recipientsCount > 0 && availableCount === 0 && processingCount === 0
      ? 'fully_redeemed'
      : 'active';

  return {
    id: campaign.id,
    code,
    discountPercent: Number(campaign.discountPercent),
    minimumOrderAmount: roundMoney(Math.max(0, parseMoney(campaign.minimumOrderAmount))),
    message: campaign.message,
    createdAt: campaign.createdAt,
    expiresAt,
    status: campaignStatus,
    recipientsCount,
    redeemedCount,
    processingCount,
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
