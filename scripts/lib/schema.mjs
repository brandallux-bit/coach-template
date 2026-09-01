/**
 * The shape of every file in data/, in ONE place.
 *
 * Imported by scripts/validate-data.mjs (CI) and by the dashboard's write path
 * (src/lib/log-write.ts, via scripts/lib/rowwrite.mjs). A second copy of these rules would drift,
 * and the two consumers disagreeing means either CI rejects a row the form accepted, or — far
 * worse — a form writes a row CI later rejects, which breaks the build for a number the athlete
 * already believes is saved.
 *
 * Extracted from validate-data.mjs 2026-08-11 when the dashboard gained write forms.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * `records` — WHAT A ROW IN THIS FILE IS. Read this before adding a file (audit F-23)
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Every entry declares one of three things, and `scripts/lib/rowwrite.mjs`'s `futureRowRejection`
 * decides from it alone:
 *
 *   `measurement`      an observation of something that happened. A future date is a clock bug,
 *                      always — data/METHOD.md rule 6, and it has fired twice
 *   `prescription`     something decided for a day that has not happened. A future date is the
 *                      normal case
 *   `plan-or-outcome`  both, distinguished by a column. Needs `plannedStatus` and `outcomeFields`
 *
 * **Why this replaced a filename.** The rule used to read `if (file !== 'training.csv') reject`,
 * which is a list of one masquerading as a principle. `targets.csv` is prescribed by exactly the
 * same argument a planned training row is, so **travel targets could not be written ahead** — and
 * the athlete's own #1 documented streak-ender is travel. The remedy was a coaching session every
 * morning of a trip. Modelling the distinction here rather than naming files means the next
 * prescribed file gets it right by declaring what it is.
 *
 * `derived` files (`energy.csv`) declare `measurement`: they are computed from measurements and
 * `compute-energy.mjs` independently skips dates after athlete-local today.
 */
// `athlete.mjs` does not import this module, so there is no cycle — and importing it is free:
// its `constants` export only touches the filesystem when a field is actually read.
import { sessionTypeEnum } from './athlete.mjs'

/**
 * The values `sessionTypes.<type>.energyCountedIn` may take — i.e. the columns whose data already
 * contains a session type's energy, so pricing it again as a session would count it twice.
 *
 * ⚠ **A CLOSED SET, BECAUSE THE RULES KEYED OFF IT MATCH A LITERAL.** `validate-data.mjs` rejects
 * `energyCountedIn: "steps"` on a chart with no step feed — that promises the energy to a column
 * nothing will ever write, so the activity is counted nowhere. Written `"step count"`, or
 * `"Steps"`, or anything else, the rule does not fire, `met` is still forced to 0 by the
 * double-count rule, and the session costs nothing on a chart that has nothing else counting it.
 * One typo, and the exact harm the rule is named after, silently.
 *
 * It has one member today. That is the point: a value nothing reads is not a value.
 */
export const ENERGY_COUNTED_IN = ['steps']

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * `training.csv`'s enums. `type` is **this chart's** session-type registry, not a system list.
 *
 * ⚠ `type` IS A GETTER, NOT A VALUE, and that is load-bearing. `validate-data.mjs` imports this
 * module at top level and its whole job on a chart-less repo is to exit 0 with an explanation;
 * resolving the registry eagerly would read `athlete/constants.json` at import time and throw
 * before that early exit could run — the same defect one layer up. The getter fires only when a
 * row is actually validated, which never happens without a chart. It is enumerable, so
 * `Object.entries(spec.enums)` sees it exactly like a plain key.
 *
 * Why the list cannot live here: `sessionTypes` in `scripts/lib/athlete.mjs` (audit F-15, F-07,
 * F-70).
 */
const trainingEnums = {
  get type() { return sessionTypeEnum() },
  status: ['planned', 'completed', 'skipped', 'rest'],
  pain_flag: ['y', 'n'],
}

/**
 * The bundle fields `Plan` in `src/lib/data.ts` declares as required — the ones every page reads
 * without a guard — and which of them may legitimately be null.
 *
 * ⚠ **NOTHING ENFORCED THIS UNTIL 2026-08-17, and the way it failed is instructive.** The
 * dashboard cast the generated JSON slice by slice (`bundle.plan as Plan`). That looks like type
 * safety and is not: TypeScript infers the literal type of whatever artifact is on disk, so each
 * cast only ever compared the file to itself. `JSON.stringify` drops `undefined` keys silently, so
 * a `constants.json` that lost `athlete.name` would emit a bundle with no `name`, TypeScript would
 * infer the narrower shape, every cast would still pass, and a page would render `undefined`.
 *
 * `age` and `rmrFloorKcal` are nullable because they are DERIVED and their inputs can be absent —
 * a chart with no baseline date has no age to compute, and `null` says so. The rest are copied
 * straight out of `athlete/constants.json`, where `validate-data.mjs` already requires them.
 *
 * Lives here rather than in `build-data-json.mjs` so it can be tested: a check with no test that
 * fails against its own defect certifies whatever happens next (INVARIANTS.md X-10).
 */
