#!/usr/bin/env node
/**
 * Fixtures for `scripts/lib/suspensions.mjs` — X-3 / X-15.
 *
 * **INLINE FIXTURES, NOT THE LIVE CHART**, per X-11 and per the lesson W5 wrote down: a check that
 * only holds while the chart happens to contain something is a check that silently stops holding.
 * `check-suspensions.mjs` runs against the live chart and is where the real answer comes from;
 * this file proves the engine can still go red once the chart is clean — which, after the fixes
 * this workstream shipped, it now is.
 *
 * Every case below is a real historical state of this chart or a real defect found while writing
 * the parser. Each is asserted to FAIL, not merely to be detectable in principle.
 */
import {
  extractOffers, extractSuspensions, names, reportableSuspensions, suspensionCollisions,
} from './lib/suspensions.mjs'

let failed = 0
const ok = (name) => console.log(`  ok   ${name}`)
const bad = (name, detail) => {
  failed++
  console.log(`  FAIL ${name}\n       ${String(detail).split('\n').join('\n       ')}`)
}
const yes = (name, cond, detail = '') => (cond ? ok(name) : bad(name, detail))

/** The rehab block, reduced to the sentences that carry its exclusions. Verbatim wording. */
const REHAB = {
  path: 'program/left-knee-rehab.md',
  text: `# Left Knee Rehab Block

## The one rule that outranks the rest

**Nothing that puts valgus or rotational torque through the knee, at any phase, until Phase 3
says so.** That means: no planted-foot pivots, no cutting, no lateral lunges, no cossack squats,
no knee-caving-inward on any squat, and **no butterfly hooks in Grappling**.

## Phase 1 — Settle (now)

### The routine

| # | Movement | Dose |
|---|---|---|
| 8 | **Shallow wall-sit** | 3 × 20–30 s |

### Not in Phase 1

Step-ups and stairs as *exercise*, split squats, lunges, goblet squats, band TKE, **Cycling of any
kind — including the seated easy spin, re-excluded after a trial ride failed inside a minute**,
hilly walking, Grappling. Also excluded, because they read as knee-free and are not: **burpees**,
jump squats, jumping jacks, jump rope, high knees, mountain climbers.

> **Explicitly NOT on the list, and why:** burpees, jump squats, jumping jacks, jump rope, high
> knees, mountain climbers, lunges, step-ups, wall-sits, hill or stair work.

> - **The bike is out of Phase 1 entirely.** Not "shorter next attempt".

## Phase 2 — Load (gate: no soreness at rest, walking pain-free)

| Item | Dose | Notes |
|---|---|---|
| Straight-line step-ups, **low box** | 3 × 8–10/leg | Bodyweight |

**Still not in Phase 2:** pivoting, cutting, lateral movement, butterfly hooks, Grappling, standing
climbs, hilly descents.

## Phase 3 — Robust

- Split squats and deeper squat patterns as tolerated
`,
}

const suspensions = extractSuspensions([REHAB])
const has = (t) => suspensions.some((s) => s.key === t)

// =================================================================================================
console.log('1 · what the block says is out')
// =================================================================================================

yes('the "Not in Phase 1" list is read out of the paragraph under its heading',
  ['step up', 'split squat', 'lunge', 'goblet squat', 'band tke', 'cycling', 'hilly walking', 'grappling']
    .every(has),
  suspensions.map((s) => s.key).join(' · '))

yes('...including the second clause after its embedded colon',
  ['burpee', 'jump squat', 'jumping jack', 'jump rope', 'high knee', 'mountain climber'].every(has),
  'an exclusion sentence with two clauses lost its second half when the fragment splitter '
  + 'stopped at "and are not:" — burpees, the single most tempting knee-free-LOOKING option in '
  + 'their garage, went missing while the check still reported 13 healthy-looking problems')

yes('a bulleted subject-verb exclusion is read: "The bike is out of Phase 1 entirely"', has('bike'),
  suspensions.map((s) => s.key).join(' · '))

yes('an inline enumeration is read: "no planted-foot pivots, no cutting, …"',
  ['planted foot pivot', 'cutting', 'lateral lunge', 'cossack squat'].every(has),
  suspensions.map((s) => s.key).join(' · '))

// ⚠ The scoping decision, asserted rather than merely written down in a comment.
yes('a "NOT on the list" statement is NOT a suspension — the file prescribes a shallow wall-sit',
  !has('wall sit'),
  'wall-sits appear only in a sentence about membership of a list of CALORIE-REPLACEMENT options, '
  + 'while item 8 of the Phase 1 routine prescribes a shallow wall-sit deliberately. Collecting it '
  + 'makes the check red with no green path except editing the athlete\'s rehab plan to satisfy a '
  + 'parser (INVARIANTS.md, the commit gate).')

