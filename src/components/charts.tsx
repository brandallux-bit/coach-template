/**
 * Server-rendered SVG charts. No client bundle, no chart library.
 *
 * Conventions held throughout, per the data-viz method:
 *  - one y-axis, never two. Two measures of different scale get two charts.
 *  - categorical hues assigned in fixed slot order (series-1, then series-2), never cycled.
 *  - recessive grid and axes; 2px lines; >=8px markers; 4px rounded bar ends.
 *  - hover via native <title>, plus a table view beside every chart.
 */

const W = 720
const PAD = { top: 16, right: 18, bottom: 28, left: 44 }

type Point = { date: string; value: number }
export type RefLine = { value: number; label: string; tone?: 'muted' | 'good' | 'critical' }

const REF_TONE = {
  muted: 'var(--baseline)',
  good: 'var(--good)',
  critical: 'var(--critical)',
}

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min]
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(6)))
  return out
}

/* ------------------------------------------------------------------ line ---------- */

export function LineChart({
  series, refLines = [], height = 230, yLabel, decimals = 1, unit = '',
}: {
  series: { name: string; color: string; points: Point[] }[]
  refLines?: RefLine[]
  height?: number
  yLabel?: string
  decimals?: number
  unit?: string
}) {
  const all = series.flatMap((s) => s.points)
  if (all.length === 0) return null

  const dates = [...new Set(all.map((p) => p.date))].sort()
  const vals = [...all.map((p) => p.value), ...refLines.map((r) => r.value)]
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  const pad = (hi - lo || Math.max(1, hi * 0.02)) * 0.18
  lo -= pad; hi += pad

  const plotW = W - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const x = (d: string) =>
    PAD.left + (dates.length === 1 ? plotW / 2 : (dates.indexOf(d) / (dates.length - 1)) * plotW)
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH

  const ticks = niceTicks(lo, hi)
  // On a short axis every date is a tick; on a long one, thin to ~6 labels.
  const step = Math.max(1, Math.ceil(dates.length / 6))
  const xTicks = dates.filter((_, i) => i % step === 0 || i === dates.length - 1)

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img"
      aria-label={`${series.map((s) => s.name).join(' and ')} over time`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--gridline)" strokeWidth={1} />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
            {t.toFixed(decimals)}
          </text>
        </g>
      ))}

      {/* Reference labels sit at the left, where the newest data point's direct label never is. */}
      {refLines.map((r) => (
        <g key={r.label}>
          <line
            x1={PAD.left} x2={W - PAD.right} y1={y(r.value)} y2={y(r.value)}
            stroke={REF_TONE[r.tone ?? 'muted']} strokeWidth={1.5} strokeDasharray="5 4"
          />
          <text
            x={PAD.left + 6} y={y(r.value) - 6} textAnchor="start" fontSize={11}
            fill="var(--text-secondary)" fontWeight={550}
          >
            {r.label}
          </text>
        </g>
      ))}

      {xTicks.map((d) => (
        <text key={d} x={x(d)} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
          {shortDate(d)}
        </text>
      ))}

      {series.map((s) => {
        const pts = [...s.points].sort((a, b) => a.date.localeCompare(b.date))
        if (!pts.length) return null
        const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
        const last = pts[pts.length - 1]
        return (
          <g key={s.name}>
            {pts.length > 1 && (
              <path d={d} fill="none" stroke={s.color} strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round" />
            )}
            {pts.map((p) => (
              <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={4.5}
                fill={s.color} stroke="var(--surface)" strokeWidth={2}>
                <title>{`${s.name} · ${shortDate(p.date)} · ${p.value.toFixed(decimals)}${unit}`}</title>
              </circle>
            ))}
            {/* Direct-label the latest point only — never a number on every point.
                Clamped so a point on the right edge doesn't push its label out of the viewBox. */}
            <text
              x={Math.min(x(last.date), W - PAD.right)}
              y={y(last.value) - 12}
              textAnchor={x(last.date) > W - PAD.right - 40 ? 'end' : 'middle'}
              fontSize={12} fontWeight={620} fill="var(--text-primary)"
            >
              {last.value.toFixed(decimals)}{unit}
            </text>
          </g>
        )
      })}

      <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH}
        stroke="var(--baseline)" strokeWidth={1} />
      {yLabel && (
        <text x={PAD.left} y={11} fontSize={11} fill="var(--text-muted)">{yLabel}</text>
      )}
    </svg>
  )
}

/* ------------------------------------------------------------------ bars ---------- */

