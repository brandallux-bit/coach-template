#!/usr/bin/env node
/**
 * **The dashboard cannot be built before intake, and this is where it says so.**
 *
 * Every view resolves an athlete — a name, a timezone, a baseline, a maintenance estimate — from
 * `athlete/constants.json`, and `src/lib/data.ts`'s `Plan` type declares those as required
 * because on a real chart they always are. Before intake the file does not exist, so the bundle
 * has none of them: every page would render `undefined` where the athlete should be.
 *
 * **The typecheck is no longer what catches this, and must not be relied on to.** It used to fail
 * with three casts' worth of TS2352 — accidentally, because TypeScript was inferring the shape of
 * whichever artifact was on disk rather than checking against a declared one. That is fixed
 * (`src/generated-data.d.ts`), so `tsc --noEmit` is now green on a chart-less repo, correctly:
 * the CODE is fine, there is simply no athlete. Refusing the build is this file's job alone.
 *
 * SETUP.md §5 already sequences this correctly — *"Dashboard — optional, and after intake... Do
 * this after intake, not before"* — so refusing here is the documented order enforced, not a new
 * restriction. What this replaces is the failure mode, which was a raw proxy throw out of
 * `compute-energy.mjs` mid-`prebuild` and, after that was guarded, a TypeScript error naming a
 * type nobody reading it had heard of.
 *
 * **This exits non-zero on purpose.** A Vercel import that happens before intake SHOULD fail: the
 * alternative is a deployed dashboard rendering TBD in every cell, which looks like a broken
 * chart rather than an absent one. Run intake, then deploy.
 *
 * The rest of `scripts/` deliberately does the opposite and skips gracefully — `check-all` must
 * stay green on a chart-less repo (`scripts/test-cold-start.mjs`, STATE A). That difference is the
 * point: validating nothing is a valid outcome, rendering an athlete who does not exist is not.
 */
import { hasChart, NO_CHART_MESSAGE } from './lib/athlete.mjs'

if (!hasChart) {
  console.error(`\ncannot build the dashboard — ${NO_CHART_MESSAGE}\n`)
  console.error('  The dashboard renders an athlete. Run intake first (SETUP.md §3), then')
  console.error('  deploy (SETUP.md §5). Everything else in scripts/ runs fine without a chart:')
  console.error('  `npm run validate` and `npm run check` are both green on this repo right now.\n')
  process.exit(1)
}
