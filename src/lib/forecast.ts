import {
  COUNTS_TOWARD_FLOOR, addDays, allOf, n, plan, prescriptions, training, weekdayKey, type Row,
} from './data'
import {
  ABSENT_COUNTED_ELSEWHERE, ABSENT_UNKNOWN, plannedTotal, sessionCost, sessionKcal as kcalFor,
  type IntensityTier, type KcalAbsence,
} from './aggregate'
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore - plain ESM, shared with scripts/ on purpose: one declaration, two consumers
import {
  DAILY as SESSION_DAILY,
  RESERVED_SESSIONS as SESSION_RESERVED,
  SUPPLEMENTS as SESSION_SUPPLEMENTS,
  sessionKey as sessionKeyOf,
} from '../../scripts/lib/sessions.mjs'

/**
 * Forward projection of PLANNED movement, for the Next 7 Days view.
 *
 * Almost everything here is derived rather than stored. `validate-data.mjs` rejects future-dated
 * rows for every file, with one narrow carve-out (data/METHOD.md rule 6a): a `training.csv` row
 * with `status: planned` may be dated ahead, which is how a one-off change to a future day gets
 * expressed. So a day resolves from — in order — a written planned row, then the weekly template,
 * then the effective-dated prescriptions. The plan stays in one place and the view renders it.
 *
 * ⚠ These are PLANNED figures for days that have not happened. They are not comparable to
 * `energy.csv`, which is a ledger of what did happen, and they deliberately exclude RMR, TEF and
 * NEAT — this answers "what movement is scheduled and roughly what does it cost", not "what will
 * I burn on Thursday". Mixing the two would repeat the double-count trap in data/METHOD.md.
 */

// =================================================================================================
// Session resolution — the one home for "which session, and which rows belong to it"
//
// INVARIANTS.md X-13: *a lookup selects on every dimension of its key.* A training day has two
// dimensions — the date AND the session — and until 2026-08-14 three separate call sites selected
// on the date alone and took `[0]` of what came back. On a day with two training rows that is a
// coin flip, and `log/page.tsx` flipped it into the WRITE path: the Sets form pre-filled the
// wrong session name, so sets were written to `sets.csv` under a session the athlete did not
// perform — permanently, in the file goals.md's strength guardrail is read against. 2026-08-08
// already has two rows; since the daily rehab block started being logged as its own row on
// 2026-08-13, every day has two.
//
// Everything below is exported so `today/page.tsx`, `log/page.tsx` and `planDay` share one
// answer. Three copies of a resolver is three chances to resolve differently, and they already
// had: two did max-by-date and the third took the last row in the file, which means a
// hand-inserted row could silently change which prescription was in force.
// =================================================================================================

/**
 * The reserved session names — declared in `scripts/lib/sessions.mjs`, re-exported here.
 *
 * They moved out of this file on 2026-08-14 (W6) because they had grown four homes and
 * `check-suspensions.mjs` needed a fifth: `scripts/` cannot import TypeScript, so anything both
 * layers need lives in plain ESM and the TypeScript renders it. Same arrangement, same reason, as
 * `aggregate.mjs` / `aggregate.ts`. Read that file for what "reserved" means and why `Supplements`
 * is deliberately not `Daily`.
 */
export const DAILY = SESSION_DAILY
export const SUPPLEMENTS = SESSION_SUPPLEMENTS

const RESERVED_SESSIONS = new Set<string>(SESSION_RESERVED)

/**
 * A session name reduced to the part three different files agree on — **re-exported, not declared.**
 * `scripts/lib/sessions.mjs` holds it and says why: `scripts/` cannot import TypeScript, and the
 * duration resolver there needs the same stem. Same arrangement, same reason, as `weekdayKey` in
 * `data.ts`.
 */
export const sessionKey: (s: string | null | undefined) => string = sessionKeyOf

export type PlannedItem = {
  label: string
  detail: string
  kcal: number | null
  /** Why this number is what it is — rendered so an estimate is never a bare figure. */
  basis: string
  /**
   * When `kcal` is null, WHY it is null. The two reasons are not interchangeable and collapsing
   * them is how a day's Total came to read as a confident figure with a session missing from it:
   *
   *   `counted-elsewhere` — a walk. Its MET is 0 on purpose because its energy is already in
   *                         steps; the day's total is complete without it.
   *   `unknown`           — no MET on file, or no duration planned. The total is short by a real
   *                         cost and has to say so.
   */
  kcalAbsence?: KcalAbsence
}

