import { Card, Empty, Legend, Masthead, Nav, Shell } from '@/components/ui'
import { DeficitBars, GroupedBars, LineChart } from '@/components/charts'
import { body, fmt, plan, prettyDate, series, today } from '@/lib/data'
import { allWeeks } from '@/lib/rollup'

export const dynamic = 'force-dynamic'

export default function HistoryPage() {
  const now = today()
  const weeks = allWeeks(now)
  // Only meaningful where the chart has an energy budget at all.
  const plannedWeeklyDeficit = plan.weeklyKcalBudget != null
    ? plan.estMaintenanceKcal * 7 - plan.weeklyKcalBudget
    : null

  const label = (w: (typeof weeks)[number], i: number) =>
    i === weeks.length - 1 ? `${w.label}*` : w.label

  const intakeGroups = weeks.map((w, i) => ({
    key: w.start,
    label: label(w, i),
    values: [w.intakeKcal, w.targetKcal],
  }))

  const burnGroups = weeks.map((w, i) => ({
    key: w.start,
    label: label(w, i),
    // Plan side is the flat maintenance estimate over the SAME days that produced a burn figure.
    // Using the calendar week would compare a 4-day partial against 7 planned days.
    values: [w.burnKcal, w.burnDays ? plan.estMaintenanceKcal * w.burnDays : null],
  }))

  const deficitGroups = weeks.map((w, i) => ({
    key: w.start,
    label: label(w, i),
    value: w.deficitKcal,
  }))

  const weightPoints = series(body, 'weight_lb')
  const waistPoints = series(body, 'waist_in')
  const neckPoints = series(body, 'neck_in')
  const partial = weeks.length > 0

  return (
    <Shell>
      <Masthead title="History" sub={prettyDate(now)} />
      <Nav current="/history" />

      <Card
        title="Calories in — actual vs plan"
        caption={<>Weekly totals.{plan.weeklyKcalBudget != null && <> The plan is a weekly budget of ~{plan.weeklyKcalBudget.toLocaleString()} kcal, not a flat daily number — it is built to absorb the occasions in <code>values.md</code>.</>}</>}
      >
        <Legend items={[
          { label: 'Eaten', color: 'var(--series-1)' },
          { label: 'Plan', color: 'var(--series-2)' },
        ]} />
        {weeks.length ? (
          <GroupedBars
            groups={intakeGroups}
            series={[{ name: 'Eaten', color: 'var(--series-1)' }, { name: 'Plan', color: 'var(--series-2)' }]}
            unit=" kcal"
          />
        ) : <Empty>No weeks recorded.</Empty>}
      </Card>

      <Card
        title="Calories out — estimated vs plan"
        caption={<>Estimated expenditure: RMR (recomputed daily from that day&rsquo;s weight) + food thermic effect + non-step movement + steps + session METs. The plan line is the flat ~{plan.estMaintenanceKcal.toLocaleString()} kcal/day maintenance estimate the targets were set against. The model is in <code>data/METHOD.md</code>.</>}
      >
        <Legend items={[
          { label: 'Estimated burn', color: 'var(--series-1)' },
          { label: 'Plan maintenance', color: 'var(--series-2)' },
        ]} />
        {weeks.length ? (
          <GroupedBars
            groups={burnGroups}
            series={[
              { name: 'Estimated burn', color: 'var(--series-1)' },
              { name: 'Plan maintenance', color: 'var(--series-2)' },
            ]}
            unit=" kcal"
          />
        ) : <Empty>No weeks recorded.</Empty>}
      </Card>

      <Card
        title="Energy balance"
        caption={<>Burn minus intake, by week. Above the line is a deficit; below it, in red, is a surplus.{plannedWeeklyDeficit != null && <> The dashed line is the planned deficit of ~{plannedWeeklyDeficit.toLocaleString()} kcal/week{plan.targetRateLbPerWk && <> — roughly {plan.targetRateLbPerWk[0]}&ndash;{plan.targetRateLbPerWk[1]} lb</>}.</>}</>}
      >
        {weeks.length ? (
          <DeficitBars
            groups={deficitGroups}
            refLine={plannedWeeklyDeficit != null
              ? { value: plannedWeeklyDeficit, label: `plan ${plannedWeeklyDeficit.toLocaleString()}` }
              : undefined}
          />
        ) : <Empty>No weeks recorded.</Empty>}
      </Card>

      <Card title="Weight" caption="Every morning-protocol reading, not weekly averages — the averages are on the Goals page.">
        {weightPoints.length ? (
          <LineChart
            series={[{ name: 'Weight', color: 'var(--series-1)', points: weightPoints }]}
            refLines={[
              { value: plan.baselineWeightLb, label: `baseline ${plan.baselineWeightLb}` },
              ...(plan.weightTriggerLb != null
                ? [{ value: plan.weightTriggerLb, label: `trigger ${plan.weightTriggerLb}`, tone: 'good' as const }]
                : []),
            ]}
            unit=" lb"
          />
        ) : <Empty>No weigh-ins recorded.</Empty>}
      </Card>

      <Card
        title="Waist and neck"
        caption="Charted separately from weight, on their own axis. Two measures of different scale never share one."
      >
        {waistPoints.length ? (
          <>
            <Legend items={[
              { label: 'Waist', color: 'var(--series-1)', line: true },
              ...(neckPoints.length ? [{ label: 'Neck', color: 'var(--series-2)', line: true }] : []),
            ]} />
            <LineChart
              series={[
                { name: 'Waist', color: 'var(--series-1)', points: waistPoints },
                ...(neckPoints.length ? [{ name: 'Neck', color: 'var(--series-2)', points: neckPoints }] : []),
              ]}
              refLines={plan.waistTriggerIn != null
                ? [{ value: plan.waistTriggerIn, label: `waist trigger ${plan.waistTriggerIn}″`, tone: 'good' as const }]
                : []}
              decimals={2}
              unit="″"
            />
          </>
        ) : <Empty>No morning-protocol tape readings yet.</Empty>}
      </Card>

      <Card title="Raw weekly numbers" caption="The table behind every chart on this page.">
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th className="text">Week of</th><th>Days logged</th><th>Avg weight</th><th>Waist</th><th>Avg steps</th>
                <th>Sessions</th><th>Eaten</th><th>Plan</th><th>Burn (est.)</th><th>Deficit</th>
              </tr>
            </thead>
            <tbody>
              {[...weeks].reverse().map((w, i) => (
                <tr key={w.start} className={i === 0 ? 'now' : undefined}>
                  <td className="text">{w.label}{i === 0 ? '*' : ''}</td>
                  <td>{w.burnDays} / {w.days.length}</td>
                  <td>{fmt(w.avgWeightLb, 1)}</td>
                  <td>{fmt(w.lastWaistIn, 2)}</td>
                  <td>{fmt(w.avgSteps)}</td>
                  <td>{w.sessions}</td>
                  <td>{fmt(w.intakeKcal)}</td>
                  <td>{fmt(w.targetKcal)}</td>
                  <td>{fmt(w.burnKcal)}</td>
                  <td>{fmt(w.deficitKcal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {partial && (
          <p className="footnote">
            * Week to date — a partial week, so its totals are not comparable to a full one.
            Weeks are Monday-anchored, matching how the Mon–Thu / Fri–Sun budget is written.
          </p>
        )}
      </Card>
    </Shell>
  )
}
