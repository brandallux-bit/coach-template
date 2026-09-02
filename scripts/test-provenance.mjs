#!/usr/bin/env node
/**
 * Fixtures for scripts/lib/provenance.mjs and the provenance finding in scripts/lib/findings.mjs.
 *
 * WHAT THIS PROTECTS. On 2026-08-13 the chart was found holding three numbers the coach had
 * produced and filed as the athlete's: a 185 lb weight ceiling, a 135/85 BP threshold invented to
 * clear a failing check, and a BMI justification in a chart that bans BMI. Their words on the first
 * were "I don't know what that is or where it came from... if I get close to it, I will throw this
 * whole system away and call it a failure." Every other number here can be recomputed; a goal
 * cannot, which is why this is the one file whose corruption is unrecoverable.
 *
 * EVERY CHECK BELOW SHIPS WITH THE INPUT THAT MAKES IT FAIL (INVARIANTS.md X-10). The red fixtures
 * are the `red(...)` cases: each one is a constants object carrying the exact defect the check
 * describes, asserted to be reported. A check that cannot fail certifies the bug.
 *
 * The other half of the contract, asserted first because it is the one that has already been got
 * wrong once here: THIS LAYER NEVER BLOCKS THE ATHLETE. `auditProvenance` may fail a build — every
 * problem it reports is fixable by editing the record. The FINDING may not, ever: the only thing
 * that closes it is the athlete saying something, and a check that cannot go green without a
 * decision the runner does not own is the check that made the coach invent 135/85.
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  auditProvenance, unconfirmedValues, describeValue,
  PROVENANCE_SECTIONS, UNCONFIRMED_GRACE_DAYS,
} from './lib/provenance.mjs'
import { buildFindings } from './lib/findings.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHART = join(ROOT, 'athlete', 'constants.json')

let failed = 0
const ok = (label) => console.log(`ok    ${label}`)
const bad = (label, detail) => { failed++; console.error(`FAIL  ${label}\n      ${detail}`) }

/** A minimal, well-formed chart. Every red fixture below is this with one thing broken. */
const green = () => ({
  baseline: {
    date: '2026-01-01',
    weightLb: 180,
    _provenance: {
      date: { class: 'athlete-stated', asOf: '2026-01-01', measured: 'data/body.csv row 1', source: 'logs/', note: 'Their first weigh-in.' },
      weightLb: { class: 'derived', asOf: '2026-01-01', inputs: 'mean of 5 mornings', source: 'logs/', note: 'Arithmetic on their readings.' },
    },
  },
  plan: {
    proteinFloorG: 150,
    _provenance: {
      proteinFloorG: { class: 'coach-proposed-unconfirmed', asOf: '2026-01-01', source: 'nutrition/plan.md', note: 'The coach set it; they have not ruled on it.' },
    },
  },
  triggers: {
    weightFloorLb: 170,
    _provenance: {
      weightFloorLb: { class: 'athlete-confirmed', asOf: '2026-01-05', quote: 'the floor you set', source: 'decisions.md', note: 'They called it their own.' },
    },
  },
})

/** Break one thing, assert it is reported, and assert the reason names the right key. */
const red = (label, mutate, wantKey) => {
  const c = green()
  mutate(c)
  const problems = auditProvenance(c)
  const hit = problems.some((p) => p.key === wantKey)
  if (hit) ok(`  RED  ${label}`)
  else bad(`  RED  ${label}`, `expected a problem on "${wantKey}", got [${problems.map((p) => `${p.section}.${p.key}`).join(', ') || 'none'}]`)
}

// -------------------------------------------------------------------------------------------
console.log('the green fixture is actually green — otherwise every red case below proves nothing')
const baseline = auditProvenance(green())
if (baseline.length === 0) ok('  a well-formed chart reports no problems')
else bad('  a well-formed chart reports no problems', baseline.map((p) => `${p.section}.${p.key}: ${p.problem}`).join('\n      '))

// -------------------------------------------------------------------------------------------
console.log('red fixtures — each is an input that MUST make the check fail')

red('an unmarked value — the 185 lb ceiling case, a number with no record of who said it',
  (c) => { c.triggers.weightCeilingLb = 185 }, 'weightCeilingLb')

red('a whole section with no _provenance map at all',
  (c) => { delete c.plan._provenance }, '*')

