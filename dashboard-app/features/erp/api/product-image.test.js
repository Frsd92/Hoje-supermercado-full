import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { optimizeProductImage } from './product-image.js';

test('creates a compact WebP thumbnail within the catalog image dimensions', async () => {
  const width = 1200;
  const height = 900;
  const pixels = Buffer.alloc(width * height * 3);
  let state = 42;
  for (let index = 0; index < pixels.length; index += 1) {
    state = (1664525 * state + 1013904223) >>> 0;
    pixels[index] = state >>> 24;
  }
  const original = await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();

  const thumbnail = await optimizeProductImage(original);
  const metadata = await sharp(thumbnail).metadata();

  assert.equal(metadata.format, 'webp');
  assert.ok(metadata.width <= 256);
  assert.ok(metadata.height <= 256);
  assert.ok(thumbnail.length < original.length * 0.25);
});
