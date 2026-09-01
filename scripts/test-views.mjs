#!/usr/bin/env node
/**
 * Regression tests for the dashboard's derived-view logic: `src/lib/rollup.ts` (which drives
 * History and the home page) and `src/lib/forecast.ts` (which drives Next 7 Days).
 *
 * WHY. `validate-data.mjs` checks the DATA. Until 2026-08-13 nothing checked the LOGIC that reads
 * it, and that logic had already produced two athlete-visible defects:
 *   - History and the weekly rollup rendered `burn_total_kcal` raw, so a day in progress reported
 *     1,802 kcal burned at 10:15 on 16 steps. Fixed by moving proration into `rollDay`.
 *   - The Today tab rendered one session's exercises under another session's heading.
 * Both were reported by the athlete against the live dashboard. Neither would have failed CI.
 *
 * ⚠ THE LOGIC BELOW IS MIRRORED FROM THE TYPESCRIPT, NOT IMPORTED FROM IT. This repo has no TS
 * test runner and the views are React server components. Mirroring is the honest cost of that:
 * **if rollup.ts or forecast.ts changes, change this file too.** Where a constant can be read back
 * out of the real source cheaply, it is (see the COUNTS_TOWARD_FLOOR drift guard) — that is a
 * partial defence, not a complete one.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// Not mirrored — imported. Everything numeric moved into scripts/lib/aggregate.mjs in W4 precisely
// so the suites stop keeping their own copy of the code under test; see scripts/test-aggregations.mjs.
import {
  KG_PER_LB, dayFractionDomain, partialBurnFrom, pctOfTarget, sessionKcal,
} from './lib/aggregate.mjs'
import { DAILY, SUPPLEMENTS, RESERVED_SESSIONS } from './lib/sessions.mjs'
import { REQUIRED_PLAN_FIELDS, missingPlanFields } from './lib/schema.mjs'
import { REAL_DATA, modeBanner } from './lib/test-mode.mjs'
import { weekdayKey } from './lib/weekdays.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = (p) => readFileSync(join(ROOT, p), 'utf8')

/**
 * Source with comments stripped, for any check asking "does the CODE do X".
 *
 * Same reason as `scripts/test-aggregations.mjs`'s: the files under test explain the defects they
 * fixed by quoting them, so a raw scan for `weeklyAlcoholKcalBudget / 7` finds it in the very
 * comment recording that it must never be written. JSX comments are `{/* … *​/}`, which the block
 * rule below removes along with the braces around them.
 */
const code = (p) => src(p)
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

console.log(modeBanner('views'))

let failed = 0
const ok = (name) => console.log('  ok   ' + name)
const fail = (name, detail) => { failed++; console.log('  FAIL ' + name + '\n       ' + detail) }
const eq = (name, actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected)
    ? ok(name)
    : fail(name, `expected ${JSON.stringify(expected)}\n       got      ${JSON.stringify(actual)}`)
const near = (name, actual, expected, tol = 0.5) =>
  Math.abs(actual - expected) <= tol ? ok(name) : fail(name, `expected ~${expected}, got ${actual}`)

// =================================================================================================
// rollup.ts
// =================================================================================================
console.log('rollup — burn proration')

const n = (v) => (v == null || v === '' ? null : Number(v))

/** The real function, not a mirror. `meals` become an intake total, which is all it needs. */
const partialBurn = (e, meals, fraction) =>
  partialBurnFrom(e ?? undefined, meals.length ? meals.reduce((a, m) => a + (n(m.kcal) ?? 0), 0) : null,
    fraction)

/** The latest fraction a real clock can produce: 23:59, i.e. 1439/1440. See F-55 below. */
const LATEST = Math.max(...dayFractionDomain())

{
  // The real 2026-08-13 shape that produced the athlete's "1,802 kcal burned at 10:15" report.
  const e = { rmr_kcal: '1618', neat_other_kcal: '162', tef_kcal: '94', steps_kcal: '1', session_kcal: '0' }
  const whole = 1618 + 162 + 94 + 1 + 0

  near('at 10:15 (0.427 of the day) burn is far below the whole-day figure',
    partialBurn(e, [], 0.427).burnSoFarKcal, (1618 + 162) * 0.427 + 95, 1)
  const at1015 = partialBurn(e, [], 0.427).burnSoFarKcal
  at1015 < whole * 0.7
    ? ok(`...and specifically ${Math.round(at1015)} kcal, not the whole-day ${whole}`)
    : fail('partial burn must be well under the whole-day figure', `${at1015} vs ${whole}`)

  // ⚠ 23:59, NOT 1. This case used to read `partialBurn(e, [], 1)` — an input production cannot
  // generate, since fractionOfDayElapsed() maxes at 1439/1440 — so it certified the end-of-day
  // branch against a fraction the real code never reaches (audit F-55, INVARIANTS.md X-10).
  // scripts/test-aggregations.mjs now scans every suite for exactly this and fails on it.
  near('at the last minute of the day the accrued figure has all but converged',
    partialBurn(e, [], LATEST).burnSoFarKcal, whole - (1618 + 162) / 1440, 0.001)
  near('at midnight only the accrued components count',
    partialBurn(e, [], 0).burnSoFarKcal, 95, 0.001)
  eq('no energy row yields null, never 0', partialBurn(null, [], 0.5).burnSoFarKcal, null)
}

{
  // Steps, session and TEF must NOT be prorated — they only exist once logged.
  const e = { rmr_kcal: '1000', neat_other_kcal: '0', tef_kcal: '0', steps_kcal: '400', session_kcal: '200' }
  near('accrued components are not scaled by the clock', partialBurn(e, [], 0.5).burnSoFarKcal, 1100, 0.001)
}

console.log('\nrollup — day and week')

/** Mirror of rollup.rollDay's null-preserving sums. */
const sumOrNull = (rows, key) => {
  const v = rows.map((r) => n(r[key])).filter((x) => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) : null
}

{
  eq('no meals gives null intake, not 0', sumOrNull([], 'kcal'), null)
  eq('a measured zero is preserved', sumOrNull([{ kcal: '0' }], 'kcal'), 0)
  eq('blank cells are skipped but present ones still sum', sumOrNull([{ kcal: '100' }, { kcal: '' }], 'kcal'), 100)
}

