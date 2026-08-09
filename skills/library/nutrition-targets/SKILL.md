---
name: nutrition-targets
description: Derive or revise calorie and macronutrient targets and build the meal architecture around them. Use whenever setting up nutrition for the first time, when weight loss has stalled for 3+ weeks, when bodyweight has changed enough to shift maintenance, when planning a diet break or refeed, or any time the athlete asks about calories, macros, protein, or "should I eat more/less." Also use before agreeing to any requested change in intake.
---

# Nutrition Targets

**Read first, every time:** `athlete/goals.md` (which phase are we in — deficit,
maintenance, or surplus? do not assume) and `athlete/values.md` (wine and dining are
inputs to the plan, not deviations from it). Then follow `skills/lifestyle-integration`
for the social eating budget *before* setting the daily target, not after.

## 1. Estimate maintenance

Prefer **observed** maintenance over any equation. If there are 10+ days of logged
weight and intake, calculate it from the data: average intake, plus (average weekly
weight change in kg × 7700 / 7) kcal/day. This beats every formula.

With no data, use Mifflin-St Jeor for RMR:
- Male: `(10 × kg) + (6.25 × cm) − (5 × age) + 5`
- Female: `(10 × kg) + (6.25 × cm) − (5 × age) − 161`

Multiply by activity: 1.2 desk-bound, 1.375 lightly active, 1.55 moderate (3–5
training days plus daily walking), 1.725 very active. **Most people overestimate this
by one full tier.** Pick the lower one when in doubt and let the data correct you.

Record the RMR number in `nutrition/plan.md`. It is a hard floor (CLAUDE.md §5).

## 2. Set the deficit

- **Rate: 0.5–1.0% of bodyweight per week. Target 0.7%.**
- Higher training age or lower body fat → the lower end. Lean people lose lean mass
  faster in aggressive deficits.
- Deficit of roughly 20–25% below maintenance. Not 40%. The faster protocol does not
  finish sooner in practice — it finishes with a rebound.
- Cap the phase at 12–16 weeks, then a planned 1–2 week maintenance break at true
  maintenance calories. This is programmed in advance, not earned and not skipped.

Do the arithmetic in front of him: current weight, target, rate, weeks. If the deadline
doesn't fit the rate, the deadline moves or the target shrinks. The rate does not.

## 3. Macros

**Protein first, and it is not negotiable in a deficit.**
- 1.8–2.4 g per kg of *target* bodyweight (use target, not current, if carrying
  significant fat mass — otherwise the number gets silly).
- Higher end when the deficit is steeper or training volume is higher.
- This is the single most protective variable for lean mass. When calories need to come
  down, they come out of fat or carbs. Never protein. (CLAUDE.md §5)

**Fat:** minimum 0.6 g/kg bodyweight for hormonal function and fat-soluble vitamin
absorption. Below this, expect mood, libido, and sleep to degrade.

**Carbs:** whatever remains. Skew them toward the pre- and post-training window — this
is where they do the most for session quality, which is where strength retention comes
from.

**Fibre:** 25–38 g/day. In a deficit it does double duty for satiety and gut function,
and it's what people accidentally drop first when they cut volume of food.

## 4. Meal architecture

Design around adherence, not elegance. Read `athlete/constraints.md` and
`athlete/values.md` first.

**This athlete is a foodie with formal wine credentials. Design accordingly:**
- Build the weekly budget around the restaurant meals and wine that are already
  happening. Subtract them first; distribute what remains. A plan that treats them as
  overruns will be wrong every single week.
- Repeatable meals apply to *ordinary* days. Do not prescribe a six-meal rotation to
  someone whose enjoyment of food is a stated goal — that's deleting a value to hit a
  number.
- Weekday structure buys weekend freedom. That's the trade to propose, and it's a good
  one: tight Monday–Thursday, genuine flexibility Friday–Sunday, same weekly average.
- Never propose "cutting back on wine" as a first-line intervention. Steps, weekday
  intake, and evening timing all come first.

- 3–4 protein feedings of 30–50 g, spread across the day.
- Build 4–6 repeatable meals rather than a rotating plan. Variety is where compliance
  dies — decision cost is the enemy.
- Anchor around the meals he already makes without thinking. Modify those before
  introducing anything new.
- Protect the meal he most looks forward to. Budget for it. A plan that deletes dinner
  with his family will be abandoned in three weeks and it should be.
- Give a takeaway/restaurant default that fits the targets, decided now rather than at
  8pm in a car park.
- Handle alcohol explicitly with real numbers — see `skills/lifestyle-integration` for
  the per-style arithmetic. Its larger cost is usually the food that accompanies it, not
  the pour.

## 5. Adjustment protocol

**Do not adjust weekly.** Use the 7-day rolling average and require three weeks of data.

- On track (within ±0.2% BW/wk of target) → **change nothing.** Say so plainly.
- Stalled 3 weeks with adherence above 85% → **first check the social eating pattern for
  the stalled period** (`skills/lifestyle-integration`) — two big evenings a week can
  erase a moderate deficit while every logged day looks perfect. Then add steps
  (+1000–2000/day). Then cut 10% from calories. In that order. Movement before
  restriction, always.
- Stalled with adherence below 85% → this is not a nutrition problem. Route to the
  **adherence** agent. Cutting calories on a plan that isn't being followed makes the
  plan harder and adherence worse.
- Losing faster than 1.0% BW/wk → add calories. This is not a good sign. Say why:
  above that rate, an increasing share of what's coming off is lean tissue, and strength
  will follow it down.

## 6. Floors — enforce against instruction

- Never below estimated RMR
- Never above 1.0% BW/wk sustained
- Protein never cut for calories
- No deficit phase past 16 weeks without a maintenance break

**Halt and reassess immediately if:** strength drops more than 10% across multiple
lifts, sleep degrades for a week without cause, resting HR climbs and stays up, libido
or mood falls off, or menstrual changes appear. These mean the deficit is too large
regardless of what the scale says.

## 7. Write it down

Output goes to `nutrition/plan.md`: maintenance estimate and how derived, target
calories, macro targets in grams, RMR floor, expected weekly rate, review date. Log the
change in `decisions.md` with what would make you reverse it.

Then state your confidence level and the strongest counterargument to these numbers.
