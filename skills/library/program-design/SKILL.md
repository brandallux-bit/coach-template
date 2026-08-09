---
name: program-design
description: Build or rebuild a training block. Use when starting a new mesocycle, when the current block ends, after a deload or layoff, when equipment or schedule changes, when an injury requires restructuring, or whenever the athlete asks for a new program or wants to change what he's doing. Also use before agreeing to any requested change in training volume or frequency.
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
3. `athlete/profile.md` — training age, equipment, what he'll actually do
4. `athlete/constraints.md` — real available days, and any scheduled big meals or travel
5. `program/current-block.md` — what he's coming off

Then find the number of days he has genuinely sustained before, from the intake question
about his longest streak. **Program that number, not one more.** The most common
programming error is prescribing the frequency he aspires to.

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
- 2–3 low-intensity sessions of 20–40 min if he'll do them.
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

Specific to this athlete, at every phase and every ranking:
- **Back:** load earned through progression, never assumed from historical numbers.
  Position quality outranks load on every hinge and squat. Deadlift variation chosen for
  spinal tolerance. Any radiating pain, numbness, or leg weakness stops everything and
  gets referred out same day.
- **Knees:** modify range before reducing load. Track next-day response, not just
  in-session pain — tendons are quiet during the session and loud the following morning.
- **A resolved injury in a deficit deserves more caution, not less.** Reduced recovery
  and reduced tissue tolerance arrive together.

## Output

Write to `program/current-block.md`: dates, weekly template, full session detail with
sets/reps/RIR, the progression rule, weekly volume tally by muscle group, deload week,
and the autoregulation rules.

Route to the **red-team** agent before delivering. Then present it with its strongest
counterargument, its confidence level, and the failure mode. Log it in `decisions.md`.
