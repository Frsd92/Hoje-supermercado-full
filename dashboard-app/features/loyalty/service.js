import { randomUUID } from 'node:crypto';
import {
  allocateLoyaltyMissionPoints,
  getLoyaltyMissionCycle,
  getLoyaltyOrderContribution,
  getLoyaltyPointExpiryAt,
  isLoyaltyMissionComplete,
  isLoyaltyPaymentStatusEligible,
  parseLoyaltyMoney,
} from './mission-rules.js';
import {
  calculateLoyaltyPointBalance,
  getRefundAdjustedAwardPoints,
  getUpcomingLoyaltyPointExpiry,
  planLoyaltyPointRedemption,
} from './point-balance.js';
import { getCouponRecipientStatus } from '../coupons/coupon-reporting.js';
import { getCouponBenefitLabel } from '../coupons/coupon-benefits.js';

const dayMs = 24 * 60 * 60 * 1000;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getRewardCooldownState(redemption, now) {
  if (!redemption) {
    return { cooldownDays: 0, cooldownActive: false, daysRemaining: 0, availableAgainAt: null };
  }
  const cooldownDays = Number(redemption.cooldownDays);
  const createdAt = new Date(redemption.createdAt);
  const nowAt = new Date(now);
  if (!Number.isInteger(cooldownDays) || cooldownDays < 0
    || !Number.isFinite(createdAt.getTime()) || !Number.isFinite(nowAt.getTime())) {
    throw new TypeError('Os dados do intervalo de resgate são inválidos.');
  }
  if (cooldownDays === 0) {
    return { cooldownDays, cooldownActive: false, daysRemaining: 0, availableAgainAt: null };
  }
  const availableAgainAt = new Date(createdAt.getTime() + cooldownDays * dayMs);
  const cooldownActive = nowAt < availableAgainAt;
  return {
    cooldownDays,
    cooldownActive,
    daysRemaining: cooldownActive ? Math.ceil((availableAgainAt.getTime() - nowAt.getTime()) / dayMs) : 0,
    availableAgainAt,
  };
}

function amountString(value) {
  return Number(value).toFixed(2);
}

function missionProgressKey(missionId, email, cycleStartAt) {
  return { missionId_customerEmail_cycleStartAt: { missionId, customerEmail: email, cycleStartAt } };
}

async function getPreviousCompletedPurchaseCount(transaction, order, email) {
  return transaction.order.count({
    where: {
      id: { not: order.id },
      customerEmail: { equals: email, mode: 'insensitive' },
      status: 'Concluido',
      paymentStatus: { in: ['manual', 'paid', 'partially_refunded'] },
    },
  });
}

