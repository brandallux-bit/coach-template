/**
 * X-11 — **nothing shared may encode one athlete.**
 *
 * WHAT THIS PROTECTS. `constants.json`'s own header has said *"Nothing in `scripts/` or `src/` may
 * hardcode a value about the athlete"* since intake, and the 2026-08-13 audit confirmed that holds
 * for **numbers** and fails completely for **prose and enums**. A second athlete forking this
 * template got a `primary`-badged "Waist at navel" tile, a card explaining a 36.5″ figure taken
 * mid-day off prednisone, a Today tab telling them *"only the BJJ days are fixed"*, and a
 * `training.csv` type enum that was one man's activity list (audit F-31, F-34, F-15).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE SEAM: how "what is about THIS athlete" is derived without hardcoding this athlete
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * A denylist naming Bruce, BJJ and prednisone, written into `scripts/`, would be the very defect
 * it checks for. So nothing here names anything. Four rules, and the reasoning matters more than
 * the regexes:
 *
 * 1 · **The denylist is DERIVED from fields the chart already maintains for other reasons.** The
 *     session-type registry, the domain map, the metric registry, the weekly template's session
 *     names, the dashboard copy, the athlete's own name. Every one of those exists because some
 *     other part of the system needs it, so none of them is a second act of memory — the same
 *     move `scripts/lib/suspensions.mjs` makes with the exclusion sentence a coach writes anyway,
 *     and W1 makes with the date.
 *
 * 2 · **In CODE, a term only counts as DATA, never as prose.** `.mjs`/`.ts`/`.tsx` are stripped of
 *     comments before matching, and a hit must sit inside a string literal, an object key, or an
 *     array element. This is the single highest-leverage rule in the file: it removes ~97 comments
 *     legitimately narrating a dated past defect (*"the seated bike failed at ~1 min on
 *     2026-08-13"*) while keeping **every** real leak, because real leaks are string literals,
 *     keys and enum members by construction. A comment is a record; a literal is behaviour.
 *
 * 3 · **In MARKDOWN, prose counts.** A skill's or an agent's prose IS its instruction — *"this
 *     athlete is a foodie with formal wine credentials"* is executed, not narrated. There is no
 *     comment/data distinction to lean on, so those need acknowledgements instead (below).
 *
 * 4 · **`docs/` is REPORTED, never failed, and the reason is not convenience.** `docs/audit/`,
 *     `INVARIANTS.md` and `BUILD-PLAN.md` are the engineering record *of these very findings*;
 *     X-11's own statement quotes all three F-31 strings verbatim. A check that goes red on the
 *     document describing the check is a check nobody keeps. `docs/` is also the one shared path
 *     whose audience is the maintainer alone (`SURFACES.md`) — it is not code that runs, not prose
 *     the athlete reads, and not an instruction an agent follows.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ACKNOWLEDGEMENTS — the exemption mechanism, and why a stale one is a failure
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Some hits are real and cannot be swept: moving a live `body.csv` column into `metrics.csv`
 * rewrites the athlete's own record, and generalising a skill that exists *because of* one
 * athlete's values is a coaching decision. Those get an acknowledgement — and the design has three
 * properties W5 and W6 both paid for:
 *
 *   **It names no term.** An entry is `{ path, hits, digest, reason, since, owner }`. The digest is
 *   taken over the matched lines, so this file still contains no athlete vocabulary. That is not a
 *   technicality: an allowlist reading `'skills/x.md': 'mentions wine'` would put the leak in the
 *   scanner.
 *
 *   **It is pinned to the file's ACTUAL hit set.** Add a leak, remove a leak, or reword one, and
 *   the digest moves and the check fails. An acknowledgement therefore cannot quietly widen into
 *   cover for a leak nobody has looked at.
 *
 *   **A stale entry is itself a failure.** An acknowledgement whose file no longer leaks is dead
 *   weight claiming to be a considered decision — `test-single-home.mjs` learned this the same
 *   way. It also means the list is the exact worklist for finishing X-11.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// -------------------------------------------------------------------------------------------
// Scope
// -------------------------------------------------------------------------------------------

/** Shared paths, and what a hit in each one means. See rule 4 in the header for `docs/`. */
export const SCOPE = [
  { dir: 'scripts', mode: 'enforced', kind: 'code' },
  { dir: 'src', mode: 'enforced', kind: 'code' },
  { dir: 'skills', mode: 'enforced', kind: 'prose' },
  { dir: '.claude/agents', mode: 'enforced', kind: 'prose' },
  { dir: 'docs', mode: 'reported', kind: 'prose' },
]

