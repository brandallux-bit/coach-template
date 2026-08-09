# Specialization addenda

Files here are **modifiers on existing expertise**, not new specialists. Each one is
required reading for named agents, listed in `.claude/agents/MANIFEST.md` — the same
mechanism that makes `injury-history.md` mandatory before programming.

Governed by CLAUDE.md §7.1. The test:

> **Veto → new agent. Parameters → addendum here.**

Something that must be able to *stop* a recommendation gets its own agent (and, if it's a
safety matter, a §5 floor as well). Something that changes the *inputs* to an existing
agent's reasoning gets a file here.

The reason to prefer an addendum: a modifier split into its own agent creates ambiguous
routing. If post-menopausal physiology were its own agent, "how much protein?" could
reasonably go to either `nutrition` or that agent — and knowledge that gets consulted
*sometimes* is worse than knowledge that is always in the room.

## Writing one

Name the file for the modifier, not the athlete: `post-menopausal.md`,
`type-1-diabetes.md`, `vegan.md`, `acl-reconstruction-return.md`.

Cover, briefly:

- **What changes**, per affected agent — the concrete parameter shifts, not a literature review
- **What it does NOT change** — so agents don't over-correct
- **What to watch for** — the specific failure mode this modifier introduces
- **Review or retire date**, where the modifier is time-bounded

Then add it to the manifest against every agent that must read it, and record it in
`decisions.md`.

## Currently on this chart

_(none)_
