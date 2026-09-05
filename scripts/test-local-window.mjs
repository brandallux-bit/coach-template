#!/usr/bin/env node
/**
 * Fixtures for the local-window gate the scheduled jobs run behind (scripts/local-window.mjs).
 *
 * What it protects: the guarantee that a four-hour window sampled every four hours lands EXACTLY
 * one run a day inside it, for every timezone — whole-hour, half-hour and three-quarter-hour,
 * either side of the date line, in both halves of the year. The old design got this wrong by
 * construction (one cron for one timezone), and the fix that replaced it was a hard check that
 * turned the template's own CI red. So this suite runs on the pristine template, needs no chart,
 * and ships with red cases (INVARIANTS.md X-10).
 */
import { localHourIn } from './lib/athlete.mjs'

let failed = 0
const ok = (n) => console.log(`  ok   ${n}`)
const bad = (n, d = '') => { failed++; console.log(`  FAIL ${n}\n       ${d}`) }
const yes = (n, c, d = '') => (c ? ok(n) : bad(n, d))

const inWindow = (hour, lo, hi) => Number.isInteger(hour) && hour >= lo && hour < hi

console.log('\nlocal-window — the pure predicate')
yes('0 is inside [0,4)', inWindow(0, 0, 4))
yes('3 is inside [0,4)', inWindow(3, 0, 4))
yes('4 is OUTSIDE [0,4) — hi is exclusive', !inWindow(4, 0, 4))
yes('a non-integer hour is never due', !inWindow(NaN, 0, 4))

console.log('\nlocal-window — one run a day, every zone, both halves of the year')
// Six samples a day, as `0 */4 * * *` fires them.
const samples = (y, m, d) => [0, 4, 8, 12, 16, 20].map((h) => new Date(Date.UTC(y, m, d, h)))
const zones = [
  'America/Los_Angeles', 'Europe/London', 'Europe/Lisbon', 'Asia/Kolkata', 'Asia/Kathmandu',
  'Australia/Adelaide', 'Australia/Lord_Howe', 'America/St_Johns', 'Pacific/Chatham',
  'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Tokyo', 'UTC',
]
for (const tz of zones) {
  for (const [label, y, m, d] of [['Jan', 2026, 0, 15], ['Jul', 2026, 6, 15]]) {
    const hits = samples(y, m, d).filter((at) => inWindow(localHourIn(tz, at), 0, 4)).length
    yes(`${tz.padEnd(22)} ${label}: exactly one rollover sample in 00:00-04:00`, hits === 1, `got ${hits}`)
    const steps = samples(y, m, d).filter((at) => inWindow(localHourIn(tz, at), 12, 16)).length
    yes(`${tz.padEnd(22)} ${label}: exactly one steps-check sample in 12:00-16:00`, steps === 1, `got ${steps}`)
  }
}

console.log('\nlocal-window — red fixtures')
// A window narrower than the sampling interval can miss a whole day. The check must be able to
// see that, or it certifies whatever window somebody types into the workflow.
const narrow = samples(2026, 0, 15).filter((at) => inWindow(localHourIn('Asia/Kolkata', at), 2, 3)).length
yes('a one-hour window sampled every four hours misses Kolkata entirely (the defect the width guards)',
  narrow === 0, `got ${narrow}`)
yes('localHourIn is an integer 0-23', (() => {
  const h = localHourIn('Asia/Kathmandu', new Date(Date.UTC(2026, 0, 15, 18, 30)))
  return Number.isInteger(h) && h >= 0 && h <= 23 && h === 0 // 18:30 UTC + 5:45 = 00:15
})())

console.log(failed ? `\nlocal-window: ${failed} FAILED.\n` : '\nlocal-window: all assertions passed.\n')
process.exit(failed ? 1 : 0)
