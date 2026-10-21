import { randomBytes } from 'node:crypto';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/auth';
import { getBlingConfiguration } from '@/features/erp/api/bling';
import { hasErpAccess } from '@/features/erp/access';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const config = getBlingConfiguration();
  if (!config.ready) {
    return Response.json({ error: 'Configure client ID, client secret, URL de retorno e chave de criptografia do Bling.' }, { status: 503 });
  }

  const state = randomBytes(32).toString('base64url');
  const authorizationUrl = new URL('https://www.bling.com.br/Api/v3/oauth/authorize');
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('client_id', config.clientId);
  authorizationUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set('bling_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/erp/bling/callback',
    maxAge: 600,
  });
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}
