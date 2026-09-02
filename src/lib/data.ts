import { weekdayKey as weekdayKeyOf } from '../../scripts/lib/weekdays.mjs'
import raw from '@/generated/data.json'
import {
  allOnOrBefore as allRowsOnOrBefore, dayFraction, latestOnOrBefore as latestRowOnOrBefore,
  meanOrNull as meanOfValues, n as nValue, sumOrNull as sumValues,
} from './aggregate'

export type Row = Record<string, string>

/**
 * Universal fields are required. Everything below the line is decided by this chart's
 * domains and is therefore optional — a chart with no body-composition domain has no
 * waist trigger, and pages must render without one rather than assume it.
 *
 * TODO: trigger keys are still named here, which means a chart measuring something this
 * type doesn't know about can't drive a reference line. The fix is a per-athlete view
 * config; deferred until a second chart's intake shows what it actually needs.
 */
export type Plan = {
  name: string
  pronouns: string
  timezone: string
  heightIn: number
  age: number | null
  baselineDate: string
  baselineWeightLb: number
  rmrFloorKcal: number | null
  estMaintenanceKcal: number
  proteinFloorG: number
  events: Record<string, string>
  proteinAimG?: number
  weeklyKcalBudget?: number
  /**
   * The athlete's weekly alcohol allowance, **inside `weeklyKcalBudget`, never on top of it.**
   *
   * Optional because it is per-athlete and per-domain: a chart whose domains are symptom control
   * and sleep has no reason to carry one, and its absence renders as TBD, which is a correct chart.
   * **There is deliberately no per-day counterpart** — see `scripts/generate-targets.mjs`. The
   * weekly FOOD budget is derived from this and lives in `scripts/lib/aggregate.mjs`
   * (`weeklyBudget`); it must never be added here as a third constant.
   */
  weeklyAlcoholKcalBudget?: number
  /**
   * The week's calorie budget, **already divided among the seven days**, and usually not evenly —
   * the unevenness is normally the plan, with a bigger day parked where the athlete wants it.
   * `validate-data.mjs` asserts the seven sum to `weeklyKcalBudget`.
   *
   * It is the fallback `scripts/generate-targets.mjs` writes from, and therefore the answer to
   * "what is this day's target" on any day no row has been written for yet. **A surface must never
   * invent a different division** — see `data/METHOD.md`, "A day may never lack a calorie target".
   */
  kcalByWeekday?: Record<string, number>
  targetRateLbPerWk?: number[]
  /** How many readings each end of the anchored trend averages. Default 3. */
  trendWindowSize?: number
  /** How far apart the two ends of the anchored trend sit, in days. Default 10. */
  trendLagDays?: number
  maxRatePctBwPerWk?: number
  /**
   * ⚠ **WHICH AUTOMATION COUNTS THIS CHART'S MOVEMENT, OR ABSENT.** A name rather than a boolean,
   * so a second writer is a new value and not a new branch. Absent is the majority configuration
   * and not a lesser one: that chart's movement term is `movementKcal` below.
   */
  stepFeed?: string
  /**
   * How much this athlete moves OUTSIDE deliberate exercise, in their own words — one of the keys
   * in `scripts/lib/movement.mjs`. Only meaningful with no `stepFeed`; a logged walk is priced as
   * a session, so a level that also covered it would count that walk twice.
   */
  movementOutsideExerciseLevel?: string
  /** What that level costs at the current weight, in kcal/day. Derived; never stored. */
  movementKcal?: number | null
  /** The derivation behind `movementKcal`, so no surface ever prints it as a bare total. */
  movementBasis?: string | null
  /** The level IN FORCE — the athlete's if they gave one, otherwise the shipped default. */
  movementLevel?: string | null
  /** False when `movementLevel` is the shipped default and nobody has answered. Say so on screen. */
  movementLevelDeclared?: boolean
  /**
   * What the athlete's step feed has actually recorded — the trailing mean, not the target.
   * Null on a chart with no feed. See `observedDailySteps` in `scripts/lib/aggregate.mjs`.
   */
  observedSteps?: { meanSteps: number; days: number; from: string | null; to: string | null } | null
  stepsPerDayTarget?: number
  sessionsPerWeekFloor?: number
  sessionsPerWeekTarget?: number
  phaseEndDate?: string
  waistTriggerIn?: number
  waistWorkingBaselineIn?: number
  // Renamed from weightTriggerLb 2026-08-11: it is a review checkpoint, not an end condition.
  weightCheckpointLb?: number
  weightFloorLb?: number
  /** The block's weekly skeleton. A real training.csv row always wins over this. */
  weeklyTemplate?: Record<string, TemplateDay>
  // --- Forward-projection inputs (see src/lib/forecast.ts) --------------------------------------
  // Re-exports of the energy model's own constants, so a forward view never keeps a second copy
  // of a number `compute-energy.mjs` already owns. Optional because the template repo has no
  // chart to derive them from.
  /** Resolved MET table by session type, from scripts/lib/athlete.mjs. */
  metByType?: Record<string, number>
  /** Per-intensity MET, for a session logged with a light/moderate/hard split. */
  metByIntensity?: Record<string, { light: number; moderate: number; hard: number }>
  /** kcal per step per lb of bodyweight. */
  kcalPerStepPerLb?: number
  /**
   * The conventional 3,500 kcal per pound of body fat, re-exported from
   * `scripts/lib/athlete.mjs`. **Never type the literal into a page** — it has one home and
   * `scripts/test-single-home.mjs` scans every file in `src/` and `scripts/` for it.
   */
  kcalPerLbFat?: number
  /** Most recent weight on file, for projecting a session that has not happened. */
  latestWeightLb?: number
  /**
   * Which registry type the `Daily` prescription block is, if the chart prescribes one. Its
   * duration and its MET both come from `sessionTypeDetail` / `metByType` — see
   * `athlete/constants.json` `program.dailyBlockType`.
   */
  dailyBlockType?: string | null
  /** Per-type registry detail the views need beyond the MET: standing durations, for one. */
  sessionTypeDetail?: Record<string, { standingDurationMin?: number | null }> | null
  // --- The session-type registry, resolved (see athlete/constants.json `sessionTypes`) ----------
  /** Every legal `training.csv` type on this chart, in registry order. Drives the /log dropdown. */
  sessionTypeList?: string[]
  /** The subset that counts against `sessionsPerWeekFloor`. See `COUNTS_TOWARD_FLOOR` below. */
  countsTowardFloor?: string[]
  /** The `goals.md` domain each type serves, or null for the two universal structural types. */
  sessionTypeDomains?: Record<string, string | null>
  /**
   * Sentences about THIS athlete that a shared component would otherwise carry as a literal.
   *
   * Every key is optional and every renderer must work without it (audit F-31): a new athlete used
   * to get a `primary`-badged tile for a measurement they had never taken, a card explaining a
   * baseline figure recorded under someone else's medication, and a Today tab telling them which of
   * *someone else's* days were fixed. Absence renders a generic sentence or nothing at all, which
   * is a correct chart, not a gap.
   */
  copy?: Record<string, string | undefined>
}

