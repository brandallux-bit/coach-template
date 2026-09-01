#!/usr/bin/env node
/**
 * X-1, at aggregation level: **null in, null out — or a number that says which inputs were absent.**
 *
 * WHAT THIS PROTECTS. `INVARIANTS.md` X-1 — *empty means "not measured", zero means a measured
 * zero* — was enforced on single rows and nowhere on sums, which is where all ten of its findings
 * lived. Every one of them has the same shape: a column-wise sum that skips nulls, so each column
 * silently picks its own day set and the row stops reconciling. The athlete read one line saying
 * `Days logged 4/4 · Eaten 4,160 · Burn (est.) 9,741 · Deficit 3,007`, and 9,741 − 4,160 is 5,581.
 *
 * WHY IT TESTS `scripts/lib/aggregate.mjs` DIRECTLY. `scripts/test-views.mjs` says in its own
 * header that its logic is *mirrored* from `rollup.ts` and must be hand-updated whenever the
 * TypeScript changes. A property suite built on a mirror proves things about the mirror. So W4
 * moved the arithmetic into one plain-ESM module that `src/lib/aggregate.ts` re-exports and the
 * dashboard imports, and this file runs that module — the same code the pages run. What cannot be
 * imported (a React page's markup) is asserted against its source, and every such assertion is
 * written so that deleting the thing it describes makes it fail.
 *
 * EVERY CHECK HERE SHIPS WITH THE INPUT THAT MAKES IT FAIL (X-10). Each was watched going red
 * against the defect it names before the fix landed:
 *
 *   • `sum()` per column instead of one day set     -> burn − intake ≠ deficit on 240 of 256 weeks
 *   • `complete` computed and rendered nowhere      -> the marker registry below finds no marker
 *   • a NEW page rendering burn, unregistered       -> "not in the marker registry"
 *   • today's partial steps averaged at full weight -> the mean reads 6,800 against a real 9,000
 *   • one flat plan line across all weeks           -> the two History charts disagree
 *   • `elapsed >= 1` and `partialBurn(e, [], 1)`    -> an assertion against an unreachable input
 *   • `est_kcal_burned`, a column that never existed-> the column scan reports it
 *   • `(actual / target) * 100` with target 0       -> Infinity%
 *   • `hard_min=20` on an 80-minute class           -> 60 minutes cost nothing
 *   • a step count dated athlete-local today        -> `steps: wrote 2026-08-14 = 16`, the real row
 *   • a private `sum()` back in rollup.ts           -> the one-home guard fires
 *
 * Pure and fast (~1 s, one short subprocess), because `check-all.mjs` runs inline in every bot
 * before every push: anything slow or flaky here stops a logged meal from reaching `main`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ABSENT_COUNTED_ELSEWHERE, ABSENT_UNKNOWN, BURN_COMPONENTS, MIN_DAYS_FOR_OBSERVED_BURN,
  balancedDays, dayFraction, dayFractionDomain, meanOfAccumulating, meanOfPointReadings,
  describeMissing, meanOrNull, missingBurnComponents, n, observedDailyBurn, partialBurnFrom,
  pctOfTarget,
  plannedTotal, sessionKcal, sumOrNull, weekBalance, weekEnergy, weekIntake, weeklyBudget,
  costDependsOnDuration, impliedSetWorkSec, minutesFromSets,
  observedDailySteps,
} from './lib/aggregate.mjs'
import {
  DEFAULT_MOVEMENT_LEVEL, MOVEMENT_LEVELS, MOVEMENT_LEVEL_KEYS, movementBasis, movementKcal,
  movementLevel,
} from './lib/movement.mjs'
import { fillableGaps, targetGaps } from './lib/targets.mjs'
import { readCsv } from './lib/csv.mjs'
import { SPEC } from './lib/schema.mjs'
import { sessionTypeEnum } from './lib/athlete.mjs'
import { coverIntensitySplit, validateRow, REMAINDER_NOTE } from './lib/rowwrite.mjs'
import { buildFindings } from './lib/findings.mjs'
import { buildDurationResolver, withResolvedDuration } from './lib/session-duration.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = (p) => readFileSync(join(ROOT, p), 'utf8')

/**
 * Source with comments removed, for any check that asks "does the CODE do X".
 *
 * Every assertion below that scans source uses this, and it is not a nicety: half of these files
 * explain the defect they fixed by quoting it, so a scan over raw text finds `est_kcal_burned` and
 * `partialBurn(e, [], 1)` in the very comments recording that they were removed. `test-prescriptions.mjs`
 * strips comments for the mirror-image reason — so prose about a rule cannot satisfy it.
 */
