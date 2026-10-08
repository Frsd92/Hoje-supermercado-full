import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { getCustomerLoyaltySnapshot, redeemLoyaltyReward } from '@/features/loyalty/service';
import { prisma } from '@/lib/prisma';

function customerEmail(session) {
  return String(session?.user?.email || '').trim().toLowerCase();
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = customerEmail(session);
  if (!email) return Response.json({ error: 'Entre na sua conta para acessar sua fidelidade.' }, { status: 401 });

  try {
    return Response.json(await getCustomerLoyaltySnapshot(prisma, email));
  } catch (error) {
    console.error('Não foi possível carregar os pontos e missões do cliente:', error);
    return Response.json({ error: 'Não foi possível carregar seus pontos agora.' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const email = customerEmail(session);
  if (!email) return Response.json({ error: 'Entre na sua conta para resgatar uma recompensa.' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Os dados do resgate são inválidos.' }, { status: 400 });
  }
  const rewardId = String(body?.rewardId || '').trim();
  const requestId = String(body?.requestId || '').trim();
  if (!rewardId || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    return Response.json({ error: 'Escolha uma recompensa e tente novamente.' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(
      (transaction) => redeemLoyaltyReward(transaction, { customerEmail: email, rewardId, requestId }),
      { isolationLevel: 'Serializable' },
    );
    if (result.error) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error?.code === 'P2034' || error?.code === 'P2002') {
      return Response.json({ error: 'O resgate concorreu com outra operação. Atualize seus pontos e tente novamente.' }, { status: 409 });
    }
    console.error('Não foi possível resgatar os pontos do cliente:', error);
    return Response.json({ error: 'Não foi possível resgatar esta recompensa agora.' }, { status: 500 });
  }
}
