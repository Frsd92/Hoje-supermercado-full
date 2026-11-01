import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCustomerChangeAuditRecord,
  getChangedCustomerAddressFields,
  getChangedCustomerProfileFields,
} from './customer-change-audit.js';

test('reports changed profile fields without retaining customer values', () => {
  assert.deepEqual(getChangedCustomerProfileFields({
    fullName: 'Ana Silva',
    whatsapp: '+55 (11) 99999-1111',
    cpf: '12345678901',
    gender: 'feminino',
    birthDate: new Date('1990-01-02T00:00:00.000Z'),
    photo: 'old-photo-data',
    monthlyBudget: 500,
  }, {
    fullName: 'Ana Souza',
    whatsapp: '5511999991111',
    cpf: '123.456.789-01',
    gender: 'feminino',
    birthDate: new Date('1990-01-02T00:00:00.000Z'),
    photo: 'new-photo-data',
    monthlyBudget: 750,
  }), ['Nome completo', 'Foto do perfil', 'Orçamento mensal']);
});

test('reports added, removed, and edited saved address fields without address values', () => {
  assert.deepEqual(getChangedCustomerAddressFields([
    { id: 'home', title: 'Casa', street: 'Rua A', number: '10', city: 'São Paulo', cep: '01000-000' },
    { id: 'work', title: 'Trabalho', street: 'Rua B', number: '20', city: 'São Paulo', cep: '02000-000' },
  ], [
    { id: 'home', title: 'Casa', street: 'Rua C', number: '10', city: 'São Paulo', cep: '01000-000' },
    { id: 'new', title: 'Família', street: 'Rua D', number: '30', city: 'Campinas', cep: '13000-000' },
  ]), [
    'Casa: Logradouro',
    'Endereço adicionado: Família',
    'Endereço removido: Trabalho',
  ]);
});

test('creates a minimal audit event containing only changed-field labels', () => {
  const occurredAt = new Date('2026-10-28T12:00:00.000Z');
  const record = createCustomerChangeAuditRecord({
    email: 'ana@example.com',
    resourceName: 'CustomerProfile',
    action: 'UPDATE',
    fields: ['Nome completo', 'CPF'],
    now: occurredAt,
  });

  assert.equal(record.eventOrigin, 'CUSTOMER_PROFILE');
  assert.equal(record.resourceId, 'ana@example.com');
  assert.equal(record.occurredAt, occurredAt);
  assert.deepEqual(record.changes, { fields: ['Nome completo', 'CPF'] });
  assert.equal('snapshot' in record, false);
});
