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

- **80 shared system paths changed.** That is the number the next parity run will report, not the
  ~31 the port plan estimated — the estimate predated three phases of de-athleting and two rounds
  of review fixes, which touched files the plan had not listed.
- **7 more files changed that are NOT shared**, so they need no entry at all: `SETUP.md`,
  `athlete/constants.template.json`, `data/energy.csv`, this file, and the three under
  `library/optional/`.

⚠ **THESE THREE COUNTS ARE HAND-WRITTEN AND WILL ROT.** Recount before acting on them — the same
mistake `docs/INVARIANTS.md` made with its own table, where "fifteen invariants" sat above eighteen
rows for as long as nobody added them up:

```bash
# in the TEMPLATE, against the port baseline. --input-type=module is required: the script uses
# `import`, and node -e cannot mix that with require().
node --input-type=module -e '
  import { execFileSync } from "node:child_process"
  import { existsSync } from "node:fs"
  import { SYSTEM_PATHS as SP } from "./scripts/lib/system-paths.mjs"
  const CHART = process.env.COACH_CHART            // path to the chart clone
  const shared = (p) => SP.some((s) => p === s || p.startsWith(s + "/"))
  const c = execFileSync("git", ["diff", "--name-only", "92898e3"], { encoding: "utf8" })
    .split("\n").filter(Boolean)
  const sys = c.filter(shared)
  const only = sys.filter((p) => !existsSync(`${CHART}/${p}`))
  console.log(`shared=${sys.length} both=${sys.length - only.length} templateOnly=${only.length} other=${c.length - sys.length}`)
  for (const p of only) console.log("  templateOnly:", p)
'
```

## The two buckets, which the parity report does not distinguish and you must

An acknowledgement means *"this difference is correct and should not be mirrored."* Most of what
follows is not that. It is an improvement the chart should **take**, and pinning it would file a
fix as a permanent divergence — the exact failure the acknowledgement mechanism exists to prevent,
wearing its own uniform.

### Bucket 1 · Mirror these, do not acknowledge them

68 paths exist in both repos and moved here. Read the diff, take the change, and pin only
what you deliberately keep different afterwards. Where the chart's copy carries this athlete's
prose and the template's carries the de-athleted form, **the prose difference is the acknowledgement
you write** — one entry per file, reason "template is de-athleted by design", after the code change
has crossed.

### Bucket 2 · Template-only — nothing to mirror, nothing to acknowledge

12 paths do not exist in the chart at all. ⚠ **The parity report has no category for this and no
word for it** — `check-template-parity.mjs` prints `added+ removed-  path` for every divergence
alike, so these read as a large pure-addition count and nothing labels them. That is what you are
inferring, not something the tool tells you. Correct and permanent for some of them, a genuine
missing feature for others. Decide per file:

- `scripts/lib/deathlete.mjs`
- `scripts/lib/movement.mjs`
- `scripts/lib/session-table.mjs`
- `scripts/lib/system-paths.mjs`
- `scripts/port-overlay.mjs`
- `scripts/test-session-table.mjs`
- `skills/library/nutrition-targets/SKILL.md`
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
