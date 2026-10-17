import { NextResponse, type NextRequest } from 'next/server';

/** Send visitors without a session cookie to the sign-in page. The API still validates every request. */
export function middleware(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get('lims_session')?.value);
  const { pathname, search } = req.nextUrl;
  if (!hasSession && pathname !== '/login') {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/|_next/|favicon.ico|icon.svg).*)'],
};
