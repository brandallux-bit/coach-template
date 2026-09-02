#!/usr/bin/env node
/**
 * X-8 — **a number has exactly one home. Everything else renders it, including code.**
 *
 * WHAT THIS PROTECTS. X-8 is the largest defect class this repo has: the requirements corpus
 * called it *"the most-violated rule here"* and the 2026-08-13 audit then found fifteen more
 * violations of it. The expensive one was visible to the athlete: the three-level session-kcal
 * precedence lived in `compute-energy.mjs` and nowhere else, `build-data-json.mjs` reimplemented
 * only its third level, and the dashboard showed **1,328 kcal for a session the ledger counted at
 * 774** — the exact figure `decisions.md` records as corrected away on 2026-08-12. Eat back what
 * the screen says you earned and you are 554 kcal over, on a plan whose whole daily deficit is
 * ~600.
 *
 * ⚠ **THE REGISTRY IS THE CHECK, AND IT IS DELIBERATELY NOT A LIST OF TODAY'S DUPLICATES.**
 * Every rule below scans **every file in scope** and fails on any file that is not the declared
 * home. So a *newly written* second copy fails — which is the whole difference between closing
 * fifteen findings and closing them for good. W4's equivalent guard was scoped one loop variable
 * wide (`\bw\.burnKcal` matched the two files that existed and nothing else) and a new page using
 * `week.burnKcal` sailed through green; every pattern here was written after that, and each was
 * tested by trying to sneak a second home past it.
 *
 * FOUR KINDS OF RULE, because "one home" means different things at different layers:
 *
 *   1. `DEFINITIONS` — a construct in `scripts/`/`src/` that may be defined once. Source is
 *      comment-stripped first, so prose *about* a rule can never satisfy or trip it.
 *   2. `FIGURES` — a number owned by `athlete/constants.json` and restated in prose. Every
 *      statement of it must agree with the constant. **The constant wins; the prose is corrected.**
 *      This never asks anyone to *choose* a value — see the note on `athlete-owned numbers` below.
 *   3. `BEHAVIOURAL` — the two consumers of a shared computation must actually agree, on the live
 *      chart. A grep proves one implementation exists; only arithmetic proves it is used.
 *   4. `GENERATED` — a document block rendered from code must be current, and the model digest
 *      must match the recorded `METHOD_VERSION`.
 *
 * ⚠ **WHAT THIS CHECK MUST NEVER DO.** It never demands that a value be *chosen*. Where two
 * figures disagree it names both and points at the constant; it cannot be made green by inventing
 * a number, because the only edit that satisfies it is "make the prose say what the constant
 * already says." That boundary is not decorative: the last check written under pressure to go
 * green ended with the coach inventing a 135/85 blood-pressure threshold that belonged to the
 * athlete and their doctor (INVARIANTS.md, the commit gate).
 *
 * ⚠ **`logs/`, `decisions.md` and `docs/audit/` ARE OUT OF SCOPE, ON PURPOSE.** They are the
 * historical record. A weekly review from 2026-08-07 quoting the protein figure in force that day
 * is *correct*, and a check that rewrote it would destroy the only evidence of what the plan used
 * to be. `logs/TEMPLATE-*.md` is in scope: a template is an instruction for the future.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseCsv, parseLine, readCsv } from './lib/csv.mjs'
import { sessionCost } from './lib/aggregate.mjs'
import { SET_REST_SEC, localToday, metTable } from './lib/athlete.mjs'
import { RESERVED_SESSIONS } from './lib/sessions.mjs'
import { livePrescriptions, names } from './lib/suspensions.mjs'
import { METHOD_DIGEST, METHOD_VERSION, modelDigest, modelInputsJson } from './lib/method-version.mjs'
import { staleDocs } from './build-docs.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = (p) => readFileSync(join(ROOT, p), 'utf8')

let failed = 0
const ok = (name) => console.log(`  ok   ${name}`)
const bad = (name, detail) => {
  failed++
  console.log(`  FAIL ${name}\n       ${String(detail).split('\n').join('\n       ')}`)
}
const yes = (name, cond, detail = '') => (cond ? ok(name) : bad(name, detail))

/** Comments stripped, so a comment explaining a defect cannot count as an instance of it. */
const code = (p) => src(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

/** Every file under `dirs` matching `re`, relative to the repo root. */
function walk(dirs, re, skip = /node_modules|src\/generated/) {
  const out = []
  const rec = (dir) => {
    // A directory that does not exist contributes no files — it is not an error. `nutrition/`,
    // `program/` and `docs/` are all provisioned per-chart (README, "Nothing exists by default"),
    // so a chart without one is valid. Before this guard the scan crashed with a raw ENOENT on
    // any chart that had not been given the same directories as the chart it was written on.
    if (!existsSync(join(ROOT, dir))) return
    for (const e of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${e}`
      if (skip.test(rel)) continue
      if (statSync(join(ROOT, rel)).isDirectory()) rec(rel)
      else if (re.test(e)) out.push(rel)
    }
  }
  dirs.forEach(rec)
  return out
}

/**
 * ⚠ THIS FILE IS EXCLUDED FROM THE DEFINITION SCAN, and that is a real hole worth stating: the
 * registry below necessarily contains every pattern it searches for, so scanning itself would
 * report a second home for all of them. The cost is that a genuine duplicate implementation hidden
 * inside this file would not be caught. Keep this file a registry and assertions — put no model
 * arithmetic in it, and the hole stays empty.
 */
const CODE_FILES = walk(['scripts', 'src'], /\.(mjs|ts|tsx)$/)
  .filter((f) => f !== 'scripts/test-single-home.mjs')

// =================================================================================================
console.log('1 · one definition site per construct')
// Each rule scans EVERY code file. `home` is the only file allowed to match; `allow` names any
// other file that legitimately matches, WITH THE REASON — an unexplained exemption is how a
// registry becomes a list of things somebody once decided not to fix.
// =================================================================================================

const DEFINITIONS = [
  {
    name: 'sessionKey, the session-name stem three files must agree on',
    home: 'scripts/lib/sessions.mjs',
    // ⚠ **ANCHORED ON THE IMPLEMENTATION, NOT THE IDENTIFIER, AND THE DIFFERENCE IS FOUR
    // ALLOW ENTRIES.** `sessionKey` as a name additionally appears at every CALL SITE — the
    // duration resolver's, forecast.ts's re-export, the log page's — none of which is a second
    // definition. The parenthetical strip plus the spaced-dash strip is what a second
    // IMPLEMENTATION looks like, and both deliberate mirrors below carry it too.
    pattern: /replace\(\/\\s\*\\\(\.\*\$\/[\s\S]{0,120}?\[—–-\]/,
    allow: {
      'scripts/test-prescriptions.mjs': 'A DELIBERATE MIRROR. It asserts that the resolver behaves '
        + 'the way this stem is specified to behave, so it has to write the stem out — a mirror '
        + 'that imported the thing it mirrors would assert nothing (F-58).',
      'scripts/test-views.mjs': 'The same deliberate mirror, for rollup/forecast rather than for '
        + 'the prescription resolver. Same reason.',
    },
    why: 'it moved out of src/lib/forecast.ts because scripts/ cannot import TypeScript and the '
      + 'duration resolver needs the same stem — two implementations would be two answers to '
      + '"are these two logs of the same session comparable"',
  },
  {
    name: 'the weekday key list',
    home: 'scripts/lib/weekdays.mjs',
    // ⚠ **ORDER-INDEPENDENT: three quoted weekday abbreviations in a row IS the list.** The first
    // version anchored on `'Sun', 'Mon'` and so could only see a Sunday-first literal —
    // `test-prescriptions.mjs` already held a Mon-first copy of the same seven strings and matched
    // nothing. A rule that reads as "one home" and is really "one home, if the next copy happens
    // to start on Sunday" is worse than none, because it is believed.
    pattern: /(['"])(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\1[,\s]+(['"])(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\2[,\s]+(['"])(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\3/,
    why: 'it had FOUR homes — generate-targets, data.ts, test-views and findings.mjs — which all '
      + 'happened to agree, so nothing ever went red. What was wrong was the PROSE describing '
      + 'them: constants.template.json documented mon|tue|… in two comments and its _example, so '
      + 'a chart that followed its own template had no calorie target on any day, forever',
  },
  {
    name: 'the session formula, MET × 3.5 × kg / 200',
    home: 'scripts/lib/aggregate.mjs',
    // Matches the arithmetic wherever it is written, not a particular variable name.
    pattern: /3\.5\s*\*[\s\S]{0,80}?\/\s*200\b/,
    allow: {
      'scripts/test-views.mjs': 'THE ONE DELIBERATE RESTATEMENT. Its assertion is that the '
        + 'imported implementation equals the formula written down in data/METHOD.md, so it has '
        + 'to write that formula out — a test that imported the formula in order to check the '
        + 'formula would be vacuous. It is the only place the arithmetic may appear twice.',
    },
    why: 'audit F-67: it existed in four places, and retyping it in build-data-json.mjs is the '
      + 'mechanism by which the 2026-08-12 intensity fix missed the dashboard (F-02)',
  },
  {
    name: 'the pound-to-kilogram conversion',
    home: 'scripts/lib/aggregate.mjs',
    pattern: /0\.45359237|2\.20462/,
    why: 'audit F-67: two constants for one conversion, differing by 1.2e-6 — no wrong number yet, '
      + 'which is exactly why it survived three sweeps',
  },
  {
    name: 'the session-kcal PRECEDENCE (kcal_override → intensity split → flat MET)',
    home: 'scripts/lib/aggregate.mjs',
    // The signature of the decision: a file that reads the override column AND the tier columns is
    // deciding which of them wins. Reading either alone is fine. `_min` rather than `light_min`,
    // because the tier columns are legitimately built from a loop over INTENSITY_TIERS — a pattern
    // naming one literal column would have missed the home itself, which is how it was first
    // written and what running it caught.
    pattern: /kcal_override[\s\S]*_min\b|_min\b[\s\S]*kcal_override/,
    allow: {
      'scripts/lib/schema.mjs': 'declares the columns; makes no decision about which wins',
      'scripts/lib/rowwrite.mjs': 'validates both columns on the write path; computes neither',
      'scripts/validate-data.mjs': 'the CI backstop for the same validation',
      // Added with `costDependsOnDuration`. The duration-resolver fixtures hand a row with an
      // override and a row with an intensity split to that predicate and assert it answers "no
      // duration needed" for both — which VERIFIES the one home rather than competing with it.
      // This entry covers assertions ABOUT the precedence; a file that started DECIDING it would
      // still be wrong, and what makes this safe is that the deciding lives one import away and
      // every other check in this suite runs against that import.
      'scripts/test-aggregations.mjs': 'asserts the predicate that reads both columns; decides nothing',
    },
    why: 'audit F-02: the precedence in one file and its third level alone in another is how the '
      + 'ledger said 774 and the dashboard said 1,328 for the same session',
  },
  {
    name: 'the CSV grammar (quoted-field scanner)',
    home: 'scripts/lib/csv.mjs',
    pattern: /quoted\s*=\s*true/,
    why: 'audit F-10: two implementations of one grammar, inside the code that defends against '
      + 'two-homes defects — and both carried the mid-field-quote bug',
  },
  {
    name: 'CSV quoting (the write half of the same grammar)',
    home: 'scripts/lib/csv.mjs',
    pattern: /replace\(\/"\/g, '""'\)/,
    why: 'rowwrite.mjs carried a copy under a comment reading "must not diverge", which is a '
      + 'comment, not a mechanism',
  },
  {
    name: 'COUNTS_TOWARD_FLOOR, the sessions-floor set',
    home: 'src/lib/data.ts',
    // `const|let|var` prefix required: scripts/test-views.mjs carries this name inside a REGEX
    // LITERAL, because it reads the home's definition back out in order to assert its contents.
    // Reading a definition is not declaring one.
    pattern: /\b(?:const|let|var)\s+COUNTS_TOWARD_FLOOR\s*=/,
    why: 'audit F-70: identical in rollup.ts and forecast.ts, and the drift guard parsed rollup.ts '
      + 'only — so the home page and Next 7 Days could count different sessions against one floor',
  },
  {
    name: 'MIN_READINGS_FOR_PROJECTION',
    home: 'src/lib/data.ts',
    pattern: /MIN_READINGS_FOR_PROJECTION\s*=\s*\d/,
    why: 'audit F-71: the page and trend()\'s own default were two separate 7s',
  },
  {
    name: 'METHOD_VERSION',
    home: 'scripts/lib/method-version.mjs',
    pattern: /METHOD_VERSION\s*=\s*\d/,
    why: 'the version stamped on every energy.csv row must have one source, or a bump reaches some '
      + 'rows and not others',
  },
  {
    name: 'KCAL_PER_LB_FAT, the 3,500 kcal/lb modelling constant',
    home: 'scripts/lib/athlete.mjs',
    pattern: /\b3500\b/,
    why: 'used by the recalibration method, the findings layer and History; a second literal is '
      + 'X-8 by the constant\'s own docstring',
  },
  {
    name: 'latestOnOrBefore — "what is in force on this date"',
    home: 'scripts/lib/aggregate.mjs',
    pattern: /function latestOnOrBefore/,
    why: 'compute-energy.mjs and build-data-json.mjs each carried a forward-fill of this rule, the '
      + 'second with a comment saying it matched the first',
  },
  {
    name: 'allOnOrBefore — "every outstanding row, not just the newest"',
    home: 'scripts/lib/aggregate.mjs',
    pattern: /function allOnOrBefore/,
    why: 'the dismissible coach-notes surface (src/components/CoachNotes.tsx) is the one caller; a '
      + 'second copy of "every row on or before this date" is how it would quietly start '
      + 'disagreeing with allOf/latestOnOrBefore about which rows exist',
  },
  {
    name: 'the reserved session names',
    home: 'scripts/lib/sessions.mjs',
    // The literal declaration, not the identifiers: `RESERVED_SESSIONS` imported and used is
    // fine, a file writing the string 'Daily' or 'Supplements' of its own is not. `forecast.ts`
    // re-exports `export const DAILY = SESSION_DAILY`, which has no literal and correctly does
    // not match — it renders the name, it does not declare it.
    pattern: /=\s*['"](?:Daily|Supplements)['"]|['"](?:Daily|Supplements)['"]\s*(?:,\s*['"](?:Daily|Supplements)['"]|\])/,
    why: 'W6: they had FOUR homes — forecast.ts declared them, test-prescriptions.mjs declared its '
      + 'own Set, test-views.mjs regex-parsed forecast.ts, and check-suspensions.mjs was about to '
      + 'need a fifth. A reserved name that one consumer does not reserve is a session whose '
      + 'prescription rows are invisible to that consumer',
  },
  {
    name: 'livePrescriptions — "the newest rows for a session something can still land on"',
    home: 'scripts/lib/suspensions.mjs',
    // The signature of the decision: filter by session, then reduce to the max date, then keep
    // that date's rows. `markerAudit` had this inline and check-suspensions needed the same answer.
    pattern: /reduce\(\(max, p\) => \(p\.date > max \? p\.date : max\)/,
    allow: {
      'scripts/test-views.mjs': 'mirrors the TypeScript resolver deliberately — its header states '
        + 'the cost and every mirror is paired with a grep back at the real source',
      'scripts/test-prescriptions.mjs': 'the same deliberate mirror, and the file this repo relies '
        + 'on to prove the resolver picks max-by-date rather than last-row-in-file. A mirror that '
        + 'imported the thing it mirrors would assert nothing (audit F-58)',
      'src/lib/forecast.ts': 'the dashboard\'s effectiveRx; TypeScript cannot import a module that '
        + 'reads the filesystem, which is the same constraint that put sessionCost in '
        + 'aggregate.mjs. The behavioural assertion in section 3 above is what keeps the two '
        + 'answers equal',
    },
    why: 'W6: `Session One`\'s 2026-08-06 goblet-squat rows are still that session\'s newest set and '
      + 'are harmless ONLY because weeklyTemplate stopped naming it. Two definitions of "live" is '
      + 'two answers to "is that prescription in force"',
  },
  {
    name: 'the RMR coefficients',
    home: 'scripts/lib/athlete.mjs',
    // Not `6.25 *`: the coefficients are a named object now, so the multiplication reads
    // `perCm * (heightIn * 2.54)`. A pattern matching the old shape passed vacuously.
    pattern: /\b6\.25\b/,
    why: 'Mifflin-St Jeor written out twice would make two RMRs under one method_version',
  },
]

for (const rule of DEFINITIONS) {
  const hits = CODE_FILES.filter((f) => rule.pattern.test(code(f)))
  const extras = hits.filter((f) => f !== rule.home && !(rule.allow ?? {})[f])

  if (!hits.includes(rule.home)) {
    bad(`${rule.name}: its declared home no longer defines it`,
      `expected ${rule.pattern} in ${rule.home}. Either the definition moved — update this `
      + 'registry — or it was deleted and something else is doing the job.')
  } else if (extras.length) {
    bad(`${rule.name}: ${extras.length} second home(s)`,
      `${extras.join('\n')}\nIt belongs in ${rule.home} and must be imported from there.\n${rule.why}`)
  } else {
    const allowed = Object.keys(rule.allow ?? {}).filter((f) => hits.includes(f))
    ok(`${rule.name} — one home${allowed.length ? ` (+${allowed.length} declared exemption(s))` : ''}`)
  }
}

// -------------------------------------------------------------------------------------------
// A COMPANION RULE, and the reason it exists is worth stating: the formula pattern above is
// **defeatable**, and I defeated it on purpose before shipping this. A file that writes
// `MET_COEF` and `DIV` instead of `3.5` and `200`, and `${tier}_min` instead of `light_min`,
// computes a per-session estimate and matches neither pattern.
//
// So: **anything that reaches for a MET must also reach for the shared costing.** A MET has
// exactly one use in this system — costing a session — and a file that looks one up without
// importing `sessionCost` or `sessionKcal` is by construction computing its own. That is the
// signature the sneak attempt could not shed, because it needed the MET table to work at all.
// -------------------------------------------------------------------------------------------
{
  const LOOKS_UP_MET = /metByType|metByIntensity|metFor\(|metForIntensity\(|metTable\(|chartMetOf/
  const USES_SHARED_COSTING = /sessionCost|sessionKcal|metTableDoc|metByIntensityDoc/
  const MET_EXEMPT = {
    'src/lib/data.ts': 'type declarations for the bundled plan object; it costs nothing',
    'scripts/validate-data.mjs': 'range-checks the session-type registry\'s met values as data — '
      + 'is it a number between 0 and 25 — and costs no session (W7)',
    'scripts/test-rowwrite.mjs': 'asserts the type enum and the MET table are the same list, which '
      + 'is a schema-completeness claim about the KEYS; it reads no MET value (W7, audit F-07)',
  }

  const rogue = CODE_FILES.filter((f) => {
    const text = code(f)
    return LOOKS_UP_MET.test(text) && !USES_SHARED_COSTING.test(text) && !MET_EXEMPT[f]
  })
  yes('every file that looks up a MET uses the shared costing', rogue.length === 0,
    `${rogue.join('\n')}\nA MET has one purpose — costing a session — so looking one up without `
    + 'importing sessionCost/sessionKcal from scripts/lib/aggregate.mjs means computing a second '
    + 'answer. Import it, or add an exemption here saying what else the MET is for.')
}

// An exemption that no longer matches is an exemption nobody is checking. It reads as coverage.
for (const rule of DEFINITIONS) {
  for (const [file, reason] of Object.entries(rule.allow ?? {})) {
    if (!rule.pattern.test(code(file))) {
      bad(`${rule.name}: the exemption for ${file} is stale`,
        `it no longer matches, so the entry is dead weight claiming to be a considered decision.\n`
        + `Recorded reason: ${reason}`)
    }
  }
}

// =================================================================================================
console.log('\n2 · prose renders the constant; it never restates a figure of its own')
// Every statement of a registered threshold, in every chart document, must agree with
// athlete/constants.json. **Only agreement is checked — nothing here decides what a number
// should be**, which is the line between this check and the one that invented a clinical
// threshold to go green.
// =================================================================================================

const constants = JSON.parse(src('athlete/constants.json'))

/**
 * Files whose figures must be live. `logs/` (except templates), `decisions.md`, `docs/audit/`,
 * `docs/INVARIANTS.md`, `docs/BUILD-PLAN.md` and `archive/` are the historical and planning
 * record: they quote figures that were true when written, and correcting them would be falsifying
 * the evidence rather than fixing a drift.
 */
const PROSE_FILES = [
  // ⚠ **`data/METHOD.md` IS HERE BECAUSE IT IS THE DOCUMENT MOST LIKELY TO RESTATE A CONSTANT.**
  // It describes the burn model in prose, so every figure the model uses has a natural home in a
  // sentence here — and until this list included it, a FIGURES row pointed at a number stated only
  // in METHOD.md ran over nothing at all and reported itself green. A rule that scans no file
  // containing the thing it checks is worse than no rule, because it is believed.
  'CLAUDE.md', 'README.md', 'data/METHOD.md',
  ...walk(['athlete', 'nutrition', 'program', 'skills', '.claude'], /\.md$/),
  ...walk(['docs/modules', 'docs/build-prd'], /\.md$/),
  ...readdirSync(join(ROOT, 'logs')).filter((f) => /^TEMPLATE-.*\.md$/.test(f)).map((f) => `logs/${f}`),
].filter((f) => !/athlete\/specialization/.test(f))

/**
 * A statement — a bullet, a paragraph, a table row, a quoted line. Scoping to this rather than to
 * a character window is what lets a document *describe* a threshold's history without tripping on
 * the historical figure, while still catching a live claim that states the wrong one.
 *
 * ⚠ **DELIBERATELY NOT SENTENCE-SCOPED, and running the red fixture is what settled it.** The
 * first version split on sentence boundaries too, and against F-28's actual wording —
 * *"Stalled with adherence below 85% → this is not a nutrition problem. Route to the adherence
 * agent."* — the figure and the routing verb landed in two different sentences and the check
 * passed. It would have shipped green against the very defect it was written for. A rule is one
 * bullet, because that is the unit a rule is written in.
 */
const statements = (text) => text.split(/\n\s*\n|\n(?=\s*(?:[-*|#]|>\s*(?:[-*|#]|\*\*)))/)

/**
 * The one escape hatch, and it is deliberately verbose and greppable. A statement carrying it is
 * narrating what a figure USED to be. Anything shorter would get typed reflexively.
 */
const HISTORICAL = '(historical — not the live threshold)'

const FIGURES = [
  {
    name: 'program.setRestSec',
    /**
     * ⚠ **THE CONSTANT, NOT THE CONSTANTS KEY — and reading only the key makes this row INERT on
     * exactly the charts it protects.** `test-single-home` skips a FIGURES row whose `value` is
     * null, and `program.setRestSec` is optional: a chart that keeps the shipped default has no
     * such key, so `constants.program?.setRestSec` alone is null and the check silently stops
     * running on every default chart. `?? SET_REST_SEC` is what makes it fire there.
     */
    value: constants.program?.setRestSec ?? SET_REST_SEC,
    context: /rest between sets|rest\b/i,
    subject: /\bsets?\b/i,
    figure: /(\d{2,3})\s*s(?:ec(?:onds?)?)?\s+rest/gi,
    why: 'data/METHOD.md states the duration-reconstruction rule in prose and had the rest figure '
      + 'written into that sentence as a literal, which is a second home for a value the constants '
      + 'own — and one a chart may legitimately change',
  },
  {
    name: 'plan.adherenceRoutingPct',
    value: constants.plan.adherenceRoutingPct,
    /** The decision, not the word: a statement about WHICH SPECIALIST TO CONSULT. */
    context: /route|routing|consult|instead of the domain specialists|instead of the two above/i,
    subject: /adherence/i,
    figure: /(\d{2,3})\s?%/g,
    why: 'audit F-28: 80% in four files and 85% in two, so the system gave two defensible and '
      + 'contradictory answers to the routing question it exists to settle',
    note: 'NOT the same threshold as the stall-diagnosis gate in skills/weekly-review and '
      + 'skills/nutrition-targets, which answers "does a plateau indict the plan?" and is '
      + 'deliberately left at its own figure. Merging two real thresholds is the same damage as '
      + 'splitting one.',
  },
  {
    name: 'plan.proteinFloorG',
    value: constants.plan.proteinFloorG,
    context: /protein floor/i,
    subject: /protein/i,
    figure: /protein floor[^.\n]{0,60}?(\d{2,3})\s*g/gi,
    why: 'audit F-29: 150 on the dashboard, 165 in the graded process goal, 165–175 in the plan\'s '
      + 'own counterargument — so a day between the two was a hit and a miss at once',
  },
  {
    name: 'plan.proteinAimG',
    value: constants.plan.proteinAimG,
    context: /\baim\s+\d{2,3}\s*g/i,
    subject: /protein/i,
    figure: /\baim\s+(\d{2,3})\s*g\b/gi,
    why: 'audit F-29, the other half: the aim is what goals.md grades them on',
  },
  // ── added 2026-08-14 (W6) ──────────────────────────────────────────────────────────────────
  // X-3's `check-prose-numbers.mjs`, built as three more rows here rather than as a second
  // scanner — see this file's header. Each is a figure `generate-targets.mjs` or the dashboard
  // emits every day from `constants.json` while prose states it independently, which is the exact
  // shape of F-13: *they eat to a number the coach believes it changed.*
  {
    name: 'plan.weeklyKcalBudget',
    value: constants.plan.weeklyKcalBudget,
    context: /weekly (?:target|budget)/i,
    subject: /kcal|calorie/i,
    figure: /weekly (?:target|budget)[^.\n]{0,30}?([\d,]{5,6})\s*kcal/gi,
    why: 'the weekly budget is the sum every daily target is cut from; a prose copy that drifts '
      + 'makes the weekday structure and the week disagree with nothing to reveal it',
  },
  {
    name: 'plan.estMaintenanceKcal',
    value: constants.plan.estMaintenanceKcal,
    context: /maintenance/i,
    subject: /estimat|~/i,
    figure: /maintenance[^.\n]{0,40}?\*\*~?([\d,]{4,5})\s*kcal/gi,
    why: 'the deficit is quoted as a percentage off this number in two files; the 2026-08-27 '
      + 'recalibration replaces it, and a prose copy would survive the replacement',
  },
  // ── added 2026-08-14, with the weekly budget card ─────────────────────────────────────────
  {
    name: 'plan.weeklyAlcoholKcalBudget',
    value: constants.plan.weeklyAlcoholKcalBudget,
    context: /alcohol|wine/i,
    subject: /budget|allowance/i,
    // Anchored on the word, and requiring the comma-grouped thousands form, so a statement about
    // the CALORIE budget sitting in the same bullet cannot be read as a statement about this one.
    figure: /(?:budget|allowance)\D{0,40}?\b(\d{1,2},\d{3})\s*kcal/gi,
    why: 'the figure is the athlete\'s own and the weekly FOOD allowance is derived '
      + 'by subtracting it — so a prose copy that drifts moves a number they never touched, and '
      + 'moves it silently, in the direction of more food',
    note: 'nutrition/plan.md carried a weekly figure as an OBSERVATION of their intake for '
      + 'days before they ruled on it; that sentence is kept, marked historical, because the '
      + 'distinction between an observation and a budget is the whole reason X-16 exists.',
  },
  {
    name: 'plan.stepsPerDayTarget',
    value: constants.plan.stepsPerDayTarget,
    context: /step/i,
    subject: /\/day|per day|daily|a day/i,
    figure: /(?:≥|>=|at least\s*)([\d,]{4,6})\s*(?:steps|\/day)/gi,
    why: 'a process goal they are graded on weekly, restated in goals.md and current-block.md while '
      + 'the rollup counts against the constant',
  },
]

for (const f of FIGURES) {
  const wrong = []
  let checked = 0
  // ⚠ A CONSTANT THIS CHART HAS NOT SET IS NOT A FAILURE. Several of these are optional and
  // per-domain — `weeklyKcalBudget` and `weeklyAlcoholKcalBudget` mean nothing on a chart whose
  // domains are symptom control and sleep. Without this guard the comparison below runs against
  // `Number(undefined)`, which is NaN and never equal to anything, so any prose the rule matched
  // would be reported as drift from a number nobody has. That is F-30's shape: a suite red on a
  // new athlete's first push for a fact about a different athlete.
  if (f.value == null) {
    ok(`${f.name} is not set on this chart — nothing to render, nothing to check`)
    continue
  }
  for (const file of PROSE_FILES) {
    const text = src(file)
    for (const s of statements(text)) {
      if (s.includes(HISTORICAL)) continue
      if (!f.context.test(s) || !f.subject.test(s)) continue
      for (const m of s.matchAll(f.figure)) {
        const stated = Number(String(m.slice(1).find((g) => g != null)).replace(/,/g, ''))
        checked++
        if (stated !== Number(f.value)) {
          wrong.push(`${file}: states ${stated}, ${f.name} is ${f.value}\n    “${s.trim().slice(0, 160)}”`)
        }
      }
    }
  }
  if (wrong.length) {
    bad(`${f.name}: ${wrong.length} statement(s) disagree with athlete/constants.json`,
      `${wrong.join('\n')}\n\n${f.why}\n`
      + `FIX BY CORRECTING THE PROSE TO THE CONSTANT — not by changing the constant to match the `
      + `prose, and never by picking whichever number looks right. If the two figures are really `
      + `two different thresholds, say so in the prose and mark the historical one with `
      + `"${HISTORICAL}".${f.note ? `\n${f.note}` : ''}`)
  } else {
    ok(`${f.name} = ${f.value} — ${checked} statement(s) across the chart, all rendering it`)
  }
}

// The escape hatch must not become the answer. If it is ever used more than a handful of times,
// somebody is silencing the check rather than fixing prose.
{
  const uses = PROSE_FILES.filter((f) => src(f).includes(HISTORICAL))
  yes(`the "${HISTORICAL}" escape is used in ${uses.length} file(s), all narrating a past figure`,
    uses.length <= 4, uses.join('\n'))
}

// =================================================================================================
console.log('\n2b · a prescription written in prose renders data/prescriptions.csv (W6, X-3)')
//
// The other half of X-3's `check-prose-numbers.mjs`. `constants.json` is not the only machine home
// a prose figure can disagree with — `prescriptions.csv` is one too, and it is the one the athlete
// acts on with a bell in their hand.
//
// THE LIVE INSTANCE: `skills/daily-dashboard`'s worked example printed `Bent-over KB rows 3 x 8-12
// @ 35 lb` and `Suitcase carry 3 x 30-40s/side @ 35 lb`. Both were re-anchored to **50 lb** on
// 2026-08-11 at the athlete's own instruction, and the carry's 30-40 s dose sat entirely below the
// fire line of the marker it exists to feed. A coach following that skill renders the superseded
// figures into the chart they are shown (audit F-35, F-50, and F-37's dose half).
//
// THE MATCH IS DELIBERATELY NARROW: a statement is only read as a prescription when it carries a
// sets×reps shape AND a load. That is what a prescription line looks like and nothing else does,
// so a paragraph merely *mentioning* an exercise near a number is never read as prescribing it.
// The earlier, looser version matched any statement naming the exercise, and "with one 35 lb KB
// (+ a heavier one incoming)" — a sentence about equipment — read as a prescription of every
// exercise it sat near.
// =================================================================================================

{
  const template = constants.program?.weeklyTemplate ?? {}
  const live = livePrescriptions({
    prescriptions: readCsv(join(ROOT, 'data', 'prescriptions.csv')),
    sessions: [...Object.values(template).map((e) => e?.session), ...RESERVED_SESSIONS],
    today: localToday(),
  }).filter((r) => /\d/.test(String(r.load ?? '')))

  /**
   * The dose token — `3 x 8-12`, `3×10`, `2 × 15`. Everything before it on the line is the
   * exercise, everything on the line is searched for a load.
   *
   * ⚠ **DELIBERATELY NOT ANCHORED TO A LAYOUT, because three attempts to dodge the first version
   * all succeeded.** It required two-or-more spaces between the name and the dose — the fixed-width
   * shape the live worked example happens to use — so the same wrong load written with one space,
   * or as a table row, or as `35 pounds`, sailed through. A check that only sees the formatting it
   * was written against is a check the next author defeats by accident.
   */
  const DOSE = /(\d+)\s*[x×]\s*/
  const LOAD = /(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/gi

  const wrong = []
  let checked = 0
  for (const file of PROSE_FILES) {
    for (const s of statements(src(file))) {
      if (s.includes(HISTORICAL)) continue
      for (const rawLine of s.split('\n')) {
        const at = rawLine.search(DOSE)
        if (at < 0) continue
        const stated = [...rawLine.matchAll(LOAD)].map((x) => Number(x[1]))
        if (!stated.length) continue
        // Everything left of the dose, minus table pipes, bullets and emphasis, is the name.
        const name = rawLine.slice(0, at).replace(/[|*`>#]/g, ' ').replace(/^[-\s]+/, '').trim()
        if (name.length < 3) continue
        const row = live.find((r) => names(name, r.exercise))
        if (!row) continue
        checked++
        const prescribed = Number(String(row.load).match(/(\d+(?:\.\d+)?)/)?.[1])
        if (!Number.isFinite(prescribed) || stated.includes(prescribed)) continue
        wrong.push(`${file}: “${rawLine.trim()}”\n    states ${stated.join('/')} lb; `
          + `data/prescriptions.csv ${row.date} ${row.session} #${row.order} `
          + `“${row.exercise}” prescribes ${row.load} × ${row.reps}`)
      }
    }
  }

  if (wrong.length) {
    bad(`${wrong.length} prose prescription(s) disagree with data/prescriptions.csv`,
      `${wrong.join('\n')}\n\nCORRECT THE PROSE TO THE ROW. data/ is the source and prose renders `
      + 'it (CLAUDE.md §0.3) — never the other way round, and never by choosing whichever load '
      + 'looks right. If the row is the thing that is wrong, that is a coaching decision and it is '
      + 'made in conversation and written to the CSV first.')
  } else {
    ok(`prose prescriptions render prescriptions.csv — ${checked} line(s) matched to a live row`)
  }

  // ⚠ A check with nothing to check is a check that certifies whatever happens next. Of nine
  // exercises the block currently prescribes, only a handful carry a numeric load at all, and if
  // the last worked example were ever deleted from the skills this would go permanently, silently
  // green — the failure W5 found in its own suite and W4 found in `pctOfTarget`.
  //
  // ⚠ APPLICABILITY-GATED SINCE W7 (audit F-30). It asserted `checked > 0` unconditionally, which
  // is a true statement about a chart that has a block with numeric loads and a false one about
  // every chart on day one. The guard it exists to be — "this rule proved nothing on this run" —
  // is kept where it can mean something: a chart that HAS live prescriptions carrying a load must
  // have matched at least one. A chart with none reports that, which is the honest answer.
  if (!live.length) {
    ok('no live prescription carries a numeric load — the prose-prescription rule is not applicable')
  } else {
    yes('…and at least one live prose prescription exists to check', checked > 0,
      `${live.length} live prescription(s) carry a load and no statement in the chart renders one, `
      + 'so the rule above proved nothing on this run. Either a worked example was deleted from '
      + 'skills/, or the line format changed. Restore one, or the rule is decoration.')
  }
}

// =================================================================================================
console.log('\n3 · the two consumers of a shared computation actually agree (F-02)')
// A grep proves one implementation EXISTS. Only arithmetic proves both callers use it. This is the
// assertion that would have caught F-02 on the day it shipped.
// =================================================================================================

{
  const bundle = JSON.parse(src('src/generated/data.json'))
  const energy = Object.fromEntries(readCsv(join(ROOT, 'data', 'energy.csv')).map((r) => [r.date, r]))

  // ⚠ **`Number('')` IS `0`, SO THE OLD ARITHMETIC TURNED "NO FIGURE COULD BE COMPUTED" INTO A
  // MEASURED ZERO** — inside the suite whose §1 rule is X-1, that empty means not measured. The
  // two states are not interchangeable here: a day whose ledger is BLANK (some session was
  // uncostable) and whose dashboard carries a costed session is a real disagreement, and the old
  // arithmetic reported it as `ledger 0, dashboard N` only by accident, while `blank vs blank` and
  // `measured 0 vs blank` both passed as agreement. It never showed up because no day on the chart
  // it was written against happened to mix a costed and an uncostable session. That is luck, not
  // coverage, and luck is what the duration resolver changes.
  //
  // `kcalLevel === 'unknown'` is the dashboard's own word for the condition `compute-energy` calls
  // `sessionUnknown`, so the two sides are compared on the STATE as well as on the number.
  const perDate = {}
  for (const t of bundle.training) {
    if (t.status !== 'completed') continue
    const cur = perDate[t.date] ?? { kcal: 0, unknown: false }
    // A walk is `counted-elsewhere` and legitimately blank — its energy is already in steps_kcal.
    // Only `unknown` means nobody could cost it, which is the state the ledger blanks the day for.
    if (t.kcalLevel === 'unknown') cur.unknown = true
    else cur.kcal += t.estKcalBurned === '' ? 0 : Number(t.estKcalBurned)
    perDate[t.date] = cur
  }

  const off = []
  /** Dates this check cannot compare numerically — see the note on the `continue` below. */
  const uncosted = []
  for (const [date, row] of Object.entries(energy)) {
    const ledgerBlank = String(row.session_kcal ?? '').trim() === ''
    const dash = perDate[date] ?? { kcal: 0, unknown: false }
    if (ledgerBlank !== dash.unknown) {
      off.push(`${date}: ledger ${ledgerBlank ? 'blank (uncostable)' : `${row.session_kcal}`}, `
        + `dashboard ${dash.unknown ? 'has an uncostable session' : `${dash.kcal}`} — one side `
        + 'recorded a gap and the other did not')
      continue
    }
    // ⚠ **A MIXED DAY LEAVES NUMERIC COVERAGE, AND THE COUNT IS REPORTED RATHER THAN SWALLOWED.**
    // Once one session on a date is uncostable the ledger blanks the WHOLE day, so there is no
    // ledger number left to compare the day's costed sessions against — this check cannot cover
    // it, and pretending otherwise would mean comparing against a zero, which is the exact
    // coercion this block was rewritten to remove. What must not happen is the coverage shrinking
    // silently: the duration resolver makes uncostable days rarer but never zero, and a suite that
    // quietly stops checking days is how F-02 got back in. The tally is printed on every run.
    if (ledgerBlank) { uncosted.push(date); continue }
    // 1 kcal per session, for the rounding each side does independently.
    if (Math.abs(Number(row.session_kcal) - dash.kcal) > 2) {
      off.push(`${date}: ledger ${row.session_kcal}, dashboard ${dash.kcal}`)
    }
  }

  const covered = Object.keys(energy).length - uncosted.length
  yes(`every day's per-session figures sum to energy.csv's session_kcal `
    + `(${covered} of ${Object.keys(energy).length} days compared`
    + `${uncosted.length ? `; ${uncosted.length} uncostable: ${uncosted.join(', ')}` : ''})`,
    off.length === 0,
    `${off.join('\n')}\nThe ledger and the dashboard are computing session burn differently again. `
    + 'When this last happened the gaps were +554 and +401 kcal on two days, both flattering, both '
    + 'on the number the athlete eats against (audit F-02).')

  // And the figure is rendered, not merely computed. X-15: a number no page shows has failed the
  // same way as a number never written — which is what W4 left this column as.
  yes('History renders the per-session figure', /estKcalBurned/.test(src('src/app/history/page.tsx')))
  yes('Today renders it too', /estKcalBurned/.test(src('src/app/today/page.tsx')))

  // X-15, W6: alcohol was written on every meal row, priced in plan.md as their single largest
  // discretionary lever, and rendered on no page at all (audit F-38, F-69). A number no page shows
  // has failed the same way as a number never written.
  yes('History renders the week\'s alcohol, with its own day count beside it',
    /alcoholKcal/.test(src('src/app/history/page.tsx'))
    && /alcoholDaysLogged/.test(src('src/app/history/page.tsx')))
  yes('Today renders the day\'s alcohol, and its daily meter only where a target exists',
    /targetAlcoholKcal/.test(src('src/app/today/page.tsx')))

  // ⚠ REWRITTEN: THE PREMISE OF THE OLD ASSERTION WAS RETIRED BY THE ATHLETE.
  //
  // It read "the Meals caption does not promise an alcohol budget nobody has set", and it was
  // right for as long as plan.md's weekly figure was an OBSERVATION of what they drink: drawing a
  // meter against it would have filed a coach's inference as their instruction. Then they set one,
  // athlete-confirmed. The finding that asked for it
  // (`alcohol-budget-unset`) closed the way it was designed to — by them answering, not by anyone
  // picking a number.
  //
  // What replaces it is the half of that rule which did NOT expire: **a budget they set weekly must
  // not be rendered as a daily one.** The old check would now pass against a page dividing 1,400
  // by seven, which is the defect that actually remains available.
  {
    const page = src('src/app/today/page.tsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    const budget = constants.plan.weeklyAlcoholKcalBudget
    yes('the weekly alcohol allowance is rendered against the week, never split across days',
      budget == null
        || (/budget\.alcohol/.test(page) && !new RegExp(`\\b${budget / 7}\\b`).test(page)),
      `a per-day share of ${budget} would be ${budget / 7} kcal/day — a number nobody set. Their `
      + 'drinking is uneven on purpose — a plan puts the heavy evening away from the training '
      + 'nights — so the allowance is weekly and data/targets.csv\'s alcohol_kcal stays blank.')
  }
}

// =================================================================================================
console.log('\n3b · all three precedence levels, on fixtures rather than on what the chart holds')
// =================================================================================================

/**
 * ⚠ THE RECONCILIATION ABOVE CANNOT SEE THE `kcal_override` LEVEL, AND THAT IS NOT A THEORETICAL
 * GAP.
 *
 * It compares the bundle against `energy.csv` over the chart's live rows. Of nine completed
 * sessions, **two carry an intensity split and NONE carries an override** — so the top level of the
 * precedence is exercised by no live data at all. Demonstrated: bypassing the override in
 * `build-data-json.mjs` (`sessionCostFor({ ...row, kcal_override: '' }, …)`) leaves every grep rule
 * green AND the reconciliation green, because the two files still agree — they agree about a branch
 * neither one takes.
 *
 * That is a check green by absence of data, on the exact axis where the next divergence will land:
 * A chart's own row may already carry a note saying the figure is provisional and will be
 * overwritten once the session is actually performed, so the uncovered branch has a date on it.
 *
 * Fixtures, not live rows, for the same reason `INVARIANTS.md` X-11 wants them everywhere: a check
 * that only holds while the chart happens to contain something is a check that silently stops
 * holding.
 */
{
  // Synthetic type names. They must not be any real chart's registry keys: two of those on one
  // line is the enum restated into a shared file, which is the X-11 defect the leak scanner
  // reports and which this fixture used to be an instance of.
  const met = (type, tier) => (tier ? { light: 4.8, moderate: 7, hard: 10 }[tier] : ({ hardType: 10, easyType: 3.5 })[type] ?? 4)
  const W = 180

  const override = sessionCost({ type: 'hardType', kcal_override: '500', duration_min: '90' }, W, met)
  yes('an override wins over duration and tiers',
    override.level === 'override' && override.kcal === 500, `${override.level} ${override.kcal}`)

  const split = sessionCost({ type: 'hardType', duration_min: '80', light_min: '60', hard_min: '20' }, W, met)
  const flatSame = sessionCost({ type: 'hardType', duration_min: '80' }, W, met)
  yes('a split is costed per tier, not at the hardest one', split.level === 'split', split.level)
  yes('...and therefore costs strictly less than the flat MET over the same minutes',
    split.kcal < flatSame.kcal, `split ${split.kcal} vs flat ${flatSame.kcal}`)

  yes('with neither, the flat MET over duration', flatSame.level === 'flat', flatSame.level)
  yes('no duration is UNKNOWN, never zero',
    sessionCost({ type: 'hardType' }, W, met).kcal === null, String(sessionCost({ type: 'hardType' }, W, met).kcal))

  // The precedence is an ORDER, so assert each level actually outranks the one below it rather
  // than merely working in isolation — the F-02 defect was a lower level answering for a higher.
  const both = sessionCost(
    { type: 'hardType', kcal_override: '500', duration_min: '80', light_min: '60', hard_min: '20' }, W, met)
  yes('override outranks a split that is also present', both.kcal === 500, String(both.kcal))
  const splitWins = sessionCost({ type: 'hardType', duration_min: '80', light_min: '80' }, W, met)
  yes('a split outranks the flat MET that is also available',
    splitWins.level === 'split' && splitWins.kcal !== flatSame.kcal,
    `${splitWins.level} ${splitWins.kcal} vs flat ${flatSame.kcal}`)
}

// =================================================================================================
console.log('\n4 · one CSV grammar, and it survives an inch mark (F-10)')
// =================================================================================================

{
  const t = 'date,weight_lb,note\n2026-08-01,166,Waist measured at 31.75" this morning\n'
    + '2026-08-02,180,Normal day\n2026-08-03,179,Another\n'
  const rows = parseCsv(t)
  yes('a mid-field quote is a literal, not the start of a quoted field', rows.length === 4,
    `${rows.length} rows, not 4 — three days of weigh-ins parsed as one, and validate-data reports `
    + 'nothing because what survives is a well-formed, ordered, non-duplicate row')
  yes('...and the inch mark is preserved in the note', rows[1][2].includes('31.75"'), rows[1]?.[2])

  // Both entry points, one grammar: the single-line parser must agree with the multi-line one.
  const header = ['date', 'item', 'note']
  const line = '2026-08-01,"Coffee, black","said ""fine"" — waist 31.75"" flat tape"'
  const viaLine = parseLine(line, header)
  const viaCsv = Object.fromEntries(header.map((h, i) => [h, parseCsv(line)[0][i]]))
  yes('parseLine and parseCsv agree field for field', JSON.stringify(viaLine) === JSON.stringify(viaCsv),
    `${JSON.stringify(viaLine)}\n${JSON.stringify(viaCsv)}`)
  yes('...and a doubled quote round-trips as one', viaLine.note.includes('said "fine"'), viaLine.note)

  // A real file must still parse to the same shape it always did — the fix is strictly more
  // permissive and no currently-valid row may move.
  //
  // ⚠ THE PREDICATE CHANGED IN W7 (audit F-30) and it is now stronger, not weaker. It used to be
  // `every file has rows`, with `metrics.csv` exempted by name because that one happened to be
  // empty — a check that asserts THIS chart has history, red on every new chart, and carrying a
  // by-name exemption that would go stale the moment a second file emptied. The real claim is
  // that the parser does not LOSE rows: a file with body lines must parse to that many rows.
  // Vacuous on an empty file, exact on a full one, and no exemption list.
  const files = readdirSync(join(ROOT, 'data')).filter((f) => f.endsWith('.csv'))
  const counts = files.map((f) => {
    const text = readFileSync(join(ROOT, 'data', f), 'utf8')
    const bodyLines = text.replace(/\n$/, '').split('\n').slice(1).filter((l) => l.trim()).length
    return [f, readCsv(join(ROOT, 'data', f)).length, bodyLines]
  })
  // A quoted field may legitimately contain newlines, so parsed rows can be FEWER than raw lines —
  // never more, and never zero where lines exist. That is the loss the CSV grammar fix was about.
  const lost = counts.filter(([, parsed, lines]) => (lines > 0 && parsed === 0) || parsed > lines)
  yes(`no data/ file loses rows to the parser (${counts.map(([f, n]) => `${f} ${n}`).join(' · ')})`,
    lost.length === 0, JSON.stringify(lost))
}

// =================================================================================================
console.log('\n5 · generated documents are current, and the model version is honest (F-56, F-64)')
// =================================================================================================

{
  const stale = staleDocs(ROOT)
  yes('every generated block in the docs matches the code that owns it', stale.length === 0,
    `${stale.map((s) => s.file).join('\n')}\nRun \`node scripts/build-docs.mjs\` and commit the result.`)

  // The MET table used to be hand-typed into three documents and had drifted in all three — one of
  // which compiles into the shareable PDF. Assert the values are actually present, so deleting the
  // markers cannot quietly turn the check into a no-op.
  //
  // ⚠ THE ASSERTION NAMES A TYPE READ OUT OF THE REGISTRY, NOT A LITERAL. It used to hardcode one
  // athlete's sport and its MET value into a shared suite (X-11), which meant it would have gone
  // red on every chart that did not happen to do that sport.
  const method = src('data/METHOD.md')
  const [firstType, firstMet] = Object.entries(metTable())[0]
  yes(`data/METHOD.md carries the generated MET table (checked via \`${firstType}\`)`,
    new RegExp(`GENERATED:met-table[\\s\\S]*?\\|\\s*\`${firstType}\`\\s*\\|\\s*\\*\\*${firstMet}\\*\\*`).test(method))
  // The two SYSTEM documents deliberately no longer enumerate the table — a rebuild spec that lists
  // one athlete's sports describes the wrong system (X-11). What must survive is that the block is
  // rendered rather than silently emptied, and that it still points at the chart's own table.
  // ...where that appendix exists. It is a build artifact of one chart's PRD, not part of the
  // system every chart gets, so its absence is a valid chart and not a skipped check worth
  // failing on. Same reasoning as the walk() guard above.
  if (existsSync(join(ROOT, 'docs/build-prd/appendices.md'))) {
    const appendix = src('docs/build-prd/appendices.md')
    yes('the PDF appendix explains where MET comes from — it is the artifact that gets shared',
      /GENERATED:met-table-inline[\s\S]{0,600}sessionTypes/.test(appendix))
    yes('...and does NOT enumerate this chart\'s activity list into a system document',
      !new RegExp(`GENERATED:met-table-inline[\\s\\S]{0,600}\`${firstType}\``).test(appendix))
  }

  // F-64: a model constant may not change without METHOD_VERSION moving with it.
  const digest = modelDigest()
  yes(`method_version ${METHOD_VERSION} still describes the model it was recorded against`,
    digest === METHOD_DIGEST,
    `recorded ${METHOD_DIGEST}\n           now      ${digest}\n\n`
    + 'A constant in the burn model changed and every historical energy.csv row still claims '
    + `method_version ${METHOD_VERSION} — which is exactly what happens when a session type's MET `
    + 'is corrected, or when a new type is registered (audit F-64). Bump METHOD_VERSION, paste the '
    + 'digest below into '
    + 'METHOD_DIGEST, and record the change in decisions.md. The current model inputs are:\n\n'
    + modelInputsJson())

  // ...and the version actually reaches the rows, rather than being a constant nobody writes.
  // Vacuous on a chart with no ledger yet, exact on one with rows — a chart's first day must not
  // be red for having no history (audit F-30).
  const energyRows = readCsv(join(ROOT, 'data', 'energy.csv'))
  const versions = new Set(energyRows.map((r) => r.method_version))
  yes(`every energy.csv row carries method_version ${METHOD_VERSION} (${energyRows.length} row(s))`,
    [...versions].every((v) => v === String(METHOD_VERSION)),
    `${[...versions].join(', ')} — rows exist under a version this build does not produce`)
}

// =================================================================================================
console.log('\n5b · the library inventories are exhaustive, and something checks that')
// CLAUDE.md §8 and .claude/agents/MANIFEST.md each list what `library/` holds, and both are read
// as complete — "a chart with no program-design skill is a valid chart" only means anything if the
// list of what COULD be copied up is the real one. Nothing compared either list to the directory,
// so a skill added to the library and not to the line is a skill no coach learns exists.
// =================================================================================================

{
  const listed = (text, dir) => new Set(
    [...text.matchAll(/`([a-z][a-z-]+)`/g)].map((m) => m[1]).filter((n) => existsSync(join(ROOT, dir, n))
      || existsSync(join(ROOT, dir, `${n}.md`))),
  )
  // A chart may have no `library/` at all — an older fork, or one that deleted what it promoted.
  // Nothing to compare is not a failure; it is a chart that cannot get this wrong.
  const onDisk = (dir, suffix = '') => new Set(
    existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).map((e) => e.replace(suffix, '')) : [],
  )

  // ⚠ **TO THE NEXT HEADING, NOT TO THE NEXT BLANK LINE.** One of these lists is a sentence and
  // the other is a markdown table with a blank line above it, so a paragraph-sized window read the
  // table as empty and the check failed on a correct file. The window is the section.
  const section = (text, marker) => (text.split(marker)[1] ?? '').split(/\n#{2,3} /)[0]
  const skillsPara = section(src('CLAUDE.md'), 'Available in `skills/library/`')
  const skillsListed = listed(skillsPara, 'skills/library')
  const skillsOnDisk = onDisk('skills/library')
  yes('CLAUDE.md §8 names every skill in skills/library/',
    [...skillsOnDisk].every((n) => skillsListed.has(n)),
    `on disk: ${[...skillsOnDisk].join(', ')}\nnamed:   ${[...skillsListed].join(', ')}`)

  const agentsPara = section(src('.claude/agents/MANIFEST.md'), 'Available in `.claude/agents/library/`')
  const agentsListed = listed(agentsPara, '.claude/agents/library')
  const agentsOnDisk = onDisk('.claude/agents/library', '.md')
  yes('MANIFEST.md names every agent in .claude/agents/library/',
    [...agentsOnDisk].every((n) => agentsListed.has(n)),
    `on disk: ${[...agentsOnDisk].join(', ')}\nnamed:   ${[...agentsListed].join(', ')}`)
}

// =================================================================================================
console.log('\n6 · the 1.5 shortcut and the decomposition never share an axis (F-57)')
// The class, not the two charts that had it: ANY file under src/app or src/components that renders
// a decomposed burn or deficit figure may not also render estMaintenanceKcal. data/METHOD.md says
// in bold that the two must never be mixed — the 1.5 already contains all activity — and mixing
// them put a structural +2,618 kcal/week gap on the page labelled "plan".
// =================================================================================================

{
  /**
   * A page's LOGIC — comments stripped, and explanatory copy stripped too.
   *
   * The distinction is the whole rule: a caption **should** name `estMaintenanceKcal` and say why
   * the line the athlete used to see is gone, and no page may **compute** with it beside a
   * decomposed burn figure. Stripping captions and footnotes is what lets the check demand the
   * first while forbidding the second — and it catches the obvious dodge, `const line =
   * plan.estMaintenanceKcal` followed by `values: [w.burnKcal, line]`, because that assignment is
   * logic wherever it is put.
   */
  const logic = (p) => stripJsxProp(code(p), 'caption').replace(/<p className="footnote">[\s\S]*?<\/p>/g, '')

  const RENDERS_BURN = /burnToDateKcal|deficitToDateKcal|burnSoFarKcal|deficitSoFarKcal|\bburnKcal\b|\bdeficitKcal\b/

  /**
   * ⚠ **THE SHAPE, NOT THE ONE KEY THAT HAS IT.** This matched the literal `estMaintenanceKcal`,
   * so the rule held for exactly the name it was written against and for nothing else. The thing
   * `data/METHOD.md` forbids is mixing a figure of the `RMR × N` form — which already contains all
   * activity — with the decomposition that itemises it; the key's spelling has nothing to do with
   * it, and a second maintenance-shaped key would have walked straight past this.
   *
   * ⚠ **A DECOMPOSITION TERM IS NOT A MAINTENANCE FIGURE AND MUST NOT BE CAUGHT.** The movement
   * term is `step-equivalents × kcal-per-step × weight` — a component INSIDE the decomposition,
   * priced the same way the step term beside it is, and it belongs on the same axis as burn. Both
   * halves are asserted below, because a guard widened until it catches everything forbids the
   * thing it was protecting.
   */
  const MAINTENANCE_SHAPED = /\b\w*[mM]aintenance\w*Kcal\b/
  yes('...and the guard matches the maintenance shape rather than one key name',
    MAINTENANCE_SHAPED.test('plan.estMaintenanceKcal')
    && MAINTENANCE_SHAPED.test('observedMaintenanceKcal')
    && !MAINTENANCE_SHAPED.test('plan.movementKcal'),
    'the widened pattern must still catch estMaintenanceKcal, catch a differently-named twin, and '
    + 'NOT catch a decomposition term — a movement figure priced per step is not an RMR multiple')

  const views = walk(['src/app', 'src/components'], /\.tsx?$/)
  const mixed = views.filter((f) => RENDERS_BURN.test(code(f)) && MAINTENANCE_SHAPED.test(logic(f)))
  yes('no view computes with RMR × 1.5 beside the decomposed burn model', mixed.length === 0,
    `${mixed.join('\n')}\nestMaintenanceKcal is a PLAN-DESIGN input — it may be compared with the `
    + 'calorie budget, which is the same model (that is what findings.mjs does). It may not be '
    + 'plotted against decomposed burn: data/METHOD.md forbids mixing the RMR x 1.5 shortcut with '
    + 'the decomposition in bold, and doing it put a structural weekly gap on the page under the '
    + 'label "plan" (audit F-57). A maintenance figure measured from the chart\'s own ledger is '
    + 'what replaces it; until then the series has no honest plan line.')

  // ...and the athlete is told, rather than a line quietly vanishing off a chart they read weekly.
  yes('History explains the removal instead of silently dropping the line',
    /no plan line on this chart/.test(src('src/app/history/page.tsx')))
}

/** Remove `prop={ … }` from JSX, matching braces so nested expressions come out whole. */
function stripJsxProp(text, prop) {
  let out = ''
  let i = 0
  for (;;) {
    const at = text.indexOf(`${prop}={`, i)
    if (at < 0) return out + text.slice(i)
    out += text.slice(i, at)
    let depth = 0
    let j = at + prop.length + 1
    for (; j < text.length; j++) {
      if (text[j] === '{') depth++
      else if (text[j] === '}' && --depth === 0) { j++; break }
    }
    i = j
  }
}

console.log(failed ? `\nsingle-home: ${failed} FAILED.` : '\nsingle-home: all checks passed.')
process.exit(failed ? 1 : 0)
