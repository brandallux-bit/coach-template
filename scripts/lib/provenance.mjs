/**
 * Provenance — the one home for "where did this number come from?"
 *
 * WHY THIS EXISTS. On 2026-08-13 the chart was found to contain three numbers the coach had
 * produced and filed in the athlete's own goals: a 185 lb weight ceiling, a 135/85 blood-pressure
 * threshold invented to make a failing check go green, and a BMI justification in a chart whose
 * profile.md bans BMI outright. His response to the first:
 *
 *   > "I don't know what that is or where it came from. I never provided that weight and if I get
 *   > close to it, I will throw this whole system away and call it a failure."
 *
 * Every other number in this system can be recomputed if it is lost. A goal cannot — there is no
 * data from which to re-derive what someone wants. So the goals files are the one place where a
 * wrong number is unrecoverable, and they were the one place with no record of authorship.
 *
 * The fix is a marker on the value, not a rule in a markdown file. `data/METHOD.md` ("Provenance")
 * holds the vocabulary and the five rules; this module is the machine-readable half of it, kept in
 * one place so the test and the findings layer cannot drift into two answers about what a
 * well-formed marker is (INVARIANTS.md X-8).
 *
 * Pure: takes a parsed constants object, returns plain data. No file IO, no exits, and — the part
 * that matters — **no opinion about whether a number is right.** It reports whose number it is.
 * Deciding is the athlete's job; asking is the coach's.
 */

/** data/METHOD.md, "Provenance". Adding a sixth class is a METHOD.md change first. */
export const PROVENANCE_CLASSES = [
  'athlete-stated',
  'athlete-confirmed',
  'coach-proposed-unconfirmed',
  'derived',
  'external',
]

/**
 * The sections of constants.json required to carry markers: the anchor everything is measured
 * against, the targets he is asked to hit, and the thresholds that reorder his goals.
 *
 * `program`, `events`, `metrics` and `athlete` are deliberately NOT here yet — they are catalogued
 * in docs/audit/PROVENANCE-2026-08-13.md, and a check that demands markers nobody has written is
 * a check that pressures someone into writing plausible ones (INVARIANTS.md, "A check that cannot
 * go green without inventing data must not be written"). Extend this list when the markers exist,
 * not before.
 */
export const PROVENANCE_SECTIONS = ['baseline', 'plan', 'triggers']

/**
 * Individual keys OUTSIDE those sections that still require a marker, by dotted path.
 *
 * ⚠ **A BURN-MODEL INPUT NEEDS A MARKER WHEREVER IT LIVES.** `program` as a whole is not covered —
 * a weekly template is a schedule, not a threshold, and demanding provenance on every entry would
 * be the "check that cannot go green without inventing data" the note above refuses. But
 * `program.setRestSec` reconstructs the duration of a session that was performed but not timed, so
 * it changes a burn figure — and the whole point of asking about it at intake is that the shipped
 * 70 is the COACH's proposal, not the athlete's. Without this, a chart could set it with nothing
 * recording whose number it is, which is exactly what X-16 exists to prevent. A chart that never
 * answers has no key and nothing to mark; one that answers must say who answered.
 */
export const PROVENANCE_KEYS = ['program.setRestSec']

/**
 * Keys INSIDE a covered section that are exempt, by dotted path.
 *
 * ⚠ **A READING WINDOW IS NOT A CLAIM ABOUT THE ATHLETE.** `plan.trendWindowSize` and
 * `plan.trendLagDays` say how many readings each end of a comparison averages and how far apart
 * the two ends sit — how this chart READS its own record, not anything anybody asserted about the
 * person. A marker on them would have to answer "who said 3?", and the only honest answer is
 * "the software's default", which is not one of the classes and is not worth inventing a sixth for.
 *
 * ⚠ **AND THE ALTERNATIVE WAS A DOCUMENTED KEY THAT REDDENS A FRESH FORK.**
 * `athlete/constants.template.json` says in as many words that neither needs a marker; `plan` is a
 * covered section, so a chart that followed its own template's instructions failed this check with
 * an error arguing the opposite. Two statements of one rule, one of them shipped to every fork.
 *
 * The bar for adding to this list: the value must change how a figure is READ, never what is
 * measured or what anybody is asked to hit. A threshold, a target, a floor or a rate belongs
 * nowhere near it.
 */
export const PROVENANCE_EXEMPT = ['plan.trendWindowSize', 'plan.trendLagDays']

/**
 * How long a coach-produced number gets to be a live proposal before it becomes a finding.
 *
 * A number proposed this morning belongs in the conversation, not in a list — surfacing it
 * immediately would just repeat back what the coach said thirty seconds ago, and a findings
 * channel that repeats itself gets skimmed. A week later it has stopped being a proposal and
 * started being a fact nobody agreed to.
 *
 * The boundary is INCLUSIVE: a full week elapsed fires it (`age >= 7`), not `age > 7`. This is the
 * check's own grace period, not anything belonging to the athlete, so it is the coach's to set —
 * but it is worth recording that the choice was made knowing the first cohort of markers lands
 * exactly on the boundary on 2026-08-13. An exclusive comparison would have shipped this whole
 * mechanism silently dormant on the day it was written, which is the "computes things nobody
 * sees" failure it was built to close.
 */
