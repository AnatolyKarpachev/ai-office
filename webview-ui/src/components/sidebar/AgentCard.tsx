/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { useState } from 'react'
import type { OfficeState } from '../../office/engine/officeState.js'
import type { AgentStats, AgentRoleInfo, SubagentCharacter } from '../../hooks/useExtensionMessages.js'
import type { ToolActivity } from '../../office/types.js'
import { RoleBadge } from '../RoleBadge.js'
import { TokenBar } from '../TokenBar.js'
import { getContextLimit } from '../../modelInfo.js'

// ── Helpers ──────────────────────────────────────────────────────────

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

export function getStatusLabel(
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

export function getSubagentActivity(
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

// ── AgentCard ────────────────────────────────────────────────────────

export interface AgentCardProps {
  id: number
  agentTools: Record<number, ToolActivity[]>
  agentStatuses: Record<number, string>
  agentStats: Map<number, AgentStats>
  agentRoles: Map<number, AgentRoleInfo>
  agentTeamInfo: Map<number, { teamName?: string; isTeamLead?: boolean }>
  subagentCharacters: SubagentCharacter[]
  subsByParent: Map<number, SubagentCharacter[]>
  subagentTools: Record<number, Record<string, ToolActivity[]>>
  officeState: OfficeState
  onInspectAgent: (id: number) => void
}

export function AgentCard({
  id,
  agentTools,
  agentStatuses,
  agentStats,
  agentRoles,
  agentTeamInfo,
  subagentCharacters: _subagentCharacters,
  subsByParent,
  subagentTools,
  officeState,
  onInspectAgent,
}: AgentCardProps) {
  const [hoveredAgent, setHoveredAgent] = useState<number | null>(null)
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
                      : (() => {
                          const ti = agentTeamInfo.get(sub.id)
                          const badgeLabel = ti?.isTeamLead ? 'lead' : ti?.teamName ? 'teammate' : (sub.label || 'subtask')
                          const badgeBg = ti?.isTeamLead ? 'rgba(255,200,60,0.15)' : ti?.teamName ? 'rgba(90,200,140,0.15)' : 'rgba(120,160,255,0.15)'
                          const badgeColor = ti?.isTeamLead ? 'rgba(255,200,60,0.9)' : ti?.teamName ? 'rgba(90,200,140,0.9)' : 'rgba(120,160,255,0.9)'
                          const badgeBorder = ti?.isTeamLead ? 'rgba(255,200,60,0.3)' : ti?.teamName ? 'rgba(90,200,140,0.3)' : 'rgba(120,160,255,0.3)'
                          return <span style={{
                            fontSize: '11px', padding: '0 4px', fontWeight: 'bold',
                            textTransform: 'none', letterSpacing: '0.5px',
                            background: badgeBg, color: badgeColor,
                            border: `1px solid ${badgeBorder}`,
                            borderRadius: 0, whiteSpace: 'nowrap', lineHeight: '16px',
                          }}>{badgeLabel}</span>
                        })()}
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
                        const deepSubs = subsByParent.get(ss.id) || []
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
                            {/* Level 4+: deeper subagents */}
                            {deepSubs.length > 0 && (
                              <div style={{ marginLeft: 10, borderLeft: '2px solid rgba(255,255,255,0.03)', paddingLeft: 4, marginTop: 2 }}>
                                {deepSubs.map((ds) => {
                                  const dsCh = officeState.characters.get(ds.id)
                                  const dsRole = agentRoles.get(ds.id)
                                  const dsName = dsCh?.folderName || ds.label || `sub-${ds.id}`
                                  const dsStats = agentStats.get(ds.id)
                                  const dsTotalTokens = dsStats ? dsStats.totalInputTokens + dsStats.totalOutputTokens : 0
                                  const dsContextTokens = dsStats?.currentContextTokens ?? dsTotalTokens
                                  const dsContextLimit = dsStats?.currentContextLimit ?? (dsStats ? getContextLimit(dsStats.model) : 0)
                                  return (
                                    <div key={ds.id} style={{ padding: '2px 4px', fontSize: '11px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span style={{ color: 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{dsName}</span>
                                        {dsRole?.role && <span style={{ marginLeft: 'auto' }}><RoleBadge role={dsRole.role} colors={dsRole.colors} /></span>}
                                      </div>
                                      {dsStats && dsTotalTokens > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                          <TokenBar totalTokens={dsTotalTokens} usageTokens={dsContextTokens} contextLimit={dsContextLimit} model={dsStats.model} turnCount={dsStats.turnCount} visible={true} />
                                          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{formatNumber(dsContextTokens)} tok</span>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
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
}
