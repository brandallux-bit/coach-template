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
import { denylistFrom, pinDigest, scanForLeaks } from './lib/athlete-leak.mjs'
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

/**
 * Three clauses, each naming a different way one athlete's life crosses into shared code.
 *
 * **1 · A GENDERED PRONOUN, ANYWHERE ON THE LINE.** De-athleted prose in this repo uses they/them,
 * so `he`/`him`/`his`/`she`/`her` is prose about a particular person that arrived with a chart.
 * `they`/`them`/`their` are deliberately NOT here: they are this repo's own convention, so
 * including them would fire on every correctly-written line and the screen would be off in a day.
 *
 * **2 · A QUOTE IN THE FIRST PERSON.** A verbatim quote of a PERSON is speech, and speech about
 * oneself is first-person. That separates an athlete saying what they want from the quoted
 * identifiers, UI strings and illustrative sentences shared code legitimately contains — a quoted
 * code comment, a quoted rendered label. Bare `\*"` matched all of those, and matched a `"Mon"`
 * inside a regex literal as well.
 *
 * ⚠ **AND THE FIRST VERSION OF THIS PARAGRAPH ILLUSTRATED THE RULE WITH TWO REAL QUOTES FROM THE
 * PROTOTYPE ATHLETE**, in the one file exempt from its own screen — including a figure on the
 * plan's not-crossing list. A reviewer found it. The example a rule needs is the SHAPE of the
 * thing, never a specimen of it; that is the same judgement this whole port turns on.
 *
 * **3 · A DATE IN PROSE, NOT IN CODE.** The target is a dated incident — *"On <date> an automated
 * job reasoned its way to the opposite conclusion"* — which lives in a sentence. A bare date
 * literal in code is a fixture datum, and a ported test file is nothing but those: flagging them
 * reported 15 lines of `day('2025-05-13', 'lifting')`. So the clause applies to comment lines and
 * markdown only. (It was `2026-0` before a review pointed out that it went blind in October of one
 * particular year, in a file whose whole subject is not hard-coding one chart's specifics.)
 *
 * ⚠ **AND THIS FILE IS NOT SUBJECT TO ITS OWN PATTERN**, for the reason `banned-terms.mjs` already
 * states and `test-athlete-leak.mjs` already asserts: the file that declares the rule is never
 * itself a violation of it.
 */
const PRONOUN_RE = /\b(he|him|his|she|her|hers)\b/i
/** Straight and curly, because a quote pasted out of a chat window carries curly ones. */
const Q = '["\u201c\u201d]'
const FIRST_PERSON = "(i|i'm|i'd|i'll|i've|my|me|myself|mine|we|our|us)"
/** In prose, any quoted span. In code, only the markdown-emphasis form — see `isProse`. */
const QUOTE_PROSE_RE = new RegExp(`${Q}[^"\u201c\u201d]*\\b${FIRST_PERSON}\\b`, 'i')
const QUOTE_CODE_RE = new RegExp(`(^|[\\s>])\\*+${Q}[^"\u201c\u201d]*\\b${FIRST_PERSON}\\b`, 'i')
const DATE_RE = /\b20\d\d-\d\d-\d\d\b/

/**
 * A comment line, or any line of a file that is prose rather than program.
 *
 * ⚠ **`.json` IS PROSE HERE, and excluding it blinded the screen to the file this port edits most
 * for documentation.** `athlete/constants.template.json` is almost entirely English sentences
 * inside JSON strings — every `_comment` and every `_note` — so treating it as code meant a dated
 * incident or a quote in the very file a new user reads first went unseen.
 */
