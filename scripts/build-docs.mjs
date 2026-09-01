#!/usr/bin/env node
/**
 * Renders the generated blocks in the chart's documents from the code that owns their numbers.
 *
 * WHY (audit F-56, F-65, F-66, F-50). The MET table was hand-typed into three documents and had
 * drifted in all three: `docs/modules/` — positioned as *"detailed enough to plan and rebuild it
 * from scratch"* — documented **BJJ 10.0** where the code says 10.3, **other 3.0** where it says
 * 4.0, and omitted `rehab` and `rest` entirely. `docs/build-prd/appendices.md` carries the same
 * table and **compiles into `docs/Coach-Platform-PRD.pdf`, the shareable artifact**, which made it
 * the most wrong document in the repo. A rebuilder working from either produces a different
 * `energy.csv`.
 *
 * `git log -p --follow -- scripts/lib/athlete.mjs` shows `bjj: 10.0 → 10.3` in `558dc64` and
 * `rehab` added later; neither sweep reached those files. **Which is the point: a sweep is a thing
 * someone has to remember.** Nothing here is synced by hand any more.
 *
 *   node scripts/build-docs.mjs           # rewrite the blocks in place
 *   node scripts/build-docs.mjs --check   # exit 1 if any block is stale, printing the diff
 *
 * `--check` is what `scripts/test-single-home.mjs` runs, so a MET change with un-regenerated docs
 * fails before it can be pushed — the same shape as the `energy.csv` staleness gate.
 *
 * TO ADD A BLOCK: write the marker pair into the target document and add a renderer to `BLOCKS`.
 * The markers are HTML comments, so they are invisible in every renderer including the PDF.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { metTableDoc, metByIntensityDoc, UNIVERSAL_TYPES, hasChart, NO_CHART_MESSAGE,
  setRestSec } from './lib/athlete.mjs'
import { SPEC } from './lib/schema.mjs'
import { PROGRAM_DIR, readChartDocs } from './lib/chart-docs.mjs'
import { OFFER_MARK, extractSuspensions, reportableSuspensions } from './lib/suspensions.mjs'
import { COMP_WINDOW } from './lib/session-duration.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHECK = process.argv.includes('--check')

/** The one place a MET value is turned into text. `5` not `5.0` — JSON numbers, rendered plainly. */
const met = (v) => String(v)

/**
 * A file's constraints, as one sentence, from `SPEC` and nothing else.
 *
 * Deliberately terse and deliberately incomplete: it renders what `SPEC` can be *held to* — the
 * things `validate-data.mjs` actually enforces. A constraint that lives in prose rather than in
 * `SPEC` is not listed here, because listing it would be the same hand-typing this block exists
 * to abolish, one level down.
 */
const constraintsDoc = (spec) => [
  spec.uniqueDate ? 'uniqueDate' : null,
  spec.uniqueKey ? `warns on duplicate ${spec.uniqueKey.join('+')}` : null,
  spec.required?.length ? `requires ${spec.required.join(', ')}` : null,
  // `\\|` because these land inside a Markdown table cell, where a bare pipe starts a new column.
  ...Object.entries(spec.enums ?? {}).map(([k, v]) => `${k} \u2208 ${v.join('\\|')}`),
  ...Object.entries(spec.ranges ?? {}).map(([k, [lo, hi]]) => `${k} ${lo}\u2013${hi}`),
].filter(Boolean).join(' \u00b7 ')

