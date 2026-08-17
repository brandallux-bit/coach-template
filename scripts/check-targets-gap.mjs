#!/usr/bin/env node
/**
 * Fails loudly when any day between the chart's first target and athlete-local today has no
 * calorie target. Runs in `check-all.mjs`, and therefore in every bot before it pushes.
 *
 * ⚠ **READ `scripts/lib/targets.mjs` FIRST.** It holds the rule, the 2026-08-15 incident that
 * produced it, and why the domain starts where it does.
 *
 * HOW THIS DIFFERS FROM `check-steps-gap.mjs`, which it is modelled on. A missing steps row is
 * written by an on-device automation entirely outside this repo, so the script can only ever
 * report it and name what to check on the phone. A missing TARGET row is **fixable by editing the
 * record** — `node scripts/generate-targets.mjs --fill-gaps` writes every one of them from
 * `plan.kcalByWeekday` — so per the layer model in `docs/INVARIANTS.md` it is legitimately a hard
 * error. It never asks anyone to CHOOSE a number, which is what keeps it on the right side of the
 * commit gate's second limit: the only edit that satisfies it is running a generator that reads a
 * structure already on file.
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCsv } from './lib/csv.mjs'
import { constants, hasChart, localToday } from './lib/athlete.mjs'
import { targetGaps } from './lib/targets.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data')

if (!hasChart) {
  console.log('No athlete/constants.json — template repo with no chart yet. Nothing to check.')
  process.exit(0)
}

const read = (f) => (existsSync(join(DATA, f)) ? readCsv(join(DATA, f)) : [])
const targets = read('targets.csv')

// The FIRST DAY HE ATE AGAINST A PLAN. It is the evidence that closes both holes in the domain
// rule below, and it is data the chart already holds rather than a second registry.
const firstMeal = read('meals.csv').map((r) => r.date).filter(Boolean).sort()[0]

if (!targets.length) {
  // ⚠ **A CHART-LESS EXIT AND AN EMPTIED FILE ARE NOT THE SAME THING, and the first version of
  // this check could not tell them apart.** `targetGaps` has no domain without a first row, so
  // deleting `data/targets.csv` outright made every assertion here vacuous — the loudest possible
  // version of the very defect it exists to catch. Verified by deleting the file and watching this
  // script exit 0. A chart with meals on it has days that needed targets; a chart with neither is
  // a new chart mid-intake and is correctly silent.
  if (firstMeal) {
    console.error('::error::data/targets.csv has no rows at all, but data/meals.csv starts '
      + `${firstMeal}. Every one of those days was eaten against no target.`)
    console.error(`Fix: node scripts/generate-targets.mjs ${firstMeal}, then --fill-gaps.`)
    process.exit(1)
  }
  console.log('data/targets.csv has no rows yet, and nothing has been eaten against one — no domain to check.')
  process.exit(0)
}

const today = localToday()
const gaps = targetGaps(targets, today)

// The other half of the domain rule (see `targetGaps`): the check reads the FIRST target row to
// decide where to start, so deleting the earliest rows would shrink the domain and hide a gap.
// A day the athlete ate against is unambiguously a day inside the plan, so a meal predating the
// first target is that hole, made visible with data the chart already holds.
//
// Two DUPLICATE rows for one date — one with a figure, one blank — would slip past `targetGaps`,
// which takes the first row for a date. That is deliberate rather than an oversight: `SPEC`'s
// `uniqueDate: true` makes a duplicate an ERROR in `validate-data.mjs`, which runs ahead of this
// step in `check-all.mjs`, so the combination cannot reach `main`. Verified.
const firstTarget = targets.map((r) => r.date).filter(Boolean).sort()[0]
const earlyMeal = firstMeal && firstMeal < firstTarget ? firstMeal : null

if (!gaps.length && !earlyMeal) {
  console.log(`data/targets.csv: every day from ${firstTarget} through ${today} has a target.`)
  process.exit(0)
}

console.error('::error::A day has no calorie target. There is ALWAYS a target for every day —')
console.error('the weekday structure in athlete/constants.json (plan.kcalByWeekday) is the fallback')
console.error('and it always answers. Prose may refine a target; it may never suppress one.')
console.error('See scripts/lib/targets.mjs and decisions.md 2026-08-15.')
console.error('')

const missing = gaps.filter((g) => g.reason === 'missing-row').map((g) => g.date)
const blank = gaps.filter((g) => g.reason === 'blank-kcal').map((g) => g.date)

if (missing.length) {
  console.error(`No targets.csv row at all on ${missing.length} day(s): ${missing.join(', ')}`)
  console.error('Fix, and commit data/targets.csv with data/energy.csv:')
  console.error('    node scripts/generate-targets.mjs --fill-gaps')
  console.error('')
}

if (blank.length) {
  // Deliberately NOT auto-filled. A row on file is a deliberate override and the generator has no
  // opinion about one; overwriting it would silently revert a coaching decision.
  console.error(`A row exists with an empty kcal cell on: ${blank.join(', ')}`)
  console.error('The generator will not overwrite an existing row — that row is somebody\'s override.')
  console.error('Fill the cell, or delete the row and re-run the generator for that date.')
  console.error('')
}

if (earlyMeal) {
  console.error(`data/meals.csv starts ${earlyMeal}, before the first target row (${firstTarget}).`)
  console.error('That is a day eaten against no target, and it sits outside this check\'s domain —')
  console.error(`write the earlier rows: node scripts/generate-targets.mjs ${earlyMeal}`)
  console.error('')
}

console.error(`Timezone ${constants.athlete.timezone}; today is ${today}.`)
process.exit(1)
