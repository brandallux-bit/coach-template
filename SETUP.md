# Starting a new chart

Roughly 30 minutes of setup on a fresh Mac — most of it waiting on Homebrew — then intake. **Do not fill anything in before intake** — the
whole design depends on the athlete's goals being elicited before any category is named.

> **Every command below runs in Terminal on the ATHLETE's Mac**, not the helper's, unless
> a step says otherwise. Open Terminal with ⌘-Space → type "Terminal" → Enter. Paste each
> block, press Enter, wait for it to finish before the next one.
>
> Replace `NAME` with the athlete's first name in lower case, and `HER-USERNAME` /
> `THEIR-USERNAME` with their GitHub username, everywhere those appear.

## 0. Accounts and tools

**The athlete creates their own GitHub account** — it's their login and their password.
[github.com/signup](https://github.com/signup), free plan. Note the username down.

They also need the **Claude desktop app** ([claude.ai/download](https://claude.ai/download))
signed in to a **paid Claude plan** — Cowork and Claude Code are not on the free tier, and
the web app can't reach files on their Mac.

Check what's already installed:

```bash
for c in git gh node brew; do printf "%s: %s\n" "$c" "$(command -v $c >/dev/null 2>&1 && $c --version 2>&1 | head -1 || echo MISSING)"; done
```

**If anything is MISSING, install Homebrew** — it brings Apple's command line tools with
it, which is where `git` comes from:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

It asks for the Mac login password (typing shows nothing — normal). **When it finishes it
prints a "Next steps" section with two `echo` commands. Run those exactly as printed** —
skipping them is the single most common failure here, and the symptom is `brew: command
not found` afterwards. Then open a fresh Terminal window.

```bash
brew install gh node
```

`gh` talks to GitHub. **`node` runs the chart's validator and energy calculation** — the
coach needs it every time it writes numbers, so it is not optional.

Verify — three version numbers means ready:

```bash
git --version && gh --version && node --version
```

Then sign in to GitHub from Terminal. This opens a browser and asks for a one-time code —
no tokens, no SSH keys:

```bash
gh auth login
```

Answer: **GitHub.com** → **HTTPS** → **Y** (authenticate Git) → **Login with a web
browser**. It shows an 8-character code; press Return, paste the code in the browser,
approve.

**On the template owner's Mac**, if the template repo is private, grant read access once:

```bash
gh api -X PUT repos/OWNER/coach-template/collaborators/THEIR-USERNAME -f permission=pull
```

The athlete accepts the emailed invitation before continuing.

## 1. Create the chart repo

This downloads the template and renames the remote, **keeping the git history**:

```bash
cd ~/Documents
git clone https://github.com/OWNER/coach-template.git NAME-coach
cd NAME-coach
git remote rename origin upstream
```

> **Keep the history — do not `rm -rf .git`.** An earlier version of this doc deleted it "for a
> clean slate," which silently broke the whole point of the template: with no common ancestor,
> `git pull upstream main` fails with *refusing to merge unrelated histories*, and system fixes
> can never reach the chart. The template's handful of commits cost nothing to carry.
>
> A chart already created the old way isn't stuck — individual files can still be pulled across:
> `git fetch upstream && git checkout upstream/main -- path/to/file`.

Now create their own **private** repo as `origin` and push to it (`upstream` already points at
the template from the rename above):

```bash
gh repo create NAME-coach --private --source=. --remote=origin --push
```

Sanity check — `origin` should point at their repo, `upstream` at the template:

```bash
git remote -v
```

## 2. Rename the blanks

The template ships forms named `TEMPLATE-goals.md` and so on. This drops the prefix so
they become the chart's real files:

```bash
cd athlete
for f in TEMPLATE-*.md; do mv "$f" "${f#TEMPLATE-}"; done
cd ..
git add -A && git commit -m "Rename templates for this athlete" && git push
```

**Leave the files empty.** Filling anything in before intake is the one thing that breaks
the design.

> ### ⚠ Do NOT copy `constants.template.json` yet
>
> That copy is **the last step of intake**, not a setup step, and `skills/intake/SKILL.md`
> carries the same warning at the point where it is finally due.
>
> Everything in `scripts/` keys off one test — `hasChart`, which is just "does
> `athlete/constants.json` exist". While it does not, `check-all.mjs` **skips** every
> chart-dependent step and says which and why, so an intake spread across several sessions is
> green the whole way through. Creating the file early flips that switch with nothing behind it:
> the validator wants eight fields nobody has been asked for yet, `test-provenance` wants three
> `_provenance` maps, and the scheduled `generate-targets` job starts failing every morning on a
> `plan.kcalByWeekday` that intake has not written.
>
> This document used to say "copy it in now, then leave the files empty", and the result was a
> **red build on every push for the athlete's entire first week** — teaching someone brand new
> that a failing build is the normal state of their chart. That is the exact outcome the no-chart
> guard exists to prevent, defeated by the setup instructions (audit F-39).

> **Two keys are easy to leave out and both are checked.** `plan.kcalByWeekday` needs all seven
> weekday keys, spelled `Mon Tue Wed Thu Fri Sat Sun` — capitalised, three letters, because that is
> what every lookup in the code produces, and six right names or seven wrong ones is a chart with no
> calorie target on the days it cannot find. A chart that genuinely runs without daily targets says
> so in writing instead: `plan.dailyKcalTargetPolicy: "none"` with a reason in
> `plan._dailyKcalTargetPolicy_note`. And every `sessionTypes` entry carries `loading` — see
> `skills/intake/SKILL.md`, which says how to default it and which single entry to check by hand.
> `validate-data.mjs` reports both.

> **Two more that decide how the chart READS its record, and both are safe to leave out.**
> `plan.trendWindowSize` (default 3) is how many readings each end of a comparison averages;
> `plan.trendLagDays` (default 10) is how far apart the two ends sit. Together they produce the
> level a projection starts from AND the rate it projects at — one estimator for both halves — and
> the same pair decides the rate the §5.2 loss-rate ceiling fires on, so they are not a display
> setting.
>
> The defaults suit a chart weighed most mornings. **Widen the lag if this chart measures weekly**:
> with a 10-day gap a weekly record holds one reading each side, which still produces a figure and
> marks it thin, but a 21-day lag gives it something to average. Shortening the lag below about a
> week is where they start to mislead — the shorter the span, the more of the "rate" is whatever
> the scale happened to say that morning — and `npm run validate` warns about it rather than
> refusing, because a chart that measures twice a day may genuinely want it.
>
> Neither takes a `_provenance` marker: they say how a figure is read, not what anybody said or is
> asked to hit (`scripts/lib/provenance.mjs`, `PROVENANCE_EXEMPT`).
>
> **Three optional keys the burn model reads, all safe to leave out.** `program.setRestSec`
> overrides the 70-second default used to reconstruct the duration of a session that was performed
> but not timed — intake asks, and an unanswered chart keeps 70 marked as the coach's proposal
> rather than the athlete's. `sessionTypes.<type>.standingDurationMin` declares the length of an
> activity that always runs the same time, so such a session can be costed rather than estimated.
> `program.dailyBlockType` names which of those types the `Daily` prescription block is, so the
> forward view prices it from the same figure the ledger uses.

## 3. Run intake

> ### ⚠ Use Claude Code, not Cowork
>
> **Cowork cannot run git**, and this system depends on it: CLAUDE.md §0.1 syncs at the
> start of every session, and §0.3 commits after every logged number. In Cowork those
> silently don't happen, so the chart stops being backed up and stops being readable from
> another device — while everything on screen still looks fine. Verified 2026-08-09 on a
> fresh chart: identical prompt, Cowork could not sync, Claude Code synced normally.
>
> Claude Code is available **inside the same desktop app** as well as in Terminal, so this
> usually costs nothing — same window, same login.
>
> If someone does end up working in Cowork, tell the coach at the top of the session:
> *"Git syncing isn't available in this app — skip §0.1 and record in the log that it was
> skipped."* That is much better than the protocol quietly failing, but it is a stopgap:
> the chart is then local-only until someone commits it from Claude Code or Terminal.

Open the Claude desktop app, start **Claude Code**, point it at the `NAME-coach` folder,
and say **"Let's start the intake."**

**The athlete answers, not whoever set this up.** The whole design is that their goals get
elicited before any category is named — a helper supplying answers produces the helper's
model of their goals, which is exactly the failure the intake rewrite exists to prevent.

**Session 1 ends without the coach proposing anything.** It asks what they want and what
would count as it having happened, reflects it back, and stops. That is deliberate.

The coach follows `skills/intake`, across several short sessions rather than one sitting.

**What intake decides, that you do not decide up front:**
- which domains exist, and in what order
- which metrics get measured, and which do not
- which specialists get copied up from `.claude/agents/library/`
- which skills get copied up from `skills/library/`
- which of `program/`, `nutrition/`, `photos/` get created at all

**A chart with no `program/` directory is a valid chart.** So is one with no waist
measurement, and one that never takes a photo. If the finished chart looks like a copy of
someone else's with different numbers, the intake was led — say so and re-run Session 1.

## 4. Movement — pick one of two configurations

Everyday movement outside your sessions is one of the largest terms in the burn model,
and there are two supported ways to fill it. **Neither is the fallback for the other**, and
the one without a wearable is the one most people should pick. Declare exactly one in
`athlete/constants.json`, under `plan`.

### (a) No wearable — the common case

```json
"movementOutsideExerciseLevel": "light"
```

One of `seated`, `light`, `active`, `on-feet` — the descriptions are in
`scripts/lib/movement.mjs` and `skills/intake` asks the question in words. It prices as a
step-equivalent at your bodyweight, so it scales with you and uses no constant the model
does not already have.

⚠ **It needs a `_provenance` entry, like every value under `plan`.** `npm run check` fails
without one — on `test-provenance`, not on `validate-data`, which is why it is easy to miss:

```json
"_provenance": {
  "movementOutsideExerciseLevel": {
    "class": "athlete-stated",
    "asOf": "<the day they said it, YYYY-MM-DD>",
    "quote": "<their words about an ordinary day, not about exercise>",
    "source": "intake session 2",
    "note": "Their own description. The kcal figure derived from it is the coach's arithmetic."
  }
}
```

**It covers movement OUTSIDE deliberate exercise, and that clause is load-bearing.** A walk
you chose to go on is logged as a session and priced as one; a level that also covered it
would count that walk twice. Answer it about an ordinary day with the exercise taken out.

On this configuration, register a walking session type at a **real MET** — nothing else is
counting that movement — and set `"loading": false` if it isn't the kind of session that
tires anyone out. `validate-data.mjs` rejects `energyCountedIn: "steps"` here, because that
promises the energy is counted in a column nothing will ever write.

**Delete both step workflows:** `.github/workflows/log-steps.yml` (the writer) and
`.github/workflows/check-steps.yml` (the checker). Deleting only the writer leaves the
checker running, and it is the one that mails you a failure. Leaving them in place is
harmless — with no `plan.stepFeed`, `check-steps-gap.mjs` exits cleanly — but a workflow
nobody needs is one more thing to read past.

### (b) A wearable, feeding steps in

```json
"stepFeed": "apple-health-shortcut",
"stepsPerDayTarget": 9000
```

`.github/workflows/log-steps.yml` then writes `data/steps.csv` from an iOS Shortcut off
Apple Health. It needs a fine-grained GitHub PAT with **Contents: read/write** on this repo
only, and a Shortcut that POSTs:

```
POST https://api.github.com/repos/<owner>/<repo>/dispatches
{ "event_type": "steps", "client_payload": { "date": "YYYY-MM-DD", "steps": 9432 } }
```

**Both keys need `_provenance` entries under `plan`**, same as §4a — `stepFeed` and
`stepsPerDayTarget`. `npm run check` fails on `test-provenance` without them.

**Be honest with yourself about this before choosing it.** Building the Shortcut is fiddly
and it has to keep firing every morning for months. Declining is the expected answer.

On this configuration a walking type carries `met: 0` with `energyCountedIn: "steps"` — its
energy is in the feed already, and pricing it again as a session double-counts it. Do not
also set `movementOutsideExerciseLevel`: the feed counts what it describes, and the
validator rejects the pair.

`stepFeed` is a **name**, not a true/false, so a different writer — an Oura or Fitbit job
you add later — is a new value and not a new branch through the code. Write the name of
whatever actually writes the file.

### If neither is answered

The chart runs on the shipped default level and **nothing is written into your constants
file** — writing the coach's guess under your name is exactly what this system refuses to
do. Instead `build-findings` raises `movement-level-unanswered` on every run until somebody
answers, and every surface that renders the figure says out loud that it is a default nobody
has confirmed. The chart works; it just keeps asking.

## 5. Dashboard — optional, and after intake

Import the repo at [vercel.com/new](https://vercel.com/new), root directory `./`, and set
two environment variables for Production and Preview:

| Variable | Value |
|---|---|
| `DASHBOARD_PASSWORD` | what you type at the login screen |
| `AUTH_SECRET` | a long random string — `openssl rand -hex 32` |

Both must be set or sign-in is refused; it fails closed, never open. Vercel's Hobby tier
is sufficient — the app carries its own auth, so it doesn't need Vercel's Pro-only
deployment protection.

**Do this after intake, not before.** The dashboard's views are shaped by which domains
exist.

---

## Pulling template improvements later

```bash
git fetch upstream
git merge upstream/main
```

The template holds system files only — charter, skills, agents, scripts, dashboard. The
athlete's own files (`athlete/*.md`, `data/*.csv`, `logs/`, `decisions.md`) were renamed
or written after the fork, so upstream never touches them. Conflicts should be rare and
confined to system files you've deliberately customised.

Run `npm run validate` after any merge.

### After a merge, regenerate what is derived

Two files in `data/` are computed rather than written, and a template update can change the code
that computes them. Neither regenerates itself, and both fail the build when stale — with a message
about the file rather than about the merge, which is the confusing half.

```bash
node scripts/compute-energy.mjs     # data/energy.csv — the burn ledger
node scripts/build-docs.mjs         # the generated blocks in data/METHOD.md, incl. this chart's MET table
git add data/energy.csv data/METHOD.md
```

`compute-energy` recosts the whole ledger, so a change to the burn model reaches every historical
row at once. **That is the intended behaviour and it is worth understanding before you look at the
diff:** rows do not carry their old figures forward. If the model changed, record what changed and
why in `decisions.md` on the day you merge, because `method_version` alone will not tell a future
session which assumption a given row was costed under.

### Constants a merge may ask you to move

A template update can rename or relocate a key in `athlete/constants.json`. `npm run validate`
names each one it finds; this is what to do about the ones shipped so far.

| If your chart has | Move it to | Why |
|---|---|---|
| `program.dailyRehabMin` | `sessionTypes.<type>.standingDurationMin`, and name that type in `program.dailyBlockType` | The block's length is a property of the ACTIVITY, not of the current block, and the ledger and the forward view now read it from one place instead of disagreeing |
| rows already in `data/steps.csv` | add `plan.stepFeed`, naming whatever writes that file, **with a `_provenance` entry** | `npm run validate` **errors** until you do, and it should: your chart has a feed and has not said so, so every page reads it as a no-feed chart while the ledger counts the steps, and the daily gap check stops watching an automation that is still running. Add it even if you have SINCE stopped using a feed — the historical rows stay, and `data/METHOD.md` forbids deleting them |
| no `data/steps.csv` rows, and no wearable | add `plan.movementOutsideExerciseLevel` (§4a), **with a `_provenance` entry** | Until you do the chart runs on the shipped default. It keeps working, and the coach raises `movement-level-unanswered` on every check until somebody answers |

`data/energy.csv` gained `session_estimated` and `incidental_kcal` columns, so `npm run validate`
will say it is missing them until you run `compute-energy.mjs` as above. That is the whole fix;
nothing is wrong with your rows.

⚠ **On a chart with rows, that re-run is a model change and it owes a `method_version` bump.**
With a step feed nothing moves — the movement term was already counted and the recomputed figures
are identical. Without one, every historical day gains a movement term it did not have, which is
exactly what the version column exists to keep readable. Bump `METHOD_VERSION` in
`scripts/lib/method-version.mjs`, re-record the digest it prints, and write the change into
`decisions.md` before you commit the regenerated ledger.

Until you move it, an untimed session of that type is costed from its set count instead of from
the length you declared, and the daily block drops out of the forward view. Nothing is lost and
nothing is wrong — but two numbers you expected to match will not.
