#!/usr/bin/env node
/**
 * What this chart's system layer has that the template does not — and vice versa.
 *
 * WHY THIS EXISTS. A chart and the template it was forked from share no git history: `SETUP.md`
 * creates the chart by cloning, and every fix since then has crossed between them as a hand-made
 * "Mirror:" commit. That works exactly as long as somebody remembers, and the record says they
 * don't. The 2026-08-13 audit's W8 named two deliverables — *"a CI tripwire that fails when the
 * diff on `scripts/`, `src/`, `CLAUDE.md`, `data/METHOD.md` and `.github/workflows/` is non-empty
 * beyond N days; then the merge itself."* The merge shipped. The tripwire did not, and within a
 * day of the merge landing the chart shipped a dashboard feature the template never received,
 * while the template's own nine commits sat unpushed. Neither side could tell.
 *
 * This is that tripwire. It is deliberately the smallest thing that answers the question, because
 * the alternative that keeps being proposed — extract the shared layer into a package both repos
 * depend on — is a real answer but a large one, and a chart is meant to be a folder someone can
 * read.
 *
 *   node scripts/check-template-parity.mjs           # report, always exit 0
 *   node scripts/check-template-parity.mjs --fetch   # refresh the comparison ref first
 *   node scripts/check-template-parity.mjs --strict  # exit 1 on unacknowledged drift
 *   node scripts/check-template-parity.mjs --pin     # print paste-ready acknowledgement entries
 *
 * ⚠ **IT REPORTS AND NEVER MERGES.** Bringing two divergent copies together means deciding which
 * side is right, file by file, and that is a judgement call — the same one
 * `absorb-branches.yml` refuses to make when a branch merge conflicts. This
 * prints what has moved and who is ahead. A person decides what crosses.
 *
 * ⚠ **NOT IN `check-all.mjs`, ON PURPOSE.** It needs an `upstream` remote and a recent fetch,
 * which a chart in its first week has neither of, and a red build in week one is audit F-39's
 * whole failure mode. It skips with a named reason wherever it cannot answer, exactly like the
 * `hasChart` guard everywhere else in this directory. Run it from `skills/weekly-review`, or by
 * hand before a template sync.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { git, gitTry } from './lib/git.mjs'
import { SYSTEM_PATHS } from './lib/system-paths.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FETCH = process.argv.includes('--fetch')
const STRICT = process.argv.includes('--strict')
const PIN = process.argv.includes('--pin')

/** The remote the template lives on. `SETUP.md` §1 renames the template clone's origin to this. */
const REF = process.env.TEMPLATE_REF || 'upstream/main'


/**
 * Divergences somebody has looked at and decided are correct.
 *
 * Same shape and the same reasoning as `athlete/leak-acknowledgements.json`: `{ path, digest,
 * since, owner, reason }`, and **the digest is what stops it rotting**. It is taken over the diff
 * itself, so an entry covers the divergence that was actually read — the moment either side
 * changes that file again, the digest moves, the acknowledgement lapses, and the path comes back
 * into the report. An exemption that silently widened to cover a change nobody read would be
 * worse than no exemption at all.
 *
 * Root-level rather than under `scripts/`, so `scripts/` stays byte-identical between chart and
 * template and a template merge can never conflict here.
 *
 * A missing file is the normal state: nothing acknowledged, everything reported.
 */
const ACK_FILE = join(ROOT, 'template-parity.json')
const ACKNOWLEDGED = existsSync(ACK_FILE)
  ? (JSON.parse(readFileSync(ACK_FILE, 'utf8')).entries ?? [])
  : []

const digestOf = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16)

const say = (s = '') => console.log(s)

// --- can we answer at all? -----------------------------------------------------------------
const remote = REF.split('/')[0]
if (!git(['remote']).split('\n').filter(Boolean).includes(remote)) {
  say(`no \`${remote}\` remote — nothing to compare against.`)
  say('A chart created per SETUP.md §1 has one (the template clone, renamed). The template')
  say('itself does not, and skipping here is the correct answer rather than a failure.')
  process.exit(0)
}

if (FETCH) gitTry(['fetch', remote, '--quiet'])

