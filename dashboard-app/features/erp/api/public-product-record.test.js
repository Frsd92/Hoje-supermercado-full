import assert from 'node:assert/strict';
import test from 'node:test';
import { serializePublicProductRecord } from './public-product-record.js';

test('serializes only public catalog fields and an image fingerprint', () => {
  const product = serializePublicProductRecord({
    id: 'database-id',
    externalId: 'STORE-1',
    title: 'Produto',
    description: '',
    price: '12.50',
    cost: '4.00',
    discount: '0',
    status: 'Ativo',
    categories: ['Mercearia'],
    brand: '',
    subcategory: '',
    metadata: { saleUnit: 'Unidade', flashOfferEnabled: false },
    image: '',
    imageHash: 'a'.repeat(32),
  });

  test('normalizes the legacy beverage category for public store consumers', () => {
    const product = serializePublicProductRecord({
      id: 'database-id',
      title: 'Refrigerante',
      price: '5.00',
      discount: '0',
      status: 'Ativo',
      categories: ['Bebidas'],
    });

    assert.deepEqual(product.categories, ['Sucos e Refrigerantes']);
  });

  assert.deepEqual(product, {
    saleUnit: 'Unidade',
    flashOfferEnabled: false,
    id: 'STORE-1',
    title: 'Produto',
    description: '',
    price: 12.5,
    discount: 0,
    status: 'Ativo',
    categories: ['Mercearia'],
    brand: '',
    subcategory: '',
    image: '',
    imageHash: 'a'.repeat(32),
  });
  assert.equal('cost' in product, false);
});
