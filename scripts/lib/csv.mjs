import { readFileSync, existsSync } from 'node:fs'

/**
 * THE CSV GRAMMAR. One scanner, one home — `scripts/lib/rowwrite.mjs` imports `parseLine` from
 * here rather than keeping its own.
 *
 * There used to be two implementations of this grammar: `parseCsv` here and a single-line copy in
 * `rowwrite.mjs`, which is the two-homes defect (INVARIANTS.md X-8) living inside the code that
 * defends against it. Both carried the same bug, and fixing it in one would have been the
 * 2026-08-12 MET fix all over again.
 *
 * ⚠ **A QUOTE ONLY OPENS A QUOTED FIELD AT THE START OF A FIELD** — `field === ''`. RFC 4180
 * treats a quote anywhere else as a literal character, and this parser used to treat it as an
 * opening delimiter (audit F-10). A note reading `Waist 35.25" flat tape` — an inch mark, in a
 * chart whose primary metric is measured in inches — therefore opened a quoted section that
 * swallowed every comma and newline until the next `"` in the file. Three days of weigh-ins parsed
 * as one row, the two later days appeared in no chart and no rollup, and `validate-data.mjs`
 * reported **no error**, because what survived was a well-formed, correctly ordered, non-duplicate
 * row. The athlete would have seen a gap in the trend and been unable to tell it from days they did
 * not weigh in.
 *
 * The change is strictly more permissive: no file that parsed correctly before parses differently
 * now, which is asserted in `scripts/test-single-home.mjs` against the real `data/` files.
 */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { quoted = false }
      } else {
        field += c
      }
      continue
    }

    if (c === '"' && field === '') { quoted = true }
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') { field += c }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }

  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''))
}

/**
 * One line of CSV, as an object keyed by `header`. The same scanner as `parseCsv` — not a second
 * one. See the header comment above for what the second one cost.
 *
 * A line with no fields at all (empty string) yields every column as `''`, i.e. "not measured"
 * everywhere, rather than throwing.
 */
export function parseLine(line, header) {
  const [fields = []] = parseCsv(line)
  return Object.fromEntries(header.map((h, i) => [h, fields[i] ?? '']))
}

/** Read a CSV into an array of objects keyed by the header row. */
export function readCsv(path) {
  if (!existsSync(path)) return []
  const rows = parseCsv(readFileSync(path, 'utf8'))
  if (!rows.length) return []
  const header = rows[0].map((h) => h.trim())
  return rows.slice(1).map((r) => {
    const o = {}
    header.forEach((h, i) => { o[h] = (r[i] ?? '').trim() })
    return o
  })
}

/** Empty string means "not measured" and must stay distinguishable from zero. */
export const num = (v) => (v === '' || v == null ? null : Number(v))

/**
 * One value, quoted the way this grammar reads it back. The write half of `parseCsv`, and the
 * only implementation — `rowwrite.mjs`'s `toLine` imports it rather than restating it, because
 * "same quoting as csv.mjs; must not diverge" is a comment, not a mechanism.
 */
export const cell = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header, rows) {
  return [header.join(','), ...rows.map((r) => header.map((h) => cell(r[h])).join(','))].join('\n') + '\n'
}
