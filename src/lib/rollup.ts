import {
  COUNTS_TOWARD_FLOOR, allOf, body, eachDate, energy, fractionOfDayElapsed, meals, n, oneOf, plan,
  steps, sumOrNull, targets, today, training, weekStart, weekdayKey, addDays, type Row,
} from './data'
import {
  describeMissing, meanOfAccumulating, meanOfPointReadings, missingBurnComponents,
  observedDailyBurn, partialBurnFrom, weekBalance, weekEnergy, weekIntake, weeklyBudget,
  type PartialBurn, type WeekEnergy, type WeekIntake,
} from './aggregate'

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
  /**
   * Today's alcohol allowance, from `targets.csv`.
   *
   * **Normally absent, and that is the correct state of a fresh chart, not a gap.** A
   * `nutrition/plan.md` will often carry a weekly alcohol figure — but read how such a sentence is
   * written: priced at the athlete's REAL intake rather than a wishful number, off what they said
   * they drink in a typical week. That is an OBSERVATION of current behaviour, not a budget they
   * agreed to hold — and a meter needs a denominator somebody owns. Nothing here invents one
   * (INVARIANTS.md X-16).
   *
   * A coaching session may write a real allowance into a day's row — 2026-08-07 has one, 330
   * against a logged 392 — and on those days the meter renders. On every other day the figure
   * renders with no denominator, which says the true thing: this is what you drank, and nobody has
   * set a line.
   */
  targetAlcoholKcal: number | null
  targetProteinG: number | null
  targetFatG: number | null
  targetFibreG: number | null
  /** energy.csv's WHOLE-DAY figure. On a day still in progress this is a projection, not a fact. */
  burnKcal: number | null
  deficitKcal: number | null
  energyComplete: boolean
  /**
   * True when this row is the athlete's current local date — i.e. the day has not finished, so
   * `burnKcal` and `deficitKcal` describe a day that has not happened yet.
   *
   * Deliberately NOT keyed off `energyComplete`: that flag means "intake and steps are present,"
   * which goes true the moment breakfast is logged, hours before the day is over. Today's row
   * read `complete=y` at 10:15 with 16 steps on the clock.
   */
  inProgress: boolean
  /** Burn accrued so far. Equals `burnKcal` on a finished day; prorated while `inProgress`. */
  burnToDateKcal: number | null
  /** `burnToDateKcal` minus intake so far. Equals `deficitKcal` on a finished day. */
  deficitToDateKcal: number | null
  /**
   * energy.csv columns that are blank on this day, and therefore counted as zero in its burn.
   * Empty on a complete day. See `scripts/lib/aggregate.mjs`.
   */
  missingBurn: string[]
  /**
   * **The one flag a surface renders.** True when the day is OVER and a burn component still never
   * arrived — so `burnToDateKcal` is a floor, the deficit shown is lower than the truth, and a
   * figure derived from it must be marked (audit F-16).
   *
   * A day still in progress is deliberately excluded, and that exclusion is what keeps the marker
   * worth reading. Today's step total does not arrive until tomorrow morning by design, so today
   * is "incomplete" every single day; marking it would put the glyph on the dashboard permanently,
   * which docs/SURFACES.md names as the way an alert stops being read. `inProgress` already has
   * its own marker saying the day is not finished. **On a healthy chart this is never true.**
   */
  burnUnderstated: boolean
  sessions: Row[]
  countedSessions: number
}

