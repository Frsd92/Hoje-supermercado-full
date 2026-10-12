import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditEventLabel,
  classifyAuditAction,
  getAuditDevice,
  auditRelatedHref,
  auditRelatedRecords,
  auditResourceHref,
  auditResourceLabel,
  sanitizeAuditDetail,
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
  assert.equal(auditEventLabel({ action: 'UPDATE', source: 'PRODUCT' }), 'Cadastro alterado');
});

test('labels operational records and links each database audit entry to its ERP area', () => {
  const entry = {
    source: 'DATABASE',
    resourceName: 'OrderRefundEvent',
    resourceId: 'refund-event-1',
    snapshot: { action: 'requested', orderId: 'order-1', refundRequestId: 'refund-1' },
  };

  assert.equal(auditResourceLabel(entry), 'Etapa de estorno');
  assert.equal(auditResourceHref(entry), '/erp/orders');
  assert.equal(auditRelatedHref('Pedido'), '/erp/orders');
  assert.equal(auditEventLabel(entry), 'Estorno solicitado');
  assert.deepEqual(auditRelatedRecords(entry), [
    { label: 'Pedido', id: 'order-1' },
    { label: 'Solicitação de estorno', id: 'refund-1' },
  ]);
});

test('reports changed foreign keys using the new relationship when available', () => {
  assert.deepEqual(auditRelatedRecords({
    source: 'DATABASE',
    resourceName: 'OrderItem',
    resourceId: 'item-1',
    changes: {
      orderId: { before: 'old-order', after: 'new-order' },
      productId: { before: 'product-1', after: 'product-2' },
    },
  }), [
    { label: 'Produto', id: 'product-2' },
    { label: 'Pedido', id: 'new-order' },
  ]);
});

test('labels coupon redemptions and keeps their campaign and order links', () => {
  const entry = {
    source: 'DATABASE',
    resourceName: 'CouponRedemption',
    resourceId: 'redemption-1',
    snapshot: { campaignId: 'campaign-1', orderId: 'order-1' },
  };

  assert.equal(auditEventLabel(entry), 'Cupom resgatado');
  assert.equal(auditResourceHref(entry), '/erp/promotions');
  assert.deepEqual(auditRelatedRecords(entry), [
    { label: 'Pedido', id: 'order-1' },
    { label: 'Cupom', id: 'campaign-1' },
  ]);
});

test('preserves the audit fact while masking image contents and oversized payloads', () => {
  assert.deepEqual(sanitizeAuditDetail({
    image: 'data:image/png;base64,secret-image',
    title: 'Arroz',
    note: 'x'.repeat(4097),
  }), {
    image: '[Conteúdo protegido; alteração registrada]',
    title: 'Arroz',
    note: '[Conteúdo omitido por exceder o limite de auditoria]',
  });
  assert.deepEqual(sanitizeAuditDetail({
    image: {
      before: 'data:image/png;base64,old',
      after: 'data:image/png;base64,new',
      redacted: false,
    },
    logoPresent: true,
  }), {
    image: {
      before: '[Conteúdo protegido; alteração registrada]',
      after: '[Conteúdo protegido; alteração registrada]',
      redacted: true,
    },
    logoPresent: true,
  });
});
