import Link from 'next/link'

export function Shell({ children }: { children: React.ReactNode }) {
  return <div className="shell">{children}</div>
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
 * A target meter. `marker` places the plan's own line on the track, so "how far along" and
 * "where the plan wanted me" are readable in one glance without a second axis.
 */
export function Meter({
  name, actual, target, unit = '', color = 'var(--series-1)', note, floor,
}: {
  name: string
  actual: number | null
  target: number | null
  unit?: string
  color?: string
  note?: string
  floor?: number
}) {
  if (target == null) {
    return (
      <div className="meter">
        <div className="head"><span className="name">{name}</span><span className="nums tbd">no target set</span></div>
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
      </div>
    )
  }

  const pct = (actual / target) * 100
  const left = target - actual
  const over = left < 0

  return (
    <div className="meter">
      <div className="head">
        <span className="name">{name}</span>
        <span className="nums">
          {Math.round(actual).toLocaleString()} / {target.toLocaleString()}{unit}
          {' · '}
          {over ? `${Math.abs(Math.round(left)).toLocaleString()} over` : `${Math.round(left).toLocaleString()} left`}
          {' · '}
          {Math.round(pct)}%
        </span>
      </div>
      <div className="track">
        {/* Capped at 100% width; the overage is stated as a number rather than an 11th block. */}
        <div
          className="fill"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: over ? 'var(--critical)' : color }}
        />
        {floor != null && floor < target && (
          <div
            className="marker"
            style={{ left: `${(floor / target) * 100}%` }}
            title={`floor ${floor}${unit}`}
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

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  if (items.length < 2) return null
  return (
    <p className="legend">
      {items.map((it) => (
        <span className="key" key={it.label}>
          <span className={`swatch${it.line ? ' line' : ''}`} style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </p>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>
}