export type TemplateDay = {
  type: string
  session: string
  focus?: string
  durationMin?: number | null
  /**
   * Intended intensity for this planned day, overriding the type's default MET.
   * A session type covers a range — `peloton` defaults to 8.5, a hard ride, which overstates the
   * seated low-resistance ride currently prescribed. Pinning it here keeps the forecast honest
   * without redefining the type for every future hard ride.
   */
  met?: number
}

/**
 * Session types that count against `goals.md`'s sessions/week floor.
 *
 * ⚠ **ONE HOME, and it took two moves to get here** (audit F-70, then F-15). It was declared
 * identically in `rollup.ts` and `forecast.ts`, mirrored a third time in `test-views.mjs`, and the
 * drift guard there regex-parsed **`rollup.ts` only** — so a change to the `forecast.ts` copy
 * passed CI green while the home page and Next 7 Days counted different sessions against the same
 * floor. W5 moved it here so both view libs imported one set. **W7 moved the set itself out of
 * this file**: a hardcoded list of one athlete's activities is X-11 whichever shared file it sits
 * in, and it was the mechanism by which a new athlete who runs — one legal type, `other`, not in
 * this set — had **every session invisible to the adherence count**, with `CLAUDE.md` §7 then
 * routing their coach to behaviour-change counselling for someone training six days a week.
 *
 * It now resolves from `athlete/constants.json`'s `sessionTypes` registry, via the bundle. Walks
 * still do not count on this chart — their energy and their credit both live in `steps.csv` — but
 * that is now the chart saying so, not the code.
 */
