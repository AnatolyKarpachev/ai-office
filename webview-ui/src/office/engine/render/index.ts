import { TILE_SIZE } from '../../types.js'
import type { TileType as TileTypeVal, FurnitureInstance, Character, FloorColor } from '../../types.js'
import { hasWallSprites, getWallInstances } from '../../wallTiles.js'
import type { EditorRenderState, SelectionRenderState } from './types.js'

import { renderTileGrid } from './tileRenderer.js'
import { renderScene, renderSeatIndicators, renderCoffeeCups, renderSmoking } from './entityRenderer.js'
import { renderBubbles, renderTeamLines } from './bubbleRenderer.js'
import {
  renderGhostBorder,
  renderGhostPreview,
  renderSelectionHighlight,
  renderSpawnHighlight,
  renderSpawnHover,
  renderDeleteButton,
  renderRotateButton,
} from './editorRenderer.js'
import { renderGridOverlay, renderCoordOverlay, renderTypesOverlay } from './tileRenderer.js'

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  tileMap: TileTypeVal[][],
  furniture: FurnitureInstance[],
  characters: Character[],
  zoom: number,
  panX: number,
  panY: number,
  selection?: SelectionRenderState,
  editor?: EditorRenderState,
  tileColors?: Array<FloorColor | null>,
  layoutCols?: number,
  layoutRows?: number,
  showTeamLines?: boolean,
): { offsetX: number; offsetY: number } {
  // Clear
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  // Use layout dimensions (fallback to tileMap size)
  const cols = layoutCols ?? (tileMap.length > 0 ? tileMap[0].length : 0)
  const rows = layoutRows ?? tileMap.length

  // Center map in viewport + pan offset (integer device pixels)
  const mapW = cols * TILE_SIZE * zoom
  const mapH = rows * TILE_SIZE * zoom
  const offsetX = Math.floor((canvasWidth - mapW) / 2) + Math.round(panX)
  const offsetY = Math.floor((canvasHeight - mapH) / 2) + Math.round(panY)

  // Draw tiles (floor + wall base color)
  renderTileGrid(ctx, tileMap, offsetX, offsetY, zoom, tileColors, layoutCols)

  // Seat indicators (below furniture/characters, on top of floor)
  if (selection) {
    renderSeatIndicators(ctx, selection.seats, selection.characters, selection.selectedAgentId, selection.hoveredTile, offsetX, offsetY, zoom)
  }

  // Build wall instances for z-sorting with furniture and characters
  const wallInstances = hasWallSprites()
    ? getWallInstances(tileMap, tileColors, layoutCols)
    : []
  const allFurniture = wallInstances.length > 0
    ? [...wallInstances, ...furniture]
    : furniture

  // Draw walls + furniture + characters (z-sorted)
  const selectedId = selection?.selectedAgentId ?? null
  const hoveredId = selection?.hoveredAgentId ?? null
  renderScene(ctx, allFurniture, characters, offsetX, offsetY, zoom, selectedId, hoveredId)

  // Coffee cup & smoking overlay (above characters, below bubbles)
  renderCoffeeCups(ctx, characters, offsetX, offsetY, zoom)
  renderSmoking(ctx, characters, offsetX, offsetY, zoom)

  // Team group lines (between characters and bubbles)
  if (showTeamLines) {
    renderTeamLines(ctx, characters, offsetX, offsetY, zoom)
  }

  // Speech bubbles (always on top of characters)
  renderBubbles(ctx, characters, offsetX, offsetY, zoom)

  // Editor overlays
  if (editor) {
    if (editor.showGrid) {
      renderGridOverlay(ctx, offsetX, offsetY, zoom, cols, rows, tileMap)
    }
    if (editor.showCoords) {
      renderCoordOverlay(ctx, offsetX, offsetY, zoom, cols, rows)
    }
    if (editor.showTypes && editor.typesData) {
      renderTypesOverlay(ctx, offsetX, offsetY, zoom, cols, rows, tileMap, editor.typesData)
    }
    if (editor.showGhostBorder) {
      renderGhostBorder(ctx, offsetX, offsetY, zoom, cols, rows, editor.ghostBorderHoverCol, editor.ghostBorderHoverRow)
    }
    if (editor.showSpawnMarker) {
      if (editor.spawnCol >= 0 && editor.spawnRow >= 0) {
        renderSpawnHighlight(ctx, editor.spawnCol, editor.spawnRow, offsetX, offsetY, zoom)
      }
      if (editor.spawnHoverCol >= 0 && editor.spawnHoverRow >= 0) {
        renderSpawnHover(ctx, editor.spawnHoverCol, editor.spawnHoverRow, offsetX, offsetY, zoom, editor.spawnHoverValid)
      }
    }
    if (editor.ghostSprite && editor.ghostCol >= 0) {
      renderGhostPreview(ctx, editor.ghostSprite, editor.ghostCol, editor.ghostRow, editor.ghostValid, offsetX, offsetY, zoom, editor.ghostMirrored)
    }
    if (editor.hasSelection) {
      renderSelectionHighlight(ctx, editor.selectedCol, editor.selectedRow, editor.selectedW, editor.selectedH, offsetX, offsetY, zoom)
      editor.deleteButtonBounds = renderDeleteButton(ctx, editor.selectedCol, editor.selectedRow, editor.selectedW, editor.selectedH, offsetX, offsetY, zoom)
      if (editor.isRotatable) {
        editor.rotateButtonBounds = renderRotateButton(ctx, editor.selectedCol, editor.selectedRow, editor.selectedW, editor.selectedH, offsetX, offsetY, zoom)
      } else {
        editor.rotateButtonBounds = null
      }
    } else {
      editor.deleteButtonBounds = null
      editor.rotateButtonBounds = null
    }
  }

  return { offsetX, offsetY }
}

// Re-export everything from sub-modules for backwards compatibility
export { renderTileGrid, renderGridOverlay, renderCoordOverlay, renderTypesOverlay } from './tileRenderer.js'
export { renderScene, renderSeatIndicators, renderCoffeeCups, renderSmoking } from './entityRenderer.js'
export { renderBubbles, renderTeamLines } from './bubbleRenderer.js'
export {
  renderGhostBorder,
  renderGhostPreview,
  renderSelectionHighlight,
  renderSpawnHighlight,
  renderSpawnHover,
  renderDeleteButton,
  renderRotateButton,
} from './editorRenderer.js'
export type {
  ButtonBounds,
  DeleteButtonBounds,
  RotateButtonBounds,
  EditorRenderState,
  SelectionRenderState,
} from './types.js'