/** One session on a day. A day can have several; before 2026-08-14 only the first was rendered. */
export type PlannedSession = {
  session: string | null
  type: string | null
  focus: string | null
  durationMin: number | null
  /** True when a real training.csv row exists, so this is recorded rather than merely planned. */
  written: boolean
  status: string | null
  rx: Row[]
  /** Session types that count against goals.md's sessions/week floor. Walks live in steps. */
  countsTowardFloor: boolean
}

export type PlannedDay = {
  date: string
  isToday: boolean
  isPast: boolean
  /**
   * Every session on the day, primary first. Written training.csv rows always win over the
   * template (data/METHOD.md); the template supplies a day only when nothing is written.
   */
  sessions: PlannedSession[]
  /** The primary session's fields — i.e. `sessions[0]`. See `primarySession` for how it is picked. */
  session: string | null
  sessionType: string | null
  focus: string | null
  durationMin: number | null
  written: boolean
  status: string | null
  rx: Row[]
  dailyRx: Row[]
  items: PlannedItem[]
  totalKcal: number | null
  /**
   * True when at least one item on the day has an UNKNOWN cost, so `totalKcal` is short by a real
   * figure rather than complete. A walk contributing nothing does not set this — its energy is in
   * steps by design. Rendered as a marker on Next 7 Days; never printed as a bare total.
   */
  totalIsPartial: boolean
}

/**
 * The chart's session model: kcal = MET × 3.5 × kg / 200 × minutes (data/METHOD.md).
 *
 * Null-propagating, and the arithmetic lives in `scripts/lib/aggregate.mjs` so the property suite
 * runs this exact code. A session with no duration on file costs an UNKNOWN amount, not zero.
 */
export const sessionKcal = kcalFor

/**
 * Effective-dated prescription lookup: the newest set on or before `date`, for that session name.
 *
 * THE one home for this. `today/page.tsx` and `log/page.tsx` import it rather than keeping their
 * own; `scripts/test-prescriptions.mjs` asserts they still do, because the drift is what caused
 * the defect — the log page's copy resolved by file order (`forSession.at(-1)`), so a row inserted
 * by hand rather than appended silently changed which set was in force.
 *
 * Argument order is `(session, date)`, not the `(date, session)` the build plan names. This is the
 * signature that already existed and that both surviving copies used; flipping two arguments of
 * the same type is the exact silent-swap defect this workstream exists to remove, and it buys
 * nothing.
 *
 * Scoped to the session name on purpose — an unscoped version shipped on 2026-08-13 and rendered
 * one session's exercises under another session's heading.
 */
export function effectiveRx(session: string, date: string): Row[] {
  const rows = prescriptions.filter((p) => p.session === session && p.date <= date)
  const eff = rows.reduce((max, p) => (p.date > max ? p.date : max), '')
  return rows.filter((p) => p.date === eff).sort((a, b) => Number(a.order) - Number(b.order))
}

/**
 * The prescriptions.csv session name that serves a training.csv session name, or null.
 *
 * Exact match first. Failing that, one — and only one — session whose `sessionKey` matches: so
 * "Session B — Upper Push/Pull + Core" finds "Session B", while "Session A — Lower + Pull" finds
 * NOTHING, because both "Session A" and "Session A (knee-free)" answer to it and picking either
 * would be a guess about which block the athlete performed. An ambiguous name resolves to no
 * prescription, which renders as "no set-by-set prescription" — true, and better than a confident
 * wrong table.
 *
 * Reserved names are excluded from the fallback: the daily block and the supplement stack have
 * their own surfaces and must never be adopted as a session's prescription.
 */
export function rxSessionFor(session: string | null | undefined, date: string): string | null {
  if (!session) return null
  if (prescriptions.some((p) => p.session === session && p.date <= date)) return session

  const key = sessionKey(session)
  if (!key) return null
  const named = [...new Set(
    prescriptions
      .filter((p) => p.date <= date && !RESERVED_SESSIONS.has(p.session))
      .map((p) => p.session),
  )].filter((name) => sessionKey(name) === key)
  return named.length === 1 ? named[0] : null
}

/** The live prescription for a training session, resolved through `rxSessionFor`. */
export function rxFor(session: string | null | undefined, date: string): Row[] {
  const name = rxSessionFor(session, date)
  return name ? effectiveRx(name, date) : []
}

