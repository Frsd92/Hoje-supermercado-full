import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeNcmEntries,
  fetchOfficialNcmTable,
  findNcmEntries,
  matchNcmXmlItems,
  normalizeNcmCode,
  validateChangedProductNcm,
} from './product-ncm.js';

const table = {
  Nomenclaturas: [
    { Codigo: '0101.21.00', Descricao: 'Cavalos reprodutores', Data_Fim: '9999-12-31' },
    { Codigo: '0201.10.00', Descricao: 'Carne bovina fresca', Data_Fim: '9999-12-31' },
    { Codigo: '0201.20.00', Descricao: 'Código expirado', Data_Fim: '2020-01-01' },
    { Codigo: '02.01', Descricao: 'Grupo de códigos', Data_Fim: '9999-12-31' },
  ],
};

test('normalizes NCM codes without accepting unrelated characters', () => {
  assert.equal(normalizeNcmCode('0101.21.00'), '01012100');
  assert.equal(normalizeNcmCode('0201-10-00'), '02011000');
  assert.equal(normalizeNcmCode('01ABC100'), '');
});

test('keeps only current eight-digit NCM entries and searches by code or description', () => {
  const entries = activeNcmEntries(table, new Date('2026-10-21T12:00:00Z'));
  assert.deepEqual(entries.map((entry) => entry.code), ['01012100', '02011000']);
  assert.deepEqual(findNcmEntries(entries, 'carne'), [entries[1]]);
  assert.deepEqual(findNcmEntries(entries, '0101'), [entries[0]]);
});

test('rejects invalid changed product NCM values and skips unchanged values', async () => {
  await assert.rejects(
    validateChangedProductNcm({ ncm: '12' }, null),
    /8 dígitos/,
  );
  await validateChangedProductNcm({ ncm: '01012100' }, { ncm: '01012100' });
  await validateChangedProductNcm({ ncm: '' }, { ncm: '01012100' });
});

test('allows saving a changed NCM as pending when the official source is unavailable', async () => {
  const validation = await validateChangedProductNcm(
    { ncm: '01012100' },
    null,
    async () => {
      const error = new Error('Official NCM source unavailable');
      error.status = 502;
      throw error;
    },
  );

  assert.deepEqual(validation, { status: 'pending' });
});

test('still rejects a changed NCM explicitly reported as inactive', async () => {
  await assert.rejects(
    validateChangedProductNcm(
      { ncm: '01012100' },
      null,
      async () => ({ valid: false, error: 'NCM inativo' }),
    ),
    (error) => error.status === 422 && error.message === 'NCM inativo',
  );
});

test('marks a changed NCM verified when the official validator confirms it', async () => {
  const validation = await validateChangedProductNcm(
    { ncm: '01012100' },
    null,
    async () => ({ valid: true }),
  );

  assert.deepEqual(validation, { status: 'verified' });
});

test('retries transient failures from the official NCM source', async () => {
  let attempts = 0;
  const result = await fetchOfficialNcmTable(async () => {
    attempts += 1;
    if (attempts === 1) return { ok: false, status: 503 };
    return { ok: true, json: async () => table };
  });

  assert.equal(attempts, 2);
  assert.equal(result, table);
});

test('does not cache temporary responses from the official NCM source', async () => {
  let requestOptions;
  await fetchOfficialNcmTable(async (_url, options) => {
    requestOptions = options;
    return { ok: true, json: async () => table };
  });

  assert.equal(requestOptions.cache, 'no-store');
  assert.equal('next' in requestOptions, false);
});

test('does not retry permanent client errors from the official NCM source', async () => {
  let attempts = 0;
  await assert.rejects(
    fetchOfficialNcmTable(async () => {
      attempts += 1;
      return { ok: false, status: 404 };
    }),
    (error) => error.status === 502,
  );
  assert.equal(attempts, 1);
});

test('matches imported supplier XML items by exact barcode or SKU only', () => {
  assert.deepEqual(matchNcmXmlItems([
    { ean: '7891234567890', supplierProductCode: 'ABC', ncm: '0201.10.00', description: 'Carne' },
    { ean: '7890000000000', supplierProductCode: 'sku-2', ncm: '0101.21.00', description: 'Outro' },
  ], { barcode: '7891234567890', sku: 'sku-2' }).map((item) => item.matchType), ['barcode', 'sku']);
});
