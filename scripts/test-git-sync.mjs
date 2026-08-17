#!/usr/bin/env node
/**
 * The git plumbing, replayed against real repositories.
 *
 * WHAT THIS PROTECTS. This is the only defect class in the 2026-08-13 audit that destroys work the
 * athlete was told was saved, with nothing anywhere reporting it. A coaching session logs a meal,
 * pushes, and says it is saved; `absorb-branches.yml` deletes the branch from a snapshot it read
 * minutes earlier; the commit is gone. No banner — the branch is deleted, so the dashboard's
 * stray-branch check comes back empty. No failed run — the next absorb finds nothing and exits
 * green. A production near-miss is on record at 36 seconds inside the window, and sessions here
 * push as often as 17 s apart.
 *
 * WHY IT SURVIVED SO LONG: the logic lived inside a workflow's `run:` block, where nothing could
 * execute it. Every scenario below builds two bare repositories in a temp directory, runs the real
 * scripts against them, and lands a competing push in the middle — the actual race, not a model of
 * it. The seam that makes that possible is `CHART_VALIDATE_CMD` (see scripts/lib/push-retry.mjs):
 * the fixture substitutes the check suite, which runs at exactly the moment a racing push would
 * land, and uses it to fire one.
 *
 * EVERY CHECK HERE SHIPS WITH THE INPUT THAT MAKES IT FAIL (INVARIANTS.md X-10). Each scenario was
 * watched going red against the defect it describes before the fix landed:
 *
 *   • `git push origin --delete` in place of the lease  -> the late commit is destroyed
 *   • the AHEAD=0 early exit deleting on the stale read -> the late commit is destroyed
 *   • `git pull --rebase` in place of re-apply          -> "CONFLICT (content)", exit 1, row lost
 *   • merge-all/validate-once/push-all-or-nothing       -> the healthy branch never lands
 *
 * Temp repositories go under os.tmpdir() (which honours TMPDIR) and are removed on success. On
 * failure the path is printed and the tree is left in place, because the interesting thing about a
 * failed git race is the repository it left behind.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isStrayBranch, MAIN_BRANCH, KEEP_PREFIX, WORKFLOW_BRANCHES_IGNORE } from './lib/branches.mjs'
import { DEFAULT_VALIDATE_CMD, validateCmd } from './lib/push-retry.mjs'
import { deleteUnderLease } from './lib/absorb.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const ABSORB = join(REPO, 'scripts', 'absorb-branches.mjs')
const COMMIT_PUSH = join(REPO, 'scripts', 'git-commit-push.mjs')

let failed = 0
const ok = (label) => console.log(`ok    ${label}`)
const bad = (label, detail) => { failed++; console.error(`FAIL  ${label}\n      ${String(detail).split('\n').join('\n      ')}`) }
const eq = (label, got, want) => (got === want ? ok(label) : bad(label, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

// --- tiny git harness -------------------------------------------------------------------------

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}\n${r.stdout}${r.stderr}`)
  return r.stdout.trim()
}
const gitTry = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' })

/** A working clone with an identity, so merge commits can be made. */
function clone(origin, path) {
  git(dirname(path), 'clone', '--quiet', origin, path)
  git(path, 'config', 'user.email', 'fixture@example.invalid')
  git(path, 'config', 'user.name', 'fixture')
  return path
}

function write(repoPath, rel, text) {
  const abs = join(repoPath, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, text)
  return abs
}

function commitAll(repoPath, message) {
  git(repoPath, 'add', '-A')
  git(repoPath, 'commit', '-q', '-m', message)
  return git(repoPath, 'rev-parse', 'HEAD')
}

/** A bare origin with one commit on `main`, plus a seeded work clone. */
function newOrigin(root, name, seed = {}) {
  const origin = join(root, `${name}.git`)
  git(root, 'init', '--bare', '--quiet', '--initial-branch=main', origin)
  const work = clone(origin, join(root, `${name}-work`))
  write(work, 'data/steps.csv', seed['data/steps.csv'] ?? 'date,steps\n2026-08-01,1000\n')
  for (const [rel, text] of Object.entries(seed)) write(work, rel, text)
  commitAll(work, 'seed')
  git(work, 'push', '--quiet', 'origin', 'main')
  return { origin, work }
}

