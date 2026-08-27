#!/usr/bin/env node
/**
 * **The commit a coaching session makes.** Validate, then commit, then land it on `main` even if
 * another session pushed while you were writing.
 *
 *   node scripts/chart-commit.mjs -m "Log 2026-08-27 breakfast: eggs, toast, fruit"
 *
 * ⚠ **WHY THIS EXISTS.** `CLAUDE.md` §0.3 already says the rule — *"Before every commit that
 * touches `data/`, run `node scripts/validate-data.mjs` … A failing validator is a hard stop: do
 * not commit past it"* — and then tells the session to type `git add -A && git commit && git
 * push`. So the hard stop was an instruction, and instructions are the thing the charter itself
 * says a session can silently fail to follow:
 *
 *   > a rule that only lives in this file is one a session can silently fail to follow
 *
 * It duly happened. A session wrote a `kcal_override` of 212 with an empty `note`, committed, and
 * pushed. `validate-data` rejects that — an override with no reason is indistinguishable from a
 * figure someone preferred — but nothing ran it, so the error surfaced as a red CI run and a
 * failed dashboard build several minutes later, on a different screen, in front of the wrong
 * person.
 *
 * **The machinery to prevent it was already here and the session was not using it.**
 * `scripts/lib/push-retry.mjs` validates before it commits, and three automated jobs go through
 * it — `log-steps.yml`, `daily-rollover.yml`, `absorb-branches.mjs`. The deterministic writers got
 * the safe path; the one writer that improvises got the honour system. This file gives the session
 * the same guarantee.
 *
 * **HOW IT DIFFERS FROM `git-commit-push.mjs`, and why that one could not simply be reused.**
 * That is the front-end for `pushWithRetry`, whose retry strategy is `git reset --hard
 * origin/main` and re-run the mutation. That is correct for a job whose change is a re-runnable
 * script, and **catastrophic for a session**, whose change is edits already sitting in the working
 * tree: the reset would delete the meal it was asked to log. So the retry here is a MERGE, never a
 * reset, and nothing in this file ever discards a working tree.
 *
 * **A merge conflict stops and asks.** Two sessions appending to the same day is precisely the
 * case `CLAUDE.md` §0.1 says to resolve by *combining, never dropping* — keeping every row from
 * both sides and recomputing totals. That is a judgement call about the athlete's record, so this
 * script refuses to make it, leaves the conflict in place, and says what to do.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { git, gitTry, hasStagedChanges, revParse } from './lib/git.mjs'
import { runValidation, ValidationError, validateCmd } from './lib/push-retry.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)

const flag = (...names) => {
  const i = argv.findIndex((a) => names.includes(a))
  return i === -1 ? null : argv[i + 1]
}
const has = (...names) => argv.some((a) => names.includes(a))

const message = flag('-m', '--message')
const attempts = Number(flag('--attempts') ?? 4)
const files = argv.reduce((acc, a, i) => (a === '--file' ? [...acc, argv[i + 1]] : acc), [])

if (has('-h', '--help') || !message) {
  console.log(`
Commit and push a change to the chart, validating first.

  node scripts/chart-commit.mjs -m "<what changed and why>" [--file <path>]...

  -m, --message   Required. One line: what changed and why (CLAUDE.md §0.3).
  --file          Stage only these paths. Default is everything in the working tree.
  --attempts      Push attempts before giving up (default 4).

Refuses to commit when the chart does not validate. Refuses to work off main.
On a rejected push it merges, re-validates and retries; on a CONFLICT it stops
and hands the decision back, because combining rows is a judgement call.
`.trim())
  // Asking for help is not an error; omitting -m is.
  process.exit(has('-h', '--help') ? 0 : 1)
}

const g = (args) => git(args, { cwd: ROOT })
const gt = (args) => gitTry(args, { cwd: ROOT })
const staged = () => hasStagedChanges({ cwd: ROOT })

// ── 1 · main, always ────────────────────────────────────────────────────────────────────────
// CLAUDE.md §0.3: "Never create a branch, and never commit to any branch other than `main`."
// A branch here is the failure that hides a logged meal from the dashboard for hours.
const branch = g(['rev-parse', '--abbrev-ref', 'HEAD'])
if (branch !== 'main') {
  console.error(`\nRefusing to commit: you are on "${branch}", not main.`)
  console.error('CLAUDE.md §0.3 — the chart has no PR workflow and a branch strands data where')
  console.error('the dashboard cannot see it. Switch to main and re-run:\n')
  console.error('    git checkout main\n')
  process.exit(1)
}

const stage = () => {
  if (files.length) g(['add', '--', ...files])
  else g(['add', '-A'])
}

stage()
if (!staged()) {
  console.log('Nothing to commit — the working tree matches HEAD.')
  process.exit(0)
}

// ── 2 · the gate ────────────────────────────────────────────────────────────────────────────
// Before the commit, not after. `runValidation` is `push-retry`'s, so "what validation means" has
// one definition and the bots and the session cannot drift apart on it.
const validate = () => {
  try {
    runValidation(ROOT, (s) => console.log(s))
  } catch (err) {
    if (!(err instanceof ValidationError)) throw err
    // `runValidation` attaches the suite's own output to the error. PRINT IT — the banner below
    // tells the session it was stopped, and this is the only thing that tells it what to fix.
    // Without it the message said "fix what the checks above named" above nothing at all.
    console.error(`\n${err.message}`)
    console.error(`\n${'─'.repeat(78)}`)
    console.error('NOT COMMITTED — the chart does not validate.')
    console.error(`${'─'.repeat(78)}\n`)
    console.error('Your edits are untouched in the working tree. Nothing was staged away and')
    console.error('nothing was pushed. Fix what the checks above named, then run this again.\n')
    console.error(`The gate is: ${validateCmd()}\n`)
    console.error('This is CLAUDE.md §0.3\'s "a failing validator is a hard stop", enforced here')
    console.error('rather than asked for — a red check is not a note to fix later.\n')
    process.exit(1)
  }
  // Validation regenerates derived files (energy.csv) when it runs with --regen-energy, so
  // whatever it rewrote has to join the commit or the next run reports it stale.
  stage()
}

validate()
g(['commit', '-m', message])
console.log(`committed: ${message}`)

// ── 3 · land it, surviving a concurrent write ───────────────────────────────────────────────
for (let attempt = 1; attempt <= attempts; attempt++) {
  const push = gt(['push', 'origin', 'HEAD:main'])
  if (push.status === 0) {
    console.log(`pushed (attempt ${attempt}) — ${revParse('HEAD', { cwd: ROOT }).slice(0, 7)}`)
    process.exit(0)
  }

  if (attempt === attempts) break
  console.log(`\npush rejected — another session pushed first. Merging and retrying (${attempt}/${attempts - 1}).`)
  g(['fetch', 'origin', 'main'])

  const merge = gt(['merge', 'origin/main', '--no-edit'])
  if (merge.status !== 0) {
    const conflicted = gt(['diff', '--name-only', '--diff-filter=U'])
      .stdout.trim().split('\n').filter(Boolean)
    console.error(`\n${'─'.repeat(78)}`)
    console.error('COMMITTED, NOT PUSHED — the merge conflicts and the resolution is yours.')
    console.error(`${'─'.repeat(78)}\n`)
    console.error(`Conflicted:\n${conflicted.map((f) => `    ${f}`).join('\n')}\n`)
    console.error('CLAUDE.md §0.1: resolve by COMBINING, NEVER DROPPING — keep every row from')
    console.error('both sides, recompute any totals, and say plainly in your next message to the')
    console.error('athlete that this happened and what was merged. Two sessions appending to the')
    console.error('same day is the ordinary case, and picking a side silently loses a meal.\n')
    console.error('Resolve, then:\n')
    console.error('    git add -A && git commit --no-edit')
    console.error('    node scripts/chart-commit.mjs -m "<the same message>"\n')
    process.exit(1)
  }

  // The merge brought in someone else's rows; the ledger derived from them may now be stale, and
  // their rows have never been checked against ours. Re-run the gate on the combined tree.
  validate()
  if (staged()) g(['commit', '--amend', '--no-edit'])
}

console.error(`\nCommitted, but could not push after ${attempts} attempts.`)
console.error('The commit is safe in the local repo. Try again, or push by hand.')
process.exit(1)
