#!/usr/bin/env node
/**
 * Fixtures for `scripts/lib/session-table.mjs` — what today's card shows and what it refuses to
 * claim.
 *
 * **INLINE FIXTURES, NOT THE LIVE CHART**, for the reason `test-suspensions.mjs` states: a check
 * that only holds while the chart happens to contain something silently stops holding.
 *
 * ⚠ **THIS SUITE EXISTS BECAUSE THE ALTERNATIVE WAS A MIRROR.** The logic used to sit inline in
 * `src/app/today/page.tsx`, where `scripts/test-views.mjs` would have had to re-implement it by
 * hand — and a mirror certifies the mirror. That mattered more here than usual: the three states
 * below are each correct on a different day, so a drifted mirror stays green while the page tells
 * the athlete they skipped work they did.
 *
 * Every assertion is either a failure the prescription-shaped table actually produced, or a way
 * the replacement could reintroduce it. The names and dates are synthetic; the SHAPES are real.
 */
import { sessionTable } from './lib/session-table.mjs'

let failed = 0
const ok = (name) => console.log(`  ok   ${name}`)
const bad = (name, detail) => {
  failed++
  console.log(`  FAIL ${name}\n       ${String(detail).split('\n').join('\n       ')}`)
}
const yes = (name, cond, detail = '') => (cond ? ok(name) : bad(name, detail))
const is = (name, got, want) => yes(name, JSON.stringify(got) === JSON.stringify(want),
  `expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`)

const set = (exercise, i, extra = {}) => ({ exercise, set_index: String(i), ...extra })
const p = (order, exercise, sets = '3', reps = '8', load = '') => ({ order: String(order), exercise, sets, reps, load })

console.log('\nthe row comes from the SET, so a matcher missing cannot erase logged work')

{
  // The headline defect. The sheet and the log name the same movement differently — which is
  // ordinary, not exotic — and the old table rendered "0 / 3 · not started" against three sets
  // that were performed and recorded.
  const rx = [p(1, 'Chin-ups (assisted as needed)')]
  const sets = [set('Chin-up (assisted)', 1), set('Chin-up (assisted)', 2), set('Chin-up (assisted)', 3)]
  const t = sessionTable({ sets, rx, status: 'planned' })
  is('the performed work is one group, whatever the sheet called it', t.performed.length, 1)
  is('...carrying all three of its sets', t.performed[0].sets.length, 3)
  is('...under the name it was PERFORMED under, not the prescription\'s',
    t.performed[0].exercise, 'Chin-up (assisted)')
  yes('...and the matcher, being advisory, still annotates it', !!t.performed[0].rx)
  is('...so nothing is left over to report as not done', t.remaining.length, 0)
}

{
  // The second structural reason. Work nobody prescribed used to appear on NO surface at all.
  const t = sessionTable({ sets: [set('Sled push', 1), set('Sled push', 2)], rx: [], status: 'planned' })
  is('unprescribed work renders', t.performed.length, 1)
  is('...with its sets', t.performed[0].sets.length, 2)
  yes('...and says plainly that nothing prescribed it, rather than being hidden',
    t.performed[0].rx === undefined)
}

{
  // A matcher that misses ENTIRELY is the case that must degrade safely: the work is still shown,
  // and the prescription is still shown as outstanding. Wrong in an inspectable direction.
  const rx = [p(1, 'Front squat')]
  const t = sessionTable({ sets: [set('Zercher squat', 1)], rx, status: 'planned' })
  is('a total miss still renders the performed work', t.performed.length, 1)
  yes('...unannotated', t.performed[0].rx === undefined)
  is('...and leaves the prescription outstanding rather than marking it done', t.remaining.length, 1)
}

console.log('\ngroups are in performed order, and a set never leaves its group')

