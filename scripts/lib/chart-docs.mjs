/**
 * The chart's prose, collected in one place, for checks that need to read what was written down
 * rather than what was recorded in `data/`.
 *
 * WHY IT IS A SHARED MODULE AND NOT A LIST IN EACH CALLER. Two build scripts need exactly the
 * same set of documents — `build-findings.mjs` (which writes the coach's copy) and
 * `build-data-json.mjs` (which writes the dashboard's). If those two sets ever differ, the coach
 * and the athlete are looking at two lists with one name, which is the defect
 * `build-data-json.mjs` already carries a comment about having hit once with the findings
 * themselves (INVARIANTS.md X-8).
 *
 * WHY DIRECTORIES AND NOT FILENAMES. `program/` on this chart currently holds
 * `left-knee-rehab.md`; on another it will hold something else entirely. Naming files here would
 * put one athlete's injury into shared code (INVARIANTS.md X-11), and it would also mean a new
 * document is invisible to every check until someone remembers to register it — which is the
 * exact failure mode the dated-follow-up finding exists to remove. Read the directory.
 *
 * `athlete/goals.md` is named individually and the rest of `athlete/` is deliberately excluded:
 * goals are commitments, while `profile.md`, `values.md` and `injury-history.md` are description.
 * A date in a description is a fact about the past, not something due.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY `logs/` IS IN, AS OF 2026-08-14 (W6). It was out, and the exclusion was wrong.
 *
 * The case that settled it: a coach wrote a dated medical follow-up into a session log, checked
 * whether it would fire, and found it invisible. It only fired once the same sentence was moved to
 * `nutrition/supplements.md`. **`CLAUDE.md` §0.3 tells every session to write its prose to
 * `logs/YYYY-MM-DD.md`** — so the single most likely place for a commitment to be written down was
 * the one place nothing read. That is the register failure mode this scan exists to remove,
 * reproduced by the scan's own scope.
 *
 * The plan-versus-description argument above is sound and survives; it just does not reach here. A
 * log is not description — it is where a decision gets *made*, in the words it was made in, before
 * anyone has had a chance to transcribe it to a plan file. And "history is out" was never the rule
 * either: `decisions.md` is history and has always been in.
 *
 * **The cost was measured, not assumed.** Against the live chart on the day this changed, adding
 * `logs/` contributed two dates nothing else in the chart carried — a blood draw and a moved
 * session — and extra citations on five dates already found. Two, not twenty, because the scan
 * only looks *forward*: a log is overwhelmingly a record of what happened, and a past date cannot
 * fire. Follow-ups also default to the `coach` audience, so none of this lands on the athlete's
 * screen.
 *
 * Logs are ranked **last**, behind `decisions.md`, for the reason `decisions.md` is ranked behind
 * the plan files: when the same date appears in several places, the finding quotes the most
 * canonical statement of it and mentions the rest.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Where the training block lives. Named once, so no check has to spell it (X-11). */
export const PROGRAM_DIR = 'program'

/** Directories whose every markdown file is part of the chart's live plan, plan files first. */
export const CHART_DOC_DIRS = ['nutrition', PROGRAM_DIR]

/**
 * Directories read after the plan and after `decisions.md` — the narrative record, where a
 * commitment is often written before it reaches a plan file. See the note above.
 */
export const CHART_LOG_DIRS = ['logs']

/** Individually named documents, in the order a reader should trust them. */
export const CHART_DOC_FILES = [
  'athlete/goals.md',
  // Last on purpose. decisions.md is append-only history: a commitment normally lives in a plan
  // file and is *recorded* here, so when the same date appears in both, the plan file is the
  // canonical statement and this is the audit trail behind it.
  'decisions.md',
]

/**
 * `[{ path, text }]` for every chart document that exists, plan files first, history last.
 * Missing files and directories are skipped silently — a chart with no `program/` is a valid
 * chart, not a broken one (CLAUDE.md §0.2).
 */
export function readChartDocs(root) {
  const docs = []
  const push = (rel) => {
    const abs = join(root, rel)
    if (!existsSync(abs) || !statSync(abs).isFile()) return
    docs.push({ path: rel, text: readFileSync(abs, 'utf8') })
  }

  const pushDir = (dir) => {
    const abs = join(root, dir)
    if (!existsSync(abs)) return
    for (const name of readdirSync(abs).sort()) {
      if (name.endsWith('.md')) push(`${dir}/${name}`)
    }
  }

  CHART_DOC_DIRS.forEach(pushDir)
  for (const file of CHART_DOC_FILES) push(file)
  CHART_LOG_DIRS.forEach(pushDir)

  return docs
}
