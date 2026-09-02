#!/usr/bin/env node
/**
 * **Day one, for somebody who is not this athlete.**
 *
 * The acceptance test for W7 is blunt: a stranger forks the template, runs intake, and gets a
 * correct chart. This suite is that sentence, executed. It builds two repositories in a temp
 * directory — a real `git clone` of the working tree, so nothing is stubbed — and runs the actual
 * suite inside them.
 *
 *   STATE A · no chart at all.        The pristine template, and every session of a multi-session
 *                                     intake before the last one. `check-all` must go GREEN, with
 *                                     the chart-dependent steps skipped and said out loud.
 *   STATE B · a chart, and no rows.   Intake has just finished. `check-all` must go GREEN. This is
 *                                     the state that used to produce six failures across three
 *                                     suites (audit F-30) and a raw ENOENT from five scripts on a
 *                                     file that is not in this repository (F-17).
 *   STATE C · rows, and no step feed. **The majority configuration, and until this existed it had
 *                                     no coverage anywhere.** See below.
 *
 * ⚠ **WHY STATE C IS NOT AN EXTRA — IT IS THE CONFIGURATION MOST FORKS WILL BE IN.** The step feed
 * this repo ships needs an Apple Watch worn all day plus a hand-built iOS Shortcut that took real
 * effort to get working. `SETUP.md` §4 already calls it optional, and most users will decline. So
 * "rows, and no feed" is the DEFAULT case, not a degraded one — and neither other state can see
 * it: State A and State B have no rows to average, and the one live chart this repo is developed
 * against has a feed, so its suite is green on code that dies without one.
 *
 * That gap was not theoretical. Run against a real no-feed chart once, this configuration surfaced
 * a hard `TypeError` that took `check-all` down at step 11 of 18 — `observedDailyBurn` returns
 * null whenever the ledger holds fewer than `MIN_DAYS_FOR_OBSERVED_BURN` complete rows, and
 * `compute-energy.mjs` gates `complete` on `stepsKcal != null`, so a chart with no feed has
 * `complete='n'` on EVERY row for the life of the chart and that mean is null forever. State C is
 * how that stays fixed, and how the next one is found here rather than in somebody's live chart.
 *
 * **The athlete in State B is deliberately nobody this repo has met** — a different sex, height,
 * timezone, domain set and session-type registry. A green run therefore says something about the
 * code rather than about a fixture tuned to the chart it was written against.
 *
 * WHAT THIS DOES NOT COVER, stated plainly rather than implied: **the dashboard build.**
 * `npm run build` plus `scripts/smoke-routes.mjs` is a two-minute job with a network install behind
 * it, and putting it in `check-all` would gate every logged meal on a Next.js compile — the same
 * argument that keeps `test-git-sync.mjs` out (X-6). What this suite does assert is the layer the
 * pages read from: State B builds `src/generated/data.json` for a chart with no rows and checks
 * that the registry, the floor set and the copy all resolve. The remaining gap is a page rendering
 * an empty bundle, which `scripts/smoke-routes.mjs` covers for the live chart only. **A fresh
 * chart's five routes are not smoke-tested, and that is open work.**
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SPEC } from './lib/schema.mjs'
import { NO_CHART_MESSAGE } from './lib/athlete.mjs'
import { MIN_DAYS_FOR_OBSERVED_BURN, observedDailyBurn } from './lib/aggregate.mjs'
import { weekdayKey } from './lib/weekdays.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failed = 0
/** `--keep` leaves each state's temp repo on disk, named. The states are built and destroyed in
 *  one process, so without it a failure inside a clone is only ever visible as captured output. */
const KEEP = process.argv.includes('--keep')
const discard = (dir) => (KEEP ? console.log(`       (kept: ${dir})`) : rmSync(dir, { recursive: true, force: true }))
const ok = (name) => console.log(`  ok   ${name}`)
const fail = (name, detail = '') => { failed++; console.log(`  FAIL ${name}\n${String(detail).split('\n').map((l) => `       ${l}`).join('\n')}`) }

/**
 * A chart that is not this one. Every field is the shape intake writes, and nothing in it is
 * recognisable: if a check still only passes for a 59-year-old man in Los Angeles who grapples,
 * it fails here.
 */
const FRESH_CHART = {
  _README: 'A chart written by intake. See data/METHOD.md.',
  athlete: { name: 'Wren', pronouns: 'they/them', sex: 'female', dob: '1988-03', heightIn: 65, timezone: 'Europe/Lisbon' },
  baseline: {
    date: '2026-08-10',
    weightLb: 150,
    _provenance: {
      date: {
        class: 'athlete-stated', asOf: '2026-08-10',
        measured: 'data/body.csv row 1 — the day they started.',
        source: 'intake session 1',
        note: 'Theirs. It is the day they started and the day their readings begin.',
      },
      weightLb: {
        class: 'athlete-stated', asOf: '2026-08-10',
        quote: 'I weighed 150 this morning.',
        source: 'intake session 1',
        note: 'The athlete\'s own reported morning weigh-in.',
      },
    },
  },
  plan: {
    proteinFloorG: 110,
    estMaintenanceKcal: 2100,
    // Not the athlete's and not the coach's: `CLAUDE.md` §7 states this figure, and `README.md`
    // and two skills render it. A chart that omits it leaves those statements pointing at nothing,
    // which `test-single-home.mjs` reports — correctly, and it is why `skills/intake` writes it.
    adherenceRoutingPct: 80,
    weeklyKcalBudget: 12_250,
    /**
     * ⚠ **`Mon`, NOT `mon`.** Every weekday lookup in this repo produces a capitalised
     * three-letter key. The template documented these as `mon|tue|…` in two `_comment` strings
     * AND in its own `_example`, so a chart that followed its own template had seven right numbers
     * under seven wrong names — which is a chart where `generate-targets.mjs` exits 1 every
     * morning and NO DAY HAS A CALORIE TARGET, forever. Nothing caught it because this fixture had
     * no weekday map at all.
     */
    kcalByWeekday: { Mon: 1750, Tue: 1750, Wed: 1750, Thu: 1750, Fri: 1750, Sat: 1750, Sun: 1750 },
    _provenance: {
      weeklyKcalBudget: {
        class: 'derived', asOf: '2026-08-14', inputs: 'sum of plan.kcalByWeekday', source: 'intake',
        note: 'Arithmetic over the weekday map, not a separate decision.',
      },
      kcalByWeekday: {
        class: 'coach-proposed-unconfirmed', asOf: '2026-08-14', source: 'intake',
        note: 'The coach split the week flat; the athlete has not asked for a different shape.',
      },
      proteinFloorG: {
        class: 'coach-proposed-unconfirmed', asOf: '2026-08-14', source: 'intake',
        note: 'The coach set this at intake; the athlete has not ruled on it.',
      },
      estMaintenanceKcal: {
        class: 'derived', asOf: '2026-08-14', inputs: 'Mifflin-St Jeor RMR x 1.5',
        source: 'intake',
        note: 'Arithmetic off the athlete\'s own physiology; nothing here is a choice of theirs.',
      },
      adherenceRoutingPct: {
        class: 'external', asOf: '2026-08-14', source: 'CLAUDE.md §7',
        note: 'A standing routing rule in the charter, not a per-athlete choice and not theirs to set.',
      },
    },
  },
  /**
   * ⚠ **THE TWO WEEKDAY MAPS ARE HERE BECAUSE THEIR ABSENCE IS WHY THE WORST DEFECT IN THIS REPO
   * SURVIVED.** This fixture carried `program: {}` and no `kcalByWeekday` at all, so the one path
   * a new chart uses every single morning — `generate-targets.mjs` looking a day up by weekday key
   * — was exercised by nothing. The template documented the keys as `mon|tue|…` in two comments
   * and its own `_example` while every lookup in the code produces `Mon`, and a chart that
   * followed its own template had no calorie target on any day, forever.
   */
  triggers: { _provenance: {} },
  domains: { energyDeficit: 'Swim faster' },
  sessionTypes: {
    swim: { met: 7.0, countsTowardFloor: true, domain: 'Swim faster', note: 'Pool swimming, moderate.' },
    ergo: { met: 8.0, countsTowardFloor: true, domain: 'Swim faster', note: 'Rowing ergometer.' },
    // ⚠ **A WALKING TYPE ON A CHART WITH NO FEED IS PRICED AT A REAL MET, AND `loading: false`.**
    // The other spelling — `met: 0, energyCountedIn: 'steps'` — promises the energy is counted in a
    // column this chart will never fill, so the movement is counted NOWHERE. `validate-data.mjs`
    // now rejects that combination and the red fixture below is the one that proves it does. The
    // default `loading` rule would call this MET-3.5 entry loading and read a week of walks as a
    // week with no rest day, which is the one case that default cannot get right on its own.
    stroll: { met: 3.5, countsTowardFloor: false, loading: false, domain: 'Swim faster', note: 'Easy walking. Nothing else counts it on this chart.' },
  },
  program: {
    weeklyTemplate: {
      Mon: { type: 'swim', session: 'Threshold 400s', focus: 'Aerobic threshold', durationMin: 45 },
      Wed: { type: 'ergo', session: 'Steady 5k', focus: 'Steady state', durationMin: 40 },
      Sat: { type: 'swim', session: 'Long swim', focus: 'Volume', durationMin: 60 },
    },
  },
  events: {},
  metrics: {},
}

