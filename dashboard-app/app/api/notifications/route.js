import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';
import { isNotificationVisibleToCustomer } from '@/lib/notification-visibility';
import { promises as fs } from 'fs';
import path from 'path';

const notificationsFile = path.join(process.cwd(), 'data', 'notifications.json');

async function readNotifications() {
  try {
    const notifications = JSON.parse(await fs.readFile(notificationsFile, 'utf8'));
    return Array.isArray(notifications) ? notifications : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || '').toLowerCase();
  if (!email) return Response.json({ error: 'Login necessário.' }, { status: 401 });

  try {
    const [savedNotifications, savedAnnouncements, couponCampaigns] = await Promise.all([
      readNotifications(),
      prisma.customerAnnouncement.findMany({
        where: {
          expiresAt: { gt: new Date() },
          OR: [{ audience: 'all' }, { recipients: { has: email } }],
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.couponCampaign.findMany({
        where: { expiresAt: { gt: new Date() }, recipients: { some: { email } } },
        include: { recipients: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);
    const now = Date.now();
    const visibleFileNotifications = savedNotifications
      .filter((notification) => isNotificationVisibleToCustomer(notification, email, now))
      .slice(-30)
      .reverse();
    const visibleNotifications = savedAnnouncements.map((notification) => ({
      ...notification,
      createdAt: notification.createdAt.toISOString(),
      expiresAt: notification.expiresAt.toISOString(),
    }));
    const couponNotifications = couponCampaigns.map((campaign) => ({
      id: campaign.id,
      title: 'Um desconto especial para você',
      message: campaign.message,
      audience: 'selected',
      recipients: campaign.recipients.map((recipient) => recipient.email),
      type: 'promotion',
      durationDays: Math.max(1, Math.ceil((campaign.expiresAt.getTime() - campaign.createdAt.getTime()) / 86400000)),
      expiresAt: campaign.expiresAt.toISOString(),
      createdAt: campaign.createdAt.toISOString(),
      coupon: { code: campaign.code, discountPercent: campaign.discountPercent, expiresAt: campaign.expiresAt.toISOString() },
    }));
    return Response.json({ notifications: [...couponNotifications, ...visibleNotifications, ...visibleFileNotifications].slice(0, 30) });
  } catch (error) {
    console.error('Não foi possível carregar as notificações do cliente:', error);
    return Response.json({ error: 'Não foi possível carregar suas notificações.' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });
  const actor = erpActorLabel(session?.user);

  const body = await request.json();
  const title = String(body?.title || '').trim();
  const message = String(body?.message || '').trim();
  const durationDays = Number(body?.durationDays);
  const audience = body?.audience === 'selected' ? 'selected' : 'all';
  const recipients = Array.isArray(body?.recipients)
    ? [...new Set(body.recipients.map((email) => String(email).trim().toLowerCase()).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))]
    : [];

  if (!title || !message || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365 || (audience === 'selected' && !recipients.length)) {
    return Response.json({ error: 'Informe título, mensagem, duração entre 1 e 365 dias e destinatários válidos.' }, { status: 400 });
  }

  const notification = {
    id: `NOT-${Date.now()}`,
    title,
    message,
    audience,
    recipients,
    type: String(body?.type || 'promotion'),
    durationDays,
    expiresAt: new Date(Date.now() + durationDays * 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    createdBy: actor,
  };

  try {
    const savedNotification = await prisma.customerAnnouncement.create({ data: notification });
    return Response.json({ notification: savedNotification }, { status: 201 });
  } catch (error) {
    console.error('Não foi possível salvar o comunicado do ERP:', error);
    return Response.json({ error: 'Não foi possível salvar o comunicado agora.' }, { status: 500 });
  }
}
