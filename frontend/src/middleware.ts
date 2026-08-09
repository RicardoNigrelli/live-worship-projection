import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  
  // Protect all /dashboard routes except /dashboard/login.
  // SEC: /dashboard/control used to be excluded here too, which meant the operator
  // control surface (song/slide control, blackout, video control) was reachable by
  // anyone who guessed the URL, with no DASHBOARD_PASSWORD check at all. It sits in
  // the same (admin) route group as the other protected pages, so it now is too.
  if (path.startsWith('/dashboard') && !path.startsWith('/dashboard/login')) {
    const token = request.cookies.get('admin_token')?.value;
    
    // In a real app we'd verify the JWT, but here we just check if it exists
    if (!token) {
      return NextResponse.redirect(new URL('/dashboard/login', request.url));
    }
  }

  // Redirect /dashboard/login to dashboard if already logged in
  if (path === '/dashboard/login') {
    const token = request.cookies.get('admin_token')?.value;
    if (token) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
