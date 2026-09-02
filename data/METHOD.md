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

   **⚠ One file is exempt, and only one: `coach-notes.csv`.** Dismissing a note on `/today`
   deletes its row outright — no tombstone, no separate log of what was dismissed
   (`removeRow` in `scripts/lib/rowwrite.mjs`, `commitRemoval` in `src/lib/github.ts`). This is
   not a hole in the rule: every other row here is a **measurement**, and deleting one falsifies
   the record of what happened. A coach note is **editorial** — something the coach said, which
   the athlete has now read and finished with — so a dismissed one leaving no trace loses nothing
   that was ever a fact. Nothing else may be deleted, and `removeRow` refuses any file that is
   not `uniqueDate` because a click cannot name which of several rows on a date it meant.
3. **Empty means unknown, not zero.** An empty cell is "not measured." A `0` is a measured zero.
   Breakfast skipped is `0` kcal. Never write `0` to mean "we didn't look."

   **⚠ 3a. In `meals.csv`, `kcal`, `protein_g`, `fat_g`, `carb_g` and `fibre_g` are NEVER blank.
   Every food row carries an estimate for all five. No exceptions.** Rewritten 2026-08-13 at the
   athlete's instruction, after a review found **21 blank cells across 08-06 to 08-12** — including
   a restaurant salad whose menu panel gave 660 kcal / 51 g protein / 37 g carb / 12 g fibre, where
   fat was the *only* unknown and was trivially recoverable by difference. This clause previously
   read *"Fat not estimated is empty,"* which read as permission and was taken as one.

   **Why a blank is worse than an imperfect estimate.** Nothing downstream distinguishes "unknown"
   from "zero": `rollup`, `compute-energy` and every daily total sum the column and a blank
   contributes 0. So a blank is not an honest gap — **it is a silent zero that biases every total
   downward**, and it does so invisibly. 2026-08-12 read as 36.7 g of fat with one cell blank; the
   true figure was **72.7 g**. Both the coach and the athlete reasoned from the wrong number.

   **This does not conflict with CLAUDE.md §0.3 "never invent a number to fill a cell."** That rule
   forbids fabricating a *measurement*. An estimate carrying its derivation and its band in the
   `note`, and its quality in the `confidence` column, is not a fabrication — it is the estimate the
   coach is already making silently in order to give advice. Writing it down is what makes it
   checkable and correctable. A blank hides the same guess and makes it uncorrectable.

   **Order of preference for deriving a value:**
   1. **Label or published panel** — `confidence: label`.
   2. **By difference from the other macros**, when kcal and the rest are known. Atwater 4/4/9;
      if a fibre-heavy item won't reconcile, try fibre at 2 kcal/g and record which was used.
      `confidence: estimate`.
   3. **Component build-up** from named ingredients against USDA values — `confidence: estimate`.
   4. **Photo or portion estimate** against a size reference — `confidence: photo`.
   5. **The athlete's own recall** — `confidence: athlete`.

   **Whatever the method, the `note` must state it and give a band** when the estimate is loose.
   A wide band that is written down is a usable number; a blank is not. `scripts/validate-data.mjs`
   rejects a blank in any of the five columns.
4. **`energy.csv` is generated, never hand-edited.** Run `node scripts/compute-energy.mjs`.
5. **Every file has a header row. Dates are `YYYY-MM-DD`. Text fields containing commas are
   double-quoted.** `scripts/validate-data.mjs` enforces all of it in CI.
6. **⚠ The date on a row is the ATHLETE'S LOCAL DATE, from `plan.timezone` — never the coaching
   session's date.** Added 2026-08-08 after a real corruption: a dinner eaten at ~20:00 PDT
   Saturday was written to Sunday, because the session clock runs **UTC and the athlete is
   `America/Los_Angeles`, 7–8 hours behind**. Eight meal rows, a `targets.csv` row and a whole
   day's log file landed on the wrong day, and the day's arithmetic was wrong in both directions —
   dinner measured against an empty Sunday instead of a Saturday that already held 1,090 kcal.
   **This is not an edge case: every session between 17:00 and midnight Pacific will be handed the
   wrong date**, which is most of when dinner actually gets reported.

   **This happened a second time on 2026-08-11** (a snack written to 08-12) — proof that a
   paragraph telling the session to "derive it, don't read it" is not a control, only a
   suggestion a session can forget to follow. It is now enforced in code, not just documented:

   - `scripts/lib/athlete.mjs` exports `localToday()` — the one implementation of this
     computation, from `athlete.timezone`.
   - `scripts/lib/rowwrite.mjs`'s `validateRow()` rejects any row dated after `localToday()`.
     This is the function both the dashboard's write route (`src/lib/log-write.ts` →
     `src/app/api/log/route.ts`) and a coaching session's own writes are expected to pass through.
   - `scripts/validate-data.mjs` independently checks every date column in `data/` against
     `localToday()` and fails the build (exit 1) if anything is dated later — the backstop for
     any row that reached a file without going through `validateRow()` first, including a
     session's raw file edit. **CLAUDE.md §0.3 requires running this before every commit that
     touches `data/`; a red validator blocks the commit, full stop.**
   - `scripts/test-rowwrite.mjs` carries a permanent regression test asserting a tomorrow-dated
     row is rejected.

   **⚠ 6a. ONE carve-out, added 2026-08-13: a `training.csv` row with `status: planned` MAY be
   dated ahead.** Nothing else may be, ever.

   **Why the rule needed one.** Rule 6 exists because *observations* landed on the wrong day. That
   reasoning is untouched for anything measured. **But the schedule is intrinsically about days
   that have not happened**, and with no forward row the chart had no way to express a one-off
   change to a future day. The athlete said on 2026-08-13 that they could not train Friday; the
   template still put a session there, and the dashboard kept showing it. They raised it **three
   times** before this was fixed rather than worked around — the third time after building the
   Next 7 Days page specifically so they could see it coming.

   **All three conditions are required**, enforced by `futureRowRejection()` in
   `scripts/lib/rowwrite.mjs` and applied by both `validateRow()` and `validate-data.mjs`:
   - `training.csv` only. `meals.csv`, `sets.csv`, `body.csv`, `steps.csv` stay rejected outright.
   - `status` is exactly `planned`. **A future `completed` row is a clock bug by definition.**
   - Every outcome column empty: `rpe`, `pain_flag`, `kcal_override`, `light_min`, `moderate_min`,
     `hard_min`. `duration_min` is allowed — it is the *planned* duration.

   **`compute-energy.mjs` independently skips any date after `localToday()`**, so even a row that
   slipped past both checks cannot manufacture burn for a day that has not happened. `energy.csv`
   stays a ledger of what happened. Regression tests in `scripts/test-rowwrite.mjs` cover the
   allowed case, the rejected `completed` case, each outcome column, and leakage into `sets.csv`.

   A session should still derive the date rather than read its own clock — `localToday()` is the
   canonical way, and matches what `today()` in `src/lib/data.ts` computes, which is why **the
   dashboard is authoritative on what day it is and the session prompt is not.** But the rule no
   longer depends on a session remembering to do that: if it doesn't, the write is rejected at
   `validateRow()` and, failing that, the commit is rejected by `validate-data.mjs`. Two
   independent enforcement points, not one paragraph.

   **⚠ 6b. A row can land on the wrong day even when `localToday()` is called correctly and even
   when nothing above is broken, added 2026-08-16.** Rules 6 and 6a are both about *how* the date
   gets computed — a wrong offset, a missing carve-out. This is about *when* it gets computed.
   `localToday()` always answers correctly for the instant it runs. It says nothing about whether
   that instant is still the instant the athlete meant.

   **What happened.** They reported a cereal snack around 22:30 Pacific on 2026-08-15. A long
   git-infrastructure investigation ran before the row was actually written. By the time
   `localToday()` was called, real time had crossed local midnight, and the row was stamped
   2026-08-16 — one day after the meal, correctly derived and completely wrong. Nothing rejected
   it: a row dated the current day is always valid, so this is a semantic error, not a validity
   one, and no check in `validate-data.mjs` or `validateRow()` can catch it the way 6/6a's tests
   catch a future date. **A session cannot be trusted to re-derive the date lazily, right before
   the write, if anything — a digression, a permission block, a long tool chain — intervened
   since the athlete's report.**

   **The rule: capture the date once, at the moment a dated claim is made** (food eaten, a set
   done, a weigh-in reported) — before doing anything else — **and write the row against that
   captured value**, not against a fresh `localToday()` call made later. If a session is already
   well into unrelated work when it realizes a dated claim from earlier still needs writing, and
   there is any chance local midnight has passed since, ask rather than assume: *"you said that
   around 10:30pm — still the 15th for you, or has it rolled to the 16th?"* This is procedural,
   not enforceable in code — unlike 6/6a, there is no fixture that can watch a session's internal
   timing and fail the build on it.

