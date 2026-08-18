/**
 * Inserting a single validated row into a data/*.csv, as text.
 *
 * Plain ESM rather than TypeScript so that BOTH the dashboard's write routes and a node test
 * can run the identical code. This logic edits the athlete's source of truth in place; "it
 * typechecked" is not the same as "it does not corrupt the file", and the difference is only
 * findable by running it. See scripts/test-rowwrite.mjs.
 */
import { SPEC, DATE_RE } from './schema.mjs'
import { localToday } from './athlete.mjs'
// The CSV grammar has ONE home. This file used to carry its own single-line parser and its own
// quoting helper, with a comment on each saying it must not diverge from csv.mjs — and both
// carried F-10's mid-field-quote bug, so fixing one would have left the other. See csv.mjs.
import { cell, parseLine } from './csv.mjs'

export const specFor = (file) => {
  const s = SPEC[file]
  if (!s) throw new Error(`No schema for ${file}`)
  return s
}


/**
 * Returns the reason a future-dated row must be rejected, or `null` if it is legitimately a plan.
 *
 * ⚠ THE DISTINCTION IS MEASURED VERSUS PRESCRIBED, AND IT IS DECLARED IN THE SCHEMA. data/METHOD.md
 * rule 6 exists because observations landed on the wrong day twice — a session clock reading UTC
 * while the athlete is 7-8 h behind. That reasoning applies to anything MEASURED and it still does:
 * meals, sets, body, steps stay rejected outright, whatever they contain.
 *
 * A prescription is not a measurement. It is what was decided for a day that has not happened,
 * which is what a schedule and a calorie target both are. Without this, a one-off change to a
 * future day ("I cannot train Friday") could not be written anywhere in the chart, so the dashboard
 * kept showing a session the athlete had already ruled out — reported three times on 2026-08-13.
 *
 * **This used to read `if (file !== 'training.csv') reject`** — a list of one masquerading as a
 * principle, and it cost the athlete a real thing: `targets.csv` is prescribed by exactly the same
 * argument, so a trip's targets could not be written before the trip and the only remedy was a
 * coaching session every morning of it, during his #1 documented streak-ender (audit F-23). The
 * rule now reads `records` off `SPEC`, so the next prescribed file gets this right by declaring
 * what it is rather than by someone remembering to widen a condition here.
 *
 * For a `plan-or-outcome` file, all of these are required:
 *   - `status` equals the spec's `plannedStatus` (a future 'completed' row is a clock bug)
 *   - every column in the spec's `outcomeFields` is empty
 * `compute-energy.mjs` independently skips dates after local today, so even a row that slipped
 * through here cannot manufacture burn for a day that has not happened.
 */
export function futureRowRejection(file, row) {
  const spec = SPEC[file]
  const records = spec?.records ?? 'measurement'

  if (records === 'prescription') return null

  if (records !== 'plan-or-outcome') {
    return 'this is almost always a session clock reading UTC instead of local time '
      + `(data/METHOD.md rule 6). ${file} records measurements, and a measurement of a day that `
      + 'has not happened is a clock bug, not a plan.'
  }

  const statusField = 'status'
  if (row[statusField] !== spec.plannedStatus) {
    return `a future ${file} row must have ${statusField} "${spec.plannedStatus}", got `
      + `"${row[statusField] ?? ''}" (data/METHOD.md rule 6)`
  }
  const dirty = (spec.outcomeFields ?? []).filter((f) => row[f] != null && row[f] !== '')
  if (dirty.length) {
    return `a future ${file} row records what has not happened yet: ${dirty.join(', ')} must be `
      + 'empty (data/METHOD.md rule 6)'
  }
  return null
}

/**
 * The tier an unassigned remainder of a session's duration is counted as.
 *
 * `light` and not a flat MET over the whole duration: the athlete described the hard part, so the
 * rest was, by his own account, not the hard part. Under-counting the remainder is the direction
 * that keeps burn a floor, which is the convention the whole model already runs on.
 */
export const REMAINDER_TIER = 'light_min'

/** The sentence written into the row's note whenever a remainder is assigned. Greppable on purpose. */
export const REMAINDER_NOTE = 'Intensity remainder assigned automatically'

