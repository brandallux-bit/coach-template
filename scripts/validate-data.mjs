#!/usr/bin/env node
/**
 * Fails loudly on a malformed data/ file. Runs in CI on every push.
 *
 * The point is not tidiness. A dashboard that renders a wrong number confidently is worse than
 * one that fails to build, so every rule here is a rule about not shipping a plausible lie.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCsv, num } from './lib/csv.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data')

// The template repo has no chart yet — no constants, no rows. There is nothing to
// validate, and failing here would just teach people to ignore a red build.
if (!existsSync(join(DATA, '..', 'athlete', 'constants.json'))) {
  console.log('No athlete/constants.json — template repo with no chart yet. Nothing to validate.')
  process.exit(0)
}

const errors = []
const warnings = []
const err = (f, msg) => errors.push(`${f}: ${msg}`)
const warn = (f, msg) => warnings.push(`${f}: ${msg}`)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const SPEC = {
  'body.csv': {
    header: ['date', 'weight_lb', 'waist_in', 'neck_in', 'sleep_h', 'sleep_quality', 'energy',
      'hunger', 'mood', 'bowel_movements', 'miralax', 'note'],
    uniqueDate: true,
    numeric: ['weight_lb', 'waist_in', 'neck_in', 'sleep_h', 'sleep_quality', 'energy', 'hunger',
      'mood', 'bowel_movements'],
    enums: { miralax: ['y', 'n'] },
    ranges: { weight_lb: [100, 400], waist_in: [20, 60], neck_in: [10, 25], sleep_h: [0, 16],
      sleep_quality: [1, 5], energy: [1, 5], hunger: [1, 5], mood: [1, 5] },
  },
  'steps.csv': {
    header: ['date', 'steps'],
    uniqueDate: true,
    numeric: ['steps'],
    ranges: { steps: [0, 100000] },
  },
  'targets.csv': {
    header: ['date', 'kcal', 'protein_g', 'fat_g', 'fibre_g', 'alcohol_kcal', 'note'],
    uniqueDate: true,
    numeric: ['kcal', 'protein_g', 'fat_g', 'fibre_g', 'alcohol_kcal'],
    ranges: { kcal: [1000, 5000], protein_g: [0, 400], fat_g: [0, 200], fibre_g: [0, 100] },
  },
  'meals.csv': {
    header: ['date', 'time', 'item', 'kcal', 'protein_g', 'fat_g', 'carb_g', 'fibre_g',
      'alcohol_kcal', 'confidence', 'note'],
    numeric: ['kcal', 'protein_g', 'fat_g', 'carb_g', 'fibre_g', 'alcohol_kcal'],
    enums: { confidence: ['label', 'weighed', 'photo', 'estimate', 'athlete'] },
    ranges: { kcal: [0, 5000], protein_g: [0, 300], fat_g: [0, 300], carb_g: [0, 600], fibre_g: [0, 100] },
    required: ['item', 'kcal', 'confidence'],
  },
  'training.csv': {
    header: ['date', 'type', 'session', 'status', 'rpe', 'duration_min', 'pain_flag', 'note'],
    numeric: ['rpe', 'duration_min'],
    enums: {
      type: ['strength', 'circuit', 'bjj', 'peloton', 'walk', 'rest', 'other'],
      status: ['planned', 'completed', 'skipped', 'rest'],
      pain_flag: ['y', 'n'],
    },
    ranges: { rpe: [1, 10], duration_min: [0, 480] },
    required: ['type', 'session', 'status'],
  },
  'sets.csv': {
    header: ['date', 'session', 'exercise', 'set_index', 'load_lb', 'reps', 'duration_s', 'rir', 'note'],
    numeric: ['set_index', 'load_lb', 'reps', 'duration_s', 'rir'],
    ranges: { set_index: [1, 30], load_lb: [0, 500], reps: [0, 500], duration_s: [0, 3600], rir: [0, 10] },
    required: ['exercise', 'set_index'],
  },
  'prescriptions.csv': {
    header: ['date', 'order', 'exercise', 'sets', 'reps', 'load', 'note'],
    numeric: ['order', 'sets'],
    ranges: { order: [1, 40], sets: [1, 20] },
    required: ['order', 'exercise'],
  },
  'coach-notes.csv': {
    header: ['date', 'headline', 'note'],
    uniqueDate: true,
    required: ['headline'],
  },
  // Long format, on purpose: anything the fixed columns of body.csv don't cover goes here
  // without a schema change, so a new athlete never needs code edited to track a new thing.
  'metrics.csv': {
    header: ['date', 'metric', 'value', 'unit', 'note'],
    required: ['metric', 'value'],
  },
}

for (const [file, spec] of Object.entries(SPEC)) {
  const path = join(DATA, file)
  if (!existsSync(path)) { err(file, 'missing'); continue }

  const headerLine = readFileSync(path, 'utf8').split('\n')[0].trim()
  const expected = spec.header.join(',')
  if (headerLine !== expected) {
    err(file, `header mismatch\n    expected: ${expected}\n    got:      ${headerLine}`)
    continue
  }

  const rows = readCsv(path)
  const seen = new Set()
  let prevDate = ''

  rows.forEach((row, i) => {
    const where = `row ${i + 2}`

    if (!DATE_RE.test(row.date)) err(file, `${where}: bad date "${row.date}"`)
    if (row.date < prevDate) err(file, `${where}: out of order (${row.date} after ${prevDate})`)
    prevDate = row.date

    if (spec.uniqueDate) {
      if (seen.has(row.date)) err(file, `${where}: duplicate date ${row.date}`)
      seen.add(row.date)
    }

    for (const f of spec.required ?? []) {
      if (row[f] === '') err(file, `${where}: ${f} is required and empty`)
    }

    for (const f of spec.numeric ?? []) {
      if (row[f] === '') continue
      const v = num(row[f])
      if (!Number.isFinite(v)) { err(file, `${where}: ${f}="${row[f]}" is not a number`); continue }
      const range = spec.ranges?.[f]
      if (range && (v < range[0] || v > range[1])) {
        err(file, `${where}: ${f}=${v} outside plausible range ${range[0]}–${range[1]}`)
      }
    }

    for (const [f, allowed] of Object.entries(spec.enums ?? {})) {
      if (row[f] === '') continue
      if (!allowed.includes(row[f])) err(file, `${where}: ${f}="${row[f]}" not one of ${allowed.join('|')}`)
    }
  })
}

// --- athlete/constants.json ------------------------------------------------------------------

// Every athlete-specific number the code uses comes from here. A missing or wrong field is a
// silent, plausible-looking wrong answer everywhere downstream — most dangerously `sex`, which
// swings Mifflin-St Jeor by 166 kcal/day with nothing on screen to reveal it.
try {
  const { constants } = await import('./lib/athlete.mjs')
  const REQUIRED = {
    'athlete.name': (v) => typeof v === 'string' && v.length > 0,
    'athlete.sex': (v) => v === 'male' || v === 'female',
    'athlete.dob': (v) => /^\d{4}-\d{2}$/.test(v ?? ''),
    'athlete.heightIn': (v) => typeof v === 'number' && v > 40 && v < 90,
    'athlete.timezone': (v) => typeof v === 'string' && v.includes('/'),
    'baseline.date': (v) => DATE_RE.test(v ?? ''),
    'baseline.weightLb': (v) => typeof v === 'number' && v > 50 && v < 500,
    'plan.proteinFloorG': (v) => typeof v === 'number' && v > 0,
    'plan.estMaintenanceKcal': (v) => typeof v === 'number' && v > 800,
  }
  for (const [path, ok] of Object.entries(REQUIRED)) {
    const value = path.split('.').reduce((o, k) => o?.[k], constants)
    if (!ok(value)) {
      err('athlete/constants.json', `${path} is missing or invalid (got ${JSON.stringify(value)})`)
    }
  }
  if (constants?.metOverrides?.walk) {
    err('athlete/constants.json', 'metOverrides.walk must stay 0 — walking is already counted in steps_kcal')
  }

  // A tracked metric that no domain needs is a chore the coach invented (CLAUDE.md §1.1),
  // so the registry requires each one to name the domain it serves.
  const registry = Object.fromEntries(
    Object.entries(constants.metrics ?? {}).filter(([k]) => !k.startsWith('_')),
  )
  for (const [key, def] of Object.entries(registry)) {
    if (!def?.domain) err('athlete/constants.json', `metrics.${key} must name the goals.md domain it serves`)
    if (!['up', 'down'].includes(def?.direction)) {
      err('athlete/constants.json', `metrics.${key}.direction must be "up" or "down" (which way is progress)`)
    }
  }
  for (const [i, m] of readCsv(join(DATA, 'metrics.csv')).entries()) {
    if (m.metric && !registry[m.metric]) {
      err('metrics.csv', `row ${i + 2}: metric "${m.metric}" is not in constants.json metrics registry`)
    }
  }
} catch (e) {
  err('athlete/constants.json', `could not be read: ${e.message}`)
}

// --- Cross-file rules ------------------------------------------------------------------------

const meals = readCsv(join(DATA, 'meals.csv'))
meals.forEach((m, i) => {
  const kcal = num(m.kcal), alc = num(m.alcohol_kcal)
  // alcohol_kcal is a subset of kcal, not an addition to it. Getting this backwards
  // double-counts every drinking day.
  if (kcal != null && alc != null && alc > kcal) {
    err('meals.csv', `row ${i + 2}: alcohol_kcal (${alc}) exceeds kcal (${kcal}) — alcohol is included in kcal, not added to it`)
  }
})

const training = readCsv(join(DATA, 'training.csv'))
training.forEach((t, i) => {
  if (t.status === 'completed' && t.duration_min === '' && t.type !== 'rest') {
    warn('training.csv', `row ${i + 2}: completed session with no duration_min — contributes 0 to burn`)
  }
})

const sets = readCsv(join(DATA, 'sets.csv'))
const trainingDates = new Set(training.map((t) => t.date))
for (const [i, s] of sets.entries()) {
  if (!trainingDates.has(s.date)) err('sets.csv', `row ${i + 2}: ${s.date} has sets but no training.csv row`)
  if (s.reps === '' && s.duration_s === '') err('sets.csv', `row ${i + 2}: needs either reps or duration_s`)
}

// goals.md's strength trigger is ">10% loss of reps at fixed load AND fixed RIR". Sets without
// RIR cannot be compared against it, so an un-anchored set is a real gap, not a cosmetic one.
const noRir = sets.filter((s) => s.rir === '').length
if (noRir) warn('sets.csv', `${noRir} of ${sets.length} sets have no RIR — the strength guardrail cannot be evaluated on those`)

// --- Report ----------------------------------------------------------------------------------

for (const w of warnings) console.warn(`warn  ${w}`)
for (const e of errors) console.error(`ERROR ${e}`)

if (errors.length) {
  console.error(`\n${errors.length} error(s). data/ is the source of truth — fix it before it ships.`)
  process.exit(1)
}
console.log(`data/ valid — ${warnings.length} warning(s).`)
