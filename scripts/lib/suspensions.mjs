/**
 * X-3 / X-15 — **the active block's suspension list is authoritative.** Nothing may prescribe a
 * modality or pattern the block has taken out.
 *
 * WHAT THIS PROTECTS. On 2026-08-13 the seated bike failed at ~1 minute, left Phase 1, and
 * `constants.json.weeklyTemplate` went on prescribing 45-minute rides on Tue and Sat for several
 * hours — the note beside the data said "Peloton is suspended" and the data is what renders. That
 * is the instance. The class is bigger and worse: `program/exercise-library.md` pre-authorises
 * substitutions into **step-ups and split squats** under a standing rule reading *"does not need
 * approval"*, and both patterns are on the rehab block's "Not in Phase 1" list. He is authorised
 * in writing to substitute into contraindicated work **at the moment he is least likely to open a
 * second file** (audit F-19, F-25, F-33, F-44).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE SEAM: how "what does the active block suspend" is read out of prose without hardcoding
 * one athlete's injury (INVARIANTS.md X-11).
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Three rules, and the reasoning matters more than the regexes:
 *
 * 1 · **Nothing is registered.** Every `.md` in `program/` is read, the way
 *     `scripts/lib/chart-docs.mjs` reads directories rather than filenames. A register only ever
 *     contains what somebody remembered to put in it, which is the failure mode W1 removed from
 *     dated follow-ups by making the *date* the registration. Here the **exclusion sentence is
 *     the registration**: it is written for the athlete's benefit anyway, in the file where the
 *     decision was taken, and it costs nobody a second act of memory.
 *
 * 2 · **The grammar is English negation, not this athlete's vocabulary.** Nothing below names a
 *     knee, a bike, a sport or a movement. Four exclusion shapes are recognised, each of which a
 *     coach writes without being asked to:
 *
 *       heading      `### Not in Phase 1`            → everything under it, to the next heading
 *       lead + list  `**Still not in Phase 2:** a, b` → the list after the colon
 *       enumeration  `no pivots, no cutting, no …`    → two or more `no X` in one statement
 *       subject      `**BJJ IS OUT.**` / `the bike is out of Phase 1`
 *
 * 3 · **A suspension only means something against a prescriber.** The extracted terms are
 *     intersected with the chart's own prescribing vocabulary, so an over-eager term ("no
 *     equipment", "no rib-flare") collides with nothing and costs nothing. Under-detection is the
 *     danger here, not over-detection, which is why the grammar is deliberately loose and why
 *     `check-suspensions.mjs --list` prints every term it found with its source line: a parser
 *     nobody can audit is a parser that silently stops working.
 *
 * ⚠ **ONE SCOPING DECISION, AND IT IS LOAD-BEARING.** Only exclusions *from the block or a phase*
 * are collected. `left-knee-rehab.md` also says *"Explicitly NOT on the list, and why: … wall-sits
 * …"* — a statement about membership of a list of **calorie-replacement options**, not about the
 * block. It is not collected, and it must not be: the same file prescribes a shallow wall-sit as
 * item 8 of the Phase 1 routine, deliberately, gated at pain. Collecting it would have produced a
 * red check whose only green path was editing the athlete's rehab plan to satisfy a parser. Every
 * other term in that sentence (burpees, jump squats, jump rope, lunges, step-ups …) is *also* in
 * "Not in Phase 1", so nothing is lost by the scoping — which is the evidence it is right, rather
 * than merely convenient.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS A PRESCRIBER, and why the boundary is where it is
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   `weeklyTemplate`      the `session` name and `type` only — **never `focus`**. `focus` is prose
 *                         *about* the session ("replaces the seated ride, which left Phase 1") and
 *                         reading it would flag every session that explains what it replaced.
 *   `prescriptions.csv`   the `exercise` field of a LIVE row only — never `note`, for the same
 *                         reason ("replaces the goblet squat as the day's main driver").
 *   prose OFFERS          a movement a document *hands him to do*: a substitution table, a
 *                         fallback/travel/minimum-viable session, or a `Sub:` clause. Not every
 *                         movement named in `program/` — a rehab file legitimately lists Phase 3's
 *                         split squats while Phase 1 forbids them, and flagging that would make
 *                         the check unusable.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE ACKNOWLEDGEMENT MARKER — the exemption mechanism, and why it lives in the chart
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * An offer carrying `⛔` is acknowledged: the document itself says this one is suspended, so it is
 * no longer a pre-approved substitution. The marker is in the athlete's own file rather than in an
 * allowlist inside this script for two reasons — X-11 (no athlete content in `scripts/`), and
 * because the person who needs to know is **him, in the file he opens at the moment of
 * substituting**, which is precisely where F-19 says the failure happens.
 *
 * A `⛔` that no longer collides is itself a failure. A stale exemption reads as coverage
 * (`test-single-home.mjs` learned this the same way), and here it has a second job: when the block
 * reaches Phase 4 and the suspensions lift, the check tells whoever reverts the template exactly
 * which lines to un-mark.
 */

