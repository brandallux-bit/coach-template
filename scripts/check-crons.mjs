#!/usr/bin/env node
/**
 * Do the scheduled jobs run at a sane hour **in the athlete's timezone**?
 *
 * WHY THIS EXISTS. `daily-rollover.yml` writes the day's calorie target, and `CLAUDE.md` §0.3
 * says a day may never lack one. Its cron is fixed UTC — `0 9 * * *` — chosen because that is
 * 01:00–02:00 in `America/Los_Angeles`, the timezone of the chart this template was extracted
 * from. **Nothing derived it from `athlete.timezone`, and nothing checked it.**
 *
 * On a chart in `Europe/London` that same line fires at 10:00 local: the target does not exist
 * for the first ten hours of every day. In `Asia/Tokyo` it is 18:00 — after most of the day's
 * eating. The chart is not broken in any way that shows up: `check-targets-gap.mjs` looks at
 * PAST days, and by the next morning the row exists, so it never fires. The athlete simply has
 * no target every morning and nobody can say why.
 *
 * That was invisible while the template and its one chart shared a timezone. It became a real
 * defect the moment the template went public, which is the general shape of every bug in here:
 * a constant that was only ever right by coincidence.
 *
 *   node scripts/check-crons.mjs            # report; exit 1 if a job lands badly
 *   node scripts/check-crons.mjs --fix      # rewrite the cron lines in place
 *
 * ⚠ **It reads the timezone from the chart, so it can only answer after intake.** Before that
 * it skips, like every other chart-dependent step (`scripts/lib/athlete.mjs`, `hasChart`).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { constants, hasChart, NO_CHART_MESSAGE } from './lib/athlete.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIX = process.argv.includes('--fix')

/**
 * Each job, the local hour it WANTS, and why that hour.
 *
 * `window` is the acceptable local range. Rollover has to land after local midnight and before
 * the athlete plausibly eats; the steps check has to land after they have woken and their phone
 * has sent yesterday's completed total, which is why it is deliberately midday and not dawn.
 */
const JOBS = [
  {
    file: '.github/workflows/daily-rollover.yml',
    want: 2,
    window: [0, 4],
    why: 'must run after local midnight and well before the first meal of the day',
  },
  {
    file: '.github/workflows/check-steps.yml',
    want: 13,
    window: [10, 16],
    why: "the phone sends yesterday's completed total when the athlete first picks it up",
  },
]

if (!hasChart) {
  console.log(`skip  check-crons — ${NO_CHART_MESSAGE}`)
  process.exit(0)
}

const tz = constants?.athlete?.timezone
if (!tz) {
  console.log('skip  check-crons — athlete.timezone is not set')
  process.exit(0)
}

/**
 * UTC offset for a timezone, in whole hours, right now.
 *
 * Deliberately "right now" rather than an annual average: cron does not shift for DST, so a job
 * is correct in one half of the year and an hour out in the other. The windows above are wide
 * enough to absorb that, which is the honest way to handle it without inventing two schedules.
 */
const offsetHours = (timeZone) => {
  const d = new Date()
  const local = new Date(d.toLocaleString('en-US', { timeZone }))
  const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }))
  return Math.round((local - utc) / 3_600_000)
}

const off = offsetHours(tz)
const mod = (n, m) => ((n % m) + m) % m

let failed = 0
let fixed = 0

for (const job of JOBS) {
  const path = join(ROOT, job.file)
  if (!existsSync(path)) continue

  const src = readFileSync(path, 'utf8')
  const m = src.match(/^(\s*- cron: ')(\d+) (\d+) (.*)'$/m)
  if (!m) {
    console.log(`?     ${job.file} — no cron line found, skipping`)
    continue
  }

  const utcHour = Number(m[3])
  const localHour = mod(utcHour + off, 24)
  const [lo, hi] = job.window
  const okNow = localHour >= lo && localHour <= hi

  const wantUtc = mod(job.want - off, 24)
  const line = `${m[1]}${m[2]} ${wantUtc} ${m[4]}'`

  if (okNow) {
    console.log(`ok    ${job.file} — ${String(utcHour).padStart(2, '0')}:00 UTC = ` +
      `${String(localHour).padStart(2, '0')}:00 ${tz}`)
    continue
  }

  failed++
  console.log(`FAIL  ${job.file}`)
  console.log(`      runs ${String(utcHour).padStart(2, '0')}:00 UTC = ` +
    `${String(localHour).padStart(2, '0')}:00 in ${tz}; wanted ${lo}:00-${hi}:00 local`)
  console.log(`      ${job.why}`)
  console.log(`      fix: - cron: '${m[2]} ${wantUtc} ${m[4]}'   (${job.want}:00 local)`)

  if (FIX) {
    writeFileSync(path, src.replace(m[0], line))
    fixed++
    console.log('      ↳ rewritten')
  }
}

if (FIX && fixed) {
  console.log(`\ncheck-crons: rewrote ${fixed} schedule(s) for ${tz}. Commit them.`)
  process.exit(0)
}

if (failed) {
  console.log(`\ncheck-crons: ${failed} job(s) run at the wrong local hour for ${tz}.`)
  console.log('Run with --fix to rewrite them, then commit.')
  process.exit(1)
}

console.log(`check-crons: both schedules land correctly for ${tz}.`)