/**
 * Make a session's intensity split COVER its duration, and say in the row that it was done.
 *
 * THE DEFECT (audit F-03). An 80-minute BJJ class logged as `duration_min=80, hard_min=20` — the
 * athlete characterising only the hard rounds, which is how people describe a class — validated
 * with zero errors and contributed **295 kcal instead of ~1,180**. `compute-energy.mjs` treats the
 * presence of any tier as "use the split path" and ignores `duration_min` from that point on, so
 * the other 60 minutes cost nothing. The day's deficit read 885 kcal larger than it was, as an
 * ordinary confident number. Both guards checked only that the parts do not EXCEED the whole; the
 * missing half is that they must cover it.
 *
 * WHY THE FIX IS AN ASSIGNMENT AND NOT AN ERROR. Requiring `light + moderate + hard === duration`
 * would make the validator refuse "80 minute class, 20 of it hard" — a true and completely normal
 * report — until the session invented a split for the other 60 minutes. `CLAUDE.md` §0.3 forbids
 * inventing a number to fill a cell outright, and a check that cannot go green without invented
 * data must not be written (INVARIANTS.md, the commit gate). So the remainder is assigned to the
 * softest tier, **written into the row**, and **stated in the note** — an assumption on the record
 * that a later session can see and correct, rather than a silent zero or a blocked write. The
 * validator still errors when the parts exceed the whole, because that is a logged contradiction.
 *
 * Idempotent: running it twice changes nothing the second time, because the parts now cover the
 * duration. That matters — `scripts/lib/push-retry.mjs` re-applies a mutation from a clean tree.
 */
export function coverIntensitySplit(file, row) {
  if (file !== 'training.csv') return row

  const tier = (f) => (row[f] === '' || row[f] == null ? null : Number(row[f]))
  const light = tier('light_min'), moderate = tier('moderate_min'), hard = tier('hard_min')
  if (light == null && moderate == null && hard == null) return row

  const duration = tier('duration_min')
  if (duration == null || !Number.isFinite(duration)) return row

  const assigned = (light ?? 0) + (moderate ?? 0) + (hard ?? 0)
  if (!Number.isFinite(assigned)) return row
  const remainder = duration - assigned
  // <= 0 covers both "already covered" and "parts exceed the whole" — the second is a
  // contradiction in the record and stays validateRow's error, not something to paper over here.
  if (remainder <= 0) return row

  const note = String(row.note ?? '')
  const sentence = `${REMAINDER_NOTE}: ${remainder} of ${duration} min carried no tier and are `
    + `counted as ${REMAINDER_TIER.replace('_min', '')} (scripts/lib/rowwrite.mjs). Uncounted they `
    + `would have contributed nothing to burn. Correct light_min/moderate_min/hard_min if that is wrong.`

  return {
    ...row,
    [REMAINDER_TIER]: String((light ?? 0) + remainder),
    note: note ? `${note} ${sentence}` : sentence,
  }
}

/** Every rule validate-data.mjs applies to one row — applied BEFORE the row is written. */
export function validateRow(file, row) {
  const spec = specFor(file)
  const errors = []

  if (!DATE_RE.test(row.date ?? '')) errors.push(`date must be YYYY-MM-DD, got "${row.date ?? ''}"`)
  else {
    const today = localToday()
    if (row.date > today) {
      const why = futureRowRejection(file, row)
      if (why) {
        errors.push(`date ${row.date} is after today (${today} in the athlete's local timezone) — ${why}`)
      }
    }
  }

  for (const f of spec.required ?? []) {
    if (!row[f]) errors.push(`${f} is required`)
  }

  for (const f of spec.numeric ?? []) {
    const raw = row[f]
    if (raw === '' || raw == null) continue // empty means "not measured" — never a zero
    const v = Number(raw)
    if (!Number.isFinite(v)) { errors.push(`${f} must be a number, got "${raw}"`); continue }
    const range = spec.ranges?.[f]
    if (range && (v < range[0] || v > range[1])) {
      errors.push(`${f} = ${v} is outside the plausible range ${range[0]}–${range[1]}`)
    }
  }

  for (const [f, allowed] of Object.entries(spec.enums ?? {})) {
    const raw = row[f]
    if (raw === '' || raw == null) continue
    if (!allowed.includes(raw)) errors.push(`${f} must be one of ${allowed.join(', ')}`)
  }

  // data/METHOD.md rule 3a — every food row carries all five macro estimates. Deliberately NOT
  // done via spec.required, because that uses a falsy test and would reject a legitimate measured
  // zero (0 g fibre in an egg white). Only a genuinely empty cell is an error here.
  // Mirrors the same rule in scripts/validate-data.mjs — that is the CI backstop for a row
  // written by a direct file edit rather than through this path.
  if (file === 'meals.csv') {
    for (const f of ['kcal', 'protein_g', 'fat_g', 'carb_g', 'fibre_g']) {
      const raw = row[f]
      if (raw === '' || raw == null) {
        errors.push(`${f} is blank — METHOD.md rule 3a requires an estimate on every food row. `
          + `A blank is summed as 0 by every daily total, so it silently biases the day downward. `
          + `Derive it (label / by difference / build-up / photo) and state the method in the note.`)
      }
    }
  }

  // A kcal_override with no note is indistinguishable from a number someone liked better —
  // the whole point of overriding the MET model is a reason a future session can audit.
  if (file === 'training.csv' && row.kcal_override !== '' && row.kcal_override != null && !row.note) {
    errors.push('kcal_override requires a note explaining why the MET estimate was overridden')
  }

  // The intensity split is a breakdown OF duration_min, not a separate figure — parts summing to
  // more than the whole is a logged contradiction, not a rounding difference to shrug off.
  //
  // ⚠ THE OTHER DIRECTION IS DELIBERATELY NOT AN ERROR. Parts that fall SHORT of the duration is
  // the far more damaging case (audit F-03: 295 kcal counted against ~1,180 real), but erroring on
  // it would force a session logging "80 minute class, 20 of it hard" to fabricate the other 60
  // minutes, which CLAUDE.md §0.3 forbids. `coverIntensitySplit` above assigns the remainder on
  // the write path and records that it did; validate-data.mjs warns for a row that reached the
  // file some other way, and prints the corrected split.
  if (file === 'training.csv') {
    const light = Number(row.light_min || 0), moderate = Number(row.moderate_min || 0),
      hard = Number(row.hard_min || 0)
    const hasSplit = row.light_min || row.moderate_min || row.hard_min
    if (hasSplit && row.duration_min !== '' && row.duration_min != null) {
      const total = light + moderate + hard
      if (total > Number(row.duration_min)) {
        errors.push(`light_min + moderate_min + hard_min (${total}) exceeds duration_min (${row.duration_min})`)
      }
    }
  }

  return errors
}

