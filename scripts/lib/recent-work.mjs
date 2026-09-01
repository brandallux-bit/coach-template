/**
 * What the athlete has actually done lately, and whether today's plan repeats it.
 *
 * WHY THIS EXISTS. `planDay()` in `src/lib/forecast.ts` is `plan.weeklyTemplate?.[weekdayKey(date)]`
 * — a pure weekday lookup that never opens `training.csv`. So a chart could propose a session that
 * shared almost every working movement with the one performed the previous afternoon at a hard
 * RPE, and nothing anywhere would notice: `findings.mjs` had sixteen check families and none of
 * them looked at training frequency, movement overlap, or consecutive loading days. A template is
 * a proposal; the record is what makes it a recommendation.
 *
 * So: this module answers "what happened recently" and "does the proposal collide with it" as
 * data, and `skills/library/session-recommendation` is the procedure that has to consult it. The
 * finding built on top is a backstop for the session that forgets — it is not the mechanism.
 * **Nothing here blocks anything** (findings.mjs preamble): it reports, the coach decides.
 *
 * ⚠ NO ATHLETE VOCABULARY IS HARDCODED (INVARIANTS.md X-11). The movement-pattern map is *parsed
 * out of the chart's own `program/exercise-library.md` substitution table*, the same way
 * `suspensions.mjs` reads exclusions out of `program/` prose rather than keeping a register. A
 * chart with a different library gets different patterns; a chart with no library still gets exact
 * -movement overlap, which is the half that catches the ordinary case.
 *
 * ⚠ **ACCEPTED LIMIT, RECORDED RATHER THAN CLAIMED AWAY:** `IMPLEMENT` below enumerates
 * RESISTANCE-TRAINING vocabulary — kettlebells, dumbbells, barbells, bands. That is domain-generic
 * rather than athlete-specific, so it crosses to every chart; but a chart whose training is
 * swimming, cycling or climbing gets nothing from it. It is a limit of this module, not a property
 * of it, and the exact-movement matching underneath works regardless.
 *
 * Pure: takes parsed rows and text, returns data. No file IO, no exits.
 */


/**
 * A movement name reduced to the tokens it can be matched on.
 *
 * Three transformations, each of which exists because the chart really writes names this way:
 *   - `Push-up (feet elevated)` vs `Push-up (feet elevated or standard)` — the parenthetical is a
 *     variant, not a different exercise. `skills/daily-dashboard` already matches on the base name
 *     for exactly this reason; this is the same rule in code.
 *   - `KB curl / band curl` — a slash means "either", so it is two tokens and matching either one
 *     is a hit.
 *   - `Anti-flexion core: side plank + Pallof press` — a label prefix over a COMPOUND item. The
 *     prefix is stripped and the parts split, because otherwise the row reads as one unfamiliar
 *     movement and a component performed yesterday hides inside it. That is not hypothetical: a
 *     compound item was the one overlap of six that the first version of this function missed.
 *     Warm-ups and cooldowns are dropped outright by `workingItems()` rather than normalised.
 *   - `Pull-ups (band-assisted as needed)` vs `Pull-up (band-assisted)` — a plural is not a
 *     different exercise. The Today page's Movement table counts `sets.csv` rows against
 *     `prescriptions.csv` rows on the base name, so before this a prescription saying "Pull-ups"
 *     and a log saying "Pull-up" never joined, and a movement the athlete had actually performed
 *     rendered as **"0 / 3 · not started"** for as long as the block ran. An athlete reported it;
 *     nothing in the repo would have. Only the LAST word is singularised, and never one ending in
 *     `ss`, so `Pallof press` survives intact.
 *   - `1-hand KB/DB clean` vs `1-hand clean (KB/DB)` — `KB/DB` is an alternation of IMPLEMENTS
 *     inside one name, not two alternative exercises. Splitting it on the slash produced the
 *     tokens `1-hand kb` and `db clean`, neither of which is a movement. Implement alternations
 *     are collapsed away BEFORE the slash split, which is what keeps `KB curl / band curl` — a
 *     slash between two whole names — splitting into two, as it should.
 *
 * Returns [] for anything that reduces to nothing, so callers can filter without a guard.
 */