yes('a FUTURE phase listing a movement is not a suspension of it',
  !has('single leg rdl') && !has('lateral step down'),
  'Phase 3 lists what comes back; reading it as an exclusion would invert the block')

// =================================================================================================
console.log('\n2 · RED FIXTURE — the seated bike, still on Tue and Sat')
// The instance INVARIANTS.md uses as its worked example of the operating rule. A trial ride failed
// inside a minute and the bike went back out; `_weeklyTemplateNote` recorded the suspension in
// prose for hours while the data beside it went on prescribing 45-minute rides twice a week — and
// the data is what renders.
// =================================================================================================

{
  const bikeTemplate = {
    Mon: { type: 'lift', session: 'Session Two', focus: 'Upper push', durationMin: 35 },
    Tue: { type: 'cycling', session: 'Seated bike', focus: 'Easy spin', durationMin: 45, met: 6.8 },
    Sat: { type: 'cycling', session: 'Seated bike', focus: 'Easy spin', durationMin: 45, met: 6.8 },
  }
  const { collisions } = suspensionCollisions({ planDocs: [REHAB], weeklyTemplate: bikeTemplate })
  const days = collisions.filter((c) => c.surface === 'weeklyTemplate')
  yes('the template prescribing the suspended bike is caught on BOTH days', days.length >= 2,
    JSON.stringify(collisions, null, 1))
  yes('...and the report names the day and the term',
    days.some((c) => c.label.startsWith('Tue')) && days.some((c) => c.label.startsWith('Sat')),
    days.map((c) => c.label).join(', '))

  // The boundary, asserted: `focus` is prose ABOUT the session and must not be read as one.
  const focusOnly = {
    Tue: {
      type: 'circuit',
      session: 'Upper-body circuit (or extra flat walking)',
      focus: 'Replaces the seated bike ride, which left Phase 1 after failing inside a minute. '
        + 'Knee-free contents only — no step-ups, no split squats',
      durationMin: 20,
    },
  }
  const { collisions: none } = suspensionCollisions({ planDocs: [REHAB], weeklyTemplate: focusOnly })
  yes('a `focus` explaining what it REPLACED is not a prescription of it', none.length === 0,
    `${JSON.stringify(none)}\nThis is the live template. If focus were scanned, every session that `
    + 'honestly says what it superseded would be reported, and a check that fires on the chart '
    + 'being well-documented is a check the maintainer switches off.')
}

// =================================================================================================
console.log('\n3 · RED FIXTURE — the library pre-authorising step-ups and split squats (F-19)')
// "A substitution keeps the pattern and the rep range… and does not need approval", over a table
// whose Lunge row offers a step-up and a split squat. They are authorised in writing to substitute
// into contraindicated work at the moment they are least likely to open a second file.
// =================================================================================================

