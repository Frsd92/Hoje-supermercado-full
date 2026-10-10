import { getMainHeroSlideOrder, isMainHeroSlideKey, STORE_LAYOUT_SLOTS } from '@/features/erp/api/store-layout';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const savedAssets = await prisma.storeLayoutAsset.findMany({ select: { key: true, updatedAt: true } });
    const heroBanners = savedAssets
      .filter((asset) => isMainHeroSlideKey(asset.key))
      .sort((first, second) => getMainHeroSlideOrder(first.key) - getMainHeroSlideOrder(second.key))
      .map((asset) => ({
        key: asset.key,
        imageUrl: `/api/store-layout/${asset.key}?v=${asset.updatedAt.getTime()}`,
      }));
    const assetsByKey = new Map(savedAssets.map((asset) => [asset.key, asset.updatedAt]));
    const banners = [
      ...heroBanners,
      ...STORE_LAYOUT_SLOTS.filter((slot) => !isMainHeroSlideKey(slot.key)).flatMap((slot) => {
        const updatedAt = assetsByKey.get(slot.key);
        return updatedAt ? [{ key: slot.key, imageUrl: `/api/store-layout/${slot.key}?v=${updatedAt.getTime()}` }] : [];
      }),
    ];
    return Response.json({ banners }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Não foi possível carregar as imagens gerenciadas da Loja:', error);
    return Response.json({ error: 'Não foi possível carregar as imagens da Loja.' }, { status: 500 });
  }
}