/**
 * A day's training rows, most-primary first. Deliberate, rather than file order.
 *
 * The rank, in order, and why each key is where it is:
 *
 *   1. **Not skipped.** A session he did not do is never the day's session, whatever else it has.
 *   2. **Has a live prescription.** This is the key that decides the athlete-visible cases. A set
 *      is logged against a prescribed exercise, so the prescribed session is the one the Sets form
 *      must pre-fill and the one Today must render the table for. It sits above status because of
 *      the case that separates them: a completed morning walk beside a planned evening lift.
 *      Status-first picks the walk, and then the evening's sets get written under it.
 *   3. **Status** — completed over planned over rest. A fact beats an intention.
 *   4. **File order**, so the answer is stable.
 *
 * The build plan states keys 3 and 2 the other way round. They agree on every case in this chart's
 * history — 2026-08-08's two completed rows tie on status and resolve on the prescription either
 * way — and they differ only on the morning-walk case above, where this order is the one that
 * keeps sets attributed correctly. Flagged here rather than silently.
 */
const STATUS_RANK: Record<string, number> = { completed: 0, planned: 1, rest: 2, skipped: 3 }

export function orderedSessions(rows: Row[], date: string): Row[] {
  const rank = (r: Row, i: number) => [
    r.status === 'skipped' ? 1 : 0,
    rxSessionFor(r.session, date) ? 0 : 1,
    STATUS_RANK[r.status] ?? 2,
    i,
  ]
  return rows
    .map((r, i) => ({ r, k: rank(r, i) }))
    .sort((a, b) => {
      for (let i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i]
      return 0
    })
    .map((x) => x.r)
}

/** The day's primary session, or null when nothing is written. See `orderedSessions`. */
export const primarySession = (rows: Row[], date: string): Row | null =>
  orderedSessions(rows, date)[0] ?? null

/**
 * The sets belonging to one session, out of a day's sets.
 *
 * WHY THIS EXISTS. `logged = allOf(sets, date)` matched on the date alone, so an evening session
 * rendered exercises "done" that a morning session had logged — and he would skip them. `sets.csv`
 * has a `session` column and the filter ignored it.
 *
 * The ladder, and the reason it is a ladder rather than an equality test:
 *
 *   0. **One session on the day → no scoping at all.** Nothing can be misattributed when there is
 *      only one candidate, and every historical row predates the coach writing two rows a day.
 *      This is what keeps 2026-08-06 through 2026-08-12 rendering exactly as they did.
 *   1. **Exact session match.**
 *   2. **`sessionKey` match**, for the real and common case where `training.csv` says
 *      "Session B — Upper Push/Pull + Core" and every set on that day says "Session B".
 *   3. **Nothing.** A set on a two-session day whose name matches neither is genuinely
 *      unattributable, and guessing is what this function exists to stop. It stays visible in the
 *      unscoped "every set logged today" tables, which are deliberately not filtered — hiding
 *      logged work is its own defect, just a quieter one.
 */
export function setsForSession(
  daySets: Row[],
  session: string | null | undefined,
  dayNames: (string | null | undefined)[],
): Row[] {
  const distinct = new Set(dayNames.filter(Boolean).map((nm) => sessionKey(nm)))
  if (!session || distinct.size <= 1) return daySets
  const exact = daySets.filter((s) => s.session === session)
  if (exact.length) return exact
  return daySets.filter((s) => sessionKey(s.session) === sessionKey(session))
}

