import { createHash } from 'node:crypto';

export function publicProductImage(product) {
  const image = typeof product.image === 'string' ? product.image : '';
  const imageHash = /^[a-f0-9]{32}$/i.test(product.imageHash) ? product.imageHash : '';
  if (!imageHash && !/^data:image\/(?:png|jpeg|webp);base64,/i.test(image)) return image;

  const version = `${imageHash || createHash('md5').update(image).digest('hex')}-webp-256-v2`;
  return `/api/products?purpose=image&id=${encodeURIComponent(product.id)}&v=${version}`;
}
