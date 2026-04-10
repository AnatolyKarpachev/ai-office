import { TILE_SIZE, CharacterState } from '../../types.js'
import type { FurnitureInstance, Character, Seat } from '../../types.js'
import { getCachedSprite, getOutlineSprite } from '../../sprites/spriteCache.js'
import { getCharacterSprites, COFFEE_CUP_SPRITE_A, COFFEE_CUP_SPRITE_B, SMOKING_SPRITE_A, SMOKING_SPRITE_B } from '../../sprites/spriteData.js'
import { getCharacterSprite } from '../characters.js'
import { renderMatrixEffect } from '../matrixEffect.js'
import {
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_Z_SORT_OFFSET,
  OUTLINE_Z_SORT_OFFSET,
  SELECTED_OUTLINE_ALPHA,
  HOVERED_OUTLINE_ALPHA,
  SEAT_OWN_COLOR,
  SEAT_AVAILABLE_COLOR,
  SEAT_BUSY_COLOR,
} from '../../../constants.js'

interface ZDrawable {
  zY: number
  draw: (ctx: CanvasRenderingContext2D) => void
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  furniture: FurnitureInstance[],
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
  selectedAgentId: number | null,
  hoveredAgentId: number | null,
): void {
  const drawables: ZDrawable[] = []

  // Furniture
  for (const f of furniture) {
    const cached = getCachedSprite(f.sprite, zoom)
    const fx = offsetX + f.x * zoom
    const fy = offsetY + f.y * zoom
    if (f.mirrored) {
      drawables.push({
        zY: f.zY,
        draw: (c) => {
          c.save()
          c.translate(fx + cached.width, fy)
          c.scale(-1, 1)
          c.drawImage(cached, 0, 0)
          c.restore()
        },
      })
    } else {
      drawables.push({
        zY: f.zY,
        draw: (c) => {
          c.drawImage(cached, fx, fy)
        },
      })
    }
  }

  // Characters
  for (const ch of characters) {
    const sprites = getCharacterSprites(ch.palette, ch.hueShift)
    const spriteData = getCharacterSprite(ch, sprites)
    const cached = getCachedSprite(spriteData, zoom)
    // Sitting offset: shift character down when seated so they visually sit in the chair
    const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0
    // Anchor at bottom-center of character — round to integer device pixels
    const drawX = Math.round(offsetX + ch.x * zoom - cached.width / 2)
    const drawY = Math.round(offsetY + (ch.y + sittingOffset) * zoom - cached.height)

    // Sort characters by bottom of their tile (not center) so they render
    // in front of same-row furniture (e.g. chairs) but behind furniture
    // at lower rows (e.g. desks, bookshelves that occlude from below).
    const charZY = ch.y + TILE_SIZE / 2 + CHARACTER_Z_SORT_OFFSET

    // Matrix spawn/despawn effect — skip outline, use per-pixel rendering
    if (ch.matrixEffect) {
      const mDrawX = drawX
      const mDrawY = drawY
      const mSpriteData = spriteData
      const mCh = ch
      drawables.push({
        zY: charZY,
        draw: (c) => {
          renderMatrixEffect(c, mCh, mSpriteData, mDrawX, mDrawY, zoom)
        },
      })
      continue
    }

    // White outline: full opacity for selected, 50% for hover
    const isSelected = selectedAgentId !== null && ch.id === selectedAgentId
    const isHovered = hoveredAgentId !== null && ch.id === hoveredAgentId
    if (isSelected || isHovered) {
      const outlineAlpha = isSelected ? SELECTED_OUTLINE_ALPHA : HOVERED_OUTLINE_ALPHA
      const outlineData = getOutlineSprite(spriteData)
      const outlineCached = getCachedSprite(outlineData, zoom)
      const olDrawX = drawX - zoom  // 1 sprite-pixel offset, scaled
      const olDrawY = drawY - zoom  // outline follows sitting offset via drawY
      drawables.push({
        zY: charZY - OUTLINE_Z_SORT_OFFSET, // sort just before character
        draw: (c) => {
          c.save()
          c.globalAlpha = outlineAlpha
          c.drawImage(outlineCached, olDrawX, olDrawY)
          c.restore()
        },
      })
    }

    drawables.push({
      zY: charZY,
      draw: (c) => {
        c.drawImage(cached, drawX, drawY)
      },
    })
  }

  // Sort by Y (lower = in front = drawn later)
  drawables.sort((a, b) => a.zY - b.zY)

  for (const d of drawables) {
    d.draw(ctx)
  }
}