{
  const sets = [
    set('Bench press', 1), set('Row', 1), set('Bench press', 2), set('Row', 2), set('Bench press', 3),
  ]
  const t = sessionTable({ sets, rx: [], status: 'planned' })
  is('first-performed order, not alphabetical and not the sheet\'s',
    t.performed.map((g) => g.exercise), ['Bench press', 'Row'])
  is('...and interleaved sets regroup without being reordered',
    t.performed.map((g) => g.sets.length), [3, 2])
  is('...set indices preserved as written', t.performed[0].sets.map((s) => s.set_index), ['1', '2', '3'])
}

console.log('\nthe three states — and the middle one is the one this card kept getting wrong')

{
  const rx = [p(1, 'Squat'), p(2, 'Bench press'), p(3, 'Row')]

  // BEFORE. Nothing logged: the table IS the prescription, through the same code path.
  const before = sessionTable({ sets: [], rx, status: 'planned' })
  is('nothing logged yet renders every prescribed row', before.remaining.length, 3)
  is('...as rows, so they still carry their load and rep target',
    before.remaining[0].reps, '8')
  is('...and claims nothing was missed', before.notDone.length, 0)

  // DURING. The state that used to collapse into a footnote at exactly the wrong moment.
  const during = sessionTable({ sets: [set('Squat', 1), set('Squat', 2)], rx, status: 'planned' })
  is('mid-session, what is done is a group', during.performed.length, 1)
  is('...and what is LEFT is still rows, not a sentence', during.remaining.length, 2)
  is('...naming them', during.remaining.map((r) => r.exercise), ['Bench press', 'Row'])
  is('...and still claims nothing was missed — the session is not over', during.notDone.length, 0)

  // AFTER. Only now may the card say something was not done, and only as a sentence.
  const after = sessionTable({ sets: [set('Squat', 1)], rx, status: 'completed' })
  is('a finished session shows no "to do" rows', after.remaining.length, 0)
  is('...and the unlogged work becomes the one sentence it is allowed', after.notDone.length, 2)

  // ⚠ THE STATE IS THE SESSION'S OWN, NOT A COUNT. These two differ only in `finished`, and one
  // logged group out of three is ambiguous by count in exactly the way that matters.
  const sameSets = [set('Squat', 1)]
  const midway = sessionTable({ sets: sameSets, rx, status: 'planned' })
  const stopped = sessionTable({ sets: sameSets, rx, status: 'completed' })
  yes('one group of three logged is "still going" or "stopped early" only by STATUS',
    midway.remaining.length === 2 && stopped.remaining.length === 0
    && midway.notDone.length === 0 && stopped.notDone.length === 2,
    'a count cannot tell these apart, and they are completely different sessions')
}

console.log('\nscaffolding is never reported as a miss, at either end of the session')

{
  const rx = [p(1, 'Warm-up: band pull-aparts'), p(2, 'Squat'), p(3, 'Cooldown: easy walk')]

  const fresh = sessionTable({ sets: [], rx, status: 'planned' })
  is('before anything is logged, the warm-up IS the next thing to do, so it shows',
    fresh.remaining.length, 3)

  const started = sessionTable({ sets: [set('Squat', 1)], rx, status: 'planned' })
  is('once a working set exists both drop out — nobody logs a working set before warming up, so '
    + '"Warm-up — to do" beside completed work states the opposite of what happened',
    started.remaining.map((r) => r.exercise), [])

  const done = sessionTable({ sets: [set('Squat', 1)], rx, status: 'completed' })
  is('and a finished session never reports scaffolding as skipped', done.notDone.length, 0)
}

console.log('\nan AMBIGUOUS match annotates nothing and, above all, removes nothing')

