#!/usr/bin/env node
/**
 * Regression tests for session resolution — `src/lib/forecast.ts`.
 *
 * WHY THIS FILE EXISTS. On 2026-08-13 the resolver shipped two bugs in one day, both of the same
 * shape: a rule meant to scope prescriptions to *today's session* was applied across *all*
 * sessions.
 *
 *   1. `Daily` rows dated today leaked into the session block. Caught before shipping, patched by
 *      excluding the name `Daily`.
 *   2. That patch treated the instance, not the class. Any NEW session defined with today's date
 *      still hijacked the tab — the athlete opened the live dashboard on a walk day and saw the
 *      caption "Walk / optional Peloton (seated only)" above a full "Session A (knee-free)"
 *      strength table. He reported it; nothing in the repo would have.
 *
 * A resolver that decides what the athlete does today, and got it wrong twice in a day, needs a
 * test rather than a third careful reading. `validate-data.mjs` checks the DATA; this checks the
 * LOGIC that reads it.
 *
 * ⚠ EXTENDED 2026-08-14 (W2) to the whole of INVARIANTS.md X-13 — *a lookup selects on every
 * dimension of its key*. The date-only half of that key was the live defect: three call sites took
 * `[0]` of the day's training rows, and `log/page.tsx` fed its answer into the WRITE path, so on a
 * two-session day sets were written to `sets.csv` under a session the athlete did not perform.
 * The suite's "max-by-date, not last-row-in-file" case had been exercising one of the three
 * copies; the drift guards below assert there is now only one.
 *
 * The resolvers are mirrored from the TypeScript rather than imported — the pages are React server
 * components and this repo has no TS test runner. Mirroring is the honest cost of that, so every
 * mirror here is paired with a grep back at the real source that fails when the two diverge.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { markerAudit, parseMarkerTable } from './lib/findings.mjs'
import { DAILY, RESERVED_SESSIONS } from './lib/sessions.mjs'
import { REAL_DATA, modeBanner } from './lib/test-mode.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = (p) => readFileSync(join(ROOT, p), 'utf8')

let failed = 0
const ok = (name) => console.log('  ok   ' + name)
const fail = (name, detail) => { failed++; console.log('  FAIL ' + name + '\n       ' + detail) }
const eq = (name, actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected)
    ? ok(name)
    : fail(name, `expected ${JSON.stringify(expected)}\n       got      ${JSON.stringify(actual)}`)

/** Mirror of forecast.effectiveRx. */
const effective = (rows, name, now) => {
  const forName = rows.filter((p) => p.session === name && p.date <= now)
  const eff = forName.reduce((max, p) => (p.date > max ? p.date : max), '')
  return forName.filter((p) => p.date === eff).sort((a, b) => Number(a.order) - Number(b.order))
}
const resolve = (rows, sessionName, now) => ({
  rx: sessionName && sessionName !== DAILY ? effective(rows, sessionName, now) : [],
  daily: effective(rows, DAILY, now),
})

