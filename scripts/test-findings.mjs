#!/usr/bin/env node
/**
 * Fixtures for scripts/lib/findings.mjs.
 *
 * The first assertion in this file is the one that matters most: **findings never block.** The
 * previous version of this logic raised hard validator errors, which meant a fast weight-loss
 * week would freeze the dashboard. The contract now is that this layer reports and nothing more.
 */

import { buildFindings } from './lib/findings.mjs'
// The energy density of a pound of fat is imported, never retyped: a suite that hardcodes the
// constant it builds its expectations from is a second home for it (INVARIANTS.md X-8).
// `rmrFloorKcal` for the same reason, plus one more — see FLOOR below.
import { KCAL_PER_LB_FAT, rmrFloorKcal } from './lib/athlete.mjs'
import { modeBanner } from './lib/test-mode.mjs'

console.log(modeBanner('findings'))

/**
 * The RMR floor this suite builds its calorie fixtures around, computed rather than assumed.
 *
 * ⚠ **`rmrFloorKcal` reads the athlete's sex, height and date of birth from the module-scope
 * constants, not from the fixture chart passed to `buildFindings`.** So a fixture that hardcoded
 * "1,700 kcal is 82 above the floor" was really asserting a fact about *one man's physiology*, and
 * it failed on any other chart — the exact F-30 shape: a suite red on a correct chart because the
 * athlete in it is somebody else. Deriving the fixture from the same function keeps the assertion
 * (the CLOSE band fires just inside the floor, the SILENT band does not) and drops the biography.
 */
const FLOOR = rmrFloorKcal(180, '2026-08-13')

// ⚠ **BOTH FIXTURES ANSWER THE MOVEMENT QUESTION, because a chart that has not is never silent.**
// `movement-level-unanswered` fires on any chart with no feed and no level — which is every chart
// this file used to build — so without this line every "is silent" case below would be asserting
// the absence of a finding that is correctly present. The unanswered case has its own fixtures,
// under "the movement question nobody answered", where it is the thing being tested.
const answered = { movementOutsideExerciseLevel: 'light' }
const deficitChart = {
  baseline: { date: '2026-08-05', weightLb: 181 },
  plan: { targetRateLbPerWk: [1.1, 1.25], maxRatePctBwPerWk: 1.0, proteinFloorG: 150, ...answered },
}
/** A chart with no energy-deficit domain — symptom control, sleep, whatever the athlete asked for. */
const noDeficitChart = {
  baseline: { date: '2026-08-05', weightLb: 181 },
  plan: { proteinFloorG: 150, ...answered },
}