export async function awardCompletedOrderMissions(transaction, orderId) {
  const order = await transaction.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      customerEmail: true,
      status: true,
      paymentStatus: true,
      total: true,
      subtotal: true,
      refundedAmount: true,
      updatedAt: true,
      items: {
        select: {
          price: true,
          quantity: true,
          product: { select: { categories: true } },
        },
      },
    },
  });
  if (!order) throw new Error('O pedido concluído não foi encontrado para avaliar as missões.');
  const email = normalizeEmail(order.customerEmail);
  if (!email || order.status !== 'Concluido' || !isLoyaltyPaymentStatusEligible(order.paymentStatus)) {
    return [];
  }

  const completedAt = new Date(order.updatedAt);
  const missions = await transaction.loyaltyMission.findMany({
    where: {
      status: 'active',
      startsAt: { lte: completedAt },
      OR: [{ endsAt: null }, { endsAt: { gt: completedAt } }],
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      ruleType: true,
      targetAmount: true,
      targetCount: true,
      category: true,
      pointsReward: true,
      rewardLimit: true,
      claimedRewards: true,
      recurrence: true,
      recurrenceDays: true,
      startsAt: true,
      endsAt: true,
      pointsExpiryPolicy: true,
      pointsExpiryDays: true,
      pointsExpireAt: true,
    },
  });
  if (!missions.length) return [];

  let previousPurchaseCount = null;
  const completedMissionIds = [];
  for (const mission of missions) {
    const latestProgress = mission.recurrence === 'after_days'
      ? await transaction.loyaltyMissionProgress.findFirst({
        where: { missionId: mission.id, customerEmail: email },
        orderBy: { cycleStartAt: 'desc' },
      })
      : null;
    const cycle = getLoyaltyMissionCycle(mission, completedAt, latestProgress);
    if (!cycle) continue;
    if (cycle.cooldownActive) continue;

    const progressWhere = missionProgressKey(mission.id, email, cycle.cycleStartAt);
    const existingProgress = await transaction.loyaltyMissionProgress.findUnique({
      where: progressWhere,
    });
    if (existingProgress?.completedAt) continue;

    if (mission.ruleType === 'FIRST_PURCHASE') {
      if (previousPurchaseCount === null) {
        previousPurchaseCount = await getPreviousCompletedPurchaseCount(transaction, order, email);
      }
    }
    const contribution = getLoyaltyOrderContribution(
      order,
      mission,
      mission.ruleType === 'FIRST_PURCHASE' ? previousPurchaseCount : 0,
    );
    if (!contribution) continue;

    const currentCount = existingProgress?.progressCount || 0;
    const currentAmount = parseLoyaltyMoney(existingProgress?.progressAmount || 0);
    const projectedProgress = {
      progressCount: currentCount + contribution.contributionCount,
      progressAmount: Number((currentAmount + contribution.contributionAmount).toFixed(2)),
    };
    const completesMission = isLoyaltyMissionComplete(mission, projectedProgress);
    if (completesMission) {
      const claimWhere = { id: mission.id, status: 'active' };
      if (mission.rewardLimit !== null) claimWhere.claimedRewards = { lt: mission.rewardLimit };
      const claim = await transaction.loyaltyMission.updateMany({
        where: claimWhere,
        data: { claimedRewards: { increment: 1 }, updatedBy: 'Sistema (concessão de missão)' },
      });
      if (claim.count !== 1) continue;
    }

    const progress = await transaction.loyaltyMissionProgress.upsert({
      where: progressWhere,
      create: {
        missionId: mission.id,
        customerEmail: email,
        cycleStartAt: cycle.cycleStartAt,
        cycleEndAt: cycle.cycleEndAt,
      },
      update: {},
    });
    if (progress.completedAt) {
      if (completesMission) {
        await transaction.loyaltyMission.update({
          where: { id: mission.id },
          data: { claimedRewards: { decrement: 1 }, updatedBy: 'Sistema (concessão de missão)' },
        });
      }
      continue;
    }

    const insertedContribution = await transaction.loyaltyMissionContribution.createMany({
      data: [{
        missionId: mission.id,
        progressId: progress.id,
        orderId: order.id,
        contributionAmount: amountString(contribution.contributionAmount),
        contributionCount: contribution.contributionCount,
      }],
      skipDuplicates: true,
    });
    if (insertedContribution.count !== 1) {
      if (completesMission) {
        await transaction.loyaltyMission.update({
          where: { id: mission.id },
          data: { claimedRewards: { decrement: 1 }, updatedBy: 'Sistema (concessão de missão)' },
        });
      }
      continue;
    }

    const updatedProgress = await transaction.loyaltyMissionProgress.update({
      where: { id: progress.id },
      data: {
        progressCount: { increment: contribution.contributionCount },
        progressAmount: { increment: amountString(contribution.contributionAmount) },
      },
    });
    if (!completesMission) continue;

    const completedCycleEndAt = mission.recurrence === 'after_days'
      ? new Date(Math.min(
        completedAt.getTime() + Number(mission.recurrenceDays) * dayMs,
        mission.endsAt ? new Date(mission.endsAt).getTime() : Number.POSITIVE_INFINITY,
      ))
      : cycle.cycleEndAt;
    const expiryAt = getLoyaltyPointExpiryAt(mission, completedCycleEndAt, completedAt);
    await transaction.loyaltyMissionProgress.update({
      where: { id: updatedProgress.id },
      data: {
        completedAt,
        pointsAwarded: mission.pointsReward,
        ...(mission.recurrence === 'after_days' ? { cycleEndAt: completedCycleEndAt } : {}),
      },
    });
    const contributions = await transaction.loyaltyMissionContribution.findMany({
      where: { progressId: updatedProgress.id },
      select: { orderId: true, contributionAmount: true, contributionCount: true },
      orderBy: { contributedAt: 'asc' },
    });
    const awards = allocateLoyaltyMissionPoints(mission.pointsReward, contributions, mission.ruleType);
    await transaction.loyaltyPointEntry.createMany({
      data: awards.map((award) => ({
        id: randomUUID(),
        customerEmail: email,
        type: 'MISSION_AWARD',
        points: award.points,
        description: `Missão concluída: ${mission.name}`,
        missionId: mission.id,
        progressId: updatedProgress.id,
        sourceOrderId: award.orderId,
        expiresAt: expiryAt,
      })),
    });
    completedMissionIds.push(mission.id);
  }
  return completedMissionIds;
}

