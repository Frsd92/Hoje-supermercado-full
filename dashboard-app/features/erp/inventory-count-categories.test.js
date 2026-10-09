import test from 'node:test';
import assert from 'node:assert/strict';
import { getInventoryCountCategory, getInventoryCountSourceCategory } from './inventory-count-categories.js';

test('maps existing ERP catalog categories to the requested balance groups', () => {
  assert.equal(getInventoryCountCategory({ categories: ['Vinhos'] }), 'Vinhos');
  assert.equal(getInventoryCountCategory({ categories: ['Pet Shop'] }), 'Petshop');
  assert.equal(getInventoryCountCategory({ categories: ['Bebidas'] }), 'Bebidas sem álcool');
  assert.equal(getInventoryCountCategory({ categories: ['Laticínios'] }), 'Laticínio');
  assert.equal(getInventoryCountCategory({ categories: ['Açougue'] }), 'Carne');
  assert.equal(getInventoryCountCategory({ categories: ['Produtos de Limpeza'] }), 'Limpeza');
  assert.equal(getInventoryCountCategory({ categories: ['Mercearia', 'Vinhos'], subcategory: 'Vinhos' }), 'Mercearia');
  assert.equal(getInventoryCountCategory({ categories: ['Mercearia'], subcategory: 'Cervejas' }), 'Mercearia');
  assert.equal(getInventoryCountCategory({ categories: ['Bebidas'], subcategory: 'Vinhos' }), 'Vinhos');
  assert.equal(getInventoryCountCategory({ categories: ['Bebidas'], subcategory: 'Cervejas' }), 'Outras categorias');
});

test('splits Hortifruti using its specific classification or known product names', () => {
  assert.equal(getInventoryCountCategory({ categories: ['Hortifruti'], subcategory: 'Fruta' }), 'Frutas');
  assert.equal(getInventoryCountCategory({ categories: ['Hortifruti'], subcategory: 'Hortifruti', title: 'Maçã Gala' }), 'Frutas');
  assert.equal(getInventoryCountCategory({ categories: ['Hortifruti'], subcategory: 'Hortifruti', title: 'Batata Monalisa' }), 'Verduras');
  assert.equal(getInventoryCountCategory({ categories: ['Hortifruti'], subcategory: 'Hortifruti', title: 'Tomate Salada' }), 'Verduras');
  assert.equal(getInventoryCountCategory({ categories: ['Hortifruti'], subcategory: 'Hortifruti', title: 'Produto sem identificação' }), 'Outras categorias');
  assert.equal(getInventoryCountCategory({ categories: ['Hortifruti'], subcategory: 'Hortifruti', title: 'Macarrão' }), 'Outras categorias');
});

test('keeps alcohol, bakery and unknown categories visible in the extra group', () => {
  assert.equal(getInventoryCountCategory({ categories: ['Bebidas Alcoólicas'] }), 'Outras categorias');
  assert.equal(getInventoryCountCategory({ categories: ['Cervejas'] }), 'Outras categorias');
  assert.equal(getInventoryCountCategory({ categories: ['Padaria'] }), 'Outras categorias');
  assert.equal(getInventoryCountCategory({ categories: [], title: 'Produto sem categoria' }), 'Outras categorias');
});

test('preserves the catalog category for products shown under the extra group', () => {
  assert.equal(getInventoryCountSourceCategory({ categories: ['Cervejas'] }), 'Cervejas');
  assert.equal(getInventoryCountSourceCategory({ categories: ['Hortifruti'], subcategory: 'Hortifruti' }), 'Hortifruti');
});
