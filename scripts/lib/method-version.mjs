/**
 * `energy.csv`'s `method_version`, and the tripwire that makes it mean something.
 *
 * WHAT THE COLUMN IS FOR, in its own words: *"so historical rows stay interpretable."* A row
 * stamped `1` is a promise that it was computed under a named set of model constants, so a reader
 * three months from now can tell a real change in expenditure from a change in the model.
 *
 * WHY THIS FILE EXISTS (audit F-64). Every row in `energy.csv` claims version 1 — including rows
 * produced under `bjj: 10.0`, rows produced after it became `10.3`, and rows produced after
 * `rehab: 3.0` was added and after `peloton` gained a per-tier table. The column's promise has
 * been false since the first MET correction, and nothing anywhere could notice.
 *
 * ⚠ **THE VERSION STAYS AN INTEGER, DELIBERATELY.** The audit's own recommendation was to derive
 * it from a hash of the model constants "so it cannot be forgotten". That trades *stale* for
 * *unreadable*: `method_version: a3f19c…` on every row defeats the exact purpose the column was
 * given, and it churns on constants that do not affect the model. See
 * `docs/audit/TRIAGE-2026-08-13.md` D2. The integer stays; a **digest is used as a tripwire only**,
 * never as the value written to a row.
 *
 * WHY A DIGEST RATHER THAN A SNAPSHOT OF THE VALUES. A recorded copy of the MET table beside the
 * version would be a second home for the MET table, which is the very invariant this workstream
 * exists to enforce (X-8). A one-way digest cannot be read as values, cannot be edited into
 * agreement with a wrong table, and cannot drift — it can only be re-recorded, which is the
 * deliberate act the check is asking for. `modelInputsJson()` prints the current canonical inputs
 * when the check fires, so the maintainer sees exactly what changed by diffing that output against
 * `git show HEAD:scripts/lib/method-version.mjs`.
 *
 * TO CHANGE THE MODEL: change the constant, run `node scripts/test-single-home.mjs`, read the
 * canonical inputs it prints, bump `METHOD_VERSION`, paste the new digest, and record the change
 * in `decisions.md`. Historical rows keep their old integer and stay interpretable, which is the
 * whole point.
 */
import { createHash } from 'node:crypto'
import { sessionCost, sessionKcal } from './aggregate.mjs'
import {
  KCAL_PER_STEP_PER_LB, NEAT_OTHER_RATE, RMR_COEFFICIENTS, TEF_RATE, rmrKcal,
} from './athlete.mjs'
import { MOVEMENT_LEVELS } from './movement.mjs'

/**
 * The version stamped on every `energy.csv` row computed by the current model.
 *
 * ⚠ **ON A TEMPLATE THIS NUMBER MEANS "THE FIRST MODEL A CHART EVER RAN", AND IT MUST STAY 1.**
 * A version's whole job is to keep OLD rows interpretable when the model moves under them. This
 * repo has no rows, so bumping it here stamps nothing and costs nothing — it just ships every
 * future chart a `2` that never had a `1`, with no `decisions.md` entry behind it and nothing for
 * a coach to compare against. A fork's first row is version 1 and its history starts there.
 *
 * A chart bumps it when ITS model changes. The template bumps it only if the model a fresh chart
 * starts on changes, which is a different and much rarer event.
 */
export const METHOD_VERSION = 1

/**
 * The digest of the model inputs `METHOD_VERSION` was last recorded against.
 *
 * Recorded against Mifflin-St Jeor's coefficients, `TEF_RATE`, `NEAT_OTHER_RATE`,
 * `KCAL_PER_STEP_PER_LB`, the movement level table, and the source shape of `rmrKcal`,
 * `sessionKcal` and `sessionCost`. Deliberately no figures in this sentence: a prose copy beside
 * the digest would be the second home the digest exists to make unnecessary. `modelInputsJson()`
 * prints the current inputs when the check fires.
 *
 * Re-recorded when the movement term gained its second filling — a described level for a chart
 * with no wearable feed. **`METHOD_VERSION` is NOT bumped, and here that is a decision rather than
 * an oversight.** The model genuinely changed, which on a chart with rows would be exactly what a
 * version bump is for. This repo has no rows: see the ⚠ on `METHOD_VERSION` above. A fork's first
 * row is version 1 whatever the model was on the day it forked, so a 2 here would ship every chart
 * a version whose 1 never existed.
 *
 * ⚠ **A CHART ADOPTING THIS CHANGE OWES ITS OWN BUMP.** An existing chart that overlays this code
 * has every historical row re-costed — with a feed nothing moves, without one every day gains the
 * movement term. That chart's rows are real, so it bumps its own `METHOD_VERSION`, re-records this
 * digest and writes the change into `decisions.md`, per the procedure at the top of this file.
 * `SETUP.md`'s "Pulling template improvements later" says the same thing in the place a maintainer
 * actually reads.
 */
export const METHOD_DIGEST = '1f4dba82c0f4c69b760d82b9adb12cc89bfb1ecd22c18b60bb36946386147efb'

