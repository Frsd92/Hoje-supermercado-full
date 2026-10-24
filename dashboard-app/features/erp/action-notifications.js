import { orderServiceRequestStatus } from '../orders/order-service-request-utils.js';
import { refundRequestStatus } from '../orders/order-refund-utils.js';

const actionableRefundStatuses = new Set([
  refundRequestStatus.requested,
  refundRequestStatus.approvedWaitingGateway,
  refundRequestStatus.gatewayFailed,
]);

export function getPendingCustomerActionCount(orders) {
  return orders.reduce((total, order) => {
    const serviceRequests = (order.serviceRequests || [])
      .filter((request) => request.status === orderServiceRequestStatus.requested).length;
    const refundRequests = (order.refundRequests || [])
      .filter((request) => actionableRefundStatuses.has(request.status)).length;
    return total + serviceRequests + refundRequests;
  }, 0);
}

export function getErpActionCounts(orders, acknowledgedOrderIds = [], newCustomerCount = 0) {
  const acknowledged = new Set(acknowledgedOrderIds);
  const pendingOrders = orders.filter((order) => order.status === 'Recebido' && !acknowledged.has(order.id)).length;
  const customerActions = getPendingCustomerActionCount(orders) + Math.max(0, Number(newCustomerCount) || 0);

  return {
    customers: customerActions,
    orders: pendingOrders + customerActions,
  };
}

export function getErpActionCountsFromSummary(pendingOrderIds, pendingCustomerActionCount = 0, acknowledgedOrderIds = [], newCustomerCount = 0) {
  const acknowledged = new Set(acknowledgedOrderIds);
  const pendingOrders = pendingOrderIds.filter((id) => !acknowledged.has(id)).length;
  const customerActions = Math.max(0, Number(pendingCustomerActionCount) || 0)
    + Math.max(0, Number(newCustomerCount) || 0);

  return {
    customers: customerActions,
    orders: pendingOrders + customerActions,
  };
}
