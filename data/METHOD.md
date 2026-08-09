# The Data Layer — schema, units, and how the numbers are derived

> **This directory is the source of truth for every number in the chart.** The prose logs in
> `logs/` explain *why*; these files record *what*. Where they disagree, `data/` wins — and a
> disagreement is a bug to fix, not a judgement call. See CLAUDE.md §0.3.
>
> **Who the athlete is lives in `athlete/constants.json`** — sex, height, date of birth, baseline,
> plan parameters, trigger values. Nothing in `scripts/` or `src/` may hardcode a value about the
> athlete. If you find one, it is a bug: move it to that file. This is what makes the repo
> forkable for a second athlete as a *data* change rather than a code change.

## Rules

1. **Write here first, then write the prose.** Never type a number twice from memory. Log the
   row, then reference it in the log. The prose is a rendering of this data, not a parallel copy.
2. **Append-only wherever possible.** `meals.csv`, `sets.csv` and `steps.csv` only ever gain rows.
   This matters: the athlete connects from several surfaces, and appended rows merge cleanly where
   rewritten files conflict (CLAUDE.md §0.1).
3. **Empty means unknown, not zero.** An empty cell is "not measured." A `0` is a measured zero.
   Breakfast skipped is `0` kcal. Fat not estimated is empty. Never write `0` to mean "we didn't
   look."
4. **`energy.csv` is generated, never hand-edited.** Run `node scripts/compute-energy.mjs`.
5. **Every file has a header row. Dates are `YYYY-MM-DD`. Text fields containing commas are
   double-quoted.** `scripts/validate-data.mjs` enforces all of it in CI.

## Files

### `body.csv` — one row per day. Measured.
| Column | Unit | Notes |
|---|---|---|
| `date` | YYYY-MM-DD | |
| `weight_lb` | lb | Fasted, post-void. The protocol reading only. |
| `waist_in` | in | At navel, **morning, fasted** (`photos/PROTOCOL.md`). Primary metric per `goals.md`. |
| `neck_in` | in | Same session as waist. |
| `sleep_h` | hours | |
| `sleep_quality` | 1–5 | |
| `energy` | 1–5 | |
| `hunger` | 1–5 | |
| `mood` | 1–5 | |
| `bowel_movements` | count | Supports `nutrition/supplements.md` flag 6. |
| `miralax` | y/n | |
| `note` | text | Why a reading is what it is, or why one is deliberately excluded. |

### `steps.csv` — one row per day. Machine-written.
Written by `.github/workflows/log-steps.yml` from an iOS Shortcut off Apple Health. **Never edit
by hand.** Columns: `date,steps`.

### `targets.csv` — one row per day. Prescribed.
What the plan asked for that day, recorded on the day it applied so history stays interpretable
after the plan changes. Columns:
`date,kcal,protein_g,fat_g,fibre_g,alcohol_kcal,note`

### `meals.csv` — one row per food or drink item. Measured/estimated intake.
| Column | Unit | Notes |
|---|---|---|
| `date` | YYYY-MM-DD | |
| `time` | HH:MM or `AM`/`PM` | Blank if unknown. |
| `item` | text | Quoted. What was actually eaten. |
| `kcal` | kcal | |
| `protein_g` / `fat_g` / `carb_g` / `fibre_g` | g | Empty = not estimated. |
| `alcohol_kcal` | kcal | The ethanol portion, **also included in `kcal`.** Never sum both. |
| `confidence` | `label` / `weighed` / `photo` / `estimate` / `athlete` | How the number was arrived at. `label` and `weighed` are hard; `photo` and `estimate` carry a band; `athlete` is his own recall of a meal not itemised at the table. |
| `note` | text | Band, assumptions, anything that would otherwise be lost. |

### `training.csv` — one row per session.
`date,type,session,status,rpe,duration_min,pain_flag,note`
- `type`: `strength` · `circuit` · `bjj` · `peloton` · `walk` · `rest` · `other`. This drives both
  the MET lookup below and the session count against the 3–4/week floor in `goals.md` — **walks
  are recorded but do not count toward the floor**, because their energy is already in `steps.csv`.
- `status`: `planned` · `completed` · `skipped` · `rest`
- `rpe`: 1–10. Empty if not reported — do not infer one.
- `pain_flag`: `y` if anything hurt, even sub-threshold soreness. The bright-line detail lives in
  the prose log; this column exists so the trend is visible without reading three months of it.

### `sets.csv` — one row per set. This is the strength guardrail's data source.
`date,session,exercise,set_index,load_lb,reps,duration_s,rir,note`
- `load_lb` empty = bodyweight. Put band assistance in `note` — **a heavier assist band is an
  easier set** (`goals.md`), so band weight is not load and must never be charted as such.