const OFFER_MARK = '⛔'

// -------------------------------------------------------------------------------------------
// Text normalisation. Both sides of every comparison go through `key()`, so hyphenation, case,
// plurals and punctuation cannot be the reason a suspended pattern slips past.
// -------------------------------------------------------------------------------------------

/**
 * Crude, symmetric stemming. Both sides of every comparison go through it, so over-stemming
 * (`abs` → `ab`) is harmless and under-stemming is not: `Step-ups` splits to `step` + `ups`, and a
 * three-letter guard left `ups` alone while the offer said `Step-up`. The library's pre-authorised
 * step-up — one of the two substitutions this whole check was written for — did not collide, and
 * the check reported 13 problems instead of 15 while looking entirely healthy.
 */
const singular = (w) => (w.length > 2 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)

/** Lowercase, de-punctuated, singularised words. `Step-ups` and `step up` compare equal. */
export const key = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/[’']/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .split(' ')
  .filter(Boolean)
  .map(singular)

/**
 * Does `offer` name `term`? **Set containment, not substring.**
 *
 * `Goblet / KB front squat (controlled ROM)` must match the suspended `goblet squats`, and it does
 * not contain that phrase contiguously — the words are separated by the equipment. Requiring every
 * word of the term to be present, in any order, catches it; requiring *every* word is what stops
 * `split squat` matching it too.
 *
 * ⚠ **A word negated in the offer does not count.** `Anti-flexion core: side plank + Pallof press`
 * must not match a suspended `rotation` because it says *anti*-rotation — the offer is the
 * suspension's opposite, and reading it as an instance is how a check earns its reputation for
 * crying wolf. Any word directly preceded by `anti`, `non` or `no` is dropped from the offer.
 */
const negatedDropped = (words) => words.filter((w, i) => !['anti', 'non', 'no'].includes(words[i - 1]))

export const names = (offer, term) => {
  const have = new Set(negatedDropped(key(offer)))
  const want = key(term)
  return want.length > 0 && want.every((w) => have.has(w))
}

// -------------------------------------------------------------------------------------------
// Markdown blocks. A "statement" is the unit a rule is written in — a bullet, a paragraph, a
// heading, a table row. `test-single-home.mjs` arrived at the same unit the hard way: its first
// version scoped to a sentence and passed against the very defect it was written for, because the
// figure and the verb sat in two different sentences.
// -------------------------------------------------------------------------------------------

/** `[{ text, line, heading }]` — every block, with the heading in force above it. */
export function blocksOf(text) {
  const out = []
  const lines = String(text ?? '').split('\n')
  let buf = []
  let start = 1
  let heading = ''
  let headingLevel = 0

  let quoted = false
  const flush = () => {
    const joined = buf.join('\n').trim()
    if (joined) out.push({ text: joined, line: start, heading, headingLevel, quoted })
    buf = []
    quoted = false
  }

  for (const [i, raw] of lines.entries()) {
    // A heading inside a blockquote (`> ### …`) is still a heading — this chart writes most of its
    // corrections that way, and treating them as body text hid four exclusion lists.
    const bare = raw.replace(/^\s*>+\s?/, '')
    const h = bare.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      flush()
      heading = h[2].trim()
      headingLevel = h[1].length
      out.push({
        text: bare.trim(), line: i + 1, heading, headingLevel, isHeading: true,
        quoted: raw !== bare,
      })
      start = i + 2
      continue
    }
    if (!bare.trim()) { flush(); start = i + 2; continue }
    // A new bullet or table row starts a new statement; a continuation line does not.
    if (/^\s*(?:[-*]\s|\|)/.test(bare) && buf.length) { flush(); start = i + 1 }
    if (!buf.length) { start = i + 1; quoted = raw !== bare }
    buf.push(bare)
  }
  flush()
  return out
}

