#!/usr/bin/env node
/**
 * X-11, run over the live chart: **nothing in a shared path may encode this athlete.**
 *
 * The design, the seam and the acknowledgement mechanism are in `scripts/lib/athlete-leak.mjs`.
 * This file is the CLI and the reporting.
 *
 *   node scripts/check-no-athlete-leak.mjs           # the check
 *   node scripts/check-no-athlete-leak.mjs --list    # every denylist term and where it came from
 *   node scripts/check-no-athlete-leak.mjs --all     # every hit, including acknowledged and docs/
 *   node scripts/check-no-athlete-leak.mjs --pin     # the digest to paste into an acknowledgement
 *
 * `--list` exists for the same reason `check-suspensions.mjs --list` does: a derived denylist
 * nobody can audit is a denylist that silently stops matching. Print it when a leak you expected
 * does not show up.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACKNOWLEDGED, denylistFrom, pinDigest, scanForLeaks, verdict } from './lib/athlete-leak.mjs'
import { hasChart, NO_CHART_MESSAGE } from './lib/athlete.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (f) => process.argv.includes(f)

if (!hasChart) {
  // Nothing to derive a denylist FROM. That is not a pass and not a failure — there is no athlete
  // to leak yet, and saying so is more honest than printing "0 leaks found".
  console.log(`no denylist to build — ${NO_CHART_MESSAGE}`)
  process.exit(0)
}

const denylist = denylistFrom(ROOT)

if (arg('--list')) {
  console.log(`${denylist.length} denylist term(s), derived from athlete/:\n`)
  for (const { term, from } of [...denylist].sort((a, b) => (a.term < b.term ? -1 : 1))) {
    console.log(`  ${term.padEnd(24)} ${from.join(', ')}`)
  }
  process.exit(0)
}

const found = scanForLeaks(ROOT, denylist)
const { failures, reported, moved, acknowledgedFiles, inert } = verdict(found, ACKNOWLEDGED, ROOT)

if (arg('--pin')) {
  // Prints an acknowledgement entry's two pinned fields, ready to paste. The digest is taken over
  // the lines as they are ON DISK, not over the scan, so it means the same thing on every chart.
  for (const f of found) {
    const lines = f.hits.map((h) => h.line)
    console.log(`${f.path}\n  lines: [${lines.join(', ')}],\n  digest: '${pinDigest(ROOT, f.path, lines)}',`)
  }
  process.exit(0)
}

const show = (f) => {
  console.log(`  ${f.path} — ${f.hits.length} hit(s)`)
  for (const h of arg('--all') ? f.hits : f.hits.slice(0, 6)) {
    console.log(`    :${String(h.line).padEnd(5)} [${h.terms.join(', ')}] ${h.text}`)
  }
  if (!arg('--all') && f.hits.length > 6) console.log(`    … ${f.hits.length - 6} more (--all)`)
}

let failed = false

if (failures.length) {
  failed = true
  const n = failures.reduce((a, f) => a + f.hits.length, 0)
  console.error(`\nLEAK — ${n} line(s) in ${failures.length} shared file(s) encode this athlete:\n`)
  failures.forEach(show)
  console.error(
    '\nMove the value into athlete/ and render it from there — the session-type registry, the '
    + 'metrics registry, `domains` and `copy` in constants.json are the four homes that already '
    + 'exist. If it genuinely cannot move yet, add an entry to ACKNOWLEDGED in '
    + 'scripts/lib/athlete-leak.mjs naming who can move it and why not now.')
}

if (moved.length) {
  failed = true
  console.error('\nUNUSABLE ACKNOWLEDGEMENT — it covers nothing until it is pinned:\n')
  for (const a of moved) {
    if (a.unpinned) {
      console.error(`  ${a.path} — no lines/digest recorded. An unpinned entry would be an off `
        + 'switch, not an exemption. Run --pin and paste the two fields it prints.')
    } else {
      console.error(`  ${a.path} — pinned ${a.digest}, lines ${a.lines?.join(', ')} now hash ${a.now}.`)
      console.error('    Either the leak was fixed (delete the entry — X-11 is one file closer) or'
        + ' the file moved under it. Re-read those lines, then re-pin with --pin.')
    }
  }
}

if (inert.length) {
  console.log(`\n${inert.length} acknowledgement(s) currently matching nothing on this chart:`)
  for (const a of inert) console.log(`  ${a.path} — owner: ${a.owner}. Nothing to do unless this is the template.`)
}

if (acknowledgedFiles.length) {
  console.log(`\n${acknowledgedFiles.length} acknowledged file(s) — the X-11 worklist, not a settlement:`)
  for (const f of acknowledgedFiles) {
    const a = ACKNOWLEDGED.find((x) => x.path === f.path)
    console.log(`  ${f.path} — ${f.hits.length} hit(s), owner: ${a.owner}, since ${a.since}`
      )
  }
}

if (reported.length) {
  const n = reported.reduce((a, f) => a + f.hits.length, 0)
  console.log(`\ndocs/: ${n} hit(s) in ${reported.length} file(s) — REPORTED, never failed.`)
  console.log('  The engineering record describes this chart\'s defects by design; X-11\'s own'
    + ' statement quotes them. See scripts/lib/athlete-leak.mjs, rule 4.')
  if (arg('--all')) reported.forEach(show)
}

if (failed) process.exit(1)
console.log(`\nno-athlete-leak: clean (${denylist.length} term(s) checked across the shared paths).`)
