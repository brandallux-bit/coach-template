import {
  allOf, body, eachDate, energy, meals, meanOrNull, n, oneOf, plan, steps,
  sumOrNull, targets, training, weekStart, addDays, type Row,
} from './data'

export type DayRoll = {
  date: string
  weightLb: number | null
  waistIn: number | null
  neckIn: number | null
  steps: number | null
  intakeKcal: number | null
  proteinG: number | null
  fatG: number | null
  fibreG: number | null
  alcoholKcal: number | null
  targetKcal: number | null
  targetProteinG: number | null
  targetFatG: number | null
  targetFibreG: number | null
  burnKcal: number | null
  deficitKcal: number | null
  energyComplete: boolean
  sessions: Row[]
  countedSessions: number
}

/** Session types that count against goals.md's 3–4/week floor. Walks live in steps. */
const COUNTS_TOWARD_FLOOR = new Set(['strength', 'circuit', 'bjj', 'peloton'])

export function rollDay(date: string): DayRoll {
  const b = oneOf(body, date)
  const t = oneOf(targets, date)
  const e = oneOf(energy, date)
  const m = allOf(meals, date)
  const sessions = allOf(training, date)

  return {
    date,
    weightLb: n(b?.weight_lb),
    waistIn: n(b?.waist_in),
    neckIn: n(b?.neck_in),
    steps: n(oneOf(steps, date)?.steps),
    intakeKcal: sumOrNull(m, 'kcal'),
    proteinG: sumOrNull(m, 'protein_g'),
    fatG: sumOrNull(m, 'fat_g'),
    fibreG: sumOrNull(m, 'fibre_g'),
    alcoholKcal: sumOrNull(m, 'alcohol_kcal'),
    targetKcal: n(t?.kcal),
    targetProteinG: n(t?.protein_g),
    targetFatG: n(t?.fat_g),
    targetFibreG: n(t?.fibre_g),
    burnKcal: n(e?.burn_total_kcal),
    deficitKcal: n(e?.deficit_kcal),
    energyComplete: e?.complete === 'y',
    sessions,
    countedSessions: sessions.filter(
      (s) => s.status === 'completed' && COUNTS_TOWARD_FLOOR.has(s.type),
    ).length,
  }
}

export type WeekRoll = {
  start: string
  end: string
  label: string
  days: DayRoll[]
  loggedDays: number
  /** Days that actually produced a burn figure. The plan-side comparison must use this, not
   *  the calendar length of the week, or a 4-day partial gets compared against 6 planned days. */
  burnDays: number
  intakeKcal: number | null
  targetKcal: number | null
  burnKcal: number | null
  deficitKcal: number | null
  /** True only when every day in the week has complete intake and step data. */
  complete: boolean
  avgWeightLb: number | null
  lastWaistIn: number | null
  avgSteps: number | null
  sessions: number
  proteinDaysHit: number
  proteinDaysLogged: number
}

const sum = (vals: (number | null)[]) => {
  const v = vals.filter((x): x is number => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) : null
}

export function rollWeek(start: string, through: string): WeekRoll {
  const end = addDays(start, 6)
  const days = eachDate(start, end < through ? end : through).map(rollDay)
  const logged = days.filter((d) => d.intakeKcal != null)
  const waists = days.map((d) => d.waistIn).filter((v): v is number => v != null)

  return {
    start,
    end,
    label: new Date(`${start}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', timeZone: 'UTC',
    }),
    days,
    loggedDays: logged.length,
    burnDays: days.filter((d) => d.burnKcal != null).length,
    intakeKcal: sum(days.map((d) => d.intakeKcal)),
    targetKcal: sum(days.map((d) => d.targetKcal)),
    burnKcal: sum(days.map((d) => d.burnKcal)),
    deficitKcal: sum(days.map((d) => d.deficitKcal)),
    complete: days.length > 0 && days.every((d) => d.energyComplete),
    avgWeightLb: meanOrNull(days.map((d) => d.weightLb)),
    lastWaistIn: waists.length ? waists[waists.length - 1] : null,
    avgSteps: meanOrNull(days.map((d) => d.steps)),
    sessions: days.reduce((a, d) => a + d.countedSessions, 0),
    proteinDaysHit: logged.filter((d) => (d.proteinG ?? 0) >= plan.proteinFloorG).length,
    proteinDaysLogged: logged.length,
  }
}

/** Every Monday-anchored week from the baseline through `through`, oldest first. */
export function allWeeks(through: string): WeekRoll[] {
  const out: WeekRoll[] = []
  for (let w = weekStart(plan.baselineDate); w <= through; w = addDays(w, 7)) {
    out.push(rollWeek(w, through))
  }
  return out
}