const BLOCKS = {
  /**
   * Every file's columns and enforced constraints, from `SPEC`.
   *
   * WHY THIS EXISTS, and it is the MET table's story with a different table. `body.csv` lost two
   * columns on 2026-08-16; `data/METHOD.md` was updated by hand in the same commit and the other
   * two documents carrying the same schema were not. One of them compiles into the shareable PDF,
   * so the artifact handed to other people declared a schema the code had stopped using — and it
   * would have gone on declaring it, because nothing reads a table to check it.
   *
   * `SPEC` is the single home (INVARIANTS.md X-8). Anything a document says about the schema that
   * `SPEC` does not know is either prose that belongs beside this block, or a constraint that
   * belongs IN `SPEC`. There is no third case, and that is the point.
   */
  'schema-table': () => [
    '| File | Columns | Enforced constraints |',
    '|---|---|---|',
    ...Object.entries(SPEC).map(([file, spec]) =>
      `| \`${file}\` | ${spec.header.join(', ')} | ${constraintsDoc(spec) || '\u2014'} |`),
  ].join('\n'),

  /** The flat table, with what each value is. For a document that has room for a table. */
  'met-table': () => [
    '| Session type | MET | |',
    '|---|---|---|',
    ...metTableDoc().map(({ type, met: m, note }) => `| \`${type}\` | **${met(m)}** | ${note} |`),
  ].join('\n'),

  /**
   * The MET mechanism WITHOUT the athlete's activity list, for the two SYSTEM documents.
   *
   * ⚠ **This block used to enumerate the table** — `\`bjj\` 10.3 · \`peloton\` 8.5 · …` — into
   * `docs/modules/data-layer/REQUIREMENTS.md` and `docs/build-prd/appendices.md`, the second of
   * which compiles into the shareable PDF. Those are documents about the SYSTEM, and a system
   * document that lists one athlete's sports is X-11 with a generator behind it: every future
   * chart's rebuild spec would describe this man's week. The full table still renders, in
   * `data/METHOD.md`, which is the chart's own method document and the right place for it.
   */
  'met-table-inline': () => {
    const rows = metTableDoc()
    const universal = rows.filter(({ type }) => UNIVERSAL_TYPES.includes(type))
    return '**MET comes from the chart, not from the code.** Each entry in `athlete/constants.json`'
      + '\'s `sessionTypes` registry names its own MET, whether it counts toward the sessions floor, '
      + 'and the `goals.md` domain it serves; `scripts/lib/schema.mjs` derives `training.csv`\'s '
      + `\`type\` enum from the same registry. Two types are structural and supplied to every chart: `
      + `${universal.map(({ type, met: m }) => `\`${type}\` ${met(m)}`).join(' · ')}. `
      + `This chart registers ${rows.length - universal.length} more — see \`data/METHOD.md\` for `
      + 'its table, which is generated from the same source.'
  },

  /** The per-tier tables, with the compendium code and description each value came from. */
  'met-by-intensity': () => [
    '| Type | Tier | MET | Compendium code | Description |',
    '|---|---|---|---|---|',
    ...metByIntensityDoc().map(({ type, tier, met: m, code, label }) =>
      `| \`${type}\` | ${tier} | **${met(m)}** | ${code} | ${label} |`),
  ].join('\n'),

  /** The per-tier mechanism, counted rather than enumerated — same reason as `met-table-inline`. */
  'met-by-intensity-inline': () => {
    const types = new Set(metByIntensityDoc().map((r) => r.type))
    return `${types.size} of this chart's session types carry a sourced per-tier table, each entry `
      + 'citing the compendium code its value came from. Every other type falls back to its flat '
      + 'MET on every tier, so logging a split for one is harmless rather than wrong.'
  },

  /**
   * The duration-reconstruction rungs, with the rest figure THIS chart uses.
   *
   * ⚠ **GENERATED BECAUSE A HAND-WRITTEN COPY MADE ANSWERING AN INTAKE QUESTION A RED BUILD.**
   * `data/METHOD.md` stated the fallback as `(sets − 1) × 70 s rest` — a literal. `setRestSec` is
   * a key a chart may legitimately set, and `test-single-home`'s FIGURES rule compares prose
   * against the constant, so a chart whose athlete answered with a different figure could not commit until
   * somebody found and hand-edited a sentence in a file nothing had told them about. That is the
   * same dilemma the METHOD_DIGEST note refuses for the digest — every fork red on day one for
   * making a legal edit — reintroduced one file over. Generating it removes the copy.
   */
  'duration-rungs': () => {
    const rest = setRestSec()
    return 'A session that was performed but not timed is reconstructed, in this order: the mean of '
      + `the **last ${COMP_WINDOW} timed sessions sharing its stem**, else the **next ${COMP_WINDOW}** `
      + 'after it where that history does not exist yet, else the **standing duration this chart '
      + 'declares for that session type** (`sessionTypes.<type>.standingDurationMin`), else '
      + `**\`sets × work + (sets − 1) × ${rest} s rest\`** — where the rest figure is `
      + '`program.setRestSec` and the work per set is the median implied by the sessions this chart '
      + 'has actually timed, never a number anybody typed. Whatever still cannot be costed leaves '
      + '`session_kcal` **blank** and the day `complete=n`.'
  },

  /**
   * What the active block has taken out, rendered into the file he opens to substitute.
   *
   * F-19's own recommendation, and the reason it is generated rather than typed: the library's
   * contraindication list was last updated for the *pre-rehab* knee and has no notion of an active
   * phase gate, so a hand-maintained banner would be stale within a week — which is precisely how
   * a standing "does not need approval" rule came to pre-authorise step-ups and split squats.
   * `scripts/check-suspensions.mjs` reads the same extraction, so the banner and the check cannot
   * disagree about what is out.
   */
  suspended: () => {
    const docs = readChartDocs(ROOT).filter((d) => d.path.startsWith(`${PROGRAM_DIR}/`))
    const terms = reportableSuspensions(extractSuspensions(docs))
    if (!terms.length) {
      return '_Nothing is currently out — every substitution below stands._'
    }
    return [
      `**${OFFER_MARK} means it is currently out.** Not a pre-approved substitution while it `
        + 'stands, whatever the rule below says — the coach decides, not this table. Two kinds are '
        + `merged here and both bind: what the active block has suspended, and the standing `
        + `contraindications further down this file. Generated from \`${PROGRAM_DIR}/\` by `
        + '`scripts/build-docs.mjs`. **Corrected by editing the block, never here.**',
      '',
      '| Out | Where it was taken out |',
      '|---|---|',
      ...terms.map((t) => `| ${t.term} | \`${t.cites[0].path}:${t.cites[0].line}\` |`),
    ].join('\n')
  },
}

