/**
 * Things the coach needs to know, computed from the chart. Nothing here blocks anything.
 *
 * WHAT THIS LAYER IS FOR — and what it is not for.
 *
 * The system has three layers with three different jobs:
 *
 *   data/ + scripts   record faithfully what was decided and what happened
 *   dashboard         show honestly what is true right now
 *   coach + agents    set goals, design activities, recommend, argue
 *
 * `CLAUDE.md` §5.2 tells the COACH to hold certain floors "against the athlete's explicit
 * instruction". That is an instruction to a conversational agent: it means "I will not write you
 * a plan below your RMR, and here is why." On 2026-08-13 it was implemented in the VALIDATOR
 * instead, as hard errors. That was a category error, and the athlete caught it:
 *
 *   > "There is no such thing as 'never let the calorie target drop below your RMR'. Nothing in
 *   > this system can stop that. It can't make me eat. It should inform and recommend. That's it."
 *
 * He is right, and the consequence was concrete: a 2 lb week would have failed `validate-data`,
 * failed `prebuild`, failed the deploy, and frozen his dashboard — for stepping on a scale, with
 * no file he could edit to fix it short of falsifying a weigh-in.
 *
 * So: **a floor is computed and surfaced. It is never enforced against reality.** The ledger's
 * only duty is fidelity — it records what happened, including things the coach wishes had not.
 * The judgement lives in the conversation, where it can be argued with.
 *
 * WHY THIS FILE EXISTS AT ALL. The reason the floors got built as build failures is that a
 * warning in a CI log is invisible — this repo has been printing "46 of 73 sets have no RIR" for
 * days and nothing happened. The answer to an unread warning is a surface people actually look
 * at, not a louder failure. `data/findings.json` is that surface: the coach reads it at session
 * start (CLAUDE.md §0.2) and the dashboard renders it.
 *
 * Pure: takes parsed rows, returns findings. No file IO, no exits, no opinions about what the
 * athlete should have done.
 */

import { KCAL_PER_LB_FAT, rmrFloorKcal } from './athlete.mjs'
import { MIN_DAYS_FOR_OBSERVED_BURN, observedDailyBurn } from './aggregate.mjs'
import { describeValue, markerFor, unconfirmedValues, UNCONFIRMED_GRACE_DAYS } from './provenance.mjs'
import { livePrescriptions } from './suspensions.mjs'

const DAY_MS = 86_400_000
const iso = (d) => d.toISOString().slice(0, 10)
const parseDay = (s) => new Date(`${s}T12:00:00Z`)
const addDays = (s, n) => iso(new Date(parseDay(s).getTime() + n * DAY_MS))
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / DAY_MS)

const MAX_DEFICIT_WEEKS = 16
const DEFICIT_WARN_WEEKS = 14
const MIN_READINGS_PER_WINDOW = 3

/**
 * Below this, a COMPLETED day's step total is more likely a partial reading than a real day.
 *
 * ⚠ **IT IS A DETECTOR THRESHOLD, NOT A GOAL, AND IT IS NOT THE ATHLETE'S NUMBER.** Nothing here
 * says anything about how much anyone should walk; `stepsPerDayTarget` is the athlete's own figure
 * and lives in `constants.json`, marked with its provenance. This is a property of the FEED: the
 * iOS Shortcut sometimes sends the current running total instead of the completed one, and the
 * four real incidents on record read 16, 29 and 466 — two orders of magnitude below any lived day,
 * including a day spent in bed. 1,500 sits far below anything a person who left a chair produces
 * and far above anything a mid-morning partial produces, which is what makes it separate the two
 * without ever needing to be tuned.
 *
 * It can never fail anything. A genuinely small day — illness, a long flight, a procedure — is
 * TRUE and is recorded without argument (see `scripts/log-steps-row.mjs` for where that boundary
 * sits and why). This asks the coach to check it, once, in conversation.
 */
// Exported so `scripts/build-data-json.mjs` can pass it into `observedDailySteps` rather than
// keeping a second copy: the mean the forward view prices movement at and the finding that reports
// a broken reading must agree about which readings are broken, or the forward figure is dragged
// down by rows the coach was told to ignore.
export const IMPLAUSIBLE_STEPS = 1500

/** How far back to look for implausible step days. One review cycle; older ones are history. */
const STEPS_PLAUSIBILITY_WINDOW_DAYS = 14

/**
 * `critical` — raise this before anything else. A §5.2 line crossed is the main instance; the
 *              general rule is "everything else in this session is built on something that is
 *              wrong until this is dealt with."
 * `attention` — needs a decision soon; surfaced, not urgent.
 * `info`      — worth knowing, no action implied.
 */
const SEVERITY = ['critical', 'attention', 'info']

/**
 * WHO A FINDING IS FOR. Added 2026-08-14 after the first version of the dashboard card rendered
 * all seventeen findings to the athlete and he rejected it outright:
 *
 *   > "The cards on the dashboard are WAY too much information. And these are all different
 *   > classes of data. They should not be treated the same. ... What does the user need? Why do
 *   > they need it? What are they going to DO with the information?"
 *
 * He was right, and the spec was the defect: it said "render the findings", which is a data-out
 * exercise, and never asked who each one was for. Severity (`critical`/`attention`/`info`) is a
 * LOG LEVEL. It says how loud, never who for, and sorting by it put a question only he can answer
 * on a read-only page next to an internal chart-integrity note.
 *
 * A finding is `athlete` ONLY if all three hold:
 *   1. it is true about HIM, not about the chart's internal state;
 *   2. it changes what he does, or whether he should trust the page in front of him;
 *   3. the action is available from where he is standing.
 *
 * Everything else is `coach` — read at session start and raised in conversation, where he can
 * actually answer — or `maintainer`, which is a defect in the system and never his problem.
 *
 * A QUESTION FOR THE ATHLETE IS NEVER `athlete`. Asking him something on a page he cannot reply
 * on is worse than not asking: it is an unanswerable nag he has to scroll past. If the system
 * needs something from him, the coach asks him for it.
 */
const AUDIENCE = {
  // Safety lines that change what he should do today. One line each on screen, never a paragraph.
  'rmr-floor-breached': 'athlete',
  'protein-floor-breached': 'athlete',
  'loss-rate-above-ceiling': 'athlete',
  'weight-below-floor': 'athlete',
  'weight-above-ceiling': 'athlete',
  'deficit-phase-over-cap': 'athlete',
  'waist-goal-met': 'athlete',
  // "Do not trust the numbers on this page" — the one integrity signal that is genuinely his.
  'build-stale': 'athlete',
}

/**
 * Default `coach`, deliberately. A new finding is invisible to the athlete until someone decides
 * it passes the three tests above — the safe direction, since the failure this fixes was
 * everything defaulting onto his screen.
 */
export const audienceFor = (id) => {
  if (AUDIENCE[id]) return AUDIENCE[id]
  if (id.startsWith('weight-below-floor') || id.startsWith('weight-above-ceiling')) return 'athlete'
  if (id.startsWith('workflow-') || id.startsWith('build-')) return 'maintainer'
  return 'coach'
}


/**
 * How far ahead a dated commitment is worth surfacing, and how close it has to be before it stops
 * being a heads-up and starts being a thing to plan.
 *
 * Both are anchored on the WEEKLY REVIEW CADENCE (`skills/weekly-review`), not on a number
 * somebody liked the look of. A commitment landing inside seven days lands before the next
 * review, so this session is the last one that can act on it — `attention`. One landing further
 * out will be raised at a review that is going to happen anyway — `info`. Three weeks is three
 * reviews of runway, which is enough lead time to book an appointment or reorder a supplement,
 * and short enough that the card stays a card rather than becoming a calendar.
 */
