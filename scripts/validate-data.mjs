#!/usr/bin/env node
/**
 * Fails loudly on a malformed data/ file. Runs in CI on every push.
 *
 * The point is not tidiness. A dashboard that renders a wrong number confidently is worse than
 * one that fails to build, so every rule here is a rule about not shipping a plausible lie.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCsv, num } from './lib/csv.mjs'
import { DATE_RE, SPEC } from './lib/schema.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data')

// The template repo has no chart yet — no constants, no rows. There is nothing to
// validate, and failing here would just teach people to ignore a red build.
if (!existsSync(join(DATA, '..', 'athlete', 'constants.json'))) {
  console.log('No athlete/constants.json — template repo with no chart yet. Nothing to validate.')
  process.exit(0)
}

const errors = []
const warnings = []
const err = (f, msg) => errors.push(`${f}: ${msg}`)
const warn = (f, msg) => warnings.push(`${f}: ${msg}`)

// Computed once, up front, so every file's date column is checked against the same instant.
// See data/METHOD.md rule 6 — a coaching session's clock runs UTC, the athlete does not, and
// this is the second time that mismatch put a row on the wrong day (2026-08-08, 2026-08-11).
const { localToday, constants } = await import('./lib/athlete.mjs')
const { futureRowRejection, coverIntensitySplit } = await import('./lib/rowwrite.mjs')

// ⚠ **THE TIMEZONE IS CHECKED HERE, BEFORE ANYTHING USES IT, and the placement is the fix.**
//
// Audit F-47 is that `athlete.timezone` was validated with `v.includes('/')`, which accepts
// "America/Los Angeles" — a space where the underscore belongs — and then throws a raw
// `RangeError: Invalid time zone specified` from inside `localToday()`. W7 replaced the weak
// predicate with one that asks the runtime… and the check still never ran, because the REQUIRED
// table below sits 100 lines under this line and `localToday()` is called first. The suite crashed
// with the same stack trace as before, on a validator whose whole job is to fail in sentences.
// Found by breaking it on purpose after the fix was written (INVARIANTS.md X-10).
const tz = constants?.athlete?.timezone
try {
  new Intl.DateTimeFormat('en-CA', { timeZone: tz })
} catch {
  console.error(`ERROR athlete/constants.json: athlete.timezone ${JSON.stringify(tz)} is not an IANA `
    + 'time zone. Every date in the chart is derived from it (data/METHOD.md rule 6), so nothing '
    + 'below can run. The usual cause is a space where an underscore belongs — "America/New_York", '
    + 'not "America/New York".')
  console.error('\n1 error(s). data/ is the source of truth — fix it before it ships.')
  process.exit(1)
}
const todayLocal = localToday()

for (const [file, spec] of Object.entries(SPEC)) {
  const path = join(DATA, file)
  if (!existsSync(path)) { err(file, 'missing'); continue }

  const headerLine = readFileSync(path, 'utf8').split('\n')[0].trim()
  const expected = spec.header.join(',')
  if (headerLine !== expected) {
    err(file, `header mismatch\n    expected: ${expected}\n    got:      ${headerLine}`)
    continue
  }

  const rows = readCsv(path)
  const seen = new Set()
  let prevDate = ''

  // --- Duplicate rows (audit F-21) --------------------------------------------------------------
  //
  // An EXACT duplicate line is an error: two identical rows are a contradiction in the record —
  // whatever produced them, one of them did not happen — and it is fixable by editing the file,
  // which is the test for a validator rule. Verified zero false positives on this chart: `sets.csv`
  // carries `set_index`, so two identical sets are distinguishable, and every other file either has
  // `uniqueDate` or a timestamp.
  //
  // A duplicate on a file's `uniqueKey` is a WARNING, because it is sometimes true — the same
  // protein bar twice, both logged at the same rounded time. It matters because a duplicated
  // 600-kcal dinner moves the day's deficit by 600 and validator, write path and CI were all green.
  {
    const lines = readFileSync(path, 'utf8').replace(/\n$/, '').split('\n').slice(1)
    const byLine = new Map()
    lines.forEach((line, i) => {
      if (!line.trim()) return
      const at = byLine.get(line)
      if (at != null) err(file, `row ${i + 2}: exact duplicate of row ${at + 2} — ${line.slice(0, 70)}`)
      else byLine.set(line, i)
    })
    if (spec.uniqueKey) {
      const byKey = new Map()
      rows.forEach((row, i) => {
        const k = spec.uniqueKey.map((f) => row[f] ?? '').join('\u0000')
        const at = byKey.get(k)
        if (at != null) {
          warn(file, `row ${i + 2} repeats ${spec.uniqueKey.map((f) => `${f}="${row[f]}"`).join(' ')} `
            + `from row ${at + 2}. If that is a double submit it moves the day's totals by the whole `
            + `row; if it is genuinely the same thing twice, say so in the note.`)
        } else byKey.set(k, i)
      })
    }
  }

  rows.forEach((row, i) => {
    const where = `row ${i + 2}`

    if (!DATE_RE.test(row.date)) err(file, `${where}: bad date "${row.date}"`)
    else if (row.date > todayLocal) {
      // Independent re-implementation of the same rule validateRow() applies — this is the
      // backstop for a row that reached the file without going through the write path, including
      // a coaching session's raw file edit. A planned training row is the one legitimate way to
      // describe a day that has not happened; everything measured stays rejected outright.
      const why = futureRowRejection(file, row)
      if (why) {
        err(file, `${where}: date ${row.date} is after today (${todayLocal}, athlete's local `
          + `timezone) — ${why}`)
      }
    }
    if (row.date < prevDate) err(file, `${where}: out of order (${row.date} after ${prevDate})`)
    prevDate = row.date

    if (spec.uniqueDate) {
      if (seen.has(row.date)) err(file, `${where}: duplicate date ${row.date}`)
      seen.add(row.date)
    }

    for (const f of spec.required ?? []) {
      if (row[f] === '') err(file, `${where}: ${f} is required and empty`)
    }

    for (const f of spec.numeric ?? []) {
      if (row[f] === '') continue
      const v = num(row[f])
      if (!Number.isFinite(v)) { err(file, `${where}: ${f}="${row[f]}" is not a number`); continue }
      const range = spec.ranges?.[f]
      if (range && (v < range[0] || v > range[1])) {
        err(file, `${where}: ${f}=${v} outside plausible range ${range[0]}–${range[1]}`)
      }
    }

    for (const [f, allowed] of Object.entries(spec.enums ?? {})) {
      if (row[f] === '') continue
      if (!allowed.includes(row[f])) err(file, `${where}: ${f}="${row[f]}" not one of ${allowed.join('|')}`)
    }
  })
}

// --- athlete/constants.json ------------------------------------------------------------------

// Every athlete-specific number the code uses comes from here. A missing or wrong field is a
// silent, plausible-looking wrong answer everywhere downstream — most dangerously `sex`, which
// swings Mifflin-St Jeor by 166 kcal/day with nothing on screen to reveal it.
try {
  const { constants } = await import('./lib/athlete.mjs')
  const REQUIRED = {
    'athlete.name': (v) => typeof v === 'string' && v.length > 0,
    'athlete.sex': (v) => v === 'male' || v === 'female',
    'athlete.dob': (v) => /^\d{4}-\d{2}$/.test(v ?? ''),
    'athlete.heightIn': (v) => typeof v === 'number' && v > 40 && v < 90,
    // ⚠ NOT `v.includes('/')` (audit F-47). That accepted "America/Los Angeles" — a space where
    // the underscore belongs, which is exactly the typo a person makes — and every date in the
    // chart then died on a raw `RangeError: Invalid time zone specified` from deep inside
    // `localToday()`, with nothing naming the field. Ask the runtime, which is the only thing that
    // actually knows.
    'athlete.timezone': (v) => {
      if (typeof v !== 'string' || !v.includes('/')) return false
      try { new Intl.DateTimeFormat('en-CA', { timeZone: v }); return true } catch { return false }
    },
    'baseline.date': (v) => DATE_RE.test(v ?? ''),
    'baseline.weightLb': (v) => typeof v === 'number' && v > 50 && v < 500,
    'plan.proteinFloorG': (v) => typeof v === 'number' && v > 0,
    'plan.estMaintenanceKcal': (v) => typeof v === 'number' && v > 800,
  }
  for (const [path, ok] of Object.entries(REQUIRED)) {
    const value = path.split('.').reduce((o, k) => o?.[k], constants)
    if (!ok(value)) {
      err('athlete/constants.json', `${path} is missing or invalid (got ${JSON.stringify(value)})`)
    }
  }
  // --- The session-type registry (W7, audit F-15) -----------------------------------------------
  //
  // The list of session types is the athlete's, and everything downstream derives from it:
  // training.csv's type enum, the MET table, and the set that counts against the sessions floor.
  // A malformed entry is therefore a malformed enum, so these are errors rather than findings —
  // each is fixable by editing the record, which is the test.
  //
  // ⚠ `domain` is required for the same reason `metrics` requires it: an activity no domain needs
  // is a chore the coach invented (CLAUDE.md §1.1). It is NOT checked against goals.md's headings,
  // because a check that can only go green by someone picking a domain is the check that produced
  // the invented BP threshold.
  {
    const registry = Object.fromEntries(
      Object.entries(constants.sessionTypes ?? {}).filter(([k]) => !k.startsWith('_')),
    )
    const UNIVERSAL = ['rest', 'other']
    for (const [type, def] of Object.entries(registry)) {
      if (UNIVERSAL.includes(type)) {
        err('athlete/constants.json',
          `sessionTypes.${type} must not be registered — "${type}" is one of the two structural `
          + 'types scripts/lib/athlete.mjs supplies to every chart, and a chart entry would shadow it')
        continue
      }
      if (typeof def?.met !== 'number' || def.met < 0 || def.met > 25) {
        err('athlete/constants.json', `sessionTypes.${type}.met must be a MET between 0 and 25 (got ${JSON.stringify(def?.met)})`)
      }
      if (typeof def?.countsTowardFloor !== 'boolean') {
        err('athlete/constants.json',
          `sessionTypes.${type}.countsTowardFloor must be true or false — does a completed session `
          + 'of this type count against plan.sessionsPerWeekFloor? Leaving it out makes every '
          + 'session of this type invisible to the adherence count (audit F-15)')
      }
      if (!def?.domain) {
        err('athlete/constants.json',
          `sessionTypes.${type} must name the goals.md domain it serves — an activity no domain `
          + 'needs is a chore the coach invented (CLAUDE.md §1.1)')
      }
      // The double-count trap, generalised. `metOverrides.walk must stay 0` used to be the rule,
      // which only worked for a chart that happened to call it "walk". A type that declares its
      // energy is already counted in another column must cost 0 as a session, whatever it is
      // called — counting it in both places counts it twice.
      if (def?.energyCountedIn && def?.met !== 0) {
        err('athlete/constants.json',
          `sessionTypes.${type}.met must be 0: the entry says its energy is already counted in `
          + `${def.energyCountedIn}, and counting it again as a session counts it twice`)
      }
      for (const [tier, m] of Object.entries(def?.metByIntensity ?? {})) {
        if (!['light', 'moderate', 'hard'].includes(tier)) {
          err('athlete/constants.json', `sessionTypes.${type}.metByIntensity.${tier} is not a tier — use light, moderate or hard`)
        } else if (typeof m !== 'number') {
          err('athlete/constants.json', `sessionTypes.${type}.metByIntensity.${tier} must be a number (got ${JSON.stringify(m)})`)
        }
      }
    }
    // Every type actually logged must be registered. A row whose type is not in the enum is
    // already rejected above; this catches the reverse-facing half — a type that WAS legal, was
    // logged, and then dropped out of the registry, which would silently change its MET to the
    // `other` fallback on every historical row.
    const legal = new Set([...Object.keys(registry), ...UNIVERSAL])
    for (const [i, t] of readCsv(join(DATA, 'training.csv')).entries()) {
      if (t.type && !legal.has(t.type)) {
        err('training.csv', `row ${i + 2}: type "${t.type}" is not in constants.json sessionTypes`)
      }
    }
  }

  // The weekday structure IS the decision; the weekly figure is its total. `_kcalByWeekday_note`
  // has claimed they agree since 2026-08-11 — "total 12950, which equals weeklyKcalBudget exactly"
  // — and nothing checked it, while `generate-targets.mjs` writes a row from the weekdays every
  // morning and every rate projection in the chart divides the weekly figure. A three-line check
  // (audit F-13).
  //
  // ⚠ IT IS A CONSISTENCY RULE, NOT A JUDGEMENT. It never says a calorie figure is too low or too
  // high — those are findings for the coach and belong nowhere near a build (INVARIANTS.md X-12).
  // It says only that a total disagrees with its parts, which is a record contradicting itself and
  // is exactly what `data/` is allowed to refuse. The fix is arithmetic and it names itself; if
  // which figure is right is genuinely open, that is a conversation with the athlete, not an edit
  // made to clear a check.
  {
    const byDay = Object.entries(constants?.plan?.kcalByWeekday ?? {}).filter(([k]) => !k.startsWith('_'))
    const budget = constants?.plan?.weeklyKcalBudget
    if (byDay.length && typeof budget === 'number') {
      const bad = byDay.filter(([, v]) => typeof v !== 'number')
      if (bad.length) {
        err('athlete/constants.json', `plan.kcalByWeekday has non-numeric entries: ${bad.map(([k]) => k).join(', ')}`)
      } else if (byDay.length !== 7) {
        err('athlete/constants.json',
          `plan.kcalByWeekday has ${byDay.length} weekday(s), not 7 — generate-targets.mjs exits `
          + `with an error on any day it has no entry for, so a missing day is a day with no target`)
      } else {
        const sum = byDay.reduce((a, [, v]) => a + v, 0)
        if (sum !== budget) {
          err('athlete/constants.json',
            `sum(plan.kcalByWeekday) is ${sum} but plan.weeklyKcalBudget is ${budget} `
            + `(${sum > budget ? '+' : ''}${sum - budget}). The weekday entries are what `
            + `generate-targets.mjs writes each morning; the weekly figure is what every rate `
            + `projection divides. One of them is a typo — the arithmetic says which.`)
        }
      }
    }
  }

  // --- the alcohol budget lives INSIDE the calorie budget ---------------------------------------
  //
  // Same class of rule as the weekday sum above and legitimate for the same reason: the weekly FOOD
  // budget is DERIVED (`weeklyKcalBudget − weeklyAlcoholKcalBudget`, one home in
  // scripts/lib/aggregate.mjs `weeklyBudget`), and nutrition/plan.md is explicit that alcohol is
  // "planned into the weekly budget, not a penalty". An alcohol figure at or above the calorie
  // budget makes that subtraction zero or negative — a total that contradicts its own parts, which
  // is what `data/` is entitled to refuse. It says nothing about whether he drinks too much; that
  // would be judging reality, and it belongs to the coach in conversation (INVARIANTS.md X-12).
  {
    const budget = constants?.plan?.weeklyKcalBudget
    const alcohol = constants?.plan?.weeklyAlcoholKcalBudget
    if (alcohol != null) {
      if (typeof alcohol !== 'number' || !Number.isFinite(alcohol) || alcohol < 0) {
        err('athlete/constants.json',
          `plan.weeklyAlcoholKcalBudget must be a non-negative number, got ${JSON.stringify(alcohol)}`)
      } else if (typeof budget === 'number' && alcohol >= budget) {
        err('athlete/constants.json',
          `plan.weeklyAlcoholKcalBudget (${alcohol}) is not below plan.weeklyKcalBudget (${budget}), `
          + `so the derived weekly FOOD budget is ${budget - alcohol}. Alcohol is planned INSIDE the `
          + `calorie budget (nutrition/plan.md), never on top of it — one of the two figures is wrong.`)
      }
    }
  }

  // A tracked metric that no domain needs is a chore the coach invented (CLAUDE.md §1.1),
  // so the registry requires each one to name the domain it serves.
  const registry = Object.fromEntries(
    Object.entries(constants.metrics ?? {}).filter(([k]) => !k.startsWith('_')),
  )
  for (const [key, def] of Object.entries(registry)) {
    if (!def?.domain) err('athlete/constants.json', `metrics.${key} must name the goals.md domain it serves`)
    if (!['up', 'down'].includes(def?.direction)) {
      err('athlete/constants.json', `metrics.${key}.direction must be "up" or "down" (which way is progress)`)
    }
  }
  for (const [i, m] of readCsv(join(DATA, 'metrics.csv')).entries()) {
    if (m.metric && !registry[m.metric]) {
      err('metrics.csv', `row ${i + 2}: metric "${m.metric}" is not in constants.json metrics registry`)
    }
  }
} catch (e) {
  err('athlete/constants.json', `could not be read: ${e.message}`)
}

// --- Cross-file rules ------------------------------------------------------------------------

const meals = readCsv(join(DATA, 'meals.csv'))
meals.forEach((m, i) => {
  const kcal = num(m.kcal), alc = num(m.alcohol_kcal)
  // alcohol_kcal is a subset of kcal, not an addition to it. Getting this backwards
  // double-counts every drinking day.
  if (kcal != null && alc != null && alc > kcal) {
    err('meals.csv', `row ${i + 2}: alcohol_kcal (${alc}) exceeds kcal (${kcal}) — alcohol is included in kcal, not added to it`)
  }

  // data/METHOD.md rule 3a. A blank macro is NOT an honest gap: every consumer of this file
  // (rollup, compute-energy, every daily total) sums the column, so a blank contributes 0 and
  // silently biases the day downward. 2026-08-12 read as 36.7 g fat with one cell blank; the
  // true figure was 72.7 g, and both coach and athlete reasoned from the wrong number.
  // Estimate it — by difference, by build-up, from a photo — and put the method in the note.
  for (const col of ['kcal', 'protein_g', 'fat_g', 'carb_g', 'fibre_g']) {
    if (m[col] === '') {
      err('meals.csv', `row ${i + 2} (${m.date} "${(m.item || '').slice(0, 40)}"): ${col} is blank — METHOD.md rule 3a requires an estimate on every food row. A blank is read as 0 by every total. Derive it (label / by difference / build-up / photo) and state the method in the note.`)
    }
  }
})

const training = readCsv(join(DATA, 'training.csv'))
training.forEach((t, i) => {
  if (t.status === 'completed' && t.duration_min === '' && t.type !== 'rest') {
    warn('training.csv', `row ${i + 2}: completed session with no duration_min — contributes 0 to burn`)
  }
  // Mirrors the same rule in scripts/lib/rowwrite.mjs's validateRow — this is the CI backstop
  // for a kcal_override written outside the dashboard's write path (e.g. a direct file edit).
  if (t.kcal_override !== '' && !t.note) {
    err('training.csv', `row ${i + 2}: kcal_override set with no note explaining why`)
  }
  // Same mirroring for the light/moderate/hard intensity split: parts must not exceed the whole.
  const hasSplit = t.light_min || t.moderate_min || t.hard_min
  if (hasSplit && t.duration_min !== '') {
    const total = Number(t.light_min || 0) + Number(t.moderate_min || 0) + Number(t.hard_min || 0)
    if (total > Number(t.duration_min)) {
      err('training.csv', `row ${i + 2}: light_min + moderate_min + hard_min (${total}) exceeds duration_min (${t.duration_min})`)
    } else if (total < Number(t.duration_min)) {
      // A WARNING AND NOT AN ERROR, on purpose. The uncovered minutes contribute nothing to burn —
      // audit F-03's 80-minute class logged as `hard_min=20` counted 295 kcal against a real
      // ~1,180 — but erroring here would force a hand-written row to fabricate the split, which
      // CLAUDE.md §0.3 forbids. The write path (`coverIntensitySplit`) closes it for anything
      // logged through the dashboard; this catches a direct file edit and prints the fix.
      const covered = coverIntensitySplit('training.csv', t)
      warn('training.csv', `row ${i + 2} (${t.date} ${t.session}): the intensity split covers `
        + `${total} of ${t.duration_min} min — the other ${Number(t.duration_min) - total} contribute `
        + `NOTHING to burn, because compute-energy.mjs ignores duration_min once any tier is set. `
        + `Set light_min=${covered.light_min} to count them as light, or write the real split, and `
        + `say which in the note.`)
    }
  }
})

const sets = readCsv(join(DATA, 'sets.csv'))
const trainingDates = new Set(training.map((t) => t.date))
for (const [i, s] of sets.entries()) {
  if (!trainingDates.has(s.date)) err('sets.csv', `row ${i + 2}: ${s.date} has sets but no training.csv row`)
  if (s.reps === '' && s.duration_s === '') err('sets.csv', `row ${i + 2}: needs either reps or duration_s`)
}

// goals.md's strength trigger is ">10% loss of reps at fixed load AND fixed RIR". Sets without
// RIR cannot be compared against it, so an un-anchored set is a real gap, not a cosmetic one.
const noRir = sets.filter((s) => s.rir === '').length
if (noRir) warn('sets.csv', `${noRir} of ${sets.length} sets have no RIR — the strength guardrail cannot be evaluated on those`)

// NOTE ON WHAT DOES *NOT* BELONG IN THIS FILE.
//
// On 2026-08-13 the CLAUDE.md §5.2 safety floors were implemented here as hard errors — a calorie
// target below RMR, a loss rate above 1%/wk, a deficit phase past 16 weeks. That was wrong, and
// the athlete caught it: "It can't make me eat. It should inform and recommend."
//
// This validator's only duty is FIDELITY — does the file faithfully record what was decided and
// what happened? Every rule above is that shape: a malformed date, an out-of-order row, a blank
// macro that would be silently summed as zero, tier minutes exceeding their own session length.
// Each one is "this record contradicts itself", and each is fixable by editing the record.
//
// A weigh-in is not fixable by editing the record. Erroring on a fast week would have failed
// prebuild, failed the deploy, and frozen the dashboard because he stepped on a scale — with no
// edit available short of falsifying the measurement, which is the exact behaviour this repo
// exists to prevent.
//
// Judgement about whether a number is WISE lives in the coach, and is surfaced through
// data/findings.json (scripts/build-findings.mjs). Never add a rule here that judges reality
// rather than recording it.

// --- Report ----------------------------------------------------------------------------------

for (const w of warnings) console.warn(`warn  ${w}`)
for (const e of errors) console.error(`ERROR ${e}`)

if (errors.length) {
  console.error(`\n${errors.length} error(s). data/ is the source of truth — fix it before it ships.`)
  process.exit(1)
}
console.log(`data/ valid — ${warnings.length} warning(s).`)
