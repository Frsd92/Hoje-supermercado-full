import assert from 'node:assert/strict';
import test from 'node:test';
import { getBlingFieldSyncStatus, verifyBlingProductPayload } from './bling-product-verification.js';

const payload = {
  nome: 'Arroz Hoje',
  codigo: 'ARROZ-1',
  preco: 8,
  gtin: '7891234567890',
  tributacao: { ncm: '10063021' },
};

test('confirms only fields read back with the exact values sent to Bling', () => {
  const result = verifyBlingProductPayload(payload, {
    nome: 'Arroz Hoje',
    codigo: 'ARROZ-1',
    preco: 8,
    gtin: '7891234567890',
    tributacao: { ncm: '1006.30.21' },
  });

  assert.deepEqual(result.mismatches, []);
  assert.equal(result.verifiedData.fields.ncm, '1006.30.21');
});

test('reports fields missing or different in Bling read-back', () => {
  const result = verifyBlingProductPayload(payload, {
    nome: 'Arroz Hoje',
    codigo: 'ARROZ-1',
    preco: 8,
    gtin: '7891234567890',
    tributacao: { ncm: '10061000' },
  });

  assert.deepEqual(result.mismatches, ['ncm']);
  assert.equal(getBlingFieldSyncStatus(result.verifiedData, 'ncm', '10063021'), 'divergent');
  assert.equal(getBlingFieldSyncStatus(result.verifiedData, 'ncm', '10061000'), 'confirmed');
});

test('field badges distinguish confirmed, pending, divergent, and missing values', () => {
  const verifiedData = {
    fields: { ncm: '1006.30.21', barcode: null },
  };

  assert.equal(getBlingFieldSyncStatus(verifiedData, 'ncm', '10063021'), 'confirmed');
  assert.equal(getBlingFieldSyncStatus(verifiedData, 'ncm', '19059090'), 'pending');
  assert.equal(getBlingFieldSyncStatus(verifiedData, 'barcode', '7891234567890'), 'divergent');
  assert.equal(getBlingFieldSyncStatus(verifiedData, 'ncm', ''), 'missing');
  assert.equal(getBlingFieldSyncStatus(null, 'ncm', '10063021'), 'pending');
});
