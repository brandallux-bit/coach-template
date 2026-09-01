/**
 * ⚠ **HOW LONG A COMPLETED SESSION TOOK, WHEN THE ROW DOES NOT SAY.**
 *
 * WHY THIS FILE EXISTS. `compute-energy.mjs` costs a session as `MET × 3.5 × kg / 200 × minutes`.
 * With no `duration_min` that returns null, and the ledger then did `?? 0` and summed it into
 * `session_kcal` — so the column held a **zero that looks measured**, which is the one distinction
 * this whole codebase is built to preserve (INVARIANTS.md X-1). `missingBurnComponents` only sees
 * blanks, so it reported nothing missing; `burnUnderstated` stayed false; and `complete` was
 * `tef != null && stepsKcal != null`, which never looked at sessions at all. Whole strength
 * sessions therefore entered `observedDailyBurn` as full measurements while actually being floors.
 *
 * That mean is the input to Estimated out, to the projection under it, and to the budget-versus-goal
 * finding — so the understatement moves an implied rate of loss, and on one real chart it moved it
 * from just over the §5.2 safety ceiling to comfortably under it. A burn model that reads low in
 * the flattering direction is the failure mode worth spending a file on.
 *
 * THE RULE THIS IMPLEMENTS, generically stated: a session that was performed but not timed should
 * be costed at what that session usually takes, and only estimated from its set count when there is
 * no history to average. So the rungs, in order, and each one says which it used:
 *
 *   1. `recorded`      the row has a `duration_min`. Nothing here fires.
 *   2. `comps-prior`   the mean of the last `COMP_WINDOW` timed sessions sharing this session's
 *                      `sessionKey`, strictly before this date. The primary rule.
 *   3. `comps-next`    the mean of the next `COMP_WINDOW` after it, for a gap early enough in the
 *                      series that the history does not exist yet.
 *   4. `prescribed`    a session type whose duration the chart already declares —
 *                      `sessionTypes.<type>.standingDurationMin`, which the forward view already
 *                      costs it at. Not an estimate and not new: it is one figure, finally used on
 *                      both sides so the ledger and the forecast stop disagreeing about it.
 *   5. `from-sets`     `minutesFromSets`, over the sets actually logged that day.
 *   6. `unknown`       none of the above. The cost stays null and the CALLER must keep it out of
 *                      `session_kcal` rather than adding zero — see `compute-energy.mjs`.
 *
 * ⚠ **THE COMPARABLES ARE GROUPED BY `sessionKey`, WHICH IS WHY IT LIVES IN `sessions.mjs`.** A
 * chart writes the same session under several descriptions — the training log describes it, the
 * prescription names it — and treating those as different sessions would leave a gap with fewer
 * comparables than the chart actually holds. A second implementation of that stem would be a second
 * answer to "which durations may fill this gap".
 *
 * ⚠ **A ROW WITH AN OVERRIDE OR AN INTENSITY SPLIT IS NEVER TOUCHED.** `sessionCost`'s precedence
 * is `kcal_override` → per-tier MET over the split → flat MET over duration, and only the third
 * rung reads `duration_min`. Filling a duration into a row whose cost comes from either of the
 * first two would change nothing and would label a measured figure an estimate.
 *
 * Pure: takes rows, returns values. No file IO, no dates of its own.
 */
import { sessionKey } from './sessions.mjs'
import { costDependsOnDuration, impliedSetWorkSec, minutesFromSets, n } from './aggregate.mjs'

/**
 * How many past (or future) timed sessions make an average.
 *
 * Three: the smallest number that survives one atypical session. Real strength sessions of the
 * same name routinely span twenty minutes end to end, so a mean of two can sit ten minutes off the
 * middle of its own range while a mean of three cannot.
 */
export const COMP_WINDOW = 3

/** The rungs, in the order they are tried. Rendered, so nothing prints a bare estimate. */
export const DURATION_LEVELS = [
  'recorded', 'comps-prior', 'comps-next', 'prescribed', 'from-sets', 'unknown',
]

const meanOf = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const round1 = (v) => Math.round(v * 10) / 10

/**
 * Builds the resolver for one chart. Precomputes the per-session duration history once, because
 * `compute-energy.mjs` calls this for every training row of every day.
 *
 * `prescribedMinFor` is a caller-supplied `(row) => minutes | null`. A function rather than a table
 * so the one chart-specific figure on rung 4 stays in the caller's hands: `athlete.mjs` reads
 * `sessionTypes.<type>.standingDurationMin`, and this module owns no chart numbers at all.
 */
