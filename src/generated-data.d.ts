/**
 * What `@/generated/data.json` is, for TypeScript.
 *
 * ⚠ **WHY AN AMBIENT DECLARATION AND NOT JUST THE FILE.** `src/generated/` is a build artifact and
 * is gitignored — `data/` is the source of truth and that JSON is a copy of it. So in a freshly
 * cloned repo the file does not exist, and `tsc --noEmit` failed to resolve the import at all:
 * `TS2307: Cannot find module '@/generated/data.json'`. That error says the repo has not been
 * built. It says nothing about whether the code is correct, which is the only question a
 * typecheck is being asked.
 *
 * It cannot be fixed by generating the file first, because on a chart-less repo it cannot be
 * generated: `npm run data` chains through `compute-energy.mjs`, which exits non-zero before
 * intake by design (its F-17 contract — an energy ledger with no weight, age or timezone is not
 * something it can produce, and saying so beats a plausible empty one).
 *
 * Declaring the module here is the better answer anyway, and would be even if the artifact were
 * committed. With `resolveJsonModule` alone, TypeScript infers the *literal* type of whichever
 * bundle was last written — so the code was only ever checked against its own most recent output,
 * and a generator that dropped a field produced a narrower type that every cast still satisfied.
 * `unknown` forces the crossing to be explicit and one-way: `src/lib/data.ts` narrows it to
 * `Bundle` exactly once, and `scripts/build-data-json.mjs` is what holds the generator to that
 * shape, with tests in `scripts/test-views.mjs`.
 *
 * This does NOT make the dashboard buildable before intake, and must not be read as trying to:
 * `scripts/check-chart-for-build.mjs` still refuses `prebuild` without a chart, deliberately.
 */
declare module '@/generated/data.json' {
  const bundle: unknown
  export default bundle
}