red('a class outside the vocabulary in data/METHOD.md',
  (c) => { c.plan._provenance.proteinFloorG.class = 'probably-fine' }, 'proteinFloorG')

red('athlete-stated with no quote and no measurement — an authorship claim proving nothing',
  (c) => { delete c.baseline._provenance.date.measured }, 'date')

red('athlete-confirmed with no quote — the upgrade the 185 lb ceiling would have needed',
  (c) => { delete c.triggers._provenance.weightFloorLb.quote }, 'weightFloorLb')

red('derived with no inputs — "trust me, it is arithmetic"',
  (c) => { delete c.baseline._provenance.weightLb.inputs }, 'weightLb')

red('a missing asOf, so nothing can tell how long a proposal has gone unanswered',
  (c) => { delete c.plan._provenance.proteinFloorG.asOf }, 'proteinFloorG')

red('a marker with no source — no way to check the claim',
  (c) => { delete c.plan._provenance.proteinFloorG.source }, 'proteinFloorG')

red('a marker with no note — the class alone never says whose number it is',
  (c) => { delete c.plan._provenance.proteinFloorG.note }, 'proteinFloorG')

red('an orphan marker describing a value that has been deleted',
  (c) => { c.plan._provenance.ghostTargetG = { class: 'derived', asOf: '2026-01-01', inputs: 'x', source: 'y', note: 'z' } }, 'ghostTargetG')

// -------------------------------------------------------------------------------------------
console.log('the live chart — every threshold, target and anchor names its source')
const constants = JSON.parse(readFileSync(CHART, 'utf8'))
const live = auditProvenance(constants)
if (live.length === 0) ok(`  ${PROVENANCE_SECTIONS.join(', ')} are fully marked`)
else bad('  the live chart has unmarked or malformed values', live.map((p) => `${p.section}.${p.key}: ${p.problem}`).join('\n      '))

// -------------------------------------------------------------------------------------------
console.log('unconfirmed values become a finding — and only after the grace period')
const chart = (asOf) => ({
  baseline: { date: '2026-01-01', weightLb: 180 },
  plan: {
    stepsPerDayTarget: 9000,
    _provenance: {
      stepsPerDayTarget: {
        class: 'coach-proposed-unconfirmed', asOf, source: 'athlete/goals.md',
        note: 'The coach put it in the process goals at intake; no statement from them is on record.',
      },
    },
  },
})
const findingsFor = (asOf, today) =>
  buildFindings({ constants: chart(asOf), targets: [], body: [], today })
    .filter((f) => f.id.startsWith('provenance-unconfirmed'))

const stale = findingsFor('2026-01-01', '2026-01-20')
if (stale.length === 1) ok('  a 19-day-old coach number is reported')
else bad('  a 19-day-old coach number is reported', `got ${stale.length} findings`)

if (findingsFor('2026-01-01', '2026-01-02').length === 0) ok('  a proposal made yesterday is left in the conversation, not listed')
else bad('  a proposal made yesterday is left in the conversation', 'a one-day-old proposal was reported')

// The grace boundary is inclusive on purpose — see UNCONFIRMED_GRACE_DAYS. Pinned in both
// directions so a future edit cannot quietly widen it and mute the whole mechanism.
const onBoundary = findingsFor('2026-01-01', `2026-01-${String(1 + UNCONFIRMED_GRACE_DAYS).padStart(2, '0')}`)
const dayBefore = findingsFor('2026-01-01', `2026-01-${String(UNCONFIRMED_GRACE_DAYS).padStart(2, '0')}`)
if (onBoundary.length === 1 && dayBefore.length === 0) {
  ok(`  fires at exactly ${UNCONFIRMED_GRACE_DAYS} days, silent at ${UNCONFIRMED_GRACE_DAYS - 1}`)
} else {
  bad(`  the ${UNCONFIRMED_GRACE_DAYS}-day boundary is inclusive`,
    `at ${UNCONFIRMED_GRACE_DAYS} days got ${onBoundary.length}, at ${UNCONFIRMED_GRACE_DAYS - 1} got ${dayBefore.length}`)
}

const confirmed = {
  ...chart('2026-01-01'),
  plan: {
    stepsPerDayTarget: 9000,
    _provenance: {
      stepsPerDayTarget: {
        class: 'athlete-confirmed', asOf: '2026-01-01', quote: 'nine thousand is right',
        source: 'decisions.md', note: 'They ruled on it.',
      },
    },
  },
}
const afterRuling = buildFindings({ constants: confirmed, targets: [], body: [], today: '2026-06-01' })
  .filter((f) => f.id.startsWith('provenance-unconfirmed'))
