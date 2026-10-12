import { createHmac, timingSafeEqual } from 'node:crypto';
import { getAuditDevice, sanitizeAuditRoute } from '@/features/erp/api/activity-audit';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const allowedActions = new Set(['PAGE_VIEW', 'DATA_READ', 'COMMAND', 'UPDATE', 'DELETE', 'AUTH', 'REQUEST']);
const allowedOutcomes = new Set(['REQUEST_RECEIVED', 'LOGIN_REQUIRED', 'ACCESS_DENIED']);

function safeText(value, maxLength, fallback = '') {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) || fallback : fallback;
}

function signatureIsValid(body, signature, secret) {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function POST(request) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return Response.json({ error: 'Auditoria indisponível: segredo de assinatura não configurado.' }, { status: 503, headers });
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 8_192) return Response.json({ error: 'Evento de auditoria excede o tamanho permitido.' }, { status: 413, headers });

  let body;
  try {
    body = await request.text();
  } catch (error) {
    console.error('Não foi possível ler evento de auditoria:', error);
    return Response.json({ error: 'Não foi possível ler o evento de auditoria.' }, { status: 400, headers });
  }
  if (body.length > 8_192 || !signatureIsValid(body, request.headers.get('x-audit-signature'), secret)) {
    return Response.json({ error: 'Assinatura do evento de auditoria inválida.' }, { status: 401, headers });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return Response.json({ error: 'Evento de auditoria malformado.' }, { status: 400, headers });
  }
  if (!event || typeof event !== 'object'
    || typeof event.eventKey !== 'string'
    || !/^[\da-f-]{36}$/i.test(event.eventKey)
    || !allowedActions.has(event.action)
    || !allowedOutcomes.has(event.outcome)) {
    return Response.json({ error: 'Campos obrigatórios do evento de auditoria inválidos.' }, { status: 400, headers });
  }

  const userAgent = safeText(event.userAgent, 512);
  const device = getAuditDevice(userAgent);
  const queryKeys = Array.isArray(event.queryKeys)
    ? [...new Set(event.queryKeys.filter((key) => typeof key === 'string').map((key) => key.slice(0, 64)))].slice(0, 40)
    : [];
  try {
    await prisma.activityAuditLog.create({
      data: {
        eventKey: event.eventKey,
        eventOrigin: 'ACCESS',
        actorId: safeText(event.actorId, 200) || null,
        actorLabel: safeText(event.actorLabel, 150, 'Visitante não autenticado'),
        actorType: ['ERP', 'CLIENTE', 'VISITANTE'].includes(event.actorType) ? event.actorType : 'VISITANTE',
        action: event.action,
        method: safeText(event.method, 12, 'GET').toUpperCase(),
        route: sanitizeAuditRoute(safeText(event.route, 300, '/')),
        resourceName: safeText(event.resourceName, 300, '/'),
        ipAddress: safeText(event.ipAddress, 64) || null,
        deviceType: device.deviceType,
        browser: device.browser,
        operatingSystem: device.operatingSystem,
        userAgent: userAgent || null,
        queryKeys,
        outcome: event.outcome,
      },
    });
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    if (error?.code === 'P2002') return Response.json({ ok: true, duplicate: true }, { headers });
    console.error('Não foi possível persistir evento de auditoria:', error);
    return Response.json({ error: 'Não foi possível gravar o evento de auditoria.' }, { status: 500, headers });
  }
}
