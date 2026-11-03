import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { DELIVERY_TRACKING_MAX_AGE_MS, createDeliveryTrackingToken, hashDeliveryTrackingToken } from '@/features/tracking/delivery-tracking';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

function json(body, status = 200) {
  return Response.json(body, { status, headers });
}

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return json({ error: 'Acesso negado.' }, 403);

  const { orderId } = await params;
  const id = String(orderId || '').trim();
  if (!id) return json({ error: 'Código do pedido inválido.' }, 400);

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!order) return json({ error: 'O pedido não foi encontrado.' }, 404);
    if (order.status !== 'Em transito') {
      return json({ error: 'O rastreamento só pode ser iniciado quando o pedido estiver em trânsito.' }, 409);
    }

    const token = createDeliveryTrackingToken();
    const now = new Date();
    await prisma.deliveryTracking.upsert({
      where: { orderId: id },
      create: {
        orderId: id,
        tokenHash: hashDeliveryTrackingToken(token),
        active: true,
        startedAt: null,
        expiresAt: new Date(now.getTime() + DELIVERY_TRACKING_MAX_AGE_MS),
      },
      update: {
        tokenHash: hashDeliveryTrackingToken(token),
        active: true,
        latitude: null,
        longitude: null,
        accuracy: null,
        heading: null,
        speed: null,
        locationUpdatedAt: null,
        startedAt: null,
        expiresAt: new Date(now.getTime() + DELIVERY_TRACKING_MAX_AGE_MS),
      },
    });

    const trackingUrl = new URL('/entregador/rastreamento', request.url);
    trackingUrl.hash = token;
    return json({
      trackingUrl: trackingUrl.toString(),
      expiresAt: new Date(now.getTime() + DELIVERY_TRACKING_MAX_AGE_MS).toISOString(),
    }, 201);
  } catch (error) {
    console.error('Não foi possível iniciar o rastreamento do pedido:', error);
    return json({ error: 'Não foi possível gerar o acesso de rastreamento agora.' }, 500);
  }
}

export async function DELETE(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return json({ error: 'Acesso negado.' }, 403);

  const { orderId } = await params;
  const id = String(orderId || '').trim();
  if (!id) return json({ error: 'Código do pedido inválido.' }, 400);

  try {
    const tracking = await prisma.deliveryTracking.findUnique({ where: { orderId: id }, select: { orderId: true } });
    if (!tracking) return json({ message: 'Não havia rastreamento ativo.' });

    await prisma.deliveryTracking.update({
      where: { orderId: id },
      data: {
        active: false,
        tokenHash: null,
        latitude: null,
        longitude: null,
        accuracy: null,
        heading: null,
        speed: null,
        locationUpdatedAt: null,
      },
    });
    return json({ message: 'Rastreamento encerrado e localização removida.' });
  } catch (error) {
    console.error('Não foi possível encerrar o rastreamento do pedido:', error);
    return json({ error: 'Não foi possível encerrar o rastreamento agora.' }, 500);
  }
}
