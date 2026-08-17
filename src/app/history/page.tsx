import { Card, Empty, Legend, Masthead, Nav, Shell } from '@/components/ui'
import { DeficitBars, GroupedBars, LineChart } from '@/components/charts'
import {
  addDays, allOf, body, eachDate, fmt, fractionOfDayElapsed, meals, plan, prettyDate, series, sets,
  today, weekdayOf, type Row,
} from '@/lib/data'
import { allWeeks, missingBurnLabels, rollDay, type DayRoll } from '@/lib/rollup'

const DAILY_WINDOW = 14

/** Actual, and — where a plan value exists — the target it's read against. */
function Pair({ actual, target, digits = 0 }: { actual: number | null; target: number | null; digits?: number }) {
  if (target == null) return <>{fmt(actual, digits)}</>
  return <>{fmt(actual, digits)}<span className="plan"> / {fmt(target, digits)}</span></>
}

function exerciseLabel(d: DayRoll): string {
  if (!d.sessions.length) return '—'
  return d.sessions
    .map((s) => (s.status && s.status !== 'completed' ? `${s.type} (${s.status})` : s.type))
    .join(' + ')
}

/**
 * One session's estimated cost, with the reason when there isn't one.
 *
 * The three absences are not interchangeable and printing `—` for all of them is how a table stops
 * meaning anything: a walk is **complete** without a session figure (its energy is in steps), a
 * planned row has not happened, and a blank duration is a real cost nobody can compute. `kcalLevel`
 * carries which; `kcalBasis` carries the MET and minutes, on hover.
 */
function SessionKcal({ row }: { row: Row }) {
  if (row.estKcalBurned) return <>{Number(row.estKcalBurned).toLocaleString()}</>
  const why: Record<string, string> = {
    'counted-elsewhere': 'in steps',
    'not-performed': '—',
    unknown: 'TBD',
  }
  return <span className="tbd">{why[row.kcalLevel] ?? '—'}</span>
}

function shortDate(iso: string): string {
  const [, m, day] = iso.split('-')
  return `${weekdayOf(iso)} ${Number(m)}/${Number(day)}`
}

export const dynamic = 'force-dynamic'