## Provenance — every number records who it came from

> **⚠ Added after three numbers a coach produced were written into an athlete's own chart in a
> single day and became indistinguishable from things they had said.**
>
> - **A weight ceiling**, invented and recorded in `goals.md` beside a floor they did own. An athlete who reads a goal they never set does not read it as a typo. They read it as the system inventing things about them — and one of them said exactly that, in terms that included abandoning the chart if the number were ever approached.
> - **A blood-pressure threshold**, invented to make the coach's own failing check go green — a
>   clinical decision belonging to them and their doctor, made to satisfy a test.
> - **A BMI justification** for a weight floor, in a chart whose `profile.md` bans BMI outright and
>   simultaneously claimed no threshold anywhere referenced it.
>
> All three sat in files whose entire purpose is to hold **what the athlete wants**. That is the
> most dangerous failure this system has, because every other number can be recomputed and this
> one cannot: there is no way to re-derive a goal from data.

**Every threshold, target, trigger and plan constant carries a marker saying where it came from.**
The marker answers one question: *did the athlete say this, or did the coach?*

| Marker | Means | What must be on the record with it |
|---|---|---|
| `athlete-stated` | They said it, or they measured it and reported it. It is theirs. | The quote, or the row and protocol the reading came from — plus the date |
| `athlete-confirmed` | The coach produced it; they have since ruled on it and kept it | The quote in which they ruled, and the date |
| `coach-proposed-unconfirmed` | **The coach produced it. They have not ruled on it.** | The date it was proposed, and where the reasoning is written down |
| `derived` | Arithmetic over values that are themselves recorded | **The inputs, named** — not only the result |
| `external` | A source outside this conversation that can be cited and re-checked: a doctor, a lab, a published table (the Compendium, Mifflin-St Jeor), or the charter's own standing floors | The citation |

### The five rules that make the vocabulary mean something

1. **`coach-proposed-unconfirmed` is a normal, healthy state, not an error.** The coach's job is to
   propose (`CLAUDE.md` §1: *set goals, design activities, recommend, argue*). The defect is never
   that a number was proposed — it is that a proposal was **filed as though it were theirs**. A value
   marked this way is doing exactly what it should: waiting, visibly, for them to rule.

2. **Never delete an unconfirmed value to make the marker go away.** Deleting a threshold nobody
   has confirmed substitutes the coach's judgement for the athlete's just as surely as inventing
   one does — it is the same act with the sign flipped. A deficit with no lower bound is worse
   than one bounded slightly wrong (`decisions.md` 2026-08-11, rejected alternative (d)). Leave it
   live, mark it, and surface it.

3. **Never invent a value to fill a marker, and never upgrade a marker without a quote.**
   `athlete-confirmed` requires words they actually said about *that number*. Adherence is not
   confirmation: they have eaten to the protein floor for a week, and that tells you they are
   following the plan, not that the number is theirs. Inferring confirmation from behaviour is how
   the invented weight ceiling above would have survived.

4. **Classify at the decision site; downstream arithmetic is `derived`.** `weeklyKcalBudget` is the
   sum of `kcalByWeekday`, so the judgement lives on `kcalByWeekday` and the budget is `derived`.
   Marking both `coach-proposed-unconfirmed` would report one decision twice, and a findings
   channel that repeats itself is one that gets skimmed.

5. **`derived` versus `coach-proposed-unconfirmed` — the test is who settles it.** A value the
   athlete settles by *ruling on it* — a goal, a threshold, a trigger, a floor, a ceiling, a
   target they are asked to hit — is `coach-proposed-unconfirmed` until they do. A value that
   measurement settles — an RMR estimate, a maintenance figure, a MET — is `derived` or `external`
   even though the coach chose its coefficients, because their opinion is not what makes it right.
   **Name the coefficient anyway.** `estMaintenanceKcal` is `derived`, and its entry says out loud
   that the ×1.5 multiplier is the coach's and that 2026-08-27 replaces it with observed data.

### Where the markers live, and what checks them

