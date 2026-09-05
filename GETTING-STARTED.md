# Getting started

**You do not need to know anything technical, and you need a Mac.** There is no code to write.
There are four commands to copy and paste, and an AI does everything after that while you watch.

Read this page once before you start. Five minutes now saves an hour later.

---

## What this actually is

A coach that remembers everything.

It lives in a folder of plain text files on your Mac. Every meal, every set, every
weigh-in gets written down. Before it says anything to you it reads the whole history
first — so it argues from your record rather than from generic advice, and it can tell you
what actually changed over six weeks instead of guessing.

**It is not a chatbot with a fitness personality.** It is designed to push back on you. If
you ask to move faster than is safe it will name the cost in weeks and kilos, offer two
alternatives, and quote your own words back at you. That is the point of it.

### What you are signing up for

Be honest with yourself about this before you spend an afternoon on it:

- **About 15 minutes a day**, most of it logging what you ate.
- **A 20-minute check-in once a week**, same day each week.
- **Five or six short conversations to set it up**, on separate days. Not one long one.
- **Telling it the truth**, including the days that went badly. A coach with a flattering
  record is worse than no coach — the whole value is that the history is real.

If you are not going to log daily, this will not work and nothing in the setup will fix
that. It is the one thing that matters most.

### What it costs

| | | |
|---|---|---|
| **Claude** | Paid plan, Pro or higher | You are probably paying this already |
| **GitHub** | Free forever | Stores your files privately and backs them up |
| **Vercel** | Free forever | *Optional.* A web dashboard. Skip it for now. |

**No paid services beyond Claude.** No database, no subscriptions, nothing metered. Later
on, the optional dashboard uses one free GitHub key — that is the only key in the system,
and it only touches your own files.

### One thing to do before you start

**Get a physical and baseline bloodwork.** This system is not a doctor, and it will tell
you so when it matters. It has referral triggers built in and it will use them, but it
cannot see you.

---

## Step 1 — Your accounts (10 minutes)

### Claude

You need the **desktop app**, signed in to a **paid plan**.

