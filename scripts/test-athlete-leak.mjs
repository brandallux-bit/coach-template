#!/usr/bin/env node
/**
 * Fixtures for `scripts/lib/athlete-leak.mjs` and `scripts/lib/banned-terms.mjs`.
 *
 * Every case builds a whole chart on disk, in a temp directory, and runs the real scanner over it.
 * That is deliberate: both scanners walk directories and read files, so a suite that fed them
 * strings would prove things about a lookalike (X-10, and the mirror W4 deleted).
 *
 * **The red fixtures are the point.** Each `red()` case below is an input that MUST make the check
 * fail; the suite asserts it does. A leak scanner that cannot go red certifies the leak.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { denylistFrom, pinDigest, scanForLeaks, verdict, stripComments } from './lib/athlete-leak.mjs'
import { bannedTermsFrom, scanForBannedTerms } from './lib/banned-terms.mjs'

let failed = 0
const ok = (name) => console.log(`  ok   ${name}`)
const fail = (name, detail = '') => { failed++; console.log(`  FAIL ${name}\n       ${detail}`) }
const eq = (name, actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected)
    ? ok(name)
    : fail(name, `expected ${JSON.stringify(expected)}\n       got      ${JSON.stringify(actual)}`)

/**
 * A whole fixture chart on disk. The athlete is a swimmer with a shellfish allergy — nothing this
 * repo has ever contained, so anything the scanner finds in the shared files it also writes is a
 * property of the CODE and not of a chart it was tuned against.
 */
const CHART = {
  athlete: { name: 'Wren', pronouns: 'they/them', sex: 'female', dob: '1988-03', heightIn: 65, timezone: 'Europe/Lisbon' },
  domains: { energyDeficit: 'Swim faster', health: 'Gut settled' },
  metrics: { reaction_severity: { label: 'Reaction severity', unit: '0-3', direction: 'down', domain: 'Gut settled' } },
  sessionTypes: {
    swim: { met: 7.0, countsTowardFloor: true, domain: 'Swim faster' },
    ergo: { met: 8.0, countsTowardFloor: true, domain: 'Swim faster' },
  },
  program: { weeklyTemplate: { Mon: { type: 'swim', session: 'Threshold 400s', durationMin: 45 } } },
  events: { havanaDepartDate: '2026-09-01' },
  copy: { poolCardCaption: 'Measured in the 25 m pool, never the open water.' },
}

const write = (root, rel, text) => {
  mkdirSync(join(root, dirname(rel)), { recursive: true })
  writeFileSync(join(root, rel), text)
}

