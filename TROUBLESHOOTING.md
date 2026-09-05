# When something goes wrong

## Try this first

**Paste the error at the coach and say what you were doing.**

That is not a brush-off — it is genuinely the fastest path. The coach can read this file,
read its own repair instructions, run the diagnostics and usually fix the problem while you
watch. Everything below is here for the cases where you would rather understand it, or where
the coach itself is what is stuck.

---

## During setup

### `brew: command not found`

**Cause:** Homebrew finished installing and printed a **"Next steps"** section with two
`echo` commands. Those did not get run. This is the single most common failure in the whole
setup, and it always surfaces later than it happened.

**Fix:** scroll back up your Terminal window to find that section and run the two lines
exactly as printed, then open a fresh Terminal window. Or just tell the coach: *"brew is not
found — I think I skipped the Next steps commands."*

### The password prompt shows nothing when I type

**Not broken.** Terminal deliberately shows nothing for passwords — no dots, no stars, no
cursor movement. Type it and press Enter.

### `gh auth login` is asking me to make a token

You picked the wrong option. Press Ctrl-C to cancel and run it again, answering:
**GitHub.com** → **HTTPS** → **Y** → **Login with a web browser**. It should give you an
eight-character code, not ask you to create anything.

### "12 steps skipped"

**This is correct.** A fresh chart skips every check that needs to know who you are, and
names the reason: *no `athlete/constants.json` — run intake first*. The line that matters is
the last one:

```
check-all: all checks passed.
```

Those skips turn into real checks as intake fills the chart in.

### It says I already have a chart

Setup has already run in this folder. If you want to start over, do not delete anything —
tell the coach *"I want to re-run intake"* and let it handle it. Deleting the folder loses
your history, which is the one thing that cannot be rebuilt.

---

## Day to day

### The coach did not save something

Ask directly: *"Did that get committed and pushed?"*

The charter requires it to save after **every** number, immediately, rather than batching to
the end of a session. If it did not, it will find and fix it. If it says it could not reach
GitHub, you were probably offline — say so and ask it to push now.

### It is asking me something it already knows

Tell it. *"That is already in my chart — read it instead of asking."*

The charter forbids asking a question the chart answers, so this is a real bug and worth
reporting rather than answering politely. Answering trains it to keep doing it.

### I logged something this morning and the dashboard does not show it

Usually one of two things.

**The page is cached.** Pull to refresh on your phone.

**Your data went to a side branch instead of the main one.** Some surfaces do this. The
dashboard shows a loud banner across every page when it happens, so check the top of the
screen. The fix is to start a coaching session and say *"Sync my chart"* — the coach finds
stray branches, merges them and deletes them before doing anything else.

To make that automatic, ask the coach: *"Turn on stray-branch absorption."* It ships off by
default because auto-merging every pushed branch is only safe on a personal chart — which
yours is.

### It is being agreeable and it should not be

Say so: *"You are agreeing with me. What is the strongest argument against this?"*

Every plan is supposed to ship with its own counterargument, a confidence level, and the
conditions under which it falls apart. If those are missing, ask for them.

### It told me to see a doctor

**See a doctor.** It does not do this casually — there is a specific list of things that
stop the programming conversation outright, and it will not offer you a modified session
instead. Do not try to talk it round.

---

## The dashboard

### The build failed

Open the deployment in Vercel and read the red text.

**`cannot build the dashboard — No athlete/constants.json`** — intake is not finished. This
is on purpose: a dashboard rendering TBD in every cell looks broken rather than empty.
Finish intake, then **Redeploy**.

**Anything else** — copy the whole error and paste it to the coach.

### I get a failed-deployment email several times a day

You connected Vercel before finishing intake. Every time the coach saves a number, Vercel
tries to rebuild and fails.

**Fix:** finish intake, then redeploy. Or, in Vercel → Settings → Git, pause the project
until you are done.

### I cannot sign in

Both `DASHBOARD_PASSWORD` and `AUTH_SECRET` must be set in Vercel, for **Production** *and*
**Preview**, and **you must redeploy after adding them.** Environment variables do not reach
a site that is already built.

If either is missing the dashboard refuses everyone, deliberately — it fails closed.

### The Log tab buttons are greyed out

`GITHUB_REPO` and `GITHUB_TOKEN` are not set. See [DASHBOARD.md](DASHBOARD.md) step 4. This
is the designed behaviour rather than a fault: it disables the buttons instead of accepting
a meal and silently dropping it.

### Logging worked and then stopped

**Your token expired.** Fine-grained tokens have a hard expiry and nothing warns you first.
Make a new one the same way, update `GITHUB_TOKEN` in Vercel, redeploy.

### My repo is not in Vercel's list

Click **Adjust GitHub App Permissions** on the import page and grant Vercel access to it.
Private repositories stay hidden until you do.

---

## Bigger problems

### My repo is public and it should be private

Fix it now, then assume what was in it was seen.

GitHub → your repo → **Settings** → scroll to **Danger Zone** → **Change repository
visibility** → **Make private**.

### I got a new Mac / I deleted the folder

Your chart is safe on GitHub. Nothing was lost as long as the coach was saving, which it
does after every number.

Install the Claude app, then open Terminal and tell Claude Code:

> Clone my coach repo `yourusername/yourname-coach` into `~/Documents` and check it.

### Everything is broken and I want to start over

**Do not delete the repository.** Your history is the whole value of the system — it is what
lets the coach tell you what actually changed over six weeks.

Tell the coach what is wrong and that you are considering starting over. Re-running intake
keeps every logged number and only rebuilds the parts about you, which is almost always what
you actually want.

---

## Reading the checks yourself

If you want to see the state of things:

```bash
npm run check
```

Green with skips is healthy. Red names the file and the row.

```bash
npm run validate
```

Just the data check — faster, and the one that catches a malformed row.

**A red check is a stop sign, not a suggestion.** The coach is required not to save past
one. If it offers to, that is a bug worth telling us about.
