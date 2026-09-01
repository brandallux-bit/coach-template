/**
 * The reserved session names, in plain ESM so `scripts/` and `src/` share one declaration.
 *
 * WHY IT MOVED HERE (2026-08-14, W6). These two strings had **four** homes: `src/lib/forecast.ts`
 * declared them, `scripts/test-prescriptions.mjs` declared its own `new Set(['Daily',
 * 'Supplements'])`, `scripts/test-views.mjs` regex-parsed them back out of `forecast.ts`, and
 * `check-suspensions.mjs` was about to need a fifth. That is X-8, and it is the same shape as
 * `COUNTS_TOWARD_FLOOR`, which W5 fixed the same way: the dashboard cannot import a module that
 * reads the filesystem, and `scripts/` cannot import TypeScript, so anything both need lives in a
 * plain-ESM file under `scripts/lib/` and the TypeScript re-exports it — the `aggregate.mjs` /
 * `aggregate.ts` and `rowwrite.mjs` / `log-write.ts` precedent.
 *
 * A reserved name is one that is scheduled **by definition**: it runs whatever the weekly template
 * says, so no template entry ever names it and any check asking "what is prescribed today" has to
 * add it back by hand. That is exactly why it needs one home.
 */

/** Work prescribed every day, whatever that day's session is. The knee-rehab block lives here. */
export const DAILY = 'Daily'

/**
 * A second reserved name, for things taken every day that are not movement.
 *
 * ⚠ It is NOT `Daily`, and that is the whole design decision. `effectiveRx` resolves a session to
 * the rows on its single newest date and renders only those — so adding supplement rows under
 * `Daily` dated today would make them the newest `Daily` set and SILENTLY DELETE whatever daily
 * movement block the chart prescribes from the Today tab. See `data/METHOD.md`.
 */
export const SUPPLEMENTS = 'Supplements'

/** Every reserved name, in one place, for callers that need the set rather than the members. */
export const RESERVED_SESSIONS = [DAILY, SUPPLEMENTS]

/**
 * A session name reduced to the part three different files agree on.
 *
 * A chart writes the same session under three conventions, all of them legitimate:
 *   `training.csv`      "Lower A — hinge, squat, carries"   (what happened, described)
 *   `prescriptions.csv` "Lower A"                           (what is prescribed)
 *   `sets.csv`          "Lower A"                           (what was performed)
 * An exact-match lookup across them finds nothing, which would make every prescription and every
 * historical set invisible the moment the coach wrote a descriptive session name. Stripping the
 * parenthetical and everything after a spaced dash leaves the stem the three share.
 *
 * ORDER MATTERS: the parenthetical goes first, or the ` — ` inside a name like
 * "Morning block (Phase 1 — Base)" truncates it mid-parenthesis.
 *
 * It is a fallback and never a first choice — every caller tries the exact name first, and
 * `rxSessionFor` refuses to use it when it is ambiguous.
 *
 * ⚠ **IT LIVES HERE RATHER THAN IN `src/lib/forecast.ts`, WHICH RE-EXPORTS IT.**
 * `scripts/` cannot import TypeScript, and `scripts/lib/session-duration.mjs` needs this stem to
 * group a session's historical durations. A second implementation would be X-8 in the file whose
 * whole job is preventing it: this stem is what decides that two differently-described logs of the
 * same session are comparable durations, so two answers to it is two answers to "how long does
 * that session take".
 */
export const sessionKey = (s) =>
  (s ?? '')
    .toLowerCase()
    .replace(/\s*\(.*$/, '')
    .replace(/\s+[—–-]\s+.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
