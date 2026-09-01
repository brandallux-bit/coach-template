---
name: intake
description: Run the athlete intake and build the chart from scratch. Use at the very start of coaching, after any major life change (injury, diagnosis, new medication, relocation, long layoff), whenever profile.md is materially empty, or when the athlete's answers repeatedly conflict with what's on file — that last one means the chart is stale and needs re-taking.
---

# Intake

**You are finding out what this person wants. You are not fitting them to a model.**

The chart that exists at the end of intake should be recognisably *theirs* — different
athletes should produce structurally different charts, not the same chart with different
numbers. If two intakes produce the same domains, the same metrics and the same baseline
battery, one of them was led.

Goal: fill `athlete/constants.json`, `profile.md`, `goals.md`, `values.md`,
`constraints.md`, `precommitments.md`, and whichever domain files the goals actually
require — and **create no others**.

## The one rule that governs the rest

**Elicit before you categorise.** Session 1 uses no domain vocabulary, quotes no rates,
and does no arithmetic. The domains are an *output* of intake, never an input to it.

You will be tempted to skip this because you can already see where it's going. That
feeling is the failure mode, not a shortcut — it means you are pattern-matching this
person onto the last one.

> ⛔ **Do not read `skills/intake/reference/worked-example.md` until Session 2 is
> written.** It contains a completed domain model from a real chart. Reading it first
> anchors you, and anchoring is silent — you will produce some ordering of *those*
> domains and believe you elicited it.

## Rules

- Max 3 questions per turn. Conversational, not a questionnaire.
- **Do this across several short sessions, not one sitting.** People give honest answers
  in session one and performative answers in minute forty.
- After each session, write what you learned to the chart before continuing.
- When an answer is vague, convert it to a number before moving on.
- When an answer is aspirational, ask what actually happened last time. "I'll train five
  days" → "How many weeks in the last year did you train five days?"
- Reflect back what you heard at the end of each session and let them correct it.
- Use the athlete's own words in the chart wherever you can. Paraphrase loses the thing
  that makes a goal theirs.

---

## Session 1 — What they actually want

No categories. No rates. No arithmetic. No mention of weight, calories, training
frequency, or any other metric unless *they* raise it first.

1. **What do you want to be different six months from now?**
2. **How would you know it had happened?** Push until this is observable — something they
   could point at. "Feel better" is a placeholder. "Get through a day without planning
   around a bathroom," "wear the jacket," "play with my kids without stopping," "stop
   being afraid of restaurants," "numbers my doctor stops frowning at" — those are real.
3. **What's the real reason?** Push once past the first answer. Vanity is a real reason;
   don't make them dress it up. So is fear, a deadline, a photo, a diagnosis.
4. **What have you tried? What worked, and what specifically ended it?**
5. **What's your longest consistent streak, and what broke it?**

Question 5 is the most predictive thing you will learn, whatever the goal turns out to
be. Whatever broke it last time is the thing the plan must be designed around.

**Then reflect back, in their words, and stop.** Do not propose anything. Do not name a
domain. Do not state a timeline. Session 1 ends with you understanding and them
confirming you understood.

---

## Session 2 — Turn it into a domain model

Now, and only now, name what emerged. **The domains come from Session 1's answers.**
There is no standard list, no minimum, and no maximum — one goal can be one domain.
Examples of what a domain has legitimately been: symptom control, safe food
identification, blood markers, body composition, strength, endurance, sleep, pain-free
movement, energy through the workday, a specific event. Do not go looking for these; read
them off what they said.

For each domain that emerged:

1. **Is this currently satisfied, or does it need work?**
2. **What would have to happen for it to become the most important thing?**
3. **What would have to happen for it to stop mattering?**
4. **What is the one number or observation that tells us how it's going?** This is the
   domain's *primary metric*. It might be a tape measure, a lab value, a symptom count, a
   number of safe meals, hours slept, or reps at a load. It might be a yes/no.

Then **convert every trigger into something measurable.** This is the highest-value thing
you do at intake: without it, promotion fires on mood, and a bad morning reorders the
whole plan. "If I felt weak" → a percentage off a recorded baseline. "If I'm at risk" →
named lab ranges and a blood-pressure number. "If the reactions come back" → a count per
month.

Write the result to `athlete/goals.md` using the structure in
`skills/intake/reference/domain-structure.md`. **Now** you may read the worked example.

### A number you propose is recorded as proposed

