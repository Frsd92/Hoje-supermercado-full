import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';
import { abandonedCartIdleThresholdHours } from './abandoned-carts.js';

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'O conteúdo enviado não é um JSON válido.' }, { status: 400 });
  }

  const email = String(body?.email || '').trim().toLowerCase();
  const updatedAtValue = String(body?.updatedAt || '').trim();
  const expectedUpdatedAt = new Date(updatedAtValue);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !updatedAtValue || !Number.isFinite(expectedUpdatedAt.getTime())) {
    return Response.json({ error: 'Informe um cliente e uma data de atividade válidos.' }, { status: 400 });
  }

  const idleCutoff = new Date(Date.now() - abandonedCartIdleThresholdHours * 60 * 60 * 1000);
  try {
    const result = await prisma.customerCart.updateMany({
      where: {
        email,
        updatedAt: { equals: expectedUpdatedAt, lte: idleCutoff },
      },
      data: { items: [] },
    });
    if (result.count !== 1) {
      return Response.json({ error: 'Este carrinho foi removido ou atualizado. Atualize o Analytics antes de tentar novamente.' }, { status: 409 });
    }
    return Response.json({ cleared: true, email });
  } catch (error) {
    console.error('Não foi possível zerar o carrinho pelo ERP:', error);
    return Response.json({ error: 'Não foi possível zerar o carrinho agora. Tente novamente.' }, { status: 500 });
  }
}