export function rollDay(date: string): DayRoll {
  const b = oneOf(body, date)
  const t = oneOf(targets, date)
  const e = oneOf(energy, date)
  const m = allOf(meals, date)
  const sessions = allOf(training, date)

  // A day that IS today has not finished, so energy.csv's whole-day row is a projection. Every
  // consumer that renders a burn figure needs the accrued number instead, or it reports calories
  // the athlete has not spent yet — 1,802 kcal "burned" at 10:15 on 16 steps, as reported
  // 2026-08-13. Only the Today tab used to prorate; History and the weekly rollup did not.
  const inProgress = date === today()
  const partial = inProgress ? partialBurn(date, fractionOfDayElapsed()) : null
  const missingBurn = e ? missingBurnComponents(e) : []

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
    targetAlcoholKcal: n(t?.alcohol_kcal),
    // **Falls back to the plan's own protein floor when no targets row overrides it.**
    // A `targets.csv` row is a day-specific refinement, not the only place a protein target can
    // live — `plan.proteinFloorG` is a standing figure the chart already declares, and a chart
    // that deliberately writes no daily target rows (see `plan.dailyKcalTargetPolicy`) would
    // otherwise render its athlete's one daily process goal with no reference line at all. Not an
    // invented number: it is the floor already on file, used where nothing more specific exists.
    targetProteinG: n(t?.protein_g) ?? plan.proteinFloorG ?? null,
    targetFatG: n(t?.fat_g),
    targetFibreG: n(t?.fibre_g),
    burnKcal: n(e?.burn_total_kcal),
    deficitKcal: n(e?.deficit_kcal),
    energyComplete: e?.complete === 'y',
    inProgress,
    burnToDateKcal: partial ? partial.burnSoFarKcal : n(e?.burn_total_kcal),
    deficitToDateKcal: partial ? partial.deficitSoFarKcal : n(e?.deficit_kcal),
    missingBurn,
    burnUnderstated: !inProgress && missingBurn.length > 0,
    sessions,
    countedSessions: sessions.filter(
      (s) => s.status === 'completed' && COUNTS_TOWARD_FLOOR.has(s.type),
    ).length,
  }
}

/** What a day's burn is missing, in words, for a footnote. Empty when nothing is missing. */
export const missingBurnLabels = (d: DayRoll): string[] => describeMissing(d.missingBurn)

export type { PartialBurn }

/**
 * Today's burn *so far*, rather than energy.csv's whole-day figure.
 *
 * The arithmetic lives in `scripts/lib/aggregate.mjs` (`partialBurnFrom`) so the property suite
 * exercises it directly; this is the row lookup around it. Only RMR and non-step NEAT are prorated
 * by the clock — steps, session and food-thermic burn are accrued-to-date by construction, since
 * they exist only once the feed, the session or the meal has been logged.
 *
 * The returned `missing` list is the honesty contract: absent components count as zero, so the
 * figure is a FLOOR (data/METHOD.md), and the caller is told which inputs were absent rather than
 * being handed a bare number.
 */
export function partialBurn(date: string, fraction: number): PartialBurn {
  return partialBurnFrom(oneOf(energy, date), sumOrNull(allOf(meals, date), 'kcal'), fraction)
}

