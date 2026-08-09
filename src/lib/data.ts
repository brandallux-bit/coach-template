import bundle from '@/generated/data.json'

export type Row = Record<string, string>

export const plan = bundle.plan
export const body = bundle.body as Row[]
export const steps = bundle.steps as Row[]
export const targets = bundle.targets as Row[]
export const meals = bundle.meals as Row[]
export const training = bundle.training as Row[]
export const sets = bundle.sets as Row[]
export const prescriptions = bundle.prescriptions as Row[]

/** Long-format store for anything the fixed columns don't cover. See data/METHOD.md. */
export const metrics = bundle.metrics as Row[]
export const metricsRegistry = bundle.metricsRegistry as Record<
  string,
  { label: string; unit: string; direction: 'up' | 'down'; domain: string }
>
export const coachNotes = bundle.coachNotes as Row[]
export const energy = bundle.energy as Row[]

/** Empty means "not measured" and must never collapse to zero. */
export const n = (v: string | undefined): number | null =>
  v == null || v === '' ? null : Number(v)

export const oneOf = (rows: Row[], date: string) => rows.find((r) => r.date === date)
export const allOf = (rows: Row[], date: string) => rows.filter((r) => r.date === date)

/** Today in the athlete's timezone, not the server's. */
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: plan.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

export const weekdayOf = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })

export const prettyDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  })

/** Monday-anchored week start, matching how the plan's Mon–Thu / Fri–Sun budget is written. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7
  return addDays(iso, -dow)
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** Sum a numeric column, returning null when nothing was measured at all. */
export function sumOrNull(rows: Row[], key: string): number | null {
  const vals = rows.map((r) => n(r[key])).filter((v): v is number => v != null)
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null
}

export function meanOrNull(values: (number | null)[]): number | null {
  const vals = values.filter((v): v is number => v != null)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

export const fmt = (v: number | null | undefined, digits = 0, suffix = '') =>
  v == null || Number.isNaN(v)
    ? 'TBD'
    : `${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`

/**
 * Least-squares slope over (dayIndex, value). Returns null below `minPoints` — a projection
 * from three readings is noise wearing a confidence interval, and CLAUDE.md §6 is explicit
 * that trend beats point.
 */
export function trend(points: { date: string; value: number }[], minPoints = 7) {
  if (points.length < minPoints) return null
  const x0 = Date.parse(`${points[0].date}T12:00:00Z`)
  const xs = points.map((p) => (Date.parse(`${p.date}T12:00:00Z`) - x0) / 86_400_000)
  const ys = points.map((p) => p.value)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ys.reduce((a, b) => a + b, 0) / ys.length
  let num = 0, den = 0
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2 }
  if (den === 0) return null
  const slope = num / den
  return { perDay: slope, perWeek: slope * 7, intercept: my - slope * mx, n: points.length }
}

export const series = (rows: Row[], key: string) =>
  rows
    .map((r) => ({ date: r.date, value: n(r[key]) }))
    .filter((p): p is { date: string; value: number } => p.value != null)
