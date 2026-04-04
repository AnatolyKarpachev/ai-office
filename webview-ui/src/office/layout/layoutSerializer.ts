import { TileType, FurnitureType, DEFAULT_COLS, DEFAULT_ROWS, TILE_SIZE, Direction } from '../types.js'
import type { TileType as TileTypeVal, OfficeLayout, PlacedFurniture, Seat, FurnitureInstance, FloorColor } from '../types.js'
import { getCatalogEntry, getOrientationInGroup } from './furnitureCatalog.js'
import { getColorizedSprite } from '../colorize.js'

/** Convert flat tile array from layout into 2D grid */
export function layoutToTileMap(layout: OfficeLayout): TileTypeVal[][] {
  const map: TileTypeVal[][] = []
  for (let r = 0; r < layout.rows; r++) {
    const row: TileTypeVal[] = []
    for (let c = 0; c < layout.cols; c++) {
      row.push(layout.tiles[r * layout.cols + c])
    }
    map.push(row)
  }
  return map
}

/** Convert placed furniture into renderable FurnitureInstance[] */
export function layoutToFurnitureInstances(furniture: PlacedFurniture[]): FurnitureInstance[] {
  // Pre-compute desk tiles set (for chair z-sorting: detect "back to camera" seats)
  const deskTilesSet = new Set<string>()

  // Containment-based z-boost: track solid furniture per tile so items placed ON
  // larger furniture automatically render in front of it.
  const SURFACE_SKIP = new Set(['chairs', 'sofa', 'floor_decor'])
  interface SolidRecord { uid: string; tileSet: Set<string>; area: number; zY: number }
  const solidByTile = new Map<string, SolidRecord[]>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    if (entry.isDesk) {
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          deskTilesSet.add(`${item.col + dc},${item.row + dr}`)
        }
      }
    }
    if (SURFACE_SKIP.has(entry.category) || entry.canPlaceOnSurfaces) continue
    const fzY = item.row * TILE_SIZE + entry.sprite.length
    const area = entry.footprintW * entry.footprintH
    const tileSet = new Set<string>()
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        tileSet.add(`${item.col + dc},${item.row + dr}`)
      }
    }
    const rec: SolidRecord = { uid: item.uid, tileSet, area, zY: fzY }
    for (const key of tileSet) {
      let list = solidByTile.get(key)
      if (!list) { list = []; solidByTile.set(key, list) }
      list.push(rec)
    }
  }

  const instances: FurnitureInstance[] = []
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const x = item.col * TILE_SIZE
    const y = item.row * TILE_SIZE
    const spriteH = entry.sprite.length
    let zY = y + spriteH

    // Chair/sofa z-sorting: ensure characters sitting on them render correctly
    if (entry.category === 'chairs' || entry.category === 'sofa') {
      // Detect if the seated character faces away from camera (back to viewer).
      // In that case the chair renders IN FRONT to show chair back occluding character.
      // Cases: explicit 'back' orientation, or no orientation + adjacent desk
      // (desk proximity implies character faces the desk with back to camera).
      const seatFacesAway = (() => {
        if (entry.orientation === 'back') return true
        if (entry.orientation === 'front' || entry.orientation === 'side'
            || entry.orientation === 'left' || entry.orientation === 'right') return false
        // No explicit orientation — check if any seat tile has a desk directly ABOVE.
        // Only desk above means the character faces UP (back to camera);
        // desk below/left/right means the character faces forward or sideways.
        const bgRows = Math.min(entry.backgroundTiles || 0, entry.footprintH - 1)
        for (let dr = bgRows; dr < entry.footprintH; dr++) {
          for (let dc = 0; dc < entry.footprintW; dc++) {
            const sc = item.col + dc
            const sr = item.row + dr
            // Only desk above → character faces UP → back to camera
            if (deskTilesSet.has(`${sc},${sr - 1}`)) return true
          }
        }
        return false
      })()

      if (seatFacesAway) {
        // Chair renders IN FRONT of the seated character
        zY = (item.row + entry.footprintH) * TILE_SIZE + 1
      } else {
        // All other chairs: cap zY to first row bottom so characters
        // at any seat tile render in front of the chair
        zY = (item.row + 1) * TILE_SIZE
      }
    }

    // Containment-based surface z-boost: if this item's entire footprint is inside
    // a single strictly-larger furniture piece, render it in front of that furniture.
    // Works for any item (plants, electronics, etc.) without requiring canPlaceOnSurfaces.
    if (!SURFACE_SKIP.has(entry.category)) {
      const itemArea = entry.footprintW * entry.footprintH
      const itemTiles: string[] = []
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          itemTiles.push(`${item.col + dc},${item.row + dr}`)
        }
      }
      // Collect unique overlapping furniture (by uid)
      const seen = new Set<string>()
      const candidates: SolidRecord[] = []
      for (const tk of itemTiles) {
        const recs = solidByTile.get(tk)
        if (!recs) continue
        for (const r of recs) {
          if (r.uid === item.uid || seen.has(r.uid)) continue
          seen.add(r.uid)
          candidates.push(r)
        }
      }
      // Find a strictly larger furniture piece that contains ALL item tiles
      let bestZ = -1
      for (const c of candidates) {
        if (c.area <= itemArea) continue
        if (itemTiles.every(t => c.tileSet.has(t)) && c.zY > bestZ) bestZ = c.zY
      }
      if (bestZ >= 0 && bestZ + 0.5 > zY) zY = bestZ + 0.5
    }

    // Wall decorations (not doors) render in front of the wall they're attached to
    if (entry.canPlaceOnWalls && !item.type.includes('DOOR')) {
      const wallRow = item.row + entry.footprintH - 1
      const wallZY = (wallRow + 1) * TILE_SIZE
      if (wallZY + 0.5 > zY) zY = wallZY + 0.5
    }

    // Colorize sprite if this furniture has a color override
    let sprite = entry.sprite
    if (item.color) {
      const { h, s, b: bv, c: cv } = item.color
      sprite = getColorizedSprite(`furn-${item.type}-${h}-${s}-${bv}-${cv}-${item.color.colorize ? 1 : 0}`, entry.sprite, item.color)
    }

    // Determine if this instance should be mirrored (side asset used in "left" orientation)
    let mirrored = false
    if (entry.mirrorSide) {
      const orientInGroup = getOrientationInGroup(item.type)
      if (orientInGroup === 'left') {
        mirrored = true
      }
    }

    instances.push({ sprite, x, y, zY, ...(mirrored ? { mirrored: true } : {}) })
  }
  return instances
}

