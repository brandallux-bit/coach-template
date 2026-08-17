import { Card, Empty, Masthead, Nav, Shell } from '@/components/ui'
import { fmt, plan, prettyDate, today, weekdayOf } from '@/lib/data'
import { DAILY, planWindow } from '@/lib/forecast'

export const dynamic = 'force-dynamic'

export default function Next7Page() {
  const now = today()
  const days = planWindow(now, 7, now)

  // Counted per SESSION, not per day: a day with a walk and a lift on it is one counted session,
  // and before 2026-08-14 it was whichever of the two happened to be written first.
  const totals = days.reduce(
    (a, d) => ({
      kcal: a.kcal + (d.totalKcal ?? 0),
      sessions: a.sessions + d.sessions.filter((s) => s.countsTowardFloor).length,
      // The week's figure inherits every day's incompleteness. Summing partial days into one
      // confident number is the same defect one level up.
      partial: a.partial || d.totalIsPartial,
    }),
    { kcal: 0, sessions: 0, partial: false },
  )
  const floor = plan.sessionsPerWeekFloor ?? null

  return (
    <Shell>
      <Masthead title="Next 7 Days" sub={`${prettyDate(now)} onward`} />
      <Nav current="/next7" />

      <Card
        title="The week ahead"
        caption={
          `${totals.sessions} counted session${totals.sessions === 1 ? '' : 's'}` +
          (floor ? ` against a floor of ${floor}` : '') +
          ` · ${totals.partial ? 'at least ' : '~'}${fmt(Math.round(totals.kcal))} kcal of planned movement`
        }
      >
        <p className="footnote">
          Planned, not recorded. Every figure below is derived from the block template in{' '}
          <code>athlete/constants.json</code> and the effective-dated rows in{' '}
          <code>data/prescriptions.csv</code> — nothing about a future day is stored, because the
          validator refuses to write one. <strong>If a day here will not work, say so now</strong>{' '}
          and the plan changes before the day arrives rather than after it is missed.
        </p>
        <p className="footnote">
          These are <strong>movement</strong> estimates — session, daily block and steps. They
          deliberately exclude resting metabolism and the thermic effect of food, so they are not
          comparable to the burn figures on History, and the two must never be added together.
        </p>
      </Card>

      {days.map((d) => (
        <Card
          key={d.date}
          title={`${weekdayOf(d.date)} ${d.date.slice(5)}${d.isToday ? ' · today' : ''}`}
          caption={
            d.sessions.length
              ? `${d.sessions.map((s) => s.session).filter(Boolean).join(' · ')}`
                + `${d.focus ? ` — ${d.focus}` : ''}`
              : 'Nothing scheduled — no written row and no template entry for this weekday.'
          }
        >
          {d.written && (
            <p className="footnote">
              A <code>training.csv</code> row exists for this day
              {d.status ? ` (${d.status})` : ''} and overrides the template.
            </p>
          )}

          {d.items.length ? (
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th className="text">Planned</th>
                    <th className="text">Detail</th>
                    <th>Est. kcal</th>
                    <th className="text">Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((i) => (
                    <tr key={i.label}>
                      <td className="text">{i.label}</td>
                      <td className="text">{i.detail}</td>
                      <td>{i.kcal == null ? <span className="tbd">—</span> : fmt(Math.round(i.kcal))}</td>
                      <td className="text">{i.basis}</td>
                    </tr>
                  ))}
                  {/* A total that is short by a real cost says so. An item with no kcal is not
                      automatically a gap — a walk contributes nothing here BY DESIGN, because its
                      energy is already in steps — so only an `unknown` absence marks the total.
                      Without the distinction the row printed a confident figure with a session
                      missing from it. */}
                  <tr>
                    <td className="text"><strong>Total</strong></td>
                    <td className="text">
                      {d.totalIsPartial ? <span className="tbd">at least this much</span> : null}
                    </td>
                    <td>
                      <strong>
                        {d.totalKcal == null ? <span className="tbd">—</span> : fmt(Math.round(d.totalKcal))}
                      </strong>
                      {d.totalIsPartial ? <span className="tbd">~</span> : null}
                    </td>
                    <td className="text">
                      {d.totalIsPartial
                        ? d.items.filter((i) => i.kcalAbsence === 'unknown')
                            .map((i) => `${i.label}: ${i.basis}`).join(' · ')
                        : ''}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Nothing planned for this day.</Empty>
          )}

          {/* One block per prescribed session. A day can have two, and rendering only the first
              was how a written second session's exercises became invisible. */}
          {d.sessions.filter((s) => s.session !== DAILY && s.rx.length > 0).map((s) => (
            <details className="table-view" key={s.session}>
              <summary>{s.session} — {s.rx.length} exercises</summary>
              <div className="scroll-x">
                <table>
                  <thead>
                    <tr><th className="text">Exercise</th><th>Prescribed</th><th className="text">Load</th></tr>
                  </thead>
                  <tbody>
                    {s.rx.map((p) => (
                      <tr key={p.order}>
                        <td className="text">{p.exercise}</td>
                        <td>{p.reps === '—' ? '—' : `${p.sets} × ${p.reps}`}</td>
                        <td className="text">{p.load || 'BW'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}

          {d.dailyRx.length > 0 && (
            <details className="table-view">
              <summary>Daily block — {d.dailyRx.length} items, every day</summary>
              <div className="scroll-x">
                <table>
                  <thead>
                    <tr><th className="text">Movement</th><th>Dose</th><th className="text">Load</th></tr>
                  </thead>
                  <tbody>
                    {d.dailyRx.map((p) => (
                      <tr key={p.order}>
                        <td className="text">{p.exercise}</td>
                        <td>{p.reps === '—' ? '—' : `${p.sets} × ${p.reps}`}</td>
                        <td className="text">{p.load || 'BW'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </Card>
      ))}

      <p className="footnote">
        Read-only. To change a day, tell your coach — the block template and the prescriptions are
        what this page renders, so a change there is what moves the plan.
      </p>
    </Shell>
  )
}
