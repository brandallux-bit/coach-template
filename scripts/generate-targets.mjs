#!/usr/bin/env node
/**
 * Writes a day's data/targets.csv row from the plan. No AI, no coaching session, no judgement.
 *
 * The day's calorie/macro target is a pure function of `nutrition/plan.md`'s weekday structure
 * and the calendar — there was never anything for a conversation to decide. Until 2026-08-11 it
 * was typed in by hand each morning anyway, which meant the dashboard read "no target set" on any
 * day a session hadn't happened yet. See decisions.md 2026-08-11.
 *
 * ⚠ **`plan.kcalByWeekday` IS THE FALLBACK AND IT ALWAYS ANSWERS. Prose may refine a target; it
 * may never suppress one.** On 2026-08-15 an automated job read the travel protocol in
 * `nutrition/plan.md` — *"a hard calorie ceiling"*, with no file saying what that ceiling is —
 * decided the weekday figure would contradict it, and wrote nothing; the athlete woke up
 * travelling with no target. Nothing in this script was broken. `--fill-gaps` and
 * `scripts/check-targets-gap.mjs` are the class fix; the rule lives in `scripts/lib/targets.mjs`.
 *
 * NEVER overwrites an existing row. A row already on file is a deliberate override — the big
 * social dinner moving off Saturday, a travel day, a planned refeed — and this script is not
 * entitled to an opinion about it.
 *
 * ⚠ **`alcohol_kcal` IS LEFT BLANK ON EVERY ROW THIS WRITES, AND THE 2026-08-14 WEEKLY BUDGET DOES
 * NOT CHANGE THAT** — the budget is weekly *because their drinking is uneven on purpose*, so a
 * seventh of it is a target nobody set. See the comment on the field below.
 *
 * Usage:
 *   node scripts/generate-targets.mjs [YYYY-MM-DD]   one day; defaults to today, athlete-local
 *   node scripts/generate-targets.mjs --fill-gaps    every day from the first row on file through
 *                                                    today that has no row at all. Idempotent, so
 *                                                    the push-retry loop can re-run it verbatim.
 */
import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCsv, toCsv } from './lib/csv.mjs'
import { constants, hasChart } from './lib/athlete.mjs'
import { fillableGaps, noDailyTargetReason } from './lib/targets.mjs'
import { weekdayKey } from './lib/weekdays.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = join(ROOT, 'data', 'targets.csv')
const HEADER = ['date', 'kcal', 'protein_g', 'fat_g', 'fibre_g', 'alcohol_kcal', 'note']

if (!hasChart) {
  console.log('No athlete/constants.json — template repo with no chart yet. Nothing to generate.')
  process.exit(0)
}

// Refuse rather than write numbers the chart's own plan does not want. A chart that opted out has
// no `kcalByWeekday` to generate from, so the only way to produce a row here would be to CHOOSE a
// figure — which is the one thing this generator exists to avoid doing.
// ⚠ **EXIT 0, NOT 1.** This used to exit 1, and `daily-rollover.yml` runs this script every day
// through the push-retry loop — so a chart that had opted out IN WRITING, exactly as the policy
// asks, got a red rollover and a failure email every single morning. Nothing to generate is the
// ordinary state of that chart, not a fault in it.
const optedOut = noDailyTargetReason(constants)
if (optedOut) {
  console.log('This chart runs without daily calorie targets, by policy — nothing to generate:')
  console.log(`  ${optedOut}`)
  console.log('Change plan.dailyKcalTargetPolicy in athlete/constants.json if that is wrong.')
  process.exit(0)
}

const { plan, athlete } = constants

/** Today in the ATHLETE's timezone — never the CI runner's UTC clock (data/METHOD.md rule 6). */
const todayLocal = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: athlete.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

const readRows = () => (existsSync(FILE) ? readCsv(FILE) : [])

