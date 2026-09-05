import { NextResponse, type NextRequest } from 'next/server'
import { commitRow, trainingRowExists, LogError } from '@/lib/github'
import { today } from '@/lib/data'
import type { Row } from '@/lib/log-write'

/**
 * The dashboard's one write endpoint. Everything behind the shared password (src/proxy.ts covers
 * /api/log — only /api/login is exempt).
 *
 * These forms exist because none of what they capture ever needed a coaching session: a weight, a
 * tape measure, a set of 12 at 35 lb with RIR 2 are facts, not judgements. Routing them through a
 * conversation is what left the dashboard blank on any day one had not happened yet.
 */

const str = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

/** A form's empty field means "not measured" and must never be written as a zero. */
const rowFrom = (form: FormData, fields: string[]): Row =>
  Object.fromEntries(fields.map((f) => [f, str(form, f)])) as Row

const BODY_FIELDS = ['weight_lb', 'waist_in', 'neck_in', 'sleep_h', 'sleep_quality',
  'resting_hr_overnight', 'energy', 'hunger', 'mood', 'note']
// Anything not in that list is a per-athlete reading and belongs in metrics.csv, which is long
// format precisely so one athlete's medication or symptom never becomes a column in every chart.
const METRIC_FIELDS = ['metric', 'value', 'unit', 'note']
const TRAINING_FIELDS = ['type', 'session', 'status', 'rpe', 'duration_min', 'pain_flag', 'note']
const SETS_FIELDS = ['session', 'exercise', 'set_index', 'load_lb', 'reps', 'duration_s', 'rir', 'note']

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const kind = str(form, 'kind')
  const date = str(form, 'date') || today()

  const back = (params: Record<string, string>) => {
    const url = new URL('/log', req.url)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    return NextResponse.redirect(url, 303)
  }

  try {
    if (kind === 'body') {
      const row: Row = { date, ...rowFrom(form, BODY_FIELDS) }
      if (BODY_FIELDS.every((f) => !row[f])) throw new LogError('Nothing filled in — nothing saved.')
      await commitRow('body.csv', row, `Log ${date} measurements from the dashboard`)
      return back({ ok: summarise(row, [['weight_lb', 'lb'], ['waist_in', '" waist'], ['neck_in', '" neck']]) })
    }

    // The escape hatch, and the reason no per-athlete reading needs a column of its own. Anything
    // a chart tracks that body.csv does not cover — a symptom count, a medication taken, a lab
    // value, a peak-flow reading — is a row here, named by the athlete's own vocabulary.
    if (kind === 'metric') {
      const row: Row = { date, ...rowFrom(form, METRIC_FIELDS) }
      if (!row.metric) throw new LogError('A metric needs a name.')
      // Empty means "not measured" everywhere else in the chart, and a metric row whose whole
      // point is the value must not be written blank (data/METHOD.md rule 3).
      if (!row.value) throw new LogError(`No value given for "${row.metric}" — nothing saved.`)
      await commitRow('metrics.csv', row, `Log ${date} ${row.metric}: ${row.value}`)
      return back({ ok: `${row.metric} — ${row.value}${row.unit ? ` ${row.unit}` : ''}` })
    }

    if (kind === 'training') {
      const row: Row = { date, ...rowFrom(form, TRAINING_FIELDS) }
      await commitRow('training.csv', row, `Log ${date} session: ${row.session} (${row.status})`)
      return back({ ok: `${row.session} — ${row.status}${row.duration_min ? `, ${row.duration_min} min` : ''}` })
    }

    if (kind === 'sets') {
      // validate-data.mjs enforces this across files: a set with no session row is an orphan the
      // build rejects. Catch it here, where the athlete can still do something about it.
      if (!(await trainingRowExists(date))) {
        throw new LogError(
          `No session logged for ${date} yet — log the session first, then its sets. `
          + `(A set with no session row fails the data check.)`,
        )
      }
      const row: Row = { date, ...rowFrom(form, SETS_FIELDS) }
      if (!row.reps && !row.duration_s) throw new LogError('A set needs either reps or a duration.')
      await commitRow('sets.csv', row,
        `Log ${date} set: ${row.exercise} ${row.load_lb ? `${row.load_lb} lb ` : ''}x ${row.reps || `${row.duration_s}s`}`)
      const load = row.load_lb ? `${row.load_lb} lb` : 'BW'
      return back({
        ok: `${row.exercise} — set ${row.set_index}, ${load} x ${row.reps || `${row.duration_s}s`}`
          + `${row.rir ? `, RIR ${row.rir}` : ' — no RIR logged'}`,
        exercise: row.exercise,
      })
    }

    // ⚠ **THERE IS DELIBERATELY NO `meals` KIND, AND ADDING ONE IS THE WRONG FIX.**
    //
    // Everything for it already exists — `meals.csv` has a schema, `validateRow()` has a rule of
    // its own for it, `commitRow` would write it — so its absence reads like an oversight and has
    // been reported as one. It is not.
    //
    // `scripts/lib/rowwrite.mjs` requires kcal, protein_g, fat_g, carb_g and fibre_g to be
    // non-blank on every food row (data/METHOD.md rule 3a): a blank is summed as zero and biases
    // the day downward. That rule is right, and it is exactly what a quick phone form cannot
    // satisfy. "Chicken and rice, about 600" is a complete sentence to the coach, which derives
    // the macros and records the method in the note; it is an incomplete row to the validator.
    // A form that demanded five derived numbers per item would be slower than typing the
    // sentence, and would get used twice.
    //
    // So meals stay conversational, and `DASHBOARD.md` says so plainly rather than letting the
    // Log tab imply otherwise. **The feature that would actually work is different**: a picker
    // over the meal bank in `nutrition/meals.md`, where the macros are already derived, so a
    // repeat meal is one tap and rule 3a is satisfied honestly. Build that if the need comes up.
    // Decided 2026-09-05, by the athlete, after review raised the absence as a defect.
    return back({ error: `Unknown form "${kind}".` })
  } catch (e) {
    const message = e instanceof LogError ? e.message : 'Something went wrong saving that.'
    return back({ error: message })
  }
}

const summarise = (row: Row, fields: [string, string][]) =>
  fields.filter(([f]) => row[f]).map(([f, unit]) => `${row[f]}${unit}`).join(' · ') || 'saved'