/** Remote refs as {branch: sha}. The only thing any of these assertions really cares about. */
function remoteHeads(repoPath, origin) {
  const out = git(repoPath, 'ls-remote', '--heads', origin)
  const heads = {}
  for (const line of out.split('\n').filter(Boolean)) {
    const [sha, ref] = line.split(/\s+/)
    heads[ref.replace('refs/heads/', '')] = sha
  }
  return heads
}

const contains = (repoPath, ref, sha) =>
  gitTry(repoPath, 'merge-base', '--is-ancestor', sha, ref).status === 0

/**
 * A command that runs `cmd` exactly once and then behaves as a passing validation.
 *
 * This is how the race gets injected: it is passed as CHART_VALIDATE_CMD, so it fires between the
 * merge and the push — precisely where a real concurrent push lands.
 */
const raceOnce = (flagFile, cmd) => `if [ ! -f "${flagFile}" ]; then : > "${flagFile}"; ${cmd}; fi`

function runAbsorb(cwd, env = {}) {
  return spawnSync(process.execPath, [ABSORB], {
    cwd, encoding: 'utf8',
    env: { ...process.env, CHART_VALIDATE_CMD: 'true', ...env },
  })
}

const ROOT = mkdtempSync(join(tmpdir(), 'coach-git-sync-'))

// =============================================================================================
console.log('the stray-branch rule has ONE definition (F-45)')

eq('  main is not stray', isStrayBranch(MAIN_BRANCH), false)
eq('  a coaching-session branch is stray', isStrayBranch('claude/breakfast-log-pw347w'), true)
eq(`  a ${KEEP_PREFIX} branch is NOT stray — the absorber exempts it, so the banner must too`,
  isStrayBranch(`${KEEP_PREFIX}old-block`), false)
eq('  an empty name is not a branch', isStrayBranch(''), false)

