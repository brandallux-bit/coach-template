import { Card, Empty, Masthead, Meter, Nav, Shell, Tile } from '@/components/ui'
import CoachNotes from '@/components/CoachNotes'
import FindingsCard from '@/components/FindingsCard'
import UnitToggle from '@/components/unit-toggle'
import {
  addDays, allOf, allOnOrBefore, coachNotes, energy, fmt, fractionOfDayElapsed, meals, n, oneOf,
  plan, prettyDate, sets, today, weekdayKey, weekStart,
} from '@/lib/data'
import { viewFindings } from '@/lib/findings'
import {
  DAILY, SUPPLEMENTS, effectiveRx, orderedSessions, planDay, primarySession, rxFor, setsForSession,
} from '@/lib/forecast'
import { hasStepFeed, movementLevel } from '@/lib/movement'
// The grouping and the three states live in scripts/lib/session-table.mjs rather than here, so
// scripts/test-session-table.mjs runs the code this page runs instead of a hand-written mirror of
// it — the arrangement aggregate.ts already has, for the same reason.
import { sessionTable, setsLeft } from '@/lib/session-table'
import { partialBurn, rollDay, rollWeek } from '@/lib/rollup'

export const dynamic = 'force-dynamic'

/**
 * Why a recorded segment has no figure. **The reasons are not interchangeable**, which is the same
 * rule History's `SessionKcal` holds one file over and for the same cause: printing one dash for
 * all of them is how a table stops meaning anything. A walk is COMPLETE without a session figure —
 * its energy is already in the step count — while a blank duration is a real cost nobody can
 * compute, and a row that has not happened has not happened.
 *
 * `not-performed` splits on status, because `sessionBurns` is `status === 'completed'` and that
 * one level therefore covers two opposite states: a **planned** session that may still happen
 * today, and a **skipped** one that will not. Rendering "not performed yet" beside a `skipped`
 * status is the table contradicting itself in adjacent cells.
 */
const recordedAbsence = (level: string, status: string): string => {
  if (level === 'counted-elsewhere') return 'in steps'
  if (level === 'unknown') return 'TBD'
  if (level === 'not-performed') return status === 'skipped' ? 'skipped' : 'not performed yet'
  return '—'
}

/** How a proposed segment says it has no figure. Same two absences `Next 7 Days` renders. */
const PROPOSED_ABSENCE: Record<string, string> = {
  'counted-elsewhere': 'in steps',
  unknown: 'TBD',
}