{
  const library = {
    path: 'program/exercise-library.md',
    text: `# Exercise Library & Substitutions

## Substitution table

| Pattern | Primary | Sub A (equipment) | Sub B (joint-friendly) |
|---|---|---|---|
| Squat | Goblet / KB front squat (controlled ROM) | Split squat | Leg press / box squat |
| Hinge | Single-arm KB swing | Trap-bar or RDL | Hip thrust / back extension |
| Lunge / single-leg | Reverse lunge | Step-up (knee-safe height) | Split squat (L-knee: pain-free ROM) |

## Rules
- A substitution keeps the pattern and the rep range. It is not a downgrade and does not
  need approval.

## Travel / no-equipment fallback
> The minimum viable session. Never zero.
- Push-ups, burpees, bodyweight squats/split squats (knee-safe ROM), jump rope (knee
  permitting), plus the low-back rehab routine.

## Contraindicated for this athlete
- **Heavy barbell back squat** — avoid by default (L4 rupture, 2019). Sub: goblet/KB front squat, split squat, leg press in controlled ROM.
- **Running (distance)** — modify / earn back. Sub: seated bike, ruck, incline walk.
`,
  }
  const { collisions } = suspensionCollisions({ planDocs: [REHAB, library] })
  const hit = (s) => collisions.some((c) => new RegExp(s, 'i').test(c.text))

  yes(`the substitution table is caught (${collisions.length} collisions)`,
    hit('Step-up') && hit('Split squat') && hit('Reverse lunge') && hit('Goblet'),
    collisions.map((c) => `${c.text} → ${c.term}`).join('\n'))
  yes('the travel fallback is caught too — burpees, split squats, jump rope',
    hit('burpees') && hit('jump rope') && hit('bodyweight squats'),
    collisions.map((c) => c.text).join(' | '))
  yes('a `Sub:` clause is caught: the substitute for a contraindicated lift is itself suspended',
    hit('goblet/KB front squat') && hit('seated bike'),
    collisions.map((c) => c.text).join(' | '))

  // ⚠ THE BUG THIS ASSERTION EXISTS FOR. The first version treated `## Contraindicated for this
  // athlete` as a heading scoping a LIST, so every `Sub:` under it — plank, bird dog, incline
  // walk, hip thrust, leg press — was filed as SUSPENDED. 116 collisions, most of them the
  // opposite of the truth, and a banner telling the athlete their rehab core work was forbidden.
  const suspended = extractSuspensions([REHAB, library]).map((s) => s.key)
  yes('a substitute is never read as a suspension',
    !suspended.includes('leg press') && !suspended.includes('ruck')
      && !suspended.includes('incline walk') && !suspended.includes('hip thrust'),
    suspended.join(' · '))

  // ⚠ A DELIBERATE SNEAK ATTEMPT THAT SUCCEEDED, AND THE RULE THAT CLOSED IT. A second table,
  // dropped under `## Rules` with a header of its own devising, offered the same two movements and
  // the check stayed green: the header-based rule reads a table as an offer only when its own
  // header row says `Sub A` / `Alternative`, and a table header is a convention anyone can decline
  // to follow. What does not move is the document's stated purpose.
  const smuggled = {
    ...library,
    text: library.text.replace('## Rules\n',
      '## Rules\n\n| Pattern | Go-to |\n|---|---|\n| Lunge | Step-up (knee-safe height) |\n'),
  }
  yes('a table with a header of its own devising, in a file titled "Substitutions", is still an offer',
    suspensionCollisions({ planDocs: [REHAB, smuggled] }).collisions.length > collisions.length,
    'the check must not depend on the smuggler labelling the column "Sub A"')

  // The acknowledgement marker, and its staleness half.
  const marked = { ...library, text: library.text.replace(/Step-up \(knee-safe height\)/, 'Step-up (knee-safe height) ⛔') }
  const after = suspensionCollisions({ planDocs: [REHAB, marked] })
  yes('a ⛔ mark retires exactly one offer and nothing else',
    after.collisions.length === collisions.length - 1,
    `${collisions.length} → ${after.collisions.length}`)

  const stale = suspensionCollisions({
    planDocs: [{ ...library, text: library.text.replace(/Hip thrust \/ back extension/, 'Hip thrust / back extension ⛔') }],
  })
  yes('a ⛔ on something nothing suspends is itself a failure', stale.staleMarks.length === 1,
    `${stale.staleMarks.length} — at a phase revert this list is the set of lines to un-mark, so a `
    + 'mark that stops corresponding to anything has to be loud rather than inert')
}

// =================================================================================================
console.log('\n4 · RED FIXTURE — a live prescription row (the goblet squat under `Session One`)')
// Effective dating means a session resolves to its newest dated rows. An older session's rows go on
// prescribing exactly what they named; they are harmless ONLY while nothing schedules that session.
// The moment the weekly template names it again, they are live — and a suspension has to see them.
// =================================================================================================

{
  const prescriptions = [
    { date: '2026-08-06', session: 'Session One', order: '2', exercise: 'Goblet squat', load: 'KB', note: '' },
    { date: '2026-08-06', session: 'Session One', order: '5', exercise: 'Left-knee rehab: step-ups + band TKE + shallow wall-sit', load: 'BW', note: '' },
    {
      date: '2026-08-14',
      session: 'Session One (modified)',
      order: '3',
      exercise: 'KB RDL',
      load: '35 lb',
      note: 'Replaces the goblet squat as the day\'s main lower-body driver',
    },
  ]

  const scheduled = suspensionCollisions({
    planDocs: [REHAB], prescriptions, sessions: ['Session One'], today: '2026-08-14',
  })
  yes('a scheduled session whose live rows name a suspended movement is caught',
    scheduled.collisions.filter((c) => c.surface === 'prescriptions.csv').length >= 2,
    JSON.stringify(scheduled.collisions.map((c) => c.text)))

  const current = suspensionCollisions({
    planDocs: [REHAB], prescriptions, sessions: ['Session One (modified)'], today: '2026-08-14',
  })
  yes('a session the block no longer schedules is not live, however recent its rows',
    current.collisions.length === 0, JSON.stringify(current.collisions.map((c) => c.text)))
  yes('...and the row NOTE saying what it replaced is not read as prescribing it',
    !current.collisions.some((c) => /goblet/i.test(c.text)),
    'the live KB RDL row says "replaces the goblet squat". Scanning notes would report the '
    + 'correction as the defect it corrected.')

  const undated = suspensionCollisions({
    planDocs: [REHAB], prescriptions, sessions: ['Session One'], today: '2026-08-05',
  })
  yes('a prescription dated after today is not in force yet', undated.collisions.length === 0,
    JSON.stringify(undated.collisions.map((c) => c.text)))
}