/**
 * Documents carrying generated blocks. A target that does not exist is skipped, not an error: a
 * chart with no substitution library is a valid chart (CLAUDE.md §0.2), and naming one athlete's
 * file as mandatory would be X-11.
 */
const TARGETS = [
  'data/METHOD.md',
  'docs/modules/data-layer/REQUIREMENTS.md',
  'docs/build-prd/appendices.md',
  `${PROGRAM_DIR}/exercise-library.md`,
]

export const openMarker = (name) =>
  `<!-- GENERATED:${name} — from scripts/build-docs.mjs. Do not edit between the markers. -->`
export const closeMarker = (name) => `<!-- /GENERATED:${name} -->`

/** Rewrite every generated block in `text`, or return it unchanged if it has none. */
export function renderBlocks(text, file) {
  let out = text
  for (const [name, render] of Object.entries(BLOCKS)) {
    const open = openMarker(name)
    const close = closeMarker(name)
    if (!out.includes(open)) continue
    if (!out.includes(close)) throw new Error(`${file}: ${open} has no matching ${close}`)
    const before = out.slice(0, out.indexOf(open) + open.length)
    const after = out.slice(out.indexOf(close))
    out = `${before}\n${render()}\n${after}`
  }
  return out
}

/** Every target whose generated blocks are out of date. Empty when everything is current. */
export function staleDocs(root = ROOT) {
  // Every block renders from the chart's session-type registry, so a repo with no chart has
  // nothing to render and nothing to be stale against. Same graceful skip the rest of `scripts/`
  // uses — before this guard, the template crashed here with a raw proxy throw on `constants`.
  if (!hasChart) return []
  const stale = []
  for (const file of TARGETS) {
    const path = join(root, file)
    if (!existsSync(path)) continue
    const text = readFileSync(path, 'utf8')
    const fresh = renderBlocks(text, file)
    if (fresh !== text) stale.push({ file, path, text, fresh })
  }
  return stale
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const stale = staleDocs()
  if (!hasChart) {
    // Not "every block current" — there is no chart to render one from, and saying so is more
    // honest than reporting a pass over zero work.
    console.log(`nothing to generate — ${NO_CHART_MESSAGE}`)
  } else if (!stale.length) {
    console.log(`docs: ${TARGETS.length} files, every generated block current`)
  } else if (CHECK) {
    for (const { file } of stale) console.error(`stale: ${file}`)
    console.error('\nRun `node scripts/build-docs.mjs` and commit the result.')
    process.exit(1)
  } else {
    for (const { file, path, fresh } of stale) {
      writeFileSync(path, fresh)
      console.log(`rewrote generated blocks in ${file}`)
    }
  }
}