`athlete/constants.json` carries a `_provenance` map inside each of `baseline`, `plan` and
`triggers` — the three sections that hold the anchor, the targets and the thresholds. The map's
keys mirror that section's real keys one-for-one. It is `_`-prefixed like every other metadata key
in the file, so `stripNotes()` in `scripts/lib/athlete.mjs` removes it before the dashboard bundle
is built and no view can accidentally render it.

- `scripts/lib/provenance.mjs` — the vocabulary and the audit, as one pure function.
- `scripts/test-provenance.mjs` — every non-`_` key in those three sections has a well-formed
  marker. Ships with red fixtures, per `docs/INVARIANTS.md` X-10.
- `scripts/lib/findings.mjs` — a `coach-proposed-unconfirmed` value older than **7 days** becomes
  a finding: *this number is the coach's, they have not ruled on it.* **It reports and never blocks**
  — a missing ruling is not fixable by editing the record, and the whole reason this section
  exists is a check that pressured the coach into inventing a clinical threshold to go green
  (`docs/INVARIANTS.md`, "What each layer is for").

`program`, `events`, `metrics` and `athlete` are not yet marked. Add them to
`PROVENANCE_SECTIONS` when they carry markers.

## Files

### `body.csv` — one row per day. Measured.
| Column | Unit | Notes |
|---|---|---|
| `date` | YYYY-MM-DD | |
| `weight_lb` | lb | Fasted, post-void. The protocol reading only. |
| `waist_in` | in | Measured to a written protocol, the same way every time. Where the chart takes photos, `photos/PROTOCOL.md` holds it. |
| `neck_in` | in | Same session as waist. |
| `sleep_h` | hours | Machine-written where available — see below. |
| `sleep_quality` | 1–5 | Subjective; always hand-entered, never from the watch. |
| `resting_hr_overnight` | bpm | Machine-written where available — see below. Feeds any `goals.md` trigger phrased on a resting-HR trend. |
| `energy` | 1–5 | |
| `hunger` | 1–5 | |
| `mood` | 1–5 | |
| `note` | text | Why a reading is what it is, or why one is deliberately excluded. |

> ⚠ **These columns are the universal ones, and the list is closed on purpose. Everything else
> goes in `metrics.csv`.**
>
> This table used to carry two more: `bowel_movements` and a brand-name laxative, belonging to the
> athlete this system was first built for. They were an X-11 breach the leak scanner structurally
> **cannot see** — its denylist is derived from structured fields, and a medication in a *column
> name* is exactly what that misses (`scripts/lib/athlete-leak.mjs`, the note above `denylistFrom`).
>
> **The argument that settled it:** if one athlete's medication earns a column, every other
> athlete's does too, and the schema becomes a pharmacy. And a column *asks a question* — a chart
> whose athlete never raised digestion should never put a bowel-movement box in front of them.
> Most people have no interest in tracking it, and the ones who do said so at intake.
>
> So the rule is: **a reading gets a fixed column only if it is worth asking every athlete for.**
> Anything a particular chart tracks — a symptom count, a medication, a lab value, a device
> reading — is a row in `metrics.csv`, named in that athlete's own vocabulary, with the Log page's
> "Anything else" form and `metricsRegistry` in `athlete/constants.json` to give it a label and a
> unit. Nothing is lost by moving: it charts the same way, and it stops being a question every
> future athlete gets asked.

> **`sleep_h` and `resting_hr_overnight` are machine-written where a value is available**, by the
> same iOS Shortcut and `.github/workflows/log-steps.yml` job that writes `steps.csv` — a second
> `Find Health Samples` query added to the same automation, per `logs/weekly-review-2026-W32.md`
> §5's recommendation to change the workflow rather than ask for a new manual habit
> (`athlete/precommitments.md`). Unlike `steps.csv`, `body.csv` is multi-source and NOT
> append-only-replace: `scripts/log-sleep-row.mjs` uses `mergeIntoExisting` (`scripts/lib/rowwrite.mjs`)
> to merge only these two columns into whatever row already exists for that date, the same
> mechanism the dashboard's own write path uses, so an automated write can never blank a same-day
> weigh-in or waist reading. Either field is skipped independently when Apple Health has no value
> for that night — an empty cell here still means "not measured," never a zero (rule 3).
>
> **The date is the wake day, not "yesterday" like `steps.csv`.** A night's sleep completes when
> the athlete wakes, not at the end of the calendar day, so there is no same-day-partial-total risk
> the way there is for a running step count — `scripts/log-sleep-row.mjs` therefore only rejects a
> *future*-dated row (rule 6), not a same-day one. Do not copy `steps.csv`'s "yesterday" convention
> onto this feed; the two columns are dated on purpose-different logic for different reasons.
>
> `sleep_quality` stays out of this automation entirely — a watch cannot report how the athlete
> felt about the night. Where a chart carries a sleep-related specialization in
> `athlete/specialization/`, check it before trusting a stage-estimate proxy: the subjective read
> (awakenings, time back to sleep, morning grogginess) is usually what actually answers the "does
> duration track quality" question.

### `steps.csv` — one row per day. Machine-written. **Only on a chart with a step feed.**
Written by `.github/workflows/log-steps.yml` from an iOS Shortcut off Apple Health. **Never edit
by hand.** Columns: `date,steps`.

> A chart that declares no `plan.stepFeed` leaves this file empty for good, and nothing treats that
> as a fault: its movement term is `incidental_kcal` instead (see the burn model below), the daily
> gap check exits cleanly rather than mailing a failure every morning, and the stale-feed finding
> never fires. What a declared feed buys is the opposite: a feed that has never once written a row
> is now reported, because the declaration is what makes "it broke" distinguishable from "there
> isn't one".

> ⚠ **`steps` is a COMPLETED day's total, and that is the column's whole meaning.** The feed's
> contract is *yesterday's* finished count; `compute-energy.mjs` multiplies it straight into
> `steps_kcal`, and it is what makes `complete=y` mean anything.
>
> **A same-day count is therefore refused** — `scripts/log-steps-row.mjs` rejects any payload
> dated athlete-local today or later. The Shortcut sometimes fires early and sends the *current
> running* total instead — on the chart this rule was written for, four such partials were written
> as if they were finished days, each a two-digit or low-three-digit count against a real total in
> the thousands. Each **flipped its day to `complete=y` on ~1 kcal of step burn** and understated
> that day's burn by roughly 400 kcal, silently.
>
> **This is a fidelity rule, not a judgement, and the distinction is load-bearing.** The reading is
> not doubted; it is simply not the quantity this column holds, exactly as a UTC-dated observation
> is not doubted but carries the wrong date (rule 6). **A low but COMPLETED day is true and is
> written without argument** — a 900-step day after a migraine is a fact. It produces a *finding*
> for the coach (`steps-implausible`, under ~1,500), which is information for a conversation and
> can never fail anything. Nothing here may ever refuse a row because a number looks wrong.
>
> A genuine backfill of today goes through a coaching session editing the file once the day is
> over, the same hatch every other automated writer has.

