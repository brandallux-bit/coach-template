#!/usr/bin/env node
/**
 * **Gate B — run this repo's system layer against a real chart's data, in a throwaway clone.**
 *
 * WHY THIS EXISTS. This repo has no chart, and that makes fourteen of `check-all.mjs`'s steps
 * skip, `npx tsc` the only thing that ever compiles the TypeScript, and BOTH leak scanners
 * structurally incapable of failing: `check-no-athlete-leak.mjs` and `check-banned-terms.mjs`
 * derive their denylists from `athlete/constants.json`, so with no chart they collect zero terms
 * and exit 0. You could paste one athlete's session types into a shared file here and stay green.
 *
 * So a change to the shared layer cannot be verified in this repo alone. It also cannot be
 * verified by merging: a chart and the template share no git history — `git merge-base` is empty
 * and a forced merge yields conflicts in every `data/*.csv`. **The only sound move is to copy the
 * system layer over a chart BY PATH and run the suite there.**
 *
 * ⚠ **THE CHART IS READ-ONLY AND IS NEVER A TARGET.** It is cloned to a temp directory, the copy
 * is written to, and the copy is deleted. Nothing is ever pushed, and `--chart` pointing at a
 * working directory is used only as a `git clone` source. If this script ever appears to modify a
 * chart, that is a bug in it, not a mode of it.
 *
 *   node scripts/port-overlay.mjs --chart <path-or-url> [--ref <rev>] [--keep] [--no-build]
 *                                 [--allow-ledger-drift] [--changed-since <ref>]
 *   node scripts/port-overlay.mjs --deathlete-only     # the prose count, no clone
 *
 * `--allow-ledger-drift` permits this repo's `compute-energy.mjs` to disagree with the ledger the
 * chart committed — say it out loud, per run, on a phase that means to change the burn model.
 *
 * ⚠ **`--ref` RESOLVES IN THE CLONE, NOT IN YOUR SHELL.** `--ref origin/main` therefore means the
 * SOURCE repository's local `main` branch, which is routinely behind its own remote — a session
 * that fetched into `refs/remotes/origin/main` and never fast-forwarded `main` leaves them days
 * apart. That cost one confusing red run here (a targets gap that does not exist on the chart), so
 * the resolved commit and its date are printed on every run. Read them.
 *
 * `--keep` leaves the clone on disk and prints where. `--no-build` skips `npm ci` / `tsc` /
 * `next build` / smoke, for a fast pass over the data-layer suite only — it is a debugging aid and
 * NEVER a way to call a phase verified, because Phases 3, 4, 5 and 7 are mostly TypeScript and
 * `check-all` registers no compiler.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { denylistFrom, pinDigest, scanForLeaks, termMatchers } from './lib/athlete-leak.mjs'
import { COMPANION_PATHS, SYSTEM_PATHS } from './lib/system-paths.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const flag = (f) => process.argv.includes(f)
const opt = (f, dflt = null) => {
  const i = process.argv.indexOf(f)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}

const CHART = opt('--chart', process.env.COACH_CHART)
const REF = opt('--ref', 'HEAD')
const KEEP = flag('--keep')
const BUILD = !flag('--no-build')
const LEDGER_DRIFT = flag('--allow-ledger-drift')

/**
 * The commit this port started from. Everything this branch has changed since it is "the phase";
 * everything else is what the template already shipped.
 *
 * ⚠ **WHY THE SPLIT EXISTS AT ALL.** Run over the whole file set, the leak scan reports 55 lines
 * the template shipped long before this port — one athlete's session names in four test fixtures,
 * their metric in `docs/INVARIANTS.md`, their domains in the intake worked example. Those are real
 * and they are somebody's backlog, but a gate that cannot go green is a gate that gets muted, and
 * muting this one loses the thing it is actually for: **did THIS change add a leak?** So the
 * pre-existing set is counted and printed, never hidden, and only new hits are fatal.
 */
const BASE = opt('--changed-since', 'origin/main')

const die = (msg) => { console.error(`::error::${msg}`); process.exit(1) }
const say = (s = '') => console.log(s)

if (!CHART && !flag('--deathlete-only')) {
  die('no chart to borrow. Pass --chart <path-or-url> (or set COACH_CHART). It is cloned, never '
    + 'written to — see this file\'s header. (--deathlete-only needs no chart: it is a grep over '
    + 'this repo\'s own diff.)')
}

// -------------------------------------------------------------------------------------------
// How each system path crosses
// -------------------------------------------------------------------------------------------

/**
 * **Mirrored exactly: the template's files land, and a chart-only file under the same root is
 * DELETED.**
 *
 * `scripts/` and `src/` are pure code. A chart-only script left behind is not neutral: it would
 * satisfy a `test-single-home` definition scan, or answer an import, and the run would go green on
 * a file the template does not ship. That is the exact failure this gate exists to prevent.
 */
const MIRROR_EXACTLY = ['scripts', 'src']

/**
 * **Overlaid, never pruned: the template's files land on top and chart-only files survive.**
 *
 * ⚠ **BECAUSE OF THE PROMOTION RENAME, AND `rsync --delete` GETS THIS WRONG.** `CLAUDE.md` §7/§8
 * say the roster and the skill set are per-athlete: intake copies what a domain needs UP out of
 * `skills/library/<x>` to `skills/<x>` and rewrites it for that athlete. So the same skill is
 * `skills/library/program-design/` here and `skills/program-design/` on a chart. Pruning would
 * delete every promoted skill and agent the chart has — the chart's whole coaching layer — and
 * then report a green suite for a repo shaped like nothing that exists.
 *
 * `.github/workflows` is here for a weaker but sufficient reason: a chart may legitimately run a
 * workflow of its own, and a leftover YAML file executes nowhere in this gate.
 */
const OVERLAY_ONLY = ['skills', '.claude/agents', '.github/workflows']