/**
 * Every constant that changes what a burn figure means, canonically ordered.
 *
 * Anything whose change would make two rows stamped with the same version incomparable belongs
 * here. Anything that does not — a target, a trigger, a threshold, the athlete's own weight —
 * deliberately does not: those move constantly and a version that churned on them would be noise,
 * which is half of why the hash proposal was rejected.
 *
 * ⚠ **`SET_REST_SEC` IS DELIBERATELY ABSENT, AND WHAT THAT COSTS IS STATED RATHER THAN GLOSSED.**
 * It changes what a reconstructed duration is, so on the rule above it looks like it belongs. It
 * cannot be here, for the same reason the MET tables left: a chart may set `program.setRestSec`,
 * and a chart-configurable value inside a digest that ships as a code literal gives two bad
 * outcomes and no good one — either the digest is taken over the literal and lies about every
 * chart that changed it, or it is taken over the chart's value and every fork that changes it goes
 * red on day one for making a legal edit.
 *
 * **What is lost, plainly:** a chart that changes `setRestSec` mid-history revalues every
 * reconstructed row under an UNCHANGED `method_version`, so two rows stamped `1` may have been
 * costed with different rest assumptions and nothing in the file says so. That is a real hole. It
 * is bounded — the figure only reaches rows the resolver had to reconstruct, and every one of
 * those already declares itself an estimate through `durationLevel` — and the remedy when a chart
 * does change it is the same as for any model change: record it in `decisions.md` on the day, and
 * re-run `compute-energy.mjs` so the whole ledger is costed one way.
 */
export function modelInputs() {
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)))
  return {
    // ⚠ **THE MET TABLES ARE DELIBERATELY NOT HERE ANY MORE (W7), and this is a real trade-off.**
    //
    // They used to be, and W5 recorded the digest against them — correctly, at the time: the MET
    // table lived in `scripts/lib/athlete.mjs` and was model code, so `bjj: 10.0 → 10.3` silently
    // re-valuing every historical row under an unchanged `method_version` was exactly F-64.
    //
    // W7 moved the table into `athlete/constants.json`'s session-type registry, because a
    // hardcoded activity list is one athlete's chart wearing the system's clothes (X-11). It is
    // now DATA, and data cannot be in a digest that ships in code: every chart registers different
    // activities, so a fresh chart would fail this check on day one for the crime of not
    // grappling. Verified — that is precisely how `scripts/test-cold-start.mjs` found it.
    //
    // **What is lost, stated plainly:** a MET change no longer fails a build by itself. What
    // catches it instead is the `energy.csv` staleness gate in `scripts/check-all.mjs` —
    // `compute-energy.mjs` re-runs, every affected row moves, and the diff is in the same commit,
    // where a reviewer sees the re-valuation directly rather than inferring it from a hash. Per
    // `CLAUDE.md` §0.3 that change also owes a `decisions.md` entry. The digest keeps what only it
    // can see: the MODEL — coefficients, rates, and the shape of the functions over them.
    rmr: {
      perKg: RMR_COEFFICIENTS.perKg,
      perCm: RMR_COEFFICIENTS.perCm,
      perYear: RMR_COEFFICIENTS.perYear,
      sexTerm: sorted(RMR_COEFFICIENTS.sexTerm),
    },
    tefRate: TEF_RATE,
    neatOtherRate: NEAT_OTHER_RATE,
    kcalPerStepPerLb: KCAL_PER_STEP_PER_LB,
    // ⚠ **THE LEVEL TABLE IS MODEL CODE; THE CHART'S CHOSEN LEVEL IS NOT.** Changing a
    // step-equivalent here revalues the movement term of every day on every chart with no wearable
    // feed, which is precisely what this digest exists to refuse to let happen quietly. The
    // athlete's ANSWER — `plan.movementOutsideExerciseLevel` — is chart data and stays out, for the
    // same reason `SET_REST_SEC` does and with the same cost, stated in the ⚠ above it.
    movementLevels: MOVEMENT_LEVELS.map((l) => [l.key, l.stepEquivalent]),
    // ⚠ THE FORMULAE THEMSELVES, AS SOURCE — not a description of them.
    //
    // A change to `MET × 3.5 × kg / 200 × minutes`, or to the precedence over it, is invisible to a
    // constants-only digest and is the most consequential change there is. The first version of
    // this file carried the formula as a hand-written STRING, which is a second home for it: the
    // string could go stale against the function beside it and nothing would notice, which is the
    // very defect `method_version` exists to prevent, one level up. `scripts/test-single-home.mjs`
    // caught it.
    //
    // Comments and whitespace are stripped so re-wording a docstring does not churn the digest.
    // A digest that fires on noise is one somebody eventually re-records without reading.
    formulae: [rmrKcal, sessionKcal, sessionCost].map(shape),
  }
}

/** A function's source with comments and whitespace removed — its shape, not its prose. */
const shape = (fn) => fn.toString()
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')
  .replace(/\s+/g, ' ')
  .trim()

/** The canonical text the digest is taken over. Printed by the check when it fires. */
export const modelInputsJson = () => JSON.stringify(modelInputs(), null, 2)

export const modelDigest = () => createHash('sha256').update(modelInputsJson()).digest('hex')
