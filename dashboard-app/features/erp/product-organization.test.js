import test from 'node:test';
import assert from 'node:assert/strict';
import { getProductOrganizationError, normalizeProductOrganizationValue, usesHortifrutiOrganization } from './product-organization.js';

test('normalizes Portuguese labels consistently', () => {
  assert.equal(normalizeProductOrganizationValue('  HORTIFRÚTI  '), 'hortifruti');
});

test('requires the Hortifruti primary category and department', () => {
  assert.match(getProductOrganizationError({ categories: ['Hortifruti'], subcategory: 'Fruta' }), /Departamento/);
  assert.match(getProductOrganizationError({ categories: [], department: 'Hortifruti', subcategory: 'Fruta' }), /Categorias/);
});

test('requires a specific category instead of repeating the broad Hortifruti category', () => {
  assert.match(getProductOrganizationError({ categories: ['Hortifruti'], department: 'Hortifruti', subcategory: 'Hortifruti', productType: 'Fruta' }), /classificação específica/);
  assert.equal(getProductOrganizationError({ categories: ['Hortifruti'], department: 'Hortifruti', subcategory: 'Fruta' }), '');
});

test('does not impose Hortifruti fields on unrelated products', () => {
  assert.equal(getProductOrganizationError({ categories: ['Mercearia'], department: 'Mercearia' }), '');
  assert.equal(usesHortifrutiOrganization({ categories: ['Hortifruti'] }), true);
  assert.equal(usesHortifrutiOrganization({ department: 'hortifruti' }), true);
  assert.equal(usesHortifrutiOrganization({ categories: ['Mercearia'] }), false);
});
