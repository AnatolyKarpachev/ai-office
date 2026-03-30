/**
 * Floor tile pattern storage and caching.
 *
 * Stores 7 grayscale floor patterns loaded from floors.png.
 * Uses shared colorize module for HSL tinting (Photoshop-style Colorize).
 * Caches colorized SpriteData by (pattern, h, s, b, c) key.
 */

import type { SpriteData, FloorColor } from './types.js'
import { getColorizedSprite, clearColorizeCache } from './colorize.js'
import { TILE_SIZE, FALLBACK_FLOOR_COLOR } from '../constants.js'

/** Default solid gray 16×16 tile used when floors.png is not loaded */
const DEFAULT_FLOOR_SPRITE: SpriteData = Array.from(
  { length: TILE_SIZE },
  () => Array(TILE_SIZE).fill(FALLBACK_FLOOR_COLOR) as string[],
)

/** Module-level storage for floor tile sprites (set once on load) */
let floorSprites: SpriteData[] = []

const HIDDEN_FLOOR_RANGES: Array<[number, number]> = [
  [10, 83],
  [86, 95],
  [98, 103],
  [107, 147],
  [161, 170],
  [176, 191],
  [192, 238],
  [280, 361],
  [378, 387],
  [518, 577],
  [734, 785],
]

const FENCE_FLOOR_RANGE: [number, number] = [192, 208]

function isPatternInRange(patternIndex: number, [start, end]: [number, number]): boolean {
  return patternIndex >= start && patternIndex <= end
}

function isHiddenFloorPattern(patternIndex: number): boolean {
  return HIDDEN_FLOOR_RANGES.some((range) => isPatternInRange(patternIndex, range))
}

export function isFenceFloorPattern(patternIndex: number): boolean {
  return isPatternInRange(patternIndex, FENCE_FLOOR_RANGE)
}

/** Wall color constant */
export const WALL_COLOR = '#3A3A5C'

/** Set floor tile sprites (called once when extension sends floorTilesLoaded) */
export function setFloorSprites(sprites: SpriteData[]): void {
  floorSprites = sprites
  clearColorizeCache()
}

/** Get the raw (grayscale) floor sprite for a pattern index (1-7 -> array index 0-6).
 *  Falls back to the default solid gray tile when floors.png is not loaded. */
export function getFloorSprite(patternIndex: number): SpriteData | null {
  const idx = patternIndex - 1
  if (idx < 0) return null
  if (idx < floorSprites.length) return floorSprites[idx]
  // No PNG sprites loaded — return default solid tile for any valid pattern index
  if (floorSprites.length === 0 && patternIndex >= 1) return DEFAULT_FLOOR_SPRITE
  return null
}

/** Check if floor sprites are available (always true — falls back to default solid tile) */
export function hasFloorSprites(): boolean {
  return true
}

/** Get count of available floor patterns (at least 1 for the default solid tile) */
export function getFloorPatternCount(): number {
  return floorSprites.length > 0 ? floorSprites.length : 1
}

/** Get visible floor pattern indices for the editor palette. */
export function getVisibleFloorPatternIndices(): number[] {
  const count = getFloorPatternCount()
  const visible: number[] = []
  for (let patternIndex = 1; patternIndex <= count; patternIndex++) {
    if (isHiddenFloorPattern(patternIndex)) continue
    visible.push(patternIndex)
  }
  return visible
}

/** Get all floor sprites (for preview rendering, falls back to default solid tile) */
export function getAllFloorSprites(): SpriteData[] {
  return floorSprites.length > 0 ? floorSprites : [DEFAULT_FLOOR_SPRITE]
}

/**
 * Get a colorized version of a floor sprite.
 * Uses Photoshop-style Colorize: grayscale -> HSL with given hue/saturation,
 * then brightness/contrast adjustment.
 */
export function getColorizedFloorSprite(patternIndex: number, color: FloorColor): SpriteData {
  const key = `floor-${patternIndex}-${color.h}-${color.s}-${color.b}-${color.c}`

  const base = getFloorSprite(patternIndex)
  if (!base) {
    // Return a 16x16 magenta error tile
    const err: SpriteData = Array.from({ length: 16 }, () => Array(16).fill('#FF00FF'))
    return err
  }

  // Floor tiles are always colorized (grayscale patterns need Photoshop-style Colorize)
  return getColorizedSprite(key, base, { ...color, colorize: true })
}
