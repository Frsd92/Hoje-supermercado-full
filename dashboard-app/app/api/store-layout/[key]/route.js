import { getStoreLayoutSlot } from '@/features/erp/api/store-layout';
import { prisma } from '@/lib/prisma';

export async function GET(_request, { params }) {
  const { key } = await params;
  if (!getStoreLayoutSlot(key)) return new Response('Banner não encontrado.', { status: 404 });

  try {
    const asset = await prisma.storeLayoutAsset.findUnique({
      where: { key },
      select: { imageData: true, contentType: true },
    });
    if (!asset) return new Response('Imagem não encontrada.', { status: 404 });

    return new Response(Buffer.from(asset.imageData, 'base64'), {
      headers: {
        'Content-Type': asset.contentType,
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Não foi possível carregar a imagem de banner da Loja:', error);
    return new Response('Não foi possível carregar a imagem.', { status: 500 });
  }
}