/** Builds a fixture chart, runs `fn(root)`, and always cleans up. */
const inChart = (files, fn) => {
  const root = mkdtempSync(join(tmpdir(), 'leak-fixture-'))
  try {
    write(root, 'athlete/constants.json', JSON.stringify(CHART, null, 2))
    write(root, 'athlete/profile.md', '# Profile\nA swimmer.\n')
    for (const [rel, text] of Object.entries(files)) write(root, rel, text)
    return fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const leaks = (files) => inChart(files, (root) => verdict(scanForLeaks(root, denylistFrom(root))))

// =================================================================================================
console.log('the denylist is derived from the chart, never from a list in this repo')
// =================================================================================================

inChart({}, (root) => {
  const terms = denylistFrom(root).map((t) => t.term)
  ;['Wren', 'swim', 'ergo', 'havana'].every((t) => terms.includes(t))
    ? ok('the name, both registry keys and the event are collected')
    : fail('structured identifiers must all be collected', terms.join(', '))
  terms.includes('Swim faster') && terms.includes('Threshold 400s')
    ? ok('domain labels and template session names are collected as phrases')
    : fail('phrases must be collected', terms.join(', '))
  terms.includes('Reaction severity')
    ? fail('a metric LABEL must not be collected', 'display strings are usually ordinary physiology')
    : ok('a metric label is not collected — only the domain it serves')
  terms.some((t) => t.startsWith('Measured in the 25 m pool'))
    ? ok('a copy sentence is collected whole')
    : fail('copy must be collected as a phrase', terms.join(', '))
})

// =================================================================================================
console.log('\ncode: a literal is a leak, a comment is a record')
// =================================================================================================

{
  // RED FIXTURE — F-15 itself: the athlete's activity list restated as an enum in shared code.
  const red = leaks({
    'scripts/lib/schema.mjs': "export const SPEC = { type: ['swim', 'ergo', 'rest'] }\n",
  })
  eq('an enum restating the registry fails', red.failures.map((f) => f.path), ['scripts/lib/schema.mjs'])

  // ...and one registry key alone is a sentence, not the enum. This is the rule that took the
  // check from 158 hits to 8, and it is the one most likely to be over-tightened by accident.
  const single = leaks({ 'src/lib/x.ts': "const label = 'swim'\n" })
  eq('one registry key on its own is not a leak', single.failures.length, 0)

  // RED FIXTURE — F-31: the athlete's own caption, moved into a shared component.
  const copyLeak = leaks({
    'src/app/page.tsx': '<Card caption="Measured in the 25 m pool, never the open water." />\n',
  })
  eq('a copy sentence duplicated into a component fails', copyLeak.failures.map((f) => f.path),
    ['src/app/page.tsx'])

  // ...even re-wrapped, because a phrase matches with flexible whitespace.
  const rewrapped = leaks({
    'src/app/page.tsx': 'caption={"Measured in the 25 m pool,\\n  never the open water."}\n'
      .replace('\\n  ', ' '),
  })
  eq('...and still fails when the sentence is re-wrapped', rewrapped.failures.length, 1)

  // The rule that saves ~97 legitimate lines: a comment narrating a past defect is a record.
  const comment = leaks({
    'scripts/lib/x.mjs': "// The 'swim' and 'ergo' types were added on 2026-08-14 after…\nexport const a = 1\n",
  })
  eq('a comment naming the same two types is not a leak', comment.failures.length, 0)

  // ...and the comment stripper must not be fooled by a URL, which is the classic way `//` eats a
  // line it should not.
  ;stripComments("const u = 'https://example.com/swim/ergo'\n").includes('swim')
    ? ok('a URL inside a string survives comment stripping')
    : fail('the stripper ate a string containing //', stripComments("const u = 'https://x/swim/ergo'"))

  // A block comment must not shift line numbers — the report is useless if `:41` is wrong.
  const shifted = leaks({
    'src/lib/y.ts': `/**\n * padding\n * padding\n */\nconst t = ['swim', 'ergo']\n`,
  })
  eq('a leak after a block comment reports its real line number',
    shifted.failures[0]?.hits[0]?.line, 5)

  // RED FIXTURE — SCREAMING_SNAKE. `\b` counts `_` as a word character, so `\bWren\b` does NOT
  // match `WREN_WAIST_BASELINE`, and a constant named after the athlete is one of the most
  // ordinary ways a leak reaches shared code. Found by planting exactly this and watching the
  // check pass: `const BRUCE = 1` failed and `const BRUCE_WAIST = 36.5` came back clean. The
  // matcher anchors on letters, not `\w`, so `_`, digits and punctuation are all separators.
  const snake = leaks({ 'src/lib/z.ts': 'const WREN_WAIST_BASELINE = 36.5\n' })
  eq('a constant named after the athlete fails, underscores and all',
    snake.failures.map((f) => f.path), ['src/lib/z.ts'])

  const trailing = leaks({ 'src/lib/z.ts': "const s = 'baseline_wren_2026'\n" })
  eq('...and the name still counts mid-identifier between separators',
    trailing.failures.length, 1)

  // ...while a longer word that merely CONTAINS the name is not a hit. `Wren` inside `Wrenching`
  // is a different word, and a matcher that fired on it would report every English word with an
  // athlete's short name buried in it.
  const substring = leaks({ 'src/lib/z.ts': 'const t = "Wrenching the bolt loose"\n' })
  eq('a name embedded in a longer word is not a leak', substring.failures.length, 0)
}

// =================================================================================================
console.log('\nmarkdown: prose is instruction, so prose counts')
// =================================================================================================

{
  // RED FIXTURE — F-34: an agent asserting this athlete's domain ranking.
  const red = leaks({
    '.claude/agents/strength.md': 'Note that strength ranks below Swim faster by his own choice.\n',
  })
  eq('an agent naming a chart domain fails', red.failures.map((f) => f.path),
    ['.claude/agents/strength.md'])

  const skill = leaks({ 'skills/weekly-review/SKILL.md': 'Grade the week on Threshold 400s.\n' })
  eq('a skill naming a chart session fails', skill.failures.length, 1)

  // docs/ reports and never fails — see rule 4 in athlete-leak.mjs.
  const doc = leaks({ 'docs/audit/FINDINGS.md': 'F-31: the Threshold 400s tile renders for everyone.\n' })
  eq('the same sentence in docs/ does not fail the build', doc.failures.length, 0)
  eq('...but it IS reported', doc.reported.map((f) => f.path), ['docs/audit/FINDINGS.md'])

  // A test suite's fixtures are not leaks: a red fixture drawn from the real case is X-10 working.
  const fixture = leaks({ 'scripts/test-thing.mjs': "const rows = [{ type: 'swim' }, { type: 'ergo' }]\n" })
  eq('a suite may name the chart in its own fixtures', fixture.failures.length, 0)
}

// =================================================================================================
console.log('\nacknowledgements: pinned to the lines they cover, and stale is a failure')
// =================================================================================================

{
  const files = { 'skills/x/SKILL.md': 'Grade the week on Threshold 400s.\n' }

  inChart(files, (root) => {
    const found = scanForLeaks(root, denylistFrom(root))
    const digest = pinDigest(root, 'skills/x/SKILL.md', [1])
    const ack = (extra) => [{ path: 'skills/x/SKILL.md', lines: [1], digest, owner: 'x', ...extra }]

    eq('unacknowledged, it fails', verdict(found, [], root).failures.length, 1)
    eq('acknowledged and correctly pinned, it does not', verdict(found, ack(), root).failures.length, 0)

    // RED FIXTURE — the whole reason the digest exists: an acknowledgement must not widen to cover
    // a line nobody has read. W5's exemptions learned this; W6's ⛔ marks learned it again.
    eq('an acknowledgement pinned to a different line is reported as moved',
      verdict(found, ack({ digest: 'deadbeefdeadbeef' }), root).moved.length, 1)

    // RED FIXTURE, and it is the one that actually caught something. An unpinned entry covered the
    // whole file in the first version, so a deliberate sneak — add a real leak, add a three-word
    // acknowledgement beside it — went green on the first attempt. An exemption that requires no
    // evidence is an off switch.
    const unpinned = verdict(found, ack({ digest: null, lines: null }), root)
    eq('an UNPINNED acknowledgement covers nothing', unpinned.failures.length, 1)
    eq('...and says so rather than failing silently', unpinned.moved[0]?.unpinned, true)
  })

  // ⚠ **THE PIN IS TAKEN FROM THE FILE, NOT FROM THE SCAN, and that is what makes an
  // acknowledgement portable.** The first version digested the scan's hit set, so on a chart whose
  // denylist collides with nothing in that file every entry read as "no longer leaks" and a brand
  // new athlete's first push went red over four exemptions belonging to somebody else's chart —
  // F-30's shape, reintroduced by the mechanism written to close it. `test-cold-start.mjs` found
  // it; this is the unit-level version of that catch.
  inChart({ ...files, 'athlete/constants.json': JSON.stringify({ ...CHART, sessionTypes: {}, domains: {}, copy: {}, program: {}, events: {} }) },
    (root) => {
      const found = scanForLeaks(root, denylistFrom(root))
      const ack = [{ path: 'skills/x/SKILL.md', lines: [1], digest: pinDigest(root, 'skills/x/SKILL.md', [1]), owner: 'x' }]
      const v = verdict(found, ack, root)
      eq('a chart that does not collide with the file leaves the acknowledgement valid, not stale',
        [v.failures.length, v.moved.length, v.inert.length], [0, 0, 1])
    })

  // ...and an entry whose file is gone IS caught, because the pin cannot be recomputed.
  inChart(files, (root) => {
    const found = scanForLeaks(root, denylistFrom(root))
    eq('an acknowledgement for a file that no longer exists is reported as moved',
      verdict(found, [{ path: 'skills/deleted/SKILL.md', lines: [1], digest: 'abc', owner: 'x' }], root)
        .moved.length, 1)
  })
}

// =================================================================================================
console.log('\nan explicit file set is scanned WHOLE, including everything outside SCOPE')
// =================================================================================================
//
// ⚠ **THE `only` OPTION USED TO BE FILTERED THROUGH `SCOPE`, WHICH MADE IT SILENTLY MISS THE
// CHARTER AND THE METHOD DOCUMENT WHILE REPORTING THEM AS SCANNED.**
//
// `SCOPE` names five directories. `port-overlay.mjs` hands in the full set of shared files it
// copied — 114 of them — and the sixteen outside those five roots were unreachable: `CLAUDE.md`,
// `data/METHOD.md`, `README.md`, every workflow, every config file. The caller then printed
// "clean" over all 114. Those are the files a port edits most; `check-banned-terms.mjs` scopes
// them out too, so they had no automated athlete-leak coverage of any kind in either repo.

inChart({
  'CLAUDE.md': '# Charter\n\nThe Monday session is Threshold 400s.\n',
  'docs/NOTES.md': 'Historical: the session was Threshold 400s.\n',
  'skills/weekly-review/SKILL.md': 'Read Threshold 400s first.\n',
}, (root) => {
  const found = scanForLeaks(root, denylistFrom(root), {
    only: new Set(['CLAUDE.md', 'docs/NOTES.md', 'skills/weekly-review/SKILL.md']),
  })
  const paths = found.map((f) => f.path).sort()
  JSON.stringify(paths) === JSON.stringify(['CLAUDE.md', 'docs/NOTES.md', 'skills/weekly-review/SKILL.md'])
    ? ok('a root-level shared file is scanned, not skipped for living outside SCOPE')
    : fail('every path handed in must be scanned', JSON.stringify(paths))
  found.find((f) => f.path === 'CLAUDE.md')?.mode === 'enforced'
    ? ok('...and a path outside SCOPE is enforced — it ships to every fork like any other')
    : fail('an out-of-scope shared file must be enforced', JSON.stringify(found.map((f) => [f.path, f.mode])))
  found.find((f) => f.path === 'docs/NOTES.md')?.mode === 'reported'
    ? ok('...while a path inside a reported scope keeps its mode')
    : fail('SCOPE modes must survive the explicit file set', JSON.stringify(found.map((f) => [f.path, f.mode])))
})

// =================================================================================================
console.log('\na one-word label counts only in company, or an ordinary chart is red on day one')
// =================================================================================================
//
// ⚠ **THE RED FIXTURE IS THE THIRD CASE, AND IT IS WHAT MAKES THE SECOND ONE MEAN ANYTHING.**
// Found by `test-cold-start.mjs` STATE C, whose swimmer trains on Thursdays in a session called
// "Technique" — which is also a word `.claude/agents/library/strength.md` uses in its own
// description. A phrase is anchored on its whole text; a one-word label is not, so it matched
// ordinary English in a shared prose file and a fresh chart failed its first push.

{
  const ONE_WORD = {
    ...CHART,
    // Both shapes, because both degrade the same way and only one was found by accident.
    domains: { performance: 'Strength' },
    program: { weeklyTemplate: { Thu: { type: 'swim', session: 'Technique', durationMin: 40 } } },
  }
  const inOneWordChart = (files, fn) => {
    const root = mkdtempSync(join(tmpdir(), 'leak-oneword-'))
    try {
      write(root, 'athlete/constants.json', JSON.stringify(ONE_WORD, null, 2))
      write(root, 'athlete/profile.md', '# Profile\nA swimmer.\n')
      for (const [rel, text] of Object.entries(files)) write(root, rel, text)
      return fn(root)
    } finally { rmSync(root, { recursive: true, force: true }) }
  }

  inOneWordChart({}, (root) => {
    const kinds = new Map(denylistFrom(root).map((t) => [t.term, t.kind]))
    kinds.get('Strength') === 'enum-member' && kinds.get('Technique') === 'enum-member'
      ? ok('a one-word domain label and a one-word session name are both collected as enum members')
      : fail('a one-word label must not be collected as a bare word',
        `Strength=${kinds.get('Strength')} Technique=${kinds.get('Technique')}`)
  })

  // GREEN — the sentences a shared file is entitled to write, one ordinary word per line, which
  // is how `.claude/agents/library/strength.md` actually reads.
  const prose = inOneWordChart({
    '.claude/agents/thing.md': 'Consult for program design, progression schemes, and technique\n'
      + 'questions about any lift.\n\nDeload timing and volume are decided here.\n',
  }, (root) => verdict(scanForLeaks(root, denylistFrom(root))))
  prose.failures.length === 0
    ? ok('...so an agent describing its own job in English is not a leak')
    : fail('ordinary English in a shared file must not fail a chart',
      JSON.stringify(prose.failures.map((f) => f.hits.map((h) => h.text))))

  // RED — the same words, restated as this chart's list. Still caught, which is the whole bargain.
  const restated = inOneWordChart({
    '.claude/agents/thing.md': 'The sessions are `Technique` and `Strength`, in that order.\n',
  }, (root) => verdict(scanForLeaks(root, denylistFrom(root))))
  restated.failures.length === 1
    ? ok("...while the chart's list restated into a shared file still fails, two on one line")
    : fail('two enum members on one line is the enum, and must still be caught',
      JSON.stringify(restated.failures.length))
}
// =================================================================================================
console.log('\nthe banned-term check is the ATHLETE\'s, and it is inert without their instruction')
// =================================================================================================

{
  const BAN = '### ⛔ STANDING INSTRUCTION — BMX is not to be used, cited, or computed for this athlete\n'
    + 'Added at their explicit request.\n'

  // A chart that never asked for a ban has no banned terms, so the check does nothing at all.
  inChart({}, (root) => {
    eq('a chart with no standing instruction registers no banned term',
      bannedTermsFrom(root).map((t) => t.term), [])
    eq('...and the scan is therefore empty', scanForBannedTerms(root).length, 0)
  })

  // The instruction is what registers the term — nothing in scripts/ names it.
  inChart({ 'athlete/profile.md': BAN }, (root) => {
    eq('the athlete\'s own standing instruction registers the term',
      bannedTermsFrom(root).map((t) => t.term), ['BMX'])
    eq('the file that DECLARES the ban is never itself a violation',
      scanForBannedTerms(root).map((h) => h.path), [])
  })

  // RED FIXTURE — F-43's exact shape: the banned term used to justify a live safety threshold.
  inChart({
    'athlete/profile.md': BAN,
    'athlete/goals.md': '- Bodyweight below 170 lbs (BMX 24.5, and comfortably above any floor)\n',
  }, (root) => {
    const hits = scanForBannedTerms(root)
    eq('a threshold justified with the banned term is reported',
      hits.map((h) => `${h.path}:${h.line}`), ['athlete/goals.md:1'])
  })

  // The scope is decision-bearing surfaces, not the history of the decision.
  inChart({
    'athlete/profile.md': BAN,
    'decisions.md': '2026-08-13: BMX is retired at his request.\n',
    'logs/2026-08-07.md': 'Computed BMX 26.5 before the ban.\n',
    'docs/audit/FINDINGS.md': 'F-43: the BMX ban is violated in the weight-floor note.\n',
  }, (root) => {
    eq('the history of the ban is not a use of the banned term', scanForBannedTerms(root).length, 0)
  })

  // The surfaces that speak to the athlete are in scope — "never quoted or used by any agent
  // evaluating my status or progress" are his own words.
  inChart({
    'athlete/profile.md': BAN,
    '.claude/agents/nutrition.md': 'Check their BMX before setting a target.\n',
  }, (root) => {
    eq('an agent instructed to use the banned term is reported',
      scanForBannedTerms(root).map((h) => h.path), ['.claude/agents/nutrition.md'])
  })
}

console.log(failed ? `\nathlete-leak: ${failed} FAILED.` : '\nathlete-leak: all checks passed.')
process.exit(failed ? 1 : 0)