// ── Seat indicators ─────────────────────────────────────────────

export function renderSeatIndicators(
  ctx: CanvasRenderingContext2D,
  seats: Map<string, Seat>,
  characters: Map<number, Character>,
  selectedAgentId: number | null,
  hoveredTile: { col: number; row: number } | null,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  if (selectedAgentId === null || !hoveredTile) return
  const selectedChar = characters.get(selectedAgentId)
  if (!selectedChar) return

  // Only show indicator for the hovered seat tile
  for (const [uid, seat] of seats) {
    if (seat.seatCol !== hoveredTile.col || seat.seatRow !== hoveredTile.row) continue

    const s = TILE_SIZE * zoom
    const x = offsetX + seat.seatCol * s
    const y = offsetY + seat.seatRow * s

    if (selectedChar.seatId === uid) {
      // Selected agent's own seat — blue
      ctx.fillStyle = SEAT_OWN_COLOR
    } else if (!seat.assigned) {
      // Available seat — green
      ctx.fillStyle = SEAT_AVAILABLE_COLOR
    } else {
      // Busy (assigned to another agent) — red
      ctx.fillStyle = SEAT_BUSY_COLOR
    }
    ctx.fillRect(x, y, s, s)
    break
  }
}

// ── Coffee cup overlay ─────────────────────────────────────────

export function renderCoffeeCups(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  // Animate steam: toggle sprite frame every 0.5s using wall-clock time
  const steamFrame = Math.floor(Date.now() / 500) % 2 === 0
  const cupSprite = steamFrame ? COFFEE_CUP_SPRITE_A : COFFEE_CUP_SPRITE_B

  for (const ch of characters) {
    if (ch.coffeeBreakTimer <= 0) continue
    if (ch.matrixEffect) continue
    if (ch.state === CharacterState.TYPE) continue // sitting — no cup

    const cached = getCachedSprite(cupSprite, zoom)
    const cupY = Math.round(offsetY + (ch.y - 18) * zoom)

    ctx.save()
    if (ch.dir === 1) { // LEFT — mirror to left side
      const leftX = Math.round(offsetX + (ch.x - 3) * zoom)
      ctx.translate(leftX, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(cached, -cached.width, cupY)
    } else if (ch.dir === 3) { // UP — behind character
      ctx.globalAlpha = 0.5
      const cupX = Math.round(offsetX + (ch.x + 3) * zoom)
      ctx.drawImage(cached, cupX, cupY - Math.round(2 * zoom))
    } else { // RIGHT or DOWN
      const cupX = Math.round(offsetX + (ch.x + 3) * zoom)
      ctx.drawImage(cached, cupX, cupY)
    }
    ctx.restore()
  }
}

// ── Smoking overlay ───────────────────────────────────────────

export function renderSmoking(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const smokeFrame = Math.floor(Date.now() / 600) % 2 === 0
  const smokeSprite = smokeFrame ? SMOKING_SPRITE_A : SMOKING_SPRITE_B

  for (const ch of characters) {
    if (ch.smokingBreakTimer <= 0) continue
    if (ch.matrixEffect) continue
    if (ch.state === CharacterState.TYPE) continue // sitting — no smoking

    const cached = getCachedSprite(smokeSprite, zoom)
    const sy = Math.round(offsetY + (ch.y - 16) * zoom)

    ctx.save()
    if (ch.dir === 1) { // LEFT — mirror to left side
      const leftX = Math.round(offsetX + (ch.x - 3) * zoom)
      ctx.translate(leftX, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(cached, -cached.width, sy)
    } else if (ch.dir === 3) { // UP — behind character
      ctx.globalAlpha = 0.5
      const sx = Math.round(offsetX + (ch.x + 3) * zoom)
      ctx.drawImage(cached, sx, sy - Math.round(2 * zoom))
    } else { // RIGHT or DOWN
      const sx = Math.round(offsetX + (ch.x + 3) * zoom)
      ctx.drawImage(cached, sx, sy)
    }
    ctx.restore()
  }
}
