import test from 'node:test';
import assert from 'node:assert/strict';
import { getStoreLayoutSlot, STORE_LAYOUT_SLOTS, validateStoreLayoutImage } from './store-layout.js';

test('defines uniquely identified store banners and brand logos with recommended dimensions', () => {
  assert.equal(STORE_LAYOUT_SLOTS.length, 20);
  assert.equal(new Set(STORE_LAYOUT_SLOTS.map((slot) => slot.key)).size, STORE_LAYOUT_SLOTS.length);
  assert.ok(STORE_LAYOUT_SLOTS.every((slot) => slot.recommendedWidth > 0 && slot.recommendedHeight > 0));
  const brandSlots = STORE_LAYOUT_SLOTS.filter((slot) => slot.group === 'brands');
  assert.equal(brandSlots.length, 9);
  assert.ok(brandSlots.every((slot) => slot.recommendedWidth === 480 && slot.recommendedHeight === 200));
  assert.equal(getStoreLayoutSlot('main-hero')?.recommendedWidth, 1600);
  assert.equal(getStoreLayoutSlot('carousel-hortifruti')?.recommendedHeight, 700);
  assert.equal(getStoreLayoutSlot('carousel-mercearia')?.recommendedWidth, 520);
  assert.equal(getStoreLayoutSlot('carousel-limpeza')?.recommendedHeight, 700);
  assert.equal(getStoreLayoutSlot('brand-coca-cola')?.group, 'brands');
  assert.equal(getStoreLayoutSlot('brand-coca-cola')?.fallbackImage, '/imagens/marcas_em_destaque/Coca-Cola.png');
  assert.equal(getStoreLayoutSlot('brand-danone')?.fallbackImage, '/imagens/marcas_em_destaque/Danone.png');
  assert.equal(getStoreLayoutSlot('brand-pg')?.fallbackImage, '/imagens/marcas_em_destaque/P-G.png');
  assert.equal(getStoreLayoutSlot('brand-unilever')?.fallbackImage, '/imagens/marcas_em_destaque/Unilever.png');
  assert.equal(getStoreLayoutSlot('brand-omo')?.fallbackImage, '/imagens/marcas_em_destaque/OMO.png');
  assert.equal(getStoreLayoutSlot('brand-colgate')?.fallbackImage, '/imagens/marcas_em_destaque/Colgate.png');
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
