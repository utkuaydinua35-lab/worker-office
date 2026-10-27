import { withAuth } from 'next-auth/middleware';

// Same sign-in page as authOptions.pages; the middleware doesn't read that.
export default withAuth({ pages: { signIn: '/login' } });

// Pages require a session. API routes are excluded: they check the session
// themselves and must answer 401 JSON rather than redirect to /login.
export const config = {
  matcher: ['/((?!login|register|api|uploads|_next/static|_next/image|favicon.ico).*)'],
};