const isProse = (path, text) => !/\.(mjs|js|ts|tsx)$/.test(path) || /^\s*(\/\/|\*|\/\*|#)/.test(text)

const deathleteHit = (path, text) => {
  const prose = isProse(path, text)
  return PRONOUN_RE.test(text)
    || (prose ? QUOTE_PROSE_RE : QUOTE_CODE_RE).test(text)
    || (prose && DATE_RE.test(text))
}

/**
 * ⚠ **WHAT THIS SCREEN CANNOT SEE, STATED RATHER THAN IMPLIED.** It is a screen, not a scanner:
 * it has no denylist, because the repo it runs in has no chart to derive one from. So a name with
 * no pronoun around it, a session name, or a third-person quote carrying no first-person word all
 * pass it clean — every one of those was checked and every one slips through. What it reliably
 * catches is the shape the crossing content actually takes: comment prose about a particular
 * person, their own words, and dated incidents. Reading the diff is still the job; this narrows
 * where to look.
 */

const DEATHLETE_EXEMPT_FILE = 'scripts/port-overlay.mjs'

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
    if (f === DEATHLETE_EXEMPT_FILE) continue
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

const docs = run(process.execPath, ['scripts/build-docs.mjs'], clone)
if (docs.status !== 0) die(`build-docs.mjs failed in the clone:\n${docs.stdout}\n${docs.stderr}`)
say('regenerated the chart-derived blocks in data/METHOD.md (build-docs.mjs)')

// A last assertion against the whole class of mistake, read off git rather than off intent.
// Every path `NEVER_WRITE_UNDER` protects, plus `decisions.md`, which `system-paths.mjs` names as
// the chart and neither list covered. A review found `photos` and `decisions.md` missing here.
const touchedData = run('git', ['status', '--porcelain', '--',
  'data', 'athlete', 'logs', 'nutrition', 'program', 'photos', 'decisions.md'], clone)
  .stdout.split('\n').filter(Boolean)
  .filter((l) => ![...WRITE_EXCEPTIONS, REPIN_PATH].some((w) => l.includes(w)))
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
 * ⚠ **`check-all` RUNS BEFORE `npm run build`, AND THE ORDER IS THE POINT.**
 *
 * `prebuild` runs `npm run data`, which rewrites `data/energy.csv` in the clone. Build first and
 * `check-all`'s staleness gate compares the regenerated ledger against itself and passes for free —
 * throwing away the one signal this gate has that is not available anywhere else: **does this
 * repo's `compute-energy.mjs` still reproduce, row for row, a ledger a real chart committed?**
 *
 * A phase that deliberately changes the burn model makes that step fail on purpose. `--allow-ledger-drift`
 * is how you say so, out loud, per run — never by reordering these two stages.
 */
let suite = stage('node scripts/check-all.mjs', () => run(process.execPath, ['scripts/check-all.mjs'], clone))

/** `check-all` prints `ok`/`skip` on stdout and `FAIL` on stderr. Reading one stream reads half. */
const bothStreams = (r) => `${r?.stdout || ''}\n${r?.stderr || ''}`

if (suite && suite.status !== 0 && /FAIL\s+energy\.csv/.test(bothStreams(suite))) {
  if (!LEDGER_DRIFT) {
    say()
    say('::error::this repo\'s compute-energy.mjs does not reproduce the ledger the chart committed.')
    say('  That is a real finding on any phase that did not mean to change the burn model. If this')
    say('  phase DID mean to, re-run with --allow-ledger-drift and say so in the phase report.')
  } else {
    say()
    say('⚠ ledger drift ALLOWED for this run (--allow-ledger-drift): this repo\'s compute-energy.mjs')
    say('  produces a different energy.csv than the chart committed. Regenerating the ledger and')
    say('  re-running, so the remaining steps are exercised rather than hidden behind the first.')
    /**
     * ⚠ **REGENERATE THE LEDGER EXPLICITLY; DO NOT RE-RUN THE SUITE IN BOT MODE.**
     *
     * `--regen-energy` was the obvious move and it is wrong, because that flag does TWO things.
     * Besides regenerating `energy.csv` it turns `check-targets-gap` from a hard failure into a
     * silent auto-fill (`check-all.mjs`, the bot-mode note). Its only trace is an indented line the
     * step-line filter below discards — so a chart under test with a day that has NO CALORIE
     * TARGET would fail at the energy step first, take this branch, get its gap quietly filled,
     * and report `0 failed`. That is the 2026-08-15 defect `CLAUDE.md` §0.3 exists for, made
     * invisible by the flag every run of this port has to pass.
     *
     * Regenerating the one derived file and re-running the suite UNCHANGED narrows the allowance to
     * exactly what the flag's name claims.
     */
    const regen = run(process.execPath, ['scripts/compute-energy.mjs'], clone)
    if (regen.status !== 0) die(`compute-energy.mjs failed in the clone:\n${regen.stderr}`)
    // The staleness step compares against `git diff -- data/energy.csv`, so a regenerated file that
    // is merely written is still stale by its definition. Commit it, in the throwaway clone.
    const add = run('git', ['add', 'data/energy.csv'], clone)
    const ci = run('git', ['-c', 'user.email=overlay@local', '-c', 'user.name=port-overlay',
      'commit', '-qm', 'port-overlay: regenerate the ledger under this repo\'s burn model'], clone)
    if (add.status !== 0 || ci.status !== 0) {
      die(`could not commit the regenerated ledger:\n${add.stderr}\n${ci.stderr}`)
    }
    failed = false
    results.pop()
    suite = stage('node scripts/check-all.mjs (ledger regenerated)', () =>
      run(process.execPath, ['scripts/check-all.mjs'], clone))
  }
}

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