export type WeekRoll = {
  start: string
  end: string
  label: string
  days: DayRoll[]
  loggedDays: number
  /**
   * **The denominator `intakeKcal`, `burnKcal`, `deficitKcal` and `targetKcal` all share.** A day
   * contributes all of its figures or none of them, so `burnKcal − intakeKcal === deficitKcal`
   * holds by construction (audit F-51). Render this beside them; never recompute it.
   */
  balanceDays: number
  /** Days in the window holding data that could not be balanced — one side of the day was absent. */
  unbalancedDays: number
  intakeKcal: number | null
  targetKcal: number | null
  burnKcal: number | null
  deficitKcal: number | null
  /** True when every counted day is a finished day with every burn component present. */
  complete: boolean
  /** Counted days that are finished and still missing a burn component. Zero on a clean chart. */
  partialDays: number
  avgWeightLb: number | null
  lastWaistIn: number | null
  avgSteps: number | null
  sessions: number
  /**
   * Days clearing `plan.proteinFloorG` and days clearing `plan.proteinAimG`, reported **separately
   * and never as one "protein days hit"** (audit F-29).
   *
   * The floor and the aim are two different quantities — 150 g and 165 g — and both are live: the
   * dashboard graded days on the floor while `goals.md`'s process goal graded them on the aim, so a
   * day between the floor and the aim was simultaneously a hit and a miss and neither surface said which line it meant.
   * The fix is not to pick one. It is to render both, from the two constants that already exist.
   */
  proteinFloorDays: number
  proteinAimDays: number
  proteinDaysLogged: number
  /**
   * Alcohol logged across the week, and how many of its days recorded a figure at all.
   *
   * Rendered with the day count beside it because the two are not separable: a 600 kcal week over
   * two logged days is not a low-drinking week, it is a mostly-unlogged one, and stating the total
   * alone would read as the first. On the chart this was built for, the plan called it the single
   * largest discretionary lever; until W6 the figure was written on every meal row and rendered on
   * no page at all (audit F-38, F-69).
   *
   * **Both fields are read off `intake` below rather than summed again here** — until 2026-08-14
   * they had their own day set (every day in the window), and `intake`'s is days with a meal
   * logged. The two agreed on every row this chart has ever held, because `alcohol_kcal` only ever
   * appears on a `meals.csv` row that also carries `kcal` (METHOD.md rule 3a), but two sums under
   * one name is X-8 whether or not they have diverged yet.
   */
  alcoholKcal: number | null
  alcoholDaysLogged: number
  /**
   * **The week against its budget: food, alcohol and total, over one day set.**
   *
   * Added 2026-08-14 at the athlete's request — *"a weekly target chart, just like the daily, but
   * including alcohol. So each day, I can see where I stand for the day and for the week."*
   * `budget.food` is DERIVED (`total − alcohol`) and exists nowhere else; the pace figures are what
   * stop a week-to-date total read against a full-week budget from flattering them. See
   * `scripts/lib/aggregate.mjs`.
   */
  intake: WeekIntake
  /**
   * **The week's estimated calories in, estimated calories out, and what they produce.**
   *
   * The ask this answers: a weekly rate goal needs an estimated calories-in and calories-out that
   * would achieve it, divided sensibly across all seven days — not a figure for the days that
   * happen to be logged so far.
   *
   * ⚠ **ITS DAY SET IS ALL SEVEN DAYS, WHICH IS THE OPPOSITE OF `intake` ABOVE, ON PURPOSE.**
   * `intake` answers "where do I stand *so far*" and is truncated at today; this answers "where
   * does the week *land*", which is a question about days that have not happened. Reading one as
   * the other is the whole hazard, so `estimatedBurnDays` is on the object and every surface that
   * renders `outKcal` or `lossLb` must mark them while it is above zero (X-1).
   */
  energy: WeekEnergy
}

