import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { AgentStats, AgentRoleInfo, SubagentCharacter } from '../hooks/useExtensionMessages.js'
import type { ToolActivity } from '../office/types.js'
import { RoleBadge } from './RoleBadge.js'

interface ActivityEntry {
  id: number
  agentId: number
  agentName: string
  text: string
  type: 'tool_start' | 'tool_done' | 'permission' | 'status' | 'agent_joined' | 'agent_left' | 'sub_tool_start' | 'sub_tool_done' | 'sub_permission' | 'sub_joined' | 'sub_left'
  timestamp: number
  isSubagent?: boolean
}

let nextEntryId = 1

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function getEntryColor(type: ActivityEntry['type']): string {
  switch (type) {
    case 'tool_start': return 'rgba(90,140,255,0.9)'
    case 'tool_done': return 'rgba(90,200,140,0.9)'
    case 'permission': return 'var(--pixel-status-permission)'
    case 'status': return 'rgba(255,255,255,0.5)'
    case 'agent_joined': return 'var(--pixel-green)'
    case 'agent_left': return 'rgba(255,100,100,0.7)'
    case 'sub_tool_start': return 'rgba(120,160,255,0.7)'
    case 'sub_tool_done': return 'rgba(120,220,160,0.7)'
    case 'sub_permission': return 'var(--pixel-status-permission)'
    case 'sub_joined': return 'rgba(90,200,140,0.6)'
    case 'sub_left': return 'rgba(255,130,130,0.5)'
  }
}

function getEntryIcon(type: ActivityEntry['type']): string {
  switch (type) {
    case 'tool_start': return '▸'
    case 'tool_done': return '✓'
    case 'permission': return '⚠'
    case 'status': return '●'
    case 'agent_joined': return '+'
    case 'agent_left': return '−'
    case 'sub_tool_start': return '  ▸'
    case 'sub_tool_done': return '  ✓'
    case 'sub_permission': return '  ⚠'
    case 'sub_joined': return '  +'
    case 'sub_left': return '  −'
  }
}

// ── ToolsView component ───────────────────────────────────────────────

interface ToolsViewEntry {
  agentId: number
  agentName: string
  tools: ToolActivity[]
  isSubagent?: boolean
  subLabel?: string
}

function getAgentToolSummary(tools: ToolActivity[]): { active: number; permission: number; done: number } {
  let active = 0, permission = 0, done = 0
  for (const t of tools) {
    if (t.permissionWait && !t.done) permission++
    else if (t.done) done++
    else active++
  }
  return { active, permission, done }
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: '11px', padding: '0 4px', fontWeight: 'bold',
      textTransform: 'uppercase', letterSpacing: '0.3px',
      background: `${color}22`, color, border: `1px solid ${color}44`,
      borderRadius: 0, whiteSpace: 'nowrap', lineHeight: '16px',
    }}>
      {label}
    </span>
  )
}

