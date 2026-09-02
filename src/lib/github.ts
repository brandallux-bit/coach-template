import 'server-only'
import {
  coverIntensitySplit, insertRow, mergeIntoExisting, removeRow, validateRow, type Row,
} from './log-write'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - plain ESM, shared with scripts/ on purpose: ONE definition of "stray branch".
// This filter used to be `b.name !== 'main'` while absorb-branches.yml exempted `keep/**`, so a
// single keep/ branch produced a permanent, unclearable "this chart is incomplete" banner (F-45).
import { isStrayBranch, MAIN_BRANCH } from '../../scripts/lib/branches.mjs'

/**
 * Committing a data/*.csv row straight to GitHub from the dashboard.
 *
 * The repo IS the database. Vercel's filesystem is ephemeral, so a write has to land in git or it
 * does not exist — and landing in git is also what redeploys the dashboard, since
 * src/generated/data.json is built from data/ at build time.
 *
 * Concurrency is real, not theoretical: the athlete logs from more than one surface, a coaching
 * session may be committing at the same moment, and steps-bot and rollover-bot both push on
 * timers. The Contents API takes the blob `sha` it expects to replace and returns 409 when
 * someone else got there first — the same race the push-retry loop in log-steps.yml handles.
 */

const API = 'https://api.github.com'
const BRANCH: string = MAIN_BRANCH

const repo = () => process.env.GITHUB_REPO ?? ''
const token = () => process.env.GITHUB_TOKEN ?? ''

export const writesConfigured = () => Boolean(repo() && token())

/** Thrown for anything the athlete can act on: a bad value, a missing token, a lost race. */
export class LogError extends Error {}

async function gh(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  })
  return res
}

async function readFile(file: string): Promise<{ text: string; sha: string }> {
  const res = await gh(`/repos/${repo()}/contents/data/${file}?ref=${BRANCH}`)
  if (!res.ok) throw new LogError(`Could not read data/${file} from GitHub (${res.status}).`)
  const json = await res.json()
  return { text: Buffer.from(json.content, 'base64').toString('utf8'), sha: json.sha }
}

/**
 * Read → insert → write, retrying the whole cycle on a lost race so the retry merges against
 * whatever landed in between rather than clobbering it.
 */
export async function commitRow(file: string, row: Row, message: string): Promise<void> {
  if (!writesConfigured()) {
    throw new LogError(
      'Logging is not configured: set GITHUB_REPO and GITHUB_TOKEN (contents:write) in Vercel.',
    )
  }

  for (let attempt = 1; attempt <= 4; attempt++) {
    const { text, sha } = await readFile(file)

    // Merge before validating: a partial body.csv update inherits the columns already on file,
    // and `required` fields may be satisfied by the existing row rather than by this form.
    //
    // Then cover the intensity split, before validating rather than after: the covering can only
    // ever raise `light_min` toward `duration_min`, so it can turn a row that would have silently
    // dropped 60 minutes of burn into a complete one, and it can never turn a valid row invalid
    // (the validator's rule is that the parts must not EXCEED the whole). See audit F-03.
    const merged = coverIntensitySplit(file, mergeIntoExisting(text, file, row))
    const errors = validateRow(file, merged)
    if (errors.length) throw new LogError(errors.join(' · '))

    const next = insertRow(text, file, merged)
    if (next === text) return // nothing changed — treat as success, not an error

    const res = await gh(`/repos/${repo()}/contents/data/${file}`, {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: Buffer.from(next, 'utf8').toString('base64'),
        sha,
        branch: BRANCH,
      }),
    })

    if (res.ok) return
    if (res.status !== 409 && res.status !== 422) {
      throw new LogError(`GitHub rejected the write (${res.status}): ${await res.text()}`)
    }
    // 409/422 = someone else wrote this file first. Re-read and rebuild on top of their version.
    await new Promise((r) => setTimeout(r, 300 * attempt))
  }

  throw new LogError('Could not save after 4 attempts — another write kept winning the race.')
}

