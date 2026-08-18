/**
 * Typed surface over the shared row-writing logic.
 *
 * The implementation lives in `scripts/lib/rowwrite.mjs`, not here, and is imported rather than
 * restated. Two copies of "how a row becomes a CSV line" would drift, and the drift would show up
 * as a row the form wrote and CI then rejected — the build breaking over a number the athlete
 * already saw confirmed on screen. The .mjs home also means `scripts/test-rowwrite.mjs` exercises
 * the exact code the dashboard runs, rather than a lookalike.
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - plain ESM, shared with scripts/ on purpose: one implementation, two consumers
import * as rowwrite from '../../scripts/lib/rowwrite.mjs'

export type Row = Record<string, string>

export const validateRow: (file: string, row: Row) => string[] = rowwrite.validateRow
/** Assigns any unassigned remainder of a session's duration to `light_min`, and says so in the note. */
export const coverIntensitySplit: (file: string, row: Row) => Row = rowwrite.coverIntensitySplit
export const insertRow: (text: string, file: string, row: Row) => string = rowwrite.insertRow
export const mergeIntoExisting: (text: string, file: string, row: Row) => Row = rowwrite.mergeIntoExisting
export const toLine: (file: string, row: Row) => string = rowwrite.toLine
/** Drops a uniqueDate file's row for `date`, permanently. See rowwrite.mjs for why no trace is kept. */
export const removeRow: (text: string, file: string, date: string) => string = rowwrite.removeRow
