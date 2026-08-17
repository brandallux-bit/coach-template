import bundle from '@/generated/data.json'
import {
  dayFraction, latestOnOrBefore as latestRowOnOrBefore, meanOrNull as meanOfValues, n as nValue,
  sumOrNull as sumValues,
} from './aggregate'

export type Row = Record<string, string>

/**
 * Universal fields are required. Everything below the line is decided by this chart's
 * domains and is therefore optional — a chart with no body-composition domain has no
 * waist trigger, and pages must render without one rather than assume it.
 *
 * TODO: trigger keys are still named here, which means a chart measuring something this
 * type doesn't know about can't drive a reference line. The fix is a per-athlete view
 * config; deferred until a second chart's intake shows what it actually needs.
 */
export type Plan = {
  name: string
  pronouns: string
  timezone: string
  heightIn: number
  age: number | null
  baselineDate: string
  baselineWeightLb: number
  rmrFloorKcal: number | null
  estMaintenanceKcal: number
  proteinFloorG: number
  events: Record<string, string>
  proteinAimG?: number
  weeklyKcalBudget?: number
  /**
   * The athlete's weekly alcohol allowance, **inside `weeklyKcalBudget`, never on top of it.**
   *
   * Optional because it is per-athlete and per-domain: a chart whose domains are symptom control
   * and sleep has no reason to carry one, and its absence renders as TBD, which is a correct chart.
   * **There is deliberately no per-day counterpart** — see `scripts/generate-targets.mjs`. The
   * weekly FOOD budget is derived from this and lives in `scripts/lib/aggregate.mjs`
   * (`weeklyBudget`); it must never be added here as a third constant.
   */
  weeklyAlcoholKcalBudget?: number
  /**
   * The week's calorie budget, **already divided among the seven days**. Mon–Thu 1,700, Fri 1,750,
   * Sat 2,650, Sun 1,750 on this chart; `validate-data.mjs` asserts it sums to `weeklyKcalBudget`.
   *
   * It is the fallback `scripts/generate-targets.mjs` writes from, and therefore the answer to
   * "what is this day's target" on any day no row has been written for yet. **A surface must never
   * invent a different division** — see `data/METHOD.md`, "A day may never lack a calorie target".
   */
  kcalByWeekday?: Record<string, number>
  targetRateLbPerWk?: number[]
  maxRatePctBwPerWk?: number
  stepsPerDayTarget?: number
  sessionsPerWeekFloor?: number
  sessionsPerWeekTarget?: number
  phaseEndDate?: string
  waistTriggerIn?: number
  waistWorkingBaselineIn?: number
  // Renamed from weightTriggerLb 2026-08-11: it is a review checkpoint, not an end condition.
  weightCheckpointLb?: number
  weightFloorLb?: number
  /** The block's weekly skeleton. A real training.csv row always wins over this. */
  weeklyTemplate?: Record<string, TemplateDay>
  // --- Forward-projection inputs (see src/lib/forecast.ts) --------------------------------------
  // Re-exports of the energy model's own constants, so a forward view never keeps a second copy
  // of a number `compute-energy.mjs` already owns. Optional because the template repo has no
  // chart to derive them from.
  /** Resolved MET table by session type, from scripts/lib/athlete.mjs. */
  metByType?: Record<string, number>
  /** Per-intensity MET, for a session logged with a light/moderate/hard split. */
  metByIntensity?: Record<string, { light: number; moderate: number; hard: number }>
  /** kcal per step per lb of bodyweight. */
  kcalPerStepPerLb?: number
  /**
   * The conventional 3,500 kcal per pound of body fat, re-exported from
   * `scripts/lib/athlete.mjs`. **Never type the literal into a page** — it has one home and
   * `scripts/test-single-home.mjs` scans every file in `src/` and `scripts/` for it.
   */
  kcalPerLbFat?: number
  /** Most recent weight on file, for projecting a session that has not happened. */
  latestWeightLb?: number
  /** Minutes/day for the daily supplementary block, if the chart prescribes one. */
  dailyRehabMin?: number | null
  // --- The session-type registry, resolved (see athlete/constants.json `sessionTypes`) ----------
  /** Every legal `training.csv` type on this chart, in registry order. Drives the /log dropdown. */
  sessionTypeList?: string[]
  /** The subset that counts against `sessionsPerWeekFloor`. See `COUNTS_TOWARD_FLOOR` below. */
  countsTowardFloor?: string[]
  /** The `goals.md` domain each type serves, or null for the two universal structural types. */
  sessionTypeDomains?: Record<string, string | null>
  /**
   * Sentences about THIS athlete that a shared component would otherwise carry as a literal.
   *
   * Every key is optional and every renderer must work without it (audit F-31): a new athlete used
   * to get a `primary`-badged "Waist at navel" tile, a card explaining a 36.5″ figure taken off
   * prednisone, and a Today tab telling him which of *someone else's* days were fixed. Absence
   * renders a generic sentence or nothing at all, which is a correct chart, not a gap.
   */
  copy?: Record<string, string | undefined>
}