/**
 * Paths under which the overlay may never write, whatever `SYSTEM_PATHS` grows to say.
 *
 * `data/METHOD.md` is a system path inside a directory that is emphatically not one — one wrong
 * `cpSync` of `data/` and the run is measuring the template's fixtures instead of the chart's
 * ledger, while looking exactly as green. This asserts rather than trusts.
 */
const NEVER_WRITE_UNDER = ['data/', 'athlete/', 'logs/', 'nutrition/', 'program/', 'photos/']
const WRITE_EXCEPTIONS = ['data/METHOD.md', 'logs/TEMPLATE-daily.md', 'logs/TEMPLATE-weekly-review.md']

/**
 * The one path outside `SYSTEM_PATHS` this script rewrites in the clone, and why it is listed here
 * rather than waved through: see the re-pinning block below. It is bookkeeping the overlay itself
 * invalidated, it is never this gate's leak verdict, and nothing else under `athlete/` is touched.
 */
const REPIN_PATH = 'athlete/leak-acknowledgements.json'

/**
 * The second — and last — path this script rewrites in the clone: the chart's constants, and only
 * to apply a migration `SETUP.md` documents.
 *
 * ⚠ **BECAUSE THE ALTERNATIVE IS A GATE THAT CAN NEVER GO GREEN AGAIN.** A template update that
 * retires a constants key leaves every existing fork failing until its owner moves the key — which
 * is correct, and is exactly what the new validator rule says. But this gate borrows an UNMIGRATED
 * chart, so without applying the documented move it would report the port broken forever, for a
 * migration the port itself ships instructions for. Applying it here tests what a fork actually
 * has on merge day. Each step is applied only where the chart needs it and prints what it did, so
 * a key retired WITHOUT a documented move still reds the gate.
 */
const MIGRATE_PATH = 'athlete/constants.json'

// -------------------------------------------------------------------------------------------
// The de-athleting count — local, instant, and the half no scanner can do
// -------------------------------------------------------------------------------------------
//
// ⚠ **`stripComments` RUNS ON EVERY `.mjs|.js|.ts|.tsx` BEFORE THE LEAK SCAN.** So does the
// scanner's own documentation say the hole it cannot see is "a leak in a SHAPE rather than in a
// word" — but the operative blindness is simpler and larger than that: the crossing content is
// overwhelmingly COMMENTS, and comments are erased before a single pattern is applied. A verbatim
// quote about one athlete's travel habits, sitting in a docstring in shared code, is invisible to
// every automated check in this repo and ships to every fork.
//
// This is the counter-measure, and it is deliberately crude: it greps ADDED lines for third-person
// pronouns, quoted speech and 2026 dates. It over-reports — that is the correct direction for a
// screen — and each hit is either de-athleted or explained out loud.

import {
  DATE_RE, PRONOUN_RE, QUOTE_CODE_RE, QUOTE_PROSE_RE, PROSE_SHAPED, deathleteHit, isProse, isRenderedCopy, quoteHit,
} from './lib/deathlete.mjs'


/**
 * ⚠ **WHAT THIS SCREEN CANNOT SEE, STATED RATHER THAN IMPLIED.** It is a screen, not a scanner:
 * it has no denylist, because the repo it runs in has no chart to derive one from. So a name with
 * no pronoun around it, a session name, or a third-person quote carrying no first-person word all
 * pass it clean — every one of those was checked and every one slips through. What it reliably
 * catches is the shape the crossing content actually takes: comment prose about a particular
 * person, their own words, and dated incidents. Reading the diff is still the job; this narrows
 * where to look.
 */

/**
 * ⚠ **THE FILES THAT DECLARE THE SCREENS ARE NOT SUBJECT TO THEM — BOTH SCREENS, BOTH FILES.** It is the same rule
 * `banned-terms.mjs` states and `test-athlete-leak.mjs` asserts: the file that declares a pattern
 * cannot be a violation of it, or the pattern can never be written down.
 *
 * It applies to the vocabulary screen below as well as to the de-athleting count, because that
 * screen's own comments have to name the kinds of word it argues about — `walk`, `strength`,
 * `rehab`, `circuit` — to explain why a lone one of them is not a finding.
 *
 * ⚠ **AND THE EXEMPTION IS DELIBERATELY NOT LOAD-BEARING.** Nothing above names a brand, a place,
 * a sport or a person, and nothing here may start to: the prose describes the CLASS of term and
 * leaves the instance to the run. So if this exemption were deleted tomorrow, the only hits it is
 * currently hiding are four ordinary English words in a sentence about ordinary English words.
 */
const SELF_EXEMPT_FILES = [
  'scripts/port-overlay.mjs',
  'scripts/lib/deathlete.mjs',
  // ⚠ **AND THE SUITE THAT HOLDS THE RULES TO FIXTURES, for the reason `athlete-leak.mjs`'s
  // `NEVER_SCANNED` already gives about `scripts/test-`: a red fixture drawn from the case it
  // reproduces is X-10 working, not a leak. It is exempt NARROWLY — this one file, not every
  // suite — because the de-athleting screen's whole value in this port has been finding leaks in
  // test files, and a blanket `scripts/test-` exemption here would blind it to most of them.
  //
  // ⚠ **Its fixtures are INVENTED sentences and must stay that way.** The exemption is not
  // load-bearing: nothing in that file is anybody's words, so deleting this line would surface
  // specimens of the pattern and nothing else.
  'scripts/test-athlete-leak.mjs',
]
const isSelf = (f) => SELF_EXEMPT_FILES.includes(f)

const gitHere = (args) => {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return r.status === 0 ? r.stdout : null
}

/**
 * Every path this port has touched since `BASE` — tracked edits AND untracked new files.
 * One home, because both the leak-scan split and the de-athleting count ask the same question and
 * each got a different answer when they asked it separately.
 */
