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
  /** The prescription the advisory matcher found, or undefined — rendered, not hidden. */
  rx?: Row
}

export type SessionTable = {
  performed: PerformedGroup[]
  /** Still to do, as rows with their load and rep target. Empty once the session is finished. */
  remaining: Row[]
  /** Prescribed and never logged. Empty until the session is finished. */
  notDone: Row[]
}

// `as`, not an annotation: the .mjs default parameters infer as `never[]`, so an annotation makes
// every real call an error. Same cast `weekEnergy` uses in aggregate.ts, for the same reason.
export const sessionTable = st.sessionTable as (args: {
  sets: Row[]; rx: Row[]; finished: boolean
}) => SessionTable
