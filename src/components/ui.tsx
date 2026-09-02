import Link from 'next/link'
import StrayBranchBanner from './stray-branches'
import { pctOfTarget } from '@/lib/aggregate'

/**
 * Every authenticated page renders through here, which is why the incomplete-chart alarm lives
 * here rather than on one page. A page that is missing data must say so on that page — finding
 * out somewhere else, later, is what already failed once.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <StrayBranchBanner />
      {children}
    </div>
  )
}

export function Masthead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="masthead">
      <h1>{title}</h1>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        {sub && <span className="sub">{sub}</span>}
        <form method="POST" action="/api/logout">
          <button className="logout" type="submit">Sign out</button>
        </form>
      </div>
    </div>
  )
}

const TABS = [
  { href: '/', label: 'Goals & Progress' },
  { href: '/today', label: 'Today' },
  { href: '/next7', label: 'Next 7 Days' },
  { href: '/log', label: 'Log' },
  { href: '/history', label: 'History' },
]

export function Nav({ current }: { current: string }) {
  return (
    <nav className="nav">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === current ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  )
}

export function Card({
  title, caption, children,
}: { title?: string; caption?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="card">
      {title && <h2>{title}</h2>}
      {caption && <p className="caption">{caption}</p>}
      {children}
    </section>
  )
}

export function Tile({
  label, value, unit, foot, primary, badge,
}: {
  label: string
  value: string
  unit?: string
  foot?: React.ReactNode
  primary?: boolean
  badge?: string
}) {
  const isTbd = value === 'TBD'
  return (
    <div className={`tile${primary ? ' primary' : ''}`}>
      <div className="label">
        {label}
        {badge && <span className={`pill${primary ? ' primary' : ''}`}>{badge}</span>}
      </div>
      <div className="value">
        <span className={isTbd ? 'tbd' : undefined}>{value}</span>
        {unit && !isTbd && <span className="unit">{unit}</span>}
      </div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  )
}

/**
 * A target meter. `floor` places the plan's own line on the track, so "how far along" and
 * "where the plan wanted me" are readable in one glance without a second axis. `pace` is the same
 * device for a figure that moves during the period — where the plan says they should be *by now*.
 *
 * **The figures render twice, in kcal and in %, and CSS shows one.** The athlete asked for a
 * toggle: *"So I can see how many calories I've consumed in each category vs the weekly target or
 * toggle to what % of the target I have consumed."* Rendering both and hiding one keeps the client
 * boundary at a single button (`UnitToggle`) — the meters, and everything they read, stay on the
 * server. Both forms come from the same `pctOfTarget` call, so they cannot disagree.
 */