- `duration_s` for carries, planks, isometrics. `reps` for everything else.
- **`rir` is the column that makes the rest of the row mean anything.** `goals.md`'s strength
  trigger — >10% loss of reps at fixed load *and fixed RIR* — cannot be evaluated without it.

### `metrics.csv` — long format. Anything the fixed columns don't cover.
`date,metric,value,unit,note`

The wide files above are ergonomic but fixed: `body.csv` knows about weight, waist and
neck because those are near-universal. **A chart whose domains need something else —
reaction severity, foods successfully reintroduced, a lab value, elimination-phase day,
minutes without pain — records it here instead, with no schema change and no code edit.**

Every metric must be declared in `athlete/constants.json` under `metrics`, with its unit,
its direction (`up` or `down` — which way is progress), and **the `goals.md` domain it
serves.** The validator rejects an unregistered metric and a registry entry with no
domain, because a metric no domain needs is a chore the coach invented (CLAUDE.md §1.1).

### `energy.csv` — one row per day. **Generated. Do not edit.**
`date,rmr_kcal,tef_kcal,neat_other_kcal,steps_kcal,session_kcal,burn_total_kcal,intake_kcal,deficit_kcal,method_version`

---

## The burn model (`method_version: 1`)

Everything below is an estimate. That is not a disclaimer — the plan has always run on an
estimate (`nutrition/plan.md` sets maintenance at ~2,450 kcal). The point of writing it down is
that an estimate you can re-run and recalibrate is worth vastly more than one recomputed from
scratch, differently, in every conversation.

```
burn_total = rmr + tef + neat_other + steps_kcal + session_kcal
```

**`rmr` — Mifflin-St Jeor, recomputed daily from that day's weight.**
```
rmr = 10 × weight_kg + 6.25 × height_cm − 5 × age + sex_term
sex_term:  male +5   ·   female −161
```
Height, sex and date of birth come from `athlete/constants.json`; **age is derived from the date
being computed**, never stored, so a birthday mid-block is picked up rather than going stale.
At 181 lb, 69", 59, male this returns 1,627 — matching the 1,626 hard floor in
`nutrition/plan.md`, which is the point. Recomputing daily means the floor tracks the athlete
instead of a stale baseline. Carries forward from the last known weight on days without a weigh-in.

> ⚠ **The sex term is 166 kcal/day and nothing on screen reveals it.** A chart forked to a female
> athlete with `sex` left at `male` would overstate expenditure by ~1,160 kcal/week — about a
> third of a pound of phantom deficit — while every number still looked plausible. This is why
> `sex` is a required, validated field rather than a default.

**`tef` — thermic effect of food = 10% of intake.** Digestion has a real, non-trivial cost, and it
falls as intake falls, which is part of why deficits decay.

**`neat_other` = 10% of RMR.** Non-step movement: standing, fidgeting, carrying things. The
profile records high daily NEAT; this is the conservative floor for it.

**`steps_kcal = steps × 0.00025 × weight_lb`** — about 0.045 kcal/step at 181 lb, i.e. ~100 kcal
per 2,100-step mile. Scales with bodyweight, so it falls as he does.

**`session_kcal`** — MET-based: `kcal = MET × 3.5 × weight_kg / 200 × minutes`, unless the device
reported a real number, in which case **the device number wins** (Peloton reports ~360–385/ride).

| Session type | MET |
|---|---|
| Strength (Session A / B) | 5.0 |
| Garage circuit | 6.0 |
| BJJ | 10.0 |
| Peloton, high intensity | 8.5 *(prefer the bike's own number)* |
| Walking | **0 — already counted in steps** |

> ⚠ **The double-count trap, stated once so it doesn't get re-introduced.** Walks are already in
> `steps_kcal`. Never also add them as a session. And note the plan's own ~2,450 uses `RMR × 1.5`,
> where the 1.5 *already contains* all activity — that shortcut and this decomposition must never
> be mixed. This model deliberately starts from bare RMR and adds each activity explicitly.

**Sanity check, 181 lb, 9,000 steps, 1,850 kcal in, 40-min strength session:**
1,627 + 185 + 163 + 407 + 287 = **~2,669**, against the plan's flat ~2,450. `nutrition/plan.md`
states the 2,450 was "deliberately conservative — let observed data pull it up, not down," so a
higher figure from an itemised model is the expected direction, not a contradiction.

**Recalibration.** `nutrition/plan.md` schedules a maintenance review for **2026-08-27** from
observed intake and weight change. That review compares this model against reality
(`Δweight_lb × 3,500 ≈ Σ deficit_kcal`) and, if it's off, adjusts the constants and increments
`method_version` — leaving every historical row still readable under the model that produced it.
Recording the daily numbers is what makes that review possible with data instead of another guess.
