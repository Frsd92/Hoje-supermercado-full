import { timingSafeEqual } from 'node:crypto';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/auth';
import { exchangeBlingAuthorizationCode, getBlingConfiguration } from '@/features/erp/api/bling';
import { hasErpAccess } from '@/features/erp/access';

function integrationUrl(result) {
  const configuredBase = process.env.NEXTAUTH_URL?.trim() || getBlingConfiguration().redirectUri;
  let origin = 'http://localhost:3003';
  try {
    const candidate = new URL(configuredBase);
    if (candidate.protocol === 'https:' || candidate.hostname === 'localhost') origin = candidate.origin;
  } catch {
    origin = 'http://localhost:3003';
  }
  const url = new URL('/erp/integrations/bling', origin);
  url.searchParams.set('status', result);
  return url;
}

function redirectToIntegration(result) {
  const response = NextResponse.redirect(integrationUrl(result));
  response.cookies.set('bling_oauth_state', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/erp/bling/callback',
    maxAge: 0,
  });
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return redirectToIntegration('login-required');

  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const cookieState = request.cookies.get('bling_oauth_state')?.value || '';
  if (!state || !cookieState
    || Buffer.byteLength(state) !== Buffer.byteLength(cookieState)
    || !timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))) {
    return redirectToIntegration('invalid-state');
  }
  if (url.searchParams.has('error')) return redirectToIntegration('authorization-denied');

  const code = url.searchParams.get('code');
  if (!code) return redirectToIntegration('missing-code');
  try {
    await exchangeBlingAuthorizationCode(code);
    return redirectToIntegration('connected');
  } catch (error) {
    console.error('Não foi possível concluir a conexão OAuth com o Bling:', error.message);
    return redirectToIntegration('connection-failed');
  }
}
