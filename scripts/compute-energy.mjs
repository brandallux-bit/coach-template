#!/usr/bin/env node
/**
 * Generates data/energy.csv from the measured files. Never edit energy.csv by hand.
 *
 *   burn_total = rmr + tef + neat_other + steps_kcal + session_kcal
 *
 * The model, its constants and the double-count trap are documented in data/METHOD.md.
 * Bump METHOD_VERSION when a constant changes so historical rows stay interpretable.
 */
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCsv, num, toCsv } from './lib/csv.mjs'
import {
  KCAL_PER_STEP_PER_LB, NEAT_OTHER_RATE, TEF_RATE, hasChart, localToday, NO_CHART_MESSAGE,
  prescribedSessionMin, rmrKcal, sessionCostFor, setRestSec,
} from './lib/athlete.mjs'
import { latestOnOrBefore, sessionBurns } from './lib/aggregate.mjs'
import { METHOD_VERSION } from './lib/method-version.mjs'
import { buildDurationResolver, withResolvedDuration } from './lib/session-duration.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data')

// No chart, no ledger to derive — and this has to stop BEFORE `localToday()`, which reads
// `athlete.timezone` at module scope and throws the intake message as a raw stack trace.
//
// **Non-zero on purpose, unlike `validate-data.mjs`'s clean exit two lines up the `npm run data`
// chain.** The difference is real: validating zero rows is a complete answer, whereas an energy
// ledger without a weight, an age or a timezone is not something this file can produce. That
// distinction is `test-cold-start.mjs`'s F-17 red fixture — *"a script that needs the chart fails
// with the intake message, not an ENOENT"* — and this is the script it asserts it against.
//
// The build chain no longer depends on this exiting 0: `scripts/check-chart-for-build.mjs` stops
// `prebuild` before it gets here, with a message about intake rather than about a ledger.
if (!hasChart) {
  console.error(`no energy ledger to compute — ${NO_CHART_MESSAGE}`)
  process.exit(1)
}

const TODAY_LOCAL = localToday()
// Every model constant this file used to declare privately now lives beside the rest of the burn
// model in lib/athlete.mjs, and METHOD_VERSION in lib/method-version.mjs with the tripwire that
// fails when a model constant changes without a version bump (audit F-64). KCAL_PER_STEP_PER_LB
// moved earlier, for the same reason: the dashboard's forward views read the same figure through
// the data bundle rather than keeping a second copy. See data/METHOD.md rule 1.

const r0 = (n) => (n == null ? '' : Math.round(n))

const body = readCsv(join(DATA, 'body.csv'))
const steps = readCsv(join(DATA, 'steps.csv'))
const training = readCsv(join(DATA, 'training.csv'))
const sets = readCsv(join(DATA, 'sets.csv'))

// ⚠ **A SESSION PERFORMED BUT NOT TIMED IS NO LONGER A ZERO.** Built once, over the whole ledger,
// because it needs every timed session to average from. See scripts/lib/session-duration.mjs for
// the rungs and the rule they implement.
const resolveDuration = buildDurationResolver({
  training, sets, restSec: setRestSec(), prescribedMinFor: prescribedSessionMin,
})
const meals = readCsv(join(DATA, 'meals.csv'))

const dates = [...new Set([...body, ...steps, ...training, ...meals].map((r) => r.date))]
  .filter(Boolean)
  .sort()

const byDate = (rows) => rows.reduce((m, r) => ((m[r.date] ??= []).push(r), m), {})
const stepsBy = byDate(steps)
const trainingBy = byDate(training)
const mealsBy = byDate(meals)
// Carry the last known weight forward. RMR should track the athlete, not a stale baseline.
// `latestOnOrBefore` is the one implementation of "what is in force on this date" — the same one
// build-data-json.mjs and the dashboard use, rather than three forward-fills that happen to agree.
const weighIns = body.filter((r) => r.weight_lb !== '')
const weightOn = (date) => num(latestOnOrBefore(weighIns, date)?.weight_lb)

const out = []

