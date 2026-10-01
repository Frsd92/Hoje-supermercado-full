import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const searchParams = new URL(request.url).searchParams;
  const productId = searchParams.get('productId')?.trim();
  const search = searchParams.get('q')?.trim();
  const action = searchParams.get('action')?.trim();
  const from = searchParams.get('from')?.trim();
  const to = searchParams.get('to')?.trim();
  const cursor = searchParams.get('cursor')?.trim();
  const requestedLimit = Number(searchParams.get('limit') || 50);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
  const dateFrom = from ? new Date(`${from}T00:00:00.000-03:00`) : null;
  const dateTo = to ? new Date(`${to}T23:59:59.999-03:00`) : null;
  if ((dateFrom && Number.isNaN(dateFrom.getTime())) || (dateTo && Number.isNaN(dateTo.getTime()))) {
    return Response.json({ error: 'Informe um período válido para consultar a auditoria.' }, { status: 400 });
  }

  try {
    const product = productId ? await prisma.product.findFirst({
      where: { OR: [{ externalId: productId }, { id: productId }] },
      select: { id: true, externalId: true },
    }) : null;
    const conditions = [];
    let matchingProductIds = [];
    if (search) {
      const matchingProducts = await prisma.product.findMany({
        where: {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { externalId: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { barcode: { contains: search, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      matchingProductIds = matchingProducts.map(({ id }) => id);
    }
    if (productId) {
      conditions.push(product
        ? { OR: [{ productId: product.id }, { productExternalId: product.externalId || productId }] }
        : { OR: [{ productExternalId: productId }, { productId }] });
    }
    if (search) {
      conditions.push({
        OR: [
          { productTitle: { contains: search, mode: 'insensitive' } },
          { productExternalId: { contains: search, mode: 'insensitive' } },
          { actor: { contains: search, mode: 'insensitive' } },
          ...(matchingProductIds.length ? [{ productId: { in: matchingProductIds } }] : []),
        ],
      });
    }
    if (action) conditions.push({ action });
    if (dateFrom || dateTo) conditions.push({ occurredAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } });
    const where = conditions.length ? { AND: conditions } : {};
    const [results, total] = await Promise.all([
      prisma.productAuditLog.findMany({
        where,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: limit + 1,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      }),
      prisma.productAuditLog.count({ where }),
    ]);
    const hasMore = results.length > limit;
    const entries = hasMore ? results.slice(0, limit) : results;
    return Response.json({
      entries,
      total,
      nextCursor: hasMore ? entries.at(-1)?.id || null : null,
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    console.error('Não foi possível carregar a auditoria do produto:', error);
    return Response.json({ error: 'Não foi possível carregar a auditoria. Verifique a conexão com o banco de dados.' }, { status: 500 });
  }
}
