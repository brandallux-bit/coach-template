# Progress Photo Protocol

Standardized or it's noise. Almost all perceived overnight change is lighting, pump,
water, and glycogen — not fat.

## The standard
- **When:** every 14 days, same weekday, first thing in the morning
- **State:** fasted, post-toilet, before training, no pump
- **Where:** same room, same spot, same light source, overhead light only (avoid
  directional or side lighting — it manufactures definition)
- **Clothing:** same minimal clothing every time
- **Angles:** front, side (same side each time), back
- **Posture:** relaxed, arms at sides, not braced, not flexed. Take a flexed set too
  if you want, but the *relaxed* set is the comparison set.
- **Camera:** same phone, same height (chest height), same distance, back against the
  same mark on the floor

## Naming
`YYYY-MM-DD-front.jpg` / `-side.jpg` / `-back.jpg`

---

# Waist Tape Protocol

> **Why this is standardized rather than just taken.** On a chart where the waist is a primary
> metric, it is usually also a threshold in `goals.md` — a promotion or demotion trigger with a
> number on it. An unstandardized tape moves ±0.5" on technique alone, which is enough to flip a
> phase on noise. Fill the threshold in from the athlete's own goals; never carry one over from
> another chart.

- **When:** same weekday, weekly. First thing in the morning.
- **State:** fasted, post-toilet, **before** training and before any drink. Waist is smallest
  first thing and grows through the day — a PM reading is not comparable to an AM one.
- **Where on the body:** at the navel, every time. Mark it the same way each time; do not
  "find the narrowest point," which drifts.
- **Posture:** standing relaxed, arms at sides, **normal exhale — do not suck in and do not
  push out.** Feet together.
- **Tape:** same tape every time. Snug against skin without compressing it. Level all the way
  around — check the back in a mirror; a tape that rides up at the back reads small.
- **Reading:** take it **twice**. If the two differ by more than 0.25", take a third and use
  the median. Record to the nearest 0.25".
- **Frequency:** weekly. Not daily — day-to-day gut content moves the tape more than a week
  of fat does.

---

# Neck Tape Protocol

> **Why the neck at all.** It is the missing input to the Navy tape method — the best body-fat
> estimator available off tape alone. Without it, the estimate is a range about eight points wide,
> which is not a number anybody can act on. With it, it becomes one defensible figure. Ten seconds,
> tape already in hand.

- **When:** the same morning session as the waist. Fasted, post-toilet, before training or drinking.
  Both numbers feed one formula — taking them days apart mixes states.
- **Where on the body:** **just below the Adam's apple**, at the **narrowest point of the neck.**
  The neck tapers — narrowest high, up under the jaw; it widens all the way down to the shoulders.
  Go *under* the larynx, not over it.
- **Tape angle:** as close to **level all the way around** as the anatomy allows. **Check the back
  in a mirror.** The commonest error by far is the tape sliding down at the back onto the
  **trapezius** — that measures shoulder muscle, not neck.
- **Posture:** stand tall, **look straight ahead, chin level.** Shoulders relaxed and *down*. Do not
  tilt the head up, do not tuck the chin, do not shrug or flare the shoulders, do not tense the neck.
- **Tension:** **snug against the skin without indenting it.** The neck is soft and compressible —
  far more so than the waist. This is the largest error source in the whole measurement.
- **Breathing:** normal and relaxed. Don't swallow while taking the reading.
- **Reading:** take it **twice**; if the two differ by more than 0.25", take a third and use the
  median. Record to the nearest 0.25". Same rule and same tape as the waist.
- **Frequency:** weekly, alongside the waist. The neck barely moves, but it *does* shrink slightly
  over a long deficit — and carrying a stale, too-large neck value forward makes the Navy estimate
  **overstate fat loss.** Re-measure rather than reuse.

## The two errors that matter, and which way each one lies

| Error | Reads | Effect on the body-fat estimate |
|---|---|---|
| Tape too low / sitting on the traps | Too **big** | **Understates** body fat |
| Tape pulled tight into the soft tissue | Too **small** | **Overstates** body fat |

Both are easy to make and they push in opposite directions, so they don't cancel — they just widen
the spread. Level, snug, chin neutral.

## What the number will mean

Navy tape method — **it is sex-specific, and the two formulas take different inputs.** Inches.

    men     %BF = 86.010 × log₁₀(waist − neck)       − 70.041 × log₁₀(height) + 36.76
    women   %BF = 163.205 × log₁₀(waist + hip − neck) − 97.684 × log₁₀(height) − 78.387

The women's form needs a **hip** measurement as well — at the widest point of the glutes, same
tape, same morning, same rules as above. A chart that uses the women's formula and standardizes
only waist and neck has standardized two of its three inputs.

**Compute the athlete's own table once, from their own height, and put it in their chart.** Vary
the neck across the plausible half-inch either side of their reading, hold waist and height at
their measured values, and read off how much the answer moves. Do not copy a table from another
chart — height is in the formula, so somebody else's table is somebody else's answer.

## What this does and does not resolve — read before over-reading the result

- **It DOES** convert the estimate from "a range depending on an assumed neck" into one number,
  carrying the method's own error against DEXA — a standard error of estimate around **3–4
  points**, with individual agreement looser than that. See the properties table below.
- **It DOES NOT** improve *tracking*. The neck is near-constant, so on the men's formula the Navy
  trend is essentially the waist trend — which is already the metric. **The neck buys a defensible
  baseline number, not a better progress signal.** Do not let it displace the waist tape. (On the
  women's formula the hip is a third input and it *does* move through a phase, so that sentence
  does not carry over — see the sensitivity section.)
