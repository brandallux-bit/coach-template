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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failed = 0
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
    _provenance: {
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
  triggers: { _provenance: {} },
  domains: { energyDeficit: 'Swim faster' },
  sessionTypes: {
    swim: { met: 7.0, countsTowardFloor: true, domain: 'Swim faster', note: 'Pool swimming, moderate.' },
    ergo: { met: 8.0, countsTowardFloor: true, domain: 'Swim faster', note: 'Rowing ergometer.' },
    stroll: { met: 0, energyCountedIn: 'steps', countsTowardFloor: false, domain: 'Swim faster', note: 'Counted in steps.' },
  },
  program: {},
  events: {},
  metrics: {},
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

const runScript = (repo, script) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [join(repo, 'scripts', script)], { cwd: repo, stdio: 'pipe' }).toString() }
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
  } finally {
    rmSync(dir, { recursive: true, force: true })
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
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log(failed ? `\ncold-start: ${failed} FAILED.` : '\ncold-start: all checks passed.')
process.exit(failed ? 1 : 0)
