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

test('accepts Brazilian currency and normalizes optional address fields', () => {
  const { data } = validateSupplier({
    name: 'Real',
    minimumOrderValue: '1.234,56',
    state: 'sp',
    postalCode: '01001-000',
    address: 'Praça da Sé',
    addressNumber: '100',
    neighborhood: 'Sé',
  });

  assert.equal(data.minimumOrderValue, 1234.56);
  assert.equal(data.state, 'SP');
  assert.equal(data.postalCode, '01001000');
  assert.equal(data.address, 'Praça da Sé');
  assert.equal(data.addressNumber, '100');
  assert.equal(data.neighborhood, 'Sé');
});

test('stores supplier exchange policies as independent boolean options', () => {
  const { data } = validateSupplier({
    name: 'Real',
    acceptsExpiredProductExchange: true,
    acceptsDamagedProductExchange: false,
  });

  assert.equal(data.acceptsExpiredProductExchange, true);
  assert.equal(data.acceptsDamagedProductExchange, false);
  assert.equal(validateSupplier({ name: 'Outro fornecedor' }).data.acceptsExpiredProductExchange, false);
  assert.equal(validateSupplier({ name: 'Outro fornecedor' }).data.acceptsDamagedProductExchange, false);
});

test('rejects malformed Brazilian address and out-of-range currency fields', () => {
  assert.match(validateSupplier({ name: 'Real', minimumOrderValue: '12,345' }).error, /duas casas decimais/);
  assert.match(validateSupplier({ name: 'Real', minimumOrderValue: '10.000.000.000,00' }).error, /duas casas decimais/);
  assert.match(validateSupplier({ name: 'Real', state: 'São Paulo' }).error, /UF com duas letras/);
  assert.match(validateSupplier({ name: 'Real', postalCode: '1234' }).error, /CEP com oito dígitos/);
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

test('validates optional supplier logo data and excludes image content from audit snapshots', () => {
  const logoData = `data:image/webp;base64,${'A'.repeat(128)}`;
  const { data } = validateSupplier({ name: 'Real', logoData });
  assert.equal(data.logoData, logoData);
  assert.equal(data.logoMimeType, 'image/webp');
  assert.match(validateSupplier({ name: 'Real', logoData: 'data:text/html;base64,PHNjcmlwdD4=' }).error, /imagem WEBP/);
  assert.match(validateSupplier({ name: 'Real', logoData: `data:image/png;base64,${'A'.repeat(350_000)}` }).error, /256 KB/);

  const snapshot = supplierAuditSnapshot({
    id: 's1',
    logoData,
    logoMimeType: 'image/webp',
    name: 'Real',
  });
  assert.equal(snapshot.logoPresent, true);
  assert.equal('logoData' in snapshot, false);
  assert.equal('logoMimeType' in snapshot, false);
});

test('supplier audit reports logo presence changes without retaining image data', () => {
  const changes = supplierChanges(
    supplierAuditSnapshot({ id: 's1', name: 'Real', logoData: null, logoMimeType: null }),
    supplierAuditSnapshot({ id: 's1', name: 'Real', logoData: 'private-image-data', logoMimeType: 'image/webp' }),
  );
  assert.deepEqual(changes.logoPresent, { before: false, after: true });
  assert.equal('logoData' in changes, false);
});
