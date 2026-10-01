import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import { hasCustomerDashboardAccess } from './features/auth/access.js';

const erpPaths = ['/erp', '/dashboard/erp'];
const customerDashboardPaths = ['/dashboard'];

export async function proxy(request) {
  const pathname = request.nextUrl.pathname;
  const requiresErpAccess = erpPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const requiresCustomerAccess = customerDashboardPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
    && !requiresErpAccess;

  if (pathname === '/erp/login') return NextResponse.next();

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const signInPath = requiresErpAccess ? '/erp/login' : '/login';
    const signInUrl = new URL(signInPath, request.url);
    signInUrl.searchParams.set('callbackUrl', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(signInUrl);
  }

  if (requiresCustomerAccess && !hasCustomerDashboardAccess(token)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', `${pathname}${request.nextUrl.search}`);
    loginUrl.searchParams.set('error', 'google-required');
    return NextResponse.redirect(loginUrl);
  }

  if (requiresErpAccess) {
    const ceoUsername = (process.env.ERP_CEO_USERNAME || '').trim().toLowerCase();
    const username = String(token.erpUsername || '').toLowerCase();
    if (!ceoUsername || token.erpAccess !== true || typeof token.erpAccessExpiresAt !== 'number' || token.erpAccessExpiresAt <= Date.now() || username !== ceoUsername) {
      const loginUrl = new URL('/erp/login', request.url);
      loginUrl.searchParams.set('callbackUrl', `${pathname}${request.nextUrl.search}`);
      loginUrl.searchParams.set('error', 'erp-forbidden');
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/erp/:path*'],
};