export default function TodayPage() {
  const now = today()
  const d = rollDay(now)
  // Every note on or before today, not just the newest — each is its own dismissible box
  // (`CoachNotes`) rather than one note that a newer one silently buries. Its own date is stamped
  // whenever it is not today's, so a note about Friday's dinner cannot read as advice about today.
  // The week they are standing in, Monday-anchored, truncated at today — so `days.length` is days
  // ELAPSED, never seven. See src/lib/rollup.ts and scripts/lib/aggregate.mjs `weekIntake`.
  const wk = rollWeek(weekStart(now), now)
  const wi = wk.intake
  const notes = allOnOrBefore(coachNotes, now)
  const logged = allOf(sets, now)
  const todaysMeals = allOf(meals, now)
  const stepGoal = plan.stepsPerDayTarget
  // `targetRateLbPerWk` is [acceptable floor, goal] — read order-independently, the same way
  // scripts/lib/findings.mjs reads it, so a chart still writing it as a corridor is not misread.
  // Null on a chart with no rate on file, which renders as no sentence rather than as a zero.
  const rates = (plan.targetRateLbPerWk ?? []).filter((v) => Number.isFinite(v))
  const goalRateLbPerWk = rates.length ? Math.max(...rates) : null

  // energy.csv holds whole-day figures. On a day in progress that is a lie in the direction that
  // invites overeating, so the clock-driven share is prorated. See rollup.partialBurn.
  const elapsed = fractionOfDayElapsed()
  const burn = partialBurn(now, elapsed)
  const pctOfDay = Math.round(elapsed * 100)

  // What today is *meant* to be, when no coaching session has written a training.csv row yet.
  // A written row always wins: the template is the default, never a claim about what happened.
  //
  // ⚠ This used to be `d.sessions[0]` — file order. Since 2026-08-13 the daily rehab block is
  // logged as its own training row, so nearly every day has two, and `[0]` was whichever the
  // coach happened to append first. `primarySession` is the one shared, deliberate answer; see
  // src/lib/forecast.ts for the rank and why the prescription key sits where it does.
  const sessions = orderedSessions(d.sessions, now)
  const written = primarySession(d.sessions, now)
  const templated = plan.weeklyTemplate?.[weekdayKey(now)] ?? null
  const sessionName = written?.session ?? templated?.session ?? null

  // Prescriptions are effective-dated PER SESSION: the newest set on or before today, for that
  // session name. Rows dated today therefore win automatically — that is the "a row dated today
  // overrides, for a one-off change to a single day" rule, and it needs no special case.
  //
  // ⚠ It used to have one, and the special case was the bug (2026-08-13). `exact` was every
  // prescription row dated today, ACROSS ALL SESSIONS, and it beat the per-session lookup. So
  // defining any new session dated today hijacked the Today tab: on a walk day the caption read
  // one session while the table rendered a different, brand-new one.
  // Reported by the athlete against the live dashboard. Scoping the lookup to the session name
  // fixes every case, and the resolver now lives in one place for all three surfaces —
  // `rxFor` also bridges training.csv's descriptive session names ("Session Two — Upper Push/Pull")
  // to the shorter ones prescriptions.csv uses ("Session Two"). Test: scripts/test-prescriptions.mjs.
  const rx = sessionName && sessionName !== DAILY ? rxFor(sessionName, now) : []
  const daily = effectiveRx(DAILY, now)
  const stack = effectiveRx(SUPPLEMENTS, now)

  // Sets are matched on the date AND the session. Matching on the date alone meant a morning
  // session's work rendered an evening session's exercises as "done", and they would skip them —
  // the same one-dimensional lookup as the prescription bug above, one file over. The unscoped
  // list stays available below, because hiding logged work is its own defect.
  const dayNames = d.sessions.map((s) => s.session)
  const loggedHere = setsForSession(logged, sessionName, dayNames)

  /**
   * ⚠ **THE TABLE IS BUILT FROM WHAT WAS PERFORMED, NOT FROM WHAT WAS PRESCRIBED.**
   *
   * It used to be a row per prescription, with a "sets done" count matched to logged work by name.
   * That shape cannot show what the athlete actually did, for two reasons that are structural
   * rather than incidental:
   *
   *   1. **A missed match costs a ROW, not an annotation.** Every name matcher is fuzzy — a
   *      prescription reads "Pull-ups (band-assisted as needed)" and the log reads "Pull-up
   *      (band-assisted)". When the match fails in a prescription-shaped table, real logged sets
   *      vanish from the page and the prescription renders as `0 / 3 · not started`. The failure
   *      mode of a string comparison should never be the erasure of measured work, and worse, its
   *      failure mode here was a false claim that work was skipped.
   *   2. **Unprescribed work has nowhere to render.** Anything the athlete added on their own — a
   *      movement the sheet never named — appeared on no surface at all, however many sets of it
   *      were logged, because no prescription row existed to hang it on.
   *
   * So the rows come from `sets.csv` in the order they were performed, and the prescription is
   * looked up FOR each group rather than the other way round. `sameMovement` (shared with the
   * session-recommendation collision detector, so there is one matcher and not two) becomes
   * ADVISORY: it decides whether a group gets a "prescribed N × R" annotation and which
   * prescription rows are left over. It can no longer decide whether the work is visible.
   */
  /**
   * ⚠ **THIS SESSION'S OWN STATUS, NOT THE DAY'S — and the first version was the day's.**
   *
   * It read `sessions.some((sn) => sn.status === 'completed')`, an OR across every training row on
   * the day. The comment eight lines above says why that is not a rare shape: a standing daily
   * block is logged as its own row, so nearly every day has two. Finishing the short one therefore
   * flipped the flag for the session being rendered — deleting its live prescription, and printing
   * "Prescribed, not logged" against movements the athlete was in the middle of.
   *
   * `written` is the session whose prescription `rx` was resolved for, so its status is the one
   * that governs this table. No written row means nothing has happened yet, which is `planned`.
   * `sessionTable` takes the STATUS rather than a boolean so `skipped` and `rest` stop rendering
   * as "still to do" — the enum has four values and this used to read one bit of it.
   */
  const { performed, remaining, notDone, closed } = sessionTable({
    sets: loggedHere, rx, status: written?.status ?? 'planned',
  })
  const skipped = written?.status === 'skipped'

  // =============================================================================================
  // THE COST OF TODAY'S MOVEMENT, PROPOSED AND RECORDED
  //
  // Asked for on 2026-08-24: *"add the estimated calories that will be burned for proposed
  // movement segments and for actual recorded movement segments so that I can see the numbers
  // used for calculating my projected and recorded burn."*
  //
  // ⚠ **TWO TABLES, NOT ONE JOINED TABLE, AND THAT IS THE POINT RATHER THAN A COMPROMISE.** The
  // two sides come from two different models with two different jobs: `planDay` is the FORWARD
  // model (the same one Next 7 Days renders, MET × minutes over the block template) and the
  // per-row `estKcalBurned` is the LEDGER (the same figure `energy.csv`'s `session_kcal` is summed
  // from). Pairing them row-for-row would need a join, and the only join available is index
  // order inside `planDay` — an implicit coupling that would silently mis-pair the day the
  // forecast starts ordering its items differently. Rendering each side under its own heading,
  // from its own one home, cannot mis-pair anything and says plainly which model produced which
  // number. Nothing here computes a third figure.
  const proposed = planDay(now, now)

  // The ledger side. `estKcalBurned`, `kcalLevel` and `kcalBasis` are derived once in
  // scripts/build-data-json.mjs through the SAME `sessionCost` precedence compute-energy.mjs uses
  // — kcal_override, then the intensity split, then the flat MET — which is what stopped this
  // surface reading 1,328 kcal for a session the ledger counted at 774 (audit F-02).
  const todayEnergy = oneOf(energy, now)
  const recordedSteps = n(todayEnergy?.steps_kcal)
  // ⚠ **THE OTHER FILLING OF THE SAME SLOT.** On a chart with no wearable this is what the ledger
  // holds and `steps_kcal` is blank forever — so a hardcoded "Steps · not reported yet" row read
  // as a permanent gap on the configuration most charts are in. One row, whichever way it is
  // filled; see BURN_COMPONENTS in scripts/lib/aggregate.mjs.
  const recordedIncidental = n(todayEnergy?.incidental_kcal)
  const hasFeed = hasStepFeed(plan.stepFeed)
  const recorded = [
    ...sessions.map((sn) => ({
      label: sn.session || sn.type,
      detail: [sn.status, sn.duration_min ? `${sn.duration_min} min` : null].filter(Boolean).join(' · '),
      kcal: sn.estKcalBurned ? Number(sn.estKcalBurned) : null,
      absence: recordedAbsence(sn.kcalLevel, sn.status),
      // An `unknown` cost is the only absence that makes the total SHORT of the truth. A planned
      // row has not happened and a walk is already counted in steps; neither is a gap.
      shortfall: sn.kcalLevel === 'unknown',
      basis: sn.kcalBasis,
    })),
    hasFeed
      ? {
        label: 'Steps',
        detail: d.steps == null ? 'not reported yet' : `${d.steps.toLocaleString()} steps`,
        kcal: recordedSteps,
        absence: 'TBD' as const,
        // Deliberately NOT a shortfall: the step feed lands the morning after by design, so
        // marking today's blank as a gap would put the marker on this page every single day,
        // which is how a marker stops being read (see DayRoll.burnUnderstated for the same
        // argument).
        shortfall: false,
        basis: recordedSteps == null
          ? 'the step feed writes yesterday\u2019s total each morning — nothing for today yet'
          : `steps \u00d7 ${plan.kcalPerStepPerLb} kcal per step per lb of bodyweight, from the ledger`,
      }
      : {
        label: 'Daily movement',
        detail: movementLevel(plan.movementLevel)?.label ?? 'outside deliberate exercise',
        kcal: recordedIncidental,
        absence: 'TBD' as const,
        // Also not a shortfall, for the opposite reason: nothing is waiting to arrive. This chart
        // has no feed and is not missing one — the figure is the described level, priced.
        shortfall: false,
        basis: recordedIncidental == null
          ? 'no movement level on file yet — skills/intake asks for one'
          : (plan.movementBasis ?? 'the movement level this chart describes, priced per step-equivalent'),
      },
  ]
  const recordedKcal = recorded.reduce<number | null>(
    (a, r) => (r.kcal == null ? a : (a ?? 0) + r.kcal), null,
  )
  const recordedIsPartial = recorded.some((r) => r.shortfall)

  return (
    <Shell>
      <Masthead title="Today" sub={prettyDate(now)} />
      <Nav current="/today" />

      {/* Ahead of the coach's note and the tiles. See the same comment on src/app/page.tsx. */}
      <FindingsCard findings={viewFindings(now)} />

      <CoachNotes notes={notes as { date: string; headline: string; note: string }[]} today={now} />

      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <Tile label="Eaten" value={fmt(d.intakeKcal)} unit="kcal"
          foot={d.targetKcal ? `target ${d.targetKcal.toLocaleString()}` : 'no target set'} />
        {/* ⚠ NO "full day projects to X" HERE ANY MORE, and no `elapsed >= 1` branch either.
            Both were audit F-55. The figure was `burn_total_kcal` — whole-day RMR and NEAT plus
            activity accrued SO FAR — so at 17:18 it read "full day projects to 1,851" on a chart
            whose finished days vary by hundreds of kcal. They subtract intake from that and believes their
            deficit will be ~1,150 when it will be ~1,700. It was labelled a projection and was
            not one; nothing here projects the rest of the day, so nothing here says it does.
            The alternative branch could never fire: fractionOfDayElapsed() maxes at 0.99931, so
            `elapsed >= 1` was false at 23:59 too. "Is this day finished" is `d.inProgress`, which
            is keyed off the date — and on the Today tab it is true by construction. */}
        <Tile label="Burned so far (est.)" value={fmt(burn.burnSoFarKcal)} unit="kcal"
          foot={`${pctOfDay}% of the day elapsed · resting burn prorated, activity counted as logged`} />
        <Tile label="Deficit so far" value={fmt(burn.deficitSoFarKcal)} unit="kcal"
          foot={
            d.intakeKcal == null
              ? 'nothing logged yet — this is burn, not a deficit'
              : 'burn so far minus intake so far'
          } />
        {/* ⚠ **ONLY A CHART WITH A FEED HAS A STEP COUNT TO BE WAITING FOR.** Ungated, this tile
            read "Steps · TBD · automation has not reported yet" on the most-visited page of every
            chart with no wearable, every day, forever — for an automation that chart never
            installed and is never going to. It is the same harm the movement label in
            BURN_COMPONENTS was widened to end, left standing three lines below the row that fixed
            it. A chart without a feed has a movement figure, not a step count, and it is in the
            recorded-segments table below rather than duplicated here as a tile: this tile exists
            to say how a COUNT is tracking against a target, and an estimate from a description has
            no target and nothing to track. */}
        {hasFeed ? (
          <Tile label="Steps" value={fmt(d.steps)} unit=""
            foot={
              d.steps == null
                ? 'automation has not reported yet'
                : stepGoal == null
                  ? 'recorded — no domain sets a target'
                  : d.steps >= stepGoal
                    ? `target ${stepGoal.toLocaleString()} — hit`
                    : `${(stepGoal - d.steps).toLocaleString()} to the ${stepGoal.toLocaleString()} target`
            } />
        ) : null}
      </div>

      {/* "Today's Meals", not "Meals" — their words: the card below it is the weekly one, so the
          daily card has to say which scale it is. Nothing keys off the heading; `Card` renders
          `title` as an <h2> and no test, style rule or smoke assertion selects on it. History's
          own <h4>Meals</h4> is a different card on a different surface and is untouched. */}
      <Card
        title="Today's Meals"
        caption={
          d.targetKcal
            ? 'A calorie ceiling and a protein floor. Everything else lives inside them.'
            : 'No target written for today yet.'
        }
      >
        <UnitToggle>
          <Meter name="Calories" actual={d.intakeKcal} target={d.targetKcal} unit=" kcal" />
          <Meter
            name="Protein"
            actual={d.proteinG}
            target={d.targetProteinG}
            unit=" g"
            floor={plan.proteinFloorG}
            note={`Floor ${plan.proteinFloorG} g marked on the track; aim ${plan.proteinAimG} g.`}
          />
          <Meter name="Fat" actual={d.fatG} target={d.targetFatG} unit=" g" />
          <Meter name="Fibre" actual={d.fibreG} target={d.targetFibreG} unit=" g" />
          {/*
            ⚠ **NO PER-DAY ALCOHOL ALLOWANCE IS INVENTED HERE, and a weekly budget existing does
            not change that.** Dividing a weekly allowance by seven puts a number on this track that
            nobody set. Drinking is typically uneven ON PURPOSE — a plan schedules the big night at
            the weekend and away from the hardest training evenings — so a flat daily line would
            mark an ordinary midweek glass as an overage and a planned weekend bottle as a
            catastrophe, neither of which is what the plan says.

            So the daily row shows what was DRUNK with no denominator, unless a coaching session
            wrote a real allowance into that day's targets.csv row. The denominator lives on the
            weekly card below, which is where the budget actually is. A day with nothing logged renders nothing at all — an unlogged day is not a
            zero-alcohol day (INVARIANTS.md X-1).
          */}
          {d.targetAlcoholKcal != null ? (
            <Meter name="Alcohol" actual={d.alcoholKcal} target={d.targetAlcoholKcal} unit=" kcal"
              color="var(--series-2)"
              note="Today's row carries its own allowance, written by a coaching session." />
          ) : d.alcoholKcal != null ? (
            <Meter name="Alcohol" actual={d.alcoholKcal} target={null} unit=" kcal"
              color="var(--series-2)"
              note={
                wi.budget.alcohol != null
                  ? `Inside the calorie figure above, not added to it. The allowance is weekly, `
                    + `not daily — see the week below.`
                  : 'Inside the calorie figure above, not added to it.'
              } />
          ) : null}
        </UnitToggle>
      </Card>

      {/*
        THE WEEK. Asked for directly on 2026-08-14: "We should have a weekly target chart, just like
        the daily, but including alcohol. So each day, I can see where I stand for the day and for
        the week."

        ⚠ **THE DENOMINATOR IS THE FULL WEEK AND THE PACE LINE IS WHAT KEEPS THAT HONEST.** A
        week-to-date total against a full-week budget flatters them, and on a Tuesday it flatters them
        enormously — 4,000 against 12,950 reads as 31% used and looks like enormous headroom when they are roughly on pace. The budget stays the denominator because that is the number they asked to
        see; the marker on the Food and Total tracks is the plan's OWN arithmetic over the days that
        have happened (Σ targets.csv kcal), never the budget divided by seven. See
        scripts/lib/aggregate.mjs `weekIntake` for why prorating was rejected.
      */}
      {wi.budget.total != null && (
        <Card
          title="This week"
          caption={
            `${prettyDate(wk.start)} – ${prettyDate(addDays(wk.start, 6))} · day ${wi.daysElapsed} of 7. `
            + 'Wine is inside the calorie budget, not on top of it — every glass is a calorie you '
            + 'do not eat.'
          }
        >
          <UnitToggle>
            <Meter
              name="Food"
              actual={wi.foodKcal}
              target={wi.budget.food}
              unit=" kcal"
              pace={wi.foodPaceKcal == null ? undefined : {
                at: wi.foodPaceKcal,
                label: `the plan through the end of today (${Math.round(wi.planToDateKcal ?? 0).toLocaleString()}`
                  + ` kcal) less what you drank — ${Math.round(wi.foodPaceKcal).toLocaleString()} kcal`,
              }}
            />
            <Meter
              name="Alcohol"
              actual={wi.alcoholKcal}
              target={wi.budget.alcohol}
              unit=" kcal"
              color="var(--series-2)"
              // No pace line, deliberately: the budget is weekly and has no per-day allocation, so
              // there is nothing honest to draw. Saying so beats drawing a seventh of it.
              note={
                `Weekly on purpose — spend it when you like. No day carries a share of it.`
                + (wi.alcoholDays > 0 && wi.alcoholDays < wi.intakeDays
                  ? ` Recorded on ${wi.alcoholDays} of ${wi.intakeDays} logged days.`
                  : '')
              }
            />
            <Meter
              name="Total"
              actual={wi.totalKcal}
              target={wi.budget.total}
              unit=" kcal"
              color="var(--series-3)"
              pace={wi.planToDateKcal == null ? undefined : {
                at: wi.planToDateKcal,
                label: `the plan through the end of today — ${Math.round(wi.planToDateKcal).toLocaleString()} kcal`,
              }}
            />
          </UnitToggle>
          <p className="footnote">
            {wi.intakeDays === 0
              ? 'Nothing logged this week yet, so there is no figure to compare — the bars are the '
                + 'budget waiting, not a zero.'
              : <>
                  {wi.intakeDays === wi.daysElapsed
                    ? `All ${wi.daysElapsed} day${wi.daysElapsed === 1 ? '' : 's'} so far are logged.`
                    : `${wi.intakeDays} of the ${wi.daysElapsed} days so far are logged, and only `
                      + 'those are counted.'}
                  {wi.planToDateKcal != null && wi.totalKcal != null ? (
                    <>
                      {' '}Through the end of them the plan allowed{' '}
                      {Math.round(wi.planToDateKcal).toLocaleString()} kcal
                      {wi.planDays < wi.intakeDays ? ` (${wi.planDays} of them carry a target row)` : ''},
                      {' '}so you are{' '}
                      <strong>
                        {Math.abs(Math.round(wi.totalKcal - wi.planToDateKcal)).toLocaleString()} kcal
                        {wi.totalKcal > wi.planToDateKcal ? ' over' : ' under'}
                      </strong>
                      {' '}the line on the tracks.
                      {/* The day-scale trap, named on the page rather than adjusted away: today's
                          whole target is already inside that line, so being under it at breakfast
                          is a day not yet eaten, not calories banked. See aggregate.mjs.

                          The second clause is direction-aware. Printed unconditionally it read
                          "you are 650 kcal OVER the line … being UNDER it this early is a day not
                          yet eaten" on the live chart, which is two answers in one sentence. */}
                      {wi.inProgressCounted
                        ? ' Today is counted in full and is not over, so the line already includes'
                          + ' all of today'
                          + (wi.totalKcal > wi.planToDateKcal
                            ? '.'
                            : ' — being under it this early is a day not yet eaten, not calories'
                              + ' banked.')
                        : ''}
                      {' '}The bars run to the whole week, so a short bar mid-week is pace, not
                      headroom.
                    </>
                  ) : ' No target rows on the days logged, so there is no pace line to compare against.'}
                </>}
          </p>

          {/*
            ⚠ **ESTIMATED IN · ESTIMATED OUT · WHAT THEY PRODUCE.** A week aimed at a rate of loss
            needs an estimated calories in and an estimated calories out to reach it, divided across
            the seven days in a way a coach can defend line by line.

            **THE IN SIDE IS THE LEDGER TOO, WHEREVER THE LEDGER EXISTS.** A finished day
            contributes what it ATE; today contributes what it has eaten plus whatever is left of
            its own target; only a day still to come contributes a target. It summed seven targets
            before, so a week already over budget reported the budget straight back under a label
            saying "estimated", while the OUT side beside it was measured days plus one estimate —
            and the projection underneath divided a real burn by a hypothetical intake.

            **THE DIVISION IS `plan.kcalByWeekday` AND NOTHING HERE INVENTS A NEW ONE.** Wherever a
            target is what a day contributes, a written targets.csv row wins; a day without one
            falls back to the same weekday structure `generate-targets.mjs` writes from. The foot
            says how much of the figure is ledger and how much is plan, because a total with no
            provenance is indistinguishable from a figure somebody typed.

            **THE OUT SIDE IS THE LEDGER, NOT A SECOND BURN MODEL.** Complete energy.csv rows
            contribute their own figures; the days that have not finished contribute the mean of
            exactly those rows. See scripts/lib/aggregate.mjs `weekEnergy`.

            ⚠ **A PROJECTION IS NOT A MEASUREMENT (INVARIANTS.md X-1).** The badges are computed
            from `estimatedBurnDays` and `estimatedIntakeDays`, never hardcoded, so on a week whose
            every day is finished and logged they disappear and the figures stop claiming to be
            forecasts. scripts/test-aggregations.mjs asserts the badge is attached to THESE tiles,
            not merely present in this file — the defect a previous check shipped was exactly that
            distinction — and it runs that check for the IN side as well, which became a forecast
            the moment it stopped being a restatement of the budget.
          */}
          {wi.budget.total != null && wk.energy.inKcal != null && (
            <>
              <div className="grid cols-3" style={{ marginTop: 22 }}>
                <Tile
                  label="Estimated in"
                  value={fmt(wk.energy.inKcal)}
                  unit="kcal"
                  badge={wk.energy.estimatedIntakeDays > 0 ? 'part estimate' : undefined}
                  foot={
                    wk.energy.estimatedIntakeDays === 0
                      ? `all ${wk.energy.actualIntakeDays} days as logged — a record, not a forecast`
                      : `${fmt(wk.energy.recordedIntakeKcal ?? 0)} kcal logged over `
                        + `${wk.energy.recordedIntakeDays} day`
                        + `${wk.energy.recordedIntakeDays === 1 ? '' : 's'} · `
                        + `${fmt(wk.energy.plannedIntakeKcal)} still on plan for `
                        + `${wk.energy.estimatedIntakeDays} day`
                        + `${wk.energy.estimatedIntakeDays === 1 ? '' : 's'}, `
                        + `${wk.energy.structureTargetDays === 0
                          ? 'from the targets already written'
                          : `${wk.energy.writtenTargetDays} written · `
                            + `${wk.energy.structureTargetDays} from the weekday structure`}`
                  }
                />
                <Tile
                  label="Estimated out"
                  value={fmt(wk.energy.outKcal)}
                  unit="kcal"
                  badge={wk.energy.estimatedBurnDays > 0 ? 'part estimate' : undefined}
                  foot={
                    wk.energy.outKcal == null
                      ? 'not enough complete days in the ledger to average your burn yet'
                      : `${wk.energy.actualBurnDays} day`
                        + `${wk.energy.actualBurnDays === 1 ? '' : 's'} measured · `
                        + `${wk.energy.estimatedBurnDays} at your `
                        + `${fmt(wk.energy.perDayBurnKcal)} kcal/day average over `
                        + `${wk.energy.observedDays} complete days`
                  }
                />
                <Tile
                  label="That produces"
                  value={wk.energy.lossLb == null ? 'TBD' : `~${fmt(wk.energy.lossLb, 1)}`}
                  unit="lb"
                  badge={wk.energy.estimatedBurnDays > 0 || wk.energy.estimatedIntakeDays > 0
                    ? 'projection' : undefined}
                  foot={
                    wk.energy.gapKcal == null || wk.energy.kcalPerLbFat == null
                      ? 'needs both sides of the week before it can say'
                      : `${fmt(wk.energy.gapKcal)} kcal more out than in, ÷ `
                        + `${wk.energy.kcalPerLbFat.toLocaleString()} kcal per lb of fat`
                  }
                />
              </div>
              <p className="footnote">
                {wk.energy.estimatedBurnDays > 0 || wk.energy.estimatedIntakeDays > 0
                  ? `A projection, not a result. In: ${fmt(wk.energy.recordedIntakeKcal ?? 0)} kcal is `
                    + `already on the ledger and ${fmt(wk.energy.plannedIntakeKcal)} is what the `
                    + 'plan still has left to eat — going over that moves this figure up, not the '
                    + `budget. Out: ${wk.energy.estimatedBurnDays} of the ${wk.energy.days} days `
                    + `${wk.energy.estimatedBurnDays === 1 ? 'has' : 'have'} not finished, and `
                    + `${wk.energy.estimatedBurnDays === 1 ? 'it is' : 'they are'} costed at what `
                    + 'your finished days have actually burned. What the scale says is measured '
                    + 'separately.'
                  : 'Every day this week is finished and logged, so both sides are measured.'}
                {goalRateLbPerWk != null && wk.energy.lossLb != null
                  ? ` Your goal on file is ${goalRateLbPerWk.toFixed(2)} lb/week; this week's `
                    + `numbers are aimed at ~${wk.energy.lossLb.toFixed(2)}. Changing either side `
                    + 'is a conversation, not a dial on this page.'
                  : ''}
              </p>
            </>
          )}
        </Card>
      )}

      <Card title="Logged so far" caption="Every item, as recorded. Confidence says how the number was arrived at.">
        {todaysMeals.length ? (
          <div className="scroll-x">
            <table>
              <thead>
                <tr><th className="text">Time</th><th className="text">Item</th><th>kcal</th><th>Protein</th><th>Fat</th><th>Carb</th><th>Fibre</th><th className="text">Confidence</th></tr>
              </thead>
              <tbody>
                {todaysMeals.map((m, i) => (
                  <tr key={i}>
                    <td className="text">{m.time || '—'}</td>
                    <td className="text">{m.item}</td>
                    <td>{m.kcal || '—'}</td>
                    <td>{m.protein_g || '—'}</td>
                    {/* METHOD.md rule 3a: these are never blank on a food row, so a dash here is
                        a tripwire for a row that got in without an estimate — not a normal state.
                        The `||` is safe for a measured zero: "0" is a truthy string. */}
                    <td>{m.fat_g || <span className="tbd">—</span>}</td>
                    <td>{m.carb_g || <span className="tbd">—</span>}</td>
                    <td>{m.fibre_g || <span className="tbd">—</span>}</td>
                    <td className="text">{m.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>Nothing logged yet today.</Empty>}
      </Card>

      <Card
        title="Movement"
        caption={
          // The kcal figure comes from the ONE per-session precedence (scripts/lib/aggregate.mjs
          // `sessionCost`, bundled as `estKcalBurned`), which is the same number energy.csv's
          // `session_kcal` is built from — so this caption and the Deficit tile above it cannot
          // disagree. They did: this line read `est_kcal_burned`, a column that has never existed
          // in training.csv, so the `||` fallback fired on every row and no kcal figure was ever
          // shown (F-41); and the value behind that name, computed in build-data-json.mjs with a
          // flat MET, said 1,328 kcal for a session the ledger counted at 774 (F-02).
          // A session with no figure says nothing rather than "0 kcal" — a walk's energy is in
          // steps and a blank duration is an unknown cost, neither of which is a zero.
          sessions.length
            ? sessions
                .map((s) => `${s.session} — ${s.status}${s.duration_min ? ` · ${s.duration_min} min` : ''}`
                  + (s.estKcalBurned ? ` · ~${Number(s.estKcalBurned).toLocaleString()} kcal` : ''))
                .join(' · ')
            : templated
              ? `${templated.session} — planned${templated.durationMin ? `, ~${templated.durationMin} min` : ''}${templated.focus ? `. ${templated.focus}` : ''}`
              : 'No session written for today yet, and the block template has nothing for this weekday.'
        }
      >
        {/* The flex sentence is the CHART's, from `athlete/constants.json`'s `copy`: which days
            are fixed and which move is a fact about one athlete's block, and it was rendered here
            as a literal naming their sport (INVARIANTS.md X-11, audit F-31). A chart that wrote none
            gets the first sentence and nothing more. */}
        {!sessions.length && templated && (
          <p className="footnote">
            From the block template — nothing logged for today yet.
            {plan.copy?.templateFlexNote ? ` ${plan.copy.templateFlexNote}` : ''}
          </p>
        )}
        {/* ⚠ `notDone.length` IS IN THIS GATE BECAUSE OF EXACTLY THE CASE IT DESCRIBES. A closed
            session with nothing logged has no performed rows and no remaining rows BY DESIGN — so
            the branch carrying the one sentence a closed session may print was unreachable, and
            the page instead said the session "has no set-by-set prescription — nothing logged
            yet" about a session with a full sheet that the ledger had already closed. */}
        {performed.length || remaining.length || notDone.length ? (
          <>
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th className="text">Performed</th><th>Set</th><th>Load</th>
                    <th>Reps / time</th><th>RIR</th><th className="text">Prescribed</th>
                  </tr>
                </thead>
                <tbody>
                  {performed.map((g) =>
                    g.sets.map((s, i) => (
                      <tr key={`${g.exercise}-${i}`}>
                        {/* The name is the one it was PERFORMED under, not the prescription's. If
                            the two differ that is worth seeing, not worth papering over. */}
                        <td className="text">{i === 0 ? g.exercise : ''}</td>
                        <td>{s.set_index}</td>
                        <td>{s.load_lb ? `${s.load_lb} lb` : 'BW'}</td>
                        <td>{s.reps || (s.duration_s ? `${s.duration_s}s` : '—')}</td>
                        <td>{s.rir || <span className="tbd">—</span>}</td>
                        <td className="text">
                          {/* `setsAgainstRx`, not `g.sets.length`: two spellings of one movement
                              are two groups sharing one prescription, and each counting its own
                              shortfall against the full prescribed total put "1 set left" beside
                              "2 set left" on a session where all three were performed. */}
                          {i > 0 ? '' : g.rx
                            ? `${g.rx.sets} × ${g.rx.reps}${setsLeft(g) ? ` · ${setsLeft(g)} set${setsLeft(g) === 1 ? '' : 's'} left` : ''}`
                            : <span className="tbd">{g.ambiguous ? 'matches more than one prescribed movement' : 'not prescribed'}</span>}
                        </td>
                      </tr>
                    )),
                  )}
                  {/* Still to do. Rows, not a footnote — carrying the load and the rep target,
                      which is what makes them usable mid-session. No "0 / 3" count: a count of
                      nothing is not a measurement, and dressing it as one is what rendered logged
                      work as "not started" whenever the name matcher missed. */}
                  {remaining.map((p) => (
                    <tr key={`todo-${p.order}`} className="tbd">
                      <td className="text">{p.exercise}</td>
                      <td>—</td>
                      <td>{p.load || 'BW'}</td>
                      <td>—</td>
                      <td>—</td>
                      <td className="text">{p.sets} × {p.reps} · to do</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* ⚠ **THE SAME POINTER THE EMPTY STATE CARRIES, ON THE BRANCH THAT ACTUALLY RENDERS
                MOST OF THE TIME.** It was only in the empty state, so a day with a prescription
                AND sets logged under a different session name showed a full table with nothing
                saying that other work existed. Not erasure — the disclosure below holds them — but
                a reader has no reason to open it. */}
            {logged.length > loggedHere.length && (
              <p className="footnote">
                {logged.length - loggedHere.length} set(s) were logged today under a different
                session name. They are under &ldquo;Every set logged today&rdquo; below.
              </p>
            )}
            {notDone.length > 0 && (
              <p className="footnote">
                {/* The only "did not do" claim this card makes, and only once the session is marked
                    completed — a sentence about the sheet, not a row implying a measurement. */}
                {/* "Skipped" and "not logged" are different sentences about the same list, and
                    the record already says which. Calling a skipped session's sheet "not logged"
                    reports a decision as an omission. */}
                <strong>{skipped ? 'Skipped — this was on the sheet:' : 'Prescribed, not logged:'}</strong>{' '}
                {notDone.map((p) => `${p.exercise} (${p.sets} × ${p.reps})`).join(' · ')}.
              </p>
            )}
          </>
        ) : (
          <Empty>
            {/* Never "nothing logged" when something WAS logged elsewhere — that is a claim about
                the athlete's day, and the sets are one disclosure below. */}
            {logged.length
              ? `Nothing logged against ${sessionName || 'today\u2019s session'} yet — but ${logged.length} set(s) were logged today under another name. They are under "Every set logged today" below.`
              : sessionName
                ? `${sessionName} has no set-by-set prescription — nothing logged yet.`
                : 'No prescription and no sets logged for today.'}
          </Empty>
        )}

        {/* ---------------------------------------------------------------------------------
            **WHAT TODAY'S MOVEMENT COSTS — PROPOSED, THEN RECORDED.** See the comment over
            `proposed` and `recorded` above for why these are two tables rather than one.

            ⚠ **BOTH TOTALS ARE MOVEMENT ONLY, and neither is comparable to the "Burned so far"
            tile at the top of this page.** That tile is the whole decomposed model — resting
            metabolism, the thermic effect of food and background movement as well as these
            segments. Adding a movement total to it would double-count every one of these rows.
            The footnote says so on the page, not just here: `data/METHOD.md` calls mixing the
            two models the trap this chart has already fallen into twice. */}
        <h4 className="segments-head">Proposed — what today is scheduled to cost</h4>
        {proposed.items.length ? (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th className="text">Segment</th><th className="text">Detail</th>
                  <th>Est. kcal</th><th className="text">Basis</th>
                </tr>
              </thead>
              <tbody>
                {proposed.items.map((i, idx) => (
                  <tr key={`${i.label}-${idx}`}>
                    <td className="text">{i.label}</td>
                    <td className="text">{i.detail}</td>
                    <td>
                      {i.kcal == null
                        ? <span className="tbd">{PROPOSED_ABSENCE[i.kcalAbsence ?? ''] ?? '—'}</span>
                        : fmt(Math.round(i.kcal))}
                    </td>
                    <td className="text">{i.basis}</td>
                  </tr>
                ))}
                {/* A total short by a real cost says so. An item with no figure is not
                    automatically a gap — a walk contributes nothing here BY DESIGN, since its
                    energy is in the step count — so only an `unknown` absence marks it. */}
                <tr>
                  <td className="text"><strong>Total proposed</strong></td>
                  <td className="text">
                    {proposed.totalIsPartial ? <span className="tbd">at least this much</span> : null}
                  </td>
                  <td>
                    <strong>
                      {proposed.totalKcal == null
                        ? <span className="tbd">—</span>
                        : fmt(Math.round(proposed.totalKcal))}
                    </strong>
                    {proposed.totalIsPartial ? <span className="tbd">~</span> : null}
                  </td>
                  <td className="text">
                    {proposed.totalIsPartial
                      ? proposed.items.filter((i) => i.kcalAbsence === 'unknown')
                          .map((i) => `${i.label}: ${i.basis}`).join(' · ')
                      : ''}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            Nothing scheduled — no written row and no block-template entry for this weekday.
          </Empty>
        )}

        <h4 className="segments-head">Recorded — what has been logged so far</h4>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th className="text">Segment</th><th className="text">Detail</th>
                <th>Est. kcal</th><th className="text">Basis</th>
              </tr>
            </thead>
            <tbody>
              {recorded.map((r, idx) => (
                <tr key={`${r.label}-${idx}`}>
                  <td className="text">{r.label}</td>
                  <td className="text">{r.detail}</td>
                  <td>{r.kcal == null ? <span className="tbd">{r.absence}</span> : fmt(r.kcal)}</td>
                  <td className="text">{r.basis}</td>
                </tr>
              ))}
              <tr>
                <td className="text"><strong>Total recorded</strong></td>
                <td className="text">
                  {recordedIsPartial ? <span className="tbd">at least this much</span> : null}
                </td>
                <td>
                  <strong>
                    {recordedKcal == null ? <span className="tbd">—</span> : fmt(recordedKcal)}
                  </strong>
                  {recordedIsPartial ? <span className="tbd">~</span> : null}
                </td>
                <td className="text">
                  {recordedIsPartial
                    ? recorded.filter((r) => r.shortfall).map((r) => `${r.label}: ${r.basis}`).join(' · ')
                    : ''}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="footnote">
          <strong>These are movement figures only</strong> — session, daily block, and the day&rsquo;s
          movement outside them. They exclude resting metabolism, the thermic effect of food and
          background movement, so{' '}
          <strong>neither total is the same quantity as &ldquo;Burned so far&rdquo;</strong> at the
          top of this page, and they must never be added to it: the recorded segments here are
          already inside it. Proposed comes from the block template and the MET table, the same
          forward model Next 7 Days renders. Recorded comes from the ledger — the per-session
          figures that <code>data/energy.csv</code>&rsquo;s <code>session_kcal</code> is summed
          from, and the day&rsquo;s movement term — a step feed, which reports a day&rsquo;s total the
          following morning, or the movement level this chart described, which is there from the
          start of the day because it is an estimate rather than a count. A
          session shows <span className="tbd">not performed yet</span> until a coaching session
          writes its result, so the two tables are expected to disagree for most of the day —{' '}
          <strong>and to converge once it is written</strong>, because the forward model reads a
          written row&rsquo;s own duration and any device reading on it in preference to the
          template. Proposed is what today costs on the best information there is, not a morning
          guess frozen in place.
        </p>

        {/* ⚠ **GATED ON THE SETS ALONE, NOT ON A PRESCRIPTION EXISTING.** The table above is scoped
            to THIS session; this is every set logged today, whatever session it was written under.
            Gated additionally on `rx.length > 0`, a day whose only logged work sat under a
            different session name — or under none — rendered the empty state and this block stayed
            shut, so the sets appeared nowhere on the page. That is the same defect the table above
            was rebuilt to fix, reappearing one scope out: a lookup missing must never erase
            measured work. A disclosure that opens to nothing costs nothing. */}
        {logged.length > 0 && (
          <details className="table-view">
            <summary>Every set logged today</summary>
            <div className="scroll-x">
              <table>
                <thead><tr><th className="text">Exercise</th><th>Set</th><th>Load</th><th>Reps / time</th><th>RIR</th><th className="text">Note</th></tr></thead>
                <tbody>
                  {logged.map((s, i) => (
                    <tr key={i}>
                      <td className="text">{s.exercise}</td>
                      <td>{s.set_index}</td>
                      <td>{s.load_lb ? `${s.load_lb} lb` : 'BW'}</td>
                      <td>{s.reps || (s.duration_s ? `${s.duration_s}s` : '—')}</td>
                      <td>{s.rir || <span className="tbd">—</span>}</td>
                      <td className="text">{s.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </Card>

      {daily.length > 0 && (
        <Card
          title="Every day"
          caption="Runs today whatever else does — rehab and maintenance, not the session."
        >
          <div className="scroll-x">
            <table>
              <thead>
                <tr><th className="text">Movement</th><th>Dose</th><th className="text">Load</th><th className="text">How</th></tr>
              </thead>
              <tbody>
                {daily.map((p) => (
                  <tr key={p.order}>
                    <td className="text">{p.exercise}</td>
                    {/* Phase headers and routines-as-one-item carry no rep count; "1 × —" is noise. */}
                    <td>{p.reps === '—' ? '—' : `${p.sets} × ${p.reps}`}</td>
                    <td className="text">{p.load || 'BW'}</td>
                    <td className="text">{p.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {stack.length > 0 && (
        <Card
          title="Daily stack"
          caption="Recorded from their own account and read off the labels — this is what they already
            takes, not something prescribed here. One row is a medication, not a supplement, and its
            dose is not daily; the doses column says so. Full reasoning, evidence tiers and the
            items that were stopped: nutrition/supplements.md."
        >
          <div className="scroll-x">
            <table>
              <thead>
                <tr><th className="text">Item</th><th className="text">Dose</th><th className="text">Why it is on the list</th></tr>
              </thead>
              <tbody>
                {stack.map((p) => (
                  <tr key={p.order}>
                    <td className="text">{p.exercise}</td>
                    <td className="text">{p.reps}</td>
                    <td className="text">{p.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="footnote">
        Read-only. Logging happens in the coaching session, which writes <code>data/</code> and
        then the prose log.
      </p>
    </Shell>
  )
}