const code = (p) => src(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

let failed = 0
const ok = (name) => console.log(`  ok   ${name}`)
const bad = (name, detail) => { failed++; console.log(`  FAIL ${name}\n       ${String(detail).split('\n').join('\n       ')}`) }

/**
 * ⚠ NOT `JSON.stringify` ALONE. `JSON.stringify(Infinity)` is the string `"null"`, and `NaN`
 * serialises the same way — so the assertion "pctOfTarget against a target of 0 is null, not
 * Infinity" passed against a function returning Infinity. Found by breaking `pctOfTarget`'s guard
 * on purpose and watching this suite stay green: a check that cannot fail certifies the bug, and
 * the whole subject of this file is telling a real value from an absent one.
 */
const show = (v) => JSON.stringify(v, (_k, x) =>
  (typeof x === 'number' && !Number.isFinite(x) ? `<${String(x)}>` : x))
const is = (name, actual, expected) =>
  show(actual) === show(expected)
    ? ok(name)
    : bad(name, `expected ${show(expected)}\n       got      ${show(actual)}`)
const yes = (name, cond, detail = '') => (cond ? ok(name) : bad(name, detail))

// =================================================================================================
console.log('1 · null propagation, one input at a time')
// Property: for every aggregation, null each input in turn and assert the result is null or
// carries an explicit incompleteness flag. A number out of a nulled input is a failure.
// =================================================================================================

{
  is('an empty cell is not measured', n(''), null)
  is('an absent cell is not measured', n(undefined), null)
  is('a measured zero survives', n('0'), 0)

  is('summing nothing is null, never 0', sumOrNull([]), null)
  is('summing only nulls is null, never 0', sumOrNull([null, null]), null)
  is('a measured zero is summed as a zero', sumOrNull([0]), 0)
  is('present values still sum around a null', sumOrNull([100, null, 50]), 150)
  is('averaging nothing is null', meanOrNull([null]), null)
}

{
  // partialBurnFrom: null each burn column in turn. The figure stays a FLOOR (data/METHOD.md
  // deliberately counts an unknown component as zero), so the contract is the `missing` list.
  const full = Object.fromEntries(BURN_COMPONENTS.map((c) => [c.column, '100']))
  const MOVEMENT = BURN_COMPONENTS.filter((c) => c.movement).map((c) => c.column)

  for (const c of BURN_COMPONENTS) {
    const holed = { ...full, [c.column]: '' }
    const out = partialBurnFrom(holed, 500, 0.5)
    // ⚠ **THE MOVEMENT PAIR FILLS ONE SLOT, so nulling either alone leaves the slot filled.**
    // `steps_kcal` and `incidental_kcal` are alternatives — a counted day versus a described one —
    // and a chart that has one is not missing the other. Nulling BOTH is the case that reports,
    // and it reports ONCE, under one label: telling a chart with no wearable that "the step count"
    // is missing, forever, is the defect this pair was introduced to end.
    if (c.movement) {
      yes(`nulling ${c.column} alone reports NOTHING — the other half of the pair still fills the slot`,
        out.missing.length === 0, JSON.stringify(out.missing))
      continue
    }
    yes(`nulling ${c.column} is reported in \`missing\``, out.missing.includes(c.column),
      JSON.stringify(out.missing))
    yes(`...and the figure it produces is strictly lower, i.e. a floor`,
      out.burnSoFarKcal < partialBurnFrom(full, 500, 0.5).burnSoFarKcal)
  }

  {
    const noMovement = { ...full }
    for (const col of MOVEMENT) noMovement[col] = ''
    const out = partialBurnFrom(noMovement, 500, 0.5)
    is('nulling BOTH movement columns reports exactly one', out.missing, [MOVEMENT[0]])
    is('...under a label that names the slot, not one way of filling it',
      describeMissing(out.missing), ['daily movement outside sessions'])
    yes('...and the figure is a floor', out.burnSoFarKcal < partialBurnFrom(full, 500, 0.5).burnSoFarKcal)
  }

  is('a complete row reports nothing missing', partialBurnFrom(full, 500, 0.5).missing, [])
  is('nulled intake is reported too', partialBurnFrom(full, null, 0.5).missing, ['intake'])
  is('no energy row at all yields null, never 0', partialBurnFrom(undefined, 500, 0.5).burnSoFarKcal, null)
  is('...and null deficit with it', partialBurnFrom(undefined, 500, 0.5).deficitSoFarKcal, null)
  is('...and says every component is absent, the movement pair counted once',
    partialBurnFrom(undefined, 500, 0.5).missing,
    BURN_COMPONENTS.filter((c) => !c.movement || c.column === MOVEMENT[0]).map((c) => c.column))

  // The proration rule itself: clock-driven components scale, accrued ones do not.
  const e = { rmr_kcal: '1000', neat_other_kcal: '0', tef_kcal: '0', steps_kcal: '400', session_kcal: '200' }
  is('accrued components are never scaled by the clock',
    Math.round(partialBurnFrom(e, null, 0.5).burnSoFarKcal), 1100)
  is('at midnight only the accrued components count',
    Math.round(partialBurnFrom(e, null, 0).burnSoFarKcal), 600)
}

{
  // missingBurnComponents is what every surface marker is keyed off.
  const base = { rmr_kcal: '1', neat_other_kcal: '1', tef_kcal: '1', session_kcal: '0' }
  is('a row with every component reports nothing missing',
    missingBurnComponents(Object.fromEntries(BURN_COMPONENTS.map((c) => [c.column, '1']))), [])

  /**
   * ⚠ **THE TWO CONFIGURATIONS, ASSERTED SIDE BY SIDE, because the whole fix is that they are
   * equally complete.** One chart's movement is counted by a wearable; the other's is described at
   * intake and priced from that description. Neither is missing anything. Before this, the second
   * row reported `steps_kcal` missing on every day it would ever have, `complete` was `n` forever,
   * `observedDailyBurn` was null forever, and the OUT side of the weekly card was blank forever —
   * on the configuration most charts are actually in.
   */
  is('a chart with a wearable feed is complete',
    missingBurnComponents({ ...base, steps_kcal: '400', incidental_kcal: '' }), [])
  is('a chart with NO feed and a described level is EQUALLY complete',
    missingBurnComponents({ ...base, steps_kcal: '', incidental_kcal: '225' }), [])
  is('...and a day with neither reports the slot once, not both columns',
    missingBurnComponents({ ...base, steps_kcal: '', incidental_kcal: '' }), ['steps_kcal'])
  is('a measured zero is NOT missing', missingBurnComponents(
    Object.fromEntries(BURN_COMPONENTS.map((c) => [c.column, '0']))), [])
}

{
  for (const [name, args] of [
    ['met', [null, 30, 180]], ['minutes', [5, null, 180]], ['weight', [5, 30, null]],
  ]) {
    is(`sessionKcal with no ${name} is null, not zero`, sessionKcal(...args), null)
  }
  is('sessionKcal with everything known is a number', Math.round(sessionKcal(5, 30, 180)), 214)

  is('pctOfTarget with no actual is null', pctOfTarget(null, 100), null)
  is('pctOfTarget with no target is null', pctOfTarget(50, null), null)
  is('pctOfTarget against a target of ZERO is null, not Infinity', pctOfTarget(18, 0), null)
  is('pctOfTarget otherwise answers', pctOfTarget(50, 200), 25)
}

{
  const walk = { kcal: null, kcalAbsence: ABSENT_COUNTED_ELSEWHERE }
  const unknown = { kcal: null, kcalAbsence: ABSENT_UNKNOWN }
  const costed = { kcal: 300 }

  is('a day of nothing costable has no total', plannedTotal([walk]).total, null)
  is('a walk contributing nothing does NOT make the total partial — its energy is in steps',
    plannedTotal([costed, walk]).partial, false)
  is('a session nobody can cost DOES make the total partial',
    plannedTotal([costed, unknown]).partial, true)
  is('...and the total is still reported, because "at least this much" is worth knowing',
    plannedTotal([costed, unknown]).total, 300)
}

// =================================================================================================
console.log('\n2 · one day set — burn, intake and deficit share a denominator (F-51)')
// =================================================================================================

{
  // Exhaustive over every 4-day week buildable from four day shapes. The defect was a day with a
  // burn figure and no food logged: `sum()` put its burn into the week's total and its blank
  // deficit into nothing.
  const shapes = {
    full: { burnToDateKcal: 2500, intakeKcal: 1800, deficitToDateKcal: 700, targetKcal: 1700, burnUnderstated: false, inProgress: false },
    burnOnly: { burnToDateKcal: 2500, intakeKcal: null, deficitToDateKcal: null, targetKcal: 1700, burnUnderstated: false, inProgress: false },
    intakeOnly: { burnToDateKcal: null, intakeKcal: 1800, deficitToDateKcal: null, targetKcal: 1700, burnUnderstated: false, inProgress: false },
    empty: { burnToDateKcal: null, intakeKcal: null, deficitToDateKcal: null, targetKcal: null, burnUnderstated: false, inProgress: false },
  }
  const keys = Object.keys(shapes)

  let mismatches = 0
  let denominatorWrong = 0
  let weeks = 0
  for (const a of keys) for (const b of keys) for (const c of keys) for (const d of keys) {
    weeks++
    const days = [a, b, c, d].map((k) => shapes[k])
    const w = weekBalance(days)
    const expectedCounted = [a, b, c, d].filter((k) => k === 'full').length

    if (w.balanceDays !== expectedCounted) denominatorWrong++
    if (w.burnKcal == null || w.intakeKcal == null || w.deficitKcal == null) {
      // All three must be absent together, or the row has different denominators again.
      if (!(w.burnKcal == null && w.intakeKcal == null && w.deficitKcal == null)) mismatches++
    } else if (Math.abs(w.burnKcal - w.intakeKcal - w.deficitKcal) > 1e-9) {
      mismatches++
    }
  }
  is(`burn − intake = deficit on all ${weeks} generated weeks`, mismatches, 0)
  is('...and balanceDays reports exactly the days that contributed', denominatorWrong, 0)

  const mixed = [shapes.full, shapes.burnOnly, shapes.intakeOnly, shapes.empty]
  const w = weekBalance(mixed)
  is('a burn-only day contributes nothing at all', w.burnKcal, 2500)
  is('an intake-only day contributes nothing at all', w.intakeKcal, 1800)
  is('the plan side is summed over the same days, so the bars compare', w.targetKcal, 1700)
  is('two days held data and could not be balanced', w.unbalancedDays, 2)
  is('a week with nothing on it does not report unbalanced days',
    weekBalance([shapes.empty, shapes.empty]).unbalancedDays, 0)
  is('a week of nothing has null totals, never zeros',
    [weekBalance([shapes.empty]).burnKcal, weekBalance([shapes.empty]).deficitKcal], [null, null])
  is('balancedDays and weekBalance agree about the set',
    balancedDays(mixed).length, weekBalance(mixed).balanceDays)
}

{
  // The same property against the LIVE chart, which is what the athlete actually reads. Mirrors
  // rollDay's field selection only — the arithmetic under test is imported, not copied.
  const bundle = JSON.parse(src('src/generated/data.json'))
  const byDate = (rows) => Object.fromEntries(rows.map((r) => [r.date, r]))
  const energy = byDate(bundle.energy)
  const dates = [...new Set(bundle.energy.map((r) => r.date))].sort()
  const mealsOn = (d) => bundle.meals.filter((m) => m.date === d)

  const days = dates.map((d) => {
    const e = energy[d]
    const intake = sumOrNull(mealsOn(d).map((m) => n(m.kcal)))
    return {
      date: d,
      burnToDateKcal: n(e.burn_total_kcal),
      intakeKcal: intake,
      deficitToDateKcal: n(e.deficit_kcal),
      targetKcal: null,
      burnUnderstated: missingBurnComponents(e).length > 0,
      inProgress: false,
    }
  })

  const w = weekBalance(days)
  const reconciles = w.burnKcal == null
    || Math.abs(w.burnKcal - w.intakeKcal - w.deficitKcal) <= days.length
  yes(`the live chart's ${w.balanceDays} counted days reconcile (rounding aside)`, reconciles,
    `burn ${w.burnKcal} − intake ${w.intakeKcal} = ${w.burnKcal - w.intakeKcal}, deficit ${w.deficitKcal}`)

  // energy.csv's own `complete` column must agree with the component scan, or the marker on the
  // page and the flag in the ledger are two different answers to one question.
  const disagree = dates.filter((d) =>
    (energy[d].complete === 'y') !== (missingBurnComponents(energy[d]).length === 0))
  is('energy.csv `complete` agrees with the component scan on every row', disagree, [])
}

// =================================================================================================
console.log('\n2b · the weekly budget — food is derived, and a partial week never reads as headroom')
// Added 2026-08-14 with the weekly budget card. Every check here ships with the input that makes
// it fail, and each was watched going red against the shape it names:
//
//   • `food` written into constants.json as a third number  -> the derived-figure scan finds it
//   • budget prorated as `total × daysElapsed / 7`          -> the uneven-week fixture disagrees
//   • the pace summed over ELAPSED days, not counted ones   -> an unlogged day buys fake headroom
//   • a surface rendering the budget with no pace figure    -> "not in the pace registry"
//   • a blank alcohol cell read as a measured zero          -> alcoholDays counts a day with none
// =================================================================================================

{
  const B = weeklyBudget(12950, 1400)
  // Asserted as an identity rather than by restating the answer — a check that retypes the number
  // it is checking proves the retyping (X-10), and it would also plant the literal the scan below
  // exists to forbid.
  is('food is derived from the other two, and the split is closed',
    [B.food === 12950 - 1400, B.food + B.alcohol === B.total], [true, true])
  is('no alcohol budget means no food budget — a total with no split, not a guess',
    weeklyBudget(12950, null), { total: 12950, alcohol: null, food: null })
  is('no calorie budget at all yields nothing rather than a negative food figure',
    weeklyBudget(null, 1400), { total: null, alcohol: 1400, food: null })
  is('a chart with neither is silent', weeklyBudget(undefined, undefined),
    { total: null, alcohol: null, food: null })

  // ⚠ THE ONE-HOME RULE, AS A SCAN OVER THIS CHART'S OWN FIGURE. The derived weekly food budget
  // must exist in exactly one place — `weeklyBudget()` — so the number itself may appear in no
  // file. Driven off `athlete/constants.json` rather than a literal, so it holds on any chart and
  // is simply not applicable to one that has set no alcohol budget (X-11). Watched red twice:
  // by adding a `weeklyFoodKcalBudget` key to constants.json, and by stating the arithmetic's
  // RESULT in the note beside it — prose is a home too, which is X-8's whole point.
  const live = JSON.parse(src('athlete/constants.json')).plan ?? {}
  const liveFood = weeklyBudget(live.weeklyKcalBudget, live.weeklyAlcoholKcalBudget).food
  if (liveFood == null) {
    ok('this chart sets no alcohol budget, so there is no derived food figure to keep unique')
  } else {
    const derived = String(liveFood)
    const typed = []
    const scan = (dir) => {
      for (const e of readdirSync(join(ROOT, dir))) {
        const rel = `${dir}/${e}`
        if (e === 'generated' || e === 'node_modules') continue
        if (statSync(join(ROOT, rel)).isDirectory()) scan(rel)
        else if (/\.(mjs|tsx?|json)$/.test(e) && src(rel).includes(derived)) typed.push(rel)
      }
    }
    scan('src'); scan('scripts'); scan('athlete'); scan('nutrition')
    yes(`the weekly FOOD budget (${derived}) is written in no file — it is only ever derived`,
      typed.length === 0,
      `${typed.join(', ')}\nweeklyKcalBudget − weeklyAlcoholKcalBudget has one home in `
      + 'scripts/lib/aggregate.mjs. A third statement of it is three numbers that must satisfy an '
      + 'identity with nothing checking it (INVARIANTS.md X-8).')
  }
}

{
  // A week shaped like this chart's: four tight weekdays, a bigger Friday, a big Saturday. The
  // unevenness is the point — it is what makes `budget × daysElapsed / 7` wrong rather than merely
  // approximate, and it is deliberate (nutrition/plan.md schedules the social dinner).
  const day = (intake, alcohol, target, inProgress = false) =>
    ({ intakeKcal: intake, alcoholKcal: alcohol, targetKcal: target, inProgress })
  const B = weeklyBudget(12950, 1400)
  const monToFri = [
    day(1626, null, 1700), day(1833, null, 1700), day(1744, null, 1700),
    day(1905, 215, 1700), day(2092, 240, 1750),
  ]
  const w = weekIntake(monToFri, B)

  is('the three consumed figures close: food + alcohol = total',
    [w.foodKcal, w.alcoholKcal, w.foodKcal + w.alcoholKcal === w.totalKcal], [8745, 455, true])
  is('the pace is the plan\'s OWN rows over the counted days', w.planToDateKcal, 8550)

  // ⚠ THE CHECK THE WHOLE CARD EXISTS FOR. Prorating the weekly budget by days elapsed is the
  // obvious shortcut and it fabricates headroom on an uneven week — here 700 kcal of it, on the
  // Friday before the weekend the structure exists to protect.
  const prorated = (B.total * w.daysElapsed) / 7
  yes(`budget × ${w.daysElapsed}/7 would be ${Math.round(prorated)}, not the planned ${w.planToDateKcal}`,
    Math.round(prorated) !== w.planToDateKcal
      && Math.round(prorated) - w.planToDateKcal > 500,
    'if these agree the fixture has stopped being an uneven week and the check proves nothing')

  // Every glass is a calorie he does not eat: the food line moves down as alcohol goes up.
  is('the food pace is the plan through today less what was actually drunk', w.foodPaceKcal, 8095)
  const drier = weekIntake(monToFri.map((d) => ({ ...d, alcoholKcal: null })), B)
  yes('...so a week with no drinks logged has a HIGHER food pace, by exactly the alcohol',
    drier.foodPaceKcal - w.foodPaceKcal === w.alcoholKcal,
    `${drier.foodPaceKcal} vs ${w.foodPaceKcal}, alcohol ${w.alcoholKcal}`)

  // ONE DAY SET. An unlogged day must leave BOTH sides — leaving it in the plan side is the
  // flattering direction and is F-51's shape wearing a budget's clothes.
  const withGap = [...monToFri.slice(0, 3), day(null, null, 1700), monToFri[4]]
  const g = weekIntake(withGap, B)
  is('an unlogged day drops out of the consumed figure', g.totalKcal, 9200 - 1905)
  is('...and out of the pace with it, so the comparison stays honest', g.planToDateKcal, 8550 - 1700)
  is('...and the day count says how much of the week is covered', [g.daysElapsed, g.intakeDays], [5, 4])

  // ⚠ THE RED FIXTURE, SPELLED OUT: the flattering alternative is to sum the plan over every day
  // that has ELAPSED rather than over the days that were logged. Same data, opposite conclusion —
  // 445 kcal OVER becomes 1,255 kcal UNDER, purely because one day went unlogged.
  const flattering = sumOrNull(withGap.map((d) => d.targetKcal))
  const honest = g.totalKcal - g.planToDateKcal
  const flattered = g.totalKcal - flattering
  yes(`over the logged days he is ${Math.round(honest)} over; over all elapsed days he would `
    + `read ${Math.round(Math.abs(flattered))} ${flattered < 0 ? 'UNDER' : 'over'}`,
    honest > 0 && flattered < 0,
    'the fixture must produce opposite signs, or it does not demonstrate the defect')
  yes('...and weekIntake takes the honest one',
    g.planToDateKcal === flattering - 1700 && g.planToDateKcal < flattering)

  // X-1. A week with nothing on it is TBD, never 0 and never 0%.
  const empty = weekIntake([day(null, null, 1700), day(null, null, 1700)], B)
  is('a week with nothing logged has null figures, never zeros',
    [empty.foodKcal, empty.alcoholKcal, empty.totalKcal, empty.planToDateKcal],
    [null, null, null, null])
  is('...so no percentage is computed from them',
    [pctOfTarget(empty.foodKcal, B.food), pctOfTarget(empty.alcoholKcal, B.alcohol)], [null, null])

  // A day that recorded no drink is NOT a zero-alcohol day. It contributes nothing to the count,
  // and the total still reports over its own denominator.
  is('days with no alcohol row are not counted as measured zeros', w.alcoholDays, 2)
  const teetotal = weekIntake(monToFri.map((d) => ({ ...d, alcoholKcal: null })), B)
  is('a week with no drink logged anywhere reports null alcohol, not 0', teetotal.alcoholKcal, null)
  is('...and its food figure is the whole intake, unreduced', teetotal.foodKcal, teetotal.totalKcal)
  is('a MEASURED zero is different and is counted',
    weekIntake([day(1700, 0, 1700)], B).alcoholDays, 1)

  // The day-scale trap: today's whole target enters the pace the moment breakfast is logged.
  // Not adjusted away — prorating a calorie budget by the clock would invent an intraday eating
  // schedule — so it is flagged, and the surface registry below requires the flag to be rendered.
  const saturdayMorning = weekIntake([...monToFri, day(300, null, 2650, true)], B)
  yes('a counted day still in progress is flagged', saturdayMorning.inProgressCounted)
  yes('...and it is the flag, not an adjustment: the whole day is still in the pace',
    saturdayMorning.planToDateKcal === 8550 + 2650)
  yes('...while a week of finished days is not flagged', w.inProgressCounted === false)
}

{
  // THE REGISTRY, the same shape as the burn markers below. A surface that renders the week's TOTAL
  // or FOOD against the weekly budget must also render the pace and the in-progress flag — those
  // two are the only things standing between a partial week and a number that reads as headroom.
  // A NEW page rendering the budget fails until it is registered. Verified: deleting the pace props
  // from today/page.tsx makes this red.
  const RENDERS_BUDGET = /budget\.food|budget\.total|\.foodKcal\b/
  const PACED = {
    // Today: three meters against the weekly budget, with the plan-through-today line on the Food
    // and Total tracks and the in-progress sentence under them.
    'src/app/today/page.tsx': /planToDateKcal[\s\S]*inProgressCounted|inProgressCounted[\s\S]*planToDateKcal/,
  }

  const files = []
  const walk = (dir) => {
    for (const e of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${e}`
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel)
      else if (/\.tsx?$/.test(e)) files.push(rel)
    }
  }
  walk('src/app'); walk('src/components')

  for (const f of files) {
    const text = code(f)
    if (!RENDERS_BUDGET.test(text)) continue
    const rule = PACED[f]
    if (!rule) {
      bad(`${f} renders a weekly budget figure and is not in the pace registry`,
        'a week-to-date total against a full-week budget reads as headroom he does not have — '
        + 'render planToDateKcal and inProgressCounted, or register the file with what it renders '
        + 'instead')
      continue
    }
    rule.test(text)
      ? ok(`${f} renders the pace beside the budget`)
      : bad(`${f} renders a weekly budget with no pace figure`,
        `expected ${rule} — on a Tuesday, 4,000 against 12,950 reads as 31% used`)
  }
}

// =================================================================================================
console.log('\n3 · partial ≠ complete — every burn surface carries the marker (F-16)')
// =================================================================================================

{
  // The registry is the check. A page that renders a burn or deficit figure must reference the
  // incompleteness flag for that figure; a page not in this table that renders one is a NEW
  // unmarked surface and fails, which is what makes this cover the class rather than the three
  // files that happen to exist today.
  //
  // ⚠ THE WEEK-LEVEL NAMES ARE MATCHED BARE, NOT AS `w.burnKcal`. They were originally written as
  // `\bw\.burnKcal|\bw\.deficitKcal`, which requires the variable to be named `w` — true of both
  // files that exist today and of nothing else. Verified: a new page rendering `week.burnKcal`
  // passed this check green, so the class it claimed to cover was one loop variable wide. The day
  // -level names (`burnToDateKcal` and friends) never had the problem: they are distinctive enough
  // to match wherever they are read. Matching bare adds no false positive here — `burnKcal` and
  // `deficitKcal` are defined in `src/lib/`, which this walk does not scan, so the only files that
  // can match are ones actually rendering the figure.
  const RENDERS_BURN = /burnToDateKcal|deficitToDateKcal|burnSoFarKcal|deficitSoFarKcal|\bburnKcal\b|\bdeficitKcal\b/
  const SURFACES = {
    // Goals: the weekly table and the day-by-day table. `~` on any figure whose day is finished
    // and missing a component; `*` separately for a day still in progress.
    'src/app/page.tsx': /burnUnderstated/,
    // History: the same two markers, plus `†` where a day held data on one side only.
    'src/app/history/page.tsx': /burnUnderstated/,
    // Today renders burn-so-far, where "incomplete" is the normal state (the step total is not due
    // until tomorrow). Its honest signal is the `missing` list — specifically that a "deficit" with
    // nothing logged is burn, and says so.
    'src/app/today/page.tsx': /d\.intakeKcal == null/,
  }

  const files = []
  const walk = (dir) => {
    for (const e of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${e}`
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel)
      else if (/\.tsx?$/.test(e)) files.push(rel)
    }
  }
  walk('src/app'); walk('src/components')

  for (const f of files) {
    const text = src(f)
    if (!RENDERS_BURN.test(text)) continue
    const marker = SURFACES[f]
    if (!marker) {
      bad(`${f} renders a burn or deficit figure and is not in the marker registry`,
        'add it to SURFACES with the flag it renders, or stop rendering the figure')
      continue
    }
    marker.test(text)
      ? ok(`${f} marks a figure whose inputs are incomplete`)
      : bad(`${f} renders burn or deficit with no incompleteness marker`,
        `expected ${marker} somewhere in the file — INVARIANTS.md X-1, audit F-16`)
  }

  // And the flag has to exist upstream of them, computed from the component scan rather than from
  // `energyComplete` (which goes true the moment breakfast is logged).
  const rollup = src('src/lib/rollup.ts')
  yes('rollup computes burnUnderstated from the component scan',
    /burnUnderstated: !inProgress && missingBurn\.length > 0/.test(rollup), rollup.slice(0, 0))
  yes('...and a day still in progress is never marked understated',
    /!inProgress &&/.test(rollup),
    'today has no step total by design; marking it every day is how a marker stops being read')
}