1. Go to **[claude.ai/download](https://claude.ai/download)** and install it.
2. Sign in. If you are on the free plan, upgrade to **Pro** in Settings.

> **Why paid:** the free tier cannot open files on your Mac, and this whole system is a
> folder of files. The web version in your browser cannot either — it has to be the app.

### GitHub

This is where your chart lives, privately, backed up.

1. Go to **[github.com/signup](https://github.com/signup)**.
2. Enter your email, a password, and pick a username.
3. Choose the **Free** plan when offered.
4. Verify the email they send you.

**Write your username down** — you will need it if you add the dashboard later.

> **What GitHub is, in one sentence:** a place that stores folders of files and remembers
> every version of every file forever. That is genuinely all you need to know. You will
> almost never visit the website.

> **Your chart will be private.** Nobody can see it but you. The setup checks this and
> stops if it is wrong.

---

## Step 2 — Four commands (15 minutes, mostly waiting)

These install the tools your coach needs. **You paste them; you do not have to understand
them.**

### Open Terminal

Press **⌘-Space**, type **Terminal**, press **Enter**. A window with text in it opens.
That is Terminal. You will paste four things into it, pressing Enter after each, and wait
for each to finish before starting the next.

> **Why you and not the AI?** Two of these ask for a password. Claude runs commands in a
> way that has nowhere for you to type a reply, so a password prompt would simply hang with
> no way to answer it. Anything that can be done without a password, Claude does — which is
> everything from Step 3 onward.

### 2.1 — What is already installed?

Paste this and press Enter:

```bash
for c in git gh node; do printf '%s: ' "$c"; $c --version >/dev/null 2>&1 && echo ok || echo MISSING; done
```

> **A window may appear offering to install "command line developer tools".** Click
> **Install**, wait for it to finish, then run the command above again. That is macOS
> noticing you do not have the basics yet.

**If all three say `ok`, skip ahead to 2.4.** Otherwise carry on.

### 2.2 — Homebrew

Homebrew installs the other tools. Paste this:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

⛔ **It asks for your Mac login password.** As you type it, **nothing appears on screen —
no dots, no stars, no cursor movement.** That is normal and it is not broken. Type it and
press Enter.

⚠ **When it finishes it prints a short "Next steps" section containing two commands
starting with `echo`. Run those two, exactly as printed.** This is the step people skip,
and skipping it breaks the next command with a confusing message about `brew` not being
found. Then **close Terminal and open a new one** (⌘-Space → Terminal → Enter).

### 2.3 — The tools themselves

```bash
brew install gh node
```

A few minutes of scrolling text. `gh` talks to GitHub; `node` runs the checks your coach
does every time it writes a number.

### 2.4 — Sign in to GitHub

```bash
gh auth login
```

This asks you four short questions using the **arrow keys and Enter**. Answer:

1. **GitHub.com**
2. **HTTPS**
3. **Yes** (authenticate Git with your GitHub credentials)
4. **Login with a web browser**

It then shows an eight-character code like `A1B2-C3D4`. **Copy it**, press Enter, and your
browser opens. Paste the code there and approve.

> If it ever offers to paste an authentication token instead, press Ctrl-C and start this
> command again — you picked the wrong option.

### Check it worked

```bash
git --version && node --version && gh auth status
```

Two version numbers and a line saying you are logged in. **You are done with Terminal** —
leave the window open, but you will not need to type in it again.

---

## Step 3 — Let Claude build your chart (5 minutes)

1. **Unzip the starter folder** you were sent, if you have not already. Your Desktop is
   fine.
2. **Open the Claude app** and choose the **Code** tab — not Chat, and not Cowork. Cowork can
   read your files but cannot save your chart, and nothing on screen will tell you it didn't.
3. **Point it at that starter folder.** If it asks permission to read the folder, say yes.
4. **Paste in exactly this, and press Enter:**

   > Read `Setup-Instructions-For-Claude.md` in this folder and set up my coach. My first
   > name is `_______`.

   Put your actual first name in the blank.

It will explain each step as it goes and ask permission before anything that changes your
computer. **Read what it says before approving.** If it asks for something it has not
explained, say no and ask why.

### It will ask you to move to a new folder

When it finishes it will have created your chart at **`~/yourname-coach`** — a folder called
`yourname-coach` directly inside your home folder — and
will tell you to open Claude Code there instead.

**Do that — it matters.** Your chart folder contains the rules your coach runs on, and
those only load when it is the folder you have open. Close the starter session, open Claude
Code on `~/yourname-coach`, and say:

> Continue my setup.

You can throw the starter folder away after this. Everything now lives in your chart.

---

## Step 4 — Intake: the part that is actually about you (5–6 short sessions)

Now it finds out who you are. This is the most important thing you will do, and rushing it
produces a worse coach for months afterwards.

It usually starts on its own once setup finishes. If it has not, **say this:**

> Let's start the intake.

### What to expect, so it does not feel wrong

**Session 1 ends without a plan.** It asks what you want, asks how you would know it had
happened, asks what you have tried before and what specifically ended it — then reflects it
back and stops. **It will not weigh you, name a calorie target, or propose anything.** That
is deliberate. It is finding out what you want *before* it names any categories, because
the moment it says the words "fat loss" it has started steering you.

**Do them on separate days.** Five or six sessions of 15–20 minutes, not one sitting.
People give honest answers in session one and performative answers in minute forty. The
coach will suggest stopping; let it.

**Answer as yourself, not as the person you plan to become.** When it asks how many days a
week you will train, it wants the number you actually managed last year. It is designing
around your real life, and it can only do that if it knows what your real life is.

**Nobody else answers for you.** If a friend set this up for you, their part is finished.

### Roughly what the sessions cover

| | |
|---|---|
| **1** | What you want, and how you would know it happened |
| **2** | Turning that into the things this coach will actually track |
| **3** | Safety — medical history, allergies, injuries |
| **4** | How you want to live while doing this. Wine, restaurants, whatever it is. |
| **5** | Your schedule and what gets in the way |
| **6** | Your baseline numbers, and the pushback you pre-authorise |

**Session 4 matters more than it sounds.** Any plan that works by deleting something you
love is a plan you will abandon in five weeks. It asks so it can design around those
things instead of against them.

**Session 6 asks you to write your own pushback rules** — the things you want to be held
to when you argue later. Write them yourself, in your own words. It is the file that does
the most work.

---

## Step 5 — Using it (every day, 15 minutes)

**Open the app, go to your chart folder, and talk to it.** That is the whole interface.

Things worth saying:

| | |
|---|---|
| "Chicken and rice, about 600 calories." | Logs a meal |
| "Weighed 184.2 this morning." | Logs a weigh-in |
| "What should I train today?" | Reads your last three days first, then answers |
| "Done — 3 sets of 8 at 135, felt like 2 in reserve." | Logs the session |
| "Weekly check-in." | The 20-minute review |
| "I want to add a fourth training day." | Expect an argument |

It writes everything down and saves it as you go. You do not need to save, sync, or
remember to close anything.

### The three habits that decide whether this works

**Log every day.** Thirty seconds is enough. A coach with no data is a search engine with
opinions.

**Log the bad days too.** The day you ate the whole thing is the most useful day in the
record, because it is the one that shows the pattern.

**Do the weekly review, same day every week.** Put it in your calendar now. Most weeks the
honest answer is "keep going, change nothing" — and hearing that from something that
actually looked is worth the twenty minutes.

### One more, for later

**Tell it when your life changes.** New job, injury, a diagnosis, a move. Everything it
does reads from what you told it at intake, and a stale answer is the one failure it
cannot detect on its own.

---

## What is next

**Give it two weeks first.** Get the daily logging habit before adding anything.

After that, if you want your numbers on your phone — charts, today's targets, your history
in one place — see **[the dashboard guide](DASHBOARD.md)**. It is a free Vercel account and about
twenty minutes.

**Do not do it before intake is finished.** It will not build, on purpose, and you will get
a failed-deployment email every time the coach saves something.

---

## If something goes wrong

See **[the troubleshooting guide](TROUBLESHOOTING.md)** — it covers the handful of things that
actually go wrong, with what to type.

The shortest version: **tell the coach.** Paste the error at it and say what you were
doing. It can read its own repair instructions and usually fixes it while you watch.

---

## Not medical advice

This is not a physician, dietitian, or physiotherapist, and it will say so when it
matters. It stops and refers you out for chest pain, fainting, unexplained shortness of
breath, an injury you cannot bear weight on, blood in stool or urine, and a short list of
others. **If it tells you to see a doctor, see a doctor.**