const EXTENSIONS = ['.mjs', '.js', '.ts', '.tsx', '.md', '.json', '.yml', '.yaml']

/**
 * Paths that are never scanned, each for a structural reason rather than a convenient one.
 *
 * `src/generated` and `docs/build-prd/prd.html` are build artifacts, gitignored, and rebuilt from
 * the chart every time — flagging them is flagging the chart twice. `scripts/test-*.mjs` is the
 * one that needs a real argument: **a red fixture drawn from the case it reproduces is the point**
 * (X-10). `test-suspensions.mjs` inlines the athlete's real rehab plan because a synthetic one
 * would not have caught the grammar bug it was written for. What a suite must not do is *read* the
 * live chart, and that is `scripts/lib/test-mode.mjs`'s rule, checked separately.
 */
const NEVER_SCANNED = [
  { path: 'src/generated', why: 'build artifact, regenerated from the chart on every build' },
  { path: 'docs/build-prd/prd.html', why: 'build artifact, compiled from the markdown beside it' },
  { path: 'scripts/test-', why: 'a red fixture drawn from the real case it reproduces is X-10 working, not a leak' },
]

// -------------------------------------------------------------------------------------------
// The denylist, derived from athlete/
// -------------------------------------------------------------------------------------------

/**
 * Terms shorter than this are never collected. Short fragments collide with everything, and a check
 * whose output is mostly noise is a check that gets muted.
 */
const MIN_TERM = 4

/**
 * Ordinary English and this system's own vocabulary. Never collected, whatever the chart says.
 *
 * ⚠ **THIS IS THE ONE PLACE A JUDGEMENT CALL LIVES, and the judgement is LINGUISTIC, not
 * athletic.** Everything in it is either an ordinary English word or a term `data/METHOD.md` and
 * `CLAUDE.md` define for every chart. **Nothing about a body, a sport, an injury, a place or a
 * preference may ever be added here.** A term that is genuinely about the athlete and genuinely
 * cannot move gets an ACKNOWLEDGED entry instead — visible, dated, owned, pinned to the lines it
 * covers. Adding it here would hide it forever, which is how a denylist rots into a formality.
 */
const STOPWORDS = new Set(`
about above across after against almost already also although always among another anything apply
because before being below best better between both came cannot change current date days decision
does doing done during each else enough every everything first follow from further given goes going
have having here history however included including into itself just keep known last least leave
less like likely little long made make many might more most much must never next note nothing only
other over part past place point rather read ready real record recorded reference relevant remain
reported response result same says several should show side since some something soon standing
start started state status stay still stop such take taken than that their them then there these
they thing things this those three through time times today took total under until upon used using
very well were what when where whether which while whole will with within without work working
would year years your
session sessions daily weekly supplements plan phase block target baseline morning evening light
moderate hard completed planned skipped rest steps protocol depart intake deficit surplus
`.trim().split(/\s+/))

const isCollectable = (t) =>
  typeof t === 'string'
  && t.length >= MIN_TERM
  // Letters and hyphens only: dates, versions and bare numbers are never identifying on their own.
  && /^[A-Za-z][A-Za-z-]*$/.test(t)
  && !STOPWORDS.has(t.toLowerCase())

