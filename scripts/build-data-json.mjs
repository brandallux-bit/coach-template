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
import { readCsv, num } from './lib/csv.mjs'
import { ageOn, constants, hasChart, rmrFloorKcal, stripNotes } from './lib/athlete.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data')
const OUT = join(ROOT, 'src', 'generated')

const body = readCsv(join(DATA, 'body.csv'))

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
}

const bundle = {
  plan,
  body,
  steps: readCsv(join(DATA, 'steps.csv')),
  targets: readCsv(join(DATA, 'targets.csv')),
  meals: readCsv(join(DATA, 'meals.csv')),
  training: readCsv(join(DATA, 'training.csv')),
  sets: readCsv(join(DATA, 'sets.csv')),
  prescriptions: readCsv(join(DATA, 'prescriptions.csv')),
  metrics: readCsv(join(DATA, 'metrics.csv')),
  metricsRegistry: Object.fromEntries(Object.entries(c.metrics ?? {}).filter(([k]) => !k.startsWith('_'))),
  coachNotes: readCsv(join(DATA, 'coach-notes.csv')),
  energy: readCsv(join(DATA, 'energy.csv')),
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'data.json'), JSON.stringify(bundle, null, 2))

const counts = Object.entries(bundle)
  .filter(([k]) => k !== 'plan')
  .map(([k, v]) => `${k} ${Array.isArray(v) ? v.length : Object.keys(v).length}`)
  .join(' · ')
console.log(`src/generated/data.json: ${counts}`)