function ToolsView({ currentTools, agentRoles }: { currentTools: ToolsViewEntry[]; agentRoles: Map<number, AgentRoleInfo> }) {
  const [expandedDone, setExpandedDone] = useState<Record<string, boolean>>({})

  // Sort: permission first, then active, then idle
  const sorted = useMemo(() => {
    return [...currentTools].sort((a, b) => {
      const sa = getAgentToolSummary(a.tools)
      const sb = getAgentToolSummary(b.tools)
      // Permission > active > done-only
      const scoreA = sa.permission > 0 ? 3 : sa.active > 0 ? 2 : 1
      const scoreB = sb.permission > 0 ? 3 : sb.active > 0 ? 2 : 1
      return scoreB - scoreA
    })
  }, [currentTools])

  if (sorted.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '18px', fontStyle: 'italic' }}>
        No active tools
      </div>
    )
  }

  return (
    <>
      {sorted.map(({ agentId, agentName, tools, isSubagent, subLabel }, idx) => {
        const roleInfo = !isSubagent ? agentRoles.get(agentId) : null
        const summary = getAgentToolSummary(tools)
        const key = `${agentId}-${subLabel || 'main'}-${idx}`
        const isDoneExpanded = expandedDone[key] ?? false
        const activeTools = tools.filter(t => !t.done)
        const doneTools = tools.filter(t => t.done)

        // Determine agent-level status
        let agentStatus: 'permission' | 'active' | 'done' = 'done'
        if (summary.permission > 0) agentStatus = 'permission'
        else if (summary.active > 0) agentStatus = 'active'

        const borderColor = agentStatus === 'permission'
          ? 'var(--pixel-status-permission)'
          : agentStatus === 'active'
            ? 'rgba(90,140,255,0.4)'
            : 'rgba(255,255,255,0.06)'

        return (
          <div
            key={key}
            style={{
              padding: '6px 8px', marginBottom: 4,
              marginLeft: isSubagent ? 8 : 0,
              background: 'rgba(255,255,255,0.02)',
              border: `2px solid ${borderColor}`,
              borderRadius: 0,
            }}
          >
            {/* Agent header + status badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              {isSubagent ? (
                <span style={{
                  fontSize: '11px', padding: '0 4px', fontWeight: 'bold',
                  textTransform: 'lowercase', letterSpacing: '0.5px',
                  background: 'rgba(120,160,255,0.15)', color: 'rgba(120,160,255,0.9)',
                  border: '1px solid rgba(120,160,255,0.3)',
                  borderRadius: 0, whiteSpace: 'nowrap', lineHeight: '16px',
                }}>
                  {subLabel || 'subtask'}
                </span>
              ) : (
                <span style={{
                  fontSize: '16px', fontWeight: 'bold',
                  color: 'var(--pixel-text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                }}>
                  {agentName}
                </span>
              )}
              {roleInfo?.role && <RoleBadge role={roleInfo.role} colors={roleInfo.colors} />}
              {agentStatus === 'permission' && <StatusBadge label="WAITING" color="var(--pixel-status-permission)" />}
              {agentStatus === 'active' && <StatusBadge label="IN PROGRESS" color="#5a8cff" />}
              {agentStatus === 'done' && summary.done > 0 && <StatusBadge label="DONE" color="#5ac88c" />}
            </div>

            {/* Active / permission tools — always visible */}
            {activeTools.map((tool) => (
              <div key={tool.toolId} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '2px 4px', marginBottom: 1,
              }}>
                <span className={!tool.permissionWait ? 'pixel-agents-pulse' : undefined} style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: tool.permissionWait ? 'var(--pixel-status-permission)' : 'var(--pixel-status-active)',
                }} />
                <span style={{
                  fontSize: '15px', flex: 1,
                  color: tool.permissionWait ? 'var(--pixel-status-permission)' : 'rgba(255,255,255,0.8)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {tool.status}
                </span>
                {tool.permissionWait && (
                  <span style={{ fontSize: '12px', color: 'var(--pixel-status-permission)', fontWeight: 'bold', flexShrink: 0 }}>
                    APPROVE
                  </span>
                )}
              </div>
            ))}

            {/* Done tools — collapsed summary, expandable */}
            {doneTools.length > 0 && (
              <div
                onClick={() => setExpandedDone(prev => ({ ...prev, [key]: !isDoneExpanded }))}
                style={{ cursor: 'pointer', marginTop: activeTools.length > 0 ? 3 : 0 }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 4px', color: 'rgba(255,255,255,0.35)',
                  fontSize: '14px', fontFamily: 'monospace',
                }}>
                  <span style={{ flexShrink: 0 }}>{isDoneExpanded ? '▾' : '▸'}</span>
                  <span style={{ flex: 1 }}>{doneTools.length} completed</span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pixel-green)', flexShrink: 0, opacity: 0.5 }} />
                </div>
                {isDoneExpanded && doneTools.map((tool) => (
                  <div key={tool.toolId} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '1px 4px 1px 16px',
                  }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--pixel-green)', flexShrink: 0, opacity: 0.4 }} />
                    <span style={{
                      fontSize: '13px', color: 'rgba(255,255,255,0.3)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                    }}>
                      {tool.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

interface RightSidebarProps {
  agents: number[]
  agentTools: Record<number, ToolActivity[]>
  agentStatuses: Record<number, string>
  agentStats: Map<number, AgentStats>
  agentRoles: Map<number, AgentRoleInfo>
  subagentCharacters: SubagentCharacter[]
  subagentTools: Record<number, Record<string, ToolActivity[]>>
  officeState: OfficeState
}

const sidebarStyle: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 10,
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
  fontSize: '18px',
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

export function RightSidebar({
  agents,
  agentTools,
  agentStatuses,
  agentStats,
  agentRoles,
  subagentCharacters,
  subagentTools,
  officeState,
}: RightSidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'activity' | 'tools'>('activity')
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Track previous state for change detection
  const prevAgentsRef = useRef<number[]>([])
  const prevToolsRef = useRef<Record<number, ToolActivity[]>>({})
  const prevStatusesRef = useRef<Record<number, string>>({})
  const prevSubagentsRef = useRef<SubagentCharacter[]>([])
  const prevSubToolsRef = useRef<Record<number, Record<string, ToolActivity[]>>>({})

  // Generate activity entries from state changes
  useEffect(() => {
    const newEntries: ActivityEntry[] = []
    const now = Date.now()

    const getAgentName = (id: number) => {
      const ch = officeState.characters.get(id)
      return ch?.folderName || `agent-${id}`
    }

    // --- Main agents ---

    // Detect new agents
    for (const id of agents) {
      if (!prevAgentsRef.current.includes(id)) {
        newEntries.push({
          id: nextEntryId++,
          agentId: id,
          agentName: getAgentName(id),
          text: 'Joined the office',
          type: 'agent_joined',
          timestamp: now,
        })
      }
    }

    // Detect removed agents
    for (const id of prevAgentsRef.current) {
      if (!agents.includes(id)) {
        newEntries.push({
          id: nextEntryId++,
          agentId: id,
          agentName: getAgentName(id),
          text: 'Left the office',
          type: 'agent_left',
          timestamp: now,
        })
      }
    }

    // Detect new tools
    for (const id of agents) {
      const tools = agentTools[id] || []
      const prevTools = prevToolsRef.current[id] || []

      for (const tool of tools) {
        const prevTool = prevTools.find((t) => t.toolId === tool.toolId)
        if (!prevTool) {
          newEntries.push({
            id: nextEntryId++,
            agentId: id,
            agentName: getAgentName(id),
            text: tool.status,
            type: 'tool_start',
            timestamp: now,
          })
        } else if (tool.done && !prevTool.done) {
          newEntries.push({
            id: nextEntryId++,
            agentId: id,
            agentName: getAgentName(id),
            text: `Done: ${tool.status}`,
            type: 'tool_done',
            timestamp: now,
          })
        } else if (tool.permissionWait && !prevTool.permissionWait) {
          newEntries.push({
            id: nextEntryId++,
            agentId: id,
            agentName: getAgentName(id),
            text: `Permission needed: ${tool.status}`,
            type: 'permission',
            timestamp: now,
          })
        }
      }
    }

    // Detect status changes
    for (const id of agents) {
      const status = agentStatuses[id]
      const prevStatus = prevStatusesRef.current[id]
      if (status && status !== prevStatus) {
        newEntries.push({
          id: nextEntryId++,
          agentId: id,
          agentName: getAgentName(id),
          text: status === 'waiting' ? 'Waiting for user input' : `Status: ${status}`,
          type: 'status',
          timestamp: now,
        })
      }
    }

    // --- Subagents ---

    // Detect new subagents
    for (const sub of subagentCharacters) {
      if (!prevSubagentsRef.current.some((s) => s.id === sub.id)) {
        newEntries.push({
          id: nextEntryId++,
          agentId: sub.parentAgentId,
          agentName: `${getAgentName(sub.parentAgentId)} > ${sub.label || 'subtask'}`,
          text: `Subagent spawned: ${sub.label || 'subtask'}`,
          type: 'sub_joined',
          timestamp: now,
          isSubagent: true,
        })
      }
    }

    // Detect removed subagents
    for (const sub of prevSubagentsRef.current) {
      if (!subagentCharacters.some((s) => s.id === sub.id)) {
        newEntries.push({
          id: nextEntryId++,
          agentId: sub.parentAgentId,
          agentName: `${getAgentName(sub.parentAgentId)} > ${sub.label || 'subtask'}`,
          text: `Subagent finished: ${sub.label || 'subtask'}`,
          type: 'sub_left',
          timestamp: now,
          isSubagent: true,
        })
      }
    }

    // Detect subagent tool changes
    for (const parentIdStr of Object.keys(subagentTools)) {
      const parentId = Number(parentIdStr)
      const agentSubs = subagentTools[parentId] || {}
      const prevAgentSubs = prevSubToolsRef.current[parentId] || {}

      for (const [parentToolId, tools] of Object.entries(agentSubs)) {
        const prevTools = prevAgentSubs[parentToolId] || []
        const subChar = subagentCharacters.find((s) => s.parentAgentId === parentId && s.parentToolId === parentToolId)
        const subLabel = subChar?.label || 'subtask'

        for (const tool of tools) {
          const prevTool = prevTools.find((t) => t.toolId === tool.toolId)
          if (!prevTool) {
            newEntries.push({
              id: nextEntryId++,
              agentId: parentId,
              agentName: `${getAgentName(parentId)} > ${subLabel}`,
              text: tool.status,
              type: 'sub_tool_start',
              timestamp: now,
              isSubagent: true,
            })
          } else if (tool.done && !prevTool.done) {
            newEntries.push({
              id: nextEntryId++,
              agentId: parentId,
              agentName: `${getAgentName(parentId)} > ${subLabel}`,
              text: `Done: ${tool.status}`,
              type: 'sub_tool_done',
              timestamp: now,
              isSubagent: true,
            })
          } else if (tool.permissionWait && !prevTool.permissionWait) {
            newEntries.push({
              id: nextEntryId++,
              agentId: parentId,
              agentName: `${getAgentName(parentId)} > ${subLabel}`,
              text: `Permission needed: ${tool.status}`,
              type: 'sub_permission',
              timestamp: now,
              isSubagent: true,
            })
          }
        }
      }
    }

    prevAgentsRef.current = [...agents]
    prevToolsRef.current = { ...agentTools }
    prevStatusesRef.current = { ...agentStatuses }
    prevSubagentsRef.current = [...subagentCharacters]
    prevSubToolsRef.current = { ...subagentTools }

    if (newEntries.length > 0) {
      setEntries((prev) => [...prev, ...newEntries].slice(-100))
    }
  }, [agents, agentTools, agentStatuses, subagentCharacters, subagentTools, officeState])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries])

  const toggleCollapse = useCallback(() => setCollapsed((v) => !v), [])

  if (collapsed) {
    return (
      <div style={{ ...sidebarStyle, width: 36, alignItems: 'center', padding: '6px 0' }}>
        <button
          onClick={toggleCollapse}
          style={toggleBtnStyle}
          title="Expand sidebar"
        >
          ◀
        </button>
        <div style={{
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          fontSize: '16px',
          color: 'var(--pixel-text-dim)',
          marginTop: 8,
          letterSpacing: '1px',
        }}>
          ACTIVITY
        </div>
      </div>
    )
  }

  // Build current tools view (including subagent tools)
  const currentTools: Array<{ agentId: number; agentName: string; tools: ToolActivity[]; isSubagent?: boolean; subLabel?: string }> = []
  for (const id of agents) {
    const ch = officeState.characters.get(id)
    if (ch?.isSubagent) continue
    const tools = agentTools[id]
    if (tools && tools.length > 0) {
      currentTools.push({
        agentId: id,
        agentName: ch?.folderName || `agent-${id}`,
        tools,
      })
    }
    // Add subagent tools under parent
    const agentSubs = subagentTools[id]
    if (agentSubs) {
      for (const [parentToolId, subTools] of Object.entries(agentSubs)) {
        if (subTools.length > 0) {
          const subChar = subagentCharacters.find((s) => s.parentAgentId === id && s.parentToolId === parentToolId)
          currentTools.push({
            agentId: id,
            agentName: `${ch?.folderName || `agent-${id}`} > ${subChar?.label || 'subtask'}`,
            tools: subTools,
            isSubagent: true,
            subLabel: subChar?.label,
          })
        }
      }
    }
  }

  return (
    <div style={{ ...sidebarStyle, width: 320 }}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '18px', color: 'var(--pixel-accent)', fontWeight: 'bold' }}>
            {activeTab === 'activity' ? 'ACTIVITY' : 'TOOLS'}
          </span>
          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>
            ({activeTab === 'activity' ? entries.length : currentTools.length})
          </span>
        </div>
        <button
          onClick={toggleCollapse}
          style={toggleBtnStyle}
          title="Collapse sidebar"
        >
          ▶
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '2px solid var(--pixel-border)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => setActiveTab('activity')}
          style={{
            ...tabBtnBase,
            color: activeTab === 'activity' ? '#ff9f43' : tabBtnBase.color,
            borderBottomColor: activeTab === 'activity' ? '#ff9f43' : 'transparent',
          }}
        >
          Events
        </button>
        <button
          onClick={() => setActiveTab('tools')}
          style={{
            ...tabBtnBase,
            color: activeTab === 'tools' ? 'var(--pixel-accent)' : tabBtnBase.color,
            borderBottomColor: activeTab === 'tools' ? 'var(--pixel-accent)' : 'transparent',
          }}
        >
          Tools
        </button>
      </div>

      {/* Content */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
        {activeTab === 'activity' ? (
          /* Activity Feed */
          entries.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '18px', fontStyle: 'italic' }}>
              Waiting for events...
            </div>
          ) : (
            entries.map((entry) => {
              const entryRole = agentRoles.get(entry.agentId)
              return (
              <div
                key={entry.id}
                style={{
                  padding: '3px 6px',
                  marginBottom: 1,
                  borderLeft: `2px solid ${getEntryColor(entry.type)}`,
                  marginLeft: entry.isSubagent ? 8 : 0,
                  transition: 'background 0.1s ease',
                }}
              >
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{
                    fontSize: '14px',
                    color: 'rgba(255,255,255,0.35)',
                    fontFamily: 'monospace',
                    flexShrink: 0,
                  }}>
                    {formatTime(entry.timestamp)}
                  </span>
                  <span style={{
                    fontSize: '14px',
                    color: getEntryColor(entry.type),
                    fontWeight: 'bold',
                    flexShrink: 0,
                  }}>
                    {getEntryIcon(entry.type)}
                  </span>
                  {entryRole?.role && <RoleBadge role={entryRole.role} colors={entryRole.colors} />}
                  {entry.isSubagent ? (
                    <span style={{
                      fontSize: '10px', padding: '0 3px', fontWeight: 'bold',
                      textTransform: 'lowercase', letterSpacing: '0.3px',
                      background: 'rgba(120,160,255,0.15)', color: 'rgba(120,160,255,0.9)',
                      border: '1px solid rgba(120,160,255,0.3)',
                      borderRadius: 0, whiteSpace: 'nowrap', lineHeight: '14px', flexShrink: 0,
                    }}>
                      {entry.agentName.includes(' > ') ? entry.agentName.split(' > ').pop() : entry.agentName}
                    </span>
                  ) : (
                    <span style={{
                      fontSize: '14px',
                      color: 'rgba(90,140,255,0.8)',
                      flexShrink: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 140,
                    }}>
                      {entry.agentName}
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: '15px',
                  color: 'rgba(255,255,255,0.6)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  paddingLeft: 2,
                }}>
                  {entry.text}
                </div>
              </div>
              )
            })
          )
        ) : (
          /* Tools View — grouped by agent, active first, done collapsed */
          <ToolsView
            currentTools={currentTools}
            agentRoles={agentRoles}
          />
        )}
      </div>
    </div>
  )
}
