import { hashDeliveryTrackingToken, parseDeliveryLocation, DELIVERY_LOCATION_MIN_INTERVAL_MS } from '@/features/tracking/delivery-tracking';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

function json(body, status = 200) {
  return Response.json(body, { status, headers });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'A solicitação enviada é inválida.' }, 400);
  }

  const token = typeof body?.token === 'string' ? body.token : '';
  if (!/^[a-f0-9]{64}$/i.test(token)) return json({ error: 'Este link de rastreamento é inválido ou expirou.' }, 401);
  const action = body?.action;
  if (!['start', 'location', 'stop'].includes(action)) return json({ error: 'Ação de rastreamento inválida.' }, 400);
  const tokenHash = hashDeliveryTrackingToken(token);

  try {
    const tracking = await prisma.deliveryTracking.findUnique({
      where: { tokenHash },
      include: { order: { select: { status: true } } },
    });
    if (!tracking?.active || tracking.expiresAt.getTime() <= Date.now()) {
      return json({ error: 'Este acesso de rastreamento foi encerrado ou expirou.' }, 410);
    }
    if (tracking.order.status !== 'Em transito') {
      return json({ error: 'O pedido não está mais em trânsito.' }, 409);
    }

    if (action === 'start') {
      await prisma.deliveryTracking.update({
        where: { orderId: tracking.orderId },
        data: { startedAt: tracking.startedAt || new Date() },
      });
      return json({ message: 'Compartilhamento de localização iniciado.' });
    }

    if (action === 'stop') {
      await prisma.deliveryTracking.update({
        where: { orderId: tracking.orderId },
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
      return json({ message: 'Compartilhamento encerrado.' });
    }

    if (!tracking.startedAt) return json({ error: 'Inicie o compartilhamento antes de enviar a localização.' }, 409);
    const location = parseDeliveryLocation(body.location);
    if (!location) return json({ error: 'A posição GPS recebida é inválida.' }, 400);

    const now = new Date();
    if (tracking.locationUpdatedAt
      && now.getTime() - tracking.locationUpdatedAt.getTime() < DELIVERY_LOCATION_MIN_INTERVAL_MS) {
      return json({ error: 'A localização já foi atualizada recentemente.' }, 429);
    }

    const updated = await prisma.deliveryTracking.updateMany({
      where: {
        orderId: tracking.orderId,
        tokenHash,
        active: true,
        expiresAt: { gt: now },
        OR: [
          { locationUpdatedAt: null },
          { locationUpdatedAt: { lte: new Date(now.getTime() - DELIVERY_LOCATION_MIN_INTERVAL_MS) } },
        ],
      },
      data: { ...location, locationUpdatedAt: now },
    });
    if (updated.count !== 1) {
      const currentTracking = await prisma.deliveryTracking.findUnique({
        where: { tokenHash },
        select: { active: true, expiresAt: true },
      });
      if (!currentTracking?.active || currentTracking.expiresAt.getTime() <= Date.now()) {
        return json({ error: 'O rastreamento foi encerrado.' }, 410);
      }
      return json({ error: 'A localização já foi atualizada recentemente.' }, 429);
    }

    return json({ receivedAt: now.toISOString() });
  } catch (error) {
    console.error('Não foi possível atualizar a localização do entregador:', error);
    return json({ error: 'Não foi possível enviar a localização agora.' }, 500);
  }
}
