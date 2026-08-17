#!/usr/bin/env node
/**
 * Tests for the dashboard's write path. Runs in CI alongside validate-data.
 *
 * This code edits the athlete's source of truth in place. The failure mode it exists to prevent
 * is not an exception — it is a row that writes successfully and quietly destroys or reorders a
 * neighbouring one, which nobody notices until a chart looks wrong weeks later.
 *
 * Every case below either happened or was one edit away from happening:
 *  - reserialising a whole file to add one row silently unquoted an unrelated note (2026-08-11)
 *  - a partial body.csv update blanking the morning weigh-in
 *  - an out-of-order insert breaking the date ordering CI enforces
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { insertRow, mergeIntoExisting, validateRow, toLine } from './lib/rowwrite.mjs'
import { parseCsv } from './lib/csv.mjs'
import { localToday, sessionTypeEnum, metTable } from './lib/athlete.mjs'
import { SPEC } from './lib/schema.mjs'
import { REAL_DATA, modeBanner } from './lib/test-mode.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => readFileSync(join(ROOT, 'data', f), 'utf8')

console.log(modeBanner('rowwrite'))

/**
 * Inline fixtures, not the live chart (audit F-30).
 *
 * These three files were read off `data/` until 2026-08-14, and four assertions named this
 * athlete's own cells — `merge keeps the existing weight 179.4`, `2026-08-11,179.4,34.75,16.00`.
 * On an empty chart they failed, so a new athlete's first push was red for having no history.
 *
 * Each fixture is a real historical shape rather than an invented one: a `body.csv` row whose note
 * a partial update must not destroy, a `sets.csv` with the trailing newline the insert relies on,
 * and a `training.csv` whose dates an out-of-order insert has to slot into. Written as text, not as
 * rows, because the code under test edits text.
 */
const header = (file) => SPEC[file].header.join(',')

const FIXTURE = {
  'body.csv': `${header('body.csv')}
2026-08-05,181.9,,,7,4,,4,3,4,1,n,First morning of the chart
2026-08-11,179.4,35.25,16.00,7.5,4,,4,2,4,1,y,"Third morning-protocol reading, taken fasted"
`,
  'sets.csv': `${header('sets.csv')}
2026-08-11,Session B,Push-up,1,,20,,2,
2026-08-11,Session B,Push-up,2,,18,,1,
`,
  'training.csv': `${header('training.csv')}
2026-08-05,strength,Session A,completed,7,40,n,,,,,
2026-08-11,strength,Session B,completed,7,55,n,,,,,
2026-08-12,walk,Flat walk,completed,,50,n,,,,,
`,
}

let failed = 0
const check = (name, cond, detail = '') => {
  if (cond) { console.log(`  ok   ${name}`) } else { failed++; console.error(`  FAIL ${name} ${detail}`) }
}

// --- appending to a real file preserves every existing byte -------------------------------------
{
  const before = FIXTURE['sets.csv']
  const after = insertRow(before, 'sets.csv', {
    date: '2026-08-11', session: 'Session B', exercise: 'Plank', set_index: '1',
    load_lb: '', reps: '', duration_s: '45', rir: '', note: '',
  })
  check('append leaves prior lines byte-identical', after.startsWith(before.replace(/\n$/, '') + '\n'))
  check('append adds exactly one line',
    after.trimEnd().split('\n').length === before.trimEnd().split('\n').length + 1)
  check('appended file still parses', parseCsv(after).length === parseCsv(before).length + 1)
}

// --- quoting survives a note containing a comma and a quote ------------------------------------
{
  const line = toLine('sets.csv', {
    date: '2026-08-11', session: 'S', exercise: 'Row', set_index: '1', load_lb: '35',
    reps: '10', duration_s: '', rir: '2', note: 'band "blue", 20 lb',
  })
  check('comma+quote note is escaped', line.endsWith('"band ""blue"", 20 lb"'), line)
  const parsed = parseCsv('date,session,exercise,set_index,load_lb,reps,duration_s,rir,note\n' + line + '\n')
  check('escaped note round-trips', parsed[1][8] === 'band "blue", 20 lb', parsed[1][8])
}

