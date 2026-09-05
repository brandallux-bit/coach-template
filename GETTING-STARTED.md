# Getting started

**You do not need to know anything technical to set this up.** There is no code to write.
You will type two things into a Terminal window, and an AI does the rest while you watch.

Read this page once before you start. It takes about five minutes and will save you an
hour.

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
- **Three or four short conversations in the first week** to set it up. Not one long one.
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

**Nothing else.** No API keys, no database, no subscriptions beyond Claude. If any
instruction ever asks you to put in a credit card beyond your Claude plan, stop — you are
following the wrong instructions.

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

**Write your username down.** You will need it once, in about ten minutes.

> **What GitHub is, in one sentence:** a place that stores folders of files and remembers
> every version of every file forever. That is genuinely all you need to know. You will
> almost never visit the website.

> **Your chart will be private.** Nobody can see it but you. The setup checks this and
> stops if it is wrong.

---

## Step 2 — Let Claude install the rest (15 minutes, mostly waiting)

Here is where you would normally be asked to install developer tools. **You are not going
to do that.** Claude will.

1. **Unzip the starter folder** you were sent, if you have not already. Put it somewhere
   you can find it — your Desktop is fine.
2. **Open the Claude app.**
3. Start **Claude Code** and point it at that folder.
   - In the Claude desktop app, choose **Code**, then open the starter folder.
   - If it asks for permission to read the folder, say yes.
4. **Paste in exactly this, and press Enter:**

   > Read `Setup-Instructions-For-Claude.md` in this folder and set up my coach. My first
   > name is `_______`.

   Put your actual first name in the blank.

Then watch. It will explain what it is doing as it goes, and ask permission before
anything that changes your computer. **Say yes to those.**

### Two moments where it will stop and need you

It cannot do these two things for you, on purpose — both involve a password it must never
see.

**Your Mac password.** A tool called Homebrew asks for it. Type it into the Terminal
window. **The screen will not show anything as you type — no dots, no stars.** That is
normal and not broken. Type it and press Enter.

**A GitHub code.** It will show you an eight-character code like `A1B2-C3D4`, and open
your browser. Copy the code, paste it into the browser page, click through to approve.

That is the entire technical component. Everything else it handles.

### How you know it worked

It will run a check and show you something like:

```
check-all: 12 step(s) skipped — No athlete/constants.json — run intake first
check-all: all checks passed.
```

**"Skipped" is correct here and "all checks passed" is what matters.** The system is
installed and empty, waiting for you. It skips twelve checks because there is nothing
about you in it yet.

---

## Step 3 — Intake: the part that is actually about you (3–4 short sessions)

Now it finds out who you are. This is the most important thing you will do, and rushing it
produces a worse coach for months afterwards.

**Say this:**

> Let's start the intake.

### What to expect, so it does not feel wrong

**Session 1 ends without a plan.** It asks what you want, asks how you would know it had
happened, asks what you have tried before and what specifically ended it — then reflects it
back and stops. **It will not weigh you, name a calorie target, or propose anything.** That
is deliberate. It is finding out what you want *before* it names any categories, because
the moment it says the word "fat loss" it has started steering you.

**Do them on separate days.** Three or four sessions of 15–20 minutes, not one sitting of
an hour. People give honest answers in session one and performative answers in minute
forty. The coach will suggest stopping; let it.

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
| **5–6** | Your schedule, your baseline numbers, and the pushback you pre-authorise |

**Session 4 matters more than it sounds.** Any plan that works by deleting something you
love is a plan you will abandon in five weeks. It asks so it can design around those
things instead of against them.

**Session 6 asks you to write your own pushback rules** — the things you want to be held
to when you argue later. Write them yourself, in your own words. It is the file that does
the most work.

---

## Step 4 — Using it (every day, 15 minutes)

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

After that, if you want your numbers on your phone — charts, today's targets, a quick way
to log a meal without opening Claude — see **[DASHBOARD.md](DASHBOARD.md)**. It is a free
Vercel account and about twenty minutes.

**Do not do it before intake is finished.** It will not build, on purpose, and you will get
a failed-deployment email every time the coach saves something.

---

## If something goes wrong

See **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** — it covers the handful of things that
actually go wrong, with what to type.

The shortest version: **tell the coach.** Paste the error at it and say what you were
doing. It can read its own repair instructions and usually fixes it while you watch.

---

## Not medical advice

This is not a physician, dietitian, or physiotherapist, and it will say so when it
matters. It stops and refers you out for chest pain, fainting, unexplained shortness of
breath, an injury you cannot bear weight on, blood in stool or urine, and a short list of
others. **If it tells you to see a doctor, see a doctor.**
