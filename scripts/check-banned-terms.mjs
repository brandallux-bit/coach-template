#!/usr/bin/env node
/**
 * The athlete's own standing instructions, held against the live chart.
 *
 * The mechanism, the scope and the reasoning are in `scripts/lib/banned-terms.mjs` — read its
 * header before changing anything here, especially the paragraph on why this is athlete-level and
 * must never ship as a system rule.
 *
 *   node scripts/check-banned-terms.mjs          # the check
 *   node scripts/check-banned-terms.mjs --list   # what this chart has banned, and where it said so
 *
 * ⚠ **IF THIS GOES RED ON A LIVE SAFETY THRESHOLD, DO NOT RE-JUSTIFY THE THRESHOLD.** Take it to
 * the athlete. A check that can only go green by someone rewriting a number they own is the check
 * that produced an invented clinical threshold on 2026-08-13 (INVARIANTS.md X-12).
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bannedTermsFrom, scanForBannedTerms, verdictFor, DECLARING_FILE } from './lib/banned-terms.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const terms = bannedTermsFrom(ROOT)

if (process.argv.includes('--list')) {
  if (!terms.length) console.log(`no standing instruction in ${DECLARING_FILE} — nothing is banned on this chart.`)
  for (const t of terms) console.log(`  "${t.term}"  registered by ${t.source}`)
  process.exit(0)
}

if (!terms.length) {
  console.log(`banned-terms: nothing banned on this chart (no standing instruction in ${DECLARING_FILE}).`)
  process.exit(0)
}

const hits = scanForBannedTerms(ROOT, terms)
const { failures, exempted, stale } = verdictFor(hits)

let failed = false

if (failures.length) {
  failed = true
  console.error(`\nBANNED TERM USED — ${failures.length} line(s) on a decision-bearing surface:\n`)
  for (const h of failures) console.error(`  ${h.path}:${h.line}  [${h.term}]  ${h.text}`)
  console.error(
    `\n${DECLARING_FILE} records this as a standing instruction from the athlete. Each line above `
    + 'either uses the term or cites it as justification.\n\n'
    + '⚠ If one of them justifies a LIVE THRESHOLD, the fix is not to rewrite the justification. '
    + 'Report it and take it to the athlete — the number is their and re-justifying it to clear a '
    + 'check is how a coach comes to invent one (INVARIANTS.md X-12).')
}

if (stale.length) {
  failed = true
  console.error('\nSTALE EXEMPTION — the line it covers has changed or gone:\n')
  for (const e of stale) {
    console.error(`  ${e.path} — no line matches "${e.excerpt.slice(0, 60)}…".`)
    console.error(`    Recorded ${e.since} by ${e.owner}. Re-read the file and update or delete the entry.`)
  }
}

if (exempted.length) {
  console.log(`\n${exempted.length} recorded exemption(s) — a line ABOUT the ban, not a use of it:`)
  for (const h of exempted) {
    console.log(`  ${h.path}:${h.line} — owner: ${h.exempt.owner}, since ${h.exempt.since}`)
  }
}

if (failed) process.exit(1)
console.log(`banned-terms: clean (${terms.map((t) => `"${t.term}"`).join(', ')} — `
  + `${terms.length} standing instruction(s) held).`)
