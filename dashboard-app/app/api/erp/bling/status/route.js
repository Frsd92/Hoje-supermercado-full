import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { getBlingConnectionStatus } from '@/features/erp/api/bling';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });
  try {
    return Response.json(await getBlingConnectionStatus(), { headers });
  } catch (error) {
    console.error('Não foi possível carregar a conexão com o Bling:', error);
    return Response.json({ error: 'Não foi possível carregar o status da integração.' }, { status: 500, headers });
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });
  try {
    await prisma.blingConnection.deleteMany({ where: { id: 'default' } });
    return Response.json({ connected: false }, { headers });
  } catch (error) {
    console.error('Não foi possível remover a conexão com o Bling:', error);
    return Response.json({ error: 'Não foi possível desconectar o Bling.' }, { status: 500, headers });
  }
}
