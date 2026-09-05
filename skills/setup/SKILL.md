---
name: setup
description: Create a new chart from the template — install the tools, create the athlete's private GitHub repo, and hand off to intake. Use when someone opens the starter kit and asks to set up their coach, when a session starts in a folder that is not yet a chart, or when SETUP.md is being followed by a person rather than executed. Runs exactly once per chart.
---

# Setup

**You are doing the technical work so the athlete does not have to.** They are not
expected to know what a repository is. Read this whole file before running anything, then
work through it top to bottom, telling them in plain language what you are doing and why.

Everything here used to live in `SETUP.md` as instructions for a *person* to type. That
document still exists and is still correct — it is now the reference and the rationale.
**This file is the executable version, and it is the one that runs.**

## The one thing that makes this different from a normal install

**Two steps need the athlete's own hands and you cannot do them.** Both involve a
credential you must never see or type:

1. **Homebrew asks for their Mac login password.** You cannot type it. Stop, tell them to
   type it into Terminal themselves, and wait.
2. **`gh auth login` opens a browser and asks them to approve a code.** You cannot approve
   it. Print the code, tell them what to click, and wait.

When you reach either, **stop and hand off in one clear sentence.** Do not retry, do not
loop, and do not offer to do it for them. Everything on either side of these two moments
is yours.

## 0. Establish where you are

Before anything, work out which of three states you are in — they need different actions
and guessing wrong is destructive:

| What you see | State | What to do |
|---|---|---|
| `athlete/constants.json` exists | **Already a chart.** Setup has run. | Stop. Say so. Route to `skills/intake` only if they want to re-take intake. |
| `CLAUDE.md` + `athlete/TEMPLATE-*.md` present | **Template clone, setup partway.** | Resume at the first step below whose result is missing. |
| Neither — just the starter kit's docs | **Nothing created yet.** | Start at §1. |

Every step below is safe to re-run. Check for its result before doing it rather than
assuming it has not happened.

## 1. Preflight — what is already installed

```bash
for c in git gh node brew; do printf "%s: %s\n" "$c" "$(command -v $c >/dev/null 2>&1 && $c --version 2>&1 | head -1 || echo MISSING)"; done
```

**`node` is not optional.** It runs the validator and the energy model, which the coach
uses every single time it writes a number. A chart without it appears to work and then
fails on the first commit.

If everything is present, skip to §2.

### If anything is MISSING — Homebrew first

Homebrew brings Apple's command line tools, which is where `git` comes from:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

⛔ **This is human step one.** It asks for their Mac login password, and typing shows
nothing on screen — that is normal and worth saying out loud, because it looks broken.

**When it finishes it prints a "Next steps" section containing two `echo` commands.**
Those add `brew` to their shell's path. **Skipping them is the single most common failure
in this whole procedure**, and the symptom is `brew: command not found` several steps
later, long after the cause. Read the output, run exactly what it printed, then have them
open a fresh Terminal window.

Then:

```bash
brew install gh node
```

Verify — three version numbers means ready:

```bash
git --version && gh --version && node --version
```

## 2. Sign in to GitHub

```bash
gh auth login
```

⛔ **This is human step two.** Answer: **GitHub.com** → **HTTPS** → **Y** (authenticate
Git) → **Login with a web browser**. It prints an eight-character code. Tell them the
code, tell them to press Return, paste it in the browser, and approve.

No tokens, no SSH keys. If they are ever asked to create a personal access token here,
something has gone wrong — back out and use the browser flow.

Confirm before continuing:

```bash
gh auth status
```

## 3. Ask for the one thing only they can decide

**Their first name, lower case.** It names the folder and the repo — `jane-coach`. Ask
for it if you do not already have it. That is the only question this procedure needs.

Everything else about them is elicited at intake, by intake. **Do not ask about goals,
weight, training, diet or injuries here, and do not accept them if offered** — write them
down for later and say you will get to them properly. The whole design rests on those
being elicited before any category is named, and answers given during a software install
are answers to a different question.

## 4. Create the chart repo

This downloads the template **keeping its git history**, then points `upstream` at it:

```bash
cd ~/Documents
git clone https://github.com/brandallux-bit/coach-template.git NAME-coach
cd NAME-coach
git remote rename origin upstream
```

> ⛔ **Never `rm -rf .git`.** With no shared history, `git pull upstream main` fails
> forever with *refusing to merge unrelated histories*, and system fixes can never reach
> this chart again. An earlier version of the setup doc deleted it "for a clean slate" and
> silently broke the entire point of the template. The handful of template commits cost
> nothing to carry. `SETUP.md` documents the recovery for a chart already made this way.

Now their own **private** repo, as `origin`:

```bash
gh repo create NAME-coach --private --source=. --remote=origin --push
```

**Private is not a default to reconsider.** This repo will hold weight, symptoms,
medications and injuries. Confirm the flag landed:

```bash
git remote -v
gh repo view --json visibility -q .visibility
```

`origin` → their repo, `upstream` → the template, visibility → `PRIVATE`. If any of the
three is wrong, fix it before continuing rather than after there is data in it.

## 5. Turn the blanks into their files

The template ships forms named `TEMPLATE-goals.md` and so on. Drop the prefix:

```bash
cd athlete
for f in TEMPLATE-*.md; do mv "$f" "${f#TEMPLATE-}"; done
cd ..
git add -A && git commit -m "Rename templates for this athlete" && git push
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

## 6. Prove it works

```bash
npm run check
```

**Expect green, with about a dozen steps skipped** and a line naming the reason: *no
`athlete/constants.json` — run intake first*. That is the correct and intended output of a
fresh chart. Show it to them and say what it means: the system is installed, and it is
waiting for them.

If it is red, stop and fix it here. A chart that starts red teaches them to ignore red.

`npm install` is **not** needed yet — `scripts/` is dependency-free Node. It is only
required for the dashboard, which comes later.

## 7. Movement, steps, and the dashboard — all later, all deliberately

Three things a thorough installer would do now, and all three are wrong now:

- **Movement configuration** (`SETUP.md` §4) is an intake question, asked in words about an
  ordinary day. Until it is answered the chart runs on a shipped default and
  `build-findings` raises `movement-level-unanswered` on every run — it keeps asking, which
  is the designed behaviour, not a gap to close here.
- **The step workflows** stay as shipped. With no `plan.stepFeed` they exit cleanly and cost
  nothing. Deleting them is a §4a decision that follows from an answer nobody has given yet.
- **The dashboard** cannot build before intake — `check-chart-for-build.mjs` refuses on
  purpose, because a deployed dashboard rendering TBD in every cell looks like a broken chart
  rather than an absent one. **Say this out loud before they wander off and connect Vercel**,
  because the coach commits on every logged number (`CLAUDE.md` §0.3), so an early import
  emails them a failed deployment for every commit of their first week.

## 8. Hand off to intake

Setup is done. Tell them plainly:

- Their chart lives in `~/Documents/NAME-coach`, and is backed up privately on GitHub.
- Nothing about them has been written down yet. That is next, and it is a conversation.
- It runs across **several short sessions, not one sitting** — people give honest answers
  in session one and performative answers in minute forty.
- **Session 1 ends with no plan.** The coach asks what they want, reflects it back, and
  stops. That is deliberate, not an unfinished session.

Then run `skills/intake`, and follow it rather than improvising — including its rule that
**the athlete answers, not whoever set this up.** If you helped someone else install this,
your part is now finished.

Commit anything outstanding with `node scripts/chart-commit.mjs -m "Set up chart"` before
the session ends.