export function planDay(date: string, todayIso: string): PlannedDay {
  const writtenRows = orderedSessions(allOf(training, date), date)
  const templated = plan.weeklyTemplate?.[weekdayKey(date)] ?? null

  // A template field describes the template day's OWN session. When a written row substitutes a
  // different kind of session, nothing on the template travels with it — that guard already
  // existed for `met` (a strength session landing on a pinned ride day was costed as a ride,
  // 2026-08-13) and was missing on `focus` and `durationMin`, which is the same scope leak one
  // field over:
  //   - `focus` is how Thursday's card came to read "Walk, flat + Peloton TEST RIDE — Steps. No
  //     Peloton while the knee is out."
  //   - `durationMin` is worse, because it invents a number: today's rehab row has a deliberately
  //     blank duration ("not measured"), and unguarded it would borrow the template's 35 minutes
  //     and cost a session that reported none.
  const fromTemplate = (type: string | null | undefined) =>
    templated && type === templated.type ? templated : null

  const describe = (row: Row | null): PlannedSession => {
    const t = row ? fromTemplate(row.type) : templated
    return {
      session: row?.session ?? templated?.session ?? null,
      type: row?.type ?? templated?.type ?? null,
      focus: t?.focus ?? null,
      durationMin: (row ? n(row.duration_min) : null) ?? t?.durationMin ?? null,
      written: row != null,
      status: row?.status ?? null,
      rx: rxFor(row?.session ?? templated?.session, date),
      countsTowardFloor: COUNTS_TOWARD_FLOOR.has(row?.type ?? templated?.type ?? ''),
    }
  }

  const sessions: PlannedSession[] = writtenRows.length
    ? writtenRows.map(describe)
    : templated
      ? [describe(null)]
      : []

  const dailyRx = effectiveRx(DAILY, date)
  const weightLb = plan.latestWeightLb ?? plan.baselineWeightLb
  const items: PlannedItem[] = []

  // One item per session, not one per day. A day with a walk and a lift on it costs both — before
  // 2026-08-14 only `[0]` was costed, so 2026-08-08's strength session was worth zero calories on
  // the forecast because the walk happened to be written first.
  sessions.forEach((s, i) => addSessionItem(items, s, writtenRows[i] ?? null, date, weightLb))
  addDailyBlock(items, dailyRx, weightLb)
  addSteps(items, weightLb)

  const primary = sessions[0] ?? null
  const total = plannedTotal(items)

  return {
    date,
    isToday: date === todayIso,
    isPast: date < todayIso,
    sessions,
    session: primary?.session ?? null,
    sessionType: primary?.type ?? null,
    focus: primary?.focus ?? null,
    durationMin: primary?.durationMin ?? null,
    written: primary?.written ?? false,
    status: primary?.status ?? null,
    // The Daily block has its own card on every surface; rendering it as the session's own
    // prescription too would show the same eleven items twice.
    rx: primary?.session === DAILY ? [] : primary?.rx ?? [],
    dailyRx,
    items,
    totalKcal: total.total,
    totalIsPartial: total.partial,
  }
}

/**
 * The movement cost of one session, appended to `items`. Nothing is pushed for a rest day.
 *
 * ⚠ THE PRECEDENCE IS NOT WRITTEN HERE ANY MORE. `sessionCost` in `scripts/lib/aggregate.mjs` is
 * the one home for it, and this function's only remaining job is to supply the MET resolver and
 * turn the result into a rendered item. Before 2026-08-14 the split branch and the flat branch
 * were both open-coded here, which made this the third copy of `MET × 3.5 × kg / 200` and the
 * second copy of the tier-then-flat decision (audit F-02, F-67).
 *
 * **The forecast's resolver differs from the ledger's in exactly one respect, and it is
 * deliberate: the weekly template can PIN a MET for its own day.** A session type covers a range —
 * `peloton` defaults to 8.5, a hard ride, which overstates the seated low-resistance spin the knee
 * block prescribes. Pinning it on the template day keeps the forecast honest without redefining
 * the type for every future hard ride. The pin applies only when the written row's type still
 * matches the template's, which is the `met` guard `planDay` already documents.
 *
 * A written row's own `kcal_override` now wins here too, which it did not before. That is the
 * right answer and it only ever applies to today: a device reading is the truest figure a session
 * has, and the forward window's first day is a day that may already have happened.
 */
