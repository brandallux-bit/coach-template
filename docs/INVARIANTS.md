# Invariants and their enforcement

**This document is a specification for checks, not a list of rules.** Every row names an
executable check. A row whose check does not exist yet is stamped `UNENFORCED` and is, by its own
admission, worth nothing until it does — that stamp is the point of the document.

The evidence for that framing: invariants X-1 to X-10 were written down, in plain English, well
before any of them had a check. X-8 was labelled *"the most-violated rule here"* and was then
violated fifteen more times. X-9 says *"a fix addresses the class, not the instance"*, and a
whole-system audit found seventy violations of the ten written rules above it. Writing a rule down
does not enforce it; only a check does.

**X-2 is the control case.** It is the only invariant in the original table with real enforcement —
three independent check points plus a regression test — and it is the only area the audit probed
hard and reported completely clean. Same corpus, same authors, same discipline. One of them got a
check.

---

## What each layer is for — read this before adding any check

**This section exists because its absence caused a real defect.** On 2026-08-13 the §5.2 safety
floors were built into the validator as hard errors, which meant a fast weight-loss week would
have frozen the dashboard. The root cause was not a missing check. It was that **nobody had
written down what each layer is responsible for**, so a rule was translated from one layer into
another where it means something entirely different.

| Layer | Its only job | Legitimate failure | What it must never do |
|---|---|---|---|
| **`data/` + `scripts/`** | **Record faithfully** what was decided and what happened | A record that contradicts itself — bad date, out-of-order row, blank that gets summed as zero | Refuse to record something true. Judge whether a number is *wise* |
| **Dashboard (`src/`)** | **Show honestly** what is true right now | A confident number rendered from absent data | Hide an inconvenient number, or invent one to fill a gap |
| **Coach + agents** | **Set goals, design activities, recommend, argue, refuse to prescribe** | A bad recommendation | Prescribe past a §5.2 floor. Invent a number that belongs to the athlete or their doctor |

The test for any proposed check: **is it fixable by editing the record?**

- *"This row says 80 minutes but its parts add to 20"* → fixable by editing. Validator's job.
- *"You lost 2 lb this week"* → not fixable by editing, only by falsifying. **Never the
  validator's job.** It is a finding for the coach.
- *"You should eat 1,700 not 1,000"* → an argument, not a constraint. The coach's job, in
  conversation, where it can be argued with.

**The software cannot make the athlete do anything, and must not pretend otherwise.** It tracks
deterministically, shows honestly, and hands judgement to the layer that can actually have a
conversation about it. A floor that fails a build is not a floor — it is an outage.

---

## How to use this document

### The operating rule

> **An acute fix ships as the output of a check, never as an edit.**

When something is wrong, you do not fix the thing. You write the check that would have caught it,
run it, and fix everything it prints. The fix is the check's output.

This is X-9 made mechanical. X-9 as prose asks a session to remember to ask "what else shares this
shape?" — in a system whose entire premise is that nobody remembers. As a check, the question is
answered by running it.

Worked example, from the day this was written: the seated bike was suspended after failing at ~1
minute, and `constants.json.weeklyTemplate` still prescribed it for Tue and Sat.

- **Instance fix:** edit two JSON keys. Four minutes. Closes one finding.
- **Class fix:** write `check-suspensions.mjs` — *no `weeklyTemplate` entry, `prescriptions.csv`
  row, or `exercise-library.md` substitution may name a modality or pattern the active block
  suspends* — run it, fix what it prints. Forty minutes. Closes **F-33, F-25, F-19 and F-44**,
  three of which nobody had connected, and it holds for every future block.

### The commit gate

A commit that fixes a defect must add or extend a check. `git log` makes this auditable after the
fact and it is a yes/no question, which is why it works where X-9 did not.

**Two limits on this rule, both learned the same day it was written:**

1. **A data correction is exempt.** A wrong number in `data/` corrected to the right number ships
   immediately and alone. The check that would prevent the *next* one is separate work and must
   not delay the correction.

2. **A check that cannot go green without inventing data must not be written.** This rule has a
   failure mode, and it fired within hours: a check was written for blank `goals.md` thresholds,
   it went red on the Health BP trigger, and the coach **invented a clinical threshold to clear
   it** — a decision belonging to the athlete and their doctor, made to satisfy a test. The pressure
   to be green is real and it points at whatever is easiest to change, which is usually the data.

   So: before writing a check, ask **who owns the thing it will demand?** If the answer is anyone
   other than the person running the check, it must report rather than block, and its message must
   say whose call it is. The obligation a check creates has to land on someone who can actually
   discharge it.

### Status vocabulary

| Stamp | Means |
|---|---|
| `ENFORCED` | A check exists, runs in CI, and has a fixture proving it fails against the defect it describes (X-10) |
| `PARTIAL` | A check exists but covers some instances and not the class |
| `BROKEN` | A check exists and does not currently run, or runs and cannot fail |
| `UNENFORCED` | Prose only. Worth nothing. |

---

## The table

Fifteen invariants. X-1 to X-10 are the existing corpus, restated unchanged. X-11 to X-15 were
found by mapping the audit's 72 findings to mechanisms — five classes the corpus never named, which
is itself the finding: **F-01, F-52, F-53, F-54, F-58 and F-60 are one defect (X-13) that has no
name, which is why it keeps being fixed one instance at a time.**

| # | Invariant | Status | Findings |
|---|---|---|---|
| X-1 | Empty means "not measured". Zero means a measured zero. | `ENFORCED` ✓ | 10 |
| X-2 | Dates are the athlete's local date, from `athlete.timezone`. | `ENFORCED` ✓ | 0 |
| X-3 | `data/` is written before the prose, never in parallel. | `ENFORCED` ✓ | 11 |
| X-4 | Append-only wherever possible. | `UNENFORCED` | 0 |
| X-5 | Every write commits and pushes immediately. | `UNENFORCED` | 0 |
| X-6 | Work on `main`. | `ENFORCED` ✓ | 5 |
| X-7 | Fail loudly, never plausibly. | `ENFORCED` ✓ | 4 |
| X-8 | A number has exactly one home. Everything else renders it — including code. | `ENFORCED` ✓ | 15 |
| X-9 | A fix addresses the class, not the instance. | `UNENFORCED` | *(all)* |
| X-10 | Decision logic is covered by tests shown to fail against the defect they describe. | `PARTIAL` | 4 |
| X-11 | **No per-athlete content in shared code, prose, or skills.** | `ENFORCED` ✓ | 8 |
| X-12 | **Every safety floor is computed and surfaced where a human will see it — and never enforced against reality.** | `ENFORCED` ✓ | 3 |
| X-13 | **A lookup selects on every dimension of its key.** | `ENFORCED` ✓ | 6 |
| X-14 | **The schema is complete, and every writer passes through it.** | `ENFORCED` ✓ | 7 |
| X-15 | **Every prescribed number has a rendering surface.** | `ENFORCED` ✓ | 6 |
| X-16 | **Every number records who it came from.** | `ENFORCED` ✓ | *(new)* |
| X-17 | **A machine-readable default always answers. Prose may refine it, never suppress it.** | `ENFORCED` ✓ | *(new)* |

Twelve of the sixteen are enforced. The audit found no violations of X-4 or X-5, which is worth
knowing — they are prose and they are holding, so they stay prose for now.

---

## X-1 · Empty means "not measured". Zero means a measured zero.

**Status:** `ENFORCED` ✓ as of 2026-08-14 (W4) — was `PARTIAL`, enforced at row level for
`meals.csv` macros and **nowhere at aggregation level**, which is where all ten findings lived.

**The contract, in one line:** *null in, null out — or a number that says which of its inputs were
absent.* The second half is not a loophole. `data/METHOD.md` deliberately counts an unknown burn
component as zero so `burn_total_kcal` is a **floor** rather than a guess; a floor is a legitimate
number and **a floor that does not say it is one** is the defect.

**Where it lives.** `scripts/lib/aggregate.mjs` — one plain-ESM module holding every function that
decides whether a number exists, re-exported by `src/lib/aggregate.ts` and imported by `rollup.ts`,
`forecast.ts`, `data.ts` and `ui.tsx`. Plain ESM for the same reason as `rowwrite.mjs`: so
`scripts/test-aggregations.mjs` runs **the code the dashboard runs**. `test-views.mjs` says in its
own header that its logic is *mirrored* from the TypeScript and must be hand-updated — a property
suite built that way proves things about the mirror, so W4 deleted the mirror instead of adding to
it.

**Checks — ✅ DONE 2026-08-14 (W4):**

1. ✅ **Null propagation, property-style.** Every aggregation, every input column nulled in turn.
   `partialBurnFrom` returns a `missing` list naming the absent columns; `sessionKcal`,
   `pctOfTarget`, `sumOrNull` and `meanOrNull` return null. *Closes F-51, F-16, F-59, F-62, F-63.*
2. ✅ **Shared denominator.** `weekBalance()` counts a day only when its burn, its intake **and**
   its deficit all exist, so `burn − intake = deficit` holds by construction — asserted
   exhaustively over all 256 four-day weeks buildable from four day shapes, and against the live
   chart on every run. `balanceDays` is the denominator, and it is the number the surfaces render.
   *Closes F-51.*
   > **The predicate names all three rather than deriving deficit from the other two.** Deriving it
   > would make the row reconcile even if `energy.csv` and `meals.csv` disagreed about the day —
   > exactly the disagreement the ledger exists to expose.
3. ✅ **Partial ≠ complete — as a REGISTRY, not a spot check.** `test-aggregations.mjs` scans every
   file under `src/app` and `src/components` for a burn or deficit figure; each must appear in a
   table naming the flag it renders. A **new** page rendering one fails until it is registered.
   *Closes F-16, F-59.*
   > **A complete day renders nothing, and a day in progress is exempt.** Today's step total is not
   > due until tomorrow, so today is `complete=n` every day; marking it would put the glyph on the
   > dashboard permanently, which `SURFACES.md` names as how an alert stops being read. The views
   > key off `burnUnderstated` — *finished* **and** missing a component. On this chart it currently
   > renders nowhere, which is the design.
