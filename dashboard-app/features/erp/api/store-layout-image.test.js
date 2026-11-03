import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { optimizeStoreLayoutImage } from './store-layout-image.js';

test('resizes store layout images to the slot dimensions and serves WebP', async () => {
  const width = 1800;
  const height = 1000;
  const pixels = Buffer.alloc(width * height * 3);
  let state = 42;
  for (let index = 0; index < pixels.length; index += 1) {
    state = (1664525 * state + 1013904223) >>> 0;
    pixels[index] = state >>> 24;
  }
  const original = await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();

  const optimized = await optimizeStoreLayoutImage('main-hero', original);
  const metadata = await sharp(optimized).metadata();

  assert.equal(metadata.format, 'webp');
  assert.ok(metadata.width <= 1644);
  assert.ok(metadata.height <= 760);
  assert.ok(optimized.length < original.length);
});

test('rejects unknown store layout image keys', async () => {
  await assert.rejects(() => optimizeStoreLayoutImage('unknown', Buffer.from('image')), /Unknown store layout image key/);
});
