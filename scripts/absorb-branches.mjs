#!/usr/bin/env node
/**
 * The CLI `.github/workflows/absorb-branches.yml` calls: absorb every stray branch into `main`.
 *
 * The logic is in `scripts/lib/absorb.mjs` — read that file for what it does and why. This one
 * only turns results into a report and an exit code. It operates on `process.cwd()`, so the
 * workflow runs it at the repo root and the fixture runs it inside a synthetic clone.
 *
 * Exit code, deliberately: a branch that MOVED under the job is a warning and exits 0, because the
 * push that moved it re-triggers this workflow and it lands seconds later. A conflict, a validation
 * failure or an exhausted push exits 1, because each needs a human.
 */
import { absorbAll } from './lib/absorb.mjs'
import { validateCmd } from './lib/push-retry.mjs'

const ctx = {
  cwd: process.cwd(),
  remote: process.env.ABSORB_REMOTE || 'origin',
  branch: process.env.ABSORB_MAIN_BRANCH || 'main',
  log: (m) => console.log(m),
}

console.log(`Validation command: ${validateCmd()}`)

const results = absorbAll(ctx)
if (!results.length) {
  console.log('No stray branches. Nothing to absorb.')
  process.exit(0)
}

let hardFailure = false
for (const r of results) {
  switch (r.outcome) {
    case 'deleted':
      console.log(`${r.branch}: ${r.merged} commit(s) merged into ${ctx.branch}, branch deleted.`)
      break
    case 'gone':
      console.log(`${r.branch}: merged; the branch was already removed by something else.`)
      break
    case 'moved':
      console.log(
        `::warning::${r.branch} was pushed to during this run. Nothing was deleted and nothing was `
        + `lost — its commits are still on the branch, and the push that moved it triggers another `
        + `absorb. Merged up to ${r.sha}.`,
      )
      break
    case 'conflict':
      hardFailure = true
      console.log(
        `::error::${r.branch} conflicts with ${ctx.branch}. Left in place for a coaching session to `
        + `resolve by COMBINING rows, never dropping a side (CLAUDE.md 0.1).`,
      )
      console.log(r.detail)
      break
    case 'validation':
      hardFailure = true
      console.log(
        `::error::${r.branch} merges cleanly but fails the data checks, so it was not pushed. The `
        + `branch is untouched; every other branch in this run was handled independently.`,
      )
      console.log(r.detail)
      break
    default:
      hardFailure = true
      console.log(`::error::${r.branch}: ${r.detail ?? 'unknown failure'}`)
  }
}

if (hardFailure) process.exit(1)
console.log('Absorb complete.')
