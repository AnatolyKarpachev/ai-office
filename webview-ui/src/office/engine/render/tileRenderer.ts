import { TileType, TILE_SIZE } from '../../types.js'
import type { TileType as TileTypeVal, FloorColor } from '../../types.js'
import { getCachedSprite } from '../../sprites/spriteCache.js'
import { getColorizedFloorSprite, hasFloorSprites, WALL_COLOR } from '../../floorTiles.js'
import { wallColorToHex } from '../../wallTiles.js'
import {
  FALLBACK_FLOOR_COLOR,
  GRID_LINE_COLOR,
  VOID_TILE_OUTLINE_COLOR,
  VOID_TILE_DASH_PATTERN,
} from '../../../constants.js'

export function renderTileGrid(
  ctx: CanvasRenderingContext2D,
  tileMap: TileTypeVal[][],
  offsetX: number,
  offsetY: number,
  zoom: number,
  tileColors?: Array<FloorColor | null>,
  cols?: number,
): void {
  const s = TILE_SIZE * zoom
  const useSpriteFloors = hasFloorSprites()
  const tmRows = tileMap.length
  const tmCols = tmRows > 0 ? tileMap[0].length : 0
  const layoutCols = cols ?? tmCols

  // Floor tiles + wall base color
  for (let r = 0; r < tmRows; r++) {
    for (let c = 0; c < tmCols; c++) {
      const tile = tileMap[r][c]

      // Skip VOID tiles entirely (transparent)
      if (tile === TileType.VOID) continue

      if (tile === TileType.WALL || !useSpriteFloors) {
        // Wall tiles or fallback: solid color
        if (tile === TileType.WALL) {
          const colorIdx = r * layoutCols + c
          const wallColor = tileColors?.[colorIdx]
          ctx.fillStyle = wallColor ? wallColorToHex(wallColor) : WALL_COLOR
        } else {
          ctx.fillStyle = FALLBACK_FLOOR_COLOR
        }
        ctx.fillRect(offsetX + c * s, offsetY + r * s, s, s)
        continue
      }

      // Floor tile: get colorized sprite
      const colorIdx = r * layoutCols + c
      const color = tileColors?.[colorIdx] ?? { h: 0, s: 0, b: 0, c: 0 }
      const sprite = getColorizedFloorSprite(tile, color)
      const cached = getCachedSprite(sprite, zoom)
      ctx.drawImage(cached, offsetX + c * s, offsetY + r * s)
    }
  }

}

export function renderGridOverlay(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  zoom: number,
  cols: number,
  rows: number,
  tileMap?: TileTypeVal[][],
): void {
  const s = TILE_SIZE * zoom
  ctx.strokeStyle = GRID_LINE_COLOR
  ctx.lineWidth = 1
  ctx.beginPath()
  // Vertical lines — offset by 0.5 for crisp 1px lines
  for (let c = 0; c <= cols; c++) {
    const x = offsetX + c * s + 0.5
    ctx.moveTo(x, offsetY)
    ctx.lineTo(x, offsetY + rows * s)
  }
  // Horizontal lines
  for (let r = 0; r <= rows; r++) {
    const y = offsetY + r * s + 0.5
    ctx.moveTo(offsetX, y)
    ctx.lineTo(offsetX + cols * s, y)
  }
  ctx.stroke()

  // Draw faint dashed outlines on VOID tiles
  if (tileMap) {
    ctx.save()
    ctx.strokeStyle = VOID_TILE_OUTLINE_COLOR
    ctx.lineWidth = 1
    ctx.setLineDash(VOID_TILE_DASH_PATTERN)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (tileMap[r]?.[c] === TileType.VOID) {
          ctx.strokeRect(offsetX + c * s + 0.5, offsetY + r * s + 0.5, s - 1, s - 1)
        }
      }
    }
    ctx.restore()
  }
}

/** Draw coordinate labels on each tile */
export function renderCoordOverlay(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  zoom: number,
  cols: number,
  rows: number,
): void {
  const s = TILE_SIZE * zoom
  // Only show coords when tiles are large enough to read
  if (s < 20) return
  const fontSize = Math.max(7, Math.min(10, s * 0.35))
  ctx.save()
  ctx.font = `${fontSize}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(255, 255, 200, 0.6)'
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = offsetX + c * s + s / 2
      const y = offsetY + r * s + s / 2
      ctx.fillText(`${c},${r}`, x, y)
    }
  }
  ctx.restore()
}

/** Draw tile type overlay: red=desk, blue=lounge, yellow=blocked, purple=unreachable seat */
export function renderTypesOverlay(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  zoom: number,
  cols: number,
  rows: number,
  tileMap: TileTypeVal[][],
  data: { seats: Map<string, { isLounge: boolean }>; blockedTiles: Set<string>; walkableTiles: Set<string> },
): void {
  const s = TILE_SIZE * zoom
  const bw = Math.max(1, Math.min(3, zoom * 1.5)) // border width scales with zoom
  ctx.save()
  ctx.lineWidth = bw

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${c},${r}`
      const t = tileMap[r]?.[c]
      const isWall = t === TileType.WALL || t === TileType.VOID
      const blocked = data.blockedTiles.has(key)
      const walkable = !isWall && !blocked
      const seat = data.seats.get(key)

      let color: string | null = null
      if (seat && !seat.isLounge && walkable) {
        color = 'rgba(255, 60, 60, 0.8)' // red — desk seat (walkable & sittable)
      } else if (seat && seat.isLounge) {
        color = 'rgba(60, 120, 255, 0.8)' // blue — lounge seat (sittable, not walk-through)
      } else if (seat && !walkable) {
        color = 'rgba(180, 60, 255, 0.8)' // purple — desk seat but unreachable
      } else if (!walkable && !isWall) {
        color = 'rgba(255, 200, 0, 0.6)' // yellow — blocked (not wall)
      }

      if (color) {
        const x = offsetX + c * s
        const y = offsetY + r * s
        ctx.strokeStyle = color
        ctx.strokeRect(x + bw / 2, y + bw / 2, s - bw, s - bw)
      }
    }
  }
  ctx.restore()
}