/**
 * Read → drop the row for `date` → write, with the same retry-on-race behaviour as `commitRow`.
 *
 * Permanent, not a soft delete: no tombstone row, no separate "dismissed" log. The athlete asked
 * for a dismissed coach note to disappear for good rather than be kept anywhere — see
 * `removeRow` in `scripts/lib/rowwrite.mjs` for why that is a deliberate exception to this repo's
 * usual append-only-and-keep-everything rule (data/METHOD.md rule 2) rather than an oversight.
 */
export async function commitRemoval(file: string, date: string, message: string): Promise<void> {
  if (!writesConfigured()) {
    throw new LogError(
      'Dismissing is not configured: set GITHUB_REPO and GITHUB_TOKEN (contents:write) in Vercel.',
    )
  }

  for (let attempt = 1; attempt <= 4; attempt++) {
    const { text, sha } = await readFile(file)
    const next = removeRow(text, file, date)
    if (next === text) return // already gone — someone else's dismiss (or a stale click) won first

    const res = await gh(`/repos/${repo()}/contents/data/${file}`, {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: Buffer.from(next, 'utf8').toString('base64'),
        sha,
        branch: BRANCH,
      }),
    })

    if (res.ok) return
    if (res.status !== 409 && res.status !== 422) {
      throw new LogError(`GitHub rejected the removal (${res.status}): ${await res.text()}`)
    }
    await new Promise((r) => setTimeout(r, 300 * attempt))
  }

  throw new LogError('Could not dismiss after 4 attempts — another write kept winning the race.')
}

/** Does a training.csv row exist for this date? sets.csv rows are invalid without one. */
export async function trainingRowExists(date: string): Promise<boolean> {
  const { text } = await readFile('training.csv')
  return text.replace(/\n$/, '').split('\n').slice(1).some((l) => l.slice(0, 10) === date)
}

export type BranchCheck =
  | { ok: true; branches: { name: string; ahead: number }[] }
  | { ok: false; reason: string }

/**
 * Is anything sitting on a branch right now?
 *
 * `absorb-branches.yml` merges stray branches into `main` within seconds of a push, so this
 * should always come back empty. It exists for when it doesn't: the workflow disabled, its
 * credentials expired, or — by design — a merge conflict it deliberately refuses to resolve.
 *
 * ⚠ The alarm belongs HERE, on the surface the athlete actually looks at. On 2026-08-11 a
 * breakfast logged to a branch was invisible on this dashboard for two hours and thirteen
 * minutes, and nothing on screen suggested anything was wrong — the panel was simply empty,
 * which is indistinguishable from not having eaten. A failing CI run is only visible to someone
 * who goes looking, and the whole point is that they should not have to.
 *
 * ⚠ AND IT MUST MEAN SOMETHING WHEN IT FIRES. "Stray" is decided by `isStrayBranch`, the same
 * function the absorber uses, so this banner cannot disagree with the automation about what it is
 * waiting for. It did: this filter was `b.name !== 'main'` while the workflow deliberately exempts
 * `keep/**`, so using the escape hatch once lit a permanent "this chart is incomplete" banner that
 * no amount of absorbing could ever clear (audit F-45). A permanent alarm is a deleted alarm.
 */
export async function strayBranches(): Promise<BranchCheck> {
  if (!writesConfigured()) return { ok: false, reason: 'GITHUB_REPO / GITHUB_TOKEN not set' }

  try {
    const res = await gh(`/repos/${repo()}/branches?per_page=100`)
    if (!res.ok) return { ok: false, reason: `GitHub returned ${res.status}` }

    const all = (await res.json()) as { name: string }[]
    const stray = all.filter((b) => isStrayBranch(b.name))
    if (!stray.length) return { ok: true, branches: [] }

    // How far ahead of main each one is — "3 commits" is actionable, "a branch exists" is not.
    const branches = await Promise.all(stray.map(async (b) => {
      try {
        const cmp = await gh(`/repos/${repo()}/compare/${BRANCH}...${encodeURIComponent(b.name)}`)
        const json = cmp.ok ? await cmp.json() : null
        return { name: b.name, ahead: json?.ahead_by ?? 0 }
      } catch {
        return { name: b.name, ahead: 0 }
      }
    }))

    return { ok: true, branches: branches.filter((b) => b.ahead > 0) }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'unknown error' }
  }
}