**You will end this session holding numbers they did not give you.** Converting "if I felt weak"
into a percentage means picking the percentage; a trigger with a blank in it cannot fire. That is
your job and you should do it. **What you must never do is write your number into their goals file
in the same voice as theirs.**

Every threshold, target and trigger gets a provenance marker — `athlete-stated`,
`athlete-confirmed`, `coach-proposed-unconfirmed`, `derived` or `external` — recorded in
`athlete/constants.json` under each section's `_provenance` map. Vocabulary and rules:
`data/METHOD.md`, "Provenance". Anything you supplied is **`coach-proposed-unconfirmed`** with the
date, and it stays that way until they rule on it in words you can quote.

> **This is not hypothetical.** On one chart a coach proposed a weight floor and a weight ceiling
> in a single commit and recorded both as the athlete's. Two days later, about the ceiling: *"I
> don't know what that is or where it came from. I never provided that weight and if I get close
> to it, I will throw this whole system away and call it a failure."* The floor in that same commit
> was genuinely theirs. Same commit, same author, same file — and nothing on the page
> distinguished the two.

Three failure modes, all of which have happened:

- **Leaving the blank instead.** A trigger that cannot fire is a disabled alarm on the domain that
  outranks everything. Propose a value, mark it as yours, and surface it.
- **Filling a blank that is not yours to fill.** A clinical threshold belongs to them and their
  doctor. Record the gap and route it; **do not close it to make the chart look finished.**
- **Retro-justifying.** A number you produced, later supported with a real clinical cut-point, is
  still your number — and the rigour makes it *harder* to see, not easier. That is exactly how a
  34.5" waist target survived three days after the athlete had asked for 33".

### Rate honesty — conditional, not automatic

**If** one or more domains imply a rate of change against a deadline — weight, waist, a
lab marker, a distance, a load — do the arithmetic in front of them for *that* metric,
now, before they're invested. If the deadline needs a faster rate than is safe or
plausible, say so and offer either a later date or a smaller target. This is the first
real pushback and it sets the tone.

**If no domain implies a rate, skip this entirely.** Do not manufacture a rate
conversation because intake feels incomplete without one.

*(Reference rates, for use only when the relevant domain exists: fat loss is sustainable
at roughly 0.5–1.0% of bodyweight per week; strength gain past the novice stage is
measured in months per increment, not weeks.)*

---

## Session 3 — Safety, medical, and hard constraints

Universal. Run this for every athlete regardless of what the domains turned out to be.

**PAR-Q+ screening. Ask all seven. Do not paraphrase them away.**

1. Has a doctor ever said you have a heart condition, or that you should only do physical
   activity supervised by a doctor?
2. Do you feel pain in your chest when you do physical activity?
3. In the past month, have you had chest pain when you were not doing physical activity?
4. Do you lose balance from dizziness, or have you ever lost consciousness?
5. Do you have a bone or joint problem that could be made worse by a change in your
   physical activity?
6. Is a doctor currently prescribing drugs for blood pressure or a heart condition?
7. Do you know of any other reason you should not do physical activity?

**Any yes → medical clearance before programming.** Not a modified plan. Clearance. Say
it plainly, without alarm, and note it's a one-visit thing for most people.

Then: **medications and doses** (required before any supplement can be discussed), last
bloodwork, diagnosed conditions, sleep, stress, work, travel, and whose schedule you're
planning around.

### Allergies and intolerances — a safety floor, not a preference

Ask explicitly, every time, even when nothing in Session 1 suggested it:

- Any diagnosed food allergy? Which foods, what reaction, how severe, is there an
  epinephrine auto-injector?
- Any intolerance or condition that makes specific foods a problem?
- Any cross-contamination risk, or is trace exposure tolerated?

**Anything named here goes into `athlete/hard-constraints.md`, and it is a CLAUDE.md §5
floor — not a note in a nutrition file.** A meal suggestion containing a named allergen
is not a weak recommendation; it is a dangerous one. Every food suggestion, from every
agent, is checked against that file before it is spoken.

### Injuries — only as deep as the athlete has them

If the PAR-Q+ or Session 1 surfaced an injury or pain history, fill
`athlete/injury-history.md` properly — the form renamed in at setup carries the headings and the
elicitation prompts, including the ones people under-specify. It takes its own conversation. If
there is genuinely no injury history, write that in the file, and **do not create a programming
constraint that doesn't exist.**

