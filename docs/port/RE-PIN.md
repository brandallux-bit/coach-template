# Re-pinning after this port — what a chart owner has to do, and why nobody else can

**This file is a handover, not a change.** Every acknowledgement it talks about lives in a
**chart**, never in this template: `athlete/leak-acknowledgements.json` and `template-parity.json`
both ship here with `entries: []`, because the template has no athlete to leak and nothing upstream
to diverge from. The port that produced this file could not write those entries and did not try.

## What changed, and why it makes every acknowledgement lapse

Both acknowledgement files pin a **digest taken over the diff itself**, deliberately: an entry
covers the divergence somebody actually read, so the moment either side changes that file again the
digest moves, the acknowledgement lapses, and the path comes back into the report. That is the
mechanism working. It also means a port of this size expires the lot at once.

Counted from `92898e3` (the merge-base this port started from) to the current head:

- **74 shared system paths changed.** That is the number the next parity run will report,
  not the ~31 the port plan estimated — the estimate predated three phases of de-athleting, which
  touched files the plan had not listed.
- **6 more files changed that are NOT shared**, so they need no entry at all:
  `SETUP.md`, `athlete/constants.template.json`, `data/energy.csv`, `library/optional/photos/PROTOCOL.md`, `library/optional/program/conditioning-menu.md`, `library/optional/program/exercise-library.md`.

## The two buckets, which the parity report does not distinguish and you must

An acknowledgement means *"this difference is correct and should not be mirrored."* Most of what
follows is not that. It is an improvement the chart should **take**, and pinning it would file a
fix as a permanent divergence — the exact failure the acknowledgement mechanism exists to prevent,
wearing its own uniform.

### Bucket 1 · Mirror these, do not acknowledge them

64 paths exist in both repos and moved here. Read the diff, take the change, and pin only
what you deliberately keep different afterwards. Where the chart's copy carries this athlete's
prose and the template's carries the de-athleted form, **the prose difference is the acknowledgement
you write** — one entry per file, reason "template is de-athleted by design", after the code change
has crossed.

### Bucket 2 · Template-only — nothing to mirror, nothing to acknowledge

10 paths do not exist in the chart at all. A parity run reports them as "template ahead";
that is correct and permanent for some, and a genuine missing feature for others. Decide per file:

- `scripts/lib/movement.mjs`
- `scripts/lib/session-table.mjs`
- `scripts/lib/system-paths.mjs`
- `scripts/port-overlay.mjs`
- `scripts/test-session-table.mjs`
- `skills/library/photo-assessment/SKILL.md`
- `skills/library/program-design/SKILL.md`
- `skills/library/session-recommendation/SKILL.md`
- `src/lib/movement.ts`
- `src/lib/session-table.ts`

Two of these are structural rather than optional. `scripts/port-overlay.mjs` and
`scripts/lib/system-paths.mjs` are the porting harness itself and belong only here.
`skills/library/*` is where the template keeps a skill a fresh fork has **not** been given —
`emptyTheChart()` and `isChartInstance()` both read `skills/library/<x>` existence to decide what a
fresh fork is, so a chart promotes them into `skills/` instead of carrying both.

## The commands, in the chart, in this order

```bash
# 1 · see what actually moved. Nothing is pinned until this has been read.
git fetch upstream
node scripts/check-template-parity.mjs

# 2 · take the changes in bucket 1, file by file, running the suite as you go.
git checkout upstream/main -- <path>
node scripts/check-all.mjs

# 3 · ONLY NOW pin what is left. --pin prints paste-ready entries; the reason is yours to write.
node scripts/check-template-parity.mjs --pin
node scripts/check-no-athlete-leak.mjs --pin
```

⚠ **A reason that is a shrug is an exemption sitting on a check it cannot justify** — the
acknowledgement file's own `_comment` says so. "Diverged during the template port" is a shrug.
"The template's copy is de-athleted and this chart's names this athlete on purpose" is a reason.

⚠ **Pin last, and pin nothing you have not read.** An entry written before the mirror step covers
a divergence that was about to disappear, and it will then silently cover whatever replaces it.
