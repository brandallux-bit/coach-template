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
import { DATE_RE, ENERGY_COUNTED_IN, SPEC } from './lib/schema.mjs'
import { WEEKDAYS, checkWeekdayKeys } from './lib/weekdays.mjs'
import { noDailyTargetReason } from './lib/targets.mjs'
import { hasStepFeed, sessionTypeEnum, stepFeed } from './lib/athlete.mjs'
import { MOVEMENT_LEVEL_KEYS } from './lib/movement.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data')

const errors = []
const warnings = []
const err = (f, msg) => errors.push(`${f}: ${msg}`)
const warn = (f, msg) => warnings.push(`${f}: ${msg}`)

/**
 * ⚠ **THE TEMPLATE'S OWN EXAMPLE FILE IS PARSED, AND NOTHING PARSED IT.**
 *
 * `athlete/constants.template.json` is what every fork copies and what intake reads its shape
 * from, and it is hand-edited more often than any other file here. Nothing loaded it: a stray
 * comma left it invalid JSON and the whole suite stayed green, because every reader of it is
 * either a human or a chart that does not exist yet. The first thing to hit it would have been
 * somebody's first session.
 *
 * Deliberately ABOVE the no-chart gate below: this file exists on the TEMPLATE, which is exactly
 * where that gate turns everything else off.
 */
{
  const tmpl = join(DATA, '..', 'athlete', 'constants.template.json')
  if (existsSync(tmpl)) {
    try {
      JSON.parse(readFileSync(tmpl, 'utf8'))
    } catch (e) {
      err('athlete/constants.template.json', `is not valid JSON: ${e.message}. Every fork copies `
        + "this file; a stray comma here is a broken chart on somebody's first session.")
    }
  }
}

/**
 * ⚠ **AND THE TEMPLATE'S OWN SHIPPED CSVs ARE HEADER-CHECKED, FOR THE SAME REASON, ONE DIRECTORY
 * OVER.** This is the defect the block above was written for, found by asking the same question
 * about `data/` — and it was not hypothetical: `data/energy.csv` shipped for five phases without
 * `incidental_kcal`, a column added to `SPEC` when the burn model gained a second movement term.
 * Every fork inherited it, and the first thing to hit it was their first push after intake: step
 * 1 of 19 red, on a file they never touched.
 *
 * ⚠ **AND NOTHING COULD SEE IT, INCLUDING THE SUITE WRITTEN FOR EXACTLY THIS.** The row checks
 * below sit under the no-chart gate, so on the template they never ran. `test-cold-start.mjs`
 * looks like the backstop and is not: `emptyTheChart()` REWRITES every file in `data/` from
 * `SPEC.header` before validating, so the suite whose whole subject is a stranger's fork
 * overwrites the broken file with the right one and then checks the right one. A fixture that
 * repairs its subject cannot fail on it (INVARIANTS.md X-10).
 *
 * Header only, and deliberately: a shipped CSV is empty by design, so there are no rows to check
 * and an empty file is the correct state, not a gap.
 *
 * ⚠ **AND IT RUNS ONLY WHERE THE BELOW-GATE CHECK CANNOT — X-8.** The header comparison further
 * down does the same equality on a chart, *with a migration message written for that reader*:
 * "it is generated and its columns have changed — run compute-energy.mjs". Running both meant a
 * fork merging a template update that adds a column read this block's sentence FIRST, and this
 * block's sentence is false on their chart — their `energy.csv` is generated from their own data,
 * not inherited verbatim — and offers no fix, burying the one that does. Two homes for one check,
 * and the duplicate degraded the original.
 */
if (!existsSync(join(DATA, '..', 'athlete', 'constants.json'))) {
  const { SPEC } = await import('./lib/schema.mjs')
  for (const [file, spec] of Object.entries(SPEC)) {
    const path = join(DATA, file)
    if (!existsSync(path)) {
      err(file, 'is missing from the template. Every fork starts from these files; one that is '
        + 'absent is a chart that cannot record the thing it names.')
      continue
    }
    const first = readFileSync(path, 'utf8').split('\n')[0].replace(/\r$/, '').trim()
    const want = spec.header.join(',')
    if (first !== want) {
      err(file, `header does not match SPEC — every fork inherits this file verbatim, so it is `
        + `their build that goes red, on a file they never touched.\n    expected: ${want}\n`
        + `    shipped:  ${first}`)
    }
  }
}

