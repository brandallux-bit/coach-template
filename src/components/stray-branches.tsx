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
 */
export default async function StrayBranchBanner() {
  const check = await strayBranches()

  if (check.ok && check.branches.length === 0) return null

  if (!check.ok) {
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
      Branches are absorbed into <code>main</code> automatically within seconds of a push, so this
      means either the automation is failing or it hit a merge conflict it will not resolve on its
      own. Start a coaching session and it will be handled.
    </p>
  )
}
