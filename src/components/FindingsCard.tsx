/**
 * The athlete's alert strip. Usually renders nothing, and that is the design.
 *
 * WHY IT LOOKS LIKE THIS NOW. The first version rendered all seventeen findings, grouped by
 * severity, each with a detail paragraph, an action line and a source. The athlete rejected it:
 *
 *   > "The cards on the dashboard are WAY too much information. And these are all different
 *   > classes of data. They should not be treated the same. ... What does the user need? Why do
 *   > they need it? What are they going to DO with the information?"
 *
 * Working through his four examples told us exactly what was wrong:
 *
 *   "Calorie target is 134 kcal above the RMR floor"  -> a check that PASSED. Nothing is wrong,
 *       there is no action, and it is on his screen. A non-event is noise.
 *   "The budget is built for 1.20 lb/wk, goal is 1.00" -> real, but it is a fact about the plan,
 *       not about today. A footnote where the plan lives, or the weekly review.
 *   "A promotion trigger has an unfilled threshold"   -> a QUESTION FOR HIM, on a page he cannot
 *       answer on. If the system needs something from him the coach asks, in conversation.
 *   "Something in the chart is dated 2026-08-17"      -> an internal integrity message, leaked to
 *       the user, and vague enough to be unactionable even if it were his.
 *
 * So this component renders only `audience: 'athlete'` findings (scripts/lib/findings.mjs), the
 * three-part test being: it is true about HIM, it changes what he does or whether he can trust
 * this page, and the action is available from where he is standing. Everything else goes to the
 * coach at session start, where it can be a conversation.
 *
 * ONE LINE EACH. The detail, the action and the source are for the coach, who has the file open.
 * On his phone the headline is the whole message; if it needs a paragraph it is not an alert.
 *
 * IT RENDERS NOTHING WHEN THERE IS NOTHING. No "all clear" box. The earlier version argued that a
 * vanishing card is indistinguishable from a check that never ran — true, and the wrong trade: a
 * permanent reassurance panel is a thing he learns to scroll past, which is how the one alert that
 * matters gets missed. Whether the checks ran is answered by the build-freshness signal, which is
 * itself an athlete-facing finding.
 */

import type { Finding } from '@/lib/data'

const LABEL: Record<Finding['severity'], string> = {
  critical: 'Critical',
  attention: 'Attention',
  info: 'For information',
}

function FindingItem({ f }: { f: Finding }) {
  return (
    <li className={`finding sev-${f.severity}`}>
      <span className={`pill sev-${f.severity}`}>{LABEL[f.severity]}</span>
      <span>{f.headline}</span>
    </li>
  )
}

export default function FindingsCard({ findings }: { findings: Finding[] }) {
  // Severity orders what is shown; AUDIENCE decides whether it is shown at all.
  const mine = findings
    .filter((f) => f.audience === 'athlete')
    .sort((a, b) => (a.severity === 'critical' ? -1 : b.severity === 'critical' ? 1 : 0))

  if (!mine.length) return null

  return (
    <section className="card findings-card">
      <ul className="finding-list">
        {mine.map((f) => <FindingItem key={f.id} f={f} />)}
      </ul>
    </section>
  )
}