const changedFiles = () => (gitHere(['rev-parse', '--verify', '--quiet', BASE])
  ? [...new Set([
    ...(gitHere(['diff', '--name-only', BASE, '--']) ?? '').split('\n'),
    ...(gitHere(['ls-files', '--others', '--exclude-standard']) ?? '').split('\n'),
  ].filter(Boolean))]
  : [])

const deathleteReport = () => {
  if (!gitHere(['rev-parse', '--verify', '--quiet', BASE])) {
    say(`── de-athleting count: SKIPPED — \`${BASE}\` does not resolve here.`)
    say('   Pass --changed-since <ref>. A skipped count is not a zero count.')
    return { skipped: true, hits: [] }
  }
  const files = changedFiles()
  const hits = []
  for (const f of files) {
    if (isSelf(f)) continue
    // A tracked file contributes its added lines; an untracked one is entirely new, so every line
    // of it is an added line.
    const isTracked = (gitHere(['ls-files', '--error-unmatch', '--', f]) ?? '').trim() !== ''
    const lines = isTracked
      ? (gitHere(['diff', '-U0', BASE, '--', f]) ?? '').split('\n')
        .filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1))
      : (existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), 'utf8').split('\n') : [])
    for (const text of lines) {
      if (!deathleteHit(f, text)) continue
      hits.push({ path: f, text: text.trim().slice(0, 150) })
    }
  }
  say(`── de-athleting count over ${files.length} file(s) changed since ${BASE}: ${hits.length}`)
  for (const h of hits.slice(0, 40)) say(`   ${h.path}: ${h.text}`)
  if (hits.length > 40) say(`   … ${hits.length - 40} more`)
  if (!hits.length) say('   zero — no added line carries a gendered pronoun, a first-person quote, or a dated incident.')
  return { skipped: false, hits }
}

const deathlete = deathleteReport()
if (flag('--deathlete-only')) process.exit(deathlete.skipped || deathlete.hits.length ? 1 : 0)
say()

// -------------------------------------------------------------------------------------------
// Clone
// -------------------------------------------------------------------------------------------

const isUrl = /^[a-z]+:\/\//i.test(CHART) || /^[^/]+@[^/]+:/.test(CHART)
const work = mkdtempSync(join(tmpdir(), 'port-overlay-'))
const clone = join(work, 'chart')

const run = (cmd, args, cwd, env = {}) =>
  spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 })

say(`cloning ${CHART} @ ${REF} → ${clone}`)
// ⚠ A shallow clone carries only the default branch's tip, so `--ref anything-else` cannot resolve
// in it. Deepen only when a ref was actually asked for; the common case stays shallow and fast.
const cloneArgs = isUrl
  ? ['clone', '--quiet', ...(REF === 'HEAD' ? ['--depth', '1'] : []), CHART, clone]
  : ['clone', '--quiet', '--no-hardlinks', CHART, clone]
const cloned = run('git', cloneArgs, work)
if (cloned.status !== 0) die(`clone failed:\n${cloned.stderr}`)
if (REF !== 'HEAD') {
  const co = run('git', ['checkout', '--quiet', REF], clone)
  if (co.status !== 0) die(`could not check out ${REF}:\n${co.stderr}`)
}
const at = run('git', ['log', '-1', '--format=%h %cs %s'], clone).stdout.trim()
say(`chart under test: ${at}`)

// A clone that is somehow the live chart itself — or inside it — would make every "read-only"
// claim above false. Containment, not just equality: a TMPDIR under the chart would otherwise pass.
const realClone = realpathSync(clone)
const realChart = existsSync(CHART) ? realpathSync(CHART) : null
if (realChart && (realClone === realChart || realClone.startsWith(`${realChart}/`))) {
  die('the clone resolved to the chart itself, or inside it. Refusing to write.')
}

/**
 * ⚠ **DROP THE REMOTE, so "THE CHART IS NEVER A TARGET" IS STRUCTURAL AND NOT MERELY TRUE TODAY.**
 *
 * Nothing this script runs pushes — verified — but `scripts/` is mirrored EXACTLY into this clone,
 * which puts `chart-commit.mjs`, `git-commit-push.mjs` and `absorb-branches.mjs` in it with a
 * working remote pointing at the athlete's live repository, and `absorb.mjs` runs
 * `git push origin --delete <branch>`. One future `check-all` step, or one hand-run command in a
 * `--keep` clone, would write straight into somebody's chart. Removing the remote costs nothing
 * here and turns a property that happens to hold into one that cannot fail.
 */
run('git', ['remote', 'remove', 'origin'], clone)

if (!existsSync(join(clone, 'athlete', 'constants.json'))) {
  die(`${CHART} has no athlete/constants.json, so it is not a chart — every leak scan would `
    + 'collect zero terms and exit 0, which is the vacuous pass this gate exists to remove.')
}

// -------------------------------------------------------------------------------------------
// Copy the system layer over it, by path
// -------------------------------------------------------------------------------------------

/**
 * The files this repo would ship at `path` — **as the working tree stands, not as the last commit
 * left it.**
 *
 * ⚠ **`--others --exclude-standard` IS LOAD-BEARING AND ITS ABSENCE COST A WRONG GREEN.** Plain
 * `git ls-files` lists tracked files only, so a brand-new script — the usual case while a
 * workstream is in flight — is silently absent from the overlay and this gate certifies the last
 * commit instead of the tree under test. Measured: two new scripts were missing from a run that
 * reported itself green, and the file count only moved after they were committed.
 * `test-cold-start.mjs` documents the identical trap; it had the answer and this did not.
 * `.gitignore`d build output still stays out, which is the point.
 *
 * `withUntracked` is false for the clone, where "untracked" would mean the overlay's own writes.
 */
const filesAt = (repo, path, withUntracked) => {
  const args = ['ls-files', '-z', '--cached']
  if (withUntracked) args.push('--others', '--exclude-standard')
  const r = run('git', [...args, '--', path], repo)
  if (r.status !== 0) return []
  return [...new Set(r.stdout.split('\0').filter(Boolean))]
}

