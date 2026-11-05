import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAvailableProductSubstitutes,
  getProductSubstituteScore,
  isProductAvailableForQuantity,
} from './product-substitutes.js';

const source = {
  id: 'milk-a',
  title: 'Leite Integral Marca A',
  categories: ['Laticínios'],
  subcategory: 'Leite',
  brand: 'Marca A',
  productType: 'Integral',
};

test('marks inactive, insufficient, and invalid stock as unavailable', () => {
  assert.equal(isProductAvailableForQuantity({ status: 'Ativo', quantity: 2 }, 2), true);
  assert.equal(isProductAvailableForQuantity({ status: 'Ativo', quantity: 1.5 }, 2), false);
  assert.equal(isProductAvailableForQuantity({ status: 'Arquivado', quantity: 4 }, 1), false);
  assert.equal(isProductAvailableForQuantity({ status: 'Ativo', quantity: 4 }, 0), false);
});

test('scores substitutions by matching category, subcategory, type, and brand', () => {
  assert.equal(getProductSubstituteScore(source, {
    id: 'milk-b',
    categories: ['LATICINIOS'],
    subcategory: 'leite',
    brand: 'Marca B',
    productType: 'Integral',
  }), 13);
  assert.equal(getProductSubstituteScore(source, {
    id: 'unrelated',
    categories: ['Limpeza'],
    subcategory: 'Detergente',
    brand: 'Marca C',
    productType: 'Líquido',
  }), 0);
  assert.equal(getProductSubstituteScore(source, source), 0);
  assert.equal(getProductSubstituteScore(
    { id: 'legacy', title: 'Leite Integral Marca A' },
    { id: 'current', title: 'Leite Integral Marca B' },
  ), 3);
});

test('returns only active, sufficiently stocked, related products and excludes cart items', () => {
  const products = [
    { id: 'milk-b', title: 'Leite B', status: 'Ativo', quantity: 3, categories: ['Laticínios'], subcategory: 'Leite', productType: 'Integral', salesCount: 2 },
    { id: 'milk-c', title: 'Leite C', status: 'Ativo', quantity: 1, categories: ['Laticínios'], subcategory: 'Leite', brand: 'Marca A', productType: 'Integral', salesCount: 1 },
    { id: 'inactive', title: 'Leite D', status: 'Arquivado', quantity: 8, categories: ['Laticínios'], subcategory: 'Leite' },
    { id: 'unrelated', title: 'Detergente', status: 'Ativo', quantity: 8, categories: ['Limpeza'], subcategory: 'Detergente' },
  ];

  assert.deepEqual(
    getAvailableProductSubstitutes({
      source,
      products,
      quantity: 2,
      excludedIds: ['milk-b'],
    }).map(({ id }) => id),
    [],
  );
  assert.deepEqual(
    getAvailableProductSubstitutes({ source, products, quantity: 2 }).map(({ id }) => id),
    ['milk-b'],
  );
});
