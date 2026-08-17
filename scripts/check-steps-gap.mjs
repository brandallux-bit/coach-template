#!/usr/bin/env node
/**
 * Fails loudly when yesterday's data/steps.csv row is missing. Runs on a schedule in CI.
 *
 * data/steps.csv is written by an on-device iOS Shortcut automation (log-steps.yml), entirely
 * outside this repo's control. When that automation doesn't fire, the row goes silently missing
 * and nothing here notices until a coaching session happens to catch it — as happened on
 * 2026-08-08 and 2026-08-09 (see logs/2026-08-10.md). This script is the repo-side safety net:
 * a missing row is a CI failure the next morning, not a silent gap a session has to stumble onto.
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCsv } from './lib/csv.mjs'
import { constants, hasChart } from './lib/athlete.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// The template repo has no chart yet, and therefore no timezone to check "yesterday" against.
if (!hasChart) {
  console.log('No athlete/constants.json — template repo with no chart yet. Nothing to check.')
  process.exit(0)
}

/** "Yesterday" in the athlete's own timezone — never the CI runner's UTC clock. */
function yesterdayIn(timeZone) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

const date = yesterdayIn(constants.athlete.timezone)
const stepsPath = join(ROOT, 'data', 'steps.csv')
const steps = existsSync(stepsPath) ? readCsv(stepsPath) : []
const row = steps.find((r) => r.date === date)

if (!row) {
  console.error(`::error::data/steps.csv has no row for ${date} (yesterday in ${constants.athlete.timezone}).`)
  console.error('The on-device Shortcuts automation is the only thing that writes this file — this almost')
  console.error('certainly means it did not fire last night. See logs/2026-08-10.md for the known failure')
  console.error('mode and what to check on the phone. Do not hand-edit this row without confirming the real')
  console.error('total with the athlete first (data/METHOD.md, CLAUDE.md 0.2).')
  process.exit(1)
}

console.log(`data/steps.csv: ${date} = ${row.steps} — present.`)
