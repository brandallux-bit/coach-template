# The dashboard — your numbers on your phone

Optional. Free. About 20 minutes.

The dashboard is a private website showing your chart: today's targets, your weight trend,
what you are training, what you have eaten. It also has a **Log** tab so you can record a
meal from your phone without opening Claude.

---

## ⛔ Before you start — two conditions

**1. Intake must be finished.** The dashboard renders *you*, so it refuses to build until
there is a you to render. If you connect it early you will get a failed-deployment email
**every time the coach saves a number** — which is several times a day. The failure is
deliberate and the message says so, but it is a miserable first week.

Check by asking the coach: *"Is intake complete?"*

**2. Give the daily logging habit two weeks first.** The dashboard is a nicer way to look
at data you already have. It will not create the habit, and building it early is a
satisfying way to avoid starting.

---

## Step 1 — A free Vercel account (3 minutes)

Vercel is the service that turns your chart into a website. The free tier is enough
forever — this is one small site with one visitor.

1. Go to **[vercel.com/signup](https://vercel.com/signup)**.
2. Choose **Continue with GitHub**. Use the GitHub account you set up earlier — this
   matters, it is how Vercel finds your chart.
3. Authorise Vercel when GitHub asks.
4. Pick the **Hobby** plan. It is the free one. If it asks what you are working on, say
   personal.

> **You will not be asked for a card.** If you are, you have selected Pro — go back and
> choose Hobby.

---

## Step 2 — Two secrets, made now (2 minutes)

You need two values before you start the import. Get them ready first — the import form
asks for them and it is annoying to go hunting mid-flow.

**A password.** Whatever you want to type to get into your dashboard. Make it a real one:
this page shows your weight, your medical notes and your food. Put it in your password
manager now.

**A long random string.** This signs your login cookie. Ask the coach:

> Generate an AUTH_SECRET for me.

Or run this in Terminal yourself and copy the output:

```bash
openssl rand -hex 32
```

You get 64 characters of hex. That is the value. You never type it again — paste it and
forget it.

> **Neither of these may be blank.** The dashboard refuses every sign-in unless both are
> set. It fails closed, never open — a blank that locks you out is a good outcome, a
> working password everyone knows is not.

---

## Step 3 — Import your chart (5 minutes)

1. Go to **[vercel.com/new](https://vercel.com/new)**.
2. Find your `yourname-coach` repository and click **Import**.

   > **Not listed?** Click **Adjust GitHub App Permissions** (or **Configure GitHub App**),
   > then grant Vercel access to that repository. Private repos are hidden until you do.
   > Come back to `vercel.com/new` afterwards.

3. **Root Directory:** leave it as `./`. Do not change it.
4. **Framework Preset:** it should detect **Next.js** on its own. Leave it.
5. Open **Environment Variables** and fill in the two below. Vercel pre-fills some names
   from the repo with empty values; you are supplying the values.
6. Click **Deploy**, and wait two or three minutes.

| Name | Value |
|---|---|
| `DASHBOARD_PASSWORD` | the password you chose |
| `AUTH_SECRET` | the 64-character string |

**Tick both for Production *and* Preview.** A variable set for only one of them is the most
common reason sign-in works in one place and fails in another.

You get a URL like `yourname-coach.vercel.app`. Open it, enter your password. That is your
dashboard.

**Put it on your phone's home screen.** In Safari: Share → Add to Home Screen. It behaves
like an app after that, and it is the difference between using this and not.

### If the build fails

Open the deployment and read the red text. Almost always it says:

```
cannot build the dashboard — No athlete/constants.json — run intake first
```

That is condition 1 above. Finish intake, then in Vercel click **Redeploy**.

For anything else, copy the error and paste it to the coach.

---

## Step 4 — Logging from the dashboard (10 minutes, and genuinely optional)

Everything above is **read-only** and it works now. This step turns on the **Log** tab so
you can record meals and sets from your phone.

**Skip it if you do not want it.** Without it the Log tab still appears, but its buttons
are disabled with a banner saying logging is not configured. Nothing breaks and nothing
pretends to have saved.

### Why this step exists at all

The website has no database. **Your repository is the database.** So when you log a meal
from your phone, the page writes the row directly into your chart on GitHub — the same way
the coach does, checked by the same validator. That write needs its own key.

### Make the key

This is the fiddliest screen in the whole system. Follow it exactly.

1. On GitHub, click your avatar (top right) → **Settings**.
2. Scroll to the very bottom of the left sidebar → **Developer settings**.
3. **Personal access tokens** → **Fine-grained tokens**.
4. **Generate new token**.
5. Fill in:
   - **Token name:** `coach-dashboard`
   - **Expiration:** 1 year. Put a reminder in your calendar — when it expires, logging
     stops working and nothing warns you first.
   - **Repository access:** choose **Only select repositories**, then pick
     **`yourname-coach`**. Only that one.
   - **Permissions** → **Repository permissions** → find **Contents** → set it to
     **Read and write**.

     > **Contents, and nothing else.** This key can rewrite your entire chart. Leave every
     > other permission alone.

6. **Generate token**, then **copy it immediately** — it starts `github_pat_` and GitHub
   will never show it to you again. If you lose it, delete it and make another.

### Add it to Vercel

1. In Vercel: your project → **Settings** → **Environment Variables**.
2. Add the two below, both ticked for **Production** and **Preview**.
3. Go to **Deployments**, open the most recent, and click **Redeploy**.

| Name | Value |
|---|---|
| `GITHUB_REPO` | `yourusername/yourname-coach` |
| `GITHUB_TOKEN` | the `github_pat_...` value you just copied |

> **Environment variables do not apply to a site that is already built.** Skipping the
> redeploy in step 3 is why this most often appears not to have worked.

Open the Log tab. The buttons should be live.

---

## How it stays up to date

You do not refresh it and there is nothing to sync.

Every time the coach writes a number it saves to GitHub, and every save rebuilds the
dashboard automatically. There is also a job that runs each night to roll the chart into a
new day. So it updates several times a day on its own.

**This means the dashboard is only as current as your last logged item** — which is another
argument for logging as you go rather than reconstructing your day at bedtime.

---

## What each page shows

| | |
|---|---|
| **Goals & Progress** | Your domains, where each one stands, what is trending |
| **Today** | Today's targets, what is prescribed, what you have logged so far |
| **Next 7 Days** | What is coming, and the projection |
| **Log** | Record a meal, a set, a weigh-in |
| **History** | The record, back to day one |

Which pages are useful depends on what your intake produced. A chart that does not track
training has a thin Today page, and that is correct rather than broken.

---

## Security, briefly

- **The repo is private.** Only you can see it.
- **The dashboard needs your password**, and refuses everyone if either secret is missing.
- **The URL is guessable.** `yourname-coach.vercel.app` is not a secret — the password is
  the thing protecting it, so make it a real one.
- **Rotating `AUTH_SECRET` signs every device out.** That is your panic button if you ever
  lose a phone: change it in Vercel, redeploy, done.
