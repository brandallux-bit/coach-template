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
 * `clockDriven` is the proration rule, not a display hint: resting metabolism, background NEAT and
 * incidental movement accrue with the clock, so a day in progress holds a fraction of them. The
 * others exist only once the meal, the feed or the session has been logged, so they are
 * accrued-to-date by construction.
 *
 * ⚠ **TWO OF THESE ARE ONE SLOT.** `steps_kcal` and `incidental_kcal` are alternative fillings of
 * the same term in the decomposition — a counted day versus a described one — and **exactly one of
 * them is ever non-blank on a well-formed row.** A chart with a wearable feed writes the first and
 * leaves the second blank forever; a chart without one does the reverse. They are marked
 * `movement: true` and `missingBurnComponents` reads the PAIR, which is what lets both
 * configurations reach `complete = y` without any consumer knowing which one it is looking at.
 */
export const BURN_COMPONENTS = [
  { column: 'rmr_kcal', label: 'resting metabolism', clockDriven: true },
  { column: 'neat_other_kcal', label: 'background movement', clockDriven: true },
  { column: 'tef_kcal', label: 'the thermic effect of food', clockDriven: false },
  { column: 'steps_kcal', label: 'daily movement outside sessions', clockDriven: false, movement: true },
  { column: 'incidental_kcal', label: 'daily movement outside sessions', clockDriven: true, movement: true },
  { column: 'session_kcal', label: 'session burn', clockDriven: false },
]

/**
 * The movement pair, and the column reported when NEITHER of them is present.
 *
 * ⚠ **ONE LABEL FOR BOTH, WHICH IS THE USER-VISIBLE HALF OF THIS FIX.** Before this, a chart with
 * no wearable was told every day, forever, that *"the step count"* was missing from its burn — an
 * input it never had and was never going to have. The label now names the SLOT rather than one way
 * of filling it, so it is true in both configurations, and the findings layer names the cause: a
 * feed that has stopped arriving is `WORKFLOW_FEEDS`, an unanswered movement question is the
 * provenance finding. A second marker for one cause is how a card stops being read.
 */
const MOVEMENT_COLUMNS = BURN_COMPONENTS.filter((c) => c.movement).map((c) => c.column)

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
 * Scale of the harm (F-16): a movement component missing for a whole week can be enough to flip a
 * weekly energy balance from a real deficit to an apparent surplus. The athlete would reasonably
 * conclude they were eating over maintenance and cut further. No figure is quoted because the size
 * of it is a property of the person, not of the model.
 */
