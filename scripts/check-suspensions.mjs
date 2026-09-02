#!/usr/bin/env node
/**
 * **Nothing may prescribe what the active block suspends.**
 *
 * No `weeklyTemplate` entry, no live `prescriptions.csv` row and no `exercise-library.md`
 * substitution may name a modality or pattern the block has taken out. The grammar that reads a
 * suspension out of prose, and the argument for every boundary in it, is in
 * `scripts/lib/suspensions.mjs` — read that before changing anything here.
 *
 * WHY IT IS A CHECK AND NOT TWO EDITS. `INVARIANTS.md` uses this exact case as its worked example
 * of the operating rule. The instance — the seated bike still on Tue and Sat after the test ride
 * failed at ~1 minute — is two JSON keys and four minutes. The class is this file, and it closes
 * F-19, F-25, F-33 and F-44, three of which nobody had connected, and it holds for every future
 * block including the one after this athlete's knee is better.
 *
 * WHY IT MAY FAIL A BUILD, where most of this repo's checks may not. Every collision it reports is
 * fixable **by editing the record**: correct the template, correct the row, or mark the offer with
 * `⛔` in the document that offers it. None of them can only be closed by the athlete or their doctor
 * deciding something — the test `INVARIANTS.md` sets for whether a check is entitled to block. It
 * never proposes a load, a dose or a phase.
 *
 *   node scripts/check-suspensions.mjs          # fail on any collision
 *   node scripts/check-suspensions.mjs --list    # print what the parser saw, and exit 0
 *
 * `--list` is not a debugging convenience. A prose parser nobody can audit is a parser that
 * silently stops finding things, which is the failure this whole workstream exists to remove.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readCsv } from './lib/csv.mjs'
import { readChartDocs, PROGRAM_DIR } from './lib/chart-docs.mjs'
import { RESERVED_SESSIONS } from './lib/sessions.mjs'
import { suspensionCollisions } from './lib/suspensions.mjs'
import { constants, hasChart, localToday } from './lib/athlete.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIST = process.argv.includes('--list')

if (!hasChart) {
  console.log('No athlete/constants.json — template repo with no chart yet. Nothing to check.')
  process.exit(0)
}

const planDocs = readChartDocs(ROOT).filter((d) => d.path.startsWith(`${PROGRAM_DIR}/`))
if (!planDocs.length) {
  console.log(`No ${PROGRAM_DIR}/ documents — no block, so nothing is suspended.`)
  process.exit(0)
}

const weeklyTemplate = constants.program?.weeklyTemplate ?? {}
const prescriptions = readCsv(join(ROOT, 'data', 'prescriptions.csv'))
const today = localToday()

const { suspensions, collisions, staleMarks, mark } = suspensionCollisions({
  planDocs,
  weeklyTemplate,
  prescriptions,
  sessions: [
    ...Object.values(weeklyTemplate).map((e) => e?.session),
    // ⚠ **THE CONDITIONING MENU IS HELD TO THE SAME RULE AS THE TEMPLATE.** Its options are
    // sessions a coach may be handed on any non-lifting day, and they are prescribed exactly like
    // template sessions — but they are not IN the template, so without this line every one of them
    // sat outside the suspension guard. An option built on a movement the block later took out
    // would then be proposed, and the only thing standing between the athlete and it would be the
    // coach remembering. `program.conditioningMenu` is the list of those session names, and it is
    // machine-readable for exactly this.
    //
    // `Array.isArray` rather than `?? []`: `validate-data.mjs` rejects any other shape, but this
    // script also runs standalone and under `--list`, where nothing has validated yet, and a
    // spread of a non-array throws a bare TypeError instead of the error that names the key.
    ...(Array.isArray(constants.program?.conditioningMenu) ? constants.program.conditioningMenu : []),
    ...RESERVED_SESSIONS,
  ],
  today,
})

if (LIST) {
  console.log(`suspensions read from ${planDocs.length} ${PROGRAM_DIR}/ document(s):\n`)
  for (const s of suspensions) {
    console.log(`  ${s.term.padEnd(34)} ${s.cites[0].path}:${s.cites[0].line} (${s.cites[0].shape})`
      + (s.cites.length > 1 ? ` +${s.cites.length - 1} more` : ''))
  }
  console.log(`\n${suspensions.length} term(s). Collisions: ${collisions.length}. `
    + `Stale ${mark} marks: ${staleMarks.length}.`)
  process.exit(0)
}

if (!suspensions.length) {
  console.log(`suspensions: nothing suspended by any ${PROGRAM_DIR}/ document. `
    + 'Nothing to check — a block that forbids nothing is a valid block.')
  process.exit(0)
}

let failed = 0

if (collisions.length) {
  failed += collisions.length
  console.log(`FAIL ${collisions.length} thing(s) prescribe what the block suspends:\n`)
  for (const c of collisions) {
    console.log(`  [${c.surface}] ${c.label}`)
    console.log(`      offers  "${c.text}"`)
    console.log(`      which names the suspended "${c.term}"`)
    console.log(`      suspended at ${c.cite.path}:${c.cite.line} — "${c.cite.quote}"\n`)
  }
  console.log(`FIX IT ON THE PRESCRIBING SIDE. Change the template entry or the prescription row, `
    + `or — where the movement is genuinely coming back at a later phase and the line should stay `
    + `— mark that offer with ${mark} in the document that makes it, so the athlete reads the `
    + `suspension in the file they open to substitute rather than in a second file they have to `
    + `remember to open (audit F-19).\n`)
}

if (staleMarks.length) {
  failed += staleMarks.length
  console.log(`FAIL ${staleMarks.length} ${mark} mark(s) no longer correspond to a suspension:\n`)
  for (const m of staleMarks) console.log(`  ${m.path}:${m.line} — "${m.text}"`)
  console.log(`\nThe block no longer suspends these. Remove the ${mark} and let the substitution `
    + 'stand again — a mark nobody is checking reads as coverage, and at a phase revert this list '
    + 'is exactly the set of lines to restore.\n')
}

if (!failed) {
  console.log(`suspensions: ${suspensions.length} term(s) suspended by the block; `
    + `${Object.keys(weeklyTemplate).length} template day(s), ${prescriptions.length} prescription `
    + `row(s) and every ${PROGRAM_DIR}/ substitution checked. Nothing prescribes them.`)
  process.exit(0)
}

console.log(`check-suspensions: ${failed} FAILED.`)
process.exit(1)
