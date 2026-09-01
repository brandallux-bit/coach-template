/**
 * ⚠ **WHAT TODAY'S SESSION TABLE SHOWS: WHAT WAS PERFORMED, AND WHAT IS STILL ON THE SHEET.**
 *
 * WHY THIS FILE EXISTS. The table used to be a row per PRESCRIPTION, with a "sets done" count
 * matched to logged work by name. That shape cannot show what an athlete actually did, for two
 * reasons that are structural rather than incidental:
 *
 *   1. **A missed match costs a ROW, not an annotation.** Every name matcher over free text is
 *      fuzzy — a sheet and a log name one movement two ways, because they are typed independently
 *      with no shared identifier. When the match fails in a prescription-shaped table, real logged
 *      sets vanish from the page and the prescription renders as `0 / 3 · not started`. The
 *      failure mode of a string comparison must never be the erasure of measured work — and here
 *      it was worse than erasure, because the page then asserted the work had been skipped.
 *   2. **Unprescribed work has nowhere to render.** Anything added on the day — a movement the
 *      sheet never named — appeared on no surface at all, however many sets were logged, because
 *      no prescription row existed to hang it on.
 *
 * So rows come from the SETS, in the order they were performed, and the prescription is looked up
 * FOR each group rather than the other way round.
 *
 * ⚠ **AND THE SAME RULE RUNS IN BOTH DIRECTIONS, WHICH THE FIRST VERSION OF THIS FILE GOT WRONG.**
 * It made the matcher advisory for logged work and load-bearing for PRESCRIBED work: a row left
 * `notLogged` only if nothing matched it, so one loose match deleted a prescribed movement from
 * every surface — and a deletion reads as "done". `sameMovement`'s own docstring says
 * *"nothing load-bearing may depend on it"*, and this depended on it. Measured on a real chart,
 * one prescription's three rows shared the incidental phrase "standing on band", so logging the
 * first reported the other two as complete with zero sets against them. That is the same defect as
 * `0 / 3 · not started` with the sign flipped, and flipped in the worse direction: a false "not
 * started" is inspectable, a false silence is not.
 *
 * The rule below is therefore symmetric — **an ambiguous match annotates nothing and removes
 * nothing.** A group that matches two or more prescribed movements, with no exact name in the set,
 * claims none of them: it renders as work whose prescription could not be identified, and every
 * candidate row stays outstanding. Wrong in the inspectable direction, on both sides.
 *
 * ⚠ **KNOWN AND DELIBERATELY NOT FIXED HERE: a COMPOUND prescription row is claimed by matching
 * either half.** `movementTokens` splits "core: side plank + Pallof press" into both movements, so
 * requiring every token to match looks like the fix — but it splits on commas too, so
 * "Band row, standing on band" becomes a movement plus a setup phrase, and demanding both would
 * report finished work as never logged. The tokeniser cannot tell a compound from an aside. Fixing
 * this belongs in the tokeniser or in how a chart writes a compound row, not here.
 *
 * ⚠ **AND IT IS A MODULE RATHER THAN PAGE CODE SO IT CAN BE TESTED RATHER THAN MIRRORED.**
 * `scripts/test-views.mjs` re-implements the page's logic by hand and says so in its own header;
 * a hand-written mirror of THIS would certify the mirror, and the states below are exactly where a
 * mirror drifts. Same arrangement, and same reason, as `scripts/lib/aggregate.mjs` under
 * `src/lib/aggregate.ts`.
 *
 * Pure: takes rows, returns rows. No file IO, no dates of its own, no chart.
 */
import { isWorkingItem, sameMovement } from './recent-work.mjs'

/**
 * Statuses that mean the day's decision about this session has been made.
 *
 * ⚠ **THE ENUM HAS FOUR VALUES AND THE FIRST VERSION READ ONE BIT OF IT** — `=== 'completed'` —
 * so a session the athlete had **skipped** rendered every prescribed row as "· to do", contradicting
 * the record row by row. `rest` did the same. A closed session shows no to-do rows whatever closed
 * it; the CALLER says which word to use, because "not logged" and "skipped" are different
 * sentences about the same list.
 */
