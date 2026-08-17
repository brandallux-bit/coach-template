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
 * `Daily` dated today would have made them the newest `Daily` set and SILENTLY DELETED the
 * eleven-item knee-rehab block from the Today tab. See `data/METHOD.md`.
 */
export const SUPPLEMENTS = 'Supplements'

/** Every reserved name, in one place, for callers that need the set rather than the members. */
export const RESERVED_SESSIONS = [DAILY, SUPPLEMENTS]
