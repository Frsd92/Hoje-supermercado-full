import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { orderServiceRequestStatus } from '@/features/orders/order-service-request-utils';
import { refundRequestStatus } from '@/features/orders/order-refund-utils';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  try {
    const [pendingOrders, pendingServiceRequests, pendingRefundRequests] = await Promise.all([
      prisma.order.findMany({
        where: { status: 'Recebido' },
        select: { id: true },
      }),
      prisma.orderServiceRequest.count({
        where: { status: orderServiceRequestStatus.requested },
      }),
      prisma.orderRefundRequest.count({
        where: {
          status: {
            in: [
              refundRequestStatus.requested,
              refundRequestStatus.approvedWaitingGateway,
              refundRequestStatus.gatewayFailed,
            ],
          },
        },
      }),
    ]);

    return Response.json({
      pendingOrderIds: pendingOrders.map(({ id }) => id),
      pendingCustomerActionCount: pendingServiceRequests + pendingRefundRequests,
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Não foi possível carregar as contagens de ações pendentes do ERP:', error);
    return Response.json({ error: 'Não foi possível carregar os indicadores de ações pendentes.' }, { status: 503 });
  }
}
