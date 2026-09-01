#!/usr/bin/env node
/**
 * The whole data-layer check suite, in one place, in the order it must run.
 *
 * WHY THIS EXISTS. GitHub does not trigger workflows from pushes made with the default
 * GITHUB_TOKEN, so `absorb-bot`, `steps-bot` and `rollover-bot` — most of this repo's commit
 * traffic — push to main without CI ever running. The answer is to run the suite inline in each
 * workflow before it pushes.
 *
 * The reason it is ONE script rather than a step list pasted into four workflow files: before
 * this existed there were already three partial, divergent copies. `absorb-branches.yml` ran
 * validate + rowwrite; `daily-rollover.yml` ran validate only; `log-steps.yml` — the one writer
 * to main with no validation at all — ran nothing. A suite copied into four YAML files is the
 * two-homes defect (INVARIANTS.md X-8) wearing a CI hat, and it had already drifted into three
 * different answers about what "checked" means.
 *
 * ORDER MATTERS. The staleness gate runs before the logic tests because a stale ledger is both
 * cheaper to detect and more consequential — CLAUDE.md 0.2 tells every coaching session to read
 * energy.csv first, before the prose. It used to run last, behind a step that crashed on every
 * clean checkout, so it had never executed at all.
 *
 * Usage:
 *   node scripts/check-all.mjs                 # CI mode: a stale energy.csv is a failure
 *   node scripts/check-all.mjs --regen-energy  # bot mode: the caller just mutated an input,
 *                                              # so regenerating energy.csv is expected and the
 *                                              # caller is responsible for committing it
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { hasChart, NO_CHART_MESSAGE } from './lib/athlete.mjs'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const ROOT = join(SCRIPTS, '..')
const REGEN_ENERGY = process.argv.includes('--regen-energy')

/**
 * ⚠ **THE SUITES RUN AGAINST FIXTURES BY DEFAULT AND THIS OPTS THEM INTO THE LIVE CHART TOO.**
 *
 * Why here rather than in each suite's default: `scripts/lib/test-mode.mjs` explains the split. In
 * short, a suite that asserts on this athlete's rows is red on every new chart's first push
 * (audit F-30), so the teeth moved to fixtures — but a chart that HAS rows should still have them
 * looked at, and this is the one caller that knows a real chart is present. Every live assertion
 * behind the flag is gated on the data it needs actually existing, so an empty chart reports "not
 * applicable" rather than failing.
 */
/**
 * ⚠ **CONDITIONAL, AND THE CONDITION IS THE WHOLE REASON TWO SUITES CAN RUN HERE AT ALL.**
 *
 * `--real` opts a suite into assertions ABOUT THE LIVE CHART; the fixtures underneath it need no
 * chart whatsoever. Passing the flag unconditionally therefore made two suites throw on a
 * chart-less repo, which forced them to be registered `needsChart: true`, which SKIPPED their
 * fixtures on exactly the repo where those fixtures are the only thing exercising `rollup.ts`,
 * `forecast.ts` and the prescription resolver at all. A stranger forking this repo got neither
 * half. Withholding just the flag gives them the half that applies.
 */
const REAL = hasChart ? ['--real'] : []

const run = (script, args = []) =>
  execFileSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd: ROOT, stdio: 'pipe' })
    .toString()

const git = (...args) => execFileSync('git', args, { cwd: ROOT, stdio: 'pipe' }).toString()

let failed = false
let skipped = 0

/**
 * A step that needs an athlete, and what happens when there is not one yet.
 *
 * ⚠ **A CHART-LESS REPO MUST GO GREEN, and that is not laxity — it is the whole point of F-39.**
 * Intake is explicitly designed to run across several sessions. `SETUP` used to say "copy the
 * template constants in, then leave the files empty", so every push for the whole of intake failed
 * CI — teaching a brand-new athlete, in their first week, that a red build is normal. That is the
 * precise outcome the no-chart guard was written to prevent, defeated by the setup instructions.
 *
 * So the `cp` moved to the END of intake, and until it happens the chart-dependent steps are
 * SKIPPED WITH A NAMED REASON rather than run and failed. Nothing is weakened: the moment
 * `athlete/constants.json` exists, every step below runs on every push.
 */
