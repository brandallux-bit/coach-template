import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, sessionTokenIsValid } from '@/lib/auth'

/**
 * A single shared password in front of the whole dashboard.
 *
 * Deliberately modest: the athlete's stated bar is "not completely unprotected," not
 * "survives a determined attacker." What it does buy is that the chart — bodyweight,
 * injuries, medications — is not readable by anyone who guesses or is handed the URL.
 */
export function proxy(req: NextRequest) {
  if (sessionTokenIsValid(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next()
  }

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = req.nextUrl.pathname === '/' ? '' : `?next=${encodeURIComponent(req.nextUrl.pathname)}`
  return NextResponse.redirect(url)
}

export const config = {
  // Everything except the login route itself and Next's own static output.
  matcher: ['/((?!login|api/login|_next/static|_next/image|favicon.ico).*)'],
}