/**
 * **State C's chart: the same stranger, now with a month of rows and no wearable.**
 *
 * Everything State B's chart has, plus the two structures a chart needs once it is actually
 * running — a weekday calorie map and a weekly template — and deliberately **no
 * `plan.stepsPerDayTarget`**, because they never set up a feed.
 *
 * ⚠ **THE WALKING TYPE IS PRICED AS A SESSION HERE, WHICH IS WHAT NO FEED MEANS.** It used to
 * carry `met: 0, energyCountedIn: 'steps'` — correct on a chart WITH a feed, where the walk is
 * priced once in the step count — and this fixture kept it deliberately, to reproduce the defect
 * rather than tidy it away: with no feed there is nothing on the other side of that promise, so
 * the movement was priced nowhere. `validate-data.mjs` now rejects the combination outright, so
 * the defect has moved from this fixture to a red one in State B, which is where a caught defect
 * belongs. The chart itself is now the configuration it always should have been.
 *
 * It also declares `plan.movementOutsideExerciseLevel` — the incidental movement nothing else
 * counts. The two are not the same thing and both are needed: the level covers being on their feet
 * around the house, the session covers the walk they chose to go on.
 */
const NO_FEED_CHART = {
  ...FRESH_CHART,
  plan: {
    ...FRESH_CHART.plan,
    // [acceptable, goal]. A scalar here is a legal-looking edit that throws on /today, which is
    // why the validator now rejects it — this fixture was in that shape and nothing noticed.
    targetRateLbPerWk: [0.5, 0.75],
    maxRatePctBwPerWk: 1.0,
    sessionsPerWeekFloor: 3,
    sessionsPerWeekTarget: 5,
    // No `stepsPerDayTarget` and no `stepFeed`. Absent, not zero: they have no feed and never
    // answered a step question, and `data/METHOD.md` rule 6 is explicit that a blank and a
    // measured zero are different claims.
    //
    // What they DID answer is how much they move outside deliberate exercise. That is the movement
    // term on a chart like this one, and it is what makes `complete=y` reachable here at all.
    movementOutsideExerciseLevel: 'active',
    //
    // Every value above carries a marker, because `test-provenance.mjs` requires one of every
    // threshold on a live chart and this fixture IS a live chart as far as that check is
    // concerned. Writing them by hand is the point: a fixture that could skip the contract would
    // not be exercising it.
    _provenance: {
      ...FRESH_CHART.plan._provenance,
      targetRateLbPerWk: {
        class: 'athlete-stated', asOf: '2026-08-14', quote: 'Slow is fine. Half a kilo a week at most.',
        source: 'intake session 2', note: 'Their own pace, in their own words.',
      },
      movementOutsideExerciseLevel: {
        class: 'athlete-stated', asOf: '2026-08-14',
        quote: 'I am up and down all day, and I walk part of the way in.',
        source: 'intake session 2',
        note: 'Their own description of an ordinary day, outside anything they would call exercise.',
      },
      maxRatePctBwPerWk: {
        class: 'external', asOf: '2026-08-14', source: 'CLAUDE.md §5.2',
        note: 'A standing safety floor in the charter, not a per-athlete choice and not theirs to set.',
      },
      sessionsPerWeekFloor: {
        class: 'coach-proposed-unconfirmed', asOf: '2026-08-14', source: 'intake',
        note: 'The coach set this at intake; the athlete has not ruled on it.',
      },
      sessionsPerWeekTarget: {
        class: 'coach-proposed-unconfirmed', asOf: '2026-08-14', source: 'intake',
        note: 'The coach set this at intake; the athlete has not ruled on it.',
      },
    },
  },
  /**
   * ⚠ **ONE TYPE CARRIES `standingDurationMin`, WHICH IS THE ONLY THING THAT EXERCISES RUNG 4 OF
   * THE DURATION RESOLVER.** A session type that always runs the same length — a daily mobility
   * block, a fixed-length class — lets the ledger cost an untimed row at the figure the forward
   * view already uses, instead of estimating it from set count. The prototype expressed this as
   * `program.dailyRehabMin` on a hard-coded `rehab` type; generalising it to the registry is what
   * makes it available to a chart that does something else entirely.
   */
  sessionTypes: {
    ...FRESH_CHART.sessionTypes,
    mobility: {
      met: 2.5,
      countsTowardFloor: false,
      standingDurationMin: 20,
      domain: 'Swim faster',
      note: 'The same short block every morning; it always takes the same time.',
    },
  },
  program: {
    weeklyTemplate: {
      Mon: { type: 'swim', session: 'Threshold 400s', focus: 'Aerobic threshold', durationMin: 45 },
      Tue: { type: 'ergo', session: 'Steady 5k', focus: 'Steady state', durationMin: 40 },
      Wed: { type: 'stroll', session: 'Recovery walk', focus: 'Easy movement', durationMin: 40 },
      Thu: { type: 'swim', session: 'Technique', focus: 'Drills and form', durationMin: 40 },
      Fri: { type: 'ergo', session: 'Intervals', focus: 'Hard intervals', durationMin: 35 },
      Sat: { type: 'swim', session: 'Long swim', focus: 'Volume', durationMin: 60 },
      Sun: { type: 'rest', session: 'Rest', focus: 'Full rest day', durationMin: 0 },
    },
  },
}

/** The number of days of history State C writes. Above `MIN_DAYS_FOR_OBSERVED_BURN` on purpose. */
const STATE_C_DAYS = 28

/**
 * Every date this fixture writes, oldest first, ending on the chart's own local today.
 *
 * ⚠ **RELATIVE TO TODAY, NEVER HARD-CODED.** `check-targets-gap.mjs` fails on any day between the
 * first target and athlete-local today that has no row, and `findings.mjs` reads recency windows
 * off the same clock. A fixture pinned to fixed dates passes on the day it is written and rots
 * into a red build a week later — which is the shape of failure that gets a suite deleted.
 */
