/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { useState, useCallback } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { AgentStats, AgentRoleInfo, GithubTasksConfig, SubagentCharacter, PipelineIssue } from '../hooks/useExtensionMessages.js'
import type { ToolActivity } from '../office/types.js'
import { RoleBadge } from './RoleBadge.js'
import { TokenBar } from './TokenBar.js'
import { getContextLimit } from '../modelInfo.js'

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
  const normalized = label.toLowerCase()
  if (normalized.includes('bug') || normalized.includes('blocked')) return '#e55'
  if (normalized.includes('feature') || normalized.includes('enhancement')) return '#3794ff'
  if (normalized.includes('high') || normalized.includes('urgent')) return '#f90'
  if (normalized.includes('done') || normalized.includes('fixed') || normalized.includes('release')) return '#5ac88c'
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

const PIPELINE_GATES = [
  { gate: 5, label: 'DOC' },
  { gate: 8, label: 'PLN' },
  { gate: 11, label: 'REV' },
  { gate: 12, label: 'VAL' },
  { gate: 13, label: 'VIS' },
  { gate: 15, label: 'MRG' },
] as const

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
  githubTasks: GithubTasksConfig
  agentStats: Map<number, AgentStats>
  agentRoles: Map<number, AgentRoleInfo>
  subagentCharacters: SubagentCharacter[]
  subagentTools: Record<number, Record<string, ToolActivity[]>>
  officeState: OfficeState
  onInspectAgent: (id: number) => void
  pipelineIssues: PipelineIssue[]
  serverMode?: string
  isShareMode?: boolean
}

const sidebarStyle: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  left: 10,
  bottom: 60,
  zIndex: 'var(--pixel-sidebar-z)',
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


