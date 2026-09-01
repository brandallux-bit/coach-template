---
name: session-recommendation
description: Decide what today's training session should actually be, by reading what the last three days contained before looking at the template. Use whenever a session is due, whenever the athlete asks what to train, whenever they have gone off the weekly template, and before rendering the workout half of skills/daily-dashboard. Not for building a block — that is skills/library/program-design.
---

# Session Recommendation

**The weekly template is a proposal. This skill is how it becomes a recommendation.**

## Why this exists

`program.weeklyTemplate` is a weekday map, and **nothing in it knows what the athlete actually
did.** The forward view is a weekday lookup that never opens `training.csv`, so a template can
propose a session sharing most of its working movements with one finished the previous afternoon,
and — before this skill and the `session-repeats-recent-work` finding existed — nothing anywhere
would notice.

That is not a rare edge. It is what a template *is*: a plan written before the week happened. The
athlete who asked for this put the standard plainly — a coach has a template, but recommends what
the situation calls for, and to do that the coach has to know what has happened. **Two days is the
floor; this skill reads three**, so a two-day-old collision is still visible on the third day
instead of dropping off the edge.

## Step 1 — Read what happened. Before anything else, including the template.

Do this every time. It is three files and it is not optional.

1. **`data/training.csv`** — the last 3 dates. What type, what session, what status, what RPE, what
   duration. **`planned` rows are not evidence; only `completed` ones are.**
2. **`data/sets.csv`** — the last 3 dates. **This is the evidence, and `training.csv` is only the
   frame.** A completed training row says a session happened; the set rows say which movements were
   in it, at what load, at what RIR. On a real chart the two regularly disagree, because a template
   day gets replaced by whatever the athlete actually did.
3. **`data/body.csv`** — last night's sleep, and the last weigh-in or tape. Where sleep is fed
   automatically there is never a reason to ask for it.

Then compute, don't eyeball:

```
node -e "Promise.all([import('./scripts/lib/recent-work.mjs'),import('./scripts/lib/suspensions.mjs'),
import('./scripts/lib/csv.mjs'),import('./scripts/lib/athlete.mjs')]).then(([rw,su,csv,a])=>{
const fs=require('fs'),t=csv.readCsv('data/training.csv'),s=csv.readCsv('data/sets.csv'),
rx=csv.readCsv('data/prescriptions.csv'),today=a.localToday();
const name=process.argv[1];
const lib=fs.existsSync('program/exercise-library.md')?fs.readFileSync('program/exercise-library.md','utf8'):'';
const o=rw.sessionOverlap({plannedRows:su.livePrescriptions({prescriptions:rx,sessions:[name],today}),
training:t,sets:s,today,libraryText:lib});
console.log(JSON.stringify({repeated:o.repeated.map(r=>[r.name,r.lastDone]),fresh:o.fresh.map(f=>f.name),
sharedPatterns:o.sharedPatterns,consecutiveLoadingDays:o.consecutiveLoadingDays},null,2));});" "<SESSION NAME>"
```

`scripts/lib/recent-work.mjs` is the one implementation. **Do not re-derive the overlap by reading
two lists side by side** — that is exactly what produced the defect this skill exists to prevent.

## Step 2 — Read the template as a proposal, and say so

`athlete/constants.json` → `program.weeklyTemplate` gives today's default. It is a starting point.

**It is wrong to present a template row as today's plan.** It is equally wrong to discard it
because it is a template — most weeks it is right, and CLAUDE.md §6 says most weeks the correct
action is "keep going, change nothing."

## Step 3 — Decide, and name which of the three you did

Exactly one of these, stated out loud:

| Verdict | When | What the athlete hears |
|---|---|---|
| **Confirm** | The proposal does not collide, and they are recovered | "Template's right today — here it is." |
| **Adapt** | Partial collision, or fatigue or sleep argues for less | "Template says X; you already did most of it yesterday, so do these two items instead." |
| **Replace** | Full collision, or the last three days went somewhere else entirely | "Ignore the template today. Here's what actually fits." |

