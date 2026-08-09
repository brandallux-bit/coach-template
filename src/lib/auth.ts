export const SESSION_COOKIE = 'coach_session'

/**
 * The session cookie carries AUTH_SECRET verbatim. It is httpOnly and Secure, so it is not
 * readable from JS and does not travel over plain HTTP; rotating AUTH_SECRET in Vercel logs
 * every device out at once.
 */
export const sessionSecret = () => process.env.AUTH_SECRET ?? ''
export const dashboardPassword = () => process.env.DASHBOARD_PASSWORD ?? ''

/** Length-independent, non-short-circuiting comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Refuses to authenticate at all if the env vars are unset — never fail open. */
export function sessionTokenIsValid(token: string | undefined): boolean {
  const secret = sessionSecret()
  if (!secret || !token) return false
  return safeEqual(token, secret)
}

export function passwordIsValid(password: string): boolean {
  const expected = dashboardPassword()
  if (!expected || !sessionSecret()) return false
  return safeEqual(password, expected)
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
}
