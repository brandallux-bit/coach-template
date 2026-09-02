---
name: weekly-review
description: Run the weekly check-in — the core recurring ritual of the coaching relationship. Use every week, and whenever the athlete asks how things are going, whether the plan is working, whether to change something, or reports a stall. Also use before making any adjustment to nutrition or training, since the review supplies the evidence.
---

# Weekly Review

The engine of the whole system. Numbers first, diagnosis second, verdict third.

## 0. Evaluate the priority triggers — before anything else

Read `athlete/goals.md` and check every promotion and demotion trigger against this
week's data. Health triggers first, since they override everything.

If a trigger has fired, say so before the numbers and propose the reorder.

**Read every threshold out of `goals.md`. Never name a figure in this file.** A number
written here is a second copy that goes stale the day `goals.md` changes, and the coach
following this procedure has no way to know it did. This section previously named a −5 to
−8 lb appearance demotion trigger; `goals.md` demoted those weight conditions to **review
checkpoints** on 2026-08-11 and `constants.json` renamed the field to `weightCheckpointLb`
"so the dashboard cannot keep calling it a trigger" — and this file kept firing a phase
switch on it for two days. A checkpoint means *stop, put the numbers on the table, decide
explicitly*; it does not end a phase on its own.

Distinguish the two before acting:

- **A checkpoint** — surface it, present the numbers, ask. No plan change in this session.
- **A fired trigger** — that is a **phase switch**, not a tweak: the domain order changes
  and energy balance may change direction with it. Handle it as a decision, with a
  `decisions.md` entry, and route to `red-team` before delivering it.

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
  plan is working. Say so, because the scale will otherwise talk them out of a working plan.
- **Strength markers in `athlete/goals.md`** — reps at a fixed load and fixed RIR, **not e1RM**.
  An e1RM formula extrapolates from a heavy single; where the available implements top out well
  below the athlete's working strength, or where true-max testing is contraindicated by
  `athlete/injury-history.md`, the estimate is a number about the equipment rather than about the
  athlete. Check both before using one. Fewer reps at the same load and RIR, on 2+ markers, is
  the strength guardrail firing — the deficit may be too aggressive. **Also watch same-reps-but-
  harder**: rising RIR-difficulty at unchanged load and reps is the earlier signal, and it is
  invisible unless RIR is being logged.
- Sleep, resting HR, energy, hunger. Two or more degrading together means back off —
  and check whether that combination has tripped a health promotion trigger.
- **Whatever `athlete/injury-history.md` names.** Any niggle at a listed site, any next-day
  response to yesterday's session, any early-warning sign that file records. Ask about those sites
  by name; don't wait for it to be reported. Where the file is empty, ask the general question once
  rather than inventing a site to worry about.
- **Social eating and drinking.** Whatever `athlete/values.md` says is a standing part of their
  week, for the week just gone. Not to police — to make the arithmetic honest when the numbers
  do not match the logged intake.

## 4. Diagnose

Calculate adherence: sessions completed / planned, and protein days hit / 7.

**Two different decisions hang off this number, at two different thresholds. Do not merge them.**

- **Is the plan being followed well enough that a null result indicts it?** The gate is
  **85%** — the coach's figure, and the athlete has never ruled on it. Above it, if the
  results are absent the plan is wrong: adjust the plan. Below it, do not adjust the
  plan — making an unfollowed plan stricter is the single most common way coaching fails.
- **Which specialist do I consult?** The threshold is `plan.adherenceRoutingPct` in
  `athlete/constants.json` — **currently 80%**, from `CLAUDE.md` §7. Below it, route to
  the **adherence** agent *instead of* the domain specialists, and find the friction.

> **This file routed the adherence agent at 85% until 2026-08-14 while `CLAUDE.md` §7 routed at
> 80% (historical — not the live threshold)** — so the system gave two defensible, contradictory
> answers to "do I route?" (audit F-28). The routing figure now renders from one constant, and
> `scripts/test-single-home.mjs` fails if any file states a different one. The 85% above is left
> alone deliberately: it answers a different question, nobody has recorded it as a
> considered second threshold, and collapsing two real thresholds into one is the same
> class of damage as letting one drift into two. **Whether these should be one number is a
> coaching decision — raise it with the athlete, do not resolve it in a file.**

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

**Then run `npm run parity`** — once a week is the right cadence for it, and the weekly review
is the only thing that reliably happens weekly. It reports what this chart's system layer has
that the template does not, and vice versa. It is a maintainer's line, not the athlete's: do
not put its output in the review, and do not raise it in the session. Act on it or note it and
move on.

If they propose a change during the review that conflicts with `goals.md`, run the
pushback sequence in CLAUDE.md section 2 — including quoting `precommitments.md` back to
them verbatim. Note that the 48-hour rule applies: no plan revisions proposed in the
2 days after a disappointing weigh-in.
