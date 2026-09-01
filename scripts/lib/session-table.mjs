/**
 * ⚠ **WHAT TODAY'S SESSION TABLE SHOWS: WHAT WAS PERFORMED, AND WHAT IS STILL ON THE SHEET.**
 *
 * WHY THIS FILE EXISTS. The table used to be a row per PRESCRIPTION, with a "sets done" count
 * matched to logged work by name. That shape cannot show what an athlete actually did, for two
 * reasons that are structural rather than incidental:
 *
 *   1. **A missed match costs a ROW, not an annotation.** Every name matcher is fuzzy — a sheet
 *      reads "Pull-ups (band-assisted as needed)" and the log reads "Pull-up (band-assisted)".
 *      When the match fails in a prescription-shaped table, real logged sets vanish from the page
 *      and the prescription renders as `0 / 3 · not started`. The failure mode of a string
 *      comparison must never be the erasure of measured work — and here it was worse than
 *      erasure, because the page then asserted the work had been skipped.
 *   2. **Unprescribed work has nowhere to render.** Anything added on the day — a movement the
 *      sheet never named — appeared on no surface at all, however many sets were logged, because
 *      no prescription row existed to hang it on.
 *
 * So rows come from the SETS, in the order they were performed, and the prescription is looked up
 * FOR each group rather than the other way round. The matcher becomes **advisory**: it decides
 * whether a group gets a "prescribed N × R" annotation and which prescription rows are left over.
 * It can no longer decide whether the work is visible.
 *
 * ⚠ **AND IT IS A MODULE RATHER THAN PAGE CODE SO IT CAN BE TESTED RATHER THAN MIRRORED.**
 * `scripts/test-views.mjs` re-implements the page's logic by hand and says so in its own header;
 * a hand-written mirror of THIS would certify the mirror, and the three states below are exactly
 * where a mirror drifts. Same arrangement, and same reason, as `scripts/lib/aggregate.mjs` under
 * `src/lib/aggregate.ts`.
 *
 * Pure: takes rows, returns rows. No file IO, no dates of its own, no chart.
 */
import { isWorkingItem, sameMovement } from './recent-work.mjs'

/**
 * The three states of a day, and the middle one is the one this card kept getting wrong.
 *
 * Before logging, the table should show what is prescribed; after logging, what was actually done.
 * That is two states — but the day has three, because a session is logged DURING it, not only
 * after. Collapsing every not-yet-done movement into a footnote sentence with no sets, reps or
 * load is exactly wrong mid-session, which is the moment the athlete most needs to know what is
 * left.
 *
 * ⚠ **`finished` COMES FROM THE SESSION'S OWN `status`, NEVER FROM HOW MANY GROUPS ARE LOGGED.**
 * "one of seven logged so far" and "did one thing and stopped" are indistinguishable by count and
 * are completely different sessions. The caller reads `training.csv`; this takes the answer.
 *
 * @param sets      the day's logged sets, already scoped to this session, in written order
 * @param rx        this session's effective prescription rows
 * @param finished  true when a training.csv row for this session says `completed`
 *
 * Returns `{ performed, remaining, notDone }`:
 *   `performed`  one group per exercise, in first-performed order, each with its sets and the
 *                prescription row that matched it (or `undefined` — which the surface renders as
 *                "not prescribed" rather than hiding).
 *   `remaining`  prescription rows still to do, as ROWS with their load and rep target. Empty once
 *                the session is finished.
 *   `notDone`    prescribed and never logged, for the ONE "did not do" sentence a finished session
 *                may print. Empty until it is finished.
 */
export function sessionTable({ sets = [], rx = [], finished = false } = {}) {
  // `sets.csv` is append-only and written in session order, so the file's own order is the
  // session's order and nothing needs sorting.
  const performed = []
  for (const set of sets) {
    if (!set?.exercise) continue
    const group = performed.find((g) => g.exercise === set.exercise)
    if (group) group.sets.push(set)
    else performed.push({ exercise: set.exercise, sets: [set], rx: rxFor(rx, set.exercise) })
  }

  const notLogged = rx.filter((p) => !performed.some((g) => sameMovement(p.exercise, g.exercise)))

  /**
   * ⚠ **SCAFFOLDING IS NEVER REPORTED AS A MISS, AT EITHER END OF THE SESSION.**
   *
   * Charts routinely open and close a session with a warm-up and a cooldown and never log them as
   * sets. Listing them as "not started" reports a convention as a miss — and it is the same
   * judgement in both places: they belong in `remaining` before anything is logged, because they
   * really are the next thing to do; they drop out the moment ANY set exists, because nobody logs
   * a working set before warming up, so "Warm-up — to do" beside completed working sets states
   * the opposite of what happened; and they are never in `notDone`, because a finished session
   * that warmed up unlogged did not skip its warm-up.
   *
   * `isWorkingItem` is the one home for that line — `scripts/lib/recent-work.mjs` draws it for the
   * collision detector too, and a second spelling of "is this real work" is a second answer.
   */
  return {
    performed,
    remaining: finished
      ? []
      : notLogged.filter((p) => !performed.length || isWorkingItem(p.exercise)),
    notDone: finished ? notLogged.filter((p) => isWorkingItem(p.exercise)) : [],
  }
}

/** The prescription row for a performed movement, if the advisory matcher finds one. */
export const rxFor = (rx, exercise) => (rx ?? []).find((p) => sameMovement(p.exercise, exercise))
