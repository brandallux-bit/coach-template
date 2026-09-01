/**
 * Typed surface over the shared aggregation arithmetic.
 *
 * The implementation lives in `scripts/lib/aggregate.mjs`, not here, and is imported rather than
 * restated — the same arrangement as `log-write.ts` over `rowwrite.mjs`, for the same reason. A
 * second copy of "when does this number exist" would drift, and the drift is invisible: both
 * copies keep returning numbers, they just stop agreeing about which days they cover.
 *
 * The .mjs home is also what lets `scripts/test-aggregations.mjs` property-test the code the
 * dashboard actually runs. `scripts/test-views.mjs` says in its own header that its logic is
 * *mirrored* from the TypeScript and must be hand-updated when the TypeScript changes; a property
 * suite built that way would certify the mirror. Everything numeric moved here so it does not
 * have to be.
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore - plain ESM, shared with scripts/ on purpose: one implementation, two consumers
import * as agg from '../../scripts/lib/aggregate.mjs'

export type Row = Record<string, string>

/** Empty means "not measured"; `'0'` means a measured zero. */
export const n: (v: string | undefined) => number | null = agg.n

export const sumOrNull: (values: (number | null)[]) => number | null = agg.sumOrNull
export const meanOrNull: (values: (number | null)[]) => number | null = agg.meanOrNull

export type BurnComponent = {
  column: string; label: string; clockDriven: boolean
  /** `steps_kcal` and `incidental_kcal` — two ways to fill ONE slot. See BURN_COMPONENTS. */
  movement?: boolean
}
export const BURN_COMPONENTS: BurnComponent[] = agg.BURN_COMPONENTS

/** Which of `energy.csv`'s burn columns are absent from a row, i.e. counted as zero in its total. */
export const missingBurnComponents: (energyRow: Row | undefined) => string[] =
  agg.missingBurnComponents

/** Human-readable names for what `missingBurnComponents` returned. */
export const describeMissing: (columns: string[]) => string[] = agg.describeMissing

export type PartialBurn = {
  /** Burn accrued so far, not the whole day's ledger. Null when no energy row exists. */
  burnSoFarKcal: number | null
  /** Burn-so-far minus intake-so-far. */
  deficitSoFarKcal: number | null
  /** The clock-driven share used, 0–1. */
  fraction: number
  /**
   * Inputs that were absent and therefore counted as zero. **Non-empty means these figures are a
   * floor, not an estimate** — see scripts/lib/aggregate.mjs for why a floor is legitimate and an
   * unmarked floor is not.
   */
  missing: string[]
}

export const partialBurnFrom: (
  energyRow: Row | undefined, intakeKcal: number | null, fraction: number,
) => PartialBurn = agg.partialBurnFrom

/** A day that contributes its burn, its intake and its deficit — or none of the three. */
export type BalanceDay = {
  burnToDateKcal: number | null
  intakeKcal: number | null
  deficitToDateKcal: number | null
  targetKcal: number | null
  burnUnderstated: boolean
  inProgress: boolean
}

export type WeekBalance<T> = {
  counted: T[]
  balanceDays: number
  unbalancedDays: number
  intakeKcal: number | null
  burnKcal: number | null
  deficitKcal: number | null
  targetKcal: number | null
  partialDays: number
}

export const balancedDays: <T extends BalanceDay>(days: T[]) => T[] = agg.balancedDays
export const weekBalance: <T extends BalanceDay>(days: T[]) => WeekBalance<T> = agg.weekBalance

/**
 * The weekly budget, split. **`food` is derived — `total − alcohol` — and has no other home.**
 * Alcohol sits inside the calorie budget (`nutrition/plan.md`: "planned into the weekly budget,
 * not a penalty"), so every glass is a calorie not eaten.
 */
export type WeeklyBudget = {
  total: number | null
  alcohol: number | null
  /** DERIVED. Null unless both sides exist. Never written to constants.json. */
  food: number | null
}