// The template repo has no chart yet — no constants, no rows. There is nothing further to
// validate, and failing here would just teach people to ignore a red build.
if (!existsSync(join(DATA, '..', 'athlete', 'constants.json'))) {
  for (const e of errors) console.error(`ERROR ${e}`)
  if (errors.length) {
    console.error(`\n${errors.length} error(s) in the template's own files.`)
    process.exit(1)
  }
  console.log('No athlete/constants.json — template repo with no chart yet. Nothing to validate.')
  process.exit(0)
}

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
// See rule 3a below. A date, or null for "this rule has always applied to this chart".
const MACRO_RULE_FROM = constants?.plan?.macroCompletenessFrom || null
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
    // ⚠ **A DERIVED FILE WITH A STALE HEADER IS A MIGRATION, NOT A MALFORMED FILE, AND THE MESSAGE
    // HAS TO SAY WHICH.** `energy.csv` is generated; when a template update adds a column, every
    // existing fork's committed copy is one column short the moment it merges — and "header
    // mismatch, expected …, got …" tells someone their data is broken when in fact one command
    // fixes it. The regenerator cannot run first: `check-all` validates before it computes, by
    // design, because a stale ledger is cheaper to detect than to recompute.
    const stale = expected.startsWith(`${headerLine},`)
    err(file, stale && file === 'energy.csv'
      ? `is generated and its columns have changed — it is missing ${expected.slice(headerLine.length + 1)}.\n`
        + '    Run `node scripts/compute-energy.mjs` and commit the result. Nothing is wrong with\n'
        + '    your data; see SETUP.md, "After a merge, regenerate what is derived".'
      : `header mismatch\n    expected: ${expected}\n    got:      ${headerLine}`)
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
  // ⚠ **NOT EVERY CHART HAS AN ENERGY PLAN, AND THE VALIDATOR MUST NOT INVENT ONE.** This list
  // used to require a baseline bodyweight, a protein floor and a maintenance estimate on every
  // chart — so a symptom-control chart with no energy domain had to make up three numbers to
  // commit anything, from the check whose job is to refuse invented numbers. The identity fields
  // stay universal (RMR is computed from them whenever a weigh-in exists); the three energy fields
  // are required exactly where the chart runs daily calorie targets, and `plan.dailyKcalTargetPolicy`
  // is the one home that says whether it does (scripts/lib/targets.mjs).
  let energyPlan = true
  try { energyPlan = !noDailyTargetReason(constants) } catch { energyPlan = true }
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
    // Optional on every chart: the ledger stores pounds and inches regardless, and this only
    // changes what the Log tab asks for and how it labels what it shows.
    'athlete.units': (v) => v === undefined || v === 'imperial' || v === 'metric',
    ...(energyPlan ? {
      'baseline.weightLb': (v) => typeof v === 'number' && v > 50 && v < 500,
      'plan.proteinFloorG': (v) => typeof v === 'number' && v > 0,
      'plan.estMaintenanceKcal': (v) => typeof v === 'number' && v > 800,
    } : {
      // Present is fine; present and malformed is not.
      'baseline.weightLb': (v) => v === undefined || (typeof v === 'number' && v > 50 && v < 500),
      'plan.proteinFloorG': (v) => v === undefined || (typeof v === 'number' && v > 0),
      'plan.estMaintenanceKcal': (v) => v === undefined || (typeof v === 'number' && v > 800),
    }),
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
      // A value nothing recognises silently disables every rule keyed off this field — see
      // ENERGY_COUNTED_IN in scripts/lib/schema.mjs for what that costs.
      const countedIn = String(def?.energyCountedIn ?? '').trim()
      if (countedIn && !ENERGY_COUNTED_IN.includes(countedIn)) {
        err('athlete/constants.json',
          `sessionTypes.${type}.energyCountedIn is ${JSON.stringify(def.energyCountedIn)}, which `
          + `names no column this system writes. It must be one of: ${ENERGY_COUNTED_IN.join(', ')}. `
          + 'It says "another column already holds this activity\'s energy, so do not price it as '
          + 'a session" — a name nothing recognises makes that promise to nobody, and the activity '
          + 'is then counted nowhere at all.')
      }
      if (def?.energyCountedIn && def?.met !== 0) {
        err('athlete/constants.json',
          `sessionTypes.${type}.met must be 0: the entry says its energy is already counted in `
          + `${def.energyCountedIn}, and counting it again as a session counts it twice`)
      }
      // `standingDurationMin` prices an untimed session on BOTH the ledger and the forward view,
      // so a string or a nonsense figure there is a wrong burn on every such row rather than a
      // missing one — which is the direction that does not announce itself.
      if (def?.standingDurationMin !== undefined
        && (typeof def.standingDurationMin !== 'number' || !(def.standingDurationMin > 0))) {
        err('athlete/constants.json',
          `sessionTypes.${type}.standingDurationMin must be a positive number of minutes, not `
          + `${JSON.stringify(def.standingDurationMin)} — omit it entirely for a type whose length `
          + 'actually varies, which is most of them')
      }
      // A key nothing validates is a key a typo can disable silently: `loading: "false"` is a
      // truthy string, and the resolver's `=== true` test would then read it as false while
      // `!== undefined` stopped the default from covering for it.
      if (def?.loading !== undefined && typeof def.loading !== 'boolean') {
        err('athlete/constants.json',
          `sessionTypes.${type}.loading must be true or false, not ${JSON.stringify(def.loading)} `
          + '— omit it entirely to take the default (met > 0 and no energyCountedIn)')
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

  /**
   * ⚠ **`program.conditioningMenu` — A LIST THE CODE READS MUST NAME SESSIONS THAT EXIST.**
   *
   * `check-suspensions.mjs` holds every name here to the same suspension check the weekly template
   * gets, so an option built on a movement the block later took out fails the build instead of
   * being proposed. That only works if the names are the ones `prescriptions.csv` actually uses: a
   * typo does not error anywhere by itself, it just quietly removes an option from the guard AND
   * from what `skills/session-recommendation` may choose.
   *
   * Names only, and the shape is a flat array for that reason — the contents and the selection
   * rules live in the menu document, and a second copy of them here would be a second home. The
   * whole key is optional and omitting it is normal: building a session from the last three days
   * is a complete answer.
   */
  {
    const menu = constants?.program?.conditioningMenu
    if (menu !== undefined) {
      if (!Array.isArray(menu)) {
        err('athlete/constants.json',
          `program.conditioningMenu must be an ARRAY of session names, not ${JSON.stringify(menu)}. `
          + 'Names only: the options\' contents and the rule for building a custom one live in the '
          + 'menu document, and a second copy of them here is a second home for one thing.')
      } else if (!menu.length) {
        err('athlete/constants.json',
          'program.conditioningMenu is empty. A menu with no options is a key that reads as a '
          + 'choice and offers none — delete it, or name the options.')
      } else {
        /**
         * ⚠ **A WARNING, NOT AN ERROR — because an option with no set-by-set rows is legitimate.**
         *
         * The first version rejected it. A whole-session activity — a flat walk, a swim, a class —
         * has nothing to prescribe set by set and is a perfectly good menu option; rejecting it
         * forces the machine-readable list to be a strict subset of the document's menu, with
         * nothing checking the two agree, and the excluded option is exactly the one then sitting
         * outside the suspension guard this key exists to feed. So the list keeps it and the
         * warning says what it costs: nothing to hold to the block's suspension list, and nothing
         * for a surface to render.
         */
        const known = new Set(readCsv(join(DATA, 'prescriptions.csv')).map((r) => r.session))
        for (const name of menu) {
          if (typeof name !== 'string' || !name.trim()) {
            err('athlete/constants.json',
              `program.conditioningMenu holds ${JSON.stringify(name)}, which is not a session name.`)
          } else if (!known.has(name)) {
            warn('athlete/constants.json',
              `program.conditioningMenu names "${name}", which no row of data/prescriptions.csv `
              + 'uses as a session. That is correct for a whole-session activity like a walk, and '
              + 'is what it costs: nothing renders it set by set, and check-suspensions.mjs has no '
              + 'rows to hold against the block\'s suspension list. If it is meant to have a '
              + 'prescription, write its rows.')
          }
        }
      }
    }
  }

  /**
   * ⚠ **THE TREND WINDOW KNOBS — a wrong one here changes every projected date silently.**
   *
   * `trendWindowSize` and `trendLagDays` decide what "the current level" and "the rate" mean, and
   * nothing on any page shows them. A zero or a negative makes the estimator return null, so the
   * chart would simply stop projecting with no error and no page saying why; a string is worse,
   * because `slice` and date arithmetic both coerce it into something plausible.
   */
  {
    for (const key of ['trendWindowSize', 'trendLagDays']) {
      const v = constants?.plan?.[key]
      if (v === undefined) continue
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
        err('athlete/constants.json',
          `plan.${key} must be a whole number of ${key === 'trendLagDays' ? 'days' : 'readings'} `
          + `and at least 1, not ${JSON.stringify(v)}. Omit it to take the shipped default. `
          + 'Below 1 the trend returns nothing and every projection on the chart quietly reads TBD '
          + 'with no error anywhere saying why.')
      }
    }
    // ⚠ **A SHORT LAG IS LEGAL AND IS WHERE THIS KNOB STARTS TO MISLEAD.** The shorter the span
    // between the two windows, the more of the "rate" is whatever the scale happened to say that
    // morning — and the resulting figure is marked firm, because firmness counts READINGS, not
    // days. A warning rather than an error: a chart measuring twice a day may genuinely want it.
    const lag = constants?.plan?.trendLagDays
    if (typeof lag === 'number' && lag >= 1 && lag < 7) {
      warn('athlete/constants.json',
        `plan.trendLagDays is ${lag}. Under a week, the two windows sit close enough together that `
        + 'day-to-day noise dominates the rate — and the figure is still marked firm, because that '
        + 'counts readings rather than days. Every projected date on the chart moves with this. '
        + 'Deliberate on a chart that measures several times a day; check it on any other.')
    }
  }

  /**
   * ⚠ **`plan.targetRateLbPerWk` IS A RANGE, AND A SCALAR THERE 500s THE DASHBOARD.**
   *
   * `Plan` types it `number[]` and `src/app/today/page.tsx` calls `.filter` on it unguarded, so a
   * chart that wrote `0.75` instead of `[0.5, 0.75]` renders `TypeError: … .filter is not a
   * function` — a blank page, not a wrong number. Nothing validated the key at all; `findings.mjs`
   * guards with `Array.isArray` and therefore reads a scalar as "no rate on file", so the chart
   * ALSO went quiet about the rate rather than complaining. Two silent failures and one loud one,
   * from one plausible edit.
   *
   * Found by an adversarial review of the movement work: `scripts/test-cold-start.mjs`'s own
   * "majority configuration" fixture was in exactly this shape, so the whole cold-start suite was
   * green on a chart no page could render.
   */
  {
    const rate = constants?.plan?.targetRateLbPerWk
    const ok = Array.isArray(rate) && rate.length >= 1 && rate.length <= 2
      && rate.every((v) => typeof v === 'number' && Number.isFinite(v))
    if (rate !== undefined && !ok) {
      err('athlete/constants.json',
        `plan.targetRateLbPerWk must be an array of one or two numbers — [acceptable, goal] — not `
        + `${JSON.stringify(rate)}. It is a RANGE because a single figure turns "on pace" into a `
        + 'pass/fail against a number nobody promised. A scalar here throws on /today and reads as '
        + '"no rate on file" everywhere else.')
    }
  }

  /**
   * ⚠ **THE MOVEMENT DECLARATION — WHICH OF THE TWO CONFIGURATIONS THIS CHART IS IN.**
   *
   * `plan.stepFeed` names the automation that writes `data/steps.csv`, or is absent. `plan.
   * movementOutsideExerciseLevel` describes an ordinary day for a chart that has no such feed. They
   * fill ONE slot in the burn model between them, and the errors below are the three ways a chart
   * can end up with that slot wrong in a way nothing else would notice.
   */
  {
    const plan = constants?.plan ?? {}
    // One home for "does this chart have a feed" — see hasStepFeed in scripts/lib/athlete.mjs.
    const feed = hasStepFeed()

    if (plan.stepFeed !== undefined && typeof plan.stepFeed !== 'string') {
      err('athlete/constants.json',
        `plan.stepFeed must be the NAME of the automation that writes data/steps.csv (a string), `
        + `not ${JSON.stringify(plan.stepFeed)}. It is a name rather than a true/false so a second `
        + 'writer added later is a new value here, not a new branch through every consumer. Omit '
        + 'it, or leave it empty, on a chart with no wearable feed — which is the common case.')
    }

    if (plan.movementOutsideExerciseLevel !== undefined
      && !MOVEMENT_LEVEL_KEYS.includes(String(plan.movementOutsideExerciseLevel))) {
      err('athlete/constants.json',
        `plan.movementOutsideExerciseLevel is ${JSON.stringify(plan.movementOutsideExerciseLevel)}, `
        + `which is not one of ${MOVEMENT_LEVEL_KEYS.join(' | ')}. It describes how much this `
        + 'athlete moves OUTSIDE deliberate exercise — a logged walk is priced as a session, so a '
        + 'level covering it too would count that walk twice. The descriptions are in '
        + 'scripts/lib/movement.mjs and skills/intake asks the question.')
    }

    // ⚠ **A LEVEL BESIDE A FEED IS TWO ANSWERS TO ONE QUESTION.** The feed already counts the
    // movement the level describes. `movementKcalFor` resolves it in the feed's favour rather than
    // adding both, so this never becomes a wrong burn — but a chart carrying a level nothing reads
    // is a chart whose owner believes a number is in force when it is not, and that belief is the
    // thing that outlives the file.
    if (feed && plan.movementOutsideExerciseLevel !== undefined) {
      err('athlete/constants.json',
        `plan.movementOutsideExerciseLevel is set AND plan.stepFeed names "${stepFeed()}". The `
        + 'feed counts that movement already, so the level is ignored — delete one. Keep the feed if it '
        + 'is really arriving; delete the feed and keep the level if it is not.')
    }

    /**
     * ⚠ **STEPS ARRIVING WITH NO DECLARATION IS THE ONE STATE THAT DOUBLE-COUNTS, and it is the
     * state an existing chart lands in by merging this change and skipping the migration.**
     *
     * `compute-energy.mjs` will not write both terms on one row whatever this file says — the
     * invariant is guaranteed there, per the ⚠ on `incidentalKcal`. But a chart in this state is
     * still wrong in a way it cannot see: its declaration says "no feed", so `/today` renders the
     * described-level row while the ledger holds the counted one, `check-steps-gap.mjs` stops
     * watching a feed that is still writing, and the stale-feed finding goes quiet. The rows are
     * the evidence and they contradict the declaration; only the chart's owner can say which is
     * right, so this is an error rather than a silent normalisation.
     *
     * A chart genuinely switching away from a feed keeps its rows — `data/METHOD.md` forbids
     * hand-editing that file — so the answer there is to leave `plan.stepFeed` declared. The
     * history stays interpretable and new days simply stop arriving, which the stale-feed finding
     * will say out loud.
     */
    if (!feed) {
      const stepsPath = join(DATA, 'steps.csv')
      const stepRows = existsSync(stepsPath)
        ? readCsv(stepsPath).filter((r) => String(r?.steps ?? '').trim() !== '').length
        : 0
      if (stepRows > 0) {
        err('athlete/constants.json',
          `data/steps.csv holds ${stepRows} row(s) but plan.stepFeed is not set. Something IS `
          + 'writing that file, so this chart has a feed and has not said so: the ledger counts '
          + 'those steps while every surface reads the chart as having no feed, and the daily gap '
          + 'check stops watching an automation that is still running. Name the writer in '
          + 'plan.stepFeed (SETUP.md \u00a74b) \u2014 including on a chart that has SINCE stopped '
          + 'using one, because the historical rows stay and data/METHOD.md forbids deleting them.')
      }
    }

    // ⚠ **`energyCountedIn: "steps"` ON A CHART WITH NO STEP FEED IS MOVEMENT COUNTED NOWHERE.**
    // The registry entry says "do not cost this as a session, its energy is already in the step
    // column" — and on a chart with no feed that column is blank forever. The activity then costs
    // nothing, anywhere, and the day it happened looks like a rest day with a name on it. This is
    // the exact double-count rule read from the other side, and it is the half a chart hits when
    // it copies a registry from a chart that DOES have a feed.
    if (!feed) {
      for (const [type, def] of Object.entries(constants?.sessionTypes ?? {})) {
        if (ENERGY_COUNTED_IN.includes(String(def?.energyCountedIn ?? '').trim())) {
          err('athlete/constants.json',
            `sessionTypes.${type}.energyCountedIn is "steps", but this chart declares no `
            + 'plan.stepFeed — so data/steps.csv is empty and that energy is counted NOWHERE. '
            + 'Either declare the feed, or give the type a real MET: with no feed, nothing else '
            + 'is counting this movement, so pricing it as a session is correct (and set '
            + '`loading: false` if it is not the kind of session that tires anyone out).')
        }
      }
    }
  }

  // `program.setRestSec` and `program.dailyBlockType`, the two keys the duration resolver reads.
  {
    const prog = constants?.program ?? {}
    if (prog.setRestSec !== undefined && (typeof prog.setRestSec !== 'number' || prog.setRestSec < 0)) {
      err('athlete/constants.json',
        `program.setRestSec must be a non-negative number of seconds, not `
        + `${JSON.stringify(prog.setRestSec)} — omit it to take the shipped default`)
    }
    // ⚠ A `dailyBlockType` naming a type that is not registered prices the daily block at NOTHING
    // and says nothing about why: `addDailyBlock` returns early, the forward view silently loses
    // a session every day, and no check anywhere would mention it.
    if (prog.dailyBlockType !== undefined) {
      // `sessionTypeEnum()` is the one home for "every legal type", universals included.
      const legal = new Set(sessionTypeEnum())
      if (!legal.has(prog.dailyBlockType)) {
        err('athlete/constants.json',
          `program.dailyBlockType is "${prog.dailyBlockType}", which is not a registered session `
          + `type (${[...legal].join(', ')}). The forward view prices the daily block from that `
          + 'type\'s registry entry, so an unregistered name silently drops it from every day.')
      } else if (constants?.sessionTypes?.[prog.dailyBlockType]?.standingDurationMin == null) {
        err('athlete/constants.json',
          `program.dailyBlockType is "${prog.dailyBlockType}" but that type declares no `
          + 'standingDurationMin, so the block has no length and the forward view drops it. Give '
          + 'the type a standing duration, or remove dailyBlockType.')
      }
    }
  }

  /**
   * A key that USED to mean something and no longer does, and a declaration the record contradicts.
   * Both are silent failures: nothing errors, and a figure quietly stops being used.
   */
  {
    const prog = constants?.program ?? {}
    // ⚠ **`program.dailyRehabMin` IS RETIRED, AND ITS LEFTOVER IS THE DEFAULT STATE OF EVERY
    // EXISTING FORK the moment it merges the commit that retired it.** The block's length moved to
    // `sessionTypes.<type>.standingDurationMin` with `program.dailyBlockType` naming the type. With
    // the old key still sitting there and no new one, `addDailyBlock` returns early and the daily
    // block vanishes from every day of the forward view — which is exactly the outcome the
    // `dailyBlockType` checks above refuse to allow, arrived at from the other direction.
    if (prog.dailyRehabMin !== undefined) {
      err('athlete/constants.json',
        'program.dailyRehabMin is retired and nothing reads it. The daily block\'s length is now a '
        + 'property of the ACTIVITY: move the figure to sessionTypes.<type>.standingDurationMin and '
        + 'name that type in program.dailyBlockType. Until you do, the block is priced on the '
        + 'ledger and absent from the forward view, with nothing else saying so. See SETUP.md, '
        + '"Constants a merge may ask you to move".')
    }

    // ⚠ **A STANDING DURATION THE RECORD CONTRADICTS IS A WRONG NUMBER ON BOTH SIDES.** Declaring
    // it says the activity always runs that long, and the resolver now prefers it over observed
    // comparables precisely so the ledger and the forward view agree. That is only safe if a
    // declaration the timed rows disagree with gets said out loud. A WARNING, not an error: which
    // figure is right is a conversation, and a check that cannot go green without someone choosing
    // a number must not be written (INVARIANTS.md X-12).
    const timed = readCsv(join(DATA, 'training.csv'))
      .filter((r) => r.status === 'completed' && num(r.duration_min) != null)
    for (const [type, def] of Object.entries(constants?.sessionTypes ?? {})) {
      const declared = num(def?.standingDurationMin)
      if (type.startsWith('_') || declared == null) continue
      const mins = timed.filter((r) => r.type === type).map((r) => num(r.duration_min))
      if (mins.length < 3) continue
      const mean = mins.reduce((a, b) => a + b, 0) / mins.length
      if (Math.abs(mean - declared) / declared > 0.25) {
        warn('athlete/constants.json',
          `sessionTypes.${type}.standingDurationMin is ${declared} min, but the ${mins.length} `
          + `timed "${type}" sessions on file average ${Math.round(mean)} min. The declaration is `
          + 'what the ledger AND the forward view both price this session at, so one of the two is '
          + 'wrong: correct the declaration, or drop it and let the resolver average the record.')
      }
    }
  }

  // ⚠ **THE KEYS, NOT THEIR COUNT — AND `missing` COUNTS AS MUCH AS `unexpected`, WHICH THE FIRST
  // VERSION OF THIS CHECK COMPUTED AND THEN THREW AWAY.**
  //
  // It reported only when a key was UNEXPECTED, so two reachable shapes walked straight past it
  // into exactly the failure it was written to stop:
  //
  //   • SIX correct keys and no seventh. Nothing unexpected, so nothing said — and
  //     `generate-targets.mjs` then exits 1 on that one weekday, every week, forever. Worse than
  //     the lower-case case, because `--fill-gaps` aborts mid-loop on the first day it cannot
  //     write, so `check-targets-gap.mjs` fails the build and prints a remedy that can never
  //     succeed.
  //   • A map holding nothing but its `_comment` — **which is literally the shape
  //     `athlete/constants.template.json` ships.** Zero non-`_` keys meant zero unexpected keys
  //     meant silence, and the sum check below cannot cover it either because that one is gated on
  //     `weeklyKcalBudget`, which is not required. A user who copies the template and fills in
  //     everything except the weekday map gets no calorie target on any day, ever, with the
  //     validator calling the chart valid.
  //
  // WHY IT MATTERS AT ALL: every weekday lookup in the code produces `Mon`, and the template
  // documented these as `mon|tue|…` in two `_comment` strings AND its `_example`. Seven right
  // numbers under seven wrong names — or six right names — is a chart where every single day has
  // no calorie target, which is the failure CLAUDE.md §0.3 and data/METHOD.md both name.
  //
  // ⚠ **A CHART MAY LEGITIMATELY HAVE NO WEEKDAY MAP, AND `dailyKcalTargetPolicy` IS HOW IT SAYS
  // SO.** A symptom-control chart, or one where a number on a screen is itself the risk, opts out
  // in writing with a reason. This check must never be the thing that forces a chart to invent a
  // calorie figure — so it asks the same question `generate-targets.mjs` and
  // `check-targets-gap.mjs` already ask, through the same one home.
  {
    const map = constants?.plan?.kcalByWeekday
    const keys = Object.keys(map ?? {}).filter((k) => !k.startsWith('_'))
    let optedOut = null
    try {
      optedOut = noDailyTargetReason(constants)
    } catch (e) {
      // The policy is "none" with no reason recorded. That is its own error and it belongs here,
      // where a malformed chart is reported, rather than as a throw out of a validator.
      err('athlete/constants.json', e.message)
      optedOut = 'malformed'
    }
    if (!optedOut && !keys.length) {
      err('athlete/constants.json',
        'plan.kcalByWeekday has no weekday entries. Every day needs a calorie target and this map '
        + `is the fallback that always answers — seven keys, exactly ${WEEKDAYS.join(', ')}. `
        + 'A chart that genuinely runs without daily targets says so in writing: set '
        + 'plan.dailyKcalTargetPolicy to "none" and record why in plan._dailyKcalTargetPolicy_note.')
    } else if (!optedOut) {
      const { ok, missing, unexpected } = checkWeekdayKeys(map)
      if (!ok) {
        const parts = []
        if (unexpected.length) parts.push(`does not use ${unexpected.join(', ')}`)
        if (missing.length) parts.push(`has no entry for ${missing.join(', ')}`)
        err('athlete/constants.json',
          `plan.kcalByWeekday: generate-targets.mjs ${parts.join(' and ')} — the keys are exactly `
          + `${WEEKDAYS.join(', ')}, case-sensitive. A weekday the lookup cannot find is a day `
          + 'with no calorie target, and it fails every time that weekday comes round.')
      }
    }
  }

  // `program.weeklyTemplate` is looked up with the same key by `planDay()` and by the
  // session-repeat check, and it failed the same way for the same documented reason.
  //
  // ⚠ **MISSING DAYS ARE LEGAL HERE AND ONLY HERE**, which is why this is not the check above with
  // a different field name: a template that names Monday, Wednesday and Saturday is a three-day-a
  // -week program, not a broken map. A key the lookup cannot find is still an error, because that
  // day's session silently resolves to nothing.
  {
    const wt = constants?.program?.weeklyTemplate
    if (wt && Object.keys(wt).filter((k) => !k.startsWith('_')).length) {
      const { unexpected } = checkWeekdayKeys(wt)
      if (unexpected.length) {
        err('athlete/constants.json',
          `program.weeklyTemplate is keyed ${unexpected.join(', ')} — the keys are exactly `
          + `${WEEKDAYS.join(', ')}, case-sensitive, or the day's session silently resolves to `
          + 'nothing. A weekday may be ABSENT (a three-day-a-week program names three); it may '
          + 'not be spelled a way the lookup cannot find.')
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
  // is what `data/` is entitled to refuse. It says nothing about whether they drink too much; that
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
    // The registry's own `_comment` says every entry must name its unit and `src/lib/data.ts` types
    // it as required — but nothing checked it, so an entry without one built green and rendered
    // `undefined` beside the number. A documented "must" with no check is a comment, not a rule.
    if (!String(def?.label ?? '').trim()) err('athlete/constants.json', `metrics.${key} must carry a label — it is what every page prints instead of the raw key`)
    if (!String(def?.unit ?? '').trim()) {
      err('athlete/constants.json',
        `metrics.${key} must name its unit — a bare number with no unit is not a reading, and `
        + 'every surface that renders this one prints the unit beside it. Use the athlete\'s own '
        + 'words for it ("0-3 scale", "minutes", "mmHg").')
    }
    if (!['up', 'down'].includes(def?.direction)) {
      err('athlete/constants.json', `metrics.${key}.direction must be "up" or "down" (which way is progress)`)
    }
    // ⚠ **`feed` AND `cadence` DECIDE WHETHER THE COACH CHASES THIS METRIC**, which is why a typo
    // in either is worth a build failure rather than a silent default: `manaul` would read as
    // "nothing writes this" and turn an automated reading into a daily question, and a mis-typed
    // cadence turns a daily metric into one nobody ever asks about. Both are optional and both
    // default — an entry that names neither is a manual, episodic one, which is the pair that
    // costs a question nobody asks rather than a nag about something already recorded.
    if (def?.feed !== undefined && !['manual', 'automated'].includes(def.feed)) {
      err('athlete/constants.json',
        `metrics.${key}.feed must be "manual" or "automated", not ${JSON.stringify(def.feed)} — `
        + 'does anything write this without the athlete saying it? Omit it for manual, which is '
        + 'the default.')
    }
    if (def?.cadence !== undefined && !['daily', 'episodic', 'lab'].includes(def.cadence)) {
      err('athlete/constants.json',
        `metrics.${key}.cadence must be "daily", "episodic" or "lab", not `
        + `${JSON.stringify(def.cadence)}. Daily means a gap is worth asking about; episodic means `
        + 'it only exists when it happens; lab means somebody else produces it on their own '
        + 'schedule. Omit it for episodic, which is the default.')
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
  // silently biases the day downward. One blank fat cell on a real day halved that day's fat total,
  // and both coach and athlete reasoned from the wrong number for as long as it stood.
  // Estimate it — by difference, by build-up, from a photo — and put the method in the note.
  //
  // ⚠ **A chart ADOPTS this rule on a date, and rows before it are exempt.**
  // `plan.macroCompletenessFrom` in `athlete/constants.json`, absent by default, which means
  // "always" — the correct behaviour for a chart with no legacy rows. A chart that logged under
  // the older permissive wording has rows that cannot be brought into compliance without
  // fabricating macros nobody measured, and **rule 3 forbids inventing a number more strongly
  // than 3a requires one.** Backfilling by real derivation (label, by difference, build-up) is
  // always better and is what the date is there to make optional rather than blocking; move the
  // date back as rows get filled in.
  for (const col of ['kcal', 'protein_g', 'fat_g', 'carb_g', 'fibre_g']) {
    if (m[col] === '' && (!MACRO_RULE_FROM || m.date >= MACRO_RULE_FROM)) {
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
// The CLAUDE.md §5.2 safety floors were once implemented here as hard errors — a calorie target
// below RMR, a loss rate above the ceiling, a deficit phase past its cap. That was wrong, and an
// athlete caught it: a validator cannot make anyone eat. It informs and recommends; the record is
// the record, and refusing to write down what actually happened does not change what happened.
//
// This validator's only duty is FIDELITY — does the file faithfully record what was decided and
// what happened? Every rule above is that shape: a malformed date, an out-of-order row, a blank
// macro that would be silently summed as zero, tier minutes exceeding their own session length.
// Each one is "this record contradicts itself", and each is fixable by editing the record.
//
// A weigh-in is not fixable by editing the record. Erroring on a fast week would have failed
// prebuild, failed the deploy, and frozen the dashboard because they stepped on a scale — with no
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