/** Get all tiles blocked by furniture footprints, optionally excluding a set of tiles.
 *  Skips top backgroundTiles rows so characters can walk through them. */
export function getBlockedTiles(furniture: PlacedFurniture[], excludeTiles?: Set<string>): Set<string> {
  const tiles = new Set<string>()
  // Categories that don't block walking
  const WALKABLE_CATEGORIES = new Set(['chairs', 'floor_decor'])
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    if (WALKABLE_CATEGORIES.has(entry.category)) continue // walkable furniture never blocks
    const bgRows = entry.backgroundTiles || 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue // skip background rows — characters can walk behind tall furniture
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const key = `${item.col + dc},${item.row + dr}`
        if (excludeTiles && excludeTiles.has(key)) continue
        tiles.add(key)
      }
    }
  }
  return tiles
}

/** Get tiles blocked for placement purposes — skips top backgroundTiles rows per item */
export function getPlacementBlockedTiles(furniture: PlacedFurniture[], excludeUid?: string): Set<string> {
  const tiles = new Set<string>()
  for (const item of furniture) {
    if (item.uid === excludeUid) continue
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const bgRows = entry.backgroundTiles || 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue // skip background rows
      for (let dc = 0; dc < entry.footprintW; dc++) {
        tiles.add(`${item.col + dc},${item.row + dr}`)
      }
    }
  }
  return tiles
}