export function LeftSidebar({
  agents,
  agentTools,
  agentStatuses,
  githubTasks,
  agentStats,
  agentRoles,
  subagentCharacters,
  subagentTools,
  officeState,
  onInspectAgent,
  pipelineIssues,
  serverMode,
  isShareMode,
}: LeftSidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [tasksCollapsed, setTasksCollapsed] = useState(false)
  const [hoveredAgent, setHoveredAgent] = useState<number | null>(null)
  const toggleCollapse = useCallback(() => setCollapsed((v) => !v), [])
  const toggleTasksCollapse = useCallback(() => setTasksCollapsed((v) => !v), [])

  const mainAgents = agents.filter((id) => {
    const ch = officeState.characters.get(id)
    if (!ch || ch.isSubagent) return false
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

  const totalSubagents = [...subsByParent.values()].reduce((sum, subs) => sum + subs.length, 0)
  const totalCount = mainAgents.length + totalSubagents

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

  return (
    <div style={{ ...sidebarStyle, width: 280 }}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '18px', color: 'var(--pixel-accent)', fontWeight: 'bold' }}>
            AGENTS
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

      {/* Agents list */}
      <div style={{ flex: '1 1 0', overflowY: 'auto', padding: '4px', minHeight: 0 }}>
        {mainAgents.length === 0 ? (
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
              const contextTokens = stats?.currentContextTokens ?? totalTokens
              const contextLimit = stats?.currentContextLimit ?? (stats ? getContextLimit(stats.model) : 0)
              const displayTokens = contextTokens
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
                      {roleInfo?.role && <span style={{ marginLeft: 'auto' }}><RoleBadge role={roleInfo.role} colors={roleInfo.colors} /></span>}
                    </div>
                    <div style={{ fontSize: '14px', color: hasPermission ? 'var(--pixel-status-permission)' : isActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                      {statusLabel}
                    </div>
                    {stats && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <TokenBar totalTokens={totalTokens} usageTokens={contextTokens} contextLimit={contextLimit} model={stats.model} turnCount={stats.turnCount} visible={true} />
                          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{formatNumber(displayTokens)} tok</span>
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
                        const subRole = agentRoles.get(sub.id)
                        const subName = subCh?.folderName || sub.label || `subagent-${sub.id}`
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
                              <span style={{ fontSize: '14px', color: 'var(--pixel-text)', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {subName}
                              </span>
                              <span style={{ marginLeft: 'auto' }}>
                                {subRole?.role
                                  ? <RoleBadge role={subRole.role} colors={subRole.colors} />
                                  : <span style={{
                                      fontSize: '11px', padding: '0 4px', fontWeight: 'bold',
                                      textTransform: 'none', letterSpacing: '0.5px',
                                      background: 'rgba(120,160,255,0.15)', color: 'rgba(120,160,255,0.9)',
                                      border: '1px solid rgba(120,160,255,0.3)',
                                      borderRadius: 0, whiteSpace: 'nowrap', lineHeight: '16px',
                                    }}>{sub.label || 'subtask'}</span>}
                              </span>
                            </div>
                            <div style={{ fontSize: '14px', color: subHasPermission ? 'var(--pixel-status-permission)' : subIsActive ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subActivity}</div>
                            {(() => {
                              const subStats = agentStats.get(sub.id)
                              if (!subStats) return null
                              const subTotalTokens = subStats.totalInputTokens + subStats.totalOutputTokens
                              const subContextTokens = subStats.currentContextTokens ?? subTotalTokens
                              const subContextLimit = subStats.currentContextLimit ?? getContextLimit(subStats.model)
                              const subDisplayTokens = subContextTokens
                              if (subTotalTokens === 0) return null
                              return (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                    <TokenBar totalTokens={subTotalTokens} usageTokens={subContextTokens} contextLimit={subContextLimit} model={subStats.model} turnCount={subStats.turnCount} visible={true} />
                                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{formatNumber(subDisplayTokens)} tok</span>
                                  </div>
                                  <div style={{ display: 'flex', gap: 6, marginTop: 1, fontSize: '12px', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
                                    <span>{subStats.turnCount} turns</span>
                                    <span>{formatDuration(subStats.totalDurationMs)}</span>
                                  </div>
                                </>
                              )
                            })()}
                            {/* Level 3: sub-subagents */}
                            {(() => {
                              const subSubs = subsByParent.get(sub.id) || []
                              if (subSubs.length === 0) return null
                              return (
                                <div style={{ marginLeft: 10, borderLeft: '2px solid rgba(255,255,255,0.05)', paddingLeft: 4, marginTop: 2 }}>
                                  {subSubs.map((ss) => {
                                    const ssCh = officeState.characters.get(ss.id)
                                    const ssRole = agentRoles.get(ss.id)
                                    const ssName = ssCh?.folderName || ss.label || `sub-${ss.id}`
                                    const ssStats = agentStats.get(ss.id)
                                    const ssTotalTokens = ssStats ? ssStats.totalInputTokens + ssStats.totalOutputTokens : 0
                                    const ssContextTokens = ssStats?.currentContextTokens ?? ssTotalTokens
                                    const ssContextLimit = ssStats?.currentContextLimit ?? (ssStats ? getContextLimit(ssStats.model) : 0)
                                    return (
                                      <div key={ss.id} style={{ padding: '2px 4px', fontSize: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                          <span style={{ color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ssName}</span>
                                          {ssRole?.role && <span style={{ marginLeft: 'auto' }}><RoleBadge role={ssRole.role} colors={ssRole.colors} /></span>}
                                        </div>
                                        {ssStats && ssTotalTokens > 0 && (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                            <TokenBar totalTokens={ssTotalTokens} usageTokens={ssContextTokens} contextLimit={ssContextLimit} model={ssStats.model} turnCount={ssStats.turnCount} visible={true} />
                                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{formatNumber(ssContextTokens)} tok</span>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                            })()}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}
      </div>

      {/* ───── Tasks Section (bottom) ───── */}
      {!isShareMode && <div style={{
        borderTop: '2px solid var(--pixel-border)',
        background: 'rgba(255,255,255,0.03)',
        flex: tasksCollapsed ? '0 0 auto' : '1 1 0',
        minHeight: 0,
        overflowY: tasksCollapsed ? 'hidden' : 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Tasks header — always visible, clickable to toggle */}
        <div
          onClick={toggleTasksCollapse}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '6px 8px', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <span style={{
            fontSize: '14px', color: '#ff9f43', fontWeight: 'bold',
            textTransform: 'uppercase', letterSpacing: '0.5px', flex: 1,
          }}>
            TASKS ({pipelineIssues.length})
          </span>
          <span style={{ fontSize: '14px', color: 'var(--pixel-text-dim)' }}>
            {tasksCollapsed ? '▲' : '▼'}
          </span>
        </div>

        {/* Tasks content — hidden when collapsed */}
        {!tasksCollapsed && (
          <div style={{ overflowY: 'auto', padding: '0 8px 6px', flex: '1 1 0', minHeight: 0 }}>
            {pipelineIssues.length === 0 ? (
              <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                {githubTasks.enabled
                  ? 'No GitHub issues found, or GitHub CLI is not configured.'
                  : 'GitHub tasks are disabled in ~/.pixel-agents/config.json.'}
              </div>
            ) : (
              pipelineIssues.map((issue) => (
                <div key={`bottom-${issue.repo}-${issue.number}`} style={{
                  padding: '6px 8px', marginBottom: 3, background: 'rgba(255,255,255,0.02)',
                  border: '2px solid rgba(255,255,255,0.05)', borderRadius: 0,
                }}>
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
                        background: `${(githubTasks.pipeline.states.find((state) => state.id === issue.pipelineState)?.color || getPipelineStateColor(issue.pipelineState))}22`,
                        color: githubTasks.pipeline.states.find((state) => state.id === issue.pipelineState)?.color || getPipelineStateColor(issue.pipelineState),
                        border: `1px solid ${(githubTasks.pipeline.states.find((state) => state.id === issue.pipelineState)?.color || getPipelineStateColor(issue.pipelineState))}44`,
                        borderRadius: 0, whiteSpace: 'nowrap', fontWeight: 'bold',
                        textTransform: 'uppercase', letterSpacing: '0.3px',
                      }}>
                        {githubTasks.pipeline.states.find((state) => state.id === issue.pipelineState)?.label || getPipelineStateLabel(issue.pipelineState)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--pixel-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                    {issue.title}
                  </div>
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
                  {issue.pipelineState && (() => {
                    const gates = (issue as any).gates || []
                    const hasGateData = gates.length > 0

                    const configuredState = githubTasks.pipeline.states.find((state) => state.id === issue.pipelineState)
                    const stateColor = configuredState?.color || getPipelineStateColor(issue.pipelineState)
                    const configuredGates = githubTasks.pipeline.gates.length > 0 ? githubTasks.pipeline.gates : PIPELINE_GATES

                    if (hasGateData) {
                      const passCount = gates.filter((g: any) => g.status === 'pass').length
                      return (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ display: 'flex', gap: 2 }}>
                            {configuredGates.map(({ gate, label }) => {
                              const entry = gates.find((g: any) => g.gate === gate)
                              const s = entry?.status
                              const color = s === 'pass' ? '#5ac88c' : s === 'fail' ? '#e55' : 'rgba(255,255,255,0.08)'
                              return (
                                <div key={gate} style={{ flex: 1, textAlign: 'center' }}>
                                  <div style={{
                                    height: 6,
                                    background: s === 'fail'
                                      ? 'repeating-linear-gradient(45deg, #e55, #e55 2px, #a33 2px, #a33 4px)'
                                      : color,
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    imageRendering: 'pixelated' as const,
                                  }} title={entry?.comment || label} />
                                  <div style={{
                                    fontSize: 8, fontFamily: 'monospace', marginTop: 1,
                                    color: s === 'pass' ? '#5ac88c' : s === 'fail' ? '#e55' : 'rgba(255,255,255,0.15)',
                                    letterSpacing: -0.5,
                                  }}>{label}</div>
                                </div>
                              )
                            })}
                          </div>
                          <div style={{
                            fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace',
                            textAlign: 'right', marginTop: 2,
                          }}>
                            {passCount}/{configuredGates.length}
                          </div>
                        </div>
                      )
                    }

                    // Fallback: single bar for states without gate data
                    const pct = githubTasks.pipeline.states.length > 0
                      ? (() => {
                          if (issue.pipelineState === 'blocked') return -1
                          if (issue.pipelineState === 'done') return 100
                          const states = githubTasks.pipeline.states
                          const idx = states.findIndex((state) => state.id === issue.pipelineState)
                          return idx < 0 ? 0 : Math.round((idx / Math.max(states.length - 1, 1)) * 100)
                        })()
                      : getPipelineProgress(issue.pipelineState)
                    const isBlocked = pct === -1
                    const barColor = isBlocked ? '#e55' : stateColor
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
            )}
          </div>
        )}
      </div>}
    </div>
  )
}
