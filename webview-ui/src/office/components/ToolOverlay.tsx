import { useState, useEffect } from 'react'
import type { ToolActivity } from '../types.js'
import type { OfficeState } from '../engine/officeState.js'
import type { SubagentCharacter, AgentStats, AgentRoleInfo } from '../../hooks/useExtensionMessages.js'
import { TILE_SIZE, CharacterState } from '../types.js'
import { TOOL_OVERLAY_VERTICAL_OFFSET, CHARACTER_SITTING_OFFSET_PX } from '../../constants.js'
import { TokenBar } from '../../components/TokenBar.js'
import { getContextLimit } from '../../modelInfo.js'

interface ToolOverlayProps {
  officeState: OfficeState
  agents: number[]
  agentTools: Record<number, ToolActivity[]>
  agentStats: Map<number, AgentStats>
  agentRoles: Map<number, AgentRoleInfo>
  subagentCharacters: SubagentCharacter[]
  containerRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  panRef: React.RefObject<{ x: number; y: number }>
  onCloseAgent: (id: number) => void
  alwaysShowOverlay: boolean
}

/** Derive a short human-readable activity string from tools/status */
function getActivityText(
  agentId: number,
  agentTools: Record<number, ToolActivity[]>,
  isActive: boolean,
): string {
  const tools = agentTools[agentId]
  if (tools && tools.length > 0) {
    const activeTool = [...tools].reverse().find((t) => !t.done)
    if (activeTool) {
      if (activeTool.permissionWait) return 'Needs approval'
      return activeTool.status
    }
    if (isActive) {
      const lastTool = tools[tools.length - 1]
      if (lastTool) return lastTool.status
    }
  }
  return 'Idle'
}