export const weeklyBudget: (
  totalKcal: number | null | undefined, alcoholKcal: number | null | undefined,
) => WeeklyBudget = agg.weeklyBudget

/** A day as `weekIntake` reads it. */
export type IntakeDay = {
  intakeKcal: number | null
  alcoholKcal: number | null
  targetKcal: number | null
  inProgress?: boolean
}

export type WeekIntake = {
  daysElapsed: number
  /** **The denominator the three figures share.** Days with an intake figure. */
  intakeDays: number
  alcoholDays: number
  planDays: number
  /**
   * A counted day has not finished, so the pace line already contains the whole of today.
   * **A surface rendering the pace must say so** — see the .mjs, and the registry in
   * `scripts/test-aggregations.mjs`.
   */
  inProgressCounted: boolean
  foodKcal: number | null
  alcoholKcal: number | null
  totalKcal: number | null
  /** `Σ targets.kcal` over the counted days — the plan's own arithmetic, never `budget × n/7`. */
  planToDateKcal: number | null
  /** The plan through today minus what was actually drunk. */
  foodPaceKcal: number | null
  budget: WeeklyBudget
}

/**
 * A week's food / alcohol / total against the weekly budget, over one day set.
 *
 * The full-week budget is the denominator — that is what the athlete asked to see — and the pace
 * figures are what stop a Tuesday reading as headroom he does not have. See the .mjs for why
 * prorating the budget by days elapsed was rejected.
 */
export const weekIntake: <T extends IntakeDay>(days: T[], budget: WeeklyBudget) => WeekIntake =
  agg.weekIntake

/** The athlete's own mean daily burn, over complete `energy.csv` rows. Null below the minimum. */
export type ObservedBurn = {
  meanKcal: number | null
  days: number
  from: string | null
  to: string | null
}

export const MIN_DAYS_FOR_OBSERVED_BURN: number = agg.MIN_DAYS_FOR_OBSERVED_BURN
export const observedDailyBurn: (
  energyRows: Row[], minDays?: number,
) => ObservedBurn | null = agg.observedDailyBurn

/** One day as `weekEnergy` reads it. `weekday` is the `plan.kcalByWeekday` key. */
export type WeekEnergyDay = {
  date: string
  weekday: string
  burnKcal: number | null
  energyComplete: boolean
  targetKcal: number | null
  /** What the day actually ate. The IN side's equivalent of `burnKcal` — null means not logged. */
  intakeKcal: number | null
  /**
   * True on the day that has not finished. Both sides read it: the IN side splits today into
   * "eaten" plus "the rest of the target", and the OUT side refuses to treat a `complete=y` flag
   * on today as a measurement, because that flag goes true hours before the day is over.
   */
  inProgress: boolean
}

/**
 * ⚠ **A PROJECTION, AND EVERY FIELD HERE IS SHAPED SO IT CANNOT BE RENDERED AS A MEASUREMENT.**
 * `estimatedBurnDays` above zero means `outKcal`, `gapKcal` and `lossLb` describe days that have
 * not happened. See `scripts/lib/aggregate.mjs`, and the element-level registry in
 * `scripts/test-aggregations.mjs` that asserts the marker sits on the figure rather than in the
 * file.
 */
export type WeekEnergy = {
  days: number
  /**
   * **Where the week's intake lands: the ledger for finished days, today's eaten-plus-remainder for
   * today, the target for days still to come.** A forecast while `estimatedIntakeDays > 0` — not a
   * restatement of the budget, which is what it was before.
   */
  inKcal: number | null
  /** Σ of the week's burn: `energy.csv` for complete days, the observed mean for the rest. */
  outKcal: number | null
  gapKcal: number | null
  /** `gapKcal ÷ kcalPerLbFat`. **A projection while `estimatedBurnDays > 0`.** */
  lossLb: number | null
  kcalPerLbFat: number | null
  actualBurnDays: number
  estimatedBurnDays: number
  perDayBurnKcal: number | null
  observedDays: number | null
  observedFrom: string | null
  observedTo: string | null
  writtenTargetDays: number
  structureTargetDays: number
  /** Calories actually on the ledger this week, today included, and the days holding a meal row. */
  recordedIntakeKcal: number | null
  recordedIntakeDays: number
  /** Days whose IN figure came wholly from the ledger. */
  actualIntakeDays: number
  /** **Days whose IN figure is still plan. Above zero means `inKcal` is a forecast (X-1).** */
  estimatedIntakeDays: number
  /** `inKcal − recordedIntakeKcal` — the part of the week's intake nobody has eaten yet. */
  plannedIntakeKcal: number | null
}