4. ✅ **Parts cover the whole.** `coverIntensitySplit()` assigns the remainder to `light_min` on the
   write path and writes the assignment into the row's `note`. The validator errors only when the
   parts **exceed** the duration, and **warns** on a shortfall with the corrected split. *Closes
   F-03.* — Deliberately not a hard error on `sum ≠ duration`: that would force a session logging
   "80 minute class, 20 of it hard" to fabricate a split, which `CLAUDE.md` §0.3 forbids outright.
5. ✅ **Partial step readings.** `scripts/log-steps-row.mjs` refuses a payload dated athlete-local
   today or later. A sub-1,500-step **completed** day is written without argument and becomes the
   `steps-implausible` **finding** for the coach. *Closes F-06 — fourth occurrence.*
   > **Why a write-path rejection is legitimate here** and does not breach the layer model above:
   > it is a **fidelity** rule about what the column means, not a judgement about whether the
   > number is wise. `steps.csv`'s column is *a completed day's total*; a 09:56 reading is a
   > different quantity wearing the same name — the same class as a UTC-dated observation, which
   > `rowwrite.mjs` already refuses. **The boundary must not widen:** a low but completed day is
   > true and is recorded. Anything else that "looks wrong" is a finding, never a rejection.
6. ✅ **Numeric-string truthiness — the class, and it was worse than described.** `est_kcal_burned`
   is not a column in `training.csv` at all, so it was `undefined` on every row, the `|| fallback`
   fired forever, and both the Today caption and History's session table held a cell that could
   never say anything. The check scans `src/` (comments stripped) for **snake_case names that are
   not a column in any `data/` file**, with a short allowlist that states why each entry is exempt.
   `Meter` now divides through `pctOfTarget`, which returns null on a zero target. *Closes F-41,
   F-68.*
7. ✅ **Reachability.** `dayFraction`'s producible domain is **computed** by sweeping all 1,440
   minutes, and every suite is scanned for a numeric literal passed where a produced value belongs.
   Verified to catch the original `partialBurn(e, [], 1)`. The page branch it certified —
   `elapsed >= 1`, false even at 23:59 — is gone, and with it the "full day projects to X" figure,
   which was whole-day RMR plus activity-so-far and never a projection. *Closes F-55, shared with
   X-10.*

**One deliberate omission — ✅ closed by W5.** History's per-session "Est. kcal" column rendered
`kcal_override` rather than a modelled figure, because per-session burn had no single home.
`sessionCost()` is that home now; the column renders the precedence result with the MET and minutes
behind it on hover, and Today's Movement caption carries the same figure.

**Subsumes:** F-03, F-06, F-16, F-41, F-51, F-55, F-59, F-62, F-63, F-68

---

## X-2 · Dates are the athlete's local date

**Status:** `ENFORCED` ✓ — `localToday()` checked at `validateRow`, `validate-data.mjs:62` and
`compute-energy.mjs`, with a regression test. All date arithmetic anchors at `T12:00:00Z`.

**Nothing to build.** Keep it as the reference implementation: three independent enforcement
points, one shared derivation, a test that fails against the original defect. Every check below
should look like this one.

---

## X-3 · `data/` is written before the prose, never in parallel

**Status:** `ENFORCED` ✓ as of 2026-08-14 (W6) — was `UNENFORCED`. Eleven findings, and it is the
class that produced the week's two most dangerous ones: a suspended modality still prescribed, and
35 lb loads on a lift re-anchored to 50.

**Where it lives.** `scripts/lib/suspensions.mjs` (the grammar and the collision engine),
`scripts/check-suspensions.mjs` (the CLI over the live chart), `scripts/test-suspensions.mjs`
(inline fixtures), `scripts/test-single-home.mjs` §2 and §2b (the prose-figure and
prose-prescription scans), and `scripts/validate-data.mjs` (the budget sum). All five run in
`check-all.mjs`; the whole suite is 0.7 s.

**Checks — ✅ DONE 2026-08-14 (W6):**

1. ✅ **Prose numbers, as `test-single-home.mjs` §2 and §2b — NOT as a second scanner.** The plan
   named `scripts/check-prose-numbers.mjs`, and writing it standalone would have shipped the
   defect X-8 is named after. `FIGURES` already did the
   `constants.json` half, so it gained `weeklyKcalBudget`, `estMaintenanceKcal` and
   `stepsPerDayTarget`; **the other machine home is `prescriptions.csv`**, and §2b compares any
   prose line carrying a sets×reps dose and a load against the live row for that exercise. It found
   `skills/daily-dashboard`'s worked example printing 35 lb for a row and a carry both re-anchored
   to 50 lb on 08-11 at the athlete's own instruction. *Closes F-12, F-29, F-37's prose half, F-50.*
2. ✅ **`scripts/check-suspensions.mjs`** — no `weeklyTemplate` entry, live `prescriptions.csv` row
   or `program/` substitution may name what the active block suspends. **It found fifteen, not
   one**, and the bike was not among them — that instance had already been fixed by hand, which is
   the argument for the operating rule in miniature. See the box below. *Closes F-19, F-25, F-33,
   F-35, F-44.*
3. ✅ **Skill output contract** — `program-design` and `nutrition-targets` both write `data/`, run
   the validator, and *then* write the rationale; `daily-dashboard` lost its prose fallback and its
   licence to write a prescription; `red-team.md` gained *"does every session in this block have
   rows in `prescriptions.csv`?"* as item 4. *Closes F-13. F-48 was already closed on 08-13.*
4. ✅ **`sum(kcalByWeekday) === weeklyKcalBudget`**, in `validate-data.mjs`. **It holds** —
   1700×4 + 1750 + 2650 + 1750 = 12,950 — so nothing moved; the check exists because
   `_kcalByWeekday_note` has asserted it since 08-11 with nothing testing it. A validator error,
   not a finding, because a total disagreeing with its parts is a record contradicting itself,
   which is the one thing `data/` is entitled to refuse.
5. **Every number the athlete acts on has a row.** Change "never logged" to "never **itemised**"
   in `values.md`, `lifestyle-integration/SKILL.md` and `plan.md`. A feast night gets one row,
   `confidence: estimate`, band in the note. The athlete-facing promise — no arithmetic at the
   table — is untouched. *Closes F-08.* **Still open** — it is sequenced after W4 per the amendment
   below, and it is nutrition-side rather than prescription-side.

> ### What `check-suspensions.mjs` found, and why the number is the point
>
> The seated bike — the instance this document uses as its worked example — was **not** on the
> list. It had been corrected by hand on 08-13, four minutes' work, exactly as the operating rule
> predicts. The check found **fifteen other things**, all of them in the two files the athlete
> opens when the plan has already fallen apart:
>
> | Where | What it offered | Suspended by |
> |---|---|---|
> | `exercise-library.md` substitution table | goblet squat · split squat (×2) · reverse lunge · step-up · the whole `Lunge / single-leg` row | "Not in Phase 1" |
> | `exercise-library.md` travel fallback | burpees · split squats · jump rope | "Not in Phase 1" |
> | `exercise-library.md` `Sub:` clauses | goblet/KB front squat · split squat · **seated bike** | "Not in Phase 1"; "the bike is out of Phase 1 entirely" |
> | `current-block.md` minimum viable session | goblet squat | "Not in Phase 1" |
> | `current-block.md` travel session | split squats · step-ups | "Not in Phase 1" |
>
> **The travel session is the one that mattered most.** A trip was seventeen days out when the
> check was written, and that chart's `values.md` recorded travel as the athlete's #1 historical
> streak-ender — so the session they were most likely to run away from home prescribed two
> patterns the active rehab block forbade outright.
>
> **The fix is the check's output, and it is not a deletion.** Each is marked `⛔` in the file that
> offers it, and `program/exercise-library.md` carries a **generated** "Currently out" banner at the
> top, rendered from `program/` by `scripts/build-docs.mjs` — so the suspension is in the file the
> coach opens to substitute, not in a second file they have to remember to open (F-19's own
> recommendation).
> A `⛔` that stops corresponding to a real suspension is itself a failure, which makes the marks
> the exact list of lines to restore at the Phase 4 revert.

**The seam, and its known limits.** Parsing "what does the active block suspend" out of prose
without hardcoding one athlete's injury (X-11) is the hard part. The design is in
`scripts/lib/suspensions.mjs`'s header; the short version is that **nothing is registered** — every
`.md` in `program/` is read, and the exclusion sentence a coach writes anyway *is* the registration,
the same move W1 made when it decided the date is the registration for a follow-up. The grammar is
English negation (`Not in Phase 1`, `Still not in Phase 2:`, `no X, no Y`, `X is out`), never this
athlete's vocabulary, and the extracted terms only mean anything where they collide with something
prescribed, so an over-eager term costs nothing.

Three limits, stated because a parser nobody can audit is a parser that silently stops working —
`node scripts/check-suspensions.mjs --list` prints every term with its source line:

- **It matches names, not concepts.** A template entry reading `Indoor stationary cycle, seated`
  with `type: circuit` slips past, because the block never uses those words. Verified. The dodge
  needs both a rename *and* a wrong `type`, and `type` is a schema enum.
- **A `no X, no Y` enumeration is ambiguous in English.** *"No cycling, no rowing, no stair
  machine"* and *"Phase 2 opens on no soreness at rest, no improvement across ~2 weeks"* are the
  same construction. Both are kept for the check, where a spurious term costs nothing; only
  list-shaped exclusions reach the athlete's banner.
