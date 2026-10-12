import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import { hasCustomerDashboardAccess } from './features/auth/access.js';
import { hasErpAccess } from './features/erp/access.js';
import { classifyAuditAction, getAuditDevice, sanitizeAuditRoute } from './features/erp/api/activity-audit.js';

const erpPaths = ['/erp', '/dashboard/erp'];
const customerDashboardPaths = ['/dashboard'];

async function signAuditPayload(body, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function recordRequest(request, token, outcome, event) {
  const pathname = request.nextUrl.pathname;
  const isApi = pathname.startsWith('/api/');
  if (pathname === '/api/audit/ingest' || pathname.startsWith('/_next/')) return;
  if (!isApi && (pathname.includes('.') || pathname === '/favicon.ico')) return;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error('Não foi possível registrar auditoria: NEXTAUTH_SECRET não está configurado.');
    return;
  }

  const userAgent = request.headers.get('user-agent') || '';
  const device = getAuditDevice(userAgent);
  const actorId = token?.id || token?.sub || token?.erpUsername || token?.email || null;
  const actorType = token?.erpAccess === true ? 'ERP' : token ? 'CLIENTE' : 'VISITANTE';
  const actorLabel = token?.erpUsername || token?.name || token?.email || 'Visitante não autenticado';
  const eventPayload = {
    eventKey: crypto.randomUUID(),
    actorId: typeof actorId === 'string' ? actorId.slice(0, 200) : null,
    actorLabel: String(actorLabel).slice(0, 150),
    actorType,
    action: classifyAuditAction(request.method, pathname),
    method: request.method.slice(0, 12).toUpperCase(),
    route: sanitizeAuditRoute(pathname),
    resourceName: sanitizeAuditRoute(pathname),
    ipAddress: (request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || '').trim().slice(0, 64) || null,
    deviceType: device.deviceType,
    browser: device.browser,
    operatingSystem: device.operatingSystem,
    userAgent: userAgent.slice(0, 512) || null,
    queryKeys: [...new Set([...request.nextUrl.searchParams.keys()]
      .filter((key) => !/token|secret|password|signature|key|email|cpf|cnpj/i.test(key))
      .map((key) => key.slice(0, 64)))].slice(0, 40),
    outcome,
  };
  const body = JSON.stringify(eventPayload);

  const deliver = async () => {
    try {
      const response = await fetch(new URL('/api/audit/ingest', request.url), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-audit-signature': await signAuditPayload(body, secret),
        },
        body,
        cache: 'no-store',
      });
      if (!response.ok) console.error(`Não foi possível registrar evento de auditoria (HTTP ${response.status}).`);
    } catch (error) {
      console.error('Falha ao enviar evento de auditoria:', error);
    }
  };

  if (event && typeof event.waitUntil === 'function') event.waitUntil(deliver());
  else await deliver();
}

export async function proxy(request, event) {
  const pathname = request.nextUrl.pathname;
  const requiresErpAccess = erpPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const requiresErpApiAccess = pathname === '/api/erp' || pathname.startsWith('/api/erp/');
  const requiresCustomerAccess = customerDashboardPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
    && !requiresErpAccess;
  const isApi = pathname.startsWith('/api/');
  const isTrackable = (isApi && pathname !== '/api/audit/ingest')
    || (!pathname.startsWith('/_next/')
      && !pathname.startsWith('/imagens/')
      && !pathname.includes('.')
      && pathname !== '/favicon.ico');
  if (!isTrackable && !requiresErpAccess && !requiresCustomerAccess) return NextResponse.next();

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (pathname === '/erp/login') {
    await recordRequest(request, token, 'REQUEST_RECEIVED', event);
    return NextResponse.next();
  }

  if (!token) {
    await recordRequest(request, token, requiresErpAccess || requiresErpApiAccess || requiresCustomerAccess ? 'LOGIN_REQUIRED' : 'REQUEST_RECEIVED', event);
    const signInPath = requiresErpAccess ? '/erp/login' : '/login';
    if (requiresErpAccess || requiresCustomerAccess) {
      const signInUrl = new URL(signInPath, request.url);
      signInUrl.searchParams.set('callbackUrl', `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(signInUrl);
    }
    return NextResponse.next();
  }

  if (requiresErpApiAccess && !hasErpAccess({
    username: token.erpUsername,
    erpAccess: token.erpAccess,
    erpAccessExpiresAt: token.erpAccessExpiresAt,
  })) {
    await recordRequest(request, token, 'ACCESS_DENIED', event);
    return NextResponse.next();
  }

  if (requiresCustomerAccess && !hasCustomerDashboardAccess(token)) {
    await recordRequest(request, token, 'ACCESS_DENIED', event);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', `${pathname}${request.nextUrl.search}`);
    loginUrl.searchParams.set('error', 'google-required');
    return NextResponse.redirect(loginUrl);
  }

  if (requiresErpAccess) {
    const ceoUsername = (process.env.ERP_CEO_USERNAME || '').trim().toLowerCase();
    const username = String(token.erpUsername || '').toLowerCase();
    if (!ceoUsername || token.erpAccess !== true || typeof token.erpAccessExpiresAt !== 'number' || token.erpAccessExpiresAt <= Date.now() || username !== ceoUsername) {
      await recordRequest(request, token, 'ACCESS_DENIED', event);
      const loginUrl = new URL('/erp/login', request.url);
      loginUrl.searchParams.set('callbackUrl', `${pathname}${request.nextUrl.search}`);
      loginUrl.searchParams.set('error', 'erp-forbidden');
      return NextResponse.redirect(loginUrl);
    }
  }

  await recordRequest(request, token, 'REQUEST_RECEIVED', event);
  return NextResponse.next();
}

export const config = {
  matcher: ['/:path*'],
};