const guard = (rel) => {
  if (WRITE_EXCEPTIONS.includes(rel)) return
  const bad = NEVER_WRITE_UNDER.find((d) => rel.startsWith(d))
  if (bad) die(`refusing to write ${rel}: ${bad} is the chart, not the system layer.`)
}

const copied = new Set()
const deleted = []

for (const path of SYSTEM_PATHS) {
  const here = filesAt(ROOT, path, true)
  const there = filesAt(clone, path, false)

  for (const rel of here) {
    guard(rel)
    // `git ls-files` lists a file that is tracked but deleted in the worktree. Copying it throws
    // an ENOENT naming a path that plainly exists in git, which reads as a harness bug.
    if (!existsSync(join(ROOT, rel))) {
      die(`${rel} is tracked here but missing from the working tree. Commit the deletion, or `
        + 'restore the file — the overlay ships the tree, and cannot ship a file that is not in it.')
    }
    const dst = join(clone, rel)
    mkdirSync(dirname(dst), { recursive: true })
    cpSync(join(ROOT, rel), dst)
    copied.add(rel)
    for (const comp of COMPANION_PATHS[rel] ?? []) {
      guard(comp)
      if (!existsSync(join(ROOT, comp))) continue
      cpSync(join(ROOT, comp), join(clone, comp))
      // In `copied` too, or it is absent from the reported count and from the leak scan's file set.
      copied.add(comp)
    }
  }

  const prune = MIRROR_EXACTLY.includes(path)
    // A single-file system path the template no longer ships is a deletion the chart must see too.
    || (!OVERLAY_ONLY.includes(path) && here.length === 0 && there.length > 0)
  if (!prune) continue
  for (const rel of there) {
    if (copied.has(rel)) continue
    guard(rel)
    unlinkSync(join(clone, rel))
    deleted.push(rel)
  }
}

say(`overlaid ${copied.size} file(s) from this working tree; pruned ${deleted.length} chart-only file(s)`)
if (deleted.length) for (const d of deleted) say(`  - ${d}`)

/**
 * **Regenerate what is derived from the chart, exactly as a real chart merging a template update
 * must.**
 *
 * `data/METHOD.md` is a system path that contains generated blocks — the MET table among them —
 * built from THIS chart's session-type registry. Copying the template's copy in therefore lands a
 * table describing the template's (empty) registry, and `test-single-home` §5 correctly says the
 * generated block no longer matches the code that owns it. That is not a defect in either repo:
 * it is the documented consequence of a merge, and the fix is the command the failure names.
 *
 * ⚠ **THIS IS A FINDING ABOUT `SETUP.md`, NOT A WORKAROUND.** A chart following "Pulling template
 * improvements later" gets the identical red build with no hint that a regeneration step exists.
 * Same class as re-running `compute-energy.mjs` after a burn-model change.
 */
/**
 * **Re-pin the chart's leak acknowledgements onto the files that just replaced theirs.**
 *
 * ⚠ **THE ONE WRITE THIS SCRIPT MAKES INSIDE `athlete/`, AND IT IS BOOKKEEPING, NOT A VERDICT.**
 * An acknowledgement pins a digest to the exact lines it covers, so that it can never silently
 * widen to cover a line nobody read. That guarantee is doing its job here: the chart pins
 * `.claude/agents/MANIFEST.md` lines 20-21 and `skills/daily-dashboard/SKILL.md` lines 83/106, the
 * overlay replaces both files with this repo's copies, and the pins correctly report that the file
 * moved under them. `check-no-athlete-leak` then fails — on the chart's bookkeeping about files
 * the chart no longer has, which is not a fact about either repo.
 *
 * ⚠ **AND IT SILENCES NOTHING, because the clone's leak check is NOT this gate's leak verdict.**
 * That is the scan at the bottom of this file: it runs over exactly the files this repo shipped,
 * with no acknowledgements consulted at all, and reports every hit split into "this port's" and
 * "already there". Re-pinning here only stops a stale pin from masking the ELEVEN OTHER STEPS of
 * `check-all` behind an early exit. An entry whose file no longer leaks becomes inert and says so.
 */
const ackPath = join(clone, 'athlete', 'leak-acknowledgements.json')
if (existsSync(ackPath)) {
  const ack = JSON.parse(readFileSync(ackPath, 'utf8'))
  const preScan = scanForLeaks(clone, denylistFrom(clone))
  const byPath = new Map(preScan.map((f) => [f.path, f]))
  let repinned = 0
  let dropped = 0
  const kept = []
  for (const e of ack.entries ?? []) {
    if (!copied.has(e.path)) { kept.push(e); continue }
    const f = byPath.get(e.path)
    // The template's copy leaks nothing, so the entry is spent. `--pin` says exactly this: "the
    // leak was fixed — delete the entry, X-11 is one file closer." Blanking its digest instead
    // would leave an UNPINNED entry, which the checker rightly treats as an off switch and fails.
    if (!f) { dropped++; continue }
    const lines = f.hits.map((h) => h.line)
    const digest = pinDigest(clone, e.path, lines)
    if (digest !== e.digest) {
      e.lines = lines
      e.digest = digest
      e.reason = `[port-overlay] re-pinned onto the template's copy of this file. ${e.reason ?? ''}`
      repinned++
    }
    kept.push(e)
  }
  if (repinned || dropped) {
    ack.entries = kept
    writeFileSync(ackPath, `${JSON.stringify(ack, null, 2)}\n`)
    say(`leak acknowledgements: ${repinned} re-pinned onto the copies this repo shipped, `
      + `${dropped} dropped as spent (this repo's copy of that file leaks nothing)`)
  }
}

/**
 * **Apply the migration `SETUP.md` documents, because that is what a real fork does on merge day.**
 *
 * ⚠ **AND EACH STEP IS APPLIED ONLY WHERE THE CHART ACTUALLY NEEDS IT, SO A MISSING MIGRATION IS
 * STILL A RED GATE.** Silently normalising the chart would make this gate incapable of noticing
 * that a constants key was retired without a documented move — which is the one thing it is here
 * to notice. Each step below prints what it did; a chart already migrated prints nothing.
 */