const words = (s) => String(s ?? '')
  .split(/[^A-Za-z0-9’'-]+/)
  .map((w) => w.replace(/^[’'-]+|[’'-]+$/g, ''))

/**
 * Crude symmetric stemming, borrowed from `scripts/lib/suspensions.mjs` for the reason it was added
 * there: a heading reading `Knees` and an agent reading `knee` are the same leak, and a
 * three-letter guard once let `step-ups` past `step-up` while the check looked healthy.
 */
const singular = (w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)

/**
 * A proper noun or an acronym — `Miralax`, `Peloton`, `BJJ`, `MCL`.
 *
 * ⚠ **THIS IS WHY THE CHECK CAN READ PROSE AT ALL WITHOUT DROWNING.** Harvesting every content word
 * out of the athlete's files was tried first and produced **463 hits across 43 files, almost all of
 * them ordinary English** — `back`, `rate`, `floors`, `food`, `reading`, `issues` — matching
 * sentences with nothing athlete-specific in them. A check with that signal-to-noise is a check
 * somebody mutes in a week.
 *
 * A capitalised word appearing mid-sentence, or an all-caps run of three or more letters, is a NAME:
 * of a drug, a sport, a place, a person, a ligament. Those are the terms whose presence in shared
 * code is unambiguous. **Sentence-initial capitals are excluded** — they are grammar, not naming.
 */
const properNounsIn = (text) => {
  const seen = new Map()
  for (const line of text.split('\n')) {
    const clean = line.replace(/[#>*_`|·⛔]+/g, ' ')
    for (const m of clean.matchAll(/\S+/g)) {
      const bare = m[0].replace(/^[^A-Za-z]+|[^A-Za-z-]+$/g, '')
      // Mixed case only. ALL-CAPS is EMPHASIS in this repo's prose, not acronym — harvesting it
      // collected MAJOR, WRONG, FAILED, SURGERY and a dozen more, and no length rule separates
      // those from MCL or ACL. Acronyms that matter are reachable from the registry instead.
      if (!/^[A-Z][a-z-]{2,}$/.test(bare) || STOPWORDS.has(bare.toLowerCase())) continue
      seen.set(bare, (seen.get(bare) ?? 0) + 1)
    }
  }
  // A NAME RECURS; A SENTENCE-INITIAL CAPITAL USUALLY DOES NOT.
  //
  // Excluding sentence-initial words directly was tried first and was worse than useless: in a
  // chart, the words that matter live in bullets and table cells — `| Miralax |`, `- **Peloton**`
  // — so stripping the markdown furniture made every one of them token zero and dropped the drug,
  // the machine and the movement names while keeping nothing. **Recurrence separates them
  // properly**: a name is used repeatedly, a capitalised sentence opener is not. Three occurrences
  // was too strict for a short constraints file; two is the line, and `--list` is how it is
  // audited.
  return [...seen.entries()].filter(([, n]) => n >= 2).map(([w]) => w)
}

export function denylistFrom(root) {
  const terms = new Map() // lower-cased stem -> { term, stem, kind, from: Set }

  /**
   * A single identifying word: a name, an enum key, an event. Matched with word boundaries.
   *
   * `structured` skips the length and stopword filters, because those exist to keep ordinary
   * English out of a PROSE harvest. A registry key is not prose — it is the enum itself, and a
   * three-letter sport was silently dropped by a four-character minimum written for sentences.
   */
  const addWords = (raw, from, { structured = false, kind = 'word' } = {}) => {
    for (const w of words(raw)) {
      if (structured ? !/^[A-Za-z][A-Za-z0-9-]*$/.test(w) : !isCollectable(w)) continue
      const key = singular(w.toLowerCase())
      if (!terms.has(key)) terms.set(key, { term: w, stem: key, kind, from: new Set() })
      terms.get(key).from.add(from)
    }
  }

  /**
   * A whole label or sentence, matched as a phrase.
   *
   * Phrases are how the chart's own PROSE is checked without harvesting its vocabulary: the leak is
   * `"Morning, fasted, at navel. The 36.5″ intake figure is deliberately excluded…"` appearing as a
   * literal in a shared component, not the word "figure" appearing in a sentence.
   */
  const addPhrase = (raw, from) => {
    const norm = String(raw ?? '').replace(/\s+/g, ' ').trim()
    if (norm.split(' ').filter(Boolean).length < 2) return addWords(norm, from)
    const key = `phrase:${norm.toLowerCase()}`
    if (!terms.has(key)) terms.set(key, { term: norm, stem: null, kind: 'phrase', from: new Set() })
    terms.get(key).from.add(from)
  }

  const constantsPath = join(root, 'athlete', 'constants.json')
  if (existsSync(constantsPath)) {
    const c = JSON.parse(readFileSync(constantsPath, 'utf8'))
    addWords(c.athlete?.name, 'athlete.name', { structured: true })
    // The registry keys ARE the enum a shared file must not restate.
    for (const [type, def] of Object.entries(c.sessionTypes ?? {})) {
      if (type.startsWith('_')) continue
      addWords(type, 'sessionTypes key', { structured: true, kind: 'enum-member' })
      addPhrase(def?.domain, 'sessionTypes domain')
    }
    for (const [role, label] of Object.entries(c.domains ?? {})) {
      if (!role.startsWith('_')) addPhrase(label, 'domains')
    }
    for (const [key, def] of Object.entries(c.metrics ?? {})) {
      if (key.startsWith('_')) continue
      // ⚠ `label` is deliberately NOT collected. A metric's display string is usually ordinary
      // physiology — "Resting heart rate" — and matching it flagged the recovery agent for naming
      // a universal measure. The DOMAIN it serves is the athlete-specific half.
      addPhrase(def?.domain, 'metrics domain')
    }
    for (const [day, entry] of Object.entries(c.program?.weeklyTemplate ?? {})) {
      if (!day.startsWith('_')) addPhrase(entry?.session, 'weeklyTemplate session')
    }
    for (const [key, text] of Object.entries(c.copy ?? {})) {
      // Sentence by sentence: a component quoting half the caption is the same leak.
      if (key.startsWith('_')) continue
      for (const sentence of String(text).split(/(?<=[.!?])\s+/)) addPhrase(sentence, 'copy')
    }
    for (const key of Object.keys(c.events ?? {})) {
      if (!key.startsWith('_')) addWords(key.replace(/([a-z])([A-Z])/g, '$1 $2'), 'events')
    }
  }

  /**
   * ⚠ **THE PROSE HARVEST WAS BUILT, MEASURED, AND REMOVED. Read this before adding it back.**
   *
   * Harvesting terms out of `athlete/`'s markdown — `profile.md`, `injury-history.md`,
   * `hard-constraints.md` — was tried in three progressively narrower forms, and every one of them
   * failed the same way:
   *
   *   every content word            **463 hits in 43 files**, almost all ordinary English
   *   capitalised words, any        158 hits in 40 files (`Training`, `Travel`, `Movement`, `Pain`)
   *   capitalised, recurring ≥2     158 hits — recurrence separates names from sentence openers,
   *                                 but not names from ordinary words that are *also* names
   *
   * The last one is the interesting failure. It correctly found the drug, the machine and the
   * clinician — and it equally found `Build`, `Home`, `Left`, `Heavy` and `None`, because a chart
   * writes those in headings and this repo writes them in code. **No mechanical rule separates "an
   * ordinary English word that this athlete's file happens to capitalise" from "a name".** The only
   * thing that would is a curated stoplist, and a stoplist tuned against THIS chart's output is
   * per-athlete content inside the scanner — the exact defect being checked for.
   *
   * So the denylist is **structured fields only**. What that costs is stated plainly in
   * `docs/INVARIANTS.md` X-11 rather than hidden here: a term that identifies the athlete but is
   * not in any structured field — a brand-name medication, an injury site, a food preference — is
   * NOT detected. `body.csv`'s `miralax` and `bowel_movements` columns are exactly that case, they
   * are a real X-11 breach, and they are open work rather than a caught one.
   */

  return [...terms.values()].map((t) => ({ term: t.term, stem: t.stem, kind: t.kind, from: [...t.from].sort() }))
}

// -------------------------------------------------------------------------------------------
// Matching
// -------------------------------------------------------------------------------------------

/** Comment-stripped source, so prose about a past defect can neither satisfy nor trip a rule. */
export const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/.*$/gm, (_, p) => p)

/**
 * Does this line carry the term as DATA rather than as prose? See rule 2 in the header.
 *
 * Deliberately generous about what counts as data — a quoted string anywhere on the line, an
 * unquoted object key, or a bare array member. A leak that is not one of those is not a leak the
 * code can act on.
 */
const asData = (line, re) => {
  const strings = [...line.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`]*)`/g)]
    .map((m) => m[1] ?? m[2] ?? m[3] ?? '')
  if (strings.some((s) => re.test(s))) return true
  // An unquoted object key or a JSX prop: `bjj: 10.3`, `label={...}`.
  const keys = [...line.matchAll(/(?:^|[{,(\s])([A-Za-z_$][\w$]*)\s*[:=]/g)].map((m) => m[1])
  return keys.some((k) => re.test(k))
}

const walk = (dir, out = []) => {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.git')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXTENSIONS.some((e) => entry.endsWith(e))) out.push(full)
  }
  return out
}

/**
 * Every leak in the shared paths, grouped by file.
 *
 * Returns `[{ path, mode, hits: [{ line, text, terms }], digest }]`, newest-scanned order. The
 * digest is over the matched line texts, which is what an acknowledgement pins.
 */
export function scanForLeaks(root, denylist = denylistFrom(root)) {
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  /** `\b` only where the phrase's own first/last character is a word character. */
  const bound = (pattern, raw) =>
    (/^\w/.test(raw) ? '\\b' : '') + pattern + (/\w$/.test(raw) ? '\\b' : '')
  const patterns = denylist.map((d) => ({
    ...d,
    // A word matches with boundaries, case-insensitively, and tolerates a plural: `Peloton`,
    // `peloton`, `PELOTON` and `Knees` against a `knee` heading are one leak. A PHRASE matches on
    // its own text with whitespace made flexible, so a re-wrapped copy of the same sentence in a
    // shared component still collides.
    // ⚠ ANCHORED — **but only where a boundary can exist.** Without the trailing boundary the
    // phrase `Session B` matched `session burn`, because `B` happily consumed the `b` of `burn`.
    // With an unconditional one, a phrase ending in a full stop matched NOTHING, because `\b`
    // after `.` demands a following word character and a caption ends the string. Both were found
    // by watching the fixtures fail rather than by reading the regex.
    // ⚠ LETTER BOUNDARIES, NOT `\b`, FOR THE WORD CASE. `\b` treats `_` as a word character, so
    // `\bBruce\b` does not match `BRUCE_WAIST_BASELINE` — and SCREAMING_SNAKE is exactly how an
    // athlete's name or figure arrives in shared code. Verified: `const BRUCE = 1` was caught and
    // `const BRUCE_WAIST = 36.5` passed clean. Anchoring on letters instead makes `_`, digits and
    // punctuation all separators, which is what "a word on its own" means here.
    re: d.kind === 'phrase'
      ? new RegExp(bound(esc(d.term).replace(/\\?\s+/g, '\\s+'), d.term), 'i')
      : new RegExp(`(?<![A-Za-z])${esc(d.stem ?? d.term)}s?(?![A-Za-z])`, 'i'),
  }))
  const found = []

  for (const { dir, mode, kind } of SCOPE) {
    for (const full of walk(join(root, dir))) {
      const rel = relative(root, full)
      if (NEVER_SCANNED.some((n) => rel.startsWith(n.path))) continue
      const raw = readFileSync(full, 'utf8')
      const isCode = kind === 'code' && /\.(mjs|js|ts|tsx)$/.test(rel)
      const text = isCode ? stripComments(raw) : raw
      const hits = []
      text.split('\n').forEach((line, i) => {
        const matched = patterns.filter((p) => p.re.test(line))
          .filter((p) => !isCode || asData(line, p.re))
        // ⚠ **A REGISTRY KEY COUNTS ONLY IN COMPANY, and this rule is what makes the check
        // usable.** The keys are the athlete's activity list, but several of them are also
        // ordinary English — `strength`, `walk`, `rest`, `circuit`. One of them on a line is a
        // sentence; TWO OR MORE is the enum restated, which is exactly the defect F-15 names:
        // `['strength', 'circuit', 'bjj', 'peloton', 'walk', 'rest', 'other']` typed into a
        // schema, a dropdown and a floor set. Matching singles produced 27 hits on lines like
        // "flag conflicts with the strength agent" — noise that would have got the check muted.
        // ⚠ **A KNOWN, MEASURED HOLE: a LONE registry key is not reported, in code either.**
        // `const t = 'peloton'` in shared code passes this check. That was tested, and it is the
        // deliberate cost of the rule below rather than an oversight.
        //
        // The obvious tightening — "in code, `asData` has already filtered, so keep singles" —
        // was tried and reverted. `asData` is generous by design: its unquoted-key branch matches
        // `identifier =`, so `const walk = (dir, out = []) => {` (a directory walker, in this very
        // file) reads as data. Enabling it produced **10 hits in 8 files, all but one noise** —
        // a `walk` helper, `rehab MET on file`, `walks are counted in steps`. That is the 27-hit
        // result the rule below already records, reproduced at smaller scale. A check that reports
        // its own loop variable is a check that gets muted, and a muted check is worth less than
        // this hole.
        //
        // What still catches the real thing: two or more keys on one line — which is what the
        // enum actually looks like when it is restated into a schema, a dropdown or a floor set
        // (`['strength', 'circuit', 'bjj', 'peloton', 'walk', 'rest', 'other']`), and that form
        // IS caught. A single hand-typed key remains findable only by review.
        const enumHits = matched.filter((p) => p.kind === 'enum-member')
        const terms = (enumHits.length >= 2 ? matched : matched.filter((p) => p.kind !== 'enum-member'))
          .map((p) => p.term)
        if (terms.length) hits.push({ line: i + 1, text: line.trim().slice(0, 160), terms })
      })
      if (hits.length) {
        found.push({
          path: rel,
          mode,
          hits,
          digest: createHash('sha256').update(hits.map((h) => `${h.line}:${h.text}`).join('\n'))
            .digest('hex').slice(0, 16),
        })
      }
    }
  }
  return found.sort((a, b) => (a.path < b.path ? -1 : 1))
}

// -------------------------------------------------------------------------------------------
// Acknowledgements
// -------------------------------------------------------------------------------------------

/**
 * Leaks that are real, known, and not this workstream's to remove — each pinned to the exact set of
 * lines it covers.
 *
 * ⚠ **THIS LIST IS A WORKLIST, NOT A SETTLEMENT.** Every entry names an owner and a date, and the
 * digest means it cannot silently cover a line nobody has read. Removing one is the definition of
 * finishing X-11.
 *
 * `owner` is who can actually discharge the obligation. Where that is the head coach or the
 * athlete, this check must never be the thing that forces the decision — INVARIANTS.md, "a check
 * that cannot go green without inventing data must not be written".
 */
/**
 * ⚠ **EMPTY IN THE TEMPLATE, AND IT MUST STAY THAT WAY UNTIL A CHART EXISTS.**
 *
 * An acknowledgement is a statement about ONE chart's leaks: "these lines name this athlete, here
 * is why they cannot move yet." The template has no athlete, so every entry it could carry would
 * resolve to *matching nothing* on whatever chart is forked from it — and `verdict()` fails on a
 * stale acknowledgement precisely so a dead exemption cannot sit there suppressing a live check.
 * Shipping the source chart's four entries did exactly that: a fresh chart's first `check-all`
 * went red over exemptions belonging to somebody else. Same shape as F-30, one layer up.
 *
 * The four entries this list carried before the W8 sync were resolved rather than carried:
 *   - `.claude/agents/MANIFEST.md` — the template's manifest is blank by construction, so the
 *     "per-athlete file in a shared directory" problem it described does not exist here. The
 *     entry itself said the placement decision "belongs with W8's template sync"; this is it,
 *     and the answer is that the roster stays in `.claude/agents/` because the agent runtime
 *     reads that path, while the template ships it empty.
 *   - `skills/daily-dashboard/SKILL.md` — the worked output example and the F-35 narrative were
 *     rewritten against a placeholder session rather than a real one.
 *   - `skills/program-design/SKILL.md` — the injury section named one athlete's sites; it now
 *     points at `athlete/injury-history.md` and describes the two patterns generically.
 *   - `skills/intake/reference/worked-example.md` — de-identified and kept. It is deliberately
 *     one completed chart shown as a model, behind its own "do not read during Session 1 or 2"
 *     warning, because replacing it with an invented athlete would teach the shape of an
 *     invention. If a future athlete's own domains collide with the example's, the scanner
 *     SHOULD flag it — that is the check working, not a false positive to pre-exempt.
 *
 * A chart adds its own entries here as it finds leaks it cannot move yet. Pin every one
 * (`--pin`); an unpinned entry covers nothing, by design.
 */
export const ACKNOWLEDGED = []

/**
 * The digest an acknowledgement pins: the exact lines it covers, read straight out of the file.
 *
 * ⚠ **CHART-INDEPENDENT ON PURPOSE, and the first version was not** (found by
 * `scripts/test-cold-start.mjs`, which is the whole reason that suite exists). The digest used to
 * be taken over the SCAN's hit set — so on a different chart, whose denylist collides with nothing
 * in those files, every acknowledgement resolved to "no longer leaks" and a brand-new athlete's
 * first push went red over four exemptions belonging to somebody else's chart. That is F-30's
 * shape, reintroduced by the mechanism written to close it.
 *
 * Pinning to `line:text` out of the file makes the question "are the lines somebody read still the
 * lines that are there?", which has the same answer on every chart.
 */
export const pinDigest = (root, path, lines) => {
  const full = join(root, path)
  if (!existsSync(full)) return null
  const text = readFileSync(full, 'utf8').split('\n')
  return createHash('sha256')
    .update(lines.map((n) => `${n}:${(text[n - 1] ?? '').trim().slice(0, 160)}`).join('\n'))
    .digest('hex').slice(0, 16)
}

/**
 * The check's verdict: which leaks fail, which are acknowledged, and which acknowledgements have
 * gone stale.
 *
 * Three outcomes for an acknowledgement, and only two of them are failures:
 *
 *   **valid**  — the pinned lines are byte-identical to what is on disk. It covers the file.
 *   **moved**  — the lines changed. **A failure**: an acknowledgement must never widen to cover a
 *                line nobody has read.
 *   **gone**   — the file no longer has those line numbers at all. **A failure**, and the message
 *                says so: either the leak was fixed and the entry is dead weight, or the file was
 *                restructured and somebody has to look again.
 *
 * An entry with `digest: null` is unpinned: it covers the file and is reported as needing a pin.
 */
export function verdict(found, acknowledged = ACKNOWLEDGED, root = null) {
  const byPath = new Map(found.map((f) => [f.path, f]))
  const moved = []
  const valid = new Set()

  for (const a of acknowledged) {
    // ⚠ **AN UNPINNED ENTRY COVERS NOTHING, and the first version had this exactly backwards.**
    //
    // It let `digest: null` mean "covers the whole file until someone gets round to pinning it",
    // on the reasoning that hand-pinning at the moment of writing is ceremony people paste through.
    // Then a deliberate attempt to sneak past it succeeded on the first try: add a real leak to
    // `src/lib/rollup.ts`, add a three-word unpinned entry beside it, and the check goes green with
    // no trace. An exemption that requires no evidence is not an exemption, it is an off switch —
    // which is the failure `test-single-home.mjs`'s allowlist was built to avoid and this one
    // walked straight into. `--pin` prints the entry ready to paste, so the ceremony costs one
    // command and buys the whole guarantee.
    if (!root) { valid.add(a.path); continue }
    const now = a.lines ? pinDigest(root, a.path, a.lines) : null
    if (a.digest && a.lines && now === a.digest) valid.add(a.path)
    else moved.push({ ...a, now, unpinned: !a.digest || !a.lines })
  }

  const failures = found.filter((f) => f.mode === 'enforced' && !valid.has(f.path))
  const reported = found.filter((f) => f.mode === 'reported')
  return {
    failures,
    reported,
    moved,
    acknowledgedFiles: found.filter((f) => valid.has(f.path)),
    // Acknowledged but currently leaking nothing: on THIS chart the entry is doing nothing. Not a
    // failure, because on another chart that is simply what a different denylist looks like — but
    // printed, because on the template it means X-11 is one file closer.
    inert: acknowledged.filter((a) => valid.has(a.path) && !byPath.has(a.path)),
  }
}