const FOLLOWUP_HORIZON_DAYS = 21
const FOLLOWUP_SOON_DAYS = 7

/** Enough of the line to recognise the commitment, without pasting a paragraph into a card. */
const FOLLOWUP_QUOTE_CHARS = 200

/**
 * Workflow health, derived from the EVIDENCE each workflow leaves in `data/` rather than from a
 * status the workflow reports about itself.
 *
 * WHY EVIDENCE AND NOT SELF-REPORTING. The original proposal was `data/health.json`, written by
 * every workflow on success and failure. That design cannot detect the failure that actually
 * happened here: a workflow which never runs never writes "I failed" either. `check-steps` has
 * failed once in production and `log-steps` three times, and every one of those was discoverable
 * only by opening the Actions tab — but so is a workflow that got disabled, a PAT that expired,
 * an iOS Shortcut that stopped firing, and a cron GitHub quietly dropped. Reading the artifact
 * the workflow exists to produce catches all of them with the same check, needs no network call
 * at build time, and adds no file that can itself go stale.
 *
 * `check-steps.yml` is deliberately not in this table. It produces no artifact — it is itself a
 * detector for a missing steps row, so the `data/steps.csv` entry below already covers the thing
 * it was built to notice, and covers it even when `check-steps` is the thing that is broken.
 * `absorb-branches.yml` is not here either: its failure surfaces live on every page through
 * `src/components/stray-branches.tsx`, which asks GitHub directly.
 *
 * `staleAfterDays` is a tolerance, not a schedule. It is deliberately looser than the cron, so a
 * normal late run never fires it — a health alarm that cries wolf is one the athlete learns to
 * ignore, which is the failure mode `keep/**` branches already caused once (F-45).
 */
const WORKFLOW_FEEDS = [
  {
    workflow: '.github/workflows/log-steps.yml',
    file: 'data/steps.csv',
    what: 'the daily step count',
    // ⚠ **ONLY A CHART THAT DECLARES A FEED HAS ONE TO LOSE.** Without this, the entry fires at a
    // chart that never had a wearable, about an automation it never installed.
    declaredBy: 'stepFeed',
    // The contract is YESTERDAY's completed total, written when the athlete first picks up the
    // phone, so the newest row is normally dated today-1 and today's row does not exist yet by
    // design. Two clear days of silence is the first unambiguous signal.
    staleAfterDays: 2,
    // ⚠ **NO FIGURE HERE, AND THAT IS DELIBERATE.** This used to name one athlete's step burn in
    // kcal/day. It is not a property of the system — it is what one person's watch happened to
    // record — and shipped to every chart it is a number nobody measured, stated as if somebody
    // had. The SHAPE of the harm is shared and is what belongs here; the magnitude is the chart's
    // own and is on its ledger.
    consequence: 'Without a steps row the burn model has no movement term for that day, so the '
      + 'day\'s burn is a floor and every deficit figure downstream of it is low.',
  },
  {
    workflow: '.github/workflows/daily-rollover.yml',
    file: 'data/targets.csv',
    what: "the day's calorie and macro targets",
    // Runs at 09:00 UTC, which is 01:00–02:00 athlete-local, so today's row exists for almost the
    // whole day. One day of tolerance covers the hour before it runs without ever excusing a real
    // outage.
    staleAfterDays: 1,
    consequence: 'Without a target row the Today tab reads "no target set", and the day is spent '
      + 'against no number at all.',
  },
]

function weightAsOf(body, date, fallbackLb) {
  let best = null
  for (const b of body) {
    const w = Number(b.weight_lb)
    if (b.date <= date && b.weight_lb !== '' && Number.isFinite(w)) {
      if (!best || b.date > best.date) best = { date: b.date, lb: w }
    }
  }
  return best ? best.lb : fallbackLb
}

function trailingMean(body, end) {
  const start = addDays(end, -6)
  const vals = body
    .filter((b) => b.date >= start && b.date <= end && b.weight_lb !== '')
    .map((b) => Number(b.weight_lb))
    .filter(Number.isFinite)
  if (vals.length < MIN_READINGS_PER_WINDOW) return null
  return vals.reduce((a, x) => a + x, 0) / vals.length
}

/** Newest `date` in a set of rows, or null when nothing has ever been written. */
function newestDate(rows) {
  let best = null
  for (const r of rows) {
    if (typeof r?.date === 'string' && r.date && (!best || r.date > best)) best = r.date
  }
  return best
}

/**
 * Every future date written anywhere in the chart's prose, grouped by the date itself.
 *
 * THE MECHANISM, AND WHY IT IS THIS ONE. The obvious design is a register — `data/followups.csv`,
 * a `due_date` column, a row per commitment. It was proposed and it is the wrong shape, for one
 * reason: it only ever contains what somebody remembered to put in it. Every follow-up this chart
 * has lost was lost because it was written down in prose and never transcribed — the probiotic
 * stop-test, the maintenance recalibration, the measurement hold. A register would have needed
 * the same person, in the same session, to remember the same thing twice.
 *
 * So: **the date IS the registration.** Writing "Evaluate ~2026-08-29" in `nutrition/supplements.md`
 * is the act of committing to it, and nothing further is required of the writer. That makes this
 * check retroactive as well as prospective — it found every live commitment in the chart on the
 * day it was written, including ones nobody had connected to each other.
 *
 * The cost is precision: a date in an argument ("three weeks from today is X, inside the trip")
 * is picked up alongside a date in a commitment, because nothing in the text distinguishes them.
 * That trade is deliberate. A false positive costs one line on a card that quotes its own source
 * so it can be dismissed in a second; a false negative is a stop-test that ends uninterpretably
 * because the athlete left the country two days after the date nobody saw.
 *
 * Grouped by date rather than by line: the 2026-08-27 recalibration is written in five places,
 * and five findings for one commitment is how a card stops being read.
 */
