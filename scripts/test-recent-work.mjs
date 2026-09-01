#!/usr/bin/env node
/**
 * Fixtures for `scripts/lib/recent-work.mjs` — the "does today repeat yesterday" engine.
 *
 * **INLINE FIXTURES, NOT THE LIVE CHART**, for the reason `test-suspensions.mjs` states: a check
 * that only holds while the chart happens to contain something silently stops holding. The live
 * answer comes from the `session-repeats-recent-work` finding; this file proves the engine can go
 * red once the chart is clean.
 *
 * **The headline case is a real defect, reduced to its rows** — an upper-body circuit proposed the
 * day after a pressing session, sharing five of its six working movements, with nothing anywhere
 * noticing. Every assertion below either reproduces a failure that actually happened on a chart or
 * covers a way the first version of the code got it wrong.
 *
 * The dates and session names here are synthetic. What is real is the SHAPE of each case.
 */
import {
  consecutiveLoadingDays, isWorkingItem, matchKeys, movementTokens, patternIndex, patternOf,
  sameMovement,
  sessionOverlap, shiftDate, workingItems,
} from './lib/recent-work.mjs'
import { isLoadingType } from './lib/athlete.mjs'

let failed = 0
const ok = (name) => console.log(`  ok   ${name}`)
const bad = (name, detail) => {
  failed++
  console.log(`  FAIL ${name}\n       ${String(detail).split('\n').join('\n       ')}`)
}
const yes = (name, cond, detail = '') => (cond ? ok(name) : bad(name, detail))
const is = (name, got, want) => yes(name, got === want, `expected ${want}\n       got      ${got}`)

console.log('\nrecent-work — tokenising a movement name')

yes('a variant parenthetical is not a different exercise',
  movementTokens('Push-up (feet elevated)')[0] === movementTokens('Push-up (feet elevated or standard)')[0],
  'the dashboard already matches on the base name; this must agree')
yes('a slash means "either", so both alternatives are matchable',
  movementTokens('KB curl / band curl').join('|') === 'kb curl|band curl')
yes('a COMPOUND item behind a label prefix splits into its parts',
  movementTokens('Anti-flexion core: side plank + Pallof press').includes('side plank'),
  'THE ONE THE FIRST VERSION MISSED: without this, the side plank done yesterday hides inside an '
  + 'unfamiliar-looking row and the headline case below reads 4 of 6 instead of 5 of 6')
yes('...and the part that was NOT done stays visible',
  movementTokens('Anti-flexion core: side plank + Pallof press').includes('pallof press'))
console.log('\nrecent-work — the spelling failures that hid logged work')

// The Today page's Movement table joins sets.csv to prescriptions.csv on the exercise name and
// renders a miss as "0 / 3 · not started". Each pair below is a spelling collision that really
// occurred between two hand-typed files, and the first hid every set of one movement for as long
// as the block ran — an athlete reported it against the live dashboard; nothing in the repo would
// have. These are real rows, not constructed cases.
yes('a plural is not a different exercise — THE ONE THAT HID EVERY SET OF ONE MOVEMENT',
  sameMovement('Pull-ups (band-assisted as needed)', 'Pull-up (band-assisted)'),
  'prescriptions.csv says "Pull-ups", sets.csv said "Pull-up"; the old base() compared '
  + '"pull-ups" to "pull-up" and rendered 0/3 with three sets logged')
yes('an implement prefix is not a different movement',
  sameMovement('DB RDL', 'KB RDL'),
  'the same hinge; a prescription renamed KB -> DB mid-block while sets.csv kept saying KB')
yes('an implement ALTERNATION inside a name is not two exercises',
  sameMovement('1-hand KB/DB clean', '1-hand clean (KB/DB)'),
  'splitting KB/DB on the slash produced the tokens "1-hand kb" and "db clean", neither a movement')
yes('a compound prescription row matches the parts logged separately',
  sameMovement('Anti-flexion core: side plank + Pallof press', 'Side plank'),
  'sets.csv logs the side plank and the Pallof press as two rows; the prescription is one')
yes('...and the other part too',
  sameMovement('Anti-flexion core: side plank + Pallof press', 'Pallof press'))
yes('a variant parenthetical still matches across files',
  sameMovement('Band face-pull', 'Face-pull (cable)'))

// Negative controls. A matcher that says yes to everything passes every test above and is useless.
yes('two genuinely different movements do NOT match',
  !sameMovement('Suitcase carry', 'Bent-over row'))
yes('a standard plank is not the prescribed anti-flexion pair',
  !sameMovement('Anti-flexion core: side plank + Pallof press', 'Plank'),
  'a plank was logged and the pair was not prescribed; saying so is the honest read')
yes('singularising never eats a word that ends in ss',
  matchKeys('Pallof press').has('pallof press'),
  '"press" -> "pres" would break every pressing movement on any chart')

yes('warm-ups are scaffolding, not work', !isWorkingItem('Warm-up: cat/cow, dead bug'))
yes('cooldowns too', !isWorkingItem('Cooldown: low-back rehab'))
yes('everything else is work', isWorkingItem('Suitcase carry'))