export const toLine = (file, row) => specFor(file).header.map((h) => cell(row[h])).join(',')

/**
 * Merge a partial update into an existing `uniqueDate` row instead of blanking its other columns.
 *
 * Without this, submitting an afternoon waist reading writes a row with weight empty, silently
 * destroying the morning weigh-in. Empty means "not measured" everywhere in this repo, so a blank
 * form field means "leave alone" — never "set to nothing".
 */
export function mergeIntoExisting(text, file, row) {
  const spec = specFor(file)
  if (!spec.uniqueDate) return row

  const existing = text.replace(/\n$/, '').split('\n').slice(1)
    .find((l) => l.slice(0, 10) === row.date)
  if (!existing) return row

  const merged = { ...parseLine(existing, spec.header) }
  for (const [k, v] of Object.entries(row)) {
    if (v !== '' && v != null) merged[k] = v
  }
  return merged
}

/**
 * Insert a row into a CSV's text, preserving the date ordering CI enforces.
 *
 * Append-only wherever possible (data/METHOD.md rule 2): appended rows merge cleanly where
 * rewritten files conflict, and the athlete writes from more than one surface. A row is only
 * rewritten for a `uniqueDate` file whose date is already present — body.csv, where adding an
 * afternoon reading to the morning's row is the intended behaviour.
 */
export function insertRow(text, file, row) {
  const spec = specFor(file)
  const line = toLine(file, row)
  const trimmed = text.replace(/\n$/, '')
  const lines = trimmed.split('\n')
  const header = lines[0]
  const body = lines.slice(1)
  const dateOf = (l) => l.slice(0, 10)

  if (spec.uniqueDate) {
    const at = body.findIndex((l) => dateOf(l) === row.date)
    if (at >= 0) {
      body[at] = line
      return [header, ...body].join('\n') + '\n'
    }
  }

  const lastDate = body.length ? dateOf(body[body.length - 1]) : ''
  if (row.date >= lastDate) return [header, ...body, line].join('\n') + '\n'

  const at = body.findIndex((l) => dateOf(l) > row.date)
  body.splice(at < 0 ? body.length : at, 0, line)
  return [header, ...body].join('\n') + '\n'
}

/**
 * Drop a `uniqueDate` file's row for `date`, permanently — no tombstone, no history kept.
 *
 * Built for the dismiss button on `data/coach-notes.csv` notes (`src/components/CoachNotes.tsx`):
 * the athlete asked for dismissal to make a note disappear for good, explicitly rejecting a
 * historical record of what was dismissed. Every other write in this file only ever inserts or
 * replaces a row (data/METHOD.md rule 2, append-only wherever possible) because those rows are
 * measurements — deleting one would falsify the log. A coach note is editorial (DATA-D-18), so a
 * dismissed one leaving no trace is the intended behaviour, not an exception to the rule.
 *
 * Idempotent, like `insertRow`: calling it again once the row is already gone is a no-op, which is
 * what lets `commitRemoval`'s retry loop re-apply this against a freshly re-read file.
 *
 * Restricted to `uniqueDate` files on purpose — a file where a date can hold several rows (meals,
 * sets) has no way to name which one a click meant, and nothing in this chart needs that yet.
 */
export function removeRow(text, file, date) {
  const spec = specFor(file)
  if (!spec.uniqueDate) throw new Error(`removeRow: ${file} is not uniqueDate — which row?`)

  const trimmed = text.replace(/\n$/, '')
  const lines = trimmed.split('\n')
  const header = lines[0]
  const body = lines.slice(1)
  const dateOf = (l) => l.slice(0, 10)

  const next = body.filter((l) => dateOf(l) !== date)
  if (next.length === body.length) return text // already gone — not an error

  return [header, ...next].join('\n') + '\n'
}
