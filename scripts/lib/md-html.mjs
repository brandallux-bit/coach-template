/**
 * The smallest markdown→HTML converter that renders THIS repo's athlete-facing docs.
 *
 * WHY IT EXISTS. `GETTING-STARTED.md`, `DASHBOARD.md` and `TROUBLESHOOTING.md` are written for
 * someone who is not technical, and on a Mac a `.md` file opens in TextEdit or Xcode showing raw
 * `**asterisks**` and pipe tables. The one file they are told to double-click has to be HTML.
 *
 * ⚠ **IT SUPPORTS ONLY WHAT THOSE THREE FILES USE**, and that is deliberate — a general markdown
 * library is a dependency, and `scripts/` is dependency-free on purpose so a chart in its first
 * hour needs no `npm install`. `scripts/test-starter-kit.mjs` asserts the built page has no
 * unconverted markdown left in it, which is what stops this silently under-rendering some
 * construct somebody adds to those docs later.
 *
 * KNOWN AND INTENTIONAL LIMIT: a table indented inside a list item is not converted. Nested
 * tables are not portable markdown — GitHub renders them inconsistently too — so the fix is to
 * dedent the table in the source, not to widen this. The test fails on one, by design.
 */

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Inline spans.
 *
 * Code is lifted out FIRST and restored last, so `**` or `*` inside backticks stays literal —
 * `data/*.csv` in a code span must not become an `<em>`. The placeholder is wrapped in NUL bytes
 * rather than something typographic: any sentinel that could occur in real prose is a corruption
 * waiting for the one document that contains it.
 */
export function inline(t) {
  const spans = []
  let s = esc(t).replace(/`([^`]+)`/g, (_, c) => `\u0000${spans.push(`<code>${c}</code>`) - 1}\u0000`)
  // Bold is NON-GREEDY and permits inner asterisks, so `**Production *and* Preview**` works. It
  // used to be `[^*]+`, which silently declined to match that and left the `**` visible on the
  // page — the exact failure this converter's tests exist to catch, found on a real line of
  // DASHBOARD.md. Bold runs first; the leftover single asterisks become emphasis below.
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(?<![*\w])\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
  // A link to a sibling .md becomes an in-page anchor: the starter kit is one HTML file.
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, txt, href) =>
    `<a href="${href.endsWith('.md') ? '#' + slug(href.replace(/\.md$/, '')) : href}">${txt}</a>`)
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => spans[Number(n)])
}

const isSep = (r) => /^[\s|:-]+$/.test(r)
const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

/** A list marker at any indent, and the block constructs that may sit nested under one. */
const MARKER = /^\s*([-*]|\d+\.)\s+/
const BLOCK = /^\s*(>|```|\|)/
const indentOf = (l) => l.match(/^\s*/)[0].length

/**
 * Strip the common leading indent off a nested block, so the recursive call sees it at column 0 —
 * `mdToHtml` dispatches on `startsWith('>')` and friends, which an indented block never satisfies.
 */
const dedent = (ls) => {
  const pad = Math.min(...ls.filter((l) => l.trim()).map(indentOf))
  return ls.map((l) => l.slice(pad)).join('\n')
}

