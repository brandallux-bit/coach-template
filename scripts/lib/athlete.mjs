import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { kgFromLb, n, sessionCost } from './aggregate.mjs'
import {
  DEFAULT_MOVEMENT_LEVEL, movementBasis, movementKcal,
} from './movement.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const CHART = join(ROOT, 'athlete', 'constants.json')

/** True once intake has written a chart. False on the pristine template. */
export const hasChart = existsSync(CHART)

/**
 * What every script says when it is asked about an athlete who does not exist yet.
 *
 * Greppable on purpose: `scripts/test-cold-start.mjs` asserts this exact sentence comes back
 * instead of a stack trace, and `scripts/check-all.mjs` skips the chart-dependent steps rather
 * than printing it thirteen times.
 */
export const NO_CHART_MESSAGE =
  'No athlete/constants.json — run intake first (SETUP.md §3). '
  + 'Nothing in scripts/ or src/ may say anything about an athlete until intake has written one.'

/**
 * The chart's constants — or, before intake, a value that throws `NO_CHART_MESSAGE` the moment
 * anybody reads a field off it.
 *
 * ⚠ **THE FALLBACK THIS REPLACES DID NOT EXIST.** Until 2026-08-14 this line read
 * `readFileSync(hasChart ? CHART : TEMPLATE)` against `athlete/constants.template.json`, **a file
 * that is not in this repository** — it exists only on `upstream/main`. So any chart forked from
 * *this* repo died on `readFileSync` in five scripts the moment `constants.json` was absent, with a
 * raw ENOENT naming a file the reader had never heard of. `validate-data.mjs` printed its friendly
 * "template repo with no chart yet" line and the pipeline stack-traced on the very next step
 * (audit F-17).
 *
 * **Why a proxy rather than an eager throw.** Importing this module must stay free: `schema.mjs`,
 * `rowwrite.mjs` and `validate-data.mjs` all import it at module scope, and `validate-data.mjs`'s
 * whole job on a chart-less repo is to exit 0 with an explanation. An eager throw would fire before
 * that early exit could run, which is the same defect one layer up. Reading a field, on the other
 * hand, is a claim that an athlete exists — and that is exactly what must fail, loudly, with a
 * sentence that says what to do (X-7).
 */
export const constants = hasChart
  ? JSON.parse(readFileSync(CHART, 'utf8'))
  : new Proxy({}, {
    // Symbols are how a runtime asks "what kind of thing is this?" — console.log, JSON.stringify,
    // `await`. Those must answer, or the error itself becomes unprintable.
    get: (_, key) => { if (typeof key === 'symbol') return undefined; throw new Error(NO_CHART_MESSAGE) },
    has: () => { throw new Error(NO_CHART_MESSAGE) },
    ownKeys: () => { throw new Error(NO_CHART_MESSAGE) },
  })

/**
 * The athlete's current local date (YYYY-MM-DD), from `athlete.timezone` — never the caller's
 * clock. A coaching session runs on UTC; the athlete does not. Added 2026-08-11 after a snack got
 * written to the wrong day twice (2026-08-08, repeated 2026-08-11) because a session read its own
 * date instead of deriving this. Now the single implementation both validateRow() and
 * validate-data.mjs check every written date against — see data/METHOD.md rule 6.
 */
export function localToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: constants.athlete.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/**
 * Pounds to kilograms. Delegates — the constant lives in `scripts/lib/aggregate.mjs` beside the
 * session formula that also needs it, rather than existing here as a second `2.20462` divisor.
 */
export const kg = kgFromLb

/**
 * Mifflin-St Jeor. The sex term is the whole reason `sex` exists in constants.json:
 * male +5, female −161 — a 166 kcal/day difference that would otherwise be invisible.
 */
const SEX_TERM = { male: 5, female: -161 }

/**
 * Mifflin-St Jeor's published coefficients, named rather than inlined.
 *
 * They are named because `scripts/lib/method-version.mjs` fingerprints them: a change to any one
 * of these changes every historical `rmr_kcal` under the same `method_version`, which is the thing
 * that column exists to prevent (audit F-64). Naming them is what lets a check see them.
 */
