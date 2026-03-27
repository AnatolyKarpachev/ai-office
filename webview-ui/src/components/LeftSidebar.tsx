import { useState, useCallback } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { AgentStats, AgentRoleInfo, SubagentCharacter, PipelineIssue } from '../hooks/useExtensionMessages.js'
import type { ToolActivity } from '../office/types.js'
import { RoleBadge } from './RoleBadge.js'
import { TokenBar } from './TokenBar.js'

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "claude-opus-4-6": 200000,
  "claude-sonnet-4-6": 200000,
  "claude-haiku-4-5": 200000,
  "default": 200000,
}

function getContextLimit(model?: string): number {
  if (!model) return MODEL_CONTEXT_LIMITS["default"]
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (key !== "default" && model.includes(key)) return limit
  }
  return MODEL_CONTEXT_LIMITS["default"]
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.floor((ms % 60_000) / 1000)
  return `${mins}m ${secs}s`
}

function getStatusLabel(
  agentId: number,
  agentTools: Record<number, ToolActivity[]>,
  agentStatuses: Record<number, string>,
  isActive: boolean,
): string {
  const status = agentStatuses[agentId]
  if (status === 'waiting') return 'Waiting for input'
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

function getSubagentActivity(
  parentAgentId: number,
  parentToolId: string,
  subagentTools: Record<number, Record<string, ToolActivity[]>>,
  officeState: OfficeState,
  // For file-based subagents: use the subagent's own tools/status
  subId?: number,
  agentTools?: Record<number, ToolActivity[]>,
  agentStatuses?: Record<number, string>,
): string {
  // File-based subagent (has its own agent entry with own tools/status)
  if (subId != null && parentToolId === '' && agentTools && agentStatuses) {
    const ch = officeState.characters.get(subId)
    if (ch?.bubbleType === 'permission') return 'Needs approval'
    return getStatusLabel(subId, agentTools, agentStatuses, ch?.isActive ?? false)
  }

  const resolvedSubId = officeState.getSubagentId(parentAgentId, parentToolId)
  const ch = resolvedSubId !== null ? officeState.characters.get(resolvedSubId) : null

  // Check permission bubble first
  if (ch?.bubbleType === 'permission') return 'Needs approval'

  const agentSubs = subagentTools[parentAgentId]
  if (agentSubs) {
    const tools = agentSubs[parentToolId]
    if (tools && tools.length > 0) {
      const activeTool = [...tools].reverse().find((t) => !t.done)
      if (activeTool) {
        if (activeTool.permissionWait) return 'Needs approval'
        return activeTool.status
      }
      // All tools done — check if still active
      if (ch?.isActive) return 'Thinking'
      return 'Idle'
    }
  }

  if (ch?.isActive) return 'Working'
  return 'Idle'
}

function getIssueLabelColor(label: string): string {
  if (label.includes('p0')) return '#e55'
  if (label.includes('p1')) return '#f90'
  if (label.includes('p2')) return '#fc0'
  if (label.includes('p3')) return '#5ac88c'
  if (label === 'wip') return '#3794ff'
  if (label === 'pipeline-ready') return '#5ac88c'
  if (label === 'hold') return '#f90'
  if (label === 'backlog') return 'rgba(255,255,255,0.3)'
  if (label === 'fixed') return '#5ac88c'
  if (label === 'bug') return '#e55'
  if (label === 'enhancement') return '#3794ff'
  return 'rgba(255,255,255,0.4)'
}

function getPipelineStateColor(state: string): string {
  switch (state) {
    case 'done': return '#5ac88c'
    case 'in_progress': return '#3794ff'
    case 'ready': return '#5ac88c'
    case 'review_ready': case 'merge_ready': return '#a78bfa'
    case 'blocked': return '#e55'
    case 'todo': return '#fc0'
    case 'intake_required': return '#f90'
    default: return 'rgba(255,255,255,0.4)'
  }
}

function getPipelineStateLabel(state: string): string {
  return state.replace(/_/g, ' ')
}

const PIPELINE_STAGES = ['intake_required', 'todo', 'ready', 'in_progress', 'blocked', 'review_ready', 'merge_ready', 'done']

function getPipelineProgress(state: string): number {
  if (!state) return 0
  if (state === 'done') return 100
  if (state === 'blocked') return -1 // special: blocked
  if (state === 'intake_required' || state === 'todo') return 0
  const idx = PIPELINE_STAGES.indexOf(state)
  if (idx < 0) return 0
  // Progress starts from 'ready'; intake_required and todo are 0%
  const linear = ['ready', 'in_progress', 'review_ready', 'merge_ready', 'done']
  const li = linear.indexOf(state)
  if (li < 0) return 0
  return Math.round((li / (linear.length - 1)) * 100)
}

interface LeftSidebarProps {
  agents: number[]
  agentTools: Record<number, ToolActivity[]>
  agentStatuses: Record<number, string>
  agentStats: Map<number, AgentStats>
  agentRoles: Map<number, AgentRoleInfo>
  subagentCharacters: SubagentCharacter[]
  subagentTools: Record<number, Record<string, ToolActivity[]>>
  officeState: OfficeState
  onInspectAgent: (id: number) => void
  pipelineIssues: PipelineIssue[]
  serverMode?: string
}

const sidebarStyle: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  left: 10,
  bottom: 60,
  zIndex: 50,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--pixel-bg)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  boxShadow: 'var(--pixel-shadow)',
  overflow: 'hidden',
  transition: 'width 0.2s ease',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 8px',
  borderBottom: '2px solid var(--pixel-border)',
  background: 'rgba(255,255,255,0.03)',
  flexShrink: 0,
}