### `targets.csv` — one row per day. Prescribed. **Generated on a timer; overridable.**
Written by `scripts/generate-targets.mjs`, run daily by `.github/workflows/daily-rollover.yml`
at 09:00 UTC. The day's figure is a pure function of `plan.kcalByWeekday` and the calendar —
there was never anything here for a conversation to decide, and until 2026-08-11 it was typed in
by hand anyway, so the dashboard read "no target set" until a session happened.

**The generator never overwrites an existing row.** A row already on file is a deliberate
override — the big social dinner moving off Saturday, a travel day, a planned refeed — and the
script has no opinion about it. To change a day, write that day's row; the generator will leave
it alone. It appends a single line rather than reserialising the file, which preserves the
append-only property in rule 2 above.

> ### ⚠ A DAY MAY NEVER LACK A CALORIE TARGET
>
> **`plan.kcalByWeekday` is the fallback and it ALWAYS answers. Prose may REFINE a target; it may
> never SUPPRESS one.** The only exception is an explicit instruction from the athlete for a
> specific day — *"I don't want a target for this day"* — which has never happened.
>
> **Why this is written down.** An automated pre-dawn job once read a nutrition plan's travel
> protocol — *"a hard calorie ceiling"*, with no file anywhere saying what that ceiling is —
> reasoned that the weekday figure would contradict the prose and that full maintenance would be a
> guess in the other direction, recorded that reasoning in `decisions.md`, and wrote **nothing**.
> The athlete woke up travelling with no target and said: *"There is ALWAYS a target for every day.
> That is a bug."*
>
> `scripts/generate-targets.mjs` was never broken — run by hand it wrote that day's row from the
> weekday structure immediately. **The defect is that prose reasoning was allowed to override a
> machine-readable structure that had the answer all along**, and prose reasoning is precisely what
> an automated session will produce again unless the rule is stated where it will be read.
>
> A generated row is not a claim that a coaching session reviewed it — the `note` says so in
> those words, and a session that wants a different number writes that day's row, which the
> generator then leaves alone. **A refinement nobody has written yet is not a reason to leave the
> day blank.**
>
> Enforced by `scripts/check-targets-gap.mjs` (in `check-all.mjs`, therefore in every bot before
> every push): every day from the first row on file through athlete-local today has a row with a
> `kcal` figure. It is a **hard error**, not a finding, because unlike a missing steps row it is
> fixable by editing the record — `node scripts/generate-targets.mjs --fill-gaps` — and it never
> asks anyone to choose a number. `.github/workflows/daily-rollover.yml` applies `--fill-gaps`, so
> a dropped cron slot no longer leaves a day empty forever. The rule and its known limits live in
> `scripts/lib/targets.mjs`.


What the plan asked for that day, recorded on the day it applied so history stays interpretable
after the plan changes. Columns:
`date,kcal,protein_g,fat_g,fibre_g,alcohol_kcal,note`

> **⚠ `alcohol_kcal` is BLANK on every generated row, and that is deliberate — see below.**

### The weekly budget, and why alcohol has no daily column entry

Three figures, and **only two of them are written down**:

| Figure | Where it lives | Class |
|---|---|---|
| Weekly calorie budget | `plan.weeklyKcalBudget` | the sum of `plan.kcalByWeekday`, checked by `validate-data.mjs` |
| Weekly alcohol allowance | `plan.weeklyAlcoholKcalBudget` | the athlete's, and `athlete-confirmed` where they have ruled on it |
| **Weekly food allowance** | **nowhere — derived** | `weeklyBudget()` in `scripts/lib/aggregate.mjs` |

**Alcohol sits inside the calorie budget, never on top of it** — planned into the weekly budget,
not charged as a penalty. So the food allowance is a subtraction, and writing its result
into `constants.json` would create three numbers that must satisfy an identity with nothing
checking it — X-8 exactly. `scripts/test-aggregations.mjs` scans every file in the repo for the
derived figure and fails if it appears, prose included. `validate-data.mjs` separately refuses an
alcohol allowance that is not strictly below the calorie budget, because a food allowance of zero
or less is a record contradicting itself.

**There is no per-day alcohol allocation, and one must never be invented.** The budget is weekly
*because the unevenness is the plan*: a big night is typically scheduled at the weekend and away
from the hardest training evenings, so an allowance divided by seven would mark an ordinary
midweek glass as an overage and the planned weekend bottle as a blow-out.
`scripts/generate-targets.mjs` therefore writes `alcohol_kcal` blank on every row it generates. A
coaching session may still write a real allowance into a single day, and `/today`'s daily meter
renders it where it exists; on every other day the daily row shows what was drunk with no
denominator, and the denominator lives on the weekly card.

**A week-to-date figure is never compared against a full-week budget without a pace figure beside
it.** Three days in, 4,000 kcal against 12,950 reads as 31% used and looks like enormous headroom.
The budget stays the denominator — that is what the athlete asked to see — and the pace is
`Σ targets.kcal` **over the same days the consumed figure covers**, never `budget × days ÷ 7`: this
chart's budget is deliberately uneven, so a 5/7 proration invents 700 kcal that nobody planned.

### `meals.csv` — one row per food or drink item. Measured/estimated intake.
| Column | Unit | Notes |
|---|---|---|
| `date` | YYYY-MM-DD | |
| `time` | HH:MM or `AM`/`PM` | Blank if unknown. |
| `item` | text | Quoted. What was actually eaten. |
| `kcal` | kcal | |
| `protein_g` / `fat_g` / `carb_g` / `fibre_g` | g | Empty = not estimated. |
| `alcohol_kcal` | kcal | The ethanol portion, **also included in `kcal`.** Never sum both. |
| `confidence` | `label` / `weighed` / `photo` / `estimate` / `athlete` | How the number was arrived at. `label` and `weighed` are hard; `photo` and `estimate` carry a band; `athlete` is their own recall of a meal not itemised at the table. |
| `note` | text | Band, assumptions, anything that would otherwise be lost. |

