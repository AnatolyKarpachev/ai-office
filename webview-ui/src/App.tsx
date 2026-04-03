import { useCallback, useMemo, useRef, useState } from 'react'
import { BottomToolbar } from './components/BottomToolbar.js'
import { HudScreen } from './components/HudScreen.js'
import { LeftSidebar } from './components/LeftSidebar.js'
import { RightSidebar } from './components/RightSidebar.js'
import { ZoomControls } from './components/ZoomControls.js'
import { isShareMode } from './wsApi.js'
import { PULSE_ANIMATION_DURATION_SEC } from './constants.js'
import { useEditorActions } from './hooks/useEditorActions.js'
import { useEditorKeyboard } from './hooks/useEditorKeyboard.js'
import { useExtensionMessages } from './hooks/useExtensionMessages.js'
import { OfficeCanvas } from './office/components/OfficeCanvas.js'
import { ToolOverlay } from './office/components/ToolOverlay.js'
import { EditorState } from './office/editor/editorState.js'
import { EditorToolbar } from './office/editor/EditorToolbar.js'
import { OfficeState } from './office/engine/officeState.js'
import { deserializeLayout, serializeLayout } from './office/layout/index.js'
import { isRotatable } from './office/layout/furnitureCatalog.js'
import { EditTool } from './office/types.js'
import { vscode } from './vscodeApi.js'

// Game state lives outside React — updated imperatively by message handlers
const officeStateRef = { current: null as OfficeState | null }
const editorState = new EditorState()

function getOfficeState(): OfficeState {
  if (!officeStateRef.current) {
    officeStateRef.current = new OfficeState()
  }
  return officeStateRef.current
}

const actionBarBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '22px',
  background: 'var(--pixel-btn-bg)',
  color: 'var(--pixel-text-dim)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}

const actionBarBtnDisabled: React.CSSProperties = {
  ...actionBarBtnStyle,
  opacity: 'var(--pixel-btn-disabled-opacity)',
  cursor: 'default',
}

const actionBarSaveBtnStyle: React.CSSProperties = {
  ...actionBarBtnStyle,
  background: 'rgba(46, 160, 67, 0.22)',
  color: '#d7ffe0',
  border: '2px solid rgba(46, 160, 67, 0.85)',
}

const actionBarResetBtnStyle: React.CSSProperties = {
  ...actionBarBtnStyle,
  background: 'rgba(198, 59, 59, 0.22)',
  color: '#ffd7d7',
  border: '2px solid rgba(198, 59, 59, 0.85)',
}

function EditActionBar({ editor, editorState: es }: { editor: ReturnType<typeof useEditorActions>; editorState: EditorState }) {
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const undoDisabled = es.undoStack.length === 0
  const redoDisabled = es.redoStack.length === 0

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--pixel-controls-z)',
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        background: 'var(--pixel-bg)',
        border: '2px solid var(--pixel-border)',
        borderRadius: 0,
        padding: '4px 8px',
        boxShadow: 'var(--pixel-shadow)',
      }}
    >
      <button
        style={undoDisabled ? actionBarBtnDisabled : actionBarBtnStyle}
        onClick={undoDisabled ? undefined : editor.handleUndo}
        title="Undo (Ctrl+Z)"
      >
        Undo
      </button>
      <button
        style={redoDisabled ? actionBarBtnDisabled : actionBarBtnStyle}
        onClick={redoDisabled ? undefined : editor.handleRedo}
        title="Redo (Ctrl+Y)"
      >
        Redo
      </button>
      <button
        style={actionBarSaveBtnStyle}
        onClick={editor.handleSave}
        title="Save layout"
      >
        Save
      </button>
      {!showResetConfirm ? (
        <button
          style={actionBarResetBtnStyle}
          onClick={() => setShowResetConfirm(true)}
          title="Reset to last saved layout"
        >
          Reset
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: '22px', color: 'var(--pixel-reset-text)' }}>Reset?</span>
          <button
            style={{ ...actionBarBtnStyle, background: 'var(--pixel-danger-bg)', color: '#fff' }}
            onClick={() => { setShowResetConfirm(false); editor.handleReset() }}
          >
            Yes
          </button>
          <button
            style={actionBarBtnStyle}
            onClick={() => setShowResetConfirm(false)}
          >
            No
          </button>
        </div>
      )}
    </div>
  )
}