export const RMR_COEFFICIENTS = { perKg: 10, perCm: 6.25, perYear: -5, sexTerm: SEX_TERM }

export function rmrKcal(weightLb, onDate) {
  const { sex, heightIn } = constants.athlete
  const term = SEX_TERM[sex]
  if (term === undefined) {
    throw new Error(`athlete.sex must be "male" or "female" for Mifflin-St Jeor, got "${sex}"`)
  }
  const { perKg, perCm, perYear } = RMR_COEFFICIENTS
  return perKg * kg(weightLb) + perCm * (heightIn * 2.54) + perYear * ageOn(onDate) + term
}

/**
 * Thermic effect of food, as a share of intake. Digestion has a real, non-trivial cost, and it
 * falls as intake falls — part of why deficits decay.
 *
 * Here rather than in `compute-energy.mjs` because it is a term in the burn model, and the model's
 * terms have to be reachable by `scripts/lib/method-version.mjs` for the version tripwire to see
 * them. Same for `NEAT_OTHER_RATE`.
 */
export const TEF_RATE = 0.10

/** Non-step movement — standing, fidgeting, carrying things — as a share of RMR. */
export const NEAT_OTHER_RATE = 0.10

/** Derived from dob, never stored — so it cannot go stale mid-block. */
export function ageOn(isoDate) {
  const [by, bm] = constants.athlete.dob.split('-').map(Number)
  const [y, m] = (isoDate ?? new Date().toISOString().slice(0, 10)).split('-').map(Number)
  return y - by - (m < bm ? 1 : 0)
}

/**
 * CLAUDE.md §5: no calorie target below estimated RMR. Computed from the athlete's CURRENT
 * weight rather than frozen at intake, so the floor tracks the athlete down.
 */
export const rmrFloorKcal = (weightLb, onDate) => Math.round(rmrKcal(weightLb, onDate))

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE SESSION-TYPE REGISTRY (audit F-15, F-07, F-70 · INVARIANTS.md X-11)
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **The list of session types is the athlete's, not the system's.** It lives in
 * `athlete/constants.json` under `sessionTypes`, the way `metrics` already does, and everything
 * downstream is derived from it: `scripts/lib/schema.mjs`'s `training.csv` type enum, the MET
 * table, and the set of types that count toward the sessions/week floor.
 *
 * WHAT IT REPLACES, AND WHY IT HAD TO. The enum was `strength | circuit | bjj | peloton | walk |
 * rest | other` — **this athlete's activity list, hardcoded as system code in three files**. A new
 * athlete who runs had exactly one legal value, `other`, which was not in `COUNTS_TOWARD_FLOOR`,
 * so **every session they logged was invisible to the adherence count**: "sessions this week: 0
 * against a floor of 3" for someone training six days a week — and `CLAUDE.md` §7 then routes
 * their coach to behaviour-change counselling. The consequence is a coaching decision, not a
 * display bug.
 *
 * It also closes F-07 on this chart: `rehab` had a MET here, was documented in `data/METHOD.md`,
 * drove ~400 kcal/week of the Next 7 Days forecast, and **could not be written to `training.csv`**
 * because the enum lived somewhere else. Two lists of the same thing in two files is what produced
 * it, so there is now one list.
 *
 * EACH ENTRY NAMES THREE THINGS:
 *   `met`                a whole-session MET, sourced. Per-tier values are separate (below)
 *   `countsTowardFloor`  whether a completed session of this type counts against the floor
 *   `domain`             the `goals.md` domain it serves — CLAUDE.md §1.1: an activity no domain
 *                        needs is a chore the coach invented. `metrics` carries the same field
 *                        for the same reason
 *
 * THE TWO UNIVERSAL TYPES BELOW ARE NOT IN THE REGISTRY, and that is deliberate. They are
 * structural rather than athletic: `rest` records the absence of a session and `other` is the
 * fallback for an activity nobody registered. Neither serves a domain, so requiring one would
 * force every chart to invent an attribution for two rows of bookkeeping. They are always legal
 * and are always appended after the chart's own types, so the enum can never be empty and a
 * mid-intake chart can still record a rest day.
 *
 * ⚠ `other` deliberately does NOT count toward the floor: an unclassified session cannot be graded
 * against a floor whose composition the athlete defined in terms of named activities. The fix for
 * a chart logging real work as `other` is to register the type — which is what
 * `unregistered-session-type` in `scripts/lib/findings.mjs` says, rather than this table guessing.
 */
