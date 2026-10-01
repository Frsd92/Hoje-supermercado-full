import test from 'node:test';
import assert from 'node:assert/strict';
import { findProductIdentityConflict, formatAuditValue, getAuditProductImage, getProductAuditChanges, productAuditSnapshot, productIdentityKeys } from './product-audit.js';

test('normalizes product names so accents, case, and spacing do not create duplicate identities', () => {
  assert.equal(productIdentityKeys({ title: '  MAÇÃ   Gala ' }).identityTitle, 'maca gala');
});

test('normalizes optional SKU and barcode values for uniqueness checks', () => {
  assert.deepEqual(productIdentityKeys({ title: 'Maçã', sku: ' SKU-1 ', barcodes: [' 789-1 ', '789-2'] }), {
    identityTitle: 'maca',
    identitySku: 'sku-1',
    identityBarcode: '789-1',
    normalizedBarcodes: ['789-1', '789-2'],
  });
  assert.equal(productIdentityKeys({ title: 'Banana' }).identitySku, null);
});

test('blocks duplicates by normalized name, SKU, and every barcode, while allowing edits to the same product', () => {
  const existing = { id: 'p1', title: 'Maçã Gala', sku: 'ABC-1', barcodes: ['789-A', '789-B'] };
  assert.equal(findProductIdentityConflict({ title: ' maca gala ' }, [existing]).field, 'este nome');
  assert.equal(findProductIdentityConflict({ title: 'Maçã Verde', sku: 'abc-1' }, [existing]).field, 'este SKU');
  assert.equal(findProductIdentityConflict({ title: 'Maçã Verde', barcodes: ['789-b'] }, [existing]).field, 'este código de barras');
  assert.equal(findProductIdentityConflict({ ...existing, title: 'Maçã Gala Especial' }, [existing], 'p1'), null);
});

test('records every changed, added, and removed field with before and after values', () => {
  assert.deepEqual(getProductAuditChanges(
    { title: 'Maçã', description: '', categories: ['Frutas'], image: 'old' },
    { title: 'Maçã Gala', categories: ['Frutas', 'Hortifruti'], image: 'new', brand: 'Hoje' },
  ), {
    brand: { before: { __auditAbsent: true }, after: 'Hoje' },
    categories: { before: ['Frutas'], after: ['Frutas', 'Hortifruti'] },
    description: { before: '', after: { __auditAbsent: true } },
    image: { before: 'old', after: 'new' },
    title: { before: 'Maçã', after: 'Maçã Gala' },
  });
});

test('distinguishes a missing property from a property explicitly set to null', () => {
  assert.deepEqual(getProductAuditChanges({ previous: null, removed: 'valor' }, { previous: null }), {
    removed: { before: 'valor', after: { __auditAbsent: true } },
  });
  assert.equal(formatAuditValue({ __auditAbsent: true }), 'Campo não informado');
});

test('does not report unchanged fields and stores complete immutable JSON-safe snapshots', () => {
  const product = { title: 'Arroz', categories: ['Mercearia'], image: null };
  assert.deepEqual(getProductAuditChanges(product, { ...product }), {});
  assert.deepEqual(productAuditSnapshot(product), product);
});

test('formats audit values without hiding structured data', () => {
  assert.equal(formatAuditValue(false), 'Não');
  assert.equal(formatAuditValue(['A', 'B']), 'A, B');
  assert.equal(formatAuditValue(''), '—');
});

test('resolves audit thumbnails from historical image data before the current product image', () => {
  assert.equal(getAuditProductImage({ snapshot: { image: 'created-image' } }, 'current-image'), 'created-image');
  assert.equal(getAuditProductImage({ changes: { image: { before: 'old-image', after: 'new-image' } } }, 'current-image'), 'new-image');
  assert.equal(getAuditProductImage({ changes: { image: { before: 'old-image', after: { __auditAbsent: true } } } }, 'current-image'), 'old-image');
  assert.equal(getAuditProductImage({ changes: { title: { before: 'A', after: 'B' } } }, 'current-image'), 'current-image');
  assert.equal(getAuditProductImage({ snapshot: { image: null } }), '');
});
