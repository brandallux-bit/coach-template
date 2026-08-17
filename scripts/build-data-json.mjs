#!/usr/bin/env node
/**
 * Bundles data/*.csv into src/generated/data.json so the Next.js app can import it statically.
 * Generated at build (`npm run data`), gitignored, and strictly read-only downstream —
 * data/ remains the single source of truth.
 *
 * Also lifts the handful of plan constants the dashboard needs out of the markdown chart, so
 * they are stated in exactly one place here rather than retyped into three page components.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFindings } from './lib/findings.mjs'
import { readChartDocs } from './lib/chart-docs.mjs'
import { readCsv, num } from './lib/csv.mjs'
import { latestOnOrBefore, sessionBurns } from './lib/aggregate.mjs'
import { ageOn, constants, hasChart, rmrFloorKcal, sessionCostFor, stripNotes, metTable,
  KCAL_PER_STEP_PER_LB, KCAL_PER_LB_FAT, metByIntensityTable, localToday, sessionTypeEnum,
  sessionTypes, countsTowardFloorSet,
} from './lib/athlete.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data')
const OUT = join(ROOT, 'src', 'generated')
const GOALS = join(ROOT, 'athlete', 'goals.md')

const body = readCsv(join(DATA, 'body.csv'))

// The weight on record AS OF a date — the same `latestOnOrBefore` compute-energy.mjs and the
// dashboard use, not a fourth forward-fill. A workout logged mid-block must not retroactively use
// a weight the athlete had not reached yet.
const weighIns = body.filter((r) => r.weight_lb !== '')
const weightAsOf = (date) => num(latestOnOrBefore(weighIns, date)?.weight_lb)

/**
 * Per-session cost, at row granularity, so the dashboard can show it next to the workout that
 * earned it.
 *
 * ⚠ THIS IS THE SITE OF AUDIT F-02. It used to apply the FLAT MET and nothing else — no
 * `kcal_override`, no intensity split — while `compute-energy.mjs` applied all three levels. So
 * Today and History read `BJJ — completed · ~1,328 kcal` for 2026-08-10 against a ledger figure of
 * **774**, and `~1,185` against **784** on 08-12. 1,328 is the exact number `decisions.md` records
 * as corrected away on 2026-08-12: the fix landed in the other file. Both now call one
 * `sessionCostFor`, so the two cannot disagree again without both disagreeing together.
 *
 * `estKcalBurned` is camelCase deliberately — it is derived here, not a column in any `data/`
 * file, and the column scan in `scripts/test-aggregations.mjs` treats a snake_case name in `src/`
 * as a claim that a real column exists. Its predecessor `est_kcal_burned` made exactly that false
 * claim and both surfaces reading it rendered a dash forever (audit F-41).
 */
const training = readCsv(join(DATA, 'training.csv')).map((row) => {
  const cost = sessionBurns(row)
    ? sessionCostFor(row, weightAsOf(row.date))
    : { kcal: null, level: 'not-performed', explain: `status is "${row.status || 'unwritten'}" — planned and skipped sessions burn nothing` }
  return {
    ...row,
    estKcalBurned: cost.kcal == null ? '' : String(Math.round(cost.kcal)),
    // WHY the figure is what it is — or why there isn't one. A surface must never render a bare
    // estimate, and the three reasons a cost is absent are not interchangeable: a walk is
    // `counted-elsewhere` (the day's total is complete without it), a blank duration is `unknown`
    // (the total is short by a real cost), and a planned row is `not-performed`.
    kcalLevel: cost.level,
    kcalBasis: cost.explain,
  }
})

// Nothing here is a literal. Every athlete-specific value comes from athlete/constants.json,
// so forking this repo for a second athlete is a data change, not a code change.
const c = stripNotes(constants)
const latestWeightLb =
  body.map((r) => num(r.weight_lb)).filter((v) => v != null).at(-1) ?? c.baseline.weightLb
const asOf = body.at(-1)?.date