/**
 * Words that name the tool rather than the movement.
 *
 * Used two ways: to collapse an implement ALTERNATION inside a name (`KB/DB clean`), and by
 * `matchKeys()` to offer an implement-stripped key so `KB RDL` and `DB RDL` can join. The second
 * is deliberately a SECONDARY key, never a replacement — `KB swing` and `DB swing` really are the
 * same movement, but the load column is where the difference lives and it is not being erased.
 */
const IMPLEMENT = 'kb|db|bb|barbell|dumbbell|kettlebell|band|cable|machine|bodyweight|bw'
const IMPLEMENT_ALTERNATION = new RegExp(`\\b(?:${IMPLEMENT})(?:\\s*/\\s*(?:${IMPLEMENT}))+\\b`, 'gi')
const IMPLEMENT_PREFIX = new RegExp(`^(?:${IMPLEMENT})\\s+`, 'i')

/**
 * Singularise the head noun, which in these names is the last word.
 *
 * Guarded twice: words under 4 characters are left alone (`abs`, `dips` would lose too much), and
 * anything ending `ss` is left alone so `press` does not become `pres`.
 */
function singularise(token) {
  const parts = token.split(' ')
  const last = parts[parts.length - 1]
  if (last.length >= 4 && !/ss$/i.test(last)) parts[parts.length - 1] = last.replace(/s$/i, '')
  return parts.join(' ')
}

