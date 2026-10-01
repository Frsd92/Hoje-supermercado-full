import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSupplierName,
  normalizeSupplierTaxId,
  supplierAuditSnapshot,
  supplierChanges,
  validateSupplier,
} from './supplier-data.js';

test('normalizes supplier names and tax identifiers for duplicate checks', () => {
  assert.equal(normalizeSupplierName('  SÃO   PAULO Distribuição '), 'sao paulo distribuicao');
  assert.equal(normalizeSupplierTaxId('12.345.678/0001-95'), '12345678000195');
});

test('validates CPF and CNPJ checksums without accepting repeated digits', () => {
  assert.equal(validateSupplier({ name: 'Fornecedor', taxId: '529.982.247-25' }).data.taxId, '52998224725');
  assert.equal(validateSupplier({ name: 'Fornecedor', taxId: '12.345.678/0001-95' }).data.taxId, '12345678000195');
  assert.match(validateSupplier({ name: 'Fornecedor', taxId: '11.111.111/1111-11' }).error, /CNPJ válido/);
  assert.match(validateSupplier({ name: 'Fornecedor', taxId: '12345678900' }).error, /CPF ou CNPJ válido/);
});

test('requires a real supplier name, validates email and commercial minimum, and defaults status to review', () => {
  assert.match(validateSupplier({}).error, /nome do fornecedor/);
  assert.match(validateSupplier({ name: 'Real', email: 'not-an-email' }).error, /endereços de e-mail/);
  assert.match(validateSupplier({ name: 'Real', minimumOrderValue: '-1' }).error, /pedido mínimo/);
  const { data } = validateSupplier({ name: 'Real', categories: ['Bebidas', 'Bebidas', ' '] });
  assert.equal(data.status, 'Em Análise');
  assert.deepEqual(data.categories, ['Bebidas']);
});

test('captures exact before and after values for supplier audit entries', () => {
  assert.deepEqual(supplierChanges(
    { name: 'Fornecedor A', status: 'Em Análise', phone: null },
    { name: 'Fornecedor A', status: 'Ativo', phone: '11999999999' },
  ), {
    phone: { before: null, after: '11999999999' },
    status: { before: 'Em Análise', after: 'Ativo' },
  });
});

test('keeps public supplier snapshots free of internal identity keys', () => {
  const snapshot = supplierAuditSnapshot({ id: 's1', name: 'Real', identityName: 'real', identityTaxId: '123' });
  assert.equal(snapshot.id, 's1');
  assert.equal('identityTaxId' in snapshot, false);
});
