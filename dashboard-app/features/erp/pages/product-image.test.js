import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeProductImage, hasTransparentPixels } from './product-image.js';

test('recognizes fully opaque images', () => {
  assert.equal(hasTransparentPixels({ data: new Uint8ClampedArray([20, 40, 60, 255, 0, 0, 0, 255]) }), false);
});

test('recognizes partially and fully transparent pixels', () => {
  assert.equal(hasTransparentPixels({ data: new Uint8ClampedArray([20, 40, 60, 128]) }), true);
  assert.equal(hasTransparentPixels({ data: new Uint8ClampedArray([0, 0, 0, 0]) }), true);
});

test('encodes transparent product photos as PNG', () => {
  const formats = [];
  const canvas = {
    width: 20,
    height: 20,
    toDataURL(format) {
      formats.push(format);
      return `data:${format};base64,photo`;
    },
  };
  const context = { getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) }) };

  assert.equal(encodeProductImage(canvas, context), 'data:image/png;base64,photo');
  assert.deepEqual(formats, ['image/png']);
});

test('keeps opaque product photos on the compressed WebP path', () => {
  const formats = [];
  const canvas = {
    width: 20,
    height: 20,
    toDataURL(format) {
      formats.push(format);
      return `data:${format};base64,photo`;
    },
  };
  const context = { getImageData: () => ({ data: new Uint8ClampedArray([20, 40, 60, 255]) }) };

  assert.equal(encodeProductImage(canvas, context), 'data:image/webp;base64,photo');
  assert.deepEqual(formats, ['image/webp']);
});