function datedFollowUps(chartDocs, today) {
  const ISO = /\d{4}-\d{2}-\d{2}/g
  const byDate = new Map()

  for (const doc of chartDocs) {
    if (!doc?.text) continue
    for (const [i, raw] of doc.text.split('\n').entries()) {
      // Strip markdown furniture so the quote reads as the sentence it is, not as source.
      const line = raw.trim().replace(/^[>\-*#|\s]+/, '').trim()
      const matches = raw.match(ISO)
      if (!matches) continue
      for (const date of new Set(matches)) {
        const inDays = daysBetween(today, date)
        if (!Number.isFinite(inDays) || inDays <= 0 || inDays > FOLLOWUP_HORIZON_DAYS) continue
        const entry = byDate.get(date) ?? { date, inDays, refs: [] }
        entry.refs.push({ path: doc.path, line: i + 1, text: line })
        byDate.set(date, entry)
      }
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// =================================================================================================
// Strength markers vs what is actually prescribed
//
// WHY THIS EXISTS. `goals.md` carries a table of strength markers — a baseline load, a dose, and
// the line the guardrail fires at. That guardrail is the promotion trigger for a whole domain, and
// goals.md says plainly what rests on it: it "is now what stands between Phase 1 and an early exit
// on muscle loss." It can only fire on a set performed **at the marker's load and around its
// dose**, and nothing checked that the block still prescribes one.
//
// It does not. The suitcase-carry marker was re-anchored to 50 lb × 55 s/side on 2026-08-11 and
// fires below 49 s, while the prescription still read 30-40 s/side — so **every compliant set was
// already below the fire line**, and a marker that fires on compliance is not a guardrail, it is
// noise. One of the two prescriptions was corrected on 08-13; the other, written the same day,
// still carries the old dose.
//
// ⚠ THIS REPORTS AND CANNOT DO ANYTHING ELSE, and the reason is the one INVARIANTS.md gives for
// the whole findings layer: the thing it would demand is not the runner's to give. Closing one of
// these means choosing a load or a dose, or re-anchoring a marker — coaching decisions that belong
// to the coach and the athlete, made with an injury history in front of them. A check that cannot
// go green without someone inventing a number is exactly the check that produced the 135/85 BP
// threshold. So: it names the mismatch, it names whose call it is, and it stops. It never proposes
// a number, and no build fails on it.
// =================================================================================================

const stripMd = (s) => String(s ?? '').replace(/\*\*/g, '').replace(/`/g, '').trim()

/** Compare exercise names across two files written by hand. Parentheticals and plurals are noise. */
const exerciseKey = (s) => stripMd(s)
  .toLowerCase()
  .replace(/\(.*?\)/g, ' ')
  .replace(/[^a-z0-9 ]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const sameExercise = (a, b) => {
  const [x, y] = [exerciseKey(a), exerciseKey(b)]
  return x !== '' && (x === y || x === `${y}s` || y === `${x}s`)
}

/** "≤ 49 s/side @ 50 lb" → { qty: 49, unit: 's', loadLb: 50 }. Null when the cell says nothing. */
function parseFireLine(text) {
  const t = stripMd(text)
  const load = /@\s*([\d.]+)\s*lb/i.exec(t)
  const loadLb = load ? Number(load[1]) : null

  // A clock time — the plank marker is written "2:15", not "135 s".
  const clock = /(?:≤|<=)\s*(\d+):(\d{2})/.exec(t)
  if (clock) return { qty: Number(clock[1]) * 60 + Number(clock[2]), unit: 's', loadLb }

  const m = /(?:≤|<=)\s*([\d.]+)\s*(s\b|sec|reps?|\/)/i.exec(t)
  if (!m) return loadLb == null ? null : { qty: null, unit: null, loadLb }
  const unit = /^s\b|^sec/i.test(m[2]) ? 's' : 'reps'
  return { qty: Number(m[1]), unit, loadLb }
}

/**
 * A prescribed dose as a range: "30-40s/side" → { unit: 's', lo: 30, hi: 40 }.
 *
 * Returns null for anything open-ended — `AMRAP`, `easy`, `—`. An AMRAP set can read anywhere, so
 * it can never be "a dose that cannot reach the line", and claiming otherwise would be the check
 * inventing a bound the prescription deliberately does not have.
 */
function parseDose(reps) {
  const t = stripMd(reps).toLowerCase()
  if (!t || t === '—' || /amrap|max|easy|min|as needed/.test(t)) return null
  const secs = /(\d+)\s*(?:-\s*(\d+))?\s*s\b/.exec(t)
  if (secs) return { unit: 's', lo: Number(secs[1]), hi: Number(secs[2] ?? secs[1]) }
  const range = /(\d+)\s*-\s*(\d+)/.exec(t)
  if (range) return { unit: 'reps', lo: Number(range[1]), hi: Number(range[2]) }
  const one = /^(\d+)$/.exec(t)
  if (one) return { unit: 'reps', lo: Number(one[1]), hi: Number(one[1]) }
  return null
}

/** The marker table in goals.md, plus the domain heading it sits under. */
export function parseMarkerTable(goalsText) {
  const lines = String(goalsText ?? '').split('\n')
  const head = lines.findIndex(
    (l) => l.trim().startsWith('|') && /marker/i.test(l) && /fires at/i.test(l),
  )
  if (head < 0) return { domain: null, markers: [] }

  const cells = (l) => l.split('|').slice(1, -1).map(stripMd)
  const cols = cells(lines[head])
  const iName = cols.findIndex((c) => /^marker$/i.test(c))
  const iFires = cols.findIndex((c) => /fires at/i.test(c))
  if (iName < 0 || iFires < 0) return { domain: null, markers: [] }

  // The domain the table serves, read out of the athlete's own heading rather than hardcoded —
  // domain names are per-athlete and naming one in shared code is INVARIANTS.md X-11.
  let domain = null
  for (let i = head; i >= 0 && domain == null; i--) {
    const m = /^##\s*Domain:\s*(.+?)\s*(?:<-.*)?$/.exec(lines[i])
    if (m) domain = m[1].trim()
  }

  const markers = []
  for (let i = head + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('|')) break
    if (/^\|[\s:|-]+\|$/.test(line)) continue
    const c = cells(line)
    const name = c[iName]
    if (!name) continue
    markers.push({ name, firesText: c[iFires] ?? '', fires: parseFireLine(c[iFires] ?? '') })
  }
  return { domain, markers }
}

/**
 * Every marker in goals.md against the prescriptions the current block actually schedules.
 *
 * "Live" means the newest set, on or before today, for a session the weekly template can land on.
 * A session the block no longer schedules is not a live prescription however recent its rows are —
 * that is precisely the goblet-squat case: it is still written under `Session A`, and `Session A`
 * was replaced by `Session A (knee-free)` when the knee came out of the plan.
 */
export function markerAudit({ goalsText = '', prescriptions = [], templateSessions = [], today }) {
  const { domain, markers } = parseMarkerTable(goalsText)
  if (!markers.length) return { domain, markers: [], problems: [] }

  // Imported, not restated (W6). "Live" had two implementations here and in check-suspensions.mjs,
  // and two definitions of live is two answers to "is that prescription in force" — which is the
  // question both files exist to answer.
  const live = livePrescriptions({ prescriptions, sessions: templateSessions, today })

  const problems = []
  for (const marker of markers) {
    const rows = live.filter((r) => sameExercise(marker.name, r.exercise))
    if (!rows.length) {
      problems.push({
        marker: marker.name,
        session: null,
        kind: 'unprescribed',
        message: `${marker.name} — nothing the block currently schedules prescribes it, so the `
          + `marker (fires at ${marker.firesText}) cannot be read at all.`,
      })
      continue
    }
    for (const r of rows) {
      const load = String(r.load ?? '')
      if (marker.fires?.loadLb != null
          && !new RegExp(`(^|[^\\d.])${marker.fires.loadLb}([^\\d.]|$)`).test(load)) {
        problems.push({
          marker: marker.name,
          session: r.session,
          kind: 'load',
          message: `${marker.name} — "${r.session}" prescribes it at ${load || 'BW'}, and the `
            + `marker is baselined at ${marker.fires.loadLb} lb (${marker.firesText}). A set at a `
            + `different load is not a reading of this marker.`,
        })
      }
      const dose = parseDose(r.reps)
      if (marker.fires?.qty != null && dose && dose.unit === marker.fires.unit
          && dose.hi <= marker.fires.qty) {
        problems.push({
          marker: marker.name,
          session: r.session,
          kind: 'dose',
          message: `${marker.name} — "${r.session}" prescribes ${r.sets} × ${r.reps}, topping out `
            + `at ${dose.hi}${dose.unit === 's' ? ' s' : ' reps'}, at or below the marker's fire `
            + `line (${marker.firesText}). Nothing performed as prescribed can read above that `
            + `line, so the marker cannot tell compliance from decline.`,
        })
      }
    }
  }
  return { domain, markers, problems }
}