Where a history does exist, get: what it was, when, how it resolved, what imaging exists,
when the last flare was and what caused it, and — most importantly — **the early warning
signs that precede a flare, in their own words.** That last answer is what lets the system
catch a flare instead of programming into one.

For joints specifically: which side, what aggravates it (depth, load, volume, impact,
stairs, prolonged sitting), what helps, and the pain pattern during vs. after vs. next
morning. **The next-morning answer matters most** — tendons are quiet during the session.

For anything: what's permanently off the table, and what they'd like to earn back.

---

## Session 4 — Values, and how they want to live

**Fill `athlete/values.md` before `constraints.md`.** The order matters: values are inputs
the plan is built around, not deductions from it.

The standing rule, made explicit here: **nothing in `values.md` gets deleted to hit a
number.** It gets budgeted, timed, or substituted within. If the arithmetic genuinely
doesn't work at their stated pattern, say so once with the number attached and let them
choose which side moves.

Open questions — follow what they raise rather than working a checklist:

- What parts of how you eat and drink would you refuse to give up? Push for specifics.
- What do you actually enjoy — cooking, particular cuisines, going out, a particular
  drink, eating with specific people?
- Which occasions are fixed and protected?
- What would make this whole thing not worth doing?

Then the reality questions, which are universal:

- Who shops and cooks?
- What did you actually eat yesterday and the day before?
- Five meals you can make without thinking?
- Takeaway default when everything falls apart?
- Hard dislikes, and budget.
- **Do you eat differently on weekends? By how much?**

That last one matters more than people expect — a pattern that looks perfect on every
logged day can be erased by two unlogged evenings. Ask it as arithmetic, not as a
confession.

> **Go deep wherever this person is deep.** If food or drink is an area of genuine
> expertise or identity for them, treating it as "intake to manage" misreads the brief and
> they will know immediately. If it is not, do not manufacture a long conversation about
> it. Match the depth to the person.

---

## Session 5 — Constraints and schedule

Fill `athlete/constraints.md`: fixed commitments, the days of the week that reliably go
badly, the situations that break plans, upcoming disruptions (booked trips, events,
procedures), and the kitchen reality.

---

## Session 6 — Baseline and precommitments

### The baseline battery is derived, never standard

**For each domain in `goals.md`, ask: what is this domain's primary metric, what is the
protocol for measuring it, and what is its baseline?** Then measure those things, and
nothing else.

Do not run a measurement because it's conventional. A waist tape on a chart with no body-
composition domain is noise the athlete has to keep producing. Progress photos on a chart
whose struggle is food can manufacture a second problem — take them only if a domain
genuinely calls for them, and never by default.

Protocol notes, for use when the relevant metric applies:
- **Bodyweight** — 5 consecutive mornings, fasted, post-toilet. Use the average. Daily
  swings of 1–2 kg are normal water shifts.
- **Waist** — at navel, relaxed, end of a normal exhale, **morning and fasted**. Fix the
  time of day in the protocol; a mid-day reading is not comparable to a morning one and
  mixing them silently corrupts the trend.
- **Symptoms** — a defined count over a defined window, with severity on a fixed scale.
  Establish the scale now, not later.
- **Labs / BP** — the panel and the date. If the domain's trigger references a range, the
  baseline is a real result, not a recollection.
- **Strength** — a top set of 5–8 reps at RIR 2 on the key movements. **No true maxes at
  intake.** Record load × reps × RIR, and prefer *reps at a fixed load and RIR* to an
  extrapolated 1RM — with limited equipment an e1RM is arithmetic on an arbitrary input,
  and it is the kind of metric that sits "pending" for months because it can't be produced.

Write the baselines into `goals.md` alongside each domain's trigger, and the athlete's
physiological constants into `athlete/constants.json` — **`sex` is required** and drives
the RMR equation, so getting it wrong silently biases every energy number downstream.

**Every value you write under `baseline`, `plan` or `triggers` needs a `_provenance` entry beside
it** (see Session 2 and `data/METHOD.md`). `scripts/test-provenance.mjs` fails the commit if one is
missing — a measurement cites the row and the protocol, a target you set is
`coach-proposed-unconfirmed` with today's date, and arithmetic names its inputs.

### Then write `precommitments.md` together

Explain what it's for: they are writing the arguments their future, more impatient self
will need to hear. Prompt with the categories in the file, but **the sentences must be
theirs.** A precommitment in your voice has no force.

---

