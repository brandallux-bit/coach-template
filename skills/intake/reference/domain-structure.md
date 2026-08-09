# The shape of a domain

This is the *structure* `athlete/goals.md` uses. It says nothing about what the domains
are — that comes from the athlete, in Session 1, before you have read this.

A domain is **an area of the athlete's life this coaching is trying to change or
protect.** It is not a category from a list. If the athlete's answer doesn't fit a domain
name you've used before, the answer is right and the name is wrong.

## Why domains and not a ranking

A flat ranking is stale within a month, and it can't express the thing that matters most:
a domain sitting at the bottom is usually not *unimportant*, it is **currently satisfied**.
Health is the clearest case — it sits low precisely because it's intact, and it goes to
the top the moment it isn't. A ranking loses that; a threshold model keeps it.

## Required parts

Every domain carries all five. A domain missing its triggers is a wish, not a domain.

| Part | What it is |
|---|---|
| **Standing status** | `needs work` or `satisfied` — and, if satisfied, *why* it's satisfied rather than unimportant |
| **Primary metric** | The one number or observation that says how it's going. Include its unit and which direction is good. |
| **Baseline** | That metric's starting value, and the protocol used to get it |
| **Promotion trigger** | What has to happen for this to become the top priority. Measurable. |
| **Demotion trigger** | What has to happen for it to stop being top priority. Measurable. |

Optional but useful: **cadence** (how often the metric is measured), and **what the domain
gives up** when it is subordinated to another.

## The rules that hold at every ordering

Two things sit outside the ranking and never move:

- **Safety is not a priority that can be outranked.** It is the floor under all of it
  (CLAUDE.md §5), including any hard constraint in `athlete/hard-constraints.md`.
- **Adherence is not in the ranking either.** It is a multiplier on whatever is ranked
  first. A worse plan followed beats a better plan abandoned.

## Making triggers measurable

This is the part intake most often gets wrong, and the failure is always the same: a
trigger that reads like a feeling fires on mood.

| Vague | Measurable |
|---|---|
| "If I felt weak" | Reps at a fixed load and RIR drop >10% on 2+ recorded markers |
| "If my health was at risk" | Named lab values outside named ranges, or resting BP above a stated number |
| "If the reactions came back" | 2+ reactions in a 30-day window, at severity 2 or above on the agreed scale |
| "If I couldn't keep up" | Cannot complete a named task — a specific distance, a flight of stairs, a class |
| "If I got fat again" | Waist above a stated measurement, taken on the stated protocol |

Two properties to check on every trigger:

1. **Could someone else evaluate it from the chart alone, without asking the athlete how
   they feel?** If not, it isn't measurable yet.
2. **Is the metric one this athlete's setup can actually produce?** A trigger keyed to a
   number that can't be measured with the equipment, access or budget available will sit
   pending forever and silently never fire. Pick a metric that can be produced *this week*.

## Template

```markdown
## Domain: <the athlete's own words for it>   <- currently #N

**Why it's here:** <one or two sentences, in their words>

**Standing status:** needs work | satisfied — <and why satisfied ≠ unimportant>

**Primary metric:** <metric> (<unit>, <up|down> is better)
**Baseline:** <value> on <date>, measured by <protocol>
**Cadence:** <how often>

**Promotion trigger → becomes #1:**
- <measurable condition>
- **Or: they say so.** No justification required.

**Demotion trigger:**
- <measurable condition>

**What it gives up while subordinated:** <the honest cost>
```

## Phases

Where two domains want opposite things — one implies a deficit and the other a surplus,
one implies rest and the other volume — **do not average them into a plan that serves
neither.** Pick one, run it as a phase with a written end condition, and name what the
other is giving up in the meantime. Phases are sequential, not blended.

If no two domains conflict, there is no phase plan and the chart doesn't need one.

## Reviewing the set, not just the order

Every session: evaluate the triggers against current data, unprompted.

Every six weeks: ask whether the **set** is still right. Domains get retired, and new ones
appear — a diagnosis, an event, a change in what the athlete cares about. A chart that can
only reorder its original domains will drift out of date more quietly than one that can't
reorder at all.
