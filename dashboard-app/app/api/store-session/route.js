import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasCustomerDashboardAccess } from '@/features/auth/access';

const allowedOrigins = new Set([
  'http://localhost:8010',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'null',
]);

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'http://localhost:8010',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  const headers = corsHeaders(request);
  const isCustomerSession = hasCustomerDashboardAccess(session?.user);

  return Response.json({
    authenticated: isCustomerSession,
    user: isCustomerSession
      ? { name: session.user.name || 'Cliente', email: session.user.email || '' }
      : null,
  }, { headers });
}
