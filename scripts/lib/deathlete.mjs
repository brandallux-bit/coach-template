/**
 * **The de-athleting screen's rules, and the only home for them.**
 *
 * These lived inline in `scripts/port-overlay.mjs`, where nothing could reach them and therefore
 * nothing tested them. That is how `PROSE_SHAPED` shipped **dead**: written as a template literal,
 * its `\\b` compiled to a BACKSPACE BYTE rather than a word boundary, so the rule matched nothing —
 * and the run it gated printed `0` and was reported as evidence the prose was clean. A check that
 * cannot go red certifies nothing (INVARIANTS.md X-10), and a regex assembled from strings is
 * exactly the kind that fails silently, because a broken one and a satisfied one look identical
 * from outside.
 *
 * So the rules live here and `scripts/test-athlete-leak.mjs` holds every one of them against a
 * fixture that must match and a fixture that must not. `port-overlay.mjs` imports them.
 */
/**
 * Three clauses, each naming a different way one athlete's life crosses into shared code.
 *
 * **1 · A GENDERED PRONOUN, ANYWHERE ON THE LINE.** De-athleted prose in this repo uses they/them,
 * so `he`/`him`/`his`/`she`/`her` is prose about a particular person that arrived with a chart.
 * `they`/`them`/`their` are deliberately NOT here: they are this repo's own convention, so
 * including them would fire on every correctly-written line and the screen would be off in a day.
 *
 * **2 · A QUOTE IN THE FIRST PERSON.** A verbatim quote of a PERSON is speech, and speech about
 * oneself is first-person. That separates an athlete saying what they want from the quoted
 * identifiers, UI strings and illustrative sentences shared code legitimately contains — a quoted
 * code comment, a quoted rendered label. Bare `\*"` matched all of those, and matched a `"Mon"`
 * inside a regex literal as well.
 *
 * ⚠ **AND THE FIRST VERSION OF THIS PARAGRAPH ILLUSTRATED THE RULE WITH TWO REAL QUOTES FROM THE
 * PROTOTYPE ATHLETE**, in the one file exempt from its own screen — including a figure on the
 * plan's not-crossing list. A reviewer found it. The example a rule needs is the SHAPE of the
 * thing, never a specimen of it; that is the same judgement this whole port turns on.
 *
 * **3 · A DATE IN PROSE, NOT IN CODE.** The target is a dated incident — *"On <date> an automated
 * job reasoned its way to the opposite conclusion"* — which lives in a sentence. A bare date
 * literal in code is a fixture datum, and a ported test file is nothing but those: flagging them
 * reported 15 lines of `day('2025-05-13', 'lifting')`. So the clause applies to comment lines and
 * markdown only. (It was `2026-0` before a review pointed out that it went blind in October of one
 * particular year, in a file whose whole subject is not hard-coding one chart's specifics.)
 *
 * ⚠ **AND THIS FILE IS NOT SUBJECT TO ITS OWN PATTERN**, for the reason `banned-terms.mjs` already
 * states and `test-athlete-leak.mjs` already asserts: the file that declares the rule is never
 * itself a violation of it.
 */
export const PRONOUN_RE = /\b(he|him|his|she|her|hers)\b/i
/** Straight and curly, because a quote pasted out of a chat window carries curly ones. */
const Q = '["\u201c\u201d]'
const FIRST_PERSON = "(i|i'm|i'd|i'll|i've|my|me|myself|mine|we|our|us)"
/** In prose, any quoted span. In code, only the markdown-emphasis form — see `isProse`. */
export const QUOTE_PROSE_RE = new RegExp(`${Q}[^"\u201c\u201d]*\\b${FIRST_PERSON}\\b`, 'i')
export const QUOTE_CODE_RE = new RegExp(`(^|[\\s>])\\*+${Q}[^"\u201c\u201d]*\\b${FIRST_PERSON}\\b`, 'i')
export const DATE_RE = /\b20\d\d-\d\d-\d\d\b/

/**
 * A comment line, or any line of a file that is prose rather than program.
 *
 * ⚠ **`.json` IS PROSE HERE, and excluding it blinded the screen to the file this port edits most
 * for documentation.** `athlete/constants.template.json` is almost entirely English sentences
 * inside JSON strings — every `_comment` and every `_note` — so treating it as code meant a dated
 * incident or a quote in the very file a new user reads first went unseen.
 */
