import sharp from 'sharp';
import { getStoreLayoutSlot } from './store-layout.js';

export async function optimizeStoreLayoutImage(key, imageBytes) {
  const slot = getStoreLayoutSlot(key);
  if (!slot) throw new Error(`Unknown store layout image key: ${key}`);

  return sharp(imageBytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: slot.recommendedWidth,
      height: slot.recommendedHeight,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 76, effort: 4 })
    .toBuffer();
}