const migrations = []
{
  const cPath = join(clone, 'athlete', 'constants.json')
  const c = JSON.parse(readFileSync(cPath, 'utf8'))
  // SETUP.md, "Constants a merge may ask you to move": the daily block's length is a property of
  // the activity now, named by `program.dailyBlockType`.
  const legacyMin = c.program?.dailyRehabMin
  if (legacyMin != null && c.program?.dailyBlockType == null) {
    const type = Object.entries(c.sessionTypes ?? {})
      .filter(([k]) => !k.startsWith('_'))
      .find(([, t]) => Number(t?.met) > 0 && t?.countsTowardFloor === false)?.[0]
    if (!type) {
      die('this chart carries the retired program.dailyRehabMin and no obvious type to move it to. '
        + 'Migrate it by hand in a scratch clone, or teach this step which type it is.')
    }
    c.sessionTypes[type] = { ...c.sessionTypes[type], standingDurationMin: legacyMin }
    c.program = { ...c.program, dailyBlockType: type }
    delete c.program.dailyRehabMin
    writeFileSync(cPath, `${JSON.stringify(c, null, 2)}\n`)
    migrations.push(`moved program.dailyRehabMin (${legacyMin} min) to sessionTypes.${type}.standingDurationMin`)
  }

  /**
   * SETUP.md, "Constants a merge may ask you to move": the movement declaration.
   *
   * ⚠ **INFERRED FROM THE ROWS, NOT ASSUMED.** A chart whose `data/steps.csv` holds rows HAS a
   * feed, whatever it calls it — that file has exactly one writer. A chart with no rows is left
   * alone and takes the described-level path, which is the correct answer for it. Guessing either
   * way round would be this step deciding a fact about somebody's setup; reading the rows is
   * reading what already happened.
   *
   * The name written here is the automation this repo ships. A chart fed by something else renames
   * it by hand — which is exactly why the key is a name and not a boolean.
   */
  if (String(c.plan?.stepFeed ?? '').trim() === '') {
    const stepsPath = join(clone, 'data', 'steps.csv')
    const rows = existsSync(stepsPath)
      ? readFileSync(stepsPath, 'utf8').trim().split('\n').slice(1).filter(Boolean).length
      : 0
    if (rows > 0) {
      c.plan = { ...c.plan, stepFeed: 'apple-health-shortcut' }
      c.plan._provenance = {
        ...c.plan._provenance,
        stepFeed: {
          class: 'derived',
          asOf: new Date().toISOString().slice(0, 10),
          inputs: `${rows} row(s) already in data/steps.csv — the file has one writer`,
          source: 'SETUP.md, "Constants a merge may ask you to move"',
          note: 'Not stated by anyone: read off the fact that the feed has been writing. Confirm '
            + 'the name with the athlete and re-mark it if they say otherwise.',
        },
      }
      writeFileSync(cPath, `${JSON.stringify(c, null, 2)}\n`)
      migrations.push(`declared plan.stepFeed — data/steps.csv already holds ${rows} row(s), so `
        + 'this chart has a feed and keeps the counted movement term')
    }
  }
}
if (migrations.length) for (const m of migrations) say(`migrated: ${m}`)

const docs = run(process.execPath, ['scripts/build-docs.mjs'], clone)
if (docs.status !== 0) die(`build-docs.mjs failed in the clone:\n${docs.stdout}\n${docs.stderr}`)
say('regenerated the chart-derived blocks in data/METHOD.md (build-docs.mjs)')

// A last assertion against the whole class of mistake, read off git rather than off intent.
// Every path `NEVER_WRITE_UNDER` protects, plus `decisions.md`, which `system-paths.mjs` names as
// the chart and neither list covered. A review found `photos` and `decisions.md` missing here.
const touchedData = run('git', ['status', '--porcelain', '--',
  'data', 'athlete', 'logs', 'nutrition', 'program', 'photos', 'decisions.md'], clone)
  .stdout.split('\n').filter(Boolean)
  .filter((l) => ![...WRITE_EXCEPTIONS, REPIN_PATH, MIGRATE_PATH].some((w) => l.includes(w)))
if (touchedData.length) die(`the overlay modified chart data, which it must never do:\n${touchedData.join('\n')}`)

// -------------------------------------------------------------------------------------------
// Run
// -------------------------------------------------------------------------------------------

let failed = false
const results = []

const stage = (label, fn) => {
  if (failed) { results.push([label, 'skipped-after-failure']); return }
  process.stdout.write(`\n── ${label}\n`)
  const r = fn()
  const ok = r.status === 0
  if (!ok) {
    failed = true
    process.stdout.write((r.stdout || '').split('\n').slice(-40).join('\n') + '\n')
    process.stderr.write((r.stderr || '').split('\n').slice(-40).join('\n') + '\n')
  } else {
    process.stdout.write((r.stdout || '').split('\n').slice(-25).join('\n') + '\n')
  }
  results.push([label, ok ? 'ok' : 'FAIL'])
  return r
}

// The dashboard fails closed without these, and `smoke-routes.mjs` refuses to run rather than
// pass on a redirect. Ephemeral values, in a temp clone, never written to a file.
const secrets = {
  AUTH_SECRET: 'overlay-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
  DASHBOARD_PASSWORD: 'overlay-' + Math.random().toString(36).slice(2),
  SMOKE_PORT: String(3100 + Math.floor(Math.random() * 400)),
}

if (BUILD) stage('npm ci', () => run('npm', ['ci', '--no-audit', '--no-fund'], clone))

