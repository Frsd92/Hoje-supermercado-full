import sharp from 'sharp';

export async function optimizeProductImage(imageBytes) {
  return sharp(imageBytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: 256,
      height: 256,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 70, effort: 4 })
    .toBuffer();
}
