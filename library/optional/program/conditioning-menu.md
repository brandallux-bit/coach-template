# Conditioning Menu — the non-lifting-day options

> **Copy this file into `program/` only if this chart needs it, and list each option's session
> name in `athlete/constants.json` → `program.conditioningMenu`.** A chart whose athlete lifts on
> every
> training day does not need a menu, and a menu nobody chose from is a document that goes stale
> while looking authoritative. Building a session from scratch each time is a complete answer —
> see `skills/library/session-recommendation`, step 4.

- Written: `<date>`.
- Governs: the non-lifting slots in `athlete/constants.json` → `program.weeklyTemplate`, and any
  day a session is called for and a hard lift is not the answer.
- Selection procedure: **`skills/library/session-recommendation`**. This file is the menu; that
  skill is how a choice gets made. **Do not pick from here without running it** — picking without
  reading the last three days is the exact failure both documents exist to end.

## Why a menu, rather than one fixed alternative

⚠ **ONE ALTERNATIVE IS NOT A CHOICE, AND IT COLLIDES ON A SCHEDULE.** A single conditioning session
sitting in two weekly slots will overlap whichever lifting session it is adjacent to — every week,
by design, on a week the athlete followed perfectly. The collision is not a mistake anyone made; it
is what happens when one option has to serve every situation.

Two or three genuinely different options, plus the freedom to build one, is what lets a coach pick
on the evidence instead of reading out the only row there is.

⚠ **AND THE COMMON WAY THIS FILE GOES WRONG IS A SUBSTITUTION NOBODY RE-CHECKED.** An option is
usually written to replace something that stopped being available — an injury takes a modality out,
and something fills its slot. The replacement is checked against the slot and not against the days
either side of it, so a session that used to overlap nothing now overlaps the day before it. When
an option changes, re-check its neighbours.

## The floor under all of it

Every option here, and every custom session built instead of one, must clear whatever this chart
currently has out: the generated exclusion banner in `program/exercise-library.md`, and any
restriction in an active rehabilitation document. **Read it; do not recall it** — it is generated,
and it changes when the block changes.

## `<option key>` — `<what it is for>`

- **For:** `<the day or the situation this one fits — e.g. the day after a heavy pressing session>`
- **Deliberately does not contain:** `<the movements it avoids, and which session they belong to>`
- **Prescription:** `data/prescriptions.csv`, under the session name `<name>`. Without those rows
  it cannot be rendered, checked against a strength marker, or compared against next week.
- **Duration:** `<minutes>` · **Registry type:** `<a key from constants.json sessionTypes>`

`<Repeat this block per option. Two or three is the useful number: one is not a choice, and a menu
nobody can hold in their head is one nobody reads.>`

## Building a custom one instead

The menu is a starting point, not a closed set, and **the custom hatch is the more important
half.** Build one whenever nothing on the menu fits what the last three days actually contained.
The rules live in `skills/library/session-recommendation`, step 4 — build from the record, clear
the standing exclusions, write the prescription rows before showing anything to the athlete, record
what it was built against, and promote it into this file if it recurs twice.

## What would make this menu wrong

- **An option that no longer avoids what it was written to avoid.** The block moved; this did not.
- **An option nobody has chosen in weeks.** Either it does not fit, or the athlete is not being
  offered it. Both are worth a sentence in `decisions.md` rather than a row that quietly persists.
- **An option with no prescription rows.** It renders nowhere and can be chosen but not performed.
- **Any option whose contents changed without its neighbours being re-checked** — see the ⚠ above.
