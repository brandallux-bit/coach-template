# Agent roster — this chart

> **The roster is per-athlete.** Two agents are universal; everything else exists because
> a domain in `athlete/goals.md` needs it. Adding one is governed by CLAUDE.md §7.1 —
> **veto → new agent, parameters → addendum.**

## Universal — every chart has these

| Agent | Route when |
|---|---|
| `red-team` | Before **any** plan, target revision, goal conclusion, or intake output reaches the athlete |
| `adherence` | Completion below 80% for a week — **instead of** the domain specialists |

## This chart's specialists

_(none yet — intake has not run)_

| Agent | Serves domain | Route when |
|---|---|---|
| | | |

Available in `.claude/agents/library/`, copied up **only** if a domain calls for it:

| Agent | Copy up when a domain needs |
|---|---|
| `strength` | Programming, exercise selection, volume, progression, deloads |
| `nutrition` | Calorie or macro targets, meal architecture, stalls, eating out |
| `recovery` | Sleep, fatigue, deload timing, load management around injury |

An agent that serves no domain is a default in disguise (§1.1). Do not copy the whole
library up "just in case" — that reproduces the generic fitness chart this system is
built to avoid.

## Specialization addenda

Files in `athlete/specialization/` that named agents must read before answering. These are
modifiers on existing expertise, not separate specialists (§7.1).

| Addendum | Required reading for |
|---|---|
| _(none)_ | |

## Hard constraints

| File | Enforced by |
|---|---|
| `athlete/hard-constraints.md` | **Head coach, on every food suggestion** (§5.1). Not delegated. |
| `athlete/injury-history.md` _(if it exists)_ | Head coach + any programming agent, before any programming |

---

## Adding a specialist

1. Apply the §7.1 test. **Most requests are addenda, not agents.**
2. If it's an agent: create `.claude/agents/<name>.md` with `name` and `description`
   frontmatter, and add a row above naming **which domain it serves**.
3. If it's an addendum: create `athlete/specialization/<name>.md` and list the agents
   required to read it.
4. If it touches safety, it *also* needs a §5 floor. The agent adds depth; the floor
   prevents the catastrophe. Never rely on routing to keep the athlete safe.
5. Record it in `decisions.md`.

### Examples of the test

| Need | Verdict | Why |
|---|---|---|
| Food allergies | **Agent** + §5 floor | Owns a veto over any meal recommendation; exposure is a medical event |
| Post-menopausal physiology | **Addendum** to `nutrition`, `recovery`, `strength` | Changes their parameters; splitting it out makes "how much protein?" ambiguously routed |
| Type 1 diabetes | **Agent** + §5 floor | Owns a veto over fasting, deficit depth and session timing |
| Vegan or religious diet | **Addendum** to `nutrition` | A constraint on meal construction, not a separate discipline |
| Return from a specific surgery | **Addendum** to `recovery`, retired when it resolves | Time-bounded modifier on existing expertise |
| IBS / IBD symptom management | **Agent** | Owns a veto over fibre targets and trigger foods, and its own protocol |