export const UNCONFIRMED_GRACE_DAYS = 7

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isText = (v) => typeof v === 'string' && v.trim().length > 0
const realKeys = (obj) => Object.keys(obj ?? {}).filter((k) => !k.startsWith('_'))

/**
 * Every problem with the markers themselves. This is the internal-consistency check — the kind
 * `data/` is allowed to fail a build on, because every one of these is fixable by editing the
 * record (INVARIANTS.md, "What each layer is for"). It never asks whether a number is wise, and it
 * never asks the athlete for anything.
 *
 * Returns `[{ section, key, problem }]`. Empty means every value names its source.
 */
/**
 * What is wrong with one marker, if anything. One home, because `auditProvenance` now applies these
 * rules from two places and two copies of them would drift the first time a class was added.
 */
function markerProblems(section, key, m) {
  const out = []
  const flag = (problem) => out.push({ section, key, problem })
  if (!PROVENANCE_CLASSES.includes(m.class)) {
    flag(`class ${JSON.stringify(m.class)} is not one of ${PROVENANCE_CLASSES.join(' | ')}`)
  }
  if (!DATE_RE.test(m.asOf ?? '')) {
    flag(`asOf must be a YYYY-MM-DD date, got ${JSON.stringify(m.asOf)}`)
  }
  if (!isText(m.source)) flag('source must name where the reasoning is written down')
  if (!isText(m.note)) flag('note must say, in prose, whose number this is')
  // The evidence each class is worthless without. An `athlete-stated` marker with no quote and no
  // measurement asserts authorship and proves nothing, which is worse than an honest
  // `coach-proposed-unconfirmed`.
  if ((m.class === 'athlete-stated' || m.class === 'athlete-confirmed')
    && !isText(m.quote) && !isText(m.measured)) {
    flag(`${m.class} requires a quote (their words about THIS number) or measured (the row and protocol it was read from)`)
  }
  if (m.class === 'derived' && !isText(m.inputs)) {
    flag('derived requires inputs — name the numbers it was computed from, not just the result')
  }
  return out
}

export function auditProvenance(constants) {
  const problems = []
  const flag = (section, key, problem) => problems.push({ section, key, problem })

  for (const section of PROVENANCE_SECTIONS) {
    const block = constants?.[section]
    if (!block || typeof block !== 'object') {
      flag(section, '*', 'section is missing from constants.json')
      continue
    }

    const marks = block._provenance
    if (!marks || typeof marks !== 'object') {
      flag(section, '*', 'has no _provenance map — see data/METHOD.md, "Provenance"')
      continue
    }

    for (const key of realKeys(block)) {
      if (PROVENANCE_EXEMPT.includes(`${section}.${key}`)) continue
      const m = marks[key]
      if (!m || typeof m !== 'object') {
        flag(section, key, 'has no provenance marker: nothing records whether the athlete said this or the coach did')
        continue
      }
      problems.push(...markerProblems(section, key, m))
    }

    for (const key of realKeys(marks)) {
      if (!(key in block)) flag(section, key, 'marker describes a value that no longer exists in this section')
    }
  }

  // ⚠ **THE NAMED KEYS OUTSIDE THOSE SECTIONS.** Same marker rules, reached by dotted path — see
  // PROVENANCE_KEYS for why a burn-model input in `program` is covered while the rest of `program`
  // is not. A key the chart has not set is not a failure: there is no number to attribute.
  for (const path of PROVENANCE_KEYS) {
    const [section, key] = path.split('.')
    const block = constants?.[section]
    if (!block || typeof block !== 'object' || !(key in block)) continue
    const m = block._provenance?.[key]
    if (!m || typeof m !== 'object') {
      flag(section, key, 'has no provenance marker: nothing records whether the athlete said this '
        + 'or the coach did, and this value changes a burn figure')
      continue
    }
    problems.push(...markerProblems(section, key, m))
  }

  return problems
}

/**
 * Values the coach produced and the athlete has never ruled on. The findings layer turns these
 * into something to say at the start of a session.
 *
 * Returns `[{ section, key, value, asOf, source, note }]`.
 */
export function unconfirmedValues(constants) {
  const out = []
  for (const section of PROVENANCE_SECTIONS) {
    const block = constants?.[section]
    const marks = block?._provenance
    if (!block || !marks) continue
    for (const key of realKeys(block)) {
      const m = marks[key]
      if (m?.class !== 'coach-proposed-unconfirmed') continue
      out.push({
        section, key, value: block[key], asOf: m.asOf, source: m.source ?? '', note: m.note ?? '',
      })
    }
  }
  return out
}

/**
 * The raw marker for one value, or null.
 *
 * Exported so nothing outside this module has to know that markers live under a `_provenance`
 * key — that shape is this file's to own, and a second reader reaching into it directly is how a
 * rename here silently stops working over there (INVARIANTS.md X-8).
 *
 * The use case it exists for: a finding that wants to quote the athlete's own words about the
 * number it is describing, rather than paraphrasing them. Quoting what is recorded is rendering;
 * paraphrasing it is the first step toward the 185 lb ceiling.
 */
export function markerFor(constants, section, key) {
  const m = constants?.[section]?._provenance?.[key]
  return m && typeof m === 'object' ? m : null
}

/** A value's own units, rendered for a sentence. Objects and arrays are summarised, not dumped. */
export function describeValue(value) {
  if (Array.isArray(value)) return value.join('-')
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([k, v]) => `${k} ${v}`).join(', ')
  }
  return String(value)
}