const daysEndingToday = (n, timeZone) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(new Date())
  const end = Date.parse(`${today}T12:00:00Z`)
  return Array.from({ length: n }, (_, i) =>
    new Date(end - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10))
}

// Imported, never restated: `scripts/lib/weekdays.mjs` exists because this list had four homes and
// the documentation describing it disagreed with all four.
const weekdayOf = weekdayKey

/**
 * Write a month of plausible rows for `NO_FEED_CHART` — and leave `steps.csv` with nothing in it
 * but its header.
 *
 * The numbers are synthetic and say so; what has to be true of them is only that they are internally
 * consistent enough to pass `validate-data.mjs` and to give the burn model something to average.
 * Weight falls about 0.75 lb/week against a ~1,750 kcal intake, which keeps the fixture inside the
 * §5.2 rate ceiling so a safety finding does not fire and drown the assertions it is here for.
 */
const populateStateC = (repo, dates) => {
  const w = (file, rows) => writeFileSync(join(repo, 'data', file),
    `${SPEC[file].header.join(',')}\n${rows.map((r) => SPEC[file].header.map((h) => r[h] ?? '').join(',')).join('\n')}\n`)

  w('body.csv', dates.map((date, i) => ({
    date,
    weight_lb: (150 - i * 0.107).toFixed(1),
    sleep_h: (7 + ((i % 5) - 2) * 0.25).toFixed(2),
    note: 'Synthetic fixture row — see scripts/test-cold-start.mjs, STATE C.',
  })))

  w('meals.csv', dates.flatMap((date) => [
    { date, time: '08:00', item: 'Breakfast', kcal: 450, protein_g: 35, fat_g: 14, carb_g: 45, fibre_g: 6, confidence: 'label' },
    { date, time: '13:00', item: 'Lunch', kcal: 600, protein_g: 45, fat_g: 20, carb_g: 55, fibre_g: 8, confidence: 'label' },
    { date, time: '19:00', item: 'Dinner', kcal: 700, protein_g: 40, fat_g: 25, carb_g: 70, fibre_g: 10, confidence: 'estimate' },
  ]))

  const plan = NO_FEED_CHART.program.weeklyTemplate
  const sessions = dates.map((date) => ({ date, ...plan[weekdayOf(date)] }))
  w('training.csv', [
    ...sessions.map(({ date, type, session, durationMin }) => ({
      date,
      type,
      session,
      status: type === 'rest' ? 'rest' : 'completed',
      rpe: type === 'rest' ? '' : 6,
      duration_min: durationMin || '',
      pain_flag: 'n',
    })),
    // ⚠ **UNTIMED ON PURPOSE, AND WITH NO SETS AND NO HISTORY**, so the only rung that can answer
    // is `prescribed`. Without it nothing anywhere exercises `standingDurationMin`, and a chart
    // that relied on it would find out at the first untimed row.
    ...dates.slice(-3).map((date) => ({
      date, type: 'mobility', session: 'Morning mobility', status: 'completed', pain_flag: 'n',
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1)))

  // A few real sets on the ergo days, so the set-level machinery has something to read on a chart
  // that is not a lifting chart. Most of this athlete's work is untimed by set, which is the
  // ordinary case for swimming and rowing and is exactly why it must not become a zero.
  w('sets.csv', sessions.filter((s) => s.type === 'ergo').flatMap(({ date, session }) =>
    [1, 2, 3].map((set_index) => ({ date, session, exercise: 'Ergo interval', set_index, duration_s: 300 }))))

  // ⚠ **HEADER ONLY. THIS IS THE WHOLE STATE.** Not a zero, not a gap to be filled: this chart has
  // no feed, so there is no row to write and never will be.
  w('steps.csv', [])
}

/** A clone of the working tree — the real files, the real scripts, a real git repo. */
const cloneRepo = () => {
  // ⚠ `realpathSync`, and it cost half an hour. On macOS `tmpdir()` is `/var/folders/…`, a symlink
  // to `/private/var/folders/…`. A script spawned by path therefore sees `process.argv[1]` under
  // `/var` while its own `import.meta.url` resolves under `/private/var`, so the
  // `import.meta.url === \`file://${process.argv[1]}\`` CLI guard every script in this repo uses
  // is FALSE — the module imports, exits 0, and does nothing at all. `build-docs.mjs` "ran clean"
  // and regenerated nothing, and the failure surfaced three checks downstream.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cold-start-')))
  const repo = join(dir, 'chart')
  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', '--depth', '1', ROOT, repo], { stdio: 'pipe' })
  // ⚠ **THE CLONE CARRIES COMMITTED FILES ONLY**, so a brand-new script — the usual case while a
  // workstream is in flight — would be missing and this suite would certify the last commit
  // instead of this tree. `--others --exclude-standard` adds working-tree files git does not yet
  // track but would; `.gitignore`d build output stays out, which is the point of a cold start.
  const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: ROOT }).toString().trim().split('\n')
  for (const rel of tracked) {
    const from = join(ROOT, rel)
    if (!existsSync(from)) continue
    mkdirSync(join(repo, dirname(rel)), { recursive: true })
    writeFileSync(join(repo, rel), readFileSync(from))
  }
  return { dir, repo }
}

/** Strip a chart back to an empty one: headers only, no constants, no prose. */
const emptyTheChart = (repo) => {
  for (const [file, spec] of Object.entries(SPEC)) {
    writeFileSync(join(repo, 'data', file), `${spec.header.join(',')}\n`)
  }
  rmSync(join(repo, 'athlete', 'constants.json'), { force: true })
  // Prose an intake would write for THIS athlete, not the previous one. A fork carries the
  // template's stubs; the working tree carries one man's chart, and leaving it in place would make
  // the suite assert that his files pass, which is not the question.
  for (const dir of ['logs', 'nutrition', 'program']) {
    rmSync(join(repo, dir), { recursive: true, force: true })
    mkdirSync(join(repo, dir), { recursive: true })
  }
  for (const file of readdirSync(join(repo, 'athlete'))) {
    if (file.endsWith('.md')) writeFileSync(join(repo, 'athlete', file), `# ${file.replace('.md', '')}\n\n_Not yet written._\n`)
  }
  // ⚠ **PROMOTED AGENTS AND SKILLS GO TOO, and forgetting them made this suite pass on one chart
  // and fail on another running byte-identical code.**
  //
  // `CLAUDE.md` §7 and §8: the roster and the skill set are per-athlete. A fresh fork has NOTHING
  // promoted — intake copies out of `library/` and rewrites the copy for that athlete. So a copy
  // sitting in `.claude/agents/` or `skills/` is chart content, exactly like `nutrition/` above,
  // and leaving it in place asks the suite to assert that the PREVIOUS athlete's specialists pass
  // against the fixture athlete's constants. On a chart whose promoted files still matched the
  // library that was invisible; on one whose intake had genuinely rewritten them — quoting that
  // athlete's own protein figures — `test-single-home`'s prose scan found figures with no home in
  // the fixture's chart and went red on every push.
  const promoted = (dir, isDir) => {
    const lib = join(repo, dir, 'library')
    if (!existsSync(lib)) return []
    const shipped = new Set(readdirSync(lib))
    return readdirSync(join(repo, dir))
      .filter((e) => e !== 'library' && shipped.has(e) && (isDir || e.endsWith('.md')))
      .map((e) => join(repo, dir, e))
  }
  for (const path of [...promoted('.claude/agents', false), ...promoted('skills', true)]) {
    rmSync(path, { recursive: true, force: true })
  }
  writeFileSync(join(repo, 'decisions.md'), '# Decisions\n\n_Nothing decided yet._\n')
  execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'pipe' })
  execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=cold-start', 'commit', '-qm', 'empty chart'],
    { cwd: repo, stdio: 'pipe' })
}