/** The names of the two structural types, for docs and validation. See below. */
export const UNIVERSAL_TYPES = ['rest', 'other']

const UNIVERSAL_SESSION_TYPES = {
  rest: { met: 0, countsTowardFloor: false, note: 'No session burn.' },
  other: {
    met: 4.0,
    countsTowardFloor: false,
    note: 'Fallback for an activity with no registry entry of its own. Does not count toward the '
      + 'sessions floor — register the type instead.',
  },
}

/**
 * The registry entries this chart wrote, `_`-prefixed documentation keys removed.
 *
 * **Empty before intake, rather than a throw.** A repo with no chart has registered no session
 * types, and that is a fact this function can state — it is not a question it has to refuse. The
 * `constants` proxy throws on field access by design (so nothing can silently read a default
 * athlete), but reaching *through* it here made every downstream caller — `sessionTypes`,
 * `metTable`, `countsTowardFloorSet`, `SPEC`'s `type` enum — throw as well, which is what took
 * `npm run build` down on a fresh fork. Guarding once here beats guarding at each call site.
 */
const chartSessionTypes = () =>
  (hasChart
    ? Object.fromEntries(
      Object.entries(constants.sessionTypes ?? {}).filter(([k]) => !k.startsWith('_')),
    )
    : {})

/**
 * Every legal session type on this chart: the athlete's, then the two universal ones.
 *
 * Order matters only for rendering — `scripts/lib/method-version.mjs` sorts before digesting, so
 * re-ordering the registry cannot churn `method_version`.
 */
export const sessionTypes = () => ({ ...chartSessionTypes(), ...UNIVERSAL_SESSION_TYPES })

/**
 * The legal values of `training.csv`'s `type` column. `scripts/lib/schema.mjs` reads this; nothing
 * else may restate it.
 */
export const sessionTypeEnum = () => Object.keys(sessionTypes())

/**
 * Session types that count against `goals.md`'s sessions/week floor.
 *
 * ⚠ **ONE HOME, and it took two moves to get here** (audit F-70). It was declared identically in
 * `rollup.ts` and `forecast.ts`, mirrored a third time in `test-views.mjs`, and the drift guard
 * regex-parsed `rollup.ts` only. W5 moved it to `src/lib/data.ts` so both view libs imported it;
 * W7 moved it here, because a hardcoded list of one athlete's activities in shared TypeScript was
 * still X-11 whichever file it sat in. The dashboard reads the resolved set out of the bundle.
 */
export const countsTowardFloorSet = () => new Set(
  Object.entries(sessionTypes()).filter(([, t]) => t.countsTowardFloor === true).map(([k]) => k),
)

/**
 * Session types that DO NOT tire the athlete out — the ones that break a consecutive-loading
 * streak rather than extending it.
 *
 * ⚠ **THIS IS A THIRD QUESTION, AND THE TWO OBVIOUS SHORTCUTS BOTH ANSWER A DIFFERENT ONE.**
 *
 *   `countsTowardFloor`  — *does this earn credit against the sessions/week floor?*
 *   `met > 0`            — *does this burn calories?*
 *   `loading`            — *did this tire you out?*
 *
 * They come apart on real registries. A rehab block can carry a real MET and genuine fatigue while
 * deliberately earning no floor credit, so the floor set would call it non-loading and undercount
 * a streak. And a walking type priced at a real MET — which is correct on a chart with no step
 * feed, where nothing else counts that movement — would be called LOADING by the MET test, so a
 * week of walks would read as a week without a rest day.
 *
 * So the registry answers it explicitly. `skills/intake` writes the flag, defaulting it so nobody
 * is asked twice, and a chart may override it — which is the case the default cannot get right on
 * its own. **The default is stated in one place, `isLoadingType` below**; the intake step and
 * `constants.template.json` describe it in the same words. A first draft of this paragraph said
 * `energyCountedIn !== 'steps'` while the code tested for its absence and the template said a
 * third thing — three statements of one rule, in one commit, which is the defect this file spends
 * most of its length preventing.
 *
 * Resolved over `sessionTypes()` rather than the raw registry, so the two universal types are
 * included with their own MET. **An unregistered type is loading**: `other` is the fallback for
 * real work nobody has classified, and treating an unknown session as rest would silently shorten
 * every streak that contained one.
 */
