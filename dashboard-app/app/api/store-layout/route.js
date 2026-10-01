import { STORE_LAYOUT_SLOTS } from '@/features/erp/api/store-layout';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const savedAssets = await prisma.storeLayoutAsset.findMany({ select: { key: true, updatedAt: true } });
    const assetsByKey = new Map(savedAssets.map((asset) => [asset.key, asset.updatedAt]));
    const banners = STORE_LAYOUT_SLOTS.flatMap((slot) => {
      const updatedAt = assetsByKey.get(slot.key);
      return updatedAt ? [{ key: slot.key, imageUrl: `/api/store-layout/${slot.key}?v=${updatedAt.getTime()}` }] : [];
    });
    return Response.json({ banners }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Não foi possível carregar os banners gerenciados da Loja:', error);
    return Response.json({ error: 'Não foi possível carregar os banners da Loja.' }, { status: 500 });
  }
}