export type TemplateDay = {
  type: string
  session: string
  focus?: string
  durationMin?: number | null
  /**
   * Intended intensity for this planned day, overriding the type's default MET.
   * A session type covers a range — `peloton` defaults to 8.5, a hard ride, which overstates the
   * seated low-resistance ride currently prescribed. Pinning it here keeps the forecast honest
   * without redefining the type for every future hard ride.
   */
  met?: number
}

/**
 * Session types that count against `goals.md`'s sessions/week floor.
 *
 * ⚠ **ONE HOME, and it took two moves to get here** (audit F-70, then F-15). It was declared
 * identically in `rollup.ts` and `forecast.ts`, mirrored a third time in `test-views.mjs`, and the
 * drift guard there regex-parsed **`rollup.ts` only** — so a change to the `forecast.ts` copy
 * passed CI green while the home page and Next 7 Days counted different sessions against the same
 * floor. W5 moved it here so both view libs imported one set. **W7 moved the set itself out of
 * this file**: a hardcoded list of one athlete's activities is X-11 whichever shared file it sits
 * in, and it was the mechanism by which a new athlete who runs — one legal type, `other`, not in
 * this set — had **every session invisible to the adherence count**, with `CLAUDE.md` §7 then
 * routing their coach to behaviour-change counselling for someone training six days a week.
 *
 * It now resolves from `athlete/constants.json`'s `sessionTypes` registry, via the bundle. Walks
 * still do not count on this chart — their energy and their credit both live in `steps.csv` — but
 * that is now the chart saying so, not the code.
 */
export const COUNTS_TOWARD_FLOOR = new Set((bundle.plan as Plan).countsTowardFloor ?? [])

/**
 * Readings needed before a least-squares projection means anything.
 *
 * `trend()` below defaults to this and the Goals page states it — one constant, two readers. They
 * used to be two `7`s (audit F-71): lowering the default would have left the page still saying
 * "needs 7 weigh-ins" while every other caller projected from fewer.
 */
export const MIN_READINGS_FOR_PROJECTION = 7

export const plan = bundle.plan as Plan
export const body = bundle.body as Row[]
export const steps = bundle.steps as Row[]
export const targets = bundle.targets as Row[]
export const meals = bundle.meals as Row[]
export const training = bundle.training as Row[]
export const sets = bundle.sets as Row[]
export const prescriptions = bundle.prescriptions as Row[]

/** Long-format store for anything the fixed columns don't cover. See data/METHOD.md. */
export const metrics = bundle.metrics as Row[]
export const metricsRegistry = bundle.metricsRegistry as Record<
  string,
  { label: string; unit: string; direction: 'up' | 'down'; domain: string }
>
export const coachNotes = bundle.coachNotes as Row[]
export const energy = bundle.energy as Row[]

/**
 * Something the system noticed, computed rather than remembered.
 *
 * The shape is `scripts/lib/findings.mjs`'s and this is a mirror of it — that file's header
 * explains why the layer reports and never blocks, and it is worth reading before adding one.
 *
 * `severity` is the only field a renderer may act on:
 *   `critical`  raise this before anything else on the page
 *   `attention` needs a decision soon
 *   `info`      worth knowing, no action implied
 */
export type Finding = {
  id: string
  severity: 'critical' | 'attention' | 'info'
  audience?: 'athlete' | 'coach' | 'maintainer'
  headline: string
  detail: string
  action: string
  source?: string
  domain?: string
}

/**
 * Findings as of the last build. `src/lib/findings.ts` is what a page should import — it adds the
 * ones that can only be computed at request time, and this list on its own is missing them.
 */
export const bundledFindings = bundle.findings as Finding[]

/** When src/generated/data.json was built. See scripts/build-data-json.mjs for why it is here. */
export const generatedAt = bundle.generatedAt as { localDate: string; at: string }