/** Chair types reserved for specific roles. Key = furniture type, value = list of allowed roles. */
const ROLE_RESTRICTED_CHAIRS: Record<string, string[]> = {
  'MO_112': ['boss', 'megaboss'],
}

/** Map chair orientation to character facing direction */
function orientationToFacing(orientation: string): Direction {
  switch (orientation) {
    case 'front': return Direction.DOWN
    case 'back': return Direction.UP
    case 'left': return Direction.LEFT
    case 'right':
    case 'side': return Direction.RIGHT
    default: return Direction.DOWN
  }
}

/** Generate seats from chair furniture.
 *  Facing priority: 1) chair orientation, 2) adjacent desk, 3) forward (DOWN).
 *  Skips seats that overlap with other furniture's footprint (prevents phantom seats). */
export function layoutToSeats(furniture: PlacedFurniture[]): Map<string, Seat> {
  const seats = new Map<string, Seat>()

  // Build set of all desk tiles
  const deskTiles = new Set<string>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || !entry.isDesk) continue
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        deskTiles.add(`${item.col + dc},${item.row + dr}`)
      }
    }
  }

  // Build set of non-chair furniture tiles that physically block (skip background rows).
  // Prevents phantom seats on bookshelf tops, but allows seats under PC/desk background rows.
  const nonChairFurnitureTiles = new Set<string>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || entry.category === 'chairs' || entry.category === 'sofa') continue
    const bgRows = entry.backgroundTiles || 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue // background rows don't block seats
      for (let dc = 0; dc < entry.footprintW; dc++) {
        nonChairFurnitureTiles.add(`${item.col + dc},${item.row + dr}`)
      }
    }
  }

  const dirs: Array<{ dc: number; dr: number; facing: Direction }> = [
    { dc: 0, dr: -1, facing: Direction.UP },    // desk is above chair → face UP
    { dc: 0, dr: 1, facing: Direction.DOWN },   // desk is below chair → face DOWN
    { dc: -1, dr: 0, facing: Direction.LEFT },   // desk is left of chair → face LEFT
    { dc: 1, dr: 0, facing: Direction.RIGHT },   // desk is right of chair → face RIGHT
  ]

  // For each chair, non-background footprint tiles become seats.
  // Skips top backgroundTiles rows (e.g. chair backs) — agents sit on the seat, not the back.
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || (entry.category !== 'chairs' && entry.category !== 'sofa')) continue

    // Clamp bgRows so chairs always generate at least one seat row
    const rawBgRows = entry.backgroundTiles || 0
    const bgRows = Math.min(rawBgRows, entry.footprintH - 1)
    let seatCount = 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue // skip background rows (chair backs)
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const tileCol = item.col + dc
        const tileRow = item.row + dr

        // Skip seats that overlap with non-chair furniture (e.g. bookshelf tops)
        if (nonChairFurnitureTiles.has(`${tileCol},${tileRow}`)) continue

        // isLounge = true for rest furniture (sofas, beds) — idle agents sit here
        // Benches are workstations, not lounge
        const upper = item.type.toUpperCase()
        const isSofa = upper.startsWith('SOFA') || upper.startsWith('BED')

        // Determine facing direction:
        // 1) Adjacent desk direction (highest priority — face the desk)
        // 2) Chair orientation fallback
        // 3) Default forward (DOWN)
        let facingDir: Direction = Direction.DOWN
        let foundAdjacentDesk = false
        // Always check for adjacent desks first
        for (const d of dirs) {
          if (deskTiles.has(`${tileCol + d.dc},${tileRow + d.dr}`)) {
            facingDir = d.facing
            foundAdjacentDesk = true
            break
          }
        }
        // If no adjacent desk, use furniture orientation
        if (!foundAdjacentDesk) {
          if (entry.orientation) {
            facingDir = orientationToFacing(entry.orientation)
          }
          // No orientation — keep default DOWN
        }

        // First seat uses chair uid (backward compat), subsequent use uid:N
        const seatUid = seatCount === 0 ? item.uid : `${item.uid}:${seatCount}`
        seats.set(seatUid, {
          uid: seatUid,
          seatCol: tileCol,
          seatRow: tileRow,
          facingDir,
          assigned: false,
          isLounge: isSofa,
          facesDesk: foundAdjacentDesk,
          requiredRoles: ROLE_RESTRICTED_CHAIRS[item.type] ?? null,
        })
        seatCount++
      }
    }
  }

  return seats
}