export function ToolOverlay({
  officeState,
  agents,
  agentTools,
  agentStats,
  agentRoles,
  subagentCharacters,
  containerRef,
  zoom,
  panRef,
  onCloseAgent,
  alwaysShowOverlay,
}: ToolOverlayProps) {
  const [, setTick] = useState(0)
  useEffect(() => {
    let rafId = 0
    const tick = () => {
      setTick((n) => n + 1)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const el = containerRef.current
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const canvasW = Math.round(rect.width * dpr)
  const canvasH = Math.round(rect.height * dpr)
  const layout = officeState.getLayout()
  const mapW = layout.cols * TILE_SIZE * zoom
  const mapH = layout.rows * TILE_SIZE * zoom
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x)
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y)

  const selectedId = officeState.selectedAgentId
  const hoveredId = officeState.hoveredAgentId

  const allIds = [...agents, ...subagentCharacters.map((s) => s.id)]

  return (
    <>
      {allIds.map((id) => {
        const ch = officeState.characters.get(id)
        if (!ch) return null

        const isSelected = selectedId === id
        const isHovered = hoveredId === id
        const isSub = ch.isSubagent
        const roleInfo = agentRoles.get(id) ?? null
        const subName = ch.folderName || `subagent-${id}`

        const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr
        const screenY = (deviceOffsetY + (ch.y + sittingOffset - TOOL_OVERLAY_VERTICAL_OFFSET) * zoom) / dpr

        // Activity text
        const subHasPermission = isSub && ch.bubbleType === 'permission'
        let activityText: string
        if (isSub) {
          if (subHasPermission) {
            activityText = 'Needs approval'
          } else {
            const sub = subagentCharacters.find((s) => s.id === id)
            activityText = sub ? sub.label : 'Subtask'
          }
        } else {
          activityText = getActivityText(id, agentTools, ch.isActive)
        }

        // Dot color
        const tools = agentTools[id]
        const hasPermission = subHasPermission || tools?.some((t) => t.permissionWait && !t.done)
        const hasActiveTools = tools?.some((t) => !t.done)
        const isActive = ch.isActive

        let dotColor: string | null = null
        let pauseIcon = false
        if (hasPermission) {
          dotColor = 'var(--pixel-status-permission)'
        } else if (isActive && hasActiveTools) {
          dotColor = 'var(--pixel-status-active)'
        } else if (!isActive) {
          dotColor = '#ffcc00'
          pauseIcon = true
        }

        // Role & stats
        const stats = !isSub ? agentStats.get(id) : null
        const totalTokens = stats ? stats.totalInputTokens + stats.totalOutputTokens : 0
        const contextLimit = stats ? getContextLimit(stats.model) : 0

        // Show expanded overlay on hover/select/alwaysShow
        const showExpanded = alwaysShowOverlay || isSelected || isHovered

        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY - 24,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: isSelected ? 'auto' : 'none',
              zIndex: isSelected ? 'var(--pixel-overlay-selected-z)' : 'var(--pixel-overlay-z)',
            }}
          >
            {/* ALWAYS VISIBLE: name + role nameplate */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                marginBottom: 2,
                padding: '2px 6px',
                background: 'var(--pixel-bg)',
                border: '2px solid var(--pixel-border)',
                borderRadius: 0,
                boxShadow: 'var(--pixel-shadow)',
                whiteSpace: 'nowrap',
                opacity: 0.9,
              }}
            >
              {dotColor && (
                pauseIcon ? (
                  <span style={{ fontSize: '10px', lineHeight: 1, color: '#ffcc00', flexShrink: 0 }}>⏸</span>
                ) : (
                  <span
                    className={isActive && !hasPermission ? 'pixel-agents-pulse' : undefined}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: dotColor,
                      flexShrink: 0,
                    }}
                  />
                )
              )}
              {isSub ? (
                <>
                  <span
                    style={{
                      fontSize: '18px',
                      color: 'var(--pixel-text-dim)',
                      maxWidth: 140,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {subName}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      lineHeight: 1,
                      padding: '1px 4px',
                      background: roleInfo?.colors?.badge ?? 'rgba(120,160,255,0.15)',
                      color: roleInfo?.colors?.primary ?? 'rgba(120,160,255,0.9)',
                      border: `1px solid ${roleInfo?.colors?.primary ?? 'rgba(120,160,255,0.3)'}`,
                      borderRadius: 0,
                      textTransform: 'none',
                      letterSpacing: '0.5px',
                      fontWeight: 'bold',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {roleInfo?.role || 'sub'}
                  </span>
                </>
              ) : (
                /* Main agent: name + optional role badge */
                <>
                  <span
                    style={{
                      fontSize: '18px',
                      color: 'var(--pixel-text-dim)',
                    }}
                  >
                    {ch.folderName || `agent-${id}`}
                  </span>
                  {roleInfo && roleInfo.role && (
                    <span
                      style={{
                        fontSize: '11px',
                        lineHeight: 1,
                        padding: '1px 4px',
                        background: roleInfo.colors.badge,
                        color: roleInfo.colors.primary,
                        border: `1px solid ${roleInfo.colors.primary}`,
                        borderRadius: 0,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {roleInfo.role}
                    </span>
                  )}
                </>
              )}
            </div>

            {/* EXPANDED: full overlay on hover/select/alwaysShow */}
            {showExpanded && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'var(--pixel-bg)',
                  border: isSelected
                    ? '2px solid var(--pixel-border-light)'
                    : '2px solid var(--pixel-border)',
                  borderRadius: 0,
                  padding: isSelected ? '3px 6px 3px 8px' : '3px 8px',
                  boxShadow: 'var(--pixel-shadow)',
                  whiteSpace: 'nowrap',
                  maxWidth: 220,
                  opacity: alwaysShowOverlay && !isSelected && !isHovered ? (isSub ? 0.5 : 0.75) : 1,
                }}
              >
                <div style={{ overflow: 'hidden' }}>
                  <span
                    style={{
                      fontSize: isSub ? '20px' : '22px',
                      fontStyle: isSub ? 'italic' : undefined,
                      color: 'var(--vscode-foreground)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'block',
                    }}
                  >
                    {activityText}
                  </span>
                  {ch.folderName && (
                    <span
                      style={{
                        fontSize: '16px',
                        color: 'var(--pixel-text-dim)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'block',
                      }}
                    >
                      {ch.folderName}
                    </span>
                  )}
                </div>
                {isSelected && !isSub && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onCloseAgent(id)
                    }}
                    title="Close agent"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--pixel-close-text)',
                      cursor: 'pointer',
                      padding: '0 2px',
                      fontSize: '26px',
                      lineHeight: 1,
                      marginLeft: 2,
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.color = 'var(--pixel-close-hover)'
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.color = 'var(--pixel-close-text)'
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            )}

            {/* ALWAYS VISIBLE: token health bar */}
            {!isSub && stats && totalTokens > 0 && (
              <div style={{ marginTop: 2 }}>
                <TokenBar
                  totalTokens={totalTokens}
                  contextLimit={contextLimit}
                  model={stats.model}
                  turnCount={stats.turnCount}
                  visible
                />
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
