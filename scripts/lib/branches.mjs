/**
 * What counts as a STRAY branch — the single definition, shared by everything that has an opinion.
 *
 * WHY THIS FILE EXISTS. There were two definitions and they disagreed. `absorb-branches.yml`
 * deliberately exempts `keep/**` (the athlete's escape hatch for a branch he wants left alone);
 * `src/lib/github.ts` filtered only `name !== 'main'`. So a single `keep/` branch produced a
 * permanent "This chart is incomplete" banner on the dashboard that nothing could ever clear —
 * training him to scroll past the one alarm that must never be ignored (audit F-45).
 *
 * That is INVARIANTS.md X-8 with a branch name instead of a number: one rule, two homes, guaranteed
 * drift. The rule now lives here, in plain ESM, so the node side (`scripts/absorb-branches.mjs`)
 * and the TypeScript side (`src/lib/github.ts`) import the same function rather than each
 * restating it — the same arrangement `scripts/lib/rowwrite.mjs` already has with
 * `src/lib/log-write.ts`.
 *
 * THE THIRD HOME IS UNAVOIDABLE AND IS THEREFORE CHECKED. GitHub's `on: push: branches-ignore:`
 * filter is evaluated by GitHub before any of this code runs, so the pattern list has to be
 * written literally in the YAML. `WORKFLOW_BRANCHES_IGNORE` below is what that list must say, and
 * `scripts/test-git-sync.mjs` reads the workflow file and asserts they still agree.
 */

/** The one branch this chart works on. CLAUDE.md 0.3: never commit anywhere else. */
export const MAIN_BRANCH = 'main'

/**
 * The escape hatch. A branch under this prefix is left alone by the absorber, so it must also be
 * left out of the dashboard's alarm — otherwise using the hatch breaks the alarm permanently.
 */
export const KEEP_PREFIX = 'keep/'

/**
 * Is this branch one the absorber will pull into `main` and delete?
 *
 * `false` for `main` itself and for anything under `keep/`. Everything else is a bug report:
 * something committed the athlete's data somewhere the dashboard cannot see it.
 */
export function isStrayBranch(name) {
  if (typeof name !== 'string' || name === '') return false
  if (name === MAIN_BRANCH) return false
  if (name.startsWith(KEEP_PREFIX)) return false
  return true
}

/** Filter a list of branch names down to the stray ones. */
export const strayBranchNames = (names) => names.filter(isStrayBranch)

/**
 * What `.github/workflows/absorb-branches.yml` must carry in `on: push: branches-ignore:`.
 * Asserted against the real file by `scripts/test-git-sync.mjs`.
 */
export const WORKFLOW_BRANCHES_IGNORE = [MAIN_BRANCH, `${KEEP_PREFIX}**`]
