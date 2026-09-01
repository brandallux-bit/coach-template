/**
 * Typed surface over the session table's grouping and its three states.
 *
 * The implementation lives in `scripts/lib/session-table.mjs` — same arrangement as `aggregate.ts`
 * over `aggregate.mjs`, and for the same reason: `scripts/test-session-table.mjs` runs the code
 * this page runs rather than a hand-written mirror of it. The states here are exactly where a
 * mirror drifts, because each one is right on a different day.
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore - plain ESM, shared with scripts/ on purpose: one implementation, two consumers
import * as st from '../../scripts/lib/session-table.mjs'

export type Row = Record<string, string>

export type PerformedGroup = {
  /** The name it was PERFORMED under — never the prescription's, if the two differ. */
  exercise: string
  /** Its sets, in written order. */
  sets: Row[]
  /** The prescription row this group CLAIMED, or undefined — rendered, not hidden. */
  rx?: Row
  /**
   * True when the name matched several prescribed movements and none of them exactly. The group
   * claims none of them and every candidate stays outstanding: an ambiguous match must not remove
   * a prescribed movement from the sheet, because a removal reads as "done".
   */
  ambiguous?: boolean
  /**
   * Sets logged against `rx` ACROSS ALL groups claiming it. Two spellings of one movement are two
   * groups sharing one prescription; each counting its own shortfall against the full prescribed
   * total is how a finished session reported "1 set left" beside "2 set left" with all three done.
   */
  setsAgainstRx: number
}

export type SessionTable = {
  performed: PerformedGroup[]
  /** Still to do, as rows with their load and rep target. Empty once the session is closed. */
  remaining: Row[]
  /** Prescribed and never logged, for the one sentence a closed session may print. */
  notDone: Row[]
  /** Whether the day's decision about this session has been made — completed, skipped or rest. */
  closed: boolean
}

// `as`, not an annotation: the .mjs default parameters infer as `never[]`, so an annotation makes
// every real call an error. Same cast `weekEnergy` uses in aggregate.ts, for the same reason.
export const sessionTable = st.sessionTable as (args: {
  sets: Row[]; rx: Row[]; status: string
}) => SessionTable

/**
 * Sets still owed against a group's prescription — `0` when it is met or there is no prescription.
 *
 * Here rather than inline in the page because it is the same arithmetic the "N sets left"
 * annotation and any future surface would each write out, and because it is the fix for two groups
 * reporting separate shortfalls against one row: it reads `setsAgainstRx`, never `sets.length`.
 */
export const setsLeft = (g: PerformedGroup): number =>
  Math.max(0, (Number(g.rx?.sets) || 0) - g.setsAgainstRx)
