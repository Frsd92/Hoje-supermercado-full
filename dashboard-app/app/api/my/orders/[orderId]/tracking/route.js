import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const MAX_STALE_LOCATION_MS = 5 * 60 * 1000;

function json(body, status = 200) {
  return Response.json(body, { status, headers });
}

export async function GET(_request, { params }) {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || '').trim().toLowerCase();
  if (!email) return json({ error: 'Entre na sua conta para acompanhar a entrega.' }, 401);

  const { orderId } = await params;
  const id = String(orderId || '').trim();
  if (!id) return json({ error: 'Código do pedido inválido.' }, 400);

  try {
    const order = await prisma.order.findFirst({
      where: {
        id,
        customerEmail: { equals: email, mode: 'insensitive' },
      },
      select: {
        status: true,
        deliveryTracking: true,
      },
    });
    if (!order) return json({ error: 'O pedido não foi encontrado na sua conta.' }, 404);
    if (order.status !== 'Em transito') {
      return json({ active: false, message: 'O pedido não está mais em trânsito.' });
    }

    const tracking = order.deliveryTracking;
    const now = Date.now();
    if (!tracking?.active || !tracking.tokenHash || tracking.expiresAt.getTime() <= now) {
      if (tracking?.active && tracking.expiresAt.getTime() <= now) {
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
      }
      return json({ active: false, message: 'O rastreamento ao vivo ainda não está disponível.' });
    }

    const locationIsStale = tracking.locationUpdatedAt
      && now - tracking.locationUpdatedAt.getTime() > MAX_STALE_LOCATION_MS;
    if (locationIsStale) {
      await prisma.deliveryTracking.updateMany({
        where: { orderId: id, active: true },
        data: {
          latitude: null,
          longitude: null,
          accuracy: null,
          heading: null,
          speed: null,
          locationUpdatedAt: null,
        },
      });
    }

    const locationIsAvailable = !locationIsStale
      && Number.isFinite(tracking.latitude)
      && Number.isFinite(tracking.longitude)
      && tracking.locationUpdatedAt
      && now - tracking.locationUpdatedAt.getTime() <= MAX_STALE_LOCATION_MS;

    return json({
      active: true,
      started: Boolean(tracking.startedAt),
      location: locationIsAvailable ? {
        latitude: tracking.latitude,
        longitude: tracking.longitude,
        accuracy: tracking.accuracy,
        heading: tracking.heading,
        speed: tracking.speed,
        updatedAt: tracking.locationUpdatedAt.toISOString(),
        stale: now - tracking.locationUpdatedAt.getTime() > 60_000,
      } : null,
      googleMapsApiKey: process.env.GOOGLE_MAPS_BROWSER_API_KEY || '',
    });
  } catch (error) {
    console.error('Não foi possível consultar a localização do pedido:', error);
    return json({ error: 'Não foi possível atualizar a localização agora.' }, 500);
  }
}
