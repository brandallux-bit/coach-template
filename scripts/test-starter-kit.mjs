#!/usr/bin/env node
/**
 * The starter kit is the first thing a new athlete sees, and nobody in this repo ever reads it.
 *
 * That asymmetry is the whole reason this file exists. `scripts/build-starter-kit.mjs` renders
 * three athlete-facing documents through a deliberately minimal markdown converter
 * (`scripts/lib/md-html.mjs`) — minimal because `scripts/` is dependency-free on purpose. A
 * minimal converter does not fail on a construct it does not support; it **passes the source
 * through as literal text**. So the failure mode is a beginner reading `**You do not need to
 * know anything technical**` with the asterisks showing, on the one page whose entire job is to
 * not look intimidating, while every check in this repo stays green.
 *
 * These assertions are therefore mostly "is there any markdown LEFT in the output", which is a
 * strange-looking test until you have seen that page.
 *
 * ⚠ **It builds to a temporary directory, never to `build/`.** A test that overwrites the
 * artifact somebody is about to send is a test with a side effect on a deliverable.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inline, mdToHtml } from './lib/md-html.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failed = 0
const ok = (name) => console.log(`  ok   ${name}`)
const bad = (name, detail) => {
  failed++
  console.log(`  FAIL ${name}\n       ${String(detail).split('\n').join('\n       ')}`)
}
const yes = (name, cond, detail = '') => (cond ? ok(name) : bad(name, detail))
const is = (name, got, want) => yes(name, got === want, `expected ${want}\n       got      ${got}`)

console.log('\nstarter-kit — the converter, on the constructs these docs actually use')

is('bold becomes strong', mdToHtml('**x**'), '<p><strong>x</strong></p>')
// Regression: `[^*]+` declined to match this and left the `**` on the page. Found by the
// whole-page assertion below, on a line of DASHBOARD.md, after the converter looked correct.
is('bold containing emphasis', inline('**a *b* c**'), '<strong>a <em>b</em> c</strong>')
yes('two bold spans on one line stay separate',
  inline('**a** and **b**') === '<strong>a</strong> and <strong>b</strong>',
  inline('**a** and **b**'))
is('a code span survives an asterisk inside it', inline('`data/*.csv`'), '<code>data/*.csv</code>')
is('a code span survives a double asterisk inside it', inline('`a**b`'), '<code>a**b</code>')
yes('a link to a sibling doc becomes an in-page anchor',
  inline('[x](DASHBOARD.md)').includes('href="#dashboard"'), inline('[x](DASHBOARD.md)'))
yes('an external link is left alone',
  inline('[x](https://vercel.com/new)').includes('href="https://vercel.com/new"'))
yes('a heading gets an id', mdToHtml('## Two secrets').includes('id="two-secrets"'))
yes('a table with a real header gets a thead',
  mdToHtml('| Name | Value |\n|---|---|\n| A | B |').includes('<thead>'))
yes('a table with an EMPTY header row does not',
  !mdToHtml('| | |\n|---|---|\n| A | B |').includes('<thead>'),
  'several docs use a two-column table as a definition list; a blank thead renders as a bald bar')
yes('the separator row never becomes a data row',
  !mdToHtml('| | |\n|---|---|\n| A | B |').includes('---'))
yes('a stop blockquote is classed', mdToHtml('> ⛔ no').includes('class="note stop"'))
yes('a warning blockquote is classed', mdToHtml('> ⚠ care').includes('class="note warn"'))
yes('a plain blockquote is neither', mdToHtml('> hi').includes('class="note"'))
yes('a fenced block is not inline-processed',
  mdToHtml('```\na **b** c\n```').includes('a **b** c'),
  'a shell command containing asterisks must survive verbatim')
yes('html in the source is escaped', mdToHtml('a <b> c').includes('&lt;b&gt;'))

// The three list defects, each found by looking at the rendered page rather than by reasoning
// about the converter. All three read as "the doc is written wrong" until you check the source.
yes('a TWO-space wrapped line stays inside its item',
  mdToHtml('- a b\n  c d').includes('<li>a b c d</li>'),
  mdToHtml('- a b\n  c d'))
yes('a nested bullet does not become a sibling and renumber the steps',
  mdToHtml('1. one\n   - sub\n2. two') === '<ol><li>one<ul><li>sub</li></ul></li><li>two</li></ol>',
  mdToHtml('1. one\n   - sub\n2. two'))
yes('an indented blockquote under an item keeps its quote marker off the page',
  !mdToHtml('1. paste this:\n\n   > hello\n').includes('&gt; hello'),
  mdToHtml('1. paste this:\n\n   > hello\n'))
yes('a list still ends at a following paragraph',
  mdToHtml('- a\n\nAfter.').includes('<p>After.</p>'))
yes('a list RESUMES after one item carries an indented aside, rather than renumbering',
  mdToHtml('1. a\n\n   > aside\n\n2. b').match(/<ol>/g).length === 1,
  mdToHtml('1. a\n\n   > aside\n\n2. b'))
yes('...and that list still holds both items',
  mdToHtml('1. a\n\n   > aside\n\n2. b').match(/<li>/g).length === 2)

console.log('\nstarter-kit — the built kit')

const out = mkdtempSync(join(tmpdir(), 'starter-'))
try {
  execFileSync('node', [join(ROOT, 'scripts/build-starter-kit.mjs'), '--out', out], { stdio: 'pipe' })

  const files = readdirSync(out).sort()
  is('every file the athlete needs is present', files.length, 5)
  for (const f of [
    'START-HERE.html', '1-Getting-Started.md', '2-Dashboard-Later.md',
    '3-Troubleshooting.md', 'Setup-Instructions-For-Claude.md',
  ]) yes(`ships ${f}`, files.includes(f))

  const html = readFileSync(join(out, 'START-HERE.html'), 'utf8')
  const shown = html.replace(/<[^>]+>/g, '')

  // The load-bearing assertions. Each is a construct that would render as literal markup.
  yes('no unconverted bold survives to the page', !/\*\*/.test(shown),
    'a `**` in the rendered text means the converter passed it through as prose')
  yes('no raw table pipe survives to the page', !/^\s*\|/m.test(shown),
    'almost always a table indented inside a list item — dedent it in the source doc')
  yes('no raw markdown link survives', !/\]\(/.test(shown))
  yes('no raw heading marker survives', !/^#{1,4}\s/m.test(shown))
  yes('nothing is double-escaped', !/&amp;(lt|gt|amp);/.test(html))

  yes('all three docs made it in', ['getting-started', 'dashboard', 'troubleshooting']
    .every((id) => html.includes(`<section id="${id}">`)))
  yes('the page names itself', html.includes('<title>'))
  yes('it is theme-aware', html.includes('prefers-color-scheme'))

  // The bootstrap is the one document that is READ BY A MACHINE rather than a person, and its
  // only job is to reach the skill. A copy that stopped pointing there is a copy that has
  // quietly become a second, stale home for the whole procedure.
  const boot = readFileSync(join(out, 'Setup-Instructions-For-Claude.md'), 'utf8')
  yes('the bootstrap hands off to the setup skill', boot.includes('skills/setup/SKILL.md'))
  yes('the bootstrap says it is not the whole procedure', /bootstrap/i.test(boot))
} finally {
  rmSync(out, { recursive: true, force: true })
}

console.log(failed
  ? `\nstarter-kit: ${failed} FAILED.\n`
  : '\nstarter-kit: all assertions passed.\n')
process.exit(failed ? 1 : 0)
