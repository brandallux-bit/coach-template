import { Card } from './ui'
import { LineChart } from './charts'
import { metrics, metricsRegistry, type Row } from '@/lib/data'

/**
 * Everything the chart is registered to track that the fixed columns of `body.csv` do not cover.
 *
 * WHY IT EXISTS. `constants.json`'s own comment describes the registry as the mechanism by which
 * "a new athlete never needs a code change to track a new thing" — and until this component,
 * `metrics.csv` was parsed, bundled, typed and validated, and imported by no page at all. A
 * mechanism whose output nothing renders is a black hole, not a mechanism (F-61), and this one
 * specifically is what the Health domain's blood-pressure trigger depends on: BP and resting HR
 * were registered on 2026-08-13 precisely so a reading could be recorded, and a reading that goes
 * in and never comes out is the same as one never taken.
 *
 * A REGISTERED METRIC WITH NO READING IS RENDERED, NOT HIDDEN. That is the whole point. "Nothing
 * logged yet" is the honest state of a metric a domain asked for and nobody has measured — hiding
 * the row until the first reading arrives would make the gap invisible, which is how the Health
 * domain went nine days unmeasurable by construction without anyone noticing.
 *
 * Nothing here is per-athlete: the labels, units and domains all come out of the registry in
 * `athlete/constants.json` (INVARIANTS.md X-11). A chart with an empty registry renders no card.
 */

/**
 * A metric's numeric readings over time, oldest first. Non-numeric values are skipped, not zeroed.
 *
 * **One point per date, and the LAST row for a date wins.** metrics.csv is append-only, so a
 * second reading on a day is a correction or an update to the first — which is exactly how the
 * chart this was written against uses it ("Updates the same-day entry above"). Two points sharing
 * a date also collide on the x-axis, which places both at one tick and duplicates the React key.
 */
const seriesFor = (rows: Row[], key: string) => {
  const byDate = new Map<string, number>()
  for (const r of rows) {
    if (r.metric !== key || String(r.value ?? '').trim() === '') continue
    const v = Number(r.value)
    if (Number.isFinite(v)) byDate.set(String(r.date), v)
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

const latestFor = (rows: Row[], key: string) =>
  rows
    .filter((r) => r.metric === key && r.value !== '')
    .reduce<Row | null>((best, r) => (!best || r.date > best.date ? r : best), null)

export default function MetricsCard() {
  const registered = Object.entries(metricsRegistry ?? {})
  if (!registered.length) return null

  // Two numeric readings is the minimum that can show a direction. One is a point, and a chart
  // drawn through a single point invites reading a trend into it.
  const trended = registered
    .map(([key, def]) => [key, def, seriesFor(metrics, key)] as const)
    .filter(([, , points]) => points.length >= 2)

  const anyLogged = registered.some(([key]) => latestFor(metrics, key))

  return (
    <Card
      title="Registered measures"
      caption={
        anyLogged
          ? 'Tracked in data/metrics.csv. Each one names the goals.md domain that asked for it — a metric no domain needs is a chore nobody should be doing.'
          : 'Registered in athlete/constants.json and logged into data/metrics.csv. Nothing has been recorded against any of them yet, which is why they read TBD rather than being hidden.'
      }
    >
      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th className="text">Measure</th>
              <th>Latest</th>
              <th className="text">As of</th>
              <th className="text">Serves</th>
            </tr>
          </thead>
          <tbody>
            {registered.map(([key, def]) => {
              const row = latestFor(metrics, key)
              return (
                <tr key={key}>
                  <td className="text">{def.label}</td>
                  <td>
                    {row
                      ? <>{row.value}<span className="unit"> {row.unit || def.unit}</span></>
                      : <span className="tbd">TBD</span>}
                  </td>
                  <td className="text">
                    {row ? row.date : <span className="tbd">nothing logged yet</span>}
                  </td>
                  <td className="text">{def.domain}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/*
        A trend per measure that has one. The table above answers "what is it now"; a domain whose
        primary metric lives in metrics.csv — a symptom score, a lab value — needs "which way is it
        going", and until this it had nowhere to show that at all. Registered-but-unlogged measures
        deliberately produce no chart and stay visible as TBD in the table.
      */}
      {trended.map(([key, def, points]) => (
        <div key={key} className="metric-trend">
          <h3 className="metric-trend-title">
            {def.label}
            <span className="unit"> — {def.unit}</span>
            {def.direction && (
              <span className="footnote"> · {def.direction} is better</span>
            )}
          </h3>
          <LineChart
            series={[{ name: def.label, color: 'var(--series-3)', points }]}
            decimals={Number.isInteger(points[0].value) && points.every((p) => Number.isInteger(p.value)) ? 0 : 1}
            height={170}
          />
          {def.confounds && (
            <p className="footnote">
              A reading of {def.confounds.atOrAbove} or worse flags the{' '}
              {def.confounds.lagDays ? 'next morning’s' : 'same day’s'}{' '}
              <strong>{def.confounds.measure.replace(/_/g, ' ')}</strong> as confounded — see the
              chart above.
            </p>
          )}
        </div>
      ))}
    </Card>
  )
}