// =================================================================================================
console.log('\n5 · the comparison itself')
// =================================================================================================

yes('plural and hyphenation cannot hide a match: "Step-ups" finds "Step-up (knee-safe height)"',
  names('Step-up (knee-safe height)', 'Step-ups'),
  'a three-letter stemming guard left "ups" unstemmed, so the library\'s pre-authorised step-up — '
  + 'one of the two substitutions this check was written for — did not collide, and the check '
  + 'reported 13 problems instead of 15 while looking entirely healthy')
yes('...and words may be separated: "goblet squats" finds "Goblet / KB front squat"',
  names('Goblet / KB front squat (controlled ROM)', 'goblet squats'))
yes('a different movement in the same family does not match',
  !names('Leg press / box squat to comfortable depth', 'split squats'))
yes('a NEGATED word does not match: "anti-rotation" is not "rotation"',
  !names('Core / anti-rotation: Pallof press', 'rotation'),
  'the offer is the suspension\'s opposite; reading it as an instance is how a check earns a '
  + 'reputation for crying wolf and gets switched off')

// =================================================================================================
console.log('\n6 · commentary is not a prescription, and an empty chart is a valid chart')
// =================================================================================================

{
  const withLegend = {
    path: 'program/current-block.md',
    text: `# Current Training Block

### Minimum viable session (20 min, never zero)
Push-ups 3×AMRAP−2 · Rows or pull-ups 3× · Suitcase carry 2× · low-back rehab.

> **⛔ = out while the left-knee block runs.** The stand-in for the goblet squat is the KB RDL.
`,
  }
  const { collisions, staleMarks } = suspensionCollisions({ planDocs: [REHAB, withLegend] })
  yes('a blockquote explaining the marks is neither an offer nor a stale mark',
    collisions.length === 0 && staleMarks.length === 0,
    `${JSON.stringify(collisions.map((c) => c.text))} / ${JSON.stringify(staleMarks.map((m) => m.text))}\n`
    + 'A legend has to name the suspended movement in order to say it is suspended. Reporting it '
    + 'makes a document unable to explain its own marks.')

  const empty = suspensionCollisions({ planDocs: [{ path: 'program/block.md', text: '# Block\n\nSquat 3×5.\n' }] })
  yes('a block that forbids nothing produces nothing', empty.collisions.length === 0
    && extractSuspensions([{ path: 'program/block.md', text: '# Block\n' }]).length === 0)
  yes('no plan documents at all is not an error', extractSuspensions([]).length === 0
    && extractOffers([]).length === 0)
}

// =================================================================================================
console.log('\n7 · the banner shown to the athlete stays legible')
// SURFACES.md: a list they learn to skip is how the one line that matters gets missed.
// =================================================================================================

{
  const gates = {
    path: 'program/left-knee-rehab.md',
    text: `# Block

## Phase gates

Phase 2 opens on *no soreness at rest, walking pain-free*; the test is *no improvement across
~2 weeks*.

### Not in Phase 1

Cycling of any kind, Grappling.
`,
  }
  const all = extractSuspensions([gates])
  const shown = reportableSuspensions(all)
  yes('a gate criterion written as "no X, no Y" is kept by the check…',
    all.some((s) => s.key === 'soreness'), all.map((s) => s.key).join(' · '))
  yes('…and kept OFF the athlete\'s banner, which shows the exclusion lists',
    !shown.some((s) => s.key === 'soreness') && shown.some((s) => s.key === 'cycling'),
    shown.map((s) => s.key).join(' · '))
  yes('an enumeration-only term that actually collides IS shown',
    reportableSuspensions(all, new Set(['soreness'])).some((s) => s.key === 'soreness'))
}

console.log(failed ? `\nsuspensions: ${failed} FAILED.` : '\nsuspensions: all checks passed.')
process.exit(failed ? 1 : 0)
