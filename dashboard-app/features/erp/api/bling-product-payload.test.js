import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBlingProductPayload } from './bling-product-payload.js';

const product = {
  id: 'product-123',
  externalId: 'PROD-123',
  title: 'Arroz Hoje',
  description: 'Arroz tipo 1',
  sku: 'ARROZ-1',
  barcode: '7891234567890',
  brand: 'Hoje',
  price: 10,
  promotionalPrice: 8,
  discount: 0,
  status: 'Ativo',
  image: 'data:image/png;base64,aGVsbG8=',
  imageVersion: 'abc123',
  metadata: { ncm: '1006.30.21', saleUnit: 'Quilograma' },
  productBarcodes: [{ code: '7891234567891' }],
};

test('builds a Bling product payload from approved product fields without stock', () => {
  const { payload, code, warnings } = buildBlingProductPayload(product, { origin: 'https://www.hojesupermercado.com.br' });
  assert.equal(code, 'ARROZ-1');
  assert.equal(payload.nome, 'Arroz Hoje');
  assert.equal(payload.codigo, 'ARROZ-1');
  assert.equal(payload.preco, 8);
  assert.equal(payload.unidade, 'KG');
  assert.equal(payload.marca, 'Hoje');
  assert.equal(payload.gtin, '7891234567890');
  assert.deepEqual(payload.tributacao, { ncm: '10063021' });
  assert.match(payload.midia.imagens.imagensURL[0].link, /\/api\/products\?purpose=image/);
  assert.equal(Object.hasOwn(payload, 'estoque'), false);
  assert.equal(warnings.length, 0);
});

test('does not send unusable images or invent an NCM', () => {
  const { payload, warnings } = buildBlingProductPayload({
    ...product,
    image: 'https://third-party.example/product.png',
    metadata: { saleUnit: 'Unidade' },
  }, { origin: 'https://www.hojesupermercado.com.br' });
  assert.equal(Object.hasOwn(payload, 'midia'), false);
  assert.equal(Object.hasOwn(payload, 'tributacao'), false);
  assert.equal(warnings.length, 2);
});

test('rejects products without a stable code or valid NCM format', () => {
  assert.throws(() => buildBlingProductPayload({ ...product, sku: '', externalId: '', id: '' }), /SKU ou identificador/);
  assert.throws(() => buildBlingProductPayload({ ...product, metadata: { ncm: '123' } }), /8 dígitos/);
});