export function mdToHtml(md) {
  const lines = md.split('\n')
  const out = []
  let i = 0

  while (i < lines.length) {
    const ln = lines[i]

    // Fenced code — verbatim, no inline processing.
    if (ln.startsWith('```')) {
      const buf = []
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) buf.push(esc(lines[i]))
      i++
      out.push(`<pre><code>${buf.join('\n')}</code></pre>`)
      continue
    }

    // Blockquote — recursive, so a quote may hold headings, tables and code.
    // The marker inside decides the colour: ⛔ is a stop, ⚠ is a warning, anything else is a note.
    if (ln.startsWith('>')) {
      const buf = []
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''))
      const joined = buf.join('\n')
      const cls = joined.includes('⛔') ? 'note stop' : joined.includes('⚠') ? 'note warn' : 'note'
      out.push(`<blockquote class="${cls}">${mdToHtml(joined)}</blockquote>`)
      continue
    }

    // Table. A header row of empty cells means "no header" — several of these docs use a
    // two-column table purely as a definition list, and a blank <thead> renders as a bald bar.
    if (ln.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++])
      const head = cells(rows[0])
      const hasHead = head.some(Boolean)
      const body = (rows.length > 1 && isSep(rows[1]) ? rows.slice(2) : rows.slice(1)).filter((r) => !isSep(r))
      const t = ['<div class="tw"><table>']
      if (hasHead) t.push(`<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`)
      t.push('<tbody>')
      for (const r of hasHead ? body : [rows[0], ...body]) {
        t.push(`<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
      }
      out.push(`${t.join('')}</tbody></table></div>`)
      continue
    }

    const h = ln.match(/^(#{1,4})\s+(.*)/)
    if (h) {
      const n = h[1].length
      out.push(`<h${n} id="${slug(h[2])}">${inline(h[2])}</h${n}>`)
      i++
      continue
    }

    if (/^(---+|\*\*\*+)\s*$/.test(ln)) {
      out.push('<hr>')
      i++
      continue
    }

    // List, by indentation.
    //
    // Three things happen at a deeper indent than the marker, and telling them apart is the whole
    // job. A WRAPPED line continues the item's sentence. A deeper MARKER opens a nested list. A
    // deeper `>`, fence or table is a block belonging to that item.
    //
    // The first version collapsed all three into "append to the text above, if indented by three
    // spaces", which got every one of them wrong: two-space wraps fell out of the list and became
    // stray paragraphs mid-sentence, nested bullets under a numbered step were flattened into
    // siblings and RENUMBERED the steps, and the pasted-prompt blockquote in GETTING-STARTED
    // rendered with its `>` showing.
    if (MARKER.test(ln)) {
      const base = indentOf(ln)
      const ordered = /^\s*\d+\.\s+/.test(ln)
      const items = []

      while (i < lines.length) {
        const l = lines[i]
        // A blank line ends the list unless what follows is still part of it: something deeper
        // (an item's own indented block) or another marker at this level (a loose list, or the
        // list resuming after one). Without that second clause, DASHBOARD.md's step 2 — which
        // carries an indented "Not listed?" aside — ended the list, and steps 3 to 6 opened a
        // fresh <ol> that renumbered them 1 to 4 in a section whose whole point is the order.
        if (!l.trim()) {
          const next = lines.slice(i + 1).find((x) => x.trim())
          if (next && (indentOf(next) > base || (MARKER.test(next) && indentOf(next) <= base))) {
            i++
            continue
          }
          break
        }
        const ind = indentOf(l)
        if (MARKER.test(l) && ind <= base) items.push({ text: l.replace(MARKER, ''), sub: [] })
        else if (ind > base && items.length) items[items.length - 1].sub.push(l)
        else break
        i++
      }

      const render = ({ text, sub }) => {
        const wrapped = []
        while (sub.length && !MARKER.test(sub[0]) && !BLOCK.test(sub[0])) wrapped.push(sub.shift().trim())
        const body = sub.length ? mdToHtml(dedent(sub)) : ''
        return `<li>${inline([text, ...wrapped].join(' '))}${body}</li>`
      }

      const tag = ordered ? 'ol' : 'ul'
      out.push(`<${tag}>${items.map(render).join('')}</${tag}>`)
      continue
    }

    if (!ln.trim()) {
      i++
      continue
    }

    const buf = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|\||>|```|---|\s*([-*]|\d+\.)\s)/.test(lines[i])
    ) buf.push(lines[i++])
    if (buf.length) out.push(`<p>${inline(buf.join(' '))}</p>`)
  }

  return out.join('\n')
}
