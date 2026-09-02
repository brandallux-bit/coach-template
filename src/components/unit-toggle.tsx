'use client'

import { useState } from 'react'

/**
 * kcal ⇄ % for the meters inside it.
 *
 * WHY IT IS SHAPED LIKE THIS. An athlete asked for the toggle so they could see
 * how many calories I've consumed in each category vs the weekly target or toggle to what % of the
 * target I have consumed"* — and every other thing on `/today` is server-rendered from the bundle.
 * So `Meter` renders **both** forms and this component flips one attribute; the client boundary is
 * this file and nothing else. No figure, no target and no chart data crosses it: `children` arrives
 * as already-rendered server output.
 *
 * The alternative — passing a unit down as a prop — would have made every card holding a meter a
 * client component, which means shipping the day's calories, the week's budget and the plan
 * constants to the browser as props in order to change the word after a number.
 *
 * **`kcal` is the initial state on purpose.** It is the form the rest of the chart is written in,
 * and it is what the server renders, so the page reads correctly before any JavaScript arrives.
 */
export default function UnitToggle({ children }: { children: React.ReactNode }) {
  const [unit, setUnit] = useState<'kcal' | 'pct'>('kcal')

  return (
    <div className="unit-scope" data-unit={unit}>
      <div className="unit-switch" role="group" aria-label="Show figures as calories or percent">
        <button
          type="button" aria-pressed={unit === 'kcal'} onClick={() => setUnit('kcal')}
        >
          kcal
        </button>
        <button
          type="button" aria-pressed={unit === 'pct'} onClick={() => setUnit('pct')}
        >
          %
        </button>
      </div>
      {children}
    </div>
  )
}
