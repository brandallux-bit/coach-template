import { Card, Empty, Masthead, Nav, Shell, TableView, Tile } from '@/components/ui'
import { LineChart } from '@/components/charts'
import { body, daysBetween, fmt, plan, prettyDate, series, today, trend } from '@/lib/data'
import { allWeeks } from '@/lib/rollup'

export const dynamic = 'force-dynamic'

/** A projection needs a trend, and a trend needs readings. Below this it is noise. */
const MIN_READINGS_FOR_PROJECTION = 7

export default function GoalsPage() {
  const now = today()
  const weightPoints = series(body, 'weight_lb')
  const waistPoints = series(body, 'waist_in')
  const weeks = allWeeks(now)
  const thisWeek = weeks[weeks.length - 1]
  const priorWeeks = weeks.slice(0, -1)

  const latestWeight = weightPoints.at(-1) ?? null
  const latestWaist = waistPoints.at(-1) ?? null
  const weightTrend = trend(weightPoints, MIN_READINGS_FOR_PROJECTION)

  const lostLb = latestWeight ? plan.baselineWeightLb - latestWeight.value : null
  // These triggers exist only if a domain defines them. A chart measuring something else
  // has no waist trigger, and this page renders without one rather than assuming it.
  const toWeightTrigger =
    latestWeight && plan.weightTriggerLb != null ? latestWeight.value - plan.weightTriggerLb : null
  const toWaistTrigger =
    latestWaist && plan.waistTriggerIn != null ? latestWaist.value - plan.waistTriggerIn : null

  // Events are per-chart. Count down to whichever is nearest, whatever it's called.
  const nextEvent = Object.entries(plan.events ?? {})
    .map(([key, date]) => ({ key, date, days: daysBetween(now, date) }))
    .filter((e) => e.days >= 0)
    .sort((a, b) => a.days - b.days)[0]
  const eventLabel = (key: string) =>
    key.replace(/(Depart)?Date$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
  const daysToPhaseEnd = plan.phaseEndDate ? daysBetween(now, plan.phaseEndDate) : null

  // Only ever project from a real slope, and only downward-moving weight reaches the trigger.
  const weeksToWeightTrigger =
    weightTrend && weightTrend.perWeek < 0 && toWeightTrigger != null && toWeightTrigger > 0
      ? toWeightTrigger / -weightTrend.perWeek
      : null

  return (
    <Shell>
      <Masthead title="Goals & Progress" sub={prettyDate(now)} />
      <Nav current="/" />

      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <Tile
          primary
          badge="primary"
          label="Waist at navel"
          value={fmt(latestWaist?.value, 2)}
          unit="in"
          foot={
            !latestWaist
              ? 'no morning-protocol reading yet'
              : toWaistTrigger != null
                ? <>{fmt(toWaistTrigger, 2)}″ to the {plan.waistTriggerIn}″ trigger</>
                : 'no trigger set for this metric'
          }
        />
        <Tile
          label="Weight"
          value={fmt(latestWeight?.value, 1)}
          unit="lb"
          foot={
            lostLb != null
              ? <>{fmt(Math.abs(lostLb), 1)} lb {lostLb >= 0 ? 'below' : 'above'} the {plan.baselineWeightLb} lb baseline</>
              : 'no weigh-in recorded'
          }
        />
        {plan.weightTriggerLb != null && (
          <Tile
            label={`To ${plan.weightTriggerLb} lb trigger`}
            value={fmt(toWeightTrigger, 1)}
            unit="lb"
            foot={
              weeksToWeightTrigger
                ? `~${weeksToWeightTrigger.toFixed(1)} weeks at the current trend`
                : `TBD — needs ${MIN_READINGS_FOR_PROJECTION} weigh-ins, have ${weightPoints.length}`
            }
          />
        )}
        {daysToPhaseEnd != null && (
          <Tile
            label="Phase runway"
            value={String(daysToPhaseEnd)}
            unit="days"
            foot={nextEvent ? `${eventLabel(nextEvent.key)} in ${nextEvent.days} days` : undefined}
          />
        )}
      </div>

      <Card
        title="Most likely timeline"
        caption="Projections are gated on having enough readings to draw a line through. Until then they read TBD — a date extrapolated from three points is a guess wearing a decimal point."
      >
        {weightTrend ? (
          <div className="note-block">
            <p>
              Weight trend over the last {weightTrend.n} readings:{' '}
              <strong>{weightTrend.perWeek >= 0 ? '+' : '−'}{fmt(Math.abs(weightTrend.perWeek), 2)} lb/week</strong>
              {plan.targetRateLbPerWk
                ? <> (plan targets {plan.targetRateLbPerWk[0]}–{plan.targetRateLbPerWk[1]} lb/week).</>
                : '.'}
            </p>
            <p>
              {weeksToWeightTrigger
                ? <>At that rate the {plan.weightTriggerLb} lb demotion trigger arrives in about{' '}
                    <strong>{weeksToWeightTrigger.toFixed(1)} weeks</strong>.
                    {plan.phaseEndDate && <> The phase cap ({plan.phaseEndDate}) binds independently,
                    whichever comes first.</>}</>
                : <>The trend is not moving toward the trigger, so no date is projected.</>}
            </p>
            {plan.waistTriggerIn != null && (
              <p className="footnote">
                Waist is the primary metric and it is not yet projectable — it needs repeated
                morning-protocol readings, not scale weight.
              </p>
            )}
          </div>
        ) : (
          <Empty>
            <strong>TBD.</strong> {weightPoints.length} weigh-in{weightPoints.length === 1 ? '' : 's'} on
            record, {MIN_READINGS_FOR_PROJECTION} needed. Waist: {waistPoints.length} morning-protocol
            reading{waistPoints.length === 1 ? '' : 's'}.
          </Empty>
        )}
      </Card>

      <Card
        title="Weight"
        caption={`Baseline ${plan.baselineWeightLb} lb locked ${plan.baselineDate}.${
          plan.weightTriggerLb ? ` The ${plan.weightTriggerLb} lb line is a demotion trigger, not a goal.` : ''
        }`}
      >
        {weightPoints.length ? (
          <>
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
            <TableView>
              <table>
                <thead><tr><th className="text">Date</th><th>Weight (lb)</th><th>vs baseline</th></tr></thead>
                <tbody>
                  {[...weightPoints].reverse().map((p) => (
                    <tr key={p.date}>
                      <td className="text">{p.date}</td>
                      <td>{p.value.toFixed(1)}</td>
                      <td>{(p.value - plan.baselineWeightLb >= 0 ? '+' : '−') + Math.abs(p.value - plan.baselineWeightLb).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableView>
          </>
        ) : <Empty>No weigh-ins recorded.</Empty>}
      </Card>

      <Card
        title="Waist — the primary metric"
        caption="Morning, fasted, at navel. The 36.5″ intake figure is deliberately excluded: it was taken mid-day, off prednisone, and is not comparable to a morning reading."
      >
        {waistPoints.length ? (
          <>
            <LineChart
              series={[{ name: 'Waist', color: 'var(--series-1)', points: waistPoints }]}
              refLines={[
                ...(plan.waistTriggerIn != null
                  ? [{ value: plan.waistTriggerIn, label: `trigger ${plan.waistTriggerIn}″`, tone: 'good' as const }]
                  : []),
                ...(plan.waistAmbitionIn != null
                  ? [{ value: plan.waistAmbitionIn, label: `ambition ${plan.waistAmbitionIn}″` }]
                  : []),
              ]}
              decimals={2}
              unit="″"
            />
            <p className="footnote">
              {waistPoints.length === 1
                ? 'One reading is a point, not a trend. The 10-day measurement hold is running.'
                : `${waistPoints.length} morning-protocol readings on record.`}
            </p>
          </>
        ) : <Empty>No morning-protocol waist readings yet.</Empty>}
      </Card>

      <Card title="Weekly averages" caption="Completed weeks. This week is shown day by day below.">
        {priorWeeks.length ? (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th className="text">Week of</th><th>Avg weight</th><th>Waist</th><th>Avg steps</th>
                  <th>Sessions</th><th>Intake</th><th>Burn</th><th>Deficit</th>
                </tr>
              </thead>
              <tbody>
                {[...priorWeeks].reverse().map((w) => (
                  <tr key={w.start}>
                    <td className="text">{w.label}</td>
                    <td>{fmt(w.avgWeightLb, 1)}</td>
                    <td>{fmt(w.lastWaistIn, 2)}</td>
                    <td>{fmt(w.avgSteps)}</td>
                    <td>{w.sessions}{plan.sessionsPerWeekFloor ? ` / ${plan.sessionsPerWeekFloor}` : ''}</td>
                    <td>{fmt(w.intakeKcal)}</td>
                    <td>{fmt(w.burnKcal)}</td>
                    <td>{fmt(w.deficitKcal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No completed weeks yet — the block opened {plan.baselineDate}.</Empty>}
      </Card>

      <Card
        title="This week, day by day"
        caption={`Week of ${thisWeek.label}. Sessions counted against the ${plan.sessionsPerWeekFloor}/week floor; walks are counted in steps, not as sessions.`}
      >
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th className="text">Day</th><th>Weight</th><th>Steps</th><th>Intake</th>
                <th>Target</th><th>Protein</th><th>Burn</th><th>Deficit</th>
              </tr>
            </thead>
            <tbody>
              {thisWeek.days.map((d) => (
                <tr key={d.date} className={d.date === now ? 'now' : undefined}>
                  <td className="text">
                    {new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
                    {d.date === now ? ' · today' : ''}
                  </td>
                  <td>{fmt(d.weightLb, 1)}</td>
                  <td>{fmt(d.steps)}</td>
                  <td>{fmt(d.intakeKcal)}</td>
                  <td>{fmt(d.targetKcal)}</td>
                  <td>{fmt(d.proteinG)}</td>
                  <td>{fmt(d.burnKcal)}</td>
                  <td>{fmt(d.deficitKcal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="footnote">
          Sessions this week: <strong>{thisWeek.sessions}</strong> against a floor of {plan.sessionsPerWeekFloor}.
          {' '}Protein floor ({plan.proteinFloorG} g) hit on {thisWeek.proteinDaysHit} of {thisWeek.proteinDaysLogged} logged days.
        </p>
      </Card>

      <p className="footnote">
        Every number here is read from <code>data/</code>. Blanks are TBD, never zero. Burn is
        estimated — the model and its constants are in <code>data/METHOD.md</code>.
      </p>
    </Shell>
  )
}
