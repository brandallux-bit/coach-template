import { Card } from './ui'
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

const latestFor = (rows: Row[], key: string) =>
  rows
    .filter((r) => r.metric === key && r.value !== '')
    .reduce<Row | null>((best, r) => (!best || r.date > best.date ? r : best), null)

export default function MetricsCard() {
  const registered = Object.entries(metricsRegistry ?? {})
  if (!registered.length) return null

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
    </Card>
  )
}
