import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditEventLabel,
  classifyAuditAction,
  getAuditDevice,
  sanitizeAuditRoute,
} from './activity-audit.js';

test('classifies page views, data reads, updates, commands, deletions, and authentication routes', () => {
  assert.equal(classifyAuditAction('GET', '/erp/suppliers'), 'PAGE_VIEW');
  assert.equal(classifyAuditAction('GET', '/api/erp/suppliers'), 'DATA_READ');
  assert.equal(classifyAuditAction('POST', '/api/erp/suppliers'), 'COMMAND');
  assert.equal(classifyAuditAction('PATCH', '/api/erp/suppliers'), 'UPDATE');
  assert.equal(classifyAuditAction('DELETE', '/api/erp/suppliers'), 'DELETE');
  assert.equal(classifyAuditAction('POST', '/api/auth/callback/credentials'), 'AUTH');
});

test('identifies common device, browser, and operating system families', () => {
  assert.deepEqual(getAuditDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'), {
    deviceType: 'Computador',
    browser: 'Edge',
    operatingSystem: 'Windows',
  });
  assert.deepEqual(getAuditDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1'), {
    deviceType: 'Celular',
    browser: 'Safari',
    operatingSystem: 'iOS',
  });
  assert.deepEqual(getAuditDevice(''), {
    deviceType: 'Desconhecido',
    browser: 'Desconhecido',
    operatingSystem: 'Desconhecido',
  });
});

test('redacts e-mail and CNPJ-like values from audited routes', () => {
  assert.equal(sanitizeAuditRoute('/api/customers/test%40example.com'), '/api/customers/[redacted]');
  assert.equal(sanitizeAuditRoute('/api/suppliers/12.345.678/0001-95'), '/api/suppliers/[document]');
});

test('labels generic access events for audit reports', () => {
  assert.equal(auditEventLabel({ action: 'DATA_READ' }), 'Consulta de dados');
  assert.equal(auditEventLabel({ action: 'CREATE', source: 'DATABASE' }), 'Registro criado');
});