export function missingBurnComponents(energyRow) {
  const present = (column) => energyRow != null && n(energyRow[column]) != null
  // The pair collapses to its first column: reporting both would print one label twice and would
  // claim a chart is missing an input it does not have. See MOVEMENT_COLUMNS above.
  const movementMissing = !MOVEMENT_COLUMNS.some(present)
  return BURN_COMPONENTS
    .filter((c) => (c.movement ? movementMissing && c.column === MOVEMENT_COLUMNS[0] : !present(c.column)))
    .map((c) => c.column)
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
 * A chart that budgets alcohol normally budgets it **inside** the calorie total rather than as a
 * penalty on top, and its bigger day is usually the one the drinking is planned into. So the three
 * figures are one subtraction, not three constants:
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
 * headroom, when they are roughly on pace. That is F-51's shape — a numerator and a denominator
 * covering different day sets — wearing a budget's clothes, and on the surface they open daily.
 *
 * The fix is NOT to shrink the denominator by prorating the weekly total: that invents a number
 * nobody planned. **A weekday budget is deliberately not flat** — the unevenness is the plan, with
 * a bigger day parked where the athlete wants it — so `weekly × 5/7` does not equal the real
 * Monday-to-Friday plan. It overstates it by whatever the weekend was holding, and it does so on
 * the day before the weekend the whole structure exists to protect.
 *
 * So the budget stays the denominator and the week's OWN target rows supply a **pace** figure
 * beside it: `planToDateKcal` is `Σ targets.kcal` over the counted days, which is the plan's own
 * arithmetic and needs nothing invented.
 *
 * **`counted` is days with an intake figure, and the pace is summed over exactly those days** — the
 * same rule as `weekBalance` above and for the same reason. An unlogged Wednesday dropping out of
 * the consumed side while staying in the plan side is the flattering direction, and it is the one
 * mechanism by which this card could quietly show headroom they do not have.
 *
 * **`foodPaceKcal` is the plan through today MINUS what they actually drank.** Alcohol has no per-day
 * allocation on purpose (see `weeklyBudget` and `scripts/generate-targets.mjs`), so there is no
 * planned food line to subtract it from — but there is a measured one, and it says the true thing:
 * every glass is a calorie they do not eat. Null when nothing was drunk *and* nothing was planned.
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
     * (nobody eats linearly through a day, and a chart's biggest day is often an evening one). So
     * on the morning of a big day with breakfast logged, `planToDateKcal` already contains that
     * whole day's target and the gap reads as most of it "under" — which is not headroom banked,
     * it is a day not yet eaten.
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
 * ⚠ **HOW LONG A SESSION TAKES, FROM ITS SET COUNT.** The last rung of the duration resolver, for
 * a session performed but not timed and with no comparable history to average: estimate it from the
 * number of sets, the time a set takes, and the rest between sets.
 *
 *     minutes = (sets × workSec + (sets − 1) × restSec) ÷ 60
 *
 * `restSec` sits between sets, so there are `sets − 1` of them — the last set is not followed by a
 * rest that belongs to this session. One set therefore costs its work and nothing else.
 */
export function minutesFromSets(setCount, workSec, restSec) {
  const sets = n(setCount)
  const work = n(workSec)
  const rest = n(restSec)
  if (sets == null || work == null || rest == null || sets < 1) return null
  return (sets * work + (sets - 1) * rest) / 60
}

/**
 * The work-seconds per set implied by the sessions this athlete HAS timed, given the rest constant.
 *
 * ⚠ **DERIVED FROM THE LEDGER, NOT A NUMBER ANYBODY TYPED.** Same stance as `observedDailyBurn`:
 * the alternative is a literal "about 90 seconds a set" that would be one more coach-invented
 * figure filed as the athlete's (INVARIANTS.md X-12). Every timed session inverts the formula
 * above — `(minutes × 60 − (sets − 1) × restSec) ÷ sets` — and the MEDIAN of those is returned,
 * because on real ledgers a dense conditioning session and a heavy lifting session sit a factor of
 * three apart in seconds per set, and a mean would let either end drag the answer.
 *
 * ⚠ **AND IT IS A WEAK ESTIMATOR — `n` AND `spreadSec` ARE RETURNED SO A SURFACE MUST SAY SO.**
 * Measured on one real chart's timed strength sessions, the regression of duration on set count
 * has an R² of 0.108: set count barely predicts duration, because a set of shallow bodyweight work
 * and a set of heavy cleans are one row each. This is the LAST rung of `resolveSessionMinutes` for exactly that
 * reason — a session with three comparable past durations should never reach it.
 */
export function impliedSetWorkSec(samples = [], restSec = 0) {
  const rest = n(restSec) ?? 0
  const implied = (samples ?? [])
    .map((sm) => ({ min: n(sm?.minutes), sets: n(sm?.sets) }))
    .filter((sm) => sm.min != null && sm.sets != null && sm.sets > 0)
    .map((sm) => (sm.min * 60 - (sm.sets - 1) * rest) / sm.sets)
    .filter((v) => v > 0)
    .sort((a, b) => a - b)
  if (!implied.length) return null
  const mid = Math.floor(implied.length / 2)
  return {
    workSec: implied.length % 2 ? implied[mid] : (implied[mid - 1] + implied[mid]) / 2,
    n: implied.length,
    minSec: implied[0],
    maxSec: implied[implied.length - 1],
    spreadSec: implied[implied.length - 1] - implied[0],
  }
}

/**
 * The chart's OWN mean daily step count, from `steps.csv`. The step twin of `observedDailyBurn`.
 *
 * ⚠ **IT EXISTS BECAUSE THE FORWARD VIEW WAS PRICING STEPS AT THE TARGET.** The movement term on
 * every future day was `stepsPerDayTarget × kcalPerStepPerLb × weight` — the plan, restated as a
 * prediction — while `steps.csv` held weeks of what the athlete actually walks. A target is a
 * decision; a mean of the record is evidence, and on the one burn component that is measured every
 * single day, the forward view has no business preferring the decision. The target stays as the
 * reference line beside it.
 *
 * ⚠ **EVERY ROW ON FILE, NOT A WINDOW.** The caller passes the whole column, so this is the
 * all-time mean and not a trailing one — the same choice `observedDailyBurn` makes, for the same
 * reason: a chart's own history is the best evidence it has, and windowing it would be a second,
 * unexamined opinion about how much of that history still describes the athlete. It also means the
 * figure moves slowly, which for a forward projection is the right direction to be wrong in.
 * `from` and `to` are returned so a surface can say what it covered.
 *
 * `minSteps` is the implausibility threshold PASSED IN by the caller, not restated here: a day the
 * feed truncated to a handful of steps is a broken reading, and averaging it in drags the forward
 * figure down for a week. Below it the row is skipped rather than corrected — a step count nobody
 * confirmed is not this function's to invent.
 *
 * Every row in `steps.csv` is a FINISHED day by construction (the feed writes the previous day's
 * completed total), so there is no in-progress day to exclude here the way `meanOfAccumulating`
 * must.
 *
 * Null on a chart with no feed, which is not a degraded state: that chart's movement term comes
 * from `scripts/lib/movement.mjs` instead, and nothing here is expected to answer.
 */
export function observedDailySteps(stepRows, minSteps = 0) {
  const usable = (stepRows ?? [])
    .filter((r) => n(r?.steps) != null && n(r.steps) >= minSteps)
  if (!usable.length) return null
  const dates = usable.map((r) => r.date).filter(Boolean).sort()
  return {
    meanSteps: meanOrNull(usable.map((r) => n(r.steps))),
    days: usable.length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
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
    /**
     * **How many of those days had a session cost reconstructed rather than recorded.** Above zero
     * means this mean is part estimate, and a surface rendering it owes the reader that — the same
     * contract `estimatedBurnDays` carries one level up. Reported rather than excluded: dropping
     * these days would return null on any chart that rarely times its sessions, which is the whole
     * quantitative half going inert in order to avoid marking a number.
     */
    estimatedDays: complete.filter((r) => r.session_estimated === 'y').length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  }
}

/**
 * ⚠ **THE WEEK'S ESTIMATED CALORIES IN, ESTIMATED CALORIES OUT, AND WHAT THEY PRODUCE.**
 *
 * A week needs an estimated calories in and an estimated calories out to reach its own goal, and
 * both have to be divided across the seven days in a way a coach can defend line by line.
 *
 * ⚠ **BOTH SIDES ARE THE LEDGER WHERE THE LEDGER EXISTS AND THE PLAN ONLY WHERE IT DOES NOT.**
 * That symmetry is the whole point of the pair, and the IN side did not have it: it summed the
 * seven TARGETS and nothing else, so a week already several hundred calories over its budget
 * reported the budget straight back — the plan, restated — while the OUT side beside it was six
 * measured days plus one estimate. The projection underneath divided a gap between a real burn and
 * a hypothetical intake, which is not the week's rate of loss but the rate the plan would have
 * produced.
 *
 * So, per day: a **finished day** contributes what it ate; **today** contributes what it has eaten
 * plus whatever is left of its own target; a **day still to come** contributes its target. A
 * finished day with no meal row is the one impure case — nothing was recorded, so it falls back to
 * the plan and counts as an estimate, because a day nobody logged is not a zero-calorie day (X-1).
 *
 * **THE DIVISION ALREADY EXISTED AND NOTHING HERE INVENTS A NEW ONE.** `plan.kcalByWeekday` is the
 * split, and `validate-data.mjs` already asserts it sums to `weeklyKcalBudget`. Wherever a target
 * is what a day contributes, a written `targets.csv` row wins, because a written row is a
 * deliberate override — a bigger day moved to where the athlete actually wants it that week; a day
 * that has none yet falls back to the same weekday structure the generator would write. Two sources, one division, and `writtenTargetDays` / `structureTargetDays` say which days
 * came from which.
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
 * state. **`estimatedIntakeDays` is the identical contract on the IN side** and exists because that
 * side is now part record and part forecast too; a surface rendering `inKcal` unmarked while it is
 * above zero is claiming the week's food is already eaten.
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
    // `!d.inProgress` as well as the flag, and the conjunction is the point. `complete` means "TEF
    // and steps are present", which can go true HOURS before the day is over — rollup.ts's
    // `inProgress` comment records today's row reading `complete=y` at 10:15 on 16 steps. Trusting
    // it on today would enter a half-finished day's burn into the week as a MEASUREMENT, silently
    // shrinking the out side by most of a day and the projection with it. Today therefore always
    // takes the observed mean, which is a whole-day figure for a day that will be whole.
    const actual = d.energyComplete && !d.inProgress ? n(d.burnKcal) : null
    return actual != null
      ? { kcal: actual, actual: true }
      : { kcal: perDay, actual: false }
  })

  const intakes = days.map((d) => {
    const logged = n(d.intakeKcal)
    const written = n(d.targetKcal)
    const target = written != null ? written : n(weekdayBudget?.[d.weekday])

    // TODAY. What is on the ledger, plus whatever is left of today's target.
    // `Math.max` is the floor that makes it survive a day already over target:
    // eaten + max(0, target − eaten), never eaten minus an overshoot. A day with no target at all
    // is unknowable past this moment, so it nulls the side rather than reporting the floor as a
    // forecast (X-1) — `plan.kcalByWeekday` always answers, so that branch never fires on a chart
    // that has one.
    if (d.inProgress) {
      const kcal = target == null ? null : Math.max(logged ?? 0, target)
      // ⚠ **TODAY IS NEVER A RECORD, AND `kcal === logged` SAID IT WAS THE MOMENT IT WENT OVER.**
      //
      // Once `logged > target` the `Math.max` returns what has been eaten SO FAR — which is a
      // running partial, not a whole-day figure — while the OUT side for today is the observed
      // mean, a whole-day figure by construction. So `gapKcal` divided a whole-day burn by a
      // part-day intake, and reported more loss than the week is heading for.
      //
      // The classification made it invisible: `recorded` went true, `estimatedIntakeDays` went to
      // zero, the tile's badge disappeared and its foot read "a record, not a forecast" on a day
      // hours from over — while the footnote three lines below still said "A projection, not a
      // result". Exactly the contract this file states above, inverted, and only on days the
      // athlete had overeaten.
      //
      // The floor is still right: assuming no further eating is the honest lower bound. What is
      // wrong is calling a lower bound a record. Today is an estimate whatever the number says.
      return { kcal, written: written != null, usesTarget: true, recorded: false }
    }
    // A FINISHED DAY IS WHAT IT ATE, not what it was told to eat. This is the half that was
    // missing: the out side has always used the ledger for finished days, and the in side used the
    // plan for all seven, so a week running over target projected the loss the plan would have
    // produced rather than the one the week is actually heading for.
    if (logged != null) return { kcal: logged, written: false, usesTarget: false, recorded: true }
    // Not logged and not today: a day still to come, or one nobody wrote down. Both are the plan.
    return { kcal: target, written: written != null, usesTarget: true, recorded: false }
  })

  // sumOrNull, not reduce: a single day with no figure must not be silently counted as zero. A
  // week whose out side is incomplete has no out side — that is X-1, and the alternative is a
  // total that looks like a light week rather than a partial one.
  const outKcal = burns.some((b) => b.kcal == null) ? null : sumOrNull(burns.map((b) => b.kcal))
  const inKcal = intakes.some((t) => t.kcal == null) ? null : sumOrNull(intakes.map((t) => t.kcal))
  const gapKcal = outKcal == null || inKcal == null ? null : outKcal - inKcal

  // What the week has ACTUALLY eaten, over every day holding a meal row — today included. Returned
  // beside `inKcal` so the tile can show its own arithmetic: this much is on the ledger, the rest
  // is still plan. Null-skipping is correct here because the question is "what is recorded", not
  // "what did the week total".
  const recordedIntakeKcal = sumOrNull(days.map((d) => n(d.intakeKcal)))

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
    writtenTargetDays: intakes.filter((t) => t.usesTarget && t.written).length,
    /** Days falling back to `plan.kcalByWeekday`. Never a figure this function chose. */
    structureTargetDays: intakes.filter((t) => t.usesTarget && !t.written && t.kcal != null).length,
    /** Calories actually on the ledger this week, across every day holding a meal row. */
    recordedIntakeKcal,
    /** Days holding a meal row at all — the denominator under `recordedIntakeKcal`. */
    recordedIntakeDays: days.filter((d) => n(d.intakeKcal) != null).length,
    /** Days whose IN figure came WHOLLY from the ledger. */
    actualIntakeDays: intakes.filter((t) => t.recorded).length,
    /**
     * **Days whose IN figure is still plan rather than record. Above zero means IN is a forecast.**
     * The in-side twin of `estimatedBurnDays`, and it carries the same obligation: a surface
     * rendering `inKcal` while this is above zero must mark it (X-1).
     */
    estimatedIntakeDays: intakes.filter((t) => !t.recorded).length,
    /** `inKcal − recordedIntakeKcal`: the part of the week's intake nobody has eaten yet. */
    plannedIntakeKcal: inKcal == null ? null : inKcal - (recordedIntakeKcal ?? 0),
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
 * days averaged 7,551 — they would conclude they were 3,300/day behind when they were ~1,450 behind.
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
 * Whether this row's cost will come from the flat-MET rung — i.e. whether `duration_min` matters.
 *
 * ⚠ **IT LIVES HERE BECAUSE THE PRECEDENCE LIVES HERE.** `scripts/lib/session-duration.mjs` has to
 * know whether reconstructing a duration would change anything, and the first version of it
 * answered that by testing `kcal_override` and the tier columns itself. That is the top two rungs
 * of `sessionCost`'s precedence written out a second time, and `scripts/test-single-home.mjs`
 * failed it on the first run — correctly, and for exactly the reason it exists: F-02 is what
 * happens when one file holds the precedence and another holds a piece of it.
 *
 * Deliberately says nothing about MET or duration. A walk's MET of 0 and a missing duration are
 * both decided inside `sessionCost` below; this answers only "does the third rung apply", which is
 * the question a duration resolver is asking.
 */
export const costDependsOnDuration = (row) =>
  n(row?.kcal_override) == null
  && !INTENSITY_TIERS.some((t) => n(row?.[`${t}_min`]) != null)

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
 * athlete ate back what the screen said they had earned they were 554 kcal over, on a plan whose whole
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

/**
 * YYYY-MM-DD shifted by whole days, in UTC arithmetic on a date-only string.
 *
 * Deliberately not `new Date()` on a local clock: every date in a chart is the athlete's local
 * calendar date (data/METHOD.md rule 6) and the caller has already derived `today` correctly via
 * `localToday()`. This only ever moves an already-correct date.
 *
 * ⚠ **IT LIVES HERE, IN THE MODULE THAT IMPORTS NOTHING**, rather than beside its first caller.
 * `anchoredTrend` below needs it too, and a second copy of date arithmetic is the defect class this
 * repo has hit most often. `scripts/lib/recent-work.mjs` re-exports it under the name its own
 * callers already use.
 */
export function shiftDate(iso, deltaDays) {
  const [y, m, d] = String(iso).split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + deltaDays * 86400000
  const out = new Date(t)
  return `${out.getUTCFullYear()}-${String(out.getUTCMonth() + 1).padStart(2, '0')}-${String(out.getUTCDate()).padStart(2, '0')}`
}

/**
 * How many readings a window needs before the figure it produces is FIRM rather than indicative.
 *
 * ⚠ **A WINDOW WITH ONE READING IS STILL A WINDOW.** The earlier rule was that a window needed
 * three readings or it returned nothing at all, which reads as caution and is not: the checks
 * downstream of it include a §5.2 safety ceiling, so a chart whose athlete weighs twice a week
 * had that ceiling silently disabled — the sparser the record, the quieter the safety check, which
 * is exactly backwards. A single reading is a real measurement and is reported; what changes is
 * that the surface says which it is. See `MIN_WINDOW_READINGS` beside it.
 */
export const FIRM_WINDOW_READINGS = 3

/** The floor for a window to exist at all. One: below that there is nothing to average. */
export const MIN_WINDOW_READINGS = 1

/**
 * ⚠ **A TREND AS TWO SMOOTHED LEVELS, NOT A LINE THROUGH EVERY POINT.**
 *
 * Take the mean of the last `windowSize` readings, and the mean of the last `windowSize` readings
 * ending `lagDays` earlier; the rate is the difference over the real gap between them. It answers
 * both halves of a projection with one estimator: `current` is the LEVEL to project from and
 * `perWeek` is the RATE to project at.
 *
 * **WHY THAT MATTERS MORE THAN IT SOUNDS.** The alternative in this repo is `trend()` — a
 * least-squares slope over every reading ever taken — and a page that divides a single latest
 * reading by that slope is using two different estimators for the two halves of one division. A
 * day's water swing then moves the numerator without touching the denominator, and the projected
 * date jumps by weeks on a morning nothing actually changed. This is one estimator and it answers
 * both.
 *
 * ⚠ **UNIT-NEUTRAL ON PURPOSE — IT RETURNS `current` AND `prior`, NOT `currentLb`.** The thing
 * being trended is whatever the caller passed: bodyweight on one chart, a waist measurement, a
 * symptom score, hours of sleep. A field named for pounds is a shared function asserting one
 * athlete's units (INVARIANTS.md X-11), and the caller already knows the label because it chose
 * the series.
 *
 * ⚠ **THE CURRENT WINDOW CANNOT REACH BACK PAST THE COMPARISON POINT, AND THAT ONE RULE DOES TWO
 * JOBS.** "The last `windowSize` readings" is unbounded in TIME, so on a sparse record it happily
 * averaged a reading from a fortnight ago into "now" — a mean of two things a fortnight apart —
 * and then had nothing left before it to compare against, so the whole trend returned null and the
 * chart said it could not tell. Capping the current window at `priorEnd` fixes both, and it also
 * makes the two windows DISJOINT for free: everything in `current` is strictly after `priorEnd`
 * and everything in `prior` is at or before it, so no reading can be counted on both sides
 * dragging the means toward each other and understating the rate.
 *
 * An earlier version carried a separate `before` argument for that second job. It was dead —
 * verified over ~158,000 generated cases, zero differences with it removed — and a rule that can
 * never fire is a rule a reader has to disprove before they can trust the one that does.
 *
 * `points` are `{ date, value }`, in any order. Returns null when there is nothing to compare.
 */
export function anchoredTrend(points = [], { asOf = null, windowSize = 3, lagDays = 10 } = {}) {
  // ⚠ **`Number.isFinite`, NOT `!= null`.** `n('y')` is `NaN`, and `NaN != null` is true — so a
  // non-numeric reading survived this filter, was dropped later by `meanOrNull`, and still counted
  // toward `currentReadings`/`priorReadings` and toward the date centroid. A window of three flags
  // and one number reported three readings and a mean of one. Unreachable through `weight_lb`,
  // which the validator keeps numeric — and directly reachable through the metric series this
  // function's own docstring advertises, where `y`/`n` is a legitimate value.
  const clean = (points ?? [])
    .filter((p) => p?.date && Number.isFinite(n(p.value)))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (!clean.length) return null

  const end = asOf ?? clean[clean.length - 1].date
  const priorEnd = shiftDate(end, -lagDays)

  // "The next date prior" is exactly `<=` on a sorted list: a window anchors at the newest reading
  // that is not after its own date and walks backwards from there.
  const windowEndingAt = (date) => {
    const upTo = clean.filter((p) => p.date <= date)
    return upTo.slice(Math.max(0, upTo.length - windowSize))
  }

  /**
   * ⚠ **THE CURRENT WINDOW CANNOT REACH BACK PAST THE COMPARISON ITSELF.** "The last `windowSize`
   * readings" is unbounded in TIME, so on a sparse record it happily averaged a reading from two
   * weeks ago into "now" — and then had nothing left before it to compare against, so the whole
   * trend returned null and the chart said it could not tell. Both halves were wrong: the mean was
   * of two things a fortnight apart, and the answer was silence on a record that plainly showed
   * movement. The current window is the last `lagDays`, at most `windowSize` readings deep.
   */
  const current = windowEndingAt(end).filter((p) => p.date > priorEnd)
  if (current.length < MIN_WINDOW_READINGS) return null
  const prior = windowEndingAt(priorEnd)
  if (prior.length < MIN_WINDOW_READINGS) return null

  const meanValue = (w) => meanOrNull(w.map((p) => n(p.value)))
  // The centroid of each window's DATES, so the gap is the distance between the two things
  // actually being compared rather than between their newest members.
  const centroid = (w) => meanOrNull(w.map((p) => Date.parse(`${p.date}T12:00:00Z`)))

  const currentValue = meanValue(current)
  const priorValue = meanValue(prior)
  const gapDays = (centroid(current) - centroid(prior)) / 86_400_000
  if (!(gapDays > 0)) return null

  const perDay = (currentValue - priorValue) / gapDays
  return {
    /** The smoothed level — what a projection starts from, never a single morning's reading. */
    current: currentValue,
    prior: priorValue,
    perDay,
    perWeek: perDay * 7,
    /** The REAL gap between the window centroids, not `lagDays`: a sparse record drifts. */
    gapDays,
    /** How many readings each window found. Below `FIRM_WINDOW_READINGS` is legal and renderable. */
    currentReadings: current.length,
    priorReadings: prior.length,
    /** False when either window is thin. The figure still stands; the surface must say which. */
    firm: current.length >= FIRM_WINDOW_READINGS && prior.length >= FIRM_WINDOW_READINGS,
    currentFrom: current[0].date,
    currentTo: current[current.length - 1].date,
    priorFrom: prior[0].date,
    priorTo: prior[prior.length - 1].date,
    windowSize,
    lagDays,
  }
}

/**
 * The anchored comparison this record can actually support — the configured one where it exists,
 * otherwise the widest shorter one that does.
 *
 * ⚠ **FOR A SAFETY CHECK, "THE RECORD IS TOO SPARSE FOR THE CONFIGURED LAG" MUST NOT MEAN SILENCE.**
 * `anchoredTrend` returns null when nothing predates the comparison point, which is right for a
 * PAGE: a chart that asked for a 10-day comparison and cannot make one should say TBD rather than
 * quietly answer a different question. It is wrong for the §5.2 ceiling, where silence on a sparse
 * record is the same defect as the three-reading minimum that came before it — the quieter the
 * chart, the quieter the safety check.
 *
 * So the caller that cannot afford silence walks the lag down and takes the first comparison the
 * readings support. Every result carries its own `gapDays`, so nothing is hidden by doing this:
 * the figure says what it was measured over, and a caller that wanted exactly `lagDays` uses
 * `anchoredTrend` directly.
 *
 * `minGapDays` is the floor below which a difference stops being a trend and becomes two adjacent
 * mornings. Three days, because two readings a day apart produce a %/week with a 7× multiplier on
 * whatever the scale happened to say.
 */
export function bestAvailableTrend(points = [], { windowSize = 3, lagDays = 10, minGapDays = 3, asOf = null } = {}) {
  for (let lag = lagDays; lag >= minGapDays; lag -= 1) {
    const t = anchoredTrend(points, { windowSize, lagDays: lag, asOf })
    if (t && t.gapDays >= minGapDays) return t
  }
  return null
}