// =================================================================================================
console.log('\n4 · accumulating metrics exclude the day in progress (F-59)')
// =================================================================================================

{
  const days = [
    { steps: 9000, weightLb: 180, inProgress: false },
    { steps: 9000, weightLb: 181, inProgress: false },
    { steps: 9000, weightLb: 179, inProgress: false },
    { steps: 200, weightLb: 180, inProgress: true },   // today, at 08:00
  ]
  is('a partial step count is excluded from the average, not averaged in at full weight',
    meanOfAccumulating(days, (d) => d.steps), 9000)
  is('a weigh-in is a point measurement and today\'s counts in full',
    meanOfPointReadings(days, (d) => d.weightLb), 180)
  is('a day with no steps row at all is excluded either way',
    meanOfAccumulating([{ steps: null, inProgress: false }, { steps: 8000, inProgress: false }],
      (d) => d.steps), 8000)
  is('a week with only today in it has no step average yet',
    meanOfAccumulating([{ steps: 200, inProgress: true }], (d) => d.steps), null)

  // The live shape of the defect: History read Avg steps 5,667 against a 9,000 target for a week
  // whose completed days averaged 7,551 — he would read himself as 3,300/day behind.
  const real = [{ steps: 9989, inProgress: false }, { steps: 6394, inProgress: false },
    { steps: 6270, inProgress: false }, { steps: 16, inProgress: true }]
  const wrong = meanOrNull(real.map((d) => d.steps))
  const right = meanOfAccumulating(real, (d) => d.steps)
  yes(`...worth ${Math.round(right - wrong)} steps/day of understatement avoided`, right - wrong > 1000)

  yes('rollup averages steps as an accumulation and weight as a point reading',
    /avgSteps: meanOfAccumulating/.test(src('src/lib/rollup.ts'))
    && /avgWeightLb: meanOfPointReadings/.test(src('src/lib/rollup.ts')),
    'one of the two is using the wrong mean')
}

// =================================================================================================
console.log('\n5 · every plan line shares its bar\'s day set AND its bar\'s model (F-62, F-63, F-57)')
// =================================================================================================

{
  const history = code('src/app/history/page.tsx')

  // ⚠ REWRITTEN 2026-08-14 (W5). W4 asserted that both charts *scaled their plan side by
  // `balanceDays`*, which fixed the denominator (F-62) and left the harder half untouched: on the
  // burn chart the plan side was `plan.estMaintenanceKcal`, an `RMR × 1.5` figure, plotted against
  // a decomposed burn series — the mixing data/METHOD.md forbids in bold, worth a structural
  // +2,618 kcal/week gap that exists whatever the athlete does (F-57). A correctly scaled wrong
  // comparison is still a wrong comparison. Both plan lines are now built from the week's OWN
  // figures, which share the denominator by construction rather than by a matching expression.
  yes('the deficit chart\'s reference is the week\'s own burn minus its own target',
    /ref: w\.burnKcal != null && w\.targetKcal != null \? w\.burnKcal - w\.targetKcal : null/
      .test(history),
    'both sides must come from one model — a 1.5-derived plan deficit against a decomposed actual '
    + 'one inherits the whole mixing error from the chart above it')

  yes('...so it needs no separate scaling: burnKcal and targetKcal already share balanceDays',
    /const balance = weekBalance\(days\)/.test(src('src/lib/rollup.ts')))

  yes('the burn chart plots one series and no maintenance line',
    /values: \[w\.burnKcal\]/.test(history),
    'RMR × 1.5 and the decomposition must never share an axis (data/METHOD.md, audit F-57)')

  yes('DeficitBars takes a reference per group, not one flat line',
    /ref\?: number \| null/.test(src('src/components/charts.tsx')),
    'one refLine across the chart is what made the two charts disagree')

  // F-63: the Goals weekly table had no days denominator at all while History's did.
  yes('the Goals weekly table states how many days each row covers',
    /\{w\.balanceDays\} \/ \{w\.days\.length\}/.test(src('src/app/page.tsx')))
  yes('the History weekly table states the same denominator',
    /\{w\.balanceDays\} \/ \{w\.days\.length\}/.test(history))
}

// =================================================================================================
console.log('\n6 · reachability — no test asserts against an input production cannot generate (F-55)')
// =================================================================================================

