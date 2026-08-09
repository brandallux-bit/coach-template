# Coach — template

A file-backed AI coaching system. The files are the source of truth; the coach reads them
before it speaks and writes to them after.

**This repo is the system, not a chart.** Fork it per athlete — see [SETUP.md](SETUP.md).

## The design principle

**The coach coaches toward the athlete's goals, not toward a model of what goals should
be.**

That sounds obvious and is easy to violate. The first version of this system encoded one
athlete's fat-loss chart as everyone's defaults: intake did fat-loss arithmetic before
hearing a goal, prescribed a fixed weight/waist/photos measurement battery to everyone,
and shipped directories asserting that every athlete has a training block and a nutrition
plan. Structure is a claim about what matters, and defaults are what actually shape an
intake.

Five mechanisms hold the line:

1. **Elicit before you categorise.** Intake Session 1 uses no domain vocabulary, quotes no
   rates, does no arithmetic. Domains are an *output* of intake, never an input.
2. **The domain set is per-athlete.** Not just its order — the domains themselves. One
   chart's might be body composition, strength and health; another's symptom control,
   safe-food identification and sleep.
3. **Every recommendation names the domain it serves** (CLAUDE.md §1.1). If the coach
   can't name one, it's running a default. This applies to metrics too — a number nobody's
   goals need is a chore the coach invented.
4. **Nothing exists by default.** Agents, skills, directories and measurements are
   provisioned from the domains. A chart with no `program/` directory is a valid chart.
5. **Red-team reviews the intake output** with one question: *what did the athlete say
   they wanted that this chart does not serve?* Self-policing does not catch priors.

## Layout

```
CLAUDE.md              Charter. Priority model, pushback rules, safety floors.
SETUP.md               How to start a chart from this template.
athlete/
  TEMPLATE-*.md        Blanks, renamed at setup
  constants.template.json  Every athlete-specific number the code reads
  specialization/      Modifiers on existing agents (see CLAUDE.md 7.1)
data/                  Every number, structured. METHOD.md has the schema.
logs/                  Daily entries + weekly reviews. The reasoning.
skills/                Core procedures + library/ of domain-provisioned ones
.claude/agents/        Universal specialists + library/ of domain-provisioned ones
library/optional/      Scaffolds copied up only if a domain needs them
scripts/               Validation, energy model, dashboard data build
src/                   The dashboard (Next.js)
```

## Agents

Universal on every chart:

| Agent | Consulted for |
|---|---|
| `red-team` | Reviews every plan, target change and intake output before it reaches the athlete |
| `adherence` | **Anything below 80% completion** — instead of the domain specialists |

Everything else is provisioned by domain from `.claude/agents/library/`, and athletes can
add their own. The test for a new one is in CLAUDE.md §7.1: **veto → new agent, parameters
→ addendum.**

## Two things that make or break it

**Log daily.** Thirty seconds. A coach with no data is a search engine with opinions.

**Don't edit the chart to be more flattering.** The value of the whole system is that it
holds an accurate record of what actually happened.

And a third: **update `values.md` and `goals.md` when life changes.** Everything
downstream reads from them. A stale goal file is the one failure mode this architecture
cannot detect on its own — which is why the 6-week review asks whether the domain *set* is
still right, not just its order.

## Not medical advice

This system is not a physician, dietitian, or physiotherapist. It has referral triggers
built into `CLAUDE.md` and it will use them. Get a physical and baseline bloodwork before
starting.