for (const date of dates) {
  // A future date can now legitimately appear in training.csv as a PLANNED session (data/METHOD.md
  // rule 6's carve-out). energy.csv is a ledger of what happened, so a day that has not happened
  // gets no row — otherwise the schedule would manufacture RMR+NEAT "burn" for next Tuesday, the
  // same failure the nothing-observed skip below exists to prevent.
  if (date > TODAY_LOCAL) continue
  const weightLb = weightOn(date)
  if (weightLb == null) continue // no weight on record yet — RMR is not knowable

  const dayMeals = mealsBy[date] ?? []
  const daySteps = stepsBy[date] ?? []
  const daySessions = trainingBy[date] ?? []

  // A day can reach here on a carried-forward weight alone, with nothing actually observed —
  // no meals, no step count, no training row of any kind. rmr + neatOther is a pure function of
  // bodyweight/age/sex, not of anything that happened on this date, so publishing it as "burn"
  // would read as a measurement when it's really a physiological floor with zero real inputs.
  // Skip the day entirely, same as a day before any weight is on record.
  if (!dayMeals.length && !daySteps.length && !daySessions.length) continue

  // Age is derived from the day being computed, so a birthday mid-block is picked up.
  const rmr = rmrKcal(weightLb, date)

  // A day with no meals logged has unknown intake, not zero intake.
  const intake = dayMeals.length ? dayMeals.reduce((s, m) => s + (num(m.kcal) ?? 0), 0) : null
  const tef = intake == null ? null : TEF_RATE * intake

  const neatOther = NEAT_OTHER_RATE * rmr

  const stepCount = num(daySteps[0]?.steps)
  const stepsKcal = stepCount == null ? null : stepCount * KCAL_PER_STEP_PER_LB * weightLb

  // Only completed sessions burn anything, and what one cost is `sessionCostFor` — the three-level
  // precedence (kcal_override -> per-tier MET over the intensity split -> flat MET over duration),
  // which used to be written out here and NOWHERE ELSE. `build-data-json.mjs` implemented only its
  // third level, so the dashboard showed 1,328 kcal for the 2026-08-10 session this file counted
  // at 774. One home now: scripts/lib/aggregate.mjs. See audit F-02 / F-67.
  //
  // A session whose cost cannot be known (no duration on file, no MET for the type) returns null
  // and is added as ZERO here, which is the burn model's standing convention: an unknown component
  // counts as zero so `burn_total_kcal` is a FLOOR rather than a guess (data/METHOD.md). A walk
  // returns null for a different reason — its energy is already in `steps_kcal` — and adds zero
  // for the same arithmetic, which is the double-count trap being avoided rather than a gap.
  //
  // ⚠ **AND A SESSION NOBODY CAN COST NO LONGER WRITES A ZERO.** That `?? 0` used to live on the
  // reduce below, so `session_kcal` held a zero indistinguishable from a rest day's — and the
  // comment under it claimed "the column-level blanks are what tell you the total is incomplete"
  // while this column was the one that never went blank. `missingBurnComponents` saw nothing
  // missing, `burnUnderstated` stayed false, and whole sessions entered `observedDailyBurn` as
  // full measurements while being floors. Most are now costed by `resolveDuration`; whatever still
  // cannot be costed leaves the column BLANK, which is what the surrounding machinery has always
  // been built to read.
  const costs = daySessions
    .filter(sessionBurns)
    .map((t) => sessionCostFor(withResolvedDuration(t, resolveDuration(t)), weightLb))
  const sessionUnknown = costs.some((c) => c.level === 'unknown')
  const sessionKcal = sessionUnknown
    ? null
    : costs.reduce((s, c) => s + (c.kcal ?? 0), 0)

  // Unknown components are treated as zero in the total, which makes burn a FLOOR on days with
  // gaps. The column-level blanks are what tell you the total is incomplete.
  const burnTotal = rmr + (tef ?? 0) + neatOther + (stepsKcal ?? 0) + (sessionKcal ?? 0)

  out.push({
    date,
    rmr_kcal: r0(rmr),
    tef_kcal: r0(tef),
    neat_other_kcal: r0(neatOther),
    steps_kcal: r0(stepsKcal),
    session_kcal: r0(sessionKcal),
    burn_total_kcal: r0(burnTotal),
    intake_kcal: r0(intake),
    deficit_kcal: intake == null ? '' : r0(burnTotal - intake),
    // ⚠ **`sessionUnknown` IS NEW HERE AND IT IS HALF THE FIX.** This flag is what
    // `observedDailyBurn` gates on, and it used to name only TEF and steps — so a day whose
    // session cost was unknowable was still flagged complete and still entered the mean that
    // prices every unfinished day and every rate-of-loss projection. A claim that every input
    // existed has to look at every input.
    complete: tef != null && stepsKcal != null && !sessionUnknown ? 'y' : 'n',
    method_version: METHOD_VERSION,
  })
}

const header = ['date', 'rmr_kcal', 'tef_kcal', 'neat_other_kcal', 'steps_kcal', 'session_kcal',
  'burn_total_kcal', 'intake_kcal', 'deficit_kcal', 'complete', 'method_version']

writeFileSync(join(DATA, 'energy.csv'), toCsv(header, out))
console.log(`energy.csv: ${out.length} days (method_version ${METHOD_VERSION})`)
for (const r of out) {
  const flag = r.complete === 'y' ? ' ' : '~'
  console.log(`${flag} ${r.date}  burn ${r.burn_total_kcal}  in ${r.intake_kcal || '—'}  deficit ${r.deficit_kcal || '—'}`)
}