- **A negation aimed at something inside the document is not a suspension.** *"Explicitly NOT on
  the list, and why: … wall-sits …"* is about a list of calorie-replacement options, and the same
  file prescribes a shallow wall-sit as item 8 of the Phase 1 routine. Collecting it would produce
  a red check whose only green path is editing the athlete's rehab plan to satisfy a parser.

**Note on F-08.** The audit states the harm as "phantom deficit"; that only holds when *other*
meals that day were logged. A fully unlogged day emits blank intake **and** blank deficit and drops
out of `Σ deficit_kcal` while remaining inside the `Δweight` window — so the 2026-08-27
recalibration compares two sums over different day sets. That is X-1 finding #2, in the
recalibration method itself, and "never itemised" does not close it. **Both fixes are required
before 08-27.**

**Subsumes:** F-08, F-12, F-13, F-19, F-24, F-25, F-33, F-35, F-37, F-44, F-48

---

## X-4 · Append-only wherever possible, with one named exception

**Status:** `UNENFORCED`, **one deliberate exception, no accidental violations.** Holding on
convention.

**The exception is `coach-notes.csv`, and it is the whole of it.** Dismissing a note on `/today`
deletes its row — `removeRow` (`scripts/lib/rowwrite.mjs`) via `commitRemoval`
(`src/lib/github.ts`). The athlete asked for dismissal to mean gone rather than hidden, and
declined a record of what had been dismissed.

**Why this does not weaken the invariant.** X-4 protects *measurements*: rows that assert
something happened, where a deletion falsifies the log and where append-only is also what makes
two surfaces' writes merge cleanly (X-6). A coach note asserts nothing about the athlete — it is
editorial, something the coach said and the athlete has now read. Deleting a finished note loses
no fact. `removeRow` is scoped to this by construction: it refuses any file that is not
`uniqueDate`, because on a file where a date can carry several rows (`meals.csv`, `sets.csv`)
a click has no way to name which row it meant.

**Cheap check when convenient:** fail a commit that removes or modifies existing lines in
`data/*.csv` — excluding `coach-notes.csv` — unless the message carries a `CORRECTION:` prefix.
Not urgent; nothing has broken it outside the exception above.

---

## X-5 · Every write commits and pushes immediately

**Status:** `UNENFORCED`, **zero violations found.** Not mechanically checkable from inside a
session. Stays prose; revisit only if a divergence incident occurs.

---

## X-6 · Work on `main`

**Status:** `ENFORCED` ✓ as of 2026-08-14 (W3) — was `BROKEN`, and it was the only entry in this
document whose automation **destroyed work the athlete had been told was saved.**

**The premise of the audit's own recommendation was false, and the correct fix is stronger.** F-04
states that `git push --delete` has no `--force-with-lease` equivalent, and proposes re-fetching
immediately before the delete to *narrow* the window. It has one, and the distinction is the whole
fix:

> `git push --force-with-lease=<branch>:<sha> origin :<branch>`
>
> An ordinary delete is not unguarded — git sends the value it saw in the remote's advertisement as
> the expected old value, so a push landing *after* the advertisement is refused by the server.
> What it cannot see is a push that landed *before the delete command started*, because by then the
> advertisement already carries the new value. **That is exactly the window a re-fetch narrows and
> cannot close.** The lease replaces the advertised value with the SHA this job *decided from*.

Measured on git 2.50.1, with the racing push fired from a `receivepack` wrapper so it lands inside
that window — the pre-check passing, the ref moving, and then:

```
plain delete:   - [deleted]  claude/window                          exit 0   ← commit destroyed
leased delete:  ! [rejected] (delete) -> claude/window (stale info)  exit 1   ← branch survives
```

**Where it lives.** `scripts/lib/absorb.mjs` (the job), `scripts/lib/push-retry.mjs` (the retry
algorithm), `scripts/lib/branches.mjs` (what "stray" means), `scripts/lib/git.mjs` (argv-only git),
`scripts/absorb-branches.mjs` and `scripts/git-commit-push.mjs` (the two CLIs the workflows call).
Fixtured in `scripts/test-git-sync.mjs`, which builds bare repositories and races real pushes.

**Checks — ✅ DONE 2026-08-14 (W3):**

1. ✅ **F-04, the delete race.** A captured SHA is merged, not a ref name, and the delete is leased
   on that SHA. A branch that moved is left standing and absorbed on the next run. **The `AHEAD=0`
   early exit gets the same protection** — it was the worse instance, deleting on the stale read
   without merging anything at all.
2. ✅ **F-18, the retry loop.** `git pull --rebase` replaced by reset → re-apply → re-validate →
   retry, in **one** implementation used by all three workflows. The mutation is a parameter; the
   three properties it must have (re-runnable, idempotent, order-independent) are stated in
   `push-retry.mjs`'s header and hold for all three callers. `log-steps.yml`'s inline bash became
   `scripts/log-steps-row.mjs` precisely so it *could* be re-run.
3. ✅ **F-36, per-branch independence.** merge → validate → push → delete, per branch, each from a
   tree freshly reset to `origin/main`.
4. ✅ **F-45, one definition of "stray".** `isStrayBranch` in `scripts/lib/branches.mjs`, imported
   by `src/lib/github.ts` the way `rowwrite.mjs` is imported by `log-write.ts`. The workflow's
   `branches-ignore:` list is a third home that only GitHub can read, so the fixture reads the YAML
   and asserts it still matches.
5. ✅ **F-40, the cron drift — documented, not changed.** `*/20` was rejected: the schedule is not
   the guarantee. The `push` trigger is the primary path; a branch that loses the delete race is
   re-triggered by the very push that beat it; and the alarm that actually matters is the
   dashboard banner, which after (4) is trustworthy. The workflow now says plainly that runs drift
   up to ~50 min and that whole slots get dropped.

**Two design decisions worth knowing:**

- **A branch that moved does not fail the run.** It is a `::warning::` and exit 0. The mechanism is
  working: the push that won the race re-triggers the workflow. An hourly red X for a self-healing
  17-second race is how a maintainer learns to ignore absorb failures — the same harm F-45
  describes on the athlete's side. Conflicts, check failures and exhausted pushes still exit 1.
- **The fixture is in CI but deliberately NOT in `check-all.mjs`.** `check-all` runs inline in
  every bot before every push, so anything inside it gates the athlete's data reaching `main`. A
  flake in a git-race fixture would stop a logged meal from being saved *in order to protect a test
  about saving meals.* It runs in `validate-data.yml`, where the audience is the maintainer and the
  only thing it can hold up is a deploy.

**Subsumes:** F-04, F-18, F-36, F-40, F-45

---

## X-7 · Fail loudly, never plausibly

**Status:** `ENFORCED` as of 2026-08-14 — was `BROKEN`, and it was the gate on everything else in
this document. **A check that cannot run is prose with extra steps.**

**Verified state of `.github/workflows/validate-data.yml`:**

- The `validate` job runs no `npm ci` and no `npm run data`, so `test-views.mjs` dies at ENOENT on
  the gitignored `src/generated/data.json`.
- The `energy.csv` staleness gate sits *after* that step in the same job, so it is **unreachable
  and has never executed.**
- `on: push: branches: [main]` — but GitHub does not trigger workflows from pushes made with the
  default `GITHUB_TOKEN`, and `absorb-bot`, `steps-bot` and `rollover-bot` all use it. **35
  consecutive commits, zero CI runs.**

**Fixes, in order:**

1. ✅ **DONE 2026-08-13** — `node scripts/build-data-json.mjs` runs before the test-views step.
   Verified: `test-views.mjs` crashed at ENOENT on a clean checkout before, passes after.
2. ✅ **DONE 2026-08-13** — the staleness gate now runs *ahead* of the logic tests, so it is
   reachable for the first time.
3. ✅ **DONE 2026-08-13** — the suite runs **inline in every bot workflow** before it pushes.
   (Maintainer's call, taken over the PAT option: no secret to own or rotate.)

   The suite lives in `scripts/check-all.mjs` and all four workflows call it, rather than the
   step list being pasted into four YAML files — that would be X-8 wearing a CI hat, and it had
   **already drifted into three different answers** about what "checked" means:

   | Workflow | Before | Now |
   |---|---|---|
   | `absorb-branches` | validate + rowwrite | full suite |
   | `daily-rollover` | validate only | full suite |
   | `log-steps` | **nothing**, and no `setup-node` either | full suite, Node pinned |
   | `validate-data` | five inline steps | one call |

   `--regen-energy` tells the script that regenerating `energy.csv` is expected rather than
   staleness, because the caller has just mutated one of its inputs. `log-steps` now commits
   `data/energy.csv` alongside the steps row, closing F-22's window.

   Verified end-to-end: `daily-rollover` triggered manually ran `check-all` and pushed clean.
   Node pinned to 22 in every workflow — `daily-rollover` was on 20, so the suite could have
   passed in CI and behaved differently in the bot.
4. ✅ **DONE 2026-08-13** — `scripts/smoke-routes.mjs` boots `next start` and asserts all five
   routes return an HTML document. *Closes F-14's detection half.*

   **Shipped with its red fixture, per X-10.** Setting `baseline.date` to a future date makes `/`
   return 500 with `TypeError: Cannot read properties of undefined (reading 'label')` — F-14's
   exact mechanism — while `npm run data`, `npm run validate` and `npm run build` all stay clean.
   Restoring the date returns it to green.

   > **The check needed two fixes of its own, and both are the argument for the rule.**
   >
   > 1. **It could not fail.** The first version took a base URL and requested it. Run against the
   >    red fixture it **passed** — a server from an earlier run still held port 3000, the build
   >    under test died with `EADDRINUSE`, and the script validated the stale process. It now
   >    starts and owns the server, and refuses to run if the port is occupied.
   > 2. **It hung.** The second version spawned `npx next start` and sent SIGTERM to the child.
   >    The signal reached `npx`; the Next server underneath survived, held node's event loop open
   >    through its stdio pipes, and the CI step ran until cancelled by hand — **a hang reads as
   >    "still running", not "failed"**, which is precisely the plausible-not-loud failure X-7
   >    exists to forbid. It now spawns the binary directly, detached, signals the whole process
   >    group, exits explicitly on every path, and carries `timeout-minutes: 5` as a backstop.
   >
   > Writing the check was the easy half. Insisting it go red, and watching it actually run, is
   > what found both. A check adopted without that step would have shipped a permanent green.

5. ✅ **DONE 2026-08-14 (W1) — and NOT as `data/health.json`.** The proposal was that every
   workflow write its own success/failure. That design cannot detect the failure that actually
   happens: **a workflow which never runs never writes "I failed" either**, so a disabled workflow,
   an expired PAT, a phone automation that stopped firing and a cron GitHub dropped are all
   invisible to it — and those are the same set of causes as the failures it was written for.

   Health is now derived from the **evidence each workflow leaves in `data/`**
   (`WORKFLOW_FEEDS` in `scripts/lib/findings.mjs`): `data/steps.csv` for `log-steps.yml`,
   `data/targets.csv` for `daily-rollover.yml`. A feed that was arriving and stopped becomes a
   finding. No network call, no new file, and it catches "ran green and wrote nothing" as well.
   `check-steps.yml` is deliberately not in the table — it produces no artifact, it *is* a
   detector for a missing steps row, and the steps entry covers that even when `check-steps` is
   itself the broken thing.

   A feed that has **never** written a row is deliberately not reported: it is indistinguishable
   from a feed this chart does not use, and reporting it would assert a fact about the athlete's
   setup that nobody recorded.

   Build staleness is separate and lives in `src/lib/findings.ts`, because it is the one finding
   that cannot be computed at build time — at build time the answer is always "fresh". It compares
   `data.json`'s stamp against athlete-local today at request time: one day is `attention` (the
   nightly window before `daily-rollover` pushes), two is `critical`. *Closes F-27, F-26's
   stale-build half.*