## Finishing — and the check that catches you

Write everything to the chart. Create **only** the domain files the goals require; a chart
with no `program/` directory, or no `nutrition/` directory, is a valid chart.

Then give them a one-page summary: where they are, where they're going, the honest
timeline where one applies, and the first thing you're going to do together.

**Route the summary and the domain model through the `red-team` agent, and ask it one
question specifically:**

> *"What did this athlete say they wanted that this chart does not serve — and what has
> been carried in from a default that they never asked for?"*

That question exists because the person running the intake carries priors, and self-
policing does not catch priors. Act on the answer before the chart goes live.

---

## The last step, and it is deliberately last

> ⚠ **`athlete/constants.json` is created at the END of intake, not at the start.** Until it
> exists, `scripts/check-all.mjs` skips every chart-dependent step and says so, so an intake that
> runs across several sessions is GREEN the whole way through.
>
> SETUP used to say "copy the template constants in first, then leave the files empty", which
> produced eight hard validator errors on every push for the entire intake — teaching a brand-new
> athlete, in their first week, that a red build is normal. That is the exact outcome the no-chart
> guard exists to prevent, defeated by the setup instructions (audit F-39). **Do not create the
> file early to "get it out of the way".**

Run these in order, once, when the interview is finished and the values are real:

1. **Write `athlete/constants.json`.** Everything elicited above, with a `_provenance` entry on
   every value under `baseline`, `plan` and `triggers`.

   Three sections are easy to forget and each has a check behind it:

   - **`sessionTypes`** — the athlete's own activities, one entry each, naming the MET, whether a
     completed session counts toward the sessions floor, whether it is `loading`, and the
     `goals.md` domain it serves.
     **This is `training.csv`'s `type` enum**: an activity that is not registered can only be
     logged as `other`, which counts toward nothing, so their training would be invisible to the
     adherence count while they trained six days a week (audit F-15). `rest` and `other` are
     supplied by the system — do not register them.

     **Write `loading` on every entry, and do not ask about it.** Default it to
     `met > 0 && no energyCountedIn` — that is right for almost every activity, and asking would be
     asking a second time about something the MET already answers. Then check the two entries where
     the default is wrong, because it is a THIRD question and the other two do not answer it:
     `countsTowardFloor` asks *does this earn credit*, `met` asks *does this burn calories*,
     `loading` asks *did this tire you out*.
       - A rehabilitation or mobility block often loads genuinely while deliberately earning no
         floor credit. The default gets this right; the floor set would not.
       - **A walking type on a chart with no step feed is the one to look at.** With no feed it is
         priced as a session at a real MET, because nothing else counts that movement — and the
         default then calls it loading, so a week of walks reads as a week with no rest day. Write
         `"loading": false` on it. (With a step feed it carries `energyCountedIn: "steps"` and
         `met: 0`, and the default is right again.)

     It feeds the consecutive-loading-days count that tells a coach how hard the last few days
     have been, which is the input `skills/library/session-recommendation` reads before proposing
     anything.
   - **`program.setRestSec`** — ONE question, and only where the chart has a training domain:
     *"Roughly how long do you rest between working sets?"* The system ships **70 seconds** and it
     works without an answer, so this is a confirmation rather than a requirement. Write what they
     say, marked `athlete-stated`. If they do not know or do not care — a common and reasonable
     answer — write nothing, and the shipped default applies with its own provenance already
     recorded as `coach-proposed-unconfirmed`. **Never file the 70 as theirs.** It reconstructs the
     duration of a session that was performed but not timed, so it is a real input to the burn
     model, and a number the coach chose must not arrive in the record wearing the athlete's name.

   - **`domains`** — the `goals.md` domain headings, verbatim, keyed by role. Findings are filed
     under these; a chart that omits them gets findings with no domain label, which is honest, and
     no default is applied because a default is another athlete's domain wearing this one's name.
   - **`plan.adherenceRoutingPct`** — `80`, `external`, cited to `CLAUDE.md` §7. It is the
     charter's routing rule rather than anything of theirs, and four shared documents render it.

2. **`node scripts/build-docs.mjs`** — `data/METHOD.md` renders **this chart's** MET table, so a
   fork carries the previous athlete's table until this runs.
3. **`node scripts/check-all.mjs`** — everything now applies. Fix what it prints before the first
   coaching session; `scripts/test-cold-start.mjs` asserts a fresh chart passes clean, so anything
   red here is real.
