/**
 * Landing a mutation on `main` when something else may land one at the same moment.
 *
 * ONE HOME FOR ONE ALGORITHM. `log-steps.yml`, `daily-rollover.yml` and `absorb-branches.yml` each
 * carried their own copy of a push-retry loop, and all three copies had the same defect (audit
 * F-18): on a rejected push they ran `git pull --rebase`. That is the wrong primitive for an
 * append-only CSV. Two writers appending at EOF conflict *every* time, the rebase stops with a
 * conflict, the step dies on attempt 1 under GitHub's default `bash -e`, and attempts 2-5 are
 * decorative for the only failure the loop exists to survive. Measured:
 *
 *     Push failed (attempt 1) - pulling and retrying...
 *     CONFLICT (content): Merge conflict in steps.csv
 *     >>> STEP EXIT CODE = 1 ;  the 9999 row reached main? 0
 *
 * The fix is not a better merge driver. It is to stop merging: **throw the local attempt away and
 * re-apply the mutation to whatever is now on `main`.** `src/lib/github.ts` already does exactly
 * this on the dashboard write path (read -> insert -> write, re-read on 409), which is why that
 * path has never lost a row.
 *
 * ── THE CONTRACT ─────────────────────────────────────────────────────────────────────────────
 *
 * `apply` is the parameter that makes this shared: the three callers mutate different things
 * (append a steps row; generate a targets row; merge a branch). Anything passed as `apply` MUST be:
 *
 *   • **Re-runnable from a clean tree.** It is called again after `reset --hard origin/main`, and
 *     it must not depend on anything a previous attempt did.
 *   • **Idempotent.** Re-applying against a tree that already contains the result must be a no-op
 *     that reports `changed: false`, not a duplicate row and not an error.
 *   • **Order-independent.** The result must not depend on whether it ran before or after the
 *     write that beat it. (Appending a dated row, generating a dated row and merging a commit are
 *     all order-independent; "increment a counter" would not be.)
 *
 * Those three properties are what make the loop converge. They hold for every mutation this repo
 * performs, which is why re-apply is available at all — it is not a general-purpose answer.
 *
 * `apply` returns `{ changed: boolean, note?: string }`, or `void` (treated as changed). It may
 * create commits itself (a merge does); the harness commits anything left in the working tree.
 *
 * ── THE VALIDATION SEAM ──────────────────────────────────────────────────────────────────────
 *
 * `validate` defaults to the real suite, `node scripts/check-all.mjs --regen-energy`, and the
 * default is the safe one: nothing reaches `main` that would take the dashboard down. It is
 * overridable by env (`CHART_VALIDATE_CMD`) for one reason only — `scripts/test-git-sync.mjs`
 * replays these races against synthetic two-commit repositories, where running the chart's data
 * checks would be meaningless. The command in force is printed on every run, so a log always says
 * what was actually checked.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { git, gitTry, revParse, hasStagedChanges } from './git.mjs'

/** The real suite. Overridden only by the fixture; see the header. */
export const DEFAULT_VALIDATE_CMD = 'node scripts/check-all.mjs --regen-energy'

export const validateCmd = () => process.env.CHART_VALIDATE_CMD || DEFAULT_VALIDATE_CMD

export class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError' }
}

/** Run the check suite in `cwd`. Throws ValidationError with the output attached. */
export function runValidation(cwd, log = console.log) {
  const cmd = validateCmd()
  log(`  validating: ${cmd}`)
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8' })
  if (r.error) throw new ValidationError(`could not run "${cmd}": ${r.error.message}`)
  if (r.status !== 0) {
    const detail = [r.stdout, r.stderr].map((s) => (s || '').trim()).filter(Boolean).join('\n')
    throw new ValidationError(`"${cmd}" exited ${r.status}\n${detail}`)
  }
  return r.stdout ?? ''
}

/**
 * Apply a mutation and get it onto `remote/branch`, re-applying from scratch on every lost race.
 *
 * Returns `{ pushed, attempts, note }`. `pushed: false` with a note means there was nothing to do,
 * which is a success: the row was already on file, or another writer got there first with the same
 * content. Throws on a mutation error, a validation failure, or exhausting `attempts`.
 */
export function pushWithRetry({
  apply,
  message,
  files = [],
  cwd = process.cwd(),
  remote = 'origin',
  branch = 'main',
  attempts = 5,
  backoffMs = 2000,
  validate = null,
  log = console.log,
}) {
  const g = (args, opts) => git(args, { cwd, ...opts })

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) {
      // Throw the whole attempt away, including any merge state, and start again from whatever
      // is on the remote NOW. This is the line `git pull --rebase` used to be.
      log(`  attempt ${attempt}: resetting to ${remote}/${branch} and re-applying from scratch`)
      g(['fetch', remote, branch])
      g(['reset', '--hard', `${remote}/${branch}`])
    }

    const applied = apply({ cwd, attempt }) ?? { changed: true }
    if (applied.changed === false) {
      return { pushed: false, attempts: attempt, note: applied.note ?? 'nothing to do' }
    }

    ;(validate ?? (() => runValidation(cwd, log)))()

    const present = files.filter((f) => existsSync(join(cwd, f)))
    if (present.length) g(['add', '--', ...present])
    if (hasStagedChanges({ cwd })) g(['commit', '-m', message])

    const head = revParse('HEAD', { cwd })
    const upstream = revParse(`${remote}/${branch}`, { cwd })
    if (head === upstream) {
      return { pushed: false, attempts: attempt, note: 'nothing new to push' }
    }

    const push = gitTry(['push', remote, `HEAD:${branch}`], { cwd })
    if (push.status === 0) return { pushed: true, attempts: attempt, note: applied.note }

    log(`  push rejected on attempt ${attempt}: ${(push.stderr || '').trim().split('\n').pop()}`)
    if (attempt < attempts && backoffMs) sleep(backoffMs)
  }

  throw new Error(`could not push to ${remote}/${branch} after ${attempts} attempts`)
}

/** Synchronous sleep — this runs in a one-shot CI step, there is nothing else to yield to. */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}
