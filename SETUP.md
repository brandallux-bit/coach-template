# Starting a new chart

Roughly 15 minutes of setup, then intake. **Do not fill anything in before intake** — the
whole design depends on the athlete's goals being elicited before any category is named.

## 1. Create the chart repo

```bash
git clone https://github.com/<owner>/coach-template.git <name>-coach
cd <name>-coach
rm -rf .git && git init && git add -A && git commit -m "Start chart from template"
```

Create a **private** repo on GitHub and push to it. Then wire the template as upstream so
system improvements can be pulled in later:

```bash
git remote add upstream https://github.com/<owner>/coach-template.git
```

## 2. Rename the blanks

```bash
cd athlete
for f in TEMPLATE-*.md; do mv "$f" "${f#TEMPLATE-}"; done
cp constants.template.json constants.json
cd ..
git add -A && git commit -m "Rename templates for this athlete"
```

Leave `constants.json` mostly empty — intake fills it. `sex`, `dob`, `heightIn` and
`baseline.weightLb` are required by the validator, so the build will fail until intake
Session 6 has run. That is intended: an unvalidated chart should not deploy.

## 3. Run intake

Open the folder in Cowork or Claude Code and say **"Let's start the intake."**

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