{
  /**
   * ⚠ **THE DEFECT THE FIRST VERSION OF THIS MODULE SHIPPED.** Three prescribed movements sharing
   * an incidental setup phrase — a real and ordinary way to write a circuit — and `notLogged`
   * asked only "did anything match", so logging the first reported the other two as complete with
   * zero sets against them. A false silence, which is worse than a false "not started" because it
   * is not inspectable.
   */
  const rx = [
    p(1, 'Band row, standing on band', '3', '12-15'),
    p(2, 'Band overhead press, single-arm, standing on band', '3', '8-10'),
    p(3, 'Band face-pull, standing on band', '2', '15-20'),
  ]
  const sets = [set('Band row, standing on band', 1), set('Band row, standing on band', 2)]
  const t = sessionTable({ sets, rx, status: 'planned' })
  is('the exact name beats every fuzzy candidate — that is an answer, not ambiguity',
    t.performed[0].rx?.order, '1')
  is('...and the two it merely brushed against are STILL outstanding', t.remaining.length, 2)
  is('...by name', t.remaining.map((r) => r.order), ['2', '3'])

  const done = sessionTable({ sets, rx, status: 'completed' })
  is('...and a finished session reports them as not logged, rather than silently as done',
    done.notDone.map((r) => r.order), ['2', '3'])

  // No exact name anywhere: the honest answer is "cannot tell", not "the first one".
  const vague = sessionTable({ sets: [set('Standing on band, single-arm', 1)], rx, status: 'planned' })
  yes('a group matching several prescribed movements claims NONE of them',
    vague.performed[0].rx === undefined && vague.performed[0].ambiguous === true,
    JSON.stringify(vague.performed[0]?.rx?.exercise))
  is('...and every candidate stays on the sheet', vague.remaining.length, 3)
}

console.log('\nscaffolding never annotates working sets, and one row never reports two shortfalls')

{
  // A warm-up row names several movements, and one of them is often real work later in the
  // session. Matched, it printed the WARM-UP's dose against a working set.
  const rx = [p(1, 'Warm-up: cat/cow, bird dog, band pull-aparts', '1', ''), p(2, 'Squat', '3', '8')]
  const t = sessionTable({ sets: [set('Bird dog', 1)], rx, status: 'planned' })
  yes('a working set is never annotated with a warm-up row\'s dose',
    t.performed[0].rx === undefined, JSON.stringify(t.performed[0]?.rx))

  // Two spellings of one movement inside one session. Each used to compute "sets left" against
  // the FULL prescribed count, so three of three performed rendered as "1 set left" beside
  // "2 set left" on a finished card.
  const push = [p(1, 'Push-up (feet elevated)', '3', 'AMRAP')]
  const split = sessionTable({
    sets: [set('Push-up (feet elevated)', 1), set('Push-up (feet elevated)', 2), set('Push-up (flat)', 3)],
    rx: push,
    status: 'completed',
  })
  is('two spellings are two groups — the display never invents one name for both',
    split.performed.length, 2)
  is('...but the shortfall is counted over the PRESCRIPTION, not per group',
    split.performed.map((g) => g.setsAgainstRx), [3, 3])
  is('...so three of three prescribed sets reports no shortfall at all', split.notDone.length, 0)
}

console.log('\nthe status enum has four values, and a closed session is closed however it closed')

{
  const rx = [p(1, 'Squat'), p(2, 'Row')]
  for (const status of ['completed', 'skipped', 'rest']) {
    const t = sessionTable({ sets: [], rx, status })
    is(`a ${status} session shows no "to do" rows — the record already decided`, t.remaining.length, 0)
    yes(`...and says so`, t.closed === true)
  }
  const open = sessionTable({ sets: [], rx, status: 'planned' })
  is('a planned session is open', open.remaining.length, 2)
  yes('...and says so', open.closed === false)
  const missing = sessionTable({ sets: [], rx })
  is('...as is a session with no status row at all — nothing has happened yet', missing.remaining.length, 2)
}

console.log('\nempty and malformed input')

{
  is('no sets and no prescription is three empty lists on an open session',
    sessionTable({}), { performed: [], remaining: [], notDone: [], closed: false })
  const t = sessionTable({ sets: [set('Squat', 1), { set_index: '1' }, null], rx: [], status: 'planned' })
  is('a set with no exercise name is skipped rather than grouped under ""', t.performed.length, 1)
}

console.log(failed ? `\nsession-table: ${failed} FAILED.` : '\nsession-table: all checks passed.')
process.exit(failed ? 1 : 0)
