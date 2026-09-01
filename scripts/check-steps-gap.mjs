#!/usr/bin/env node
/**
 * Fails loudly when yesterday's data/steps.csv row is missing. Runs on a schedule in CI.
 *
 * data/steps.csv is written by an on-device automation (log-steps.yml), entirely outside this
 * repo's control. When that automation doesn't fire, the row goes silently missing and nothing
 * here notices until a coaching session happens to catch it. This script is the repo-side safety
 * net: a missing row is a CI failure the next morning, not a silent gap a session has to stumble
 * onto.
 *
 * ⚠ **IT RUNS ONLY ON A CHART THAT DECLARES A FEED, AND THAT GATE IS THE WHOLE POINT.** It used to
 * guard on `hasChart` alone, so a chart with no wearable — the majority configuration — got
 * `::error::data/steps.csv has no row for <yesterday>` from the daily cron **every morning,
 * forever**, for a file nothing was ever going to write. It is not in `check-all`, so it blocked
 * nothing; it just mailed the owner a failure a day. This repo already states the principle
 * elsewhere: a safety net that false-alarms daily is one its owner learns to ignore. A detector
 * that cannot distinguish "the feed broke" from "there is no feed" is detecting nothing.
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCsv } from './lib/csv.mjs'
import { constants, hasChart, hasStepFeed, stepFeed } from './lib/athlete.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// The template repo has no chart yet, and therefore no timezone to check "yesterday" against.
if (!hasChart) {
  console.log('No athlete/constants.json — template repo with no chart yet. Nothing to check.')
  process.exit(0)
}

// No declared feed, nothing to be late. See the ⚠ at the top: this is the difference between a
// broken automation and a chart that never had one.
if (!hasStepFeed()) {
  console.log('plan.stepFeed is not set — this chart has no step feed, so data/steps.csv is not '
    + 'expected to gain rows. Its movement term comes from plan.movementOutsideExerciseLevel '
    + 'instead (data/METHOD.md). Nothing to check.')
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
  console.error(`This chart declares plan.stepFeed = "${stepFeed()}", and that automation is the only`)
  console.error('thing that writes this file — so this almost certainly means it did not fire last night.')
  console.error('Check the device or schedule that triggers it. Do not hand-edit this row without')
  console.error('confirming the real total with the athlete first (data/METHOD.md, CLAUDE.md 0.2).')
  process.exit(1)
}

console.log(`data/steps.csv: ${date} = ${row.steps} — present.`)