export function rollWeek(start: string, through: string): WeekRoll {
  const end = addDays(start, 6)
  // All seven days, then truncated at `through` for everything else. `weekEnergy` needs the days
  // that have not happened; every other figure on this object is week-to-date by definition.
  const allDays = eachDate(start, end).map(rollDay)
  const days = allDays.filter((d) => d.date <= through)
  const logged = days.filter((d) => d.intakeKcal != null)
  const waists = days.map((d) => d.waistIn).filter((v): v is number => v != null)

  // ONE day set for the whole energy balance. Before this, `sum()` skipped nulls per column, so
  // each column silently picked its own days: a day with steps and a session but no food put its
  // burn into the week's total and its blank deficit into nothing, and the row stopped adding up.
  // burnToDate, not burnKcal: the current week contains today, and summing today's whole-day
  // projection would credit the week with calories that have not been spent yet.
  const balance = weekBalance(days)

  // The FOOD/ALCOHOL/TOTAL split against the weekly budget. Its day set is deliberately not
  // `balanceDays`: that predicate requires a burn figure and a deficit as well, which is right for
  // an energy balance and wrong for "what have I eaten this week" — a day with meals logged and no
  // energy row would drop its calories out of the numerator while the budget kept all seven days,
  // which is the flattering direction. Days with an intake figure, and the plan summed over exactly
  // those days.
  const intake = weekIntake(days, weeklyBudget(plan.weeklyKcalBudget, plan.weeklyAlcoholKcalBudget))

  return {
    start,
    end,
    label: new Date(`${start}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', timeZone: 'UTC',
    }),
    days,
    loggedDays: logged.length,
    balanceDays: balance.balanceDays,
    unbalancedDays: balance.unbalancedDays,
    intakeKcal: balance.intakeKcal,
    targetKcal: balance.targetKcal,
    burnKcal: balance.burnKcal,
    deficitKcal: balance.deficitKcal,
    complete: balance.balanceDays > 0 && balance.partialDays === 0,
    partialDays: balance.partialDays,
    // A weigh-in is a point measurement — today's is as true as it will ever be. Steps accumulate,
    // so today's partial count is excluded rather than averaged in at full weight (audit F-59).
    avgWeightLb: meanOfPointReadings(days, (d) => d.weightLb),
    lastWaistIn: waists.length ? waists[waists.length - 1] : null,
    avgSteps: meanOfAccumulating(days, (d) => d.steps),
    sessions: days.reduce((a, d) => a + d.countedSessions, 0),
    // `?? Infinity` for the same reason as the aim below: a chart with no floor counts zero floor
    // days, not every logged day.
    proteinFloorDays: logged.filter((d) => (d.proteinG ?? 0) >= (plan.proteinFloorG ?? Infinity)).length,
    // `?? Infinity`, not `?? 0`: a chart with no aim on file must count ZERO aim days, not every
    // day. Defaulting the target down is how "hit" quietly becomes "logged".
    proteinAimDays: logged.filter((d) => (d.proteinG ?? 0) >= (plan.proteinAimG ?? Infinity)).length,
    proteinDaysLogged: logged.length,
    // NOT `balanceDays`: a blank alcohol cell means "not recorded", and folding it into the energy
    // balance would make an unrecorded glass look like a measured zero (INVARIANTS.md X-1). The
    // denominator beside it says how much of the week this figure actually covers — and it is now
    // ONE figure shared with the budget card rather than a second sum under the same name.
    alcoholKcal: intake.alcoholKcal,
    alcoholDaysLogged: intake.alcoholDays,
    intake,
    // ⚠ NO SECOND BURN COMPUTATION HERE, and that is the constraint that shaped it. A finished day
    // hands over `energy.csv`'s own figure; a day that has not finished takes the mean of exactly
    // those rows. The IN side is the mirror of that, and was not: a finished day hands over what
    // it ATE, today hands over what it has eaten plus the rest of its target, and only a day still
    // to come hands over a target. Summing seven targets reported the plan back under a label
    // saying "estimated", on a week already over it.
    // Composing a fresh RMR + NEAT + TEF + steps + session estimate for a future day would
    // be a second implementation of the burn model, which scripts/test-single-home.mjs fails.
    // `plan.estMaintenanceKcal` is deliberately NOT the fallback: it is RMR × 1.5 and METHOD.md
    // forbids putting it on the same axis as the decomposed model (audit F-57, ~2,618 kcal/week).
    energy: weekEnergy({
      days: allDays.map((d) => ({
        date: d.date,
        weekday: weekdayKey(d.date),
        burnKcal: d.burnKcal,
        energyComplete: d.energyComplete,
        targetKcal: d.targetKcal,
        // The IN side's ledger, and the flag that stops either side reading today as finished.
        // `intakeKcal` is meals.csv's own sum, the same figure the budget card above renders, so
        // the two cards cannot disagree about what the week has eaten.
        intakeKcal: d.intakeKcal,
        inProgress: d.inProgress,
      })),
      observed: observedDailyBurn(energy),
      weekdayBudget: plan.kcalByWeekday,
      kcalPerLbFat: plan.kcalPerLbFat,
    }),
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
