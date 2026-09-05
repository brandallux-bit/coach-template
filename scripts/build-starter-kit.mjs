#!/usr/bin/env node
/**
 * Builds the folder you zip and send to somebody who is starting a chart.
 *
 *   node scripts/build-starter-kit.mjs [--out DIR] [--zip]
 *
 * WHY THIS IS A BUILD AND NOT A FOLDER SOMEBODY MAINTAINS. The kit is four documents, three of
 * which already exist in this repo as the canonical copies. Hand-assembling it means that the
 * moment `GETTING-STARTED.md` is edited, every zip already sent — and the one sitting on a
 * desktop waiting to be sent — is silently a different document from the one in `main`. That is
 * the two-homes defect (INVARIANTS.md X-8) with a delivery mechanism attached, and it is worse
 * than the usual kind because the stale copy is the one a beginner is reading while the correct
 * one sits in a repo they have never seen.
 *
 * So: the docs have one home, this regenerates the kit from them, and `--zip` produces the
 * artifact. Rebuild and resend after any edit to the three source docs.
 *
 * WHAT THE ATHLETE ACTUALLY GETS:
 *
 *   START-HERE.html                    all three docs, one styled page, double-clickable
 *   1-Getting-Started.md               ┐
 *   2-Dashboard-Later.md               ├ the same content as files, for Claude Code to read
 *   3-Troubleshooting.md               ┘
 *   Setup-Instructions-For-Claude.md   the bootstrap they paste a reference to
 *   TEMPLATE-URL                       where the chart is cloned from, read by the bootstrap
 *
 * The HTML exists because a `.md` file on a Mac opens in TextEdit or Xcode showing raw markup.
 * The `.md` copies exist because Claude Code reads those, not the HTML. Neither is redundant.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { mdToHtml, slug } from './lib/md-html.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const arg = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : null)
const OUT = resolve(arg('--out') ?? join(ROOT, 'build', 'Coach-Starter'))
const ZIP = argv.includes('--zip')

/** Order is the reading order, and the numbers in the filenames are the whole navigation. */
const DOCS = [
  { src: 'GETTING-STARTED.md', as: '1-Getting-Started.md', nav: 'Getting started' },
  { src: 'DASHBOARD.md', as: '2-Dashboard-Later.md', nav: 'The dashboard (later)' },
  { src: 'TROUBLESHOOTING.md', as: '3-Troubleshooting.md', nav: 'When something goes wrong' },
]

const BOOTSTRAP = 'library/starter-kit/Setup-Instructions-For-Claude.md'

/**
 * The template's clone address, shipped verbatim beside the bootstrap that reads it.
 *
 * One home, deliberately: the URL was written out in both the bootstrap and `skills/setup`, which
 * is X-8 between the two documents whose whole relationship is "this one bootstraps, that one
 * governs". Whoever forks this repo changes one file and both sides follow.
 */
const URL_FILE = 'library/starter-kit/TEMPLATE-URL'

