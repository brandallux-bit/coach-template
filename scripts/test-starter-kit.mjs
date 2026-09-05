#!/usr/bin/env node
/**
 * The starter kit is the first thing a new athlete sees, and nobody in this repo ever reads it.
 *
 * That asymmetry is the whole reason this file exists. `scripts/build-starter-kit.mjs` renders
 * three athlete-facing documents to one HTML page, and a converter does not fail on a construct
 * it mishandles — it emits something wrong and says nothing. So the load-bearing assertions here
 * are "is there any markdown LEFT in the rendered page", which reads oddly until you have seen a
 * beginner's first page with `**asterisks**` showing on it.
 *
 * **THE LIST OF CONSTRUCTS BELOW IS A FAILURE RECORD, NOT A WISHLIST.** Every one was silently
 * mis-rendered by the hand-rolled converter this replaced, while that converter's own tests
 * passed — found by adversarial review, not by this suite. They are kept as assertions so a
 * future swap of the markdown engine cannot quietly reintroduce any of them.
 *
 * ⚠ **SKIPS WHEN `marked` IS NOT INSTALLED.** `check-all.mjs` must stay green on a fresh clone
 * with no `npm install` (`scripts/test-cold-start.mjs`, STATE A), and the kit is built only on
 * the maintainer's machine. Skipping with a named reason is the same answer every chart-dependent
 * step here gives.
 *
 * ⚠ **Builds to a temporary directory, never to `build/`.** A test that overwrites the artifact
 * somebody is about to send is a test with a side effect on a deliverable.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let mdToHtml
try {
  ;({ mdToHtml } = await import('./lib/md-html.mjs'))
} catch {
  console.log('\nstarter-kit: skipped — `marked` is not installed (run npm install). The starter')
  console.log("kit is built on the maintainer's machine only; nothing an athlete runs needs it.\n")
  process.exit(0)
}

let failed = 0
const ok = (name) => console.log(`  ok   ${name}`)
const bad = (name, detail) => {
  failed++
  console.log(`  FAIL ${name}\n       ${String(detail).split('\n').join('\n       ')}`)
}
const yes = (name, cond, detail = '') => (cond ? ok(name) : bad(name, detail))

console.log('\nstarter-kit — constructs that were silently mis-rendered before')

// Each line below is a defect that shipped. See this file's header.
yes('an image renders as an image', mdToHtml('![alt](p.png)').includes('<img'),
  'emitted a literal "!" and dropped the picture — the likeliest next edit to DASHBOARD.md')
yes('an autolink is a link',
  mdToHtml('<https://vercel.com/new>').includes('href="https://vercel.com/new"'))
yes('underscore emphasis works', mdToHtml('_it_ and __bo__').includes('<em>it</em>'))
yes('h5 is a heading, not prose', mdToHtml('##### five').includes('<h5'))
yes('a task list is a list', mdToHtml('- [ ] todo').includes('<li'))
yes('a setext heading is a heading', mdToHtml('Title\n=====').includes('<h1'))
yes('an escaped asterisk stays literal',
  !mdToHtml('\\*not emphasis\\*').includes('<em>'), mdToHtml('\\*not emphasis\\*'))
yes('arithmetic asterisks do not eat the text between them',
  mdToHtml('5 * 3 and 2 * 4').includes('5 * 3 and 2 * 4'), mdToHtml('5 * 3 and 2 * 4'))
yes('a parenthesis inside a link target survives',
  mdToHtml('[x](https://e.com/Foo_%28bar%29)').includes('Foo_%28bar%29'))

console.log('\nstarter-kit — the conversions this repo adds on top')

yes('bold containing emphasis', mdToHtml('**a *b* c**').includes('<strong>a <em>b</em> c</strong>'))
yes('a code span survives an asterisk inside it', mdToHtml('`data/*.csv`').includes('data/*.csv'))
yes('a heading gets an id', mdToHtml('## Two secrets').includes('id="two-secrets"'))
yes('a link to a sibling doc becomes an in-page anchor',
  mdToHtml('[x](DASHBOARD.md)').includes('href="#dashboard"'), mdToHtml('[x](DASHBOARD.md)'))
yes('an external link is left alone',
  mdToHtml('[x](https://vercel.com/new)').includes('href="https://vercel.com/new"'))
yes('a table with a real header gets a thead',
  mdToHtml('| Name | Value |\n|---|---|\n| A | B |').includes('<thead>'))
yes('a table used as a definition list gets none',
  !mdToHtml('| | |\n|---|---|\n| A | B |').includes('<thead>'),
  'a blank thead renders as a bald grey bar above nothing')
yes('every table can scroll on a phone',
  mdToHtml('| a |\n|---|\n| b |').includes('<div class="tw">'))
yes('a stop blockquote is classed', mdToHtml('> ⛔ no').includes('class="note stop"'))
yes('a warning blockquote is classed', mdToHtml('> ⚠ care').includes('class="note warn"'))
yes('a plain blockquote is neither', mdToHtml('> hi').includes('class="note"'))
yes('a fenced block is not inline-processed', mdToHtml('```\na **b** c\n```').includes('a **b** c'))
yes('a nested bullet does not renumber its parent',
  mdToHtml('1. one\n   - sub\n2. two').match(/<ol>/g).length === 1)
yes('a list resumes after an item carries an indented aside',
  mdToHtml('1. a\n\n   > aside\n\n2. b').match(/<li>/g).length === 2)

console.log('\nstarter-kit — the built kit')

const out = mkdtempSync(join(tmpdir(), 'starter-'))
try {
  execFileSync('node', [join(ROOT, 'scripts/build-starter-kit.mjs'), '--out', out], { stdio: 'pipe' })

  const files = readdirSync(out).sort()
  const expected = [
    '1-Getting-Started.md', '2-Dashboard-Later.md', '3-Troubleshooting.md',
    'START-HERE.html', 'Setup-Instructions-For-Claude.md', 'TEMPLATE-URL',
  ]
  yes('exactly the files the athlete needs', files.length === expected.length, files.join(' '))
  for (const f of expected) yes(`ships ${f}`, files.includes(f))

  const html = readFileSync(join(out, 'START-HERE.html'), 'utf8')
  const shown = html.replace(/<[^>]+>/g, '')

  yes('no unconverted bold survives', !/\*\*/.test(shown))
  yes('no raw table pipe survives', !/^\s*\|/m.test(shown),
    'usually a table indented inside a list item — dedent it in the source doc')
  yes('no raw markdown link survives', !/\]\(/.test(shown))
  yes('no raw image marker survives', !/!\[/.test(shown))
  yes('no raw heading marker survives, including h5 and h6', !/^#{1,6}\s/m.test(shown))
  yes('no escaped-asterisk backslash survives', !/\\\*/.test(shown))
  yes('no unrendered autolink survives', !/&lt;https?:/.test(html))
  yes('no unchecked task-list box survives', !/\[[ x]\]/.test(shown))
  yes('nothing is double-escaped', !/&amp;(lt|gt|amp);/.test(html))

  // Every in-page link must land somewhere. A cross-document link that silently points at
  // nothing is the failure mode of collapsing three files onto one page.
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
  const dangling = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]).filter((h) => !ids.has(h))
  yes('every in-page anchor resolves', dangling.length === 0, `dangling: ${dangling.join(', ')}`)

  yes('all three docs made it in', ['getting-started', 'dashboard', 'troubleshooting']
    .every((id) => html.includes(`<section id="${id}">`)))
  yes('the page names itself', html.includes('<title>'))
  yes('it is theme-aware', html.includes('prefers-color-scheme'))

  // The .md copies are what Claude Code reads. They are renamed on the way in, so a link naming
  // the original filename points at a file the athlete does not have.
  for (const f of ['1-Getting-Started.md', '2-Dashboard-Later.md', '3-Troubleshooting.md']) {
    const body = readFileSync(join(out, f), 'utf8')
    const broken = [...body.matchAll(/\]\(([^)#]+\.md)\)/g)]
      .map((m) => m[1]).filter((l) => !files.includes(l))
    yes(`${f} links only to files the athlete has`, broken.length === 0, `broken: ${broken.join(', ')}`)
  }

  // The bootstrap's only job is to reach the skill. A copy that stopped pointing there has
  // quietly become a second, stale home for the whole setup procedure.
  const boot = readFileSync(join(out, 'Setup-Instructions-For-Claude.md'), 'utf8')
  yes('the bootstrap hands off to the setup skill', boot.includes('skills/setup/SKILL.md'))
  yes('the bootstrap says it is not the whole procedure', /bootstrap/i.test(boot))
  // The clone address has one home. A bootstrap that hard-codes it is a second one, and the two
  // drift the moment somebody forks this repo.
  yes('the bootstrap reads the URL rather than hard-coding it',
    boot.includes('TEMPLATE-URL') && !/github\.com\/[\w-]+\/coach-template/.test(boot),
    'found a hard-coded template URL in the bootstrap')
  yes('the shipped URL is a git remote',
    /^https?:\/\/\S+\.git$/m.test(readFileSync(join(out, 'TEMPLATE-URL'), 'utf8').trim()))
  // It must never be the thing that runs sudo or an interactive TUI: there is no terminal for
  // the athlete to type into inside a tool call. See GETTING-STARTED step 2.
  yes('the bootstrap never runs the installer itself',
    !/curl[^\n]*install\.sh/.test(boot) && !/^\s*gh auth login\s*$/m.test(boot),
    'Homebrew needs sudo and gh auth login is a TUI; neither can prompt from inside a tool call')
  // The claim the first adversarial review found false survived in the one document that calls
  // itself authoritative where the others disagree. A regression here is a regression everywhere
  // the skill defers to SETUP.md.
  for (const doc of ['SETUP.md', 'README.md', 'GETTING-STARTED.md', 'TROUBLESHOOTING.md']) {
    yes(`${doc} does not claim Claude Code installs the tools`,
      !/Claude Code can (install|do all of it|authenticate)/i.test(readFileSync(join(ROOT, doc), 'utf8')),
      'a command run from a tool call has no terminal for a password or an arrow-key menu')
  }
} finally {
  rmSync(out, { recursive: true, force: true })
}

console.log(failed
  ? `\nstarter-kit: ${failed} FAILED.\n`
  : '\nstarter-kit: all assertions passed.\n')
process.exit(failed ? 1 : 0)
