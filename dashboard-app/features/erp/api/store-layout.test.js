import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMainHeroBanners,
  getMainHeroSlideOrder,
  getStoreLayoutSlot,
  isMainHeroSlideKey,
  STORE_LAYOUT_SLOTS,
  validateStoreLayoutImage,
} from './store-layout.js';

test('defines uniquely identified store banners and brand logos with recommended dimensions', () => {
  assert.equal(STORE_LAYOUT_SLOTS.length, 20);
  assert.equal(new Set(STORE_LAYOUT_SLOTS.map((slot) => slot.key)).size, STORE_LAYOUT_SLOTS.length);
  assert.ok(STORE_LAYOUT_SLOTS.every((slot) => slot.recommendedWidth > 0 && slot.recommendedHeight > 0));
  const brandSlots = STORE_LAYOUT_SLOTS.filter((slot) => slot.group === 'brands');
  assert.equal(brandSlots.length, 9);
  assert.ok(brandSlots.every((slot) => slot.recommendedWidth === 480 && slot.recommendedHeight === 200));
  assert.equal(STORE_LAYOUT_SLOTS.filter((slot) => slot.group === 'main').length, 1);
  assert.equal(STORE_LAYOUT_SLOTS.filter((slot) => slot.group === 'carousels').length, 3);
  assert.equal(STORE_LAYOUT_SLOTS.filter((slot) => slot.group === 'wide-banners').length, 7);
  assert.deepEqual(
    STORE_LAYOUT_SLOTS.filter((slot) => slot.group === 'main').map(({ recommendedWidth, recommendedHeight }) => [recommendedWidth, recommendedHeight]),
    [[1600, 500]],
  );
  assert.ok(STORE_LAYOUT_SLOTS.filter((slot) => slot.group === 'carousels')
    .every(({ recommendedWidth, recommendedHeight }) => recommendedWidth === 520 && recommendedHeight === 700));
  assert.ok(STORE_LAYOUT_SLOTS.filter((slot) => slot.group === 'wide-banners')
    .every(({ recommendedWidth, recommendedHeight }) => recommendedWidth === 1400 && recommendedHeight === 360));
  assert.equal(getStoreLayoutSlot('main-hero')?.recommendedWidth, 1600);
  assert.equal(getStoreLayoutSlot('main-hero')?.recommendedHeight, 500);
  assert.equal(getStoreLayoutSlot('main-hero')?.fallbackImage, '/imagens/tudo_o_que_vc_precisa.webp');
  assert.equal(getStoreLayoutSlot('main-hero-slide-02')?.label, 'Banner principal 2');
  assert.equal(getStoreLayoutSlot('main-hero-slide-02')?.recommendedWidth, 1600);
  assert.equal(getStoreLayoutSlot('main-hero-slide-02')?.recommendedHeight, 500);
  assert.equal(getStoreLayoutSlot('main-hero-slide-02')?.fallbackImage, '');
  assert.equal(getStoreLayoutSlot('main-hero-slide-9999')?.group, 'main');
  assert.equal(getStoreLayoutSlot('main-hero-slide-1'), null);
  assert.equal(getStoreLayoutSlot('main-hero-slide-10000'), null);
  assert.equal(getStoreLayoutSlot('main-hero-slide-xx'), null);
  assert.equal(isMainHeroSlideKey('main-hero'), true);
  assert.equal(isMainHeroSlideKey('main-hero-slide-02'), true);
  assert.equal(isMainHeroSlideKey('main-hero-slide-xx'), false);
  assert.equal(getMainHeroSlideOrder('main-hero'), 1);
  assert.equal(getMainHeroSlideOrder('main-hero-slide-12'), 12);
  assert.deepEqual(getMainHeroBanners([]), [{
    key: 'main-hero',
    imageUrl: '/imagens/tudo_o_que_vc_precisa.webp',
  }]);
  const updatedAt = new Date('2026-10-09T12:00:00Z');
  assert.deepEqual(getMainHeroBanners([
    { key: 'main-hero-slide-02', updatedAt },
  ]), [
    { key: 'main-hero', imageUrl: '/imagens/tudo_o_que_vc_precisa.webp' },
    { key: 'main-hero-slide-02', imageUrl: `/api/store-layout/main-hero-slide-02?v=${updatedAt.getTime()}` },
  ]);
  assert.deepEqual(getMainHeroBanners([
    { key: 'main-hero-slide-02', updatedAt },
    { key: 'main-hero', updatedAt },
  ]).map(({ key }) => key), ['main-hero', 'main-hero-slide-02']);
  assert.equal(getStoreLayoutSlot('carousel-hortifruti')?.recommendedHeight, 700);
  assert.equal(getStoreLayoutSlot('carousel-mercearia')?.recommendedWidth, 520);
  assert.equal(getStoreLayoutSlot('carousel-limpeza')?.recommendedHeight, 700);
  assert.equal(getStoreLayoutSlot('brand-coca-cola')?.group, 'brands');
  assert.equal(getStoreLayoutSlot('brand-coca-cola')?.fallbackImage, '/imagens/marcas_em_destaque/Coca-Cola.png');
  assert.equal(getStoreLayoutSlot('brand-ambev')?.fallbackImage, '/imagens/marcas_em_destaque/ype-optimized.webp');
  assert.equal(getStoreLayoutSlot('brand-danone')?.fallbackImage, '/imagens/marcas_em_destaque/Danone.png');
  assert.equal(getStoreLayoutSlot('brand-pg')?.fallbackImage, '/imagens/marcas_em_destaque/P-G.webp');
  assert.equal(getStoreLayoutSlot('brand-unilever')?.fallbackImage, '/imagens/marcas_em_destaque/Unilever.webp');
  assert.equal(getStoreLayoutSlot('brand-omo')?.fallbackImage, '/imagens/marcas_em_destaque/OMO.webp');
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