/**
 * The shape `scripts/build-data-json.mjs` writes — **declared here, not inferred from the file it
 * happens to have written.**
 *
 * ⚠ **WHY ONE NARROWING HERE AND NOT TWENTY `as T`s BELOW.** Every export used to cast its own
 * slice of the imported JSON. That reads like type safety and is not: with `resolveJsonModule`
 * alone, TypeScript infers the *literal* type of whatever `src/generated/data.json` is on disk, so
 * each cast only ever compared the artifact to itself. A generator that dropped a field produced a
 * bundle *missing* it, TypeScript inferred the narrower shape, and every cast went on passing —
 * while a page rendered `undefined`. `JSON.stringify` drops `undefined` keys silently, so that is
 * not hypothetical: any `constants.json` key that goes missing takes its bundle field with it.
 *
 * It also made the typecheck depend on which repo you ran it in, and on whether that repo had been
 * built at all.
 *
 * `src/generated-data.d.ts` now types that module as `unknown`, so the crossing from untyped JSON
 * to typed code has to be made once, deliberately, here — and cannot be made accidentally by
 * inference anywhere. **What holds the generator to this shape is
 * `scripts/build-data-json.mjs`**, which refuses to write a bundle missing any required field, with
 * tests in `scripts/test-views.mjs` — a check, not an inference (INVARIANTS.md, the operating rule).
 */
type Bundle = {
  plan: Plan
  generatedAt: GeneratedAt
  body: Row[]
  steps: Row[]
  targets: Row[]
  meals: Row[]
  training: Row[]
  sets: Row[]
  prescriptions: Row[]
  metrics: Row[]
  metricsRegistry: Record<
    string,
    {
      label: string; unit: string; direction: 'up' | 'down'; domain: string
      /**
       * Optional, and read by the COACH rather than by any page — see `CLAUDE.md` §0.2. `feed`
       * says whether anything writes this without the athlete saying it; `cadence` says whether a
       * gap in it is a real gap. Absent means `manual` and `episodic`, which together mean "never
       * chased", so a renderer that wants the effective value must apply those defaults itself
       * rather than treating `undefined` as a third state.
       */
      feed?: 'manual' | 'automated'
      cadence?: 'daily' | 'episodic' | 'lab'
      /** Optional: this metric makes another measurement unreliable. See `confoundedDates`. */
      confounds?: { measure: string; atOrAbove: number; lagDays?: number }
    }
  >
  coachNotes: Row[]
  energy: Row[]
  findings: Finding[]
}

const bundle = raw as Bundle

export const COUNTS_TOWARD_FLOOR = new Set(bundle.plan.countsTowardFloor ?? [])

/**
 * How many readings `trend()` needs before it will fit a line.
 *
 * ⚠ **NO LONGER THE GOALS PAGE'S THRESHOLD, AND THIS DOCSTRING USED TO SAY IT WAS.** That page
 * projects from `anchoredTrend` now — two smoothed windows that answer the level and the rate
 * together — and states no reading threshold of its own. This is `trend()`'s own default and
 * `trend()`'s only reader.
 *
 * Both stay for a chart that wants a regression through a whole series, which is a different and
 * legitimate question from "where is this now, and how fast is it moving". Nothing in `src/` calls
 * it today: a shipped tool with no current caller, not a stale one.
 */
export const MIN_READINGS_FOR_PROJECTION = 7

export const plan = bundle.plan
export const body = bundle.body
export const steps = bundle.steps
export const targets = bundle.targets
export const meals = bundle.meals
export const training = bundle.training
export const sets = bundle.sets
export const prescriptions = bundle.prescriptions

/** Long-format store for anything the fixed columns don't cover. See data/METHOD.md. */
export const metrics = bundle.metrics
export const metricsRegistry = bundle.metricsRegistry
export const coachNotes = bundle.coachNotes
export const energy = bundle.energy

/**
 * Something the system noticed, computed rather than remembered.
 *
 * The shape is `scripts/lib/findings.mjs`'s and this is a mirror of it — that file's header
 * explains why the layer reports and never blocks, and it is worth reading before adding one.
 *
 * `severity` is the only field a renderer may act on:
 *   `critical`  raise this before anything else on the page
 *   `attention` needs a decision soon
 *   `info`      worth knowing, no action implied
 */
export type Finding = {
  id: string
  severity: 'critical' | 'attention' | 'info'
  audience?: 'athlete' | 'coach' | 'maintainer'
  headline: string
  detail: string
  action: string
  source?: string
  domain?: string
}

/**
 * Findings as of the last build. `src/lib/findings.ts` is what a page should import — it adds the
 * ones that can only be computed at request time, and this list on its own is missing them.
 */
export const bundledFindings = bundle.findings

/**
 * When `src/generated/data.json` was built. See `scripts/build-data-json.mjs` for why it is here.
 *
 * **`localDate` is nullable and the reason matters.** Before intake there is no
 * `athlete.timezone`, so there is no such thing as the athlete's local day, and the generator
 * writes `null` rather than guessing a UTC one — the same refusal `localToday()` throws to make
 * (data/METHOD.md rule 6). `buildFreshness` in `src/lib/findings.ts` already treats it as "cannot
 * say"; this type said `string` and made that guard look like dead code.
 */
