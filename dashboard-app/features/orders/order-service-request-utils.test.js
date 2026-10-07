import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canApproveOrderServiceRequest,
  canRequestOrderService,
  hasOpenOrderServiceRequest,
  orderServiceRequestStatus,
  orderServiceRequestType,
} from './order-service-request-utils.js';

test('allows cancellation requests only before dispatch and exchanges for non-cancelled orders', () => {
  assert.equal(canRequestOrderService({ status: 'Recebido' }, orderServiceRequestType.cancellation), true);
  assert.equal(canRequestOrderService({ status: 'Em transito' }, orderServiceRequestType.cancellation), false);
  assert.equal(canRequestOrderService({ status: 'Concluido' }, orderServiceRequestType.exchange), true);
  assert.equal(canRequestOrderService({ status: 'Cancelado' }, orderServiceRequestType.exchange), false);
});

test('detects an existing open request of the same type', () => {
  const requests = [
    { type: orderServiceRequestType.cancellation, status: orderServiceRequestStatus.rejected },
    { type: orderServiceRequestType.exchange, status: orderServiceRequestStatus.requested },
  ];

  assert.equal(hasOpenOrderServiceRequest(requests, orderServiceRequestType.cancellation), false);
  assert.equal(hasOpenOrderServiceRequest(requests, orderServiceRequestType.exchange), true);
});

test('ERP can approve cancellation only before dispatch', () => {
  assert.equal(canApproveOrderServiceRequest({
    type: orderServiceRequestType.cancellation,
    status: orderServiceRequestStatus.requested,
    orderStatus: 'Separacao',
  }), true);
  assert.equal(canApproveOrderServiceRequest({
    type: orderServiceRequestType.cancellation,
    status: orderServiceRequestStatus.requested,
    orderStatus: 'Em transito',
  }), false);
});
