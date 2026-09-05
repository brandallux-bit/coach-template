#!/usr/bin/env node
/**
 * Is it the athlete's local window right now? The gate the scheduled jobs run before doing
 * anything.
 *
 *   node scripts/local-window.mjs --between 0 4     # due if the local hour is 0, 1, 2 or 3
 *
 * Prints `due=true` or `due=false` with the reason, and appends the same line to `$GITHUB_OUTPUT`
 * when that is set, so a workflow step can key its next step off `steps.<id>.outputs.due`. It
 * always exits 0: "not now" is the ordinary answer five times out of six, not a failure.
 *
 * WHY A GATE AND NOT A PER-CHART CRON. `daily-rollover.yml` writes the day's calorie target and
 * `check-steps.yml` asks whether yesterday's steps arrived. Both used to run on a UTC cron chosen
 * for the timezone this template was extracted from, and a script rewrote the cron line for any
 * other chart. That rewrite lived in `check-all` as a hard error — so a Kolkata athlete's very
 * first commit after intake was refused, the template's own cold-start suite went red on its
 * Lisbon fixture, and every chart's workflow files drifted from the template's. The jobs now run
 * on one sampling cron everywhere — every four hours, six times a day — and this gate says which of
 * those runs is the one. A window four hours wide sampled every four hours lands exactly one run
 * a day inside it for every UTC offset, half-hour and three-quarter-hour zones included.
 *
 * ⚠ **`hi` IS EXCLUSIVE.** `--between 0 4` is hours 0-3. A closed range with four-hour sampling
 * can land two runs on the boundary hour; an open one cannot.
 *
 * Before intake there is no timezone, so nothing is due. That is the same answer every other
 * chart-dependent script gives on the pristine template, and the jobs it gates already exit
 * cleanly there.
 */
import { appendFileSync } from 'node:fs'
import { hasChart, localHourIn, NO_CHART_MESSAGE, constants } from './lib/athlete.mjs'

const argv = process.argv.slice(2)
const i = argv.indexOf('--between')
const lo = Number(argv[i + 1])
const hi = Number(argv[i + 2])
if (i === -1 || !Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || hi > 24 || lo >= hi) {
  console.error('usage: node scripts/local-window.mjs --between <lo> <hi>   (hours, hi exclusive)')
  process.exit(2)
}

/** Pure, and exported for the fixture: is `hour` inside [lo, hi)? */
export const inWindow = (hour, from, to) => Number.isInteger(hour) && hour >= from && hour < to

const say = (due, why) => {
  const line = `due=${due}`
  console.log(`${line} — ${why}`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`)
}

if (!hasChart) {
  say(false, NO_CHART_MESSAGE)
  process.exit(0)
}

const tz = constants.athlete.timezone
const hour = localHourIn(tz)
say(inWindow(hour, lo, hi), `it is ${String(hour).padStart(2, '0')}:xx in ${tz}; the window is ${lo}:00-${hi}:00`)
