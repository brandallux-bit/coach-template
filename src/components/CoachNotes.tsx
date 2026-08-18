'use client'

import { useState } from 'react'

// Not imported from `@/lib/data` — that module's top-level `import bundle from
// '@/generated/data.json'` would pull the athlete's entire chart into the client bundle just to
// format one date, exactly what unit-toggle.tsx's client-boundary comment warns against.
const prettyDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  })

type Note = { date: string; headline: string; note: string }

/**
 * Every outstanding coach note, each its own box, each dismissible with an × — and dismissal is
 * permanent: no history of what was dismissed is kept (the athlete's explicit instruction, not an
 * oversight — see `removeRow` in scripts/lib/rowwrite.mjs for the same point on the write side).
 *
 * Replaces the old single-note-that-stands-until-replaced design (`latestOnOrBefore`): that model
 * meant writing a new note silently buried whatever was already showing, which is not the same
 * thing as the athlete having seen and dismissed it. Now every note dated on or before today
 * (`allOnOrBefore`, `src/app/today/page.tsx`) renders until its own × removes it — nothing is ever
 * hidden by a newer note arriving.
 *
 * Client-boundary shape follows `unit-toggle.tsx`: a small, isolated leaf component. It differs in
 * one way that component's own doc comment flags as the alternative it avoided — the note content
 * itself has to cross to the browser, because the whole point is removing one box from a
 * client-held list without reloading the page. Nothing else on `/today` crosses this boundary.
 *
 * The write is fire-and-forget from the click's perspective (the box disappears immediately,
 * "dismissed forever" per the athlete's instruction), but not fire-and-forget under the hood: on
 * failure the box comes back with an inline error, because a note that silently failed to delete
 * would reappear on every other device without explanation.
 */
export default function CoachNotes({ notes, today }: { notes: Note[]; today: string }) {
  const [visible, setVisible] = useState(notes)
  const [failed, setFailed] = useState<Record<string, boolean>>({})

  async function dismiss(n: Note) {
    setVisible((v) => v.filter((x) => x.date !== n.date))
    setFailed((f) => { const { [n.date]: _drop, ...rest } = f; return rest })

    try {
      const res = await fetch('/api/notes/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: n.date }),
      })
      if (!res.ok) throw new Error('dismiss failed')
    } catch {
      // The write didn't land — put it back rather than let it silently vanish from this device
      // only, which would make "dismissed" mean something different depending on where you look.
      setVisible((v) => [...v, n].sort((a, b) => a.date.localeCompare(b.date)))
      setFailed((f) => ({ ...f, [n.date]: true }))
    }
  }

  if (!visible.length) return null

  return (
    <>
      {visible.map((n) => (
        <section className="card note-card" key={n.date}>
          <button
            type="button" className="note-dismiss" aria-label={`Dismiss note: ${n.headline}`}
            onClick={() => dismiss(n)}
          >
            ×
          </button>
          <h2>From your coach</h2>
          {/* A note stands until it is dismissed, so an older one can still be showing — but it
              says so. An undated older note reads as today's advice, which is exactly how "tonight
              is budgeted, eat it without arithmetic" would have followed him into the next week. */}
          {n.date !== today && <p className="caption">Written {prettyDate(n.date)}</p>}
          <div className="note-block">
            <p><strong>{n.headline}</strong></p>
            {n.note && <p>{n.note}</p>}
          </div>
          {failed[n.date] && (
            <p className="note-error">Couldn&apos;t save that dismissal — still here. Try again.</p>
          )}
        </section>
      ))}
    </>
  )
}
