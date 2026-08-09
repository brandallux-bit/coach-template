import { NextResponse, type NextRequest } from 'next/server'
import {
  SESSION_COOKIE, SESSION_COOKIE_OPTIONS, dashboardPassword,
  passwordIsValid, sessionSecret,
} from '@/lib/auth'

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const password = String(form.get('password') ?? '')
  const next = String(form.get('next') ?? '/')

  // Only ever redirect within this app — never to a URL supplied in the request.
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  if (!dashboardPassword() || !sessionSecret()) {
    return NextResponse.redirect(new URL('/login?error=unconfigured', req.url), 303)
  }

  if (!passwordIsValid(password)) {
    return NextResponse.redirect(new URL('/login?error=1', req.url), 303)
  }

  const res = NextResponse.redirect(new URL(target, req.url), 303)
  res.cookies.set(SESSION_COOKIE, sessionSecret(), SESSION_COOKIE_OPTIONS)
  return res
}
