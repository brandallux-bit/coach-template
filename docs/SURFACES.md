# What each surface is for

Companion to [`INVARIANTS.md`](INVARIANTS.md)'s layer model. That one says which layer may
*enforce* a thing. This one says where a thing may be *shown*, and to whom.

**Read this before adding anything to a page, and before writing a spec for one.** It exists
because a spec that said "render the findings" put seventeen items on the athlete's dashboard —
including questions only the athlete could answer, on a read-only page, next to a check that had
passed. Their response is the standing test:

> *"What does the user need? Why do they need it? What are they going to DO with the information?
> Have you considered any of these questions? If not, how can you possibly design a good
> solution?"*

---

## The placement test

Three questions, in order. If you cannot answer all three, it does not go on that surface.

1. **Who is this for?** Name the person — the athlete, the coach, the maintainer. Not "the user".
2. **What will they DO with it?** A specific action. "Be aware of it" is not an action.
3. **Can they do it HERE?** A question belongs where it can be answered. A number belongs where it
   can be acted on.

A thing that fails (3) is not too verbose or badly worded. **It is on the wrong surface.**

---

## The surfaces

| Surface | Who | The one question it answers | What they do |
|---|---|---|---|
| **`/` Goals & Progress** | Athlete, occasionally | *Am I moving in the right direction?* | Reassurance, or brings something to the coach |
| **`/today`** | Athlete, daily, on a phone | *What am I doing today, and where am I against my numbers?* | Trains the session, eats to what's left |
| **`/next7`** | Athlete, planning | *What's coming, and does my week work?* | Moves a session, plans around travel and dinners |
| **`/log`** | Athlete, writing | *How do I record what just happened?* | Writes a row. **The only surface they can answer on.** |
| **`/history`** | Athlete + coach | *What actually happened over time?* | Diagnoses a stall, adjusts a plan |
| **The conversation** | Athlete ↔ coach | *anything requiring judgement* | Decides. **The only surface where plans change.** |
| **`data/findings.json`** | Coach, at session start | *What should I raise before they ask?* | Raises it, in conversation |
| **`data/*.csv`** | Machine + coach | *What is on record?* | Computes from it |
| **`logs/`, `decisions.md`** | Coach + athlete | *Why is it like this?* | Avoids re-litigating a settled call |
| **CI, Actions, `check-all`** | Maintainer | *Is the system itself broken?* | Fixes the system |

---

## Rules that fall out of the table

**A question goes where it can be answered.** The athlete's read-only pages cannot take a
question. If the system needs a number from them, the coach asks them in conversation — or, if
it is genuinely a data entry, `/log`. Never a prompt on a page with no reply box.

**Trend and today are different surfaces.** A 7-day mean belongs on `/` and `/history`. "You have
620 kcal left" belongs on `/today`. Putting a plan-level fact on the daily surface makes it noise;
putting today's number on the trend surface makes it jitter.

**System state goes to whoever can fix it.** A failed workflow, a stale build, a schema drift — the
maintainer's problem. The single exception is *"the numbers on this page are stale"*, because that
changes whether the athlete can trust what they are looking at, which is their call to make.

**A check that passed is not information.** "Calorie target is 134 kcal above the floor" reports
that nothing is wrong. It has no action and belongs on no surface. Silence is the correct output of
a passing check.

**Severity is not audience.** `critical / attention / info` says how loud, never who for. Both axes
are required, and audience is the one that decides whether something renders at all.

**No permanent all-clear panel.** A reassurance box is a thing the reader learns to scroll past,
which is how the one alert that matters gets missed. Absence is the normal state.

**On the athlete's surfaces, one line.** Detail, rationale and source are for the coach, who has
the file open. If it needs a paragraph, it is not an alert — it is a conversation.

---

## Anti-patterns, all of which shipped here

| What shipped | Why it was wrong | Where it belonged |
|---|---|---|
| *"Calorie target is 134 kcal above the RMR floor"* | A check that passed. No action exists. | Nowhere |
| *"The budget is built for 1.20 lb/wk, the goal is 1.00"* | True, but a fact about the plan, not about today | A footnote where the plan lives; the weekly review |
| *"A promotion trigger has an unfilled threshold"* | A question, on a page they cannot answer on | The conversation |
| *"Something in the chart is dated 2026-08-17"* | Internal integrity state, leaked to the athlete, and too vague to act on even if it were theirs | The maintainer |
| A hard validator error on a fast weight-loss week | Judged reality instead of recording it; froze the dashboard for stepping on a scale | A finding for the coach |
| An "all clear — every check passed" box | Trains the reader to skip the card | Nowhere |

---

## Writing a spec for a surface

State, for every item you are asking someone to build:

- **who** it is for, by name
- **what they will do** with it, as a verb
- **why here** rather than on another surface
- **what it looks like when there is nothing to say** — usually: nothing

A spec that lists *what to render* without answering these produces the dashboard card that was
deleted the day it shipped. The output was faithful to the spec. The spec had no user in it.