/** Get tiles occupied by desk seats (excluded from blocked tiles).
 *  Lounge seats are NOT excluded — they block walk-through but allow sitting as destination. */
export function getSeatTiles(seats: Map<string, Seat>): Set<string> {
  const tiles = new Set<string>()
  for (const seat of seats.values()) {
    if (!seat.isLounge) {
      tiles.add(`${seat.seatCol},${seat.seatRow}`)
    }
  }
  return tiles
}

/** Get only lounge (sofa) seat tiles — these need to be unblocked for pathfinding */
export function getLoungeSeatTiles(seats: Map<string, Seat>): Set<string> {
  const tiles = new Set<string>()
  for (const seat of seats.values()) {
    if (seat.isLounge) {
      tiles.add(`${seat.seatCol},${seat.seatRow}`)
    }
  }
  return tiles
}

/** Default floor colors for each room zone */
const COLOR_CONFERENCE: FloorColor = { h: 210, s: 25, b: 10, c: 0 }    // cool blue-gray carpet
const COLOR_MAIN: FloorColor = { h: 35, s: 20, b: 10, c: 0 }           // warm gray carpet
const COLOR_BREAK: FloorColor = { h: 30, s: 10, b: 20, c: 0 }          // polished concrete (kitchen)
const COLOR_DOORWAY: FloorColor = { h: 35, s: 25, b: 10, c: 0 }        // tan doorway
const COLOR_ENTRY: FloorColor = { h: 30, s: 10, b: 15, c: 0 }          // polished concrete (entry)
const COLOR_OFFICE: FloorColor = { h: 30, s: 35, b: 10, c: 0 }         // warm amber carpet

