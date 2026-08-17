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

Source, in this order — **all of it machine-readable. There is no prose fallback.**

1. **Which session** — today's row in `data/training.csv`. If there isn't one, read
   `athlete/constants.json` → `program.weeklyTemplate` for today's athlete-local weekday
   and mark it `(proposed)`; the block is a flexible framework, not a fixed grid, so an
   inferred session is a guess until it's recorded.
2. **Exercise list** — `data/prescriptions.csv`, **effective-dated**: the newest set of
   rows on or before today for that session name, in `order`. Plus the `Daily` rows and
   the `Supplements` rows, which run whatever today's session is (`data/METHOD.md`,
   reserved session names).
3. **If neither has anything, say "no session written for today yet" and stop.** Do not
   fall back to a table in `program/`.

   > **This was the bug.** The skill used to fall back to `program/current-block.md`'s
   > "weekly template" — and the section carrying that heading is the **preserved,
   > not-live, BJJ-anchored** one, kept deliberately for the Phase 4 revert. So a Monday
   > with no row surfaced *"BJJ (6pm), 90 min"*: the single activity the active rehab
   > block suspends, rendered as today's plan (audit F-35). **A fallback to a stale table
   > is worse than "no session written yet"** — the blank is obviously a blank, and the
   > stale table is indistinguishable from the plan.
   >
   > The same reasoning kills the old "write it into `data/prescriptions.csv` and render
   > from there" instruction: transcribing a preserved table into the live file is how a
   > superseded prescription becomes the current one. **A prescription row is written by
   > `skills/program-design`, in a session, on purpose — never by a rendering skill.**

4. **Anything ⛔ in `program/exercise-library.md` is out.** If he asks for a substitution
   mid-session, that banner — generated from the active block — is the answer, not the
   substitution table under it.
5. **Progress** — count today's rows in `data/sets.csv` **for this session** against the
   prescribed `sets`. Scope on session as well as exercise name: two sessions on one day
   share exercises, and matching on name alone renders an evening session's rows "done"
   because the morning logged them (audit F-53). Match on the base exercise name before
   any parenthetical, so "Push-up (feet elevated)" and "Push-up (flat)" both count toward
   the prescribed push-up.
6. Skip warm-up and cooldown rows — they aren't "exercises" in the sense he's asking
   for. Keep everything else, in order.

```
WORKOUT — Session B (Upper Push/Pull + Core)
Push-ups (feet-elevated)          3 x AMRAP-2
Single-arm KB overhead press      3 x 6-10 @ 35 lb
Bent-over row                     3 x 8-12 @ 50 lb DB
Band face-pulls                   2 x 15
KB curls + band curls             2 x 10-15
Suitcase carry                    3 x 40-55s/side @ 50 lb
Plank / dead bug                  2 x 30-45s
```

> **The shape is the example; the numbers are not.** Recompute every one from
> `prescriptions.csv`. The loads above read **35 lb** for the row and the carry until
> 2026-08-14 — both were re-anchored to **50 lb** on 08-11 at the athlete's own
> instruction, and the carry's 30-40 s dose sat entirely below the fire line of the
> strength marker it feeds, so a coach following this file verbatim rendered a
> superseded prescription into the chart he was shown (audit F-35, F-50).
> `scripts/test-single-home.mjs` §2b now fails on any load stated here that disagrees
> with the live row, which is why the example is kept rather than deleted: a rule with
> nothing to check certifies whatever happens next.

If the session was skipped or hasn't been decided yet, say that in one line instead of
rendering an empty table.

## Notes

- Read-only **as to measured data** — this skill never invents or records a weight, a meal
  or a set; logging happens through the normal session flow (CLAUDE.md §0.3). **One
  exception, and it is now the only one:** today's `targets.csv` row, which is a pure
  function of `plan.kcalByWeekday` and the calendar, gets **written to `data/` before it is
  rendered** — the same row `scripts/generate-targets.mjs` writes on a timer. The
  prescription exception was removed on 2026-08-14; see step 3 above for why a rendering
  skill must never write a prescription.
- Meals + workout only, per the athlete's spec — steps, weight, sleep, etc. aren't part
  of this view. Adding them is a scope change to this file, not something to improvise
  in the moment.
