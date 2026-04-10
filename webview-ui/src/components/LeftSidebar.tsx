/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { useState, useCallback } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { AgentStats, AgentRoleInfo, GithubTasksConfig, SubagentCharacter, PipelineIssue } from '../hooks/useExtensionMessages.js'
import type { ToolActivity } from '../office/types.js'
import { AgentCard } from './sidebar/AgentCard.js'
import { TasksList } from './sidebar/TasksList.js'

interface LeftSidebarProps {
  agents: number[]
  agentTools: Record<number, ToolActivity[]>
  agentStatuses: Record<number, string>
  githubTasks: GithubTasksConfig
  agentStats: Map<number, AgentStats>
  agentRoles: Map<number, AgentRoleInfo>
  agentTeamInfo: Map<number, { teamName?: string; isTeamLead?: boolean }>
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
  agentTeamInfo,
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
  const toggleCollapse = useCallback(() => setCollapsed((v) => !v), [])
  const toggleTasksCollapse = useCallback(() => setTasksCollapsed((v) => !v), [])

  // Build set of all live agent IDs (have a character on the map)
  const liveIds = new Set<number>()
  for (const id of agents) {
    if (officeState.characters.get(id)) liveIds.add(id)
  }

  // Root agents = non-subagent OR orphan (subagent whose parent is gone)
  const mainAgents = agents.filter((id) => {
    const ch = officeState.characters.get(id)
    if (!ch) return false
    if (!ch.isSubagent) return true
    // Orphan: parent no longer exists -> promote to root
    if (!ch.parentAgentId || !liveIds.has(ch.parentAgentId)) return true
    return false
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
        <button onClick={toggleCollapse} style={toggleBtnStyle} title="Expand sidebar">{'\u25B6'}</button>
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
        <button onClick={toggleCollapse} style={toggleBtnStyle} title="Collapse sidebar">{'\u25C0'}</button>
      </div>

      {/* Agents list */}
      <div style={{ flex: '1 1 0', overflowY: 'auto', padding: '4px', minHeight: 0 }}>
        {mainAgents.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '18px', fontStyle: 'italic' }}>
              No agents active
            </div>
          ) : (
            mainAgents.map((id) => (
              <AgentCard
                key={id}
                id={id}
                agentTools={agentTools}
                agentStatuses={agentStatuses}
                agentStats={agentStats}
                agentRoles={agentRoles}
                agentTeamInfo={agentTeamInfo}
                subagentCharacters={subagentCharacters}
                subsByParent={subsByParent}
                subagentTools={subagentTools}
                officeState={officeState}
                onInspectAgent={onInspectAgent}
              />
            ))
          )}
      </div>

      {/* Tasks Section (bottom) */}
      {!isShareMode && (
        <TasksList
          githubTasks={githubTasks}
          pipelineIssues={pipelineIssues}
          tasksCollapsed={tasksCollapsed}
          onToggleTasksCollapse={toggleTasksCollapse}
        />
      )}
    </div>
  )
}
