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
import { kg as toKg, metFor, rmrKcal } from './lib/athlete.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data')

const METHOD_VERSION = 1
const TEF_RATE = 0.10            // thermic effect of food, as a share of intake
const NEAT_OTHER_RATE = 0.10     // non-step movement, as a share of RMR
const KCAL_PER_STEP_PER_LB = 0.00025  // ~0.045 kcal/step at 181 lb

const r0 = (n) => (n == null ? '' : Math.round(n))

const body = readCsv(join(DATA, 'body.csv'))
const steps = readCsv(join(DATA, 'steps.csv'))
const training = readCsv(join(DATA, 'training.csv'))
const meals = readCsv(join(DATA, 'meals.csv'))

const dates = [...new Set([...body, ...steps, ...training, ...meals].map((r) => r.date))]
  .filter(Boolean)
  .sort()

const byDate = (rows) => rows.reduce((m, r) => ((m[r.date] ??= []).push(r), m), {})
const stepsBy = byDate(steps)
const trainingBy = byDate(training)
const mealsBy = byDate(meals)
const weightBy = Object.fromEntries(body.filter((r) => r.weight_lb !== '').map((r) => [r.date, num(r.weight_lb)]))

// Carry the last known weight forward. RMR should track the athlete, not a stale baseline.
let lastWeight = null
const out = []

for (const date of dates) {
  if (weightBy[date] != null) lastWeight = weightBy[date]
  const weightLb = lastWeight
  if (weightLb == null) continue // no weight on record yet — RMR is not knowable

  // Age is derived from the day being computed, so a birthday mid-block is picked up.
  const kg = toKg(weightLb)
  const rmr = rmrKcal(weightLb, date)

  const dayMeals = mealsBy[date] ?? []
  // A day with no meals logged has unknown intake, not zero intake.
  const intake = dayMeals.length ? dayMeals.reduce((s, m) => s + (num(m.kcal) ?? 0), 0) : null
  const tef = intake == null ? null : TEF_RATE * intake

  const neatOther = NEAT_OTHER_RATE * rmr

  const stepCount = num(stepsBy[date]?.[0]?.steps)
  const stepsKcal = stepCount == null ? null : stepCount * KCAL_PER_STEP_PER_LB * weightLb

  // Only completed sessions burn anything. Planned and skipped ones do not.
  const sessionKcal = (trainingBy[date] ?? [])
    .filter((t) => t.status === 'completed')
    .reduce((s, t) => {
      const mins = num(t.duration_min) ?? 0
      return s + (metFor(t.type) * 3.5 * kg / 200) * mins
    }, 0)

  // Unknown components are treated as zero in the total, which makes burn a FLOOR on days with
  // gaps. The column-level blanks are what tell you the total is incomplete.
  const burnTotal = rmr + (tef ?? 0) + neatOther + (stepsKcal ?? 0) + sessionKcal

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
    complete: tef != null && stepsKcal != null ? 'y' : 'n',
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