export function GroupedBars({
  groups, series, height = 240, unit = '', refLine,
}: {
  groups: { key: string; label: string; values: (number | null)[] }[]
  series: { name: string; color: string }[]
  height?: number
  unit?: string
  refLine?: RefLine
}) {
  const vals = groups.flatMap((g) => g.values).filter((v): v is number => v != null)
  if (!vals.length) return null

  const hi = Math.max(...vals, refLine?.value ?? 0) * 1.12
  const plotW = W - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const bandW = plotW / groups.length
  const GAP = 2                       // 2px surface gap between adjacent bars
  const barW = Math.min(34, (bandW - 26 - GAP * (series.length - 1)) / series.length)

  const y = (v: number) => PAD.top + plotH - (v / hi) * plotH
  const ticks = niceTicks(0, hi, 4)

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img"
      aria-label={`${series.map((s) => s.name).join(' versus ')} by week`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--gridline)" strokeWidth={1} />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
            {t >= 1000 ? `${(t / 1000).toFixed(t % 1000 ? 1 : 0)}k` : t}
          </text>
        </g>
      ))}

      {refLine && (
        <g>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(refLine.value)} y2={y(refLine.value)}
            stroke={REF_TONE[refLine.tone ?? 'muted']} strokeWidth={1.5} strokeDasharray="5 4" />
          <text x={W - PAD.right} y={y(refLine.value) - 6} textAnchor="end" fontSize={11}
            fill="var(--text-secondary)" fontWeight={550}>
            {refLine.label}
          </text>
        </g>
      )}

      {groups.map((g, gi) => {
        const groupW = series.length * barW + (series.length - 1) * GAP
        const x0 = PAD.left + gi * bandW + (bandW - groupW) / 2
        return (
          <g key={g.key}>
            {g.values.map((v, si) => {
              const bx = x0 + si * (barW + GAP)
              if (v == null) {
                return (
                  <text key={si} x={bx + barW / 2} y={PAD.top + plotH - 6} textAnchor="middle"
                    fontSize={10.5} fill="var(--text-muted)">TBD</text>
                )
              }
              const by = y(v)
              return (
                <rect key={si} x={bx} y={by} width={barW} height={Math.max(1, PAD.top + plotH - by)}
                  rx={4} fill={series[si].color}>
                  <title>{`${series[si].name} · ${g.label} · ${Math.round(v).toLocaleString()}${unit}`}</title>
                </rect>
              )
            })}
            <text x={PAD.left + gi * bandW + bandW / 2} y={height - 8} textAnchor="middle"
              fontSize={11} fill="var(--text-muted)">{g.label}</text>
          </g>
        )
      })}

      <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH}
        stroke="var(--baseline)" strokeWidth={1} />
    </svg>
  )
}

/* -------------------------------------------------------------- deficit bars ------ */

/**
 * Signed bars around a zero baseline: above = deficit, below = surplus.
 *
 * ⚠ THE REFERENCE IS PER GROUP, and that is a correctness property rather than a style choice.
 * This used to take one `refLine` and draw it flat across the chart at the whole-week planned
 * deficit — so a week holding four days of data was plotted against seven days of plan and read
 * as a catastrophic miss (169 against 4,200). The chart directly above it on the same page
 * already scaled its plan side by the days counted; two conventions for one problem, on one
 * page, is audit F-62. Each group now carries the reference for the days IT covers, and the
 * label is drawn once, over the last group that has one.
 */
export function DeficitBars({
  groups, height = 200, refLabel,
}: {
  groups: { key: string; label: string; value: number | null; ref?: number | null }[]
  height?: number
  refLabel?: string
}) {
  const vals = groups.map((g) => g.value).filter((v): v is number => v != null)
  if (!vals.length) return null

  const refs = groups.map((g) => g.ref).filter((v): v is number => v != null)
  const hi = Math.max(...vals, ...refs, 0)
  const lo = Math.min(...vals, ...refs, 0)
  const span = (hi - lo) || 1
  const plotW = W - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const bandW = plotW / groups.length
  const barW = Math.min(44, bandW - 24)
  const y = (v: number) => PAD.top + plotH - ((v - lo) / span) * plotH
  const zero = y(0)

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Energy balance by week">
      {niceTicks(lo, hi, 4).map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--gridline)" strokeWidth={1} />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
            {Math.abs(t) >= 1000 ? `${(t / 1000).toFixed(1)}k` : Math.round(t)}
          </text>
        </g>
      ))}

      {/* One dashed segment per band, at that group's own reference. Drawn under the bars so a
          bar reaching its plan is still legible. */}
      {groups.map((g, gi) => {
        if (g.ref == null) return null
        const x0 = PAD.left + gi * bandW + 8
        const x1 = PAD.left + (gi + 1) * bandW - 8
        const lastWithRef = groups.map((x) => x.ref != null).lastIndexOf(true)
        return (
          <g key={`ref-${g.key}`}>
            <line x1={x0} x2={x1} y1={y(g.ref)} y2={y(g.ref)}
              stroke="var(--baseline)" strokeWidth={1.5} strokeDasharray="5 4">
              <title>{`${g.label} · plan ${Math.round(g.ref).toLocaleString()} kcal`}</title>
            </line>
            {refLabel && gi === lastWithRef && (
              <text x={x1} y={y(g.ref) - 6} textAnchor="end" fontSize={11}
                fill="var(--text-secondary)" fontWeight={550}>{refLabel}</text>
            )}
          </g>
        )
      })}

      {groups.map((g, gi) => {
        const cx = PAD.left + gi * bandW + bandW / 2
        if (g.value == null) {
          return (
            <g key={g.key}>
              <text x={cx} y={zero - 6} textAnchor="middle" fontSize={10.5} fill="var(--text-muted)">TBD</text>
              <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--text-muted)">{g.label}</text>
            </g>
          )
        }
        const yv = y(g.value)
        const top = Math.min(yv, zero)
        const h = Math.max(1, Math.abs(zero - yv))
        // Surplus is a state worth naming, not just a colour: it carries its own label below.
        const surplus = g.value < 0
        return (
          <g key={g.key}>
            <rect x={cx - barW / 2} y={top} width={barW} height={h} rx={4}
              fill={surplus ? 'var(--critical)' : 'var(--series-1)'}>
              <title>{`${g.label} · ${surplus ? 'surplus' : 'deficit'} ${Math.abs(Math.round(g.value)).toLocaleString()} kcal`}</title>
            </rect>
            <text x={cx} y={surplus ? yv + 14 : yv - 6} textAnchor="middle" fontSize={11}
              fontWeight={600} fill="var(--text-primary)">
              {Math.round(g.value).toLocaleString()}
            </text>
            <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--text-muted)">{g.label}</text>
          </g>
        )
      })}

      <line x1={PAD.left} x2={W - PAD.right} y1={zero} y2={zero} stroke="var(--baseline)" strokeWidth={1.5} />
    </svg>
  )
}