function App() {
  const editor = useEditorActions(getOfficeState, editorState)

  const isEditDirty = useCallback(() => editor.isEditMode && editor.isDirty, [editor.isEditMode, editor.isDirty])

  const { agents, selectedAgent, agentTools, agentStatuses, subagentTools, subagentCharacters, layoutReady, layoutWasReset, loadedAssets, githubTasks, agentStats, agentRoles, agentDetails, requestAgentDetails, agentConversation, requestAgentConversation, pipelineIssues, sendMessages, serverMode } = useExtensionMessages(getOfficeState, editor.setLastSavedLayout, isEditDirty)

  // Deep inspection panel state
  const [inspectedAgentId, setInspectedAgentId] = useState<number | null>(null)

  const handleInspectAgent = useCallback((agentId: number) => {
    setInspectedAgentId(agentId)
    requestAgentDetails(agentId)
    requestAgentConversation(agentId)
  }, [requestAgentDetails, requestAgentConversation])

  const handleCloseInspection = useCallback(() => {
    setInspectedAgentId(null)
  }, [])

  // Migration notice disabled — we control layout revisions ourselves
  const showMigrationNotice = false

  const [alwaysShowOverlay, setAlwaysShowOverlay] = useState(false)
  const [showTeamLines, setShowTeamLines] = useState(false)
  const [isHudOpen, setIsHudOpen] = useState(false)
  const shareMode = isShareMode()

  const hudAgentsMap = useMemo(() => {
    const os = getOfficeState()
    const map = new Map<number, { name: string; status: string }>()
    for (const id of agents) {
      const ch = os.characters.get(id)
      const name = ch?.folderName || `agent-${id}`
      const status = agentStatuses[id] ?? 'active'
      map.set(id, { name, status })
    }
    return map
  }, [agents, agentStatuses])

  const handleToggleAlwaysShowOverlay = useCallback(
    () => setAlwaysShowOverlay((prev) => !prev),
    [],
  )

  const officeState = getOfficeState()

  const handleExportLayout = useCallback(() => {
    const layout = officeState.getLayout()
    const blob = new Blob([serializeLayout(layout)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'pixel-agents-layout.json'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [officeState])

  const handleImportLayout = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      void file.text().then((text) => {
        const layout = deserializeLayout(text)
        if (!layout) {
          window.alert('Invalid layout JSON')
          return
        }
        editor.handleImportLayout(layout)
      }).catch(() => {
        window.alert('Failed to read layout file')
      })
    }
    input.click()
  }, [editor])

  const containerRef = useRef<HTMLDivElement>(null)

  const [editorTickForKeyboard, setEditorTickForKeyboard] = useState(0)
  useEditorKeyboard(
    editor.isEditMode,
    editorState,
    editor.handleDeleteSelected,
    editor.handleRotateSelected,
    editor.handleToggleState,
    editor.handleUndo,
    editor.handleRedo,
    useCallback(() => setEditorTickForKeyboard((n) => n + 1), []),
    editor.handleToggleEditMode,
  )

  const handleFitView = useCallback(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    editor.handleFitView(canvas.width, canvas.height)
  }, [editor])

  const handleCloseAgent = useCallback((id: number) => {
    vscode.postMessage({ type: 'closeAgent', id })
  }, [])

  const handleClick = useCallback((agentId: number) => {
    // If clicked agent is a sub-agent, focus the parent's terminal instead
    const os = getOfficeState()
    const meta = os.subagentMeta.get(agentId)
    const focusId = meta ? meta.parentAgentId : agentId
    vscode.postMessage({ type: 'focusAgent', id: focusId })
  }, [])

  // Force dependency on editorTickForKeyboard to propagate keyboard-triggered re-renders
  void editorTickForKeyboard

  // Show "Press R to rotate" hint when a rotatable item is selected or being placed
  const showRotateHint = editor.isEditMode && (() => {
    if (editorState.selectedFurnitureUid) {
      const item = officeState.getLayout().furniture.find((f) => f.uid === editorState.selectedFurnitureUid)
      if (item && isRotatable(item.type)) return true
    }
    if (editorState.activeTool === EditTool.FURNITURE_PLACE && isRotatable(editorState.selectedFurnitureType)) {
      return true
    }
    return false
  })()

  if (!layoutReady) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--vscode-foreground)' }}>
        Loading...
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes pixel-agents-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .pixel-agents-pulse { animation: pixel-agents-pulse ${PULSE_ANIMATION_DURATION_SEC}s ease-in-out infinite; }
        .pixel-agents-migration-btn:hover { filter: brightness(0.8); }
      `}</style>

      <OfficeCanvas
        officeState={officeState}
        onClick={handleClick}
        onDoubleClick={handleInspectAgent}
        isEditMode={editor.isEditMode}
        editorState={editorState}
        onEditorSpawnAction={editor.handleSetAgentSpawn}
        onEditorTileAction={editor.handleEditorTileAction}
        onEditorEraseAction={editor.handleEditorEraseAction}
        onEditorSelectionChange={editor.handleEditorSelectionChange}
        onDeleteSelected={editor.handleDeleteSelected}
        onRotateSelected={editor.handleRotateSelected}
        onDragMove={editor.handleDragMove}
        editorTick={editor.editorTick}
        zoom={editor.zoom}
        onZoomChange={editor.handleZoomChange}
        panRef={editor.panRef}
        showTeamLines={showTeamLines}
      />

      <ZoomControls zoom={editor.zoom} onZoomChange={editor.handleZoomChange} />

      {/* Left Sidebar — Agent list */}
      {!editor.isEditMode && (
        <LeftSidebar
          agents={agents}
          agentTools={agentTools}
          agentStatuses={agentStatuses}
          agentStats={agentStats}
          agentRoles={agentRoles}
          subagentCharacters={subagentCharacters}
          subagentTools={subagentTools}
          officeState={officeState}
          onInspectAgent={handleInspectAgent}
          pipelineIssues={pipelineIssues}
          githubTasks={githubTasks}
          serverMode={serverMode}
          isShareMode={isShareMode()}
        />
      )}

      {/* Right Sidebar — Activity feed & tools */}
      {!editor.isEditMode && (
        <RightSidebar
          agents={agents}
          agentTools={agentTools}
          agentStatuses={agentStatuses}
          agentStats={agentStats}
          agentRoles={agentRoles}
          subagentCharacters={subagentCharacters}
          subagentTools={subagentTools}
          officeState={officeState}
          selectedAgentId={selectedAgent ?? inspectedAgentId ?? null}
          agentConversation={agentConversation}
          requestAgentConversation={requestAgentConversation}
          agentDetails={agentDetails}
          inspectedAgentId={inspectedAgentId}
          onCloseInspection={handleCloseInspection}
          sendMessages={sendMessages}
        />
      )}

      {/* Vignette overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--pixel-vignette)',
          pointerEvents: 'none',
          zIndex: 40,
        }}
      />

      {!shareMode && (
        <HudScreen
          isOpen={isHudOpen}
          onClose={() => setIsHudOpen(false)}
          agents={hudAgentsMap}
          agentStats={agentStats}
          agentRoles={agentRoles}
        />
      )}

      {shareMode ? (
        <div style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          zIndex: 'var(--pixel-controls-z)' as any,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          borderRadius: 0,
          padding: '4px 6px',
          boxShadow: 'var(--pixel-shadow)',
        }}>
          <button
            onClick={handleFitView}
            style={{
              padding: '5px 10px', fontSize: '24px', color: 'var(--pixel-text)',
              background: 'var(--pixel-btn-bg)', border: '2px solid transparent',
              borderRadius: 0, cursor: 'pointer',
            }}
            title="Fit office to view"
          >
            Fit
          </button>
          <button
            onClick={() => setShowTeamLines(v => !v)}
            style={{
              padding: '5px 10px', fontSize: '24px', color: 'var(--pixel-text)',
              background: showTeamLines ? 'var(--pixel-active-bg)' : 'var(--pixel-btn-bg)',
              border: showTeamLines ? '2px solid var(--pixel-accent)' : '2px solid transparent',
              borderRadius: 0, cursor: 'pointer',
            }}
            title="Show team group lines and clusters"
          >
            Show teams
          </button>
        </div>
      ) : (
        <BottomToolbar
          isEditMode={editor.isEditMode}
          onToggleEditMode={editor.handleToggleEditMode}
          onExportLayout={handleExportLayout}
          onImportLayout={handleImportLayout}
          alwaysShowOverlay={alwaysShowOverlay}
          onToggleAlwaysShowOverlay={handleToggleAlwaysShowOverlay}
          showTeamLines={showTeamLines}
          onToggleShowTeamLines={() => setShowTeamLines(v => !v)}
          onFitView={handleFitView}
          isHudOpen={isHudOpen}
          onToggleHud={() => setIsHudOpen((v) => !v)}
        />
      )}

      {!shareMode && editor.isEditMode && editor.isDirty && (
        <EditActionBar editor={editor} editorState={editorState} />
      )}

      {showRotateHint && (
        <div
          style={{
            position: 'absolute',
            top: editor.isDirty ? 52 : 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 49,
            background: 'var(--pixel-hint-bg)',
            color: '#fff',
            fontSize: '20px',
            padding: '3px 8px',
            borderRadius: 0,
            border: '2px solid var(--pixel-accent)',
            boxShadow: 'var(--pixel-shadow)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Rotate (R)
        </div>
      )}

      {editor.isEditMode && (() => {
        // Compute selected furniture color from current layout
        const selUid = editorState.selectedFurnitureUid
        const selColor = selUid
          ? officeState.getLayout().furniture.find((f) => f.uid === selUid)?.color ?? null
          : null
        return (
          <EditorToolbar
            activeTool={editorState.activeTool}
            selectedTileType={editorState.selectedTileType}
            selectedFurnitureType={editorState.selectedFurnitureType}
            selectedFurnitureUid={selUid}
            selectedFurnitureColor={selColor}
            agentSpawn={officeState.getLayout().agentSpawn}
            isSelectingSpawn={editorState.isSelectingSpawn}
            floorColor={editorState.floorColor}
            wallColor={editorState.wallColor}
            selectedWallSet={editorState.selectedWallSet}
            onToolChange={editor.handleToolChange}
            onToggleSpawnEdit={editor.handleToggleSpawnEdit}
            onClearAgentSpawn={editor.handleClearAgentSpawn}
            onTileTypeChange={editor.handleTileTypeChange}
            onFloorColorChange={editor.handleFloorColorChange}
            onWallColorChange={editor.handleWallColorChange}
            onWallSetChange={editor.handleWallSetChange}
            onSelectedFurnitureColorChange={editor.handleSelectedFurnitureColorChange}
            onFurnitureTypeChange={editor.handleFurnitureTypeChange}
            showCoords={editorState.showCoords}
            onToggleCoords={() => { editorState.showCoords = !editorState.showCoords }}
            showTypes={editorState.showTypes}
            onToggleTypes={() => { editorState.showTypes = !editorState.showTypes }}
            loadedAssets={loadedAssets}
          />
        )
      })()}

      {
        <ToolOverlay
          officeState={officeState}
          agents={agents}
          agentTools={agentTools}
          agentStats={agentStats}
          agentRoles={agentRoles}
          subagentCharacters={subagentCharacters}
          containerRef={containerRef}
          zoom={editor.zoom}
          panRef={editor.panRef}
          onCloseAgent={handleCloseAgent}
          alwaysShowOverlay={alwaysShowOverlay}
        />
      }

      {/* InspectionPanel is now embedded in RightSidebar */}

    </div>
  )
}

export default App
