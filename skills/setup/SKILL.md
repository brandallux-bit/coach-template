---
name: setup
description: Finish creating a new chart — the athlete's private GitHub repo, the blank athlete files, the first check — and hand off to intake. Use when a session opens in a freshly cloned chart that has no athlete/constants.json, when the athlete says "continue my setup", or when SETUP.md is being followed by a person rather than executed. Runs once per chart.
---

# Setup

**You are doing the technical work so the athlete does not have to.** They are not
expected to know what a repository is. Read this whole file before running anything, then
work top to bottom, telling them in plain language what you are doing and why.

Everything here used to live in `SETUP.md` as instructions for a *person* to type. That
document still exists and is still authoritative on the **rules**; this is the executable
version, and where it is silent, `SETUP.md` answers.

## What is already done before you start

The athlete installed the tools themselves in Terminal (`GETTING-STARTED.md` step 2) and a
bootstrap session cloned the chart. **Both of those steps are finished by the time this
skill runs**, and neither is yours to repeat.

> ### ⛔ You cannot install anything, and you must not try
>
> Homebrew asks for the Mac login password; `gh auth login` is an arrow-key menu. **A
> command you run has no terminal attached**, so neither prompt has anywhere for the athlete
> to answer — it hangs, or fails with `sudo: a terminal is required to read the password`.
>
> If a tool is missing, **send them to `GETTING-STARTED.md` step 2 and wait.** Print the
> command for them to paste into Terminal themselves; never run it inside a command of your
> own. This is the one class of work in the whole system that is theirs and not yours.

## 0. Establish where you are

Three states need different actions, and guessing wrong is destructive:

| What you see | State | What to do |
|---|---|---|
| `athlete/constants.json` exists | **Already a chart.** Setup has run. | Stop. Say so. Route to `skills/intake` only if they want to re-take intake. |
| `CLAUDE.md` present, `athlete/TEMPLATE-*.md` still named that way | **The normal entry point.** The bootstrap cloned this and handed over. | Start at §1. |
| Neither — only the starter kit's documents | **Wrong folder.** | They are still in the starter folder. Tell them to open Claude Code on `~/Documents/<name>-coach` and say *continue my setup*. |

Every step is safe to re-run. Check for its result before doing it rather than assuming it
has not happened — an interrupted setup resumes here.

**Use full paths in every command.** Do not rely on a `cd` from an earlier step still
applying; on some surfaces it does not, and the failure is silent and confusing.

## 1. Confirm the ground

```bash
git --version && node --version && gh auth status
```

Two version numbers and a logged-in line. Anything else → the box above; send them to
`GETTING-STARTED.md` step 2 and wait.

Then confirm you are in the chart and it kept its history:

```bash
git -C . remote -v && git -C . log --oneline -1
```

`upstream` should point at the template. **If there is no `upstream` and no history**, this
chart was made by copying files rather than cloning, and it can never receive a system fix
— `SETUP.md`'s "Pulling template improvements later" documents the recovery. Say so now
rather than discovering it in six months.

## 1b. Where the template lives

`library/starter-kit/TEMPLATE-URL` holds the clone URL, and it is the only place it is written
down. The bootstrap reads it too. If you need it:

```bash
cat library/starter-kit/TEMPLATE-URL
```

## 2. Their first name

Lower case, if you do not already have it from the bootstrap. It names the repo. **That is
the only question setup needs** — everything else about them is intake's, and asking here
produces answers to a different question.

## 3. Their own private repo

The clone's `origin` was renamed to `upstream`, so the template stays reachable for updates.
This adds their repo as the new `origin`:

```bash
gh repo create NAME-coach --private --source=. --remote=origin --push
```

**Private is not a default to reconsider.** This will hold weight, symptoms, medications
and injuries. Confirm all three before continuing:

```bash
git remote -v
gh repo view --json visibility -q .visibility
```

`origin` → their repo, `upstream` → the template, visibility → `PRIVATE`. Fix any of the
three now, not after there is data in it.

## 4. Turn the blanks into their files

The template ships forms named `TEMPLATE-goals.md` and so on. Drop the prefix:

