import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';

const erpPaths = ['/erp', '/dashboard/erp'];

export async function middleware(request) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const isAuthenticated = Boolean(token);

  if (!isAuthenticated) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const pathname = request.nextUrl.pathname;
  const requiresErpAccess = erpPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (requiresErpAccess) {
    const allowedEmails = (process.env.ERP_ALLOWED_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    const email = String(token.email || '').toLowerCase();

    if (!allowedEmails.includes(email)) {
      return NextResponse.redirect(new URL('/dashboard?error=erp-forbidden', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/erp/:path*'],
};