console.log('\nrecent-work — date arithmetic')
is('a day back', shiftDate('2025-05-14', -1), '2025-05-13')
is('across a month boundary', shiftDate('2025-03-01', -1), '2025-02-28')
is('across a year boundary', shiftDate('2025-01-01', -1), '2024-12-31')

console.log('\nrecent-work — the pattern map is READ FROM THE CHART, never declared in code')
const LIBRARY = `
## Substitution table

| Pattern | Primary | Sub A (equipment) | Sub B (joint-friendly) |
|---|---|---|---|
| Hinge | Single-arm KB swing | Trap-bar or RDL | Hip thrust |
| Horizontal push | Push-up | DB floor press | Incline push-up |
| Lunge / single-leg ⛔ | Reverse lunge ⛔ | Step-up ⛔ | Split squat ⛔ |
`
{
  const idx = patternIndex(LIBRARY)
  is('a movement resolves to its pattern', patternOf('Single-arm KB swing', idx), 'Hinge')
  is('a variant resolves too', patternOf('Push-up (feet elevated)', idx), 'Horizontal push')
  is('a ⛔ marker does not become part of the name', patternOf('Step-up', idx), 'Lunge / single-leg')
  is('an unknown movement is null, not a guess', patternOf('Dead hang', idx), null)
  is('no library at all means no patterns, and callers degrade to exact matching',
    patternIndex('').size, 0)
}

console.log('\nrecent-work — the headline defect, reduced to its rows')

// The circuit as prescribed, and the pressing session as PERFORMED the day before.
const CIRCUIT = [
  { exercise: 'Warm-up: band pull-aparts, shoulder prep, cat/cow' },
  { exercise: 'Push-up (feet elevated or standard)' },
  { exercise: 'Single-arm KB swing' },
  { exercise: 'Band face-pull' },
  { exercise: 'Suitcase carry' },
  { exercise: 'KB curl / band curl' },
  { exercise: 'Anti-flexion core: side plank + Pallof press' },
  { exercise: 'Cooldown: low-back rehab' },
]
const YESTERDAY = '2025-05-13'
const TODAY = '2025-05-14'
const SETS = [
  'Push-up (feet elevated)', 'Single-arm KB overhead press', 'Single-arm KB swing',
  'Band face-pull', 'KB curl', 'Dead hang', 'Side plank',
].map((exercise) => ({ date: YESTERDAY, session: 'Upper A', exercise }))
const TRAINING = [{ date: YESTERDAY, type: 'lifting', session: 'Upper A', status: 'completed', rpe: '8' }]

{
  const o = sessionOverlap({ plannedRows: CIRCUIT, training: TRAINING, sets: SETS, today: TODAY, libraryText: LIBRARY })
  is('warm-up and cooldown are excluded, leaving six working items', o.items.length, 6)
  is('five of the six were performed the day before', o.repeated.length, 5)
  yes('...and the ratio clears the finding threshold', o.ratio >= 0.5, `ratio ${o.ratio}`)
  yes('the only wholly-new item is named', o.fresh.length === 1 && o.fresh[0].key === 'suitcase carry',
    JSON.stringify(o.fresh.map((f) => f.key)))
  yes('the un-repeated half of a compound item is reported as still new',
    o.repeated.some((r) => r.partial && r.stillNew.includes('pallof press')),
    'the useful coaching answer is "do the Pallof, skip the side plank" — not "this item is a repeat"')
  yes('each repeat carries the date it was last done',
    o.repeated.every((r) => r.lastDone === YESTERDAY))
  yes('shared movement patterns are reported', o.sharedPatterns.includes('Horizontal push'),
    JSON.stringify(o.sharedPatterns))
}

console.log('\nrecent-work — what must NOT fire')

{
  // Same circuit, but the previous days were rest. Nothing is a repeat.
  const o = sessionOverlap({ plannedRows: CIRCUIT, training: [], sets: [], today: TODAY, libraryText: LIBRARY })
  is('an empty history reports no repeats', o.repeated.length, 0)
  is('...and no consecutive loading days', o.consecutiveLoadingDays, 0)
  is('...and the ratio is zero rather than NaN', o.ratio, 0)
}
{
  // A session whose ONLY commonality is the shared warm-up and cooldown must read as clean. A
  // chart that opens every session the same way has said nothing about overlap by doing so, and
  // counting it would report every pair of sessions as a collision — which is how a finding stops
  // being read.
  const legs = [
    { exercise: 'Warm-up: band pull-aparts, shoulder prep, cat/cow' },
    { exercise: 'Glute bridge' },
    { exercise: 'Bird dog' },
    { exercise: 'Cooldown: low-back rehab' },
  ]
  const o = sessionOverlap({ plannedRows: legs, training: TRAINING, sets: SETS, today: TODAY, libraryText: LIBRARY })
  is('shared scaffolding is not overlap', o.repeated.length, 0)
}
{
  // sets.csv is the evidence, training.csv is only the frame. A completed session with no set
  // rows tells us a day was loaded but not what was in it — it must not invent movements.
  const o = sessionOverlap({ plannedRows: CIRCUIT, training: TRAINING, sets: [], today: TODAY, libraryText: LIBRARY })
  is('a completed session with no logged sets contributes no movement overlap', o.repeated.length, 0)
  is('...but the day still counts as loading', o.consecutiveLoadingDays, 1)
}

