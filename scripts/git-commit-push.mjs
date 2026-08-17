#!/usr/bin/env node
/**
 * Run a mutation, check it, commit it, and land it on `main` — surviving a concurrent write.
 *
 * This is the command-line front for `scripts/lib/push-retry.mjs`, used by `log-steps.yml` and
 * `daily-rollover.yml`. `scripts/absorb-branches.mjs` imports the library directly instead, because
 * its mutation is a merge it needs to classify (a conflict is a different outcome from a failure)
 * and it repeats the whole cycle per branch.
 *
 * All three used to carry their own copy of the loop, and all three had the same defect: on a
 * rejected push they ran `git pull --rebase`, which conflicts on every concurrent append to an
 * append-only CSV and killed the step on attempt 1 under `bash -e`. See the header of
 * `scripts/lib/push-retry.mjs` for the mechanism and for what `--apply` must guarantee.
 *
 * Usage:
 *   node scripts/git-commit-push.mjs \
 *     --apply "node scripts/log-steps-row.mjs" \
 *     --message "Log steps: 2026-08-14 = 9432" \
 *     --file data/steps.csv --file data/energy.csv
 *
 * `--apply` is re-run from a tree reset to `origin/main` on every retry, so it must be idempotent
 * and order-independent. Pass its inputs through the environment, not by interpolating them into
 * the command string.
 */
import { spawnSync } from 'node:child_process'
import { pushWithRetry } from './lib/push-retry.mjs'

const argv = process.argv.slice(2)
const opts = { files: [], attempts: 5 }

for (let i = 0; i < argv.length; i++) {
  const next = () => {
    const v = argv[++i]
    if (v === undefined) { console.error(`::error::${argv[i - 1]} needs a value`); process.exit(2) }
    return v
  }
  switch (argv[i]) {
    case '--apply': opts.apply = next(); break
    case '--message': opts.message = next(); break
    case '--file': opts.files.push(next()); break
    case '--remote': opts.remote = next(); break
    case '--branch': opts.branch = next(); break
    case '--attempts': opts.attempts = Number(next()); break
    default:
      console.error(`::error::unknown argument: ${argv[i]}`)
      process.exit(2)
  }
}

if (!opts.apply || !opts.message) {
  console.error('::error::--apply and --message are both required')
  process.exit(2)
}

const cwd = process.cwd()

const apply = () => {
  const r = spawnSync(opts.apply, { cwd, shell: true, stdio: 'inherit' })
  if (r.error) throw new Error(`could not run "${opts.apply}": ${r.error.message}`)
  if (r.status !== 0) throw new Error(`"${opts.apply}" exited ${r.status}`)
  return { changed: true }
}

try {
  const result = pushWithRetry({ ...opts, apply, cwd })
  if (result.pushed) console.log(`Pushed on attempt ${result.attempts}.`)
  else console.log(`Nothing to push — ${result.note}.`)
} catch (e) {
  console.error(`::error::${e.message}`)
  process.exit(1)
}
