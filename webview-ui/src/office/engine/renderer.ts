// Re-export everything from the render/ directory for backwards compatibility
export {
  renderFrame,
  renderTileGrid,
  renderGridOverlay,
  renderCoordOverlay,
  renderTypesOverlay,
  renderScene,
  renderSeatIndicators,
  renderCoffeeCups,
  renderSmoking,
  renderBubbles,
  renderTeamLines,
  renderGhostBorder,
  renderGhostPreview,
  renderSelectionHighlight,
  renderSpawnHighlight,
  renderSpawnHover,
  renderDeleteButton,
  renderRotateButton,
} from './render/index.js'
export type {
  ButtonBounds,
  DeleteButtonBounds,
  RotateButtonBounds,
  EditorRenderState,
  SelectionRenderState,
} from './render/index.js'