// `{/*` is in the list because a JSX comment is a comment: without it, a dated incident inside
// `{/* … */}` was caught by neither branch — not prose, and excluded from rendered copy below.
export const isProse = (path, text) => !/\.(mjs|js|ts|tsx)$/.test(path) || /^\s*(\/\/|\*|\/\*|\{\/\*|#)/.test(text)

/**
 * ⚠ **A `.tsx` LINE THAT IS NOT A COMMENT IS PAGE COPY, AND A DATE IN PAGE COPY IS THE WORST PLACE
 * FOR ONE.** The date rule was prose-only, and a `.tsx` string literal counts as code — so a
 * caption reading *"a measured maintenance figure replaces it at the <date> recalibration"*, with
 * one chart's real date where that placeholder stands, passed both halves of this screen and would
 * have rendered that chart's calendar to every fork. A comment is at least only read by a maintainer; this is on the page.
 *
 * Cheap because it is nearly always empty: every date literal in this repo's `.tsx` files today is
 * in a comment, and comments are already covered by the prose branch. What it costs is that a page
 * legitimately printing a date must build it from data rather than typing it, which is the rule
 * anyway.
 */
export const isRenderedCopy = (path, text) => /\.tsx$/.test(path) && !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(text)

/**
 * ⚠ **PROSE INSIDE A NON-COMMENT STRING LITERAL IS THE BLIND SPOT, AND IT IS THE ONE THAT
 * RENDERS.** `isProse` calls a `.mjs` line prose only when it STARTS with a comment marker, so a
 * string-continuation line — `+ 'Their own words are on file — "…"'` — took the code branch, where
 * `QUOTE_CODE_RE` demands markdown emphasis before the quote. A plain `"` inside a JS string
 * matched neither branch. A review found exactly that: a verbatim athlete quote and two of one
 * chart's plan figures in a FINDING's `action` string — not a comment, a sentence the next coach
 * reads — reported as zero by this screen. The same hole swallowed a dated quote inside a JSX
 * comment block, because only its OPENING line starts with a marker and the rest do not.
 *
 * So the prose quote rule now applies to code lines too, filtered by SHAPE rather than by
 * position: between the opening quote and the first-person word there may be PROSE and nothing
 * else — no bracket, brace, angle, equals or parenthesis. Without that filter the rule fires on
 * `className="text">{i.label}`, where the CLOSING attribute quote opens a span running into a JSX
 * loop variable, and fifteen of eighteen hits over `scripts/` and `src/` were exactly that. With
 * it, the same sweep returns the real ones and three false positives fall to zero. Measured on the
 * tree, not assumed.
 *
 * ⚠ **AND IT CATCHES A QUOTED SENTENCE, NOT ATHLETE VOCABULARY — the gap is wider than the fix.**
 * The same review that found the dead regex also found `'Wine is inside the calorie budget, not on
 * top of it'` in a rendered card caption six lines below a comment that had just been de-athleted.
 * Nothing here sees it: there is no quote character and no first-person word, only one athlete's
 * drink stated as everyone's. **A denylist is what would catch that, and this file has none** — it
 * runs in a repo with no chart to derive one from. `port-overlay.mjs`'s vocabulary screen has one
 * and would only catch such a word if the source chart happened to register it. So: this screen
 * narrows where to look. **Reading the diff is still the job.**
 *
 * ⚠ **THE PUNCTUATION CLASS IS THE WHOLE FILTER, so keep it narrow.** Widening it to exclude, say,
 * a comma or a dash would silently stop matching ordinary English, which is the thing it is for.
 * The semicolon is in the class for one reason and it is a trade: `'\"'; i++` in a CSV parser was
 * the last false positive on the tree, and a semicolon inside a quoted athlete sentence is rarer
 * than that line is.
 */
export const PROSE_SHAPED = new RegExp(`${Q}[^"\u201c\u201d{}<>=()\\[\\];]*\\b${FIRST_PERSON}\\b`, 'i')
export const quoteHit = (path, text) => (isProse(path, text)
  ? QUOTE_PROSE_RE.test(text)
  : QUOTE_CODE_RE.test(text) || PROSE_SHAPED.test(text))

export const deathleteHit = (path, text) => {
  const prose = isProse(path, text)
  return PRONOUN_RE.test(text)
    || quoteHit(path, text)
    || ((prose || isRenderedCopy(path, text)) && DATE_RE.test(text))
}
