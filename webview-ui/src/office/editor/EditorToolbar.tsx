import { useCallback, useEffect, useRef, useState } from 'react'

import { getColorizedSprite } from '../colorize.js'
import { getColorizedFloorSprite, getVisibleFloorPatternIndices, hasFloorSprites } from '../floorTiles.js'
import type { FurnitureCategory, LoadedAssetData } from '../layout/furnitureCatalog.js'
import { getWallSetCount, getWallSetPreviewSprite } from '../wallTiles.js'
import {
  buildDynamicCatalog,
  getActiveCategories,
  getCatalogByCategory,
} from '../layout/furnitureCatalog.js'
import { getCachedSprite } from '../sprites/spriteCache.js'
import type { AgentSpawnPoint, FloorColor, TileType as TileTypeVal } from '../types.js'
import { EditTool } from '../types.js'

const btnCls = "px-2 py-[3px] text-[22px] leading-none bg-pixel-btn text-white/70 border-2 border-transparent cursor-pointer hover:bg-pixel-btn-hover"
const activeBtnCls = "px-2 py-[3px] text-[22px] leading-none bg-pixel-active text-white/90 border-2 border-pixel-accent cursor-pointer"
const tabCls = "px-1.5 py-0.5 text-[20px] leading-none bg-transparent text-white/50 border-2 border-transparent cursor-pointer hover:bg-pixel-btn"
const activeTabCls = "px-1.5 py-0.5 text-[20px] leading-none bg-pixel-btn text-white/80 border-2 border-pixel-accent cursor-pointer"
const previewBtnCls = "p-0 cursor-pointer overflow-hidden shrink-0 bg-[#2A2A3A] box-content"
const colorPanelCls = "flex flex-col gap-[3px] px-1.5 py-1 bg-[#181828] border-2 border-pixel-border"
const subPanelCls = "flex flex-col gap-1.5 px-2 py-1.5 bg-[#181828] border-2 border-pixel-border"

interface EditorToolbarProps {
  activeTool: EditTool
  selectedTileType: TileTypeVal
  selectedFurnitureType: string
  selectedFurnitureUid: string | null
  selectedFurnitureColor: FloorColor | null
  agentSpawn: AgentSpawnPoint | null | undefined
  isSelectingSpawn: boolean
  floorColor: FloorColor
  wallColor: FloorColor
  selectedWallSet: number
  onToolChange: (tool: EditTool) => void
  onToggleSpawnEdit: () => void
  onClearAgentSpawn: () => void
  onTileTypeChange: (type: TileTypeVal) => void
  onFloorColorChange: (color: FloorColor) => void
  onWallColorChange: (color: FloorColor) => void
  onWallSetChange: (setIndex: number) => void
  onSelectedFurnitureColorChange: (color: FloorColor | null) => void
  onFurnitureTypeChange: (type: string) => void
  showCoords: boolean
  onToggleCoords: () => void
  showTypes: boolean
  onToggleTypes: () => void
  loadedAssets?: LoadedAssetData
}

function FloorPatternPreview({ patternIndex, color, selected, onClick }: {
  patternIndex: number; color: FloorColor; selected: boolean; onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const displaySize = 32
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = displaySize; canvas.height = displaySize; ctx.imageSmoothingEnabled = false
    if (!hasFloorSprites()) { ctx.fillStyle = '#444'; ctx.fillRect(0, 0, displaySize, displaySize); return }
    const sprite = getColorizedFloorSprite(patternIndex, color)
    ctx.drawImage(getCachedSprite(sprite, 2), 0, 0)
  }, [patternIndex, color])

  return (
    <button onClick={onClick} title={`Floor ${patternIndex}`}
      className={previewBtnCls}
      style={{ width: displaySize, height: displaySize, border: selected ? '2px solid #5a8cff' : '2px solid #4a4a6a' }}>
      <canvas ref={canvasRef} style={{ width: displaySize, height: displaySize, display: 'block' }} />
    </button>
  )
}