export default function HistoryPage() {
  const now = today()
  const weeks = allWeeks(now)

  const label = (w: (typeof weeks)[number], i: number) =>
    i === weeks.length - 1 ? `${w.label}*` : w.label

  const intakeGroups = weeks.map((w, i) => ({
    key: w.start,
    label: label(w, i),
    values: [w.intakeKcal, w.targetKcal],
  }))

  // ⚠ NO PLAN SERIES HERE ANY MORE, and its absence is the fix (audit F-57).
  //
  // This chart used to plot `plan.estMaintenanceKcal × balanceDays` beside the decomposed burn.
  // `data/METHOD.md` says in bold that the `RMR × 1.5` shortcut and this decomposition **must
  // never be mixed**, because the 1.5 already contains all activity — and those were the two
  // sides of this chart, on one axis, with one of them labelled "plan". The decomposition averages
  // ~2,824 kcal/day against a 2,450 flat line: a structural **+2,618 kcal/week gap that exists
  // whatever he does**, which reads as "burning well over plan" every single week.
  //
  // Deriving the constant from current weight — the audit's own recommendation — fixes 85 kcal/day
  // of staleness and leaves the 2,618 untouched, because it is still a 1.5 line against a
  // decomposed series. There is no honest plan-side figure for decomposed burn until one is
  // MEASURED, and `nutrition/plan.md` already schedules that for 2026-08-27. Until then the chart
  // shows what was estimated and says nothing it cannot support.
  const burnGroups = weeks.map((w, i) => ({
    key: w.start,
    label: label(w, i),
    values: [w.burnKcal],
  }))

  // ⚠ THE REFERENCE IS PER GROUP, not one flat line across the chart (audit F-62). The plan
  // figure is a WEEKLY deficit; plotting it whole against a 4-day week made the week of Aug 3
  // read as a catastrophic miss (169 against 4,200) when it was four days of data.
  //
  // ⚠ AND IT IS NOW BUILT FROM THE SAME MODEL AS THE BAR (audit F-57). It used to be
  // `estMaintenanceKcal × 7 − weeklyKcalBudget` — the plan's internal arithmetic, entirely inside
  // the `RMR × 1.5` shortcut — plotted against a deficit computed from decomposed burn, so the
  // deficit chart inherited the whole 2,618 kcal/week mixing error from the chart above it. The
  // reference is now **this week's own estimated burn minus the calories the plan asked for**,
  // over the same `balanceDays` both figures already share: the deficit he would have run if he
  // had eaten exactly to target. Same burn model on both sides, so the only difference between
  // bar and reference is intake — which is the thing the comparison is actually about.
  const deficitGroups = weeks.map((w, i) => ({
    key: w.start,
    label: label(w, i),
    value: w.deficitKcal,
    ref: w.burnKcal != null && w.targetKcal != null ? w.burnKcal - w.targetKcal : null,
  }))

  const weightPoints = series(body, 'weight_lb')
  const waistPoints = series(body, 'waist_in')
  const neckPoints = series(body, 'neck_in')
  const partial = weeks.length > 0

  // Most recent first — matches the reversed weekly table below.
  const dailyDays = eachDate(addDays(now, -(DAILY_WINDOW - 1)), now)
    .map(rollDay)
    .reverse()

  // Today's burn is accrued-to-date, so its plan line is scaled to the same slice of day.
  const elapsedToday = fractionOfDayElapsed()

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
        title="Calories out — estimated"
        caption={<>Estimated expenditure: RMR (recomputed daily from that day&rsquo;s weight) + food thermic effect + non-step movement + steps + session METs, summed over the days each week counted. The model is in <code>data/METHOD.md</code>. <strong>There is no plan line on this chart, on purpose:</strong> the plan&rsquo;s ~{plan.estMaintenanceKcal.toLocaleString()} kcal/day maintenance figure is <code>RMR &times; 1.5</code>, and the 1.5 already contains all activity — so plotting it against this itemised model compares two incompatible things and shows a gap of ~2,600 kcal/week that exists whatever you do. A measured maintenance figure replaces it at the 2026-08-27 recalibration.</>}
      >
        <Legend items={[{ label: 'Estimated burn', color: 'var(--series-1)' }]} />
        {weeks.length ? (
          <GroupedBars
            groups={burnGroups}
            series={[{ name: 'Estimated burn', color: 'var(--series-1)' }]}
            unit=" kcal"
          />
        ) : <Empty>No weeks recorded.</Empty>}
      </Card>

      <Card
        title="Energy balance"
        caption={<>Burn minus intake, by week. Above the line is a deficit; below it, in red, is a surplus. The dashed segment over each bar is <strong>the deficit that week would have run if you had eaten exactly to target</strong> — the same estimated burn as the bar, minus the calories the plan asked for, over the same days. Both sides come from one model, so the only difference between them is what was eaten.</>}
      >
        {weeks.length ? (
          <DeficitBars groups={deficitGroups} refLabel="if you had eaten to target" />
        ) : <Empty>No weeks recorded.</Empty>}
      </Card>

      <Card title="Weight" caption="Every morning-protocol reading, not weekly averages — the averages are on the Goals page.">
        {weightPoints.length ? (
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
                ? [{ value: plan.waistTriggerIn, label: `Phase 1 goal ${plan.waistTriggerIn}″`, tone: 'good' as const }]
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
                {/* "Days counted", not "Days logged": it is the denominator Eaten, Plan, Burn and
                    Deficit are ALL summed over, which is the whole point of audit F-51. It used to
                    read `burnDays`, a fifth day set that agreed with none of them — the row said
                    "4/4 days logged" beside 9,741 − 4,160 = 3,007. */}
                <th className="text">Week of</th><th>Days counted</th><th>Avg weight</th><th>Waist</th><th>Avg steps</th>
                <th>Sessions</th><th>Eaten</th><th>Plan</th><th>Burn (est.)</th><th>Deficit</th>
                {/* Alcohol has its OWN day count, shown with it, because a blank cell means "not
                    recorded" — a 600 kcal week over two logged days is a mostly-unlogged week,
                    not a light one, and the total alone reads as the second. No target column:
                    plan.md's ~1,200-1,400 kcal/week is an observation of what he drinks, not a
                    budget he set, and a target column would silently turn one into the other
                    (audit F-38). Until W6 this figure was written on every meal row and rendered
                    nowhere. */}
                <th>Alcohol</th>
              </tr>
            </thead>
            <tbody>
              {[...weeks].reverse().map((w, i) => (
                <tr key={w.start} className={i === 0 ? 'now' : undefined}>
                  <td className="text">{w.label}{i === 0 ? '*' : ''}</td>
                  <td>
                    {w.balanceDays} / {w.days.length}
                    {w.unbalancedDays > 0 ? <span className="tbd">†</span> : null}
                  </td>
                  <td>{fmt(w.avgWeightLb, 1)}</td>
                  <td>{fmt(w.lastWaistIn, 2)}</td>
                  <td>{fmt(w.avgSteps)}</td>
                  <td>{w.sessions}</td>
                  <td>{fmt(w.intakeKcal)}</td>
                  <td>{fmt(w.targetKcal)}</td>
                  {/* ~ = the burn under it is a FLOOR: a finished day in this week never got one
                      of its components (normally the step total), so the true burn is higher and
                      the deficit shown is lower than the truth (audit F-16). Silent on a clean
                      week, and silent for a day still in progress — today's step total does not
                      arrive until tomorrow by design. */}
                  <td>{fmt(w.burnKcal)}{w.partialDays > 0 ? <span className="tbd">~</span> : null}</td>
                  <td>{fmt(w.deficitKcal)}{w.partialDays > 0 ? <span className="tbd">~</span> : null}</td>
                  <td>
                    {fmt(w.alcoholKcal)}
                    {w.alcoholDaysLogged > 0 && w.alcoholDaysLogged < w.days.length
                      ? <span className="tbd"> / {w.alcoholDaysLogged}d</span>
                      : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {partial && (
          <p className="footnote">
            * Week to date — a partial week, so its totals are not comparable to a full one.
            Weeks are Monday-anchored, matching how the Mon–Thu / Fri–Sun budget is written.
            Eaten, Plan, Burn and Deficit are all summed over the <em>same</em> days — the
            &ldquo;days counted&rdquo; figure — so the row always reconciles.
          </p>
        )}
        {weeks.some((w) => w.partialDays > 0) && (
          <p className="footnote">
            <span className="tbd">~</span> Burn is a floor for this week: {' '}
            {weeks.filter((w) => w.partialDays > 0)
              .flatMap((w) => w.days.filter((d) => d.burnUnderstated))
              .map((d) => `${d.date} (no ${missingBurnLabels(d).join(', no ')})`)
              .join('; ')}
            . Anything not reported counts as zero, so the true burn is higher and the deficit
            shown is <em>lower</em> than the truth.
          </p>
        )}
        {weeks.some((w) => w.unbalancedDays > 0) && (
          <p className="footnote">
            <span className="tbd">†</span> A day in that week holds data on one side only — food
            with no burn figure, or a burn figure with no food logged — so it is in the daily table
            below but in none of the weekly totals. Counting it on one side is what made the row
            stop adding up.
          </p>
        )}
      </Card>

      <Card
        title={`Daily — last ${DAILY_WINDOW} days`}
        caption="Actual / plan for each day. Open a row for every meal and session as recorded."
      >
        <div className="scroll-x">
          <div className="day-table">
            <div className="day-head">
              <span>Date</span><span>Calories</span><span>Protein</span><span>Fat</span>
              <span>Fibre</span><span>Burned</span><span>Steps</span><span>Exercise</span>
            </div>
            {dailyDays.map((d) => {
              const dayMeals = allOf(meals, d.date)
              const daySets = allOf(sets, d.date)
              // Today's row is a day in progress: show burn ACCRUED, not energy.csv's whole-day
              // projection.
              //
              // ⚠ THE PLAN SIDE OF THIS PAIR IS GONE, and it is the same fix as the burn chart
              // above (audit F-57). It rendered `plan.estMaintenanceKcal` — the `RMR × 1.5`
              // shortcut — beside a decomposed burn figure, which is the mixing `data/METHOD.md`
              // forbids, in a two-number pair where it reads as "you burned 537 over maintenance".
              // The Calories column keeps its plan side, because intake and its target are the
              // same quantity measured two ways; burn and a 1.5 estimate are not.
              //
              // The athlete's 2026-08-13 instruction about this pair — *"I want the target to be
              // the whole day, not prorated… it just tells me what remains"* — was about
              // PRORATION, and it still holds wherever a target exists. Nothing here is prorated.
              const burnActual = d.burnToDateKcal
              return (
                <details className="day-row" key={d.date}>
                  <summary>
                    <span className="cell-date">{shortDate(d.date)}</span>
                    <span><Pair actual={d.intakeKcal} target={d.targetKcal} /></span>
                    <span><Pair actual={d.proteinG} target={d.targetProteinG} /></span>
                    <span><Pair actual={d.fatG} target={d.targetFatG} /></span>
                    <span><Pair actual={d.fibreG} target={d.targetFibreG} /></span>
                    <span>
                      <Pair actual={burnActual} target={null} />
                      {d.inProgress && burnActual != null
                        ? <span className="tbd"> so far</span> : null}
                      {/* The day is over and a component never arrived, so this figure is a
                          floor. Marked where it is read, not in a footnote two columns away —
                          "Avg steps: TBD" was the only hint before and nobody connects it to the
                          burn number (audit F-16). */}
                      {d.burnUnderstated && burnActual != null
                        ? <span className="tbd" title={`no ${missingBurnLabels(d).join(', no ')} — this is a floor`}>~</span>
                        : null}
                    </span>
                    <span><Pair actual={d.steps} target={plan.stepsPerDayTarget ?? null} /></span>
                    <span className="cell-ex">{exerciseLabel(d)}</span>
                  </summary>

                  <div className="day-detail">
                    <h4>Meals</h4>
                    {dayMeals.length ? (
                      <div className="scroll-x">
                        <table>
                          <thead>
                            <tr>
                              <th className="text">Time</th><th className="text">Item</th><th>kcal</th>
                              <th>Protein</th><th>Fat</th><th>Carb</th><th>Fibre</th>
                              <th className="text">Confidence</th><th className="text">Note</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dayMeals.map((m, i) => (
                              <tr key={i}>
                                <td className="text">{m.time || '—'}</td>
                                <td className="text">{m.item}</td>
                                <td>{m.kcal || '—'}</td>
                                <td>{m.protein_g || <span className="tbd">—</span>}</td>
                                <td>{m.fat_g || <span className="tbd">—</span>}</td>
                                <td>{m.carb_g || <span className="tbd">—</span>}</td>
                                <td>{m.fibre_g || <span className="tbd">—</span>}</td>
                                <td className="text">{m.confidence}</td>
                                <td className="text">{m.note}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <Empty>Nothing logged.</Empty>}

                    <h4>Exercise</h4>
                    {d.sessions.length ? (
                      <div className="scroll-x">
                        <table>
                          <thead>
                            <tr>
                              <th className="text">Type</th><th className="text">Session</th>
                              <th className="text">Status</th><th>RPE</th><th>Duration</th>
                              {/* The per-session cost, from the ONE precedence in
                                  scripts/lib/aggregate.mjs — kcal_override, then the intensity
                                  split, then the flat MET. It read `s.est_kcal_burned` until
                                  2026-08-14: not a column in training.csv, so undefined on every
                                  row and a dash forever (F-41); then `kcal_override`, real but
                                  blank on almost every session. Before both, it rendered a
                                  flat-MET figure that disagreed with the ledger printed on the
                                  same page — 1,328 against 774 (F-02). Hover any figure for the
                                  MET and minutes it was built from. */}
                              <th>kcal (est.)</th><th className="text">Pain</th><th className="text">Note</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.sessions.map((s, i) => (
                              <tr key={i}>
                                <td className="text">{s.type}</td>
                                <td className="text">{s.session}</td>
                                <td className="text">{s.status}</td>
                                <td>{s.rpe || <span className="tbd">—</span>}</td>
                                <td>{s.duration_min ? `${s.duration_min} min` : <span className="tbd">—</span>}</td>
                                <td title={s.kcalBasis}><SessionKcal row={s} /></td>
                                <td className="text">{s.pain_flag === 'y' ? 'yes' : s.pain_flag === 'n' ? 'no' : '—'}</td>
                                <td className="text">{s.note}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <Empty>No session recorded.</Empty>}

                    {daySets.length > 0 && (
                      <details className="table-view">
                        <summary>All sets logged ({daySets.length})</summary>
                        <div className="scroll-x">
                          <table>
                            <thead>
                              <tr>
                                <th className="text">Exercise</th><th>Set</th><th>Load</th>
                                <th>Reps / time</th><th>RIR</th><th className="text">Note</th>
                              </tr>
                            </thead>
                            <tbody>
                              {daySets.map((s, i) => (
                                <tr key={i}>
                                  <td className="text">{s.exercise}</td>
                                  <td>{s.set_index}</td>
                                  <td>{s.load_lb ? `${s.load_lb} lb` : 'BW'}</td>
                                  <td>{s.reps || (s.duration_s ? `${s.duration_s}s` : '—')}</td>
                                  <td>{s.rir || <span className="tbd">—</span>}</td>
                                  <td className="text">{s.note}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    )}
                  </div>
                </details>
              )
            })}
          </div>
        </div>
        <p className="footnote">
          Burned reads <span className="tbd">TBD</span> rather than zero on a day that produced no
          burn estimate (<code>data/METHOD.md</code>). Today is marked{' '}
          <span className="tbd">so far</span>: it shows burn <em>accrued</em>, with resting and
          non-step NEAT prorated to the {Math.round(elapsedToday * 100)}% of the day that has
          actually happened. Steps, session and food-thermic burn are already accrued by
          construction, and the step feed lags real time, so the true figure is a little higher
          than shown. <strong>Burned no longer carries a plan figure beside it</strong> — the
          ~{plan.estMaintenanceKcal.toLocaleString()} kcal that used to sit there is{' '}
          <code>RMR &times; 1.5</code>, a different model from the itemised one this column shows,
          so the two were never comparable and the gap between them was mostly arithmetic. The
          calorie columns keep their targets, which are like-for-like.{' '}
          <strong>Where a target does exist, it stays the whole day</strong> — the pair reads as
          what remains against today&rsquo;s plan, not as whether you are on pace, so being well
          short in the morning is the expected state rather than a shortfall.
          {dailyDays.some((d) => d.burnUnderstated) && (
            <> A finished day marked <span className="tbd">~</span> never received one of its burn
            components, so its figure is a floor and its deficit is understated.</>
          )}
        </p>
      </Card>
    </Shell>
  )
}
