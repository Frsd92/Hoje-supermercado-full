import sharp from 'sharp';
import { getStoreLayoutSlot } from './store-layout.js';

export async function optimizeStoreLayoutImage(key, imageBytes) {
  const slot = getStoreLayoutSlot(key);
  if (!slot) throw new Error(`Unknown store layout image key: ${key}`);
  const isMainHero = slot.group === 'main';
  const isBrand = slot.group === 'brands';

  return sharp(imageBytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: isMainHero ? 1400 : isBrand ? 360 : slot.recommendedWidth,
      height: isMainHero ? 760 : isBrand ? 120 : slot.recommendedHeight,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: isMainHero ? 65 : isBrand ? 70 : 72, effort: 4 })
    .toBuffer();
}