/**
 * Empty means "not measured" and must never collapse to zero.
 *
 * Re-exported from `src/lib/aggregate.ts` rather than defined here, so the check suite and the
 * dashboard share one implementation of the distinction the whole of X-1 rests on.
 */
export const n = nValue

export const oneOf = (rows: Row[], date: string) => rows.find((r) => r.date === date)
export const allOf = (rows: Row[], date: string) => rows.filter((r) => r.date === date)

/**
 * The newest row dated on or before `date` — "what is in force today", not "what was written
 * today".
 *
 * `oneOf` is an exact-date match, which is right for a measurement (a weigh-in belongs to the day
 * it was taken) and wrong for anything that stands until it is replaced. The Today tab used
 * `oneOf` for the coach's note, so every note in `coach-notes.csv` was visible on exactly one day
 * and invisible on all the others — three notes written, three notes nobody could see the morning
 * after. A renderer using this must say which date the row carries when it is not today's, or a
 * note about Friday's dinner silently becomes advice about Tuesday.
 *
 * The lookup itself lives in `scripts/lib/aggregate.mjs` — `compute-energy.mjs` and
 * `build-data-json.mjs` each had their own forward-fill of the same rule, so "what is in force on
 * this date" was three expressions that happened to agree.
 */
export const latestOnOrBefore: (rows: Row[], date: string) => Row | undefined = latestRowOnOrBefore

/** Today in the athlete's timezone, not the server's. */
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: plan.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/**
 * How much of the athlete's local day has actually happened, 0–1.
 *
 * energy.csv is a whole-day ledger, which is right for history and wrong for a day in progress:
 * a full 24 hours of RMR rendered at 08:00 reads as "you have already burned 1,781 kcal." Only
 * the clock-driven components (RMR, non-step NEAT) need this — steps, session and food-thermic
 * burn are actual-to-date already.
 *
 * ⚠ **THE RETURN VALUE CANNOT REACH 1.** It maxes at 1439/1440 = 0.99930555…, at 23:59. Anything
 * testing this for "the day is over" is testing something that never happens: `today/page.tsx`
 * guarded a tile branch with `elapsed >= 1` and it never once fired, so the tile said "N% of the
 * day elapsed · full day projects to…" at 23:59 as well as at 06:00 (audit F-55). **Use
 * `DayRoll.inProgress`, which is keyed off the date, to ask whether a day is finished.** The
 * arithmetic and its producible domain live in `src/lib/aggregate.ts` so the reachability check in
 * `scripts/test-aggregations.mjs` can derive the domain rather than assume it.
 */
export function fractionOfDayElapsed(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: plan.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const at = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return dayFraction(at('hour'), at('minute'))
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Athlete-local weekday key for a YYYY-MM-DD, to look up plan.weeklyTemplate. */
export const weekdayKey = (iso: string) =>
  WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

export const weekdayOf = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })

export const prettyDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  })

/** Monday-anchored week start, matching how the plan's Mon–Thu / Fri–Sun budget is written. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7
  return addDays(iso, -dow)
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** Sum a numeric column, returning null when nothing was measured at all. */
export function sumOrNull(rows: Row[], key: string): number | null {
  return sumValues(rows.map((r) => n(r[key])))
}

export const meanOrNull = meanOfValues

export const fmt = (v: number | null | undefined, digits = 0, suffix = '') =>
  v == null || Number.isNaN(v)
    ? 'TBD'
    : `${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`

/**
 * Least-squares slope over (dayIndex, value). Returns null below `minPoints` — a projection
 * from three readings is noise wearing a confidence interval, and CLAUDE.md §6 is explicit
 * that trend beats point.
 */
export function trend(
  points: { date: string; value: number }[], minPoints = MIN_READINGS_FOR_PROJECTION,
) {
  if (points.length < minPoints) return null
  const x0 = Date.parse(`${points[0].date}T12:00:00Z`)
  const xs = points.map((p) => (Date.parse(`${p.date}T12:00:00Z`) - x0) / 86_400_000)
  const ys = points.map((p) => p.value)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ys.reduce((a, b) => a + b, 0) / ys.length
  let num = 0, den = 0
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2 }
  if (den === 0) return null
  const slope = num / den
  return { perDay: slope, perWeek: slope * 7, intercept: my - slope * mx, n: points.length }
}

export const series = (rows: Row[], key: string) =>
  rows
    .map((r) => ({ date: r.date, value: n(r[key]) }))
    .filter((p): p is { date: string; value: number } => p.value != null)
