/**
 * **The system layer: everything that is the same on every chart.**
 *
 * A divergence in one of these paths is a bug in one of the two repos — which is what
 * `check-template-parity.mjs` reports and what `port-overlay.mjs` copies. Both need the same
 * answer to "what is shared?", and two copies of that list would drift the first time a path was
 * added to one of them (INVARIANTS.md X-8), so it lives here.
 *
 * WHAT IS DELIBERATELY NOT HERE, and why the omissions matter more than the inclusions.
 * `athlete/`, `data/*.csv`, `logs/`, `decisions.md`, `nutrition/`, `program/`, `photos/` are the
 * chart — they are SUPPOSED to differ, completely, on every chart, and listing them would drown
 * the signal in exactly the noise that makes a check get ignored. `docs/` is per-chart except for
 * the two design documents shared code cites by name.
 *
 * TO ADD A PATH: it belongs here if the answer to "should another athlete's chart have this same
 * file?" is yes. If the answer is "yes but with their content in it", it does not belong here —
 * it belongs in the chart, and a `TEMPLATE-*` form belongs in the template.
 */
export const SYSTEM_PATHS = [
  'scripts',
  'src',
  'skills',
  '.claude/agents',
  '.claude/launch.json',
  '.github/workflows',
  'CLAUDE.md',
  'README.md',
  'data/METHOD.md',
  'logs/TEMPLATE-daily.md',
  'logs/TEMPLATE-weekly-review.md',
  'package.json',
  'next.config.mjs',
  'tsconfig.json',
  '.gitignore',
  'docs/SURFACES.md',
  'docs/INVARIANTS.md',
]

/**
 * Paths that must travel WITH a system path but are not themselves compared.
 *
 * `package-lock.json` is the only one: it is generated from `package.json`, `npm ci` refuses to
 * run when the two disagree, and comparing a lockfile diff line by line is noise. Copying
 * `package.json` without it is how the overlay's first `npm ci` failed.
 */
export const COMPANION_PATHS = { 'package.json': ['package-lock.json'] }