/**
 * **The ledger comparison, run explicitly rather than left to `check-all`'s staleness step.**
 *
 * ⚠ **THIS IS THE STRONGEST SIGNAL THIS GATE PRODUCES AND IT USED TO BE A SIDE EFFECT.** It asks:
 * does THIS repo's `compute-energy.mjs` still reproduce, row for row, a ledger a real chart
 * committed? Leaving it to the staleness step made it a boolean buried in a suite failure, and it
 * also blocked every step after it — so a phase that legitimately changed the burn model could not
 * see the other seventeen checks at all. Now the rows are compared column by column, the count is
 * printed, and the suite runs afterwards on a regenerated ledger like any migrated fork's.
 */
const before = (run('git', ['show', 'HEAD:data/energy.csv'], clone).stdout || '').trim().split('\n')
const regen = run(process.execPath, ['scripts/compute-energy.mjs'], clone)
if (regen.status !== 0) die(`compute-energy.mjs failed in the clone:\n${regen.stderr}`)
const after = readFileSync(join(clone, 'data', 'energy.csv'), 'utf8').trim().split('\n')
{
  /**
   * ⚠ **`method_version` IS EXCLUDED, AND IT IS THE ONE EXCLUSION.** It is a version STAMP, not a
   * figure: a chart bumps it when its own model moves, and this repo deliberately stays at 1
   * because it has no rows to keep interpretable. Comparing it would report all 26 rows as drifted
   * on every run and bury the two that actually were. Every column that carries a NUMBER is
   * compared; a column present on one side only is not comparable and is listed as such.
   */
  const STAMP = ['method_version']
  const shared = before[0].split(',')
    .filter((col) => after[0].split(',').includes(col) && !STAMP.includes(col))
  const onlyOneSide = [...new Set([...before[0].split(','), ...after[0].split(',')])]
    .filter((c) => !STAMP.includes(c) && !shared.includes(c))
  const pick = (header, line) => {
    const cols = header.split(',')
    const vals = line.split(',')
    return shared.map((c) => vals[cols.indexOf(c)]).join(',')
  }
  const bRows = new Map(before.slice(1).map((l) => [l.split(',')[0], pick(before[0], l)]))
  const aRows = new Map(after.slice(1).map((l) => [l.split(',')[0], pick(after[0], l)]))
  const differing = [...aRows].filter(([d, v]) => bRows.has(d) && bRows.get(d) !== v)
  say()
  say(`── ledger: ${aRows.size} row(s) recomputed; ${aRows.size - differing.length} identical to the `
    + `chart's committed figures across ${shared.length} compared column(s)`
    + `${onlyOneSide.length ? `; ${onlyOneSide.join(', ')} exist on one side only` : ''}`)
  for (const [d] of differing.slice(0, 8)) {
    say(`   ${d}\n     chart : ${bRows.get(d)}\n     ported: ${aRows.get(d)}`)
  }
  if (differing.length > 8) say(`   … ${differing.length - 8} more`)
  if (differing.length && !LEDGER_DRIFT) {
    failed = true
    say('::error::this repo\'s compute-energy.mjs does not reproduce the ledger the chart committed.')
    say('  A real finding on any phase that did not mean to change the burn model. If this phase')
    say('  DID mean to, re-run with --allow-ledger-drift and say so in the phase report.')
  }
  const add = run('git', ['add', 'data/energy.csv'], clone)
  const ci = run('git', ['-c', 'user.email=overlay@local', '-c', 'user.name=port-overlay',
    'commit', '-qm', 'port-overlay: regenerate the ledger, as SETUP.md tells a fork to on merge'], clone)
  if (add.status !== 0 || ci.status !== 0) die(`could not commit the regenerated ledger:\n${ci.stderr}`)
}

/**
 * The suite, on a migrated chart with a regenerated ledger — the state a real fork is in on merge
 * day, and the only state in which its result means anything.
 *
 * `prebuild` runs `npm run data`, which rewrites `data/energy.csv` in the clone. Build first and
 * `check-all`'s staleness gate compares the regenerated ledger against itself and passes for free —
 * throwing away the one signal this gate has that is not available anywhere else: **does this
 * repo's `compute-energy.mjs` still reproduce, row for row, a ledger a real chart committed?**
 *
 * A phase that deliberately changes the burn model makes that step fail on purpose. `--allow-ledger-drift`
 * is how you say so, out loud, per run — never by reordering these two stages.
 */
const suite = stage('node scripts/check-all.mjs', () => run(process.execPath, ['scripts/check-all.mjs'], clone))

/** `check-all` prints `ok`/`skip` on stdout and `FAIL` on stderr. Reading one stream reads half. */
const bothStreams = (r) => `${r?.stdout || ''}\n${r?.stderr || ''}`

if (BUILD) {
  stage('npx tsc --noEmit', () => run('npx', ['tsc', '--noEmit'], clone))
  stage('npm run build', () => run('npm', ['run', 'build'], clone, secrets))
  stage('node scripts/smoke-routes.mjs', () => run(process.execPath, ['scripts/smoke-routes.mjs'], clone, secrets))
}

