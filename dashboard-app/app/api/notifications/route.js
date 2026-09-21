import { promises as fs } from 'fs';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

const notificationsFile = path.join(process.cwd(), 'data', 'notifications.json');

async function readNotifications() {
  try {
    const notifications = JSON.parse(await fs.readFile(notificationsFile, 'utf8'));
    return Array.isArray(notifications) ? notifications : [];
  } catch {
    return [];
  }
}

function allowedERP(email) {
  return (process.env.ERP_ALLOWED_EMAILS || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean).includes(String(email || '').toLowerCase());
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || '').toLowerCase();
  if (!email) return Response.json({ error: 'Login necessário.' }, { status: 401 });

  const notifications = await readNotifications();
  const now = Date.now();
  const visible = notifications.filter((notification) => (!notification.expiresAt || new Date(notification.expiresAt).getTime() > now) && (notification.audience === 'all' || notification.recipients.includes(email))).slice(-30).reverse();
  return Response.json({ notifications: visible });
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!allowedERP(session?.user?.email)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

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

  const notifications = await readNotifications();
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
    createdBy: session.user.email,
  };

  await fs.mkdir(path.dirname(notificationsFile), { recursive: true });
  await fs.writeFile(notificationsFile, JSON.stringify([...notifications, notification], null, 2), 'utf8');
  return Response.json({ notification }, { status: 201 });
}
