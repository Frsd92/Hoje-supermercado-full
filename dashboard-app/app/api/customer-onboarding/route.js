import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

const dashboardBadgeIds = new Set([
  'orders',
  'buy-again',
  'shopping-lists',
  'coupons',
  'loyalty',
  'favorites',
  'budget',
  'profile',
  'addresses',
  'payment-methods',
]);

async function getCustomerEmail() {
  const session = await getServerSession(authOptions);
  return String(session?.user?.email || '').trim().toLowerCase();
}

function getDismissedBadges(value) {
  return Array.isArray(value)
    ? value.filter((badgeId) => typeof badgeId === 'string' && dashboardBadgeIds.has(badgeId))
    : [];
}

export async function GET() {
  let email;
  try {
    email = await getCustomerEmail();
    if (!email) return Response.json({ error: 'Login necessário.' }, { status: 401 });
    const profile = await prisma.customerProfile.findUnique({
      where: { email },
      select: { dismissedDashboardBadges: true },
    });
    return Response.json({
      dismissedBadges: getDismissedBadges(profile?.dismissedDashboardBadges),
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Não foi possível carregar as novidades do painel do cliente:', error);
    return Response.json({ error: 'Não foi possível carregar as novidades agora.' }, { status: 500 });
  }
}

export async function POST(request) {
  let email;
  try {
    email = await getCustomerEmail();
    if (!email) return Response.json({ error: 'Login necessário.' }, { status: 401 });
  } catch (error) {
    console.error('Não foi possível identificar o cliente para atualizar as novidades do painel:', error);
    return Response.json({ error: 'Não foi possível atualizar as novidades agora.' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || !dashboardBadgeIds.has(body.badgeId)) {
    return Response.json({ error: 'A novidade selecionada é inválida.' }, { status: 400 });
  }

  try {
    const profile = await prisma.customerProfile.upsert({
      where: { email },
      create: {
        email,
        dismissedDashboardBadges: [body.badgeId],
      },
      update: {},
      select: { dismissedDashboardBadges: true },
    });
    const dismissedBadges = getDismissedBadges(profile.dismissedDashboardBadges);
    if (!dismissedBadges.includes(body.badgeId)) {
      dismissedBadges.push(body.badgeId);
      await prisma.customerProfile.update({
        where: { email },
        data: { dismissedDashboardBadges: dismissedBadges },
      });
    }
    return Response.json({ dismissedBadges }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Não foi possível salvar a novidade visualizada no painel:', error);
    return Response.json({ error: 'Não foi possível salvar esta alteração. Tente novamente.' }, { status: 500 });
  }
}
