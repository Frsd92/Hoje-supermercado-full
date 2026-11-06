import assert from 'node:assert/strict';
import test from 'node:test';
import { mapMerchantProduct, normalizeMerchantProductInput, validateGtin } from './google-merchant.js';

const validProduct = {
  id: 'product-123',
  title: 'Produto de teste',
  description: 'Descrição do produto de teste.',
  price: 10,
  promotionalPrice: 8,
  quantity: 3,
  barcode: '4006381333931',
  brand: 'Marca de teste',
  status: 'Ativo',
  image: '/imagens/produtos/produto.webp',
  categories: ['Mercearia'],
};

test('validates GTIN check digits for supported barcode lengths', () => {
  assert.equal(validateGtin('4006381333931'), true);
  assert.equal(validateGtin('4006381333932'), false);
  assert.equal(validateGtin('12345'), false);
});

test('maps an active product with stable offer ID, canonical URLs, stock and sale price', () => {
  const mapped = mapMerchantProduct(validProduct, { storeUrl: 'https://www.hojesupermercado.com.br' });

  assert.equal(mapped.input.contentLanguage, 'pt');
  assert.equal(mapped.input.feedLabel, 'BR');
  assert.match(mapped.input.offerId, /^hj-[a-f0-9]{40}$/);
  assert.equal(mapped.input.productAttributes.availability, 'IN_STOCK');
  assert.deepEqual(mapped.input.productAttributes.price, { amountMicros: '10000000', currencyCode: 'BRL' });
  assert.deepEqual(mapped.input.productAttributes.salePrice, { amountMicros: '8000000', currencyCode: 'BRL' });
  assert.deepEqual(mapped.input.productAttributes.gtins, ['4006381333931']);
  assert.equal('gtin' in mapped.input.productAttributes, false);
  assert.equal(mapped.input.productAttributes.link, 'https://www.hojesupermercado.com.br/produto?id=product-123');
  assert.equal(mapped.input.productAttributes.imageLink, 'https://www.hojesupermercado.com.br/imagens/produtos/produto.webp');
});

test('maps empty stock as out of stock and omits unavailable identifiers', () => {
  const mapped = mapMerchantProduct({
    ...validProduct,
    quantity: 0,
    barcode: '',
    promotionalPrice: 0,
  }, { storeUrl: 'https://www.hojesupermercado.com.br' });

  assert.equal(mapped.input.productAttributes.availability, 'OUT_OF_STOCK');
  assert.equal(mapped.input.productAttributes.identifierExists, false);
  assert.equal('gtin' in mapped.input.productAttributes, false);
  assert.equal('gtins' in mapped.input.productAttributes, false);
  assert.equal('salePrice' in mapped.input.productAttributes, false);
});

test('skips products with invalid GTIN instead of sending a misleading identifier', () => {
  const mapped = mapMerchantProduct({
    ...validProduct,
    barcode: '4006381333932',
  }, { storeUrl: 'https://www.hojesupermercado.com.br' });

  assert.match(mapped.skipReason, /Código de barras inválido/);
});

test('normalizes legacy singular GTIN before sending a Merchant product input', () => {
  const normalized = normalizeMerchantProductInput({
    offerId: 'legacy-product',
    productAttributes: {
      title: 'Produto legado',
      gtin: '4006381333931',
    },
  });

  assert.deepEqual(normalized.productAttributes, {
    title: 'Produto legado',
    gtins: ['4006381333931'],
  });
  assert.equal('gtin' in normalized.productAttributes, false);
});
