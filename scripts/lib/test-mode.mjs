/**
 * Whether a suite may read the live chart — **off by default, and that is the fix** (audit F-30).
 *
 * THE DEFECT. Every suite in `scripts/` asserted on this athlete's live rows: *"the daily rehab
 * block appears on all 7 days"*, *"merge keeps the existing weight 179.4"*, *"the Daily block is
 * non-empty"*. On an empty chart that is **six failures across three suites, on the first push a
 * new athlete makes** — before they have done anything wrong, in a repo whose whole premise is that
 * a red build must mean something. A suite that cannot pass on a correct empty chart is not testing
 * the code; it is testing that this athlete exists.
 *
 * THE RULE THAT REPLACES IT, and it is not "delete the live assertions":
 *
 *   **Logic is asserted against fixtures. The live chart is only ever REPORTED on.**
 *
 * A fixture proves the code is right. Running the same code over the live chart proves *this
 * chart* is currently sound, which is a different claim with a different owner — and one that
 * closes by editing the athlete's record, which no test may demand. Where a live assertion carried
 * real power (`test-single-home`'s behavioural check, `check-suspensions`) it stays an assertion
 * and the whole check declares itself chart-dependent; see `scripts/check-all.mjs`.
 *
 * Turn it on with either:
 *
 *   node scripts/test-rowwrite.mjs --real
 *   COACH_REAL_DATA=1 node scripts/check-all.mjs
 *
 * ⚠ **`--real` is not a stricter mode, it is a WIDER one.** Everything it adds is a statement about
 * one chart's rows, so a failure there is a finding about the chart, not a defect in the code. Do
 * not move an assertion behind this flag to make it pass — that is how a suite quietly stops
 * covering the thing it is named after.
 */
export const REAL_DATA =
  process.argv.includes('--real') || process.env.COACH_REAL_DATA === '1'

/** One line, printed once per suite, so it is never a mystery which mode produced an output. */
export const modeBanner = (suite) =>
  `${suite}: ${REAL_DATA ? 'fixtures + live chart (--real)' : 'fixtures only (pass --real to add the live chart)'}`
