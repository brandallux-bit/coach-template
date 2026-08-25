/**
 * ⚠ **A DAY MAY NEVER LACK A CALORIE TARGET.** This module is the one definition of what that
 * means, and it is shared by the check that reports a gap and the generator that closes one.
 *
 * WHY IT EXISTS. On 2026-08-15 an automated pre-dawn job read `nutrition/plan.md`'s travel
 * protocol — *"a hard calorie ceiling"*, with no file anywhere saying what that ceiling is — and
 * concluded that writing the weekday figure would contradict the prose. It recorded the reasoning
 * in `decisions.md` and wrote **nothing**. The athlete woke up travelling with no target, and said:
 *
 *   > "There is ALWAYS a target for every day. That is a bug. … nothing in prose should ever cause
 *   > there to be no daily target unless I explicitly say I don't want any target for this day,
 *   > which I am relatively certain I have never said."
 *
 * `scripts/generate-targets.mjs` was never broken — run by hand it wrote `2026-08-15,2650` from
 * `plan.kcalByWeekday` immediately. **The defect is that prose reasoning was allowed to override a
 * machine-readable structure which had the answer all along.** So:
 *
 *   > **The weekday structure in `athlete/constants.json` is the fallback and it always answers.
 *   > Prose may REFINE a target; it may never SUPPRESS one.** The single exception is an explicit
 *   > instruction from the athlete for a specific day, which has never happened.
 *
 * WHY THIS IS A HARD ERROR AND NOT A FINDING — the layer model in `docs/INVARIANTS.md`. A missing
 * steps row is outside this repo's control, so it can only ever be reported. A missing target row
 * is **fixable by editing the record**: run the generator. It never demands a judgement from
 * anyone, so it cannot pressure a session into inventing a number, which is the trap the commit
 * gate names. Compare `data/energy.csv`'s staleness gate, which has exactly this shape.
 *
 * Pure: takes parsed rows, returns dates. No file IO, no clock of its own.
 */

const DAY_MS = 86_400_000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Anchored at T12:00:00Z like every other date walk in this repo (data/METHOD.md rule 6). */
export const addDays = (iso, days) =>
  new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10)

/**
 * The days between the chart's first target and `throughDate` that have no usable target.
 *
 * Two kinds, and they are deliberately not collapsed, because they have different fixes:
 *
 *   `missing-row` — no row at all for that date. `generate-targets.mjs <date>` closes it, and
 *                   `--fill-gaps` closes every one of them at once.
 *   `blank-kcal`  — a row exists and its `kcal` cell is empty. The generator must NOT touch this:
 *                   a row on file is a deliberate override (data/METHOD.md, `targets.csv`) and
 *                   overwriting one is how a coaching decision gets silently reverted. A human
 *                   fills the cell.
 *
 * **The domain starts at the first row rather than at the baseline**, and that is a stated limit:
 * deleting the earliest rows would shrink the domain and hide a gap. `check-targets-gap.mjs`
 * closes that hole from the other side by refusing a chart whose first *meal* predates its first
 * target — a day he ate against with no target is precisely the defect — and X-4 (append-only)
 * covers the rest. Anchoring on `baseline.date` instead was rejected: the baseline day is a
 * weigh-in taken before the plan existed, and demanding a target for it would make the check green
 * only by rewriting history.
 *
 * A future-dated row is legal (`targets.csv` is a `prescription`) and simply sits outside the
 * domain, which ends at `throughDate`.
 */
export function targetGaps(rows, throughDate) {
  const dated = (rows ?? []).filter((r) => DATE_RE.test(r?.date ?? ''))
  if (!dated.length || !DATE_RE.test(throughDate ?? '')) return []

  const first = dated.reduce((min, r) => (r.date < min ? r.date : min), dated[0].date)
  const byDate = new Map()
  for (const r of dated) if (!byDate.has(r.date)) byDate.set(r.date, r)

  const out = []
  for (let d = first; d <= throughDate; d = addDays(d, 1)) {
    const row = byDate.get(d)
    if (!row) out.push({ date: d, reason: 'missing-row' })
    // Empty means "not measured" everywhere else in this repo (X-1); on a PRESCRIBED row it means
    // nobody said what the day's number is, which is the same hole wearing a row's clothes.
    else if (String(row.kcal ?? '').trim() === '') out.push({ date: d, reason: 'blank-kcal' })
  }
  return out
}

/** The dates `generate-targets.mjs --fill-gaps` is entitled to write: the missing rows only. */
export const fillableGaps = (rows, throughDate) =>
  targetGaps(rows, throughDate).filter((g) => g.reason === 'missing-row').map((g) => g.date)

/**
 * **Does this chart run on daily calorie targets at all?**
 *
 * Returns `null` when it does (the default, and the answer on any chart that has not said
 * otherwise), or the recorded REASON when it deliberately does not.
 *
 * ⚠ **This is not a loophole in "a day may never lack a calorie target", and the difference is
 * the whole point.** That rule exists because an automated job reasoned its way out of writing a
 * target in the moment, wrote nothing, and the athlete woke up travelling with none. What it
 * forbids is a SESSION deciding, ad hoc, that today is an exception. What it cannot sensibly
 * forbid is a chart whose nutrition plan is *built* on not having one — a recomposition phase run
 * on satiety, an eating-disorder history where a number on a screen is itself the risk, a chart
 * whose domains have nothing to do with intake.
 *
 * Two safeguards keep it honest, and both are enforced by the caller:
 *   1. It must be set in `athlete/constants.json` — written down, in the file a session reads
 *      before it speaks, where it can be argued with. Never inferred from an empty budget.
 *   2. It must carry a reason. A policy of "none" with no `_note` is an ERROR, not an opt-out:
 *      the reason is the thing a future session has to be able to disagree with.
 *
 * `check-targets-gap.mjs` skips and says so; `generate-targets.mjs` refuses rather than writing
 * numbers the plan does not want.
 */
export function noDailyTargetReason(constants) {
  const plan = constants?.plan ?? {}
  if (plan.dailyKcalTargetPolicy !== 'none') return null
  const why = plan._dailyKcalTargetPolicy_note
  if (!why || !String(why).trim()) {
    throw new Error(
      'athlete/constants.json: plan.dailyKcalTargetPolicy is "none" but '
      + 'plan._dailyKcalTargetPolicy_note is empty. A chart may opt out of daily calorie targets, '
      + 'but not silently — record why, and who confirmed it.',
    )
  }
  return String(why).trim()
}