{
  // The domain is COMPUTED from the real generator, not asserted. `fractionOfDayElapsed()` is
  // (hour*60 + minute)/1440 over a real day, so it maxes at 1439/1440 = 0.99930555… — `elapsed >= 1`
  // never fired, and `test-views.mjs` asserted `partialBurn(e, [], 1)`, certifying a branch that
  // never runs.
  const domain = dayFractionDomain()
  const lo = Math.min(...domain), hi = Math.max(...domain)

  is('the day fraction starts at midnight', lo, 0)
  yes(`the day fraction cannot reach 1 — it maxes at ${hi}`, hi < 1 && hi > 0.999, String(hi))
  yes('...and no minute of the day produces 1', !domain.includes(1))
  is('the mirror of the formula still matches src/lib/data.ts',
    /return dayFraction\(at\('hour'\), at\('minute'\)\)/.test(src('src/lib/data.ts')), true)
  yes('no page tests the elapsed fraction for a finished day',
    !/elapsed >= 1/.test(code('src/app/today/page.tsx')),
    'that branch cannot fire; "is the day finished" is DayRoll.inProgress, keyed off the date')

  // The general check: every numeric literal passed where a produced value belongs must be inside
  // the producible domain. Written against the whole suite directory, including this file.
  const PRODUCIBLE = [
    { callee: 'partialBurn', argIndex: 2, lo, hi, producedBy: 'fractionOfDayElapsed()' },
    { callee: 'partialBurnFrom', argIndex: 2, lo, hi, producedBy: 'fractionOfDayElapsed()' },
  ]

  /** Split a call's argument list on top-level commas. */
  const splitArgs = (text) => {
    const out = []
    let depth = 0, cur = '', i = 0
    for (; i < text.length; i++) {
      const c = text[i]
      if (c === '(' || c === '[' || c === '{') depth++
      else if (c === ')' && depth === 0) break
      else if (c === ')' || c === ']' || c === '}') depth--
      if (c === ',' && depth === 0) { out.push(cur.trim()); cur = '' } else cur += c
    }
    return { args: [...out, cur.trim()], end: i }
  }

  const suites = readdirSync(join(ROOT, 'scripts')).filter((f) => /^test-.*\.mjs$/.test(f))
  let unreachable = 0
  let scanned = 0
  for (const file of suites) {
    const text = code(`scripts/${file}`)
    for (const rule of PRODUCIBLE) {
      const re = new RegExp(`\\b${rule.callee}\\(`, 'g')
      for (const m of text.matchAll(re)) {
        const { args } = splitArgs(text.slice(m.index + m[0].length))
        const arg = args[rule.argIndex]
        if (arg == null || !/^-?\d+(\.\d+)?$/.test(arg)) continue // not a literal — nothing to check
        scanned++
        const v = Number(arg)
        if (v < rule.lo || v > rule.hi) {
          unreachable++
          bad(`scripts/${file}: ${rule.callee}(…, ${arg}) is an input production cannot generate`,
            `${rule.producedBy} ranges over [${rule.lo}, ${rule.hi}]. A test asserting on ${arg} `
            + 'certifies a branch that never runs (INVARIANTS.md X-10).')
        }
      }
    }
  }
  yes(`all ${scanned} literal fractions in the suites are values production can produce`,
    unreachable === 0)
}

// =================================================================================================
console.log('\n7 · numeric-string truthiness, and columns that do not exist (F-41, F-68)')
// =================================================================================================

