/**
 * A term the ATHLETE has banned from their own chart, and the check that holds it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THIS IS ATHLETE-LEVEL, NOT SYSTEM-LEVEL, AND THE DISTINCTION IS THE WHOLE DELIVERABLE
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * This chart bans a measure outright. Another athlete may have every reason to use the same
 * measure, and their doctor may insist on it. **A ban that shipped in the template would impose one
 * man's preference on every future chart** — which is X-11 pointing the other way, and it is
 * precisely the correction he made on 2026-08-13:
 *
 *   > *"The ban came from me and should exist only for me, not as part of the system."*
 *
 * So **nothing in this file names a term.** The ban is registered by the athlete's own standing
 * instruction, in their own file, in the sentence a coach writes anyway — the same seam
 * `scripts/lib/suspensions.mjs` uses for exclusions and W1 uses for dated follow-ups. A chart with
 * no such instruction runs this check and it does nothing, which is the correct behaviour and is
 * fixtured in `scripts/test-athlete-leak.mjs`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE GRAMMAR
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   ### ⛔ STANDING INSTRUCTION — X is not to be used, cited, or computed for this athlete
 *
 * A heading in `athlete/profile.md` of the form *"<TERM> is not to be used…"*. English, not this
 * athlete's vocabulary: nothing here knows what X is, only that the athlete said not to use it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * SCOPE — where a mention is a USE, and where it is a RECORD
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * The ban is on *using, citing or computing* the thing. Writing down that it is banned, or that it
 * was once cited and the citation was removed, is not a use — and a check that could not tell those
 * apart would have exactly one green path: deleting the athlete's own account of his instruction.
 *
 *   IN SCOPE   the chart's live decision surfaces (`athlete/`, `nutrition/`, `program/`,
 *              `data/*.csv`), and every surface that speaks to him — the dashboard, the skills,
 *              the agents. *"Never quoted or used by any agent evaluating my status or progress"*
 *              are his words, and they name the agents explicitly.
 *   OUT        the file that DECLARES the ban (a ban cannot be stated without naming the thing);
 *              `decisions.md` and `logs/` (the history of the decision); `docs/` and `scripts/`
 *              (the engineering record and its tooling, which are about the system, not about him
 *              — and where a rule of his must never become a rule of the system's).
 *
 * ⚠ **THIS CHECK MUST NEVER BE THE REASON A THRESHOLD CHANGES.** If it goes red on a live safety
 * floor, the answer is to take it to the athlete, not to re-justify the floor to clear a check.
 * That is `INVARIANTS.md` X-12's explicit instruction and it is the failure that produced an
 * invented clinical threshold once already.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** The file whose headings register a ban. The athlete's standing instructions live here. */
export const DECLARING_FILE = 'athlete/profile.md'

/**
 * Directories and files a banned term may not appear in.
 *
 * `data/METHOD.md` is deliberately excluded even though it sits under `data/`: it is the SYSTEM's
 * method document, shared with every chart, and enforcing one athlete's preference there is exactly
 * the thing this file exists not to do. A leak of his preference into a shared document is
 * `scripts/check-no-athlete-leak.mjs`'s business, not this one's.
 */
const IN_SCOPE = [
  { path: 'athlete', ext: ['.md', '.json'] },
  { path: 'nutrition', ext: ['.md'] },
  { path: 'program', ext: ['.md'] },
  { path: 'data', ext: ['.csv'] },
  { path: 'src', ext: ['.ts', '.tsx'] },
  { path: 'skills', ext: ['.md'] },
  { path: '.claude/agents', ext: ['.md'] },
]

/**
 * Every term this chart's athlete has banned, with the instruction that registered it.
 *
 * Returns `[]` on a chart with no standing instruction — which is most charts, and is why this
 * mechanism can ship in a template at all.
 */
export function bannedTermsFrom(root) {
  const path = join(root, DECLARING_FILE)
  if (!existsSync(path)) return []
  const out = []
  for (const [i, line] of readFileSync(path, 'utf8').split('\n').entries()) {
    // "### ⛔ STANDING INSTRUCTION — BMI is not to be used, cited, or computed for this athlete"
    const m = line.match(/STANDING INSTRUCTION\s*[—–-]\s*([A-Za-z][A-Za-z0-9 -]{0,30}?)\s+is not to be (?:used|cited|computed)/i)
    if (m) out.push({ term: m[1].trim(), line: i + 1, source: `${DECLARING_FILE}:${i + 1}` })
  }
  return out
}

const walk = (dir, exts, out = []) => {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.git')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, exts, out)
    else if (exts.some((e) => entry.endsWith(e))) out.push(full)
  }
  return out
}

/**
 * Every use of a banned term on a decision-bearing surface.
 *
 * `exempt` carries recorded, dated exemptions — `{ path, line, term, reason, since, owner }` —
 * which exist for the one honest case: a live file recording that the term WAS cited here and the
 * citation was removed. An exemption is matched on path **and** line text, so it goes stale the
 * moment the line changes; `verdictFor` below reports that as a failure.
 */
export function scanForBannedTerms(root, terms = bannedTermsFrom(root), exempt = EXEMPT) {
  if (!terms.length) return []
  const patterns = terms.map((t) => ({
    ...t,
    re: new RegExp(`\\b${t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  }))
  const declaring = join(root, DECLARING_FILE)
  const hits = []

  for (const { path, ext } of IN_SCOPE) {
    for (const full of walk(join(root, path), ext)) {
      if (full === declaring) continue
      const rel = relative(root, full)
      // The system's own method document is shared with every chart; see the note on IN_SCOPE.
      if (rel === join('data', 'METHOD.md')) continue
      readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
        for (const p of patterns) {
          if (!p.re.test(line)) continue
          const text = line.trim().slice(0, 200)
          const ex = exempt.find((e) => e.path === rel && line.includes(e.excerpt))
          hits.push({ path: rel, line: i + 1, term: p.term, text, exempt: ex ?? null })
        }
      })
    }
  }
  return hits
}

/**
 * Recorded exemptions — a live file whose text is ABOUT the ban rather than a use of it.
 *
 * ⚠ **Every entry names an owner who can actually discharge it, and carries the excerpt it
 * covers**, so rewording the line invalidates the exemption. An exemption is not permission; it is
 * a dated statement that somebody looked.
 */
export const EXEMPT = [
  {
    path: join('athlete', 'constants.json'),
    excerpt: 'was cited here as supporting context until 2026-08-13; removed',
    term: 'the measure banned by the standing instruction',
    since: '2026-08-14',
    owner: 'head coach',
    reason:
      'The weight-floor note records that the measure WAS cited here as supporting context and '
      + 'that the citation was removed on 2026-08-13 at the athlete\'s instruction. That sentence '
      + 'is the audit trail for the correction — it is why the note no longer justifies the floor '
      + 'that way, and deleting it to clear a grep would erase the only record that the breach '
      + 'happened. **The floor itself (170 lb) is untouched and must stay untouched**: '
      + 'INVARIANTS.md X-12 says re-justifying a live safety floor is a coaching decision and needs '
      + 'the maintainer, not a sweep.',
  },
]

/** Which hits fail, and which exemptions have gone stale. */
export function verdictFor(hits, exempt = EXEMPT) {
  const failures = hits.filter((h) => !h.exempt)
  const used = new Set(hits.filter((h) => h.exempt).map((h) => h.exempt))
  const stale = exempt.filter((e) => !used.has(e))
  return { failures, exempted: hits.filter((h) => h.exempt), stale }
}