Inputs that change the verdict, in the order they usually decide it:

- **Movement overlap** with the last 2–3 days. Half the working items is the threshold the
  `session-repeats-recent-work` finding uses; use judgement below it.
- **Consecutive loading days.** Walks and rest days break the streak; three in a row behind today is
  worth naming. `loading` is a per-type flag on the session registry, not a guess — see
  `isLoadingType` in `scripts/lib/athlete.mjs`.
- **A strength marker set the day before.** A new peak at matched RIR is fragile; repeating that
  same pattern the next day turns a peak into a stall. Check `athlete/goals.md`'s marker table
  against the last three days of `sets.csv` and protect anything that just moved.
- **Sleep.** `data/body.csv`. A bad night is not a reason to cancel; it is a reason to prefer the
  lowest-intensity option available over the densest one.
- **Anything in `athlete/injury-history.md`, and any active rehab document.** Where a chart has a
  standing restriction, it outranks everything on this page. Where `program/exercise-library.md`
  carries a generated banner of excluded movements, that banner is authoritative — read it, do not
  recall it.
- **What the athlete said they wanted.** `athlete/constraints.md` holds the practical friction and,
  often, how they actually like to train. **A recommendation they will not run is worth less than
  one they will.**

## Step 4 — Pick from the menu, or build one

Where this chart keeps a menu of non-lifting-day options — `athlete/constants.json` →
`program.conditioningMenu` lists their session names, and the document holding their contents is
normally `program/conditioning-menu.md` — read it and take the option that fits what the last three
days contained. Each option's prescription lives in `data/prescriptions.csv` under its own session name,
so whichever is chosen renders.

**Building a custom one is a first-class option, not a fallback.** Do it whenever nothing on the
menu fits, and on a chart with no menu at all it is the only option — which is a normal chart, not
an incomplete one. The rules:

1. **Build it from the last three days, not from the menu.** The movements already done are the
   ones to leave out.
2. **Every movement clears any standing exclusion** the chart carries — the generated banner in the
   exercise library, an active rehab document's restriction. Check it; do not recall it.
3. **Write it to `data/prescriptions.csv`** under its own session name, dated that day, **before it
   is shown to the athlete.** An unrecorded prescription cannot be rendered, checked against a
   strength marker, or compared against next week (`data/METHOD.md`).
4. **Record why in the day's log** — which three days it was built against, and what it deliberately
   left out. One sentence. That is what lets the next session tell a considered choice from an
   improvisation.
5. **If the same custom session recurs twice, it belongs in the menu.** Improvising the same thing
   twice is the definition of a procedure nobody wrote down (CLAUDE.md §8).

## Step 5 — Write it down

Per CLAUDE.md §0.3, `data/` first:

- Chose a menu option or built a custom one → **write today's `data/training.csv` row** with the
  session name (overwriting a `planned` row from the template is exactly what a `planned` row is
  for), and for a custom session **write its `data/prescriptions.csv` rows first**.
- Then the day's log gets one line: **which of confirm / adapt / replace, and what it was decided
  against.** That single line is what lets the next session tell a considered choice from an
  improvisation.
- Changed the block itself rather than one day → `decisions.md`, per §0.3.

## What this skill does not do

- **It does not build or rebuild a block.** That is `skills/library/program-design`, and it involves
  the strength specialist and a `red-team` pass. This skill only answers "what about today".
- **It does not render.** `skills/daily-dashboard` renders, and stays deliberately read-only as to
  measured data. Run this one first so the dashboard has something true to show.
- **It does not override a §5 floor.** Pain that changes gait, a bright-line injury event, a §5
  referral symptom — those stop the programming conversation entirely.
- **It does not decide the athlete must train.** "Nothing today" is a legitimate output and is
  sometimes the right one. Say it plainly rather than inventing a session to look useful.