export const isLoadingType = (def) => {
  // ⚠ **AN UNREGISTERED TYPE IS LOADING, AND THE PREDICATE HAS TO SAY SO TOO.** The SET below
  // delivers that by omission — an unknown key is simply absent from it — but a caller reaching
  // for `isLoadingType(registry[type])` on a type the registry does not hold got `undefined`, and
  // the old body answered "not loading". That is the over-fresh answer three lines of docstring
  // call the worse failure, returned by the function the docstring is attached to.
  if (!def) return true
  if (def.loading !== undefined) return def.loading === true
  // The default, and the one `skills/intake` writes the flag from. `energyCountedIn` is checked
  // for CONTENT, not for presence: intake writing `""` as a "none" placeholder would otherwise
  // turn a MET-7 session into a rest day, and `validate-data`'s `energyCountedIn ⇒ met === 0`
  // rule cannot catch it either, because `''` is falsy and that rule is gated on truthiness.
  return Number(def.met) > 0 && !String(def.energyCountedIn ?? '').trim()
}

export const nonLoadingTypeSet = () => new Set(
  Object.entries(sessionTypes()).filter(([, t]) => !isLoadingType(t)).map(([k]) => k),
)

/**
 * The MET table as documentation: value plus what it is, in registry order.
 *
 * ⚠ **The notes are the CHART's, not this file's, and that is the fix rather than an oversight.**
 * They used to live here in a `MET_NOTES` map carrying a comment reading *"Keep these notes
 * GENERIC … nothing here may name this athlete's sessions, sports or injuries (X-11)"* — five lines
 * above `bjj: 'Grappling …'`. A one-line description of an activity is unavoidably about that
 * activity, so the note belongs beside the activity, in the chart that registered it.
 */
export const metTableDoc = () =>
  Object.entries(sessionTypes()).map(([type, t]) => ({ type, met: t.met, note: t.note ?? '' }))

/**
 * The per-tier tables as documentation: the value and the citation, both from the registry entry.
 *
 * The citation is a sibling `_tier_sources` key rather than a second table, so a tier's value and
 * the compendium line it came from cannot end up describing different things.
 */
export const metByIntensityDoc = () =>
  Object.entries(sessionTypes()).flatMap(([type, t]) =>
    Object.entries(t.metByIntensity ?? {}).map(([tier, met]) => {
      const [code, ...rest] = String(t._tier_sources?.[tier] ?? '').split(' — ')
      return { type, tier, met, code: rest.length ? code : '', label: rest.join(' — ') }
    }))

/**
 * The resolved flat MET table, keyed by session type.
 *
 * Exported so the dashboard's forward-looking views read the SAME numbers `compute-energy.mjs`
 * uses for history, rather than keeping a second copy in TypeScript. Two copies of a number is
 * the defect this repo has already hit three times (data/METHOD.md rule 1).
 *
 * Was `DEFAULT_MET` spread over `constants.metOverrides`, which is retired: an override map beside
 * a hardcoded default is two homes for one number, and the registry is the one home.
 */
export const metTable = () =>
  Object.fromEntries(Object.entries(sessionTypes()).map(([type, t]) => [type, t.met]))

export const metFor = (type) => metTable()[type] ?? UNIVERSAL_SESSION_TYPES.other.met

/** kcal per step per lb of bodyweight. ~0.045 kcal/step at 181 lb, i.e. ~100 kcal/mile. */
export const KCAL_PER_STEP_PER_LB = 0.00025