function WallSetPreview({ setIndex, color, selected, onClick }: {
  setIndex: number; color: FloorColor; selected: boolean; onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const displayW = 32; const displayH = 64
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = displayW; canvas.height = displayH; ctx.imageSmoothingEnabled = false
    const sprite = getWallSetPreviewSprite(setIndex)
    if (!sprite) { ctx.fillStyle = '#444'; ctx.fillRect(0, 0, displayW, displayH); return }
    const cacheKey = `wall-preview-${setIndex}-${color.h}-${color.s}-${color.b}-${color.c}`
    const colorized = getColorizedSprite(cacheKey, sprite, { ...color, colorize: true })
    ctx.drawImage(getCachedSprite(colorized, 2), 0, 0)
  }, [setIndex, color])

  return (
    <button onClick={onClick} title={`Wall ${setIndex + 1}`}
      className={previewBtnCls}
      style={{ width: displayW, height: displayH, border: selected ? '2px solid #5a8cff' : '2px solid #4a4a6a' }}>
      <canvas ref={canvasRef} style={{ width: displayW, height: displayH, display: 'block' }} />
    </button>
  )
}

function ColorSlider({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[20px] text-[#999] w-7 text-right shrink-0">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-3" style={{ accentColor: 'rgba(90, 140, 255, 0.8)' }} />
      <span className="text-[20px] text-[#999] w-12 text-right shrink-0">{value}</span>
    </div>
  )
}

const DEFAULT_FURNITURE_COLOR: FloorColor = { h: 0, s: 0, b: 0, c: 0 }

export function EditorToolbar({
  activeTool, selectedTileType, selectedFurnitureType, selectedFurnitureUid, selectedFurnitureColor,
  agentSpawn, isSelectingSpawn, floorColor, wallColor, selectedWallSet,
  onToolChange, onToggleSpawnEdit, onClearAgentSpawn, onTileTypeChange,
  onFloorColorChange, onWallColorChange, onWallSetChange, onSelectedFurnitureColorChange,
  onFurnitureTypeChange, showCoords, onToggleCoords, showTypes, onToggleTypes, loadedAssets,
}: EditorToolbarProps) {
  const [activeCategory, setActiveCategory] = useState<FurnitureCategory>('desks')
  const [showColor, setShowColor] = useState(false)
  const [showWallColor, setShowWallColor] = useState(false)
  const [showFurnitureColor, setShowFurnitureColor] = useState(false)

  useEffect(() => {
    if (loadedAssets) {
      try {
        buildDynamicCatalog(loadedAssets)
        const cats = getActiveCategories()
        if (cats.length > 0 && cats[0]?.id) setActiveCategory(cats[0].id)
      } catch (err) { console.error(`[EditorToolbar] Error building catalog:`, err) }
    }
  }, [loadedAssets])

  const handleColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onFloorColorChange({ ...floorColor, [key]: value })
  }, [floorColor, onFloorColorChange])

  const handleWallColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onWallColorChange({ ...wallColor, [key]: value })
  }, [wallColor, onWallColorChange])

  const effectiveColor = selectedFurnitureColor ?? DEFAULT_FURNITURE_COLOR
  const handleSelFurnColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onSelectedFurnitureColorChange({ ...effectiveColor, [key]: value })
  }, [effectiveColor, onSelectedFurnitureColorChange])

  const categoryItems = getCatalogByCategory(activeCategory)
  const floorPatterns = getVisibleFloorPatternIndices()
  const thumbSize = 36

  const isFloorActive = activeTool === EditTool.TILE_PAINT || activeTool === EditTool.EYEDROPPER
  const isWallActive = activeTool === EditTool.WALL_PAINT
  const isEraseActive = activeTool === EditTool.ERASE
  const isFurnitureActive = activeTool === EditTool.FURNITURE_PLACE || activeTool === EditTool.FURNITURE_PICK

  return (
    <div className="absolute bottom-[68px] left-2.5 z-controls bg-pixel-bg border-2 border-pixel-border px-2 py-1.5 flex flex-col-reverse gap-1.5 shadow-pixel max-w-[calc(100vw-20px)]">
      {/* Tool row */}
      <div className="flex gap-1 flex-wrap">
        <button className={isFloorActive ? activeBtnCls : btnCls} onClick={() => onToolChange(EditTool.TILE_PAINT)} title="Paint floor tiles">Floor</button>
        <button className={isWallActive ? activeBtnCls : btnCls} onClick={() => onToolChange(EditTool.WALL_PAINT)} title="Paint walls">Wall</button>
        <button className={isEraseActive ? activeBtnCls : btnCls} onClick={() => onToolChange(EditTool.ERASE)} title="Erase tiles">Erase</button>
        <button className={isFurnitureActive ? activeBtnCls : btnCls} onClick={() => onToolChange(EditTool.FURNITURE_PLACE)} title="Place furniture">Furniture</button>
        <button className={showCoords ? activeBtnCls : btnCls} onClick={onToggleCoords} title="Show tile coordinates">Coords</button>
        <button className={showTypes ? activeBtnCls : btnCls} onClick={onToggleTypes} title="Red=desk, Blue=lounge, Yellow=blocked, Purple=unreachable seat">Types</button>
        <button
          className={isSelectingSpawn ? `${activeBtnCls} !bg-[rgba(200,60,60,0.28)] !border-[#ff5a5a]` : btnCls}
          onClick={onToggleSpawnEdit} title="Pick and manage spawn position">Spawn</button>
      </div>

      {/* Spawn panel */}
      {isSelectingSpawn && (
        <div className={subPanelCls}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[20px] text-white/85">Spawn Position</span>
            <span className="text-[18px] text-[#ff7a7a]">{agentSpawn ? `${agentSpawn.col},${agentSpawn.row}` : 'Auto'}</span>
          </div>
          <div className="flex gap-1 flex-wrap">
            <button className={!agentSpawn ? activeBtnCls : btnCls} onClick={onClearAgentSpawn} title="Use automatic spawn">Auto</button>
          </div>
          <div className="text-[18px] text-white/50 leading-tight">Click any available floor tile to set the spawn point.</div>
        </div>
      )}

      {/* Floor sub-panel */}
      {isFloorActive && (
        <div className="flex flex-col-reverse gap-1.5">
          <div className="flex gap-1 items-center">
            <button className={showColor ? activeBtnCls : btnCls} onClick={() => setShowColor((v) => !v)} title="Adjust floor color">Color</button>
            <button className={activeTool === EditTool.EYEDROPPER ? activeBtnCls : btnCls} onClick={() => onToolChange(EditTool.EYEDROPPER)} title="Pick floor pattern">Pick</button>
          </div>
          {showColor && (
            <div className={colorPanelCls}>
              <ColorSlider label="H" value={floorColor.h} min={0} max={360} onChange={(v) => handleColorChange('h', v)} />
              <ColorSlider label="S" value={floorColor.s} min={0} max={100} onChange={(v) => handleColorChange('s', v)} />
              <ColorSlider label="B" value={floorColor.b} min={-100} max={100} onChange={(v) => handleColorChange('b', v)} />
              <ColorSlider label="C" value={floorColor.c} min={-100} max={100} onChange={(v) => handleColorChange('c', v)} />
            </div>
          )}
          <div className="flex gap-1 overflow-x-auto flex-nowrap pb-0.5">
            {floorPatterns.map((patIdx) => (
              <FloorPatternPreview key={patIdx} patternIndex={patIdx} color={floorColor} selected={selectedTileType === patIdx} onClick={() => onTileTypeChange(patIdx as TileTypeVal)} />
            ))}
          </div>
        </div>
      )}

      {/* Wall sub-panel */}
      {isWallActive && (
        <div className="flex flex-col-reverse gap-1.5">
          <div className="flex gap-1 items-center">
            <button className={showWallColor ? activeBtnCls : btnCls} onClick={() => setShowWallColor((v) => !v)} title="Adjust wall color">Color</button>
          </div>
          {showWallColor && (
            <div className={colorPanelCls}>
              <ColorSlider label="H" value={wallColor.h} min={0} max={360} onChange={(v) => handleWallColorChange('h', v)} />
              <ColorSlider label="S" value={wallColor.s} min={0} max={100} onChange={(v) => handleWallColorChange('s', v)} />
              <ColorSlider label="B" value={wallColor.b} min={-100} max={100} onChange={(v) => handleWallColorChange('b', v)} />
              <ColorSlider label="C" value={wallColor.c} min={-100} max={100} onChange={(v) => handleWallColorChange('c', v)} />
            </div>
          )}
          {getWallSetCount() > 0 && (
            <div className="flex gap-1 overflow-x-auto flex-nowrap pb-0.5">
              {Array.from({ length: getWallSetCount() }, (_, i) => (
                <WallSetPreview key={i} setIndex={i} color={wallColor} selected={selectedWallSet === i} onClick={() => onWallSetChange(i)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Furniture sub-panel */}
      {isFurnitureActive && (
        <div className="flex flex-col-reverse gap-1">
          <div className="flex gap-0.5 flex-wrap items-center">
            {getActiveCategories().map((cat) => (
              <button key={cat.id} className={activeCategory === cat.id ? activeTabCls : tabCls} onClick={() => setActiveCategory(cat.id)}>{cat.label}</button>
            ))}
            <div className="w-px h-3.5 bg-white/15 mx-0.5 shrink-0" />
            <button className={activeTool === EditTool.FURNITURE_PICK ? activeBtnCls : btnCls} onClick={() => onToolChange(EditTool.FURNITURE_PICK)} title="Pick furniture type">Pick</button>
          </div>
          <div className="flex gap-1 overflow-x-auto flex-nowrap pb-0.5">
            {categoryItems.map((entry) => {
              const cached = getCachedSprite(entry.sprite, 2)
              const isSelected = selectedFurnitureType === entry.type
              return (
                <button key={entry.type} onClick={() => onFurnitureTypeChange(entry.type)} title={entry.label}
                  className={`${previewBtnCls} flex items-center justify-center`}
                  style={{ width: thumbSize, height: thumbSize, border: isSelected ? '2px solid #5a8cff' : '2px solid #4a4a6a' }}>
                  <canvas
                    ref={(el) => {
                      if (!el) return
                      const ctx = el.getContext('2d')
                      if (!ctx) return
                      const scale = Math.min(thumbSize / cached.width, thumbSize / cached.height) * 0.85
                      el.width = thumbSize; el.height = thumbSize; ctx.imageSmoothingEnabled = false
                      ctx.clearRect(0, 0, thumbSize, thumbSize)
                      const dw = cached.width * scale; const dh = cached.height * scale
                      ctx.drawImage(cached, (thumbSize - dw) / 2, (thumbSize - dh) / 2, dw, dh)
                    }}
                    style={{ width: thumbSize, height: thumbSize }}
                  />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Selected furniture color */}
      {selectedFurnitureUid && (
        <div className="flex flex-col-reverse gap-[3px]">
          <div className="flex gap-1 items-center">
            <button className={showFurnitureColor ? activeBtnCls : btnCls} onClick={() => setShowFurnitureColor((v) => !v)} title="Adjust selected furniture color">Color</button>
            {selectedFurnitureColor && (
              <button className={`${btnCls} !text-[20px] !px-1.5 !py-0.5`} onClick={() => onSelectedFurnitureColorChange(null)} title="Remove color">Clear</button>
            )}
          </div>
          {showFurnitureColor && (
            <div className={colorPanelCls}>
              {effectiveColor.colorize ? (
                <>
                  <ColorSlider label="H" value={effectiveColor.h} min={0} max={360} onChange={(v) => handleSelFurnColorChange('h', v)} />
                  <ColorSlider label="S" value={effectiveColor.s} min={0} max={100} onChange={(v) => handleSelFurnColorChange('s', v)} />
                </>
              ) : (
                <>
                  <ColorSlider label="H" value={effectiveColor.h} min={-180} max={180} onChange={(v) => handleSelFurnColorChange('h', v)} />
                  <ColorSlider label="S" value={effectiveColor.s} min={-100} max={100} onChange={(v) => handleSelFurnColorChange('s', v)} />
                </>
              )}
              <ColorSlider label="B" value={effectiveColor.b} min={-100} max={100} onChange={(v) => handleSelFurnColorChange('b', v)} />
              <ColorSlider label="C" value={effectiveColor.c} min={-100} max={100} onChange={(v) => handleSelFurnColorChange('c', v)} />
              <label className="flex items-center gap-1 text-[20px] text-[#999] cursor-pointer">
                <input type="checkbox" checked={!!effectiveColor.colorize}
                  onChange={(e) => onSelectedFurnitureColorChange({ ...effectiveColor, colorize: e.target.checked || undefined })}
                  style={{ accentColor: 'rgba(90, 140, 255, 0.8)' }} />
                Colorize
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
