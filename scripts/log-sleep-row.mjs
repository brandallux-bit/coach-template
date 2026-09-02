#!/usr/bin/env node
/**
 * Merge last night's sleep hours and overnight resting heart rate into `data/body.csv`. Nothing
 * else — `sleep_quality` stays hand-entered (data/METHOD.md, body.csv).
 *
 * WHY THIS IS NOT log-steps-row.mjs WITH A DIFFERENT FILE NAME. That script owns the whole of its
 * row (`date,steps`) and safely replaces it wholesale. `body.csv` is `uniqueDate` too, but it is
 * multi-source: `weight_lb`, `waist_in` and the rest can already be filled in for today from a
 * dashboard write or a coaching session before this job ever runs. Replacing the row would blank
 * them — exactly what `mergeIntoExisting` (scripts/lib/rowwrite.mjs) exists to prevent, and the
 * same function `src/lib/github.ts`'s `commitRow` uses for every dashboard write to this file.
 *
 * Satisfies the three properties `scripts/lib/push-retry.mjs` requires of an `apply`:
 *   • re-runnable from a clean tree — it reads the file it is about to write;
 *   • idempotent — re-running with the same values leaves the file byte-identical;
 *   • order-independent — a merge into a `uniqueDate` row does not care what landed first.
 *
 * Inputs arrive as environment variables, never argv or shell interpolation — see log-steps-row.mjs
 * for why (the payload originates outside this repo, on an iOS Shortcut).
 *
 *   SLEEP_DATE             YYYY-MM-DD, the WAKE day, not "yesterday" — see the date note below
 *   SLEEP_HOURS             a non-negative number, hours asleep
 *   RESTING_HR_OVERNIGHT    a non-negative integer, bpm
 *
 * Both value fields are independently optional: Apple Health may have one and not the other on
 * any given night, and an empty cell here means "not measured," never a zero (data/METHOD.md rule
 * 3). If NEITHER is set, this exits 0 having written nothing — the payload from today's Shortcut
 * may carry only `steps` if it has not been updated yet, and that must keep working unmodified.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THE DATE HAS NO SAME-DAY REFUSAL, UNLIKE steps.csv
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `steps.csv` refuses a payload dated athlete-local today because a step count is a running total
 * that is only complete once the day ends — a same-day count is a partial masquerading as a whole
 * (see that script's header). A night's sleep does not have that shape: it completes when the
 * athlete wakes, which is almost always well before the day is half over, and the athlete's own
 * manual entries already attribute a night's sleep to the date they woke up on. So `SLEEP_DATE`
 * should ordinarily equal `localToday()` at the moment the Shortcut runs — that is the expected
 * case, not a bug to guard against. `validateRow` (scripts/lib/rowwrite.mjs) still rejects a
 * *future*-dated row, same as every other measurement in this chart (data/METHOD.md rule 6); it is
 * simply never asked to reject "today."
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mergeIntoExisting, insertRow, validateRow } from './lib/rowwrite.mjs'

const FILE = join(process.cwd(), 'data', 'body.csv')

const date = process.env.SLEEP_DATE ?? ''
const hours = process.env.SLEEP_HOURS ?? ''
const hr = process.env.RESTING_HR_OVERNIGHT ?? ''

const die = (msg) => { console.error(`::error::${msg}`); process.exit(1) }

if (!hours && !hr) {
  console.log('sleep: no SLEEP_HOURS or RESTING_HR_OVERNIGHT in this payload — nothing to write '
    + '(a steps-only Shortcut run, or a night with neither on file in Apple Health).')
  process.exit(0)
}

if (!date) die('SLEEP_DATE is required whenever SLEEP_HOURS or RESTING_HR_OVERNIGHT is set')
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) die(`SLEEP_DATE must be YYYY-MM-DD, got: ${date}`)
if (hours && !/^\d+(\.\d+)?$/.test(hours)) die(`SLEEP_HOURS must be a non-negative number, got: ${hours}`)
if (hr && !/^\d+$/.test(hr)) die(`RESTING_HR_OVERNIGHT must be a non-negative integer, got: ${hr}`)

if (!existsSync(FILE)) die('data/body.csv does not exist')
const text = readFileSync(FILE, 'utf8')

const row = { date }
if (hours) row.sleep_h = hours
if (hr) row.resting_hr_overnight = hr

const merged = mergeIntoExisting(text, 'body.csv', row)
const errors = validateRow('body.csv', merged)
if (errors.length) die(errors.join(' · '))

const next = insertRow(text, 'body.csv', merged)
if (next === text) {
  console.log(`sleep: ${date} already on file with these values, nothing to write.`)
} else {
  writeFileSync(FILE, next)
  console.log(`sleep: wrote ${date} — `
    + `${hours ? `sleep_h=${hours}` : 'sleep_h unchanged'}, `
    + `${hr ? `resting_hr_overnight=${hr}` : 'resting_hr_overnight unchanged'}`)
}