### `training.csv` — one row per session.
`date,type,session,status,rpe,duration_min,pain_flag,note,kcal_override,light_min,moderate_min,hard_min`
- `type`: the chart's own session-type registry — `sessionTypes` in `athlete/constants.json`, plus
  the two universal entries `rest` and `other` that every chart gets. The enum is **derived from
  that registry**, not listed here (`SPEC` in `scripts/lib/schema.mjs`). It drives both the MET
  lookup below and the session count against whatever sessions floor `goals.md` sets — and each
  entry declares whether it `countsTowardFloor`. **A walking type is recorded but must not count**,
  because its energy is already in `steps.csv`.
- `status`: `planned` · `completed` · `skipped` · `rest`
- `rpe`: 1–10. Empty if not reported — do not infer one.
- `pain_flag`: `y` if anything hurt, even sub-threshold soreness. The bright-line detail lives in
  the prose log; this column exists so the trend is visible without reading three months of it.
- `kcal_override`: empty by default — `compute-energy.mjs` uses the MET formula below. Set this to
  make **the device number win**, per the rule already stated in the burn model section. Reserve it
  for an actual device reading, or a case the intensity split below can't represent — always put
  the reasoning in `note`; an override with no explanation is indistinguishable from a number
  someone liked better.
- `light_min` / `moderate_min` / `hard_min`: optional breakdown of `duration_min` by intensity, for
  a session that wasn't uniform throughout — **a 60–90 minute class is almost never 60–90 minutes
  at competition pace**, and the flat per-`type` MET below was implicitly assuming it was. When any
  of the three is set, `compute-energy.mjs` applies a per-tier MET
  (`metForIntensity` in `scripts/lib/athlete.mjs`) to each segment instead of one MET across the
  whole duration.

  **⚠ The parts must not EXCEED `duration_min` — and any shortfall is assigned, not left.**
  Rewritten 2026-08-14 (W4). This used to read *"the three don't have to add up to `duration_min`
  — some of a session may not cleanly fit a tier"*, and that sentence was the defect: because
  `compute-energy.mjs` ignores `duration_min` entirely once any tier is set, **every unassigned
  minute costs nothing.** An 80-minute class logged as `hard_min=20` — the athlete characterising
  the hard rounds, which is how people describe a class — validated with zero errors and
  contributed **295 kcal against a real ~1,180**, leaving that day's deficit 885 kcal too large and
  rendered as an ordinary confident number.

  So: `coverIntensitySplit()` in `scripts/lib/rowwrite.mjs` assigns the remainder to `light_min`
  on the write path and **writes a sentence into the row's `note` saying it did**. An assumption
  on the record is correctable; a silent zero is not. `validate-data.mjs` still **errors** when the
  parts exceed the duration — that is a logged contradiction — and only **warns** on a shortfall,
  printing the corrected split. It must never error there: that would force a session logging
  *"80 minute class, 20 of it hard"* to fabricate the other 60 minutes, which rule 3 and
  CLAUDE.md §0.3 forbid outright.

  **Only the types whose registry entry carries a sourced 3-tier table get per-tier resolution**
  (each entry cites the Compendium of Physical Activities code its values came from); logging a
  split for any other type falls back to that type's flat MET on every tier, which is harmless but
  adds no precision until a table exists for it. `kcal_override` still wins over this when both
  are present.

### `sets.csv` — one row per set. This is the strength guardrail's data source.
`date,session,exercise,set_index,load_lb,reps,duration_s,rir,note`
- `load_lb` empty = bodyweight. Put band assistance in `note` — **a heavier assist band is an
  easier set** (`goals.md`), so band weight is not load and must never be charted as such.
- `duration_s` for carries, planks, isometrics. `reps` for everything else.
- **`rir` is the column that makes the rest of the row mean anything.** `goals.md`'s strength
  trigger — >10% loss of reps at fixed load *and fixed RIR* — cannot be evaluated without it.

### `prescriptions.csv` — one row per prescribed exercise. **Effective-dated, not day-specific.**
`date,session,order,exercise,sets,reps,load,note`

**`date` is when the prescription took effect, not the day it is performed.** A row applies to
every later occurrence of its `session` until a newer set of rows for the same session supersedes
it. The Today tab resolves *the newest set on or before today for today's session name*; a row
dated exactly today overrides, for a one-off change to a single day.

> **Changed 2026-08-11, and worth knowing why.** These rows were previously pinned to a single
> date, which meant the Today tab could only show a workout on days a coaching session had
> hand-retyped all seven rows. It silently showed "no prescription and no sets logged for today"
> on every other day — including days the block clearly prescribes a session. **A file that has
> to be manually re-keyed each morning to stay correct will be wrong most mornings.**

The block's weekly skeleton — which session lands on which weekday — lives in
`athlete/constants.json` under `program.weeklyTemplate`, for the same reason: so today's plan is
*derived*, not transcribed. **A written `training.csv` row always wins over the template.** The
template is what the day defaults to; `training.csv` is what actually happened.

> **⚠ `Daily` is a RESERVED session name — work that runs every day, whatever today's session is.**
> The case it was built for is a rehab or mobility routine that runs every day. Rows with
> `session = "Daily"` resolve through the *same* effective-dating as every other session and
> render in their own **"Every day"** card on the Today tab, in addition to today's session.
>
> **Why it had to be a mechanism and not a convention.** A daily prescription could otherwise only
> be expressed by copying it onto every session name — 7+ sessions × N exercises — which goes
> stale the instant a session is renamed and silently drops the routine on any weekday nobody
> remembered to copy. **The failure mode is a rehab block that exists in a markdown file and never
> reaches the athlete** — which is exactly what happened on the chart this mechanism was written
> for: the routine was called for at intake, written into prose, and never rendered anywhere the
> athlete would see it.
>
> Two rules for it:
> - **Never name a real session `Daily`.** `today/page.tsx` excludes the name from session
>   resolution, so a session actually called `Daily` would render its own prescription twice.
> - **A `Daily` row dated today does NOT override today's session prescription.** The
>   dated-today-overrides rule above is scoped to the session block; `Daily` rows are filtered out
>   of it deliberately. Without that filter, adding a rehab item would blank the day's real
>   workout — verified against that case when the mechanism was added.
>
> **To retire or change the daily block:** append a new set of `Daily` rows with a later date. The
> newest set on or before today wins, same as any session. Do not edit the old rows — history stays
> readable (rule 2, append-only).

