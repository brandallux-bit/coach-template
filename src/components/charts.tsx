/**
 * Server-rendered SVG charts. No client bundle, no chart library.
 *
 * Conventions held throughout, per the data-viz method:
 *  - one y-axis, never two. Two measures of different scale get two charts.
 *  - categorical hues assigned in fixed slot order (series-1, then series-2), never cycled.
 *  - recessive grid and axes; 2px lines; >=8px markers; 4px rounded bar ends.
 *  - every chart carries a hover readout, plus a table view beside it.
 *
 * ⚠ **THE HOVER READOUT IS CSS, AND THAT IS WHAT KEEPS THESE COMPONENTS ON THE SERVER.**
 * Asked for on 2026-08-24: *"When mousing over any charts, show the number represented by the
 * part of the chart I am mousing over."* Every chart now lays a transparent hit band over each
 * column of the plot and parks a hidden `<g class="tip">` inside it; `.hit:hover .tip` in
 * globals.css reveals it. So pointing anywhere in a column — not just at the 9px mark — names
 * every number that column holds, and the page still renders with no client JavaScript at all.
 *
 * The per-mark `<title>` elements stay where they were. The hit bands sit above them, so they no
 * longer fire the browser's own delayed tooltip; they remain as the fallback if CSS never loads.
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

/* --------------------------------------------------------------- hover readout ---- */

/**
 * Geometry for the readout box.
 *
 * ⚠ **THE WIDTH IS ESTIMATED FROM CHARACTER COUNTS, because nothing on the server can measure
 * text.** The constants below are deliberately generous for the 11.5px UI font — an over-wide box
 * is invisible, an under-wide one clips a number, and clipping a number is the one failure this
 * whole feature exists to prevent. Anything rendered here goes through `TipRow.value` as a
 * finished string, so a caller cannot accidentally widen it with an unformatted float.
 */
const TIP = {
  pad: 9,
  line: 15,
  head: 18,
  char: 6.3,
  headChar: 6.9,
  swatch: 9,
  swatchGap: 7,
  gutter: 18,
}

type TipRow = {
  label: string
  /** Already formatted — units, separators and all. Never a bare number. */
  value: string
  /** The series colour, when this row corresponds to a mark on the chart. */
  color?: string
  /** An absence rather than a figure, so it reads recessive. */
  muted?: boolean
}

/**
 * The readout itself, placed so it never covers the thing being pointed at.
 *
 * The ladder, and why the last rung exists: above the hovered column's marks, then below them,
 * then — when neither fits, which is the ordinary case for a bar chart, where the marks run from
 * the axis up into the headroom — pinned to the top of the viewBox and pushed to the FAR SIDE of
 * the chart from the column. A tall box in a 240px chart has to overlap something; overlapping
 * columns you are not reading is free, and overlapping the one you are is the whole failure.
 */
function Tip({
  head, rows, x, above, below, height,
}: {
  head: string
  rows: TipRow[]
  /** Column centre, in user units. */
  x: number
  /** Top and bottom of the drawn geometry in this column, so the box can dodge it. */
  above: number
  below: number
  height: number
}) {
  if (!rows.length) return null

  const rowW = rows.map((r) =>
    (r.color ? TIP.swatch + TIP.swatchGap : 0)
    + r.label.length * TIP.char + TIP.gutter + r.value.length * TIP.char)
  const w = Math.max(head.length * TIP.headChar, ...rowW) + TIP.pad * 2
  const h = TIP.pad * 2 + TIP.head + rows.length * TIP.line

  let bx = Math.max(2, Math.min(x - w / 2, W - w - 2))
  let by = above - 12 - h
  if (by < 2) {
    by = below + 12
    if (by + h > height - 2) {
      by = 2
      bx = x < W / 2 ? Math.max(2, W - w - 2) : 2
    }
  }

  return (
    <g className="tip">
      <rect className="tip-bg" x={bx} y={by} width={w} height={h} rx={7} />
      <text className="tip-head" x={bx + TIP.pad} y={by + TIP.pad + 11}>{head}</text>
      {rows.map((r, i) => {
        const ty = by + TIP.pad + TIP.head + i * TIP.line + 11
        return (
          <g key={`${r.label}-${i}`}>
            {r.color && (
              <rect x={bx + TIP.pad} y={ty - 8.5} width={TIP.swatch} height={TIP.swatch} rx={2.5}
                fill={r.color} />
            )}
            <text
              className={r.muted ? 'tip-label muted' : 'tip-label'}
              x={bx + TIP.pad + (r.color ? TIP.swatch + TIP.swatchGap : 0)}
              y={ty}
            >
              {r.label}
            </text>
            <text className="tip-value" x={bx + w - TIP.pad} y={ty} textAnchor="end">{r.value}</text>
          </g>
        )
      })}
    </g>
  )
}

