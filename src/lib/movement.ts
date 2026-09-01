/**
 * Typed surface over the movement level table.
 *
 * The implementation lives in `scripts/lib/movement.mjs` — the same arrangement as `aggregate.ts`
 * over `aggregate.mjs`, for the same reason: the ledger and the forward view must price a chart's
 * incidental movement identically, and two copies of the level table would disagree the first time
 * one of them was edited.
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore - plain ESM, shared with scripts/ on purpose: one implementation, two consumers
import * as mv from '../../scripts/lib/movement.mjs'

export type MovementLevel = { key: string; stepEquivalent: number; label: string }

export const MOVEMENT_LEVELS: MovementLevel[] = mv.MOVEMENT_LEVELS
export const DEFAULT_MOVEMENT_LEVEL: string = mv.DEFAULT_MOVEMENT_LEVEL
export const movementLevel: (key: string | undefined) => MovementLevel | null = mv.movementLevel

/** The level's kcal/day at a bodyweight. Null when the level or either input is absent. */
export const movementKcal: (
  levelKey: string | undefined, weightLb: number | null, kcalPerStepPerLb: number | null,
) => number | null = mv.movementKcal

export const movementBasis: (
  levelKey: string | undefined, weightLb: number | null, kcalPerStepPerLb: number | null,
) => string = mv.movementBasis
