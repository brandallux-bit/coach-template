/**
 * The arithmetic that decides WHETHER A NUMBER EXISTS.
 *
 * WHY THIS FILE EXISTS. INVARIANTS.md X-1 — *empty means "not measured", zero means a measured
 * zero* — was enforced at row level and nowhere at aggregation level, which is where all ten of
 * its findings lived. The shape of every one of them is the same: a column-wise `sum()` that skips
 * nulls, so **each column silently picks its own day set** and the row stops reconciling. The
 * athlete read `Days logged 4/4 · Eaten 4,160 · Burn 9,741 · Deficit 3,007` off one line;
 * 9,741 − 4,160 is 5,581 (audit F-51).
 *
 * WHY IT IS PLAIN ESM AND NOT TYPESCRIPT. Same reason as `rowwrite.mjs`: so the check suite runs
 * the code the dashboard runs, rather than a lookalike. `scripts/test-views.mjs` says at the top
 * that its logic is *mirrored* from the TypeScript and that a change to `rollup.ts` must be copied
 * here by hand — an honest admission, and exactly the drift X-8 is about. A property test over a
 * mirror certifies the mirror. Everything numeric therefore lives here, `src/lib/aggregate.ts` is
 * a typed re-export of it, and `scripts/test-aggregations.mjs` imports THIS file.
 *
 * THE CONTRACT EVERY FUNCTION HERE HOLDS, and what the property suite asserts:
 *
 *   > Null in, null out — or a number that says out loud which of its inputs were absent.
 *
 * The second half is not a loophole. `data/METHOD.md` is explicit that the burn model treats an
 * unknown component as zero so that `burn_total_kcal` is a **floor** rather than a guess. A floor
 * is a legitimate, useful number; a floor that does not say it is one is the defect. So a function
 * may return a figure built on absent inputs *only* if it also returns the list of what was
 * absent, and the surface rendering it must mark it (see `missingBurnComponents`).
 *
 * Pure: takes values, returns values. No file IO, no dates of its own, no opinions.
 */

/**
 * Empty means "not measured"; `'0'` means a measured zero.
 *
 * The one place that distinction is made. 2026-08-12 rendered as 36.7 g of fat against a true
 * 72.7 g because one blank cell was summed as a zero (data/METHOD.md rule 3a).
 */
export const n = (v) => (v == null || v === '' ? null : Number(v))

/** Sum of the values that exist. `null` when none of them do — never `0`. */
export function sumOrNull(values) {
  const v = values.filter((x) => x != null && !Number.isNaN(x))
  return v.length ? v.reduce((a, b) => a + b, 0) : null
}