const plan = {
  ...c.plan,
  ...c.triggers,
  events: c.events ?? {},
  weeklyTemplate: c.program?.weeklyTemplate ?? {},
  baselineWeightLb: c.baseline.weightLb,
  baselineDate: c.baseline.date,
  heightIn: c.athlete.heightIn,
  timezone: c.athlete.timezone,
  name: c.athlete.name,
  pronouns: c.athlete.pronouns,
  age: hasChart ? ageOn(asOf) : null,
  // CLAUDE.md §5 hard floor, recomputed from current weight rather than frozen at intake —
  // so the floor tracks the athlete down instead of drifting further below them.
  // Null on the template repo: there is no athlete yet, and a fabricated floor is worse
  // than an absent one.
  rmrFloorKcal: hasChart ? rmrFloorKcal(latestWeightLb, asOf) : null,
  // --- Forward-projection inputs, for the Next 7 Days view -------------------------------------
  // These are re-exports, NOT new numbers. The forecast has to estimate the burn of a session that
  // has not happened, and the only correct source for that is the same MET table and step constant
  // compute-energy.mjs uses for history. Copying them into TypeScript would be a fourth instance
  // of the two-copies defect this repo keeps hitting (data/METHOD.md rule 1).
  metByType: metTable(),
  metByIntensity: metByIntensityTable(),
  kcalPerStepPerLb: KCAL_PER_STEP_PER_LB,
  // The 3,500 kcal/lb modelling constant, re-exported for the same reason as the MET table above:
  // the weekly card converts a projected calorie gap into pounds, and a `3500` typed into a page
  // would be a second home for a constant whose docstring says it must not have one (X-8).
  // scripts/test-single-home.mjs scans every file in src/ and scripts/ for the literal.
  kcalPerLbFat: KCAL_PER_LB_FAT,
  latestWeightLb,
  dailyRehabMin: c.program?.dailyRehabMin ?? null,
  // --- The session-type registry, resolved (W7, audit F-15/F-70) --------------------------------
  // The dashboard cannot import `athlete.mjs` (it reads the filesystem), so the resolved answers
  // come through the bundle the same way `metByType` already does. `sessionTypeList` is what the
  // /log form offers; `countsTowardFloor` is what the home page and Next 7 Days count against the
  // sessions floor. Both were hardcoded lists of this athlete's activities in shared TypeScript.
  sessionTypeList: sessionTypeEnum(),
  countsTowardFloor: [...countsTowardFloorSet()],
  sessionTypeDomains: Object.fromEntries(
    Object.entries(sessionTypes()).map(([type, t]) => [type, t.domain ?? null]),
  ),
  // Chart-specific sentences the pages render. `stripNotes` has already removed the `_`-prefixed
  // sourcing keys, so only the copy itself reaches the bundle.
  copy: c.copy ?? {},
}

const steps = readCsv(join(DATA, 'steps.csv'))

const bundle = {
  plan,
  /**
   * When this bundle was built, in the athlete's local date and as an instant.
   *
   * WHY IT IS IN THE BUNDLE. Every page is `force-dynamic`, so a page always renders with today's
   * date at the top — but the numbers under it come from this file, which is baked at build time.
   * If a deploy fails or a push stops happening, the page keeps rendering yesterday's data under
   * today's date and says nothing. That is F-26's dangerous half, and it is invisible by
   * construction: nothing on the page is wrong-looking, it is just old.
   *
   * The comparison itself cannot happen here — at build time this stamp is always today. It is
   * made at request time, in src/lib/findings.ts, which is the only place "now" and "when this was
   * built" are two different values.
   */
  generatedAt: { localDate: localToday(), at: new Date().toISOString() },
  body,
  steps,
  targets: readCsv(join(DATA, 'targets.csv')),
  meals: readCsv(join(DATA, 'meals.csv')),
  training,
  sets: readCsv(join(DATA, 'sets.csv')),
  prescriptions: readCsv(join(DATA, 'prescriptions.csv')),
  metrics: readCsv(join(DATA, 'metrics.csv')),
  metricsRegistry: Object.fromEntries(Object.entries(c.metrics ?? {}).filter(([k]) => !k.startsWith('_'))),
  coachNotes: readCsv(join(DATA, 'coach-notes.csv')),
  energy: readCsv(join(DATA, 'energy.csv')),
  // Things the coach needs to know, computed rather than remembered. Derived here so the
  // dashboard has one too — the athlete should not have to wait for a coaching session to be told
  // his loss rate is above the ceiling. See scripts/lib/findings.mjs for why this reports rather
  // than blocks.
  findings: buildFindings({
    // The RAW constants, not the stripped `c`. Provenance markers live in `_provenance`, which
    // stripNotes() removes — and it should, since no view may render them. But passing the
    // stripped copy here made this bundle's findings a strict subset of data/findings.json's,
    // which build-findings.mjs computes from the raw file: two lists, one name, silently
    // different (INVARIANTS.md X-8). buildFindings only reads plan/baseline/triggers values and
    // ignores `_` keys, so the raw object is safe here and is the only one that is complete.
    constants,
    targets: readCsv(join(DATA, 'targets.csv')),
    body,
    steps,
    goalsText: existsSync(GOALS) ? readFileSync(GOALS, 'utf8') : '',
    chartDocs: readChartDocs(ROOT),
    // Must match build-findings.mjs's inputs exactly, per the note above: two lists under one name
    // that quietly differ is X-8, and it has already happened here once with `constants`.
    energy: readCsv(join(DATA, 'energy.csv')),
    today: localToday(),
  }),
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'data.json'), JSON.stringify(bundle, null, 2))

const counts = Object.entries(bundle)
  .filter(([k]) => k !== 'plan')
  .map(([k, v]) => `${k} ${Array.isArray(v) ? v.length : Object.keys(v).length}`)
  .join(' · ')
console.log(`src/generated/data.json: ${counts}`)
