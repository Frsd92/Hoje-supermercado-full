import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const sinceValue = new URL(request.url).searchParams.get('since');
  const since = new Date(sinceValue || '');
  if (!sinceValue || Number.isNaN(since.getTime())) {
    return Response.json({ error: 'Informe um horário válido para verificar novos cadastros.' }, { status: 400 });
  }

  try {
    const checkedAt = new Date();
    const where = { createdAt: { gt: since, lte: checkedAt } };
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: { id: true, email: true, name: true, createdAt: true },
      }),
    ]);
    const emails = users.map((user) => user.email.trim().toLowerCase());
    const profiles = emails.length
      ? await prisma.customerProfile.findMany({
        where: { email: { in: emails } },
        select: { email: true, fullName: true },
      })
      : [];
    const profileNames = new Map(profiles.map((profile) => [profile.email.trim().toLowerCase(), profile.fullName]));

    return Response.json({
      checkedAt: checkedAt.toISOString(),
      total,
      signups: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: profileNames.get(user.email.trim().toLowerCase()) || user.name || user.email,
        createdAt: user.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Não foi possível verificar os novos cadastros de clientes:', error);
    return Response.json({ error: 'Não foi possível verificar novos cadastros agora.' }, { status: 500 });
  }
}
