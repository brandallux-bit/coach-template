import { strayBranches } from '@/lib/github'

/**
 * A loud banner when data is sitting on a branch and therefore is NOT on this dashboard.
 *
 * Rendered on every authenticated page. An empty panel is indistinguishable from "nothing
 * happened" — which is exactly how a logged breakfast went unnoticed for two hours on
 * 2026-08-11. If the chart is incomplete, the chart has to say so.
 *
 * Fail-safe in the honest direction: if the check itself cannot run, it says the check could not
 * run rather than staying silent. Silence here would read as "all clear", which is the one thing
 * it must never mean.
 *
 * ⚠ **EXCEPT WHEN THE CHECK WAS NEVER SWITCHED ON.** A dashboard deployed without
 * `GITHUB_TOKEN` is a read-only dashboard, which `DASHBOARD.md` step 4 explicitly offers as a
 * supported choice. Treating that as a failure put a red "cannot confirm this chart is complete"
 * banner on every page of such a deploy, permanently, from the first minute — and a banner that
 * is always on is a banner nobody reads, which is audit F-45 arriving by a different door. So
 * `unconfigured` gets one quiet line naming the trade, and every other failure stays loud.
 */
export default async function StrayBranchBanner() {
  const check = await strayBranches()

  if (check.ok && check.branches.length === 0) return null

  if (!check.ok) {
    if (check.unconfigured) {
      return (
        <p className="banner note">
          Branch checking is off — this dashboard is read-only (no <code>GITHUB_TOKEN</code>). If
          a coaching session ever commits somewhere other than <code>main</code>, this page will
          not know. A session started with &ldquo;sync my chart&rdquo; still finds and merges it.
        </p>
      )
    }
    return (
      <p className="banner bad">
        <strong>Cannot confirm this chart is complete.</strong> The check for unmerged branches
        did not run ({check.reason}). If data was committed somewhere other than{' '}
        <code>main</code>, it would not appear here and nothing would say so.
      </p>
    )
  }

  const total = check.branches.reduce((n, b) => n + b.ahead, 0)

  return (
    <p className="banner bad">
      <strong>
        This chart is incomplete — {total} commit{total === 1 ? '' : 's'} on{' '}
        {check.branches.length} branch{check.branches.length === 1 ? '' : 'es'}, not on{' '}
        <code>main</code>.
      </strong>{' '}
      Anything logged there is missing from every number on this page.{' '}
      {check.branches.map((b) => `${b.name} (+${b.ahead})`).join(' · ')}.
      <br />
      Start a coaching session and say &ldquo;sync my chart&rdquo; — it merges stray branches
      before doing anything else. If this chart has the optional absorber installed
      (<code>library/optional/workflows/absorb-branches.yml</code>), a branch still sitting here
      means that job failed or hit a merge conflict it will not resolve on its own.
    </p>
  )
}
