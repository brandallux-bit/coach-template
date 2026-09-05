export const dynamic = 'force-dynamic'

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await searchParams

  return (
    <div className="login-wrap">
      <form className="login-card" method="POST" action="/api/login">
        <h1>Coach</h1>
        <p>Private chart.</p>
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoComplete="current-password"
          aria-label="Password"
          autoFocus
          required
        />
        <input type="hidden" name="next" value={next ?? '/'} />
        <button type="submit">Sign in</button>
        {error === 'unconfigured' && (
          <p className="error">
            AUTH_SECRET and DASHBOARD_PASSWORD are not set on this deployment. Sign-in is
            disabled until they are.
          </p>
        )}
        {error === '1' && <p className="error">Wrong password.</p>}
        {error === 'locked' && <p className="error">Too many wrong passwords. Wait a minute, then try again.</p>}
      </form>
    </div>
  )
}
