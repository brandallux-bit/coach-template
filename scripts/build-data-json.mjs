#!/usr/bin/env node
/**
 * Bundles data/*.csv into src/generated/data.json so the Next.js app can import it statically.
 * Generated at build (`npm run data`), gitignored, and strictly read-only downstream —
 * data/ remains the single source of truth.
 *
 * Also lifts the handful of plan constants the dashboard needs out of the markdown chart, so
 * they are stated in exactly one place here rather than retyped into three page components.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IMPLAUSIBLE_STEPS, buildFindings } from './lib/findings.mjs'
import { collectFindingsInputs } from './lib/findings-inputs.mjs'
import { readCsv, num } from './lib/csv.mjs'
import { missingPlanFields } from './lib/schema.mjs'
import { latestOnOrBefore, observedDailySteps, sessionBurns } from './lib/aggregate.mjs'
import { ageOn, constants, hasChart, rmrFloorKcal, sessionCostFor, stripNotes, metTable,
  KCAL_PER_STEP_PER_LB, KCAL_PER_LB_FAT, metByIntensityTable, localToday, sessionTypeEnum,
  prescribedSessionMin, sessionTypes, setRestSec, countsTowardFloorSet,
  movementKcalFor, movementBasisFor, movementLevelKey, movementLevelDeclared,
} from './lib/athlete.mjs'
import { buildDurationResolver, withResolvedDuration } from './lib/session-duration.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data')
const OUT = join(ROOT, 'src', 'generated')

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
const trainingRows = readCsv(join(DATA, 'training.csv'))

// ⚠ **THE SAME RESOLVER THE LEDGER USES, FOR THE SAME REASON `sessionCostFor` IS SHARED.** A
// reconstructed duration that this file worked out differently from `compute-energy.mjs` would
// put the Today tab's Movement table back into disagreement with `energy.csv` — F-02's exact
// shape, one input further upstream.
const resolveDuration = buildDurationResolver({
  training: trainingRows,
  sets: readCsv(join(DATA, 'sets.csv')),
  restSec: setRestSec(),
  prescribedMinFor: prescribedSessionMin,
})

const training = trainingRows.map((row) => {
  const duration = resolveDuration(row)
  const cost = sessionBurns(row)
    ? sessionCostFor(withResolvedDuration(row, duration), weightAsOf(row.date))
    : { kcal: null, level: 'not-performed', explain: `status is "${row.status || 'unwritten'}" — planned and skipped sessions burn nothing` }
  return {
    ...row,
    estKcalBurned: cost.kcal == null ? '' : String(Math.round(cost.kcal)),
    /**
     * Which rung of `session-duration.mjs` supplied the minutes behind `estKcalBurned`, and its
     * sentence — **blank unless a reconstructed duration is actually load-bearing for this row.**
     *
     * The guard is not cosmetic. A walk's cost is `counted-elsewhere` and a rest day's is
     * `not-performed`; neither ever reads a duration, and neither did before this. Publishing
     * `durationLevel: "unknown"` on those rows would put a reconstruction failure on a session
     * that never needed one, and a surface reading it would mark a correct figure as an estimate.
     * `flat` is the only cost level that multiplies by `duration_min`, so it is the only one where
     * this field says anything. Whether a cost is absent, and why, is `kcalLevel`'s job below.
     */
    durationLevel: cost.level === 'flat' && duration.level !== 'recorded' ? duration.level : '',
    durationMinUsed: cost.level === 'flat' && duration.level !== 'recorded'
      ? String(duration.minutes) : '',
    durationBasis: cost.level === 'flat' && duration.level !== 'recorded' ? duration.basis : '',
    // WHY the figure is what it is — or why there isn't one. A surface must never render a bare
    // estimate, and the three reasons a cost is absent are not interchangeable: a walk is
    // `counted-elsewhere` (the day's total is complete without it), a blank duration is `unknown`
    // (the total is short by a real cost), and a planned row is `not-performed`.
    kcalLevel: cost.level,
    /**
     * WHY the figure is what it is — **and, where the duration was reconstructed, that it was.**
     *
     * ⚠ **THIS IS THE ONLY ONE OF THESE FIELDS ANY PAGE RENDERS, WHICH IS WHY THE RECONSTRUCTION
     * HAS TO BE IN IT.** `durationLevel` and `durationBasis` above are machine-readable and were
     * read by nothing: `src/app/today/page.tsx` and `src/app/history/page.tsx` show `kcalBasis`.
     * So a session costed from a reconstructed duration rendered as `MET 8 × 44 min` — a figure
     * that appears in no row of the chart — on a line whose duration cell reads `—`. That is not
     * silence about an estimate, it is a measurement claimed. X-15: a number no page shows has
     * failed the same way as a number never written, and here the unshown number was the caveat.
     */
    kcalBasis: cost.level === 'flat' && duration.level !== 'recorded'
      ? `${cost.explain} — the minutes are RECONSTRUCTED, not recorded: ${duration.basis}`
      : cost.explain,
  }
})

