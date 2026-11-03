import { getStoreLayoutSlot } from '@/features/erp/api/store-layout';
import { optimizeStoreLayoutImage } from '@/features/erp/api/store-layout-image';
import { prisma } from '@/lib/prisma';

export async function GET(request, { params }) {
  const { key } = await params;
  if (!getStoreLayoutSlot(key)) {
    return new Response('Imagem do layout não encontrada.', { status: 404 });
  }

  try {
    const asset = await prisma.storeLayoutAsset.findUnique({
      where: { key },
      select: { imageData: true, updatedAt: true },
    });
    if (!asset) return new Response('Imagem não encontrada.', { status: 404 });

    const optimizedImage = await optimizeStoreLayoutImage(key, Buffer.from(asset.imageData, 'base64'));
    const requestUrl = new URL(request.url);
    const isVersioned = requestUrl.searchParams.get('v') === String(asset.updatedAt.getTime())
      && requestUrl.searchParams.get('format') === 'webp-v2';
    const cacheControl = isVersioned
      ? 'public, max-age=31536000, s-maxage=31536000, immutable'
      : 'public, max-age=60, stale-while-revalidate=300';

    return new Response(optimizedImage, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Não foi possível carregar a imagem do layout da Loja:', error);
    return new Response('Não foi possível carregar a imagem.', { status: 500 });
  }
}
