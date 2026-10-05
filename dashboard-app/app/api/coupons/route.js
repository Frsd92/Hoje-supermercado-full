import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getCouponRecipientStatus } from '@/features/coupons/coupon-reporting';

export async function GET(request) {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || '').trim().toLowerCase();
  if (!email) return Response.json({ error: 'Login necessário.' }, { status: 401 });

  try {
    const includeHistory = new URL(request.url).searchParams.get('history') === '1';
    const now = new Date();
    const campaigns = await prisma.couponCampaign.findMany({
      where: {
        recipients: { some: { email } },
      },
      select: {
        code: true,
        discountPercent: true,
        expiresAt: true,
        createdAt: true,
        message: true,
        redemptions: { where: { email }, select: { createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const codes = campaigns.map((campaign) => campaign.code);
    const usedOrders = codes.length
      ? await prisma.order.findMany({
        where: { customerEmail: email, couponCode: { in: codes } },
        select: { couponCode: true, createdAt: true, status: true },
        orderBy: { createdAt: 'desc' },
      })
      : [];
    const latestOrderByCode = new Map();
    usedOrders.forEach((order) => {
      const code = String(order.couponCode || '').trim().toUpperCase();
      if (code && !latestOrderByCode.has(code)) latestOrderByCode.set(code, order);
    });
    const coupons = campaigns.map((campaign) => {
      const redemption = campaign.redemptions[0] || null;
      const order = latestOrderByCode.get(campaign.code) || null;
      return {
        code: campaign.code,
        discountPercent: campaign.discountPercent,
        expiresAt: campaign.expiresAt,
        createdAt: campaign.createdAt,
        message: campaign.message,
        status: getCouponRecipientStatus(campaign.expiresAt, redemption || order, now),
        redeemedAt: redemption?.createdAt || order?.createdAt || null,
      };
    });
    return Response.json({ coupons: includeHistory ? coupons : coupons.filter((coupon) => coupon.status === 'available') });
  } catch (error) {
    console.error('Não foi possível carregar os cupons do cliente:', error);
    return Response.json({ error: 'Não foi possível carregar seus cupons agora.' }, { status: 500 });
  }
}