export function buildDurationResolver({
  training = [], sets = [], restSec = 0, prescribedMinFor = () => null, compWindow = COMP_WINDOW,
} = {}) {
  // Timed, performed sessions only. A planned row's duration is a schedule, not an observation, and
  // averaging schedules into a ledger figure would quietly make the plan its own evidence.
  const timed = training
    .filter((r) => r?.status === 'completed' && n(r.duration_min) != null && r.date)
    .map((r) => ({ date: r.date, key: sessionKey(r.session), minutes: n(r.duration_min) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const byKey = timed.reduce((m, r) => ((m[r.key] ??= []).push(r), m), {})

  // Every timed session that also logged sets, for the implied work-per-set on rung 5. Derived from
  // the whole ledger rather than per-session: this rung only runs where per-session history is what
  // is missing, so slicing it by session would leave it with nothing to fit.
  const setCountOn = (date, session) => {
    const key = sessionKey(session)
    const day = sets.filter((s) => s?.date === date)
    const exact = day.filter((s) => s.session === session)
    return (exact.length ? exact : day.filter((s) => sessionKey(s.session) === key)).length
  }
  const workFit = impliedSetWorkSec(
    timed.map((r) => ({ minutes: r.minutes, sets: setCountOn(r.date, r.key) })), restSec,
  )

  return function resolveSessionMinutes(row) {
    const recorded = n(row?.duration_min)
    if (recorded != null) {
      return { minutes: recorded, level: 'recorded', basis: 'recorded on the row' }
    }
    // `sessionCost`'s own answer to "does the third rung apply", never a copy of it here — see
    // `costDependsOnDuration` and the ⚠ on the override/split case above.
    if (!costDependsOnDuration(row)) {
      return { minutes: null, level: 'recorded', basis: 'costed without a duration' }
    }

    const key = sessionKey(row?.session)
    const history = byKey[key] ?? []
    const date = row?.date ?? ''

    const prior = history.filter((r) => r.date < date).slice(-compWindow)
    if (prior.length === compWindow) {
      return {
        minutes: round1(meanOf(prior.map((r) => r.minutes))),
        level: 'comps-prior',
        basis: `mean of the last ${compWindow} timed "${key}" sessions `
          + `(${prior.map((r) => `${r.date} ${r.minutes}m`).join(', ')})`,
      }
    }

    const next = history.filter((r) => r.date > date).slice(0, compWindow)
    if (next.length === compWindow) {
      return {
        minutes: round1(meanOf(next.map((r) => r.minutes))),
        level: 'comps-next',
        basis: `backfilled from the next ${compWindow} timed "${key}" sessions `
          + `(${next.map((r) => `${r.date} ${r.minutes}m`).join(', ')})`,
      }
    }

    const prescribed = n(prescribedMinFor(row))
    if (prescribed != null) {
      return {
        minutes: prescribed,
        level: 'prescribed',
        basis: `the ${prescribed} min this chart declares for a "${row?.type}" session — the same `
          + 'figure the forward view costs it at',
      }
    }

    const setCount = setCountOn(date, row?.session)
    if (setCount > 0 && workFit) {
      const minutes = minutesFromSets(setCount, workFit.workSec, restSec)
      if (minutes != null) {
        return {
          minutes: round1(minutes),
          level: 'from-sets',
          basis: `${setCount} sets × ${Math.round(workFit.workSec)}s work + ${setCount - 1} × `
            + `${restSec}s rest — work per set is the median of ${workFit.n} timed sessions `
            + `(${Math.round(workFit.minSec)}–${Math.round(workFit.maxSec)}s), a wide spread`,
        }
      }
    }

    return {
      minutes: null,
      level: 'unknown',
      basis: `no duration, fewer than ${compWindow} timed "${key}" sessions either side, `
        + 'and no sets logged',
    }
  }
}

/**
 * A training row with its reconstructed duration written in, ready for `sessionCost`.
 *
 * Exists so the ledger and the bundle cannot substitute differently — the same shape of defect as
 * F-02, where `compute-energy.mjs` and `build-data-json.mjs` costed one session two ways and the
 * dashboard read 1,328 kcal against a ledger figure of 774. Returns the row untouched when the
 * duration was recorded, or when the cost never depended on one.
 */
export function withResolvedDuration(row, resolved) {
  if (!resolved || resolved.level === 'recorded' || resolved.minutes == null) return row
  return { ...row, duration_min: String(resolved.minutes) }
}