async function getCustomerPointEntries(transaction, email) {
  return transaction.loyaltyPointEntry.findMany({
    where: { customerEmail: email },
    select: {
      id: true,
      type: true,
      points: true,
      description: true,
      createdAt: true,
      expiresAt: true,
      mission: { select: { name: true } },
      sourceOrder: { select: { total: true, refundedAmount: true, status: true, paymentStatus: true } },
      rewardRedemption: {
        select: {
          createdAt: true,
          cooldownDays: true,
          reward: { select: { id: true, name: true } },
          couponCampaign: {
            select: {
              id: true,
              code: true,
              expiresAt: true,
              discountPercent: true,
              discountAmount: true,
              maximumDiscountAmount: true,
              benefitType: true,
              minimumOrderAmount: true,
            },
          },
        },
      },
      awardsAllocations: { select: { points: true } },
      spendsAllocations: { select: { points: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getCustomerLoyaltySnapshot(transaction, customerEmail, now = new Date()) {
  const email = normalizeEmail(customerEmail);
  if (!email) throw new TypeError('O cliente não possui um e-mail válido.');

  const missions = await transaction.loyaltyMission.findMany({
    where: {
      status: 'active',
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    orderBy: [{ recurrence: 'desc' }, { startsAt: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      ruleType: true,
      targetAmount: true,
      targetCount: true,
      category: true,
      destinationPath: true,
      pointsReward: true,
      recurrence: true,
      recurrenceDays: true,
      startsAt: true,
      endsAt: true,
      pointsExpiryPolicy: true,
      rewardLimit: true,
      claimedRewards: true,
      imageContentType: true,
      updatedAt: true,
    },
  });
  const repeatableMissionIds = missions
    .filter((mission) => mission.recurrence === 'after_days')
    .map((mission) => mission.id);
  const latestProgressRows = repeatableMissionIds.length
    ? await transaction.loyaltyMissionProgress.findMany({
      where: { customerEmail: email, missionId: { in: repeatableMissionIds } },
      orderBy: { cycleStartAt: 'desc' },
    })
    : [];
  const latestProgressByMissionId = new Map();
  for (const progress of latestProgressRows) {
    if (!latestProgressByMissionId.has(progress.missionId)) {
      latestProgressByMissionId.set(progress.missionId, progress);
    }
  }
  const missionWindows = missions
    .map((mission) => ({
      mission,
      latestProgress: latestProgressByMissionId.get(mission.id) || null,
      cycle: getLoyaltyMissionCycle(mission, now, latestProgressByMissionId.get(mission.id)),
    }))
    .filter(({ cycle }) => Boolean(cycle));
  const progressRows = missionWindows.length
    ? await transaction.loyaltyMissionProgress.findMany({
      where: {
        customerEmail: email,
        OR: missionWindows.map(({ mission, cycle }) => ({
          missionId: mission.id,
          cycleStartAt: cycle.cycleStartAt,
        })),
      },
    })
    : [];
  const progressByKey = new Map(progressRows.map((progress) => [
    `${progress.missionId}:${progress.cycleStartAt.toISOString()}`,
    progress,
  ]));
  const pointEntries = await getCustomerPointEntries(transaction, email);
  const balance = calculateLoyaltyPointBalance(pointEntries, now);
  const expiringPoints = getUpcomingLoyaltyPointExpiry(pointEntries, now);
  const latestRewardRedemptionById = new Map();
  for (const entry of pointEntries) {
    const redemption = entry.rewardRedemption;
    const rewardId = redemption?.reward?.id;
    if (!rewardId) continue;
    const previous = latestRewardRedemptionById.get(rewardId);
    if (!previous || redemption.createdAt > previous.createdAt) {
      latestRewardRedemptionById.set(rewardId, redemption);
    }
  }
  const recentCoupons = pointEntries.slice(0, 50)
    .map((entry) => entry.rewardRedemption?.couponCampaign)
    .filter(Boolean);
  const couponCampaignIds = [...new Set(recentCoupons.map((campaign) => campaign.id))];
  const couponRedemptions = couponCampaignIds.length
    ? await transaction.couponRedemption.findMany({
      where: { campaignId: { in: couponCampaignIds }, email },
      select: { campaignId: true, orderId: true, createdAt: true },
    })
    : [];
  const couponRedemptionsByCampaignId = new Map(
    couponRedemptions.map((redemption) => [redemption.campaignId, redemption]),
  );
  const couponOrderIds = [...new Set(couponRedemptions.map((redemption) => redemption.orderId).filter(Boolean))];
  const couponOrders = couponOrderIds.length
    ? await transaction.order.findMany({
      where: { id: { in: couponOrderIds } },
      select: { id: true, status: true, paymentStatus: true },
    })
    : [];
  const couponOrdersById = new Map(couponOrders.map((order) => [order.id, order]));
  const rewards = await transaction.loyaltyReward.findMany({
    where: { active: true },
    include: { _count: { select: { redemptions: true } } },
    orderBy: [{ pointsCost: 'asc' }, { createdAt: 'asc' }],
  });

  return {
    balance,
    expiringPoints,
    missions: missionWindows.map(({ mission, latestProgress, cycle }) => {
      const progress = cycle.cooldownActive
        ? latestProgress
        : progressByKey.get(`${mission.id}:${cycle.cycleStartAt.toISOString()}`);
      const cooldownActive = Boolean(cycle.cooldownActive
        && (mission.rewardLimit === null || mission.claimedRewards < mission.rewardLimit));
      return {
        id: mission.id,
        name: mission.name,
        description: mission.description,
        imageUrl: mission.imageContentType
          ? `/api/loyalty/missions/${encodeURIComponent(mission.id)}/image?v=${mission.updatedAt.getTime()}`
          : '',
        ruleType: mission.ruleType,
        targetAmount: Number(mission.targetAmount),
        targetCount: mission.targetCount,
        category: mission.category,
        destinationPath: mission.destinationPath,
        pointsReward: mission.pointsReward,
        recurrence: mission.recurrence,
        recurrenceDays: mission.recurrenceDays,
        cycleStartAt: cycle.cycleStartAt.toISOString(),
        cycleEndAt: (cycle.cooldownActive && progress?.cycleEndAt
          ? progress.cycleEndAt
          : cycle.cycleEndAt).toISOString(),
        cooldownActive,
        availableAgainAt: cooldownActive ? cycle.cycleStartAt.toISOString() : null,
        cooldownDaysRemaining: cooldownActive ? cycle.cooldownDaysRemaining || 0 : 0,
        pointsExpiryPolicy: mission.pointsExpiryPolicy,
        progressCount: progress?.progressCount || 0,
        progressAmount: Number(progress?.progressAmount || 0),
        completedAt: progress?.completedAt?.toISOString() || null,
        pointsAwarded: progress?.pointsAwarded || 0,
        rewardLimit: mission.rewardLimit,
        remainingRewards: mission.rewardLimit === null
          ? null
          : Math.max(0, mission.rewardLimit - mission.claimedRewards),
        soldOut: mission.rewardLimit !== null && mission.claimedRewards >= mission.rewardLimit,
      };
    }),
    rewards: rewards.map((reward) => ({
      id: reward.id,
      name: reward.name,
      description: reward.description,
      pointsCost: reward.pointsCost,
      discountPercent: reward.discountPercent,
      discountAmount: Number(reward.discountAmount) || 0,
      maximumDiscountAmount: Number(reward.maximumDiscountAmount) || null,
      benefitType: reward.benefitType || 'PERCENTAGE',
      minimumOrderAmount: Number(reward.minimumOrderAmount),
      validityDays: reward.validityDays,
      redemptions: reward._count.redemptions,
      ...getRewardCooldownState(latestRewardRedemptionById.get(reward.id), now),
      cooldownDays: Number(reward.cooldownDays) || 0,
    })),
    history: pointEntries.slice(0, 50).map((entry) => {
      const points = entry.type === 'MISSION_AWARD'
        ? getRefundAdjustedAwardPoints(entry)
        : entry.points;
      const campaign = entry.rewardRedemption?.couponCampaign;
      const couponRedemption = campaign ? couponRedemptionsByCampaignId.get(campaign.id) || null : null;
      const order = couponRedemption ? couponOrdersById.get(couponRedemption.orderId) : null;
      const rewardId = entry.rewardRedemption?.reward?.id;
      const rewardCooldown = rewardId
        ? getRewardCooldownState(latestRewardRedemptionById.get(rewardId), now)
        : null;
      return {
        id: entry.id,
        type: entry.type,
        points,
        description: entry.description,
        createdAt: entry.createdAt.toISOString(),
        expiresAt: entry.expiresAt?.toISOString() || null,
        expired: Boolean(entry.expiresAt && entry.expiresAt <= now),
        couponCode: campaign?.code || null,
        coupon: campaign ? {
          code: campaign.code,
          expiresAt: campaign.expiresAt.toISOString(),
          benefitType: campaign.benefitType || 'PERCENTAGE',
          discountPercent: campaign.discountPercent,
          discountAmount: Number(campaign.discountAmount) || 0,
          maximumDiscountAmount: Number(campaign.maximumDiscountAmount) || null,
          minimumOrderAmount: Number(campaign.minimumOrderAmount) || 0,
          rewardCooldownDays: rewardCooldown?.cooldownDays || 0,
          daysUntilRedeemAgain: rewardCooldown?.daysRemaining || 0,
          redeemAgainAt: rewardCooldown?.availableAgainAt?.toISOString() || null,
          status: getCouponRecipientStatus(
            campaign.expiresAt,
            couponRedemption
              ? { ...couponRedemption, ...(order ? { ...order, createdAt: couponRedemption.createdAt } : {}) }
              : null,
            now,
          ),
        } : null,
      };
    }),
  };
}

export async function getLoyaltyAdminSnapshot(transaction) {
  const [missions, rewards, progress] = await Promise.all([
    transaction.loyaltyMission.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        description: true,
        ruleType: true,
        targetAmount: true,
        targetCount: true,
        category: true,
        destinationPath: true,
        pointsReward: true,
        rewardLimit: true,
        claimedRewards: true,
        recurrence: true,
        recurrenceDays: true,
        startsAt: true,
        endsAt: true,
        pointsExpiryPolicy: true,
        pointsExpiryDays: true,
        pointsExpireAt: true,
        status: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        imageContentType: true,
      },
    }),
    transaction.loyaltyReward.findMany({
      include: { _count: { select: { redemptions: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    transaction.loyaltyMissionProgress.findMany({
      select: { missionId: true, customerEmail: true, pointsAwarded: true, completedAt: true },
    }),
  ]);
  const missionStats = new Map();
  progress.forEach((record) => {
    const stats = missionStats.get(record.missionId) || { participants: new Set(), completions: 0, pointsAwarded: 0 };
    stats.participants.add(record.customerEmail);
    if (record.completedAt) {
      stats.completions += 1;
      stats.pointsAwarded += record.pointsAwarded;
    }
    missionStats.set(record.missionId, stats);
  });

  return {
    missions: missions.map((mission) => {
      const stats = missionStats.get(mission.id) || { participants: new Set(), completions: 0, pointsAwarded: 0 };
      const { imageContentType, ...missionFields } = mission;
      return {
        ...missionFields,
        targetAmount: Number(mission.targetAmount),
        imageUrl: imageContentType
          ? `/api/loyalty/missions/${encodeURIComponent(mission.id)}/image?v=${mission.updatedAt.getTime()}`
          : '',
        participants: stats.participants.size,
        completions: stats.completions,
        pointsAwarded: stats.pointsAwarded,
      };
    }),
    rewards: rewards.map((reward) => ({
      ...reward,
      minimumOrderAmount: Number(reward.minimumOrderAmount),
      redemptions: reward._count.redemptions,
    })),
  };
}

export async function redeemLoyaltyReward(transaction, { customerEmail, rewardId, requestId, now = new Date() }) {
  const email = normalizeEmail(customerEmail);
  const existing = await transaction.loyaltyRewardRedemption.findUnique({
    where: { requestId },
    include: { couponCampaign: { select: {
      code: true,
      discountPercent: true,
      discountAmount: true,
      maximumDiscountAmount: true,
      benefitType: true,
      minimumOrderAmount: true,
      expiresAt: true,
    } } },
  });
  if (existing) {
    if (normalizeEmail(existing.customerEmail) !== email || existing.rewardId !== rewardId) {
      return { error: 'Esta solicitação de resgate já foi usada.', status: 409 };
    }
    return {
      redemption: {
        code: existing.couponCampaign.code,
        discountPercent: existing.couponCampaign.discountPercent,
        discountAmount: Number(existing.couponCampaign.discountAmount) || 0,
        maximumDiscountAmount: Number(existing.couponCampaign.maximumDiscountAmount) || null,
        benefitType: existing.couponCampaign.benefitType || 'PERCENTAGE',
        minimumOrderAmount: Number(existing.couponCampaign.minimumOrderAmount),
        expiresAt: existing.couponCampaign.expiresAt.toISOString(),
        pointsCost: existing.pointsCost,
        cooldownDays: Number(existing.cooldownDays) || 0,
        redeemAgainAt: getRewardCooldownState(existing, now).availableAgainAt?.toISOString() || null,
      },
      replayed: true,
    };
  }

  const reward = await transaction.loyaltyReward.findUnique({ where: { id: rewardId } });
  if (!reward || !reward.active) return { error: 'Esta recompensa não está disponível.', status: 404 };
  const previousRedemption = await transaction.loyaltyRewardRedemption.findFirst({
    where: { customerEmail: email, rewardId },
    orderBy: { createdAt: 'desc' },
  });
  const cooldown = getRewardCooldownState(previousRedemption, now);
  if (cooldown.cooldownActive) {
    const availableDate = cooldown.availableAgainAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    return {
      error: `Você poderá trocar esta recompensa novamente em ${cooldown.daysRemaining} dia(s), a partir de ${availableDate}.`,
      status: 409,
    };
  }
  const entries = await getCustomerPointEntries(transaction, email);
  const balance = calculateLoyaltyPointBalance(entries, now);
  if (balance < reward.pointsCost) {
    return {
      error: balance < 0
        ? `Seu saldo está em ${balance} pontos por causa de um estorno. Os próximos pontos ganhos compensarão essa diferença.`
        : `Você precisa de ${reward.pointsCost - balance} ponto(s) a mais para resgatar esta recompensa.`,
      status: 409,
    };
  }
  const allocations = planLoyaltyPointRedemption(entries, reward.pointsCost, now);
  if (!allocations) throw new Error('O saldo de pontos mudou durante o planejamento do resgate.');

  const expiresAt = new Date(now.getTime() + reward.validityDays * 24 * 60 * 60 * 1000);
  const redemptionId = randomUUID();
  const campaignId = `CPN-${redemptionId}`;
  const code = `PNT${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
  const minimumOrderAmount = Number(reward.minimumOrderAmount);
  const minOrderCopy = minimumOrderAmount > 0
    ? ` Pedido mínimo: R$ ${minimumOrderAmount.toFixed(2).replace('.', ',')}.`
    : '';
  const benefitType = reward.benefitType || 'PERCENTAGE';
  const discountAmount = Number(reward.discountAmount) || 0;
  const maximumDiscountAmount = Number(reward.maximumDiscountAmount) || null;
  const benefitLabel = getCouponBenefitLabel(
    benefitType,
    reward.discountPercent,
    discountAmount,
    maximumDiscountAmount,
  );
  const expiresAtLabel = expiresAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const couponMessage = `Recompensa resgatada: ${reward.name}. Use ${code} para obter ${benefitLabel}.${minOrderCopy} Válido até ${expiresAtLabel}.`;
  const campaign = await transaction.couponCampaign.create({
    data: {
      id: campaignId,
      code,
      discountPercent: reward.discountPercent,
      discountAmount: reward.discountAmount,
      maximumDiscountAmount: reward.maximumDiscountAmount,
      benefitType,
      minimumOrderAmount: reward.minimumOrderAmount,
      message: couponMessage,
      expiresAt,
      createdBy: 'Programa de pontos Hoje',
      recipients: { create: [{ email }] },
    },
  });
  const redemption = await transaction.loyaltyRewardRedemption.create({
    data: {
      id: redemptionId,
      requestId,
      customerEmail: email,
      rewardId: reward.id,
      couponCampaignId: campaign.id,
      pointsCost: reward.pointsCost,
      cooldownDays: Number(reward.cooldownDays) || 0,
    },
  });
  const redemptionEntry = await transaction.loyaltyPointEntry.create({
    data: {
      customerEmail: email,
      type: 'REDEMPTION',
      points: -reward.pointsCost,
      description: `Resgate: ${reward.name}`,
      rewardRedemptionId: redemption.id,
    },
  });
  await transaction.loyaltyPointAllocation.createMany({
    data: allocations.map((allocation) => ({
      redemptionEntryId: redemptionEntry.id,
      awardEntryId: allocation.awardEntryId,
      points: allocation.points,
    })),
  });

  return {
    redemption: {
      code: campaign.code,
      discountPercent: campaign.discountPercent,
      discountAmount: Number(campaign.discountAmount) || 0,
      maximumDiscountAmount: Number(campaign.maximumDiscountAmount) || null,
      benefitType,
      minimumOrderAmount: Number(campaign.minimumOrderAmount),
      expiresAt: campaign.expiresAt.toISOString(),
      pointsCost: reward.pointsCost,
      cooldownDays: redemption.cooldownDays,
      redeemAgainAt: getRewardCooldownState(redemption, now).availableAgainAt?.toISOString() || null,
    },
    replayed: false,
  };
}
