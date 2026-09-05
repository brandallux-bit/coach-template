/**
 * Units for the Log tab, and nothing else.
 *
 * The ledger stores pounds and inches on every chart — one unit for every formula in
 * scripts/lib. A chart that declares `athlete.units: "metric"` is asked in kilograms and
 * centimetres, converted here on the way in (src/app/api/log/route.ts) and on the Log tab's own
 * table of what was logged. The read pages still render the ledger's unit; converting every
 * surface is a follow-up, and this file is where that conversion will import from.
 *
 * The constants are `scripts/lib/aggregate.mjs`'s, imported rather than restated (X-8).
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - plain ESM, shared with scripts/ on purpose: one home for each constant
import * as agg from '../../scripts/lib/aggregate.mjs'
import type { Plan } from './data'

export type Units = NonNullable<Plan['units']>

export const kgFromLb: (lb: number | null) => number | null = agg.kgFromLb
export const lbFromKg: (kg: number) => number = agg.lbFromKg
export const cmFromIn: (inches: number) => number = agg.cmFromIn
export const inFromCm: (cm: number) => number = agg.inFromCm

export const isMetric = (units: Units | undefined) => units === 'metric'

/** Round to the ledger's own precision so a converted entry looks like a typed one. */
const r1 = (v: number) => Math.round(v * 10) / 10
const r2 = (v: number) => Math.round(v * 100) / 100

/** A value already in the ledger's unit, shown in the chart's unit. */
export const showWeight = (lb: number | null | undefined, units: Units | undefined) =>
  lb == null ? null : isMetric(units) ? `${r1(kgFromLb(lb) as number)} kg` : `${lb} lb`
export const showLength = (inches: number | null | undefined, units: Units | undefined) =>
  inches == null ? null : isMetric(units) ? `${r1(cmFromIn(inches))} cm` : `${inches} in`
export const showLoad = (lb: number | null | undefined, units: Units | undefined) =>
  lb == null ? 'BW' : isMetric(units) ? `${r1(kgFromLb(lb) as number)} kg` : `${lb} lb`

/**
 * The form's metric fields, as the ledger's imperial columns. Field names are unit-specific on
 * purpose (`weight_kg`, never `weight_lb` holding kilograms), so a form and a route that disagree
 * about the unit produce an unknown field rather than a silently wrong number.
 */
export function toLedgerUnits(row: Record<string, string>, units: Units | undefined): Record<string, string> {
  if (!isMetric(units)) return row
  const out: Record<string, string> = { ...row }
  const move = (from: string, to: string, convert: (v: number) => number, round: (v: number) => number) => {
    if (!(from in out)) return
    const raw = out[from]
    delete out[from]
    out[to] = raw === '' ? '' : String(round(convert(Number(raw))))
  }
  move('weight_kg', 'weight_lb', lbFromKg, r1)
  move('waist_cm', 'waist_in', inFromCm, r2)
  move('neck_cm', 'neck_in', inFromCm, r2)
  move('load_kg', 'load_lb', lbFromKg, r1)
  return out
}
