# Exercise Library & Substitutions

> Pre-approved swaps. The purpose is to remove the decision at the moment it's needed:
> if the rack is taken or the shoulder is cranky, there is already an answer here and
> the session doesn't get skipped.

## ⛔ Currently out — read this first

<!-- GENERATED:suspended — from scripts/build-docs.mjs. Do not edit between the markers. -->
_Nothing is currently out — every substitution below stands._
<!-- /GENERATED:suspended -->

## Substitution table

| Pattern | Primary | Sub A (equipment) | Sub B (joint-friendly) |
|---|---|---|---|
| Squat | Goblet / KB front squat (controlled ROM) | Split squat | Leg press / box squat to comfortable depth |
| Hinge | Single-arm KB swing | Trap-bar or RDL from controlled range | Hip thrust / back extension |
| Horizontal push | Push-up (weighted/deficit to progress) | DB/KB floor or bench press | Incline push-up |
| Horizontal pull | 1-arm DB/KB row | Inverted row | Chest-supported row |
| Vertical push | KB/DB overhead press | Landmine press | Half-kneeling press |
| Vertical pull | Pull-up / assisted | Lat pulldown | Band-assisted pulldown |
| Lunge / single-leg | Reverse lunge | Step-up | Split squat (pain-free ROM) |
| Hip extension | Hip thrust | KB swing | Glute bridge / back extension |
| Core / anti-rotation | Pallof press | Suitcase carry | Dead bug / bird dog (also back prehab) |

## Rules
- A substitution keeps the pattern and the rep range. It is not a downgrade and does not
  need approval — **unless it carries ⛔, which overrides this rule.** A ⛔ entry is
  suspended by the active block and needs the coach, not this table. That exception is
  the whole reason the banner above is at the top of the file: the no-approval rule is
  what makes this library useful, and it is also what quietly authorised substituting
  into contraindicated work at the moment they were least likely to open a second file
  (audit F-19).
- Never substitute out of a pattern two sessions in a row without logging why in the
  daily log — that's a signal, not a preference.
- **A ⛔ can take out a whole ROW, not just an entry**: where the active block forbids a
  pattern family, there is no in-pattern swap while it stands. The generated banner above is
  what says so; do not mark rows here by hand.

## `<their phrase for a routine they always run the same way>` — named routine
> Where an athlete refers to a fixed sequence by one name, write it out ONCE here, in their
> words, and let the daily log record the name instead of seven lines. The point is that the
> log stays readable and the sequence stays inspectable; without this the phrase is a
> shorthand only one person can expand.
1. `<step>`
2. `<step>`
3. `<...>`

## Travel / no-equipment fallback
> The minimum viable session. Never zero. Where travel is what historically ends this athlete's
> streaks — `athlete/constraints.md` usually says so — this block is load-bearing rather than an
> afterthought.
- `<the list, from what needs no equipment: push-ups · band or door rows · a single-bell press
  if one travels · side plank · bird dog · dead bug · walking · any active rehab routine>`
- **Write out what is LEFT once anything currently ⛔ comes out**, explicitly, so this stays a
  session rather than a gap. A fallback that silently loses half its contents to the banner
  above is a fallback that fails on the day it is needed.

## Contraindicated for this athlete
> ⚠ **THIS SECTION IS EMPTY IN THE LIBRARY COPY AND MUST BE FILLED FROM THIS ATHLETE'S OWN
> `athlete/injury-history.md`.** A shipped list would be somebody else's body: it would name
> movements this athlete has no reason to avoid and, far worse, would read as complete while
> omitting the one that matters to them.
>
> These are STANDING constraints. The ⛔ banner above is the current block's separate,
> temporary list; where both apply, the block wins.

Write one line per constraint, in this shape:

- **`<movement or pattern>`** — avoid by default / modify / earn back, and the reason from the
  injury history. Sub: `<what replaces it, keeping the pattern and the rep range>`.

And keep a referral line, whatever the history is — it is not a substitution decision:

- **Referral rule:** any radiating pain, numbness, tingling or weakness → stop, refer out the
  same day. CLAUDE.md §5 lists the rest; none of them are answered by this table.
