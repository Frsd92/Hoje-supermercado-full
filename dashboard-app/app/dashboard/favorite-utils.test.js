import test from 'node:test';
import assert from 'node:assert/strict';

import { getFavoriteDiscountPercent, syncFavoritesWithCatalog } from './favorite-utils.js';

test('refreshes saved favorite details and sale price from the current catalog by product ID', () => {
  const favorites = [{
    productId: 'product-1',
    name: 'Maçã Gala',
    category: 'Categoria antiga',
    price: 'R$ 58,43',
    oldPrice: '',
    image: '/old-image.webp',
    saleUnit: 'Unidade',
  }];
  const products = [{
    id: 'product-1',
    title: 'Maçã Gala',
    categories: ['Frutas'],
    subcategory: 'Frutas frescas',
    price: 70,
    salePrice: 58.43,
    image: '/new-image.webp',
    saleUnit: 'Quilograma',
  }];

  assert.deepEqual(syncFavoritesWithCatalog(favorites, products), [{
    ...favorites[0],
    id: 'product-1',
    category: 'Frutas frescas',
    price: 'R$ 58,43',
    oldPrice: 'R$ 70,00',
    image: '/new-image.webp',
    saleUnit: 'Quilograma',
  }]);
});

test('matches legacy favorites by accent-insensitive product name', () => {
  const favorites = [{ name: 'Maca Gala', price: 'R$ 10,00' }];
  const products = [{ id: 'product-2', title: 'Maçã Gala', price: 12, salePrice: 12, categories: ['Frutas'] }];

  assert.deepEqual(syncFavoritesWithCatalog(favorites, products), [{
    ...favorites[0],
    name: 'Maçã Gala',
    id: 'product-2',
    productId: 'product-2',
    category: 'Frutas',
    saleUnit: 'Unidade',
    price: 'R$ 12,00',
    oldPrice: '',
  }]);
});

test('preserves a saved favorite when it no longer exists in the active catalog', () => {
  const favorite = { name: 'Produto arquivado', price: 'R$ 15,00', image: '/saved.webp' };

  assert.deepEqual(syncFavoritesWithCatalog([favorite], []), [favorite]);
});

test('calculates a discount from catalog prices and ignores missing or non-discounted prices', () => {
  assert.equal(getFavoriteDiscountPercent({ price: 'R$ 58,43', oldPrice: 'R$ 70,00' }), 17);
  assert.equal(getFavoriteDiscountPercent({ price: 'R$ 20,00', oldPrice: 'R$ 20,00' }), 0);
  assert.equal(getFavoriteDiscountPercent({ price: '', oldPrice: 'R$ 20,00' }), 0);
  assert.equal(getFavoriteDiscountPercent({ price: 'R$ 20,00', oldPrice: '' }), 0);
});