const step = (label, fn, { needsChart = true } = {}) => {
  if (failed) return
  if (needsChart && !hasChart) {
    skipped++
    console.log(`skip  ${label}`)
    return
  }
  try {
    const out = fn()
    console.log(`ok    ${label}`)
    if (out) process.stdout.write(out.split('\n').filter((l) => l.startsWith('warn')).map((l) => `      ${l}\n`).join(''))
  } catch (e) {
    failed = true
    console.error(`FAIL  ${label}`)
    const detail = [e.stdout?.toString(), e.stderr?.toString()].filter(Boolean).join('\n').trim()
    if (detail) console.error(detail.split('\n').map((l) => `      ${l}`).join('\n'))
    console.error(`::error::check-all failed at: ${label}`)
  }
}

// Runs with or without a chart: on a chart-less repo its whole job is to say so and exit 0.
step('validate-data      — schema, ranges, enums, dates, ordering', () => run('validate-data.mjs'),
  { needsChart: false })

// ⚠ **A HARD ERROR, and the layer model is why it is entitled to be one.** A missing steps row is
// written by an automation outside this repo and can only be reported (`check-steps-gap.mjs` runs
// on its own schedule, not here). A missing TARGET row is fixable by editing the record — the
// weekday structure in constants.json always answers — so it is the same class as the staleness
// gate below: run the generator, commit the result. It never asks anyone to choose a number.
//
// ⚠ **IN BOT MODE THIS FILLS THE GAP INSTEAD OF FAILING, AND THAT IS NOT A SOFTENING.**
//
// The first version failed here in every mode, on the argument that `daily-rollover.yml` runs
// `--fill-gaps` before the suite, so a gap lasts at most one cron cycle. Two things break that
// argument, and together they invert it:
//
//   1. `git log --author=rollover-bot` returns ZERO commits, ever (audit F-42, still open). The
//      job relied on to close the gap has never once run. The bound was theoretical.
//   2. `log-steps.yml` and `absorb-branches.yml` do NOT fill gaps — they call this suite through
//      `push-retry.mjs`'s default validate command. Measured: with the 2026-08-15 row removed,
//      `node scripts/check-all.mjs --regen-energy` — steps-bot's exact command — exits non-zero.
//
// So a missing TARGET row stopped a logged MEAL and a step count from reaching `main`. That is
// the software blocking reality (INVARIANTS.md, the layer model), arrived at through a check
// written to guarantee targets — and the trigger is exactly what happened on 2026-08-15, an
// automated session declining to write one. The check would have wedged every bot until a human
// noticed.
//
// Filling invents nothing. `--fill-gaps` reads `constants.json.kcalByWeekday` — the same structure
// the generator always uses — and never overwrites an existing row. It is the identical argument
// to `--regen-energy` for `energy.csv` directly below: in bot mode the caller is mid-write, a
// derived file is out of date, and regenerating it is expected rather than a finding. **In CI mode
// it stays a hard error**, because there the fix belongs in a commit rather than in a side effect.
step('check-targets-gap  — no day since the first target lacks one', () => {
  if (!REGEN_ENERGY) return run('check-targets-gap.mjs')
  try {
    return run('check-targets-gap.mjs')
  } catch {
    const out = run('generate-targets.mjs', ['--fill-gaps'])
    console.log('      gap filled (--regen-energy) — the caller must `git add data/targets.csv`')
    // Re-run rather than trust the fill: if anything is still missing, that is a real failure.
    run('check-targets-gap.mjs')
    return out
  }
})

step('energy.csv         — derived ledger is current', () => {
  run('compute-energy.mjs')
  const diff = git('diff', '--', 'data/energy.csv')
  if (!diff.trim()) return ''
  if (REGEN_ENERGY) {
    console.log('      regenerated (--regen-energy) — the caller must `git add data/energy.csv`')
    return ''
  }
  const err = new Error('stale')
  err.stdout = `data/energy.csv is stale. Run 'node scripts/compute-energy.mjs' and commit the result.\n${diff}`
  throw err
})

