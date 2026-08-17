#!/usr/bin/env node
/**
 * Boot-and-request smoke test for every dashboard route.
 *
 * WHY THIS EXISTS. Every page in this app is `force-dynamic`, so `next build` never renders any
 * of them. A green build proves the code compiles and proves nothing whatsoever about whether a
 * page returns HTML or a 500. On 2026-08-13 an audit demonstrated two variants of one missing
 * guard — a future `baseline.date` makes `allWeeks()` return `[]` and `page.tsx` dereferences
 * `weeks[weeks.length-1]`; a blank one produces an Invalid Date — and in both cases
 * `npm run data`, `npm run validate` and `npm run build` were all clean while `/` was a 500. CI
 * was green, Vercel reported a successful deploy, and the home page was broken.
 *
 * WHY THIS SCRIPT STARTS THE SERVER ITSELF. The first version took a base URL and requested it.
 * When it was first run against its own red fixture it PASSED — because a server from an earlier
 * run still held port 3000, the run under test died with EADDRINUSE, and the script validated the
 * stale process. A smoke test that tests whichever server happens to answer is a check that
 * cannot fail, which is worse than no check (INVARIANTS.md X-10). Owning the lifecycle removes
 * the whole class: the port is verified free, the child's PID is known, and its death is a
 * failure rather than something to request around.
 *
 * Usage:  node scripts/smoke-routes.mjs [--port N]
 * Env:    AUTH_SECRET — the value of the `coach_session` cookie (src/lib/auth.ts)
 *
 * Requires a completed `npm run build`.
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'

const portArg = process.argv.indexOf('--port')
const PORT = portArg > -1 ? Number(process.argv[portArg + 1]) : Number(process.env.SMOKE_PORT || 3000)
const BASE = `http://127.0.0.1:${PORT}`
const SECRET = process.env.AUTH_SECRET || ''

/** Every route the athlete can reach. Add a page here in the same commit you add the page. */
const ROUTES = ['/', '/today', '/history', '/next7', '/log']

const BOOT_TIMEOUT_MS = 90_000
const BOOT_POLL_MS = 300

const die = (msg) => { console.error(`::error::${msg}`); process.exit(1) }

if (!SECRET) {
  die('AUTH_SECRET is unset. src/proxy.ts redirects every route to /login without it, so the '
    + 'smoke test would pass on redirects and never render a page. Refusing to run.')
}

/** A port already in use means someone else's server would be tested. That is the vacuous pass. */
const portIsFree = (port) => new Promise((resolve) => {
  const s = createServer()
  s.once('error', () => resolve(false))
  s.once('listening', () => s.close(() => resolve(true)))
  s.listen(port, '127.0.0.1')
})

if (!(await portIsFree(PORT))) {
  die(`port ${PORT} is already in use. Refusing to run: this test would validate whichever server `
    + `is already listening rather than the build under test. Stop it, or pass --port.`)
}

console.log(`smoke: starting next start on :${PORT}`)

/**
 * `detached: true` puts the server in its own process group so shutdown can signal the WHOLE
 * group. The first version spawned `npx next start` and killed the child: SIGTERM reached npx,
 * the actual Next server underneath it survived, its stdio pipes stayed open, and node never
 * exited — CI hung on this step until it was cancelled. Spawning the binary directly and
 * killing the group removes both halves of that.
 */
const NEXT_BIN = join(process.cwd(), 'node_modules', '.bin', 'next')
const server = spawn(NEXT_BIN, ['start', '-p', String(PORT)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
  detached: true,
})

let serverLog = ''
let serverExited = null
server.stdout.on('data', (d) => { serverLog += d })
server.stderr.on('data', (d) => { serverLog += d })
server.on('exit', (code, signal) => { serverExited = signal ? `signal ${signal}` : `code ${code}` })

const shutdown = () => {
  if (serverExited || !server.pid) return
  try { process.kill(-server.pid, 'SIGTERM') } catch { /* group already gone */ }
}

/**
 * Always exit explicitly. Open stdio pipes on a child keep node's event loop alive, so falling
 * off the end of the script is not a reliable exit — and a smoke test that hangs burns runner
 * time until the job times out, which reads as "still running" rather than "failed".
 */
const finish = (code) => { shutdown(); process.exit(code) }
process.on('SIGINT', () => finish(130))
process.on('SIGTERM', () => finish(143))

const bail = (msg) => {
  console.error(`::error::${msg}`)
  if (serverLog.trim()) {
    console.error('::group::next start output')
    console.error(serverLog.trim())
    console.error('::endgroup::')
  }
  finish(1)
}

/** Wait for the server to accept connections — and treat its death as a failure, not a retry. */
const deadline = Date.now() + BOOT_TIMEOUT_MS
for (;;) {
  if (serverExited) bail(`next start exited with ${serverExited} before serving a request`)
  try {
    await fetch(`${BASE}/login`, { redirect: 'manual' })
    break
  } catch {
    if (Date.now() > deadline) bail(`server did not accept connections within ${BOOT_TIMEOUT_MS / 1000}s`)
    await new Promise((r) => setTimeout(r, BOOT_POLL_MS))
  }
}

const headers = { cookie: `coach_session=${SECRET}` }
let failed = 0

for (const route of ROUTES) {
  if (serverExited) bail(`next start exited with ${serverExited} partway through the run`)

  let res
  try {
    res = await fetch(`${BASE}${route}`, { headers, redirect: 'manual' })
  } catch (e) {
    console.error(`::error::${route} — request threw: ${e.message}`)
    failed++
    continue
  }

  // A redirect means the cookie was rejected, not that the page is broken. Fail anyway: a smoke
  // test that silently degrades to checking /login proves nothing.
  if (res.status >= 300 && res.status < 400) {
    console.error(`::error::${route} — ${res.status} redirect to ${res.headers.get('location')}. `
      + 'Auth is misconfigured; this run proved nothing about the page.')
    failed++
    continue
  }

  if (!res.ok) {
    const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 400)
    console.error(`::error::${route} — HTTP ${res.status}`)
    console.error(`  ${body}`)
    failed++
    continue
  }

  const body = await res.text()
  if (!body.includes('<html') && !body.includes('<!DOCTYPE')) {
    console.error(`::error::${route} — 200 but the body is not an HTML document (${body.length} bytes)`)
    failed++
    continue
  }

  console.log(`ok    ${route.padEnd(10)} ${res.status} · ${body.length.toLocaleString()} bytes`)
}

if (failed) {
  if (serverLog.trim()) {
    console.error('::group::next start output')
    console.error(serverLog.trim())
    console.error('::endgroup::')
  }
  console.error(`\nsmoke: ${failed} of ${ROUTES.length} routes failed.`)
  finish(1)
}

console.log(`\nsmoke: all ${ROUTES.length} routes returned HTML.`)
finish(0)