if (afterRuling.length === 0) ok('  once they rule on it, it stops being asked about')
else bad('  once they rule on it, it stops being asked about', 'still reported after confirmation')

// -------------------------------------------------------------------------------------------
console.log('the contract — this finding reports, names whose call it is, and never instructs them')

// A chart with no markers at all (the template, or a section not yet marked) must produce silence,
// not a crash and not an invented complaint. The audit is what catches a missing marker; the
// findings layer must stay usable on a chart that has not been marked yet.
try {
  const out = buildFindings({ constants: { plan: { proteinFloorG: 150 } }, targets: [], body: [], today: '2026-06-01' })
  if (Array.isArray(out)) ok('  an unmarked chart returns findings rather than throwing')
  else bad('  an unmarked chart returns an array', 'got a non-array')
} catch (e) {
  bad('  an unmarked chart must never throw — this layer cannot block', e.message)
}

const f = stale[0]
if (f && /athlete's decision, not the coach's/i.test(f.action)) ok('  the action says whose decision it is')
else bad('  the action must name the owner of the decision', JSON.stringify(f?.action))

// The failure mode this finding could easily become: the coach reading "they have not ruled on it"
// and resolving it by picking a value, which is the 185 lb ceiling being re-created by the very
// mechanism built to prevent it. Both escape hatches are closed in the text and asserted here.
if (f && /do not delete it/i.test(f.action)) ok('  the action forbids deleting the value to silence the finding')
else bad('  deleting an unconfirmed threshold is the same substitution of judgement as inventing one', JSON.stringify(f?.action))

if (f && /do not describe it back to them as[\s\S]*something they set/i.test(f.action)) {
  ok('  the action forbids presenting the number back as the athlete\'s own')
} else {
  bad('  the finding must forbid re-presenting a coach number as the athlete\'s', JSON.stringify(f?.action))
}

// Shared code must not carry one athlete's pronouns any more than one athlete's numbers
// (INVARIANTS.md X-11). This finding is generated text that reaches a person, so it is checked.
if (f && !/\b(he|him|his|she|her|hers)\b/i.test(`${f.headline} ${f.action}`)) {
  ok('  the generated text carries no athlete-specific pronouns')
} else {
  bad('  X-11: shared code must not hardcode one athlete\'s pronouns', `${f?.headline} | ${f?.action}`)
}

if (f && !/should be|set it to|recommend (?:raising|lowering)/i.test(f.action)) {
  ok('  the action does not tell them what to decide')
} else {
  bad('  the finding must not instruct the athlete', JSON.stringify(f?.action))
}

// -------------------------------------------------------------------------------------------
console.log('the marker is metadata and must never reach a rendering surface')
const { stripNotes } = await import('./lib/athlete.mjs')
const stripped = stripNotes(constants)
const leaked = PROVENANCE_SECTIONS.filter((s) => stripped[s] && '_provenance' in stripped[s])
if (leaked.length === 0) ok('  stripNotes() removes _provenance before the dashboard bundle')
else bad('  _provenance leaked into the stripped bundle', leaked.join(', '))

// -------------------------------------------------------------------------------------------
console.log('value rendering — a threshold that is an object or a range still reads as a sentence')
if (describeValue([1.1, 1.25]) === '1.1-1.25') ok('  a range renders as a range')
else bad('  a range renders as a range', describeValue([1.1, 1.25]))
if (describeValue({ Mon: 1700, Tue: 1750 }) === 'Mon 1700, Tue 1750') ok('  a per-day object renders as its parts')
else bad('  a per-day object renders as its parts', describeValue({ Mon: 1700, Tue: 1750 }))

// -------------------------------------------------------------------------------------------
const unconfirmed = unconfirmedValues(constants)
console.log(`\nprovenance: ${unconfirmed.length} value(s) in the live chart are the coach's and unruled on:`)
for (const v of unconfirmed) console.log(`  ${v.section}.${v.key} = ${describeValue(v.value)} (proposed ${v.asOf})`)

if (failed) { console.error(`\nprovenance: ${failed} check(s) failed.`); process.exit(1) }
console.log('\nprovenance: all checks passed.')