**Subsumes:** F-11, F-14, F-22, F-27

---

## X-8 · A number has exactly one home

**Status:** `ENFORCED` ✓ as of 2026-08-14 (W5) — was `UNENFORCED`. Fifteen findings, the largest
class, and the one the corpus already identified as most-violated before it was violated fifteen
more times.

**Where it lives.** `scripts/test-single-home.mjs`, wired into `check-all.mjs` (~0.3 s, pure file
reads plus one sha256). Four kinds of rule, because "one home" means different things at different
layers:

| Kind | What it asserts | Red fixture watched failing |
|---|---|---|
| `DEFINITIONS` | A construct in `scripts/`/`src/` is defined once. Comment-stripped, so prose about a rule can neither satisfy nor trip it. Every non-home match must be an **allowlisted file with a written reason**, and a stale exemption is itself a failure | the precedence re-added to `build-data-json.mjs`; `COUNTS_TOWARD_FLOOR` re-declared in `forecast.ts`; an exemption pointed at a file that no longer matches |
| `FIGURES` | Every statement of a registered threshold in the chart's *live* prose equals `athlete/constants.json` | F-28's original wording restored verbatim |
| `BEHAVIOURAL` | The two consumers of a shared computation agree **on the live chart** | reproduces `2026-08-10: ledger 774, dashboard 1328` exactly |
| `GENERATED` | Doc blocks rendered from code are current; the model digest matches `METHOD_VERSION` | a MET edit of `10.3 → 10.0` fails three docs and the digest |

**Delivered — ✅ DONE 2026-08-14 (W5):**

1. ✅ **The precedence has one home, not the formula.** W4 had already moved the *formula* to
   `aggregate.mjs`; what was still duplicated was the **three-level precedence**
   (`kcal_override` → per-tier MET → flat MET), which lived in `compute-energy.mjs` and **nowhere
   else**, while `build-data-json.mjs` implemented level 3 alone. `sessionCost(row, weightLb,
   metOf)` in `scripts/lib/aggregate.mjs` is now the only implementation; `athlete.mjs` binds this
   chart's tables, `forecast.ts` binds the same tables plus the template's pinned MET. *Closes
   F-02, F-67.*
2. ✅ **One CSV parser and one quoting function.** `rowwrite.mjs` imports both from `csv.mjs`;
   quoted mode is entered only when `field === ''`. Verified: every `data/` file parses to
   identical rows, and the inch-mark case goes from 2 rows to 4. *Closes F-10.*
3. ✅ **The MET table is generated** into every document that carries it — `data/METHOD.md` plus
   whichever of `scripts/build-docs.mjs`'s `TARGETS` this chart actually has — from `metTable()`,
   with `--check` in the suite. `DATA-F-26` marked BUILT; the
   "no intensity input" limitation replaced by the precedence it describes; README and
   `package.json` stopped calling a dashboard with a write endpoint read-only. *Closes F-56, F-65,
   F-66, and F-50's MET and week-number instances.*
4. ✅ **Thresholds render from `constants.json`.** `plan.adherenceRoutingPct` added (`external`,
   citing `CLAUDE.md` §7); `phaseEndDate`'s "binds independently" note corrected to the review
   checkpoint `goals.md` demoted it to on 08-11; `MIN_READINGS_FOR_PROJECTION` and
   `COUNTS_TOWARD_FLOOR` moved to `src/lib/data.ts` and imported by both view libs, which deleted
   the half-covering drift guard's reason to exist. *Closes F-28, F-49, F-70, F-71, and F-29's
   floor-vs-aim ambiguity — the weekly rollup now reports `proteinFloorDays` and `proteinAimDays`
   separately instead of one "protein days hit" that silently meant the floor.*
5. ✅ **`estMaintenanceKcal` is off the shared axis**, not derived onto it — see the disagreement
   below. *Closes F-57.*
6. ✅ **`method_version` stays an integer**, with a digest tripwire in
   `scripts/lib/method-version.mjs`. *Closes F-64.*

**Four things came out differently from the plan.** In short: the precedence went to
`aggregate.mjs`
rather than `athlete.mjs` (the dashboard cannot import a module that reads the filesystem); the
digest fingerprints the *functions' source*, not a hand-written description of them; the deficit
chart kept a plan reference by rebuilding it in the same model; and the check needed a companion
rule after a deliberate attempt to sneak a second implementation past it succeeded.

**Two disagreements with the audit's recommendations, both recorded in
[TRIAGE-2026-08-13.md](audit/TRIAGE-2026-08-13.md) and both upheld:**

- **F-64** — `method_version` is not derived from a content hash. The column exists "so historical
  rows stay interpretable"; a hash trades *stale* for *unreadable* and churns on constants that
  don't affect the model. The integer stays; a digest of the model's constants **and the source
  shape of `rmrKcal`, `sessionKcal` and `sessionCost`** fails the suite when one moves without a
  bump.
- **F-57** — `estMaintenanceKcal` is **not** derived from current weight. That fixes 85 kcal/day of
  staleness and preserves the 2,618 kcal/week structural error, because it still plots a
  1.5-derived line against decomposed burn on a shared axis. It came off the axis instead: the burn
  chart lost its plan series, the daily table lost the plan side of its Burned column, and the
  deficit chart's reference was rebuilt as *this week's own estimated burn minus the calories the
  plan asked for* — same model on both sides. The constant is untouched and still drives the
  plan-internal finding in `findings.mjs`, which compares it only with the calorie budget.

**Subsumes:** F-02, F-10, F-28, F-29, F-49, F-50, F-56, F-57, F-64, F-65, F-66, F-67, F-70, F-71

