/**
 * **Everything `buildFindings` reads, gathered once, for both of its callers.**
 *
 * WHY THIS FILE EXISTS. `buildFindings` has two callers — `scripts/build-findings.mjs`, which
 * writes `data/findings.json` for the coach, and `scripts/build-data-json.mjs`, which puts the
 * same list in the dashboard bundle. Each assembled its own argument object, and
 * `build-data-json.mjs` carried this comment directly above its call:
 *
 *   > *"Must match build-findings.mjs's inputs exactly, per the note above: two lists under one
 *   > name that quietly differ is X-8, and it has already happened here once with `constants`."*
 *
 * It happened again. `build-findings.mjs` passed eleven inputs and `build-data-json.mjs` passed
 * eight — `training`, `sets` and `exerciseLibraryText` were missing — so the
 * `session-repeats-recent-work` finding could reach `data/findings.json` and could never reach the
 * dashboard. **Neither script failed.** That is the defining property of an X-8 defect: the two
 * answers do not collide, they diverge, and a gate that runs both to completion sees two green
 * runs. A comment asking a future editor to keep two lists in step is not a mechanism.
 *
 * So the list has one home and the divergence is now structurally impossible rather than merely
 * forbidden. Adding an input here reaches both surfaces at once; adding one to a call site is no
 * longer a thing anybody can do.
 *
 * ⚠ **`constants` IS A PARAMETER, NOT READ HERE, AND THAT IS DELIBERATE.**
 * `build-data-json.mjs` must pass the RAW constants object — `stripNotes()` removes `_provenance`,
 * and passing the stripped copy is precisely how the first divergence happened. Which object is
 * correct is the caller's decision; this module refuses to make it for them.
 *
 * Reads from disk, so not pure. Guard on `hasChart` before calling it: on a chart-less template
 * every file below is absent and every list comes back empty, which is a valid answer but a
 * pointless one.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readCsv } from './csv.mjs'
import { readChartDocs } from './chart-docs.mjs'

/**
 * @param root  repository root
 * @param constants  the chart's constants — RAW, including `_provenance` (see above)
 * @param today  the athlete's local date, from `localToday()`. Never the session clock
 *               (data/METHOD.md rule 6), and never derived here: a module that reads files
 *               should not also be deciding what day it is.
 */
export function collectFindingsInputs(root, { constants, today }) {
  const data = join(root, 'data')
  const rows = (f) => (existsSync(join(data, f)) ? readCsv(join(data, f)) : [])
  const text = (...parts) => {
    const p = join(root, ...parts)
    return existsSync(p) ? readFileSync(p, 'utf8') : ''
  }

  return {
    constants,
    targets: rows('targets.csv'),
    body: rows('body.csv'),
    // Not for a number on a chart — for whether the feed that writes it is still arriving at all.
    steps: rows('steps.csv'),
    // For the marker audit: goals.md's guardrail can only fire on a set performed at the marker's
    // load and dose, and nothing checked that the block still prescribes one.
    prescriptions: rows('prescriptions.csv'),
    // The ledger, for the burn side of the budget-vs-goal finding. Its own decomposed output is
    // the only figure comparable with a calorie budget — plan.estMaintenanceKcal is RMR x 1.5 and
    // data/METHOD.md forbids mixing the two.
    energy: rows('energy.csv'),
    // What was actually done, for the "today repeats yesterday" check. Both are needed and neither
    // substitutes: training.csv frames the days, sets.csv holds the movements.
    training: rows('training.csv'),
    sets: rows('sets.csv'),
    goalsText: text('athlete', 'goals.md'),
    // The movement-pattern map is parsed out of the chart's own library rather than declared in
    // code (INVARIANTS.md X-11). Absent library => exact-movement matching only, which still works.
    exerciseLibraryText: text('program', 'exercise-library.md'),
    // The chart's prose, for dated commitments. Read through the shared collector so this list and
    // the dashboard's cannot drift into two answers (scripts/lib/chart-docs.mjs).
    chartDocs: readChartDocs(root),
    today,
  }
}
