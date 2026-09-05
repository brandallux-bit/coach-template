/**
 * Markdown → HTML for this repo's athlete-facing docs, on top of `marked`.
 *
 * WHY IT EXISTS. `GETTING-STARTED.md`, `DASHBOARD.md` and `TROUBLESHOOTING.md` are written for
 * someone who is not technical, and on a Mac a `.md` file opens in TextEdit or Xcode showing raw
 * `**asterisks**` and pipe tables. The one file they are told to double-click has to be HTML.
 *
 * ⚠ **THIS WAS A HAND-ROLLED CONVERTER AND THAT WAS THE WRONG CALL.** It was justified by
 * "`scripts/` is dependency-free, so a chart in its first hour needs no `npm install`" — a real
 * invariant, applied where it does not hold. `build-starter-kit.mjs` is the one script here that
 * NEVER runs on an athlete's machine; it runs on the maintainer's, in a repo that already carries
 * `next` and `react`. The cold-start invariant is about `npm run check`, and a devDependency does
 * not touch it (`test-starter-kit.mjs` skips when `marked` is absent, exactly like every other
 * conditional step in `check-all.mjs`).
 *
 * The cost of the hand-rolled version was not hypothetical. An adversarial review found NINE
 * constructs it mis-rendered silently while passing every assertion — `![alt](img.png)` emitting
 * a literal `!` with the image dropped, `<https://…>` autolinks turning into dead escaped text,
 * `_italic_`, `##### h5`, task lists, setext headings, escaped asterisks, and `5 * 3` eating the
 * text between two multiplication signs. Screenshots of the Vercel import screen are the obvious
 * next edit to `DASHBOARD.md`, and that is the first case in that list.
 *
 * What stays custom is only what `marked` has no opinion about: the athlete-facing callout
 * colours, the heading anchors the one-page kit navigates by, and the fact that a table with an
 * empty header row is being used as a definition list.
 */
import { Marked } from 'marked'

export const slug = (s) =>
  String(s).replace(/<[^>]*>/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * A `[text](DASHBOARD.md)` link becomes an in-page anchor, because the kit is ONE html file and
 * the sibling `.md` it names is not shipped under that name (`build-starter-kit.mjs` renames them
 * `1-`, `2-`, `3-`). Left as a file link it is simply broken.
 */
const rewriteHref = (href) =>
  /^[^:]*\.md(#.*)?$/i.test(href) ? `#${slug(href.replace(/\.md(#.*)?$/i, ''))}` : href

const renderer = {
  heading({ tokens, depth }) {
    const text = this.parser.parseInline(tokens)
    // A document's own h1 becomes the kit's h2: the kit is ONE page with one h1 (in the hero), and
    // three h1s on a page is what a screen reader announces as three documents. It keeps the h1's
    // size through `.doc-title`. No id on it — the kit wraps each document in a <section> carrying
    // the document's own anchor, and GETTING-STARTED.md's h1 slugged to the same string.
    if (depth === 1) return `<h2 class="doc-title">${text}</h2>\n`
    return `<h${depth} id="${slug(text)}">${text}</h${depth}>\n`
  },

  /**
   * Callout colour comes from a marker the author already writes in the prose — ⛔ for a stop, ⚠
   * for a warning. Keying off the text rather than a bespoke `:::note` syntax keeps these files
   * readable as plain markdown on GitHub, which is where they are reviewed.
   */
  blockquote({ tokens }) {
    const body = this.parser.parse(tokens)
    const cls = body.includes('⛔') ? 'note stop' : body.includes('⚠') ? 'note warn' : 'note'
    return `<blockquote class="${cls}">${body}</blockquote>\n`
  },

  /**
   * Two departures from stock. A table is wrapped so it can scroll on a phone instead of forcing
   * the page sideways; and a header row whose cells are ALL empty is dropped, because several of
   * these docs use `| | |` as a two-column definition list and a blank `<thead>` renders as a
   * bald grey bar above nothing.
   */
  table({ header, rows }) {
    const cell = (c, tag) => `<${tag}>${this.parser.parseInline(c.tokens)}</${tag}>`
    const head = header.map((c) => this.parser.parseInline(c.tokens).trim()).some(Boolean)
      ? `<thead><tr>${header.map((c) => cell(c, 'th')).join('')}</tr></thead>`
      : ''
    const body = rows.map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('')
    return `<div class="tw"><table>${head}<tbody>${body}</tbody></table></div>\n`
  },

  link({ href, title, tokens }) {
    const t = title ? ` title="${title}"` : ''
    return `<a href="${rewriteHref(href)}"${t}>${this.parser.parseInline(tokens)}</a>`
  },
}

const md = new Marked({ gfm: true, breaks: false })
md.use({ renderer })

export const mdToHtml = (src) => md.parse(src)

/** Inline-only conversion, for a fragment that must not be wrapped in a paragraph. */
export const inline = (src) => md.parseInline(src)
