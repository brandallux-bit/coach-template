import { Card, Empty, Masthead, Meter, Nav, Shell, Tile } from '@/components/ui'
import {
  allOf, coachNotes, fmt, meals, oneOf, plan, prescriptions, prettyDate, sets, today,
} from '@/lib/data'
import { rollDay } from '@/lib/rollup'

export const dynamic = 'force-dynamic'

export default function TodayPage() {
  const now = today()
  const d = rollDay(now)
  const note = oneOf(coachNotes, now)
  const rx = allOf(prescriptions, now).sort((a, b) => Number(a.order) - Number(b.order))
  const logged = allOf(sets, now)
  const todaysMeals = allOf(meals, now)
  const stepGoal = plan.stepsPerDayTarget

  // "Push-up (feet elevated)" and "Push-up (flat)" are the same prescribed movement performed at
  // two leverages — matching on the base name before the parenthetical keeps the count honest.
  const base = (s: string) => s.split(' (')[0].trim().toLowerCase()
  const loggedFor = (exercise: string) =>
    logged.filter((s) => s.exercise === exercise || base(s.exercise) === base(exercise))

  return (
    <Shell>
      <Masthead title="Today" sub={prettyDate(now)} />
      <Nav current="/today" />

      {note && (
        <Card title="From your coach">
          <div className="note-block">
            <p><strong>{note.headline}</strong></p>
            {note.note && <p>{note.note}</p>}
          </div>
        </Card>
      )}

      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <Tile label="Eaten" value={fmt(d.intakeKcal)} unit="kcal"
          foot={d.targetKcal ? `target ${d.targetKcal.toLocaleString()}` : 'no target set'} />
        <Tile label="Burned (est.)" value={fmt(d.burnKcal)} unit="kcal"
          foot={d.energyComplete ? 'complete' : 'partial — steps or intake still pending'} />
        <Tile label="Deficit so far" value={fmt(d.deficitKcal)} unit="kcal"
          foot="burn minus intake, today only" />
        <Tile label="Steps" value={fmt(d.steps)} unit=""
          foot={
            d.steps == null
              ? 'automation has not reported yet'
              : d.steps >= stepGoal
                ? `target ${stepGoal.toLocaleString()} — hit`
                : `${(stepGoal - d.steps).toLocaleString()} to the ${stepGoal.toLocaleString()} target`
          } />
      </div>

      <Card
        title="Meals"
        caption={
          d.targetKcal
            ? 'Three dials: a calorie ceiling, a protein floor, and the alcohol budget. Everything else lives inside them.'
            : 'No target written for today yet.'
        }
      >
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
        {d.alcoholKcal != null && d.alcoholKcal > 0 && (
          <p className="footnote">
            Alcohol: {Math.round(d.alcoholKcal).toLocaleString()} kcal today, included in the
            calorie figure above. Weekly budget is {plan.weeklyKcalBudget ? '~1,200–1,400' : ''} kcal.
          </p>
        )}
      </Card>

      <Card title="Logged so far" caption="Every item, as recorded. Confidence says how the number was arrived at.">
        {todaysMeals.length ? (
          <div className="scroll-x">
            <table>
              <thead>
                <tr><th className="text">Time</th><th className="text">Item</th><th>kcal</th><th>Protein</th><th>Fibre</th><th className="text">Confidence</th></tr>
              </thead>
              <tbody>
                {todaysMeals.map((m, i) => (
                  <tr key={i}>
                    <td className="text">{m.time || '—'}</td>
                    <td className="text">{m.item}</td>
                    <td>{m.kcal || '—'}</td>
                    <td>{m.protein_g || '—'}</td>
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
          d.sessions.length
            ? d.sessions.map((s) => `${s.session} — ${s.status}`).join(' · ')
            : 'No session written for today yet.'
        }
      >
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
          <Empty>No prescription and no sets logged for today.</Empty>
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

      <p className="footnote">
        Read-only. Logging happens in the coaching session, which writes <code>data/</code> and
        then the prose log.
      </p>
    </Shell>
  )
}