const CSS = `
:root{--bg:#fbfaf8;--fg:#1c1b19;--mut:#5f5b54;--line:#e3ded6;--card:#fff;--accent:#8a3d1f;
--codebg:#f4f1ec;--stopbg:#fdf1ef;--stopln:#c0503a;--warnbg:#fdf8ec;--warnln:#c08a2a;--noteln:#b9b2a6}
@media(prefers-color-scheme:dark){:root{--bg:#16150f;--fg:#eae6dd;--mut:#a49d90;--line:#33302a;
--card:#1e1c16;--accent:#e59a72;--codebg:#24221b;--stopbg:#2b1a17;--stopln:#c0503a;
--warnbg:#2a2418;--warnln:#c08a2a;--noteln:#4a463d}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
font:16px/1.65 ui-serif,Georgia,'Iowan Old Style',Palatino,serif;-webkit-text-size-adjust:100%}
.wrap{max-width:1080px;margin:0 auto;padding:0 24px 96px;display:grid;
grid-template-columns:210px 1fr;gap:48px;align-items:start}
nav{position:sticky;top:0;padding:40px 0;font-family:ui-sans-serif,system-ui,sans-serif;font-size:13.5px}
nav .brand{font-weight:700;font-size:15px;letter-spacing:-.01em;margin-bottom:4px}
nav .sub{color:var(--mut);font-size:12px;margin-bottom:20px;line-height:1.45}
nav a{display:block;padding:6px 0;color:var(--mut);text-decoration:none}
nav a:hover{color:var(--accent)}
main{padding-top:40px;min-width:0}
h1{font-size:31px;line-height:1.2;letter-spacing:-.02em;margin:0 0 20px}
h2{font-size:23px;line-height:1.25;letter-spacing:-.015em;margin:44px 0 14px;
padding-top:20px;border-top:1px solid var(--line)}
/* A horizontal rule immediately before a heading would otherwise draw a second line. */
hr+h2,section>h2:first-child{border-top:0;padding-top:0;margin-top:8px}
li>ul,li>ol{margin:8px 0 4px}
li>blockquote,li>pre,li>.tw{margin-top:10px}
h3{font-size:18px;margin:30px 0 10px;letter-spacing:-.01em}
h4{font-size:15.5px;margin:22px 0 8px;font-family:ui-sans-serif,system-ui,sans-serif}
p{margin:0 0 15px}
img{max-width:100%;height:auto;border-radius:8px;border:1px solid var(--line)}
a{color:var(--accent)}
ul,ol{margin:0 0 15px;padding-left:22px}li{margin:5px 0}
hr{border:0;border-top:1px solid var(--line);margin:32px 0}
code{font:13.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--codebg);
padding:.13em .38em;border-radius:4px;overflow-wrap:break-word}
pre{background:var(--codebg);border:1px solid var(--line);border-radius:8px;padding:13px 15px;
overflow-x:auto;margin:0 0 15px}
pre code{background:none;padding:0;font-size:13px;line-height:1.6}
blockquote{margin:0 0 18px;padding:13px 17px;border-left:3px solid var(--noteln);
background:var(--card);border-radius:0 8px 8px 0}
blockquote.stop{border-left-color:var(--stopln);background:var(--stopbg)}
blockquote.warn{border-left-color:var(--warnln);background:var(--warnbg)}
blockquote>:last-child{margin-bottom:0}
blockquote h2,blockquote h3,blockquote h4{margin-top:0;border-top:0;padding-top:0}
.tw{overflow-x:auto;margin:0 0 18px}
table{border-collapse:collapse;width:100%;font-size:14.5px;
font-family:ui-sans-serif,system-ui,sans-serif}
th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.06em;
color:var(--mut);padding:0 12px 7px 0;border-bottom:1px solid var(--line);font-weight:600}
td{padding:9px 12px 9px 0;border-bottom:1px solid var(--line);vertical-align:top}
tr td:first-child{font-weight:600}
.hero{background:var(--card);border:1px solid var(--line);border-radius:12px;
padding:24px 26px;margin:0 0 32px}
.hero p{margin:0;color:var(--mut);font-size:15px}
.hero .k{display:inline-block;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;
letter-spacing:.09em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:9px}
@media(max-width:840px){.wrap{grid-template-columns:1fr;gap:0;padding:0 20px 64px}
nav{position:static;padding:28px 0 0;border-bottom:1px solid var(--line)}
nav a{display:inline-block;margin-right:18px}main{padding-top:26px}}
@media print{nav{display:none}.wrap{display:block;max-width:none}
body{background:#fff;color:#000;font-size:11pt}
blockquote,pre,.tw{page-break-inside:avoid}}
`

const read = (p) => readFileSync(join(ROOT, p), 'utf8')

for (const p of [...DOCS.map((d) => d.src), BOOTSTRAP, URL_FILE]) {
  if (!existsSync(join(ROOT, p))) {
    console.error(`missing source document: ${p}`)
    process.exit(1)
  }
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const nav = DOCS.map((d) => `<a href="#${slug(d.src.replace(/\.md$/, ''))}">${d.nav}</a>`).join('')
const body = DOCS
  .map((d) => `<section id="${slug(d.src.replace(/\.md$/, ''))}">${mdToHtml(read(d.src))}</section>`)
  .join('\n')

writeFileSync(join(OUT, 'START-HERE.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your coach — getting started</title>
<style>${CSS}</style></head><body><div class="wrap">
<nav><div class="brand">Your coach</div><div class="sub">Setup &amp; first weeks</div>${nav}</nav>
<main><div class="hero"><span class="k">Start here</span>
<p>Everything you need, in order. You do not need to know anything technical &mdash;
there is no code to write. Read section&nbsp;1, then follow it.</p></div>
${body}</main></div></body></html>
`)

// The .md copies are what Claude Code reads, and they are RENAMED on the way in, so a link
// naming a sibling by its repo filename points at a file the athlete does not have. The HTML
// gets the same rewrite as an in-page anchor; these get it as a filename.
const RENAME = new Map(DOCS.map((d) => [d.src, d.as]))
const relink = (text) => text.replace(/\]\(([^)#]+\.md)((?:#[^)]*)?)\)/g,
  (m, file, frag) => (RENAME.has(file) ? `](${RENAME.get(file)}${frag})` : m))

for (const d of DOCS) writeFileSync(join(OUT, d.as), relink(read(d.src)))
writeFileSync(join(OUT, 'Setup-Instructions-For-Claude.md'), read(BOOTSTRAP))
writeFileSync(join(OUT, 'TEMPLATE-URL'), read(URL_FILE))

console.log(`starter kit → ${OUT}`)

if (ZIP) {
  const zip = `${OUT}.zip`
  rmSync(zip, { force: true })
  // -x excludes the metadata Finder sprinkles into any folder that has been opened, which
  // otherwise ships as a visible __MACOSX/ directory on the recipient's machine.
  const r = spawnSync('zip', ['-qr', zip, OUT.split('/').pop(), '-x', '.DS_Store', '__MACOSX/*'], {
    cwd: dirname(OUT),
    stdio: 'inherit',
  })
  if (r.status !== 0) {
    console.error('zip failed')
    process.exit(1)
  }
  console.log(`zip          → ${zip}`)
}