// src/generated/data.json is gitignored, so it does not exist on a clean checkout and the view
// tests die at ENOENT without it. Every script here imports only relative modules and node:
// builtins, so this needs no npm ci and runs in seconds.
step('build-data-json    — bundle the view tests read', () => run('build-data-json.mjs'))
step('build-findings      — things the coach needs to know', () => run('build-findings.mjs'))
step('test-findings      — the coach-facing findings layer', () => run('test-findings.mjs', REAL))
// Runs after the findings suite because it exercises both halves: the marker audit (which a
// commit CAN fail — a missing marker is fixable by editing the record) and the finding it feeds
// (which nothing may fail, since only the athlete can close it). See scripts/lib/provenance.mjs.
step('test-provenance    — every threshold records who it came from', () => run('test-provenance.mjs'))
step('test-rowwrite      — the dashboard write path', () => run('test-rowwrite.mjs', REAL))
// `needsChart: false` with a conditional `REAL` above: the fixtures run everywhere, the live-chart
// assertions only where there is a chart. `test-cold-start.mjs` STATE A derives the list of suites
// that pass without a chart and fails if any of them was skipped, so this cannot silently regress.
step('test-prescriptions — the effective-date resolver', () => run('test-prescriptions.mjs', REAL),
  { needsChart: false })
step('test-views         — rollup.ts and forecast.ts', () => run('test-views.mjs', REAL),
  { needsChart: false })
// Deliberately inline here rather than in validate-data.yml, unlike test-git-sync.mjs: this suite
// is pure arithmetic plus one short subprocess, so it cannot flake, and what it guards is the
// figure the athlete reads off the page. A wrong deficit reaching main is exactly the thing the
// bots must not push.
step('test-aggregations  — null propagation, one day set, partial markers', () => run('test-aggregations.mjs'))
// Inline here for the same reason as test-aggregations, and it earns it twice over: what it guards
// is the number the athlete eats against, and its behavioural half compares the ledger's
// session_kcal with the dashboard's per-session figures on the live chart. That divergence — 774
// against 1,328 — reached main and stayed there. Pure file reads plus one sha256; ~0.3 s, no
// network, no subprocess, so it cannot flake and cannot hold up a logged meal.
step('test-single-home   — one definition site per constant and formula', () => run('test-single-home.mjs'))
// Both inline, for the reason test-aggregations earns its place: pure file reads, no network, no
// subprocess, ~0.1 s, and what they guard is what the athlete is told to DO. A suspended modality
// still on the template is the defect that has already cost this chart three knee flares — it must
// not be able to reach main between deploys.
step('test-suspensions   — the suspension grammar, on fixtures', () => run('test-suspensions.mjs'),
  { needsChart: false })
// ⚠ **`needsChart: false`, AND THE DEFAULT IS BACKWARDS FOR THIS ONE.** `needsChart` defaults to
// true, so registering it plainly would SKIP this suite on every chart-less repo — which is this
// repo, where the fixtures are the only thing exercising the engine at all. Its cases are entirely
// inline (`scripts/lib/test-mode.mjs`: a suite that asserts on one athlete's rows is red on every
// new chart's first push), so there is nothing here for a missing chart to withhold.
// `test-cold-start.mjs` STATE A asserts the LINE, not the exit status — a suite that skipped is
// still a green run.
step('test-recent-work   — does today repeat the last three days', () => run('test-recent-work.mjs'),
  { needsChart: false })
step('check-suspensions  — nothing prescribes what the block suspends', () => run('check-suspensions.mjs'))

step('check-no-athlete-leak — nothing shared encodes one athlete', () => run('check-no-athlete-leak.mjs'))
// The athlete's own standing instructions. Inert on a chart that has not written one, which is
// the point — see scripts/lib/banned-terms.mjs on why this must never ship as a system rule.
step('check-banned-terms  — the athlete\'s standing instructions', () => run('check-banned-terms.mjs'))
step('test-athlete-leak   — both scanners, on fixture charts', () => run('test-athlete-leak.mjs'),
  { needsChart: false })
// `scripts/test-cold-start.mjs` is DELIBERATELY NOT HERE, for the same reason `test-git-sync.mjs`
// is not: it clones repositories and runs this whole suite inside them, so it is the one check here
// exposed to the environment rather than to the data. A flake in it would stop a logged meal from
// being saved in order to protect a test about a chart that has no meals in it. It runs in
// `.github/workflows/validate-data.yml`, where the audience is the maintainer and the only thing it
// can hold up is a deploy — and where a regression in the cold-start path would actually be
// introduced. It also guards against recursing into itself via COACH_COLD_START.

if (failed) {
  console.error('\ncheck-all: FAILED — nothing should be pushed on this tree.')
  process.exit(1)
}

if (skipped) {
  console.log(`\ncheck-all: ${skipped} step(s) skipped — ${NO_CHART_MESSAGE}`)
}
console.log('\ncheck-all: all checks passed.')
