/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { AgentStats, AgentRoleInfo, SubagentCharacter, ConversationMessage, AgentDetails } from '../hooks/useExtensionMessages.js'
import type { ToolActivity } from '../office/types.js'
import { RoleBadge } from './RoleBadge.js'
import { getModelShortName } from '../modelInfo.js'

interface ActivityEntry {
  id: number
  agentId: number
  agentName: string
  text: string
  type: 'tool_start' | 'tool_done' | 'permission' | 'status' | 'agent_joined' | 'agent_left' | 'sub_tool_start' | 'sub_tool_done' | 'sub_permission' | 'sub_joined' | 'sub_left' | 'send_message'
  timestamp: number
  isSubagent?: boolean
  sendFrom?: string
  sendTo?: string
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
    case 'send_message': return 'rgba(255,165,0,0.9)'
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
    case 'send_message': return '\u2192'
  }
}

// ── MessagesView component ───────────────────────────────────────────

interface SendMessageEntry {
  id: number
  from: string
  to: string
  message: string
  timestamp: number
}

function MessagesView({ messages }: { messages: SendMessageEntry[] }) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  const toggle = useCallback((key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  if (messages.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '18px', fontStyle: 'italic' }}>
        No agent messages
      </div>
    )
  }

  // Show newest first, max 100
  const sorted = [...messages].slice(-100).reverse()

  return (
    <>
      {sorted.map((msg, idx) => {
        const key = `${msg.id}-${msg.timestamp}-${idx}`
        const isExpanded = expandedKeys.has(key)
        const lines = msg.message.split('\n')
        const truncatedLines = lines.slice(0, 20)
        const hasMore = lines.length > 20

        return (
          <div
            key={key}
            onClick={() => toggle(key)}
            style={{
              padding: '4px 6px',
              marginBottom: 2,
              background: 'rgba(0,100,30,0.2)',
              borderLeft: '2px solid rgba(255,165,0,0.9)',
              cursor: 'pointer',
              transition: 'background 0.1s ease',
            }}
          >
            {/* Header: time + from → to */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', flexShrink: 0 }}>
                {isExpanded ? '▾' : '▸'}
              </span>
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', flexShrink: 0 }}>
                {formatTime(msg.timestamp)}
              </span>
              <span style={{
                fontSize: '13px', padding: '0 4px', fontWeight: 'bold',
                background: 'rgba(255,165,0,0.2)', color: '#ffb347',
                border: '1px solid rgba(255,165,0,0.4)',
                borderRadius: 2, whiteSpace: 'nowrap', lineHeight: '16px',
                overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80,
              }}>
                {msg.from}
              </span>
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>→</span>
              <span style={{
                fontSize: '13px', padding: '0 4px', fontWeight: 'bold',
                background: 'rgba(90,200,140,0.2)', color: '#5ac88c',
                border: '1px solid rgba(90,200,140,0.4)',
                borderRadius: 2, whiteSpace: 'nowrap', lineHeight: '16px',
                overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80,
              }}>
                {msg.to}
              </span>
            </div>

            {/* Collapsed: single line preview */}
            {!isExpanded && (
              <div style={{
                fontSize: '13px', color: 'rgba(255,255,255,0.45)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                paddingLeft: 16, marginTop: 1,
              }}>
                {lines[0]}
              </div>
            )}

            {/* Expanded: up to 20 lines */}
            {isExpanded && (
              <div style={{
                fontSize: '13px', color: 'rgba(255,255,255,0.6)',
                paddingLeft: 16, marginTop: 2,
                lineHeight: '1.35',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
              }}>
                {truncatedLines.join('\n')}
                {hasMore && (
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', marginTop: 2 }}>
                    ...{lines.length - 20} more lines
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

// ── ConversationView component ────────────────────────────────────────

function renderMessageText(text: string): React.ReactNode {
  const parts = text.split(/(```[\s\S]*?```)/g)
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const code = part.slice(3, -3).replace(/^\w+\n/, '')
      return (
        <pre key={i} style={{
          background: 'rgba(0,0,0,0.3)',
          padding: '4px 6px',
          margin: '4px 0',
          fontSize: '12px',
          fontFamily: 'monospace',
          borderRadius: 0,
          border: '1px solid rgba(255,255,255,0.1)',
          overflow: 'auto',
          maxHeight: 150,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {code}
        </pre>
      )
    }
    return part.split(/(`[^`]+`)/g).map((seg, j) => {
      if (seg.startsWith('`') && seg.endsWith('`')) {
        return (
          <code key={`${i}-${j}`} style={{
            background: 'rgba(255,255,255,0.1)',
            padding: '1px 3px',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}>
            {seg.slice(1, -1)}
          </code>
        )
      }
      return <span key={`${i}-${j}`}>{seg}</span>
    })
  })
}

function ConversationView({
  messages,
  selectedAgentId,
}: {
  messages: ConversationMessage[]
  selectedAgentId: number | null
}) {
  if (selectedAgentId === null) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '18px' }}>
        Select an agent to view conversation
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '18px', fontStyle: 'italic' }}>
        No messages yet...
      </div>
    )
  }

  return (
    <>
      {messages.map((msg, i) => (
        <div key={i} style={{
          padding: '6px 8px',
          marginBottom: 4,
          borderLeft: `3px solid ${msg.role === 'assistant' ? '#6c5ce7' : '#00b894'}`,
          background: msg.role === 'assistant'
            ? 'rgba(108,92,231,0.08)'
            : 'rgba(0,184,148,0.08)',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            marginBottom: 2,
          }}>
            <span style={{
              fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase',
              color: msg.role === 'assistant' ? '#a29bfe' : '#55efc4',
            }}>
              {msg.role}
            </span>
            <span style={{
              fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace',
            }}>
              {formatTime(new Date(msg.timestamp).getTime())}
            </span>
          </div>
          {msg.toolNames && msg.toolNames.length > 0 && (
            <div style={{
              fontSize: '10px', color: 'rgba(90,140,255,0.6)',
              marginBottom: 3,
            }}>
              tools: {msg.toolNames.join(', ')}
            </div>
          )}
          <div style={{
            fontSize: '13px',
            color: 'rgba(255,255,255,0.75)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: '1.4',
            maxHeight: 200,
            overflow: 'hidden',
          }}>
            {renderMessageText(msg.text)}
          </div>
        </div>
      ))}
    </>
  )
}

// ── AgentDetailsView component ────────────────────────────────────────

function formatNumberCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.floor((ms % 60_000) / 1000)
  return `${mins}m ${secs}s`
}

function formatIsoTime(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return isoString }
}

function PixelBar({ value, max, color }: { value: number; max: number; color: string }) {
  const totalBlocks = 8
  const filled = max > 0 ? Math.round((value / max) * totalBlocks) : 0
  const blocks: string[] = []
  for (let i = 0; i < totalBlocks; i++) blocks.push(i < filled ? '\u2588' : '\u2591')
  return <span style={{ fontFamily: 'monospace', letterSpacing: '1px', color, fontSize: '12px' }}>{blocks.join('')}</span>
}

const detailLabelStyle: React.CSSProperties = { fontSize: '12px', color: 'rgba(255,255,255,0.45)', minWidth: 55, flexShrink: 0 }
const detailValueStyle: React.CSSProperties = { fontSize: '12px', color: 'rgba(255,255,255,0.8)' }
const detailRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '1px 0' }
const detailSectionTitle: React.CSSProperties = { fontSize: '11px', color: '#8888bb', marginBottom: 2, marginTop: 6, textTransform: 'uppercase', letterSpacing: '1px' }

function AgentDetailsView({ details, folderName, onClose }: { details: AgentDetails; folderName?: string; onClose: () => void }) {
  const d = details
  const modelShort = getModelShortName(d.model) ?? '?'
  const totalTokens = d.tokenBreakdown.input + d.tokenBreakdown.output
  const contextInput = d.contextUsage?.input ?? d.tokenBreakdown.input
  const contextOutput = d.contextUsage?.output ?? d.tokenBreakdown.output
  const contextCacheRead = d.contextUsage?.cacheRead ?? d.tokenBreakdown.cacheRead
  const contextTotal = d.contextUsage?.total ?? totalTokens
  const contextLimit = d.contextUsage?.limit ?? 200_000
  const cacheHitRate = d.tokenBreakdown.input > 0 ? Math.round((d.tokenBreakdown.cacheRead / Math.max(d.tokenBreakdown.input, 1)) * 100) : 0
  const avgTurnMs = d.turnCount > 0 ? d.totalDurationMs / d.turnCount : 0
  const reversedHistory = [...d.toolHistory].reverse().slice(0, 20)

  return (
    <div style={{ borderTop: '2px solid var(--pixel-border)', background: 'rgba(255,255,255,0.02)', overflowY: 'auto', flexShrink: 0, maxHeight: '45%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize: '13px', color: '#fff', fontWeight: 'bold' }}>
          {folderName ?? `#${d.id}`} <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 'normal' }}>({modelShort})</span>
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '14px', cursor: 'pointer', padding: '0 4px' }}>[X]</button>
      </div>

      <div style={{ padding: '2px 8px 6px' }}>
        {/* Info */}
        {(d.gitBranch || d.permissionMode || d.startTime) && (
          <>
            <div style={detailSectionTitle}>Info</div>
            {d.gitBranch && <div style={detailRowStyle}><span style={detailLabelStyle}>Branch:</span><span style={{ ...detailValueStyle, color: '#7cb3ff' }}>{d.gitBranch}</span></div>}
            {d.permissionMode && <div style={detailRowStyle}><span style={detailLabelStyle}>Perms:</span><span style={{ ...detailValueStyle, color: d.permissionMode === 'bypassPermissions' ? '#e5c07b' : '#98c379' }}>{d.permissionMode}</span></div>}
            {d.startTime && <div style={detailRowStyle}><span style={detailLabelStyle}>Started:</span><span style={detailValueStyle}>{formatIsoTime(d.startTime)}</span></div>}
          </>
        )}

        {/* Tokens */}
        <div style={detailSectionTitle}>Tokens</div>
        <div style={detailRowStyle}><span style={detailLabelStyle}>Input:</span><PixelBar value={contextInput} max={contextLimit} color="#5a8cff" /><span style={{ ...detailValueStyle, marginLeft: 4 }}>{formatNumberCompact(contextInput)}</span></div>
        <div style={detailRowStyle}><span style={detailLabelStyle}>Output:</span><PixelBar value={contextOutput} max={contextLimit} color="#5ac88c" /><span style={{ ...detailValueStyle, marginLeft: 4 }}>{formatNumberCompact(contextOutput)}</span></div>
        <div style={detailRowStyle}><span style={detailLabelStyle}>Cache:</span><PixelBar value={contextCacheRead} max={contextLimit} color="#c678dd" /><span style={{ ...detailValueStyle, marginLeft: 4 }}>{formatNumberCompact(contextCacheRead)}</span></div>
        <div style={detailRowStyle}><span style={detailLabelStyle}>Context:</span><PixelBar value={contextTotal} max={contextLimit} color="#e5c07b" /><span style={{ ...detailValueStyle, marginLeft: 4 }}>{formatNumberCompact(contextTotal)}/{formatNumberCompact(contextLimit)}</span></div>
        {d.contextUsage && <div style={detailRowStyle}><span style={detailLabelStyle}>Lifetime:</span><span style={detailValueStyle}>{formatNumberCompact(totalTokens)}</span></div>}

        {/* Performance */}
        <div style={detailSectionTitle}>Performance</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
          Turns: {d.turnCount} | Avg: {formatDuration(avgTurnMs)} | Cache: {cacheHitRate}% | Total: {formatDuration(d.totalDurationMs)}
        </div>

        {/* Tool History */}
        {reversedHistory.length > 0 && (
          <>
            <div style={detailSectionTitle}>Tools (last {reversedHistory.length})</div>
            <div style={{ maxHeight: 120, overflowY: 'auto', background: '#151528', border: '1px solid #333355', padding: '2px 0' }}>
              {reversedHistory.map((entry, i) => (
                <div key={`${entry.timestamp}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 6px', fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.35)', minWidth: 55 }}>{formatIsoTime(entry.timestamp)}</span>
                  <span style={{ flex: 1, marginLeft: 4, color: '#7cb3ff' }}>{entry.name}</span>
                  <span style={{ minWidth: 45, textAlign: 'right', color: 'rgba(255,255,255,0.4)' }}>{entry.durationMs !== undefined ? formatDuration(entry.durationMs) : '...'}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
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
  selectedAgentId: number | null
  agentConversation: { id: number; messages: ConversationMessage[] } | null
  requestAgentConversation: (id: number) => void
  agentDetails: AgentDetails | null
  inspectedAgentId: number | null
  onCloseInspection: () => void
  sendMessages: Array<{ id: number; from: string; to: string; message: string; timestamp: number }>
}

const sidebarStyle: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 10,
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
  selectedAgentId,
  agentConversation,
  requestAgentConversation,
  agentDetails,
  inspectedAgentId,
  onCloseInspection,
  sendMessages,
}: RightSidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'activity' | 'messages' | 'chat'>('activity')
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Track previous state for change detection
  const prevAgentsRef = useRef<number[]>([])
  const prevToolsRef = useRef<Record<number, ToolActivity[]>>({})
  const prevStatusesRef = useRef<Record<number, string>>({})
  const prevSubagentsRef = useRef<SubagentCharacter[]>([])
  const prevSubToolsRef = useRef<Record<number, Record<string, ToolActivity[]>>>({})
  const prevSendMessagesRef = useRef<Array<{ id: number; from: string; to: string; message: string; timestamp: number }>>([])

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

    // Detect new SendMessage events
    const prevSendMsgCount = prevSendMessagesRef.current.length
    for (let i = prevSendMsgCount; i < sendMessages.length; i++) {
      const sm = sendMessages[i]
      newEntries.push({
        id: nextEntryId++,
        agentId: sm.id,
        agentName: sm.from,
        text: sm.message,
        type: 'send_message',
        timestamp: sm.timestamp,
        sendFrom: sm.from,
        sendTo: sm.to,
      })
    }

    prevAgentsRef.current = [...agents]
    prevToolsRef.current = { ...agentTools }
    prevStatusesRef.current = { ...agentStatuses }
    prevSubagentsRef.current = [...subagentCharacters]
    prevSubToolsRef.current = { ...subagentTools }
    prevSendMessagesRef.current = sendMessages

    if (newEntries.length > 0) {
      setEntries((prev) => [...prev, ...newEntries].slice(-100))
    }
  }, [agents, agentTools, agentStatuses, subagentCharacters, subagentTools, officeState, sendMessages])

  // Auto-switch to Chat tab when agent is inspected
  useEffect(() => {
    if (inspectedAgentId !== null) {
      setActiveTab('chat')
    }
  }, [inspectedAgentId])

  // Auto-request conversation when Chat tab is active
  useEffect(() => {
    if (activeTab === 'chat' && selectedAgentId !== null) {
      requestAgentConversation(selectedAgentId)
    }
  }, [activeTab, selectedAgentId, requestAgentConversation])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current && (activeTab === 'activity' || activeTab === 'chat')) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, agentConversation?.messages.length, activeTab])

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

  return (
    <div style={{ ...sidebarStyle, width: 320 }}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '18px', color: 'var(--pixel-accent)', fontWeight: 'bold' }}>
            {activeTab === 'activity' ? 'ACTIVITY' : activeTab === 'messages' ? 'MESSAGES' : 'CHAT'}
          </span>
          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>
            ({activeTab === 'activity' ? entries.length : activeTab === 'messages' ? sendMessages.length : agentConversation?.messages.length ?? 0})
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
          onClick={() => setActiveTab('messages')}
          style={{
            ...tabBtnBase,
            color: activeTab === 'messages' ? '#ffb347' : tabBtnBase.color,
            borderBottomColor: activeTab === 'messages' ? '#ffb347' : 'transparent',
          }}
        >
          Messages
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          style={{
            ...tabBtnBase,
            color: activeTab === 'chat' ? '#e056fd' : tabBtnBase.color,
            borderBottomColor: activeTab === 'chat' ? '#e056fd' : 'transparent',
          }}
        >
          Chat
        </button>
      </div>

      {/* Content */}
      {activeTab === 'chat' ? (
        /* Chat tab: split view — Chat top + Agent Details bottom */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '4px', minHeight: 0 }}>
            <ConversationView
              messages={agentConversation?.id === selectedAgentId ? agentConversation.messages : []}
              selectedAgentId={selectedAgentId}
            />
          </div>
          {inspectedAgentId !== null && agentDetails && agentDetails.id === inspectedAgentId && (
            <AgentDetailsView
              details={agentDetails}
              folderName={officeState.characters.get(inspectedAgentId)?.folderName}
              onClose={onCloseInspection}
            />
          )}
        </div>
      ) : (
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
              const isSendMsg = entry.type === 'send_message'
              return (
              <div
                key={entry.id}
                style={{
                  padding: isSendMsg ? '4px 6px' : '3px 6px',
                  marginBottom: 1,
                  borderLeft: `2px solid ${getEntryColor(entry.type)}`,
                  marginLeft: entry.isSubagent ? 8 : 0,
                  transition: 'background 0.1s ease',
                  ...(isSendMsg ? { background: 'rgba(0,100,30,0.35)', borderRadius: 2 } : {}),
                }}
              >
                {isSendMsg ? (
                  /* SendMessage: two-line layout with labels */
                  <>
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
                        fontSize: '14px', padding: '1px 5px', fontWeight: 'bold',
                        background: 'rgba(255,165,0,0.2)', color: '#ffb347',
                        border: '1px solid rgba(255,165,0,0.4)',
                        borderRadius: 2, whiteSpace: 'nowrap', lineHeight: '18px',
                      }}>
                        {entry.sendFrom}
                      </span>
                      <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>→</span>
                      <span style={{
                        fontSize: '14px', padding: '1px 5px', fontWeight: 'bold',
                        background: 'rgba(90,200,140,0.2)', color: '#5ac88c',
                        border: '1px solid rgba(90,200,140,0.4)',
                        borderRadius: 2, whiteSpace: 'nowrap', lineHeight: '18px',
                      }}>
                        {entry.sendTo}
                      </span>
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: 'rgba(255,255,255,0.55)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      paddingLeft: 2,
                      marginTop: 1,
                      lineHeight: '1.3',
                      wordBreak: 'break-word',
                    }}>
                      {entry.text}
                    </div>
                  </>
                ) : (
                  /* Regular entries: single-line layout */
                  <>
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
                          textTransform: 'none', letterSpacing: '0.3px',
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
                  </>
                )}
              </div>
              )
            })
          )
        ) : (
          /* Messages View — agent-to-agent communication */
          <MessagesView messages={sendMessages} />
        )}
      </div>
      )}
    </div>
  )
}