export function Meter({
  name, actual, target, unit = '', color = 'var(--series-1)', note, floor, pace,
}: {
  name: string
  actual: number | null
  target: number | null
  unit?: string
  color?: string
  note?: React.ReactNode
  floor?: number
  /**
   * Where the plan says they should be at this point in the period, and what that figure is.
   * Rendered as a line on the track plus a hover label. Absent means the plan has no per-period
   * figure — which is the correct state for alcohol, whose budget is weekly on purpose.
   */
  pace?: { at: number; label: string }
}) {
  if (target == null) {
    return (
      <div className="meter">
        <div className="head">
          <span className="name">{name}</span>
          {/* Two different absences, named separately. Collapsing them to one phrase is X-1's own
              mistake in words: "nothing logged" about a day with no target set says the wrong
              thing about the wrong side. */}
          <span className="nums">
            {actual == null
              ? <span className="tbd">no target set · nothing logged</span>
              : <>{Math.round(actual).toLocaleString()}{unit} · <span className="tbd">no target set</span></>}
          </span>
        </div>
        {note && <div className="note">{note}</div>}
      </div>
    )
  }
  if (actual == null) {
    return (
      <div className="meter">
        <div className="head">
          <span className="name">{name}</span>
          <span className="nums">target {target.toLocaleString()}{unit} · <span className="tbd">nothing logged</span></span>
        </div>
        <div className="track" />
        {note && <div className="note">{note}</div>}
      </div>
    )
  }

  // A zero target is legal — the schema permits `fibre_g: 0` and `fat_g: 0` — and dividing by it
  // rendered `18 / 0 g · 18 over · Infinity%` (audit F-68). `Infinity%` is not a wrong number, it
  // is a nonsense one printed with the same confidence as a real one, so the percentage is simply
  // not shown when it does not exist. `pctOfTarget` is the shared guard; the bar geometry below
  // falls back to a full track, because 18 g against a target of 0 is unambiguously over.
  const pct = pctOfTarget(actual, target)
  const left = target - actual
  const over = left < 0

  // ⚠ **THE COMPLEMENT IS DERIVED FROM THE ROUNDED FIGURE, NOT COMPUTED SEPARATELY.** The first
  // version called `pctOfTarget(left, target)` for the "left" side, which is arithmetically correct
  // and rendered `33% of 1,400 · 68% left` on the live chart — 455 of 1,400 is 32.5% and 945 is
  // 67.5%, so both round up and the two shown figures sum to 101. Two roundings of one quantity.
  // Rounding once and subtracting means the pair always sums to 100, and it still goes through the
  // single guarded division above (audit F-68) rather than a second one.
  const pctShown = pct == null ? null : Math.round(pct)
  const leftPctShown = pctShown == null ? null : 100 - pctShown

  const asKcal = (
    <>
      {Math.round(actual).toLocaleString()} / {target.toLocaleString()}{unit}
      {' · '}
      {over ? `${Math.abs(Math.round(left)).toLocaleString()} over` : `${Math.round(left).toLocaleString()} left`}
    </>
  )

  return (
    <div className="meter">
      <div className="head">
        <span className="name">{name}</span>
        <span className="nums">
          {/* One percentage helper for both forms; when it has no answer only the kcal form
              renders, rather than a second, unguarded division appearing here (audit F-68). */}
          {pctShown != null && leftPctShown != null ? (
            <>
              <span className="u-kcal">{asKcal}</span>
              <span className="u-pct">
                {pctShown}% of {target.toLocaleString()}{unit}
                {' · '}
                {over ? `${Math.abs(leftPctShown)}% over` : `${leftPctShown}% left`}
              </span>
            </>
          ) : asKcal}
        </span>
      </div>
      <div className="track">
        {/* Capped at 100% width; the overage is stated as a number rather than an 11th block. */}
        <div
          className="fill"
          style={{
            width: `${Math.min(100, Math.max(0, pct ?? (over ? 100 : 0)))}%`,
            background: over ? 'var(--critical)' : color,
          }}
        />
        {floor != null && target > 0 && floor < target && (
          <div
            className="marker"
            style={{ left: `${(floor / target) * 100}%` }}
            title={`floor ${floor}${unit}`}
          />
        )}
        {pace != null && target > 0 && (
          <div
            className="marker pace"
            style={{ left: `${Math.min(100, Math.max(0, (pace.at / target) * 100))}%` }}
            title={pace.label}
          />
        )}
      </div>
      {note && <div className="note">{note}</div>}
    </div>
  )
}

export function TableView({ children, label = 'Table view' }: { children: React.ReactNode; label?: string }) {
  return (
    <details className="table-view">
      <summary>{label}</summary>
      <div className="scroll-x">{children}</div>
    </details>
  )
}

/**
 * `hatch` marks a key that is DERIVED rather than measured — the plan-vs-actual difference cap on
 * a grouped-bar chart. It takes no `color`, deliberately: the categorical slots are assigned in
 * fixed order and never cycled, and handing one to a quantity nobody counted would put a third
 * "thing that was measured" on a two-series chart.
 */
export function Legend({
  items,
}: {
  items: { label: string; color?: string; line?: boolean; hatch?: boolean }[]
}) {
  if (items.length < 2) return null
  return (
    <p className="legend">
      {items.map((it) => (
        <span className="key" key={it.label}>
          <span
            className={`swatch${it.line ? ' line' : ''}${it.hatch ? ' hatch' : ''}`}
            style={it.hatch ? undefined : { background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </p>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>
}
