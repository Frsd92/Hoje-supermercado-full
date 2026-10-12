import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const businessResources = [
  'ProductLot',
  'InventoryCount',
  'InventoryCountItem',
  'InventoryOrderFulfillment',
  'InventoryLotAllocation',
  'Order',
  'OrderRefundRequest',
  'OrderRefundEvent',
  'OrderServiceRequest',
  'CouponCampaign',
  'CouponRecipient',
  'CouponRedemption',
  'LoyaltyMission',
  'LoyaltyMissionProgress',
  'LoyaltyMissionContribution',
  'LoyaltyReward',
  'LoyaltyRewardRedemption',
  'LoyaltyPointEntry',
  'LoyaltyPointAllocation',
];

const eventRows = Prisma.sql`
  SELECT
    "id", "eventOrigin" AS "source", "occurredAt", "actorId", "actorLabel", "actorType",
    "action", "method", "route", "resourceName", "resourceId", "ipAddress", "deviceType",
    "browser", "operatingSystem", "userAgent", to_jsonb("queryKeys") AS "queryKeys",
    "outcome", "snapshot", "changes", "note"
  FROM "ActivityAuditLog"
  WHERE "eventOrigin" = 'DATABASE'
    AND "resourceName" IN (${Prisma.join(businessResources)})
    AND NOT ("resourceName" = 'InventoryCountItem' AND "action" = 'CREATE')
  UNION ALL
  SELECT "id", 'PRODUCT'::text, "occurredAt", NULL::text, "actor", 'ERP'::text,
    "action", NULL::text, NULL::text, "productTitle", "productId", NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::jsonb,
    'RECORDED_CHANGE'::text, "snapshot", "changes", "note"
  FROM "ProductAuditLog"
  UNION ALL
  SELECT audit."id", 'SUPPLIER'::text, audit."occurredAt", NULL::text, audit."actor", 'ERP'::text,
    audit."action", NULL::text, NULL::text, COALESCE(supplier."name", audit."supplierId"), audit."supplierId", NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::jsonb,
    'RECORDED_CHANGE'::text, audit."snapshot", audit."changes", audit."note"
  FROM "SupplierAuditLog" audit
  LEFT JOIN "Supplier" supplier ON supplier."id" = audit."supplierId"
  UNION ALL
  SELECT audit."id", 'INVOICE'::text, audit."occurredAt", NULL::text, audit."actor", 'ERP'::text,
    audit."action", NULL::text, NULL::text, COALESCE(invoice."invoiceNumber", audit."invoiceId"), audit."invoiceId", NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::jsonb,
    'RECORDED_CHANGE'::text, audit."snapshot", audit."changes", audit."note"
  FROM "SupplierInvoiceAuditLog" audit
  LEFT JOIN "SupplierInvoice" invoice ON invoice."id" = audit."invoiceId"
  UNION ALL
  SELECT audit."id", 'PURCHASE_ORDER'::text, audit."occurredAt", NULL::text, audit."actor", 'ERP'::text,
    audit."action", NULL::text, NULL::text, COALESCE(orderRecord."code", audit."purchaseOrderId"), audit."purchaseOrderId", NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::jsonb,
    'RECORDED_CHANGE'::text, audit."snapshot", audit."changes", audit."note"
  FROM "PurchaseOrderAuditLog" audit
  LEFT JOIN "PurchaseOrder" orderRecord ON orderRecord."id" = audit."purchaseOrderId"
`;

function parseDate(value, endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const calendarDate = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== value) return null;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}-03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });

  const params = new URL(request.url).searchParams;
  const page = Math.min(1_000_000, Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1));
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(params.get('pageSize') || '50', 10) || 50));
  const query = (params.get('q') || '').trim().slice(0, 100);
  const from = params.has('from') ? parseDate(params.get('from')) : null;
  const to = params.has('to') ? parseDate(params.get('to'), true) : null;
  if ((params.has('from') && !from) || (params.has('to') && !to)) {
    return Response.json({ error: 'Informe um intervalo de datas válido.' }, { status: 400, headers });
  }
  if (from && to && from > to) return Response.json({ error: 'A data inicial deve ser anterior à data final.' }, { status: 400, headers });

  const conditions = [];
  if (from) conditions.push(Prisma.sql`"occurredAt" >= ${from}`);
  if (to) conditions.push(Prisma.sql`"occurredAt" <= ${to}`);
  if (query) {
    const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(Prisma.sql`(
      COALESCE("actorLabel", '') ILIKE ${pattern}
      OR COALESCE("actorId", '') ILIKE ${pattern}
      OR COALESCE("actorType", '') ILIKE ${pattern}
      OR COALESCE("action", '') ILIKE ${pattern}
      OR COALESCE("source", '') ILIKE ${pattern}
      OR COALESCE("outcome", '') ILIKE ${pattern}
      OR COALESCE("route", '') ILIKE ${pattern}
      OR COALESCE("resourceName", '') ILIKE ${pattern}
      OR COALESCE("resourceId", '') ILIKE ${pattern}
      OR COALESCE("note", '') ILIKE ${pattern}
      OR COALESCE("changes"::text, '') ILIKE ${pattern}
      OR COALESCE("snapshot"::text, '') ILIKE ${pattern}
    )`);
  }
  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
  const offset = (page - 1) * pageSize;

  try {
    const [entries, countRows] = await Promise.all([
      prisma.$queryRaw(Prisma.sql`
        WITH events AS (${eventRows})
        SELECT * FROM events
        ${where}
        ORDER BY "occurredAt" DESC, "source" ASC, "id" DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      prisma.$queryRaw(Prisma.sql`
        WITH events AS (${eventRows})
        SELECT COUNT(*)::bigint AS "total" FROM events
        ${where}
      `),
    ]);
    return Response.json({
      entries,
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0),
      capturedHistoryStartsAt: entries.length ? entries.at(-1).occurredAt : null,
    }, { headers });
  } catch (error) {
    console.error('Não foi possível carregar os dados auditáveis do ERP:', error);
    return Response.json({ error: 'Não foi possível carregar os dados auditáveis.' }, { status: 500, headers });
  }
}
