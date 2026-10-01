import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || '').trim().toLowerCase();
  if (!email) return Response.json({ error: 'Login necessário.' }, { status: 401 });

  try {
    const assignedCoupons = await prisma.couponCampaign.findMany({
      where: {
        expiresAt: { gt: new Date() },
        recipients: { some: { email } },
        redemptions: { none: { email } },
      },
      select: { code: true, discountPercent: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const coupons = assignedCoupons.map((coupon) => ({
      code: coupon.code,
      discountPercent: coupon.discountPercent,
      expiresAt: coupon.expiresAt,
    }));
    return Response.json({ coupons });
  } catch (error) {
    console.error('Não foi possível carregar os cupons do cliente:', error);
    return Response.json({ error: 'Não foi possível carregar seus cupons agora.' }, { status: 500 });
  }
}