- ⛔ **Do not substitute a BMI-based estimator** (Deurenberg and its relatives). It reads height and
  weight and knows nothing about where the mass sits, so on a lifter it is wrong in a direction that
  does not average out. Some charts also carry a standing instruction against BMI in
  `athlete/profile.md` — check before putting the letters on a page.

---

# How well does the Navy method track *change*?

Worth answering before the first reading, because the honest answer is "badly at the level, well at
the direction" and that changes what the number is for.

## Separate three properties — they have very different answers

| Property | Verdict |
|---|---|
| **Absolute accuracy** — is the level right? | **Poor–moderate.** The method's standard error of estimate against DEXA is around 3–4 points, but *individual* agreement is looser than that — published comparisons commonly show several points of mean bias with limits of agreement around ±8, and wider in women. The offset never resolves without a scan. |
| **Precision** (same body, repeat reading) | **Good, in the best case.** The formula adds no noise of its own; all of it is tape technique. This protocol tolerates 0.25″ on waist **and** 0.25″ on neck, and those combine — so ~±0.5 point is the floor, not the typical figure, and the neck is the larger contributor. |
| **Sensitivity to real change** | **Good, and better than the absolute number deserves.** See below. |

## Why direction survives even though the level is wrong

The method's error is **largely a systematic offset**, and an offset **cancels when you subtract two
readings.** If the formula reads 3 points low today, it reads roughly 3 points low in three months —
so the *change* is right even when the *level* is not.

Caveat, stated honestly: the offset is not *perfectly* constant across the range (the formula is a
log curve and its bias vs DEXA drifts). Over a 4–6 point change, treating it as constant is
reasonable. Over 15 points it is not.

## The sensitivity rule — compute it, and note that the two formulas do not share one

⚠ **THE SLOPE IS SEX-SPECIFIC AND THE DIFFERENCE IS ABOUT A FACTOR OF TWO.** Do not carry a figure
from one chart to another, and do not carry the men's rule of thumb into a chart using the women's
formula. Differentiating each formula with respect to the waist gives:

    men     d%BF/d(waist) = 37.35 / (waist − neck)
    women   d%BF/d(waist) = 70.88 / (waist + hip − neck)

Both are **inches**, and both are a two-number calculation on this athlete's own tape. Evaluate one
of them once and write the answer into their chart; it is the only figure here that is about them.

For scale, so an implausible result is recognisable:

| Formula | Tape (in) | Points per inch of waist |
|---|---|---|
| men | 42 / 17 | 1.49 |
| men | 35 / 15 | 1.87 |
| men | 30 / 14 | 2.33 |
| women | 38 / 48 / 13.5 | 0.98 |
| women | 30 / 40 / 12.5 | 1.23 |
| women | 26 / 36 / 12 | 1.42 |

**The slope rises as the tape shrinks**, on both formulas, because each takes a logarithm: the same
inch is a larger proportional change on a smaller measurement. Expect the figure near the bottom of
a phase to be noticeably steeper than the one at the top of it.

⚠ **AND FOR THE WOMEN'S FORMULA, THE WAIST IS NOT THE WHOLE STORY.** Height is fixed and the neck
is near-constant, so on the **men's** formula the Navy figure really is a monotonic transform of the
waist and the waist trend is the Navy trend. The women's formula takes a **hip** measurement too,
and the hip is *not* near-constant through a fat-loss phase. Waist and hip falling together move the
answer by roughly **twice** the waist-alone figure. So on a chart using the women's formula, take
both, and never reason about the Navy number from the waist alone.

**Then build this chart's own version of the table** — this is the men's 35/15 row, shown as a
worked example of the shape, not as a figure to copy:

| Waist change | Navy %BF change (at 1.87 pts/in) | Roughly |
|---|---|---|
| −0.25" | −0.47 pt | inside measurement noise |
| −0.50" | −0.93 pt | detectable |
| −1.00" | −1.87 pt | a phase's worth on most plans |

**Minimum detectable real change ≈ 1 body-fat point**, and how much waist that is depends entirely
on the slope above: about half an inch at 1.9 points per inch, closer to **0.81″** at 1.23. Below
that it is tape noise, and a chart that assumed the wrong slope will read real progress as noise
for a whole phase.
→ **Weekly readings are noise. 2–3 week comparisons begin to be signal. 4+ weeks is solid.**
Consistent with the trend-over-point rule below — read the trend line, never two adjacent readings.

## Three limits that do not go away

1. **Re-measure the neck, don't reuse it.** The neck does shrink over a long deficit, and in both
   formulas it enters with **the same weight as the waist and the opposite sign** — so a stale
   quarter-inch of neck costs exactly what a quarter-inch of waist buys, at whatever slope the
   section above gave this chart, and it **overstates fat loss**. Take it alongside the waist;
   monthly at the absolute minimum.
2. **It cannot tell fat loss from lean loss at the waist.** It reads circumference, not tissue. Gut
   content, water and lost abdominal muscle all move it the same direction as fat.
3. **It is blind to the limbs and chest entirely.** Only the tape sites are inputs.

→ **Which is why the strength numbers, not this formula, remain the instrument for whether lean
mass is being held.** The Navy figure translates the waist tape into a percentage that can be compared against
a goal. It is a better *unit*, not a second *opinion*.

- **A baseline taken before this protocol existed is provisional, and should be labelled so.** Any
  figure computed from it inherits whatever the tape was doing that day. **Take the pair again at
  the next protocol-compliant morning session** and compute from that.

---

## Rules of interpretation
- Compare only to a photo 6+ weeks old. Two-week comparisons are within noise.
- Never compare a photo taken in different light. If the light was different, note it
  in the filename and discount the comparison.
- The scale, the tape, and the photos disagree constantly. When they do, the 7-day
  weight average and the waist measurement win. Photos are for confirmation, not
  detection.