const toggleBtnStyle: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: '18px',
  color: 'var(--pixel-text-dim)',
  background: 'var(--pixel-btn-bg)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}

const tabBtnBase: React.CSSProperties = {
  flex: 1,
  padding: '4px 8px',
  fontSize: '16px',
  fontWeight: 'bold',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  border: 'none',
  borderBottom: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
  background: 'transparent',
  color: 'rgba(255,255,255,0.35)',
  transition: 'color 0.15s ease',
}

export function LeftSidebar({
  agents,
  agentTools,
  agentStatuses,
  agentStats,
  agentRoles,
  subagentCharacters,
  subagentTools,
  officeState,
  onInspectAgent,
  pipelineIssues,
  serverMode,
}: LeftSidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [hoveredAgent, setHoveredAgent] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'agents' | 'tasks'>('agents')

  const toggleCollapse = useCallback(() => setCollapsed((v) => !v), [])

  // Known subagent-type roles spawned by the Agent tool (not real user-facing agents)
  const SPAWNED_AGENT_ROLES = new Set([
    'explore', 'plan', 'claude-code-guide',
    'researcher', 'reviewer', 'auditor', 'builder', 'fixer',
    'tester', 'merger', 'writer', 'devops', 'planner',
    'refactorer', 'closer', 'supervisor',
    'discovery-helper',
  ])

  const mainAgents = agents.filter((id) => {
    const ch = officeState.characters.get(id)
    if (!ch || ch.isSubagent) return false
    // Also hide agents with subagent-type roles (spawned via Agent tool as top-level sessions)
    const roleInfo = agentRoles.get(id)
    if (roleInfo?.role) {
      const roleLower = roleInfo.role.toLowerCase()
      if (SPAWNED_AGENT_ROLES.has(roleLower)) return false
    }
    return true
  })

  const subsByParent = new Map<number, SubagentCharacter[]>()
  for (const sub of subagentCharacters) {
    const list = subsByParent.get(sub.parentAgentId) || []
    list.push(sub)
    subsByParent.set(sub.parentAgentId, list)
  }

  // Also include file-based subagents (from subagents/ directory) that aren't in subagentCharacters
  const toolSubIds = new Set(subagentCharacters.map(s => s.id))
  for (const id of agents) {
    const ch = officeState.characters.get(id)
    if (!ch || !ch.isSubagent || !ch.parentAgentId) continue
    if (toolSubIds.has(id)) continue // already tracked as tool-based subtask
    const parentId = ch.parentAgentId
    const list = subsByParent.get(parentId) || []
    const roleInfo = agentRoles.get(id)
    list.push({ id, parentAgentId: parentId, parentToolId: '', label: roleInfo?.role || 'subagent' })
    subsByParent.set(parentId, list)
  }

  const totalCount = mainAgents.length + subagentCharacters.length

  // Find supervisor = the parent agent that orchestrates the pipeline (has the most subagents).
  // The team lead is the agent that spawns subagents to do work — NOT a random agent.
  let supervisorId: number | null = null
  let maxSubs = 0
  for (const id of mainAgents) {
    const subCount = subsByParent.get(id)?.length ?? 0
    if (subCount > maxSubs) {
      maxSubs = subCount
      supervisorId = id
    }
  }
  // Secondary: if no agent has subagents, pick the one with the most tool invocations (busiest orchestrator)
  if (supervisorId === null && mainAgents.length > 0) {
    let maxTools = -1
    for (const id of mainAgents) {
      const tools = agentTools[id]
      const count = tools?.length ?? 0
      if (count > maxTools) {
        maxTools = count
        supervisorId = id
      }
    }
  }

  if (collapsed) {
    return (
      <div style={{ ...sidebarStyle, width: 36, alignItems: 'center', padding: '6px 0' }}>
        <button onClick={toggleCollapse} style={toggleBtnStyle} title="Expand sidebar">▶</button>
        <div style={{
          writingMode: 'vertical-rl', textOrientation: 'mixed',
          fontSize: '16px', color: 'var(--pixel-text-dim)', marginTop: 8, letterSpacing: '1px',
        }}>
          AGENTS ({totalCount})
        </div>
      </div>
    )
  }

  const supervisorCh = supervisorId !== null ? officeState.characters.get(supervisorId) : null
  const supervisorStats = supervisorId !== null ? agentStats.get(supervisorId) : null
  const supervisorRole = supervisorId !== null ? agentRoles.get(supervisorId) : null
  const supervisorTools = supervisorId !== null ? agentTools[supervisorId] : undefined
  const supervisorStatus = getStatusLabel(supervisorId ?? -1, agentTools, agentStatuses, supervisorCh?.isActive ?? false)

  return (
    <div style={{ ...sidebarStyle, width: 280 }}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '18px', color: 'var(--pixel-accent)', fontWeight: 'bold' }}>
            {activeTab === 'agents' ? 'AGENTS' : 'TASKS'}
          </span>
          {serverMode && (
            <span style={{
              fontSize: '10px', padding: '0 4px', fontWeight: 'bold',
              textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: '14px',
              background: serverMode === 'dev' ? 'rgba(255,159,67,0.15)' : 'rgba(90,200,140,0.15)',
              color: serverMode === 'dev' ? '#ff9f43' : '#5ac88c',
              border: `1px solid ${serverMode === 'dev' ? 'rgba(255,159,67,0.3)' : 'rgba(90,200,140,0.3)'}`,
              borderRadius: 0,
            }}>
              {serverMode}
            </span>
          )}
        </div>
        <button onClick={toggleCollapse} style={toggleBtnStyle} title="Collapse sidebar">◀</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--pixel-border)', flexShrink: 0 }}>
        <button
          onClick={() => setActiveTab('agents')}
          style={{
            ...tabBtnBase,
            color: activeTab === 'agents' ? 'var(--pixel-accent)' : tabBtnBase.color,
            borderBottomColor: activeTab === 'agents' ? 'var(--pixel-accent)' : 'transparent',
          }}
        >
          Agents ({totalCount})
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          style={{
            ...tabBtnBase,
            color: activeTab === 'tasks' ? '#ff9f43' : tabBtnBase.color,
            borderBottomColor: activeTab === 'tasks' ? '#ff9f43' : 'transparent',
          }}
        >
          Tasks ({pipelineIssues.length})
        </button>
      </div>

      {/* Tab content — exactly 50% */}
      <div style={{ flex: '1 1 0', overflowY: 'auto', padding: '4px', minHeight: 0 }}>
        {activeTab === 'agents' ? (
          /* ───── Agents Tab ───── */
          mainAgents.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '18px', fontStyle: 'italic' }}>
              No agents active
            </div>
          ) : (
            mainAgents.map((id) => {
              const ch = officeState.characters.get(id)
              if (!ch) return null
              const stats = agentStats.get(id)
              const roleInfo = agentRoles.get(id)
              const isActive = ch.isActive
              const tools = agentTools[id]
              const hasPermission = tools?.some((t) => t.permissionWait && !t.done)
              const hasActiveTools = tools?.some((t) => !t.done)
              const statusLabel = getStatusLabel(id, agentTools, agentStatuses, isActive)
              const totalTokens = stats ? stats.totalInputTokens + stats.totalOutputTokens : 0
              const contextLimit = stats ? getContextLimit(stats.model) : 0
              const isHovered = hoveredAgent === id
              const subs = subsByParent.get(id) || []

              let dotColor: string | null = null
              if (hasPermission) dotColor = 'var(--pixel-status-permission)'
              else if (isActive && hasActiveTools) dotColor = 'var(--pixel-status-active)'

              return (
                <div key={id} style={{ marginBottom: 3 }}>
                  <div
                    onClick={() => onInspectAgent(id)}
                    onMouseEnter={() => setHoveredAgent(id)}
                    onMouseLeave={() => setHoveredAgent(null)}
                    style={{
                      padding: '6px 8px',
                      background: isHovered ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                      border: '2px solid',
                      borderColor: hasPermission ? 'var(--pixel-status-permission)' : isActive && hasActiveTools ? 'rgba(90,140,255,0.3)' : 'transparent',
                      borderRadius: 0, cursor: 'pointer', transition: 'background 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                      {dotColor && (
                        <span className={isActive && !hasPermission ? 'pixel-agents-pulse' : undefined}
                          style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: '18px', color: 'var(--pixel-text)', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {ch.folderName || `agent-${id}`}
                      </span>
                      {roleInfo?.role && <RoleBadge role={roleInfo.role} colors={roleInfo.colors} />}
                    </div>
                    <div style={{ fontSize: '14px', color: hasPermission ? 'var(--pixel-status-permission)' : isActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                      {statusLabel}
                    </div>
                    {stats && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <TokenBar totalTokens={totalTokens} contextLimit={contextLimit} model={stats.model} turnCount={stats.turnCount} visible={true} />
                          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{formatNumber(totalTokens)} tok</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: '14px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                          <span>{stats.turnCount} turns</span>
                          <span>{formatDuration(stats.totalDurationMs)}</span>
                          <span>cache {stats.cacheHitRate}%</span>
                        </div>
                      </>
                    )}
                  </div>
                  {/* Subagents */}
                  {subs.length > 0 && (
                    <div style={{ marginLeft: 12, borderLeft: '2px solid rgba(255,255,255,0.08)', paddingLeft: 6 }}>
                      {subs.map((sub) => {
                        const subCh = officeState.characters.get(sub.id)
                        const subIsHovered = hoveredAgent === sub.id
                        const subHasPermission = subCh?.bubbleType === 'permission'
                        const subIsActive = subCh?.isActive ?? false
                        const subActivity = getSubagentActivity(sub.parentAgentId, sub.parentToolId, subagentTools, officeState, sub.id, agentTools, agentStatuses)
                        let subDotColor: string | null = null
                        if (subHasPermission) subDotColor = 'var(--pixel-status-permission)'
                        else if (subIsActive) subDotColor = 'var(--pixel-status-active)'
                        return (
                          <div key={sub.id}
                            onMouseEnter={() => setHoveredAgent(sub.id)}
                            onMouseLeave={() => setHoveredAgent(null)}
                            style={{ padding: '4px 6px', marginTop: 2, background: subIsHovered ? 'rgba(255,255,255,0.05)' : 'transparent', border: '1px solid', borderColor: subHasPermission ? 'var(--pixel-status-permission)' : 'transparent', borderRadius: 0, transition: 'background 0.15s ease' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              {subDotColor && <span className={subIsActive && !subHasPermission ? 'pixel-agents-pulse' : undefined} style={{ width: 5, height: 5, borderRadius: '50%', background: subDotColor, flexShrink: 0 }} />}
                              {(() => {
                                const subRole = agentRoles.get(sub.id)
                                return subRole?.role
                                  ? <RoleBadge role={subRole.role} colors={subRole.colors} />
                                  : <span style={{
                                      fontSize: '11px', padding: '0 4px', fontWeight: 'bold',
                                      textTransform: 'none', letterSpacing: '0.5px',
                                      background: 'rgba(120,160,255,0.15)', color: 'rgba(120,160,255,0.9)',
                                      border: '1px solid rgba(120,160,255,0.3)',
                                      borderRadius: 0, whiteSpace: 'nowrap', lineHeight: '16px',
                                    }}>{sub.label || 'subtask'}</span>
                              })()}
                            </div>
                            <div style={{ fontSize: '14px', color: subHasPermission ? 'var(--pixel-status-permission)' : subIsActive ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subActivity}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )
        ) : (
          /* ───── Tasks Tab (Pipeline Issues) ───── */
          pipelineIssues.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px', fontStyle: 'italic' }}>
              No pipeline issues found
            </div>
          ) : (
            pipelineIssues.map((issue) => (
              <div key={`${issue.repo}-${issue.number}`} style={{
                padding: '6px 8px', marginBottom: 3, background: 'rgba(255,255,255,0.02)',
                border: '2px solid rgba(255,255,255,0.05)', borderRadius: 0,
              }}>
                {/* Issue number + repo + pipeline state */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                  <span style={{ fontSize: '14px', color: 'var(--pixel-accent)', fontWeight: 'bold', flexShrink: 0 }}>
                    #{issue.number}
                  </span>
                  <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                    {issue.repo}
                  </span>
                  {issue.pipelineState && (
                    <span style={{
                      fontSize: '12px', padding: '1px 5px', marginLeft: 'auto',
                      background: `${getPipelineStateColor(issue.pipelineState)}22`,
                      color: getPipelineStateColor(issue.pipelineState),
                      border: `1px solid ${getPipelineStateColor(issue.pipelineState)}44`,
                      borderRadius: 0, whiteSpace: 'nowrap', fontWeight: 'bold',
                      textTransform: 'uppercase', letterSpacing: '0.3px',
                    }}>
                      {getPipelineStateLabel(issue.pipelineState)}
                    </span>
                  )}
                </div>
                {/* Title */}
                <div style={{ fontSize: '14px', color: 'var(--pixel-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                  {issue.title}
                </div>
                {/* Labels */}
                {issue.labels.length > 0 && (
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {issue.labels.map((label) => (
                      <span key={label} style={{
                        fontSize: '14px', padding: '1px 4px',
                        background: `${getIssueLabelColor(label)}22`,
                        color: getIssueLabelColor(label),
                        border: `1px solid ${getIssueLabelColor(label)}44`,
                        borderRadius: 0, whiteSpace: 'nowrap',
                      }}>
                        {label}
                      </span>
                    ))}
                  </div>
                )}
                {/* Pipeline progress bar */}
                {issue.pipelineState && (() => {
                  const pct = getPipelineProgress(issue.pipelineState)
                  const isBlocked = pct === -1
                  const barColor = isBlocked ? '#e55' : getPipelineStateColor(issue.pipelineState)
                  const displayPct = isBlocked ? 100 : pct
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <div style={{
                        flex: 1, height: 6,
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 0, overflow: 'hidden',
                        imageRendering: 'pixelated' as const,
                      }}>
                        <div style={{
                          width: `${displayPct}%`, height: '100%',
                          background: isBlocked
                            ? 'repeating-linear-gradient(45deg, #e55, #e55 3px, #a33 3px, #a33 6px)'
                            : barColor,
                          borderRadius: 0,
                          transition: 'width 0.3s ease',
                          imageRendering: 'pixelated' as const,
                        }} />
                      </div>
                      <span style={{
                        fontSize: '14px', color: barColor, fontFamily: 'monospace',
                        fontWeight: 'bold', flexShrink: 0, minWidth: 32, textAlign: 'right',
                      }}>
                        {isBlocked ? 'BLK' : `${pct}%`}
                      </span>
                    </div>
                  )
                })()}
              </div>
            ))
          )
        )}
      </div>

      {/* ───── Supervisor / Lead Section — exactly 50% ───── */}
      <div style={{
        borderTop: '2px solid var(--pixel-border)',
        background: 'rgba(255,255,255,0.03)',
        flex: '1 1 0',
        minHeight: 0,
        overflowY: 'auto',
        padding: '6px 8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <span style={{ fontSize: '14px', color: '#ff9f43', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            LEAD
          </span>
          {supervisorRole?.role && (
            <RoleBadge role={supervisorRole.role} colors={supervisorRole.colors} />
          )}
        </div>

        {supervisorCh ? (
          <>
            {/* Lead name & status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: supervisorCh.isActive ? 'var(--pixel-status-active)' : 'rgba(255,255,255,0.3)',
              }} />
              <span style={{ fontSize: '16px', color: 'var(--pixel-text)', fontWeight: 'bold' }}>
                {supervisorCh.folderName || `agent-${supervisorId}`}
              </span>
            </div>

            {/* Current activity */}
            <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
              {supervisorStatus}
            </div>

            {/* Recent tool calls */}
            {supervisorTools && supervisorTools.length > 0 && (
              <div style={{ marginBottom: 2 }}>
                {supervisorTools.slice(-5).map((tool) => (
                  <div key={tool.toolId} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '1px 0' }}>
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                      background: tool.permissionWait ? 'var(--pixel-status-permission)' : tool.done ? 'var(--pixel-green)' : 'var(--pixel-status-active)',
                    }} />
                    <span style={{
                      fontSize: '14px',
                      color: tool.done ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.6)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                      textDecoration: tool.done ? 'line-through' : 'none',
                    }}>
                      {tool.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Token stats */}
            {supervisorStats && (
              <div style={{ display: 'flex', gap: 6, fontSize: '14px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                <span>{formatNumber(supervisorStats.totalInputTokens + supervisorStats.totalOutputTokens)} tok</span>
                <span>{supervisorStats.turnCount} turns</span>
                <span>{formatDuration(supervisorStats.totalDurationMs)}</span>
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
            No lead agent detected
          </div>
        )}
      </div>
    </div>
  )
}
