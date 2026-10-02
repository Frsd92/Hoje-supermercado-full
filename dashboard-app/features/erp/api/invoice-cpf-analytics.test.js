import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoiceCpfAnalytics } from './invoice-cpf-analytics.js';

test('counts consented active orders and unique requesting customers by profile gender', () => {
  const result = buildInvoiceCpfAnalytics([
    { id: '1', customerEmail: 'homem@example.com', customerName: 'João', includeCpfOnReceipt: true },
    { id: '2', customerEmail: 'HOMEM@example.com', customerName: 'João', includeCpfOnReceipt: true },
    { id: '3', customerEmail: 'mulher@example.com', customerName: 'Maria', includeCpfOnReceipt: true },
    { id: '4', customerEmail: 'cancelado@example.com', includeCpfOnReceipt: true, status: 'Cancelado' },
    { id: '5', customerEmail: 'sem-consentimento@example.com', includeCpfOnReceipt: false },
  ], [
    { email: 'homem@example.com', fullName: 'João da Silva', gender: 'masculino' },
    { email: 'mulher@example.com', fullName: 'Maria Souza', gender: 'feminino' },
  ]);

  assert.equal(result.totalOrders, 3);
  assert.equal(result.totalCustomers, 2);
  assert.deepEqual(result.gender, [
    { label: 'Masculino', customers: 1, orders: 2 },
    { label: 'Feminino', customers: 1, orders: 1 },
    { label: 'Não informado', customers: 0, orders: 0 },
  ]);
  assert.deepEqual(result.requesters.map(({ name, requests }) => ({ name, requests })), [
    { name: 'João da Silva', requests: 2 },
    { name: 'Maria Souza', requests: 1 },
  ]);
});

test('keeps customers without a usable email separate and treats missing gender as undisclosed', () => {
  const result = buildInvoiceCpfAnalytics([
    { id: 'legacy-1', customerName: 'Cliente um', includeCpfOnReceipt: true },
    { id: 'legacy-2', customerName: 'Cliente dois', includeCpfOnReceipt: true },
  ], []);

  assert.equal(result.totalCustomers, 2);
  assert.deepEqual(result.gender[2], { label: 'Não informado', customers: 2, orders: 2 });
});