export const CLOSED_STATUSES = ['completed', 'skipped', 'rest']

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * The three states of a day, and the middle one is the one this card kept getting wrong.
 *
 * Before logging, the table should show what is prescribed; after logging, what was actually done.
 * That is two states — but the day has three, because a session is logged DURING it, not only
 * after. Collapsing every not-yet-done movement into a footnote sentence with no sets, reps or
 * load is exactly wrong mid-session, which is the moment the athlete most needs to know what is
 * left.
 *
 * ⚠ **`status` IS THIS SESSION'S OWN, NEVER THE DAY'S AND NEVER A COUNT.** The first version took
 * a boolean the page computed as `sessions.some(s => s.status === 'completed')` — an OR across
 * every training row on the day. Charts routinely log a standing daily block as its own row, so
 * nearly every day has two: finishing the short one closed the main one, which had not started —
 * deleting its live prescription and printing "Prescribed, not logged" against work the athlete
 * was in the middle of. Taking the status itself, from the session being rendered, is what makes
 * that unrepresentable rather than merely fixed.
 *
 * @param sets    the day's logged sets, already scoped to this session, in written order
 * @param rx      this session's effective prescription rows
 * @param status  this session's own `training.csv` status; absent/`planned` means still open
 *
 * Returns `{ performed, remaining, notDone, closed }`:
 *   `performed`  one group per exercise, in first-performed order, each with its sets, the
 *                prescription row it claimed (`rx`, or `undefined`), `ambiguous` when the name
 *                matched several prescribed movements and none exactly, and `setsAgainstRx` — the
 *                sets logged against that prescription row ACROSS ALL groups claiming it, so two
 *                spellings of one movement cannot each report their own "sets left".
 *   `remaining`  prescription rows still to do, as ROWS with their load and rep target. Empty once
 *                the session is closed.
 *   `notDone`    prescribed and never logged, for the ONE sentence a closed session may print.
 *                Empty while it is open.
 *   `closed`     whether the day's decision about this session has been made.
 */
export function sessionTable({ sets = [], rx = [], status = 'planned' } = {}) {
  const closed = CLOSED_STATUSES.includes(String(status ?? '').trim())

  // ⚠ **ONLY WORKING ROWS MAY ANNOTATE PERFORMED WORK.** A warm-up row names several movements,
  // and one of them is often something the athlete also does as real work later. Matched, it
  // annotated a working set with the warm-up's dose — a chart's `1 × —` printed against a set of
  // 20. `isWorkingItem` is claimed elsewhere in this file as the one home for that line; this is
  // the call site that was not honouring it.
  const workingRx = rx.filter((p) => isWorkingItem(p?.exercise))

  // `sets.csv` is append-only and written in session order, so the file's own order is the
  // session's order and nothing needs sorting.
  //
  // ⚠ **THE GROUPING KEY IS EXACT, AND THAT IS THE CONSERVATIVE CHOICE.** Grouping by
  // `sameMovement` would fold two spellings into one row and pick one of them to display, which
  // is a claim about what was performed. Two groups sharing one prescription is honest and is
  // handled below, in `setsAgainstRx`.
  const performed = []
  for (const set of sets) {
    if (!set?.exercise) continue
    const group = performed.find((g) => g.exercise === set.exercise)
    if (group) group.sets.push(set)
    else performed.push({ exercise: set.exercise, sets: [set] })
  }

  for (const g of performed) {
    const hits = workingRx.filter((p) => sameMovement(p.exercise, g.exercise))
    // An exact name beats every fuzzy candidate — that is not ambiguity, it is the answer.
    const exact = hits.find((p) => norm(p.exercise) === norm(g.exercise))
    g.rx = exact ?? (hits.length === 1 ? hits[0] : undefined)
    g.ambiguous = !g.rx && hits.length > 1
  }

  // Sets against a prescription row, summed over every group claiming it. Two spellings of one
  // movement inside one session each reported their own shortfall against the FULL prescribed
  // count before this — three of three sets performed, rendered as "1 set left" and "2 set left"
  // on adjacent rows of a finished session.
  for (const g of performed) {
    g.setsAgainstRx = g.rx
      ? performed.filter((o) => o.rx === g.rx).reduce((a, o) => a + o.sets.length, 0)
      : g.sets.length
  }

  // ⚠ **A ROW IS ACCOUNTED FOR ONLY WHEN A GROUP CLAIMED IT** — never merely because something
  // matched it. See the symmetry ⚠ at the top: an ambiguous match leaves every candidate here.
  const claimed = new Set(performed.map((g) => g.rx).filter(Boolean))
  const notLogged = rx.filter((p) => !claimed.has(p))

  /**
   * ⚠ **SCAFFOLDING IS NEVER REPORTED AS A MISS, AT EITHER END OF THE SESSION.**
   *
   * Charts routinely open and close a session with a warm-up and a cooldown and never log them as
   * sets. Listing them as "not started" reports a convention as a miss — and it is the same
   * judgement in both places: they belong in `remaining` before anything is logged, because they
   * really are the next thing to do; they drop out the moment ANY set exists, because nobody logs
   * a working set before warming up, so "Warm-up — to do" beside completed working sets states
   * the opposite of what happened; and they are never in `notDone`, because a closed session that
   * warmed up unlogged did not skip its warm-up.
   */
  return {
    performed,
    remaining: closed
      ? []
      : notLogged.filter((p) => !performed.length || isWorkingItem(p.exercise)),
    notDone: closed ? notLogged.filter((p) => isWorkingItem(p.exercise)) : [],
    closed,
  }
}