/**
 * Rest between working sets, in seconds, for reconstructing the duration of a session that was
 * performed but not timed. See `scripts/lib/session-duration.mjs` for where it is used.
 *
 * ⚠ **70 IS A DEFAULT THE COACH PROPOSED, NOT A FIGURE ANY ATHLETE GAVE**, and `skills/intake`
 * asks whether to change it. Until somebody answers, a chart's provenance for it reads
 * `coach-proposed-unconfirmed` — visible and waiting, rather than silently filed as the athlete's.
 * A chart that answers writes `program.setRestSec`, and that wins.
 *
 * It sits here, beside the rest of the burn model, rather than in `session-duration.mjs`, for the
 * reason every other constant in this file does: one home, and a change to it is a change to the
 * model. The work-per-set half of the same estimate is deliberately NOT a constant —
 * `impliedSetWorkSec` derives it from the sessions the athlete has actually timed, so it tracks
 * them instead of being a second coach-supplied number filed as theirs.
 */
export const SET_REST_SEC = 70

/**
 * ⚠ **WHETHER ANYTHING AUTOMATIC COUNTS THIS ATHLETE'S MOVEMENT, AND WHICH THING.**
 *
 * A NAME, NOT A BOOLEAN, and that is the seam. `data/steps.csv` happens to be written today by an
 * iOS Shortcut off Apple Health; an Oura or a Fitbit writer added later is a new VALUE here, not a
 * new branch through every consumer. A chart with no feed leaves the key absent or empty, which is
 * the majority configuration and is not a lesser one.
 *
 * Everything that assumes a step feed is gated on this: the daily gap check, the stale-feed
 * finding, the forward view's movement term, and `energy.csv`'s movement column.
 */
export const stepFeed = () => (hasChart ? String(constants.plan?.stepFeed ?? '').trim() : '')

export const hasStepFeed = () => stepFeed() !== ''

/**
 * The movement-outside-exercise level in force on this chart: its own, or the shipped default.
 *
 * ⚠ **ONLY MEANINGFUL WITHOUT A FEED.** With a feed, the athlete's real movement is counted, and
 * pricing a described level on top of it would count the same walking twice. `movementKcalFor`
 * below is where that exclusivity is enforced, once, rather than at each caller.
 */
export const movementLevelKey = () => (
  hasChart
    ? String(constants.plan?.movementOutsideExerciseLevel ?? '').trim() || DEFAULT_MOVEMENT_LEVEL
    : DEFAULT_MOVEMENT_LEVEL
)

/**
 * This chart's incidental-movement term in kcal/day, or `null` where a feed already counts it.
 *
 * ⚠ **THE TWO CONFIGURATIONS ARE MUTUALLY EXCLUSIVE AND THIS IS THE ONE PLACE THAT SAYS SO.**
 * A chart with a feed gets `null` here and its movement arrives as `steps_kcal`; a chart without
 * one gets a figure here and `steps_kcal` stays blank forever. Both fill the same slot in the
 * decomposition, exactly one of them is ever non-blank, and `missingBurnComponents` reads that
 * pair rather than the declaration — so no consumer has to know which configuration it is in.
 */
export const movementKcalFor = (weightLb) => (
  hasStepFeed() ? null : movementKcal(movementLevelKey(), weightLb, KCAL_PER_STEP_PER_LB)
)

/** The same figure's derivation, for the surfaces that may never print a bare total. */
export const movementBasisFor = (weightLb) => (
  hasStepFeed()
    ? `counted in the step feed (${stepFeed()}) rather than estimated`
    : movementBasis(movementLevelKey(), weightLb, KCAL_PER_STEP_PER_LB)
)

/** The rest figure in force on this chart: its own, or the shipped default. One home, one answer. */
export const setRestSec = () => (hasChart ? n(constants.program?.setRestSec) ?? SET_REST_SEC : SET_REST_SEC)

/**
 * The conventional energy density of a pound of body fat, for converting between a calorie
 * deficit and a rate of weight loss.
 *
 * It lives here rather than being typed into whichever file needs it, because data/METHOD.md
 * already uses it in the 2026-08-27 recalibration method (`Δweight_lb × 3,500 ≈ Σ deficit_kcal`)
 * and `src/app/history/page.tsx` already computes a planned weekly deficit off the same idea.
 * A second literal 3500 somewhere else is X-8 (a number with two homes), which is the largest
 * defect class in this repo's own audit.
 *
 * It is a modelling constant, not a measurement and not anything the athlete chose: it is the
 * standard figure the whole field uses, accurate enough for "is the plan aimed at the goal" and
 * not accurate enough to argue about a tenth of a pound with.
 */