// -------------------------------------------------------------------------------------------
// What did check-all actually do?
// -------------------------------------------------------------------------------------------
//
// ⚠ **A GREEN EXIT IS NOT A GREEN SUITE.** `check-all` prints `skip` for every step it could not
// run and still exits 0 — which is correct on a chart-less repo and meaningless here, where a chart
// is present precisely so that nothing skips. Report the step lines, and treat any skip as a
// failure of this gate rather than of the suite.
if (suite) {
  const lines = bothStreams(suite).split('\n').filter((l) => /^(ok|skip|FAIL)\s/.test(l))
  const skips = lines.filter((l) => l.startsWith('skip'))
  // ⚠ **THE DENOMINATOR COMES FROM THE SOURCE, NOT FROM THE OUTPUT.** `check-all` returns without
  // printing anything further once a step fails, so a suite that died at step 2 prints
  // "1 ok, 1 failed, of 2 step(s)" — a truncated run rendered as a complete one. Counting the
  // registrations makes "every step ran" an assertion instead of a reading of its own tail.
  const registered = (readFileSync(join(clone, 'scripts', 'check-all.mjs'), 'utf8')
    .match(/^step\(/gm) ?? []).length
  say()
  say(`check-all: ${lines.filter((l) => l.startsWith('ok')).length} ok, ${skips.length} skipped, `
    + `${lines.filter((l) => l.startsWith('FAIL')).length} failed, of ${registered} registered step(s)`)
  if (registered && lines.length < registered) {
    failed = true
    say(`::error::only ${lines.length} of ${registered} steps reported. The suite stopped early; `
      + 'the steps after it were never run and this gate says nothing about them.')
  }
  if (skips.length) {
    failed = true
    say('::error::a step SKIPPED on a chart that exists. Gate B proves nothing about a skipped step:')
    for (const s of skips) say(`  ${s}`)
  }
}

// -------------------------------------------------------------------------------------------
// The leak scan, over exactly the files that crossed
// -------------------------------------------------------------------------------------------
//
// See `scanForLeaks`'s `only` option for why the file set is passed in rather than walked.
const denylist = denylistFrom(clone)
say()
say(`── leak scan — ${denylist.length} term(s) derived from the chart's athlete/, over the `
  + `${copied.size} file(s) this repo shipped`)
if (!denylist.length) die('the denylist is empty, so this scan cannot fail. That is the vacuous pass.')
// The same argument one axis over: an empty or truncated `only` set also cannot fail, and unlike a
// total copy failure (which kills build-docs a hundred lines up) a PARTIAL one is silent.
if (copied.size < SYSTEM_PATHS.length) {
  die(`only ${copied.size} file(s) crossed, fewer than the ${SYSTEM_PATHS.length} system paths `
    + 'themselves. Something did not copy, and a scan over a truncated file set cannot fail.')
}

const leaks = scanForLeaks(clone, denylist, { only: copied })

/**
 * Which of these files did THIS port change? Only those can be this port's fault. See BASE.
 *
 * ⚠ **A BRAND-NEW FILE IS NOT IN `git diff`, AND FILING ITS LEAKS AS "PRE-EXISTING" IS EXACTLY
 * BACKWARDS.** `git diff --name-only` lists tracked changes; a file this port has just written and
 * not yet committed appears on neither side, so its hits landed in the "already there, not this
 * port's doing" bucket — the one bucket that is not fatal. Measured: a newly written test file's
 * leak was reported as inherited on its very first run. Same lesson as the copy set, one function
 * over.
 */
const changedHere = new Set(changedFiles())
/**
 * ⚠ **THE SPLIT IS PER LINE, NOT PER FILE — because a file-level proxy ADOPTS unrelated history the
 * moment a phase touches the file.** Observed: adding one guard to `test-prescriptions.mjs` moved
 * 38 pre-existing hits from "already there" to "this port's fault" and reddened the gate over
 * fixture lines the phase never read. With nine phases still to run, that recurs every time.
 *
 * The question is "did THIS port write this line?", so ask it of the line: take the file as it
 * stood at `BASE` and see whether the hit's text is already in it. Matching on TEXT rather than on
 * line number survives every insertion above it.
 */
const baseLines = new Map()
const wasThereBefore = (path, text) => {
  if (!baseLines.has(path)) {
    const before = gitHere(['show', `${BASE}:${path}`])
    baseLines.set(path, new Set((before ?? '').split('\n').map((l) => l.trim().slice(0, 160))))
  }
  return baseLines.get(path).has(text)
}
const split = (f) => {
  if (!changedHere.has(f.path)) return { ...f, added: [], old: f.hits }
  const added = f.hits.filter((h) => !wasThereBefore(f.path, h.text))
  return { ...f, added, old: f.hits.filter((h) => !added.includes(h)) }
}
const parts = leaks.map(split)
const mine = parts.filter((f) => f.added.length).map((f) => ({ ...f, hits: f.added }))
const inherited = parts.filter((f) => f.old.length).map((f) => ({ ...f, hits: f.old }))

const show = (f) => {
  say(`  ${f.path} — ${f.hits.length} hit(s)`)
  for (const h of f.hits.slice(0, 8)) say(`    :${String(h.line).padEnd(5)} [${h.terms.join(', ')}] ${h.text}`)
  if (f.hits.length > 8) say(`    … ${f.hits.length - 8} more`)
}

/**
 * ⚠ **`docs/` IS `reported`, NEVER FAILED, AND THE GATE HAS TO HONOUR THAT.**
 *
 * `athlete-leak.mjs`'s rule 4: the engineering record describes this chart's defects by design, and
 * X-11's own statement quotes them. A gate that goes red on the document explaining the gate is a
 * gate nobody keeps. The first version of this split on "did the port change it" alone and ignored
 * `f.mode` — which would have turned `docs/INVARIANTS.md` fatal the moment a phase edited it, and
 * two phases do.
 */
const fatal = mine.filter((f) => f.mode === 'enforced')
const reported = mine.filter((f) => f.mode !== 'enforced')

if (!fatal.length) {
  say('  clean — no enforced file this port changed names this athlete in scannable text.')
} else {
  say(`  LEAK, in ${fatal.length} enforced file(s) this port changed:`)
  fatal.forEach(show)
  failed = true
}

if (reported.length) {
  say()
  say(`  ${reported.length} file(s) this port changed under a REPORTED scope — printed, never failed:`)
  reported.forEach(show)
}

if (inherited.length) {
  const n = inherited.reduce((a, f) => a + f.hits.length, 0)
  say()
  say(`  ${n} pre-existing line(s) in ${inherited.length} file(s) — lines that already read this`)
  say('  way at the comparison ref. NOT this port\'s doing and not fixed by it, recorded so a')
  say('  regression is visible against a number:')
  for (const f of inherited) say(`    ${f.path} — ${f.hits.length}`)
}

/**
 * ⚠ **THE HALF THE LEAK SCAN CANNOT DO: THE CHART'S OWN VOCABULARY, IN THE LINES THIS PORT ADDED,
 * COMMENTS INCLUDED.**
 *
 * `scanForLeaks` strips comments from every `.mjs|.js|.ts|.tsx` before matching, and the crossing
 * content in a port like this is overwhelmingly comments. The de-athleting screen at the top of
 * this run covers the shapes that need no chart to recognise — gendered pronouns, first-person
 * quotes, dated incidents — but it has no denylist and so cannot see a session name, an activity,
 * an injury site or a place. A review found exactly that: a comment reading `"Block One
 * (knee-free)"` in an added line, reported as zero by a screen that never looked for `knee`.
 *
 * Here there IS a chart, so there is a denylist. Run it over the added lines WITHOUT stripping
 * anything. Derived from the chart, never a list typed into this repo — a hardcoded set of one
 * athlete's words inside the tool that prevents one athlete's words from crossing would be the
 * defect wearing the uniform.
 */
const addedLines = []
for (const f of changedHere) {
  const isTracked = (gitHere(['ls-files', '--error-unmatch', '--', f]) ?? '').trim() !== ''
  const lines = isTracked
    ? (gitHere(['diff', '-U0', BASE, '--', f]) ?? '').split('\n')
      .filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1))
    : (existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), 'utf8').split('\n') : [])
  lines.forEach((text, i) => addedLines.push({ path: f, i, text }))
}
// ⚠ The scanner's OWN matcher, imported — see `termMatchers`. A hand-rolled copy here omitted the
// boundary logic, so a two-word session name matched two ordinary words that happened to start
// the same way — the false positive that function's own comment records already fixing once.
const vocabRe = termMatchers(denylist)
const vocabHits = []
/**
 * ⚠ **A LONE WORD IS QUIETER, NEVER DISCARDED — AND SAYING "NONE" OVER A DISCARD IS THE WORSE
 * BUG OF THE TWO.**
 *
 * The rule below is the enum-member rule from `athlete-leak.mjs`: a single registry key on a line
 * *usually* means nothing, because `walk`, `strength`, `rehab` and `circuit` are ordinary English
 * and a screen that fires on them gets muted within a day. So one lone word does not reach the
 * report and two together do.
 *
 * But a review found a BRAND NAME — an equipment maker on the source chart's must-not-cross list —
 * matched on an added line, suppressed by that rule, and the run printed `0 / none`. The heuristic
 * cannot tell a proper noun from a common one, and the previous version threw the hit away rather
 * than ranking it, so the screen reported a stronger result than it had computed. A screen that
 * overstates itself is worse than a noisy one: the noisy one gets read.
 *
 * So the lone-word hits are collected, deduplicated BY TERM rather than by line — a term is what a
 * human judges, and one example line is enough to judge it — and printed under the main report as
 * a second, quieter list. The count above stays the count of lines that need a decision; nothing
 * below it is claimed to be clean.
 */
