import { isRealizedCouponOrder } from '../coupons/coupon-reporting.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getDateTime(value) {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function isProcessingCouponOrder(order) {
  return order
    && order.status !== 'Cancelado'
    && String(order.paymentStatus || '').toLowerCase() === 'pending';
}

function getCouponUse(campaign, email, customerOrders) {
  const matchingOrders = customerOrders
    .filter((order) => String(order.couponCode || '').trim().toUpperCase() === campaign.code.toUpperCase())
    .sort((first, second) => getDateTime(second.createdAt) - getDateTime(first.createdAt));
  const redemption = campaign.redemptions.find((item) => normalizeEmail(item.email) === email);
  const redeemedOrder = redemption
    ? matchingOrders.find((order) => order.id === redemption.orderId)
    : null;

  if (redemption && !redeemedOrder) {
    return { status: 'used', usedAt: redemption.createdAt, orderId: redemption.orderId };
  }
  if (redeemedOrder && isRealizedCouponOrder(redeemedOrder)) {
    return { status: 'used', usedAt: redeemedOrder.createdAt, orderId: redeemedOrder.id };
  }
  if (isProcessingCouponOrder(redeemedOrder)) {
    return { status: 'processing', usedAt: redeemedOrder.createdAt, orderId: redeemedOrder.id };
  }

  const latestValidOrder = matchingOrders.find((order) => (
    isRealizedCouponOrder(order)
    || isProcessingCouponOrder(order)
  ));
  if (latestValidOrder) {
    return {
      status: isProcessingCouponOrder(latestValidOrder) ? 'processing' : 'used',
      usedAt: latestValidOrder.createdAt,
      orderId: latestValidOrder.id,
    };
  }
  return null;
}

export function getCustomerCouponInsights(campaigns, customerOrders, customerEmail, now = new Date()) {
  const email = normalizeEmail(customerEmail);
  const coupons = campaigns.flatMap((campaign) => {
    const recipient = campaign.recipients.find((item) => normalizeEmail(item.email) === email);
    if (!recipient) return [];

    const use = getCouponUse(campaign, email, customerOrders);
    const status = use?.status || (getDateTime(campaign.expiresAt) > now.getTime() ? 'available' : 'expired');
    const loyaltyRedemption = campaign.loyaltyRedemption;
    return [{
      code: campaign.code,
      discountPercent: campaign.discountPercent,
      minimumOrderAmount: Number(campaign.minimumOrderAmount),
      expiresAt: campaign.expiresAt,
      status,
      usedAt: use?.usedAt || null,
      orderId: use?.orderId || null,
      source: loyaltyRedemption ? 'missões e pontos' : 'área de cupons',
      sourceDetail: loyaltyRedemption?.reward?.name || campaign.createdBy,
    }];
  }).sort((first, second) => getDateTime(second.expiresAt) - getDateTime(first.expiresAt));

  return {
    coupons,
    couponCounts: {
      available: coupons.filter((coupon) => coupon.status === 'available').length,
      expiredUnused: coupons.filter((coupon) => coupon.status === 'expired').length,
      used: coupons.filter((coupon) => coupon.status === 'used').length,
      processing: coupons.filter((coupon) => coupon.status === 'processing').length,
    },
  };
}

export function getCustomerMissionInsights(missions, progressRecords, customerEmail) {
  const email = normalizeEmail(customerEmail);
  const progressByMission = new Map(progressRecords
    .filter((progress) => normalizeEmail(progress.customerEmail) === email)
    .map((progress) => [progress.missionId, progress]));

  return missions.flatMap((mission) => {
    const progress = progressByMission.get(mission.id);
    if (!progress || progress.completedAt) return [];

    const amountRule = ['MINIMUM_SPEND', 'CATEGORY_SPEND'].includes(mission.ruleType);
    const current = amountRule ? Number(progress.progressAmount) : Number(progress.progressCount);
    const target = amountRule ? Number(mission.targetAmount) : Number(mission.targetCount);
    const percent = target > 0 ? Math.min(100, Math.max(0, current / target * 100)) : 0;
    if (current <= 0) return [];

    return [{
      id: mission.id,
      name: mission.name,
      ruleType: mission.ruleType,
      category: mission.category,
      current,
      target,
      percent,
      nearCompletion: percent >= 75,
    }];
  }).sort((first, second) => second.percent - first.percent);
}
