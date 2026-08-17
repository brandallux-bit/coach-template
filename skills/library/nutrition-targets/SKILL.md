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

Do the arithmetic in front of them: current weight, target, rate, weeks. If the deadline
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
- Anchor around the meals they already makes without thinking. Modify those before
  introducing anything new.
- Protect the meal they most looks forward to. Budget for it. A plan that deletes dinner
  with their family will be abandoned in three weeks and it should be.
- Give a takeaway/restaurant default that fits the targets, decided now rather than at
  8pm in a car park.
- Handle alcohol explicitly with real numbers — see `skills/lifestyle-integration` for
  the per-style arithmetic. Its larger cost is usually the food that accompanies it, not
  the pour.

## 5. Adjustment protocol

**Do not adjust weekly.** Use the 7-day rolling average and require three weeks of data.

- On track (within ±0.2% BW/wk of target) → **change nothing.** Say so plainly.
- Stalled 3 weeks with adherence above the **85%** stall-diagnosis gate → the plan is being
  followed well enough that a null result indicts the plan, so **first check the social
  eating pattern for the stalled period** (`skills/lifestyle-integration`) — two big
  evenings a week can erase a moderate deficit while every logged day looks perfect. Then
  add steps (+1000–2000/day). Then cut 10% from calories. In that order. Movement before
  restriction, always.
- Stalled below `plan.adherenceRoutingPct` (`athlete/constants.json`, **currently 80%**,
  from `CLAUDE.md` §7) → this is not a nutrition problem. Route to the **adherence**
  agent. Cutting calories on a plan that isn't being followed makes the plan harder and
  adherence worse.

> **This file routed the adherence agent at 85% while `CLAUDE.md` §7 routed at 80%
> (historical — not the live threshold)** (audit F-28); it now renders from the constant.
> The 85% above is a *different* decision — "can I
> read a stall as evidence about the plan?" — and it is the coach's number, unruled on. It
> is deliberately not collapsed into the routing threshold; see `skills/weekly-review`.
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

## 7. Write it down — `data/` first, prose second, in this order

**`nutrition/plan.md` is not where the athlete's calorie target lives.** It lives in
`athlete/constants.json` → `plan`, and `scripts/generate-targets.mjs` writes a
`data/targets.csv` row from it every morning on a timer, *"no AI, no coaching session, no
judgement."* Revise to 1,950 kcal, write it to `plan.md` as this skill used to say, and the
generator keeps emitting the **old** figure tomorrow morning and every morning after — and
because it never overwrites an existing row, the wrong row is durable. **They eats to a number
the coach believes it changed** (audit F-13).

Do these in order.

**1 · Write the constants.** `athlete/constants.json` → `plan`: `kcalByWeekday` (one entry
per athlete-local weekday abbreviation), `weeklyKcalBudget`, `proteinFloorG`, `proteinAimG`,
`fatTargetG`, `fibreTargetG`, `targetRateLbPerWk`, `estMaintenanceKcal`.

- **`sum(kcalByWeekday)` must equal `weeklyKcalBudget`.** `validate-data.mjs` enforces it —
  the weekday structure is the decision and the weekly figure is its total, so if they
  disagree one of them is a typo and the arithmetic says which.
- **Every value you change gets its `_provenance` entry updated in the same edit** (W0,
  X-16). A number you chose is `coach-proposed-unconfirmed` **with today's date**, never
  filed as their. Where they said it, quote them. Where it is arithmetic, name the inputs.
  A `coach-proposed-unconfirmed` value older than seven days becomes a finding, which is
  the mechanism by which "ask them" survives the end of this session.
- **Do not delete an unconfirmed value to make the marker go away**, and do not upgrade a
  marker without a quote (`data/METHOD.md`, "Provenance").

**2 · Fix today's row if it is already wrong.** `generate-targets.mjs` never overwrites, so
if `data/targets.csv` already carries today's row it still states the superseded figure.
Correct that row in place and say in its `note` that it was revised and why. A target row is
a prescription; leaving a superseded one on the day the plan changed is the whole defect
above, one row wide.

**3 · Run the checks. A failure is a hard stop.**

```
node scripts/validate-data.mjs
node scripts/test-provenance.mjs
node scripts/build-findings.mjs
```

Read what `build-findings` prints before you write a word of prose: it computes the §5.2
floors — the calorie target against estimated RMR, protein, the loss-rate ceiling, the
16-week deficit cap — and **surfaces them rather than blocking, which means nothing else
will stop you.** Raise anything `critical` with them first.

**4 · Then write the prose**, from the constants. `nutrition/plan.md`: the maintenance
estimate and how it was derived, the RMR floor, the expected weekly rate, the review date,
the meal architecture, and **the reasoning** — not a second copy of the figures. Where a
figure must appear, it must equal the constant; `scripts/test-single-home.mjs` §2 fails on a
disagreement, and it fails **by correcting the prose**, never the constant.

**5 · Commit and push immediately** (CLAUDE.md §0.3). Log the change in `decisions.md` with
what would make you reverse it, then state your confidence level and the strongest
counterargument to these numbers.

> **Anything the athlete has not ruled on stays visible rather than getting quietly
> settled.** As of 2026-08-14 the calorie figures, both protein numbers, fat and fibre are
> all `coach-proposed-unconfirmed` — their rate is on record in their own words and the budget
> that implements it is not. Ask; do not resolve it by choosing.