/** Mean of the values that exist. `null` when none of them do. */
export function meanOrNull(values) {
  const v = values.filter((x) => x != null && !Number.isNaN(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/**
 * The columns `energy.csv`'s `burn_total_kcal` is built from, in the order the model adds them.
 *
 * `clockDriven` is the proration rule, not a display hint: RMR and non-step NEAT accrue with the
 * clock, so a day in progress holds a fraction of them. The other three exist only once the meal,
 * the step feed or the session has been logged, so they are accrued-to-date by construction.
 */
export const BURN_COMPONENTS = [
  { column: 'rmr_kcal', label: 'resting metabolism', clockDriven: true },
  { column: 'neat_other_kcal', label: 'non-step movement', clockDriven: true },
  { column: 'tef_kcal', label: 'the thermic effect of food', clockDriven: false },
  { column: 'steps_kcal', label: 'the step count', clockDriven: false },
  { column: 'session_kcal', label: 'session burn', clockDriven: false },
]

/**
 * Which burn components are absent from an `energy.csv` row — i.e. counted as zero in its total.
 *
 * A NON-EMPTY RESULT IS THE INCOMPLETENESS FLAG. `energy.csv` already carries a `complete` column
 * saying the same thing in one bit, and the audit's finding was that it "is computed, stored,
 * carried — and rendered nowhere" (F-16). One bit is not enough to render: the athlete needs to
 * know the burn is understated *and why*, because the two live causes have different answers — a
 * missing step total means the phone automation did not fire, a missing TEF means nothing was
 * logged that day. Returning the labels rather than the boolean is what lets a surface say which.
 *
 * Scale of the harm, from F-16: with no step feed at all, burn is understated by ~420 kcal/day and
 * this chart's weekly energy balance flips from a +169 kcal deficit to a −1,702 kcal surplus. The
 * athlete would reasonably conclude he was eating over maintenance and cut further.
 */
export function missingBurnComponents(energyRow) {
  if (!energyRow) return BURN_COMPONENTS.map((c) => c.column)
  return BURN_COMPONENTS.filter((c) => n(energyRow[c.column]) == null).map((c) => c.column)
}

/** The human-readable names for what `missingBurnComponents` returned. */
export const describeMissing = (columns) =>
  columns.map((c) => BURN_COMPONENTS.find((b) => b.column === c)?.label ?? c)

/**
 * Burn accrued SO FAR on a day, rather than `energy.csv`'s whole-day figure.
 *
 * `energy.csv` is a full-day ledger — correct for history, wrong for a day in progress. Rendering
 * it raw meant a full 24 h of RMR appeared at 08:00 as "1,781 kcal already burned", and "deficit
 * so far" inherited the same lie in the direction that invites overeating (reported 2026-08-11).
 *
 * `missing` is the contract this module holds: the figure returned is a FLOOR built by counting
 * absent components as zero, and the caller is told exactly which ones those were. When there is
 * no row at all the figures are null, because nothing was observed and a floor of nothing is not
 * a number.
 */
export function partialBurnFrom(energyRow, intakeKcal, fraction) {
  const missing = missingBurnComponents(energyRow)
  if (!energyRow) return { burnSoFarKcal: null, deficitSoFarKcal: null, fraction, missing }

  const clockDriven = BURN_COMPONENTS
    .filter((c) => c.clockDriven)
    .reduce((a, c) => a + (n(energyRow[c.column]) ?? 0), 0)
  const accrued = BURN_COMPONENTS
    .filter((c) => !c.clockDriven)
    .reduce((a, c) => a + (n(energyRow[c.column]) ?? 0), 0)

  const burnSoFarKcal = clockDriven * fraction + accrued
  return {
    burnSoFarKcal,
    // Intake absent is counted as zero for the same reason a burn component is: the figure stays a
    // floor. `missing` says so — a "deficit so far" with nothing logged is burn, and the Today tab
    // says that in words rather than presenting it as a deficit.
    deficitSoFarKcal: burnSoFarKcal - (intakeKcal ?? 0),
    fraction,
    missing: intakeKcal == null ? [...missing, 'intake'] : missing,
  }
}

/**
 * THE ONE DAY SET behind a week's `burnKcal`, `intakeKcal` and `deficitKcal` (audit F-51).
 *
 * A day contributes all three of its figures or none of them. Before this, each column was summed
 * independently with nulls skipped, so a day with steps and a session but no food logged put its
 * burn into the week's total and its (blank) deficit into nothing — and the athlete read a row
 * whose columns had different denominators, with "4/4 days logged" printed beside it.
 *
 * WHY THE PREDICATE NAMES ALL THREE rather than deriving deficit from the other two: deriving it
 * would make the arithmetic reconcile by construction even if `energy.csv` and `meals.csv`
 * disagreed about the day, which is the disagreement the ledger exists to expose. Requiring all
 * three present means the identity `burn − intake = deficit` is a real assertion about the data,
 * and `scripts/test-aggregations.mjs` asserts it against the live chart on every run.
 *
 * WHAT IT COSTS. A week containing a day with food logged but no burn figure will show that day's
 * calories nowhere in the weekly row. That is deliberate: the alternative is the row that does not
 * add up. The day is still rendered in full in every daily table, and `unbalancedDays` below is
 * what a surface uses to say the week's totals cover fewer days than the week holds.
 */
export function balancedDays(days) {
  return days.filter(
    (d) => d.burnToDateKcal != null && d.intakeKcal != null && d.deficitToDateKcal != null,
  )
}

/**
 * A week's energy balance, over one day set.
 *
 * `targetKcal` is summed over the SAME set, so the "actual vs plan" bars on History cover the same
 * days on both sides — the defect one chart over from F-62. A counted day with no target row is
 * possible in principle (the generator did not run); nothing marks it here because the missing
 * feed is already a finding of its own (`WORKFLOW_FEEDS`, `data/targets.csv`), and a second marker
 * for one cause is how a card stops being read.
 */
export function weekBalance(days) {
  const counted = balancedDays(days)
  const inBalance = new Set(counted)
  // Days that hold SOME data and still could not be balanced. Deliberately not "every day the
  // totals left out": a week that has not happened yet is full of days with nothing on them, and
  // counting those would make this fire on every current week and mean nothing.
  const unbalanced = days.filter(
    (d) => !inBalance.has(d) && (d.burnToDateKcal != null || d.intakeKcal != null),
  )
  return {
    counted,
    /** The denominator all four figures below share. Render it; do not recompute it. */
    balanceDays: counted.length,
    /** Days holding data that could not be balanced — one side of the day was missing. */
    unbalancedDays: unbalanced.length,
    intakeKcal: sumOrNull(counted.map((d) => d.intakeKcal)),
    burnKcal: sumOrNull(counted.map((d) => d.burnToDateKcal)),
    deficitKcal: sumOrNull(counted.map((d) => d.deficitToDateKcal)),
    targetKcal: sumOrNull(counted.map((d) => d.targetKcal)),
    /** Counted days that are FINISHED and still missing a burn component. Zero on a clean chart. */
    partialDays: counted.filter((d) => d.burnUnderstated).length,
  }
}

/**
 * ⚠ **THE ONE HOME FOR THE WEEKLY FOOD BUDGET, WHICH IS DERIVED AND MUST NEVER BE TYPED.**
 *
 * `nutrition/plan.md` is explicit that alcohol sits **inside** the calorie budget: *"It is planned
 * into the weekly budget, not a penalty"*, and the big-dinner day is described as *"dinner + wine
 * budgeted in"*. So the three figures are one subtraction, not three constants:
 *
 *     total  = plan.weeklyKcalBudget           (the chart's, already on file)
 *     alcohol= plan.weeklyAlcoholKcalBudget    (the athlete's, 2026-08-14)
 *     food   = total − alcohol                 (DERIVED — no second home, ever)
 *
 * Writing the food figure into `constants.json` would create the drift X-8 is named after: three
 * numbers that must satisfy an identity, stored independently, with nothing checking it. Here the
 * identity holds by construction and `scripts/validate-data.mjs` additionally refuses an alcohol
 * budget that is not strictly inside the calorie budget, because a food budget of zero or less is a
 * record contradicting itself.
 *
 * **Null-propagating, and every combination is a legitimate chart.** A chart with no weekly calorie
 * budget gets nothing; a chart with a budget and no alcohol figure gets a total and no split, which
 * is exactly what this chart was until the athlete set one.
 */
export function weeklyBudget(totalKcal, alcoholKcal) {
  const total = totalKcal == null || !Number.isFinite(totalKcal) ? null : totalKcal
  const alcohol = alcoholKcal == null || !Number.isFinite(alcoholKcal) ? null : alcoholKcal
  return {
    total,
    alcohol,
    food: total == null || alcohol == null ? null : total - alcohol,
  }
}

/**
 * A week's INTAKE against that budget — food, alcohol and total — over **one day set**.
 *
 * ⚠ **THE DEFECT THIS IS SHAPED TO AVOID: a week-to-date figure divided by a full-week budget.**
 * Three days into the week, 4,000 kcal against "12,950" reads as 31% used and looks like enormous
 * headroom, when he is roughly on pace. That is F-51's shape — a numerator and a denominator
 * covering different day sets — wearing a budget's clothes, and on the surface he opens daily.
 *
 * The fix is NOT to shrink the denominator: he asked to see the week's target, and prorating
 * 12,950 by days elapsed would invent a number nobody planned. **This chart's budget is
 * deliberately not flat** — Mon–Thu 1,700, Fri 1,750, Sat 2,650, Sun 1,750 — so `12,950 × 5/7` is
 * 9,250 against a real Mon–Fri plan of 8,550: 700 kcal of fabricated headroom, produced on the day
 * before the weekend the whole structure exists to protect.
 *
 * So the budget stays the denominator and the week's OWN target rows supply a **pace** figure
 * beside it: `planToDateKcal` is `Σ targets.kcal` over the counted days, which is the plan's own
 * arithmetic and needs nothing invented.
 *
 * **`counted` is days with an intake figure, and the pace is summed over exactly those days** — the
 * same rule as `weekBalance` above and for the same reason. An unlogged Wednesday dropping out of
 * the consumed side while staying in the plan side is the flattering direction, and it is the one
 * mechanism by which this card could quietly show headroom he does not have.
 *
 * **`foodPaceKcal` is the plan through today MINUS what he actually drank.** Alcohol has no per-day
 * allocation on purpose (see `weeklyBudget` and `scripts/generate-targets.mjs`), so there is no
 * planned food line to subtract it from — but there is a measured one, and it says the true thing:
 * every glass is a calorie he does not eat. Null when nothing was drunk *and* nothing was planned.
 *
 * X-1 throughout: a week with nothing logged returns nulls, never zeros, and a day that recorded no
 * drink is **not** a measured zero — it simply contributes nothing to `alcoholDays`.
 */
export function weekIntake(days, budget) {
  const counted = days.filter((d) => d.intakeKcal != null)
  const alcoholCounted = counted.filter((d) => d.alcoholKcal != null)

  const totalKcal = sumOrNull(counted.map((d) => d.intakeKcal))
  const alcoholKcal = sumOrNull(alcoholCounted.map((d) => d.alcoholKcal))
  const planToDateKcal = sumOrNull(counted.map((d) => d.targetKcal))

  return {
    /** Days in the window that have happened — `rollWeek` truncates at `through`. */
    daysElapsed: days.length,
    /** **The denominator the three figures below share.** Render it; never recompute it. */
    intakeDays: counted.length,
    /** Counted days that recorded an alcohol figure. A blank is "no drink logged", never a zero. */
    alcoholDays: alcoholCounted.length,
    /** Counted days that also carry a target row — the pace figure's own coverage. */
    planDays: counted.filter((d) => d.targetKcal != null).length,
    /**
     * **True when one of the counted days has not finished — the day-scale version of the trap.**
     *
     * A day in progress contributes the calories eaten so far and its target IN FULL, because the
     * plan has no intraday schedule and prorating a calorie budget by the clock would invent one
     * (nobody eats linearly through a day, and this chart's biggest day is a dinner). So on a
     * Saturday morning with breakfast logged, `planToDateKcal` already contains the whole 2,650
     * and the gap reads as ~2,350 "under" — which is not headroom banked, it is a day not yet
     * eaten.
     *
     * The figure is right and the READING is what goes wrong, so this is a flag rather than an
     * adjustment: any surface rendering the pace must say the line runs through the END of today.
     * `scripts/test-aggregations.mjs` holds a registry asserting exactly that, the same way X-1's
     * `burnUnderstated` is registered.
     */
    inProgressCounted: counted.some((d) => d.inProgress === true),
    /**
     * Calories that were not alcohol. `alcohol_kcal` is a COMPONENT of `kcal` on a meals row, never
     * an addition to it (`validate-data.mjs` refuses a row where it exceeds the row's kcal), so
     * this is a subtraction and not a second sum. Robust to an unlogged drink: a missing wine row
     * removes the same number from both sides.
     */
    foodKcal: totalKcal == null ? null : totalKcal - (alcoholKcal ?? 0),
    alcoholKcal,
    totalKcal,
    /** What the plan allowed across the counted days. Never `budget × daysElapsed / 7`. */
    planToDateKcal,
    foodPaceKcal: planToDateKcal == null ? null : planToDateKcal - (alcoholKcal ?? 0),
    budget,
  }
}

/**
 * How many COMPLETE days a chart needs before its own burn figures beat the plan's estimate.
 *
 * Seven, because the thing being averaged is a weekly structure, not a population: this chart's
 * finished days run 2,383 to 3,038 kcal and the difference is *which session was on that weekday*.
 * A mean over four days is a mean over whichever four weekdays happened to be complete.
 *
 * Not the same quantity as `MIN_READINGS_FOR_PROJECTION` in `src/lib/data.ts`, which is weigh-ins
 * needed before a least-squares slope means anything. Same digit, different question, different
 * input — stated here so the next sweep does not "unify" them.
 */
export const MIN_DAYS_FOR_OBSERVED_BURN = 7

/**
 * The athlete's OWN mean daily burn, from complete `energy.csv` rows. `null` below the minimum.
 *
 * ⚠ **THIS IS A MEASUREMENT-DERIVED FIGURE AND IT REPLACES AN ESTIMATE THAT WAS ~10% LOW.**
 * `plan.estMaintenanceKcal` is `RMR × 1.5` — 2,450 — and `data/METHOD.md` forbids in bold putting
 * it on the same axis as the decomposed burn model, which prices the mixing error at ~2,618
 * kcal/week (audit F-57, and the reason W5 took it off the shared axis). Every complete row of
 * `energy.csv` is the decomposed model's own output, so a mean over them is the same model on both
 * sides of any comparison.
 *
 * `complete === 'y'` is the gate rather than "the date has passed": a finished day still missing
 * its step feed carries an understated FLOOR (X-1), and averaging floors in would drag the figure
 * down silently. A day with no `burn_total_kcal` at all is excluded for the same reason.
 *
 * `days`, `from` and `to` are returned because a bare mean is not renderable: a surface has to be
 * able to say how many days it covers and which ones, or the reader cannot tell a stable average
 * from two data points. **The window is every complete day on file, deliberately** — a trailing
 * window would be a second parameter nobody has ruled on, and the day count says what it covers.
 */
export function observedDailyBurn(energyRows, minDays = MIN_DAYS_FOR_OBSERVED_BURN) {
  const complete = (energyRows ?? [])
    .filter((r) => r?.complete === 'y' && n(r.burn_total_kcal) != null)
  if (complete.length < minDays) return null
  const dates = complete.map((r) => r.date).filter(Boolean).sort()
  return {
    meanKcal: meanOrNull(complete.map((r) => n(r.burn_total_kcal))),
    days: complete.length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  }
}

/**
 * ⚠ **THE WEEK'S ESTIMATED CALORIES IN, ESTIMATED CALORIES OUT, AND WHAT THEY PRODUCE.**
 *
 * Asked for directly on 2026-08-15: *"my goal for the week is still lose 1 lb, so the week needs
 * an estimated cals in and estimated cals out to achieve that, and they need to be divided
 * logically amongst the 7 days."*
 *
 * **THE DIVISION ALREADY EXISTED AND NOTHING HERE INVENTS A NEW ONE.** `plan.kcalByWeekday` is the
 * split — Mon–Thu 1,700, Fri 1,750, Sat 2,650, Sun 1,750 — and `validate-data.mjs` already asserts
 * it sums to `weeklyKcalBudget`. A day that has a written `targets.csv` row uses that row, because
 * a written row is a deliberate override (the big dinner moving off Saturday); a day that has none
 * yet falls back to the same weekday structure the generator would write. Two sources, one
 * division, and `writtenTargetDays` / `structureTargetDays` say which days came from which.
 *
 * **THE OUT SIDE IS ACTUALS WHERE THEY EXIST AND THE ATHLETE'S OWN AVERAGE WHERE THEY DO NOT.**
 * There is no second burn computation here: a finished day contributes `energy.csv`'s own
 * `burn_total_kcal`, and a day that has not finished contributes `observedDailyBurn`'s mean of
 * exactly those rows. Composing a fresh RMR + NEAT + TEF + steps + session figure for a future day
 * would be a second implementation of the burn model, which `scripts/test-single-home.mjs` fails,
 * correctly.
 *
 * ⚠ **A PROJECTION IS NOT A MEASUREMENT (INVARIANTS.md X-1).** `estimatedBurnDays` is the honesty
 * contract and it is not optional: any surface rendering `outKcal` or `lossLb` must mark them
 * while it is above zero, and `scripts/test-aggregations.mjs` asserts the marker is attached to the
 * element carrying the figure rather than merely present in the file. On the current week it is
 * always above zero — today has not finished — so the mark is not a corner case, it is the normal
 * state.
 *
 * Null-propagating throughout: no observed figure yet means `outKcal` and `lossLb` are null and the
 * IN side still renders, because the plan is knowable when the burn is not.
 *
 * `kcalPerLbFat` is a PARAMETER, not a literal. Its one home is `scripts/lib/athlete.mjs`
 * (`KCAL_PER_LB_FAT`), which reaches the dashboard through the bundle the same way the MET table
 * does; a `3500` written here would be a second home and `test-single-home.mjs` would say so.
 */
export function weekEnergy({ days = [], observed = null, weekdayBudget = null, kcalPerLbFat = null }) {
  const perDay = observed?.meanKcal ?? null

  const burns = days.map((d) => {
    const actual = d.energyComplete ? n(d.burnKcal) : null
    return actual != null
      ? { kcal: actual, actual: true }
      : { kcal: perDay, actual: false }
  })
  const targets = days.map((d) => {
    const written = n(d.targetKcal)
    return written != null
      ? { kcal: written, written: true }
      : { kcal: n(weekdayBudget?.[d.weekday]), written: false }
  })

  // sumOrNull, not reduce: a single day with no figure must not be silently counted as zero. A
  // week whose out side is incomplete has no out side — that is X-1, and the alternative is a
  // total that looks like a light week rather than a partial one.
  const outKcal = burns.some((b) => b.kcal == null) ? null : sumOrNull(burns.map((b) => b.kcal))
  const inKcal = targets.some((t) => t.kcal == null) ? null : sumOrNull(targets.map((t) => t.kcal))
  const gapKcal = outKcal == null || inKcal == null ? null : outKcal - inKcal

  return {
    days: days.length,
    inKcal,
    outKcal,
    /** Out minus in, in kcal. The numerator of the pounds figure, rendered so it can be checked. */
    gapKcal,
    lossLb: gapKcal == null || kcalPerLbFat == null || !kcalPerLbFat ? null : gapKcal / kcalPerLbFat,
    kcalPerLbFat,
    /** Days whose burn is `energy.csv`'s own completed figure. */
    actualBurnDays: burns.filter((b) => b.actual).length,
    /** **Days whose burn is an estimate. Above zero means the total is a projection.** */
    estimatedBurnDays: burns.filter((b) => !b.actual).length,
    /** The per-day figure those estimated days used, and how many days it averages. */
    perDayBurnKcal: perDay,
    observedDays: observed?.days ?? null,
    observedFrom: observed?.from ?? null,
    observedTo: observed?.to ?? null,
    /** Days taking their target from a written `targets.csv` row. */
    writtenTargetDays: targets.filter((t) => t.written).length,
    /** Days falling back to `plan.kcalByWeekday`. Never a figure this function chose. */
    structureTargetDays: targets.filter((t) => !t.written && t.kcal != null).length,
  }
}

/**
 * Mean of an ACCUMULATING metric — steps, minutes, kcal. A day still in progress is excluded.
 *
 * THE DISTINCTION THIS FUNCTION EXISTS TO MAKE (audit F-59). A weigh-in is a point measurement:
 * taken at 07:00 it is as true at 07:00 as it will ever be, so today's reading belongs in the
 * week's average. Steps are an accumulation: today's count is a partial that will keep rising
 * until midnight, and averaging it in at full weight drags the mean down by however much of the
 * day is left. History read **Avg steps 5,667** against a 9,000 target for a week whose completed
 * days averaged 7,551 — he would conclude he was 3,300/day behind when he was ~1,450 behind.
 *
 * Note the asymmetry that made it invisible: a day with NO steps row is already excluded, because
 * `meanOrNull` skips nulls. A day with a PARTIAL count looked like data and was included whole.
 * Two functions rather than one so a new metric has to pick a side.
 */
export const meanOfAccumulating = (days, pick) =>
  meanOrNull(days.filter((d) => !d.inProgress).map(pick))

/** Mean of a POINT measurement — a weigh-in, a tape reading. Today's counts, in full. */
export const meanOfPointReadings = (days, pick) => meanOrNull(days.map(pick))

/**
 * THE pound-to-kilogram conversion. Exact by definition, and the only one in this repo.
 *
 * `scripts/lib/athlete.mjs` used to carry a second — `LB_PER_KG = 2.20462`, used as a divisor —
 * so the RMR path and the session path converted through two different constants that differ by
 * 1.2×10⁻⁶. No number on any page was ever wrong because of it, which is precisely why it survived
 * three sweeps (audit F-67). Two homes for one conversion is one home too many whether or not it
 * has bitten yet.
 */
export const KG_PER_LB = 0.45359237
export const kgFromLb = (lb) => (lb == null ? null : lb * KG_PER_LB)

/**
 * The chart's session model: `kcal = MET × 3.5 × kg / 200 × minutes` (data/METHOD.md).
 *
 * Null-propagating on purpose. A session with no duration on file has an UNKNOWN cost, not a zero
 * one: 2026-08-13's rehab row has a deliberately blank `duration_min` ("not measured", per rule 3)
 * and costing it at zero would quietly understate the day.
 */
export function sessionKcal(met, minutes, weightLb) {
  for (const v of [met, minutes, weightLb]) {
    if (v == null || !Number.isFinite(v)) return null
  }
  return met * 3.5 * (weightLb * KG_PER_LB) / 200 * minutes
}

/**
 * The newest row dated on or before `date` — *what is in force*, not *what was written today*.
 *
 * One home for a rule that had three: `src/lib/data.ts` did it for coach notes,
 * `scripts/compute-energy.mjs` carried the last known weight forward inside its loop, and
 * `scripts/build-data-json.mjs` re-implemented the same forward-fill with a comment saying "same
 * forward-fill as compute-energy.mjs". Three expressions of one rule that happened to agree —
 * which is X-8 exactly, and the reason a session's weight and the ledger's weight could have
 * silently diverged on a day with two body rows.
 *
 * Max-by-date, never last-row-in-file: a hand-inserted row must not be able to change which row is
 * in force just by where it landed in the file.
 */
export function latestOnOrBefore(rows, date) {
  let best
  for (const r of rows) {
    if (r.date > date) continue
    if (best === undefined || r.date > best.date) best = r
  }
  return best
}

/**
 * Every row dated on or before `date` — *what is outstanding*, not *what is newest*.
 *
 * Built for `data/coach-notes.csv` once the Today tab moved from "the newest note replaces the
 * rest" to "every note stands on its own until dismissed" (`src/components/CoachNotes.tsx`).
 * `latestOnOrBefore` picking a single winner is right for a value that is IN FORCE — a plan or a
 * target, where two rows can't both be true at once. A note is not that: two standing notes can
 * both be true and both still need saying, so collapsing them to one silently drops the other.
 */
export function allOnOrBefore(rows, date) {
  return rows.filter((r) => r.date <= date)
}

/**
 * The tiers a session's duration can be split across, in the order the model adds them.
 * Order is fixed so `explain` reads the same way every time.
 */
export const INTENSITY_TIERS = ['light', 'moderate', 'hard']

/**
 * ⚠ **THE ONE HOME FOR "WHAT DID THIS SESSION COST".** Not the formula — that is `sessionKcal`
 * above — but the **three-level precedence** over it, which is where the money actually was.
 *
 * WHY THIS EXISTS (audit F-02, F-67). The precedence lived in `scripts/compute-energy.mjs` and
 * **nowhere else**, and `scripts/build-data-json.mjs` implemented only its third level. So the
 * dashboard showed `BJJ — completed · ~1,328 kcal` for 2026-08-10 while `energy.csv` counted
 * **774** for the same session and built the day's 1,361 deficit from it; on 08-12, 1,185 against
 * 784. **1,328 is the exact number `decisions.md` records as corrected away on 2026-08-12** — the
 * intensity-split fix landed in one of the two files and the other kept the pre-fix answer. If the
 * athlete ate back what the screen said he had earned he was 554 kcal over, on a plan whose whole
 * daily deficit is ~600.
 *
 * The precedence, highest first — `data/METHOD.md`, `training.csv`:
 *
 *   1. **`kcal_override`** — a device reading, or a recalibration recorded with a reason. Always
 *      wins. The bike knows what the bike did.
 *   2. **The intensity split** — `light_min` / `moderate_min` / `hard_min`, each costed at its own
 *      tier MET and summed. Added 2026-08-12 because a flat MET over the whole session assumes it
 *      ran at its hardest tier for its entire duration, which is wrong for almost every real
 *      class.
 *   3. **The flat MET over `duration_min`** — the original model, still correct for a session that
 *      really was near one intensity throughout.
 *
 * `metOf(type, tier)` is the caller's, and that is the seam: `scripts/lib/athlete.mjs` supplies
 * this chart's tables for the ledger, and `src/lib/forecast.ts` supplies the same tables plus the
 * weekly template's **pinned** MET for a day that has not happened. One precedence, three callers,
 * no fourth copy of `MET × 3.5 × kg / 200`.
 *
 * **Status is deliberately NOT considered here.** "Only completed sessions burn" is the ledger's
 * question and `sessionBurns()` below is its one answer; the forecast asks a different one, since
 * costing a *planned* session is the entire job of the Next 7 Days view.
 *
 * Returns, always — never a bare number:
 *   `kcal`     the figure, or **null** when it cannot be known (X-1: a session with no duration on
 *              file costs an UNKNOWN amount, not a zero one)
 *   `level`    `override` · `split` · `flat` · `counted-elsewhere` · `unknown`
 *   `met`      the flat MET used, for `flat` and `counted-elsewhere`; null otherwise
 *   `segments` `[{ tier, minutes, met, kcal }]` for `split`; empty otherwise
 *   `explain`  one line naming the inputs, so no surface has to render a bare estimate
 */
export function sessionCost(row, weightLb, metOf) {
  const type = row?.type ?? null
  const at = weightLb == null ? '' : ` at ${weightLb} lb`

  const override = n(row?.kcal_override)
  if (override != null) {
    return {
      kcal: override,
      level: 'override',
      met: null,
      segments: [],
      explain: `recorded on the row as kcal_override — a device reading or a logged recalibration, `
        + `which wins over the MET model (data/METHOD.md)`,
    }
  }

  const mins = Object.fromEntries(INTENSITY_TIERS.map((t) => [t, n(row?.[`${t}_min`])]))
  if (INTENSITY_TIERS.some((t) => mins[t] != null)) {
    const segments = INTENSITY_TIERS
      .filter((t) => (mins[t] ?? 0) > 0)
      .map((tier) => {
        const met = metOf(type, tier)
        return { tier, minutes: mins[tier], met, kcal: sessionKcal(met, mins[tier], weightLb) }
      })
    // A split whose every tier is zero minutes is a split that says nothing; fall through rather
    // than returning a confident 0 for a session that plainly happened.
    if (segments.length) {
      return {
        kcal: sumOrNull(segments.map((s) => s.kcal)),
        level: 'split',
        met: null,
        segments,
        explain: segments.map((s) => `MET ${s.met} × ${s.minutes} min ${s.tier}`).join(' + ') + at,
      }
    }
  }

  const met = metOf(type, null)
  const duration = n(row?.duration_min)

  // A MET of exactly 0 is a statement, not a gap: walking's energy is already inside `steps_kcal`
  // and counting it again is the double-count trap METHOD.md warns about. The day's total is
  // COMPLETE without it, which is why this is tagged apart from `unknown` below — collapsing the
  // two is what let a day's total read as a confident figure with a session missing from it.
  if (met === 0) {
    return {
      kcal: null,
      level: 'counted-elsewhere',
      met: 0,
      segments: [],
      explain: 'counted in steps, never as a session — the double-count trap (data/METHOD.md)',
    }
  }

  if (met == null || duration == null) {
    return {
      kcal: null,
      level: 'unknown',
      met,
      segments: [],
      explain: met == null
        ? `no MET on file for type "${type}"`
        : 'no duration on file — an unknown cost, not a zero one',
    }
  }

  return {
    kcal: sessionKcal(met, duration, weightLb),
    level: 'flat',
    met,
    segments: [],
    explain: `MET ${met} × ${duration} min${at}`,
  }
}

/**
 * Whether a training row burned anything into the LEDGER. Planned and skipped sessions did not.
 *
 * One home for the same reason as the precedence above: `compute-energy.mjs` filtered on it and
 * `build-data-json.mjs` re-tested it inline, so "which sessions count" was two expressions that
 * happened to agree. The forecast deliberately does not use this — it costs sessions that have not
 * happened, which is its whole purpose.
 */
export const sessionBurns = (row) => row?.status === 'completed'

/**
 * Percent of a target, or null when the question does not have an answer.
 *
 * A zero target is legal (`fibre_g: 0`, `fat_g: 0` both validate), and dividing by it rendered
 * `18 / 0 g · 18 over · Infinity%` on the Today tab (audit F-68). `Infinity%` is not a number that
 * is wrong — it is a number that is nonsense, printed with the same confidence as a real one.
 */
export function pctOfTarget(actual, target) {
  if (actual == null || target == null) return null
  if (!Number.isFinite(actual) || !Number.isFinite(target) || target === 0) return null
  return (actual / target) * 100
}

/**
 * Why a planned item has no kcal figure. The two reasons are not interchangeable.
 *
 *   `counted-elsewhere` — a walk. Its MET is 0 ON PURPOSE, because its energy is already in
 *                         `steps_kcal`; counting it again is the double-count trap METHOD.md
 *                         warns about. The day's total is complete without it.
 *   `unknown`           — no MET on file for the type, or no duration planned. The day's total is
 *                         missing a real cost and must say so.
 *
 * Collapsing these into "kcal is null" is what let a day's Total read as a confident figure while
 * silently omitting a session.
 */
export const ABSENT_COUNTED_ELSEWHERE = 'counted-elsewhere'
export const ABSENT_UNKNOWN = 'unknown'

/**
 * A planned day's movement total, and whether it covers everything on the day.
 *
 * `total` is null only when nothing on the day could be costed at all. `partial` is the flag: a
 * number is still returned, because "steps + the daily block" is worth knowing, but the surface
 * must mark it rather than print it as the day's cost.
 */
export function plannedTotal(items) {
  const costed = items.filter((i) => i.kcal != null)
  return {
    total: costed.length ? costed.reduce((a, i) => a + i.kcal, 0) : null,
    partial: items.some((i) => i.kcal == null && i.kcalAbsence === ABSENT_UNKNOWN),
  }
}

/**
 * The fraction of a day elapsed at a given local hour and minute, 0–1.
 *
 * ⚠ **IT CANNOT REACH 1.** The maximum is 1439/1440 = 0.99930555…, at 23:59. That is not a
 * rounding artefact, it is the definition: the day is not over until it is over.
 *
 * This is the producible domain the reachability check in `scripts/test-aggregations.mjs` is built
 * from. `today/page.tsx` guarded its "the day is finished" branch with `elapsed >= 1`, which never
 * fired — so the tile said "N% of the day elapsed · full day projects to…" at 23:59 as well as at
 * 06:00 — and `test-views.mjs` asserted `partialBurn(e, [], 1)`, an input production cannot
 * generate, thereby certifying a branch that never runs (audit F-55, INVARIANTS.md X-10).
 */
export const MINUTES_PER_DAY = 1440
export const dayFraction = (hour, minute) =>
  Math.min(1, Math.max(0, (hour * 60 + minute) / MINUTES_PER_DAY))

/** Every value `dayFraction` can actually produce over a real day, ascending. */
export const dayFractionDomain = () =>
  Array.from({ length: MINUTES_PER_DAY }, (_, m) => dayFraction(Math.floor(m / 60), m % 60))
