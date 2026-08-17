import { bundledFindings, daysBetween, generatedAt, today, type Finding } from './data'

/**
 * The findings a PAGE renders — the ones computed at build time, plus the one that can only be
 * computed at request time.
 *
 * WHY THERE IS A SECOND LAYER AT ALL. `scripts/lib/findings.mjs` is pure and runs at build time,
 * which is right for everything derived from `data/`. It cannot compute build freshness, because
 * at build time the answer is always "fresh". Comparing "when was this built" against "what day is
 * it now" needs two clocks, and only a request has both.
 *
 * Everything else about this module follows the same contract as the build-time layer: it reports,
 * it never blocks, and it never tells the athlete what to do.
 */

/**
 * How stale the bundle has to be before it is worth saying, and before it is the most important
 * thing on the page.
 *
 * ONE DAY IS NOT AN ALARM, DELIBERATELY. `daily-rollover.yml` pushes at 09:00 UTC, which is
 * 01:00–02:00 athlete-local, and each push triggers a redeploy. So between local midnight and that
 * push the newest build is legitimately stamped yesterday, every single night. Firing at one day
 * would put a red banner on the page for two hours a day forever, and an alarm that is wrong every
 * night is one nobody reads — which is precisely how F-45's stray-branch banner failed.
 *
 * TWO DAYS MEANS SOMETHING IS ACTUALLY STUCK, and it is critical rather than attention because of
 * what it does to the rest of the page: every number under today's date is from a previous day,
 * and nothing about them looks wrong. That is F-26's dangerous half — a failed deploy leaves the
 * PREVIOUS deployment live and serving, with no error anywhere the athlete can see.
 */
const STALE_ATTENTION_DAYS = 1
const STALE_CRITICAL_DAYS = 2

/**
 * The build-freshness finding, or null when the bundle is current.
 *
 * Pure and exported so it can be fixtured: `scripts/test-views.mjs` mirrors it and asserts a
 * stale stamp produces a finding. A check that cannot fail certifies the bug (INVARIANTS.md X-10).
 */
export function buildFreshness(generatedLocalDate: string, now: string): Finding | null {
  if (!generatedLocalDate || !now) return null
  const behind = daysBetween(generatedLocalDate, now)
  if (!Number.isFinite(behind) || behind < STALE_ATTENTION_DAYS) return null

  const critical = behind >= STALE_CRITICAL_DAYS
  return {
    id: 'build-stale',
    severity: critical ? 'critical' : 'attention',
    headline: critical
      ? `Every number on this page is ${behind} days old. The page was built ${generatedLocalDate}; today is ${now}.`
      : `This page was built ${generatedLocalDate} and today is ${now}, so its numbers are a day behind.`,
    detail:
      'The date at the top of each page is read live, but the figures under it come from the '
      + 'bundle built at deploy time. When a deploy fails, the previous deployment stays live and '
      + 'keeps serving — so nothing looks wrong, it is just old. '
      + (critical
        ? 'Two days means something is genuinely stuck: a failed build, a workflow that stopped '
          + 'pushing, or a deploy that never ran.'
        : 'One day is normal for the hours between local midnight and the daily rollover push, '
          + 'and this will clear itself if that is all it is.'),
    action:
      'Nothing on this page can be trusted as current until it clears. Check the most recent '
      + 'deploy and the most recent commit on main — if the commit is newer than the build, the '
      + 'deploy is what failed.',
    source: 'src/generated/data.json generatedAt',
    domain: 'Chart integrity',
  }
}

const ORDER: Finding['severity'][] = ['critical', 'attention', 'info']

/**
 * Every finding this request should show, most severe first.
 *
 * Build freshness is prepended rather than appended within its severity band: if the page is
 * stale, it is the reason to distrust every other finding in the list, so it has to be read first.
 */
export function viewFindings(now: string = today()): Finding[] {
  const fresh = buildFreshness(generatedAt?.localDate ?? '', now)
  const all = fresh ? [fresh, ...bundledFindings] : [...bundledFindings]
  return all.sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity))
}