// --- body.csv: a partial update must NOT blank the columns already on file ----------------------
{
  const before = FIXTURE['body.csv']
  const partial = { date: '2026-08-11', waist_in: '34.75', weight_lb: '', neck_in: '', note: '' }
  const merged = mergeIntoExisting(before, 'body.csv', partial)
  check('merge keeps the existing weight', merged.weight_lb === '179.4', merged.weight_lb)
  check('merge applies the new waist', merged.waist_in === '34.75', merged.waist_in)
  check('merge keeps the existing note', merged.note.startsWith('Third morning-protocol'), merged.note)

  const after = insertRow(before, 'body.csv', merged)
  check('body.csv row count unchanged on update',
    after.trimEnd().split('\n').length === before.trimEnd().split('\n').length)
  check('updated row carries the new waist',
    after.includes('2026-08-11,179.4,34.75,16.00'), after)
}

// --- out-of-order insert keeps the file date-ordered -------------------------------------------
{
  const before = FIXTURE['training.csv']
  const after = insertRow(before, 'training.csv', {
    date: '2026-08-07', type: 'walk', session: 'Backfilled walk', status: 'completed',
    rpe: '', duration_min: '20', pain_flag: 'n', note: '',
  })
  const dates = after.trimEnd().split('\n').slice(1).map((l) => l.slice(0, 10))
  check('dates remain non-decreasing', dates.every((d, i) => i === 0 || d >= dates[i - 1]),
    dates.join(' '))
  check('backfilled row is present', dates.filter((d) => d === '2026-08-07').length >= 1)
}

