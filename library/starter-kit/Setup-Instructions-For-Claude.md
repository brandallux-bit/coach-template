# Setup instructions — for Claude Code

**You are talking to someone who is not technical and has never done this before.** They
were sent this folder by a friend. Explain what you are doing in plain language as you go,
and do not assume they know what a repository, a remote or a commit is.

## What this file is, and what it is not

This is a **bootstrap**. It gets the template onto their Mac and then **hands over to the
real procedure**, which ships inside the template at `skills/setup/SKILL.md`.

**Do not treat this file as the whole procedure.** It deliberately stops early. The steps
after the clone — creating their repo, renaming the blank files, the checks, and the
several things that must *not* be done yet — live in the skill, are maintained there, and
this copy would rot. Where the two disagree, the skill is right.

---

## 1. Preflight

```bash
for c in git gh node brew; do printf "%s: %s\n" "$c" "$(command -v $c >/dev/null 2>&1 && $c --version 2>&1 | head -1 || echo MISSING)"; done
```

All four present → go to §2.

### If anything is MISSING

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

⛔ **STOP HERE AND HAND OVER.** This asks for their **Mac login password**, which you must
never type or see. Tell them:

> Type your Mac password into the Terminal window. **Nothing will appear as you type — no
> dots, no stars.** That is normal. Press Enter when done.

**When it finishes it prints a "Next steps" section with two `echo` commands. Run exactly
what it printed.** Skipping them is the most common failure in this whole setup, and the
symptom — `brew: command not found` — appears several steps later, far from its cause. Then
have them open a fresh Terminal window.

```bash
brew install gh node
```

**`node` is not optional.** It runs the validator and the energy model, which the coach uses
every time it writes a number.

Verify — three version numbers means ready:

```bash
git --version && gh --version && node --version
```

## 2. Sign them in to GitHub

```bash
gh auth login
```

Answer: **GitHub.com** → **HTTPS** → **Y** → **Login with a web browser**.

⛔ **STOP HERE AND HAND OVER.** It prints an eight-character code and opens their browser.
Read them the code, tell them to press Return, paste it in the browser and approve. You
cannot approve it for them.

If it ever offers to create a personal access token instead, back out — wrong option.

Confirm with `gh auth status` before continuing.

## 3. Ask for their first name

Lower case. It names the folder and the repo — `jane-coach`. **That is the only question
this bootstrap needs.**

⛔ **Do not ask them anything about goals, weight, training, diet, or injuries — and do not
accept it if they volunteer it.** Write it down for later and say you will get to it
properly. The entire design depends on those being elicited at intake, before any category
is named. Answers given during a software install are answers to a different question.

## 4. Clone the template

```bash
cd ~/Documents
git clone https://github.com/brandallux-bit/coach-template.git NAME-coach
cd NAME-coach
git remote rename origin upstream
```

> ⛔ **Never delete the `.git` folder.** With no shared history this chart can never receive
> a system fix again — `git pull upstream main` fails permanently with *refusing to merge
> unrelated histories*. Keep it.

## 5. Hand over to the real procedure

**Read `skills/setup/SKILL.md` in the folder you just cloned, and follow it from §3
onward.** It covers creating their private repo, renaming the blank athlete files, the
verification step, and — importantly — the several things that look like sensible setup and
must not be done yet.

Then it hands you to `skills/intake`, which is where the coaching actually starts.
