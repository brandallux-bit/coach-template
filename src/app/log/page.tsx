import { Card, Masthead, Nav, Shell } from '@/components/ui'
import {
  allOf, metrics, metricsRegistry, plan, prettyDate, sets, today, weekdayKey, type Row,
} from '@/lib/data'
import {
  orderedSessions, primarySession, rxFor, sessionKey, setsForSession,
} from '@/lib/forecast'
import { rollDay } from '@/lib/rollup'
import { writesConfigured } from '@/lib/github'

export const dynamic = 'force-dynamic'

/**
 * Direct entry for everything that never needed a coaching session: a weight, a tape measure, a
 * completed session, a set. These are facts, not judgements — the only reason they used to arrive
 * through a conversation is that the chart happened to be built conversationally.
 *
 * Food stays conversational on purpose (decisions.md 2026-08-11): turning "cod and risotto" into
 * macros is the one genuine judgement call in data/, and a logging step skipped is worth less
 * than an estimate made.
 */
export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; exercise?: string }>
}) {
  const { ok, error, exercise } = await searchParams
  const now = today()
  const d = rollDay(now)
  const configured = writesConfigured()

  // Names the chart already uses, from the registry it declared plus anything actually written.
  // Offered as suggestions, never as a fixed list: a chart may start tracking something new on any
  // day, and a closed list would be this file deciding what an athlete is allowed to measure.
  const knownMetrics = [...new Set([
    ...Object.keys(metricsRegistry ?? {}).filter((k) => !k.startsWith('_')),
    ...metrics.map((m) => String(m.metric ?? '')).filter(Boolean),
  ])].sort()

  const templated = plan.weeklyTemplate?.[weekdayKey(now)] ?? null
  const sessions = orderedSessions(d.sessions, now)
  const sessionName = primarySession(d.sessions, now)?.session ?? templated?.session ?? ''

  // ⚠ THIS IS THE WRITE PATH, AND IT IS WHY THIS WHOLE WORKSTREAM EXISTS.
  //
  // What the Sets form pre-fills is what lands in `sets.csv`, permanently, in the file goals.md's
  // strength guardrail is read against. Two defects met here:
  //
  //   1. the session came from `d.sessions[0]` — file order — so on a day with two training rows
  //      (2026-08-08 has two; every day since 2026-08-13 has two) it was a coin flip, and
  //   2. the prescription lookup resolved by `forSession.at(-1)`, i.e. the last matching row in
  //      the file rather than the newest by date, so a hand-inserted row could silently change
  //      which set of exercises was on offer.
  //
  // Both are gone. The candidates below are the day's actual sessions, ordered by the shared
  // resolver, plus the block template's session when it is not already among them — that last one
  // matters on a day like 2026-08-14, where the only written rows are "no session" and the rehab
  // block, and a set they log anyway belongs under the template's session, not under either of
  // those. Every candidate carries its OWN prescription, so nothing on this page can offer an
  // exercise from one session under the name of another.
  type Candidate = { session: string; rx: Row[] }
  const candidates: Candidate[] = []
  const push = (name: string | undefined) => {
    if (!name || candidates.some((c) => c.session === name)) return
    candidates.push({ session: name, rx: rxFor(name, now) })
  }
  for (const s of sessions) push(s.session)
  // The template only fills a gap. When a written row already IS that session — "Session Two" on the
  // template, "Session Two — Upper Push/Pull + Core" written — adding it again would put two options
  // meaning the same session in the picker, and half their sets would file under a different string
  // from the other half.
  const tmpl = templated?.session
  if (tmpl && !candidates.some((c) => sessionKey(c.session) === sessionKey(tmpl))) push(tmpl)

  // The default is the first candidate with a prescription, because that is the only one whose
  // exercises this form can offer by name. When none has one, the primary session — which is what
  // `sessionName` already is.
  const setsDefault = candidates.find((c) => c.rx.length)?.session ?? sessionName
  const prescribed = candidates.filter((c) => c.rx.length)
  const rx = candidates.find((c) => c.session === setsDefault)?.rx ?? []

  const loggedToday = allOf(sets, now)
  const dayNames = d.sessions.map((s) => s.session)
  // Scoped to the session, not just the date: an evening session must not render as "done" the
  // exercises a morning session logged. `setsForSession` is a no-op on a single-session day.
  const doneFor = (session: string, name: string) =>
    setsForSession(loggedToday, session, dayNames).filter((s) => s.exercise === name).length

  return (
    <Shell>
      <Masthead title="Log" sub={prettyDate(now)} />
      <Nav current="/log" />

      {ok && <p className="banner ok">Saved: {ok}. The charts pick it up on the next deploy.</p>}
      {error && <p className="banner bad">{error}</p>}

      {!configured && (
        <p className="banner bad">
          Writing is not configured on this deployment. Set <code>GITHUB_REPO</code> and a{' '}
          <code>GITHUB_TOKEN</code> with <code>contents:write</code> in the Vercel project. Until
          then these forms will refuse rather than pretend.
        </p>
      )}

      <Card
        title="Morning measurements"
        caption={`${plan.copy?.bodyFormCaption ?? ''} Leave anything you didn't measure blank: empty means 'not measured', and a blank never overwrites a value already on file for today.`.trim()}
      >
        <form className="log-form" method="POST" action="/api/log">
          <input type="hidden" name="kind" value="body" />
          <div className="fields">
            <Field name="date" label="Date" type="date" defaultValue={now} required />
            <Field name="weight_lb" label="Weight (lb)" type="number" step="0.1" defaultValue={d.weightLb ?? ''} />
            <Field name="waist_in" label="Waist (in)" type="number" step="0.125" defaultValue={d.waistIn ?? ''} />
            <Field name="neck_in" label="Neck (in)" type="number" step="0.125" defaultValue={d.neckIn ?? ''} />
            <Field name="sleep_h" label="Sleep (h)" type="number" step="0.25" />
            <Field name="sleep_quality" label="Sleep quality (1–5)" type="number" min="1" max="5" />
            <Field name="resting_hr_overnight" label="Overnight resting HR (bpm)" type="number" min="30" max="120" />
            <Field name="energy" label="Energy (1–5)" type="number" min="1" max="5" />
            <Field name="hunger" label="Hunger (1–5)" type="number" min="1" max="5" />
            <Field name="mood" label="Mood (1–5)" type="number" min="1" max="5" />
          </div>
          <Field name="note" label="Note" type="text" wide />
          <button type="submit" disabled={!configured}>Save measurements</button>
        </form>
      </Card>

      <Card
        title="Anything else"
        caption={
          'One reading that the form above has no box for — a symptom count, a medication taken, '
          + 'a lab result, a reading off a device. Name it whatever you call it and keep using the '
          + 'same name, so it lines up into a trend. These go to metrics.csv.'
        }
      >
        <form className="log-form" method="POST" action="/api/log">
          <input type="hidden" name="kind" value="metric" />
          <div className="fields">
            <Field name="date" label="Date" type="date" defaultValue={now} required />
            <Field name="metric" label="What" type="text" required list="known-metrics" />
            <Field name="value" label="Value" type="text" required />
            <Field name="unit" label="Unit" type="text" />
          </div>
          {/* Names already in the chart, so the same reading does not end up under three
              spellings and split into three trends that each look like noise. */}
          <datalist id="known-metrics">
            {knownMetrics.map((m) => <option key={m} value={m} />)}
          </datalist>
          <Field name="note" label="Note" type="text" wide />
          <button type="submit" disabled={!configured}>Save reading</button>
        </form>
      </Card>

      <Card
        title="Session"
        caption={
          sessions.length
            ? `Already logged today: ${sessions.map((s) => `${s.session} — ${s.status}`).join(' · ')}. Submitting again adds another row.`
            : `Nothing logged today. ${templated ? `The block has ${templated.session}.` : ''} Log the session before its sets — a set with no session row fails the data check.`
        }
      >
        <form className="log-form" method="POST" action="/api/log">
          <input type="hidden" name="kind" value="training" />
          <div className="fields">
            <Field name="date" label="Date" type="date" defaultValue={now} required />
            <SelectField
              name="type" label="Type" required
              defaultValue={templated?.type}
              // From athlete/constants.json's sessionTypes registry, via the bundle. This list
              // used to be a literal here, in scripts/lib/schema.mjs and in src/lib/data.ts —
              // three copies of one athlete's activity list, so a new athlete could only ever
              // choose `other` (audit F-15).
              options={plan.sessionTypeList ?? []}
            />
            <Field name="session" label="Session" type="text" defaultValue={sessionName} required />
            <SelectField name="status" label="Status" options={['completed', 'planned', 'skipped', 'rest']} required />
            <Field name="duration_min" label="Duration (min)" type="number" min="0" defaultValue={templated?.durationMin ?? ''} />
            <Field name="rpe" label="Session RPE (1–10)" type="number" min="1" max="10" />
            <SelectField name="pain_flag" label="Anything hurt?" options={['', 'n', 'y']} />
          </div>
          <Field name="note" label="Note" type="text" wide />
          <button type="submit" disabled={!configured}>Save session</button>
        </form>
      </Card>

      <Card
        title="Sets"
        caption={
          (rx.length
            ? `${setsDefault} — one set at a time. RIR is the column that makes the rest of the row mean anything: goals.md's strength guardrail is ">10% loss of reps at fixed load AND fixed RIR", and it is what stands between this phase and an early exit on muscle loss.`
            : `No prescription for ${setsDefault || 'today'} — you can still log any exercise by name.`)
          + (candidates.length > 1
            ? ` Two sessions on today, so check the Session field before saving — it is what the set is filed under.`
            : '')
        }
      >
        <form className="log-form" method="POST" action="/api/log">
          <input type="hidden" name="kind" value="sets" />
          <div className="fields">
            <Field name="date" label="Date" type="date" defaultValue={now} required />
            {/* A choice, not a guess. With more than one session on the day there is no answer
                the page can be sure of, and this is the one surface they can answer on. */}
            {candidates.length > 1 ? (
              <SelectField
                name="session" label="Session"
                options={candidates.map((c) => c.session)}
                defaultValue={setsDefault}
              />
            ) : (
              <Field name="session" label="Session" type="text" defaultValue={setsDefault} />
            )}
            {prescribed.length ? (
              <label className="field">
                <span>Exercise</span>
                <select name="exercise" defaultValue={exercise ?? rx[0]?.exercise} required>
                  {/* Grouped by session, so an exercise can never be picked out of a session the
                      Session field above is not set to without that being visible on screen. */}
                  {prescribed.map((c) => (
                    <optgroup key={c.session} label={c.session}>
                      {c.rx.map((p) => (
                        <option key={`${c.session}-${p.order}`} value={p.exercise}>
                          {p.exercise} — {p.sets} × {p.reps}{p.load ? ` @ ${p.load}` : ''}
                          {doneFor(c.session, p.exercise)
                            ? ` (${doneFor(c.session, p.exercise)} done)`
                            : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            ) : (
              <Field name="exercise" label="Exercise" type="text" required />
            )}
            <Field name="set_index" label="Set #" type="number" min="1" max="30" required />
            <Field name="load_lb" label="Load (lb)" type="number" step="0.5" min="0" />
            <Field name="reps" label="Reps" type="number" min="0" />
            <Field name="duration_s" label="Or duration (s)" type="number" min="0" />
            <Field name="rir" label="RIR" type="number" min="0" max="10" />
          </div>
          <Field name="note" label="Note — band weight goes here, never in Load" type="text" wide />
          <button type="submit" disabled={!configured}>Save set</button>
        </form>

        {loggedToday.length > 0 && (
          <div className="scroll-x" style={{ marginTop: 18 }}>
            <table>
              <thead>
                <tr><th className="text">Exercise</th><th>Set</th><th>Load</th><th>Reps / time</th><th>RIR</th></tr>
              </thead>
              <tbody>
                {loggedToday.map((s, i) => (
                  <tr key={i}>
                    <td className="text">{s.exercise}</td>
                    <td>{s.set_index}</td>
                    <td>{s.load_lb ? `${s.load_lb} lb` : 'BW'}</td>
                    <td>{s.reps || (s.duration_s ? `${s.duration_s}s` : '—')}</td>
                    <td>{s.rir || <span className="tbd">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="footnote">
        Food is logged in a coaching session on purpose — turning a meal into calories and protein
        is the one number in <code>data/</code> that needs a judgement call. Everything on this
        page is a fact, so it does not.
      </p>
    </Shell>
  )
}

function Field({
  name, label, type, defaultValue, required, wide, ...rest
}: {
  name: string; label: string; type: string
  defaultValue?: string | number; required?: boolean; wide?: boolean
  step?: string; min?: string; max?: string
  /** id of a <datalist> — suggestions the athlete can ignore, not a closed set of options. */
  list?: string
}) {
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span>{label}</span>
      <input
        name={name} type={type} defaultValue={defaultValue} required={required}
        {...rest}
      />
    </label>
  )
}

function SelectField({
  name, label, options, defaultValue, required,
}: {
  name: string; label: string; options: string[]; defaultValue?: string; required?: boolean
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} defaultValue={defaultValue} required={required}>
        {options.map((o) => <option key={o} value={o}>{o === '' ? '—' : o}</option>)}
      </select>
    </label>
  )
}
