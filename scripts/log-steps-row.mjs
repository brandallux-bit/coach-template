#!/usr/bin/env node
/**
 * Write one day's row into `data/steps.csv`. Nothing else.
 *
 * WHY IT MOVED OUT OF THE WORKFLOW. `log-steps.yml` did this inline in bash, which was fine until
 * the push loop was fixed (audit F-18): the new loop, on a lost race, throws the local attempt away
 * and **re-applies the mutation to whatever is now on `main`**, so the mutation has to be a command
 * something can run again. Inline bash inside the loop's own step is not that.
 *
 * It satisfies the three properties `scripts/lib/push-retry.mjs` requires of an `apply`:
 *
 *   • re-runnable from a clean tree — it reads the file it is about to write;
 *   • idempotent — re-running with the same values leaves the file byte-identical;
 *   • order-independent — the row is keyed by date and the file is sorted by date, so it does not
 *     matter whether this write lands before or after the one that beat it.
 *
 * Inputs arrive as environment variables, never as argv or shell interpolation: the values come
 * from an iOS Shortcut's `client_payload`, i.e. from outside this repo, and `${{ }}` inside a
 * `run:` block is textual substitution into the script itself.
 *
 *   STEPS_DATE   YYYY-MM-DD, the athlete-local date the count belongs to
 *   STEPS_COUNT  a non-negative integer
 *
 * Re-fires for a date already on file overwrite it: the automation can fire more than once, and
 * the later total is the more complete one. A blind append would also break date ordering, which
 * `validate-data.mjs` hard-fails — and a backfill is exactly the case that arrives out of order.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY A SAME-DAY PAYLOAD IS REFUSED, when this layer is forbidden to refuse anything true
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `INVARIANTS.md` is categorical that `data/` and `scripts/` must **never refuse to record
 * something true**, and it is categorical because refusing once already froze the athlete's
 * dashboard for stepping on a scale. So a rejection here needs an argument, not a precedent.
 *
 * The argument is that this is a **fidelity** rule about what the column means, not a judgement
 * about whether the number is wise. `steps.csv`'s `steps` column is defined as *a completed day's
 * total* — that is the whole contract of the feed (`data/METHOD.md`, `steps.csv`), it is what
 * `compute-energy.mjs` multiplies into `steps_kcal`, and it is what makes `complete=y` mean
 * anything. A count taken at 09:56 is a **different quantity**: a running partial, true as a
 * reading and false as a row, because the column it lands in says "total". Writing it is not
 * recording a true thing — it is recording one measurement under another's name.
 *
 * That is the same class as the future-dated-row rejection already in `rowwrite.mjs`: a session
 * clock reading UTC produces a real observation carrying a wrong date, and the row is refused not
 * because the observation is doubted but because the row would misstate what it is.
 *
 * ⚠ **THE BOUNDARY, AND IT MUST NOT WIDEN.** A low but COMPLETED day is true data and is written
 * without argument — a 900-step day after a migraine is a fact, and `data/` records facts. It
 * produces a **finding** for the coach (`scripts/lib/findings.mjs`, `steps-implausible`), which
 * is information for a conversation, and nothing else. Nothing here may ever refuse a row because
 * a number looks wrong; it may refuse a row only because the number is not the thing the column
 * holds. If a future check wants to reject anything else, it is a finding, not a rejection.
 *
 * The evidence this is worth a rejection at all: `git log -p -- data/steps.csv` shows FOUR
 * same-day partials written as totals — 2026-08-09 = 29 (later corrected to 9,620),
 * 2026-08-10 = 466 (corrected to 5,844), 2026-08-13 = 16 (corrected to 9,989). Each one flipped
 * its day to `complete=y` on ~1 kcal of step burn and understated that day's burn by ~400 kcal,
 * in the file every rate-of-loss projection is built on. The escape hatch, for a genuine backfill
 * of today, is a coaching session editing the file directly — the same hatch every other
 * automated writer has.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { localToday } from './lib/athlete.mjs'

const FILE = join(process.cwd(), 'data', 'steps.csv')
const HEADER = 'date,steps'

const date = process.env.STEPS_DATE ?? ''
const steps = process.env.STEPS_COUNT ?? ''

const die = (msg) => { console.error(`::error::${msg}`); process.exit(1) }

if (!date || !steps) die('STEPS_DATE and STEPS_COUNT are both required')
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) die(`STEPS_DATE must be YYYY-MM-DD, got: ${date}`)
if (!/^\d+$/.test(steps)) die(`STEPS_COUNT must be a non-negative integer, got: ${steps}`)

const today = localToday()
if (date >= today) {
  die(`refusing a step count dated ${date}: ${today} is TODAY in the athlete's local timezone, and `
    + `this feed's contract is yesterday's COMPLETED total. A same-day count is a running partial, `
    + `so writing it here would record one measurement under another's name — and it flips the day `
    + `to complete=y on a fraction of its real step burn (data/METHOD.md, steps.csv). This has `
    + `happened four times. Nothing is wrong with the reading; it is the wrong row. Re-fire the `
    + `Shortcut tomorrow, or have a coaching session write the day directly once it is over.`)
}

const text = existsSync(FILE) ? readFileSync(FILE, 'utf8') : `${HEADER}\n`
const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
const header = lines.length && lines[0].startsWith('date') ? lines[0] : HEADER
const body = (lines.length && lines[0].startsWith('date') ? lines.slice(1) : lines)
  .filter((l) => l.slice(0, 10) !== date)

body.push(`${date},${steps}`)
// ISO dates sort lexically, so this is chronological.
body.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

const next = `${header}\n${body.join('\n')}\n`
if (next === text) {
  console.log(`steps: ${date} = ${steps} already on file, nothing to write.`)
} else {
  writeFileSync(FILE, next)
  console.log(`steps: wrote ${date} = ${steps}`)
}
