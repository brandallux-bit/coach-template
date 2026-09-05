# Coach — template

A file-backed AI coaching system. The files are the source of truth; the coach reads them
before it speaks and writes to them after.

**This repo is the system, not a chart.** Clone it per athlete.

| You are | Read |
|---|---|
| Setting this up for yourself, and not technical | **[GETTING-STARTED.md](GETTING-STARTED.md)** — accounts, install, intake. No code. |
| The AI doing that setup | **[skills/setup](skills/setup/SKILL.md)** — the executable procedure |
| Adding the web dashboard, later | **[DASHBOARD.md](DASHBOARD.md)** — Vercel and the write token |
| Stuck | **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** |
| Maintaining the template, or pulling its updates into a chart | **[SETUP.md](SETUP.md)** — the reference and the rationale |

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
library/optional/      Scaffolds copied up only if a domain needs them — including
                       workflows/, which holds an automation the template ships OFF
scripts/               Validation, energy model, dashboard data build
src/                   The dashboard (Next.js)
```

## Agents

Universal on every chart:

| Agent | Consulted for |
|---|---|
| `red-team` | Reviews every plan, target change and intake output before it reaches the athlete |
| `adherence` | Completion below `plan.adherenceRoutingPct` (`athlete/constants.json`) — instead of the domain specialists |

Everything else is provisioned by domain from `.claude/agents/library/`, and athletes can
add their own. The test for a new one is in CLAUDE.md §7.1: **veto → new agent, parameters
→ addendum.**

## The data layer

`logs/` holds the reasoning. **`data/` holds the numbers**, and it is the source of truth for
both the coach and the dashboard. Every meal, set, weigh-in, tape measure, session and target is
a row there — written *before* the prose, then referenced by it, so the two can never disagree
(CLAUDE.md §0.3).

An empty cell means *not measured* and renders as TBD. It never means zero. That distinction is
enforced, because a fabricated zero in a trend line is worse than a gap.

```bash
npm run validate   # schema check — CI runs this on every push
npm run energy     # regenerate data/energy.csv from the measured files
npm run check      # the whole suite: validators, scanners and unit tests
npm run parity     # what this chart's system layer has that the template doesn't
```

`npm run parity` is the one that stops this chart and the template it was forked from silently
drifting apart. It reports and never merges — read the diff and decide which way it crosses.
It skips with a named reason on a repo with no `upstream` remote, which is every fresh chart
before setup finishes, and the template itself.

`scripts/` is dependency-free Node — `npm install` is only needed for the dashboard. In a repo
where intake has not run yet, the chart-dependent steps skip themselves and say so.

`data/energy.csv` is **generated, never hand-edited**. The burn model — RMR recomputed daily from
that day's weight, plus food thermic effect, non-step movement, steps, and session METs — is
documented with its constants in `data/METHOD.md` and carries a `method_version` so history stays
readable when the model is recalibrated.

## The dashboard

A Next.js app at the repo root reads `data/` at build time. Which pages are useful depends on the
chart's domains; the app ships **Goals & Progress**, **Today**, **Next 7 Days**, **Log** and
**History**.

⚠ **`/log` WRITES to the chart.** It commits rows to `data/*.csv` through the GitHub API, using
the same `validateRow()` the coaching session uses. Anyone hardening the deploy needs to know
that before removing `GITHUB_TOKEN` — `/log` then fails closed with disabled buttons, so it
degrades quietly and the athlete simply stops being able to record anything.

```bash
npm run dev        # http://localhost:3000
```

Two environment variables gate it — see `.env.example`. Both must be set or sign-in is refused
outright; it fails closed, never open.

| Variable | What it is |
|---|---|
| `DASHBOARD_PASSWORD` | what you type on the login screen |
| `AUTH_SECRET` | the session cookie's value, verbatim — anyone holding it is signed in; rotating it signs every device out |

**Deploying to Vercel:** [DASHBOARD.md](DASHBOARD.md) is the procedure, in the detail somebody
setting it up for the first time needs. It is deliberately not restated here — the variables,
the ordering and the write token were previously stated in three places and had already drifted
apart in two of them.

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
