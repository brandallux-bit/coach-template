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

## 4. Steps automation — optional

If a domain needs daily steps, `.github/workflows/log-steps.yml` writes `data/steps.csv`
from an iOS Shortcut off Apple Health. It needs a fine-grained GitHub PAT with
**Contents: read/write** on this repo only, and a Shortcut that POSTs:

```
POST https://api.github.com/repos/<owner>/<repo>/dispatches
{ "event_type": "steps", "client_payload": { "date": "YYYY-MM-DD", "steps": 9432 } }
```

If no domain needs steps, delete the workflow. Don't collect a number nobody uses.

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