const runCheckAll = (repo) => {
  // COACH_COLD_START stops the clone's own check-all from running THIS suite again. See the note
  // beside the step in scripts/check-all.mjs.
  const env = { ...process.env, COACH_COLD_START: '1' }
  try {
    return { code: 0, out: execFileSync(process.execPath, [join(repo, 'scripts', 'check-all.mjs')], { cwd: repo, stdio: 'pipe', env }).toString() }
  } catch (e) {
    return { code: e.status ?? 1, out: [e.stdout?.toString(), e.stderr?.toString()].filter(Boolean).join('\n') }
  }
}

/**
 * ⚠ **BOTH STREAMS ON SUCCESS TOO, and until now only the failure path took stderr.**
 *
 * `validate-data.mjs` prints its WARNINGS to `console.warn`, so on a script that exits 0 every one
 * of them was invisible here — no fixture in this file could assert a warning at all, only that a
 * count appeared in the summary line. A warning is the whole output of a check that has decided
 * not to block, which is most of the interesting ones.
 */
const runScript = (repo, script, args = []) => {
  const streams = (r) => [r?.stdout?.toString(), r?.stderr?.toString()].filter(Boolean).join('\n')
  try {
    const r = spawnSync(process.execPath, [join(repo, 'scripts', script), ...args], { cwd: repo })
    return { code: r.status ?? 1, out: streams(r) }
  } catch (e) {
    return { code: e.status ?? 1, out: streams(e) }
  }
}

// =================================================================================================
console.log('STATE A — a repo with no chart at all')
// =================================================================================================

