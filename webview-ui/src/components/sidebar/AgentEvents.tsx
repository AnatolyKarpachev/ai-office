/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { useState, useCallback } from 'react'
import type { AgentRoleInfo } from '../../hooks/useExtensionMessages.js'
import { RoleBadge } from '../RoleBadge.js'

// ── Types ────────────────────────────────────────────────────────────

export interface ActivityEntry {
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

export let nextEntryId = 1
export function bumpEntryId(): number { return nextEntryId++ }

// ── Shared helpers ───────────────────────────────────────────────────

export function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function getEntryColor(type: ActivityEntry['type']): string {
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
    case 'tool_start': return '\u25B8'
    case 'tool_done': return '\u2713'
    case 'permission': return '\u26A0'
    case 'status': return '\u25CF'
    case 'agent_joined': return '+'
    case 'agent_left': return '\u2212'
    case 'sub_tool_start': return '  \u25B8'
    case 'sub_tool_done': return '  \u2713'
    case 'sub_permission': return '  \u26A0'
    case 'sub_joined': return '  +'
    case 'sub_left': return '  \u2212'
    case 'send_message': return '\u2192'
  }
}

// ── SendMessageEntry type & MessagesView ─────────────────────────────

interface SendMessageEntry {
  id: number
  from: string
  to: string
  message: string
  timestamp: number
}

export function MessagesView({ messages }: { messages: SendMessageEntry[] }) {
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
              background: msg.to === 'scratchboard' ? 'rgba(0,50,150,0.2)' : 'rgba(0,100,30,0.2)',
              borderLeft: `2px solid ${msg.to === 'scratchboard' ? 'rgba(0,150,255,0.9)' : 'rgba(255,165,0,0.9)'}`,
              cursor: 'pointer',
              transition: 'background 0.1s ease',
            }}
          >
            {/* Header: time + from -> to */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', flexShrink: 0 }}>
                {isExpanded ? '\u25BE' : '\u25B8'}
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
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>\u2192</span>
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

// ── ActivityFeed component ───────────────────────────────────────────

export interface ActivityFeedProps {
  entries: ActivityEntry[]
  agentRoles: Map<number, AgentRoleInfo>
}

export function ActivityFeed({ entries, agentRoles }: ActivityFeedProps) {
  if (entries.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '18px', fontStyle: 'italic' }}>
        Waiting for events...
      </div>
    )
  }

  return (
    <>
      {entries.map((entry) => {
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
                  <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>{'\u2192'}</span>
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
      })}
    </>
  )
}