/** A transparent column that catches the pointer, tints on hover, and carries its readout. */
function HitBand({
  x, width, top, height, children,
}: {
  x: number
  width: number
  top: number
  height: number
  children: React.ReactNode
}) {
  return (
    <g className="hit">
      <rect className="hit-zone" x={x} y={top} width={Math.max(1, width)} height={height} />
      {children}
    </g>
  )
}

/** `n` rendered the way this chart renders it, for a readout row. */
const asCount = (v: number, unit: string) => `${Math.round(v).toLocaleString()}${unit}`

/* ------------------------------------------------------------------ line ---------- */

export function LineChart({
  series, refLines = [], height = 230, yLabel, decimals = 1, unit = '',
}: {
  /**
   * `pointsOnly` draws the markers and NO connecting line — for readings that are real but do not
   * belong to the trend. A chart may flag a measurement as unreliable under a condition it also
   * tracks (see `confounds` in the metrics registry); those points must still be visible, because
   * hiding a reading the athlete took is editing the record, but joining them into the line states
   * a trend the chart itself says is not there.
   * `hollow` renders the marker unfilled, so the two read apart in one glance and in print.
   */
  series: {
    name: string; color: string; points: Point[]; pointsOnly?: boolean; hollow?: boolean
  }[]
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
            {pts.length > 1 && !s.pointsOnly && (
              <path d={d} fill="none" stroke={s.color} strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round" />
            )}
            {pts.map((p) => (
              <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={4.5}
                fill={s.hollow ? 'var(--surface)' : s.color}
                stroke={s.hollow ? s.color : 'var(--surface)'} strokeWidth={2}>
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

      {/* Hit bands LAST, so they sit above the marks and catch the pointer everywhere in a
          column. A band runs midpoint-to-midpoint between neighbouring dates, so there is no
          dead space between readings — which is the whole complaint this answers. */}
      {dates.map((d, i) => {
        const cx = x(d)
        const from = i === 0 ? PAD.left : (x(dates[i - 1]) + cx) / 2
        const to = i === dates.length - 1 ? W - PAD.right : (cx + x(dates[i + 1])) / 2
        const here = series
          .map((s) => ({ s, p: s.points.find((pt) => pt.date === d) }))
          .filter((v): v is { s: typeof series[number]; p: Point } => v.p != null)
        if (!here.length) return null
        const ys = here.map((v) => y(v.p.value))
        return (
          <HitBand key={`hit-${d}`} x={from} width={to - from} top={PAD.top} height={plotH}>
            <Tip
              head={shortDate(d)}
              rows={here.map((v) => ({
                color: v.s.color,
                label: v.s.name,
                value: `${v.p.value.toFixed(decimals)}${unit}`,
              }))}
              x={cx}
              above={Math.min(...ys)}
              below={Math.max(...ys)}
              height={height}
            />
          </HitBand>
        )
      })}
    </svg>
  )
}

/* ------------------------------------------------------------------ bars ---------- */

/**
 * How the gap between two series is read aloud in the readout. See `delta` on `GroupedBars`.
 * `below`/`above` describe the FIRST series relative to the second, which is the order the caller
 * already passes its values in — so "Eaten, Plan" with `below: 'under plan'` cannot come out
 * backwards.
 */
export type BarDelta = { label: string; below: string; above: string }

/** Top corners rounded, bottom square — the cap sits ON a bar, so its base must be flat. */
function topRoundedPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} `
    + `L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
}

export function GroupedBars({
  groups, series, height = 240, unit = '', refLine, delta,
}: {
  groups: { key: string; label: string; values: (number | null)[] }[]
  series: { name: string; color: string }[]
  height?: number
  unit?: string
  refLine?: RefLine
  /**
   * Cap the SHORTER of two bars with a hatched segment that reaches the taller one's height, so
   * the gap between plan and actual is a thing you can point at rather than a thing you subtract.
   *
   * Asked for on 2026-08-24: *"add a section on top of the lower of the two bars … that
   * represents the difference between the two."* Its height IS the difference — same axis, same
   * scale — and the column's readout names the figure.
   *
   * ⚠ **HATCHED, NEVER A THIRD SERIES COLOUR.** The categorical slots are assigned in fixed order
   * and never cycled; a derived quantity that is not a measurement must not borrow one, or the
   * chart grows a third "thing that was counted" that nobody counted. Only fires when there are
   * exactly two series and both values exist on the group — a gap against a missing figure is not
   * a gap, it is an unknown.
   */
  delta?: BarDelta
}) {
  const vals = groups.flatMap((g) => g.values).filter((v): v is number => v != null)
  if (!vals.length) return null

  const hi = Math.max(...vals, refLine?.value ?? 0) * 1.12
  const plotW = W - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const bandW = plotW / groups.length
  const GAP = 2                       // 2px surface gap between adjacent bars
  const CAP_GAP = 2                   // and the same gap under a difference cap
  const barW = Math.min(34, (bandW - 26 - GAP * (series.length - 1)) / series.length)

  const y = (v: number) => PAD.top + plotH - (v / hi) * plotH
  const ticks = niceTicks(0, hi, 4)
  const showDelta = delta != null && series.length === 2
  const groupX0 = (gi: number) =>
    PAD.left + gi * bandW + (bandW - (series.length * barW + (series.length - 1) * GAP)) / 2

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img"
      aria-label={`${series.map((s) => s.name).join(' versus ')} by week`}>
      {showDelta && (
        <defs>
          <pattern id="coach-delta-hatch" width={6} height={6} patternUnits="userSpaceOnUse">
            <rect className="delta-hatch-bg" width={6} height={6} />
            <path className="delta-hatch-line" d="M0,6 L6,0 M-1,1 L1,-1 M5,7 L7,5" />
          </pattern>
        </defs>
      )}

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
        const x0 = groupX0(gi)
        const [a, b] = g.values
        const capped = showDelta && a != null && b != null
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

            {/* The cap. Drawn on the lower bar only, from the taller bar's top down to just above
                the lower bar's own top — the 2px breath is what keeps it reading as a separate
                segment rather than a taller bar. */}
            {capped && (() => {
              const loIdx = (a as number) <= (b as number) ? 0 : 1
              const top = y(Math.max(a as number, b as number))
              const capH = y(Math.min(a as number, b as number)) - CAP_GAP - top
              if (capH < 3) return null
              return (
                <path
                  className="delta-cap"
                  d={topRoundedPath(x0 + loIdx * (barW + GAP), top, barW, capH, 4)}
                >
                  <title>
                    {`${g.label} · ${Math.abs(Math.round((a as number) - (b as number))).toLocaleString()}`
                      + `${unit} ${(a as number) < (b as number) ? delta!.below : delta!.above}`}
                  </title>
                </path>
              )
            })()}

            <text x={PAD.left + gi * bandW + bandW / 2} y={height - 8} textAnchor="middle"
              fontSize={11} fill="var(--text-muted)">{g.label}</text>
          </g>
        )
      })}

      <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH}
        stroke="var(--baseline)" strokeWidth={1} />

      {/* One hit band per group, spanning the whole band rather than the bars, so the gaps
          between and beside the bars answer too. */}
      {groups.map((g, gi) => {
        const [a, b] = g.values
        const rows: TipRow[] = g.values.map((v, si) => ({
          color: series[si].color,
          label: series[si].name,
          value: v == null ? 'not measured' : asCount(v, unit),
          muted: v == null,
        }))
        if (showDelta && a != null && b != null) {
          const diff = a - b
          rows.push({
            label: delta!.label,
            value: `${asCount(Math.abs(diff), unit)} ${diff < 0 ? delta!.below : delta!.above}`,
          })
        }
        const tops = g.values.filter((v): v is number => v != null).map((v) => y(v))
        const floor = PAD.top + plotH
        return (
          <HitBand key={`hit-${g.key}`} x={PAD.left + gi * bandW} width={bandW}
            top={PAD.top} height={plotH}>
            <Tip
              head={g.label}
              rows={rows}
              x={PAD.left + gi * bandW + bandW / 2}
              above={tops.length ? Math.min(...tops) : floor}
              below={floor}
              height={height}
            />
          </HitBand>
        )
      })}
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

      {/* Hit bands last. A column with no bar still answers — "TBD" is a state worth naming on
          hover as much as a figure is. */}
      {groups.map((g, gi) => {
        const surplus = g.value != null && g.value < 0
        const rows: TipRow[] = [{
          color: g.value == null ? undefined : surplus ? 'var(--critical)' : 'var(--series-1)',
          label: g.value == null ? 'Energy balance' : surplus ? 'Surplus' : 'Deficit',
          value: g.value == null
            ? 'not counted — the week has an unbalanced day'
            : `${Math.abs(Math.round(g.value)).toLocaleString()} kcal`,
          muted: g.value == null,
        }]
        if (g.ref != null) {
          rows.push({
            label: refLabel ?? 'plan',
            value: `${Math.round(g.ref).toLocaleString()} kcal`,
          })
        }
        const marks = [zero, ...(g.value == null ? [] : [y(g.value)]), ...(g.ref == null ? [] : [y(g.ref)])]
        return (
          <HitBand key={`hit-${g.key}`} x={PAD.left + gi * bandW} width={bandW}
            top={PAD.top} height={plotH}>
            <Tip
              head={g.label}
              rows={rows}
              x={PAD.left + gi * bandW + bandW / 2}
              above={Math.min(...marks)}
              below={Math.max(...marks)}
              height={height}
            />
          </HitBand>
        )
      })}
    </svg>
  )
}
