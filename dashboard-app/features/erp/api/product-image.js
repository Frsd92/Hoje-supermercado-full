import sharp from 'sharp';

export async function optimizeProductImage(imageBytes) {
  return sharp(imageBytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: 384,
      height: 384,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 76, effort: 4 })
    .toBuffer();
}