/** Writes one day's row, or explains why it did not. Never throws; returns nothing. */
function writeDay(date) {
  const weekday = weekdayKey(date)
  const kcal = plan.kcalByWeekday?.[weekday]

  if (kcal == null) {
    console.error(`::error::plan.kcalByWeekday has no entry for ${weekday}. Nothing written.`)
    process.exit(1)
  }

  // Re-read per day: each write mutates the file, and --fill-gaps writes several in one run.
  const rows = readRows()

  if (rows.some((r) => r.date === date)) {
    console.log(`${date} (${weekday}): row already on file — left untouched.`)
    return
  }

  const row = {
    date,
    kcal,
    protein_g: plan.proteinAimG ?? '',
    fat_g: plan.fatTargetG ?? '',
    fibre_g: plan.fibreTargetG ?? '',
    // ⚠ BLANK ON PURPOSE, AND IT STAYS BLANK NOW THAT A WEEKLY BUDGET EXISTS.
    //
    // ⚠ **WHERE `plan.weeklyAlcoholKcalBudget` IS ON FILE it is the athlete's
    // number, athlete-confirmed. THIS FIELD IS STILL BLANK, and that is the whole design.** The
    // budget is weekly *because the unevenness is deliberate*: a plan that schedules the heavy
    // evening at the weekend, away from the training nights, is not describing seven equal days, so
    // dividing the weekly figure by seven invents a daily number nobody set — one that would mark an
    // ordinary evening as an overage and the planned one as a blow-out. Empty means "no allowance
    // for this day"; a number here would be a target they are measured against, which is X-16's
    // defect wearing arithmetic.
    //
    // A coaching session may still write a real allowance into a day's row, and
    // Today's daily meter renders it where it exists. Where it does not, the daily row shows what was
    // drunk with no denominator and the DENOMINATOR LIVES ON THE WEEKLY CARD, where the budget is.
    // (audit F-38, F-69; INVARIANTS.md X-15 item 3.)
    alcohol_kcal: '',
    note: `${weekday}. Generated from plan.kcalByWeekday (nutrition/plan.md weekday structure). `
      // ⚠ `proteinAimG` IS OPTIONAL. Unguarded, a chart without one wrote the literal string
      // "aim undefined" into the note of every generated row — a fiction in the record, which is
      // the one thing this file exists not to do.
      + `Protein floor ${plan.proteinFloorG}${plan.proteinAimG != null ? `, aim ${plan.proteinAimG}` : ''}. `
      + `Not reviewed by a coaching session — override this row to change it.`,
  }

  // Append the one line rather than reserialising the file. Round-tripping every row through
  // toCsv() rewrites lines it has no business touching — it silently unquoted an unrelated
  // 2026-08-08 note on the first run of this script — and destroys the append-only property that
  // lets two surfaces write the same file without conflicting (data/METHOD.md rule 2).
  // Reserialising is only acceptable for an out-of-order backfill, where the file must be re-sorted.
  const latest = rows.at(-1)?.date ?? ''
  if (date >= latest) {
    const line = toCsv(HEADER, [row]).split('\n')[1]
    appendFileSync(FILE, existsSync(FILE) ? `${line}\n` : toCsv(HEADER, [row]))
  } else {
    console.log(`Backfilling ${date} before ${latest} — re-sorting the file.`)
    rows.push(row)
    rows.sort((a, b) => a.date.localeCompare(b.date))
    writeFileSync(FILE, toCsv(HEADER, rows))
  }

  console.log(`${date} (${weekday}): wrote ${kcal} kcal / ${plan.proteinAimG} g protein `
    + `/ ${plan.fatTargetG} g fat / ${plan.fibreTargetG} g fibre.`)
}

// ROLLOVER_DATE is how daily-rollover.yml passes an override: the push loop in
// scripts/lib/push-retry.mjs re-runs this command verbatim on a lost race, so its inputs travel in
// the environment rather than being interpolated into the command string it re-runs.
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'))
const argDate = process.argv.slice(2).find((a) => !a.startsWith('--'))
const date = argDate || process.env.ROLLOVER_DATE || todayLocal()
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`::error::date must be YYYY-MM-DD, got: ${date}`)
  process.exit(1)
}

// ⚠ **--fill-gaps IS THE GUARANTEE, NOT A CONVENIENCE.** Writing only today's row leaves any day
// a previous run skipped missing forever, and `check-targets-gap.mjs` is a hard error — so a
// single skipped day would wedge every bot's push until a human noticed. It writes only dates with
// NO ROW AT ALL, never over an existing one, so re-running it is a no-op and the push-retry loop
// can replay it verbatim after a lost race. See scripts/lib/targets.mjs.
if (flags.includes('--fill-gaps')) {
  // `date` is always in the set: `targetGaps` starts at the FIRST ROW ON FILE, so on a chart with
  // no targets yet it has no domain and returns nothing — and the rollover job, whose whole
  // purpose is to guarantee today has a row, would write nothing on the one day it matters most.
  // Ascending, so any backfill re-sorts the file before today appends to the end of it.
  const dates = [...new Set([...fillableGaps(readRows(), date), date])].sort()
  for (const d of dates) writeDay(d)
} else {
  writeDay(date)
}
