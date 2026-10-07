export const orderServiceRequestType = Object.freeze({
  cancellation: 'cancellation',
  exchange: 'exchange',
});

export const orderServiceRequestStatus = Object.freeze({
  requested: 'requested',
  approved: 'approved',
  rejected: 'rejected',
});

export const orderServiceRequestTypeLabels = Object.freeze({
  [orderServiceRequestType.cancellation]: 'Pedido de cancelamento',
  [orderServiceRequestType.exchange]: 'Pedido de troca',
});

export const orderServiceRequestStatusLabels = Object.freeze({
  [orderServiceRequestStatus.requested]: 'Aguardando atendimento',
  [orderServiceRequestStatus.approved]: 'Aprovado pela loja',
  [orderServiceRequestStatus.rejected]: 'Recusado',
});

const cancellableOrderStatuses = new Set(['Recebido', 'Separacao', 'Expedicao']);

export function isOrderServiceRequestType(type) {
  return Object.values(orderServiceRequestType).includes(type);
}

export function canRequestOrderService(order, type) {
  if (!isOrderServiceRequestType(type) || order?.status === 'Cancelado') return false;
  return type === orderServiceRequestType.exchange || cancellableOrderStatuses.has(order?.status);
}

export function hasOpenOrderServiceRequest(requests, type) {
  return Array.isArray(requests) && requests.some((request) => (
    request?.type === type && request.status === orderServiceRequestStatus.requested
  ));
}

export function canApproveOrderServiceRequest(request) {
  if (request?.status !== orderServiceRequestStatus.requested) return false;
  return request.type !== orderServiceRequestType.cancellation
    || cancellableOrderStatuses.has(request.orderStatus);
}