**Not closed by W5:** F-07 (`rehab` missing from `training.csv`'s type enum) is a schema-completeness
defect and belongs to X-14/W7, not here. Two live rehab rows are logged as `type: other` because of
it, so they cost MET 4.0 rather than 3.0 — a *wrong* number rather than a duplicated one.

---

## X-9 · A fix addresses the class, not the instance

**Status:** `UNENFORCED`, and **unenforceable as a script.** This is the meta-invariant; the
operating rule and the commit gate at the top of this document are its enforcement.

The evidence that prose alone fails: X-9 was written down, given a rationale citing three
same-day violations, and the audit conducted afterwards found seventy more.

**Its check is procedural, and it is checkable:** every commit fixing a defect adds or extends a
check. Data corrections are exempt.

---

## X-10 · Decision logic is covered by tests shown to fail against their defect

**Status:** `BROKEN`. The suites are good; the wiring is not.

- ~~`test-views.mjs` has **never executed in CI** (F-11).~~ ✅ W1.
- ~~`test-prescriptions.mjs` has a case named *"max-by-date, not last-row-in-file"* that exercises
  only one of the three resolver copies (F-58).~~ ✅ W2.
- ~~`test-views.mjs:95-100` regex-parses `rollup.ts` only, so a change to `forecast.ts`'s duplicate
  `COUNTS_TOWARD_FLOOR` passes CI (F-70).~~ ✅ **W5, and by deletion rather than by widening.** The
  set moved to `src/lib/data.ts` and both view libs import it, so there is no second copy for a
  guard to miss; `test-single-home.mjs` fails if a view declares one again. `test-views.mjs` also
  stopped keeping its own `sessionKcal` and `KG_PER_LB` — a suite that retypes the code under test
  certifies the retyping.
- ~~`test-views.mjs` asserts `partialBurn(e, [], 1)` — an input production cannot generate (F-55).~~
  ✅ **W4, and as a general check rather than an edit.** `dayFraction`'s producible domain is
  computed by sweeping all 1,440 minutes of a day, and `test-aggregations.mjs` scans every suite
  for a numeric literal passed where a produced value belongs. Verified to catch the original
  case. **The bigger half of W4 was removing the mirrors:** `test-views.mjs` kept its own copy of
  `partialBurn`, so it tested a lookalike; the arithmetic now lives in `scripts/lib/aggregate.mjs`
  and both the dashboard and the suites import it.
- `daily-rollover`'s push path has never run in 238 commits (F-42). **Still open.**

**Check to build:** every check registered in this document ships with a **red fixture** — an input
that makes it fail — and CI asserts each red fixture still fails. A check that cannot fail is a
check that certifies the bug.

> **A worked example of why this is not ceremony, from W4.** `test-aggregations.mjs` asserted
> *"pctOfTarget against a target of ZERO is null, not Infinity"* and it passed against a
> `pctOfTarget` whose guard had been deliberately removed — because the suite compared values with
> `JSON.stringify`, and **`JSON.stringify(Infinity)` is the string `"null"`.** The assertion could
> not distinguish the two things the whole file is about. Found only by breaking the code on
> purpose and noticing the suite stayed green.

**Subsumes:** F-11 *(shared)*, F-30 *(shared)*, F-42, F-55 *(shared)*, F-70 *(shared)*

---

## X-11 · No per-athlete content in shared code, prose, or skills

**Status:** `ENFORCED` ✓ as of 2026-08-14 (W7) — was `UNENFORCED`. **The acceptance test is that a
stranger forks the template, runs intake, and gets a correct chart on day one, and it now executes:
`scripts/test-cold-start.mjs` builds two repositories and runs the real suite inside them.**

**Statement.** Nothing in `scripts/`, `src/`, `skills/`, `.claude/agents/` or `docs/` may encode a
value, name, injury, sport, domain or preference belonging to one athlete. Per-athlete content lives
in `athlete/` and is rendered from there.

**Why it needed naming.** `constants.json`'s own header already said *"Nothing in `scripts/` or
`src/` may hardcode a value about the athlete"* — and the audit confirmed that held for **numbers**
and failed completely for **prose and enums**. A new athlete got a `primary`-badged measurement label
tile, a card explaining a measurement taken under conditions that made it incomparable, a Today
tab naming which of the *previous* athlete's days were fixed, and **six CI failures on day one**
because all three suites asserted on one chart's live rows.

**Where it lives.** `scripts/lib/athlete-leak.mjs` (the denylist derivation and the scanner),
`scripts/check-no-athlete-leak.mjs` (the CLI over the live chart), `scripts/lib/banned-terms.mjs`
and `scripts/check-banned-terms.mjs` (the athlete's own standing instructions),
`scripts/test-athlete-leak.mjs` (fixture charts for both), `scripts/test-cold-start.mjs` (the
acceptance test), `scripts/lib/test-mode.mjs` (the fixtures-versus-live-chart rule), and the four
homes in `athlete/constants.json` a leak now moves into: `sessionTypes`, `domains`, `metrics`,
`copy`.

Everything is in `check-all.mjs` **except `test-cold-start.mjs`**, which clones repositories and
runs the whole suite inside each copy. Same argument as `test-git-sync.mjs` (X-6): `check-all` runs
inline in every bot before it pushes, so a flake in it would stop a logged meal from being saved in
order to protect a test about a chart with no meals in it. It runs in `validate-data.yml`.

**Checks — ✅ DONE 2026-08-14 (W7):**

1. ✅ **Session-type registry in `constants.json`.** Each entry names its MET, any sourced per-tier
   table, whether it counts toward the sessions floor, and the `goals.md` domain it serves.
   `scripts/lib/schema.mjs` derives `training.csv`'s `type` enum from it — **as a getter, so a
   chart-less repo can still import the schema** — and `metTable()`, `metByIntensityTable()` and
   `countsTowardFloorSet()` all resolve from the same object. `rest` and `other` are supplied by
   `athlete.mjs` to every chart: they are structural rather than athletic, they serve no domain, and
   requiring one would make every chart invent an attribution for two rows of bookkeeping.
   *Closes F-15, F-07, F-70's remainder.*

   > **It changed two rows on this chart, and the arithmetic did not move.** `rehab` had a MET, was
   > documented, drove ~400 kcal/week of forecast, and **could not be written**, so 2026-08-13 and
   > 2026-08-14's daily blocks were logged `type: other` at MET 4.0 instead of 3.0. Both are now
   > `rehab`. **`data/energy.csv` is byte-identical** — both rows carry a blank `duration_min`, so
   > `sessionCost` returned 0 either way. Verified by diffing the regenerated ledger, not assumed.

2. ✅ **`scripts/check-no-athlete-leak.mjs`**, with the denylist derived from `athlete/` and nothing
   named in `scripts/`. **Reports 8 lines in 4 files on the live chart**, all acknowledged; see the
   box below for what the derivation costs. *Closes F-31, F-34's mechanism.*
3. ✅ **Fixtures, not live data**, in all four suites. `scripts/lib/test-mode.mjs` holds the rule:
   *logic is asserted against fixtures; the live chart is only ever reported on.* `check-all` passes
   `--real`, and every live assertion behind the flag is gated on the data it needs existing, so an
   empty chart prints "not applicable" instead of failing. *Closes F-30.*
4. ✅ **Cold start.** `athlete.mjs`'s fallback to the non-existent `constants.template.json` is gone;
   `constants` is a proxy that throws *"run intake first — SETUP.md §2"* on first field access, so
   importing the module stays free and `validate-data.mjs`'s no-chart early exit still runs.
   `check-all` skips the chart-dependent steps by name, and `skills/intake` creates
   `constants.json` **last**. *Closes F-17, F-39.*
5. **Template sync tripwire.** Unbuilt — W8. Unchanged from the original plan.

> ### What the leak scanner can and cannot see, and the number that decided it
>
> The denylist is **derived from structured fields the chart already maintains** — the session-type
> registry, `domains`, `metrics`, the weekly template's session names, `copy`, `events`, the
> athlete's name. Nothing in `scripts/` names anything, which is the same seam
> `scripts/lib/suspensions.mjs` uses.
>
> **Harvesting the athlete's PROSE was built, measured three ways, and removed:**
>
> | Harvest | Result on this chart |
> |---|---|
> | every content word in `athlete/*.md` | **463 hits in 43 files**, almost all ordinary English |
> | capitalised words only | 158 hits in 40 files — `Training`, `Travel`, `Movement`, `Pain` |
> | capitalised, recurring twice in a file | 158 hits — recurrence separates names from sentence openers, not names from ordinary words |
> | **structured fields only** | **8 hits in 4 files, zero false positives** |
>
> The third row is the interesting failure: it correctly found the drug, the machine and the
> clinician, and equally found `Build`, `Home`, `Left` and `None`. **No mechanical rule separates
> "an ordinary word this athlete's file happens to capitalise" from "a name"**, and the only thing
> that would is a stoplist tuned against this chart's output — per-athlete content inside the
> scanner, which is the defect being checked for.
>
> **What that costs, stated rather than hidden: a term that identifies the athlete but sits in no
> structured field is not detected.** The case that proved it: a brand-name medication and a
> symptom count belonging to one athlete, sitting as *fixed columns* of `body.csv` with a form
> field each, in `scripts/lib/schema.mjs`, `src/app/log/page.tsx` and `src/app/api/log/route.ts`.
> A denylist derived from structured fields cannot see a term that IS a column name. **That was a
> real X-11 breach the scanner could not detect.** The fix is `data/metrics.csv`, which exists for
> precisely this, but moving a column rewrites rows the athlete has already logged and
> changes the athlete's log form — a data migration and a conversation, not a sweep.
>
> **Acknowledgements are pinned to lines, not to the scan.** Four files carry one:
> `.claude/agents/MANIFEST.md` (which declares itself per-athlete in its own first line),
> `skills/daily-dashboard/SKILL.md`, `skills/intake/reference/worked-example.md` and
> `skills/program-design/SKILL.md`. Each records the line numbers, a digest of those lines as they
> sit on disk, a reason and an owner. **The digest is chart-independent on purpose** — the first
> version digested the *scan*, so on any other chart all four read as "no longer leaks" and a new
> athlete's first push went red over exemptions belonging to somebody else. F-30's shape,
> reintroduced by the mechanism written to close it, and found by the cold-start suite.
>
> **`docs/` is reported, never failed.** It is the engineering record *of these findings* — X-11's
> own statement quotes all three F-31 strings verbatim — and its only audience is the maintainer.
> 71 hits in 9 files, printed every run.

> ### The BMI ban is the ATHLETE's, and it ships inert
>
> `athlete/profile.md` records BMI as *"not to be used, cited, or computed… including in passing"*.
> **F-43's operational half was closed at the athlete's own instruction** — *"the ban came
> from me and should exist only for me, not as part of the system"* — and this document's own X-12
> section was stale in saying otherwise. **Verified 2026-08-14: `athlete/goals.md` and
> `athlete/constants.json` contain no BMI justification for the 170 lb floor.** The only live
> mention is `constants.json`'s weight-floor note recording that the citation *was there and was
> removed*, which is the audit trail for the correction and carries a dated, owner-named exemption.
>
> **The 170 lb figure is untouched and no new rationale was written for it.** X-12 says
> re-justifying a live safety floor is a coaching decision and needs the maintainer, not a sweep.
>
> What W7 built is the **mechanism**: `scripts/lib/banned-terms.mjs` reads the ban out of the
> athlete's own standing-instruction heading — English grammar, not this athlete's vocabulary — and
> a chart with no such heading runs the check and it does nothing. Scope is the chart's live
> decision surfaces plus the surfaces that speak to the athlete (`src/`, `skills/`,
> `.claude/agents/`), because *"never quoted or used by any agent evaluating my status or
> progress"* are their words. `decisions.md`, `logs/`, `docs/` and `data/METHOD.md` are out: the
> history of a ban is not a use of it, and a shared system document is where one athlete's
> preference must never become a rule.

**Subsumes:** F-09 *(open, W8)*, F-15, F-17, F-30, F-31, F-34, F-39, F-43 *(mechanism)*

---

## X-12 · Every safety floor is computed and surfaced — never enforced against reality *(new)*

> **This invariant was stated wrongly first, and the wrong version shipped.** It originally read
> *"Every safety floor has a mechanical backstop… a check in `validate-data.mjs` that fails the
> build."* That is a category error, and the athlete named it:
>
> > *"There is no such thing as 'never let the calorie target drop below your RMR'. Nothing in
> > this system can stop that. It can't make me eat. It should inform and recommend. That's it."*
>
> The consequence was concrete: a 2 lb week would have failed `validate-data`, failed `prebuild`,
> failed the deploy, and **frozen the dashboard because the athlete stepped on a scale** — with no edit
> available short of falsifying a weigh-in, which is the exact behaviour this repo exists to
> prevent.
>
> **The root cause was a missing model, not a missing check.** Nobody had written down what each
> layer is for, so a rule was translated from one into another where it means something else:
>
> | Layer | Its only job |
> |---|---|
> | `data/` + scripts | **Record faithfully** what was decided and what happened |
> | Dashboard | **Show honestly** what is true right now |
> | Coach + agents | **Set goals, design activities, recommend, argue** |
>
> §5.2 tells the *coach* to hold floors "against the athlete's explicit instruction". That is an
> instruction to a conversational agent — "I will not write you a plan below your RMR, and here
> is why." Holding a floor is a conversational act. It does not become a database constraint
> because both live in the same repo.

**Statement.** Every floor in `CLAUDE.md` §5.2, and every trigger in `goals.md` that cannot fire,
is **computed deterministically and surfaced where a human will see it** — the coach at session
start, the athlete on the dashboard. Nothing in `data/` ever refuses a write because a number is
unwise. A floor that only a coach reading carefully would notice is not surfaced; a floor that
fails a build is not a floor, it is an outage.

**Why it needed naming.** §5.2 lists floors to be held *against the athlete's explicit
instruction*. Verified: `grep -rn "rmrFloorKcal|maxRatePctBwPerWk" src scripts` returns the
definition, the bundle write, and the type declaration. **Three sites, zero enforcement.**
`maxRatePctBwPerWk` has no call sites at all. The 16-week deficit cap has no representation
anywhere. A 1,000 kcal target row — 618 below the floor — validates clean, and
`generate-targets.mjs` writes a target row every morning with, in its own words, *"no AI, no
coaching session, no judgement."*

The presence of a well-named function reads as enforcement. It is not. Three of the four audit
passes found this independently.

**Where it lives.** `scripts/lib/findings.mjs` computes them; `scripts/build-findings.mjs` prints
them and writes `data/findings.json`; `build-data-json.mjs` puts them in the dashboard bundle;
`CLAUDE.md` §0.2 makes the coach read them before anything else. Fixtured in
`scripts/test-findings.mjs` — whose **first assertion is that this layer never blocks.**

**Checks — all four §5.2 floors, ✅ DONE 2026-08-13:**

1. ✅ **No calorie target below estimated RMR** — reported against the *newest* target only, at the
   weight in force on that date. Older rows are history: the coach cannot un-prescribe last
   Tuesday, and a list of every past breach is noise rather than a finding.
2. ✅ **Protein is never cut to make other numbers fit.**
3. ✅ **No sustained loss rate above `maxRatePctBwPerWk`** — week-over-week on 7-day means, never a
   single weigh-in. **An observation.** It can only ever inform.
4. ✅ **No deficit phase beyond 16 weeks**; heads-up at 14. **Elapsed time.** Nothing can be edited
   to "fix" it, so blocking on it was never coherent.
5. ✅ **A trigger with a blank threshold is reported, never filled in.** *F-20: the Health BP
   trigger has read `above ___ / ___` since intake, so the domain that outranks everything the
   moment it fires cannot fire at all. It is still blank — deliberately. See below.*

*Closes F-05, and surfaces F-20 without resolving it.*

**Three design decisions worth knowing:**

- **Every energy finding is gated on the chart actually running a deficit** (`plan.targetRateLbPerWk`).
  A chart whose domains are symptom control and sleep must never be told its calorie target is too
  low — it does not have one. Per §1.1, a check no domain needs is a chore invented for the
  athlete. There is a fixture for this.
- **No exemption mechanism was needed after all.** The original design agonised over an opt-out
  column for a legitimate very-low day (a fast, a bowel prep). Once nothing blocks, the question
  dissolves: a fast is logged, the finding notes the target is below the floor, the coach raises
  it, and the athlete decides. That is the correct handling and it needed no schema at all. **The
  feature only existed to work around a mistake.**
- **The blank BP threshold is still blank, on purpose.** The first version of this check was a
  build failure, and to make its own check go green the coach **invented a clinical threshold
  (135/85) and committed it.** The tail wagged the dog: a health decision belonging to the athlete
  and their doctor was made to satisfy a test. It has been reverted. The finding now says
  explicitly *"Do not invent one to close the gap"*, and `test-findings.mjs` asserts that sentence
  is present — because the failure mode was not a missing check, it was a check that pressured the
  coach into overreach.

**✅ F-43, the BMI ban — closed in two halves, on two different days, and the distinction matters.**
The *operational* half closed 2026-08-13 at the athlete's own instruction: the BMI justification is
gone from `goals.md` and `constants.json`, and the floor is justified on percentage from baseline
alone. **This section said otherwise until 2026-08-14 and was simply stale** — verified by grep, the
only live mention is `constants.json`'s note recording that the citation was removed. The
*mechanical* half closed 2026-08-14 (W7): `scripts/check-banned-terms.mjs` reads the ban out of the
athlete's own standing instruction and is inert on a chart that has not written one, because **the
ban is one athlete's and must never ship as a rule imposed on another whose doctor wants the
number.** See
the box in X-11. **The 170 lb figure was not touched and no new rationale was written for it** — per
this invariant, that is a coaching decision.

**Subsumes:** F-05, F-20, F-43

---

## X-13 · A lookup selects on every dimension of its key *(new)*

**Statement.** Where a domain has two or more dimensions — date **and** session, date **and**
exercise, weekday **and** session type — a filter that selects on one of them is a defect, whether
or not it currently returns the right row.

**Why it needed naming.** This is the audit's shape D, it produced six findings, and it has been
fixed three times as three separate instances. Naming it is most of the fix.

**Status:** `ENFORCED` as of 2026-08-14 (W2). All six below are built, with eleven red fixtures in
`scripts/test-prescriptions.mjs` and `scripts/test-views.mjs`, each shown to fail against the defect
it describes before the fix landed. Item 5 ships as a **finding, not an assertion** — see below.

**Checks — ✅ DONE 2026-08-14 (W2):**

1. ✅ **One `effectiveRx`** exported from `src/lib/forecast.ts` and imported by `today/page.tsx`,
   `log/page.tsx` and `planDay`, with `rxSessionFor` bridging `training.csv`'s descriptive session
   names to `prescriptions.csv`'s short ones — and refusing to bridge an ambiguous one rather than
   guessing which block was performed. `test-prescriptions.mjs` greps the two pages for a resolver
   of their own, with comments stripped so prose about the rule cannot satisfy it.
   **Signature kept as `(session, date)`**, not the `(date, session)` this document named: flipping
   two same-typed string arguments is the silent-swap defect this invariant is about.
   *Closes F-58.*
2. ✅ **Session-scoped set completion** — `setsForSession(daySets, session, dayNames)`, a no-op on a
   one-session day so no historical day changes, then exact match, then `sessionKey`, then nothing.
   Unattributable sets stay visible in the unscoped "every set logged today" tables: hiding logged
   work is its own defect, just a quieter one. *Closes F-53.*
3. ✅ **Deliberate primary-session resolution** — `orderedSessions` / `primarySession`, ranked
   `not skipped` → `has a live prescription` → `completed over planned over rest` → file order.
   The prescription key sits above status deliberately, and the case that decides it is a completed
   morning walk beside a planned evening lift: status-first picks the walk, and the evening's sets
   are then written under it. `log/page.tsx` also stopped guessing where it could ask — with more
   than one session on the day the Sets form renders a session picker, and its exercise list is
   grouped by session so an exercise cannot be offered under a session it does not belong to.
   *Closes F-52.*
4. ✅ **Template fields guarded by session identity** — `focus` **and** `durationMin`, both guarded
   the way `met` already was. `durationMin` was not in the original list and had to be: once a
   session with a deliberately blank duration can be the day's primary, an unguarded template lends
   it 35 minutes and the forecast costs a session that reported none — X-1 and X-13 in one row.
   *Closes F-54.*
5. ✅ **Effective-dating survives a rename** — as `markerAudit` in `scripts/lib/findings.mjs`,
   which **reports and can never block**. Every mismatch it finds closes by choosing a load, a dose
   or a marker, and none of those belongs to the check; a check that cannot go green without
   someone inventing a number is the one that produced the 135/85 threshold. It finds **six of the
   seven markers unreadable** against the live block, including the suitcase carry still prescribed
   at 30-40 s/side in `Session One (modified)` against a marker that fires below 49 s — the same row
   corrected in one session and missed in the session written beside it the same day.
   *Closes F-01, F-37.*
6. ✅ **Most-recent-on-or-before, not exact-match** — `latestOnOrBefore` in `src/lib/data.ts`, and
   the Today tab stamps a note that is not today's with its own date. An older note rendered
   undated is a different defect from an invisible one. *Closes F-60.*

**Subsumes:** F-01, F-52, F-53, F-54, F-58, F-60

---

## X-14 · The schema is complete, and every writer passes through it

**Status:** `ENFORCED` ✓ as of 2026-08-14 (W7) — was `PARTIAL`.

**Statement.** Every file in `data/` has a `SPEC` entry with types, ranges, enums, required fields
and a uniqueness key, and **every entry declares what a row IS**. Every writer — dashboard,
workflow, coaching session — passes through `validateRow()`. No path reaches `main` unvalidated.

**Where it lives.** `scripts/lib/schema.mjs` (the shape and the `records` classification),
`scripts/lib/rowwrite.mjs` (`futureRowRejection`, now reading the classification rather than naming
a file), `scripts/validate-data.mjs` (duplicates, the registry, the timezone),
`scripts/test-rowwrite.mjs` §"schema completeness", and `.github/workflows/log-steps.yml`.

**Checks — ✅ DONE 2026-08-14 (W7):**

1. ✅ **Uniqueness.** An exact-duplicate line is an **error** — two identical rows are a
   contradiction in the record, and it is fixable by editing the file, which is the test for a
   validator rule. A duplicate on `meals.csv`'s `uniqueKey: ['date','time','item']` is a **warning**,
   because it is sometimes true: the same protein bar twice, both logged at the same rounded time.
   Verified zero false positives on the live chart. *Closes F-21.*
2. ✅ **Schema completeness, as assertions rather than as a list.** `SPEC` covers every `data/*.csv`
   and every entry names a file that exists; every header matches the file on disk; every entry
   declares `records`; a `plan-or-outcome` entry names its planned status and its outcome columns,
   and those columns are real columns. **`energy.csv` has an entry** — it was the tenth file and the
   only one with none, and it is generated, which is exactly where a silent header change is
   plausible. *Closes F-72.*

   > **F-07's class was deleted rather than checked.** The audit asked for
   > `Object.keys(DEFAULT_MET) ⊆ SPEC['training.csv'].enums.type` — two lists of the same thing in
   > two files, with a test asserting they agree. There is one list now (X-11 item 1), so the
   > assertion is that both derive from it: a type with a MET and no enum entry, which cost two real
   > rows the wrong MET, is no longer expressible.

3. ✅ **Validate in every workflow.** `log-steps.yml` runs `check-all.mjs --regen-energy` and commits
   `data/energy.csv` alongside the steps row — landed in W3; unchanged here. *Closes F-26, F-22.*
4. ✅ **Prescribed vs measured, modelled in the schema.** `futureRowRejection` read
   `if (file !== 'training.csv') reject` — a list of one masquerading as a principle. Each `SPEC`
   entry now declares `records: 'measurement' | 'prescription' | 'plan-or-outcome'`, and the rule
   reads that. **`targets.csv` is `prescription`, so travel targets can be written ahead** — the LA
   trip departs 2026-08-15 and travel is this athlete's #1 documented streak-ender, so the previous
   remedy was a coaching session every morning of it. `prescriptions.csv` is prescribed too;
   everything measured stays rejected outright, and `compute-energy.mjs` independently skips future
   dates. *Closes F-23.* — **The targets themselves are not written here: those are calorie figures,
   and they belong to the coach and the athlete.**
5. ✅ **Input hardening.** `athlete.timezone` is validated by asking `Intl` rather than by
   `v.includes('/')`, **and the check was moved above the first use of it** — the stronger predicate
   sat 100 lines below `localToday()`, so the same raw `RangeError` still came out of a validator
   whose whole job is to fail in sentences. Found by breaking it on purpose after the fix was
   written. The `log-steps.yml` commit message is built by node from the payload's digits only,
   before git sees any of it; passing the payload through `env:` rather than `${{ }}` was W3's fix
   and remains the one that matters. *Closes F-46, F-47.*
6. ✅ **The session-type registry is validated as data.** Each entry's `met` is a number in range,
   `countsTowardFloor` is a boolean, `domain` is present, tier keys are real tiers, and a type
   declaring `energyCountedIn` must cost 0 — the double-count trap, generalised from
   `metOverrides.walk must stay 0`, which only worked for a chart that happened to call it "walk".
   A `training.csv` row whose type left the registry is an error, so a type cannot be dropped out
   from under its own history.

**Subsumes:** F-07, F-21, F-23, F-26, F-46, F-47, F-72

---

## X-15 · Every prescribed number has a rendering surface *(new)*

**Status:** `ENFORCED` ✓ as of 2026-08-14 (W6) — was `PARTIAL`. Items 1, 2 and 4 landed in W1;
item 3 (alcohol) landed in W6, in a different shape than the plan asked for, and the reason is the
most useful thing in this section.

**Statement.** A number written to `data/` that no page renders has failed in the same way as a
number never written. Every prescription, target, dose and dated follow-up names the surface that
shows it, and a check asserts that surface exists.

**Extended 2026-08-14 (W6): the read side has a second failure mode, and it is worse.** A number
rendered from a *superseded* source is not a gap, it is a wrong answer wearing the plan's clothes.
`skills/daily-dashboard` fell back to `program/current-block.md`'s weekly template when no row
existed — and on the chart where this was found, the section carrying that heading was a
preserved, not-live one, kept deliberately for a later revert. A weekday with no row surfaced the
one activity the active rehab block had suspended. **The fallback is gone. "No session written for today
yet" is now the answer**, because a blank is obviously a blank and a stale table is not (F-35). The
same reasoning removed that skill's licence to write a prescription row at all: transcribing a
preserved table into the live file is how a superseded prescription becomes the current one.

**Why it needed naming.** X-3 governs the write. Nothing governs the read, and the chart has
already paid for it: three knee flares while a rehab block called for at intake sat unwritten.
`METHOD.md:226` names the failure exactly — *"a rehab block that exists in a markdown file and
never reaches the athlete."*

**Checks to build:**

1. ✅ **DONE 2026-08-14 (W1) — and NOT as `data/followups.csv`.** A register only ever contains
   what somebody remembered to put in it, and **every follow-up this chart has lost was lost
   because it was written in prose and never transcribed.** A CSV would have needed the same
   person, in the same session, to remember the same thing twice.

   So **the date is the registration**: `datedFollowUps()` in `scripts/lib/findings.mjs` scans the
   chart's prose (`scripts/lib/chart-docs.mjs` — `nutrition/`, `program/`, `athlete/goals.md`,
   `decisions.md`, directories not filenames, per X-11) for future ISO dates inside a three-week
   horizon, groups them by date, and quotes the plan file ahead of the history log. `attention`
   inside seven days — before the next weekly review — `info` beyond it.

   It found every live commitment on the day it was written: the ~08-17 measurement hold, the
   08-20 LA conversation, the 08-27 recalibration (written in nine places, rendered as one
   finding), the ~08-29 probiotic stop-test, the 08-30 block end and 08-31 plan review.

   **The known cost is precision**: a date in an argument is picked up alongside a date in a
   commitment, because nothing in the text distinguishes them. Deliberate — the finding quotes its
   own source so a false positive is dismissed in a second, and a false negative is a stop-test
   that ends uninterpretably. *Closes F-24, F-32.*

   > **⚠ EXTENDED 2026-08-14 (W6): `logs/` is now scanned, and its exclusion was a hole.** A coach
   > wrote a dated medical follow-up into a session log, checked whether it would fire, and found
   > it invisible; it only fired once the sentence was moved to `nutrition/supplements.md`.
   > **`CLAUDE.md` §0.3 tells every session to write its prose to `logs/YYYY-MM-DD.md`** — so the
   > single most likely place for a commitment to be written down was the one place nothing read.
   > That is this finding's own failure mode, reproduced by its own scope.
   >
   > `chart-docs.mjs`'s plan-versus-description argument survives; it just does not reach here. A
   > log is not description — it is where a decision gets *made*, in the words it was made in,
   > before anyone has transcribed it to a plan file. And "history is out" was never the rule:
   > `decisions.md` is history and has always been in.
   >
   > **The cost was measured before the change, not assumed.** Against the live chart, adding
   > `logs/` contributed **two** dates nothing else carried — a 2026-08-15 blood draw and a session
   > moved to 2026-08-15 — plus extra citations on five dates already found. Two, because the scan
   > only looks forward and a log is overwhelmingly a record of what already happened. Logs rank
   > **last**, behind `decisions.md`, so the finding still quotes the most canonical statement of a
   > date and mentions the rest. Follow-ups default to the `coach` audience, so none of it reaches
   > the athlete's screen.
2. ✅ **DONE 2026-08-14 (W1).** `scripts/test-views.mjs` asserts every bundled store reaches a
   rendering surface, and `src/components/metrics-card.tsx` renders the registry — with a
   registered-but-never-measured metric shown as TBD rather than hidden, which is the whole point:
   BP and resting HR were registered so the Health domain could be measured at all, and hiding
   them until the first reading would make the gap invisible again. *Closes F-61.*
3. ✅ **DONE 2026-08-14 (W6) — and `plan.weeklyAlcoholKcalBudget` was deliberately NOT added.**
   The plan asked for a budget constant, a per-day allocation and a meter. **The budget is not the
   maintainer's to write, and reading `plan.md` carefully says it is not the coach's either.**

   > ### ✅ CLOSED 2026-08-14, LATER THE SAME DAY — **by the athlete, which is the only way it could
   > ### close.** He asked for a weekly chart and set the number: **1,400 kcal/week**, the top of
   > the range the plan already carried, recorded `athlete-confirmed` with the date and the answer
   > they gave. The `alcohol-budget-unset` finding stopped firing on its own. **Nobody picked a
   > number; the finding did its whole job, which was to keep asking until they did.**
   >
   > **What did NOT change is the more interesting half.** The per-day allocation the original plan
   > asked for is *still* refused, and now has a check of its own: `generate-targets.mjs` still
   > writes a blank `alcohol_kcal`, `test-views.mjs` fails any file that divides the weekly figure,
   > and `test-single-home.mjs` fails a `/today` that renders a seventh of it. The unevenness is the
   > plan — a big night is typically scheduled at the weekend and away from the hardest training
   > evenings — so a flat per-day figure would be a target nobody set, sitting exactly where the one
   > they did set belongs.
   >
   > **The weekly FOOD allowance is derived and lives nowhere**: `weeklyBudget()` in
   > `scripts/lib/aggregate.mjs`, with a scan over every file in the repo — prose included — for the
   > figure. It caught its author within a minute of being written, in the note explaining the
   > derivation.
   >
   > **The new surface is `/today`'s weekly card**, three meters against Food / Alcohol / Total with
   > a kcal ⇄ % toggle, and it carries this invariant's own hard case: *a week-to-date figure
   > against a full-week budget flatters them.* The denominator is still the week, because that is
   > what they asked for; what stops it lying is a pace line summed over **the same days the consumed
   > figure covers** — F-51's shared-denominator rule, applied to a budget. See the note under
   > `weekIntake` for why prorating `12,950 × days ÷ 7` was rejected: on an uneven budget it
   > fabricates 700 kcal of headroom on the Friday before the weekend the structure exists to
   > protect.

   The figure it prices describes what the athlete *already drinks*: the sentence is *"priced at
   their **real** intake, not a wishful number"*, computed off the athlete-stated typical week in
   `athlete/values.md`. **That is an observation, not a budget they agreed
   to**, and promoting it would file a coach's inference as the athlete's own instruction — X-16's
   defect, in a different unit and with better justification, which makes it harder to catch rather
   than easier (`red-team.md`, item 3).

   So the data half shipped and the denominator waits:
   - `alcohol_kcal` in `targets.csv` stays **blank** on every generated row, and
     `generate-targets.mjs` now says in its own header why a number there would be a target nobody
     set.
   - `DayRoll.targetAlcoholKcal` renders a **meter on the days a coaching session wrote a real
     allowance** — 2026-08-07 has one, 330 against a logged 392 — and the bare figure with no
     denominator on every other day.
   - `WeekRoll.alcoholKcal` and `alcoholDaysLogged` render on History as a column with its own day
     count (`992 / 2d`), because a total without its denominator reads as a light week rather than
     a mostly-unlogged one.
   - Today's caption **stopped promising a third dial**. It said *"three dials: a calorie ceiling, a
     protein floor, and the alcohol budget"* above four meters, none of them alcohol; the sentence
     lost the dial rather than the page gaining one.
   - The gap is the `alcohol-budget-unset` **finding** — `info`, coach audience, quoting the plan
     and saying in those words *"do not pick one."* It fires only where the chart has already
     hand-written an allowance at least once, which is the evidence this chart wants a figure there
     rather than a chore invented for every athlete.

   *Closes F-38's data and rendering halves and F-69.* Whether a chart wants a weekly alcohol
   budget at all, and what it is, is the athlete's alone to say. An absent budget rendering as TBD
   is still a correct chart, and is what a new chart gets.
4. ✅ **DONE 2026-08-14 (W1) — and NOT as `Daily` rows.** The stack is in `prescriptions.csv`
   under a second reserved session name, `Supplements`, rendered as the "Daily stack" card on
   Today. Under `Daily` it would have become the newest `Daily` set and **silently deleted the
   eleven-item knee-rehab block** — X-13 turning this very invariant into a live prescription
   failure. See `data/METHOD.md`, "`Supplements` is the second RESERVED session name".
   *Closes F-24's stack half.*

**Subsumes:** F-13 *(shared)*, F-24, F-32, F-35, F-38, F-61, F-69

---

## X-16 · Every number records who it came from *(new)*

**Statement.** Every threshold, target, trigger and plan constant carries a marker saying whether
the athlete said it, the athlete confirmed it, the coach proposed it, it was derived, or it came
from outside. A number the coach produced is **never** recorded in a form that reads as the
athlete's instruction — and a number nobody has ruled on is surfaced until someone does.

**Why it needed naming.** Three violations in one day, 2026-08-13, and they are one defect:

- A **185 lb weight ceiling** the coach invented on 2026-08-11 and wrote into `goals.md` beside a
  floor the athlete did own. *"I don't know what that is or where it came from. I never provided
  that weight and if I get close to it, I will throw this whole system away and call it a
  failure."*
- A **135/85 BP threshold** invented to make the coach's own failing check go green (X-7's failure
  mode wearing X-16's clothes).
- A **BMI justification** for the 170 lb floor, in a chart whose `profile.md` bans BMI outright
  and simultaneously claimed no threshold anywhere referenced it.

**This is the most dangerous class in the system**, and it is the only one where the damage is
irreversible: every other number can be recomputed from data, and there is no data from which to
re-derive what someone wants.

**Checks — ✅ DONE 2026-08-13 (W0):**

1. ✅ **Vocabulary** in `data/METHOD.md` ("Provenance") — five classes and the five rules that
   make them mean something, including the two that stop the check being gamed: *never delete an
   unconfirmed value to make the marker go away*, and *never upgrade a marker without a quote*.
2. ✅ **Markers on every value** in `constants.json`'s `baseline`, `plan` and `triggers`, under
   `_`-prefixed `_provenance` maps that `stripNotes()` removes before the dashboard bundle.
3. ✅ **`scripts/test-provenance.mjs`** — asserts every non-`_` key is marked and well-formed, with
   **ten red fixtures**, one per defect it describes, including the unmarked-value case that is
   the 185 lb ceiling itself. Wired into `check-all.mjs`.
4. ✅ **A finding** for any `coach-proposed-unconfirmed` value older than 7 days.
5. ✅ **A whole-chart audit**, tracing every threshold to its author, with an UNTRACEABLE section
   that is deliberately left open.

**The two-layer split is the point.** The *marker audit* can fail a build: a missing marker is
fixable by editing the record, which is exactly what `data/` is allowed to refuse. The *finding*
can never fail anything: the only thing that closes it is the athlete saying something, and a
check that cannot go green without a decision its runner does not own is precisely the check that
produced the 135/85 threshold. Same feature, two layers, opposite powers.

**The UNTRACEABLE list.** Every chart accumulates values nobody can close but the athlete —
intake-era process goals graded against baselines that were never taken, a target sitting where
one they actually set used to be. They are listed, dated, and left live. **Do not resolve them by
picking values.**

---

## X-17 · A machine-readable default always answers — prose may refine it, never suppress it *(new)*

**Statement.** Where a deterministic structure in `athlete/constants.json` can produce a value, an
automated writer produces it. Prose in the chart may *change* what that value should be; it may
never be a reason to write nothing. The only thing that suppresses a value is the athlete saying so
for a specific instance.

**Status:** `ENFORCED` ✓ as of 2026-08-15 — `scripts/lib/targets.mjs` (the rule),
`scripts/check-targets-gap.mjs` (the CLI, in `check-all.mjs`, therefore in every bot before every
push), `scripts/generate-targets.mjs --fill-gaps` (the mechanical fix),
`.github/workflows/daily-rollover.yml` (applies it daily), `scripts/test-aggregations.mjs` §12
(fixtures plus a live red fixture the suite runs on itself). Stated in prose in `data/METHOD.md`
(`targets.csv`) and `CLAUDE.md` §0.3.

**Why it needed naming, and why it is not any of the sixteen above.** On 2026-08-15 an automated
pre-dawn job read `nutrition/plan.md`'s travel protocol — *"a hard calorie ceiling"*, with no file
anywhere saying what that ceiling is — reasoned that writing the weekday figure would contradict the
prose and writing maintenance would be a guess in the other direction, recorded the reasoning in
`decisions.md`, and **wrote nothing**. The athlete woke up travelling with no calorie target:

> *"There is ALWAYS a target for every day. That is a bug. … nothing in prose should ever cause
> there to be no daily target unless I explicitly say I don't want any target for this day."*

Every existing invariant misses it. X-1 is about a number that was measured or not; here the number
was *derivable and was not derived*. X-7 does not fit either — the job did not fail plausibly, it
succeeded at doing nothing and said so. X-12 is its mirror image (a floor that must inform rather
than block); this is a **default that must fire rather than defer**. X-15 governs a number that was
written and never rendered; this one was never written.

**The generalisation, which is what makes it an invariant rather than an incident.** The failing
component was not the generator — run by hand it wrote the row instantly. It was a **reasoning step
placed above a deterministic one**. That configuration recurs wherever an automated session is asked
to "use judgement" about something a structure already answers, and the failure is always silent in
the same way: the session produces a careful, correct-sounding account of why it did nothing.

**The test for a new instance:** *can this value be produced from `athlete/constants.json` and the
calendar alone?* If yes, an automated writer is not entitled to decline, and the check for it is a
gap scan over the produced series. If no, it belongs to the coach or the athlete and nothing may
invent it — which is X-16, and the two are complements rather than rivals.

**Why the check may be a hard error, per the layer model.** A gap is fixable by editing the record:
run the generator. It never demands a judgement, so it can never pressure a session into inventing a
number — the trap the commit gate's second limit describes. Contrast `check-steps-gap.mjs`, whose
subject is written by an automation outside this repo and which can therefore only ever report.

**The cost, and its bound.** While a gap is open, every bot's push is blocked. That is bounded by
`daily-rollover.yml` applying `--fill-gaps` *before* it runs the suite, so the job that guarantees
a target is the job that closes every gap — at worst one cron cycle, and the rollover job can never
block itself.

---

## Maintaining this file

- A new defect gets mapped to an invariant **before** it gets fixed. If it maps to none, it is a new
  invariant — that is how X-11 to X-15 were found.
- Status stamps are derived from whether the check runs in CI, never asserted by hand. When the
  checks exist, generate the status column.
- A row that stays `UNENFORCED` for more than one cycle is a decision to accept the risk. Record it
  in `decisions.md` with what would reverse it, the same as any other plan change.