```bash
cd ~/Documents/NAME-coach/athlete && for f in TEMPLATE-*.md; do mv "$f" "${f#TEMPLATE-}"; done
cd ~/Documents/NAME-coach && git add -A && git commit -m "Rename templates for this athlete" && git push
```

⛔ **Leave every one of them empty.** Filling anything in before intake is the one thing
that breaks the design — you would be recording your model of this person, then eliciting
against it.

> ### ⚠ Do NOT copy `constants.template.json`
>
> That copy is **the last step of intake**, not a setup step, and `skills/intake/SKILL.md`
> carries the same warning where it is finally due.
>
> Everything in `scripts/` keys off one test — `hasChart`, which is just "does
> `athlete/constants.json` exist". While it does not, `check-all.mjs` **skips** every
> chart-dependent step and says which and why, so an intake spread over several sessions is
> green the whole way through. Creating it early flips that switch with nothing behind it:
> the validator wants eight fields nobody has been asked for, `test-provenance` wants three
> `_provenance` maps, and the scheduled `generate-targets` job starts failing every morning
> on a `plan.kcalByWeekday` intake has not written.
>
> This is not a style note. The setup doc used to say "copy it in now", and the result was
> **a red build on every push for the athlete's entire first week** — teaching someone brand
> new that a failing build is the normal state of their chart (audit F-39).

## 5. Prove it works

```bash
cd ~/Documents/NAME-coach && npm run check
```

**Expect green, with about a dozen steps skipped** and a line naming the reason: *no
`athlete/constants.json` — run intake first*. That is the correct output of a fresh chart.
Show it to them and say what it means: the system is installed, and it is waiting for them.

If it is red, stop and fix it here. A chart that starts red teaches them to ignore red.

`npm install` is **not** needed — `scripts/` is dependency-free Node. It is only required
for the dashboard, which comes later.

## 6. Set the clock to their timezone

The two scheduled jobs run on fixed UTC crons written for the template author's timezone.
**On a chart in another timezone the daily rollover fires mid-afternoon**, so the day's
calorie target — which `CLAUDE.md` §0.3 says a day may never lack — does not exist for the
first half of that day.

You cannot fix this yet: the timezone is `athlete.timezone`, which intake writes. **Say so
now, and leave a reminder that it is owed**, so it is not discovered weeks later:

> One thing I will need to set once you have told me where you live: the automatic
> daily job runs on a clock that is currently set for California.

`skills/intake` picks this up at the point it writes `constants.json`. If you are reading
this on a chart whose intake is already done, do it now: `node scripts/check-crons.mjs`
prints the correct cron lines for the athlete's timezone and which files to change.

## 7. What is deliberately NOT done here

Three things a thorough installer would do now, all wrong now:

- **Movement configuration** (`SETUP.md` §4) is an intake question, asked in words about an
  ordinary day. Until it is answered the chart runs on a shipped default and
  `build-findings` raises `movement-level-unanswered` on every run — it keeps asking, which
  is designed behaviour, not a gap to close here.
- **The step workflows** stay as shipped. With no `plan.stepFeed` they exit cleanly and cost
  nothing. Deleting them is a §4a decision following from an answer nobody has given yet.
- **The dashboard** cannot build before intake — `check-chart-for-build.mjs` refuses on
  purpose, because a deployed dashboard rendering TBD in every cell looks like a broken chart
  rather than an absent one. **Say this out loud before they wander off and connect Vercel**,
  because the coach commits on every logged number (§0.3), so an early import emails them a
  failed deployment for every commit of their first week.

## 8. Hand off to intake

Setup is done. Tell them plainly:

- Their chart lives in `~/Documents/NAME-coach`, and is backed up privately on GitHub.
- Nothing about them has been written down yet. That is next, and it is a conversation.
- It runs across **five or six short sessions on separate days**, not one sitting — people
  give honest answers in session one and performative answers in minute forty.
- **Session 1 ends with no plan.** The coach asks what they want, reflects it back, and
  stops. That is deliberate, not an unfinished session.

Then run `skills/intake`, and follow it rather than improvising — including its rule that
**the athlete answers, not whoever set this up.** If you helped someone else install this,
your part is now finished.

Commit anything outstanding with `node scripts/chart-commit.mjs -m "Set up chart"` before
the session ends.
