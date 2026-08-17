/**
 * A very small wrapper over the `git` binary, so the scripts above it can read like the sequence
 * of decisions they are instead of a wall of `execFileSync` boilerplate.
 *
 * Two rules it exists to enforce:
 *
 * 1. **Never shell-interpolate.** Every call takes an argv array, so a branch name can never be
 *    read as shell syntax. The absorber runs on names that arrive from outside this repo.
 * 2. **A failure carries its output.** `execFileSync` throws an Error whose message says only
 *    "Command failed"; the reason git actually gave lands in `stdout`/`stderr` and is lost unless
 *    something reattaches it. Losing it is how a workflow reports "push failed" and nothing else —
 *    plausible rather than loud (INVARIANTS.md X-7).
 */
import { spawnSync } from 'node:child_process'

export class GitError extends Error {
  constructor(args, result) {
    const detail = [result.stdout, result.stderr].map((s) => (s || '').trim()).filter(Boolean).join('\n')
    super(`git ${args.join(' ')} exited ${result.status}${detail ? `\n${detail}` : ''}`)
    this.name = 'GitError'
    this.args = args
    this.status = result.status
    this.stdout = result.stdout || ''
    this.stderr = result.stderr || ''
  }
}

/** Run git. Throws GitError on a non-zero exit unless `allowFail` is set. */
export function gitRun(args, { cwd = process.cwd(), allowFail = false, env } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: env ?? process.env })
  if (r.error) throw r.error
  const result = { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
  if (!allowFail && r.status !== 0) throw new GitError(args, result)
  return result
}

/** Run git and return trimmed stdout. Throws on failure. */
export const git = (args, opts) => gitRun(args, opts).stdout.trim()

/** Run git and return the full result, never throwing on a non-zero exit. */
export const gitTry = (args, opts) => gitRun(args, { ...opts, allowFail: true })

/** The commit a ref points at, or `null` if the ref does not resolve. */
export function revParse(ref, opts) {
  const r = gitTry(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], opts)
  const sha = r.stdout.trim()
  return r.status === 0 && sha ? sha : null
}

/** How many commits `ref` has that `base` does not. */
export const countAhead = (base, ref, opts) =>
  Number(git(['rev-list', '--count', `${base}..${ref}`], opts))

/** Is there anything staged? */
export const hasStagedChanges = (opts) => gitTry(['diff', '--cached', '--quiet'], opts).status !== 0