export const weekEnergy = agg.weekEnergy as (args: {
  days: WeekEnergyDay[]
  observed: ObservedBurn | null
  weekdayBudget: Record<string, number> | null | undefined
  kcalPerLbFat: number | null | undefined
}) => WeekEnergy

export const meanOfAccumulating: <T extends { inProgress: boolean }>(
  days: T[], pick: (d: T) => number | null,
) => number | null = agg.meanOfAccumulating

export const meanOfPointReadings: <T>(
  days: T[], pick: (d: T) => number | null,
) => number | null = agg.meanOfPointReadings

/** `kcal = MET × 3.5 × kg / 200 × minutes`. Null when any input is unknown. */
export const sessionKcal: (
  met: number | null, minutes: number | null, weightLb: number | null,
) => number | null = agg.sessionKcal

export type IntensityTier = 'light' | 'moderate' | 'hard'
export const INTENSITY_TIERS = agg.INTENSITY_TIERS as IntensityTier[]

export type SessionCostLevel =
  | 'override' | 'split' | 'flat' | 'counted-elsewhere' | 'unknown'

export type SessionCost = {
  /** Null when the cost cannot be known, or is deliberately counted elsewhere. Never a bare 0. */
  kcal: number | null
  level: SessionCostLevel
  /** The flat MET used, for `flat` and `counted-elsewhere`. */
  met: number | null
  segments: { tier: IntensityTier; minutes: number; met: number | null; kcal: number | null }[]
  /** One line naming the inputs, so no surface renders a bare estimate. */
  explain: string
}

/**
 * **The one home for "what did this session cost"** — `kcal_override` → per-tier MET over the
 * intensity split → flat MET over duration. `metOf` is the caller's, which is how the ledger and
 * the forward view share one precedence while the forecast still honours the weekly template's
 * pinned MET. See scripts/lib/aggregate.mjs for what the second copy of this cost.
 */
export const sessionCost = agg.sessionCost as (
  row: Row | null | undefined,
  weightLb: number | null,
  metOf: (type: string | null, tier: IntensityTier | null) => number | null,
) => SessionCost

/** The newest row dated on or before `date` — what is in force, not what was written today. */
export const latestOnOrBefore = agg.latestOnOrBefore as (
  rows: Row[], date: string,
) => Row | undefined

/** Every row dated on or before `date` — what is outstanding, not just the newest. */
export const allOnOrBefore = agg.allOnOrBefore as (rows: Row[], date: string) => Row[]

/** Percent of a target, or null when the target is zero or either side is unknown. */
export const pctOfTarget: (
  actual: number | null, target: number | null,
) => number | null = agg.pctOfTarget

export type KcalAbsence = 'counted-elsewhere' | 'unknown'
export const ABSENT_COUNTED_ELSEWHERE: KcalAbsence = agg.ABSENT_COUNTED_ELSEWHERE
export const ABSENT_UNKNOWN: KcalAbsence = agg.ABSENT_UNKNOWN

export const plannedTotal: (
  items: { kcal: number | null; kcalAbsence?: KcalAbsence }[],
) => { total: number | null; partial: boolean } = agg.plannedTotal

export const MINUTES_PER_DAY: number = agg.MINUTES_PER_DAY
/** ⚠ Cannot reach 1 — the maximum is 1439/1440 at 23:59. See the .mjs for why that matters. */
export const dayFraction: (hour: number, minute: number) => number = agg.dayFraction