> **⚠ `Supplements` is the second RESERVED session name — daily doses, not movement.** It gives a
> chart's supplement stack a rendering surface instead of leaving it in prose only, where the
> athlete never sees it. It renders in its own **"Daily stack"** card on Today,
> under the same effective-dating as everything else, so a new stack supersedes the old one by
> being appended with a later date.
>
> **Why it is not just more `Daily` rows, which is the obvious answer and is wrong.** Effective
> dating resolves a session to the rows on its single newest date and renders *only those*. Adding
> supplement rows under `Daily` dated today would therefore have made the stack the newest `Daily`
> set and **silently deleted the existing rehab block from the Today tab** — the exact failure this
> whole mechanism was built to prevent, caused by the mechanism itself. Its own session name gives
> the stack its own timeline, so the two supersede independently.
>
> `scripts/test-views.mjs` asserts that every reserved name declared in `today/page.tsx` still has
> live rows behind it, which goes red if the stack is ever moved back under `Daily`.
>
> **Put the athlete's regular medications in this card too, marked as what they are**, even the
> ones taken only a few days a week. `athlete/hard-constraints.md` requires an interaction check
> against the medications on file before any supplement is suggested, and **a medication that
> appears on no screen is one that gets left out of that check.** Say in the dose column that it
> is a medication rather than a supplement, so the card never reads as a recommendation.

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
`date,rmr_kcal,tef_kcal,neat_other_kcal,steps_kcal,incidental_kcal,session_kcal,burn_total_kcal,intake_kcal,deficit_kcal,complete,session_estimated,method_version`

- `complete`: `y` when every burn component **this chart has** is present on the row; `n` when one
  is blank and was therefore counted as zero. **A row with `complete=n` has a `burn_total_kcal`
  that is a FLOOR, not an estimate**, and every deficit downstream of it is understated by the same
  amount. How much depends on which component and on the athlete — but a run of `complete=n` days
  is enough to turn a real weekly deficit into an apparent surplus and invite a cut that is not
  needed, and it is the movement term this most often happens to.

  > ⚠ **"THIS CHART HAS" IS THE LOAD-BEARING PHRASE, AND IT USED TO SAY "EVERY COMPONENT".**
  > `steps_kcal` and `incidental_kcal` are two ways to fill ONE slot — see the movement section
  > below — and exactly one of them is non-blank on a well-formed row. Under the old wording a
  > chart with no wearable was missing `steps_kcal` on every day it would ever have, so `complete`
  > was `n` forever, the observed-burn mean was null forever, and the OUT side of the weekly energy
  > card, the loss-rate projection and the budget-versus-goal finding were all inert — on the
  > configuration most charts are in. An input a chart does not have is not a gap.

  **Any surface rendering a burn or deficit figure from a `complete=n` row must mark it.** Until
  2026-08-14 the column was computed, stored and aggregated into `WeekRoll.complete` and read by no
  page at all. `scripts/test-aggregations.mjs` now holds a registry of every page that renders one
  and fails on any page — including a new one — that renders a figure without the marker.

  A day still in **progress** is deliberately exempt: today's step total does not arrive until
  tomorrow morning by design, so today is `complete=n` every single day, and a marker that appears
  every day is one nobody reads (`docs/SURFACES.md`). The views key their marker off
  `DayRoll.burnUnderstated` — *finished* **and** missing a component — not off `complete` directly.

> ⚠ **A week's `burn`, `intake` and `deficit` are summed over ONE day set, and the surface states
> which.** A day contributes all three of its figures or none of them. Summing each column
> independently with blanks skipped let every column pick its own days, so a day with steps and a
> session but no food logged put its burn into the week's total and its blank deficit into nothing:
> the athlete read `Days logged 4/4 · Eaten 4,160 · Burn 9,741 · Deficit 3,007` off one line, and
> 9,741 − 4,160 is 5,581. `weekBalance()` in `scripts/lib/aggregate.mjs` is the one home for this,
> and `balanceDays` is the denominator every one of those figures shares — including the plan side,
> so an actual-vs-plan comparison covers the same days on both sides.

