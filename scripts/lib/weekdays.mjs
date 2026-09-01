/**
 * **The weekday key, and the only list of them.**
 *
 * WHY THIS FILE EXISTS. `plan.kcalByWeekday` and `program.weeklyTemplate` are both weekday maps,
 * and the key that looks a day up in them was written out FOUR separate times — in
 * `scripts/generate-targets.mjs`, in `src/lib/data.ts`, in `scripts/test-views.mjs`, and inline in
 * `scripts/lib/findings.mjs`. All four happened to agree on `['Sun', 'Mon', …]`, which is why
 * nothing ever went red. What went wrong instead is the half nobody was checking:
 * `athlete/constants.template.json` documented the keys as `mon|tue|wed|thu|fri|sat|sun`, in two
 * separate `_comment` strings, and a new chart that followed its own template's instructions wrote
 * lowercase keys.
 *
 * That chart then passed `validate-data.mjs` — which counted seven numeric entries summing to the
 * weekly budget and never looked at their names — and `generate-targets.mjs` exited non-zero every
 * morning with `plan.kcalByWeekday has no entry for Mon`. So the one rule CLAUDE.md §0.3 and
 * `data/METHOD.md` are most insistent about, **a day may never lack a calorie target**, was broken
 * on day one for anybody who read the documentation. `scripts/test-cold-start.mjs`'s fresh-chart
 * fixture carries `program: {}` and no `kcalByWeekday` at all, so nothing exercised the path.
 *
 * The fix is one home plus a validator that checks the KEYS and not merely their count. A canonical
 * list nothing can disagree with is worth more here than four correct copies, because the copies
 * were never the problem — the prose describing them was, and prose is what a new athlete reads.
 *
 * Pure: no chart, no filesystem, no constants. Safe to import from anywhere, including a
 * chart-less template.
 */

/** The canonical keys, in `Date#getUTCDay()` order. Title case, three letters. */
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * The weekday key for a `YYYY-MM-DD`.
 *
 * ⚠ **NOON UTC, NOT MIDNIGHT.** Parsing at `T00:00:00Z` and reading `getUTCDay()` is stable, but
 * every other date helper in this repo anchors at noon so that a caller who later adds or
 * subtracts hours cannot fall over a DST boundary into the previous day. Keeping the anchor the
 * same everywhere is the point; see `addDays` in `src/lib/data.ts` and `shiftDays` in
 * `scripts/lib/aggregate.mjs`, which both do the same for the same reason.
 */
export const weekdayKey = (iso) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]

/**
 * Whether an object's non-`_` keys are exactly the seven canonical weekdays.
 *
 * Returns `{ ok, missing, unexpected }` rather than a boolean, because the caller has to be able
 * to say WHICH key is wrong: "has 7 weekdays, not 7" is the error that let this through, and
 * "expected Mon, got mon" is the one that ends it.
 */
export function checkWeekdayKeys(map) {
  const keys = Object.keys(map ?? {}).filter((k) => !k.startsWith('_'))
  const missing = WEEKDAYS.filter((d) => !keys.includes(d))
  const unexpected = keys.filter((k) => !WEEKDAYS.includes(k))
  return { ok: missing.length === 0 && unexpected.length === 0, missing, unexpected }
}
