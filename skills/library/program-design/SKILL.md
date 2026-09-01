---
name: program-design
description: Build or rebuild a training block. Use when starting a new mesocycle, when the current block ends, after a deload or layoff, when equipment or schedule changes, when an injury requires restructuring, or whenever the athlete asks for a new program or wants to change what they're doing. Also use before agreeing to any requested change in training volume or frequency.
---

# Program Design

**First: read `athlete/goals.md` and determine the current phase.** Do not assume.
The block's objective follows from the active phase, and the phase changes.

| Active phase | Block objective | Success looks like |
|---|---|---|
| Deficit | Retain strength and lean mass | Same loads at a lower bodyweight |
| Maintenance | Rebuild capacity, add volume | Loads creeping up, weight stable |
| Surplus / lean gain | Progressive overload | Loads and bodyweight both rising |

Say the objective up front. In a deficit especially, a maintained lift is a *win* and
will read as failure unless you name it in advance.

## Before you write anything

Read, in this order:
1. `athlete/goals.md` — current phase and ranking
2. **`athlete/injury-history.md` — mandatory gate. Back and knee rules are standing
   constraints at every phase.** Pull the contraindicated list into the block before
   selecting a single exercise, not after.
3. `athlete/profile.md` — training age, equipment, what they'll actually do
4. `athlete/constraints.md` — real available days, and any scheduled big meals or travel
5. `program/current-block.md` — what they're coming off

Then find the number of days they have genuinely sustained before, from the intake question
about their longest streak. **Program that number, not one more.** The most common
programming error is prescribing the frequency they aspire to.

## Structure

- **Frequency:** 3–4 resistance sessions. Each muscle group trained 2x/week.
- **Volume:** 10–20 hard sets per muscle group per week. In a deficit, sit at the lower
  half — recovery capacity is reduced and extra volume buys nothing adherence wouldn't.
  In a surplus, the upper half is where the growth is.
- **Intensity:** keep it high in every phase. Heavy loads at low-to-moderate volume are
  the strongest signal for retaining lean mass in a deficit. Compounds at 3–6 reps,
  RIR 1–3. A deficit is the wrong time for high-rep "fat burning" circuits.
  **Exception: RIR 0 is not programmed on loaded spinal or knee-dominant patterns.**
  Form breakdown under fatigue is where old injuries return.
- **Progression rule:** one sentence, no in-session decisions. Deficit: "hold load and
  reps; add reps only when RIR is clearly 3+." Surplus: standard double progression.
- **Deload:** every 4–6 weeks, or on trigger. Scheduled in the block, not improvised.

## Cardio and NEAT

- **Steps are the primary tool.** Set a daily target and treat it as a process goal.
  More sustainable and less recovery-costly than programmed cardio, and NEAT is what
  silently collapses during a diet. Also the most knee-friendly option available.
- 2–3 low-intensity sessions of 20–40 min if they'll do them.
- Keep HIIT minimal. It competes directly with lifting for recovery, and in a deficit
  recovery is the scarce resource.
- Never program cardio as punishment for eating, and don't accept it framed that way.

## Design for adherence

- Every exercise gets a pre-approved substitution in `program/exercise-library.md`.
- Include a 20-minute minimum viable session and a no-equipment travel session. Never
  zero.
- Sessions should fit the *shortest* realistic window, not the average one.
- Fewer exercises, more sets each. Setup time is friction and friction is missed
  sessions.

## Injury handling — standing, not situational

Work around, never through. Modify range of motion, then load, then pattern — in that
order. Pain that changes gait or movement pattern stops the session and gets referred
out (CLAUDE.md section 5).

**`athlete/injury-history.md` is the list, and it is per-athlete — this file must never carry
one.** Read it before selecting a single exercise and pull its constraints into the block. They
are standing at every phase and every ranking, not situational.

Two patterns worth writing into that file in the athlete's own terms, because they recur and are
easy to under-specify:

- **A joint or spinal site with a history:** say what "load earned through progression, never
  assumed from historical numbers" means for it — which pattern, which variation, what quality
  outranks load — and what symptom stops everything and gets referred out same day (radiating
  pain, numbness, or distal weakness always qualifies).