> ⚠ **Every figure here is a WHOLE-DAY figure, including for a day still in progress.** That is
> correct for history and wrong for "right now": a full 24 h of RMR rendered at 08:00 reads as
> *1,781 kcal already burned*, and a "deficit so far" built on it is inflated in exactly the
> direction that invites overeating. Reported by the athlete 2026-08-11.
>
> **Every view therefore prorates the clock-driven components** — `rmr_kcal` and
> `neat_other_kcal` — by the fraction of the athlete-local day elapsed (`rollup.partialBurn`).
> `tef_kcal`, `steps_kcal` and `session_kcal` are *not* prorated: they only exist once the meal,
> the step feed or the session has been logged, so they are accrued-to-date by construction.
> Anything not yet reported counts as zero, so the figure stays a floor — and the step feed lags
> real time, so the true number is a little higher than what is shown.
>
> **⚠ Corrected 2026-08-13 — this used to say "the Today tab therefore prorates," and only the
> Today tab did.** History's daily table, the home page's this-week table and the weekly rollups
> all rendered `burn_total_kcal` raw, so at 10:15 in the morning — a handful of steps, no session
> yet — History showed the athlete a **whole day's burn** against their full-day plan line. They
> reported it as impossible, which it was. The proration now lives in `rollup.rollDay` as `burnToDateKcal` /
> `deficitToDateKcal`, so **every** consumer gets the accrued figure by default and no new view
> can reintroduce the bug by reaching for the raw column. `burnKcal` is still exposed as the
> whole-day projection, used only where a projection is what is wanted (the Today tab's "full day
> projects to" line).
>
> **The PLAN side of the pair is NOT prorated, by an athlete's explicit instruction.** The
> coach's first fix scaled the maintenance line by the elapsed fraction too, reasoning that
> comparing a part-day burn against a whole-day figure reads as a shortfall. That was overridden:
> the target is the whole day, because its job is to say where the athlete stands right now
> against the day's plan and therefore **what remains**. Being well short at 10:00 is not a sign
> of a problem, and a target that shrinks through the day cannot say so.
>
> **The two sides answer different questions on purpose.** Actual = what has happened. Target =
> the whole day's plan. The gap between them is **budget remaining**, which is the number that
> drives a decision at 10:00. A prorated target answers "am I on pace," which they do not want
> and which invites reacting to a morning that is simply young. Do not re-prorate the plan line;
> if a future view needs a pace read, it is a *separate* number and gets its own label.
>
> **Do not "fix" this by making `energy.csv` itself time-aware.** It is the historical ledger and
> every weekly rollup depends on its rows being whole days. The proration belongs in the view.

> ⚠ **A day gets no row at all unless something was actually observed on it.** `rmr_kcal` and
> `neat_other_kcal` are pure functions of the carried-forward weight, age and sex — not of
> anything that happened on the date itself — so a day with a weight on record but no meals, no
> step count and no training row would otherwise still produce a "burn" figure built entirely
> from a physiological floor with zero real inputs for that day. `compute-energy.mjs` skips such
> a day outright, same as a day before any weight is on record, rather than publish a number
> nothing observed backs. Caught 2026-08-11: the baseline weigh-in day (2026-08-05) had no
> meals, steps or training logged and was still emitting 1,788 kcal of "burn," which also broke
> the weekly rollup — that day's burn counted toward the week's `burnKcal` sum but, having no
> intake, was excluded from `intakeKcal` and `deficitKcal`, so `burnKcal − intakeKcal` stopped
> equaling the displayed deficit.

---

## The burn model

> `method_version` is stamped on every `energy.csv` row from `METHOD_VERSION` in
> `scripts/lib/method-version.mjs`, which is its only home — this heading used to carry the
> integer as well, which is a second copy of the one number whose whole job is to say which model a
> row was computed under. That file also holds a digest of every constant and formula the model
> uses, and `scripts/test-single-home.mjs` fails when one of them changes without the version
> moving with it. Before that check existed, rows computed under three different versions of one
> session type's MET all claimed version 1 (audit F-64).

Everything below is an estimate. That is not a disclaimer — a nutrition plan's maintenance figure
is an estimate too. The point of writing it down is that an estimate you can re-run and
recalibrate is worth vastly more than one recomputed from scratch, differently, in every
conversation.

```
burn_total = rmr + tef + neat_other + <movement> + session_kcal

<movement> = steps_kcal        on a chart with a declared step feed
           = incidental_kcal   on a chart without one
```

**`rmr` — Mifflin-St Jeor, recomputed daily from that day's weight.**
```
rmr = 10 × weight_kg + 6.25 × height_cm − 5 × age + sex_term
sex_term:  male +5   ·   female −161
```
Height, sex and date of birth come from `athlete/constants.json`; **age is derived from the date
being computed**, never stored, so a birthday mid-block is picked up rather than going stale.
**The RMR floor in `nutrition/plan.md` must be this same computation, not a number typed beside
it** — recomputing daily means the floor tracks the athlete instead of a stale baseline. Carries
forward from the last known weight on days without a weigh-in.

> ⚠ **The sex term is 166 kcal/day and nothing on screen reveals it.** A chart forked to a female
> athlete with `sex` left at `male` would overstate expenditure by ~1,160 kcal/week — about a
> third of a pound of phantom deficit — while every number still looked plausible. This is why
> `sex` is a required, validated field rather than a default.

**`tef` — thermic effect of food = 10% of intake.** Digestion has a real, non-trivial cost, and it
falls as intake falls, which is part of why deficits decay.

**`neat_other` = 10% of RMR.** Non-step movement: standing, fidgeting, carrying things. The
profile records high daily NEAT; this is the conservative floor for it.

**`steps_kcal = steps × 0.00025 × weight_lb`** — around 0.04–0.05 kcal/step for a typical adult
bodyweight, i.e. roughly 100 kcal per 2,100-step mile. Scales with bodyweight, so it falls as the
athlete does. **Only on a chart that declares `plan.stepFeed`**; blank forever on any other, which
is not a gap.

**`incidental_kcal = step-equivalents(level) × 0.00025 × weight_lb`** — the same slot, on a chart
with no wearable, which is the common configuration. The athlete describes an ordinary day in
ordinary words and that description maps to a step-equivalent; `scripts/lib/movement.mjs` holds the
four levels and their figures.

> ⚠ **IT IS A STEP SUBSTITUTE, NEVER AN `RMR × N` MULTIPLIER.** A maintenance estimate of that form
> already contains all activity, so mixing one into this decomposition would count everything at
> once — the rule this document states in bold elsewhere, arrived at from a new direction. It also
> introduces no second energy-per-movement constant: it is priced with the same `0.00025` the line
> above uses.
>
> ⚠ **"OUTSIDE DELIBERATE EXERCISE" IS THE WHOLE OF WHY IT DOES NOT DOUBLE-COUNT.** A walk the
> athlete chose to go on is a session and is priced as one. The level covers only what nothing else
> counts: being on their feet around the house, the stairs, the walk to the car. The intake
> question, the constants comment and the validator all repeat the clause, because a level answered
> as a whole day's movement would price that walk twice.
>
> ⚠ **THE LEVEL IS THE ATHLETE'S; THE NUMBER IS THE COACH'S.** Per rule 5 below, the described
> level is `athlete-stated` and lives in `athlete/constants.json`; the kcal figure is `derived`
> from it and is stored nowhere, so there is no second copy to disagree with the ledger. A chart
> that has not answered runs on the shipped default, marked `coach-proposed-unconfirmed` with a
> date — visible and waiting, not filed as theirs.
>
> The bands behind the four levels are Tudor-Locke & Bassett's step index (2004); reading them as
> movement *outside exercise* is the coach's, and the figures sit at or under the index's
> boundaries for that reason. Not a measurement. An estimate that says so, on every surface that
> renders it.

**`session_kcal`** — MET-based: `kcal = MET × 3.5 × weight_kg / 200 × minutes`, under a three-level
precedence: **`kcal_override`** (a device reading — a bike, a watch, a rower — or a logged
recalibration) beats **the intensity split** beats **the flat MET over `duration_min`**.

> ⚠ **A SESSION PERFORMED BUT NOT TIMED IS RECONSTRUCTED, NOT COUNTED AS ZERO.** The flat-MET rung
> needs `duration_min`, and where it was blank the ledger added `?? 0` — writing a **zero that looks
> measured** into a column whose blanks are the only thing telling every downstream check that a
> total is incomplete. `missingBurnComponents` saw nothing missing, `burnUnderstated` stayed false,
> `complete` never looked at sessions at all, and whole sessions entered `observedDailyBurn` as full
> measurements while actually being floors. The mean they drag down prices every unfinished day and
> every rate-of-loss projection on the chart, and it drags it in the flattering direction.
>
> `scripts/lib/session-duration.mjs` resolves it, and the rungs — with the rest figure this chart
> actually uses — are generated rather than restated here:

<!-- GENERATED:duration-rungs — from scripts/build-docs.mjs. Do not edit between the markers. -->
<!-- /GENERATED:duration-rungs -->

> Every reconstructed row says which rung answered it, in `kcalBasis` — the string Today and
> History render beside the figure — so a reconstructed duration is never shown as a recorded one.
>
> ⚠ **ONE UNCOSTABLE SESSION BLANKS THE WHOLE DAY'S `session_kcal`, INCLUDING THE SESSIONS ON IT
> THAT WERE COSTED.** Deliberate, and the same rule as everywhere else here: the column holds the
> day's session burn, and if one session cannot be costed the day's session burn is not known.
> Writing the partial sum there would be a floor presented as a total — the X-1 error one level up
> from the zero this whole section is about. The day is `complete=n` and `burnUnderstated` is true,
> which is how every surface knows the total is short.
>
> ⚠ **A RECONSTRUCTED DAY IS STILL `complete=y`, AND `session_estimated` IS HOW A SURFACE KNOWS.**
> `complete` asks whether every input the chart has is present, and a reconstruction is present. But
> `observedDailyBurn` averages complete days precisely so estimates stay out of the figure that
> prices every unfinished day, so the ledger carries the distinction in its own column rather than
> leaving the mean to imply it. Excluding those days outright was the alternative and it is worse:
> on a chart that rarely times its sessions it would return null forever, which is the whole
> quantitative half going inert to avoid marking a number.

> **The precedence has one home: `sessionCost()` in `scripts/lib/aggregate.mjs`.** Both
> `compute-energy.mjs` (the ledger) and `build-data-json.mjs` (the per-session figure Today and
> History render) call it. Until 2026-08-14 the precedence existed only in the ledger and the
> dashboard implemented its third level alone, so the screen said **~1,328 kcal for the 2026-08-10
> session this file counted at 774**, and ~1,185 against 784 on 08-12 — the higher figure being the
> pre-2026-08-12 answer, still on screen two days after `decisions.md` recorded it as corrected
> away (audit F-02). `scripts/test-single-home.mjs` now sums the dashboard's per-session figures
> per day and asserts they equal `energy.csv`'s `session_kcal`, so the two cannot part company
> again without a check saying so.

> **This table is GENERATED from `metTable()` in `scripts/lib/athlete.mjs`** by
> `node scripts/build-docs.mjs`. Do not edit it here — edit the code and regenerate.
> `scripts/test-single-home.mjs` fails if the two disagree. It was hand-typed into this file and
> two others until 2026-08-14, and all three had drifted from the code and from each other
> (audit F-56).

<!-- GENERATED:met-table — from scripts/build-docs.mjs. Do not edit between the markers. -->
_(generated at intake, once `athlete/constants.json` registers this chart’s session types —
run `node scripts/build-docs.mjs`)_
<!-- /GENERATED:met-table -->

**Per-tier METs**, for a session logged with a `light_min` / `moderate_min` / `hard_min` split
instead of a flat `duration_min`. Sourced from the 2011 Compendium of Physical Activities
(Ainsworth et al.), not invented — the code and description each value came from are in the table.
Generated from the same place:

<!-- GENERATED:met-by-intensity — from scripts/build-docs.mjs. Do not edit between the markers. -->
_(generated at intake, once `athlete/constants.json` registers this chart’s session types —
run `node scripts/build-docs.mjs`)_
<!-- /GENERATED:met-by-intensity -->

<!-- GENERATED:met-by-intensity-inline — from scripts/build-docs.mjs. Do not edit between the markers. -->
_(generated at intake, once `athlete/constants.json` registers this chart’s session types —
run `node scripts/build-docs.mjs`)_
<!-- /GENERATED:met-by-intensity-inline -->

### Three rules for registering a session type, learned the hard way on earlier charts

> **1. A MET that did not come off a compendium line must say so, and carry a band.** Most
> activities have a sourced entry; some — rehab routines, isometric holds, slow floor work — have
> no line that describes them, and the nearest match describes something harder. Set the value at
> the low end of the plausible band rather than the nearest line, write the reasoning into the
> registry entry, and **state the uncertainty as a percentage** so no downstream reader treats the
> figure as measured. A ±20% band on a small number is honest; a borrowed compendium code that
> describes a different activity is not.
>
> **A session type only affects `energy.csv` if a `training.csv` row is written for it** — the
> model computes what is logged and nothing else. Registering a type changes future days only.
>
> ⚠ **Do not read a light daily session as raising RMR.** `rmr_kcal` is Mifflin–St Jeor from
> weight, age and sex; `neat_other` is a flat 10% of it. Light daily work moves neither on any
> timescale a chart measures. **The burn it adds is the activity itself, nothing more** — a small
> real number, not a metabolic effect.

> **2. A flat MET assumes the whole session ran at that intensity, and usually it did not.** A long
> class or ride is rarely uniform, and pricing all of it at the peak tier produces estimates an
> athlete will recognise as wrong — which costs the whole model its credibility, not just that row.
> **Log `light_min`/`moderate_min`/`hard_min` on `training.csv` instead of `duration_min` alone
> whenever a session wasn't one uniform intensity.** Register a sourced per-tier table for any type
> where that is the normal case; types without one fall back to their flat MET on every tier, so
> logging a split for them is harmless rather than wrong.
>
> Where an athlete's own device reports a figure, prefer it via `kcal_override` — and when a tier
> split later reproduces roughly the same number, that agreement is what validates the override
> rather than merely accepting it.

> ⚠ **3. The double-count trap, stated once so it doesn't get re-introduced.** On a chart with a
> step feed, walking is already in `steps_kcal`, which is why a walking type there is registered at
> **MET 0** — counting it again as a session is the trap. **On a chart with no feed the answer is
> the opposite and equally load-bearing:** nothing else counts that movement, so the walking type
> carries a real MET, and `energyCountedIn: "steps"` is rejected outright because it would promise
> the energy to a column nothing will ever write. The movement level covers only what is left —
> incidental movement outside deliberate exercise — which is why that clause is repeated everywhere
> the question is asked. The same applies at the plan level: a maintenance estimate of the `RMR × N`
> form *already contains* all activity, so that shortcut and this decomposition must never be
> mixed. This model deliberately starts from bare RMR and adds each activity explicitly.

**Recalibration.** A chart should schedule a maintenance review in `nutrition/plan.md` — a dated
one, a few weeks in — to be run from observed intake and weight change. That review compares this
model against reality
(`Δweight_lb × 3,500 ≈ Σ deficit_kcal`) and, if it's off, adjusts the constants and increments
`method_version` — leaving every historical row still readable under the model that produced it.
Recording the daily numbers is what makes that review possible with data instead of another guess.
