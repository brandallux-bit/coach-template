# Starting a new chart

Roughly 15 minutes of setup, then intake. **Do not fill anything in before intake** — the
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
echo "git: $(git --version 2>/dev/null || echo MISSING)"; echo "gh: $(gh --version 2>/dev/null | head -1 || echo MISSING)"; echo "brew: $(brew --version 2>/dev/null | head -1 || echo MISSING)"
```

- **git MISSING** → run `xcode-select --install` and click through the installer.
- **brew MISSING** → install from [brew.sh](https://brew.sh) (one command, asks for the
  Mac password).
- **gh MISSING** → `brew install gh`

Then sign in to GitHub from Terminal. This opens a browser and asks for a one-time code —
no tokens, no SSH keys:

```bash
gh auth login
```

Choose: **GitHub.com** → **HTTPS** → **Yes** (authenticate git) → **Login with a web
browser**.

**On the template owner's Mac**, if the template repo is private, grant read access once:

```bash
gh api -X PUT repos/OWNER/coach-template/collaborators/THEIR-USERNAME -f permission=pull
```

The athlete accepts the emailed invitation before continuing.

## 1. Create the chart repo

This downloads the template, **deletes its git history** so the chart starts clean rather
than inheriting the template's commits, and makes the first commit of their own:

```bash
cd ~/Documents
git clone https://github.com/OWNER/coach-template.git NAME-coach
cd NAME-coach
rm -rf .git
git init -b main
git add -A
git commit -m "Start chart from template"
```

Now create their own **private** repo and push to it:

```bash
gh repo create NAME-coach --private --source=. --remote=origin --push
```

Then wire the template as `upstream`, so system improvements can be pulled in later:

```bash
git remote add upstream https://github.com/OWNER/coach-template.git
```

Sanity check — `origin` should point at their repo, `upstream` at the template:

```bash
git remote -v
```

## 2. Rename the blanks

The template ships forms named `TEMPLATE-goals.md` and so on. This drops the prefix so
they become the chart's real files, and makes a working copy of the constants file:

```bash
cd athlete
for f in TEMPLATE-*.md; do mv "$f" "${f#TEMPLATE-}"; done
cp constants.template.json constants.json
cd ..
git add -A && git commit -m "Rename templates for this athlete" && git push
```

**Leave the files empty.** Filling anything in before intake is the one thing that breaks
the design.

## 3. Run intake

Open the Claude desktop app, start **Cowork**, point it at the `NAME-coach` folder, and
say **"Let's start the intake."**

**The athlete answers, not whoever set this up.** The whole design is that their goals get
elicited before any category is named — a helper supplying answers produces the helper's
model of their goals, which is exactly the failure the intake rewrite exists to prevent.

**Session 1 ends without the coach proposing anything.** It asks what they want and what
would count as it having happened, reflects it back, and stops. That is deliberate.

The coach follows `skills/intake`. It will take several short sessions. It will not
propose anything in Session 1 — that is the design, not a stall.

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
