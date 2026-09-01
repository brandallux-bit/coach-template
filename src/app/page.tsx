import { Card, Empty, Legend, Masthead, Nav, Shell, TableView, Tile } from '@/components/ui'
import { LineChart } from '@/components/charts'
import FindingsCard from '@/components/FindingsCard'
import MetricsCard from '@/components/metrics-card'
import {
  MIN_READINGS_FOR_PROJECTION, body, confoundedDates, daysBetween, fmt, plan, prettyDate,
  series, today, trend,
} from '@/lib/data'
import { viewFindings } from '@/lib/findings'
import { hasStepFeed } from '@/lib/movement'
import { allWeeks, missingBurnLabels } from '@/lib/rollup'

export const dynamic = 'force-dynamic'

// A projection needs a trend, and a trend needs readings. The threshold is `trend()`'s own default
// in src/lib/data.ts, imported rather than restated here — this page and that default were two
// separate `7`s, so lowering one would have left the page saying "needs 7 weigh-ins" while every
// other caller projected from fewer (audit F-71).

export default function GoalsPage() {
  const now = today()
  const hasFeed = hasStepFeed(plan.stepFeed)
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
  const toWeightCheckpoint =
    latestWeight && plan.weightCheckpointLb != null ? latestWeight.value - plan.weightCheckpointLb : null
  const toWaistTrigger =
    latestWaist && plan.waistTriggerIn != null ? latestWaist.value - plan.waistTriggerIn : null
  // A chart with neither a waist trigger nor a waist reading has no waist domain, and this page
  // renders without one rather than asserting one.
  // A chart may declare that one thing it tracks makes another unreliable — see `confoundedDates`.
  // Empty map on a chart that declares none, in which case every reading is "clean" and the split
  // below collapses to the single series this page has always drawn.
  const waistConfounds = confoundedDates('waist_in')
  const cleanWaist = waistPoints.filter((p) => !waistConfounds.has(p.date))
  const confoundedWaist = waistPoints.filter((p) => waistConfounds.has(p.date))
  // **A plan may want weight NOT to move**, and saying so is not the same as having no target.
  // A recomposition phase, or any chart where losing weight works against another domain, sets
  // targetRateLbPerWk to [0, 0]. Rendering that as "plan targets 0-0 lb/week" is technically true
  // and useless; worse, the tiles below default to reading a drop as progress, which is the
  // opposite of what such a plan wants.
  const holdingWeight =
    Array.isArray(plan.targetRateLbPerWk)
    && plan.targetRateLbPerWk[0] === 0 && plan.targetRateLbPerWk[1] === 0
  const waistIsPrimary = plan.waistTriggerIn != null
  const showWaist = waistIsPrimary || waistPoints.length > 0

  // Events are per-chart. Count down to whichever is nearest, whatever it's called.
  const nextEvent = Object.entries(plan.events ?? {})
    .map(([key, date]) => ({ key, date, days: daysBetween(now, date) }))
    .filter((e) => e.days >= 0)
    .sort((a, b) => a.days - b.days)[0]
  const eventLabel = (key: string) =>
    key.replace(/(Depart)?Date$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
  const daysToPhaseEnd = plan.phaseEndDate ? daysBetween(now, plan.phaseEndDate) : null

  // Only ever project from a real slope, and only downward-moving weight reaches the trigger.
  const weeksToWeightCheckpoint =
    weightTrend && weightTrend.perWeek < 0 && toWeightCheckpoint != null && toWeightCheckpoint > 0
      ? toWeightCheckpoint / -weightTrend.perWeek
      : null

  return (
    <Shell>
      <Masthead title="Goals & Progress" sub={prettyDate(now)} />
      <Nav current="/" />

      {/* Above the tiles on purpose. A `critical` finding is the reason to read every number
          below it differently — a stale build, for instance, means all of them are yesterday's —
          so it cannot sit underneath them. */}
      <FindingsCard findings={viewFindings(now)} />

      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        {/* Waist is THIS chart's primary metric, not the system's. It renders when the chart has
            either a reading or a trigger, and it carries the `primary` badge only when the chart
            actually declared it a goal — a new athlete with no waist domain used to get a
            primary-badged "Waist at navel" tile reading TBD (audit F-31). */}
        {showWaist && (
          <Tile
            primary={waistIsPrimary}
            badge={waistIsPrimary ? 'primary' : undefined}
            label={plan.copy?.waistTileLabel ?? 'Waist'}
            value={fmt(latestWaist?.value, 2)}
            unit="in"
            foot={
              !latestWaist
                ? 'no reading yet'
                : toWaistTrigger != null
                  ? <>{fmt(toWaistTrigger, 2)}″ to the {plan.waistTriggerIn}″ goal</>
                  : 'no trigger set for this metric'
            }
          />
        )}
        <Tile
          label="Weight"
          value={fmt(latestWeight?.value, 1)}
          unit="lb"
          foot={
            lostLb == null
              ? 'no weigh-in recorded'
              : holdingWeight
                ? <>{Math.abs(lostLb) < 0.05
                    ? <>level with the {plan.baselineWeightLb} lb baseline — holding is the goal</>
                    : <>{fmt(Math.abs(lostLb), 1)} lb {lostLb >= 0 ? 'below' : 'above'} the{' '}
                        {plan.baselineWeightLb} lb baseline — holding is the goal, not dropping</>}</>
                : <>{fmt(Math.abs(lostLb), 1)} lb {lostLb >= 0 ? 'below' : 'above'} the {plan.baselineWeightLb} lb baseline</>
          }
        />
        {plan.weightCheckpointLb != null && (
          <Tile
            label={`To ${plan.weightCheckpointLb} lb checkpoint`}
            value={fmt(toWeightCheckpoint, 1)}
            unit="lb"
            foot={
              weeksToWeightCheckpoint
                ? `~${weeksToWeightCheckpoint.toFixed(1)} weeks at the current trend — review, not phase end`
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
              {holdingWeight
                ? <> — and the plan wants that at <strong>zero</strong>. Weight holding steady is
                    the target here, not a number to drive down.</>
                : plan.targetRateLbPerWk
                  ? <> (plan targets {plan.targetRateLbPerWk[0]}–{plan.targetRateLbPerWk[1]} lb/week).</>
                  : '.'}
            </p>
            <p>
              {weeksToWeightCheckpoint
                ? <>At that rate the {plan.weightCheckpointLb} lb review checkpoint arrives in about{' '}
                    <strong>{weeksToWeightCheckpoint.toFixed(1)} weeks</strong>.
                    {plan.phaseEndDate && <> The {plan.phaseEndDate} checkpoint is the other one.
                    Neither ends the phase on its own — both mean stop and decide.</>}</>
                : <>The trend is not moving toward the checkpoint, so no date is projected.</>}
            </p>
            {plan.waistTriggerIn != null && (
              <p className="footnote">
                Waist is the primary metric and the only thing that ends Phase 1 — and it is not yet
                projectable. It needs repeated morning-protocol readings, not scale weight. The weight
                lines below are checkpoints to stop and re-decide at, not end conditions.
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
          plan.weightCheckpointLb ? ` The ${plan.weightCheckpointLb} lb line is a review checkpoint, not a goal and not a phase end.` : ''
        }${
          plan.weightFloorLb ? ` The ${plan.weightFloorLb} lb line is the floor: the deficit stops there regardless of waist.` : ''
        }`}
      >
        {weightPoints.length ? (
          <>
            <LineChart
              series={[{ name: 'Weight', color: 'var(--series-1)', points: weightPoints }]}
              refLines={[
                { value: plan.baselineWeightLb, label: `baseline ${plan.baselineWeightLb}` },
                ...(plan.weightCheckpointLb != null
                  ? [{ value: plan.weightCheckpointLb, label: `checkpoint ${plan.weightCheckpointLb}` }]
                  : []),
                ...(plan.weightFloorLb != null
                  ? [{ value: plan.weightFloorLb, label: `floor ${plan.weightFloorLb}`, tone: 'critical' as const }]
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

      {/* Title and caption come from `athlete/constants.json`'s `copy`, not from here: a
          measurement protocol and the reason a historical reading is excluded are facts about one
          athlete's body and one athlete's chart (INVARIANTS.md X-11, audit F-31). A chart that
          wrote neither gets the plain heading and no caption, which is a correct chart. */}
      {showWaist && (
      <Card
        title={plan.copy?.waistCardTitle ?? 'Waist'}
        caption={plan.copy?.waistCardCaption}
      >
        {waistPoints.length ? (
          <>
            <LineChart
              series={[
                { name: 'Waist', color: 'var(--series-1)', points: cleanWaist },
                // Real readings, kept visible and kept OUT of the line. See `confoundedDates`.
                ...(confoundedWaist.length
                  ? [{
                    name: 'Confounded',
                    color: 'var(--series-2)',
                    points: confoundedWaist,
                    pointsOnly: true,
                    hollow: true,
                  }]
                  : []),
              ]}
              refLines={[
                ...(plan.waistWorkingBaselineIn != null
                  ? [{ value: plan.waistWorkingBaselineIn, label: `baseline ${plan.waistWorkingBaselineIn}″` }]
                  : []),
                ...(plan.waistTriggerIn != null
                  ? [{ value: plan.waistTriggerIn, label: `Phase 1 goal ${plan.waistTriggerIn}″`, tone: 'good' as const }]
                  : []),
              ]}
              decimals={2}
              unit="″"
            />
            {confoundedWaist.length > 0 && (
              <Legend
                items={[
                  { label: 'Clean readings — the trend', color: 'var(--series-1)' },
                  { label: 'Confounded — shown, not counted', color: 'var(--series-2)' },
                ]}
              />
            )}
            <p className="footnote">
              {waistPoints.length === 1
                ? 'One reading is a point, not a trend.'
                : `${waistPoints.length} readings on record.`}
              {confoundedWaist.length > 0 && (
                <>
                  {' '}<strong>{confoundedWaist.length} of them {confoundedWaist.length === 1 ? 'is' : 'are'} confounded</strong>
                  {' '}and sit outside the line — the chart says the measurement was unreliable that
                  morning, not that nothing changed. The reading is kept because it was taken;
                  dropping it would be editing the record.
                </>
              )}
            </p>
            {confoundedWaist.length > 0 && (
              <div className="scroll-x">
                <table>
                  <thead>
                    <tr><th>Date</th><th className="num">Reading</th><th>Why it is set aside</th></tr>
                  </thead>
                  <tbody>
                    {confoundedWaist.map((p) => (
                      <tr key={p.date}>
                        <td>{prettyDate(p.date)}</td>
                        <td className="num">{fmt(p.value, 2)}″</td>
                        <td>{waistConfounds.get(p.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : <Empty>No waist readings yet.</Empty>}
      </Card>
      )}

      <MetricsCard />

      <Card
        title="Weekly averages"
        caption="Weeks that have finished. This week is shown day by day below. A week that started mid-block holds fewer days than seven, so every row states how many days its totals cover."
      >
        {priorWeeks.length ? (
          <div className="scroll-x">
            <table>
              <thead>
                {/* "Days" was missing entirely here while History's equivalent table carried it,
                    so the Aug 3 row rendered four days of data under a caption reading "Completed
                    weeks" with nothing marking it (audit F-63). It is the denominator Intake,
                    Burn and Deficit are all summed over. */}
                <tr>
                  {/* See the same gate on Today and History: no feed, no step column. */}
                  <th className="text">Week of</th><th>Days</th><th>Avg weight</th><th>Waist</th>{hasFeed ? <th>Avg steps</th> : null}
                  <th>Sessions</th><th>Intake</th><th>Burn</th><th>Deficit</th>
                </tr>
              </thead>
              <tbody>
                {[...priorWeeks].reverse().map((w) => (
                  <tr key={w.start}>
                    <td className="text">{w.label}</td>
                    <td>{w.balanceDays} / {w.days.length}</td>
                    <td>{fmt(w.avgWeightLb, 1)}</td>
                    <td>{fmt(w.lastWaistIn, 2)}</td>
                    {hasFeed ? <td>{fmt(w.avgSteps)}</td> : null}
                    <td>{w.sessions}{plan.sessionsPerWeekFloor ? ` / ${plan.sessionsPerWeekFloor}` : ''}</td>
                    <td>{fmt(w.intakeKcal)}</td>
                    <td>{fmt(w.burnKcal)}{w.partialDays > 0 ? <span className="tbd">~</span> : null}</td>
                    <td>{fmt(w.deficitKcal)}{w.partialDays > 0 ? <span className="tbd">~</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No completed weeks yet — the block opened {plan.baselineDate}.</Empty>}
        {priorWeeks.some((w) => w.partialDays > 0) && (
          <p className="footnote">
            <span className="tbd">~</span> Burn is a floor: a finished day in that week never
            received one of its components, so the real burn is higher and the deficit shown is
            lower than the truth.
          </p>
        )}
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
                  {/* Accrued, not energy.csv's whole-day projection — today's row would
                      otherwise claim a full 24 h of RMR before lunch. See rollup.rollDay.
                      Two markers, two different things: * = the day is not finished; ~ = the day
                      IS finished and a component never arrived, so the figure is a floor and the
                      deficit is understated (audit F-16). A day in progress never gets ~ — its
                      step total is not due until tomorrow, and a marker that is on every day is
                      one nobody reads. */}
                  <td>
                    {fmt(d.burnToDateKcal)}
                    {d.inProgress ? <span className="tbd">*</span> : null}
                    {d.burnUnderstated && d.burnToDateKcal != null ? <span className="tbd">~</span> : null}
                  </td>
                  <td>
                    {fmt(d.deficitToDateKcal)}
                    {d.inProgress ? <span className="tbd">*</span> : null}
                    {d.burnUnderstated && d.deficitToDateKcal != null ? <span className="tbd">~</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="footnote">
          Sessions this week: <strong>{thisWeek.sessions}</strong> against a floor of {plan.sessionsPerWeekFloor}.
          {/* Floor AND aim, never one merged "protein days hit" (audit F-29). This line used to
              report only the floor while goals.md graded him on the aim, so a 155 g day was a hit
              here and a miss there and neither surface named its line. Both figures render from
              athlete/constants.json; nothing here decides which one counts. */}
          {' '}Protein: floor ({plan.proteinFloorG} g) cleared on {thisWeek.proteinFloorDays} of{' '}
          {thisWeek.proteinDaysLogged} logged days
          {plan.proteinAimG != null && <>, aim ({plan.proteinAimG} g) on {thisWeek.proteinAimDays}</>}.
          {' '}Burn and deficit marked <span className="tbd">*</span> are accrued so far today, not
          the whole day — resting and non-step burn are prorated to the part of the day that has
          actually happened. Targets stay whole-day, so the gap is what remains, not a shortfall.
          {thisWeek.days.some((d) => d.burnUnderstated) && (
            <> Marked <span className="tbd">~</span>:{' '}
              {thisWeek.days.filter((d) => d.burnUnderstated)
                .map((d) => `${d.date} has no ${missingBurnLabels(d).join(' and no ')}`)
                .join('; ')}
              , so that day&rsquo;s burn is a floor and its deficit is understated.</>
          )}
        </p>
      </Card>

      <p className="footnote">
        Every number here is read from <code>data/</code>. Blanks are TBD, never zero. Burn is
        estimated — the model and its constants are in <code>data/METHOD.md</code>.
      </p>
    </Shell>
  )
}