// --- validation catches what CI would later reject ----------------------------------------------
{
  const bad = validateRow('body.csv', { date: '2026-08-11', weight_lb: '17.4' })
  check('implausible weight rejected', bad.some((e) => e.includes('plausible range')), bad.join('|'))

  const badDate = validateRow('body.csv', { date: '11-08-2026', weight_lb: '179' })
  check('malformed date rejected', badDate.some((e) => e.includes('YYYY-MM-DD')))

  // The rejected value is deliberately not the name of a real activity: `yoga` is a perfectly
  // reasonable thing for another chart to register, and a suite that asserts it is illegal would be
  // asserting something about this athlete (INVARIANTS.md X-11).
  const badEnum = validateRow('training.csv', {
    date: '2026-08-11', type: '__not-a-registered-type__', session: 'x', status: 'completed',
  })
  check('an unregistered session type is rejected', badEnum.some((e) => e.includes('type must be one of')))

  const missing = validateRow('training.csv',
    { date: '2026-08-11', type: sessionTypeEnum()[0], session: '' })
  check('missing required field rejected', missing.some((e) => e.includes('session is required')))

  const ok = validateRow('sets.csv', {
    date: '2026-08-11', session: 'Session B', exercise: 'Plank', set_index: '1',
    load_lb: '', reps: '', duration_s: '45', rir: '2', note: '',
  })
  check('a good row passes clean', ok.length === 0, ok.join('|'))

  // Empty must stay distinguishable from zero (data/METHOD.md rule 3).
  const empties = validateRow('body.csv', { date: '2026-08-11', weight_lb: '', sleep_h: '' })
  check('empty numerics are not treated as zero', empties.length === 0, empties.join('|'))

  // A session's clock runs UTC; the athlete does not. A row dated tomorrow (in the athlete's
  // local timezone) shipped once for real before this check existed (data/METHOD.md rule 6) —
  // it must never write clean again. Computed relative to "today" so this doesn't rot as the
  // calendar moves past any one hardcoded date.
  const tomorrowUtc = new Date(`${localToday()}T00:00:00Z`)
  tomorrowUtc.setUTCDate(tomorrowUtc.getUTCDate() + 1)
  const tomorrow = tomorrowUtc.toISOString().slice(0, 10)
  const future = validateRow('meals.csv', { date: tomorrow, item: 'x', kcal: '100' })
  check('future-dated row rejected', future.some((e) => e.includes('is after today')), future.join('|'))

  const todayRow = validateRow('meals.csv', { date: localToday(), item: 'x', kcal: '100' })
  check('same-day row is not rejected', !todayRow.some((e) => e.includes('is after today')), todayRow.join('|'))

  // --- The 2026-08-13 carve-out: a PLANNED training row may be dated ahead -----------------------
  // The schedule is intrinsically about days that have not happened. Without this, a one-off
  // future change ("I cannot train Friday") could not be written anywhere, and the dashboard kept
  // showing a session the athlete had already ruled out. The carve-out is narrow on purpose.
  const anyType = sessionTypeEnum()[0]
  const plannedAhead = validateRow('training.csv',
    { date: tomorrow, type: anyType, session: 'Session B', status: 'planned' })
  check('future PLANNED training row is allowed',
    !plannedAhead.some((e) => e.includes('is after today')), plannedAhead.join('|'))

  const completedAhead = validateRow('training.csv',
    { date: tomorrow, type: anyType, session: 'Session B', status: 'completed' })
  check('future COMPLETED training row is still rejected',
    completedAhead.some((e) => e.includes('is after today')), completedAhead.join('|'))

  for (const field of SPEC['training.csv'].outcomeFields) {
    const dirty = validateRow('training.csv',
      { date: tomorrow, type: anyType, session: 'Session B', status: 'planned', [field]: '7' })
    check(`future planned row with ${field} set is rejected`,
      dirty.some((e) => e.includes('is after today')), dirty.join('|'))
  }

  const futureSet = validateRow('sets.csv',
    { date: tomorrow, session: 'Session B', exercise: 'Push-up', set_index: '1', reps: '10' })
  check('the carve-out does not leak to sets.csv',
    futureSet.some((e) => e.includes('is after today')), futureSet.join('|'))

  // METHOD.md rule 3a. A blank macro is summed as 0 everywhere downstream, so it is a silent
  // understatement, not an honest gap — 2026-08-12 read as 36.7 g of fat when the truth was 72.7.
  const blankFat = validateRow('meals.csv', {
    date: localToday(), item: 'Mixt Elote salad', kcal: '660', confidence: 'label',
    protein_g: '51', fat_g: '', carb_g: '37', fibre_g: '12',
  })
  check('blank fat_g rejected on a meal row',
    blankFat.some((e) => e.startsWith('fat_g is blank')), blankFat.join('|'))

  // The rule must not fire on a legitimate MEASURED zero — egg whites really do have 0 g fibre.
  // This is why the check is an emptiness test and not spec.required's falsy test.
  const measuredZero = validateRow('meals.csv', {
    date: localToday(), item: '6 egg whites', kcal: '102', confidence: 'estimate',
    protein_g: '21.6', fat_g: '0.4', carb_g: '1.4', fibre_g: '0',
  })
  check('measured zero is not treated as blank', measuredZero.length === 0, measuredZero.join('|'))
}

// =================================================================================================
// X-14 · the schema is COMPLETE — every file in data/ has an entry, and the enums agree
// =================================================================================================
console.log('\nschema completeness')