export const REQUIRED_PLAN_FIELDS = [
  'name', 'pronouns', 'timezone', 'heightIn', 'age', 'baselineDate', 'baselineWeightLb',
  'rmrFloorKcal', 'estMaintenanceKcal', 'proteinFloorG', 'events',
]

const NULLABLE_PLAN_FIELDS = new Set(['age', 'rmrFloorKcal'])

/** Which required fields a built `plan` would ship without. Empty means the contract holds. */
export function missingPlanFields(plan) {
  return REQUIRED_PLAN_FIELDS.filter((k) => {
    const v = plan?.[k]
    if (v === undefined) return true
    return v === null && !NULLABLE_PLAN_FIELDS.has(k)
  })
}

export const SPEC = {
  'body.csv': {
    records: 'measurement',
    header: ['date', 'weight_lb', 'waist_in', 'neck_in', 'sleep_h', 'sleep_quality',
      'resting_hr_overnight', 'energy', 'hunger', 'mood', 'note'],
    uniqueDate: true,
    numeric: ['weight_lb', 'waist_in', 'neck_in', 'sleep_h', 'sleep_quality',
      'resting_hr_overnight', 'energy', 'hunger', 'mood'],
    ranges: { weight_lb: [100, 400], waist_in: [20, 60], neck_in: [10, 25], sleep_h: [0, 16],
      sleep_quality: [1, 5], resting_hr_overnight: [30, 120], energy: [1, 5], hunger: [1, 5],
      mood: [1, 5] },
  },
  'steps.csv': {
    records: 'measurement',
    header: ['date', 'steps'],
    uniqueDate: true,
    numeric: ['steps'],
    ranges: { steps: [0, 100000] },
  },
  // Prescribed, not measured — so a trip's targets can be written before the trip. See `records`
  // in this file's header, and audit F-23: the athlete's own #1 documented streak-ender is travel,
  // and until 2026-08-14 the only way to have correct targets on a trip was a coaching session
  // every morning of it.
  'targets.csv': {
    records: 'prescription',
    header: ['date', 'kcal', 'protein_g', 'fat_g', 'fibre_g', 'alcohol_kcal', 'note'],
    uniqueDate: true,
    numeric: ['kcal', 'protein_g', 'fat_g', 'fibre_g', 'alcohol_kcal'],
    ranges: { kcal: [1000, 5000], protein_g: [0, 400], fat_g: [0, 200], fibre_g: [0, 100] },
  },
  'meals.csv': {
    records: 'measurement',
    header: ['date', 'time', 'item', 'kcal', 'protein_g', 'fat_g', 'carb_g', 'fibre_g',
      'alcohol_kcal', 'confidence', 'note'],
    numeric: ['kcal', 'protein_g', 'fat_g', 'carb_g', 'fibre_g', 'alcohol_kcal'],
    enums: { confidence: ['label', 'weighed', 'photo', 'estimate', 'athlete'] },
    ranges: { kcal: [0, 5000], protein_g: [0, 300], fat_g: [0, 300], carb_g: [0, 600], fibre_g: [0, 100] },
    required: ['item', 'kcal', 'confidence'],
    // A WARNING, never an error (audit F-21). Two identical rows are usually a double submit — a
    // duplicated 600-kcal dinner moves the day's deficit by 600 with validator, write path and CI
    // all green — but they are sometimes true: the same protein bar twice, both logged at the same
    // rounded time. `data/` records what happened; deciding which it was is a look, not a block.
    uniqueKey: ['date', 'time', 'item'],
  },
  'training.csv': {
    // Both, and the column that says which is `status`. A planned row describes a day that has not
    // happened, which is what a schedule is for; a completed one records what did.
    records: 'plan-or-outcome',
    plannedStatus: 'planned',
    // Columns that record what ACTUALLY happened. A row about a future day may not carry any of
    // them — if it does, the date is a clock bug wearing a schedule's clothes.
    outcomeFields: ['rpe', 'pain_flag', 'kcal_override', 'light_min', 'moderate_min', 'hard_min'],
    header: ['date', 'type', 'session', 'status', 'rpe', 'duration_min', 'pain_flag', 'note',
      'kcal_override', 'light_min', 'moderate_min', 'hard_min'],
    numeric: ['rpe', 'duration_min', 'kcal_override', 'light_min', 'moderate_min', 'hard_min'],
    enums: trainingEnums,
    ranges: { rpe: [1, 10], duration_min: [0, 480], kcal_override: [0, 3000],
      light_min: [0, 480], moderate_min: [0, 480], hard_min: [0, 480] },
    required: ['type', 'session', 'status'],
  },
  'sets.csv': {
    records: 'measurement',
    header: ['date', 'session', 'exercise', 'set_index', 'load_lb', 'reps', 'duration_s', 'rir', 'note'],
    numeric: ['set_index', 'load_lb', 'reps', 'duration_s', 'rir'],
    ranges: { set_index: [1, 30], load_lb: [0, 500], reps: [0, 500], duration_s: [0, 3600], rir: [0, 10] },
    required: ['exercise', 'set_index'],
  },
  // Effective-dated, not day-specific: a row's date is when that prescription took effect, and
  // it applies to every later occurrence of `session` until a newer set for the same session
  // supersedes it. Before 2026-08-11 these were pinned to a single date, which meant the Today
  // tab could only show a workout on days a coaching session had hand-retyped all seven rows.
  'prescriptions.csv': {
    records: 'prescription',
    header: ['date', 'session', 'order', 'exercise', 'sets', 'reps', 'load', 'note'],
    numeric: ['order', 'sets'],
    ranges: { order: [1, 40], sets: [1, 20] },
    required: ['session', 'order', 'exercise'],
  },
  // A measurement: it records what the coach said, on the day they said it. `allOnOrBefore` then
  // shows every row still on file as its own dismissible box (src/components/CoachNotes.tsx) until
  // the athlete clicks it away — at which point `removeRow` deletes it from this file outright, no
  // history kept. That deletion is the one write in this repo that isn't append-only (data/METHOD.md
  // rule 2), because a coach note is editorial rather than a fact about what happened.
  'coach-notes.csv': {
    records: 'measurement',
    header: ['date', 'headline', 'note'],
    uniqueDate: true,
    required: ['headline'],
  },
  // Long format, on purpose: anything the fixed columns of body.csv don't cover goes here
  // without a schema change, so a new athlete never needs code edited to track a new thing.
  'metrics.csv': {
    records: 'measurement',
    header: ['date', 'metric', 'value', 'unit', 'note'],
    required: ['metric', 'value'],
  },
  /**
   * The derived daily energy ledger. **Generated by `scripts/compute-energy.mjs`, never written by
   * hand** — and it was the only file in `data/` with no schema entry at all (audit F-72).
   *
   * Nothing checked that the generator's header still matched the one `data/METHOD.md` and
   * `docs/modules/data-layer/REQUIREMENTS.md` declare as a MUST, and `data/METHOD.md` reads as
   * though `SPEC` covers every file. Generated files are exactly where a silent header change is
   * plausible: the writer and the reader are the same commit, so nothing disagrees until a
   * consumer written months later does.
   *
   * `complete` is `y`/`n` rather than numeric: it is a claim about whether every input existed,
   * and the difference between "no steps row" and "0 steps" is the whole of X-1.
   */
  'energy.csv': {
    records: 'measurement',
    // `session_estimated` — 'y' where any of the day's session costs came from a RECONSTRUCTED
    // duration rather than a recorded one. It is not `complete`'s job: complete asks whether every
    // input the chart has is present, and a reconstruction is present. This asks whether the figure
    // was measured, which is what `observedDailyBurn`'s mean has to be able to declare.
    // `incidental_kcal` — the movement term for a chart with NO wearable feed, priced from the
    // level the athlete described (scripts/lib/movement.mjs). It and `steps_kcal` are alternative
    // fillings of ONE slot in the decomposition: exactly one of the two is non-blank on a
    // well-formed row, and which one is a property of the chart, not of the day.
    header: ['date', 'rmr_kcal', 'tef_kcal', 'neat_other_kcal', 'steps_kcal', 'incidental_kcal',
      'session_kcal', 'burn_total_kcal', 'intake_kcal', 'deficit_kcal', 'complete',
      'session_estimated', 'method_version'],
    uniqueDate: true,
    numeric: ['rmr_kcal', 'tef_kcal', 'neat_other_kcal', 'steps_kcal', 'incidental_kcal',
      'session_kcal', 'burn_total_kcal', 'intake_kcal', 'deficit_kcal', 'method_version'],
    enums: { complete: ['y', 'n'], session_estimated: ['y', 'n'] },
    ranges: { rmr_kcal: [0, 6000], tef_kcal: [0, 2000], neat_other_kcal: [0, 2000],
      steps_kcal: [0, 5000],
      // Its twin in the same slot, same units. Left unbounded, a corrupted figure passed
      // validation while every other kcal column in this row was checked.
      incidental_kcal: [0, 5000], session_kcal: [0, 5000], burn_total_kcal: [0, 12000],
      intake_kcal: [0, 15000], deficit_kcal: [-10000, 10000], method_version: [1, 999] },
    required: ['method_version'],
  },
}