{
  const { dir, repo } = cloneRepo()
  try {
    emptyTheChart(repo)

    // THE RED FIXTURE FOR F-17, and it is the historical failure exactly: `constants` used to fall
    // back to `athlete/constants.template.json`, a file that exists only on upstream/main, so five
    // scripts died on `readFileSync` with an ENOENT naming a file the reader had never heard of.
    const compute = runScript(repo, 'compute-energy.mjs')
    compute.code !== 0 && compute.out.includes(NO_CHART_MESSAGE)
      ? ok('a script that needs the chart fails with the intake message, not an ENOENT')
      : fail('a chart-less script must name the fix', compute.out.slice(0, 400))
    ;!(/ENOENT|constants\.template\.json/).test(compute.out)
      ? ok('...and never mentions a file that does not exist in this repository')
      : fail('the ENOENT fallback is back', compute.out.slice(0, 400))

    const validate = runScript(repo, 'validate-data.mjs')
    validate.code === 0
      ? ok('validate-data still exits 0 and explains itself')
      : fail('the no-chart early exit must survive importing the schema', validate.out.slice(0, 400))

    // THE POINT OF THE WHOLE STATE. Intake runs across several sessions; every push during that
    // period used to fail CI, which teaches a brand-new athlete that a red build is normal — the
    // precise outcome the no-chart guard was written to prevent (audit F-39).
    const all = runCheckAll(repo)
    all.code === 0
      ? ok('check-all is GREEN on a repo with no chart')
      : fail('a chart-less repo must not fail CI', all.out.slice(-1500))
    ;(/skip /).test(all.out) && all.out.includes(NO_CHART_MESSAGE)
      ? ok('...and says which steps it skipped, and why')
      : fail('skipped steps must be visible', all.out.slice(-800))

    /**
     * ⚠ **A SUITE WHOSE FIXTURES ARE ENTIRELY INLINE MUST NOT SKIP HERE, AND THE DEFAULT IS
     * BACKWARDS.** `step()`'s `needsChart` defaults to TRUE, so registering a chart-free suite
     * plainly makes it skip on exactly the repo where its fixtures are the only thing exercising
     * the engine — and `check-all` still exits 0, so the omission reads as a pass.
     *
     * ⚠ **AND THE LIST IS DERIVED, NOT TYPED.** The first version of this assertion named four
     * suites by hand and printed "every suite with inline fixtures RAN" — a green line asserting
     * more than it had tested, which is the shape of check this file exists to catch. It missed
     * two that were skipping. So: take every `test-*.mjs` `check-all` registers, run the ones it
     * SKIPPED directly, and fail on any that passes. A suite that goes green on a chart-less repo
     * has fixtures that did not need a chart, and skipping it is coverage thrown away on precisely
     * the repo a stranger forks.
     */
    const registered = [...readFileSync(join(repo, 'scripts', 'check-all.mjs'), 'utf8')
      .matchAll(/run\('(test-[^']+\.mjs)'/g)].map((m) => m[1])
    const skippedSuites = registered.filter((f) =>
      new RegExp(`^skip\\s+${f.replace('.mjs', '')}\\b`, 'm').test(all.out))
    const wronglySkipped = skippedSuites.filter((f) => runScript(repo, f).code === 0)
    wronglySkipped.length === 0
      ? ok(`...and no suite that PASSES without a chart was skipped (checked all ${registered.length})`)
      : fail('a suite that needs no chart must not be registered as if it did — its fixtures are '
        + 'the only thing exercising that code on this repo', wronglySkipped.join(', '))
  } finally {
    discard(dir)
  }
}

// =================================================================================================
console.log('\nSTATE B — a chart, written by intake, with no rows in it yet')
// =================================================================================================

{
  const { dir, repo } = cloneRepo()
  try {
    emptyTheChart(repo)
    writeFileSync(join(repo, 'athlete', 'constants.json'), `${JSON.stringify(FRESH_CHART, null, 2)}\n`)
    writeFileSync(join(repo, 'athlete', 'goals.md'), '# Goals\n\n## Domain: Swim faster\n\n**Satisfied when:** …\n')
    // The last step of intake, and the reason it is a step at all: `data/METHOD.md` renders the
    // chart's own MET table, so a fork carries the PREVIOUS athlete's table until it is rebuilt.
    // `skills/intake` says to run this; if that line is ever dropped, this assertion is what fails.
    const docs = runScript(repo, 'build-docs.mjs')
    docs.code === 0
      ? ok('intake regenerates the chart\'s own generated documents')
      : fail('build-docs must run clean on a fresh chart', docs.out.slice(0, 400))
    execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'pipe' })
    execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=cold-start', 'commit', '-qm', 'intake complete'],
      { cwd: repo, stdio: 'pipe' })

    const all = runCheckAll(repo)
    all.code === 0
      ? ok('check-all is GREEN on a fresh chart with no history')
      : fail('a new athlete\'s first push must not be red', all.out.slice(-2500))
    ;!(/skip /).test(all.out)
      ? ok('...and nothing is skipped — the chart exists, so every check runs')
      : fail('a chart with constants must run every step', all.out.slice(-800))

    // The registry is what makes this athlete legible at all. Their own types are legal; this
    // chart's are not, which is F-15 inverted and is the assertion that proves the enum moved.
    /**
     * ⚠ **THE RED FIXTURE FOR THE WEEKDAY BUG, and without it the map above only proves the
     * CORRECT spelling works — which the old code also did.**
     *
     * `validate-data.mjs` used to count seven numeric entries summing to the budget and never look
     * at their names, so a chart keyed the way the template's own documentation described it
     * passed every check and then failed every morning, in a different script, with a message
     * about a key nobody had typed. This lower-cases the map and asserts the validator now says so
     * BEFORE the chart is ever pushed.
     */
    // A date the generator can be pointed at. Its own local-today would do, but naming one keeps
    // the assertion's failure message readable.
    const dates0 = daysEndingToday(1, FRESH_CHART.athlete.timezone)[0]
    const withMap = (build) => {
      const c = JSON.parse(JSON.stringify(FRESH_CHART))
      build(c)
      writeFileSync(join(repo, 'athlete', 'constants.json'), `${JSON.stringify(c, null, 2)}\n`)
      return runScript(repo, 'validate-data.mjs')
    }
    const rejects = (name, out, code, needle) => (code !== 0 && needle.test(out)
      ? ok(name)
      : fail(name, `exit ${code}\n${out.slice(0, 500)}`))

    // (1) Seven right numbers under seven wrong names.
    const lowered = withMap((c) => {
      c.plan.kcalByWeekday = Object.fromEntries(
        Object.entries(FRESH_CHART.plan.kcalByWeekday).map(([k, v]) => [k.toLowerCase(), v]))
    })
    rejects('a lower-cased weekday map is REJECTED, by its keys and not by their count',
      lowered.out, lowered.code, /does not use mon/)
    ;(/Mon, Tue/).test(lowered.out)
      ? ok('...and the error says which spelling the code actually looks up')
      : fail('the error must name the keys the lookup uses', lowered.out.slice(0, 400))

    // (2) ⚠ SIX RIGHT NAMES AND NO SEVENTH — the shape the first version of this check could not
    // see, because it reported `unexpected` keys and threw `missing` away. It is WORSE than (1):
    // `--fill-gaps` aborts on the first day it cannot write, so check-targets-gap fails the build
    // and prints a remedy that can never succeed.
    const short = withMap((c) => { delete c.plan.kcalByWeekday.Sun })
    rejects('a map missing one weekday is REJECTED — nothing is unexpected, so nothing used to be',
      short.out, short.code, /has no entry for Sun/)

    // (3) ⚠ A MAP HOLDING NOTHING BUT ITS `_comment` — which is the shape
    // `athlete/constants.template.json` SHIPS. A user who copies the template and fills in
    // everything except this map lands here.
    const empty = withMap((c) => {
      c.plan.kcalByWeekday = { _comment: 'seven entries, one per weekday' }
    })
    rejects('a weekday map with no weekday entries is REJECTED — the template ships that shape',
      empty.out, empty.code, /no weekday entries/)
    ;(/dailyKcalTargetPolicy/).test(empty.out)
      ? ok('...and the error names the written opt-out rather than demanding an invented figure')
      : fail('a check that cannot go green without inventing data must not be written', empty.out.slice(0, 400))

    // (4) ...and the opt-out really is one. A chart whose domains have nothing to do with intake
    // says so in writing, with a reason, and is then left alone.
    const optedOut = withMap((c) => {
      c.plan.kcalByWeekday = { _comment: 'not used on this chart' }
      c.plan.dailyKcalTargetPolicy = 'none'
      c.plan._dailyKcalTargetPolicy_note = 'No energy domain: this chart tracks symptom control only.'
    })
    optedOut.code === 0
      ? ok('...while a chart that opted out IN WRITING is not asked for a weekday map at all')
      : fail('a chart with no energy domain must not be forced to invent one', optedOut.out.slice(0, 400))

    // The three keys the duration resolver reads. Each is checked because each fails SILENTLY:
    // a bad standing duration is a wrong burn rather than a missing one, and a `dailyBlockType`
    // naming an unregistered type drops a session from every day of the forward view with nothing
    // anywhere saying why.
    const badDuration = withMap((c) => {
      c.sessionTypes = { ...c.sessionTypes, swim: { ...c.sessionTypes.swim, standingDurationMin: '45' } }
    })
    rejects('a standing duration written as a string is REJECTED — it would price every untimed row',
      badDuration.out, badDuration.code, /standingDurationMin must be a positive number/)

    const strayBlock = withMap((c) => { c.program = { ...c.program, dailyBlockType: 'pilates' } })
    rejects('a dailyBlockType naming an unregistered type is REJECTED, not silently dropped',
      strayBlock.out, strayBlock.code, /not a registered session type/)

    const lengthlessBlock = withMap((c) => { c.program = { ...c.program, dailyBlockType: 'swim' } })
    rejects('...and one naming a type with no standing duration is REJECTED too',
      lengthlessBlock.out, lengthlessBlock.code, /declares no standingDurationMin/)

    const badRest = withMap((c) => { c.program = { ...c.program, setRestSec: 'seventy' } })
    rejects('a non-numeric setRestSec is REJECTED', badRest.out, badRest.code,
      /setRestSec must be a non-negative number/)

    /**
     * ⚠ **THE MOVEMENT DECLARATION — THREE WAYS TO GET THE BURN MODEL'S LARGEST DISCRETIONARY TERM
     * WRONG, none of which anything used to notice.**
     *
     * `FRESH_CHART` is the no-feed configuration, which is what most forks are. Each fixture below
     * breaks one thing about that and asserts the build says so.
     */
    const strayCounted = withMap((c) => {
      c.sessionTypes = {
        ...c.sessionTypes,
        stroll: { met: 0, energyCountedIn: 'steps', countsTowardFloor: false, loading: false, domain: 'Swim faster', note: 'Counted in steps.' },
      }
    })
    rejects('a walking type counted in a step feed this chart does not have is REJECTED — that '
      + 'movement is counted NOWHERE',
      strayCounted.out, strayCounted.code, /energyCountedIn is "steps", but this chart declares no/)

    /**
     * ⚠ **THE TREND WINDOW KNOBS — a wrong one changes every projected date and shows nowhere.**
     * Below 1 the estimator returns null and the whole chart quietly reads TBD with no error
     * anywhere saying why; under a week the two windows sit close enough that day-to-day noise
     * dominates the rate, which is legal for a chart measuring several times a day and is worth
     * saying out loud on any other.
     */
    const zeroLag = withMap((c) => { c.plan = { ...c.plan, trendLagDays: 0 } })
    rejects('a trend lag below 1 is REJECTED — it silently stops every projection',
      zeroLag.out, zeroLag.code, /must be a whole number of days and at least 1/)

    const fractionalWindow = withMap((c) => { c.plan = { ...c.plan, trendWindowSize: 2.5 } })
    rejects('...as is a fractional window size', fractionalWindow.out, fractionalWindow.code,
      /must be a whole number of readings/)

    const shortLag = withMap((c) => { c.plan = { ...c.plan, trendLagDays: 3 } })
    shortLag.code === 0 && /trendLagDays is 3/.test(shortLag.out)
      ? ok('...while a short lag WARNS rather than blocking — legal, and worth knowing')
      : fail('a short trend lag is legal on some charts and must not be an error',
        `exit ${shortLag.code}\n${shortLag.out.slice(0, 300)}`)

    // ⚠ AND THE DOCUMENTED ANSWER MUST BE THE TRUE ONE. constants.template.json says neither key
    // needs a provenance marker; `plan` is a covered section, so without the exemption a chart
    // that followed its own template failed test-provenance with an error arguing the opposite.
    const knobs = JSON.parse(JSON.stringify(FRESH_CHART))
    knobs.plan = { ...knobs.plan, trendWindowSize: 3, trendLagDays: 10 }
    writeFileSync(join(repo, 'athlete', 'constants.json'), `${JSON.stringify(knobs, null, 2)}\n`)
    const knobCheck = runCheckAll(repo)
    knobCheck.code === 0
      ? ok('the trend knobs need no provenance marker, exactly as the template says they do not')
      : fail('a chart following its own template must not go red', knobCheck.out.slice(-700))
    writeFileSync(join(repo, 'athlete', 'constants.json'), `${JSON.stringify(FRESH_CHART, null, 2)}\n`)

    /**
     * ⚠ **A CONDITIONING MENU NAMING A SESSION NOBODY PRESCRIBED.**
     *
     * `check-suspensions.mjs` holds every name on the menu to the active block's suspension list —
     * that is the whole reason the list is machine-readable. A name that matches no prescription
     * row is silently outside that guard AND outside what
     * `skills/library/session-recommendation` may choose: nothing errors, an option simply stops
     * existing while the document still offers it.
     */
    const strayMenu = withMap((c) => {
      c.program = { ...c.program, conditioningMenu: ['Circuit nobody wrote'] }
    })
    // ⚠ **A WARNING, NOT A REJECTION, and the difference is a real chart shape.** A whole-session
    // activity — a flat walk, a swim, a class — has nothing to prescribe set by set and is a
    // perfectly good menu option. Rejecting it forced the machine-readable list to be a strict
    // subset of the menu document, with nothing checking the two agree, and the option it excluded
    // was exactly the one then sitting outside the suspension guard this key exists to feed.
    strayMenu.code === 0 && /which no row of data\/prescriptions\.csv/.test(strayMenu.out)
      ? ok('a menu option with no prescription rows WARNS — it is legitimate, and the warning says '
        + 'what it costs')
      : fail('an option with no set-by-set rows is a walk, not an error',
        `exit ${strayMenu.code}\n${strayMenu.out.slice(0, 400)}`)

    const objectMenu = withMap((c) => {
      c.program = { ...c.program, conditioningMenu: { C1: 'Circuit' } }
    })
    rejects('...and a menu that is not a list of NAMES is REJECTED — the contents live in the '
      + 'document, not here',
      objectMenu.out, objectMenu.code, /must be an ARRAY of session names/)

    const emptyMenu = withMap((c) => { c.program = { ...c.program, conditioningMenu: [] } })
    rejects('...as is an empty one, which reads as a choice and offers none',
      emptyMenu.out, emptyMenu.code, /A menu with no options/)

    /**
     * ⚠ **STEPS ARRIVING WITH NO DECLARATION — THE ONE SHAPE THAT DOUBLE-COUNTED.**
     *
     * `data/steps.csv` with rows and no `plan.stepFeed` is what an existing chart looks like the
     * moment it merges this change and skips the migration, and what a chart switching away from a
     * feed looks like for its whole recorded history (the rows stay; `data/METHOD.md` forbids
     * deleting them). The ledger no longer writes both terms — `compute-energy.mjs` guards on the
     * ROW — but the chart is still wrong in a way it cannot see: every page reads it as having no
     * feed, and the gap check stops watching an automation that is still running.
     */
    writeFileSync(join(repo, 'data', 'steps.csv'), 'date,steps\n2026-08-14,9000\n')
    const undeclaredFeed = withMap(() => {})
    rejects('steps arriving with no plan.stepFeed is REJECTED — the rows contradict the declaration',
      undeclaredFeed.out, undeclaredFeed.code, /holds 1 row\(s\) but plan\.stepFeed is not set/)
    writeFileSync(join(repo, 'data', 'steps.csv'), 'date,steps\n')

    // A range, not a figure. A scalar here throws on /today and reads as "no rate on file"
    // everywhere else — three failures from one plausible edit, and nothing validated the key at
    // all until an adversarial review found this suite's own fixture in that shape.
    const scalarRate = withMap((c) => { c.plan = { ...c.plan, targetRateLbPerWk: 0.75 } })
    rejects('a scalar targetRateLbPerWk is REJECTED — Plan types it as a range and /today throws',
      scalarRate.out, scalarRate.code, /must be an array of one or two numbers/)

    // ⚠ **AND THE SAME PROMISE MISSPELLED IS THE SAME HARM, SILENTLY.** The rule above matches the
    // literal `steps`; anything else slipped past it, still forced `met: 0` through the
    // double-count rule, and left the session costing nothing on a chart with nothing else
    // counting it. One typo, and the exact defect the rule is named after.
    const misspeltCounted = withMap((c) => {
      c.sessionTypes = {
        ...c.sessionTypes,
        stroll: { met: 0, energyCountedIn: 'step count', countsTowardFloor: false, loading: false, domain: 'Swim faster', note: 'Counted in steps.' },
      }
    })
    rejects('...and so is one that misspells the column it names — the rule matches a literal',
      misspeltCounted.out, misspeltCounted.code, /names no column this system writes/)

    const unknownLevel = withMap((c) => { c.plan = { ...c.plan, movementOutsideExerciseLevel: 'quite active' } })
    rejects('a movement level that is not one of the described ones is REJECTED, naming them',
      unknownLevel.out, unknownLevel.code, /movementOutsideExerciseLevel is "quite active", which is not one of/)

    const both = withMap((c) => {
      c.plan = { ...c.plan, stepFeed: 'apple-health-shortcut', movementOutsideExerciseLevel: 'light' }
    })
    rejects('a described level BESIDE a declared feed is REJECTED — the feed already counts it',
      both.out, both.code, /is set AND plan\.stepFeed names/)

    /**
     * ⚠ **AND THE OTHER CONFIGURATION IS STILL FIRST-CLASS.** A chart WITH a wearable declares the
     * feed and prices its walking type at MET 0, and that has to stay green — the point of this
     * phase is that neither configuration is the fallback for the other. Without this fixture the
     * three red cases above could all be satisfied by a validator that simply banned step feeds.
     */
    const withFeed = JSON.parse(JSON.stringify(FRESH_CHART))
    withFeed.plan.stepFeed = 'apple-health-shortcut'
    withFeed.plan.stepsPerDayTarget = 9000
    withFeed.plan._provenance.stepFeed = {
      class: 'athlete-stated', asOf: '2026-08-14', quote: 'I wear the watch every day anyway.',
      source: 'intake session 1', note: 'Their own device and their own decision to wire it up.',
    }
    withFeed.plan._provenance.stepsPerDayTarget = {
      class: 'athlete-stated', asOf: '2026-08-14', quote: 'Nine thousand feels right.',
      source: 'intake session 1', note: 'Their own figure.',
    }
    withFeed.sessionTypes.stroll = {
      met: 0, energyCountedIn: 'steps', countsTowardFloor: false, loading: false,
      domain: 'Swim faster', note: 'Counted in the step feed, so never priced twice.',
    }
    writeFileSync(join(repo, 'athlete', 'constants.json'), `${JSON.stringify(withFeed, null, 2)}\n`)
    runScript(repo, 'build-docs.mjs')
    const feedCheck = runCheckAll(repo)
    feedCheck.code === 0
      ? ok('a chart WITH a wearable feed is equally green — neither configuration is the fallback')
      : fail('the wearable path must stay first-class', feedCheck.out.slice(-900))
    writeFileSync(join(repo, 'athlete', 'constants.json'), `${JSON.stringify(FRESH_CHART, null, 2)}\n`)
    runScript(repo, 'build-docs.mjs')

    /**
     * ⚠ **ANSWERING THE ONE NEW INTAKE QUESTION MUST NOT TURN THE BUILD RED.**
     *
     * `data/METHOD.md` stated the rest figure as a literal `70 s`, and `test-single-home`'s FIGURES
     * rule compares prose against the constant — so a chart answering with a different figure, the
     * exact thing intake asks for, could not commit until somebody found and hand-edited a sentence
     * in a file nothing had told them about. That is the same dilemma this repo refuses for the
     * method digest, one file over. The sentence is generated now; this asserts it.
     */
    const answered = JSON.parse(JSON.stringify(FRESH_CHART))
    answered.program = {
      ...answered.program,
      setRestSec: 90,
      // The marker `PROVENANCE_KEYS` requires. It is the whole point of asking: the shipped 70 is
      // the coach's proposal, and a chart that answers records whose number the 90 is.
      _provenance: {
        setRestSec: {
          class: 'athlete-stated', asOf: '2026-08-14', quote: 'About a minute and a half between sets.',
          source: 'intake session 2', note: 'Their own figure, replacing the shipped default.',
        },
      },
    }
    writeFileSync(join(repo, 'athlete', 'constants.json'), `${JSON.stringify(answered, null, 2)}\n`)
    const regen = runScript(repo, 'build-docs.mjs')
    const answeredCheck = runCheckAll(repo)
    regen.code === 0 && answeredCheck.code === 0
      ? ok('a chart that ANSWERS the rest question builds green, after the documented build-docs run')
      : fail('answering an intake question must not require hand-editing a generated document',
        `build-docs ${regen.code}\n${answeredCheck.out.slice(-900)}`)
    ;(/90 s rest/).test(readFileSync(join(repo, 'data', 'METHOD.md'), 'utf8'))
      ? ok('...and the method document now states THEIR figure, not the shipped default')
      : fail('the generated rung text must carry the chart\'s own rest figure',
        readFileSync(join(repo, 'data', 'METHOD.md'), 'utf8').match(/.{0,80}s rest.{0,40}/)?.[0] ?? '(no match)')
    writeFileSync(join(repo, 'athlete', 'constants.json'), `${JSON.stringify(FRESH_CHART, null, 2)}\n`)
    runScript(repo, 'build-docs.mjs')

    // ⚠ **AND THE GENERATOR IS THE SCRIPT THAT WOULD HAVE FAILED EVERY MORNING INSTEAD** — the
    // whole point of moving the check upstream is that this failure never reaches a user. Asserting
    // its MESSAGE, not merely a non-zero exit: any unrelated breakage in generate-targets.mjs would
    // keep an exit-code-only assertion green, which is a check that cannot fail.
    writeFileSync(join(repo, 'athlete', 'constants.json'), `${JSON.stringify(
      { ...FRESH_CHART,
        plan: { ...FRESH_CHART.plan,
          kcalByWeekday: Object.fromEntries(Object.entries(FRESH_CHART.plan.kcalByWeekday)
            .map(([k, v]) => [k.toLowerCase(), v])) } }, null, 2)}\n`)
    const gen = runScript(repo, 'generate-targets.mjs', [dates0])
    gen.code !== 0 && /kcalByWeekday has no entry for [A-Z][a-z][a-z]/.test(gen.out)
      ? ok('...which is the exact failure generate-targets.mjs produced daily, naming the key')
      : fail('a lower-cased map cannot produce a target, and must say which key it looked for',
        `exit ${gen.code}\n${gen.out.slice(0, 400)}`)

    writeFileSync(join(repo, 'athlete', 'constants.json'), `${JSON.stringify(FRESH_CHART, null, 2)}\n`)

    const bundle = JSON.parse(readFileSync(join(repo, 'src', 'generated', 'data.json'), 'utf8'))
    const types = bundle.plan.sessionTypeList
    types.includes('swim') && types.includes('ergo') && types.includes('rest') && types.includes('other')
      ? ok(`the type enum is THEIR activity list plus the two universal types: ${types.join(', ')}`)
      : fail('the enum must come from the chart', JSON.stringify(types))
    JSON.stringify(bundle.plan.countsTowardFloor.sort()) === JSON.stringify(['ergo', 'swim'])
      ? ok('...and their sessions count toward the floor, rather than being invisible to it')
      : fail('countsTowardFloor must come from the registry', JSON.stringify(bundle.plan.countsTowardFloor))

    // F-31: the copy the athlete never wrote must not appear on their pages.
    const bad = Object.entries(bundle.plan.copy ?? {}).filter(([, v]) => v)
    bad.length === 0
      ? ok('a chart that wrote no copy renders no copy')
      : fail('a new chart must not inherit another athlete\'s captions', JSON.stringify(bad))

    // The banned-term mechanism is athlete-level: a chart that banned nothing gets nothing.
    const banned = runScript(repo, 'check-banned-terms.mjs')
    banned.code === 0 && /nothing banned on this chart/.test(banned.out)
      ? ok('a chart with no standing instruction has nothing banned — the ban did not ship')
      : fail('a preference must never ship as a system rule', banned.out.slice(0, 400))
  } finally {
    discard(dir)
  }
}

