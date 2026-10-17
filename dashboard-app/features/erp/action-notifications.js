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

export function getErpActionCounts(orders, acknowledgedOrderIds = []) {
  const acknowledged = new Set(acknowledgedOrderIds);
  const pendingOrders = orders.filter((order) => order.status === 'Recebido' && !acknowledged.has(order.id)).length;
  const customerActions = getPendingCustomerActionCount(orders);

  return {
    customers: customerActions,
    orders: pendingOrders + customerActions,
  };
}
