import { Card, Empty, Masthead, Meter, Nav, Shell, Tile } from '@/components/ui'
import CoachNotes from '@/components/CoachNotes'
import FindingsCard from '@/components/FindingsCard'
import UnitToggle from '@/components/unit-toggle'
import {
  addDays, allOf, allOnOrBefore, coachNotes, fmt, fractionOfDayElapsed, meals, plan, prettyDate,
  sets, today, weekdayKey, weekStart,
} from '@/lib/data'
import { viewFindings } from '@/lib/findings'
import {
  DAILY, SUPPLEMENTS, effectiveRx, orderedSessions, primarySession, rxFor, setsForSession,
} from '@/lib/forecast'
import { partialBurn, rollDay, rollWeek } from '@/lib/rollup'

export const dynamic = 'force-dynamic'

export default function TodayPage() {
  const now = today()
  const d = rollDay(now)
  // Every note on or before today, not just the newest — each is its own dismissible box
  // (`CoachNotes`) rather than one note that a newer one silently buries. Its own date is stamped
  // whenever it is not today's, so a note about Friday's dinner cannot read as advice about today.
  // The week he is standing in, Monday-anchored, truncated at today — so `days.length` is days
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
  // "Walk / optional Peloton" while the table rendered the brand-new "Session A (knee-free)".
  // Reported by the athlete against the live dashboard. Scoping the lookup to the session name
  // fixes every case, and the resolver now lives in one place for all three surfaces —
  // `rxFor` also bridges training.csv's descriptive names ("Session B — Upper Push/Pull + Core")
  // to prescriptions.csv's ("Session B"). Regression test: scripts/test-prescriptions.mjs.
  const rx = sessionName && sessionName !== DAILY ? rxFor(sessionName, now) : []
  const daily = effectiveRx(DAILY, now)
  const stack = effectiveRx(SUPPLEMENTS, now)

  // Sets are matched on the date AND the session. Matching on the date alone meant a morning
  // session's work rendered an evening session's exercises as "done", and he would skip them —
  // the same one-dimensional lookup as the prescription bug above, one file over. The unscoped
  // list stays available below, because hiding logged work is its own defect.
  const dayNames = d.sessions.map((s) => s.session)
  const loggedHere = setsForSession(logged, sessionName, dayNames)

  // "Push-up (feet elevated)" and "Push-up (flat)" are the same prescribed movement performed at
  // two leverages — matching on the base name before the parenthetical keeps the count honest.
  const base = (s: string) => s.split(' (')[0].trim().toLowerCase()
  const loggedFor = (exercise: string) =>
    loggedHere.filter((s) => s.exercise === exercise || base(s.exercise) === base(exercise))

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
            whose finished days run 2,574–3,038. He subtracts intake from that and believes his
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
      </div>

      {/* "Today's Meals", not "Meals" — his words: the card below it is the weekly one, so the
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
            ⚠ **NO PER-DAY ALCOHOL ALLOWANCE IS INVENTED HERE, and the weekly budget existing does
            not change that.** He set 1,400 kcal/week on 2026-08-14; dividing it by seven would put
            200 kcal/day on this track, and that is a number nobody set. His drinking is uneven ON
            PURPOSE — `nutrition/plan.md` schedules the big wine night at the weekend and away from
            the BJJ evenings — so a flat daily line would mark an ordinary Tuesday glass as an
            overage and a Saturday bottle as a catastrophe, neither of which is what the plan says.

            So the daily row shows what was DRUNK with no denominator, unless a coaching session
            wrote a real allowance into that day's targets.csv row (2026-08-07 has one: 330 against
            a logged 392). The denominator lives on the weekly card below, which is where the budget
            actually is. A day with nothing logged renders nothing at all — an unlogged day is not a
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
        week-to-date total against a full-week budget flatters him, and on a Tuesday it flatters him
        enormously — 4,000 against 12,950 reads as 31% used and looks like enormous headroom when he
        is roughly on pace. The budget stays the denominator because that is the number he asked to
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
            ⚠ **ESTIMATED IN · ESTIMATED OUT · WHAT THEY PRODUCE.** Asked for on 2026-08-15: "my
            goal for the week is still lose 1 lb, so the week needs an estimated cals in and
            estimated cals out to achieve that, and they need to be divided logically amongst the
            7 days."

            **THE DIVISION IS `plan.kcalByWeekday` AND NOTHING HERE INVENTS A NEW ONE.** A day with
            a written targets.csv row uses that row; a day without one falls back to the same
            weekday structure `generate-targets.mjs` writes from. The foot says which days came
            from which, because "12,950" with no provenance is indistinguishable from a figure
            somebody typed.

            **THE OUT SIDE IS THE LEDGER, NOT A SECOND BURN MODEL.** Complete energy.csv rows
            contribute their own figures; the days that have not finished contribute the mean of
            exactly those rows. See scripts/lib/aggregate.mjs `weekEnergy`.

            ⚠ **A PROJECTION IS NOT A MEASUREMENT (INVARIANTS.md X-1).** The badges are computed
            from `estimatedBurnDays`, never hardcoded, so on a week whose every day is finished
            they disappear and the figures stop claiming to be forecasts. scripts/test-aggregations.mjs
            asserts the badge is attached to THESE tiles, not merely present in this file — the
            defect a previous check shipped was exactly that distinction.
          */}
          {wi.budget.total != null && wk.energy.inKcal != null && (
            <>
              <div className="grid cols-3" style={{ marginTop: 22 }}>
                <Tile
                  label="Estimated in"
                  value={fmt(wk.energy.inKcal)}
                  unit="kcal"
                  foot={
                    wk.energy.structureTargetDays === 0
                      ? 'all 7 days from the targets already written'
                      : `${wk.energy.writtenTargetDays} of 7 days from written targets · `
                        + `${wk.energy.structureTargetDays} from the plan's weekday structure`
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
                  badge={wk.energy.estimatedBurnDays > 0 ? 'projection' : undefined}
                  foot={
                    wk.energy.gapKcal == null || wk.energy.kcalPerLbFat == null
                      ? 'needs both sides of the week before it can say'
                      : `${fmt(wk.energy.gapKcal)} kcal more out than in, ÷ `
                        + `${wk.energy.kcalPerLbFat.toLocaleString()} kcal per lb of fat`
                  }
                />
              </div>
              <p className="footnote">
                {wk.energy.estimatedBurnDays > 0
                  ? `A projection, not a result: ${wk.energy.estimatedBurnDays} of the 7 days `
                    + 'have not finished, and they are costed at what your finished days have '
                    + 'actually burned. What the scale says is measured separately.'
                  : 'Every day this week is finished, so both sides are measured.'}
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
            as a literal naming his sport (INVARIANTS.md X-11, audit F-31). A chart that wrote none
            gets the first sentence and nothing more. */}
        {!sessions.length && templated && (
          <p className="footnote">
            From the block template — nothing logged for today yet.
            {plan.copy?.templateFlexNote ? ` ${plan.copy.templateFlexNote}` : ''}
          </p>
        )}
        {rx.length ? (
          <div className="scroll-x">
            <table>
              <thead>
                <tr><th className="text">Exercise</th><th>Prescribed</th><th className="text">Load</th><th>Sets done</th><th className="text">Status</th></tr>
              </thead>
              <tbody>
                {rx.map((p) => {
                  const done = loggedFor(p.exercise).length
                  const want = Number(p.sets) || 0
                  return (
                    <tr key={p.order}>
                      <td className="text">{p.exercise}</td>
                      <td>{p.sets} × {p.reps}</td>
                      <td className="text">{p.load || 'BW'}</td>
                      <td>{done} / {want || '—'}</td>
                      <td className="text">
                        {done === 0 ? 'not started' : want && done >= want ? 'done' : `${want - done} left`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : logged.length ? (
          <div className="scroll-x">
            <table>
              <thead><tr><th className="text">Exercise</th><th>Set</th><th>Load</th><th>Reps / time</th><th>RIR</th></tr></thead>
              <tbody>
                {logged.map((s, i) => (
                  <tr key={i}>
                    <td className="text">{s.exercise}</td>
                    <td>{s.set_index}</td>
                    <td>{s.load_lb ? `${s.load_lb} lb` : 'BW'}</td>
                    <td>{s.reps || (s.duration_s ? `${s.duration_s}s` : '—')}</td>
                    <td>{s.rir || <span className="tbd">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            {sessionName
              ? `${sessionName} has no set-by-set prescription — nothing logged yet.`
              : 'No prescription and no sets logged for today.'}
          </Empty>
        )}

        {rx.length > 0 && logged.length > 0 && (
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
          caption="Recorded from his own account and read off the labels — this is what he already
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