// -------------------------------------------------------------------------------------------
// Exclusion grammar
// -------------------------------------------------------------------------------------------

/**
 * A heading that scopes a LIST of exclusions beneath it — `### Not in Phase 1`, whose terms are in
 * the paragraph below rather than in the heading.
 *
 * ⚠ Deliberately narrower than `STATEMENT_LEAD` below, and running it is what forced the split.
 * `## Contraindicated for this athlete` is a section heading whose bullets each name one thing
 * **and its replacements** (`Sub: goblet/KB front squat, split squat, leg press`). Scoping a
 * list over it read every substitute as a suspension — twelve movements including `plank`,
 * `bird dog` and `incline walk`, which then collided with almost everything the chart prescribes.
 * A section heading does not make its contents a list; a list heading does.
 */
const SECTION_LEAD = /\bnot in\b|\bstill not\b|\bno longer\b|\bsuspend(?:ed|s|ing)?\b|\bexclud(?:ed|es|ing)\b/i

/**
 * A negation whose object is a REFERENCE INSIDE THE DOCUMENT rather than the plan.
 *
 * `left-knee-rehab.md` says *"Explicitly NOT on the list, and why: … wall-sits …"* — the list in
 * question being a set of calorie-replacement options, not the block. The same file prescribes a
 * shallow wall-sit as item 8 of the Phase 1 routine, deliberately, gated at pain, so collecting it
 * produces a red check whose only green path is editing the athlete's rehab plan to satisfy a
 * parser (INVARIANTS.md, the commit gate).
 *
 * Encoded as grammar rather than as an exemption for one sentence: the object of the negation is
 * deictic — *the* list, *this* table — and a deictic object scopes the negation to itself. Every
 * other movement in that sentence is also on the block's own "Not in Phase 1" list, so nothing is
 * lost, which is the evidence the rule is right rather than merely convenient.
 */
const ASIDE_LEAD = /\bnot on (?:the|this|that)\s+\w+/i

/** The same, plus the verbs a single bullet uses about a single movement. */
const STATEMENT_LEAD = new RegExp(`${SECTION_LEAD.source}|\\bcontraindicated\\b|\\bavoid\\b|\\bmodify\\b|\\bSUBSTITUTE NOW\\b`, 'i')

/** `X is out`, `X is out of Phase 1`, `X are suspended`. The subject sits BEFORE the marker. */
const SUBJECT_OUT =
  /(?:^|\.\s+)\s*(?:[-*>\s]*)?(?:the\s+)?([A-Za-z][\w /-]{1,40}?)\s+(?:is|are)\s+(?:out\b|no longer\b|suspended\b|excluded\b|off the\b)/i

/** `Heavy barbell back squat — avoid by default`: subject, dash, exclusion verb. */
const SUBJECT_DASH =
  /^\s*(?:[-*]\s*)?([^—:\n]{3,70}?)\s*(?:—|--)\s*(?:avoid|suspend|modify|not\b|do not\b|SUBSTITUTE\b)/i

/** `Sub:` / `Sub A:` / `Replace with` — everything after it is a REPLACEMENT, never a suspension. */
const OFFER_INLINE = /\bsubs?(?:titute)?\s*[A-B]?\s*:|\breplace (?:it )?with\b/i

/** Words that end a movement name and begin a qualifier. `Peloton of any kind` → `Peloton`. */
const STOP = /\b(?:as|of|while|when|if|that|which|because|after|before|until|including|for|from|on|in|at|with|so)\b/i

/**
 * Grammar, not vocabulary: a fragment whose first word is a function word or a bare verb is a
 * clause, not a movement. Nothing here names a body part, a sport or a piece of equipment, so it
 * carries no athlete into shared code (X-11) — it is the same list for every chart in every sport.
 */
