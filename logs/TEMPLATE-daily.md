# YYYY-MM-DD

> **Before writing anything below, write the numbers into `data/` (CLAUDE.md §0.3).**
> Every figure in this file is a rendering of a row that already exists there:
> `data/body.csv` · `data/meals.csv` · `data/training.csv` · `data/sets.csv` ·
> `data/targets.csv`. Steps come from `data/steps.csv` (automated — never hand-enter).
> Then run `node scripts/compute-energy.mjs` and commit `data/energy.csv` with it.
>
> This file is for the *reasoning*. The numbers live in `data/`.
>
> **Keep only the sections this chart's domains need.** A chart with no training domain deletes
> *Training*; one that runs without daily targets deletes *Target today*; one with no tape domain
> deletes *Tape measurements*. A section no domain reads is a chore the coach invented (CLAUDE.md
> §1.1).

## Training
- Session: [planned / actual / skipped — and if skipped, the real reason]
- Key sets (exercise, weight x reps, RIR): *(→ `data/sets.csv`. **Log RIR on every set** —
  `goals.md`'s strength guardrail is ">10% loss of reps at fixed load AND fixed RIR" and
  cannot be evaluated without it. Band-assisted work: record band weight in the note, never
  as load — a heavier band is an easier set.)*
- Session RPE (1-10):
- Anything hurt: *(anything in `athlete/injury-history.md` or an active rehab document that this
  session touched, and how it went)*

## Nutrition
- Target today: *(→ `data/targets.csv`)*
- Ledger: *(→ `data/meals.csv`, one row per item. Alcohol kcal are **included in** the item's
  kcal, not added to them.)*
- Off-plan eating, and the trigger:

## Body
- Weight (fasted, post-void):
- Tape measurements (morning, fasted — take each one the same way every time; `photos/PROTOCOL.md`
  holds the protocol): `<site>` / `<site>`
- Steps: *(where this chart declares `plan.stepFeed` — the automated feed is the source of truth,
  never hand-enter. On a chart without one, delete this line: its movement term comes from
  `plan.movementOutsideExerciseLevel` and there is no step count to record.)*
- Registered metrics: *(one line per entry in `athlete/constants.json` → `metrics` whose `feed` is
  `manual`. **This template names none of them on purpose** — they are this chart's, and a shipped
  list of somebody else's would be the first thing a new athlete was asked to record. Add the ones
  this chart actually tracks, and delete this note.)*
- Sleep (hours / subjective quality 1-5):
- Energy (1-5):
- Hunger (1-5):
- Mood / stress (1-5):

## Notes
-