{
  // THE CLASS, not the instance. `x || fallback` on a CSV cell is safe for `'0'` (a truthy string)
  // and safe for `''` — the trap is subtler and it is what actually shipped: the field was never a
  // column at all, so `x` was `undefined` on every row, the fallback fired forever, and a column
  // that could never say anything sat on the page looking like data. `est_kcal_burned` is not in
  // training.csv's header and both the Today caption and History's session table read it.
  //
  // snake_case is the tell: this codebase writes CSV columns in snake_case and everything derived
  // in camelCase, so every snake_case name in `src/` should be a real column somewhere.
  const columns = new Set(Object.values(SPEC).flatMap((s) => s.header))
  for (const c of src('data/energy.csv').split('\n')[0].trim().split(',')) columns.add(c)

  // Not CSV columns, and each exempt for a stated reason.
  const NOT_COLUMNS = {
    ahead_by: 'GitHub compare API response field (src/lib/github.ts)',
    coach_session: 'the session cookie name (src/lib/auth.ts)',
    kcal_absence: 'reserved: derived field, camelCase in TS',
  }

  const files = []
  const walk = (dir) => {
    for (const e of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${e}`
      if (e === 'generated') continue
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel)
      else if (/\.tsx?$/.test(e)) files.push(rel)
    }
  }
  walk('src')

  const unknown = new Map()
  for (const f of files) {
    const text = code(f)
    const names = [
      ...[...text.matchAll(/\.([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g)].map((m) => m[1]),
      ...[...text.matchAll(/'([a-z][a-z0-9]*(?:_[a-z0-9]+)+)'/g)].map((m) => m[1]),
    ]
    for (const name of names) {
      if (columns.has(name) || NOT_COLUMNS[name]) continue
      if (!unknown.has(name)) unknown.set(name, new Set())
      unknown.get(name).add(f)
    }
  }

  unknown.size === 0
    ? ok(`every snake_case name in src/ is a real column in data/ (${columns.size} known)`)
    : bad('src/ reads a column that does not exist in any data/ file',
      [...unknown].map(([k, v]) => `${k} — ${[...v].join(', ')}`).join('\n')
      + '\n(a field that is never a column is `undefined` on every row, so its `|| fallback` '
      + 'fires forever and the cell can never say anything)')

  // F-68: the divide that produced `18 / 0 g · 18 over · Infinity%`.
  const ui = src('src/components/ui.tsx')
  yes('Meter divides through the guarded helper, not inline',
    /const pct = pctOfTarget\(actual, target\)/.test(ui),
    '(actual / target) * 100 renders Infinity% on a legal target of 0')
  // ⚠ Updated 2026-08-14 with the kcal ⇄ % toggle. `Meter` now renders a whole percentage FORM,
  // not a trailing `· 60%`, so the guard moved rather than disappeared: the displayed figure is
  // derived from the guarded division and the form is gated on it existing. Both halves are
  // asserted, because the second without the first would pass against a `Math.round(actual /
  // target * 100)` sitting next to a `pct` nobody reads.
  yes('...and does not print a percentage that does not exist',
    /const pctShown = pct == null \? null : Math\.round\(pct\)/.test(ui)
    && /\{pctShown != null && leftPctShown != null \?/.test(ui),
    'the % form must be gated on pctOfTarget having produced an answer (a 0 target has none)')
  yes('...and does not place the floor marker against a zero target',
    /floor != null && target > 0 &&/.test(ui))
}

// =================================================================================================
console.log('\n8 · a session\'s intensity split covers its duration (F-03)')
// =================================================================================================

{
  // The exact audit row: an 80-minute class where the athlete characterised only the hard rounds.
  // It validated with zero errors and contributed 295 kcal against a real ~1,180.
  //
  // ⚠ The TYPE is taken from the chart's own registry rather than named (audit F-30, F-15). It was
  // `'bjj'`, which is one athlete's sport — so on any other chart this row failed the enum and the
  // whole section went red for reasons that have nothing to do with intensity splits.
  const raw = {
    date: '2026-08-12', type: sessionTypeEnum()[0], session: 'Evening class', status: 'completed',
    duration_min: '80', light_min: '', moderate_min: '', hard_min: '20', note: 'Hard rounds only.',
  }
  is('the row as logged validates clean — it is not a malformed row', validateRow('training.csv', raw), [])

  const covered = coverIntensitySplit('training.csv', raw)
  is('the 60 unassigned minutes are counted as light', covered.light_min, '60')
  is('...leaving the athlete\'s own figure untouched', covered.hard_min, '20')
  yes('...and the row says the assignment was made', covered.note.includes(REMAINDER_NOTE), covered.note)
  yes('...keeping what the session actually wrote', covered.note.startsWith('Hard rounds only.'))
  is('the covered row still validates', validateRow('training.csv', covered), [])

  // NEVER FORCE A SESSION TO INVENT A SPLIT. The validator's rule stays one-directional.
  const short = validateRow('training.csv', raw)
  is('a short split is NOT an error — a hand-written row must not be made to fabricate 60 minutes',
    short.filter((e) => e.includes('duration_min')), [])
  const over = validateRow('training.csv', { ...raw, hard_min: '90' })
  yes('parts EXCEEDING the whole is still an error — that is a contradiction, not a gap',
    over.some((e) => e.includes('exceeds duration_min')), over.join('|'))

  // Re-appliable: push-retry.mjs replays a mutation against a tree it has just reset.
  is('covering twice changes nothing the second time',
    coverIntensitySplit('training.csv', covered), covered)
  is('a row with no split at all is untouched',
    coverIntensitySplit('training.csv', { ...raw, hard_min: '' }), { ...raw, hard_min: '' })
  is('a row with no duration is untouched — nothing to cover against',
    coverIntensitySplit('training.csv', { ...raw, duration_min: '' }), { ...raw, duration_min: '' })
  is('a non-training file is untouched',
    coverIntensitySplit('meals.csv', { light_min: '1' }), { light_min: '1' })

  yes('the dashboard write path covers before it validates',
    /coverIntensitySplit\(file, mergeIntoExisting\(text, file, row\)\)/.test(src('src/lib/github.ts')))
  yes('validate-data warns about a short split rather than erroring on it',
    /warn\('training\.csv', `row \$\{i \+ 2\} \(\$\{t\.date\} \$\{t\.session\}\): the intensity split covers/
      .test(src('scripts/validate-data.mjs')),
    'an error here would force a hand-written row to invent a split (CLAUDE.md §0.3)')
}

// =================================================================================================
console.log('\n9 · a step count dated today is a partial, not a total (F-06)')
// =================================================================================================

{
  // Runs the real writer against a throwaway repo copy, because the rejection is the whole point
  // and a source-regex assertion would not prove the script exits non-zero.
  const dir = mkdtempSync(join(tmpdir(), 'coach-steps-'))
  const run = (env) => {
    try {
      const out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'log-steps-row.mjs')],
        { cwd: dir, env: { ...process.env, ...env }, stdio: 'pipe' })
      return { status: 0, out: out.toString() }
    } catch (e) {
      return { status: e.status ?? 1, out: [e.stdout?.toString(), e.stderr?.toString()].filter(Boolean).join('') }
    }
  }
  const seed = () => {
    mkdirSync(join(dir, 'data'), { recursive: true })
    writeFileSync(join(dir, 'data', 'steps.csv'), 'date,steps\n2026-01-01,9000\n')
  }
  const stepsFile = () => readFileSync(join(dir, 'data', 'steps.csv'), 'utf8')

  try {
    // The athlete-local date the script itself derives — asking it rather than assuming a clock.
    const localToday = execFileSync(process.execPath,
      ['-e', "import('./scripts/lib/athlete.mjs').then(m => process.stdout.write(m.localToday()))"],
      { cwd: ROOT }).toString()
    const yesterday = new Date(`${localToday}T12:00:00Z`)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const yIso = yesterday.toISOString().slice(0, 10)

    seed()
    const same = run({ STEPS_DATE: localToday, STEPS_COUNT: '16' })
    yes('a payload dated athlete-local today is refused', same.status !== 0, same.out)
    yes('...loudly, naming the contract rather than the number',
      /COMPLETED total/.test(same.out), same.out)
    yes('...and nothing is written', !stepsFile().includes(localToday), stepsFile())

    // The boundary. A LOW but completed day is true data and is recorded without argument.
    seed()
    const low = run({ STEPS_DATE: yIso, STEPS_COUNT: '900' })
    is('a 900-step COMPLETED day is written, because it is true', low.status, 0)
    yes('...and lands in the file', stepsFile().includes(`${yIso},900`), stepsFile())

    seed()
    const normal = run({ STEPS_DATE: yIso, STEPS_COUNT: '9432' })
    is('an ordinary yesterday still writes', normal.status, 0)

    seed()
    const ahead = run({ STEPS_DATE: '2099-01-01', STEPS_COUNT: '9000' })
    yes('a future-dated payload is refused too', ahead.status !== 0, ahead.out)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  // ...and the low day becomes a FINDING — run, not grepped.
  const constants = JSON.parse(src('athlete/constants.json'))
  const idsFor = (steps) => buildFindings({ constants, steps, today: '2026-08-14' }).map((f) => f.id)

  yes('a 16-step completed day becomes a finding',
    idsFor([{ date: '2026-08-13', steps: '16' }]).includes('steps-implausible'))
  yes('an ordinary day does not', !idsFor([{ date: '2026-08-13', steps: '9989' }]).includes('steps-implausible'))
  yes('nor does a day older than the window',
    !idsFor([{ date: '2026-07-01', steps: '16' }]).includes('steps-implausible'))
  yes('nor does today, which is a partial by definition and not yet a completed day',
    !idsFor([{ date: '2026-08-14', steps: '16' }]).includes('steps-implausible'))
  yes('a chart with no steps feed at all is never told about steps',
    !idsFor([]).includes('steps-implausible'))

  const one = buildFindings({
    constants, today: '2026-08-14',
    steps: [{ date: '2026-08-12', steps: '29' }, { date: '2026-08-13', steps: '466' }],
  }).filter((f) => f.id === 'steps-implausible')
  is('two suspect days produce ONE finding, not two', one.length, 1)
  yes('...naming both dates', /2026-08-12 = 29.*2026-08-13 = 466/.test(one[0].headline), one[0].headline)
  is('...for the coach, never the athlete — only he knows which it was', one[0].audience, 'coach')
  is('...and it can never fail a build', one[0].severity, 'attention')

  const findings = src('scripts/lib/findings.mjs')
  yes('the threshold has one home and says it is a detector, not a goal',
    /const IMPLAUSIBLE_STEPS = \d+/.test(findings) && /NOT A GOAL/.test(findings))
  yes('...and the finding refuses to decide what the number should be',
    /Do not adjust it on this/.test(findings),
    'a step count nobody confirmed is a number invented to make a check go quiet')
  yes('...and it is not on the athlete\'s dashboard — it is a question only he can answer',
    !/'steps-implausible': 'athlete'/.test(findings))
}

// =================================================================================================
console.log('\n10 · the arithmetic has one home')
// =================================================================================================

{
  const rollup = src('src/lib/rollup.ts')
  const forecast = src('src/lib/forecast.ts')

  yes('rollup imports the shared aggregation kernel', /from '\.\/aggregate'/.test(rollup))
  yes('forecast imports it too', /from '\.\/aggregate'/.test(forecast))
  yes('src/lib/aggregate.ts is a re-export of the .mjs, not a second copy',
    /from '\.\.\/\.\.\/scripts\/lib\/aggregate\.mjs'/.test(src('src/lib/aggregate.ts')))
  yes('rollup no longer keeps a private null-skipping sum',
    !/const sum = \(vals/.test(rollup),
    'that local `sum` is what let every column pick its own day set')
  yes('the week rollup delegates the balance rather than summing columns itself',
    /const balance = weekBalance\(days\)/.test(rollup))
  yes('test-views no longer keeps its own copy of partialBurn',
    /from '\.\/lib\/aggregate\.mjs'/.test(src('scripts/test-views.mjs')),
    'a mirror of the code under test certifies the mirror (X-10)')
}

// =================================================================================================
console.log('\n11 · the week\'s estimated in, estimated out, and what they produce')
// His words, 2026-08-15: "my goal for the week is still lose 1 lb, so the week needs an estimated
// cals in and estimated cals out to achieve that, and they need to be divided logically amongst
// the 7 days."
//
// Two things are being defended here and they pull in opposite directions:
//   • the DIVISION already exists (`plan.kcalByWeekday`) and nothing may invent a second one;
//   • the OUT side is partly days that have not happened, so it must never read as a measurement.
// =================================================================================================

{
  // A deliberately UNEVEN fixture budget, because the defect this guards is `total / 7`: on a flat
  // budget a seventh and the real figure are the same number and the check would prove nothing.
  // Synthetic values, not this chart's (scripts/lib/test-mode.mjs: logic is asserted on fixtures).
  const WEEKDAY_BUDGET = { Mon: 1000, Tue: 1000, Wed: 1000, Thu: 1000, Fri: 1000, Sat: 3000, Sun: 2000 }
  const WEEK_TOTAL = Object.values(WEEKDAY_BUDGET).reduce((a, b) => a + b, 0)   // 10,000
  // ⚠ DELIBERATELY NOT THE REAL 3,500. `weekEnergy` takes the constant as a PARAMETER precisely so
  // it has no home of its own, and a fixture using the true value could not tell a function that
  // reads the parameter from one that hardcoded the constant. It also keeps this file out of
  // `test-single-home.mjs`'s KCAL_PER_LB_FAT scan — which caught it, first run.
  const KCAL_PER_LB = 4000

  const day = (weekday, over) => ({
    date: `2026-01-0${Object.keys(WEEKDAY_BUDGET).indexOf(weekday) + 1}`,
    weekday, burnKcal: null, energyComplete: false, targetKcal: null,
    // The IN side's two inputs, defaulted explicitly: a day with no meal row is not a
    // zero-calorie day, and a day is finished unless it says otherwise.
    intakeKcal: null, inProgress: false, ...over,
  })

  const observed = { meanKcal: 2000, days: 9, from: '2025-12-20', to: '2025-12-28' }
  const week = [
    day('Mon', { burnKcal: '2000', energyComplete: true, targetKcal: '1000' }),
    day('Tue', { burnKcal: '2100', energyComplete: true, targetKcal: '1100' }), // a real override
    day('Wed', { burnKcal: '1900', energyComplete: true }),
    day('Thu'), day('Fri'), day('Sat'), day('Sun'),
  ]
  const e = weekEnergy({ days: week, observed, weekdayBudget: WEEKDAY_BUDGET, kcalPerLbFat: KCAL_PER_LB })

  is('a finished day contributes its own ledger figure', e.actualBurnDays, 3)
  is('...and a day that has not finished is counted as an ESTIMATE, not skipped', e.estimatedBurnDays, 4)
  is('out = the three measured days + four at the observed mean',
    e.outKcal, 2000 + 2100 + 1900 + 4 * 2000)
  is('the per-day estimate is the observed mean, never a fresh burn model', e.perDayBurnKcal, 2000)

  is('a written targets row WINS over the weekday structure', e.writtenTargetDays, 2)
  is('...and every other day falls back to the structure', e.structureTargetDays, 5)
  is('in = the two written rows plus the structure for the rest', e.inKcal, 1000 + 1100 + 8000)
  yes('...which is NOT the weekly budget, because one day was overridden', e.inKcal !== WEEK_TOTAL)

  is('the gap is out minus in', e.gapKcal, e.outKcal - e.inKcal)
  is('...and the pounds figure divides it by the kcal-per-lb constant PASSED IN',
    e.lossLb, (e.outKcal - e.inKcal) / KCAL_PER_LB)
  {
    // ...and a DIFFERENT constant moves the answer, which is what separates "reads the parameter"
    // from "happens to agree with a hardcoded 3,500".
    const halved = weekEnergy({ days: week, observed, weekdayBudget: WEEKDAY_BUDGET, kcalPerLbFat: KCAL_PER_LB / 2 })
    is('...so halving the constant doubles the pounds', halved.lossLb, e.lossLb * 2)
  }

  {
    // ⚠ THE DIVISION IS THE PLAN'S, NOT A SEVENTH. A week with no written rows must reproduce
    // `Σ kcalByWeekday` exactly. On this fixture a seventh of the budget is 1,428.57, so a
    // prorating implementation gives 10,000 too — the day-level assertion below is what separates
    // them, and it is the one that fails if anybody ever divides.
    const bare = weekEnergy({
      days: Object.keys(WEEKDAY_BUDGET).map((w) => day(w)),
      observed, weekdayBudget: WEEKDAY_BUDGET, kcalPerLbFat: KCAL_PER_LB,
    })
    is('a week with no rows at all sums the weekday structure exactly', bare.inKcal, WEEK_TOTAL)
    const satOnly = weekEnergy({
      days: [day('Sat')], observed, weekdayBudget: WEEKDAY_BUDGET, kcalPerLbFat: KCAL_PER_LB,
    })
    is('...and ONE Saturday is worth Saturday, not a seventh of the week',
      satOnly.inKcal, WEEKDAY_BUDGET.Sat)
    yes('...i.e. it is not budget ÷ 7', satOnly.inKcal !== WEEK_TOTAL / 7)
  }

  {
    // X-1, both directions.
    const noBurn = weekEnergy({ days: week, observed: null, weekdayBudget: WEEKDAY_BUDGET, kcalPerLbFat: KCAL_PER_LB })
    is('with no observed burn on file the OUT side is null, never a partial sum', noBurn.outKcal, null)
    is('...and so is the pounds figure', noBurn.lossLb, null)
    is('...but the plan is still knowable, so IN still renders', noBurn.inKcal, 1000 + 1100 + 8000)

    const noWeekday = weekEnergy({
      days: [day('Mon'), { ...day('Tue'), weekday: 'Blursday' }],
      observed, weekdayBudget: WEEKDAY_BUDGET, kcalPerLbFat: KCAL_PER_LB,
    })
    is('a day with neither a row nor a structure entry nulls the whole IN side', noWeekday.inKcal, null)

    // The nastiest one: `complete=y` with an empty burn cell. Counting it as a measured ZERO would
    // drag the week's out figure down by a whole day and read as a rest week.
    const hollow = weekEnergy({
      days: [day('Mon', { energyComplete: true, burnKcal: '' })],
      observed, weekdayBudget: WEEKDAY_BUDGET, kcalPerLbFat: KCAL_PER_LB,
    })
    is('a day flagged complete with no burn figure is an ESTIMATE, not a measured zero',
      hollow.outKcal, 2000)
    is('...and it counts as estimated, so the marker fires', hollow.estimatedBurnDays, 1)

    const noConstant = weekEnergy({ days: week, observed, weekdayBudget: WEEKDAY_BUDGET, kcalPerLbFat: null })
    is('with no kcal-per-lb constant the kcal gap survives', noConstant.gapKcal, e.gapKcal)
    is('...and only the pounds figure goes null', noConstant.lossLb, null)
  }

  {
    // =============================================================================================
    // ⚠ **THE IN SIDE IS THE LEDGER FIRST.** It used to sum the seven targets and nothing else, so
    // it answered "what does the plan add up to" under a label that says "estimated" — and on a
    // week already several hundred calories over budget it reported the budget straight back, while
    // the OUT side beside it was measured days plus one estimate.
    //
    // The fixture below is the SHAPE of such a week — six finished days that ate over target, and a
    // part-logged today — on synthetic numbers, so the assertions test the rule and not a chart.
    // =============================================================================================
    const overWeek = [
      day('Mon', { targetKcal: '1000', intakeKcal: '1400' }),
      day('Tue', { targetKcal: '1000', intakeKcal: '1300' }),
      day('Wed', { targetKcal: '1000', intakeKcal: '1200' }),
      day('Thu', { targetKcal: '1000', intakeKcal: '1100' }),
      day('Fri', { targetKcal: '1000', intakeKcal: '1500' }),
      day('Sat', { targetKcal: '3000', intakeKcal: '3200' }),
      day('Sun', { targetKcal: '2000', intakeKcal: '300', inProgress: true }),
    ]
    const over = weekEnergy({
      days: overWeek, observed, weekdayBudget: WEEKDAY_BUDGET, kcalPerLbFat: KCAL_PER_LB,
    })

    is('a finished day contributes what it ATE, not what it was told to eat',
      over.recordedIntakeKcal, 1400 + 1300 + 1200 + 1100 + 1500 + 3200 + 300)
    is('...and today contributes what is eaten plus the REST of today\'s target',
      over.inKcal, 1400 + 1300 + 1200 + 1100 + 1500 + 3200 + 2000)
    is('...so the part still on plan is today\'s remaining target and nothing else',
      over.plannedIntakeKcal, 2000 - 300)
    yes('...and the week does NOT report the budget back on a week that has overeaten it',
      over.inKcal > WEEK_TOTAL,
      `inKcal ${over.inKcal} vs budget ${WEEK_TOTAL} — this is the whole defect: a week 700 kcal `
      + 'over its plan cannot land on its plan')
    is('the six finished days are records, not estimates', over.actualIntakeDays, 6)
    is('...and only the unfinished one is an estimate, which is what the badge reads',
      over.estimatedIntakeDays, 1)
    is('ledger + plan reconciles to the total, so the tile can show its own arithmetic',
      over.recordedIntakeKcal + over.plannedIntakeKcal, over.inKcal)

    // ⚠ THE OVERSHOOT DIRECTION. `target − eaten` alone goes NEGATIVE once today is over its
    // target, which would have the week's estimated intake FALL as the athlete keeps eating. The
    // floor is what makes the formula survive its own worst day.
    const blown = weekEnergy({
      days: [day('Sun', { targetKcal: '2000', intakeKcal: '2600', inProgress: true })],
      observed, weekdayBudget: WEEKDAY_BUDGET, kcalPerLbFat: KCAL_PER_LB,
    })
    is('a today already OVER its target contributes what was eaten, never eaten minus the overshoot',
      blown.inKcal, 2600)
    // ⚠ **AND IT IS STILL AN ESTIMATE, WHICH THE FIRST VERSION OF THIS FIXTURE ASSERTED THE
    // OPPOSITE OF.** Once today is over target the figure is what has been eaten SO FAR — a running
    // partial — while the OUT side for today is a whole-day mean. Classifying it as a record made
    // `estimatedIntakeDays` zero, dropped the tile's badge, and printed "a record, not a forecast"
    // on a day hours from over, three lines above a footnote saying "a projection, not a result".
    // The floor is right; calling a lower bound a record is not.
    is('...and it is STILL an estimate — today is never a record, whatever the number says',
      blown.estimatedIntakeDays, 1)
    is('...so the badge holds on the day the athlete is most likely to be reading it',
      blown.actualIntakeDays, 0)

    // A day still to come is the plan, and so is a finished day nobody logged — a day with no meal
    // row is not a zero-calorie day (X-1), and it says it is an estimate.
    const ahead = weekEnergy({
      days: [day('Mon', { targetKcal: '1000', intakeKcal: '900' }), day('Sat')],
      observed, weekdayBudget: WEEKDAY_BUDGET, kcalPerLbFat: KCAL_PER_LB,
    })
    is('a day with no meal row falls back to the plan rather than counting as zero',
      ahead.inKcal, 900 + WEEKDAY_BUDGET.Sat)
    is('...and is counted as an estimate', ahead.estimatedIntakeDays, 1)
    is('...while the logged day is not', ahead.actualIntakeDays, 1)

    // A finished, fully logged week: both sides stop being forecasts and the badges go away.
    const done = weekEnergy({
      days: overWeek.map((d) => ({
        ...d, inProgress: false, energyComplete: true, burnKcal: '2500',
        intakeKcal: d.intakeKcal ?? '1000',
      })),
      observed, weekdayBudget: WEEKDAY_BUDGET, kcalPerLbFat: KCAL_PER_LB,
    })
    is('a finished, fully logged week has no estimated intake days at all',
      done.estimatedIntakeDays, 0)
    is('...and its IN side is exactly what it ate', done.inKcal, done.recordedIntakeKcal)
    is('...with nothing left on plan', done.plannedIntakeKcal, 0)
    is('...and no estimated burn days either, so neither tile claims to be a forecast',
      done.estimatedBurnDays, 0)

    // ⚠ **`complete=y` ON TODAY IS NOT A MEASUREMENT.** The flag means "TEF and steps are present",
    // and rollup.ts records today's row reading `complete=y` at 10:15 on 16 steps. Counting that
    // half-day as an actual would shrink the week's burn by most of a day, silently.
    const earlyComplete = weekEnergy({
      days: [day('Sun', {
        energyComplete: true, burnKcal: '900', targetKcal: '2000', inProgress: true,
      })],
      observed, weekdayBudget: WEEKDAY_BUDGET, kcalPerLbFat: KCAL_PER_LB,
    })
    is('a day in progress takes the observed mean even when its row says complete',
      earlyComplete.outKcal, observed.meanKcal)
    is('...and counts as estimated, so the projection marker fires',
      earlyComplete.estimatedBurnDays, 1)
  }

  {
    // observedDailyBurn itself.
    const rows = (spec) => spec.map(([date, kcal, complete]) =>
      ({ date, burn_total_kcal: kcal, complete }))
    const nine = rows(Array.from({ length: 9 }, (_, i) =>
      [`2026-01-0${i + 1}`, String(2000 + i * 10), 'y']))

    is('fewer than a week of complete days is not an average yet',
      observedDailyBurn(nine.slice(0, MIN_DAYS_FOR_OBSERVED_BURN - 1)), null)
    const o = observedDailyBurn(nine)
    is('...and a full week is', o.days, 9)
    is('...with the mean of the complete rows', o.meanKcal, 2040)
    is('...and the window it covers, so a surface can say what it averages', [o.from, o.to],
      ['2026-01-01', '2026-01-09'])

    // A day in progress and a day whose step feed never arrived are both FLOORS (X-1). Averaging
    // them in would drag the figure down and every projection built on it with them.
    const withPartial = observedDailyBurn([...nine, { date: '2026-01-10', burn_total_kcal: '900', complete: 'n' }])
    is('an incomplete day never enters the average', withPartial.meanKcal, 2040)
    const withBlank = observedDailyBurn([...nine, { date: '2026-01-10', burn_total_kcal: '', complete: 'y' }])
    is('nor does a complete row with no burn figure', withBlank.meanKcal, 2040)
    is('...and it is not counted in the day count either', withBlank.days, 9)
  }

  {
    // ⚠ **THE PROJECTION MARKER IS ASSERTED ON THE ELEMENT, NOT ON THE FILE.** A previous check in
    // this repo asserted three props "existed in the file" rather than being attached to the right
    // meter, and deleting them left every suite green. So: every occurrence of a projected figure
    // must fall inside a JSX element that ALSO carries `estimatedBurnDays` — which is the badge
    // expression on a Tile, or the sentence in a footnote. An occurrence anywhere else (a Card
    // caption, a Masthead, a bare paragraph) is a projected number rendered with the confidence of
    // a measurement, and fails.
    //
    // The badge is required to be COMPUTED rather than a literal for the same reason: on a week
    // whose every day is finished the figures stop being forecasts, and a hardcoded "projection"
    // would then be wrong in the other direction.
    // ⚠ **TWO CONTRACTS, ONE CHECK.** The IN side became a forecast the moment it stopped being a
    // restatement of the budget — which is exactly why it carried no marker, and why the tile could
    // print the week's budget beside a larger figure already eaten without anything objecting. It
    // now has the same obligation as the OUT side, so this runs once per contract rather than being
    // written twice and drifting.
    // ⚠ **`lossLb` AND `gapKcal` ARE UNDER BOTH MARKERS, because they are a subtraction of the two
    // sides.** Keying them to `estimatedBurnDays` alone was right while the IN side was a
    // restatement of the budget and could not be a forecast; it stopped being right the moment the
    // IN side started carrying record and plan together. A week whose every day is energy-complete
    // but one of which nobody logged has `estimatedBurnDays === 0` and `estimatedIntakeDays === 1`,
    // and would have rendered a projected loss with no badge at all.
    const CONTRACTS = [
      { figures: /\b(outKcal|lossLb|gapKcal)\b/g, marker: 'estimatedBurnDays' },
      { figures: /\b(inKcal|lossLb|gapKcal)\b/g, marker: 'estimatedIntakeDays' },
    ]
    const SURFACES = {
      // /today's weekly card. The daily surface is where the athlete decides what to eat, so this
      // is where "where does the week land" belongs (docs/SURFACES.md). Nothing else renders it.
      'src/app/today/page.tsx': true,
    }

    const pages = []
    const walkPages = (dir) => {
      for (const entry of readdirSync(join(ROOT, dir))) {
        const rel = `${dir}/${entry}`
        if (statSync(join(ROOT, rel)).isDirectory()) walkPages(rel)
        else if (/\.tsx?$/.test(entry)) pages.push(rel)
      }
    }
    walkPages('src/app'); walkPages('src/components')

    /** Ranges a marker can legitimately live in, with the text of each. */
    const markableRanges = (text) => {
      const out = []
      for (const re of [/<Tile\b[\s\S]{0,1600}?\/>/g, /<p className="footnote">[\s\S]{0,4000}?<\/p>/g]) {
        for (const m of text.matchAll(re)) out.push({ from: m.index, to: m.index + m[0].length, text: m[0] })
      }
      return out
    }

    /**
     * ⚠ **A NULL GUARD IS NOT A RENDER, and the distinction has to be drawn narrowly.**
     * `{wk.energy.inKcal != null && (…)}` prints no number — it decides whether the card exists at
     * all — so requiring a projection marker on it would force a marker onto a branch nobody reads.
     * Only `=== null` / `!= null` immediately after the name is excused; anything else, including
     * the same name one character further into an expression, is a figure reaching a reader.
     */
    const isNullGuard = (text, hit) => /^\s*[!=]==?\s*null/.test(text.slice(hit.index + hit[0].length))

    for (const { figures: FIGURES, marker } of CONTRACTS) {
    const MARK = new RegExp(marker)
    // ⚠ **PER CONTRACT, NOT SHARED.** One counter across both loops meant a contract that matched
    // NOTHING on any page ran no assertions at all and still passed the vacuity check below, on the
    // strength of the other contract's hits. Demonstrated: replacing the tile's `inKcal` with a
    // different field and deleting its badge left this whole suite green.
    let rendered = 0
    for (const f of pages) {
      const text = code(f)
      const hits = [...text.matchAll(FIGURES)].filter((h) => !isNullGuard(text, h))
      if (!hits.length) continue
      if (!SURFACES[f]) {
        bad(`${f} renders a projected weekly figure and is not in the projection registry`,
          'register it, or stop rendering a forecast on that surface')
        continue
      }
      rendered++
      const ranges = markableRanges(text)
      for (const h of hits) {
        const holder = ranges.find((r) => h.index >= r.from && h.index < r.to)
        if (!holder) {
          bad(`${f}: \`${h[0]}\` is rendered outside any element carrying the projection marker`,
            'a projected figure printed in a caption or a bare paragraph reads as a measurement '
            + '(INVARIANTS.md X-1). Put it in the marked Tile, or mark where it is.')
        } else if (!MARK.test(holder.text)) {
          bad(`${f}: the element rendering \`${h[0]}\` does not reference ${marker}`,
            `${holder.text.slice(0, 200)}…\n       the mark has to be ON the figure, not elsewhere `
            + 'in the file — a mention is not a mark')
        } else {
          ok(`${f}: \`${h[0]}\` is rendered inside an element marked from ${marker}`)
        }
      }

      // ⚠ **AND THE TILE MUST CARRY THE BADGE ITSELF — the containment rule above is NOT enough,
      // and this is the half a first version shipped without.** Deleting `badge={…}` from the
      // Estimated-out tile left every check green, because that tile's FOOT names
      // `estimatedBurnDays` too and the containment rule was satisfied by the footnote text. The
      // pill vanished from the figure and nothing noticed. Verified by deleting it on purpose.
      //
      // So a Tile rendering a projected figure must have a `badge=` prop, and that prop must be
      // COMPUTED from `estimatedBurnDays`: a literal `badge="projection"` still says "projection"
      // on a week whose every day is finished, which is the same defect pointing the other way.
      for (const t of markableRanges(text).filter((r) => r.text.startsWith('<Tile'))) {
        FIGURES.lastIndex = 0
        if (!FIGURES.test(t.text)) continue
        FIGURES.lastIndex = 0
        const name = t.text.match(/label="([^"]+)"/)?.[1] ?? '(unlabelled)'
        const badge = t.text.match(/badge=\{([\s\S]*?)\}\s*\n/)?.[1]
          ?? t.text.match(/badge="([^"]*)"/)?.[1]
        if (badge == null) {
          bad(`${f}: the "${name}" tile renders a projected figure with no badge`,
            'the containment rule is satisfied by any mention anywhere in the element — the PILL '
            + 'on the figure is what the reader sees, and it has to be asserted separately')
        } else {
          yes(`  ...and the "${name}" tile's badge is computed from ${marker}, not a literal`,
            MARK.test(badge),
            `badge=${badge} — a literal badge still says "projection" on a week that is entirely `
            + 'measured')
        }
      }
    }
    yes(`the ${marker} contract is not vacuous — a surface actually renders a figure it marks`,
      rendered > 0,
      `nothing on any page matches ${FIGURES} , so every assertion above ran zero times and this `
      + 'check passed by doing nothing (X-10)')
    }

    // The kcal-per-lb constant reaches the page from its one home rather than being retyped.
    // `test-single-home.mjs` scans for the literal; this asserts the wiring that makes that possible.
    yes('the 3,500 kcal/lb constant reaches the dashboard through the bundle',
      /kcalPerLbFat: KCAL_PER_LB_FAT/.test(code('scripts/build-data-json.mjs'))
      && /kcalPerLbFat/.test(code('src/lib/rollup.ts')))
  }
}

