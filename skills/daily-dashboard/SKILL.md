---
name: daily-dashboard
description: Render today's numbers as compact charts, no prose — today's targets where the chart has daily targets, today's session where it has a training domain, and today's manual daily metrics where the registry has any. Use whenever the athlete asks to see their "dashboard," "daily dashboard," "today," or "what's left" — and automatically as the last thing in the response whenever a session opens on a new calendar day.
---

# Daily Dashboard

Up to three blocks, **each rendered only where this chart has the domain for it**. No prose, no
commentary, no coaching voice — just the numbers. If something needs saying (a trigger fired, a
safety flag, adherence dropped), say it elsewhere in the response. This skill's own output stands
alone.

| Block | Rendered when | Read from |
|---|---|---|
| **1. Targets** | `plan.dailyKcalTargetPolicy` is not `none` | `data/targets.csv`, `data/meals.csv` |
| **2. Session** | the chart has a training domain and `program.weeklyTemplate` or a `training.csv` row | `data/training.csv`, `data/prescriptions.csv`, `data/sets.csv` |
| **3. Daily metrics** | any registry entry is `feed: manual` + `cadence: daily` | `athlete/constants.json` → `metrics`, `data/metrics.csv` |

A chart with none of the three renders nothing and says so in one line. A block rendered for a
domain the chart does not have — a meals chart on a chart that opted out of calorie targets — is
the default CLAUDE.md §1.1 exists to catch.

## When to render it

- **On demand, any time during the day:** they ask to see the dashboard, "today," "my
  day," "what's left," etc. → reply with *only* the two charts below. Nothing before,
  nothing after.
- **At day start:** the first response in a new calendar day (per the session's current
  date) → render it as the **last** block of that response, after whatever else the
  session needed to say (trigger checks, weigh-in reaction, questions). Don't render it a
  second time later the same session unless they ask again — a mid-day ask always gets a
  freshly recomputed version, since the numbers will have moved.

## 1. Targets chart — where the chart has daily targets

**Skip this block entirely on a chart whose `plan.dailyKcalTargetPolicy` is `none`.** Do not
render it with TBD in every cell and do not say "no target" — that chart has no target by its own
recorded decision.

Source, in this order — **all of it from `data/`, never from the prose log** (CLAUDE.md §0.3):

1. **Target** — today's row in `data/targets.csv`. If there isn't one yet, derive it from
   `nutrition/plan.md`'s weekly budget (weekday vs. weekend split, travel protocol if
   traveling), **write the row to `data/targets.csv` first**, then render it — don't show
   them a blank target, and don't render a target that isn't recorded.
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

## 2. Session chart — where the chart has a training domain

⚠ **RUN `skills/session-recommendation` FIRST, where this chart has a training domain and that
skill has been promoted into `skills/` from the library.** The weekly template is a weekday map and nothing in
it knows what the athlete actually did — rendering it as today's plan is how a session gets
proposed that repeats most of a hard one finished the day before. That skill reads the last three
days and returns a verdict; this one renders whatever it settled on. **This skill does not decide
what to train, and must not be used as a way of avoiding that decision.**

Where the chart has no training domain, or has not promoted the skill, render what the sources
below say and do not invent the step.

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
   > "weekly template" — and on the chart where this was found, the section carrying that
   > heading was a **preserved, not-live** one, kept deliberately for a planned revert. So a
   > weekday with no row surfaced the one activity the active rehab block had suspended,
   > rendered as today's plan (audit F-35). **A fallback to a stale table is worse than
   > "no session written yet"** — the blank is obviously a blank, and the stale table is
   > indistinguishable from the plan.
   >
   > The same reasoning kills the old "write it into `data/prescriptions.csv` and render
   > from there" instruction: transcribing a preserved table into the live file is how a
   > superseded prescription becomes the current one. **A prescription row is written by
   > `skills/program-design`, in a session, on purpose — never by a rendering skill.**

4. **Anything ⛔ in `program/exercise-library.md` is out**, where the chart has one. If the
   athlete asks for a substitution mid-session, that banner — generated from the active
   block — is the answer, not the substitution table under it.
5. **Progress** — count today's rows in `data/sets.csv` **for this session** against the
   prescribed `sets`. Scope on session as well as exercise name: two sessions on one day
   share exercises, and matching on name alone renders an evening session's rows "done"
   because the morning logged them (audit F-53). Match on the base exercise name before
   any parenthetical, so "Push-up (feet elevated)" and "Push-up (flat)" both count toward
   the prescribed push-up.
6. Skip warm-up and cooldown rows — they aren't "exercises" in the sense the athlete is
   asking for. Keep everything else, in order.

The shape of the block, with this chart's own session name and its own rows from
`data/prescriptions.csv`:

```
WORKOUT — <session name>
<exercise>                        <sets> x <reps> @ <load>
<exercise>                        <sets> x <reps>
...
```

> **The shape is the example; the numbers are not, and the example carries none.** Recompute
> every one from `prescriptions.csv`. An earlier version of this file stated real loads in the
> example, they went stale the day the athlete re-anchored them, and a coach following the file
> verbatim rendered a superseded prescription into the chart they were shown (audit F-35, F-50).
> `scripts/test-single-home.mjs` §2b fails on any load stated in this file that disagrees with
> the live row — so none is stated.

If the session was skipped or hasn't been decided yet, say that in one line instead of
rendering an empty table.

## 3. Daily metrics — where the registry has any

For every entry in `athlete/constants.json` → `metrics` with `feed: manual` and `cadence: daily`,
one line: the label, yesterday's value from `data/metrics.csv` or `—` if none, and today's if
already reported. This is CLAUDE.md §0.2's standing check made visible, in the athlete's own
vocabulary; it names nothing the registry does not.

```
METRICS — <Weekday> <YYYY-MM-DD>
<label>                 yesterday <value> <unit>    today —
```

## Notes

- Read-only **as to measured data** — this skill never invents or records a weight, a meal
  or a set; logging happens through the normal session flow (CLAUDE.md §0.3). **One
  exception, and it is now the only one:** today's `targets.csv` row, which is a pure
  function of `plan.kcalByWeekday` and the calendar, gets **written to `data/` before it is
  rendered** — the same row `scripts/generate-targets.mjs` writes on a timer. The
  prescription exception was removed on 2026-08-14; see step 3 above for why a rendering
  skill must never write a prescription.
- The three blocks above and nothing else — steps, weight, sleep and the like are not part of
  this view unless the registry makes one a daily manual metric. Adding a block is a scope change
  to this file, not something to improvise in the moment.