{
  // Nine files were in SPEC and `data/` held ten (audit F-72). The missing one was `energy.csv` —
  // generated, so low risk in isolation, except that `data/METHOD.md` reads as though SPEC covers
  // every file and `DATA-D-19` declares its header a MUST with nothing checking it. A generated
  // file is exactly where a silent header change is plausible: writer and reader ship in the same
  // commit, so nothing disagrees until a consumer written months later does.
  const onDisk = readdirSync(join(ROOT, 'data')).filter((f) => f.endsWith('.csv')).sort()
  const inSpec = Object.keys(SPEC).sort()
  const missing = onDisk.filter((f) => !inSpec.includes(f))
  const phantom = inSpec.filter((f) => !onDisk.includes(f))
  check(`SPEC covers every data/*.csv (${onDisk.length} files)`, missing.length === 0,
    `no schema entry for: ${missing.join(', ')}`)
  check('every SPEC entry names a file that exists', phantom.length === 0,
    `SPEC has entries for missing files: ${phantom.join(', ')}`)

  // Header drift on a generated file. `compute-energy.mjs` writes energy.csv; if its column list
  // moves, this is what says so.
  for (const [file, spec] of Object.entries(SPEC)) {
    const path = join(ROOT, 'data', file)
    if (!existsSync(path)) continue
    check(`${file} header matches SPEC`,
      readFileSync(path, 'utf8').split('\n')[0].trim() === spec.header.join(','), file)
  }

  // Every file declares what a row IS, because `futureRowRejection` decides from it alone and a
  // missing declaration silently means "measurement" — which would reject a legitimately
  // future-dated prescription rather than fail loudly (audit F-23).
  const RECORDS = ['measurement', 'prescription', 'plan-or-outcome']
  for (const [file, spec] of Object.entries(SPEC)) {
    check(`${file} declares what a row records`, RECORDS.includes(spec.records),
      `records=${JSON.stringify(spec.records)} — one of ${RECORDS.join(', ')}`)
  }
  for (const [file, spec] of Object.entries(SPEC)) {
    if (spec.records !== 'plan-or-outcome') continue
    check(`${file} names the status a planned row carries`, typeof spec.plannedStatus === 'string')
    check(`${file} names its outcome columns`, Array.isArray(spec.outcomeFields) && spec.outcomeFields.length)
    check(`${file}'s outcome columns are all real columns`,
      spec.outcomeFields.every((f) => spec.header.includes(f)),
      spec.outcomeFields.filter((f) => !spec.header.includes(f)).join(', '))
  }
  for (const [file, spec] of Object.entries(SPEC)) {
    if (!spec.uniqueKey) continue
    check(`${file}'s uniqueKey names real columns`,
      spec.uniqueKey.every((f) => spec.header.includes(f)), spec.uniqueKey.join(', '))
  }

  // ⚠ THE F-07 CLASS, DELETED RATHER THAN CHECKED. The audit asked for
  // `Object.keys(DEFAULT_MET) ⊆ SPEC['training.csv'].enums.type` — two lists of the same thing in
  // two files, with a test asserting they agree. There is one list now, so the assertion is that
  // both derive from it: a type with a MET and no enum entry (`rehab` for a day, which cost two
  // real rows the wrong MET) is not possible to express.
  const enumTypes = [...SPEC['training.csv'].enums.type].sort()
  const metTypes = Object.keys(metTable()).sort()
  check('the type enum and the MET table are the same list',
    JSON.stringify(enumTypes) === JSON.stringify(metTypes),
    `enum=${enumTypes.join('|')} met=${metTypes.join('|')}`)
  check('the enum always carries the two universal types',
    enumTypes.includes('rest') && enumTypes.includes('other'), enumTypes.join('|'))
}

// =================================================================================================
// The live chart — REPORTED, and only with --real. See scripts/lib/test-mode.mjs.
// =================================================================================================
if (REAL_DATA) {
  console.log('\nthe live chart (--real)')
  const files = Object.keys(SPEC).filter((f) => existsSync(join(ROOT, 'data', f)))
  for (const file of files) {
    const text = read(file)
    const rows = parseCsv(text)
    console.log(`  ·    ${file}: ${Math.max(rows.length - 1, 0)} row(s)`)
  }
  // The one live assertion worth keeping here, because it is about the WRITE PATH rather than about
  // the chart: appending to each real file must leave every prior byte alone. It reports the file
  // it ran against so a green line is never mistaken for coverage of an empty chart.
  for (const file of files) {
    if (SPEC[file].uniqueDate) continue
    const before = read(file)
    if (before.trimEnd().split('\n').length < 2) { console.log(`  ·    ${file}: no rows, append not exercised`); continue }
    const last = parseCsv(before).at(-1)
    const row = Object.fromEntries(SPEC[file].header.map((h, i) => [h, last[i]]))
    const after = insertRow(before, file, row)
    check(`${file}: append preserves every prior byte`,
      after.startsWith(before.replace(/\n$/, '') + '\n'))
  }
}

console.log(failed ? `\n${failed} failure(s).` : '\nrowwrite: all checks passed.')
process.exit(failed ? 1 : 0)