- **A tendon site:** modify range before reducing load, and track **next-day** response rather
  than in-session pain. Tendons are quiet during the session and loud the following morning, so
  a session that felt fine is not evidence.

**A resolved injury in a deficit deserves more caution, not less.** Reduced recovery and reduced
tissue tolerance arrive together.

## Output — `data/` first, prose second, in this order

**A block that exists only as a markdown table has not been prescribed.** `data/METHOD.md`
names this failure mode in one line — *"a rehab block that exists in a markdown file and
never reaches the athlete"* — and a chart has already paid for it with **repeated flares
while a rehab block called for at intake sat unwritten** (audit F-13). The Today tab
resolves from `data/prescriptions.csv`; with no rows it renders "no prescription for
today", and `skills/daily-dashboard` no longer falls back to prose, so a block written
only here reaches the athlete **nowhere at all**. That is the improvement, not a
regression: a blank is honest and a stale table is not.

Do these in order. Do not do them in parallel, and do not write the prose first "and
transcribe it after" — that is the same order failure with a promise attached.

**1 · Write the rows.** Append to `data/prescriptions.csv`, one row per exercise:
`date,session,order,exercise,sets,reps,load,note`.

- `date` is the athlete's **local** date the prescription takes effect — derive it from
  `scripts/lib/athlete.mjs`'s `localToday()`, never from the session clock (`data/METHOD.md`
  rule 6). Rows are **effective-dated**: a session resolves to its newest dated set, so a
  revision is a new full set of rows for that session on today's date, not an edit.
- **A new set supersedes the whole session.** Write every exercise, including warm-up and
  cooldown rows — an omitted row is a deleted prescription, which is how one chart's session
  silently lost its warm-up (audit F-48).
- `load` and `reps` are what a strength marker in `athlete/goals.md` will be read against.
  If a marker fires at a load or a dose the block does not prescribe, the guardrail cannot
  be read at all and the marker is noise — check `markerAudit`'s output in
  `node scripts/build-findings.mjs` before you finish.
- Reserved session names: `Daily` for work prescribed every day whatever the session is,
  `Supplements` for the stack. They have their own effective-dating timeline — do not put
  anything else under them (`data/METHOD.md`).

**2 · Write the weekly skeleton.** `athlete/constants.json` → `program.weeklyTemplate`, one
entry per athlete-local weekday: `type`, `session`, `focus`, `durationMin`. **`session` must
match the `session` column of the rows you just wrote**, or the day resolves to nothing.
Update `sessionTypes.<type>.standingDurationMin` if the daily block's length changed — the
type is named in `program.dailyBlockType`, and that one figure prices the block on both the
ledger and the forward view.

**3 · Run the checks. A failure here is a hard stop, not a note to fix later.**

```
node scripts/validate-data.mjs
node scripts/check-suspensions.mjs
node scripts/build-findings.mjs
```

`check-suspensions.mjs` is the one that catches the block contradicting itself: no template
entry, live prescription row or `program/exercise-library.md` substitution may name anything
the active block suspends. If the new block suspends something, say so in a sentence the
check can read — *"Not in Phase 1: …"*, *"Still not in Phase 2: …"*, *"X is out"* — and then
run `node scripts/build-docs.mjs` so the library's ⛔ banner regenerates. Mark any
substitution that is now out with ⛔ in the library itself, so they read it in the file they
opens rather than in a second file they have to remember to open.

**4 · Then write the prose**, and write it *from the rows*, never beside them.
`program/current-block.md`: dates, block goal, frequency, the progression rule, the weekly
volume tally by muscle group, the deload week, the autoregulation rules, and the
rationale — **the why, not a second copy of the numbers.** Where the prose must state a
load or a dose, it must equal the row; `scripts/test-single-home.mjs` §2b fails on a
disagreement. Prefer pointing at the file: *"the schedule is `weeklyTemplate`"* is one home,
restating the table is two (audit F-25).

**5 · Commit and push immediately** (CLAUDE.md §0.3), then route to the **red-team** agent,
then present it with its strongest counterargument, its confidence level and the failure
mode. Log the change in `decisions.md` with what would reverse it.