{
  // ⚠ THIS GUARD HAS BEEN WRONG TWICE, IN OPPOSITE DIRECTIONS, AND BOTH ARE INSTRUCTIVE.
  //
  // First (audit F-70) it regex-parsed `rollup.ts` while an identical `COUNTS_TOWARD_FLOOR` also
  // sat in `forecast.ts`, so a change to the second copy passed CI green while the home page and
  // Next 7 Days counted different sessions against the same floor. W5 moved the set to
  // `src/lib/data.ts` and pointed the guard there.
  //
  // Then the guard asserted the set's CONTENTS — `['bjj','circuit','peloton','strength']` — which
  // made a suite in shared code assert this athlete's activity list (X-11, audit F-15). W7 moved
  // the list into `athlete/constants.json`'s `sessionTypes` registry, so what is left to check is
  // the SHAPE: `data.ts` must read it from the bundle and must not declare a literal of its own.
  const decl = src('src/lib/data.ts').match(/COUNTS_TOWARD_FLOOR = (.*)$/m)?.[1] ?? ''
  ;(/countsTowardFloor/).test(decl)
    ? ok('the session-floor set is read from the chart, not declared in data.ts')
    : fail('COUNTS_TOWARD_FLOOR must come from the registry via the bundle', decl)
  !(/new Set\(\[\s*'/).test(decl)
    ? ok('...and data.ts holds no literal list of one athlete\'s activities')
    : fail('data.ts declares a hardcoded session-type list again', decl)
}

{
  // The floor arithmetic, on a fixture rather than on this chart's types. `COUNTS` is whatever the
  // chart registered; the rule under test is "completed, and in the set".
  const COUNTS = new Set(['alpha', 'beta'])
  const counted = (rows) => rows.filter((s) => s.status === 'completed' && COUNTS.has(s.type)).length
  eq('a planned session does not count until completed',
    counted([{ type: 'alpha', status: 'planned' }]), 0)
  eq('a completed type outside the set does not count toward the floor',
    counted([{ type: 'gamma', status: 'completed' }]), 0)
  eq('two completed registered types both count',
    counted([{ type: 'alpha', status: 'completed' }, { type: 'beta', status: 'completed' }]), 2)
}

{
  // loggedDays is the PROTEIN denominator — days he logged food — and is deliberately not the
  // energy-balance denominator. That one is `balanceDays`, and it lives in
  // scripts/lib/aggregate.mjs with an exhaustive property suite over it (F-51).
  const days = [
    { burnToDateKcal: 2000, intakeKcal: 1700 },
    { burnToDateKcal: 2100, intakeKcal: 1800 },
    { burnToDateKcal: null, intakeKcal: null },
    { burnToDateKcal: null, intakeKcal: null },
  ]
  eq('loggedDays counts only days with intake',
    days.filter((d) => d.intakeKcal != null).length, 2)
}

{
  // The current week contains today; summing today's WHOLE-DAY projection credits calories not
  // yet spent. rollWeek must balance on burnToDateKcal.
  const usesToDate = /d\.burnToDateKcal != null/.test(src('scripts/lib/aggregate.mjs'))
    && /const balance = weekBalance\(days\)/.test(src('src/lib/rollup.ts'))
  usesToDate
    ? ok('rollWeek balances on burnToDateKcal, not the whole-day burnKcal')
    : fail('rollWeek must balance on burnToDateKcal', 'the current week would count unspent calories')
  const inProgressByDate = /const inProgress = date === today\(\)/.test(src('src/lib/rollup.ts'))
  inProgressByDate
    ? ok('inProgress is keyed off the date, not energyComplete')
    : fail('inProgress must be date === today()', 'energyComplete flips true at breakfast')
}

// =================================================================================================
// forecast.ts
// =================================================================================================
console.log('\nforecast — Next 7 Days')

/**
 * ⚠ **A FIXTURE CHART, NOT THIS ONE** (audit F-30). Everything below used to read
 * `src/generated/data.json` — the live bundle — so `the daily rehab block appears on all 7 days`
 * asserted that *this athlete* currently has a rehab block. On an empty chart that is a red suite
 * on a new athlete's first push, for having no history yet.
 *
 * The fixture is deliberately a **different athlete**: a runner and swimmer, with a session-type
 * registry this repo has never seen. If any of the logic below still only works for the chart it
 * was written against, it fails here — which is the whole claim W7 is making.
 *
 * The live chart is still exercised, at the end of this file, behind `--real`
 * (`scripts/lib/test-mode.mjs`), where every assertion is gated on the chart actually having the
 * rows it needs. `scripts/check-all.mjs` passes the flag.
 */
const FIX_TODAY = '2026-08-10' // a Monday, so the week below covers every weekday key
const FIXTURE = {
  plan: {
    latestWeightLb: 150,
    baselineWeightLb: 155,
    // ⚠ **THE FIXTURE IS A WEARABLE CHART AND NOW SAYS SO.** It carried a step target and no
    // declaration, which is the shape `validate-data.mjs` rejects and the one that used to
    // double-count. `observedSteps` sits below the target on purpose: a chart whose athlete walks
    // less than they aim to is the case where pricing the forward row at the target is wrong, and
    // a fixture where the two agree could not tell the two branches apart.
    stepFeed: 'apple-health-shortcut',
    stepsPerDayTarget: 8000,
    observedSteps: { meanSteps: 6000, days: 20, from: '2026-07-20', to: '2026-08-08' },
    kcalPerStepPerLb: 0.00025,
    dailyBlockType: 'mobility',
    metByType: { run: 9.8, swim: 7.0, gym: 5.0, stroll: 0, mobility: 3.0, rest: 0, other: 4.0 },
    // The duration comes from the registry, the same place the LEDGER reads it — see
    // `addDailyBlock` in src/lib/forecast.ts for why that is one key rather than two.
    sessionTypeDetail: { mobility: { standingDurationMin: 12 } },
    metByIntensity: { run: { light: 6.0, moderate: 9.8, hard: 11.5 } },
    countsTowardFloor: ['run', 'swim', 'gym'],
    weeklyTemplate: {
      Mon: { type: 'run', session: 'Easy run', focus: 'Aerobic base', durationMin: 45 },
      Tue: { type: 'gym', session: 'Gym A', focus: 'Lower body', durationMin: 40 },
      // A pinned MET below the type default, the way a deliberately easy session is described.
      Wed: { type: 'swim', session: 'Pool', focus: 'Technique only', durationMin: 40, met: 5.0 },
      Thu: { type: 'stroll', session: 'Evening stroll', focus: 'Steps', durationMin: 40 },
      Fri: { type: 'run', session: 'Tempo', focus: 'Threshold', durationMin: 50 },
      Sat: { type: 'rest', session: 'Rest', focus: 'Nothing', durationMin: 0 },
      Sun: { type: 'run', session: 'Long run', focus: 'Endurance', durationMin: 90 },
    },
  },
  prescriptions: [
    { date: '2026-08-01', session: DAILY, order: '1', exercise: 'Ankle mobility' },
    { date: '2026-08-01', session: SUPPLEMENTS, order: '1', exercise: 'Creatine 5 g' },
    { date: '2026-08-01', session: 'Gym A', order: '1', exercise: 'Back squat' },
    { date: '2026-08-01', session: 'Gym A', order: '2', exercise: 'Bench press' },
  ],
  training: [
    { date: FIX_TODAY, type: 'gym', session: 'Gym A', status: 'completed', duration_min: '40' },
  ],
}

const { plan, prescriptions, training } = FIXTURE
const addDays = (iso, d) => {
  const x = new Date(`${iso}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + d)
  return x.toISOString().slice(0, 10)
}
// NOT mirrored — imported at the top of this file, along with KG_PER_LB. A suite that retypes the
// formula it is checking proves the retyping is self-consistent and nothing else (X-10), and this
// was the fourth copy of `MET × 3.5 × kg / 200`.
const effectiveRx = (session, date) => {
  const rows = prescriptions.filter((p) => p.session === session && p.date <= date)
  const eff = rows.reduce((max, p) => (p.date > max ? p.date : max), '')
  return rows.filter((p) => p.date === eff).sort((a, b) => Number(a.order) - Number(b.order))
}
/**
 * Mirror of forecast.planDay, reduced to the numbers.
 *
 * ⚠ Rewritten 2026-08-14 (W2) to cost EVERY session on the day, not `training.find(...)` — the
 * first row on the date. 2026-08-08 has a walk and a lift; the lift was worth zero calories here
 * because the walk happened to be written above it. Since 2026-08-13 the daily rehab block is
 * written as its own row too, so nearly every day has two.
 */
const STATUS_RANK = { completed: 0, planned: 1, rest: 2, skipped: 3 }
/** Mirror of forecast.sessionKey / rxSessionFor — see scripts/test-prescriptions.mjs for the cases. */
const sessionKey = (s) => (s ?? '').toLowerCase()
  .replace(/\s*\(.*$/, '').replace(/\s+[—–-]\s+.*$/, '').replace(/\s+/g, ' ').trim()
const rxSessionForIn = (rx, session, date) => {
  if (!session) return null
  if (rx.some((p) => p.session === session && p.date <= date)) return session
  const named = [...new Set(rx
    .filter((p) => p.date <= date && !RESERVED_SESSIONS.includes(p.session))
    .map((p) => p.session))].filter((nm) => sessionKey(nm) === sessionKey(session))
  return named.length === 1 ? named[0] : null
}
const rxSessionFor = (session, date) => rxSessionForIn(prescriptions, session, date)
const rxFor = (session, date) => {
  const name = rxSessionFor(session, date)
  return name ? effectiveRx(name, date) : []
}
const orderedSessionsIn = (rx, rows, date) => rows
  .map((r, i) => ({
    r,
    k: [r.status === 'skipped' ? 1 : 0, rxSessionForIn(rx, r.session, date) ? 0 : 1,
      STATUS_RANK[r.status] ?? 2, i],
  }))
  .sort((a, b) => {
    for (let i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i]
    return 0
  })
  .map((x) => x.r)

/**
 * The mirror, parameterised on a bundle rather than closing over one.
 *
 * It took a bundle argument as of W7 so the same code can be run over a FIXTURE chart, over a
 * fixture with one field removed (the daily-block cases below), and — behind `--real` — over the
 * live chart. Before that it closed over `src/generated/data.json` and could only ever describe
 * this athlete (audit F-30).
 */
const planDayIn = (b, date) => {
  const { plan, prescriptions, training } = b
  const effectiveRx = (session, at) => {
    const rows = prescriptions.filter((p) => p.session === session && p.date <= at)
    const eff = rows.reduce((max, p) => (p.date > max ? p.date : max), '')
    return rows.filter((p) => p.date === eff).sort((a, c) => Number(a.order) - Number(c.order))
  }
  const rxFor = (session, at) => {
    const name = rxSessionForIn(prescriptions, session, at)
    return name ? effectiveRx(name, at) : []
  }
  const rows = orderedSessionsIn(prescriptions, training.filter((r) => r.date === date), date)
  const t = plan.weeklyTemplate?.[weekdayKey(date)] ?? null
  const lb = plan.latestWeightLb ?? plan.baselineWeightLb

  // A template field describes the template day's OWN session. Guarded on type, exactly as the
  // pinned MET already was — `focus` and `durationMin` were not, which is how a written row of a
  // different type came to borrow both.
  const describe = (written) => {
    const from = written ? (t && written.type === t.type ? t : null) : t
    return {
      session: written?.session ?? t?.session ?? null,
      type: written?.type ?? t?.type ?? null,
      focus: from?.focus ?? null,
      min: (written ? n(written.duration_min) : null) ?? from?.durationMin ?? null,
      written,
    }
  }
  const sessions = rows.length ? rows.map(describe) : t ? [describe(null)] : []

  const cost = (s) => {
    if (!s.type || s.type === 'rest') return 0
    const pinned = t?.met != null && s.type === t.type ? t.met : null
    const met = pinned ?? plan.metByType?.[s.type] ?? null
    return met > 0 && s.min ? sessionKcal(met, s.min, lb) : 0
  }
  const sess = sessions.reduce((a, s) => a + cost(s), 0)
  const blockType = plan.dailyBlockType
  const blockMin = blockType ? plan.sessionTypeDetail?.[blockType]?.standingDurationMin : null
  const dailyBlock = effectiveRx(DAILY, date).length && blockMin
    ? sessionKcal(plan.metByType[blockType], blockMin, lb) : 0
  /**
   * ⚠ **THE MOVEMENT TERM, MIRRORING `addMovement` IN src/lib/forecast.ts — BOTH BRANCHES.**
   *
   * This read `plan.stepsPerDayTarget * plan.kcalPerStepPerLb * lb`, which mirrored a function
   * that no longer exists. Two ways that lied, and this suite stayed green through both: on a
   * chart WITH a feed it priced the forward day at the TARGET while the code priced it at the
   * observed mean (on a chart walking well under target that is the movement term reported more
   * than twice its real value); and on a chart WITHOUT one `stepsPerDayTarget` is absent, so every
   * projected total came out `NaN` — on the configuration this whole term exists for.
   *
   * ⚠ **A MIRROR IS ONLY WORTH WHAT ITS DRIFT GUARD IS WORTH.** Nothing here RUNS the TypeScript,
   * so this file cannot notice by itself that it has gone stale — that is what the shape
   * assertions in `scripts/test-aggregations.mjs` are for, and they now read THIS file as well as
   * the source, which is the half that was missing. Anyone editing `addMovement` edits this too.
   */
  const perStep = plan.kcalPerStepPerLb ?? null
  const steps = (plan.stepFeed ?? '').trim()
    ? ((plan.observedSteps?.meanSteps ?? plan.stepsPerDayTarget ?? 0) * (perStep ?? 0) * lb)
    : (plan.movementKcal ?? 0)
  const primary = sessions[0] ?? null
  return {
    sessions,
    session: primary?.session ?? null,
    type: primary?.type ?? null,
    focus: primary?.focus ?? null,
    min: primary?.min ?? null,
    met: primary ? (t?.met != null && primary.type === t.type ? t.met : plan.metByType?.[primary.type] ?? null) : null,
    sess,
    dailyBlock,
    steps,
    total: sess + dailyBlock + steps,
    rx: rxFor(primary?.session, date).length,
  }
}

const planDay = (date) => planDayIn(FIXTURE, date)

{
  const lb = plan.latestWeightLb
  near('session model matches data/METHOD.md (MET × 3.5 × kg / 200 × min)',
    sessionKcal(5.0, 35, 179.2), 5.0 * 3.5 * (179.2 * KG_PER_LB) / 200 * 35, 0.001)

  // The pinned-MET rule. A template day may say "this one is deliberately easy" by pinning a MET
  // below the type's default, and the forecast must use the pin. The fixture's Wednesday swim pins
  // 5.0 against a 7.0 default — the same shape as a seated rehab spin under a hard-ride default.
  const [key, day] = Object.entries(plan.weeklyTemplate).find(([, v]) => v.met != null)
  day.met < plan.metByType[day.type]
    ? ok(`${key} pins MET ${day.met}, below the ${day.type} default ${plan.metByType[day.type]}`)
    : fail('the fixture must pin a MET below its type default', `${key}: ${day.met}`)
  const withPin = sessionKcal(day.met, day.durationMin, lb)
  const withDefault = sessionKcal(plan.metByType[day.type], day.durationMin, lb)
  withPin < withDefault
    ? ok(`...worth ${Math.round(withDefault - withPin)} kcal per session of overstatement avoided`)
    : fail('pinned MET should lower the estimate', `${withPin} vs ${withDefault}`)
}

{
  // A type whose energy is already counted in steps must contribute 0 SESSION kcal — the
  // double-count trap. The registry marks such a type `energyCountedIn: 'steps'` and the validator
  // holds its MET at 0; here the forecast half is checked, on a type this repo has never had.
  const [, day] = Object.entries(plan.weeklyTemplate).find(([, v]) => plan.metByType[v.type] === 0)
  eq('a zero-MET day contributes no SESSION kcal (double-count trap)',
    (day.met ?? plan.metByType[day.type]), 0)
}

{
  const week = Array.from({ length: 7 }, (_, i) => planDay(addDays(FIX_TODAY, i)))

  eq('the window is 7 days', week.length, 7)
  week.every((d) => d.total > 0)
    ? ok('every day in the window projects a non-zero movement total')
    : fail('every day should project something', JSON.stringify(week.map((d) => d.total)))
  week.every((d) => d.rx === 0 || d.session)
    ? ok('no prescription is attached to a day with no session')
    : fail('prescriptions only attach to named sessions', '')

  // ⚠ THIS IS THE ASSERTION F-30 IS NAMED AFTER. It used to read "the daily rehab block appears on
  // all 7 days" against the LIVE chart, so it asserted that this athlete currently has a knee. On
  // the fixture it asserts the mechanism instead — and it is strictly stronger, because it also
  // pins the two ways the block can vanish. Either half failing is a silent 400 kcal/week of
  // forecast appearing or disappearing.
  eq('a daily block with a live prescription and a duration is costed on all 7 days',
    week.filter((d) => d.dailyBlock > 0).length, 7)

  const noMinutes = { ...FIXTURE, plan: { ...plan, sessionTypeDetail: { mobility: {} } } }
  const withoutMinutes = Array.from({ length: 7 }, (_, i) =>
    planDayIn(noMinutes, addDays(FIX_TODAY, i)))
  eq('...and on none of them once the chart drops the duration',
    withoutMinutes.filter((d) => d.dailyBlock > 0).length, 0)

  /**
   * ⚠ **THE SESSION TABLE'S STATE COMES FROM THE SESSION BEING RENDERED, NOT FROM THE DAY.**
   *
   * `scripts/lib/session-table.mjs` takes the status as an argument, so its own suite cannot see
   * which status the page hands it — and the page handed it `sessions.some(s => s.status ===
   * 'completed')`, an OR across every training row on the day. Charts log a standing daily block
   * as its own row, so nearly every day has two: finishing the short one closed the main one,
   * deleting its live prescription and printing "Prescribed, not logged" against work in
   * progress. One line, no coverage, and the two things it sat between were both correct.
   *
   * A shape assertion, because the alternative is a fourth mirror. It catches the specific shape
   * that broke: reading the day rather than the session.
   */
  {
    const page = code('src/app/today/page.tsx')
    // The state must come from the session whose prescription is on screen.
    eq('the Today card reads the RENDERED session\'s status, not the day\'s',
      /status: written\?\.status/.test(page), true)
    // An OR across the day closes a session that has not started, whenever a sibling row is done.
    eq('...and never by scanning every training row for a completed one',
      /sessions\.some\(\s*\(?\s*sn?\s*\)?\s*=>\s*sn?\.status === 'completed'/.test(page), false)
    // A boolean reads one bit of a four-value enum, and `skipped` rendered as "still to do".
    eq('...and it passes a STATUS rather than a boolean, so skipped and rest are expressible',
      !/finished:\s/.test(page) && /sessionTable\(\{/.test(page), true)
  }

  /**
   * ⚠ **THE MOVEMENT TERM, ON BOTH CONFIGURATIONS, because a mirror with one branch is a mirror
   * of half the code.** The fixture is a wearable chart; this is the other one.
   */
  {
    const feedDay = planDay(FIX_TODAY)
    eq('a wearable chart prices the forward day at what the athlete WALKS, not at the target',
      Math.round(feedDay.steps), Math.round(6000 * 0.00025 * 150))
    eq('...which on this fixture is strictly below the target figure it used to use',
      feedDay.steps < 8000 * 0.00025 * 150, true)

    // The majority configuration. `stepsPerDayTarget` is ABSENT here, not zero — which is what
    // turned every projected total into NaN while this suite reported them as numbers.
    const noFeed = {
      ...FIXTURE,
      plan: {
        ...plan,
        stepFeed: undefined,
        stepsPerDayTarget: undefined,
        observedSteps: null,
        movementKcal: 187.5,
        movementLevel: 'light',
        movementLevelDeclared: true,
      },
    }
    const noFeedWeek = Array.from({ length: 7 }, (_, i) => planDayIn(noFeed, addDays(FIX_TODAY, i)))
    eq('a chart with no wearable still has a movement term on every forward day',
      noFeedWeek.filter((d) => d.steps > 0).length, 7)
    eq('...and no projected total is NaN — the state this suite reported as a number for a week',
      noFeedWeek.every((d) => Number.isFinite(d.total)), true)
    eq('...and it is the described level, not a step target it does not have',
      Math.round(noFeedWeek[0].steps), 188)
  }

  const noBlock = { ...FIXTURE, prescriptions: prescriptions.filter((p) => p.session !== DAILY) }
  const withoutBlock = Array.from({ length: 7 }, (_, i) =>
    planDayIn(noBlock, addDays(FIX_TODAY, i)))
  eq('...and on none of them when no daily block is prescribed at all',
    withoutBlock.filter((d) => d.dailyBlock > 0).length, 0)

  // A template day's pinned MET describes that day's own session. A written row that substitutes a
  // different TYPE must not inherit it — a strength session landing on a pinned ride day was
  // costed at the ride's MET on 2026-08-13.
  const [key, day] = Object.entries(plan.weeklyTemplate).find(([, v]) => v.met != null)
  const other = Object.keys(plan.metByType).find((t) => t !== day.type && plan.metByType[t] > 0)
  const impostor = { ...day, type: other, durationMin: 35 }
  const wrong = sessionKcal(day.met, 35, plan.latestWeightLb)
  const right = sessionKcal(plan.metByType[other], 35, plan.latestWeightLb)
  const usedMet = impostor.type === day.type ? day.met : plan.metByType[impostor.type]
  eq(`a ${other} session on the pinned ${key} slot uses its own MET`, usedMet, plan.metByType[other])
  Math.round(wrong) !== Math.round(right)
    ? ok(`...worth ${Math.abs(Math.round(wrong - right))} kcal of mis-costing avoided`)
    : ok('...pin and default happen to coincide')

  // A written training.csv row must beat the template. The fixture's Monday is a written `Gym A`
  // against a template that says `Easy run`.
  const names = training.filter((r) => r.date === FIX_TODAY).map((r) => r.session)
  eq('a written training row wins over the template', planDay(FIX_TODAY).session, names[0])
  eq('...and the template session it displaced is not what renders',
    planDay(FIX_TODAY).session === plan.weeklyTemplate.Mon.session, false)
}

console.log('\nforecast — a day with two sessions')

{
  // THE RED FIXTURE for W2's forecast half. Both are real rows: 2026-08-08's hilly walk and
  // Session B. `training.find(...)` returned the walk — MET 0, because walking's energy lives in
  // steps — so the strength session was worth ZERO on the forecast and the day looked like a rest
  // day with a stroll on it. Restore `.find` in the mirror above and this goes red.
  const lb = plan.latestWeightLb ?? plan.baselineWeightLb
  // Two completed rows on one day, the zero-MET one written first. That is 2026-08-08's real shape
  // and it is reproduced here with the fixture chart's types rather than this athlete's.
  const both = [
    { session: 'Evening stroll', type: 'stroll', status: 'completed', duration_min: '50' },
    { session: 'Gym A — Lower body', type: 'gym', status: 'completed', duration_min: '40' },
  ]
  const cost = (rows) => rows.reduce((a, r) => {
    const met = plan.metByType?.[r.type] ?? 0
    return a + (met > 0 && r.duration_min ? sessionKcal(met, Number(r.duration_min), lb) : 0)
  }, 0)
  const walkOnly = cost([both[0]])
  const everything = cost(both)
  eq('the zero-MET session on its own costs nothing — its energy is in steps', Math.round(walkOnly), 0)
  everything > 0
    ? ok(`...and both sessions together cost ${Math.round(everything)} kcal, which [0] threw away`)
    : fail('a day with two sessions must cost both', `${everything}`)

  // The template's `focus` and `durationMin` are guarded the way its `met` already was. This is
  // how Thursday's card came to read "Walk, flat + Peloton TEST RIDE — Steps. No Peloton while
  // the knee is out", and — worse — how a row with a deliberately blank duration would borrow the
  // template's minutes and be costed as if it had reported them.
  const tmpl = { type: 'stroll', session: 'Evening stroll', focus: 'Steps only', durationMin: 40 }
  const guarded = (written) => (written.type === tmpl.type ? tmpl : null)
  eq('a written row of the same type keeps the template focus',
    guarded({ type: 'stroll' })?.focus, 'Steps only')
  eq('a written row of a different type gets no focus from the template',
    guarded({ type: 'swim' })?.focus ?? null, null)
  eq('...and no duration either — a blank duration means "not measured", never "borrow 40"',
    guarded({ type: 'swim' })?.durationMin ?? null, null)

  const fc = src('src/lib/forecast.ts')
  ;(/focus: t\?\.focus \?\? null/.test(fc) && /const fromTemplate = /.test(fc))
    ? ok('forecast.ts takes focus from the guarded template, not the raw one')
    : fail('forecast.ts must guard the template focus', 'the same scope leak as the pinned MET')
}

// =================================================================================================
console.log('\nthe weekly budget card — /today, 2026-08-14')
// His request, verbatim: "We should have a weekly target chart, just like the daily, but including
// alcohol. So each day, I can see where I stand for the day and for the week. Both charts should
// show both calories and %."
//
// The arithmetic is asserted in scripts/test-aggregations.mjs against the real functions. What is
// checked here is the RENDERING, because that is where the flattering pairing lives: a numerator
// against the wrong denominator is arithmetically fine and still tells him he has room he has not
// got.
// =================================================================================================

{
  const page = code('src/app/today/page.tsx')

  // ⚠ THE MIS-PAIRING GUARD. Pointing Food at `budget.total` instead of `budget.food` flatters him
  // by eight points and nothing else in the system notices: 8,745 of 12,950 is 68%, 8,745 of 11,550
  // is 76%. Verified red by making exactly that swap.
  //
  // ⚠ **KEYED ON THE TARGET, NOT ON THE METER'S NAME**, and the first version got that backwards.
  // Selecting every meter called "Alcohol" caught the DAILY alcohol row as well — a different
  // quantity that legitimately has no weekly denominator — and demanded it be measured against the
  // weekly budget, i.e. the check would have forced the per-day allocation the whole feature
  // refuses to invent. A one-dimensional selector on a two-dimensional domain, which is X-13, in
  // the check written to stop a different defect. So: **every meter whose target is a weekly budget
  // field must carry the matching name**, and the daily rows are simply not in scope.
  const PAIRING = { Food: 'budget.food', Alcohol: 'budget.alcohol', Total: 'budget.total' }
  const files = ['src/app/page.tsx', 'src/app/today/page.tsx', 'src/app/next7/page.tsx',
    'src/app/history/page.tsx', 'src/app/log/page.tsx']
  const found = new Map()
  for (const f of files) {
    for (const m of code(f).matchAll(/<Meter\b([\s\S]{0,900}?)\/>/g)) {
      const body = m[1]
      const target = body.match(/target=\{([^}]*)\}/)?.[1]?.trim() ?? ''
      const field = target.match(/budget\.(food|alcohol|total)/)?.[0]
      if (!field) continue
      const name = body.match(/name="([^"]+)"/)?.[1] ?? '(unnamed)'
      found.set(field, `${f}:${name}`)
      PAIRING[name] === field
        ? ok(`${f}: the ${name} meter is measured against ${field}`)
        : fail(`${f}: a meter measured against ${field} is labelled "${name}"`,
          `expected ${Object.entries(PAIRING).find(([, v]) => v === field)?.[0]}. Food against the `
          + 'TOTAL budget reads eight points lower and looks like room he has not got.')

      // ⚠ **THE PACE LINE IS ASSERTED ON THE METER, NOT ON THE FILE, AND THAT DISTINCTION IS THE
      // WHOLE CHECK.** The first version of the registry in scripts/test-aggregations.mjs greps
      // today/page.tsx for `planToDateKcal` and `inProgressCounted` anywhere in it — so deleting
      // both `pace={…}` props left every suite GREEN while the tracks lost their line and the
      // bars became exactly the headroom read this feature exists to prevent. Found by deleting
      // them on purpose. The footnote still mentioned the figures, and a mention is not a mark.
      //
      // Alcohol is the deliberate absence and is asserted as such: its budget is weekly and has no
      // per-day allocation, so a pace line there would be an invented seventh.
      //
      // ⚠ **AND WHICH FIGURE IT POINTS AT, not merely that it exists.** Asserting the presence of
      // `pace={` alone let two live sneaks through: pointing Total's line at `budget.total` parks
      // it at 100% so he is permanently "under", and pointing Food's at `planToDateKcal` instead of
      // `foodPaceKcal` hands back the 455 kcal he drank. Both render a line, both are wrong, and
      // both are wrong in the same direction — more room. Found by making the substitutions.
      const PACE_SOURCE = {
        'budget.food': 'foodPaceKcal',
        'budget.total': 'planToDateKcal',
        'budget.alcohol': null, // weekly by design: there is no per-day figure to draw
      }
      const wants = PACE_SOURCE[field]
      const at = body.match(/pace=\{[\s\S]*?\bat:\s*([^,\n]+)/)?.[1]?.trim() ?? null
      if (wants == null) {
        at == null
          ? ok('  ...and carries no pace line, as the weekly allowance has no per-day share')
          : fail(`${f}: the ${name} meter draws a pace line against a weekly-only budget`,
            `at: ${at} — the allowance is weekly on purpose; any line here is a seventh of it`)
      } else if (at == null) {
        fail(`${f}: the ${name} meter has no pace line`,
          'a full-week bar with no line on it is a headroom read — 4,000 of 12,950 on a Tuesday '
          + 'looks like 31% used')
      } else if (!at.includes(wants) || /budget\./.test(at)) {
        fail(`${f}: the ${name} meter's pace line points at the wrong figure`,
          `at: ${at} — expected the ${wants} computed by weekIntake. A line drawn from the BUDGET `
          + 'sits at 100% and reads as permanently under; Food drawn from planToDateKcal hands '
          + 'back every calorie he drank.')
      } else {
        ok(`  ...and its pace line is drawn from ${wants}`)
      }
    }
  }
  const missing = Object.values(PAIRING).filter((v) => !found.has(v))
  missing.length === 0
    ? ok(`all three weekly budget figures reach a meter (${[...found.values()].join(', ')})`)
    : fail(`no surface renders ${missing.join(', ')}`,
      'a budget nothing draws has failed the same way as a budget never set (X-15), and this check '
      + 'silently stops checking anything if the card is deleted (X-10)')

  // The three quantities come from one aggregation over one day set, not from three sums in the
  // page. A page that re-sums them picks its own days again, which is F-51.
  ;(/const wi = wk\.intake/.test(page) && !/sumOrNull\(/.test(page))
    ? ok('the page reads one weekIntake result rather than summing the week itself')
    : fail('today/page.tsx must not compute the week\'s totals', 'one day set, computed once')

  // NO PER-DAY ALCOHOL ALLOWANCE MAY BE MANUFACTURED, anywhere. The budget is weekly because the
  // unevenness is deliberate — the big wine night is scheduled at the weekend and away from the BJJ
  // evenings — so `weeklyAlcoholKcalBudget / 7` is a target nobody set. Watched red by writing
  // exactly that expression into the Meals card.
  const divided = []
  for (const f of [...files, 'src/lib/rollup.ts', 'src/lib/data.ts', 'src/components/ui.tsx',
    'scripts/lib/aggregate.mjs', 'scripts/generate-targets.mjs']) {
    if (/weeklyAlcoholKcalBudget\s*\/|alcohol[A-Za-z]*\s*\/\s*7\b/.test(code(f))) divided.push(f)
  }
  divided.length === 0
    ? ok('nothing divides the weekly alcohol budget into a daily allowance')
    : fail('the weekly alcohol budget is being split per day', `${divided.join(', ')} — see `
      + 'scripts/generate-targets.mjs on why that column stays blank')

  // ...and the generator still leaves the column empty, which is the other half of the same rule.
  ;(/alcohol_kcal: '',/.test(src('scripts/generate-targets.mjs')))
    ? ok('generate-targets.mjs still writes a blank alcohol_kcal on every generated row')
    : fail('generate-targets.mjs is writing an alcohol target', 'a number there is a line nobody set')

  // X-1 on the daily row: an unlogged day is not a zero-alcohol day, so nothing renders at all.
  ;(/d\.alcoholKcal != null \?/.test(page))
    ? ok('the daily alcohol row renders only where a figure exists')
    : fail('a day with no drink logged must render nothing', 'blank is not a measured zero')
}

// =================================================================================================
console.log('\nthe week\'s estimated in / out / produced — /today, 2026-08-15')
// His words: "my goal for the week is still lose 1 lb, so the week needs an estimated cals in and
// estimated cals out to achieve that, and they need to be divided logically amongst the 7 days."
//
// The arithmetic is asserted in scripts/test-aggregations.mjs against the real functions. What is
// checked here is the RENDERING: which day set the figures cover, that the page does not compute
// them itself, and that the daily card says which day it is about.
// =================================================================================================

{
  const page = code('src/app/today/page.tsx')
  const rollup = code('src/lib/rollup.ts')

  // ⚠ THE DAY SET IS THE OPPOSITE OF THE ONE BESIDE IT, AND THAT IS THE HAZARD. `wk.intake` is
  // week-to-date — it answers "where do I stand so far" and rollWeek truncates it at today.
  // `wk.energy` answers "where does the week land", which is a question about days that have not
  // happened, so it has to see all seven. Pointing it at the truncated set would silently report a
  // 5-day week as a 7-day one, understating the burn and the projection with it.
  ;(/const allDays = eachDate\(start, end\)\.map\(rollDay\)/.test(rollup)
    && /const days = allDays\.filter\(\(d\) => d\.date <= through\)/.test(rollup))
    ? ok('rollWeek builds all seven days for the projection and truncates the rest at today')
    : fail('the weekly projection must cover the whole week',
      'a 7-day figure summed over 5 elapsed days understates the burn and the loss with it')
  ;(/energy: weekEnergy\(\{[\s\S]{0,400}?days: allDays\.map/.test(rollup))
    ? ok('...and weekEnergy is handed the full week, not the truncated one')
    : fail('weekEnergy is reading the wrong day set', 'it must take allDays, never days')

  // ONE aggregation, computed once, exactly as the budget card beside it. A page that sums the
  // week itself picks its own days again, which is F-51 — and here it would do it on the surface
  // that says how much he can eat.
  ;(!/estimatedBurnDays\s*[+*/-]|outKcal\s*-\s*.*inKcal/.test(page))
    ? ok('the page renders the projection rather than recomputing any part of it')
    : fail('today/page.tsx is doing the weekly energy arithmetic itself',
      'one home — scripts/lib/aggregate.mjs weekEnergy')

  // THE DIVISION IS THE PLAN'S. `plan.kcalByWeekday` already divides the budget among the seven
  // days and validate-data.mjs asserts it sums to weeklyKcalBudget; a page dividing anything by 7,
  // or restating the total as a literal, has invented a second one. Same rule the alcohol budget
  // already carries one card up.
  const invented = []
  for (const f of ['src/app/today/page.tsx', 'src/lib/rollup.ts', 'src/lib/aggregate.ts',
    'scripts/lib/aggregate.mjs']) {
    if (/weeklyKcalBudget\s*\/|\b12,?950\b/.test(code(f))) invented.push(f)
  }
  invented.length === 0
    ? ok('nothing divides or restates the weekly calorie budget')
    : fail('the weekly budget is being split or retyped', `${invented.join(', ')} — the division `
      + 'lives in plan.kcalByWeekday and nowhere else')

  // The three figures all reach a surface. A projection computed and rendered nowhere has failed
  // the same way as one never computed (X-15), and without this the element-level marker check in
  // test-aggregations.mjs passes by finding nothing to mark.
  for (const field of ['inKcal', 'outKcal', 'lossLb']) {
    new RegExp(`wk\\.energy\\.${field}\\b`).test(page)
      ? ok(`wk.energy.${field} reaches the page`)
      : fail(`nothing renders wk.energy.${field}`, 'X-15: a number no page shows was not delivered')
  }

  // The out side names its own coverage. "19,109 kcal" with no day count is indistinguishable from
  // a measured week, and the badge alone does not say HOW MUCH of it is estimated.
  ;(/actualBurnDays[\s\S]{0,400}?estimatedBurnDays/.test(page)
    && /observedDays/.test(page) && /perDayBurnKcal/.test(page))
    ? ok('the out figure states how many days are measured, how many estimated, and from what')
    : fail('the projection does not say what it covers',
      'a bare total cannot be told from a measured one')

  // ⚠ HIS RENAME, 2026-08-15: "Meals" -> "Today's Meals", because the card below it is the weekly
  // one and the daily card has to say which scale it is. Asserted as a pair — renaming the weekly
  // card instead would satisfy a check that only looked for the new string.
  ;(/title="Today's Meals"/.test(page) && /title="This week"/.test(page))
    ? ok('the daily card says Today\'s Meals and the weekly card still says This week')
    : fail('the two cards must name their own scale',
      'his reason: the card below the daily one is weekly, so the daily one should say so')
}

console.log('\nthe kcal ⇄ % toggle')

{
  const ui = src('src/components/ui.tsx')
  const toggle = src('src/components/unit-toggle.tsx')

  // Both forms are RENDERED and CSS hides one, so the client boundary is the two buttons and
  // nothing else. If the meters ever became client components, every figure and every plan
  // constant would cross that boundary as props.
  ;(/className="u-kcal"/.test(ui) && /className="u-pct"/.test(ui))
    ? ok('Meter renders both the kcal and the % form')
    : fail('Meter must render both forms', 'the toggle flips one attribute, it does not re-render')

  // ONE guarded division for the whole row. A second, inline one here is audit F-68 reintroduced
  // on the new surface, and it would be invisible — the kcal form beside it would still look right.
  const uiCode = code('src/components/ui.tsx')
  const rawDivides = /\(\s*actual\s*\/\s*target\s*\)|\bleft\s*\/\s*target\b/.test(uiCode)
  ;(/const pct = pctOfTarget\(actual, target\)/.test(uiCode) && !rawDivides)
    ? ok('the % form divides through pctOfTarget, with no inline division beside it')
    : fail('the % form must use the shared guard', 'an inline divide renders Infinity% on a 0 target')

  // ⚠ THE TWO PERCENTAGES MUST SUM TO 100, and the live chart is why this is a check. Computing
  // "left" with its own `pctOfTarget(left, target)` call is arithmetically correct and rendered
  // `Alcohol 33% of 1,400 kcal · 68% left` — 455/1400 is 32.5% and 945/1400 is 67.5%, so both
  // round up and the pair sums to 101. Found by reading the rendered page, not by any check.
  ;(/const leftPctShown = pctShown == null \? null : 100 - pctShown/.test(uiCode)
    && !/pctOfTarget\(left/.test(uiCode))
    ? ok('the remainder is 100 minus the rounded figure, so the pair always sums to 100')
    : fail('the two percentages are rounded independently',
      '32.5% and 67.5% both round up and the row reads 33% + 68%')
  {
    // ...and the grep is backed by the arithmetic, using the real `pctOfTarget`. The two forms are
    // run side by side so this fails if the defect ever stops being a defect (i.e. if the fixture
    // has drifted), rather than asserting a tautology.
    const twoCalls = (a, t) => Math.round(pctOfTarget(a, t)) + Math.round(pctOfTarget(t - a, t))
    const derivedOnce = (a, t) => { const s = Math.round(pctOfTarget(a, t)); return s + (100 - s) }
    let split = 0, closed = 0
    for (let a = 0; a <= 1400; a += 1) {
      if (twoCalls(a, 1400) !== 100) split++
      if (derivedOnce(a, 1400) !== 100) closed++
    }
    ;(split > 0 && closed === 0)
      ? ok(`two roundings disagree on ${split} of 1,401 intakes; one rounding disagrees on none`)
      : fail('the fixture no longer demonstrates the defect',
        `two-call mismatches ${split}, derived mismatches ${closed}`)
    ;(twoCalls(455, 1400) === 101)
      ? ok('...and 455 of 1,400 — the figure on his chart today — is one of them')
      : fail('the live case must reproduce', String(twoCalls(455, 1400)))
  }

  ;(/^'use client'/m.test(toggle) && !/use client/.test(ui))
    ? ok('the toggle is the only client component; ui.tsx stays on the server')
    : fail('the client boundary has moved', 'a client ui.tsx ships every figure to the browser')

  // The server-rendered default must be the form the rest of the chart is written in, so the page
  // reads correctly before any JavaScript arrives — and so the smoke test can read real figures.
  ;(/useState<'kcal' \| 'pct'>\('kcal'\)/.test(toggle))
    ? ok('kcal is the server-rendered default')
    : fail('the toggle must default to kcal', 'the page must be correct with no JS')

  // The CSS is the mechanism; without it both forms show at once and every number appears twice.
  const css = src('src/app/globals.css')
  ;(/\[data-unit="kcal"\] \.u-pct \{ display: none/.test(css)
    && /\[data-unit="pct"\] \.u-kcal \{ display: none/.test(css))
    ? ok('exactly one form is visible at a time')
    : fail('globals.css must hide the inactive form', 'otherwise every figure renders twice')
}

console.log('\ndata — every coach note stands until it is dismissed, not until a newer one arrives')

{
  // Mirror of aggregate.allOnOrBefore — an arrow function on purpose, not `function
  // allOnOrBefore`, so test-single-home.mjs's one-definition-site check does not need an `allow`
  // entry for this file (the same arrangement its latestOnOrBefore mirror above used to use).
  const allOnOrBefore = (rows, date) => rows.filter((r) => r.date <= date)
  const notes = [{ date: '2026-08-06' }, { date: '2026-08-08' }, { date: '2026-08-14' }]

  eq('today shows every outstanding note through today, not just the newest',
    allOnOrBefore(notes, '2026-08-14').map((n) => n.date),
    ['2026-08-06', '2026-08-08', '2026-08-14'])
  eq('a day with no note of its own still shows every note written before it',
    allOnOrBefore(notes, '2026-08-11').map((n) => n.date), ['2026-08-06', '2026-08-08'])
  eq('a future note is invisible until its date',
    allOnOrBefore(notes, '2026-08-07').map((n) => n.date), ['2026-08-06'])
  eq('before the first note there is nothing', allOnOrBefore(notes, '2026-08-05').length, 0)

  // `oneOf` was the original defect (F-60): an exact-date match makes every note visible on
  // exactly one day. `latestOnOrBefore` was the fix that followed it, and was itself replaced —
  // picking one "current" note meant writing a new one silently buried whatever was still showing,
  // which is not the same thing as the athlete having seen and dismissed it (CoachNotes.tsx).
  const page = code('src/app/today/page.tsx')
  ;(/allOnOrBefore\(coachNotes, now\)/.test(page) && /<CoachNotes notes=/.test(page))
    ? ok('the Today tab passes every outstanding note into CoachNotes, not just the newest')
    : fail('today/page.tsx must feed CoachNotes from allOnOrBefore',
      'a single latestOnOrBefore pick silently buries every older outstanding note')
  !/oneOf\(coachNotes/.test(page)
    ? ok('the Today tab no longer looks a note up by exact date')
    : fail('today/page.tsx still uses oneOf for the coach note', 'F-60')

  // The stamp is what stops an old note reading as today's advice — "tonight is budgeted, eat it
  // without arithmetic" is a sentence that must never follow him into the next week undated.
  const notesComponent = code('src/components/CoachNotes.tsx')
  ;(/n\.date !== today &&/.test(notesComponent))
    ? ok('CoachNotes stamps a note that is not today\'s with its own date')
    : fail('an older note must render its date', 'undated, it reads as advice about today')

  // Dismissal has to be permanent — the athlete explicitly asked for no historical record of what
  // was dismissed, so the write path must delete the row rather than mark it read/hidden.
  const rowwrite = code('scripts/lib/rowwrite.mjs')
  ;(/export function removeRow/.test(rowwrite))
    ? ok('coach notes are dismissed by deleting the row, not by a hidden/read flag')
    : fail('no removeRow found in rowwrite.mjs',
      'dismissal must reach data/coach-notes.csv permanently, not just hide the box in the browser')
}

// =================================================================================================
// findings.ts and FindingsCard.tsx — the surface, W1
// =================================================================================================
console.log('\nfindings — build freshness')

{
  // Mirror of src/lib/findings.ts buildFreshness, per the mirroring note at the top of this file.
  // The two thresholds are read back out of the real source below so the mirror cannot drift.
  const daysBetween = (a, b) =>
    Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
  const buildFreshness = (built, now, attentionAt, criticalAt) => {
    if (!built || !now) return null
    const behind = daysBetween(built, now)
    if (!Number.isFinite(behind) || behind < attentionAt) return null
    return { id: 'build-stale', severity: behind >= criticalAt ? 'critical' : 'attention', behind }
  }

  const ts = src('src/lib/findings.ts')
  const constOf = (name) => {
    const m = ts.match(new RegExp(`const ${name} = (\\d+)`))
    return m ? Number(m[1]) : null
  }
  const attentionAt = constOf('STALE_ATTENTION_DAYS')
  const criticalAt = constOf('STALE_CRITICAL_DAYS')
  eq('the mirrored staleness thresholds still match findings.ts', [attentionAt, criticalAt], [1, 2])

  const f = (built, now) => buildFreshness(built, now, attentionAt, criticalAt)

  eq('a bundle built today is silent', f('2026-08-14', '2026-08-14'), null)
  // The red fixture for F-26's dangerous half: a failed deploy leaves the previous deployment
  // live, so the page renders today's date over data from days ago and nothing says so.
  eq('a bundle built yesterday is attention, not silence',
    f('2026-08-13', '2026-08-14')?.severity, 'attention')
  eq('a bundle two days old is critical — something is genuinely stuck',
    f('2026-08-12', '2026-08-14')?.severity, 'critical')
  eq('a bundle a week old is still critical', f('2026-08-07', '2026-08-14')?.severity, 'critical')
  // The nightly false alarm this threshold exists to avoid: daily-rollover pushes at 01:00-02:00
  // local, so between local midnight and that push the newest build is legitimately yesterday's.
  f('2026-08-13', '2026-08-14')?.severity === 'critical'
    ? fail('one day must not be critical', 'it would put a red banner on the page every night')
    : ok('one day behind never reaches critical — daily-rollover legitimately lands after midnight')

  const sortsFirst = /ORDER\.indexOf\(a\.severity\) - ORDER\.indexOf\(b\.severity\)/.test(ts)
  sortsFirst
    ? ok('viewFindings sorts by severity, critical first')
    : fail('viewFindings must sort critical to the top', 'a pinned finding that is not first is not pinned')
}

console.log('\nfindings — the card')

{
  const card = src('src/components/FindingsCard.tsx')
  const lib = src('scripts/lib/findings.mjs')

  // THE assertion. The first version of this card rendered every finding to the athlete, including
  // seven questions only he could answer, on a read-only page. He rejected it outright. A finding
  // reaches him only if scripts/lib/findings.mjs marked it audience: 'athlete'.
  ;(/audience === 'athlete'/).test(card)
    ? ok('the card renders only athlete-audience findings')
    : fail('the card must filter on audience', 'severity is a log level; it says how loud, never who for')

  // Belt and braces: no severity-only grouping may come back, since that is exactly what leaked
  // coach and maintainer findings onto his screen.
  ;(/severity === 'attention'\)/).test(card) || (/severity === 'info'\)/).test(card)
    ? fail('the card is grouping by severity again', 'that is what put a question he cannot answer next to an internal integrity note')
    : ok('the card does not group by severity')

  // One line each. Detail, action and source are for the coach, who has the file open; on a phone
  // the headline is the whole message. If it needs a paragraph it is not an alert.
  ;(/finding-detail|finding-action|finding-meta/).test(card)
    ? fail('the card renders detail/action/source to the athlete', 'WAY too much information — his words')
    : ok('the card renders the headline only')

  // Silence is the default state. No permanent all-clear panel: a reassurance box is a thing he
  // learns to scroll past, which is how the one alert that matters gets missed.
  ;(/if \(!mine\.length\) return null/).test(card)
    ? ok('the card renders nothing when nothing is for him')
    : fail('the card must render null when empty', 'an all-clear box trains him to ignore it')

  // A question for the athlete is never athlete-facing — it cannot be answered here.
  ;(/A QUESTION FOR THE ATHLETE IS NEVER/).test(lib)
    ? ok('the audience rule forbids asking him things on a read-only page')
    : fail('the audience rule must forbid questions on the dashboard', 'ask in conversation, where he can reply')

  // Default-coach, so a NEW finding is invisible to him until someone decides it passes the test.
  ;(/return 'coach'/).test(lib)
    ? ok('unclassified findings default to the coach, not the athlete')
    : fail('the audience default must be coach', 'defaulting onto his screen is the failure this fixes')
}

console.log('\nX-15 — every store the bundle carries has a page that reads it')

{
  const pages = ['src/app/page.tsx', 'src/app/today/page.tsx', 'src/app/next7/page.tsx',
    'src/app/history/page.tsx', 'src/app/log/page.tsx']
  const components = ['src/components/metrics-card.tsx', 'src/components/FindingsCard.tsx']
  // The view libs count as part of the rendering path: W2 moved session resolution into
  // forecast.ts, so `prescriptions` now reaches Today and Log through it rather than by being
  // named in the page. Without them this check would pass on a page COMMENT mentioning the store,
  // which is a check certifying nothing (X-10).
  const libs = ['src/lib/forecast.ts', 'src/lib/rollup.ts']
  const surfaces = [...pages, ...components, ...libs].map(src).join('\n')

  // metrics.csv was parsed, bundled, typed and validated — and imported by nothing, which made
  // the registry constants.json documents as "how a new athlete tracks a new thing" a black hole,
  // and it is the mechanism the Health domain's BP trigger depends on (F-61).
  for (const store of ['metricsRegistry', 'metrics', 'prescriptions', 'targets', 'findings']) {
    new RegExp(`\\b${store}\\b`).test(surfaces)
      ? ok(`${store} reaches a rendering surface`)
      : fail(`${store} is bundled and rendered nowhere`, 'INVARIANTS.md X-15')
  }

  // Reserved session names are the two-way contract between the page and the file, and this
  // asserts BOTH directions.
  //
  // The direction that matters is the second one. `effectiveRx` resolves a session to the rows on
  // its single newest date and renders only those, so writing the supplement stack under `Daily`
  // — the obvious choice, and the one the plan suggested — would have made the stack the newest
  // `Daily` set and SILENTLY DELETED the eleven-item knee-rehab block from Today. The stack has
  // its own reserved name to give it its own effective-dating timeline. If it is ever moved back
  // under `Daily`, the `Supplements` rows go to zero and this goes red.
  //
  // Checking only "do Supplements rows have a surface?" would have been a check that cannot fail:
  // moving the rows away makes the question not applicable, and the test passes while the rehab
  // block disappears (INVARIANTS.md X-10).
  //
  // Read out of scripts/lib/sessions.mjs since W6 — that is where the names moved when
  // check-suspensions.mjs became a fourth consumer and scripts/ could not import the TypeScript.
  // Still PARSED rather than imported: reading the declaration back out of its home is what makes
  // this assert something about the home, rather than about a constant this file also imported.
  const reserved = [...src('scripts/lib/sessions.mjs').matchAll(/export const ([A-Z_]+) = '([^']+)'/g)]
    .map((m) => m[2])
  const newestSetIn = (rows, name) => {
    const forName = rows.filter((p) => p.session === name)
    const eff = forName.reduce((max, p) => (p.date > max ? p.date : max), '')
    return forName.filter((p) => p.date === eff)
  }

  reserved.length
    ? ok(`forecast.ts reserves ${reserved.length} session name(s): ${reserved.join(', ')}`)
    : fail('no reserved session names found in scripts/lib/sessions.mjs', 'the parse below proves nothing')

  // ⚠ **ASSERTED ON A FIXTURE, THEN REPORTED ON THE LIVE CHART** (audit F-30). This used to read
  // `bundle.prescriptions` and assert every reserved name resolved to a live row — true of this
  // chart today, and a guaranteed failure on a chart that has not written a daily block yet, which
  // is every chart on day one.
  //
  // The fixture is strictly stronger, because it reproduces the DEFECT rather than the symptom:
  // put the supplement stack under `Daily` with a newer date and the eleven-item daily block
  // vanishes, silently, because `effectiveRx` resolves a session to the rows on its single newest
  // date. That is why the stack has a reserved name of its own.
  {
    const rows = [
      { date: '2026-08-01', session: DAILY, order: '1', exercise: 'Ankle mobility' },
      { date: '2026-08-01', session: DAILY, order: '2', exercise: 'Isometric hold' },
      { date: '2026-08-05', session: SUPPLEMENTS, order: '1', exercise: 'Creatine 5 g' },
    ]
    eq('separate reserved names keep separate effective-dating timelines',
      [newestSetIn(rows, DAILY).length, newestSetIn(rows, SUPPLEMENTS).length], [2, 1])

    const merged = rows.map((r) => (r.session === SUPPLEMENTS ? { ...r, session: DAILY } : r))
    eq('...and folding the stack under Daily deletes the block — the defect the name exists for',
      newestSetIn(merged, DAILY).map((r) => r.exercise), ['Creatine 5 g'])
  }

  // The live half. Gated on the chart having written any prescription at all, so an empty chart
  // reports "not applicable" instead of failing for having no history (F-30). On a chart that HAS
  // rows this still fails if a reserved name silently loses its own.
  if (REAL_DATA) {
    const live = JSON.parse(src('src/generated/data.json')).prescriptions
    if (!live.length) {
      ok('the live chart has no prescriptions yet — reserved-name check not applicable')
    } else {
      for (const name of reserved) {
        const set = newestSetIn(live, name)
        set.length
          ? ok(`live: "${name}" resolves to ${set.length} row(s) dated ${set[0].date}`)
          : fail(`live: "${name}" is a card on Today with no rows behind it`,
              'either the page renders an empty card, or those rows moved under another session '
              + 'name and took over ITS newest set — which is how a daily block would vanish')
      }
    }
  }
}

// =================================================================================================
// The live chart — REPORTED. See scripts/lib/test-mode.mjs for why this is not where the teeth are.
// =================================================================================================
if (REAL_DATA) {
  console.log('\nthe live chart (--real)')
  const live = JSON.parse(src('src/generated/data.json'))
  const todayIso = live.plan.timezone
    ? new Intl.DateTimeFormat('en-CA', { timeZone: live.plan.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    : new Date().toISOString().slice(0, 10)
  const week = Array.from({ length: 7 }, (_, i) => planDayIn(live, addDays(todayIso, i)))
  console.log(`  ·    next 7 days: ${week.map((d) => Math.round(d.total)).join(' · ')} kcal projected`)
  console.log(`  ·    daily block costed on ${week.filter((d) => d.dailyBlock > 0).length}/7 days`)
  console.log(`  ·    sessions named: ${week.map((d) => d.session ?? '—').join(' · ')}`)

  // The one live ASSERTION kept, because it is about the code and not about the chart: a day that
  // resolves a prescription must have resolved a session to attach it to. It is vacuously true on
  // an empty chart rather than false, so it costs a new athlete nothing.
  week.every((d) => d.rx === 0 || d.session)
    ? ok('live: no prescription is attached to a day with no session')
    : fail('live: prescriptions only attach to named sessions', '')
}

// =================================================================================================
// the bundle contract — `Plan` in src/lib/data.ts, enforced by build-data-json.mjs
// =================================================================================================
//
// The defect these are shown to catch: `JSON.stringify` drops `undefined` keys, so a
// `constants.json` missing `athlete.name` emitted a bundle with no `name` — and the dashboard's
// `bundle.plan as Plan` still passed, because TypeScript infers the literal type of the artifact
// on disk and was therefore only ever comparing the file to itself.
console.log('\nthe bundle contract — a field that goes missing must not ship silently')
{
  const complete = Object.fromEntries(REQUIRED_PLAN_FIELDS.map((k) => [k, 'x']))

  eq('a complete plan is missing nothing', missingPlanFields(complete), [])

  // The exact shape the old casts let through: the key is simply absent.
  const { name, ...noName } = complete
  eq('a dropped field is caught', missingPlanFields(noName), ['name'])

  eq('several dropped fields are all named, not just the first',
    missingPlanFields({ ...complete, timezone: undefined, heightIn: undefined }),
    ['timezone', 'heightIn'])

  // `undefined` and `null` are not interchangeable here, and the split is the point.
  eq('null is allowed where the value is derived and its inputs can be absent',
    missingPlanFields({ ...complete, age: null, rmrFloorKcal: null }), [])
  eq('null is NOT allowed where the value is copied from constants.json',
    missingPlanFields({ ...complete, timezone: null }), ['timezone'])

  // A falsy-but-real value is a value. `heightIn: 0` is wrong, but it is `validate-data.mjs`'s
  // wrong to report — this check is about presence, not plausibility (INVARIANTS.md X-12).
  eq('a falsy but present value is present', missingPlanFields({ ...complete, heightIn: 0 }), [])

  eq('an absent plan fails every field rather than throwing',
    missingPlanFields(undefined).length, REQUIRED_PLAN_FIELDS.length)

  // ⚠ THE TWO LISTS MUST NOT DRIFT, and without this they are exactly the two-homes defect
  // (INVARIANTS.md X-8) one level up from the one they were written to close. `Plan` says which
  // fields a page may read unguarded; `REQUIRED_PLAN_FIELDS` says which the generator enforces.
  // Add a required field to `Plan` and forget the other list, and the guard silently stops
  // covering it — the same silence the casts used to provide.
  //
  // `Plan` is a plain type literal, so "required" is readable off the source: a top-level key
  // with no `?`. Nested braces are tracked, because `metByIntensity?: Record<string, { … }>`
  // puts a `{` on a line that is not a new field.
  const planBody = (() => {
    const text = code('src/lib/data.ts')
    const start = text.indexOf('export type Plan = {')
    const from = text.indexOf('{', start)
    let depth = 0
    for (let i = from; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}' && --depth === 0) return text.slice(from + 1, i)
    }
    return ''
  })()

  const declaredRequired = []
  let depth = 0
  for (const line of planBody.split('\n')) {
    const m = depth === 0 && line.match(/^\s{2}([A-Za-z_$][\w$]*)(\??):/)
    if (m && !m[2]) declaredRequired.push(m[1])
    for (const ch of line) { if (ch === '{') depth++; else if (ch === '}') depth-- }
  }

  eq('every field Plan requires is a field the generator enforces',
    declaredRequired.filter((f) => !REQUIRED_PLAN_FIELDS.includes(f)), [])
  eq('and nothing is enforced that Plan does not require',
    REQUIRED_PLAN_FIELDS.filter((f) => !declaredRequired.includes(f)), [])
}

console.log(failed ? `\nviews: ${failed} FAILED.` : '\nviews: all checks passed.')
process.exit(failed ? 1 : 0)