/** Mirror of forecast.sessionKey. Parenthetical first — see the note on the real one. */
const sessionKey = (s) => (s ?? '')
  .toLowerCase()
  .replace(/\s*\(.*$/, '')
  .replace(/\s+[—–-]\s+.*$/, '')
  .replace(/\s+/g, ' ')
  .trim()

// Imported, not restated: the names have one home in scripts/lib/sessions.mjs (W6).
const RESERVED = new Set(RESERVED_SESSIONS)

/** Mirror of forecast.rxSessionFor. */
const rxSessionFor = (rows, session, date) => {
  if (!session) return null
  if (rows.some((p) => p.session === session && p.date <= date)) return session
  const key = sessionKey(session)
  if (!key) return null
  const named = [...new Set(
    rows.filter((p) => p.date <= date && !RESERVED.has(p.session)).map((p) => p.session),
  )].filter((name) => sessionKey(name) === key)
  return named.length === 1 ? named[0] : null
}

/** Mirror of forecast.orderedSessions. */
const STATUS_RANK = { completed: 0, planned: 1, rest: 2, skipped: 3 }
const orderedSessions = (trainingRows, rx, date) => trainingRows
  .map((r, i) => ({
    r,
    k: [
      r.status === 'skipped' ? 1 : 0,
      rxSessionFor(rx, r.session, date) ? 0 : 1,
      STATUS_RANK[r.status] ?? 2,
      i,
    ],
  }))
  .sort((a, b) => {
    for (let i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i]
    return 0
  })
  .map((x) => x.r)
const primarySession = (trainingRows, rx, date) => orderedSessions(trainingRows, rx, date)[0] ?? null

/** Mirror of forecast.setsForSession. */
const setsForSession = (daySets, session, dayNames) => {
  const distinct = new Set(dayNames.filter(Boolean).map(sessionKey))
  if (!session || distinct.size <= 1) return daySets
  const exact = daySets.filter((s) => s.session === session)
  if (exact.length) return exact
  return daySets.filter((s) => sessionKey(s.session) === sessionKey(session))
}

const p = (date, session, order, exercise, extra = {}) =>
  ({ date, session, order: String(order), exercise, ...extra })
const t = (session, status, extra = {}) => ({ session, status, ...extra })

console.log(modeBanner('prescriptions'))
console.log('\nprescription resolver')

// ---- THE BUG THE ATHLETE FOUND -------------------------------------------------------------
{
  const rows = [
    p('2026-08-06', 'Session A', 1, 'Goblet squat'),
    p('2026-08-13', 'Session A (knee-free)', 1, 'Pull-ups'),
    p('2026-08-13', 'Session A (knee-free)', 2, 'KB RDL'),
    p('2026-08-13', DAILY, 1, 'Quad set'),
  ]
  const r = resolve(rows, 'Walk / optional Peloton (seated only)', '2026-08-13')
  eq('a session defined today does not hijack an unrelated session', r.rx.map((x) => x.exercise), [])
  eq('...and the daily block still renders', r.daily.map((x) => x.exercise), ['Quad set'])
}

// ---- THE EARLIER BUG, kept so the Daily case cannot regress either --------------------------
{
  const rows = [
    p('2026-08-06', 'Session A', 1, 'Goblet squat'),
    p('2026-08-13', DAILY, 1, 'Quad set'),
  ]
  const r = resolve(rows, 'Session A', '2026-08-13')
  eq('Daily rows dated today do not replace the session block', r.rx.map((x) => x.exercise), ['Goblet squat'])
  eq('Daily resolves alongside, not instead', r.daily.map((x) => x.exercise), ['Quad set'])
}

// ---- The behaviour the rule actually exists for ---------------------------------------------
{
  const rows = [
    p('2026-08-06', 'Session A', 1, 'Goblet squat'),
    p('2026-08-13', 'Session A', 1, 'Box squat'),
  ]
  eq('a row dated today overrides an older set for the SAME session',
    resolve(rows, 'Session A', '2026-08-13').rx.map((x) => x.exercise), ['Box squat'])
  eq('...and yesterday still sees the older set',
    resolve(rows, 'Session A', '2026-08-12').rx.map((x) => x.exercise), ['Goblet squat'])
}

// ---- Effective dating ------------------------------------------------------------------------
{
  const rows = [
    p('2026-08-06', 'Session B', 1, 'Push-up'),
    p('2026-08-08', 'Session B', 1, 'Push-up (feet elevated)'),
  ]
  eq('newest set on or before today wins',
    resolve(rows, 'Session B', '2026-08-20').rx.map((x) => x.exercise), ['Push-up (feet elevated)'])
  eq('a future-dated set is invisible until its date',
    resolve(rows, 'Session B', '2026-08-07').rx.map((x) => x.exercise), ['Push-up'])
  eq('no rows before the first set exists', resolve(rows, 'Session B', '2026-08-05').rx, [])
}

// ---- File order must not decide which set is in force ----------------------------------------
{
  const rows = [
    p('2026-08-13', 'Session B', 1, 'Newer, listed first'),
    p('2026-08-06', 'Session B', 1, 'Older, listed last'),
  ]
  eq('max-by-date, not last-row-in-file',
    resolve(rows, 'Session B', '2026-08-20').rx.map((x) => x.exercise), ['Newer, listed first'])
}

// ---- Ordering and empty cases ----------------------------------------------------------------
{
  const rows = [
    p('2026-08-13', 'Session X', 3, 'third'),
    p('2026-08-13', 'Session X', 1, 'first'),
    p('2026-08-13', 'Session X', 2, 'second'),
  ]
  eq('rows render in `order`, not file order',
    resolve(rows, 'Session X', '2026-08-13').rx.map((x) => x.exercise), ['first', 'second', 'third'])
  eq('a session with no prescription renders nothing', resolve(rows, 'Rest + back rehab', '2026-08-13').rx, [])
  eq('no session name renders nothing', resolve(rows, null, '2026-08-13').rx, [])
}

// =================================================================================================
// X-13 · one resolver, used by all three call sites
// =================================================================================================
console.log('\none resolver, not three')

{
  // Comments stripped: a rule about what the CODE does must not be satisfied — or broken — by
  // prose about it. The log page's comment quotes the very expression the last check forbids.
  const code = (path) => src(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
  const forecast = code('src/lib/forecast.ts')
  const todayPage = code('src/app/today/page.tsx')
  const logPage = code('src/app/log/page.tsx')

  // RED FIXTURE for all four assertions below: restore either page's own copy of the resolver
  // (`const effective = (name) => prescriptions.filter(...)` in today/page.tsx, or
  // `forSession.at(-1)` in log/page.tsx) and this section goes red. Both were verified to fail
  // against the pre-W2 files before the fix landed.
  ;(/export function effectiveRx\(/.test(forecast))
    ? ok('effectiveRx is exported from forecast.ts')
    : fail('effectiveRx must be exported from src/lib/forecast.ts', 'X-13 deliverable 1')

  for (const [name, file] of [['today', todayPage], ['log', logPage]]) {
    /from '@\/lib\/forecast'/.test(file)
      ? ok(`${name}/page.tsx imports the shared resolver`)
      : fail(`${name}/page.tsx must import from @/lib/forecast`, 'a fourth copy is a fourth answer')
    !/prescriptions\s*\.filter\s*\(/.test(file)
      ? ok(`${name}/page.tsx keeps no prescription filter of its own`)
      : fail(`${name}/page.tsx is resolving prescriptions itself again`,
          'three copies is how one of them came to resolve by file order')
  }

  // The specific drift that shipped: the log page took the LAST matching row in the file instead
  // of the newest by date, so a hand-inserted row silently changed which set was in force.
  !/\.at\(-1\)/.test(logPage)
    ? ok('the log page no longer resolves a prescription by file position')
    : fail('log/page.tsx resolves by file order', 'append-only makes it look equivalent until it is not')

  // And the shared one really is max-by-date.
  ;/reduce\(\(max, p\) => \(p\.date > max \? p\.date : max\), ''\)/.test(forecast)
    ? ok('the shared resolver is max-by-date')
    : fail('effectiveRx must resolve by max date', 'file order is not effective dating')
}

// =================================================================================================
// X-13 · the day's primary session, chosen rather than taken off the top of the file
// =================================================================================================
console.log('\nprimary session — deliberate, not [0]')

{
  // Drift guard: the mirrored status rank must match the real one in forecast.ts.
  const real = src('src/lib/forecast.ts').match(/STATUS_RANK: Record<string, number> = \{([^}]*)\}/)
  const parsed = real
    ? Object.fromEntries([...real[1].matchAll(/(\w+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]))
    : null
  eq('mirrored STATUS_RANK still matches forecast.ts', parsed, STATUS_RANK)
}

{
  // THE RED FIXTURE, and it is not hypothetical: this is 2026-08-08's real shape. Two completed
  // rows, the walk written first, and the lift is the one with a prescription and the one sets get
  // logged against. Taking `[0]` returns the walk, which is what put the Sets form's session name
  // one row off — and that name is written into sets.csv, permanently.
  const rx = [
    p('2026-08-08', 'Session B', 1, 'Push-up (feet elevated)'),
    p('2026-08-08', 'Session B', 2, 'Single-arm KB overhead press'),
  ]
  const day = [
    t('Hilly 3-mi loop (2.66 mi actual)', 'completed', { type: 'walk' }),
    t('Session B — Upper Push/Pull + Core', 'completed', { type: 'strength' }),
  ]
  eq('the prescribed session wins over the walk written above it',
    primarySession(day, rx, '2026-08-08').session, 'Session B — Upper Push/Pull + Core')
  eq('...and [0] would have returned the walk — the defect this replaces',
    day[0].session, 'Hilly 3-mi loop (2.66 mi actual)')

  eq('a completed session beats a planned one when neither is prescribed',
    primarySession([t('Planned thing', 'planned'), t('Done thing', 'completed')], [], '2026-08-14')
      .session, 'Done thing')

  // A session he did not do is never the day's session, whatever else it has going for it.
  eq('a skipped session never becomes primary, even holding the only prescription',
    primarySession([t('Session B', 'skipped'), t('BJJ (6pm)', 'completed')], rx, '2026-08-08')
      .session, 'BJJ (6pm)')

  // The case that decides the order of the two middle keys: a completed morning walk beside a
  // planned evening lift. Status-first picks the walk and the evening's sets are then written
  // under it. See the rank comment in forecast.ts.
  eq('a planned session with a prescription outranks a completed one without',
    primarySession([t('Morning walk', 'completed'), t('Session B', 'planned')], rx, '2026-08-08')
      .session, 'Session B')

  eq('one row on the day is still that row', primarySession([t('Session B', 'planned')], rx, '2026-08-08').session, 'Session B')
  eq('no rows resolves to nothing, never to a guess', primarySession([], rx, '2026-08-08'), null)
}

// =================================================================================================
// X-13 · training.csv's descriptive names against prescriptions.csv's short ones
// =================================================================================================
console.log('\nsession names across files')

{
  const rx = [
    p('2026-08-08', 'Session B', 1, 'Push-up'),
    p('2026-08-13', 'Session A (knee-free)', 1, 'Pull-ups'),
    p('2026-08-06', 'Session A', 1, 'Goblet squat'),
    p('2026-08-13', DAILY, 1, 'Quad set'),
  ]
  eq('an exact name resolves to itself', rxSessionFor(rx, 'Session B', '2026-08-20'), 'Session B')
  eq('training.csv\'s descriptive name finds the prescription',
    rxSessionFor(rx, 'Session B — Upper Push/Pull + Core', '2026-08-20'), 'Session B')
  // Both "Session A" and "Session A (knee-free)" answer to the same stem. Picking either would be
  // a guess about which block he actually performed, and the knee is the difference between them.
  eq('an ambiguous stem resolves to nothing rather than a guess',
    rxSessionFor(rx, 'Session A — Lower + Pull', '2026-08-20'), null)
  eq('a reserved name is never adopted as a session\'s prescription',
    rxSessionFor(rx, 'Daily left-knee rehab block (Phase 1 — Settle)', '2026-08-20'), null)
  eq('a session with nothing prescribed resolves to nothing',
    rxSessionFor(rx, 'Walk, flat', '2026-08-20'), null)
  eq('the parenthetical is stripped before the dash, or the dash inside it truncates the name',
    sessionKey('Daily left-knee rehab block (Phase 1 — Settle)'), 'daily left-knee rehab block')
}

// =================================================================================================
// X-13 · set completion is scoped to the session, not just the date
// =================================================================================================
console.log('\nsets belong to a session')

{
  const s = (session, exercise) => ({ session, exercise })
  const day = [s('Session A', 'Bent-over row'), s('Session A', 'Bent-over row')]
  const names = ['Session A — Lower + Pull', 'Session B — Upper Push/Pull + Core']

  // THE RED FIXTURE. Both sessions prescribe a bent-over row. The morning logged two; matching on
  // the date alone renders the evening's row "2 done" and he skips it.
  eq('an evening session does not inherit the morning session\'s sets',
    setsForSession(day, 'Session B — Upper Push/Pull + Core', names).length, 0)
  eq('...and the session that did log them still sees them',
    setsForSession(day, 'Session A — Lower + Pull', names).length, 2)

  // The fallback that keeps every historical row visible: sets.csv says "Session B", training.csv
  // says "Session B — Upper Push/Pull + Core", and 2026-08-08 has both a walk and that lift.
  const real = [s('Session B', 'Push-up (feet elevated)'), s('Session B', 'Suitcase carry')]
  eq('a set written under the short name still matches the descriptive one',
    setsForSession(real, 'Session B — Upper Push/Pull + Core',
      ['Hilly 3-mi loop (2.66 mi actual)', 'Session B — Upper Push/Pull + Core']).length, 2)
  eq('...and the walk gets none of them',
    setsForSession(real, 'Hilly 3-mi loop (2.66 mi actual)',
      ['Hilly 3-mi loop (2.66 mi actual)', 'Session B — Upper Push/Pull + Core']).length, 0)

  // Scoping is a no-op on a one-session day, which is every day before 2026-08-08. A set whose
  // session string matches nothing must not vanish from the only day it could belong to.
  eq('one session on the day means no scoping at all',
    setsForSession([s('Garage circuit', 'Push-up')], 'Garage circuit (Session B variant)',
      ['Garage circuit (Session B variant)']).length, 1)
}

// =================================================================================================
// goals.md's strength markers against what the block actually prescribes
//
// This one REPORTS. Every problem it finds closes by choosing a load, a dose or a marker, and none
// of those is this script's to choose — INVARIANTS.md, "a check that cannot go green without
// inventing data must not be written". The fixtures below are synthetic on purpose so they can
// assert real behaviour; the real chart is run at the end and only ever printed.
// =================================================================================================
console.log('\nstrength markers vs live prescriptions')

{
  const goals = [
    '## Domain: Strength   <- currently #2',
    '',
    '| Marker | Baseline | Date | **Guardrail fires at** | Current |',
    '|---|---|---|---|---|',
    '| Suitcase carry | **50 lb × 55 s/side** | 2026-08-11 | **≤ 49 s/side** @ 50 lb | — |',
    '',
  ].join('\n')
  const carry = (reps, load) =>
    [p('2026-08-13', 'Session B', 7, 'Suitcase carry', { sets: '3', reps, load })]
  const run = (rx) => markerAudit({
    goalsText: goals, prescriptions: rx, templateSessions: ['Session B'], today: '2026-08-14',
  })

  eq('the domain comes from the athlete\'s own heading, never a hardcoded label',
    run(carry('40-55s/side', '50 lb')).domain, 'Strength')

  // THE RED FIXTURE, and it is the real historical row: the marker was re-anchored to fire below
  // 49 s while the prescription still read 30-40 s, so every compliant set was already below the
  // line. Widen the dose to 40-55s and it goes quiet — which is what makes it a check and not an
  // assertion that something is always wrong.
  eq('a dose that never reaches the fire line is reported',
    run(carry('30-40s/side', '50 lb')).problems.map((x) => x.kind), ['dose'])
  eq('...and a dose that spans the line is not',
    run(carry('40-55s/side', '50 lb')).problems, [])

  eq('a prescription at the wrong load is reported',
    run(carry('40-55s/side', '35 lb')).problems.map((x) => x.kind), ['load'])
  eq('a marker nothing prescribes is reported',
    run([p('2026-08-13', 'Session B', 1, 'Plank', { sets: '2', reps: '30-45s', load: 'BW' })])
      .problems.map((x) => x.kind), ['unprescribed'])
  eq('a prescription in a session the block no longer schedules is not live',
    markerAudit({
      goalsText: goals, today: '2026-08-14', templateSessions: ['Session A (knee-free)'],
      prescriptions: carry('40-55s/side', '50 lb'),
    }).problems.map((x) => x.kind), ['unprescribed'])

  // An open-ended dose can read anywhere, so it can never be "a dose that cannot reach the line".
  // Claiming otherwise would be the check inventing a bound the prescription does not have.
  eq('an AMRAP dose is never reported as unreachable',
    run([p('2026-08-13', 'Session B', 7, 'Suitcase carry',
      { sets: '3', reps: 'AMRAP-2', load: '50 lb' })]).problems, [])

  eq('a chart with no marker table produces nothing',
    markerAudit({ goalsText: '# Goals\n', prescriptions: carry('30-40s/side', '50 lb') }).problems, [])
  eq('...and parsing it finds no domain to invent', parseMarkerTable('# Goals\n').domain, null)
}

// =================================================================================================
// Against the real chart — REPORTED, and only with --real (audit F-30)
//
// ⚠ THE ASSERTION THAT USED TO LIVE HERE IS THE ONE F-30 IS NAMED AFTER: *"the Daily block is
// non-empty (11 rows) — the rehab plan reaches the athlete"*. It is a true and useful statement
// about THIS chart and a guaranteed failure on any chart that has not prescribed a daily block,
// which is every chart on day one. The mechanism it was standing in for — a reserved session name
// keeping its own effective-dating timeline — is asserted on fixtures in `scripts/test-views.mjs`,
// where it reproduces the actual defect instead of its absence.
//
// Everything below is gated on the chart having the rows it needs, so an empty chart prints
// "not applicable" rather than going red.
// =================================================================================================
if (REAL_DATA) {
  console.log('\nthe live chart (--real)')
  const parse = (csv) => {
    const [head, ...lines] = csv.trim().split('\n')
    const cols = head.split(',')
    return lines.map((line) => {
      const cells = line.match(/("([^"]|"")*"|[^,]*)/g).filter((_, i) => i % 2 === 0)
      return Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? '').replace(/^"|"$/g, '').replace(/""/g, '"')]))
    })
  }
  const rows = parse(readFileSync(join(ROOT, 'data/prescriptions.csv'), 'utf8'))
  const constants = JSON.parse(readFileSync(join(ROOT, 'athlete/constants.json'), 'utf8'))
  const template = constants.program?.weeklyTemplate ?? {}
  const KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  // Every session the template can land on must resolve without borrowing another session's rows.
  let leaked = 0
  for (const key of KEYS) {
    const name = template[key]?.session
    if (!name) continue
    const { rx } = resolve(rows, name, '2026-12-31')
    const wrong = rx.filter((r) => r.session !== name)
    if (wrong.length) leaked++
  }
  eq('no template session borrows another session\'s rows', leaked, 0)

  const daily = effective(rows, DAILY, '2026-12-31')
  ok(daily.length > 0
    ? `the ${DAILY} block resolves to ${daily.length} row(s) — it reaches the athlete`
    : `no ${DAILY} rows on this chart — nothing prescribes a daily block, which is a valid chart`)

  // --- the two-session days this chart actually has ---------------------------------------------
  const training = parse(readFileSync(join(ROOT, 'data/training.csv'), 'utf8'))
  const setRows = parse(readFileSync(join(ROOT, 'data/sets.csv'), 'utf8'))
  const multi = [...new Set(training.map((r) => r.date))]
    .filter((d) => training.filter((r) => r.date === d).length > 1)
    .sort()
  ok(`${multi.length} date(s) carry more than one training row: ${multi.join(', ') || 'none'}`)

  // Every set on one of those days must belong to exactly one of that day's sessions. Reported,
  // never failed: the only fix for an orphan is editing a `session` cell in sets.csv, and that is
  // the athlete's record to correct, not this script's to demand. The teeth for this logic are in
  // the synthetic fixtures above.
  let orphaned = 0
  for (const date of multi) {
    const names = training.filter((r) => r.date === date).map((r) => r.session)
    for (const s of setRows.filter((r) => r.date === date)) {
      const owners = names.filter((nm) => setsForSession([s], nm, names).length)
      if (owners.length !== 1) orphaned++
    }
  }
  ok(orphaned === 0
    ? 'every set on a multi-session day belongs to exactly one of that day\'s sessions'
    : `${orphaned} set(s) on multi-session days match no session, or match two — worth a look at `
      + 'the session column in data/sets.csv')

  // The marker audit against the live chart. Printed, never failed — see the section header.
  const constantsRaw = JSON.parse(readFileSync(join(ROOT, 'athlete/constants.json'), 'utf8'))
  const goalsText = readFileSync(join(ROOT, 'athlete/goals.md'), 'utf8')
  const audit = markerAudit({
    goalsText,
    prescriptions: rows,
    templateSessions: Object.values(constantsRaw.program?.weeklyTemplate ?? {}).map((d) => d?.session),
    today: '2026-12-31',
  })
  ok(`${audit.markers.length} strength markers on file; `
    + `${new Set(audit.problems.map((x) => x.marker)).size} cannot be read against the live block`)
  for (const problem of audit.problems) console.log(`       · ${problem.message}`)
} else {
  console.log('\nthe live chart — skipped (pass --real to include it)')
}

console.log(failed ? `\nprescriptions: ${failed} FAILED.` : '\nprescriptions: all checks passed.')
process.exit(failed ? 1 : 0)
