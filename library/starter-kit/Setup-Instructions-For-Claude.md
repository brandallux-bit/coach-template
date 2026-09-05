# Setup instructions — for Claude Code

**You are talking to someone who is not technical and has never done this before.** They
were sent this folder by a friend. Explain what you are doing in plain language as you go,
and do not assume they know what a repository, a remote or a commit is.

## What this file is, and what it is not

This is a **bootstrap**. It creates the chart and then **hands over to the real
procedure**, which ships inside the chart at `skills/setup/SKILL.md`.

**Do not treat this file as the whole procedure.** It deliberately stops early. The steps
after the clone — the athlete's own repo, the blank files, the checks, and the several
things that must *not* be done yet — live in that skill, are maintained there, and this
copy would rot. Where the two disagree, the skill is right.

> ### ⛔ You cannot install anything, and you must not try
>
> Homebrew asks for the Mac login password and `gh auth login` is an arrow-key menu. **A
> command you run has no terminal attached, so neither prompt has anywhere for the athlete
> to answer.** Running them does not produce a prompt they can see — it hangs, or fails
> with `sudo: a terminal is required to read the password`.
>
> `GETTING-STARTED.md` step 2 has them do this themselves in Terminal, before they ever
> open you. **If a tool below is missing, that step was skipped — send them back to it.
> Never paste the Homebrew or `gh auth login` command into a command of your own.**

---

## 1. Confirm the tools are there

```bash
git --version && node --version && gh auth status
```

Two version numbers and a line saying they are logged in to GitHub → go to §2.

**Anything missing or not-logged-in → stop.** Tell them plainly which one, and send them
back to **step 2 of `1-Getting-Started.md`** in this folder, which walks through it in
Terminal. Say which of 2.2, 2.3 or 2.4 they need:

- `git` or `node` missing → 2.2 and 2.3 (Homebrew, then `brew install gh node`)
- `gh` missing → 2.3
- `gh auth status` says not logged in → 2.4 (`gh auth login`)

Wait for them to come back and re-run this check. **Do not work around it** — every step
below needs these.

## 2. Their first name

It is in the sentence they pasted; ask only if it is not there. Lower case. It names the folder
and the repo — `jane-coach`. **That is the only question this bootstrap may ask.**

⛔ **Do not ask them anything about goals, weight, training, diet, or injuries — and do not
accept it if they volunteer it.** Write it down for later and say you will get to it
properly. The entire design depends on those being elicited at intake, before any category
is named. Answers given during a software install are answers to a different question.

## 3. Create the chart

Replace `NAME` with their first name in both commands. Run them from the starter folder — the
folder this session has open, where `TEMPLATE-URL` sits — and note that the chart itself is
named by full path, so nothing here depends on a `cd` from an earlier command.

```bash
git clone "$(cat TEMPLATE-URL)" ~/NAME-coach
git -C ~/NAME-coach remote rename origin upstream
```

`~/NAME-coach` is directly under their home folder, deliberately not `~/Documents`: on a Mac
with iCloud's *Desktop & Documents* sync on, a git repository in `~/Documents` is a well-known
source of evicted files and a corrupted index.

`TEMPLATE-URL` sits beside this file in the starter folder and is the only place the template's
address is written down — the same file ships inside the chart at
`library/starter-kit/TEMPLATE-URL`, so the two can never disagree about where updates come from.

> ⛔ **Never delete the `.git` folder.** With no shared history this chart can never receive
> a system fix again — `git pull upstream main` fails permanently with *refusing to merge
> unrelated histories*. Keep it.

## 4. Hand the session over, and stop

⛔ **Everything from here runs in the new folder, and this session cannot do it.**

The chart carries `CLAUDE.md` — the charter that governs every coaching session, including
intake. **It only loads when the chart is the folder Claude Code has open**, and right now
you are open on the starter folder. Continuing from here would run the most important
conversation in the system with none of its rules loaded: no sync protocol, no question
limit, no safety floors.

So tell them, in your own words:

> Your chart is built, at `~/NAME-coach`.
>
> Setup finishes in that folder, not this one. Close this session, open Claude Code on
> `~/NAME-coach`, and say: **continue my setup**.
>
> You can throw this starter folder away afterwards.

Then stop. **Do not run `npm run check`, do not create their GitHub repo, and do not start
intake** — `skills/setup/SKILL.md` §3 onward does all of it, from inside the chart, where
the charter is loaded. It knows it is resuming and picks up from what is already done.
