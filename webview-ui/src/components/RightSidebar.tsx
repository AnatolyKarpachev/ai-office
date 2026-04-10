/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { AgentStats, AgentRoleInfo, SubagentCharacter, ConversationMessage, AgentDetails } from '../hooks/useExtensionMessages.js'
import type { ToolActivity } from '../office/types.js'
import { ActivityFeed, MessagesView, formatTime, getEntryColor, bumpEntryId } from './sidebar/AgentEvents.js'
import type { ActivityEntry } from './sidebar/AgentEvents.js'
import { ConversationView, AgentDetailsView } from './sidebar/AgentChat.js'

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
          id: bumpEntryId(),
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
          id: bumpEntryId(),
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
            id: bumpEntryId(),
            agentId: id,
            agentName: getAgentName(id),
            text: tool.status,
            type: 'tool_start',
            timestamp: now,
          })
        } else if (tool.done && !prevTool.done) {
          newEntries.push({
            id: bumpEntryId(),
            agentId: id,
            agentName: getAgentName(id),
            text: `Done: ${tool.status}`,
            type: 'tool_done',
            timestamp: now,
          })
        } else if (tool.permissionWait && !prevTool.permissionWait) {
          newEntries.push({
            id: bumpEntryId(),
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
          id: bumpEntryId(),
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
          id: bumpEntryId(),
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
          id: bumpEntryId(),
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
              id: bumpEntryId(),
              agentId: parentId,
              agentName: `${getAgentName(parentId)} > ${subLabel}`,
              text: tool.status,
              type: 'sub_tool_start',
              timestamp: now,
              isSubagent: true,
            })
          } else if (tool.done && !prevTool.done) {
            newEntries.push({
              id: bumpEntryId(),
              agentId: parentId,
              agentName: `${getAgentName(parentId)} > ${subLabel}`,
              text: `Done: ${tool.status}`,
              type: 'sub_tool_done',
              timestamp: now,
              isSubagent: true,
            })
          } else if (tool.permissionWait && !prevTool.permissionWait) {
            newEntries.push({
              id: bumpEntryId(),
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
        id: bumpEntryId(),
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
          {'\u25C0'}
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
          {'\u25B6'}
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
          <ActivityFeed entries={entries} agentRoles={agentRoles} />
        ) : (
          /* Messages View — agent-to-agent communication */
          <MessagesView messages={sendMessages} />
        )}
      </div>
      )}
    </div>
  )
}
