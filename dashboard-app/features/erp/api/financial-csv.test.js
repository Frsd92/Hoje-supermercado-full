import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseChartAccountsCsv } from './financial-csv.js';

test('parses the supplied semicolon chart CSV with an accented header and quoted delimiters', () => {
  const accounts = parseChartAccountsCsv('\uFEFFcódigo;nome;natureza;comportamento\r\n1.1;"Vendas; Loja física";RECEITA;\r\n3.4.1;Aluguel;DESPESA;OUTRA\r\n');
  assert.deepEqual(accounts, [
    { code: '1.1', name: 'Vendas; Loja física', nature: 'REVENUE', expenseBehavior: null },
    { code: '3.4.1', name: 'Aluguel', nature: 'EXPENSE', expenseBehavior: 'OTHER' },
  ]);
});

test('parses comma-delimited files and rejects duplicate codes', () => {
  assert.deepEqual(parseChartAccountsCsv('code,name,nature,expenseBehavior\n1.1,Sales,REVENUE,\n'), [
    { code: '1.1', name: 'Sales', nature: 'REVENUE', expenseBehavior: null },
  ]);
  assert.throws(
    () => parseChartAccountsCsv('code,name,nature,expenseBehavior\n1,A,REVENUE,\n1,B,REVENUE,\n'),
    /aparece mais de uma vez/,
  );
});

test('rejects malformed rows, unsupported expense classifications, and unclosed quotes', () => {
  assert.throws(() => parseChartAccountsCsv('code,name,nature,expenseBehavior\n'), /ao menos uma conta/);
  assert.throws(() => parseChartAccountsCsv('code,name,nature,expenseBehavior\n3.1,Payroll,EXPENSE,'), /comportamento de despesa/);
  assert.throws(() => parseChartAccountsCsv('code,name,nature,expenseBehavior\n1,"Sales,REVENUE,'), /aspa sem fechamento/);
});

test('imports the 180-account hierarchy from the supplied Hoje chart CSV', async () => {
  const csv = await readFile(new URL('../../../public/dados/plano-contas-hoje.csv', import.meta.url), 'utf8');
  const accounts = parseChartAccountsCsv(csv);
  assert.equal(accounts.length, 180);
  assert.ok(accounts.some((account) => account.code === '1.1.1' && account.nature === 'REVENUE'));
  assert.ok(accounts.some((account) => account.code === '2.3.1' && account.expenseBehavior === 'VARIABLE'));
  assert.ok(accounts.some((account) => account.code === '3.7.3'));
  assert.ok(accounts.some((account) => account.code === '4.6.5' && account.name === 'Devoluções e reembolsos de garantias'));
});
