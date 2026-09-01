#!/usr/bin/env node
/**
 * Writes data/findings.json — the things the coach needs to know, computed from the chart.
 *
 * This file exists because the system had no channel for "something needs your attention". It
 * had exactly two: a build failure (too loud, and wrong for anything describing reality) and a
 * warning in a CI log (invisible — "46 of 73 sets have no RIR" has been printing for days with
 * no effect). Six separate audit findings — dated follow-ups, workflow failures, day
 * completeness, unrendered metrics, the rehab phase gate, the alcohol budget — are all the same
 * hole: the system computes things nobody ever sees.
 *
 * Derived and deterministic, like data/energy.csv. Regenerate it; never hand-edit it.
 *
 * NOTHING HERE BLOCKS ANYTHING. Exit status is 0 whatever it finds. A finding is information for
 * a conversation, not a gate — see the header of scripts/lib/findings.mjs for why that
 * distinction is load-bearing.
 */

import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFindings } from './lib/findings.mjs'
import { collectFindingsInputs } from './lib/findings-inputs.mjs'
import { constants, hasChart, localToday } from './lib/athlete.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data')
const OUT = join(DATA, 'findings.json')

if (!hasChart) {
  console.log('No athlete/constants.json — template repo with no chart yet. No findings to build.')
  process.exit(0)
}

const findings = buildFindings(
  collectFindingsInputs(ROOT, { constants, today: localToday() }),
)

// asOf is the athlete's local date, not the session's — the whole chart is keyed that way and a
// findings file stamped in UTC would disagree with every row it describes (data/METHOD.md rule 6).
writeFileSync(OUT, `${JSON.stringify({ asOf: localToday(), findings }, null, 2)}\n`)

const bySeverity = findings.reduce((m, f) => ({ ...m, [f.severity]: (m[f.severity] ?? 0) + 1 }), {})
const summary = ['critical', 'attention', 'info']
  .filter((s) => bySeverity[s])
  .map((s) => `${bySeverity[s]} ${s}`)
  .join(', ')

console.log(`data/findings.json: ${findings.length ? summary : 'nothing to report'}`)
for (const f of findings) console.log(`  [${f.severity}] ${f.headline}`)