{
  // The workflow's `on: push: branches-ignore:` is evaluated by GitHub before any of this code
  // runs, so that list is a third home for the rule and can only be kept honest by reading it.
  const yaml = readFileSync(join(REPO, '.github/workflows/absorb-branches.yml'), 'utf8')
  const block = yaml.match(/branches-ignore:\n((?:\s+-\s+.*\n)+)/)?.[1] ?? ''
  const listed = [...block.matchAll(/-\s+'?([^'\s#]+)'?/g)].map((m) => m[1])
  const want = WORKFLOW_BRANCHES_IGNORE
  if (listed.length === want.length && want.every((w) => listed.includes(w))) {
    ok(`  absorb-branches.yml ignores exactly [${want.join(', ')}]`)
  } else {
    bad('  the workflow filter and scripts/lib/branches.mjs have drifted', `yaml=[${listed}] module=[${want}]`)
  }

  // Comments stripped, the same way test-prescriptions.mjs does it: a rule about what the CODE
  // does must not be satisfied — or broken — by prose about it, and the comment that now sits in
  // github.ts quotes the exact expression the assertion below forbids.
  const dash = readFileSync(join(REPO, 'src/lib/github.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
  if (dash.includes('isStrayBranch')) ok('  the dashboard imports the shared rule')
  else bad('  the dashboard must not restate the rule', 'src/lib/github.ts does not use isStrayBranch')
  // Both spellings of the original defect: the literal, and the `BRANCH` constant it actually used.
  if (/!==\s*(['"]main['"]|BRANCH|MAIN_BRANCH)/.test(dash)) {
    bad('  the dashboard has its own filter again',
      'src/lib/github.ts compares a branch name against main directly — that is F-45')
  } else {
    ok('  the dashboard has no second definition of "stray"')
  }
}

// =============================================================================================
console.log('\nthe validation seam defaults to the real suite')

eq('  the default is the full check suite', DEFAULT_VALIDATE_CMD, 'node scripts/check-all.mjs --regen-energy')
eq('  with no override, that is what runs', validateCmd(), DEFAULT_VALIDATE_CMD)
{
  const before = process.env.CHART_VALIDATE_CMD
  process.env.CHART_VALIDATE_CMD = 'true'
  eq('  the override is only ever an override', validateCmd(), 'true')
  if (before === undefined) delete process.env.CHART_VALIDATE_CMD
  else process.env.CHART_VALIDATE_CMD = before
}

// =============================================================================================
console.log('\nF-04 · a commit pushed DURING the absorb is never deleted')
{
  const { origin, work } = newOrigin(ROOT, 'race')
  git(work, 'checkout', '--quiet', '-b', 'claude/meal-log')
  write(work, 'data/meals.csv', 'date,item\n2026-08-14,breakfast\n')
  const early = commitAll(work, 'log breakfast')
  git(work, 'push', '--quiet', 'origin', 'claude/meal-log')

  // The racing session: pushes a second meal to the same branch while absorb is mid-run.
  const racer = clone(origin, join(ROOT, 'race-racer'))
  git(racer, 'checkout', '--quiet', 'claude/meal-log')
  write(racer, 'data/meals.csv', 'date,item\n2026-08-14,breakfast\n2026-08-14,lunch\n')
  const late = commitAll(racer, 'log lunch — 36 seconds inside the window')

  const bot = clone(origin, join(ROOT, 'race-bot'))
  const flag = join(ROOT, 'race.flag')
  const r = runAbsorb(bot, {
    CHART_VALIDATE_CMD: raceOnce(flag, `git -C ${racer} push --quiet origin claude/meal-log`),
  })

  const heads = remoteHeads(bot, origin)
  if (heads['claude/meal-log'] === late) {
    ok('  the branch survives with the late commit still on it')
  } else {
    bad('  THE LATE COMMIT WAS DESTROYED', `refs: ${JSON.stringify(heads)}\n${r.stdout}${r.stderr}`)
  }

  git(bot, 'fetch', '--quiet', 'origin')
  if (contains(bot, 'origin/main', early)) ok('  the commit absorb did merge is on main')
  else bad('  the merged commit did not reach main', r.stdout + r.stderr)

  if (/::warning::claude\/meal-log was pushed to during this run/.test(r.stdout)) {
    ok('  the run says out loud that a branch moved under it')
  } else {
    bad('  a moved branch must be reported, not silently skipped', r.stdout)
  }
  eq('  a self-healing race does not fail the run', r.status, 0)

  // And the whole point: the second run picks it up. No data waits for a human.
  const r2 = runAbsorb(bot)
  const after = remoteHeads(bot, origin)
  git(bot, 'fetch', '--quiet', 'origin')
  if (!after['claude/meal-log'] && contains(bot, 'origin/main', late)) {
    ok('  the next run absorbs it: lunch is on main, branch cleaned up')
  } else {
    bad('  the next run must land the late commit', `refs: ${JSON.stringify(after)}\n${r2.stdout}${r2.stderr}`)
  }
}

// =============================================================================================
console.log('\nF-04a · the LEASE closes the window, not the pre-check')
{
  // The scenario above passes even with an unguarded `git push origin --delete`, because the
  // `ls-remote` pre-check happens to see the moved ref first. That makes it a test of the
  // pre-check, not of the guarantee — and the pre-check is exactly what the audit proposed and
  // what is NOT sufficient. This is the sliver it cannot cover: the racing push lands AFTER the
  // pre-check and BEFORE the delete reaches the server.
  //
  // It is fired from a `receivepack` wrapper, which runs on the remote side before any refs are
  // advertised, so the timing is exact rather than hopeful. Nothing test-only exists in the
  // production code to make this possible — the wrapper is git config on the fixture's own clone.
  const { origin, work } = newOrigin(ROOT, 'window')
  git(work, 'checkout', '--quiet', '-b', 'claude/window')
  write(work, 'data/meals.csv', 'date,item\n2026-08-14,snack\n')
  commitAll(work, 'log snack')
  git(work, 'push', '--quiet', 'origin', 'claude/window')
  const captured = git(work, 'rev-parse', 'HEAD')

  const racer = clone(origin, join(ROOT, 'window-racer'))
  git(racer, 'checkout', '--quiet', 'claude/window')
  write(racer, 'data/meals.csv', 'date,item\n2026-08-14,snack\n2026-08-14,second helping\n')
  const late = commitAll(racer, 'the commit that must not be destroyed')

  const bot = clone(origin, join(ROOT, 'window-bot'))
  const wrapper = join(ROOT, 'window-receivepack.sh')
  // `git receive-pack`, not `git-receive-pack`: the latter lives in libexec/git-core and is not on
  // PATH on Debian/Ubuntu runners, so the hyphenated form would work here and fail in CI.
  writeFileSync(wrapper, `#!/bin/sh
if [ ! -f "${ROOT}/window.fired" ]; then
  : > "${ROOT}/window.fired"
  git -C "${racer}" push --quiet origin claude/window >&2
fi
exec git receive-pack "$@"
`)
  spawnSync('chmod', ['+x', wrapper])
  git(bot, 'config', 'remote.origin.receivepack', wrapper)

  const before = remoteHeads(bot, origin)
  eq('  the pre-check would pass: the remote still reads the captured SHA',
    before['claude/window'], captured)

  const outcome = deleteUnderLease('claude/window', captured, { cwd: bot })
  const after = remoteHeads(bot, origin)

  eq('  the delete is refused', outcome, 'moved')
  if (after['claude/window'] === late) {
    ok('  the branch still stands, carrying the commit that landed in the window')
  } else {
    bad('  THE COMMIT WAS DESTROYED IN THE WINDOW THE PRE-CHECK CANNOT COVER',
      `refs: ${JSON.stringify(after)}`)
  }
}

// =============================================================================================
console.log('\nF-04b · the AHEAD=0 early exit has the same protection')
{
  // The worst version of the bug: nothing is merged at all, so a commit pushed after the snapshot
  // is deleted without ever having been looked at.
  const { origin, work } = newOrigin(ROOT, 'ahead0')

  // A branch whose commits are ALREADY on main — the early-exit path.
  git(work, 'checkout', '--quiet', '-b', 'zzz-contained')
  write(work, 'data/body.csv', 'date,weight\n2026-08-14,181\n')
  commitAll(work, 'weigh-in')
  git(work, 'push', '--quiet', 'origin', 'zzz-contained')
  git(work, 'checkout', '--quiet', 'main')
  git(work, 'merge', '--quiet', '--no-edit', 'zzz-contained')
  git(work, 'push', '--quiet', 'origin', 'main')

  // A second branch, processed first, whose validation step is where the race gets fired.
  git(work, 'checkout', '--quiet', '-b', 'aaa-trigger', 'main')
  write(work, 'data/notes.txt', 'anything\n')
  commitAll(work, 'unrelated work')
  git(work, 'push', '--quiet', 'origin', 'aaa-trigger')

  const racer = clone(origin, join(ROOT, 'ahead0-racer'))
  git(racer, 'checkout', '--quiet', 'zzz-contained')
  write(racer, 'data/body.csv', 'date,weight\n2026-08-14,181\n2026-08-15,180.4\n')
  const late = commitAll(racer, 'second weigh-in, pushed mid-absorb')

  const bot = clone(origin, join(ROOT, 'ahead0-bot'))
  const flag = join(ROOT, 'ahead0.flag')
  const r = runAbsorb(bot, {
    CHART_VALIDATE_CMD: raceOnce(flag, `git -C ${racer} push --quiet origin zzz-contained`),
  })

  const heads = remoteHeads(bot, origin)
  if (heads['zzz-contained'] === late) {
    ok('  an already-merged branch that moved is NOT deleted')
  } else {
    bad('  THE LATE COMMIT WAS DESTROYED ON THE AHEAD=0 PATH', `refs: ${JSON.stringify(heads)}\n${r.stdout}${r.stderr}`)
  }

  const r2 = runAbsorb(bot)
  git(bot, 'fetch', '--quiet', 'origin')
  if (contains(bot, 'origin/main', late)) ok('  and the next run lands it on main')
  else bad('  the next run must land it', r2.stdout + r2.stderr)
}

// =============================================================================================
console.log('\nF-04c · the ordinary case still works, or none of the above means anything')
{
  const { origin, work } = newOrigin(ROOT, 'plain')
  git(work, 'checkout', '--quiet', '-b', 'claude/dinner')
  write(work, 'data/meals.csv', 'date,item\n2026-08-14,dinner\n')
  const sha = commitAll(work, 'log dinner')
  git(work, 'push', '--quiet', 'origin', 'claude/dinner')

  git(work, 'checkout', '--quiet', '-b', `${KEEP_PREFIX}archive`, 'main')
  write(work, 'data/old.txt', 'left alone\n')
  commitAll(work, 'something the athlete wants kept')
  git(work, 'push', '--quiet', 'origin', `${KEEP_PREFIX}archive`)

  const bot = clone(origin, join(ROOT, 'plain-bot'))
  const r = runAbsorb(bot)
  git(bot, 'fetch', '--quiet', 'origin', '--prune')
  const heads = remoteHeads(bot, origin)

  eq('  a clean absorb exits 0', r.status, 0)
  if (contains(bot, 'origin/main', sha)) ok('  the branch is merged into main')
  else bad('  the branch was not merged', r.stdout + r.stderr)
  if (!heads['claude/dinner']) ok('  and then deleted')
  else bad('  the branch should have been deleted', JSON.stringify(heads))
  if (heads[`${KEEP_PREFIX}archive`]) ok(`  ${KEEP_PREFIX} branches are left alone`)
  else bad(`  ${KEEP_PREFIX} must be an escape hatch`, 'it was absorbed')
}

// =============================================================================================
console.log('\nF-18 · a concurrent append to the same CSV converges instead of dying on attempt 1')
{
  const { origin, work } = newOrigin(ROOT, 'append')

  // The mutation: append one dated row. Idempotent, order-independent, re-runnable — the three
  // properties push-retry.mjs requires. Both writers append at EOF, which is what `git pull
  // --rebase` could never survive.
  const appender = join(ROOT, 'append-row.mjs')
  writeFileSync(appender, `
import { readFileSync, writeFileSync } from 'node:fs'
const [file, row] = [process.env.ROW_FILE, process.env.ROW]
const text = readFileSync(file, 'utf8')
if (text.split('\\n').includes(row)) process.exit(0)
const lines = text.trimEnd().split('\\n')
writeFileSync(file, [lines[0], ...lines.slice(1).concat(row).sort()].join('\\n') + '\\n')
`)

  const racer = clone(origin, join(ROOT, 'append-racer'))
  const raceCmd = `ROW_FILE="${racer}/data/steps.csv" ROW=2026-08-13,7777 "${process.execPath}" "${appender}"`
    + ` && git -C "${racer}" commit -q -am 'steps 08-13' && git -C "${racer}" push --quiet origin main`

  const bot = clone(origin, join(ROOT, 'append-bot'))
  const flag = join(ROOT, 'append.flag')
  const r = spawnSync(process.execPath, [
    COMMIT_PUSH,
    '--apply', `${process.execPath} ${appender}`,
    '--message', 'Log steps: 2026-08-14 = 9999',
    '--file', 'data/steps.csv',
  ], {
    cwd: bot, encoding: 'utf8',
    env: {
      ...process.env,
      ROW_FILE: join(bot, 'data/steps.csv'),
      ROW: '2026-08-14,9999',
      CHART_VALIDATE_CMD: raceOnce(flag, raceCmd),
    },
  })

  eq('  the writer that lost the race still exits 0', r.status, 0)
  git(bot, 'fetch', '--quiet', 'origin')
  const csv = git(bot, 'show', 'origin/main:data/steps.csv')
  if (csv.includes('2026-08-14,9999')) ok('  its own row reached main')
  else bad('  THE ROW WAS LOST', `${csv}\n${r.stdout}${r.stderr}`)
  if (csv.includes('2026-08-13,7777')) ok("  and it did not clobber the row that beat it")
  else bad('  the competing row was overwritten', csv)
  if (/re-applying from scratch/.test(r.stdout)) ok('  it got there by re-applying, not by rebasing')
  else bad('  the retry path did not run — the race did not actually happen', r.stdout)
}

// =============================================================================================
console.log('\nF-36 · one branch failing validation does not hold back a healthy one')
{
  const { origin, work } = newOrigin(ROOT, 'perbranch')

  git(work, 'checkout', '--quiet', '-b', 'aaa-bad', 'main')
  write(work, 'data/POISON', 'a row that fails the data checks\n')
  commitAll(work, 'a branch that cannot pass validation')
  git(work, 'push', '--quiet', 'origin', 'aaa-bad')

  git(work, 'checkout', '--quiet', '-b', 'zzz-good', 'main')
  write(work, 'data/meals.csv', 'date,item\n2026-08-14,a perfectly fine meal\n')
  const good = commitAll(work, 'a healthy branch stuck behind it')
  git(work, 'push', '--quiet', 'origin', 'zzz-good')

  const bot = clone(origin, join(ROOT, 'perbranch-bot'))
  // "Validation" here is: the tree must not contain data/POISON. Nothing else about the chart.
  const r = runAbsorb(bot, { CHART_VALIDATE_CMD: 'test ! -f data/POISON' })

  git(bot, 'fetch', '--quiet', 'origin', '--prune')
  const heads = remoteHeads(bot, origin)

  if (contains(bot, 'origin/main', good)) ok('  the healthy branch landed on main')
  else bad('  A HEALTHY BRANCH WAS HELD BACK BY A BAD ONE', `${r.stdout}${r.stderr}`)
  if (!heads['zzz-good']) ok('  and was deleted')
  else bad('  the healthy branch should have been deleted', JSON.stringify(heads))
  if (heads['aaa-bad']) ok('  the failing branch is left standing, untouched')
  else bad('  a branch that failed validation must never be deleted', JSON.stringify(heads))
  eq('  the run fails, because a validation failure needs a human', r.status, 1)
  if (/::error::aaa-bad merges cleanly but fails the data checks/.test(r.stdout)) {
    ok('  and says which branch, and why')
  } else {
    bad('  the failure must name the branch', r.stdout)
  }
}

// =============================================================================================
console.log('\nA merge conflict is left for a human, never resolved by a bot')
{
  const { origin, work } = newOrigin(ROOT, 'conflict')
  git(work, 'checkout', '--quiet', '-b', 'claude/lunch')
  write(work, 'data/steps.csv', 'date,steps\n2026-08-01,1000\n2026-08-02,2222\n')
  commitAll(work, 'branch writes 08-02')
  git(work, 'push', '--quiet', 'origin', 'claude/lunch')

  git(work, 'checkout', '--quiet', 'main')
  write(work, 'data/steps.csv', 'date,steps\n2026-08-01,1000\n2026-08-02,3333\n')
  commitAll(work, 'main writes a different 08-02')
  git(work, 'push', '--quiet', 'origin', 'main')

  const bot = clone(origin, join(ROOT, 'conflict-bot'))
  const r = runAbsorb(bot)
  const heads = remoteHeads(bot, origin)

  eq('  the run fails', r.status, 1)
  if (heads['claude/lunch']) ok('  the branch is left in place with its work intact')
  else bad('  a conflicting branch must never be deleted', JSON.stringify(heads))
  if (/COMBINING rows, never dropping a side/.test(r.stdout)) ok('  and says how it must be resolved')
  else bad('  the message must name the resolution rule (CLAUDE.md 0.1)', r.stdout)
  if (existsSync(join(bot, '.git', 'MERGE_HEAD'))) bad('  the tree was left mid-merge', 'MERGE_HEAD survives')
  else ok('  the tree is left clean for the next branch')
}

// =============================================================================================
if (failed) {
  console.error(`\ngit-sync: ${failed} check(s) failed. Repositories left at ${ROOT}`)
  process.exit(1)
}
rmSync(ROOT, { recursive: true, force: true })
console.log('\ngit-sync: all checks passed.')
