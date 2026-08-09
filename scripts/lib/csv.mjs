import { readFileSync, existsSync } from 'node:fs'

/** Minimal RFC-4180 parser: handles quoted fields, embedded commas, doubled quotes. */
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

    if (c === '"') { quoted = true }
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') { field += c }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }

  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''))
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

export function toCsv(header, rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [header.join(','), ...rows.map((r) => header.map((h) => cell(r[h])).join(','))].join('\n') + '\n'
}
