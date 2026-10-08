import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';

const allowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function GET(_request, { params }) {
  const { missionId } = await params;
  if (!missionId || missionId.length > 80) return new Response('Imagem não encontrada.', { status: 404 });

  try {
    const mission = await prisma.loyaltyMission.findUnique({
      where: { id: missionId },
      select: {
        imageData: true,
        imageContentType: true,
        status: true,
        startsAt: true,
        endsAt: true,
      },
    });
    if (!mission?.imageData || !allowedImageTypes.has(mission.imageContentType)) {
      return new Response('Imagem não encontrada.', { status: 404 });
    }

    const now = new Date();
    const availableToCustomers = mission.status === 'active'
      && mission.startsAt <= now
      && (!mission.endsAt || mission.endsAt > now);
    if (!availableToCustomers) {
      const session = await getServerSession(authOptions);
      if (!hasErpAccess(session?.user)) return new Response('Imagem não encontrada.', { status: 404 });
    }

    return new Response(Buffer.from(mission.imageData, 'base64'), {
      headers: {
        'Content-Type': mission.imageContentType,
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Não foi possível carregar a miniatura da missão:', error);
    return new Response('Não foi possível carregar a imagem.', { status: 500 });
  }
}