export const KCAL_PER_LB_FAT = 3500

/**
 * Per-tier MET, for a session logged with `light_min`/`moderate_min`/`hard_min` instead of one flat
 * `duration_min` (data/METHOD.md). A flat MET over the whole session assumes uniform intensity,
 * which overestimates any session that was not uniformly at its hardest.
 *
 * Falls back to the type's flat MET for any tier the chart has not sourced a value for, so logging
 * a split for a type with no table is harmless — the same result as `duration_min` alone — rather
 * than wrong.
 */
export const metForIntensity = (type, tier) =>
  sessionTypes()[type]?.metByIntensity?.[tier] ?? metFor(type)

/** The per-tier tables, for views that project a session logged with an intensity split. */
export const metByIntensityTable = () => Object.fromEntries(
  Object.entries(sessionTypes())
    .filter(([, t]) => t.metByIntensity)
    .map(([type, t]) => [type, t.metByIntensity]),
)

/**
 * This chart's MET resolver, in the shape `sessionCost` takes: a tier when the row carries an
 * intensity split, `null` for the flat lookup.
 */
export const chartMetOf = (type, tier) => (tier ? metForIntensity(type, tier) : metFor(type))

/**
 * What one `training.csv` row cost, on this chart's MET tables.
 *
 * The precedence itself lives in `scripts/lib/aggregate.mjs` (`sessionCost`) so the property suite
 * runs the same code the ledger and the dashboard run. This is the thin binding that supplies the
 * tables — nothing decided here, so there is nothing here to drift.
 *
 * `scripts/compute-energy.mjs` (the ledger) and `scripts/build-data-json.mjs` (the per-session
 * figure the dashboard renders) both call this, which is what makes the two agree. They disagreed
 * by 554 kcal on 2026-08-10 for exactly as long as they did not. See `sessionCost`.
 */
export const sessionCostFor = (row, weightLb) => sessionCost(row, weightLb, chartMetOf)

/**
 * The duration this chart already declares for a session type, when the row itself carries none.
 *
 * Rung 4 of `scripts/lib/session-duration.mjs`, kept here because it is the only rung that reads a
 * chart figure and that module deliberately owns no athlete numbers.
 *
 * ⚠ **IT ASKS THE REGISTRY, NOT A HARD-CODED TYPE NAME.** The prototype read
 * `row.type === 'rehab' ? program.dailyRehabMin : null` — one athlete's activity, named in shared
 * code, which is X-11 exactly. Any chart may instead declare
 * `sessionTypes.<type>.standingDurationMin` for an activity that always runs the same length: a
 * daily mobility block, a fixed-length class, a commute ride. Reading it on the LEDGER side as well
 * as the forward view is not a new estimate — it is the same one home finally read by both, so the
 * forecast and the ledger stop disagreeing about a session that runs every day.
 *
 * ⚠ **THROUGH `sessionTypes()`, NEVER THROUGH THE `constants` PROXY.** That proxy throws on any
 * field access when there is no chart, and both callers of this import it at module scope — which
 * is what took `npm run build` down on a fresh fork before. `sessionTypes()` guards once, returns
 * the two universal types on a chart-less repo, and cannot throw.
 *
 * Null for a type with no standing duration, which falls through to the set-count rung. That is
 * correct: most session types genuinely do not have one.
 */
export const prescribedSessionMin = (row) => n(sessionTypes()[row?.type]?.standingDurationMin)

/** Strips the `_comment` / `_note` documentation keys before the values reach the app. */
export function stripNotes(obj) {
  if (Array.isArray(obj)) return obj
  if (obj === null || typeof obj !== 'object') return obj
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([k]) => !k.startsWith('_'))
      .map(([k, v]) => [k, stripNotes(v)]),
  )
}
