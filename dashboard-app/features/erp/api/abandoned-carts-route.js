import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';
import { abandonedCartIdleThresholdHours, getGuestCartActionRef } from './abandoned-carts.js';

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'O conteúdo enviado não é um JSON válido.' }, { status: 400 });
  }

  const cartType = body?.cartType;
  const email = String(body?.email || '').trim().toLowerCase();
  const cartRef = String(body?.cartRef || '').trim().toLowerCase();
  const updatedAtValue = String(body?.updatedAt || '').trim();
  const expectedUpdatedAt = new Date(updatedAtValue);
  const customerCart = cartType === 'customer' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const guestCart = cartType === 'guest' && /^[a-f0-9]{64}$/.test(cartRef);
  if ((!customerCart && !guestCart) || !updatedAtValue || !Number.isFinite(expectedUpdatedAt.getTime())) {
    return Response.json({ error: 'Informe um carrinho e uma data de atividade válidos.' }, { status: 400 });
  }

  const idleCutoff = new Date(Date.now() - abandonedCartIdleThresholdHours * 60 * 60 * 1000);
  try {
    let result;
    if (customerCart) {
      result = await prisma.customerCart.updateMany({
        where: {
          email,
          updatedAt: { equals: expectedUpdatedAt, lte: idleCutoff },
        },
        data: { items: [] },
      });
    } else {
      const candidates = await prisma.guestCart.findMany({
        where: { updatedAt: { equals: expectedUpdatedAt, lte: idleCutoff } },
        select: { id: true, items: true },
      });
      const match = candidates.find((candidate) => (
        getGuestCartActionRef(candidate.id) === cartRef
        && Array.isArray(candidate.items)
        && candidate.items.length > 0
      ));
      if (!match) {
        return Response.json({ error: 'Este carrinho foi removido ou atualizado. Atualize o Analytics antes de tentar novamente.' }, { status: 409 });
      }
      result = await prisma.guestCart.updateMany({
        where: { id: match.id, updatedAt: { equals: expectedUpdatedAt, lte: idleCutoff } },
        data: { items: [] },
      });
    }
    if (result.count !== 1) {
      return Response.json({ error: 'Este carrinho foi removido ou atualizado. Atualize o Analytics antes de tentar novamente.' }, { status: 409 });
    }
    return Response.json({ cleared: true, cartType });
  } catch (error) {
    console.error('Não foi possível zerar o carrinho pelo ERP:', error);
    return Response.json({ error: 'Não foi possível zerar o carrinho agora. Tente novamente.' }, { status: 500 });
  }
}