// =================================================================================================
console.log('\n12 · a day may never lack a calorie target')
// 2026-08-15: an automated pre-dawn job read nutrition/plan.md's travel protocol ("a hard calorie
// ceiling", with no file saying what that ceiling is), decided the weekday figure would contradict
// the prose, recorded the reasoning in decisions.md and wrote NOTHING. He woke up travelling with
// no target: "There is ALWAYS a target for every day. That is a bug."
//
// The generator was never broken. The defect is that PROSE REASONING OVERRODE A MACHINE-READABLE
// STRUCTURE THAT HAD THE ANSWER, so the fix is a check, not an edit.
// =================================================================================================

{
  const rows = (dates) => dates.map((d) => (typeof d === 'string' ? { date: d, kcal: '1700' } : d))
  const dates = (gaps) => gaps.map((g) => g.date)

  is('a complete run has no gaps',
    targetGaps(rows(['2026-08-13', '2026-08-14', '2026-08-15']), '2026-08-15'), [])

  is('the day the incident happened — a missing row at the END of the run',
    dates(targetGaps(rows(['2026-08-13', '2026-08-14']), '2026-08-15')), ['2026-08-15'])
  is('...and a hole in the MIDDLE, which no "is today written" check would ever see',
    dates(targetGaps(rows(['2026-08-13', '2026-08-15']), '2026-08-15')), ['2026-08-14'])

  // The sneak: a row that exists and says nothing. Empty means "not measured" everywhere else in
  // this repo; on a prescribed row it means nobody said what the day's number is.
  const blank = targetGaps(
    rows(['2026-08-13', { date: '2026-08-14', kcal: '' }, '2026-08-15']), '2026-08-15')
  is('a row present with an EMPTY kcal cell is a gap too', dates(blank), ['2026-08-14'])
  is('...and it is classified apart, because the generator must not overwrite an override',
    blank[0].reason, 'blank-kcal')
  is('a missing row is classified as fillable', targetGaps(rows(['2026-08-13']), '2026-08-14')[0].reason,
    'missing-row')
  is('...and only those reach the filler',
    fillableGaps(rows(['2026-08-13', { date: '2026-08-14', kcal: '' }]), '2026-08-15'),
    ['2026-08-15'])

  is('a measured-looking zero is a real target and not a gap',
    targetGaps(rows([{ date: '2026-08-13', kcal: '0' }]), '2026-08-13'), [])
  is('a future-dated row is legal and simply outside the domain',
    targetGaps(rows(['2026-08-13', '2026-09-01']), '2026-08-13'), [])
  is('an empty file has no domain to check', targetGaps([], '2026-08-15'), [])

  // The CLI, run for real — a source-regex assertion would not prove it exits non-zero, which is
  // the entire point of it being a hard error rather than a finding.
  //
  // ⚠ **GATED ON THE LIVE CHART HAVING A TARGET HISTORY, per scripts/lib/test-mode.mjs.** The
  // scripts resolve `data/` from their own location, so exercising them means punching a hole in
  // the real file — and on a chart with no rows there is no hole to punch. Ungated this block went
  // red inside `test-cold-start.mjs`, i.e. on a brand-new athlete's very first push: audit F-30
  // exactly, reintroduced by a check written to close a different defect. Found by running the
  // cold-start suite, not by reading it.
  const liveTargets = existsSync(join(ROOT, 'data', 'targets.csv'))
    ? readCsv(join(ROOT, 'data', 'targets.csv'))
    : []
  if (process.env.COACH_SUITE_NESTED) {
    ok('the CLI block is skipped inside a nested suite run — the outer run owns these assertions')
  } else if (liveTargets.length < 2) {
    ok(`the CLI is not exercised — this chart has ${liveTargets.length} target row(s) to hole`)
  } else {
  const dir = mkdtempSync(join(tmpdir(), 'coach-targets-'))
  const runCheck = () => {
    try {
      return { status: 0, out: execFileSync(process.execPath,
        [join(ROOT, 'scripts', 'check-targets-gap.mjs')], { cwd: dir, stdio: 'pipe' }).toString() }
    } catch (err) {
      return { status: err.status ?? 1,
        out: [err.stdout?.toString(), err.stderr?.toString()].filter(Boolean).join('') }
    }
  }
  const runGen = (args = []) => {
    try {
      return { status: 0, out: execFileSync(process.execPath,
        [join(ROOT, 'scripts', 'generate-targets.mjs'), ...args], { cwd: dir, stdio: 'pipe' }).toString() }
    } catch (err) {
      return { status: err.status ?? 1,
        out: [err.stdout?.toString(), err.stderr?.toString()].filter(Boolean).join('') }
    }
  }

  try {
    // The scripts resolve data/ from their own location, so the fixture has to be the repo's own
    // chart with a hole punched in it. Copy it, mutate the copy, and put it back — never leave the
    // live file mutated, even on a throw.
    const live = join(ROOT, 'data', 'targets.csv')
    const original = readFileSync(live, 'utf8')
    const localToday = execFileSync(process.execPath,
      ['-e', "import('./scripts/lib/athlete.mjs').then(m => process.stdout.write(m.localToday()))"],
      { cwd: ROOT }).toString()

    try {
      const before = runCheck()
      is('the live chart has no gap', before.status, 0)

      writeFileSync(live, original.split('\n').filter((l) => !l.startsWith(`${localToday},`)).join('\n'))
      const red = runCheck()
      yes('deleting today\'s row fails the check', red.status !== 0, red.out)
      yes('...naming the day', red.out.includes(localToday), red.out)
      yes('...and stating the rule rather than just the symptom',
        /always answers/.test(red.out) && /never suppress/.test(red.out), red.out)
      yes('...and naming the one command that fixes it',
        /generate-targets\.mjs --fill-gaps/.test(red.out), red.out)

      const fixed = runGen(['--fill-gaps'])
      is('--fill-gaps closes it', fixed.status, 0)
      is('...and the check goes green again', runCheck().status, 0)
      yes('...having written the weekday figure, not invented one',
        /plan\.kcalByWeekday/.test(readFileSync(live, 'utf8')), 'the note must say where it came from')

      // ⚠ **A TARGET GAP MUST NEVER STOP A MEAL REACHING `main`.** In bot mode the suite fills the
      // gap and carries on; in CI it stays a hard error. Measured before this existed: with
      // today's row deleted, `check-all --regen-energy` — the exact command `log-steps.yml` and
      // `absorb-branches.yml` run through `push-retry.mjs` — exited non-zero. A missing
      // PRESCRIPTION was blocking a MEASUREMENT, which the layer model forbids outright, and it
      // arrived through the check written to guarantee targets. `daily-rollover.yml` was said to
      // bound it, but `git log --author=rollover-bot` is empty (F-42): the bound had never run.
      // ⚠ `COACH_SUITE_NESTED` IS LOAD-BEARING, NOT TIDINESS. `check-all` runs this file, so a
      // child `check-all` runs it again, which spawns another — unbounded recursion that hangs
      // rather than fails, which is the plausible-not-loud shape X-7 exists to forbid. It hung a
      // real run for five minutes before this guard existed. The guard makes the child skip this
      // block; the parent is the one doing the asserting, so nothing is lost.
      const runSuite = (args) => {
        try {
          execFileSync(process.execPath, [join(ROOT, 'scripts', 'check-all.mjs'), ...args],
            { cwd: ROOT, stdio: 'pipe', env: { ...process.env, COACH_SUITE_NESTED: '1' } })
          return 0
        } catch (err) { return err.status ?? 1 }
      }
      writeFileSync(live, original.split('\n').filter((l) => !l.startsWith(`${localToday},`)).join('\n'))
      is('bot mode fills the gap rather than blocking the write', runSuite(['--regen-energy']), 0)
      yes('...and the row it wrote is really on file afterwards',
        readFileSync(live, 'utf8').includes(`${localToday},`), 'the fill must persist, not just pass')

      writeFileSync(live, original.split('\n').filter((l) => !l.startsWith(`${localToday},`)).join('\n'))
      yes('...while CI mode still refuses to ship a chart with a hole in it',
        runSuite([]) !== 0, 'in CI the fix belongs in a commit, not in a side effect')

      // ⚠ THE LOUDEST VERSION OF THE DEFECT, and the first version of the check was blind to it:
      // `targetGaps` has no domain without a first row, so EMPTYING the file made every assertion
      // above vacuous and the script exited 0. Found by deleting the file on purpose.
      writeFileSync(live, original.split('\n')[0] + '\n')
      const emptied = runCheck()
      yes('emptying the file entirely fails too, rather than passing for want of a domain',
        emptied.status !== 0, emptied.out)
      yes('...naming the first day he ate against no target',
        /no rows at all/.test(emptied.out), emptied.out)
    } finally {
      writeFileSync(live, original)
    }
    is('the live chart is restored', runCheck().status, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  }

  // The rule has to be in the prose too, or the next automated session re-derives its way around
  // it — which is exactly what happened. A check nobody reads before acting is a check that fires
  // after the damage.
  yes('data/METHOD.md states the guarantee on targets.csv',
    /A DAY MAY NEVER LACK A CALORIE TARGET/.test(src('data/METHOD.md'))
    && /never SUPPRESS one/.test(src('data/METHOD.md')))
  yes('CLAUDE.md §0.3 states it where a coaching session will read it',
    /A day may never lack a calorie target/.test(src('CLAUDE.md'))
    && /it always answers/.test(src('CLAUDE.md')))
  yes('check-all runs the gap check, so every bot runs it before it pushes',
    /check-targets-gap\.mjs/.test(src('scripts/check-all.mjs')))
  yes('daily-rollover fills every gap, not just today',
    /generate-targets\.mjs --fill-gaps/.test(src('.github/workflows/daily-rollover.yml')),
    'writing today alone leaves a dropped cron slot empty forever, and the gap check is a hard '
    + 'error — one skipped day would then wedge every bot')
}

// =================================================================================================
console.log('\n13 · a session performed but not timed')
// ⚠ **THE ZERO THAT LOOKED MEASURED.** `compute-energy.mjs` did `sessionCostFor(t).kcal ?? 0`, so
// an uncostable session wrote a `session_kcal` of 0 — indistinguishable from a rest day's, and
// therefore invisible to `missingBurnComponents`, to `burnUnderstated`, and to `complete`. Whole
// strength sessions entered `observedDailyBurn` as measurements while actually being floors, and
// that mean prices every unfinished day and every rate-of-loss projection on the chart.
//
// The rule the resolver implements: cost an untimed session at what THAT session usually takes —
// the mean of the last three timed ones, else the next three where the history does not exist yet,
// else the standing duration the chart declares for its type — and only estimate it from set count
// when there is nothing left to average.
// =================================================================================================

{
  const REST = 60   // ⚠ NOT the real 70. A fixture using the true constant could not tell a
                    // function that reads the parameter from one that hardcoded it.
  const row = (date, over) => ({
    date, type: 'lifting', session: 'Block One', status: 'completed', duration_min: '', ...over,
  })
  const timed = (date, min, session = 'Block One') => row(date, { session, duration_min: String(min) })

  // Six timed "Block One" sessions either side of a gap, so both comparable branches can be exercised
  // on one fixture: the gap at 01-20 has three before it and three after it.
  const training = [
    timed('2026-01-05', 40), timed('2026-01-10', 50), timed('2026-01-15', 60),
    row('2026-01-20'),
    timed('2026-01-25', 30), timed('2026-01-30', 30), timed('2026-02-04', 30),
  ]
  const resolve = buildDurationResolver({ training, sets: [], restSec: REST })

  is('a timed row is left alone', resolve(timed('2026-01-10', 50)).level, 'recorded')
  {
    const r = resolve(row('2026-01-20'))
    is('a gap with three timed sessions before it takes the LAST three', r.level, 'comps-prior')
    is('...and their mean, not the whole history', r.minutes, 50)   // (40+50+60)/3
    yes('...naming the dates it averaged, so nothing prints a bare estimate',
      /2026-01-05 40m/.test(r.basis) && /2026-01-15 60m/.test(r.basis), r.basis)
  }
  {
    // The backfill clause: a gap early enough that the history does not exist yet.
    const early = buildDurationResolver({
      training: [row('2026-01-01'), timed('2026-01-25', 30), timed('2026-01-30', 30), timed('2026-02-04', 30)],
      sets: [], restSec: REST,
    })
    const r = early(row('2026-01-01'))
    is('with fewer than three before it, the NEXT three fill the gap', r.level, 'comps-next')
    is('...and their mean', r.minutes, 30)
  }
  {
    // ⚠ THE SESSION STEM, NOT THE WRITTEN NAME. "Block One — hinge and pull" and "Block One
    // (variation)" are one session under two descriptions; treating them as two would have left a
    // real gap with one comparable instead of two.
    const mixed = buildDurationResolver({
      training: [
        timed('2026-01-05', 40, 'Block One — hinge and pull'),
        timed('2026-01-10', 50, 'Block One (variation)'),
        timed('2026-01-15', 60, 'Block One'),
        row('2026-01-20', { session: 'Block One (variation)' }),
      ],
      sets: [], restSec: REST,
    })
    is('durations are grouped by the session STEM, across three spellings of one session',
      mixed(row('2026-01-20', { session: 'Block One (variation)' })).minutes, 50)
  }
  {
    // Rung 5. A session with no comparables at all falls to its set count.
    const sets = Array.from({ length: 10 }, (_, i) => ({ date: '2026-03-01', session: 'One-off', set_index: String(i) }))
    const oneOff = buildDurationResolver({
      training: [timed('2026-01-05', 40), row('2026-03-01', { session: 'One-off' })],
      sets: [
        ...sets,
        // A timed session that also logged sets, so `impliedSetWorkSec` has something to fit.
        ...Array.from({ length: 10 }, (_, i) => ({ date: '2026-01-05', session: 'Block One', set_index: String(i) })),
      ],
      restSec: REST,
    })
    const r = oneOff(row('2026-03-01', { session: 'One-off' }))
    is('a session with no comparable history is estimated from its sets', r.level, 'from-sets')
    // The one timed session that logged sets did 10 of them in 40 min, so work = (2400 − 9×60)/10
    // = 186 s/set. The one-off has
    // the same 10 sets, so it lands on the same 40 minutes — which is the point: the fit is the
    // athlete's own, not a coach-supplied "about 90 seconds a set".
    is('...at the work-per-set this chart\'s own timed sessions imply', r.minutes, 40)
    yes('...saying so, and saying how wide the spread it was fitted over is',
      /median of 1 timed sessions/.test(r.basis), r.basis)
  }
  {
    // Rung 4, and rung 6.
    const withRx = buildDurationResolver({
      training: [row('2026-01-20', { type: 'mobility', session: 'Daily block' })],
      sets: [], restSec: REST, prescribedMinFor: (r) => (r.type === 'mobility' ? 13.5 : null),
    })
    is('a session type the chart declares a standing duration for uses it',
      withRx(row('2026-01-20', { type: 'mobility', session: 'Daily block' })).level, 'prescribed')
    const bare = buildDurationResolver({ training: [row('2026-01-20')], sets: [], restSec: REST })
    const r = bare(row('2026-01-20'))
    is('with no comps, no prescription and no sets, the duration stays UNKNOWN', r.minutes, null)
    is('...and says so rather than returning a plausible number', r.level, 'unknown')
  }
  {
    // ⚠ NEVER TOUCH A ROW WHOSE COST DOES NOT COME FROM A DURATION — and the predicate deciding
    // that is `sessionCost`'s own, not a copy (test-single-home.mjs failed the first version here).
    yes('a plain row depends on its duration', costDependsOnDuration(row('2026-01-20')))
    yes('...a row with a device reading does not',
      !costDependsOnDuration(row('2026-01-20', { kcal_override: '500' })))
    yes('...nor does one with an intensity split',
      !costDependsOnDuration(row('2026-01-20', { hard_min: '20' })))
    is('so an overridden row is never given a reconstructed duration',
      resolve(row('2026-01-20', { kcal_override: '500' })).minutes, null)
    const untouched = row('2026-01-20', { kcal_override: '500' })
    is('...and the row handed to sessionCost is the original object',
      withResolvedDuration(untouched, resolve(untouched)), untouched)
  }
  {
    is('the formula puts rest BETWEEN sets, so one set costs its work alone',
      minutesFromSets(1, 120, REST), 2)
    is('...and three sets carry two rests', minutesFromSets(3, 120, REST), (3 * 120 + 2 * 60) / 60)
    is('an unknown set count is null, never zero minutes', minutesFromSets(null, 120, REST), null)
    const fit = impliedSetWorkSec([
      { minutes: 40, sets: 10 }, { minutes: 60, sets: 10 }, { minutes: 20, sets: 10 },
    ], REST)
    // (2400−540)/10 = 186, (3600−540)/10 = 306, (1200−540)/10 = 66. Median 186, mean 186 too —
    // so the assertion below is on the ODD-length median path; the even path is checked next.
    is('work-per-set is the MEDIAN of the timed sessions', fit.workSec, 186)
    is('...and it reports how wide the spread it fitted over is', Math.round(fit.spreadSec), 240)
    is('a chart with no timed session that logged sets cannot fit one',
      impliedSetWorkSec([], REST), null)
  }
}

// =================================================================================================
console.log('\nthe movement term — two configurations, and neither is the fallback for the other')
// The forward view priced movement at `stepsPerDayTarget × constant` on a chart WITH a feed, which
// is the plan restated as a prediction; and at nothing at all on a chart without one, which is the
// majority configuration. Both halves are covered here because neither was covered anywhere.
// =================================================================================================

{
  const r = (date, steps) => ({ date, steps: String(steps) })
  const o = observedDailySteps([r('2026-04-01', 9000), r('2026-04-02', 11000)], 1500)
  is('the mean is over the rows on file', o.meanSteps, 10000)
  is('...and it says how many days that is', o.days, 2)
  is('...and which', [o.from, o.to], ['2026-04-01', '2026-04-02'])
  {
    // A feed sometimes sends a running total instead of a completed day. Averaging one in would
    // drag the forward figure down for a week, so it is skipped — not corrected.
    const withPartial = observedDailySteps(
      [r('2026-04-01', 9000), r('2026-04-02', 11000), r('2026-04-03', 16)], 1500)
    is('an implausible reading never enters the mean', withPartial.meanSteps, 10000)
    is('...and is not counted in the day count either', withPartial.days, 2)
  }
  is('a chart with no rows yet has no mean, and the forecast falls back to the target',
    observedDailySteps([], 1500), null)

  // --- the described level, for a chart with no feed at all ------------------------------------
  is('a described level prices in kcal/day, scaled by bodyweight',
    Math.round(movementKcal('light', 180, 0.00025)), 225)
  is('...and a more active day prices higher, in the same units',
    movementKcal('on-feet', 180, 0.00025) > movementKcal('seated', 180, 0.00025), true)
  is('a level nobody recognises is null, never a guess', movementKcal('quite active', 180, 0.00025), null)
  is('...and so is a missing weight — an estimate needs something to scale',
    movementKcal('light', null, 0.00025), null)
  yes('the basis names the level in the athlete\'s own words, not just a number',
    /step-equivalents/.test(movementBasis('light', 180, 0.00025))
    && movementBasis('light', 180, 0.00025).includes(movementLevel('light').label),
    movementBasis('light', 180, 0.00025))
  yes('...and says out loud that it is an estimate from a description',
    /estimate from a description, not a count/.test(movementBasis('light', 180, 0.00025)))

  /**
   * ⚠ **THE LEVELS ARE ORDERED, AND NOTHING ELSE CHECKS THAT.** They are described in ordinary
   * words and picked from a list, so a step-equivalent typed out of order would price the most
   * active level below the least active one — a wrong burn on every day of that chart, with the
   * description on the page still reading correctly.
   */
  yes('each level prices strictly above the one before it',
    MOVEMENT_LEVELS.every((l, i) => i === 0 || l.stepEquivalent > MOVEMENT_LEVELS[i - 1].stepEquivalent),
    JSON.stringify(MOVEMENT_LEVELS.map((l) => [l.key, l.stepEquivalent])))
  yes('the shipped default is one of them',
    MOVEMENT_LEVEL_KEYS.includes(DEFAULT_MOVEMENT_LEVEL), DEFAULT_MOVEMENT_LEVEL)

  /**
   * ⚠ **`src/lib/forecast.ts` IS MIRRORED BY `scripts/test-views.mjs`, NOT RUN BY IT** — that
   * suite's own header says its logic is mirrored and must be hand-updated. So these read the
   * SOURCE. They are shape assertions, not behaviour: what they can catch is the mirror silently
   * going out of date, which is the failure mode a mirrored suite actually has.
   */
  const forecast = code('src/lib/forecast.ts')
  yes('the forward step row reads the observed mean',
    /plan\.observedSteps/.test(forecast),
    'pricing the forward row at stepsPerDayTarget states the plan as a prediction, on the one burn '
    + 'component that is measured every single day')
  yes('...and still names the target beside it rather than deleting it',
    /stepsPerDayTarget/.test(forecast),
    'the target is a process goal a chart may be graded on weekly; it is the reference line, not '
    + 'the forecast')
  yes('...falling back to the target where there is no record at all',
    /observed\?\.meanSteps \?\? target/.test(forecast))
  yes('the mean is computed once in the aggregate module, not again in the view',
    /observedDailySteps/.test(code('scripts/build-data-json.mjs'))
    && !/observedDailySteps/.test(forecast),
    'a second mean computed in TypeScript is a second answer (X-8)')
  yes('and the no-feed branch exists at all, keyed off the declaration',
    /plan\.stepFeed/.test(forecast) && /plan\.movementKcal/.test(forecast),
    'a forward view with no movement term on a chart with no wearable is the defect this phase '
    + 'exists to close, and it is a different code path from the ledger\'s')
  yes('...and it prices from the declaration rather than from whichever figure is non-null',
    /if \(feed\) \{/.test(forecast),
    'branching on the non-null figure would price BOTH on a chart that somehow carried both')
}

console.log(failed ? `\naggregations: ${failed} FAILED.` : '\naggregations: all checks passed.')
process.exit(failed ? 1 : 0)