/** Create the default office layout — 20×27, L-shaped with 16 seats */
export function createDefaultLayout(): OfficeLayout {
  const W = TileType.WALL
  const V = TileType.VOID
  const C = TileType.FLOOR_1   // Conference room
  const M = TileType.FLOOR_2   // Main open area
  const B = TileType.FLOOR_3   // Kitchen / break room (polished concrete)
  const D = TileType.FLOOR_4   // Doorway
  const E = TileType.FLOOR_5   // Entry / reception (polished concrete)
  const O = TileType.FLOOR_6   // Offices

  // 20 cols × 27 rows — L-shaped: conference top-left, VOID top-right (restrooms),
  // 4 offices down the left, main open area center-right, entry zone near entrance,
  // enclosed kitchen/break bottom-right
  const grid: TileTypeVal[][] = [
    //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19
    [ W, W, W, W, W, W, W, W, W, W, W, W, W, V, V, V, V, V, V, V ], // row 0
    [ W, C, C, C, C, C, C, C, C, C, C, C, W, V, V, V, V, V, V, V ], // row 1
    [ W, C, C, C, C, C, C, C, C, C, C, C, W, V, V, V, V, V, V, V ], // row 2
    [ W, C, C, C, C, C, C, C, C, C, C, C, W, V, V, V, V, V, V, V ], // row 3
    [ W, C, C, C, C, C, C, C, C, C, C, C, W, V, V, V, V, V, V, V ], // row 4
    [ W, C, C, C, C, C, C, C, C, C, C, C, W, V, V, V, V, V, V, V ], // row 5
    [ W, C, C, C, C, C, C, C, C, C, C, C, W, V, V, V, V, V, V, V ], // row 6
    [ W, C, C, C, C, C, C, C, C, C, C, C, W, V, V, V, V, V, V, V ], // row 7
    [ W, W, W, W, W, W, W, W, W, D, W, W, W, W, W, W, W, W, W, W ], // row 8  — conf bottom + main top
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, M, M, M, M, M, M, W ], // row 9  — office 1
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, M, M, E, E, E, E, W ], // row 10 — entry zone starts
    [ W, O, O, O, O, O, D, M, M, M, M, M, M, M, M, E, E, E, E, W ], // row 11 — office 1 door
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, M, M, E, E, E, E, W ], // row 12
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, M, M, E, E, E, E, W ], // row 13
    [ W, W, W, W, W, W, W, M, M, M, M, M, M, M, M, E, E, E, E, D ], // row 14 — main entrance
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, M, M, M, M, M, M, W ], // row 15 — office 2
    [ W, O, O, O, O, O, D, M, M, M, M, M, M, M, M, M, M, M, M, W ], // row 16 — office 2 door
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, M, M, M, M, M, M, W ], // row 17
    [ W, W, W, W, W, W, W, M, M, M, M, M, M, M, M, M, M, M, M, W ], // row 18
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, W, W, W, W, W, W, W ], // row 19 — office 3 + break top
    [ W, O, O, O, O, O, D, M, M, M, M, M, M, W, B, B, B, B, B, W ], // row 20 — office 3 door
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, D, B, B, B, B, B, W ], // row 21 — break room door
    [ W, W, W, W, W, W, W, M, M, M, M, M, M, W, B, B, B, B, B, W ], // row 22
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, W, B, B, B, B, B, W ], // row 23 — office 4
    [ W, O, O, O, O, O, D, M, M, M, M, M, M, W, B, B, B, B, B, W ], // row 24 — office 4 door
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, W, B, B, B, B, B, W ], // row 25
    [ W, W, W, W, W, W, W, W, W, W, D, W, W, W, W, W, W, D, W, W ], // row 26 — bottom entrances
  ]

  // Flatten grid and assign colors
  const tiles: TileTypeVal[] = []
  const tileColors: Array<FloorColor | null> = []
  const colorMap: Record<number, FloorColor | null> = {
    [W]: null,
    [V]: null,
    [C]: COLOR_CONFERENCE,
    [M]: COLOR_MAIN,
    [B]: COLOR_BREAK,
    [D]: COLOR_DOORWAY,
    [E]: COLOR_ENTRY,
    [O]: COLOR_OFFICE,
  }
  for (const row of grid) {
    for (const tile of row) {
      tiles.push(tile)
      tileColors.push(colorMap[tile] ?? null)
    }
  }

  const furniture: PlacedFurniture[] = [
    // ── Conference / Team Room — 6 seats ──
    // Large table cluster (3 desks pushed together)
    { uid: 'conf-desk-1', type: FurnitureType.DESK, col: 3, row: 3 },
    { uid: 'conf-desk-2', type: FurnitureType.DESK, col: 5, row: 3 },
    { uid: 'conf-desk-3', type: FurnitureType.DESK, col: 7, row: 3 },
    // 6 chairs around table (3 above, 3 below)
    { uid: 'conf-chair-1', type: FurnitureType.CHAIR, col: 3, row: 2 },
    { uid: 'conf-chair-2', type: FurnitureType.CHAIR, col: 5, row: 2 },
    { uid: 'conf-chair-3', type: FurnitureType.CHAIR, col: 7, row: 2 },
    { uid: 'conf-chair-4', type: FurnitureType.CHAIR, col: 4, row: 5 },
    { uid: 'conf-chair-5', type: FurnitureType.CHAIR, col: 6, row: 5 },
    { uid: 'conf-chair-6', type: FurnitureType.CHAIR, col: 8, row: 5 },
    // TV on right wall, whiteboard on back wall, corner plant
    { uid: 'conf-tv', type: FurnitureType.PC, col: 11, row: 3 },
    { uid: 'conf-wb', type: FurnitureType.WHITEBOARD, col: 4, row: 1 },
    { uid: 'conf-plant', type: FurnitureType.PLANT, col: 1, row: 1 },
    { uid: 'conf-plant-2', type: FurnitureType.PLANT, col: 11, row: 7 },

    // ── Office 1 — Shared / Dark Wall — 2 seats ──
    { uid: 'off1-desk-a', type: FurnitureType.DESK, col: 1, row: 9 },
    { uid: 'off1-desk-b', type: FurnitureType.DESK, col: 3, row: 9 },
    { uid: 'off1-chair-a', type: FurnitureType.CHAIR, col: 1, row: 11 },
    { uid: 'off1-chair-b', type: FurnitureType.CHAIR, col: 3, row: 11 },
    { uid: 'off1-shelf', type: FurnitureType.BOOKSHELF, col: 5, row: 9 },

    // ── Office 2 — Whiteboard — 1 seat ──
    { uid: 'off2-desk', type: FurnitureType.DESK, col: 1, row: 15 },
    { uid: 'off2-chair', type: FurnitureType.CHAIR, col: 2, row: 17 },
    { uid: 'off2-wb', type: FurnitureType.WHITEBOARD, col: 3, row: 15 },
    { uid: 'off2-shelf', type: FurnitureType.BOOKSHELF, col: 5, row: 15 },

    // ── Office 3 — Double Desk — 2 seats ──
    { uid: 'off3-desk-a', type: FurnitureType.DESK, col: 1, row: 19 },
    { uid: 'off3-desk-b', type: FurnitureType.DESK, col: 3, row: 19 },
    { uid: 'off3-chair-a', type: FurnitureType.CHAIR, col: 1, row: 21 },
    { uid: 'off3-chair-b', type: FurnitureType.CHAIR, col: 3, row: 21 },
    { uid: 'off3-shelf', type: FurnitureType.BOOKSHELF, col: 5, row: 19 },

    // ── Office 4 — Corner — 1 seat ──
    { uid: 'off4-desk', type: FurnitureType.DESK, col: 1, row: 23 },
    { uid: 'off4-chair', type: FurnitureType.CHAIR, col: 2, row: 25 },
    { uid: 'off4-pc', type: FurnitureType.PC, col: 3, row: 23 },
    { uid: 'off4-wb', type: FurnitureType.WHITEBOARD, col: 4, row: 23 },

    // ── Main Open Area — 4 seats ──
    // Round table + 4 chairs (center of main area)
    { uid: 'main-table', type: FurnitureType.DESK, col: 10, row: 12 },
    { uid: 'main-chair-1', type: FurnitureType.CHAIR, col: 10, row: 11 },
    { uid: 'main-chair-2', type: FurnitureType.CHAIR, col: 12, row: 12 },
    { uid: 'main-chair-3', type: FurnitureType.CHAIR, col: 11, row: 14 },
    { uid: 'main-chair-4', type: FurnitureType.CHAIR, col: 9, row: 13 },
    // Reception desk (L-shaped, upper main)
    { uid: 'main-recep', type: FurnitureType.DESK, col: 8, row: 9 },
    // Portable whiteboard + decor
    { uid: 'main-wb', type: FurnitureType.WHITEBOARD, col: 14, row: 9 },
    { uid: 'main-plant', type: FurnitureType.PLANT, col: 18, row: 9 },
    { uid: 'main-lamp', type: FurnitureType.LAMP, col: 18, row: 17 },
    { uid: 'main-pc', type: FurnitureType.PC, col: 7, row: 13 },

    // ── Entry / Reception (decorative, 0 seats) ──
    { uid: 'entry-plant', type: FurnitureType.PLANT, col: 17, row: 10 },
    { uid: 'entry-lamp', type: FurnitureType.LAMP, col: 17, row: 13 },

    // ── Kitchen / Break Room (decorative, 0 seats) ──
    { uid: 'break-cooler', type: FurnitureType.COOLER, col: 18, row: 20 },
    { uid: 'break-counter', type: FurnitureType.DESK, col: 14, row: 20 },
    { uid: 'break-plant', type: FurnitureType.PLANT, col: 14, row: 25 },
    { uid: 'break-lamp', type: FurnitureType.LAMP, col: 14, row: 22 },
  ]

  return { version: 1, cols: DEFAULT_COLS, rows: DEFAULT_ROWS, tiles, tileColors, furniture, agentSpawn: null }
}

