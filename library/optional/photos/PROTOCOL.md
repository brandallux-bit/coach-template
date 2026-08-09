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

> Added 2026-08-07. The waist is the **primary progress metric** by the athlete's explicit
> instruction (`goals.md`), and it gates the Phase 1 demotion trigger at 34.5". An unstandardized
> tape can move ±0.5" on technique alone — enough to flip a phase on noise. Standardize it.

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

> Added 2026-08-07. The neck is the **missing input to the Navy tape method**, which is currently
> the best body-fat estimator available off his own numbers. Without it the estimate is a ±8-point
> guess (`logs/2026-08-07.md`: "**~18–29%, and no tighter**"). With it, the Navy number becomes a
> single defensible figure. Ten seconds, tape already in hand.

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

## What his number will mean (waist 35.25", height 69")

Navy method, men: `%BF = 86.010 × log₁₀(waist − neck) − 70.041 × log₁₀(height) + 36.76` (inches).

| Neck | Est. body fat | | Neck | Est. body fat |
|---|---|---|---|---|
| 15.00" | 20.3% | | 16.25" | 18.0% |
| 15.25" | 19.9% | | 16.50" | 17.5% |
| 15.50" | 19.4% | | 16.75" | 17.0% |
| 15.75" | 18.9% | | 17.00" | 16.4% |
| 16.00" | 18.4% | | | |

**≈1 percentage point per half-inch.** That is why the tension and the tape angle are worth caring
about — but note it is also *bounded*: even a sloppy half-inch miss moves the answer ~1 point, not
10. Get it roughly right and the number is usable.

## What this does and does not resolve — read before over-reading the result

- **It DOES** convert the Navy estimate from "18–20% depending on an assumed neck" into one number,
  carrying the method's own error against DEXA of roughly **±3–4 points**.
- **It DOES NOT** improve *tracking*. The neck is near-constant, so the Navy trend is essentially
  the waist trend — which is already the primary metric. **The neck buys a defensible baseline
  number, not a better progress signal.** Do not let it displace the waist tape.
- ⛔ **The Deurenberg estimator is RETIRED (2026-08-07) — do not reintroduce it.** It is BMI-based,
  and **BMI is not to be used for this athlete** (`athlete/profile.md`, standing instruction).

---

# How well does the Navy method track *change*? — the honest answer

> Added 2026-08-07, answering the athlete's own question. He is explicit that **direction matters
> more to him than the absolute number.** Good news: direction is the thing this method does well.

## Separate three properties — they have very different answers

| Property | Verdict |
|---|---|
| **Absolute accuracy** ("am I really 18.4%?") | **Poor–moderate.** ±3–4 points vs DEXA, and the offset never resolves without a scan. |
| **Precision** (same body, repeat reading) | **Good.** ~±0.5 point, and that is *entirely* his tape technique — the formula adds no noise of its own. |
| **Sensitivity to real change** (the one he cares about) | **Good, and better than the absolute number deserves.** See below. |

## Why direction survives even though the level is wrong

The method's error is **largely a systematic offset**, and an offset **cancels when you subtract two
readings.** If the formula reads him 3 points low today, it reads roughly 3 points low in October —
so the *change* is right even when the *level* is not. This is exactly the property he wants.

Caveat, stated honestly: the offset is not *perfectly* constant across the range (the formula is a
log curve and its bias vs DEXA drifts somewhat). Over a 4–6 point change, treating it as constant is
reasonable. Over 15 points it is not.

## The numbers

Height is fixed and the neck is near-constant, so **the Navy figure is a monotonic transform of the
waist.** Sensitivity at his current numbers (waist 35.25", neck 16.00"):

**≈1.94 body-fat points per inch of waist** — call it **~2 points per inch, ~0.5 per quarter-inch.**
(Rises slightly as he leans out: ~2.05 at a 34.25" waist, ~2.20 at his 33" ambition.)

| Waist change | Navy %BF change | Roughly |
|---|---|---|
| −0.25" | −0.5 pt | inside measurement noise |
| −0.50" | −1.0 pt | ~2 weeks at target rate |
| −1.00" | −1.9 pt | ~4–5 weeks |
| −2.25" (35.25 → 33") | −4.4 pt | the Phase-1 ambition |

**Minimum detectable real change ≈ 0.5" of waist ≈ 1 body-fat point.** Below that it is tape noise.
→ **Weekly readings are noise. 2–3 week comparisons begin to be signal. 4+ weeks is solid.**
Consistent with the trend-over-point rule below — read the trend line, never two adjacent readings.

## Three limits that do not go away

1. **Re-measure the neck, don't reuse it.** The neck does shrink over a long deficit. Carrying a
   stale 16.00" forward while the real neck is 15.75" **overstates fat loss by ~0.5 points.** Take
   it alongside the waist; monthly at the absolute minimum.
2. **It cannot tell fat loss from lean loss at the waist.** It reads circumference, not tissue. Gut
   content, water and lost abdominal muscle all move it the same direction as fat.
3. **It is blind to the limbs and chest entirely.** Only waist and neck are inputs.

→ **Which is why the strength numbers, not this formula, remain the instrument for "am I keeping
muscle."** The Navy figure translates the waist tape into a percentage that can be compared against
a goal ("abs at ~12–15%"). It is a better *unit*, not a second *opinion*.
- **The waist input is itself still provisional.** The 35.25" is a single reading taken *before* the
  waist protocol above existed. Any Navy figure computed today inherits that. **Take neck and waist
  together at the next protocol-compliant morning session** and compute from that pair.

---

## Rules of interpretation
- Compare only to a photo 6+ weeks old. Two-week comparisons are within noise.
- Never compare a photo taken in different light. If the light was different, note it
  in the filename and discount the comparison.
- The scale, the tape, and the photos disagree constantly. When they do, the 7-day
  weight average and the waist measurement win. Photos are for confirmation, not
  detection.
