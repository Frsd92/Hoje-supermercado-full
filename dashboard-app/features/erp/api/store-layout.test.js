import test from 'node:test';
import assert from 'node:assert/strict';
import { getStoreLayoutSlot, STORE_LAYOUT_SLOTS, validateStoreLayoutImage } from './store-layout.js';

test('defines eight uniquely identified store banners with recommended artwork dimensions', () => {
  assert.equal(STORE_LAYOUT_SLOTS.length, 8);
  assert.equal(new Set(STORE_LAYOUT_SLOTS.map((slot) => slot.key)).size, STORE_LAYOUT_SLOTS.length);
  assert.ok(STORE_LAYOUT_SLOTS.every((slot) => slot.recommendedWidth > 0 && slot.recommendedHeight > 0));
  assert.equal(getStoreLayoutSlot('main-hero')?.recommendedWidth, 1600);
  assert.equal(getStoreLayoutSlot('unknown'), null);
});

test('accepts supported image data and rejects unsupported, malformed, or oversized uploads', () => {
  assert.deepEqual(validateStoreLayoutImage('data:image/png;base64,iVBORw0KGgo='), {
    contentType: 'image/png',
    imageData: 'iVBORw0KGgo=',
  });
  assert.deepEqual(validateStoreLayoutImage('data:image/jpeg;base64,/9j/'), {
    contentType: 'image/jpeg',
    imageData: '/9j/',
  });
  assert.equal(validateStoreLayoutImage('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(validateStoreLayoutImage('data:image/png;base64,AAAA'), null);
  assert.equal(validateStoreLayoutImage(`data:image/webp;base64,UklGR${'A'.repeat(3_333_335)}`), null);
});