export type GeneratedAt = { localDate: string | null; at: string }
export const generatedAt = bundle.generatedAt

/**
 * Empty means "not measured" and must never collapse to zero.
 *
 * Re-exported from `src/lib/aggregate.ts` rather than defined here, so the check suite and the
 * dashboard share one implementation of the distinction the whole of X-1 rests on.
 */
export const n = nValue

export const oneOf = (rows: Row[], date: string) => rows.find((r) => r.date === date)
export const allOf = (rows: Row[], date: string) => rows.filter((r) => r.date === date)

/**
 * The newest row dated on or before `date` — "what is in force today", not "what was written
 * today".
 *
 * `oneOf` is an exact-date match, which is right for a measurement (a weigh-in belongs to the day
 * it was taken) and wrong for anything that stands until it is replaced. The Today tab used
 * `oneOf` for the coach's note, so every note in `coach-notes.csv` was visible on exactly one day
 * and invisible on all the others — three notes written, three notes nobody could see the morning
 * after. A renderer using this must say which date the row carries when it is not today's, or a
 * note about Friday's dinner silently becomes advice about Tuesday.
 *
 * The lookup itself lives in `scripts/lib/aggregate.mjs` — `compute-energy.mjs` and
 * `build-data-json.mjs` each had their own forward-fill of the same rule, so "what is in force on
 * this date" was three expressions that happened to agree.
 */
export const latestOnOrBefore: (rows: Row[], date: string) => Row | undefined = latestRowOnOrBefore

/**
 * Every row dated on or before `date` — every note still outstanding, not just the newest.
 *
 * Coach notes moved off `latestOnOrBefore` (one note replaces the last) to this (every note
 * stands until its own dismiss button removes it) — see `src/components/CoachNotes.tsx`. Nothing
 * else in the chart uses this: a target or a plan value is IN FORCE, one row wins; a note is an
 * editorial aside, and two of them can both still be true.
 */
export const allOnOrBefore: (rows: Row[], date: string) => Row[] = allRowsOnOrBefore

/** Today in the athlete's timezone, not the server's. */
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: plan.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/**
 * How much of the athlete's local day has actually happened, 0–1.
 *
 * energy.csv is a whole-day ledger, which is right for history and wrong for a day in progress:
 * a full 24 hours of RMR rendered at 08:00 reads as "you have already burned 1,781 kcal." Only
 * the clock-driven components (RMR, non-step NEAT) need this — steps, session and food-thermic
 * burn are actual-to-date already.
 *
 * ⚠ **THE RETURN VALUE CANNOT REACH 1.** It maxes at 1439/1440 = 0.99930555…, at 23:59. Anything
 * testing this for "the day is over" is testing something that never happens: `today/page.tsx`
 * guarded a tile branch with `elapsed >= 1` and it never once fired, so the tile said "N% of the
 * day elapsed · full day projects to…" at 23:59 as well as at 06:00 (audit F-55). **Use
 * `DayRoll.inProgress`, which is keyed off the date, to ask whether a day is finished.** The
 * arithmetic and its producible domain live in `src/lib/aggregate.ts` so the reachability check in
 * `scripts/test-aggregations.mjs` can derive the domain rather than assume it.
 */
export function fractionOfDayElapsed(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: plan.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const at = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return dayFraction(at('hour'), at('minute'))
}

/**
 * Athlete-local weekday key for a YYYY-MM-DD, to look up plan.weeklyTemplate — **re-exported, not
 * declared.** The list lived here and in three other files; `scripts/lib/weekdays.mjs` says why
 * that stopped being acceptable. Same arrangement, same reason, as `sessionKey` in forecast.ts.
 */
export const weekdayKey: (iso: string) => string = weekdayKeyOf

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
  return sumValues(rows.map((r) => n(r[key])))
}

export const meanOrNull = meanOfValues

export const fmt = (v: number | null | undefined, digits = 0, suffix = '') =>
  v == null || Number.isNaN(v)
    ? 'TBD'
    : `${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`

/**
 * Least-squares slope over (dayIndex, value). Returns null below `minPoints` — a projection
 * from three readings is noise wearing a confidence interval, and CLAUDE.md §6 is explicit
 * that trend beats point.
 */
