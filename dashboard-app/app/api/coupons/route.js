import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasCustomerDashboardAccess } from '@/features/auth/access';
import { getCouponRecipientStatus, isRealizedCouponOrder } from '@/features/coupons/coupon-reporting';
import { prisma } from '@/lib/prisma';

export { GET } from '@/features/erp/api/coupons-route';

const privateNoStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0' };

function errorResponse(error, status) {
  return Response.json({ error }, { status, headers: privateNoStoreHeaders });
}

function isProcessingCouponOrder(order) {
  return String(order?.paymentStatus || '').toLowerCase() === 'pending'
    && order?.status !== 'Cancelado';
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return errorResponse('Login necessário.', 401);
  if (!hasCustomerDashboardAccess(session.user)) return errorResponse('Acesso negado.', 403);

  const email = String(session?.user?.email || '').trim().toLowerCase();
  if (!email) return errorResponse('Login necessário.', 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Informe um único código de cupom.', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 1 || typeof body.code !== 'string') {
    return errorResponse('Informe um único código de cupom.', 400);
  }

  const code = body.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
    return errorResponse('O código do cupom é inválido.', 400);
  }

  try {
    const now = new Date();
    const campaign = await prisma.couponCampaign.findFirst({
      where: {
        code,
        recipients: { some: { email } },
      },
      select: {
        id: true,
        code: true,
        discountPercent: true,
        minimumOrderAmount: true,
        expiresAt: true,
        redemptions: {
          where: { email },
          select: { orderId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!campaign) {
      return errorResponse('Cupom inválido ou não disponível para sua conta.', 404);
    }

    const usedOrders = await prisma.order.findMany({
      where: { customerEmail: email, couponCode: code },
      select: { id: true, createdAt: true, status: true, paymentStatus: true },
      orderBy: { createdAt: 'desc' },
    });
    const ordersById = new Map(usedOrders.map((order) => [order.id, order]));
    const redemption = campaign.redemptions[0] || null;
    const linkedOrder = redemption ? ordersById.get(redemption.orderId) : null;
    const validRedemption = redemption && (
      !linkedOrder
      || isRealizedCouponOrder(linkedOrder)
      || isProcessingCouponOrder(linkedOrder)
    )
      ? {
        ...redemption,
        ...(linkedOrder ? { status: linkedOrder.status, paymentStatus: linkedOrder.paymentStatus } : {}),
      }
      : null;
    const latestEligibleOrder = usedOrders.find((order) => (
      isRealizedCouponOrder(order) || isProcessingCouponOrder(order)
    )) || null;
    const status = getCouponRecipientStatus(
      campaign.expiresAt,
      validRedemption || latestEligibleOrder,
      now,
    );
    if (status !== 'available') {
      return errorResponse('Este cupom expirou, já foi utilizado ou está vinculado a um pedido em andamento.', 409);
    }

    return Response.json({
      coupon: {
        code: campaign.code,
        discountPercent: campaign.discountPercent,
        minimumOrderAmount: Number(campaign.minimumOrderAmount),
        expiresAt: campaign.expiresAt,
      },
    }, { headers: privateNoStoreHeaders });
  } catch (error) {
    console.error('Não foi possível validar o cupom informado:', error);
    return errorResponse('Não foi possível validar o cupom agora.', 500);
  }
}