// Nothing here is a literal. Every athlete-specific value comes from athlete/constants.json,
// so forking this repo for a second athlete is a data change, not a code change.
// An empty skeleton before intake, rather than a throw. This file already guards the DERIVED
// figures on `hasChart` ("Null on the template repo", below) — but `stripNotes(constants)` reads
// the proxy's keys, so it threw before any of those guards could run and took `npm run build`
// down with it. The sections are named so the `c.baseline.x` reads below resolve to undefined
// rather than dereferencing undefined; every consumer already renders a missing value as TBD.
const c = hasChart
  ? stripNotes(constants)
  : { athlete: {}, baseline: {}, plan: {}, triggers: {}, program: {}, events: {} }
const latestWeightLb =
  body.map((r) => num(r.weight_lb)).filter((v) => v != null).at(-1) ?? c.baseline.weightLb
const asOf = body.at(-1)?.date

// ⚠ **READ BEFORE `plan`, WHICH DERIVES THE OBSERVED STEP MEAN FROM IT.** `const` is in its
// temporal dead zone until this line runs, so a `plan` built above it throws a ReferenceError
// the moment a chart exists — and NOT on the template, where `hasChart` short-circuits the read
// before it happens. That is the shape of bug that ships green and breaks the first fork.
const steps = readCsv(join(DATA, 'steps.csv'))

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
  /**
   * ⚠ **WHAT THE ATHLETE ACTUALLY WALKS, so the forward view stops pricing movement at the plan.**
   * Computed here rather than in `src/lib/forecast.ts` for the same reason the MET table is: one
   * implementation, shared with the ledger's suite, instead of a TypeScript copy nothing property-
   * tests. Null on a chart with no step feed — that chart's movement term is the described level
   * below, and the two are mutually exclusive by construction (scripts/lib/movement.mjs).
   */
  observedSteps: hasChart ? observedDailySteps(steps, IMPLAUSIBLE_STEPS) : null,
  /**
   * The movement term for a chart with NO feed, in kcal/day, and the derivation behind it.
   *
   * Derived here and stored nowhere: `data/METHOD.md` rule 5 puts a maintenance-shaped figure at
   * `derived` even though the coach chose its coefficients, and a second home for it in
   * `constants.json` would be a number that could disagree with the ledger's. The chart stores the
   * LEVEL — the athlete's own words — and this is what that level costs at today's weight.
   */
  movementKcal: hasChart ? movementKcalFor(latestWeightLb) : null,
  movementBasis: hasChart ? movementBasisFor(latestWeightLb) : null,
  /**
   * The level actually IN FORCE, and whether anybody chose it.
   *
   * ⚠ **THE EFFECTIVE KEY, NOT THE RAW CONSTANT.** Pages used to read
   * `plan.movementOutsideExerciseLevel` directly and fall back to a generic phrase when it was
   * absent — so on a chart running the default, one cell said "outside deliberate exercise" while
   * the cell beside it named a level and attributed it to the athlete. One key, resolved once,
   * read by both.
   */
  movementLevel: hasChart ? movementLevelKey() : null,
  movementLevelDeclared: hasChart ? movementLevelDeclared() : false,
  // The 3,500 kcal/lb modelling constant, re-exported for the same reason as the MET table above:
  // the weekly card converts a projected calorie gap into pounds, and a `3500` typed into a page
  // would be a second home for a constant whose docstring says it must not have one (X-8).
  // scripts/test-single-home.mjs scans every file in src/ and scripts/ for the literal.
  kcalPerLbFat: KCAL_PER_LB_FAT,
  latestWeightLb,
  /**
   * Which registry type the `Daily` prescription block IS, so the forward view can price it from
   * the same registry the ledger costs it from.
   *
   * ⚠ **ONE KEY, REPLACING TWO HOMES FOR ONE FIGURE.** This shipped as `plan.dailyRehabMin` — one
   * athlete's activity in the key name, read beside a hardcoded `metByType.rehab` in shared
   * TypeScript (X-11), and a SECOND declaration of a duration that
   * `sessionTypes.<type>.standingDurationMin` already holds for the ledger. Two homes for "how
   * long is the daily block" is the disagreement rung 4 of the duration resolver exists to end,
   * reintroduced one layer up. Naming the TYPE instead means the duration and the MET both come
   * from the registry, and a chart whose daily block is mobility, breathing or physiotherapy is
   * served by the same code as one whose block is rehabilitation.
   */
  dailyBlockType: c.program?.dailyBlockType ?? null,
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
  /**
   * Per-type registry detail the views need beyond the MET. Today that is the standing duration —
   * the figure a chart declares for an activity that always runs the same length, which the LEDGER
   * already reads through `prescribedSessionMin`. Publishing it is what lets the forward view
   * price the daily block from the same one home instead of from a key of its own.
   */
  sessionTypeDetail: Object.fromEntries(
    Object.entries(sessionTypes())
      .map(([type, t]) => [type, { standingDurationMin: num(t.standingDurationMin) ?? null }]),
  ),
  // Chart-specific sentences the pages render. `stripNotes` has already removed the `_`-prefixed
  // sourcing keys, so only the copy itself reaches the bundle.
  copy: c.copy ?? {},
}

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
  // `localDate` is null before intake, and deliberately not defaulted to a UTC date: without
  // `athlete.timezone` there is no such thing as the athlete's local day, and guessing one is the
  // exact failure `localToday()` throws to prevent (data/METHOD.md rule 6). A null here means
  // "unknown", which the staleness comparison in src/lib/findings.ts must treat as "cannot say".
  generatedAt: { localDate: hasChart ? localToday() : null, at: new Date().toISOString() },
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
  // their loss rate is above the ceiling. See scripts/lib/findings.mjs for why this reports rather
  // than blocks.
  // Empty before intake: every finding is a comparison against a threshold in `constants.json`,
  // so with no chart there is nothing to compare and nothing to report. Not an error state — a
  // chart-less repo genuinely has no findings.
  findings: !hasChart ? [] : buildFindings(
    collectFindingsInputs(ROOT, { constants, today: localToday() }),
  ),
}

// The contract `Plan` in `src/lib/data.ts` declares, checked before the artifact is written.
// Only when there IS a chart: before intake the skeleton is deliberately incomplete, and
// `scripts/check-chart-for-build.mjs` refuses the dashboard build long before any of it renders.
//
// A HARD ERROR rather than a finding, and that is X-12-consistent rather than an exception to it:
// this does not judge whether a number is wise, it says the generator's own output contradicts the
// contract its consumer is written against. That is what `data/` is entitled to refuse.
if (hasChart) {
  const missing = missingPlanFields(plan)
  if (missing.length) {
    console.error(
      `::error::src/generated/data.json would ship without ${missing.join(', ')} — `
      + 'every page reads these without a guard (`Plan` in src/lib/data.ts). '
      + 'They come from athlete/constants.json: check athlete.*, baseline.* and plan.*.',
    )
    process.exit(1)
  }
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'data.json'), JSON.stringify(bundle, null, 2))

const counts = Object.entries(bundle)
  .filter(([k]) => k !== 'plan')
  .map(([k, v]) => `${k} ${Array.isArray(v) ? v.length : Object.keys(v).length}`)
  .join(' · ')
console.log(`src/generated/data.json: ${counts}`)
