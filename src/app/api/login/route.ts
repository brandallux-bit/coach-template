import { NextResponse, type NextRequest } from 'next/server'
import {
  SESSION_COOKIE, SESSION_COOKIE_OPTIONS, dashboardPassword,
  passwordIsValid, sessionSecret,
} from '@/lib/auth'

/**
 * One shared password, so two things a single-user app usually skips are here on purpose.
 *
 * **A failed attempt costs a second, and ten of them cost a minute.** The URL is guessable
 * (DASHBOARD.md says so) and the password is chosen by someone who is not a security engineer, so
 * an unthrottled form is a dictionary attack away from the athlete's medications. The counter is
 * per function instance — Fluid Compute reuses instances, so it holds across most of a burst, and
 * it is honestly best-effort across a cold start. The delay needs no state at all. A platform
 * rate-limit rule in front of `/api/login` is the stronger answer where the plan offers one.
 *
 * **The redirect target is checked by ORIGIN, not by prefix.** The old test — starts with `/`, not
 * `//` — let `/\evil.com` through: the URL parser reads a backslash as a slash in an https URL and
 * resolved it to `https://evil.com/`. Resolving first and comparing origins cannot be fooled by a
 * spelling.
 */
const FAILURE_DELAY_MS = 1000
const LOCKOUT_AFTER = 10
const LOCKOUT_MS = 60_000
const attempts = new Map<string, { count: number; until: number }>()

const clientKey = (req: NextRequest) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'

function lockedOut(key: string): boolean {
  const a = attempts.get(key)
  if (!a) return false
  if (a.until && Date.now() < a.until) return true
  if (a.until && Date.now() >= a.until) attempts.delete(key)
  return false
}

function noteFailure(key: string) {
  const a = attempts.get(key) ?? { count: 0, until: 0 }
  a.count += 1
  if (a.count >= LOCKOUT_AFTER) { a.until = Date.now() + LOCKOUT_MS; a.count = 0 }
  attempts.set(key, a)
}

/** Only ever redirect within this app — resolved, then compared by origin. */
function sameOriginTarget(next: string, base: string): URL {
  const fallback = new URL('/', base)
  try {
    const url = new URL(next, base)
    return url.origin === fallback.origin ? url : fallback
  } catch {
    return fallback
  }
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const password = String(form.get('password') ?? '')
  const next = String(form.get('next') ?? '/')
  const target = sameOriginTarget(next, req.url)
  const key = clientKey(req)

  if (!dashboardPassword() || !sessionSecret()) {
    return NextResponse.redirect(new URL('/login?error=unconfigured', req.url), 303)
  }

  if (lockedOut(key)) {
    return NextResponse.redirect(new URL('/login?error=locked', req.url), 303)
  }

  if (!passwordIsValid(password)) {
    noteFailure(key)
    await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS))
    return NextResponse.redirect(new URL('/login?error=1', req.url), 303)
  }

  attempts.delete(key)
  const res = NextResponse.redirect(target, 303)
  res.cookies.set(SESSION_COOKIE, sessionSecret(), SESSION_COOKIE_OPTIONS)
  return res
}