console.log('\nrecent-work — consecutive loading days')

const day = (date, type, status = 'completed') => ({ date, type, status, session: type })

/**
 * The set the CALLER resolves and passes in. This module is pure and does not read a registry;
 * `nonLoadingTypeSet()` in `scripts/lib/athlete.mjs` is what production hands it, and the rule it
 * applies is asserted separately below.
 */
// Synthetic type names, not any real chart's registry keys: two registry keys on one line is
// the enum restated into a shared file, and this file is shared.
const NON_LOADING = new Set(['rest', 'walking'])
const streak = (training) => consecutiveLoadingDays({ training, today: TODAY, nonLoading: NON_LOADING })

is('yesterday alone', streak([day('2025-05-13', 'lifting')]), 1)
is('three back-to-back', streak(['2025-05-11', '2025-05-12', '2025-05-13'].map((d) => day(d, 'lifting'))), 3)
is('a walk breaks the streak — its energy is already in steps.csv',
  streak([day('2025-05-13', 'walking'), day('2025-05-12', 'lifting')]), 0)
is('so does a rest day', streak([day('2025-05-13', 'rest'), day('2025-05-12', 'lifting')]), 0)
is('a PLANNED row is not evidence that anything happened',
  streak([day('2025-05-13', 'lifting', 'planned')]), 0)
is('a skipped session likewise', streak([day('2025-05-13', 'lifting', 'skipped')]), 0)
is('the count stops at the first gap and does not look through it',
  streak([day('2025-05-13', 'lifting'), day('2025-05-11', 'lifting')]), 1)

// ⚠ **AN UNCLASSIFIED TYPE IS LOADING, AND THE DEFAULT IS DELIBERATELY THE OVER-COUNTING ONE.**
// A caller that forgets the argument reports too much recent work. The inverse would silently
// shorten every streak containing a type it did not know about, and quietly telling a coach the
// athlete is fresher than they are is the worse failure of the two.
is('an unknown type counts as loading rather than vanishing from the streak',
  consecutiveLoadingDays({ training: [day('2025-05-13', 'kayak')], today: TODAY }), 1)

console.log('\nrecent-work — which types load, and why it is not the floor set')

// ⚠ **THE TWO OBVIOUS SHORTCUTS EACH ANSWER A DIFFERENT QUESTION, AND BOTH ARE WRONG ON A REAL
// REGISTRY.** `countsTowardFloor` asks *does this earn credit*; `met > 0` asks *does this burn
// calories*; `loading` asks *did this tire you out*. These four fixtures are the cases where they
// come apart, which is why the registry carries the flag rather than a derivation of one.
yes('a rehab-style block earns no floor credit and still loads',
  isLoadingType({ met: 3, countsTowardFloor: false }),
  'the floor set would call this rest and undercount the streak')
yes('a walk whose energy is counted in steps does not load',
  !isLoadingType({ met: 0, energyCountedIn: 'steps', countsTowardFloor: false }))
yes('a walk priced at a real MET — correct on a chart with NO step feed — can still be declared '
  + 'non-loading', !isLoadingType({ met: 3.5, countsTowardFloor: false, loading: false }),
  'the met > 0 test would call a week of walks a week with no rest day')
yes('and an explicit true wins over a zero MET', isLoadingType({ met: 0, loading: true }))

console.log('\nrecent-work — a completed day has no proposal left to check')
{
  // Not an assertion about the engine — about the CALLER's guard in findings.mjs. Kept here
  // because it is the same defect surface: a finding that goes on scoring the weekday template
  // for hours after the athlete has already trained is noise. The engine still computes an
  // overlap when asked; it is the finding that must stop asking.
  const done = [{ date: TODAY, type: 'walking', status: 'completed', session: 'Walking' }, ...TRAINING]
  const o = sessionOverlap({ plannedRows: CIRCUIT, training: done, sets: SETS, today: TODAY, libraryText: LIBRARY })
  yes('the engine still answers when asked — the guard belongs to the caller, not here',
    o.repeated.length === 5)
  is('...and today\'s own completed session never counts as a day BEHIND today',
    o.consecutiveLoadingDays, 1)
}

console.log('\nrecent-work — window')
{
  const o = sessionOverlap({
    plannedRows: [{ exercise: 'Push-up' }],
    training: [], sets: [{ date: '2025-05-10', exercise: 'Push-up' }], today: TODAY, days: 3,
  })
  is('a movement outside the window is not a repeat', o.repeated.length, 0)
}
{
  const o = sessionOverlap({
    plannedRows: [{ exercise: 'Push-up' }],
    training: [], sets: [{ date: '2025-05-11', exercise: 'Push-up' }], today: TODAY, days: 3,
  })
  is('a movement on the oldest day IN the window is', o.repeated.length, 1)
}

console.log(failed
  ? `\nrecent-work: ${failed} FAILED.\n`
  : '\nrecent-work: all assertions passed.\n')
process.exit(failed ? 1 : 0)