if (gitTry(['rev-parse', '--verify', '--quiet', REF]).status !== 0) {
  say(`\`${REF}\` is not fetched — cannot compare. Run with --fetch, or:`)
  say(`  git fetch ${remote}`)
  process.exit(0)
}

// --- how old is the picture? ---------------------------------------------------------------
//
// Reporting against a ref fetched a month ago is worse than not reporting: it reads as "in sync"
// while saying nothing about the last month. So the age is stated every run, unasked.
const refDate = git(['log', '-1', '--format=%cI', REF])
const ageDays = Math.floor((Date.now() - Date.parse(refDate)) / 86_400_000)
const stale = ageDays >= 7

// --- the comparison ------------------------------------------------------------------------
//
// `git diff` is a tree comparison and needs no merge base, which is what makes this work at all
// across two repos with unrelated histories. `--` scopes it to the system layer; a path that does
// not exist on one side shows up as an add or a delete, which is exactly the finding wanted.
const present = SYSTEM_PATHS.filter((p) => existsSync(join(ROOT, p)) || p.includes('/'))
const changed = git(['diff', '--numstat', REF, '--', ...present])
  .split('\n').filter(Boolean)
  .map((l) => {
    const [add, del, ...rest] = l.split('\t')
    return { path: rest.join('\t'), added: Number(add) || 0, removed: Number(del) || 0 }
  })
  .sort((a, b) => (b.added + b.removed) - (a.added + a.removed))

const withDigest = changed.map((c) => ({
  ...c,
  digest: digestOf(git(['diff', REF, '--', c.path])),
}))

const ackByPath = new Map(ACKNOWLEDGED.map((a) => [a.path, a]))
const drift = []
const held = []
const lapsed = []
for (const c of withDigest) {
  const a = ackByPath.get(c.path)
  if (!a) drift.push(c)
  else if (a.digest === c.digest) held.push({ ...c, ...a })
  else lapsed.push({ ...c, ...a })
}

// An acknowledgement for a path that no longer differs is the mirror-image rot: it sits on a
// check it can no longer justify, and on a fresh chart it would resolve to covering nothing.
const resolved = ACKNOWLEDGED.filter((a) => !withDigest.some((c) => c.path === a.path))

// --- report --------------------------------------------------------------------------------
say(`Comparing this chart against \`${REF}\` — ${refDate.slice(0, 10)}, ${ageDays} day(s) old.`)
if (stale) say(`⚠ that ref is ${ageDays} days old. Re-run with --fetch before trusting this.`)
say()

if (PIN) {
  say('Paste into template-parity.json under "entries":')
  for (const c of [...drift, ...lapsed]) {
    say(JSON.stringify({
      path: c.path,
      digest: c.digest,
      since: git(['log', '-1', '--format=%cs']),
      owner: 'head coach',
      reason: c.reason ?? '<why this divergence is correct>',
    }))
  }
  process.exit(0)
}

if (!drift.length && !lapsed.length) {
  say(`no drift — ${withDigest.length} system path(s) differ, all acknowledged.`)
} else {
  say(`${drift.length + lapsed.length} system path(s) have drifted:`)
  say()
  for (const c of drift) say(`  ${String(c.added).padStart(5)}+ ${String(c.removed).padStart(5)}-  ${c.path}`)
  for (const c of lapsed) {
    say(`  ${String(c.added).padStart(5)}+ ${String(c.removed).padStart(5)}-  ${c.path}`)
    say(`         ↳ acknowledged ${c.since} by ${c.owner}, but the diff has moved since — re-read it.`)
  }
  say()
  say('Neither side is assumed right. Read the diff, decide which way it crosses, and mirror it:')
  say(`  git diff ${REF} -- <path>`)
  say('An intentional difference goes in template-parity.json — run --pin for the entry.')
}

if (held.length) {
  say()
  say(`${held.length} acknowledged divergence(s), unchanged since they were read:`)
  for (const h of held) say(`  ${h.path} — ${h.reason}`)
}

if (resolved.length) {
  say()
  say(`${resolved.length} acknowledgement(s) now cover nothing and should be deleted:`)
  for (const r of resolved) say(`  ${r.path} — ${r.reason}`)
}

process.exit(STRICT && (drift.length || lapsed.length) ? 1 : 0)