const suppressed = new Map()
for (const { path, text } of addedLines) {
  if (isSelf(path)) continue
  const hits = vocabRe.filter((v) => v.re.test(text))
  const phrases = hits.filter((v) => v.kind === 'phrase')
  const words = hits.filter((v) => v.kind !== 'phrase')
  const terms = [...phrases, ...(words.length >= 2 ? words : [])].map((v) => v.term)
  if (terms.length) vocabHits.push({ path, terms, text: text.trim().slice(0, 140) })
  else if (words.length === 1) {
    const t = words[0].term
    const seen = suppressed.get(t) ?? { n: 0, path, text: text.trim().slice(0, 110) }
    seen.n += 1
    suppressed.set(t, seen)
  }
}
say()
say(`── the chart's own vocabulary in this port's added lines, COMMENTS INCLUDED: ${vocabHits.length}`)
if (!vocabHits.length) {
  say('   none — no added line carries a phrase from this chart, or two of its words together.')
} else {
  for (const h of vocabHits.slice(0, 30)) say(`   ${h.path} [${h.terms.join(', ')}] ${h.text}`)
  if (vocabHits.length > 30) say(`   … ${vocabHits.length - 30} more`)
  say('   ⚠ Judge each: a registry key that is also ordinary English is usually fine in a sentence,')
  say('     a session name or an activity is not. This is a SCREEN — it reports, you decide.')
}
if (suppressed.size) {
  const total = [...suppressed.values()].reduce((a, b) => a + b.n, 0)
  say()
  say(`   …and ${suppressed.size} term(s) matched ALONE on ${total} line(s) — below the "counts only`)
  say('   in company" bar, so not counted above. Listed because that bar cannot tell a brand or a')
  say('   place from an ordinary word, and a discard the run does not print is a discard nobody')
  say('   judges. One example line each:')
  for (const [term, e] of [...suppressed].sort((a, b) => b[1].n - a[1].n)) {
    say(`     ${term} ×${e.n} — ${e.path}: ${e.text}`)
  }
  say('   ⚠ A PROPER NOUN HERE IS A LEAK. An ordinary English word almost never is.')
}

say()
say('⚠ Comments are stripped from every .mjs/.js/.ts/.tsx before this scan, so a leak living in')
say('  a comment is invisible to it. A clean run here is necessary and not sufficient — the')
say('  de-athleting count at the top of this run is the other half.')

if (deathlete.skipped) {
  failed = true
  say('\n::error::the de-athleting count did not run, so nothing here says the prose is clean.')
} else if (deathlete.hits.length) {
  failed = true
  say(`\n::error::${deathlete.hits.length} added line(s) carry athlete prose. See the count above.`)
}

// -------------------------------------------------------------------------------------------

say()
for (const [label, state] of results) say(`  ${state.padEnd(22)} ${label}`)

if (KEEP) say(`\nclone kept at ${clone}`)
else rmSync(work, { recursive: true, force: true })

if (failed) { console.error('\n::error::port-overlay: Gate B is RED.'); process.exit(1) }
say('\nport-overlay: Gate B is green.')