export function trend(
  points: { date: string; value: number }[], minPoints = MIN_READINGS_FOR_PROJECTION,
) {
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

// -------------------------------------------------------------------------------------------
// Confounded readings
// -------------------------------------------------------------------------------------------

/**
 * **A measurement a chart itself says is unreliable on a given day, and why.**
 *
 * Some charts track a symptom that moves the very measurement another domain depends on. Bloating
 * distends the waist; a salt-heavy day moves scale weight; a flare moves grip strength. Plotting
 * such a reading inside the trend line states a change the chart does not believe in — and the
 * athlete is the one who ends up reasoning from it.
 *
 * **The rule is per-chart data, never code.** A metric in `athlete/constants.json`'s registry may
 * declare what it confounds:
 *
 *     "bloating_severity": {
 *       "label": "Bloating severity", "unit": "0-3 scale", "direction": "down",
 *       "domain": "Bloating",
 *       "confounds": { "measure": "waist_in", "atOrAbove": 2, "lagDays": 1 }
 *     }
 *
 * `lagDays: 1` means a reading is confounded by a value recorded the day BEFORE — the morning-after
 * case, which is the common one. `lagDays: 0` marks the same day.
 *
 * **A confounded reading is never hidden or dropped.** It is real, it was taken, and removing it
 * would be editing the record to make a trend look better — the exact failure `data/METHOD.md`
 * rule 3 exists to prevent. It is rendered apart from the trend, and said out loud.
 */
export type Confound = {
  measure: string; atOrAbove: number; lagDays?: number
  /**
   * The date the chart ADOPTED this rule. Readings before it are left alone.
   *
   * A confound rule is usually written after the athlete notices the pattern, and applying it
   * backwards re-judges readings the chart has already settled — including, in the case this was
   * written for, the baseline the whole domain is measured against. Absent means "always", which
   * is right for a rule declared at intake.
   */
  from?: string
}

export type ConfoundRule = { metric: string; label: string; domain?: string } & Confound

/** Every confound rule this chart declares, for `measure` — empty on a chart that declares none. */
export function confoundRulesFor(measure: string): ConfoundRule[] {
  return Object.entries(metricsRegistry ?? {})
    .filter(([key]) => !key.startsWith('_'))
    .flatMap(([key, def]) => {
      const c = (def as { confounds?: Confound }).confounds
      if (!c || c.measure !== measure) return []
      return [{
        metric: key,
        label: (def as { label?: string }).label ?? key,
        domain: (def as { domain?: string }).domain,
        measure: c.measure,
        atOrAbove: c.atOrAbove,
        lagDays: c.lagDays ?? 0,
        from: c.from,
      }]
    })
}

/**
 * The dates on which a reading of `measure` is confounded, mapped to the reason.
 *
 * Reads `metrics.csv` for each triggering metric, and shifts by `lagDays` so a severity logged on
 * the 16th flags the morning of the 17th. A day with several triggering readings takes the worst.
 */
export function confoundedDates(measure: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const rule of confoundRulesFor(measure)) {
    for (const row of metrics) {
      if (row.metric !== rule.metric) continue
      const v = Number(row.value)
      if (!Number.isFinite(v) || v < rule.atOrAbove) continue
      const on = rule.lagDays ? addDays(String(row.date), rule.lagDays) : String(row.date)
      if (rule.from && on < rule.from) continue
      out.set(on, `${rule.label} ${v} the ${rule.lagDays ? 'day before' : 'same day'}`)
    }
  }

  // ⚠ **THE COACH'S WRITTEN VERDICT OVERRIDES THE DERIVED ONE, IN BOTH DIRECTIONS — but only
  // when written as a TOKEN, never as prose.**
  //
  // The rule above is arithmetic on a severity score. It cannot know whether a symptom had
  // RESOLVED by the morning of the reading, and that is exactly the question the athlete can
  // answer and the score cannot. So the note gets the last word — via `[confounded]` or
  // `[clean]`, which are the whole convention.
  //
  // **Matching the WORDS was tried first and was wrong on three readings out of twelve.** A note
  // recapping a trend — "28(confounded) → 29(confounded) → 27(clean)" — is about other days, and
  // one reading a coach data-flagged read "this can't be flagged CONFOUNDED under the formal
  // rule", where the sentence means the opposite of the word in it. Prose describes; a token
  // declares. Nothing incidental produces a bracketed token.
  for (const row of body) {
    const note = String(row.note ?? '')
    const date = String(row.date)
    if (!date || String(row[measure] ?? '').trim() === '') continue
    if (/\[clean\]/i.test(note)) out.delete(date)
    else if (/\[confounded\]/i.test(note) && !out.has(date)) {
      out.set(date, 'flagged in the reading\u2019s own note')
    }
  }
  return out
}