export function movementTokens(name) {
  if (!name) return []
  return String(name)
    .replace(/\([^)]*\)/g, ' ')          // variant parentheticals
    .replace(/^[^:]*:/, ' ')              // "Anti-flexion core: ..." style label prefixes
    .replace(IMPLEMENT_ALTERNATION, ' ')  // "KB/DB clean" — one movement, two possible tools
    .split(/[/,+]|\band\b/)               // "either" alternatives AND compound items
    .map((part) => singularise(part
      .replace(/[^a-z0-9\s-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()))
    .filter((t) => t.length >= 3)
}

/**
 * Every key a name may be matched on: its tokens, plus each token with a leading implement
 * stripped. A Set, so callers intersect rather than loop.
 */
export function matchKeys(name) {
  const keys = new Set()
  for (const t of movementTokens(name)) {
    keys.add(t)
    const bare = t.replace(IMPLEMENT_PREFIX, '').trim()
    if (bare.length >= 3) keys.add(bare)
  }
  return keys
}

/**
 * True when two free-text movement names denote the same movement.
 *
 * ⚠ **BEST-EFFORT, AND NOTHING LOAD-BEARING MAY DEPEND ON IT.** These names are typed
 * independently into `prescriptions.csv` and `sets.csv` with no shared identifier, so no matcher
 * over them can be complete — that is the lesson of the plural failure above, where the response
 * to a missed match was to DELETE the athlete's work from the page. Surfaces render what was
 * logged first and use this only to annotate; a miss must cost an annotation, never a row.
 */
export function sameMovement(a, b) {
  const ka = matchKeys(a)
  for (const k of matchKeys(b)) if (ka.has(k)) return true
  return false
}

/** The first token, or null — the stable identity used when reporting a movement back. */
export const movementKey = (name) => movementTokens(name)[0] ?? null

/**
 * True for a row that is actual work rather than scaffolding.
 *
 * Warm-ups and cooldowns are shared by design: a chart that opens every session with the same
 * preparation and closes it with the same routine has said nothing about overlap by doing so.
 * Counting them would report every pair of sessions as a collision, which is the fastest way to
 * make a finding unreadable.
 */
export const isWorkingItem = (name) => !/^\s*(warm[- ]?up|cool[- ]?down|cooldown)\b/i.test(String(name ?? ''))

/** The working movements of a prescription set, in order, de-duplicated by key. */
export function workingItems(rows) {
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const name = r.exercise ?? r.item ?? ''
    if (!isWorkingItem(name)) continue
    const key = movementKey(name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({ name, key, tokens: movementTokens(name) })
  }
  return out
}

/**
 * Movement → pattern, read out of the chart's exercise library rather than declared here.
 *
 * Parses the `| Pattern | Primary | Sub A | Sub B |` table: every movement cell on a row maps to
 * that row's pattern name. `⛔` markers, footnote parentheticals and empty cells are ignored. A
 * chart with no such table returns an empty map and every caller degrades to exact-movement
 * matching, which is the behaviour a fresh chart should have.
 */
export function patternIndex(libraryText = '') {
  const index = new Map()
  const lines = String(libraryText).split('\n')
  let inTable = false
  for (const line of lines) {
    if (!/^\s*\|/.test(line)) { inTable = false; continue }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (!cells.length) continue
    if (/^[\s:-]+$/.test(cells.join(''))) { inTable = true; continue }   // the ---|--- separator
    if (!inTable) continue                                              // header row, or prose
    const [pattern, ...rest] = cells
    if (!pattern || /^pattern$/i.test(pattern)) continue
    const patternName = pattern.replace(/⛔/g, '').trim()
    if (!patternName) continue
    for (const cell of rest) {
      for (const token of movementTokens(cell.replace(/⛔/g, ' '))) {
        if (!index.has(token)) index.set(token, patternName)
      }
    }
  }
  return index
}

/** The pattern a movement belongs to, or null when the library does not place it. */
export const patternOf = (name, index) => {
  for (const t of movementTokens(name)) if (index.has(t)) return index.get(t)
  return null
}

/**
 * What was actually performed, per day, over the window ending yesterday.
 *
 * ⚠ **`sets.csv` is the evidence, not `training.csv`.** A `completed` training row says a session
 * happened; only the set rows say which movements were in it — and an athlete regularly runs a
 * session that is not the one that was written down, including on a day the template called rest.
 * Reading the plan back would report the plan, which is the whole defect.
 *
 * `days` is how far back to look. Two is the floor a coach needs to avoid repeating yesterday; the
 * default is 3 so a two-day-old collision is still visible on the third day rather than dropping
 * off the edge.
 */
export function recentWork({ training = [], sets = [], today, days = 3, nonLoading = new Set() }) {
  const window = []
  for (let i = 1; i <= days; i += 1) window.push(shiftDate(today, -i))
  const inWindow = new Set(window)

  const byDate = new Map(window.map((d) => [d, { date: d, sessions: [], movements: new Map() }]))
  for (const s of sets) {
    if (!inWindow.has(s.date)) continue
    const day = byDate.get(s.date)
    const name = s.exercise ?? ''
    if (!isWorkingItem(name)) continue
    const key = movementKey(name)
    if (!key) continue
    if (!day.movements.has(key)) day.movements.set(key, { name, key, date: s.date })
  }
  for (const t of training) {
    if (!inWindow.has(t.date)) continue
    if (t.status !== 'completed') continue
    byDate.get(t.date).sessions.push({ type: t.type, session: t.session, rpe: t.rpe, duration: t.duration_min })
  }

  // Most recent date each movement was performed, across the whole window.
  const lastDone = new Map()
  for (const d of window) {
    for (const [key, m] of byDate.get(d).movements) {
      const prev = lastDone.get(key)
      if (!prev || prev.date < m.date) lastDone.set(key, m)
    }
  }

  return {
    window,
    days: window.map((d) => byDate.get(d)),
    lastDone,
    consecutiveLoadingDays: consecutiveLoadingDays({ training, today, nonLoading }),
  }
}

/**
 * How many days in a row up to and including yesterday carried a loading session.
 *
 * ⚠ **`nonLoading` IS PASSED IN, AND IT IS NOT THE FLOOR SET.** It comes from
 * `nonLoadingTypeSet()` in `scripts/lib/athlete.mjs`, which reads the registry's own `loading`
 * flag; that function's header states why the two obvious shortcuts — `countsTowardFloor` and
 * `met > 0` — each answer a different question and get real registries wrong. Passing the resolved
 * set keeps this module pure and keeps the registry the single home for what a session type is.
 *
 * **The default is empty, so an unclassified type is loading.** A caller that forgets the argument
 * over-counts a streak, which reports too much recent work; the inverse would silently shorten
 * every streak containing a type it did not know about, and quietly telling a coach the athlete is
 * fresher than they are is the worse failure.
 *
 * Counting stops at the first gap; it does not look through one.
 */
export function consecutiveLoadingDays({ training = [], today, nonLoading = new Set() }) {
  const loading = new Set(
    training
      .filter((t) => t.status === 'completed' && !nonLoading.has(t.type))
      .map((t) => t.date),
  )
  let n = 0
  for (let i = 1; i <= 14; i += 1) {
    if (!loading.has(shiftDate(today, -i))) break
    n += 1
  }
  return n
}

/**
 * Does a proposed session repeat what was just done?
 *
 * Returns the overlap both ways round — which proposed movements were already performed and when,
 * and which are genuinely new — because the useful coaching output is not a score, it is
 * *"these two items are the only thing here you did not do yesterday."*
 *
 * `plannedRows` are prescription rows for the proposed session; `libraryText` is optional and only
 * adds the pattern-level view.
 */
export function sessionOverlap({
  plannedRows = [], training = [], sets = [], today, days = 3, libraryText = '', nonLoading = new Set(),
}) {
  const history = recentWork({ training, sets, today, days, nonLoading })
  const items = workingItems(plannedRows)
  const index = patternIndex(libraryText)

  const repeated = []
  const fresh = []
  for (const item of items) {
    const matched = item.tokens.filter((t) => history.lastDone.get(t))
    const unmatched = item.tokens.filter((t) => !history.lastDone.get(t))
    if (!matched.length) { fresh.push(item); continue }
    const hit = history.lastDone.get(matched[0])
    repeated.push({
      ...item,
      lastDone: hit.date,
      as: hit.name,
      matched,
      // A compound item is only PARTLY repeated, and the unrepeated half is the useful answer:
      // "side plank + Pallof" after a side-plank day means do the Pallof, not the whole item.
      partial: unmatched.length > 0,
      stillNew: unmatched,
    })
  }

  // Pattern-level repetition catches the case exact names miss: a different row variant on
  // consecutive days is still a second horizontal pull.
  const plannedPatterns = new Set(items.map((i) => patternOf(i.name, index)).filter(Boolean))
  const recentPatterns = new Set(
    [...history.lastDone.values()].map((m) => patternOf(m.name, index)).filter(Boolean),
  )
  const sharedPatterns = [...plannedPatterns].filter((p) => recentPatterns.has(p))

  return {
    items,
    repeated,
    fresh,
    ratio: items.length ? repeated.length / items.length : 0,
    sharedPatterns,
    consecutiveLoadingDays: history.consecutiveLoadingDays,
    history,
  }
}

/**
 * YYYY-MM-DD shifted by whole days, in UTC arithmetic on a date-only string.
 *
 * Deliberately not `new Date()` on a local clock: every date in this chart is the athlete's local
 * calendar date (data/METHOD.md rule 6) and the caller has already derived `today` correctly via
 * `localToday()`. This only ever moves an already-correct date backwards.
 */
export function shiftDate(iso, deltaDays) {
  const [y, m, d] = String(iso).split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + deltaDays * 86400000
  const out = new Date(t)
  return `${out.getUTCFullYear()}-${String(out.getUTCMonth() + 1).padStart(2, '0')}-${String(out.getUTCDate()).padStart(2, '0')}`
}
