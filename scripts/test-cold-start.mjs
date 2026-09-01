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
import { execFileSync } from 'node:child_process'
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
    stroll: { met: 0, energyCountedIn: 'steps', countsTowardFloor: false, domain: 'Swim faster', note: 'Counted in steps.' },
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
 * ⚠ **`stroll` KEEPS `energyCountedIn: 'steps'` ON A CHART WITH NO STEPS, AND THAT IS THE POINT.**
 * It is what intake writes today, and on a chart with a feed it is correct — the walk is priced
 * once, in the step count, and pricing it again as a session would double-count it. With no feed
 * there is nothing on the other side of that promise, so the movement is priced NOWHERE. The
 * fixture reproduces the defect rather than tidying it away; a fixture tuned until it passes
 * asserts nothing (X-10).
 */
const NO_FEED_CHART = {
  ...FRESH_CHART,
  plan: {
    ...FRESH_CHART.plan,
    targetRateLbPerWk: 0.75,
    maxRatePctBwPerWk: 1.0,
    sessionsPerWeekFloor: 3,
    sessionsPerWeekTarget: 5,
    // No `stepsPerDayTarget`. Absent, not zero: they have no feed and never answered a step
    // question, and `data/METHOD.md` rule 6 is explicit that a blank and a measured zero are
    // different claims.
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
  w('training.csv', sessions.map(({ date, type, session, durationMin }) => ({
    date,
    type,
    session,
    status: type === 'rest' ? 'rest' : 'completed',
    rpe: type === 'rest' ? '' : 6,
    duration_min: durationMin || '',
    pain_flag: 'n',
  })))

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

const runScript = (repo, script, args = []) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [join(repo, 'scripts', script), ...args], { cwd: repo, stdio: 'pipe' }).toString() }
  } catch (e) {
    return { code: e.status ?? 1, out: [e.stdout?.toString(), e.stderr?.toString()].filter(Boolean).join('\n') }
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
     * the engine — and `check-all` still exits 0, so the omission reads as a pass. Asserting the
     * LINE rather than the exit status is the whole point: a green suite that skipped the step
     * under test says nothing about it.
     */
    const inlineSuites = ['test-recent-work', 'test-suspensions', 'test-athlete-leak', 'validate-data']
    const skipped = inlineSuites.filter((n) => new RegExp(`^skip\\s+${n}`, 'm').test(all.out))
    skipped.length === 0
      ? ok(`...and every suite with inline fixtures RAN: ${inlineSuites.join(', ')}`)
      : fail('a suite that needs no chart must not be registered as if it did', skipped.join(', '))
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
    const lower = JSON.parse(JSON.stringify(FRESH_CHART))
    lower.plan.kcalByWeekday = Object.fromEntries(
      Object.entries(FRESH_CHART.plan.kcalByWeekday).map(([k, v]) => [k.toLowerCase(), v]))
    writeFileSync(join(repo, 'athlete', 'constants.json'), `${JSON.stringify(lower, null, 2)}\n`)
    const lowered = runScript(repo, 'validate-data.mjs')
    lowered.code !== 0 && /kcalByWeekday is keyed/.test(lowered.out)
      ? ok('a lower-cased weekday map is REJECTED, naming the keys rather than counting them')
      : fail('seven right numbers under seven wrong names must not pass', lowered.out.slice(0, 500))
    ;(/Mon/).test(lowered.out)
      ? ok('...and the error says which spelling the code actually looks up')
      : fail('the error must name the key that is missing', lowered.out.slice(0, 400))
    // And the generator is the script that would have failed every morning instead.
    const gen = runScript(repo, 'generate-targets.mjs')
    gen.code !== 0
      ? ok('...which is the failure generate-targets.mjs would otherwise have produced daily')
      : fail('a lower-cased map cannot produce a target', gen.out.slice(0, 300))
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

    // ⚠ **RECORDED AS THE CURRENT STATE, NOT ASSERTED AS CORRECT.** Today `complete` is gated on
    // `stepsKcal != null`, so it is 'n' on every row of this chart forever and everything
    // downstream of it — `observedDailyBurn`, the OUT side of the weekly energy card, the burn
    // projection, the budget-vs-goal finding — is inert. That is a defect, not a property.
    const complete = rows.filter((r) => r.complete === 'y').length
    console.log(`       (${complete}/${rows.length} rows complete — a no-feed chart's known state)`)

    /**
     * ⚠ **THE PRECONDITION FOR THE CRASH THIS STATE WAS BUILT ON, ASSERTED DIRECTLY — because the
     * crash itself is NOT REPRODUCIBLE IN THIS REPO YET AND SAYING OTHERWISE WOULD BE A LIE.**
     *
     * The failure was `test-aggregations.mjs` building a detail string with `mean.days` as an eager
     * argument, so it threw a TypeError even on the passing path. That line does not exist here: it
     * arrives with the port of the blank-not-zero work, and its fix arrives beside it. What IS true
     * here, today, is the condition that makes any such caller explode — `observedDailyBurn`
     * returns null, permanently, on every chart without a feed — and a guard on a green string is
     * worth nothing next to the fact itself.
     *
     * So this asserts the fact. When the caller lands, it lands on a ledger already known to return
     * null, and the crash is a named failure here instead of a stack trace at step 11 of 18 in
     * somebody's live chart.
     */
    observedDailyBurn(rows) === null && rows.length >= MIN_DAYS_FOR_OBSERVED_BURN
      ? ok(`observedDailyBurn is null on ${rows.length} rows — every caller must handle that, and`
        + ' this is the only fixture where it is true')
      : fail('a no-feed chart must expose the null-mean case, or this state is not covering it',
        `${rows.length} rows, mean=${JSON.stringify(observedDailyBurn(rows))}`)
    ;!(/TypeError|Cannot read properties of null/).test(all.out)
      ? ok('...and no suite dereferences it')
      : fail('a null aggregate must be handled, not dereferenced', all.out.slice(-1200))
  } finally {
    discard(dir)
  }
}

console.log(failed ? `\ncold-start: ${failed} FAILED.` : '\ncold-start: all checks passed.')
process.exit(failed ? 1 : 0)
