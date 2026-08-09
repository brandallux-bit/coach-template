import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const CHART = join(ROOT, 'athlete', 'constants.json')
const TEMPLATE = join(ROOT, 'athlete', 'constants.template.json')

/** True on the template repo, before any chart has been started. */
export const hasChart = existsSync(CHART)

export const constants = JSON.parse(readFileSync(hasChart ? CHART : TEMPLATE, 'utf8'))

export const LB_PER_KG = 2.20462
export const kg = (lb) => lb / LB_PER_KG

/**
 * Mifflin-St Jeor. The sex term is the whole reason `sex` exists in constants.json:
 * male +5, female −161 — a 166 kcal/day difference that would otherwise be invisible.
 */
const SEX_TERM = { male: 5, female: -161 }

export function rmrKcal(weightLb, onDate) {
  const { sex, heightIn } = constants.athlete
  const term = SEX_TERM[sex]
  if (term === undefined) {
    throw new Error(`athlete.sex must be "male" or "female" for Mifflin-St Jeor, got "${sex}"`)
  }
  return 10 * kg(weightLb) + 6.25 * (heightIn * 2.54) - 5 * ageOn(onDate) + term
}

/** Derived from dob, never stored — so it cannot go stale mid-block. */
export function ageOn(isoDate) {
  const [by, bm] = constants.athlete.dob.split('-').map(Number)
  const [y, m] = (isoDate ?? new Date().toISOString().slice(0, 10)).split('-').map(Number)
  return y - by - (m < bm ? 1 : 0)
}

/**
 * CLAUDE.md §5: no calorie target below estimated RMR. Computed from the athlete's CURRENT
 * weight rather than frozen at intake, so the floor tracks the athlete down.
 */
export const rmrFloorKcal = (weightLb, onDate) => Math.round(rmrKcal(weightLb, onDate))

// Standard compendium values. Walking is 0 on purpose — already counted in steps_kcal.
const DEFAULT_MET = {
  strength: 5.0, circuit: 6.0, bjj: 10.0, peloton: 8.5, walk: 0, rest: 0, other: 4.0,
}

export const metFor = (type) => ({
  ...DEFAULT_MET,
  ...Object.fromEntries(
    Object.entries(constants.metOverrides ?? {}).filter(([k]) => !k.startsWith('_')),
  ),
}[type] ?? DEFAULT_MET.other)

/** Strips the `_comment` / `_note` documentation keys before the values reach the app. */
export function stripNotes(obj) {
  if (Array.isArray(obj)) return obj
  if (obj === null || typeof obj !== 'object') return obj
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([k]) => !k.startsWith('_'))
      .map(([k, v]) => [k, stripNotes(v)]),
  )
}