const FUNCTION_HEAD = new RegExp('^(?:not|no|the|an?|any|it|is|are|was|were|and|or|but|so|then|that'
  + '|this|these|those|every|all|both|each|more|less|only|just|very|still|also|now|here|there|when'
  + '|where|why|how|what|which|who|keep|drop|judge|stop|see|read|log|use|do|be|make|take|give|add'
  + '|cut|hold|check|report|move|watch|ask|say|tell|write|run|start|finish|seat|cap|titrate|refer'
  + '|progress|record|repeat|return|avoid|modify|replace|swap|worse|better|fewer|further'
  + '|same|next|last|first|second|third)\\b', 'i')

/**
 * A fragment that is prose rather than a movement.
 *
 * Four words is the cap because that is what the longest movement name in this chart costs —
 * `heavy barbell back squat`, `single-arm KB swing`, `standing Peloton climbs`. Five is a
 * sentence. The cap is a backstop rather than the filter: `FUNCTION_HEAD` above removes the
 * clauses, and anything that survives both still has to collide with something prescribed.
 */
const isJunk = (t) => !t
  || /\d{4}-\d{2}-\d{2}/.test(t)
  || FUNCTION_HEAD.test(t.trim())
  || key(t).length === 0
  || key(t).length > 4

/** One comma-separated list → the movement names in it. */
function termsFromList(tail) {
  const out = []
  const text = String(tail ?? '').split(OFFER_INLINE)[0]
  for (const rawFragment of text.split(/[,;·&]|\.\s|\band\b|\bor\b/i)) {
    const cleaned = rawFragment
      .replace(/\*\*|`|\*/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[—–][^—–]*$/, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    // `…and are not: burpees` — an embedded list marker inside a fragment. Taking the text after
    // the last colon is what keeps the second half of a two-clause exclusion sentence.
    const afterColon = cleaned.includes(':') ? cleaned.slice(cleaned.lastIndexOf(':') + 1) : cleaned
    const head = afterColon.split(STOP)[0].replace(/^[-–—>\s]+/, '').replace(/[.:;)\]]+$/, '').trim()
    if (!isJunk(head)) out.push(head)
  }
  return out
}

/**
 * A generated block is a RENDERING of something, never a source of it (X-8). `exercise-library.md`
 * carries a generated "Currently out" list built from these very extractions, and reading it back
 * in would make the library cite itself as the reason a movement is out — the citation the athlete
 * needs is the block that took the decision.
 *
 * ⚠ It is blanked LINE FOR LINE rather than deleted, and the difference is a wrong citation versus
 * a right one: every line number this module reports is counted off the text it parsed, so dropping
 * N lines silently moves every subsequent citation N lines up. The banner then points at a line
 * that says something else — which is the failure it exists to prevent, wearing the check's own
 * clothes.
 */
const withoutGenerated = (text) =>
  String(text ?? '').replace(/<!-- GENERATED:[\s\S]*?<!-- \/GENERATED:[^>]*-->/g,
    (m) => '\n'.repeat(m.split('\n').length - 1))

/**
 * Every suspension the chart's live plan documents declare.
 *
 * `docs` is `[{ path, text }]`, exactly the shape `chart-docs.mjs` produces, so the caller decides
 * which directory is "the plan" and this module never names one.
 */

export function extractSuspensions(docs) {
  const found = []
  const add = (term, block, doc, shape) => {
    if (isJunk(term)) return
    found.push({
      term: term.replace(/\s+/g, ' ').trim(),
      shape,
      path: doc.path,
      line: block.line,
      quote: block.text.replace(/\s+/g, ' ').slice(0, 180),
    })
  }

  for (const doc of docs ?? []) {
    const blocks = blocksOf(withoutGenerated(doc.text))
    for (const [i, block] of blocks.entries()) {
      // (a) A LIST heading scopes the blocks under it, to the next heading of equal or higher
      //     level. `### Not in Phase 1` is a heading whose list is the paragraph below it.
      if (!block.isHeading || !SECTION_LEAD.test(block.text)) continue
      for (let j = i + 1; j < blocks.length; j++) {
        const b = blocks[j]
        if (b.isHeading && b.headingLevel <= block.headingLevel) break
        if (ASIDE_LEAD.test(b.text)) continue
        for (const t of termsFromList(b.text)) add(t, b, doc, 'list-heading')
      }
    }

    for (const block of blocks) {
      if (block.isHeading) continue
      const text = block.text.replace(/\*\*/g, ' ')
      // A negation aimed at something inside the document is not a suspension. See ASIDE_LEAD.
      if (ASIDE_LEAD.test(text)) continue

      if (STATEMENT_LEAD.test(text)) {
        // Anything from a substitution marker onward is a REPLACEMENT. Stripping it first is not
        // hygiene — reading `avoid heavy back squat. Sub: split squat` from the colon inverts the
        // sentence and files the replacement as the thing forbidden.
        const beforeOffer = text.split(OFFER_INLINE)[0]

        // (b) `Heavy barbell back squat — avoid by default` — the subject is BEFORE the verb.
        //     Tried first: when a bullet has both shapes, `— modify: seat the climb, drop
        //     resistance` puts the *modifications* after the colon, not the exclusions.
        const dash = beforeOffer.match(SUBJECT_DASH)
        if (dash) {
          for (const t of termsFromList(dash[1])) add(t, block, doc, 'subject-dash')
        } else {
          // (c) `**Still not in Phase 2:** pivoting, cutting, …` — the list after the lead's colon.
          const colon = beforeOffer.indexOf(':')
          if (colon >= 0) {
            for (const t of termsFromList(beforeOffer.slice(colon + 1))) add(t, block, doc, 'lead-list')
          }
        }
      }

      // (d) `no planted-foot pivots, no cutting, no lateral lunges…` — two or more, so that a
      //     single "no rib-flare" in a coaching cue is not read as a suspension.
      const nos = [...text.matchAll(/\bno\s+([a-z][\w-]*(?:[ -][a-z][\w-]*){0,2})/gi)]
      if (nos.length >= 2) {
        for (const m of nos) for (const t of termsFromList(m[1])) add(t, block, doc, 'enumeration')
      }

      // (e) `**BJJ IS OUT.**`, `The bike is out of Phase 1 entirely.`
      const subject = text.match(SUBJECT_OUT)
      if (subject) for (const t of termsFromList(subject[1])) add(t, block, doc, 'subject')
    }
  }

  // Same term from several places is one suspension with several citations.
  const byTerm = new Map()
  for (const f of found) {
    const k = key(f.term).join(' ')
    if (!k) continue
    const entry = byTerm.get(k) ?? { term: f.term, key: k, cites: [] }
    entry.cites.push({ path: f.path, line: f.line, shape: f.shape, quote: f.quote })
    byTerm.set(k, entry)
  }
  return [...byTerm.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * The subset fit to render on a page a human reads, as opposed to the full set the check uses.
 *
 * **The `no X, no Y` enumeration is the honest problem here, and it is a property of English, not
 * of the regex.** *"No Peloton, no rowing, no stair machine"* and *"Phase 2 opens on no soreness
 * at rest, no improvement across ~2 weeks"* are the same construction: one is an exclusion, the
 * other is a gate criterion, and nothing in the sentence distinguishes them. Keeping both is right
 * for the check — the cost of an extra term nothing prescribes is zero — and wrong for a banner in
 * the athlete's own file, where `SURFACES.md` says a list he learns to skip is how the one line
 * that matters gets missed.
 *
 * So the banner shows a term that either **came from a list of exclusions** (a heading, a
 * `**Still not in Phase 2:**` lead, a `X — avoid` bullet) or **actually collides with something
 * the chart prescribes**. An enumeration-only term that collides is by definition worth his
 * attention; one that collides with nothing is a sentence the parser did not fully understand, and
 * it stays in the check where it costs nothing and out of the file where it costs legibility.
 */
export function reportableSuspensions(suspensions, colliding = new Set()) {
  return suspensions.filter((s) =>
    colliding.has(s.key) || s.cites.some((c) => c.shape !== 'enumeration'))
}

// -------------------------------------------------------------------------------------------
// Offer grammar — what a document hands him to DO
// -------------------------------------------------------------------------------------------

/**
 * A section heading that makes its contents a menu of things to perform. Every word here is a
 * concept `skills/program-design` requires of every block — *"Every exercise gets a pre-approved
 * substitution"*, *"Include a 20-minute minimum viable session and a no-equipment travel
 * session"* — so it is a template-level vocabulary, not this athlete's.
 *
 * ⚠ `replac` was in this list and had to come out. It was meant for a section headed *"Replacing
 * the bike's conditioning"*; it also matched *"BJJ IS OUT. This is the week that replaces it."*,
 * which turned nine paragraphs of narrative about a suspension into nine offers OF that
 * suspension. An offer heading has to name the KIND of thing beneath it, not describe what the
 * section does.
 */
const OFFER_HEADING = /substitut|alternativ|fallback|\bswap|minimum viable|\btravel\b/i

/** A table whose header declares substitution columns is a substitution table. */
const OFFER_TABLE_HEADER = /\|\s*(?:sub\b|sub [ab]\b|substitution|alternative)/i

/**
 * `[{ text, path, line, acknowledged }]` — every movement a document offers.
 *
 * An item is the granularity, not a statement: one table cell, one comma-separated entry. That is
 * what lets a single suspended movement inside a five-item travel session be marked without
 * suppressing the other four.
 */
export function extractOffers(docs) {
  const offers = []
  for (const doc of docs ?? []) {
    const blocks = blocksOf(withoutGenerated(doc.text))
    let inOfferTable = false
    /**
     * A document whose TITLE says it is a library of substitutions offers them in every table it
     * contains, whatever the local heading says.
     *
     * ⚠ Added after a deliberate sneak attempt SUCCEEDED. The header-based rule below reads a
     * table as an offer only when its own header row says `Sub A` / `Alternative`; a second table
     * headed `| Pattern | Go-to |`, dropped under `## Rules` in the same file, offered step-ups
     * and split squats and the check stayed green. The table header is a convention; the
     * document's stated purpose is the thing that does not move.
     *
     * Tables only, deliberately — not every paragraph. The prose in such a file explains the
     * rules, including what the marks mean, and a rule about a suspension is not an instance of it.
     */
    const declaresSubstitutions = OFFER_HEADING.test(blocks.find((b) => b.isHeading)?.text ?? '')

    for (const block of blocks) {
      const text = block.text
      if (block.isHeading) { inOfferTable = false; continue }
      // A blockquote is commentary, never a prescription. This chart writes every caveat,
      // correction and legend as `>` — including the one explaining what the marks below MEAN,
      // which named a suspended movement in order to say it was suspended and was duly reported
      // as offering it. A note about a rule is not an instance of the rule (the same distinction
      // `test-single-home.mjs` gets by stripping comments before its definition scan).
      if (block.quoted) continue

      const isRow = /^\s*\|/.test(text)
      if (isRow && OFFER_TABLE_HEADER.test(text)) { inOfferTable = true; continue }
      if (isRow && declaresSubstitutions && /^\s*\|[\s|:-]+\|?\s*$/.test(text)) continue
      if (isRow && /^\s*\|[\s|:-]+\|?\s*$/.test(text)) continue
      if (!isRow) inOfferTable = false

      // A statement that is itself an exclusion is not an offer — that is what it is FOR.
      // (Its `Sub:` clause still is, and is picked up below.)
      const exclusionOnly = STATEMENT_LEAD.test(text) && !OFFER_INLINE.test(text)

      let source = null
      if (isRow && (inOfferTable || declaresSubstitutions)) source = text
      else if (OFFER_INLINE.test(text)) source = text.split(OFFER_INLINE).pop()
      else if (OFFER_HEADING.test(block.heading) && !exclusionOnly) source = text
      if (!source) continue

      for (const cell of source.split('|')) {
        for (const item of cell.split(/[,;·]|\s\+\s/)) {
          const trimmed = item.replace(/\*\*|`/g, '').trim()
          if (!trimmed || key(trimmed).length === 0) continue
          offers.push({
            text: trimmed,
            path: doc.path,
            line: block.line,
            acknowledged: trimmed.includes(OFFER_MARK),
            quote: text.replace(/\s+/g, ' ').slice(0, 180),
          })
        }
      }
    }
  }
  return offers
}

// -------------------------------------------------------------------------------------------
// The check itself
// -------------------------------------------------------------------------------------------

/**
 * "Live" = the newest set of rows, on or before today, for a session something can still land on.
 *
 * Effective dating means a session's prescription is its newest dated set, so `Session A`'s
 * 2026-08-06 goblet squat is still that session's live prescription — but nothing schedules
 * `Session A` any more, `weeklyTemplate` schedules `Session A (knee-free)`. Reserved session
 * names (`Daily`, `Supplements`) are scheduled by definition: they run every day whatever the
 * template says, which is exactly why the rehab block lives there.
 */
export function livePrescriptions({ prescriptions = [], sessions = [], today } = {}) {
  const live = []
  for (const name of [...new Set(sessions.filter(Boolean))]) {
    const rows = prescriptions.filter((p) => p.session === name && (!today || p.date <= today))
    if (!rows.length) continue
    const eff = rows.reduce((max, p) => (p.date > max ? p.date : max), '')
    for (const r of rows.filter((p) => p.date === eff)) live.push(r)
  }
  return live
}

/**
 * Everything that names something the block has taken out, plus every acknowledgement that has
 * gone stale.
 *
 * Returns `{ suspensions, collisions, staleMarks }`. It computes; it never decides what to do —
 * the caller (`check-suspensions.mjs`) fails the build, because every collision here IS fixable by
 * editing the record: correct the template, correct the row, or mark the offer. Nothing in this
 * file can be closed only by the athlete choosing a number, which is the test INVARIANTS.md sets
 * for whether a check may block at all.
 */
export function suspensionCollisions({
  planDocs = [], offerDocs = null, weeklyTemplate = {}, prescriptions = [], sessions = [], today,
} = {}) {
  const suspensions = extractSuspensions(planDocs)
  const collisions = []
  const hitMarks = new Set()

  const test = (surface, label, text, extra = {}) => {
    for (const s of suspensions) {
      if (!names(text, s.term)) continue
      collisions.push({ surface, label, text, term: s.term, cite: s.cites[0], ...extra })
    }
  }

  for (const [day, entry] of Object.entries(weeklyTemplate ?? {})) {
    if (!entry || typeof entry !== 'object') continue
    // `session` and `type` only. `focus` is prose about the session, not the prescription.
    test('weeklyTemplate', `${day}.session`, String(entry.session ?? ''),
      { source: `athlete/constants.json program.weeklyTemplate.${day}` })
    test('weeklyTemplate', `${day}.type`, String(entry.type ?? ''),
      { source: `athlete/constants.json program.weeklyTemplate.${day}` })
  }

  for (const row of livePrescriptions({ prescriptions, sessions, today })) {
    // `exercise` only, for the same reason `focus` is excluded above.
    test('prescriptions.csv', `${row.date} ${row.session} #${row.order}`, String(row.exercise ?? ''),
      { source: `data/prescriptions.csv ${row.date} ${row.session}` })
  }

  for (const offer of extractOffers(offerDocs ?? planDocs)) {
    const hit = suspensions.filter((s) => names(offer.text, s.term))
    if (!hit.length) continue
    if (offer.acknowledged) { hitMarks.add(`${offer.path}:${offer.line}:${offer.text}`); continue }
    for (const s of hit) {
      collisions.push({
        surface: 'prose offer',
        label: `${offer.path}:${offer.line}`,
        text: offer.text,
        term: s.term,
        cite: s.cites[0],
        source: offer.quote,
      })
    }
  }

  // A `⛔` that collides with nothing is an exemption nobody is checking — it reads as coverage,
  // and at Phase 4 it is the list of lines to un-mark.
  const staleMarks = []
  for (const offer of extractOffers(offerDocs ?? planDocs)) {
    if (!offer.acknowledged) continue
    if (hitMarks.has(`${offer.path}:${offer.line}:${offer.text}`)) continue
    staleMarks.push(offer)
  }

  return { suspensions, collisions, staleMarks, mark: OFFER_MARK }
}

export { OFFER_MARK }
