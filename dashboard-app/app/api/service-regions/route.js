import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    const states = await prisma.serviceRegionState.findMany({
      where: { enabled: true },
      select: {
        uf: true,
        name: true,
        enabled: true,
        municipalities: {
          where: { enabled: true },
          select: { name: true, enabled: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    return Response.json({ states }, { headers });
  } catch (error) {
    console.error('Não foi possível carregar as regiões atendidas:', error);
    return Response.json({ error: 'Não foi possível consultar as regiões atendidas.' }, { status: 500, headers });
  }
}
