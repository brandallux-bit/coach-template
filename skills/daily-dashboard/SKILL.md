---
name: daily-dashboard
description: Render today's meal-plan progress and today's workout as two compact charts, no prose. Use whenever the athlete asks to see his "dashboard," "daily dashboard," "today," or "what's left" — and automatically as the last thing in the response whenever a session opens on a new calendar day.
---

# Daily Dashboard

Two charts. No prose, no commentary, no coaching voice — just the numbers. If something
needs saying (a trigger fired, a safety flag, adherence dropped), say it elsewhere in the
response. This skill's own output stands alone.

## When to render it

- **On demand, any time during the day:** he asks to see the dashboard, "today," "my
  day," "what's left," etc. → reply with *only* the two charts below. Nothing before,
  nothing after.
- **At day start:** the first response in a new calendar day (per the session's current
  date) → render it as the **last** block of that response, after whatever else the
  session needed to say (trigger checks, weigh-in reaction, questions). Don't render it a
  second time later the same session unless he asks again — a mid-day ask always gets a
  freshly recomputed version, since the numbers will have moved.

## 1. Meals chart

Source, in this order — **all of it from `data/`, never from the prose log** (CLAUDE.md §0.3):

1. **Target** — today's row in `data/targets.csv`. If there isn't one yet, derive it from
   `nutrition/plan.md`'s weekly budget (weekday vs. weekend split, travel protocol if
   traveling), **write the row to `data/targets.csv` first**, then render it — don't show
   him a blank target, and don't render a target that isn't recorded.
2. **So far** — sum `kcal` / `protein_g` / `fat_g` / `fibre_g` across every row in
   `data/meals.csv` for today. Recompute from the item rows every time. An empty cell is
   "not estimated" and must not be summed as zero — if a column has no values at all for
   the day, that row of the chart reads TBD rather than 0.
3. **Left** — Target minus So far. If So far exceeds Target, show the overage as a
   negative number. Never clip it to zero and call it fine.

> The web dashboard's **Today** view renders this same data from the same files. They read
> one source, so they cannot drift — but if you ever find them disagreeing, `data/` is
> right and the renderer is broken.

Bar: 10 characters, `▓` filled proportional to % of target / `░` empty, capped at 10
blocks (100%) — an overage still shows 10/10 filled, plus the negative "Left" number, not
an 11th block.

```
MEALS — <Weekday> <YYYY-MM-DD>
              Target   So far    Left
Calories       1,750    1,240      510   ▓▓▓▓▓▓▓░░░ 71%
Protein (g)      165      112       53   ▓▓▓▓▓▓░░░░ 68%
Fat (g)           60       38       22   ▓▓▓▓▓▓░░░░ 63%
Fibre (g)         30       14       16   ▓▓▓▓░░░░░░ 47%
```

Numbers above are illustrative, not a template to copy verbatim — recompute for real.

## 2. Workout chart

Source, in this order:

1. **Which session** — today's row in `data/training.csv`. If there isn't one, derive it
   from `program/current-block.md`'s weekly template for today's day-of-week and mark it
   `(proposed)` — the block is explicitly a flexible framework, not a fixed grid, so an
   inferred session is a guess until it's recorded.
2. **Exercise list** — today's rows in `data/prescriptions.csv`, in `order`. If that's
   empty, pull the matching session's table (Session A / Session B / minimum-viable) from
   `program/current-block.md`, **write it into `data/prescriptions.csv`**, and render from
   there. Where a sharper load has been called out for today — e.g. after a knee event or
   a load bump — that is the number that goes in the row.
3. **Progress** — count today's rows in `data/sets.csv` per exercise against the
   prescribed `sets`. Match on the base exercise name before any parenthetical, so
   "Push-up (feet elevated)" and "Push-up (flat)" both count toward the prescribed push-up.
4. Skip warm-up and cooldown rows — they aren't "exercises" in the sense he's asking
   for. Keep everything else, in order.

```
WORKOUT — Session B (Upper Push/Pull + Core)
Push-ups (feet-elevated)          3 x AMRAP-2
Single-arm KB overhead press      3 x 6-10 @ 35 lb
Bent-over KB rows                 3 x 8-12 @ 35 lb
Band face-pulls                   2 x 15
KB curls + band curls             2 x 10-15
Suitcase carry                    3 x 30-40s/side @ 35 lb
Plank / dead bug                  2 x 30-45s
```

If the session was skipped or hasn't been decided yet, say that in one line instead of
rendering an empty table.

## Notes

- Read-only **as to measured data** — this skill never invents or records a weight, a meal
  or a set; logging happens through the normal session flow (CLAUDE.md §0.3). The two
  exceptions above are prescriptive, not measured: a target or a prescription derived from
  the plan gets **written to `data/` before it is rendered**, so the chart and the screen
  never show a number the record doesn't have.
- Meals + workout only, per the athlete's spec — steps, weight, sleep, etc. aren't part
  of this view. Adding them is a scope change to this file, not something to improvise
  in the moment.