function addSessionItem(
  items: PlannedItem[], s: PlannedSession, row: Row | null, date: string, weightLb: number,
) {
  const { type, durationMin } = s
  if (!type || type === 'rest') return
  const label = s.session ?? type
  const rxCount = s.session === DAILY ? 0 : s.rx.length

  const templated = plan.weeklyTemplate?.[weekdayKey(date)] ?? null
  const pinned = templated?.met != null && type === templated.type ? templated.met : null
  const metOf = (t: string | null, tier: IntensityTier | null) =>
    (tier ? plan.metByIntensity?.[t ?? '']?.[tier] : null) ?? pinned ?? plan.metByType?.[t ?? ''] ?? null

  // `durationMin` rather than the row's own: `planDay` has already resolved it through the
  // template guard, and a templated day has no row at all.
  const cost = sessionCost({ ...(row ?? {}), type, duration_min: String(durationMin ?? '') },
    weightLb, metOf)

  if (cost.level === 'split') {
    items.push({
      label,
      detail: cost.segments.map((x) => `${x.minutes} min ${x.tier}`).join(' + '),
      kcal: cost.kcal,
      basis: cost.explain,
    })
    return
  }

  if (cost.kcal != null) {
    items.push({
      label,
      detail: `${durationMin} min${rxCount ? ` · ${rxCount} exercises` : ''}`,
      kcal: cost.kcal,
      basis: cost.level === 'override' ? cost.explain : `${cost.explain}${pinned ? ' (MET pinned by the block template)' : ''}`,
    })
    return
  }

  // The two absences are not interchangeable. A walk's MET is 0 on purpose — its energy is already
  // in steps, and the day's total is COMPLETE without it. Anything else is a real cost nobody can
  // compute (no MET for the type, or a duration never measured: 2026-08-13's rehab row leaves
  // `duration_min` deliberately blank), and `plannedTotal` marks the total rather than printing a
  // bare figure. Collapsing them is what let a day's Total read as confident with a session
  // missing from it.
  items.push({
    label,
    detail: durationMin ? `${durationMin} min` : '—',
    kcal: null,
    kcalAbsence: cost.level === 'counted-elsewhere' ? ABSENT_COUNTED_ELSEWHERE : ABSENT_UNKNOWN,
    basis: cost.explain,
  })
}

/**
 * The `Daily` prescription block, priced from the registry rather than from a key of its own.
 *
 * ⚠ **BOTH FIGURES COME FROM `sessionTypes`, AND THAT IS THE POINT.** This read
 * `plan.dailyRehabMin` for the minutes and `plan.metByType.rehab` for the MET — one athlete's
 * activity named in shared TypeScript, and a second home for a duration the LEDGER already reads
 * out of `sessionTypes.<type>.standingDurationMin`. Two homes for one figure is exactly the
 * forecast-versus-ledger disagreement the duration resolver's rung 4 exists to end. A chart says
 * which type its daily block is, once, and both sides price it the same way.
 */
function addDailyBlock(items: PlannedItem[], dailyRx: Row[], weightLb: number) {
  const type = plan.dailyBlockType ?? null
  const minutes = type ? plan.sessionTypeDetail?.[type]?.standingDurationMin ?? null : null
  if (!dailyRx.length || !type || !minutes) return
  const met = plan.metByType?.[type] ?? null
  // ⚠ **A MET OF 0 IS A DECISION, NOT AN ABSENCE, AND COLLAPSING THE TWO IS A NAMED DEFECT.** A
  // walking type carries `met: 0` with `energyCountedIn: 'steps'` — its energy is already counted,
  // so the block's cost is legitimately nothing and the day's total is COMPLETE without it. Reading
  // that as `unknown` marks a correct total as short. `plannedTotal`'s own docstring records this
  // exact collapse as what "let a day's Total read as a confident figure while silently omitting a
  // session". Only reachable since `dailyBlockType` accepts any registry type; the hardcoded
  // predecessor could never be a MET-0 activity.
  const countedElsewhere = met === 0
  items.push({
    label: 'Daily block',
    detail: `${minutes} min · ${dailyRx.length} items`,
    kcal: met ? sessionKcal(met, minutes, weightLb) : null,
    kcalAbsence: met ? undefined : (countedElsewhere ? ABSENT_COUNTED_ELSEWHERE : ABSENT_UNKNOWN),
    basis: met
      ? `MET ${met} × ${minutes} min — the standing duration this chart declares for "${type}"`
      : countedElsewhere
        ? `"${type}" is priced at MET 0 — its energy is already counted elsewhere, so the day's total is complete without it`
        : `no MET on file for "${type}"`,
  })
}

function addSteps(items: PlannedItem[], weightLb: number) {
  const stepTarget = plan.stepsPerDayTarget ?? null
  const perStep = plan.kcalPerStepPerLb ?? null
  if (!stepTarget || !perStep) return
  items.push({
    label: 'Steps',
    detail: `${stepTarget.toLocaleString()} target`,
    kcal: stepTarget * perStep * weightLb,
    basis: `${stepTarget.toLocaleString()} × ${perStep} × ${weightLb} lb`,
  })
}

/** `days` consecutive days starting at `from`. Defaults to a 7-day window opening today. */
export function planWindow(from: string, days = 7, todayIso = from): PlannedDay[] {
  return Array.from({ length: days }, (_, i) => planDay(addDays(from, i), todayIso))
}