export function buildFindings({
  constants, targets = [], body = [], steps = [], goalsText = '', chartDocs = [],
  prescriptions = [], energy = [], today,
}) {
  const found = []
  const add = (f) => found.push(f)

  const plan = constants?.plan ?? {}
  const baseline = constants?.baseline ?? {}

  /**
   * The `goals.md` domain heading a finding belongs under, read out of the chart.
   *
   * ⚠ THESE WERE STRING LITERALS — fourteen of them, spelling out one athlete's domain headings
   * inside shared code (INVARIANTS.md X-11, audit F-34). A chart whose domains are symptom control
   * and sleep got findings filed under "Physical appearance". There is deliberately **no default**:
   * a chart that has not named its domains gets findings with no domain label, which is honest,
   * where a default would be another athlete's domain wearing this one's name.
   *
   * `Chart integrity` is not in here on purpose. It is not a domain of the athlete's at all — it is
   * the maintainer's bucket for "the system itself is broken", and it is the same on every chart.
   */
  const domainOf = (role) => constants?.domains?.[role] ?? undefined
  const APPEARANCE = domainOf('energyDeficit')
  const HEALTH = domainOf('health')

  // Every energy finding is gated on the chart actually running a deficit. A chart whose domains
  // are symptom control and sleep has no calorie target, and telling it one is too low would be a
  // chore invented for that athlete (CLAUDE.md §1.1).
  const runningDeficit = Array.isArray(plan.targetRateLbPerWk) && plan.targetRateLbPerWk.some((r) => r > 0)

  // --- §5.2 · no calorie target below estimated RMR ---------------------------------------------
  // Reported against the newest target only. Older rows are history: the coach cannot un-prescribe
  // last Tuesday, and a list of every past breach is noise, not a finding.
  if (runningDeficit && targets.length) {
    const newest = [...targets].sort((a, b) => a.date.localeCompare(b.date)).pop()
    const kcal = Number(newest.kcal)
    const w = weightAsOf(body, newest.date, baseline.weightLb)
    if (Number.isFinite(kcal) && Number.isFinite(w)) {
      const floor = rmrFloorKcal(w, newest.date)
      const headroom = kcal - floor
      if (headroom < 0) {
        add({
          id: 'rmr-floor-breached',
          severity: 'critical',
          headline: `Calorie target ${kcal} is ${-headroom} kcal BELOW the estimated RMR floor of ${floor}.`,
          detail: `At ${w} lb on ${newest.date}. CLAUDE.md §5.2 makes this a floor the coach holds `
            + `even against explicit instruction.`,
          action: 'Raise the target, or record in decisions.md why this day is a deliberate '
            + 'exception (a fast, a medical prep) and what returns it to normal.',
          source: 'CLAUDE.md §5.2',
          domain: APPEARANCE,
        })
      } else if (headroom < 150) {
        add({
          id: 'rmr-floor-close',
          severity: 'attention',
          headline: `Calorie target is ${headroom} kcal above the RMR floor (${kcal} vs ${floor}).`,
          detail: `The floor is recomputed from current weight, so it moves as he does. Any further `
            + `cut needs to be checked against it first.`,
          action: 'Do not lower the target without recomputing the floor at that day\'s weight.',
          source: 'CLAUDE.md §5.2',
          domain: APPEARANCE,
        })
      }
    }
  }

  // --- §5.2 · protein is never cut to make other numbers fit ------------------------------------
  const proteinFloor = Number(plan.proteinFloorG)
  if (Number.isFinite(proteinFloor) && targets.length) {
    const newest = [...targets].sort((a, b) => a.date.localeCompare(b.date)).pop()
    const p = Number(newest.protein_g)
    if (Number.isFinite(p) && p < proteinFloor) {
      add({
        id: 'protein-floor-breached',
        severity: 'critical',
        headline: `Protein target ${p} g is below the floor of ${proteinFloor} g.`,
        detail: `§5.2: "Protein is never cut to make other numbers fit — cut fat or carbohydrate."`,
        action: 'Restore protein and take the calories out of fat or carbohydrate instead.',
        source: 'CLAUDE.md §5.2',
        domain: APPEARANCE,
      })
    }
  }

  // --- §5.2 · sustained loss rate ---------------------------------------------------------------
  // An OBSERVATION. He weighed what he weighed. This can only ever inform — which is why it moved
  // out of the validator: erroring here meant a fast week froze the dashboard.
  const maxRate = Number(plan.maxRatePctBwPerWk)
  if (runningDeficit && Number.isFinite(maxRate) && maxRate > 0 && body.length) {
    const latest = body.filter((b) => b.weight_lb !== '').map((b) => b.date).sort().pop()
    if (latest) {
      const recent = trailingMean(body, latest)
      const prior = trailingMean(body, addDays(latest, -7))
      if (recent != null && prior != null && prior > 0) {
        const pctPerWk = ((prior - recent) / prior) * 100
        if (pctPerWk > maxRate) {
          add({
            id: 'loss-rate-above-ceiling',
            severity: 'critical',
            headline: `Weight is falling at ${pctPerWk.toFixed(2)}%/wk, above the ${maxRate}%/wk ceiling.`,
            detail: `7-day mean ${prior.toFixed(1)} lb -> ${recent.toFixed(1)} lb. Measured, not `
              + `predicted. Fast loss in a deficit costs lean mass.`,
            action: 'Raise the calorie target. Do not wait for it to self-correct.',
            source: 'CLAUDE.md §5.2',
            domain: APPEARANCE,
          })
        }
      }
    }
  }

  // --- §5.2 · deficit phase length --------------------------------------------------------------
  // Elapsed time. Nothing can be edited to "fix" this; it is a prompt for a decision.
  if (runningDeficit && baseline.date && today) {
    const weeks = daysBetween(baseline.date, today) / 7
    if (weeks > MAX_DEFICIT_WEEKS) {
      add({
        id: 'deficit-phase-over-cap',
        severity: 'critical',
        headline: `The deficit has run ${weeks.toFixed(1)} weeks, past the ${MAX_DEFICIT_WEEKS}-week cap.`,
        detail: `Phase opened ${baseline.date}. §5.2 caps a deficit block without a planned `
          + `maintenance break.`,
        action: 'Schedule the maintenance break and re-baseline, or record why the phase is still open.',
        source: 'CLAUDE.md §5.2',
        domain: APPEARANCE,
      })
    } else if (weeks > DEFICIT_WARN_WEEKS) {
      add({
        id: 'deficit-phase-approaching-cap',
        severity: 'attention',
        headline: `Deficit is ${weeks.toFixed(1)} weeks old; the cap is ${MAX_DEFICIT_WEEKS} weeks.`,
        detail: 'Better planned now than discovered at the cap.',
        action: 'Put the maintenance break on the calendar.',
        source: 'CLAUDE.md §5.2',
        domain: APPEARANCE,
      })
    }
  }

  // --- the calorie budget and the rate goal are different numbers -------------------------------
  //
  // NOT A VIOLATION, AND THE WORDING HAS TO CARRY THAT. On 2026-08-14 the athlete's own rate went
  // on record — "1 lb per week is my goal. More is great. Anything over .5 lb is acceptable. I am
  // not striving for perfection." — replacing a [1.1, 1.25] band the coach had set 10-25% above
  // his stated rate and never put back to him. The calorie budget was built for the old band and
  // still implies a faster rate than the goal it now serves.
  //
  // So this is a mismatch between two of the coach's own artifacts, not something the athlete is
  // doing wrong, and it is well under the §5.2 ceiling (which has its own finding above). It
  // exists because decisions.md 2026-08-14 deliberately refused to reconcile it silently: moving
  // his calories is a nutrition decision, not a bookkeeping fix, and the plan quietly targeting a
  // number different from the goal is exactly the drift a provenance marker cannot catch.
  //
  // Every figure is computed. Hardcoding "1.20" here would recreate the defect in the check
  // written to report it.
  //
  // ⚠ **CORRECTED 2026-08-15: THE BURN SIDE IS THE ATHLETE'S OWN LEDGER, NOT `estMaintenanceKcal`.**
  // This finding read "built for 1.20 lb/wk" for a week, and 1.20 was wrong in the direction that
  // makes it look safe. `plan.estMaintenanceKcal` is `RMR × 1.5` — 2,450 on this chart — and
  // `data/METHOD.md` forbids in bold comparing it with the decomposed burn model, which is what
  // every `energy.csv` row is: W5 took it off the shared axis for exactly this reason (audit F-57,
  // ~2,618 kcal/week of structural gap). Against the observed figure the same budget implies
  // **1.76 lb/wk**, which is a different conversation — 0.98% of bodyweight, essentially at the
  // §5.2 ceiling, rather than comfortably under it.
  //
  // The estimate remains the FALLBACK for a chart with too few complete days, and where it is used
  // the finding says so in its own text. A finding that silently switched inputs would be worse
  // than either one.
  const observed = observedDailyBurn(energy)
  const maintenance = Number(plan.estMaintenanceKcal)
  const dailyBurn = observed?.meanKcal ?? maintenance
  const burnFromLedger = observed?.meanKcal != null
  const weeklyBudget = Number(plan.weeklyKcalBudget)
  const rates = Array.isArray(plan.targetRateLbPerWk)
    ? plan.targetRateLbPerWk.map(Number).filter(Number.isFinite)
    : []
  if (runningDeficit && rates.length && Number.isFinite(dailyBurn) && Number.isFinite(weeklyBudget)) {
    // [acceptable floor, goal] — see constants.json's provenance note. Read order-independently
    // so a chart that still writes it as a corridor is not silently misread.
    const goal = Math.max(...rates)
    const acceptable = Math.min(...rates)
    const weeklyBurn = dailyBurn * 7
    const weeklyGap = weeklyBurn - weeklyBudget
    const implied = weeklyGap / KCAL_PER_LB_FAT
    const r2 = (v) => Math.round(v * 100) / 100
    // Stated to two decimals everywhere, so "1.20 vs 1.00" reads as two numbers rather than as
    // "1.2 vs 1", which looks like a rounding artefact rather than a real 0.2 lb/wk difference.
    const rate = (v) => v.toFixed(2)

    // Compared at the precision the numbers are stated to, which is also the precision they are
    // rendered at. That is a display rule, not a tolerance invented to keep the check quiet.
    const above = r2(implied) > r2(goal)
    const below = r2(implied) < r2(acceptable)

    if (above || below) {
      const line = above ? goal : acceptable
      const matchingBudget = Math.round(weeklyBurn - line * KCAL_PER_LB_FAT)
      const deltaWeekly = matchingBudget - weeklyBudget
      const deltaDaily = Math.round(deltaWeekly / 7)
      const move = deltaWeekly > 0 ? 'raise' : 'lower'
      const quote = markerFor(constants, 'plan', 'targetRateLbPerWk')?.quote

      // WHERE THE BURN FIGURE CAME FROM, in the finding's own words. A finding that quietly
      // switched inputs would be worse than either input — the coach would have no way to tell
      // which conversation the number belongs to.
      const basis = burnFromLedger
        ? `Observed mean daily burn ${Math.round(dailyBurn).toLocaleString()} kcal over `
          + `${observed.days} complete days in data/energy.csv (${observed.from} to ${observed.to})`
        : `plan.estMaintenanceKcal ${Math.round(dailyBurn).toLocaleString()} kcal/day — a FALLBACK, `
          + `used because the ledger has fewer than ${MIN_DAYS_FOR_OBSERVED_BURN} complete days. It `
          + `is RMR × 1.5, which data/METHOD.md forbids putting on the same axis as the decomposed `
          + `burn model; treat this rate as indicative until the ledger can answer`

      // §5.2 is a percentage of bodyweight, so the pounds figure alone cannot say whether the plan
      // is near the ceiling. Both numbers, no band, no verdict — the reading is the coach's.
      const w = weightAsOf(body, today ?? '', baseline.weightLb)
      const ceiling = Number(plan.maxRatePctBwPerWk)
      const pctLine = Number.isFinite(w) && w > 0 && Number.isFinite(ceiling)
        ? ` At ${w} lb that is ${((implied / w) * 100).toFixed(2)}% of bodyweight per week, against `
          + `the ${ceiling}%/wk §5.2 ceiling.`
        : ''

      add({
        id: above ? 'budget-implies-faster-than-goal' : 'budget-implies-slower-than-acceptable',
        severity: 'attention',
        headline: above
          ? `The calorie budget is built for ${rate(implied)} lb/wk${burnFromLedger ? ' against your observed burn' : ''}. The goal on file is ${rate(goal)} lb/wk.`
          : `The calorie budget is built for ${rate(implied)} lb/wk, below the ${rate(acceptable)} lb/wk that counts as working.`,
        detail: `${basis} × 7 = ${Math.round(weeklyBurn).toLocaleString()} kcal, − the weekly `
          + `budget ${weeklyBudget.toLocaleString()} kcal = ${Math.round(weeklyGap).toLocaleString()} `
          + `kcal/wk, which is ${rate(implied)} lb/wk at `
          + `${KCAL_PER_LB_FAT.toLocaleString()} kcal per lb.${pctLine} `
          + 'This is the rate the plan is AIMED at, not the rate being achieved — the weight trend '
          + 'is measured separately and has its own finding. '
          + (above
            ? 'Faster than the goal is not a breach of anything: the rate on file has no upper '
              + 'bound and he has said so. '
            : '')
          + 'It is worth saying only because the plan and the goal it serves are now visibly '
          + 'different numbers, and neither one is wrong.'
          + (quote ? ` His words on the goal: "${quote}"` : ''),
        action: `Two options, and it is his call. Either ${move} the weekly budget by `
          + `${Math.abs(deltaWeekly).toLocaleString()} kcal (~${Math.abs(deltaDaily)} kcal/day, to `
          + `${matchingBudget.toLocaleString()}/wk) so the plan is aimed at ${rate(line)} lb/wk, or `
          + 'keep the budget as it stands and record in decisions.md that the plan runs ahead of '
          + 'the goal deliberately. Do not change it on this finding alone — a calorie change is a '
          + 'nutrition decision, and nutrition/plan.md is closed to changes until its own review date.',
        source: burnFromLedger
          ? 'data/energy.csv (observed burn); athlete/constants.json plan.weeklyKcalBudget, '
            + 'plan.targetRateLbPerWk, plan.maxRatePctBwPerWk; decisions.md 2026-08-14, 2026-08-15'
          : 'athlete/constants.json plan.weeklyKcalBudget, plan.estMaintenanceKcal, '
            + 'plan.targetRateLbPerWk; decisions.md 2026-08-14',
        // The same label the other energy findings use. It is an athlete's own domain name living
        // in shared code, which is INVARIANTS.md X-11 and is tracked as W7 — using a different
        // string here would fix nothing and split one class of finding across two labels.
        domain: APPEARANCE,
      })
    }
  }

  // --- workflow health, read from what each workflow actually produced ---------------------------
  // See WORKFLOW_FEEDS above for why this reads the artifact rather than a self-reported status.
  {
    const rowsFor = { 'data/steps.csv': steps, 'data/targets.csv': targets }

    for (const feed of WORKFLOW_FEEDS) {
      if (!today) continue
      // A feed nobody declared is not a feed that broke. `declaredBy` names the constants key that
      // says this chart HAS this automation; an entry without one is unconditional.
      if (feed.declaredBy && !String(constants?.plan?.[feed.declaredBy] ?? '').trim()) continue
      const newest = newestDate(rowsFor[feed.file] ?? [])

      /**
       * ⚠ **A DECLARED FEED THAT HAS NEVER WRITTEN A ROW IS NOW REPORTED, AND THE DECLARATION IS
       * WHAT MADE THAT POSSIBLE.** This case used to be skipped outright, with a comment saying it
       * was "indistinguishable from a feed this chart does not use — nothing in data/ says whether
       * the athlete ever wired up the phone automation". That was true and is no longer: the chart
       * now says so, in `plan.stepFeed`, and the guard above has already sent every undeclared feed
       * home. What is left is an automation the athlete believes they set up which has produced
       * nothing at all — the worst-timed failure there is, because it is silent on day one, when
       * nobody yet knows what a working day looks like.
       *
       * ⚠ **AND ONLY WHERE THERE IS A DECLARATION TO READ.** An entry with no `declaredBy` — the
       * daily target rollover, which ships with the template and is not opt-in — is back in the
       * indistinguishable case, and is skipped exactly as before: a chart whose targets file is
       * still empty is a chart on its first morning, not a broken workflow. The declaration is
       * what made the steps case reportable, so the declaration is what gates the report.
       */
      if (!newest && !feed.declaredBy) continue
      if (!newest) {
        add({
          id: `workflow-never-${feed.file.replace(/[^a-z0-9]+/gi, '-')}`,
          severity: 'attention',
          headline: `${feed.file} is empty, but this chart declares the feed that writes it.`,
          detail: `athlete/constants.json declares plan.${feed.declaredBy}, so ${feed.what} is `
            + `expected to arrive — and ${feed.file} has never held a single row. ${feed.workflow} `
            + `is what writes it. Either the automation was never finished, or it has failed every `
            + `time it ran. ${feed.consequence}`,
          action: 'Either finish wiring up the automation, or clear the declaration so nothing '
            + 'here expects it — SETUP.md describes both configurations and neither is the lesser '
            + 'one. Do not leave it declared and empty: that is the one state where the chart says '
            + 'a number is arriving and none is.',
          source: `${feed.file}; ${feed.workflow}; athlete/constants.json plan.${feed.declaredBy}`,
        })
        continue
      }

      const silentFor = daysBetween(newest, today)
      if (!Number.isFinite(silentFor) || silentFor <= feed.staleAfterDays) continue

      add({
        id: `workflow-stale-${feed.file.replace(/[^a-z0-9]+/gi, '-')}`,
        severity: 'attention',
        headline: `${feed.file} has had nothing new for ${silentFor} days — ${feed.what} has stopped arriving.`,
        detail: `${feed.workflow} is what writes it, and the newest row is dated ${newest}. Nothing `
          + `here proves the workflow itself failed — a disabled workflow, an expired token, a phone `
          + `automation that stopped firing and a green run that wrote nothing all look identical `
          + `from inside the repo, and all of them mean the same thing: the data is not arriving. `
          + `${feed.consequence}`,
        action: 'Check the run history for that workflow in the Actions tab, and the device or '
          + 'schedule that triggers it. Backfilling the missing rows is a separate job from fixing '
          + 'the feed — do the feed first, or the gap reopens tomorrow.',
        source: `${feed.workflow}; ${feed.file}`,
        // Not a coaching domain: this is the chart failing to record, which is upstream of every
        // domain rather than serving one. Same reasoning as the provenance finding below.
        domain: 'Chart integrity',
      })
    }
  }

  // --- a completed day whose step total looks like a partial reading ----------------------------
  // Audit F-06, on its fourth occurrence. `log-steps-row.mjs` now refuses a same-day payload, which
  // is the class fix — it makes the partial unwritable rather than merely detectable. This is the
  // backstop for everything that does not come through that path: a hand-written backfill, a row
  // that predates the rejection, a phone that reported a fraction of a finished day.
  //
  // IT REPORTS AND CANNOT DO ANYTHING ELSE, and the reason is the boundary itself. The only thing
  // that closes it is the athlete saying "yes, that was a real day" or "no, re-read the phone" —
  // a fact only he holds. A check that cannot go green without its runner inventing something is
  // the check that produced the 135/85 blood-pressure threshold (INVARIANTS.md X-12).
  if (today && steps.length) {
    const from = addDays(today, -STEPS_PLAUSIBILITY_WINDOW_DAYS)
    const suspect = steps
      .filter((r) => r.date >= from && r.date < today && r.steps !== '' && r.steps != null)
      .filter((r) => Number.isFinite(Number(r.steps)) && Number(r.steps) < IMPLAUSIBLE_STEPS)
      .sort((a, b) => a.date.localeCompare(b.date))

    if (suspect.length) {
      add({
        // One finding listing every date, not one per date: three findings for one broken feed is
        // how a card stops being read.
        id: 'steps-implausible',
        severity: 'attention',
        headline: `${suspect.length === 1 ? 'A completed day' : `${suspect.length} completed days`} `
          + `${suspect.length === 1 ? 'has' : 'have'} under ${IMPLAUSIBLE_STEPS.toLocaleString()} steps on file: `
          + `${suspect.map((r) => `${r.date} = ${Number(r.steps).toLocaleString()}`).join(', ')}.`,
        detail: 'The step feed sometimes reports the running total instead of the completed one, '
          + 'and a partial written as a total flips the day to complete and understates its burn by '
          + `roughly 400 kcal — in the file every rate-of-loss projection is built on. It has `
          + 'happened four times (2026-08-09 = 29, 2026-08-10 = 466, 2026-08-13 = 16). A genuinely '
          + 'small day is also perfectly possible, which is exactly why nothing here decides.',
        action: 'Ask him which it was, and only then correct the row. Do not adjust it on this '
          + 'finding alone — a step count nobody confirmed is a number invented to make a check go '
          + 'quiet, and the true figure is on his phone.',
        source: 'data/steps.csv; scripts/log-steps-row.mjs',
        domain: 'Chart integrity',
      })
    }
  }

  // --- goals.md triggers, evaluated against current data ----------------------------------------
  // CLAUDE.md §1: "At the start of every session, evaluate the promotion and demotion triggers in
  // goals.md against the current data. If a trigger has fired, say so before anything else... A
  // trigger that fired three weeks ago and went unnoticed is a system failure." Until this ran,
  // that depended entirely on a session remembering to do it by hand.
  //
  // A FIRED TRIGGER IS STILL ONLY SOMETHING THE COACH SAYS. Crossing the weight floor does not
  // stop anything, refuse anything, or change any target. It produces a sentence: "you are below
  // the floor you set — should we reassess?" The floor is the athlete's own, and so is the answer.
  //
  // Read from constants.triggers, which is the machine-readable mirror of goals.md. goals.md is
  // authoritative; if they disagree, goals.md wins and the mirror is the bug.
  const trig = constants?.triggers ?? {}

  // §6: "Trend over point. Never react to a single weigh-in." A crossing is reported off the
  // 7-day mean where there are enough readings; a single reading across the line is surfaced one
  // step softer, so it is early warning rather than a false alarm.
  const weighed = body.filter((b) => b.weight_lb !== '')
  const latestDate = weighed.map((b) => b.date).sort().pop()
  if (latestDate) {
    const mean = trailingMean(body, latestDate)
    const latest = Number(weighed.find((b) => b.date === latestDate)?.weight_lb)
    const basis = mean != null
      ? { value: mean, label: `7-day mean ${mean.toFixed(1)} lb`, firm: true }
      : { value: latest, label: `latest reading ${latest} lb`, firm: false }

    const crossings = [
      {
        key: 'weight-below-floor',
        severity: 'critical',
        hit: (v) => Number.isFinite(trig.weightFloorLb) && v < trig.weightFloorLb,
        line: trig.weightFloorLb,
        headline: (b) => `${b.label} is below the ${trig.weightFloorLb} lb floor.`,
        detail: 'goals.md makes this a Health promotion trigger: Health goes to #1 and the '
          + 'deficit stops, regardless of where the waist is.',
        action: 'Say so before anything else in the session, then ask whether to reassess the '
          + 'goals — hold the waist target and move the floor, or stop the deficit here. It is '
          + 'his floor and his call; nothing is enforced either way.',
        domain: HEALTH,
      },
      {
        key: 'weight-above-ceiling',
        severity: 'critical',
        hit: (v) => Number.isFinite(trig.weightCeilingLb) && v > trig.weightCeilingLb,
        line: trig.weightCeilingLb,
        headline: (b) => `${b.label} is above the ${trig.weightCeilingLb} lb ceiling.`,
        detail: 'goals.md makes this a Health promotion trigger — a return-to-start signal.',
        action: 'Raise it and ask what changed before adjusting anything.',
        domain: HEALTH,
      },
      {
        key: 'weight-at-checkpoint',
        severity: 'attention',
        hit: (v) => Number.isFinite(trig.weightCheckpointLb) && v <= trig.weightCheckpointLb
          && !(Number.isFinite(trig.weightFloorLb) && v < trig.weightFloorLb),
        line: trig.weightCheckpointLb,
        headline: (b) => `${b.label} is at or past the ${trig.weightCheckpointLb} lb review checkpoint.`,
        detail: 'Demoted from an end condition to a REVIEW CHECKPOINT on 2026-08-11. It does not '
          + 'end Phase 1 on its own.',
        action: 'Stop, put the numbers on the table, and decide explicitly. Do not let it pass '
          + 'unremarked, and do not treat it as the phase ending.',
        domain: APPEARANCE,
      },
    ]

    for (const c of crossings) {
      if (!c.hit(basis.value)) continue
      // Severity is what the trigger MEANS — a Health promotion is critical, a review checkpoint
      // is not. Measurement confidence is a separate axis: a single reading across the line is
      // reported one step softer than the same crossing confirmed on a 7-day mean.
      const soften = (sev) => (sev === 'critical' ? 'attention' : 'info')
      add({
        id: basis.firm ? c.key : `${c.key}-single-reading`,
        severity: basis.firm ? c.severity : soften(c.severity),
        headline: c.headline(basis),
        detail: basis.firm
          ? c.detail
          : `${c.detail} Based on a single reading — there are not yet enough weigh-ins for a `
            + `7-day mean, so treat this as early warning, not a fired trigger (§6: trend over point).`,
        action: c.action,
        source: 'athlete/goals.md',
        domain: c.domain,
      })
    }
  }

  // --- a target column that is measured against and never set ------------------------------------
  //
  // `targets.csv` carries an `alcohol_kcal` column. `meals.csv` carries one too, and it is filled
  // in — 330 on 08-07, 392 the same day against it, 600 on another. The target side has been blank
  // on every row ever written, because `generate-targets.mjs` has nothing to write there: there is
  // no `plan.weeklyAlcoholKcalBudget` and **W6 deliberately did not invent one.**
  //
  // WHY IT IS A FINDING AND NOT A CONSTANT. `nutrition/plan.md` prices alcohol at ~1,200–1,400
  // kcal/week and calls it his single largest discretionary lever, and it is tempting to read that
  // as the budget. Read the sentence: *"priced at his REAL intake, not a wishful number"*, computed
  // off `athlete/values.md`'s athlete-stated ~7–9 glasses in a typical week. **That is an
  // observation of what he drinks, not a line he agreed to hold.** Promoting it to a target would
  // record a coach's inference as the athlete's own instruction, which is X-16's defect exactly —
  // the same shape as the 185 lb ceiling, in a different unit and with better justification, which
  // makes it harder to catch rather than easier (red-team, item 3).
  //
  // So the data half ships and the denominator waits: the figure is recorded, the week's total is
  // rendered on History, and the gap is reported here as **his to close**. An absent budget renders
  // as TBD, and a TBD is a correct chart.
  if (runningDeficit && targets.length) {
    const budget = plan.weeklyAlcoholKcalBudget
    const withFigure = targets.filter((t) => String(t.alcohol_kcal ?? '').trim() !== '')
    // Gated on the chart having ALREADY set one by hand at least once. That is the evidence this
    // chart wants a figure in that column, and it is what makes the finding a fact about this
    // chart rather than a chore invented for every athlete (CLAUDE.md §1.1) — one whose domains
    // are symptom control and sleep never sets an alcohol target and never hears about it.
    if (budget == null && withFigure.length) {
      add({
        id: 'alcohol-budget-unset',
        severity: 'info',
        headline: 'Alcohol gets a daily target only on days a session hand-wrote one — '
          + `${withFigure.length} of ${targets.length} so far.`,
        detail: `No plan.weeklyAlcoholKcalBudget exists, so scripts/generate-targets.mjs writes a `
          + `blank alcohol_kcal on every automated row and the Today meter has no line to draw. `
          + `Days with a figure: ${withFigure.map((t) => t.date).join(', ')}. nutrition/plan.md `
          + 'prices a typical week at ~1,200–1,400 kcal and states the exchange rate — ~0.35 '
          + 'lb/week of loss forgone — but that figure is an OBSERVATION of what he already '
          + 'drinks, taken off athlete/values.md. It is not a budget he agreed to.',
        action: 'Ask him whether he wants a line here, and if so what it is. **Do not pick one.** '
          + 'His own words are on file — "if not for the fitness goals, I\'d open a bottle every '
          + 'night" — so this is a value he is already spending willpower on, not a number to '
          + 'optimise on his behalf. If he sets one, record it with his quote and its provenance; '
          + 'if he does not want one, record that too and this stops. A per-day allocation can '
          + 'then be written into targets.csv and the Today meter draws itself.',
        source: 'nutrition/plan.md "Alcohol"; athlete/values.md "Wine — non-negotiable"; '
          + 'data/targets.csv alcohol_kcal',
        domain: APPEARANCE,
      })
    }
  }

  // The Phase 1 goal being MET is a trigger too, and the pleasant ones go unnoticed just as
  // easily as the alarming ones.
  const waisted = body.filter((b) => b.waist_in !== '')
  const latestWaist = Number(waisted.map((b) => b.waist_in).at(-1))
  if (Number.isFinite(trig.waistTriggerIn) && Number.isFinite(latestWaist)
      && latestWaist <= trig.waistTriggerIn) {
    add({
      id: 'waist-goal-met',
      severity: 'attention',
      headline: `Waist is ${latestWaist}" — at or past the ${trig.waistTriggerIn}" Phase 1 goal.`,
      detail: `This is the demotion trigger for the ${APPEARANCE ?? 'domain this phase serves'}`
        + ' — the goal the athlete actually named, in their own words.',
      action: 'Say it plainly, confirm it against a second morning-protocol reading, then propose '
        + 'the phase change rather than continuing on momentum.',
      source: 'athlete/goals.md',
      domain: APPEARANCE,
    })
  }

  // --- a trigger that cannot fire ---------------------------------------------------------------
  // Reported, never filled in. Setting a threshold is a goal-setting act that belongs to the
  // athlete and his doctor — on 2026-08-13 this check was written as a build failure and the
  // coach then invented a BP number to make its own check go green. That is the tail wagging the
  // dog, and it is exactly why this layer only reports.
  if (goalsText) {
    const BLANK = /(?<![\w_])_{3,}(?![\w_])/
    const isTriggerLine = (l) => /^[-*|]/.test(l)
    const stripQuoted = (l) => l.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''")

    for (const [i, raw] of goalsText.split('\n').entries()) {
      const line = raw.trim()
      if (!isTriggerLine(line) || !BLANK.test(stripQuoted(line))) continue
      add({
        id: `blank-trigger-line-${i + 1}`,
        severity: 'attention',
        headline: 'A promotion trigger has an unfilled threshold, so it can never fire.',
        detail: `athlete/goals.md line ${i + 1}: "${line.slice(0, 100)}"`,
        action: 'Ask the athlete for the number, or route it to whoever owns it — for a clinical '
          + 'threshold that is his doctor, not the coach. Do not invent one to close the gap.',
        source: 'athlete/goals.md',
        domain: HEALTH,
      })
    }
  }

  // --- a guardrail that cannot read the thing it guards -----------------------------------------
  // See markerAudit() above. One finding, not one per marker: five or six lines about the same
  // table is how a card stops being read, and they are one conversation, not six.
  {
    const templateSessions = Object.values(constants?.program?.weeklyTemplate ?? {})
      .map((day) => day?.session)
      .filter(Boolean)
    const audit = markerAudit({ goalsText, prescriptions, templateSessions, today })
    if (audit.problems.length) {
      const markersHit = new Set(audit.problems.map((p) => p.marker)).size
      add({
        id: 'strength-markers-unreadable',
        severity: 'attention',
        headline: `${markersHit} of ${audit.markers.length} strength markers cannot be read `
          + `against what the block currently prescribes.`,
        detail: audit.problems.map((p) => `• ${p.message}`).join(' '),
        action: 'Every one of these closes by changing a load, a dose, or a marker — decisions '
          + 'that belong to the coach and the athlete with the injury history in front of them, '
          + 'not to this check. Take them one at a time and record each in decisions.md. Do not '
          + 'pick a number to make this quiet: a marker moved to fit the prescription measures '
          + 'nothing, and a load raised to fit the marker is how a knee gets loaded to satisfy a '
          + 'spreadsheet.',
        source: 'athlete/goals.md strength marker table; data/prescriptions.csv; '
          + 'athlete/constants.json program.weeklyTemplate',
        // The domain is read out of the heading the table sits under in the athlete's own goals
        // file, never hardcoded — domain names are per-athlete (INVARIANTS.md X-11).
        domain: audit.domain ?? 'Chart integrity',
      })
    }
  }

  // --- dated commitments coming up --------------------------------------------------------------
  // The mechanism, and why it is a prose scan rather than a register, is documented on
  // datedFollowUps() above. The short version: the date somebody wrote down IS the registration,
  // so nothing depends on a session remembering to transcribe it a second time.
  if (today && chartDocs.length) {
    for (const f of datedFollowUps(chartDocs, today)) {
      const [first, ...rest] = f.refs
      const quoted = first.text.length > FOLLOWUP_QUOTE_CHARS
        ? `${first.text.slice(0, FOLLOWUP_QUOTE_CHARS)}…`
        : first.text
      const elsewhere = [...new Set(rest.map((r) => r.path))].filter((p) => p !== first.path)

      add({
        id: `follow-up-${f.date}`,
        severity: f.inDays <= FOLLOWUP_SOON_DAYS ? 'attention' : 'info',
        headline: `Something in the chart is dated ${f.date} — ${f.inDays} day${f.inDays === 1 ? '' : 's'} away.`,
        detail: `${first.path}:${first.line} — "${quoted}"`
          + (rest.length
            ? ` Also written at ${rest.length} other point${rest.length === 1 ? '' : 's'} in the chart`
              + (elsewhere.length ? ` (${elsewhere.join(', ')}).` : ' (same file).')
            : ''),
        action: 'Read the line and decide whether it still stands. A date the chart is holding is '
          + 'either a commitment to keep, or one to supersede in decisions.md with the reason — it '
          + 'is not something to let pass unremarked, which is how a stop-test ends up '
          + 'uninterpretable. Nothing here is automatic: this check found a date, not a meaning.',
        source: `${first.path}:${first.line}`,
        // A date in prose carries no machine-readable domain, and guessing one from the file it
        // sits in would be exactly the invention this repo keeps paying for. The quoted line says
        // what it serves, in the words it was written in.
        domain: 'Chart integrity',
      })
    }
  }

  // --- a number the coach produced that he has never ruled on -----------------------------------
  // The same failure as the blank trigger above, one step further along: there, a decision the
  // athlete owns was left empty and the coach filled it in; here, a decision he owns was filled in
  // by the coach and never handed back. Both end with his goals file holding something he did not
  // say. On 2026-08-13 that was a 185 lb weight ceiling, and his words were "I don't know what
  // that is or where it came from... if I get close to it, I will throw this whole system away and
  // call it a failure."
  //
  // THIS REPORTS AND CANNOT DO ANYTHING ELSE. It is not fixable by editing the record — the only
  // thing that closes it is him saying something — so per INVARIANTS.md ("What each layer is for")
  // it can never be a validator error. It also must never instruct him: the finding says whose
  // decision it is and stops. A coach that tells the athlete what his own goal should be is the
  // defect, not the fix.
  //
  // The grace period and why it is inclusive: see UNCONFIRMED_GRACE_DAYS in provenance.mjs.
  if (today) {
    for (const v of unconfirmedValues(constants)) {
      if (!v.asOf) continue
      const age = daysBetween(v.asOf, today)
      if (age < UNCONFIRMED_GRACE_DAYS) continue
      add({
        id: `provenance-unconfirmed-${v.section}-${v.key}`,
        severity: 'attention',
        headline: `${v.section}.${v.key} = ${describeValue(v.value)} is the coach's number, not the athlete's — proposed ${v.asOf}, ${age} days ago, and it has not been ruled on.`,
        detail: `${v.note} Recorded in ${v.source}.`,
        action: 'The athlete\'s decision, not the coach\'s. Put the number in front of them with '
          + 'what it does and what it cost to pick it, then record the answer — their figure if '
          + 'they give one, athlete-confirmed if they keep this one. Until then do not describe it '
          + 'back to them as something they set. Do not delete it either: an unconfirmed threshold '
          + 'removed is the same substitution of judgement as one invented (data/METHOD.md, '
          + 'Provenance rule 2).',
        source: 'athlete/constants.json _provenance; data/METHOD.md "Provenance"',
        // Not a goals.md domain, and deliberately so: this finding is a question ABOUT the goals,
        // not a recommendation serving one. Naming a domain here would also hardcode one athlete's
        // domain labels into shared code (INVARIANTS.md X-11).
        domain: 'Chart integrity',
      })
    }
  }

  for (const f of found) f.audience = f.audience ?? audienceFor(f.id)
  return found.sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity))
}