// =================================================================================================
console.log('\nSTATE C — a chart with a month of rows and no step feed')
// =================================================================================================
//
// The majority configuration. See the header for why it earns a state of its own rather than a
// case inside State B.

{
  const { dir, repo } = cloneRepo()
  try {
    emptyTheChart(repo)
    writeFileSync(join(repo, 'athlete', 'constants.json'), `${JSON.stringify(NO_FEED_CHART, null, 2)}\n`)
    writeFileSync(join(repo, 'athlete', 'goals.md'), '# Goals\n\n## Domain: Swim faster\n\n**Satisfied when:** …\n')
    runScript(repo, 'build-docs.mjs')

    const dates = daysEndingToday(STATE_C_DAYS, NO_FEED_CHART.athlete.timezone)
    populateStateC(repo, dates)

    // Targets are generated, never typed: `plan.kcalByWeekday` is the fallback and it always
    // answers. This is also the assertion that a lower-cased weekday map would fail outright.
    // From the first day they ate, not from today: `check-targets-gap.mjs` calls a meal logged
    // before the first target "a day eaten against no target" and is right to.
    // Two calls, and the shape is what a real chart does: name the first day explicitly, because
    // `--fill-gaps` fills BETWEEN existing rows and has nothing to anchor on in an empty file.
    const first = runScript(repo, 'generate-targets.mjs', [dates[0]])
    const targets = first.code === 0 ? runScript(repo, 'generate-targets.mjs', ['--fill-gaps']) : first
    targets.code === 0
      ? ok('generate-targets writes a target for every day from the weekday map')
      : fail('a weekday map that the code cannot read is the worst defect this repo has shipped', targets.out.slice(0, 600))

    const energy = runScript(repo, 'compute-energy.mjs')
    energy.code === 0
      ? ok('compute-energy costs a month of sessions with no step count to add')
      : fail('the burn model must work without a feed', energy.out.slice(0, 600))

    execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'pipe' })
    execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=cold-start', 'commit', '-qm', 'a month of rows'],
      { cwd: repo, stdio: 'pipe' })

    // THE POINT OF THE WHOLE STATE.
    const all = runCheckAll(repo)
    all.code === 0
      ? ok('check-all is GREEN on a chart with rows and no step feed')
      : fail('the majority configuration must not be red', all.out.slice(-2500))
    ;!(/skip /).test(all.out)
      ? ok('...and nothing is skipped — a skipped step proves nothing about this state')
      : fail('a chart with constants must run every step', all.out.slice(-800))

    const ledger = readFileSync(join(repo, 'data', 'energy.csv'), 'utf8').trim().split('\n')
    const cols = ledger[0].split(',')
    const rows = ledger.slice(1).map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])))

    rows.length >= STATE_C_DAYS - 1
      ? ok(`the ledger holds ${rows.length} day(s) of a chart nobody wears a watch on`)
      : fail('the ledger must cost every day it can', `${rows.length} rows`)
    rows.every((r) => r.steps_kcal === '')
      ? ok('...every steps_kcal blank, because a blank is "not measured" and a zero would be a lie')
      : fail('a chart with no feed must not record a measured zero for steps',
        JSON.stringify(rows.filter((r) => r.steps_kcal !== '').slice(0, 3)))

    /**
     * ⚠ **AND THE MOVEMENT SLOT IS FILLED ANYWAY — WHICH IS THE ENTIRE PHASE.**
     *
     * `steps_kcal` blank is honest and was never the problem. The problem was that nothing else
     * filled the slot, so a day with no wearable had NO movement term at all: burn understated by
     * however much that person moves, systematically, on every day forever. `incidental_kcal` is
     * that slot's other filling, priced from the level this chart described.
     *
     * A blank here would mean the described level was not read, which is indistinguishable in the
     * ledger from the old behaviour — so it is asserted directly, on every row, rather than
     * inferred from `complete`.
     */
    rows.every((r) => r.incidental_kcal !== '' && Number(r.incidental_kcal) > 0)
      ? ok('...and incidental_kcal fills the movement slot on every one of them')
      : fail('a chart with no feed must still have a movement term — that is the whole phase',
        JSON.stringify(rows.filter((r) => !(Number(r.incidental_kcal) > 0)).map((r) => [r.date, r.incidental_kcal]).slice(0, 3)))

    /**
     * ⚠ **THE ASSERTION THAT USED TO BE A `console.log` OF A KNOWN DEFECT.**
     *
     * It read: *"Today `complete` is gated on `stepsKcal != null`, so it is 'n' on every row of
     * this chart forever and everything downstream of it — `observedDailyBurn`, the OUT side of the
     * weekly energy card, the burn projection, the budget-vs-goal finding — is inert. That is a
     * defect, not a property."* It printed `0/28`. It is now a check, and the number it prints is
     * the number of days this chart can actually reason about.
     *
     * Not every row: the last three are the untimed `mobility` days, complete but estimated, and
     * the first day of the fixture may hold a session with nothing logged against it. What must
     * hold is that a chart with no wearable reaches complete days AT ALL, which it could not before.
     */
    const complete = rows.filter((r) => r.complete === 'y').length
    complete >= MIN_DAYS_FOR_OBSERVED_BURN
      ? ok(`${complete} of ${rows.length} days are COMPLETE on a chart with no wearable — it was 0`)
      : fail('a no-feed chart must be able to have a complete day, or its whole quantitative half is inert',
        `${complete}/${rows.length}; first incomplete: ${JSON.stringify(rows.find((r) => r.complete !== 'y'))}`)

    /**
     * ⚠ **THE UNTIMED SESSIONS ARE COSTED, AND FROM THE RUNG THE CHART DECLARED.**
     *
     * Three `mobility` rows carry no `duration_min`, no sets, and no timed history to average — so
     * every rung above `prescribed` returns nothing and every rung below it has nothing to work
     * with. If `standingDurationMin` were not read, `session_kcal` on those days would be BLANK and
     * the day would be `complete=n` forever. Asserting the cost rather than the absence is the
     * point: this is the rung that makes a declared duration one figure instead of two.
     */
    const mobilityDays = dates.slice(-3)
    const mobilityRows = rows.filter((r) => mobilityDays.includes(r.date))
    mobilityRows.length === 3 && mobilityRows.every((r) => r.session_kcal !== '')
      ? ok('an untimed session of a type with a standing duration is COSTED, not left blank')
      : fail('rung 4 of the duration resolver did not fire — standingDurationMin was not read',
        JSON.stringify(mobilityRows.map((r) => [r.date, r.session_kcal])))

    /**
     * ⚠ **A RECONSTRUCTED DURATION MUST REACH THE PAGE, NOT JUST THE BUNDLE.**
     *
     * `durationLevel`, `durationMinUsed` and `durationBasis` are published and read by nothing —
     * what Today and History render is `kcalBasis`. So a session costed from a reconstructed
     * duration showed as `MET 2.5 × 20 min`, a figure appearing in no row of the chart, on a line
     * whose duration cell reads `—`. That is not silence about an estimate; it is a measurement
     * claimed. X-15: a number no page shows has failed the same way as a number never written, and
     * here the unshown number was the caveat.
     *
     * And the ledger has to carry it too, because `observedDailyBurn` averages `complete` days
     * precisely so estimates stay out of the figure that prices every unfinished day.
     */
    const bundleC = JSON.parse(readFileSync(join(repo, 'src', 'generated', 'data.json'), 'utf8'))
    const reconstructed = bundleC.training.filter((t) => t.durationLevel && t.durationLevel !== 'recorded')
    reconstructed.length > 0 && reconstructed.every((t) => /RECONSTRUCTED/.test(t.kcalBasis))
      ? ok(`the ${reconstructed.length} reconstructed row(s) say so in the string the pages render`)
      : fail('a reconstructed duration rendered as a recorded one',
        JSON.stringify(reconstructed.map((t) => [t.date, t.durationLevel, t.kcalBasis]).slice(0, 3)))
    rows.filter((r) => mobilityDays.includes(r.date)).every((r) => r.session_estimated === 'y')
      ? ok('...and the ledger marks those days estimated, so the burn mean can declare itself')
      : fail('a reconstructed day must not enter observedDailyBurn as a measurement',
        JSON.stringify(rows.filter((r) => mobilityDays.includes(r.date)).map((r) => [r.date, r.session_estimated])))
    rows.filter((r) => !mobilityDays.includes(r.date)).every((r) => r.session_estimated === 'n')
      ? ok('...while a day whose sessions were all timed is not marked estimated')
      : fail('a recorded duration must not be marked as reconstructed',
        JSON.stringify(rows.filter((r) => r.session_estimated !== 'n').map((r) => r.date)))

    /**
     * ⚠ **THE ASSERTION THIS STATE WAS BUILT TO INVERT.**
     *
     * It used to read `observedDailyBurn(rows) === null`, with a docstring recording that a chart
     * without a feed returns null *permanently* and that every caller therefore has to handle it.
     * That was the defect stated as a property, which was the honest thing to do at the time and is
     * not the honest thing to do now: the mean exists.
     *
     * ⚠ **THE NULL CASE IS NOT ABANDONED — IT MOVED.** A chart genuinely can produce a null mean
     * (fewer than `MIN_DAYS_FOR_OBSERVED_BURN` complete days, which every chart is on its first
     * week), and `scripts/test-aggregations.mjs` covers that directly on fixtures. What is gone is
     * the *permanent* null, which is not a case any chart should ever have been in.
     */
    const mean = observedDailyBurn(rows)
    mean && mean.meanKcal > 0 && mean.days >= MIN_DAYS_FOR_OBSERVED_BURN
      ? ok(`observedDailyBurn returns ${Math.round(mean.meanKcal)} kcal/day over ${mean.days} days `
        + '— it returned null forever before, and everything downstream of it was inert')
      : fail('a no-feed chart with a month of rows must produce a burn mean',
        `${rows.length} rows, mean=${JSON.stringify(mean)}`)

    /**
     * ⚠ **AND THE FORWARD VIEW HAS A MOVEMENT ROW, which is a separate failure from the ledger's.**
     * `addMovement` early-returned on a chart with no `stepsPerDayTarget`, so Next 7 Days and
     * today's Proposed table costed every future day with no movement in them at all — a different
     * code path, on a different side of the bundle, failing the same way for the same reason.
     */
    const movementItem = (bundleC.plan.movementKcal ?? null)
    movementItem != null && movementItem > 0 && /step-equivalents/.test(bundleC.plan.movementBasis ?? '')
      ? ok(`...and the forward view prices movement at ${Math.round(movementItem)} kcal/day, with its basis`)
      : fail('the forward view must have a movement term too, and must never print it bare',
        JSON.stringify([bundleC.plan.movementKcal, bundleC.plan.movementBasis]))
    ;!(/TypeError|Cannot read properties of null/).test(all.out)
      ? ok('...and no suite dereferences a null aggregate')
      : fail('a null aggregate must be handled, not dereferenced', all.out.slice(-1200))
  } finally {
    discard(dir)
  }
}

console.log(failed ? `\ncold-start: ${failed} FAILED.` : '\ncold-start: all checks passed.')
process.exit(failed ? 1 : 0)
