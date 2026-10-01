import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const supplierId = new URL(request.url).searchParams.get('supplierId')?.trim();
  if (!supplierId) return Response.json({ error: 'Informe o fornecedor para consultar a auditoria.' }, { status: 400 });

  try {
    const entries = await prisma.supplierAuditLog.findMany({
      where: { supplierId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
    return Response.json({ entries }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    console.error('Não foi possível carregar auditoria de fornecedor:', error);
    return Response.json({ error: 'Não foi possível carregar a auditoria do fornecedor.' }, { status: 500 });
  }
}
