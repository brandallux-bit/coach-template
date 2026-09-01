/**
 * ⚠ **HOW MUCH THE ATHLETE MOVES ON AN ORDINARY DAY, WHEN NOTHING COUNTS IT FOR THEM.**
 *
 * WHY THIS FILE EXISTS. The burn model is decomposed — `rmr + tef + neat_other + <movement> +
 * session` — and until now the `<movement>` slot could only ever be filled by `steps_kcal`, which
 * only exists if the athlete owns a wearable, wears it daily, and has built a phone automation
 * that posts to this repo. `SETUP.md` calls that automation optional. It was not optional: with no
 * feed, `steps_kcal` is blank every day, so `complete` is `'n'` every day, so `observedDailyBurn`
 * is null forever, so the OUT side of the weekly energy card, the loss-rate projection and the
 * budget-versus-goal finding all had nothing to read. The template shipped a system whose entire
 * quantitative half was inert for the majority of the people it ships to.
 *
 * ⚠ **AND DROPPING THE TERM IS NOT THE FIX.** On a chart with a real feed the step term runs at
 * roughly a sixth of daily burn. Omitting it does not make the model neutral — it understates burn
 * by that sixth, every day, and every rate projection and safety-ceiling check reads off the
 * understated figure. A missing term is not a conservative term.
 *
 * WHAT THIS IS INSTEAD. The athlete says, in ordinary words, how much they are on their feet on a
 * normal day, and that answer maps to a **step-equivalent** which is then priced with the model's
 * existing `KCAL_PER_STEP_PER_LB`. Three properties, all deliberate:
 *
 *   - It is a **step SUBSTITUTE**, occupying the same slot in the same decomposition. It is never
 *     an `RMR × N` multiplier: `data/METHOD.md` is explicit that a maintenance estimate of that
 *     form already contains all activity, so mixing one into this decomposition double-counts
 *     everything at once.
 *   - It introduces **no new coefficient**. The kcal-per-step figure is the one the model already
 *     documents; a second energy-per-movement constant would be a second answer to one question.
 *   - It scales with **bodyweight**, because the thing it is substituting for does.
 *
 * ⚠ **"OUTSIDE DELIBERATE EXERCISE" IS LOAD-BEARING AND IS NOT PHRASING.** A walk the athlete
 * chose to go on is logged as a session and priced as one. If the level below also covered it, that
 * walk is counted twice — the exact trap `data/METHOD.md` names, arrived at from the other side.
 * Every place this is asked, described or validated repeats the clause, and the constants key is
 * called `movementOutsideExerciseLevel` rather than anything shorter, because the shorter name is
 * the one that gets answered with a total.
 *
 * ⚠ **THE LEVEL IS THE ATHLETE'S; THE NUMBER IS THE COACH'S.** `data/METHOD.md` rule 5 is explicit
 * that a maintenance-shaped figure is `derived` or `external` *even though the coach chose its
 * coefficients*, because the coach's opinion is not what makes it right. So the two halves carry
 * different provenance: the described level is `athlete-stated` and lives in `constants.json`; the
 * kcal figure is derived from it here and is stored nowhere, so there is no second home for it to
 * drift from.
 *
 * Pure: takes values, returns values. No chart, no filesystem, no dates of its own.
 */

/**
 * The described levels, in order, each with the step-equivalent it prices at.
 *
 * ⚠ **THE BANDS ARE PUBLISHED; READING THEM AS "OUTSIDE EXERCISE" IS THE COACH'S.** Tudor-Locke &
 * Bassett's step index (2004) bands a **total** day — under 5,000 sedentary, 5,000–7,499 low
 * active, 7,500–9,999 somewhat active, 10,000+ active. The figures below sit at or under those
 * boundaries on purpose: this term covers only the movement nothing else in the model counts, and
 * a chart that logs deliberate walks as sessions has already priced the rest. Anyone treating these
 * as the index's own numbers is reading them wrong, and the `basis` string every surface renders
 * says which half is whose.
 *
 * Four levels rather than a slider, because the answer is a description and not a measurement, and
 * a slider invites a precision nobody has. `label` is the question's answer in ordinary terms — it
 * is what the athlete picks and what every surface prints back, so it is written in the second
 * person the rest of the dashboard speaks in, and never in anybody's own words: these are the
 * options the system offers, not a quote from the person choosing between them.
 */
export const MOVEMENT_LEVELS = [
  {
    key: 'seated',
    stepEquivalent: 2500,
    label: 'Mostly seated — desk, car, sofa, with only short spells on your feet.',
  },
  {
    key: 'light',
    stepEquivalent: 5000,
    label: 'Up and down through the day — errands, chores, stairs — but nothing sustained.',
  },
  {
    key: 'active',
    stepEquivalent: 7500,
    label: 'On your feet for a good part of the day, or part of the commute on foot.',
  },
  {
    key: 'on-feet',
    stepEquivalent: 10500,
    label: 'On your feet almost all day — the work itself keeps you moving.',
  },
]

export const MOVEMENT_LEVEL_KEYS = MOVEMENT_LEVELS.map((l) => l.key)

/**
 * The level a chart gets when nobody has answered yet.
 *
 * ⚠ **A COACH-PROPOSED DEFAULT, AND IT IS NOT DELETED WHEN UNANSWERED.** The alternative — no term
 * until somebody answers — is the defect this file exists to close, reintroduced as a default. So
 * the chart runs on this figure and `athlete/constants.json` records its class as
 * `coach-proposed-unconfirmed` with a date, which is what puts it in front of the athlete as a
 * question instead of leaving it filed as theirs. Same treatment as the 70-second rest default.
 *
 * `light` rather than the bottom band: the bottom band reproduces most of the understatement this
 * replaces, and a default that is wrong in the direction of "you have burned less than you have"
 * is the one that drives further restriction.
 */
export const DEFAULT_MOVEMENT_LEVEL = 'light'

export const movementLevel = (key) =>
  MOVEMENT_LEVELS.find((l) => l.key === key) ?? null

/**
 * The kcal/day this level prices at, for a bodyweight — or `null` when either input is absent.
 *
 * Null rather than zero, throughout: a chart that has not answered has an unknown movement term,
 * and zero would be a measured claim that they do not move (INVARIANTS.md X-1). The CALLER decides
 * what an unknown term does to the ledger; this returns what it knows.
 */
export function movementKcal(levelKey, weightLb, kcalPerStepPerLb) {
  const level = movementLevel(levelKey)
  if (!level || !(weightLb > 0) || !(kcalPerStepPerLb > 0)) return null
  return level.stepEquivalent * kcalPerStepPerLb * weightLb
}

/** What the figure was built from, for the surfaces that must never print a bare total. */
export function movementBasis(levelKey, weightLb, kcalPerStepPerLb) {
  const level = movementLevel(levelKey)
  if (!level) return 'no movement level on file'
  return `${level.stepEquivalent.toLocaleString()} step-equivalents × ${kcalPerStepPerLb} × `
    + `${weightLb} lb — the movement outside deliberate exercise this chart describes as `
    + `"${level.label}". An estimate from a description, not a count.`
}