const weights = (start, list) => list.map((lb, i) => {
  const d = new Date(`${start}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + i)
  return { date: d.toISOString().slice(0, 10), weight_lb: String(lb) }
})

const steadyBody = weights('2026-08-01', [181, 180.8, 181.1, 180.6, 180.9, 180.4, 180.7,
  180.2, 180.5, 180.0, 180.3, 179.8, 180.1, 179.6])
const crashBody = weights('2026-08-01', [186, 185.4, 184.8, 184.2, 183.6, 183.0, 182.4,
  181.8, 181.2, 180.6, 180.0, 179.4, 178.8, 178.2])

const target = (date, kcal, protein = 165) =>
  ({ date, kcal: String(kcal), protein_g: String(protein), fat_g: '60', fibre_g: '30' })

let failed = 0
const run = (args) => buildFindings({ today: '2026-08-14', constants: deficitChart, ...args })

const check = (label, args, wantId) => {
  const ids = run(args).map((f) => f.id)
  const hit = wantId === null ? ids.length === 0 : ids.some((i) => i.startsWith(wantId))
  if (hit) return console.log(`ok    ${label}`)
  failed++
  console.error(`FAIL  ${label}\n      wanted ${wantId ?? 'no findings'}, got [${ids.join(', ') || 'none'}]`)
}

console.log('the contract — this layer reports, it never blocks')
for (const [name, args] of [
  ['a breached RMR floor', { body: steadyBody, targets: [target('2026-08-13', 1000)] }],
  ['a 2%/wk loss rate', { body: crashBody, targets: [] }],
  ['a 20-week deficit', { constants: { ...deficitChart, baseline: { date: '2026-03-20', weightLb: 181 } }, body: steadyBody, targets: [] }],
]) {
  try {
    const out = run(args)
    if (Array.isArray(out)) console.log(`ok    ${name} returns findings rather than throwing`)
    else { failed++; console.error(`FAIL  ${name} did not return an array`) }
  } catch (e) {
    failed++
    console.error(`FAIL  ${name} threw — this layer must never block: ${e.message}`)
  }
}

console.log('§5.2 · calorie floor')
check('  1,000 kcal at ~180 lb is reported', { body: steadyBody, targets: [target('2026-08-13', 1000)] }, 'rmr-floor-breached')
check('  a target just inside the floor is flagged as close',
  { body: steadyBody, targets: [target('2026-08-13', FLOOR + 82)] }, 'rmr-floor-close')
check('  a comfortable target is silent',
  { body: steadyBody, targets: [target('2026-08-13', FLOOR + 600)] }, null)
check('  a chart with no deficit domain is never told its calories are low',
  { constants: noDeficitChart, body: steadyBody, targets: [target('2026-08-13', 1000)] }, null)
check('  only the newest target is judged, not every past row',
  { body: steadyBody, targets: [target('2026-08-01', 1000), target('2026-08-13', FLOOR + 600)] }, null)

console.log('§5.2 · protein floor')
check('  120 g against a 150 g floor is reported', { body: steadyBody, targets: [target('2026-08-13', FLOOR + 600, 120)] }, 'protein-floor-breached')
check('  150 g exactly is silent', { body: steadyBody, targets: [target('2026-08-13', FLOOR + 600, 150)] }, null)

console.log('§5.2 · loss rate — an observation, so it can only inform')
check('  ~2%/wk is reported', { body: crashBody, targets: [] }, 'loss-rate-above-ceiling')
check('  a normal deficit is silent', { body: steadyBody, targets: [] }, null)
check('  two weigh-ins is not a trend', { body: weights('2026-08-12', [186, 178]), targets: [] }, null)

console.log('§5.2 · deficit phase length — elapsed time, so it can only inform')
check('  a 20-week phase is reported', { constants: { ...deficitChart, baseline: { date: '2026-03-20', weightLb: 181 } }, body: steadyBody, targets: [] }, 'deficit-phase-over-cap')
check('  a 15-week phase gets an early heads-up', { constants: { ...deficitChart, baseline: { date: '2026-04-27', weightLb: 181 } }, body: steadyBody, targets: [] }, 'deficit-phase-approaching-cap')
check('  a 1-week phase is silent', { body: steadyBody, targets: [] }, null)

console.log('triggers that cannot fire — reported, never filled in')
check('  a blank threshold is reported', { body: steadyBody, targets: [], goalsText: '- Resting BP consistently above ___ / ___' }, 'blank-trigger')
check('  a filled threshold is silent', { body: steadyBody, targets: [], goalsText: '- Resting BP consistently above 135 / 85' }, null)
check('  prose quoting a historical blank is not a finding', { body: steadyBody, targets: [], goalsText: 'This read "above ___ / ___" until it was filled.' }, null)
check('  markdown emphasis is not a blank', { body: steadyBody, targets: [], goalsText: '- The ___emphasised___ case' }, null)

console.log('the domain SET — reviewed every six weeks, or the coach is told')
check('  a full review 43 days ago is due', { body: steadyBody, targets: [], goalsText: 'Last full review: 2026-07-02' }, 'domain-set-review-due')
check('  a full review 42 days ago is not yet due', { body: steadyBody, targets: [], goalsText: 'Last full review: 2026-07-03' }, null)
check('  a review last week is silent', { body: steadyBody, targets: [], goalsText: 'Last full review: 2026-08-10' }, null)
check('  the template\'s undated placeholder is reported', { body: steadyBody, targets: [], goalsText: '# Goals\n\nLast full review: _pending intake_' }, 'domain-set-review-due')
check('  a goals.md with no such line (an older chart) is silent', { body: steadyBody, targets: [], goalsText: '# Goals\n\n## Domain: Sleep' }, null)
check('  a bulleted line counts', { body: steadyBody, targets: [], goalsText: '- Last full review: 2026-08-10' }, null)

console.log('goals.md triggers — evaluated against data, reported as a sentence to say')
const triggers = { weightFloorLb: 170, weightCeilingLb: 185, weightCheckpointLb: 175, waistTriggerIn: 33 }
const withTriggers = { ...deficitChart, triggers }
const flat = (lb, n = 8) => weights('2026-08-07', Array(n).fill(lb))

check('  a 7-day mean below the floor fires it',
  { constants: withTriggers, body: flat(168), targets: [] }, 'weight-below-floor')
check('  a 7-day mean above the ceiling fires it',
  { constants: withTriggers, body: flat(190), targets: [] }, 'weight-above-ceiling')
check('  the review checkpoint fires between the floor and the line',
  { constants: withTriggers, body: flat(174), targets: [] }, 'weight-at-checkpoint')
check('  normal weight fires nothing',
  { constants: withTriggers, body: flat(179), targets: [] }, null)
check('  a chart with no weight triggers is never policed',
  { constants: deficitChart, body: flat(168), targets: [] }, null)
check('  hitting the waist goal is surfaced too — good news goes unnoticed just as easily',
  { constants: withTriggers, body: flat(179).map((b) => ({ ...b, waist_in: '33.0' })), targets: [] }, 'waist-goal-met')

// §6: "Trend over point. Never react to a single weigh-in."
const singleReading = buildFindings({
  today: '2026-08-14', constants: withTriggers, targets: [],
  body: [{ date: '2026-08-13', weight_lb: '168' }],
}).find((f) => f.id.startsWith('weight-below-floor'))
if (singleReading?.id.endsWith('-thin-window') && singleReading.severity === 'attention') {
  console.log('ok    one reading below the floor is early warning, not a fired trigger (§6)')
} else {
  failed++
  console.error(`FAIL  a single weigh-in must not fire the trigger at full severity — got ${JSON.stringify(singleReading?.id)}/${singleReading?.severity}`)
}

// A review checkpoint is not a safety line. Severity must track what the trigger MEANS, not how
// confident the measurement is.
const cp = buildFindings({ today: '2026-08-14', constants: withTriggers, body: flat(174), targets: [] })
  .find((f) => f.id === 'weight-at-checkpoint')
if (cp?.severity === 'attention') console.log('ok    the review checkpoint is attention, not critical')
else { failed++; console.error(`FAIL  checkpoint severity should be attention, got ${cp?.severity}`) }

// The whole point of this layer: it hands the coach something to SAY, not something to enforce.
const floorFinding = buildFindings({ today: '2026-08-14', constants: withTriggers, body: flat(168), targets: [] })
  .find((f) => f.id === 'weight-below-floor')
if (floorFinding && /their call|reassess/i.test(floorFinding.action)) {
  console.log('ok    the floor finding asks whether to reassess rather than instructing')
} else {
  failed++
  console.error('FAIL  the weight-floor finding must prompt a conversation, not issue an order')
}

// The action text is load-bearing: on 2026-08-13 this check was a build failure, and the coach
// invented a BP threshold to make its own check go green. The fix is that it now says whose
// decision it is.
const blank = run({ body: steadyBody, targets: [], goalsText: '- BP above ___ / ___' })[0]
if (blank && /do not invent/i.test(blank.action)) console.log('ok    the blank-trigger action says not to invent the number')
else { failed++; console.error('FAIL  blank-trigger finding must tell the coach not to invent a threshold') }

// =================================================================================================
// W1 · the findings surface
// =================================================================================================

console.log('\nworkflow health — read from the artifact, never from a self-reported status')
// Each of these is the red fixture for a real production failure: check-steps has failed once and
// log-steps three times, and every one was discoverable only in the Actions tab.
const dated = (start, n) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${start}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + i)
  return { date: d.toISOString().slice(0, 10) }
})

/**
 * ⚠ **EVERY STEPS CASE BELOW RUNS ON A CHART THAT DECLARES `plan.stepFeed`, AND THAT IS THE
 * DIFFERENCE THIS SECTION NOW TURNS ON.** A stale feed is only stale relative to a claim that it
 * was arriving. Without the declaration these fixtures would be asserting that a chart with no
 * wearable should be nagged about an automation it never installed.
 */
const feedChart = {
  ...deficitChart,
  // The level comes OUT: a chart with a feed that also carries a described level is the shape
  // `validate-data.mjs` rejects, and a findings fixture in an illegal shape proves nothing.
  plan: { ...deficitChart.plan, movementOutsideExerciseLevel: undefined, stepFeed: 'apple-health-shortcut' },
}
const feed = (args) => ({ ...args, constants: feedChart })

check('  a steps feed silent for 4 days is reported',
  feed({ body: steadyBody, targets: [target('2026-08-13', FLOOR + 600)], steps: dated('2026-08-07', 4) }),
  'workflow-stale-data-steps-csv')
check("  yesterday's steps row is silent — that is the contract, not a gap",
  feed({ body: steadyBody, targets: [target('2026-08-13', FLOOR + 600)], steps: dated('2026-08-08', 6) }), null)
check('  a targets feed silent for 3 days is reported',
  { body: steadyBody, targets: [target('2026-08-11', FLOOR + 600)], steps: dated('2026-08-08', 6) },
  'workflow-stale-data-targets-csv')

/**
 * ⚠ **THE PAIR THE DECLARATION MADE SEPARABLE, AND THE REASON IT WAS WORTH ADDING.**
 *
 * These two charts have byte-identical `data/` — an empty `steps.csv` — and the right answer is
 * opposite in each. Before `plan.stepFeed` existed, nothing anywhere could tell them apart, so the
 * never-written case was skipped for both: the second chart was spared a nag it did not deserve
 * and the first was left with a feed that had never once fired and nothing saying so. That is the
 * worst-timed silence there is, because it falls on day one, when nobody yet knows what a working
 * day is supposed to look like.
 */
check('  a DECLARED feed that has never written a row is reported — it never fired once',
  feed({ body: steadyBody, targets: [target('2026-08-13', FLOOR + 600)], steps: [] }),
  'workflow-never-data-steps-csv')
check('  ...while an undeclared one is silent — that chart simply has no wearable',
  { body: steadyBody, targets: [target('2026-08-13', FLOOR + 600)], steps: [] }, null)
check('  ...and an undeclared feed is not called STALE either, whatever the dates say',
  { body: steadyBody, targets: [target('2026-08-13', FLOOR + 600)], steps: dated('2026-08-07', 4) }, null)

console.log('\na thin window is reported, not withheld — the sparser the record, the louder this got')
/**
 * ⚠ **BOTH OF THESE FAIL AGAINST THE PRE-PORT CODE, which is the point of writing them.** A window
 * needed three readings or it returned nothing, and one constant answered two different questions:
 * "is there a mean here" and "is that mean solid". The consequences ran in opposite directions and
 * both were wrong.
 */
{
  const w = (date, lb) => ({ date, weight_lb: String(lb) })
  const ceilingChart = {
    baseline: { date: '2026-08-05', weightLb: 200 },
    plan: { maxRatePctBwPerWk: 1.0, proteinFloorG: 150, targetRateLbPerWk: [0.5, 1.0], ...answered },
  }

  /**
   * ⚠ **A §5.2 SAFETY CEILING THAT A SPARSE RECORD SWITCHED OFF.** Two readings a week apart, four
   * pounds down on a 200 lb athlete — 2%/wk against a 1%/wk ceiling. Before, each window held one
   * reading, `trailingMean` returned null for both, and the critical finding could not fire. The
   * quieter the chart, the quieter the safety check.
   */
  /**
   * ⚠ **AND THE FIGURE IS A RATE, which it was not.** The old check took two fixed 7-day-WIDE
   * means and divided by a nominal week — but the readings inside those windows are not a week
   * apart. Three pounds over thirteen days (0.81 %/wk, comfortably under a 1 %/wk ceiling) was
   * reported as 1.50 %/wk and raised as a CRITICAL telling the athlete to eat more. The rate now
   * comes from `anchoredTrend`, over the real gap.
   */
  check('  a fall that is UNDER the ceiling once measured over its real span is silent',
    {
      constants: ceilingChart,
      body: [w('2026-08-01', 200), w('2026-08-14', 197)],
      targets: [target('2026-08-13', FLOOR + 600)],
    },
    null)

  check('  a one-reading window still fires the loss-rate ceiling',
    {
      constants: ceilingChart,
      body: [w('2026-08-07', 200), w('2026-08-14', 196)],
      targets: [target('2026-08-13', FLOOR + 600)],
    },
    'loss-rate-above-ceiling')

  const thin = buildFindings({
    today: '2026-08-14',
    constants: ceilingChart,
    body: [w('2026-08-07', 200), w('2026-08-14', 196)],
    targets: [target('2026-08-13', FLOOR + 600)],
  }).find((f) => f.id === 'loss-rate-above-ceiling')
  if (thin && /1 reading then, 1 reading now/.test(thin.detail) && /thin/i.test(thin.detail)
    && /over 7 days/.test(thin.detail)) {
    console.log('ok      ...naming the readings AND the days it actually measured over')
  } else {
    failed++
    console.error(`FAIL    a thin ceiling finding must declare itself\n      ${thin?.detail}`)
  }

  /**
   * ⚠ **AND THE SAME CHANGE MUST NOT PROMOTE A SINGLE MORNING TO HARD NEWS.** §6: "never react to
   * a single weigh-in." The crossing check already split firm from soft — but it decided firmness
   * by asking whether a mean EXISTED, which was only ever true at three readings. Now that a mean
   * exists at one, that test would silently call one morning a 7-day mean. It asks the count.
   */
  const crossingChart = {
    baseline: { date: '2026-08-05', weightLb: 181 },
    plan: { proteinFloorG: 150, ...answered },
    triggers: { weightFloorLb: 175 },
  }
  const oneReading = buildFindings({
    today: '2026-08-14',
    constants: crossingChart,
    body: [w('2026-08-14', 174)],
    targets: [target('2026-08-13', FLOOR + 600)],
  }).find((f) => f.id.startsWith('weight-below-floor'))
  if (oneReading && /1-reading mean/.test(oneReading.headline + oneReading.detail)
    && /Based on 1 reading\b/.test(oneReading.detail)) {
    console.log('ok      a one-reading crossing reports SOFT, naming the count rather than "7-day mean"')
  } else {
    failed++
    console.error('FAIL    a crossing off one weigh-in must not be labelled a week\n      '
      + `${oneReading ? oneReading.headline + ' / ' + oneReading.detail : 'no finding'}`)
  }
  const threeReadings = buildFindings({
    today: '2026-08-14',
    constants: crossingChart,
    body: [w('2026-08-12', 174.4), w('2026-08-13', 174.2), w('2026-08-14', 174)],
    targets: [target('2026-08-13', FLOOR + 600)],
  }).find((f) => f.id === 'weight-below-floor')
  if (threeReadings && /7-day mean/.test(threeReadings.detail + threeReadings.headline)) {
    console.log('ok      ...while three readings is still reported as the week it is')
  } else {
    failed++
    console.error('FAIL    a full window must still read as a 7-day mean\n      '
      + `${threeReadings ? threeReadings.headline + ' / ' + threeReadings.detail : 'no finding'}`)
  }
}

console.log('\ntoday\'s proposal against the last three days — the backstop, not the mechanism')
/**
 * The template is a weekday lookup and cannot know what the last few days contained. This is what
 * notices when a session skipped `skills/library/session-recommendation` — and, just as important,
 * what it deliberately stays quiet about.
 */
{
  const day = (n) => {
    const d = new Date('2026-08-14T12:00:00Z')
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  // The fixture's `today` is a Friday. The template proposes a session for it; the day before
  // held one whose sets cover most of that proposal.
  // ⚠ **NO `domains.training` ROLE.** The domain a training decision serves is already on the
  // registry entry — `sessionTypes.<type>.domain`, required and validated — so a second key for it
  // would be two homes for one fact, and on the chart this shipped for the second home was empty
  // while the first had the answer.
  const chart = {
    ...deficitChart,
    program: { weeklyTemplate: { Fri: { session: 'Circuit', type: 'circuit' } } },
    sessionTypes: {
      lift: { met: 5, countsTowardFloor: true, domain: 'Get stronger' },
      circuit: { met: 6, countsTowardFloor: true, domain: 'Get stronger' },
    },
  }
  const rx = (exercise, order) => ({
    date: day(-30), session: 'Circuit', order: String(order), exercise, sets: '3', reps: '10',
  })
  const prescriptions = [rx('Bench press', 1), rx('Bent-over row', 2), rx('Squat', 3), rx('Plank', 4)]
  const yesterdaySets = ['Bench press', 'Bent-over row', 'Squat']
    .map((e, i) => ({ date: day(-1), session: 'Upper', exercise: e, set_index: String(i + 1) }))
  const trained = [{ date: day(-1), type: 'lift', session: 'Upper', status: 'completed', duration_min: '45' }]
  const base = { body: steadyBody, targets: [target('2026-08-13', FLOOR + 600)], prescriptions }

  check('  a proposal repeating most of yesterday is reported',
    { ...base, constants: chart, training: trained, sets: yesterdaySets },
    'session-repeats-recent-work')

  /**
   * ⚠ **SUPPRESSION 1 — THE DAY IS ALREADY TRAINED, SO THERE IS NO PROPOSAL LEFT TO CHECK.**
   * Without it the finding goes on scoring the weekday template for the rest of the day, reporting
   * an overlap in a session the athlete has already replaced with something else. A finding about a
   * session that is not going to happen is noise, and noise is how the surface stops being read.
   */
  check('  ...and is silent once today has actually been trained',
    {
      ...base,
      constants: chart,
      training: [...trained, { date: '2026-08-14', type: 'lift', session: 'Walk', status: 'completed', duration_min: '40' }],
      sets: yesterdaySets,
    },
    null)

  /**
   * ⚠ **SUPPRESSION 2 — "1 OF 1 REPEATED" IS NOT A PATTERN.** The ratio test alone fires at 100%
   * on a single-movement proposal, which is every rehab block and every one-item day. Two working
   * items is the floor for the word "repeats" to mean anything.
   */
  check('  ...and a one-item proposal never trips the ratio, however completely it repeats',
    {
      ...base,
      constants: chart,
      prescriptions: [rx('Bench press', 1)],
      training: trained,
      sets: [yesterdaySets[0]],
    },
    null)

  /**
   * ⚠ **A COMPLETED SESSION DOES NOT ANSWER FOR A PLANNED ONE STILL AHEAD.**
   *
   * The suppression above used to be about the DAY — any completed row anywhere on today silenced
   * the check. A completed morning walk beside a planned evening session is an ordinary shape (the
   * forward view names it), and it made the backstop quiet about the session the athlete had not
   * done yet. A written planned row is always still ahead; only the TEMPLATE's guess at an empty
   * slot is answered by something else happening.
   */
  {
    const walk = { date: '2026-08-14', type: 'lift', session: 'Walk', status: 'completed', duration_min: '40' }
    const ahead = { date: '2026-08-14', type: 'circuit', session: 'Circuit', status: 'planned' }
    check('  a completed session does not silence a PLANNED one still ahead of it',
      { ...base, constants: chart, training: [...trained, walk, ahead], sets: yesterdaySets },
      'session-repeats-recent-work')
    check('  ...and row order does not decide it either',
      { ...base, constants: chart, training: [...trained, ahead, walk], sets: yesterdaySets },
      'session-repeats-recent-work')
    // A day whose record says "not happening" is not a proposal. Before, a written rest or skipped
    // row fell through to the template and got scored, describing a session every surface says is
    // off.
    check('  ...while a day the record has already answered is silent',
      {
        ...base,
        constants: chart,
        training: [...trained, { date: '2026-08-14', type: 'rest', session: 'Rest', status: 'rest' }],
        sets: yesterdaySets,
      },
      null)
  }

  /**
   * ⚠ **THE SESSION-NAME BRIDGE, WITHOUT WHICH THIS CHECK IS DEAD ON HALF THE CHARTS THERE ARE.**
   *
   * `livePrescriptions` matches the session name exactly, and `scripts/lib/sessions.mjs` exists
   * because a chart legitimately writes the same session under several conventions — a descriptive
   * name in `training.csv`, a short one in `prescriptions.csv`. Unbridged, the lookup returns
   * nothing, `items` is empty, and the ratio can never fire: the check silently does nothing.
   */
  check('  a descriptive session name still finds its prescription',
    {
      ...base,
      constants: chart,
      training: [...trained, { date: '2026-08-14', type: 'circuit', session: 'Circuit — upper density', status: 'planned' }],
      sets: yesterdaySets,
    },
    'session-repeats-recent-work')

  /**
   * ⚠ **THE SECOND BRANCH, WHICH NOTHING COVERED AND WHICH WAS WRONG BECAUSE OF IT.**
   *
   * `consecutiveLoadingDays` counts days that actually loaded the athlete. `sessionOverlap` takes
   * a `nonLoading` set for that and its docstring says a caller who forgets it over-counts — and
   * the first version of this finding was the caller who forgot, so every walk and every rest day
   * counted as a loading day. On a real chart that made a flat walk read as loading day five.
   * Reverting the argument turns the second assertion below red.
   */
  {
    const loadDays = [1, 2, 3].map((n) => ({
      date: day(-n), type: 'lift', session: 'Upper', status: 'completed', duration_min: '45',
    }))
    const walkDays = [1, 2, 3].map((n) => ({
      date: day(-n), type: 'stroll', session: 'Walk', status: 'completed', duration_min: '40',
    }))
    // `stroll` is registered non-loading; `lift` is not, so it loads by the default rule.
    const withStroll = {
      ...chart,
      sessionTypes: {
        ...chart.sessionTypes,
        stroll: { met: 3.5, countsTowardFloor: false, loading: false, domain: 'Get stronger' },
      },
    }
    check('  three straight loading days behind today is reported, whatever today repeats',
      { ...base, constants: withStroll, training: loadDays, sets: [] },
      'session-repeats-recent-work')
    check('  ...and three straight WALKS are not — the registry says they do not load',
      { ...base, constants: withStroll, training: walkDays, sets: [] },
      null)
  }

  /**
   * ⚠ **A SESSION WITH NO PRESCRIPTION ROWS KNOWS NOTHING ABOUT ITSELF AND MUST NOT SAY OTHERWISE.**
   * The detail read "Nothing in it is new work." whenever the row list was empty — which is every
   * whole-session activity, and every session whose rows are not written yet. A blank rendered as
   * a measured zero, in the sentence the athlete reads (INVARIANTS.md X-1).
   */
  {
    const f2 = buildFindings({
      today: '2026-08-14',
      constants: chart,
      training: [1, 2, 3].map((n) => ({
        date: day(-n), type: 'lift', session: 'Upper', status: 'completed', duration_min: '45',
      })),
      sets: [],
      body: steadyBody,
      targets: [target('2026-08-13', FLOOR + 600)],
      prescriptions: [],
    }).find((x) => x.id === 'session-repeats-recent-work')
    if (f2 && /movements are not on file/.test(f2.detail) && !/Nothing in it is new work/.test(f2.detail)) {
      console.log('ok      a proposal with no prescription rows says so, rather than "nothing is new"')
    } else {
      failed++
      console.error(`FAIL    an empty row list must not be reported as a measured nothing\n      ${f2?.detail}`)
    }
  }

  check('  a proposal with nothing in common is silent',
    {
      ...base,
      constants: chart,
      training: trained,
      sets: [{ date: day(-1), session: 'Upper', exercise: 'Calf raise', set_index: '1' }],
    },
    null)

  // ⚠ IT REPORTS AND CANNOT INSTRUCT. A finding that told the coach what to train would be the
  // substitution of judgement this whole layer exists to prevent — and the athlete's own way of
  // training is not a defect to correct.
  const f = buildFindings({
    today: '2026-08-14', constants: chart, training: trained, sets: yesterdaySets, ...base,
  }).find((x) => x.id === 'session-repeats-recent-work')
  if (f && /decides nothing/i.test(f.action) && /confirm, adapt or replace/i.test(f.action)) {
    console.log('ok    it asks for a verdict and states plainly that it decides nothing')
  } else {
    failed++
    console.error(`FAIL  the repeat finding must not instruct\n      ${f ? f.action : 'no finding'}`)
  }
  // ⚠ AND NAMES NO PATH A FRESH FORK LACKS. The ported text cited two chart files by name; a new
  // chart has neither, so its one instruction pointed at nothing.
  if (f && !/conditioning-menu\.md|athlete\/constraints\.md/.test(f.action)) {
    console.log('ok    ...by role, not by a path a fresh fork does not have')
  } else {
    failed++
    console.error(`FAIL  the action must not name chart files a fork lacks\n      ${f?.action}`)
  }
  if (f && f.domain === 'Get stronger') {
    console.log('ok    ...filed under the domain the SESSION TYPE declares, not a second key for it')
  } else {
    failed++
    console.error(`FAIL  the finding must read its domain from the chart, got ${JSON.stringify(f?.domain)}`)
  }
}

console.log('\nthe movement question nobody answered — a default inside every day\'s burn')
/**
 * ⚠ **THE ONE FINDING THE PROVENANCE LOOP STRUCTURALLY CANNOT PRODUCE.** `unconfirmedValues`
 * iterates the keys a chart HAS; an unanswered question writes no key, so it has no marker and no
 * finding — while the shipped default goes into the movement term of every single day. Four other
 * coach-proposed values in this file fire correctly through that loop, which is exactly why this
 * one going silent was invisible: the machinery looked like it was working.
 */
{
  const noLevel = { baseline: { date: '2026-08-05', weightLb: 181 }, plan: { proteinFloorG: 150 } }
  const rows = { body: steadyBody, targets: [target('2026-08-13', FLOOR + 600)] }
  check('  a chart with no feed and no level is asked for one',
    { ...rows, constants: noLevel }, 'movement-level-unanswered')
  check('  ...and a chart that answered is not asked again',
    { ...rows, constants: { ...noLevel, plan: { ...noLevel.plan, ...answered } } }, null)
  // A declared feed WITH rows arriving: `check(..., null)` would be wrong here for a reason worth
  // stating — a declared feed with an empty steps.csv correctly fires `workflow-never-…`, so the
  // rows are what isolate the movement question from the feed-health one.
  const feedRows = { ...rows, steps: dated('2026-08-08', 6) }
  check('  ...nor is a chart whose feed counts that movement already',
    { ...feedRows, constants: { ...noLevel, plan: { ...noLevel.plan, stepFeed: 'apple-health-shortcut' } } },
    null)

  // ⚠ **IT MUST NOT INSTRUCT, AND IT MUST CARRY THE CLAUSE THE WHOLE TERM RESTS ON.** A finding
  // that told the coach to write a level would be the substitution of judgement this layer exists
  // to prevent — and one that asked the question without "outside deliberate exercise" invites the
  // answer that counts a logged walk twice.
  const f = buildFindings({ today: '2026-08-14', constants: noLevel, ...rows })
    .find((x) => x.id === 'movement-level-unanswered')
  if (f && /TAKEN OUT|outside deliberate exercise/i.test(f.action)
    && /do not write the default under their name/i.test(f.action)) {
    console.log('ok    it asks about a day with exercise taken out, and refuses to close itself')
  } else {
    failed++
    console.error('FAIL  the movement finding must carry the double-count clause and must not '
      + `write the default under the athlete's name\n      ${f ? f.action : 'no finding'}`)
  }
}

console.log('\ndated follow-ups — the date somebody wrote down IS the registration')
const doc = (text) => [{ path: 'nutrition/plan.md', text }]
const soon = { body: steadyBody, targets: [target('2026-08-13', FLOOR + 600)] }

check('  a commitment 3 days out is reported',
  { ...soon, chartDocs: doc('- Review on: 2026-08-17 (recompute maintenance)') }, 'follow-up-2026-08-17')
check('  a commitment 15 days out is reported, one severity softer',
  { ...soon, chartDocs: doc('- Evaluate ~2026-08-29, before departure') }, 'follow-up-2026-08-29')
check('  a date already past is silent',
  { ...soon, chartDocs: doc('- Set on: 2026-08-06') }, null)
check('  a date beyond the three-week horizon is silent',
  { ...soon, chartDocs: doc('- Phase ends 2026-10-14') }, null)
check('  today is not a follow-up — it is today',
  { ...soon, chartDocs: doc('- Due 2026-08-14') }, null)

{
  // Grouped by date, not by line: one recalibration date can be written in many places in this
  // chart, and nine findings for one commitment is how a card stops being read.
  const many = buildFindings({
    today: '2026-08-14', constants: deficitChart, body: steadyBody, targets: [target('2026-08-13', FLOOR + 600)],
    chartDocs: [
      { path: 'nutrition/plan.md', text: '- Review on: 2026-08-27\n- see also 2026-08-27' },
      { path: 'decisions.md', text: 'deferred to the recalibration on 2026-08-27' },
    ],
  }).filter((f) => f.id.startsWith('follow-up'))
  if (many.length === 1 && /decisions\.md/.test(many[0].detail) && /nutrition\/plan\.md:1/.test(many[0].detail)) {
    console.log('ok    one date written in three places is one finding, quoting the plan file, not the history')
  } else {
    failed++
    console.error(`FAIL  follow-ups must group by date and quote the plan file first — got ${many.length}: ${JSON.stringify(many.map((f) => f.detail))}`)
  }

  const one = many[0]
  if (one && !/^(do|make|take|stop|start)\b/i.test(one.action) && /decide whether/i.test(one.action)) {
    console.log('ok    a follow-up asks whether the commitment still stands rather than issuing it')
  } else {
    failed++
    console.error('FAIL  a follow-up must not be rendered as an instruction')
  }
}

console.log('\nalcohol — the data half ships, the denominator waits (W6, audit F-38/F-69)')
// The whole point is that this finding CANNOT be closed by the runner. It closes when the athlete
// says something, and the alternative — reading whatever weekly figure nutrition/plan.md carries
// as the budget — records an observation of what they already drink as a line they agreed to hold. That is
// X-16's defect with unusually good justification, which makes it harder to catch, not easier.
{
  const withAlcohol = (date, alcohol) => ({ ...target(date, 1700), alcohol_kcal: String(alcohol) })
  // `check(..., null)` asserts NO findings at all, which the other rules here make impossible.
  // This one asserts the absence of one id, so an unrelated finding cannot make it pass or fail.
  const silent = (label, args) => {
    const ids = run(args).map((f) => f.id)
    if (!ids.includes('alcohol-budget-unset')) return console.log(`ok  ${label}`)
    failed++
    console.error(`FAIL${label}\n      alcohol-budget-unset fired; got [${ids.join(', ')}]`)
  }

  check('  a hand-written allowance with no plan budget behind it is reported',
    { body: steadyBody, targets: [target('2026-08-06', 1700), withAlcohol('2026-08-07', 330)] },
    'alcohol-budget-unset')

  silent('  a chart that has never set one is silent — it is not a chore to invent',
    { body: steadyBody, targets: [target('2026-08-06', 1700), target('2026-08-07', 1700)] })

  silent('  a chart WITH a budget on file is silent',
    {
      constants: { ...deficitChart, plan: { ...deficitChart.plan, weeklyAlcoholKcalBudget: 1200 } },
      body: steadyBody,
      targets: [withAlcohol('2026-08-07', 330)],
    })

  silent('  a chart with no energy-deficit domain is never told about a lever it does not have',
    { constants: noDeficitChart, body: steadyBody, targets: [withAlcohol('2026-08-07', 330)] })

  const f = run({ body: steadyBody, targets: [withAlcohol('2026-08-07', 330)] })
    .find((x) => x.id === 'alcohol-budget-unset')
  if (f && /do not pick one/i.test(f.action) && f.severity === 'info') {
    console.log('ok    it says whose call it is, in those words, and stays at info')
  } else {
    failed++
    console.error('FAIL  the finding must name whose decision it is and must not shout\n'
      + `      severity=${f?.severity} action=${f?.action?.slice(0, 80)}`)
  }
  if (f && /observation/i.test(f.detail) && !/should (?:be|drink)/i.test(f.action)) {
    console.log('ok    it calls the ~1,200–1,400 figure an observation, and proposes no number')
  } else {
    failed++
    console.error('FAIL  the finding must not present the observed intake as a budget')
  }
}

console.log('\nthe budget and the rate goal are different numbers — a choice, not a violation')
// ⚠ THE FIXTURES BELOW PASS NO `energy`, SO THEY EXERCISE THE FALLBACK PATH, and that is now what
// they are for. Until 2026-08-15 the burn side was always `plan.estMaintenanceKcal` (RMR × 1.5),
// which gave 17,150 − 12,950 = 4,200 kcal/wk = 1.20 lb/wk — and 1.20 was wrong in the direction
// that makes it look safe, because data/METHOD.md forbids comparing an RMR × 1.5 figure with the
// decomposed burn model the budget is actually spent against (audit F-57). The observed-burn path
// is asserted in its own block further down; both are checked, and the finding says which it used.
const budgetChart = (budget, rates = [0.5, 1.0]) => ({
  baseline: { date: '2026-08-05', weightLb: 181 },
  plan: {
    targetRateLbPerWk: rates, maxRatePctBwPerWk: 1.0, proteinFloorG: 150,
    estMaintenanceKcal: 2450, weeklyKcalBudget: budget, ...answered,
    _provenance: { targetRateLbPerWk: { class: 'athlete-stated', quote: '1 lb per week is my goal. More is great.' } },
  },
})

check('  a budget implying 1.20 lb/wk against a 1.00 goal is reported',
  { constants: budgetChart(12950), body: steadyBody, targets: [target('2026-08-13', FLOOR + 600)] },
  'budget-implies-faster-than-goal')
check('  a budget that lands exactly on the goal is silent',
  { constants: budgetChart(2450 * 7 - 1.0 * KCAL_PER_LB_FAT), body: steadyBody, targets: [target('2026-08-13', FLOOR + 600)] }, null)
check('  a budget too small to reach the acceptable floor is reported the other way',
  { constants: budgetChart(2450 * 7 - 0.4 * KCAL_PER_LB_FAT), body: steadyBody, targets: [target('2026-08-13', FLOOR + 600)] },
  'budget-implies-slower-than-acceptable')
check('  a chart with no deficit domain is never told about a rate it does not have',
  { constants: { ...noDeficitChart, plan: { ...noDeficitChart.plan, estMaintenanceKcal: 2450, weeklyKcalBudget: 12950 } },
    body: steadyBody, targets: [target('2026-08-13', FLOOR + 600)] }, null)

{
  const f = buildFindings({
    today: '2026-08-14', constants: budgetChart(12950), body: steadyBody,
    targets: [target('2026-08-13', FLOOR + 600)],
  }).find((x) => x.id === 'budget-implies-faster-than-goal')

  // It is not a breach and the wording has to say so. Their words are "more is great"; a finding
  // that reads as a telling-off inverts the meaning of the answer it was built from.
  if (f?.severity === 'attention') console.log('ok    it is attention, not critical — nothing is being breached')
  else { failed++; console.error(`FAIL  the budget/goal mismatch must be attention, got ${f?.severity}`) }

  if (f && /not a breach/i.test(f.detail) && /neither one is wrong/i.test(f.detail)) {
    console.log('ok    the detail says plainly that neither number is wrong')
  } else { failed++; console.error('FAIL  the budget/goal finding must not imply the athlete is doing something wrong') }

  if (f && /Two options/.test(f.action) && /their call/i.test(f.action)) {
    console.log('ok    it presents two options and names whose call it is')
  } else { failed++; console.error('FAIL  the budget/goal finding must present a choice, not a correction') }

  // Derived, never restated. 17,150 − 12,950 = 4,200; 4,200 / 3,500 = 1.20.
  if (f && /1\.20 lb\/wk/.test(f.headline) && /1\.00 lb\/wk/.test(f.headline)) {
    console.log('ok    both rates are computed from constants.json and stated to the same precision')
  } else { failed++; console.error(`FAIL  expected computed 1.20 vs 1.00 in the headline, got ${f?.headline}`) }

  // Quoting what is recorded is rendering; paraphrasing it is how the 185 lb ceiling happened.
  if (f && /More is great/.test(f.detail)) console.log("ok    it quotes their own words rather than paraphrasing them")
  else { failed++; console.error('FAIL  the finding should quote the recorded provenance, not restate it') }

  // ...and the fallback SAYS it is a fallback. A finding that silently switched inputs would be
  // worse than either input: the coach would have no way to tell which conversation it belongs to.
  if (f && /FALLBACK/.test(f.detail) && /RMR × 1\.5/.test(f.detail)) {
    console.log('ok    with no ledger to read, it names estMaintenanceKcal as a fallback and why')
  } else { failed++; console.error('FAIL  the estimate path must declare itself') }
}

console.log('\n  ...and the burn side is the ledger, not the RMR × 1.5 estimate')
// CORRECTED 2026-08-15. `plan.estMaintenanceKcal` is 2,450 and the athlete's OWN complete days
// average 2,730 — the same budget therefore implies 1.20 lb/wk against the estimate and 1.76
// against the ledger, and only one of those two numbers is on the same axis as the budget.
{
  const burnRows = (n, kcal = 2730, complete = 'y') => Array.from({ length: n }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    burn_total_kcal: String(kcal),
    complete,
  }))
  const withEnergy = (energy) => buildFindings({
    today: '2026-08-14', constants: budgetChart(12950), body: steadyBody,
    targets: [target('2026-08-13', FLOOR + 600)], energy,
  }).find((x) => x.id === 'budget-implies-faster-than-goal')

  const ledger = withEnergy(burnRows(9))
  // 2,730 × 7 = 19,110; − 12,950 = 6,160; ÷ 3,500 = 1.76.
  if (ledger && /1\.76 lb\/wk/.test(ledger.headline) && /observed burn/.test(ledger.headline)) {
    console.log('ok    nine complete days give 1.76 lb/wk, and the headline says where it came from')
  } else { failed++; console.error(`FAIL  expected a computed 1.76 off observed burn, got ${ledger?.headline}`) }

  if (ledger && /data\/energy\.csv/.test(ledger.detail) && /9 complete days/.test(ledger.detail)) {
    console.log('ok    the detail names the file and how many days it averages')
  } else { failed++; console.error('FAIL  the burn basis must be auditable from the finding itself') }

  if (ledger && /data\/energy\.csv/.test(ledger.source ?? '')) {
    console.log('ok    ...and so does the source line')
  } else { failed++; console.error('FAIL  source must name the ledger when the ledger was used') }

  // §5.2 is a percentage of bodyweight, so the pounds figure alone cannot say whether the plan sits
  // near the ceiling. 1.76 lb on 181 lb is 0.97%/wk against a 1.0%/wk ceiling — the whole reason
  // 1.20 was the dangerous number to report.
  if (ledger && /% of bodyweight per week/.test(ledger.detail) && /§5\.2 ceiling/.test(ledger.detail)) {
    console.log('ok    it states the rate as a percentage of bodyweight against the §5.2 ceiling')
  } else { failed++; console.error('FAIL  a lb/wk figure with no %BW cannot be read against §5.2') }

  if (ledger?.severity === 'attention' && /More is great/.test(ledger.detail)) {
    console.log('ok    still attention, still their words — the correction changed the number, not the framing')
  } else { failed++; console.error(`FAIL  the corrected finding must stay attention and keep the quote, got ${ledger?.severity}`) }

  // The two paths must actually differ on the same chart, or this whole block is vacuous: a check
  // that passes because both branches return the same value certifies nothing about which ran.
  const estimate = withEnergy([])
  if (estimate && ledger && estimate.headline !== ledger.headline) {
    console.log(`ok    the two paths differ on one chart (${/(\d\.\d\d) lb\/wk/.exec(estimate.headline)?.[1]} vs 1.76), so the check can tell them apart`)
  } else { failed++; console.error('FAIL  ledger and estimate produce the same answer — this block proves nothing') }

  // X-1: a floor is not a measurement. An unfinished day and a day whose step feed never arrived
  // both understate burn, and averaging them in would drag every projection down with them.
  const withPartials = withEnergy([...burnRows(9), ...burnRows(3, 900, 'n')])
  if (withPartials && withPartials.headline === ledger.headline) {
    console.log('ok    incomplete days do not move the average')
  } else { failed++; console.error('FAIL  an incomplete energy row reached the burn average') }

  // Below the minimum it falls back rather than averaging two days into a plan constant.
  const thin = withEnergy(burnRows(3))
  if (thin && /FALLBACK/.test(thin.detail)) {
    console.log('ok    three complete days is not enough, and it says so instead of guessing')
  } else { failed++; console.error('FAIL  a thin ledger must fall back and declare it') }
}

if (failed) { console.error(`\nfindings: ${failed} check(s) failed.`); process.exit(1) }
console.log('\nfindings: all checks passed.')
