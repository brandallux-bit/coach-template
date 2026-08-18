import { NextResponse, type NextRequest } from 'next/server'
import { commitRemoval, LogError } from '@/lib/github'

/**
 * The coach-note dismiss button's write endpoint (`src/components/CoachNotes.tsx`).
 *
 * Separate from `/api/log`: that route only ever inserts or replaces a row, because everything it
 * writes is a measurement (data/METHOD.md rule 2 — append-only wherever possible). This route
 * exists to delete one, permanently, which is the one thing the athlete explicitly asked for here
 * and the one thing `/api/log` must never do to a real measurement.
 *
 * JSON in, JSON out — unlike `/api/log`'s form-POST-and-redirect, because the dismiss button
 * removes its own box instantly (optimistic UI) and only needs a pass/fail signal back, not a page
 * to redirect to.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { date?: unknown } | null
  const date = typeof body?.date === 'string' ? body.date : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'A note needs a valid date to dismiss.' }, { status: 400 })
  }

  try {
    await commitRemoval('coach-notes.csv', date, `Dismiss ${date} coach note from the dashboard`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof LogError ? e.message : 'Something went wrong dismissing that.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