/** Serialize layout to JSON string */
export function serializeLayout(layout: OfficeLayout): string {
  return JSON.stringify(layout)
}

/** Deserialize layout from JSON string, migrating old tile types if needed */
export function deserializeLayout(json: string): OfficeLayout | null {
  try {
    const obj = JSON.parse(json)
    if (obj && obj.version === 1 && Array.isArray(obj.tiles) && Array.isArray(obj.furniture)) {
      return migrateLayout(obj as OfficeLayout)
    }
  } catch { /* ignore parse errors */ }
  return null
}

/**
 * Ensure layout has tileColors. If missing, generate defaults based on tile types.
 * Exported for use by message handlers that receive layouts over the wire.
 */
export function migrateLayoutColors(layout: OfficeLayout): OfficeLayout {
  return migrateLayout(layout)
}

/**
 * Migrate old layouts that use legacy tile types (TILE_FLOOR=1, WOOD_FLOOR=2, CARPET=3, DOORWAY=4)
 * to the new pattern-based system. If tileColors is already present, no migration needed.
 */
function migrateLayout(layout: OfficeLayout): OfficeLayout {
  const rawSpawn = (layout as OfficeLayout & { agentSpawn?: unknown }).agentSpawn
  const agentSpawn = (
    rawSpawn
    && typeof rawSpawn === 'object'
    && Number.isInteger((rawSpawn as { col?: unknown }).col)
    && Number.isInteger((rawSpawn as { row?: unknown }).row)
  )
    ? { col: (rawSpawn as { col: number }).col, row: (rawSpawn as { row: number }).row }
    : null

  if (layout.tileColors && layout.tileColors.length === layout.tiles.length) {
    return layout.agentSpawn === agentSpawn ? layout : { ...layout, agentSpawn }
  }

  // Check if any tiles use old values (1-4) — these map directly to FLOOR_1-4
  // but need color assignments
  const tileColors: Array<FloorColor | null> = []
  for (const tile of layout.tiles) {
    switch (tile) {
      case 0: // WALL
        tileColors.push(null)
        break
      case 1: // FLOOR_1 conference (blue-gray)
        tileColors.push(COLOR_CONFERENCE)
        break
      case 2: // FLOOR_2 main area (beige)
        tileColors.push(COLOR_MAIN)
        break
      case 3: // FLOOR_3 break area (purple)
        tileColors.push(COLOR_BREAK)
        break
      case 4: // was DOORWAY → FLOOR_4 tan
        tileColors.push(COLOR_DOORWAY)
        break
      case 5: // FLOOR_5 polished concrete (entry/reception)
        tileColors.push(COLOR_ENTRY)
        break
      case 6: // FLOOR_6 warm amber (offices)
        tileColors.push(COLOR_OFFICE)
        break
      default:
        // Other tile types without colors — use neutral gray
        tileColors.push(tile > 0 ? { h: 0, s: 0, b: 0, c: 0 } : null)
    }
  }

  return { ...layout, tileColors, agentSpawn }
}
