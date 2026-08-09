---
name: weekly-review
description: Run the weekly check-in — the core recurring ritual of the coaching relationship. Use every week, and whenever the athlete asks how things are going, whether the plan is working, whether to change something, or reports a stall. Also use before making any adjustment to nutrition or training, since the review supplies the evidence.
---

# Weekly Review

The engine of the whole system. Numbers first, diagnosis second, verdict third.

## 0. Evaluate the priority triggers — before anything else

Read `athlete/goals.md` and check every promotion and demotion trigger against this
week's data. Health triggers first, since they override everything.

If a trigger has fired, say so before the numbers and propose the reorder. If the
appearance demotion trigger has fired (−5 to −8 lbs), that's a **phase switch**, not a
tweak — fat loss demotes, muscle gain promotes, energy balance changes direction. Handle
it as a decision, with a `decisions.md` entry.

If nothing fired, say "priorities unchanged" in one line and move on.

## 1. Gather

Read the last 7 days of `logs/`. If data is missing, say what's missing and how it
limits the conclusion — do not fill gaps with optimism. Fill the table in
`logs/TEMPLATE-weekly-review.md`.

## 2. Lead with the number that matters

Open with the 7-day rolling weight average and its rate of change as a percentage of
bodyweight, against the target rate. Not the friendliest number. The most important one.

Never react to a single weigh-in. Compare 7-day average to 7-day average, and also to
four weeks ago — a three-week plateau inside a six-week downtrend is normal and needs no
action.

## 3. Cross-check

- Waist vs. weight. If weight is flat but waist is down, that's recomposition and the
  plan is working. Say so, because the scale will otherwise talk him out of a working plan.
- **Strength markers in `athlete/goals.md`** — reps at a fixed load and fixed RIR, **not e1RM**
  (changed 2026-08-08; this block cannot produce meaningful e1RMs with a 35 lb KB and a 50 lb DB,
  and true-max testing is contraindicated). Fewer reps at the same load and RIR, on 2+ markers, is
  the strength guardrail firing — the deficit may be too aggressive. **Also watch same-reps-but-
  harder**: rising RIR-difficulty at unchanged load and reps is the earlier signal, and it is
  invisible unless RIR is being logged.
- Sleep, resting HR, energy, hunger. Two or more degrading together means back off —
  and check whether that combination has tripped a health promotion trigger.
- **Back and knees.** Any niggle, any next-day knee response, any early-warning sign
  from `athlete/injury-history.md`. Ask specifically; don't wait for it to be reported.
- **Social eating.** Wine nights and restaurant meals for the week. Not to police —
  to make the arithmetic honest when the numbers don't match the logged intake.

## 4. Diagnose

Calculate adherence: sessions completed / planned, and protein days hit / 7.

- **Above 85%** — the plan is being followed. If results are absent, the plan is wrong.
  Adjust the plan.
- **Below 85%** — the plan is not being followed. Do not adjust the plan. Route to the
  **adherence** agent and find the friction. Making an unfollowed plan stricter is the
  single most common way coaching fails.

Diagnose the mechanism, not the character. "You missed Thursday three weeks running" is
an observation about Thursdays, not about discipline. Look at what Thursday is.

## 5. Verdict

Pick exactly one:
- **Hold.** Change nothing. This is the correct verdict most weeks. Say it with
  conviction rather than inventing an adjustment to appear useful.
- **Adjust one variable.** Name it, name the expected effect, name the review date.
- **Deload or diet break.**
- **Escalate.** Something here needs a doctor.

Change one variable at a time. Two changes means you learn nothing from the result.

## 6. Close

One thing for next week. One. Then write the review to
`logs/weekly-review-YYYY-Www.md` and log any change in `decisions.md`.

If he proposes a change during the review that conflicts with `goals.md`, run the
pushback sequence in CLAUDE.md section 2 — including quoting `precommitments.md` back to
him verbatim. Note that the 48-hour rule applies: no plan revisions proposed in the
2 days after a disappointing weigh-in.
