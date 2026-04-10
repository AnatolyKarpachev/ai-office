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

// ── Badge components ────────────────────────────────────────────────

const fromBadgeCls = "text-[13px] px-1 font-bold bg-[rgba(255,165,0,0.2)] text-[#ffb347] border border-[rgba(255,165,0,0.4)] rounded-sm whitespace-nowrap leading-[16px] overflow-hidden text-ellipsis max-w-[80px]"
const toBadgeCls = "text-[13px] px-1 font-bold bg-[rgba(90,200,140,0.2)] text-pixel-green border border-[rgba(90,200,140,0.4)] rounded-sm whitespace-nowrap leading-[16px] overflow-hidden text-ellipsis max-w-[80px]"
const fromBadgeLgCls = "text-[14px] px-[5px] py-px font-bold bg-[rgba(255,165,0,0.2)] text-[#ffb347] border border-[rgba(255,165,0,0.4)] rounded-sm whitespace-nowrap leading-[18px]"
const toBadgeLgCls = "text-[14px] px-[5px] py-px font-bold bg-[rgba(90,200,140,0.2)] text-pixel-green border border-[rgba(90,200,140,0.4)] rounded-sm whitespace-nowrap leading-[18px]"

// ── MessagesView ────────────────────────────────────────────────────

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
    return <div className="p-4 text-center text-white/30 text-[18px] italic">No agent messages</div>
  }

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
            className="px-1.5 py-1 mb-px cursor-pointer transition-colors duration-100"
            style={{
              background: msg.to === 'scratchboard' ? 'rgba(0,50,150,0.2)' : 'rgba(0,100,30,0.2)',
              borderLeft: `2px solid ${msg.to === 'scratchboard' ? 'rgba(0,150,255,0.9)' : 'rgba(255,165,0,0.9)'}`,
            }}
          >
            <div className="flex gap-1 items-center">
              <span className="text-[12px] text-white/35 font-mono shrink-0">
                {isExpanded ? '\u25BE' : '\u25B8'}
              </span>
              <span className="text-[13px] text-white/35 font-mono shrink-0">
                {formatTime(msg.timestamp)}
              </span>
              <span className={fromBadgeCls}>{msg.from}</span>
              <span className="text-[13px] text-white/50">{'\u2192'}</span>
              <span className={toBadgeCls}>{msg.to}</span>
            </div>

            {!isExpanded && (
              <div className="text-[13px] text-white/45 overflow-hidden text-ellipsis whitespace-nowrap pl-4 mt-px">
                {lines[0]}
              </div>
            )}

            {isExpanded && (
              <div className="text-[13px] text-white/60 pl-4 mt-0.5 leading-[1.35] break-words whitespace-pre-wrap">
                {truncatedLines.join('\n')}
                {hasMore && (
                  <div className="text-white/30 italic mt-0.5">
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
    return <div className="p-4 text-center text-white/30 text-[18px] italic">Waiting for events...</div>
  }

  return (
    <>
      {entries.map((entry) => {
        const entryRole = agentRoles.get(entry.agentId)
        const isSendMsg = entry.type === 'send_message'
        return (
          <div
            key={entry.id}
            className="mb-px transition-colors"
            style={{
              padding: isSendMsg ? '4px 6px' : '3px 6px',
              borderLeft: `2px solid ${getEntryColor(entry.type)}`,
              marginLeft: entry.isSubagent ? 8 : 0,
              ...(isSendMsg ? { background: 'rgba(0,100,30,0.35)', borderRadius: 2 } : {}),
            }}
          >
            {isSendMsg ? (
              <>
                <div className="flex gap-1 items-center">
                  <span className="text-[14px] text-white/35 font-mono shrink-0">
                    {formatTime(entry.timestamp)}
                  </span>
                  <span className={fromBadgeLgCls}>{entry.sendFrom}</span>
                  <span className="text-[14px] text-white/50">{'\u2192'}</span>
                  <span className={toBadgeLgCls}>{entry.sendTo}</span>
                </div>
                <div className="text-[14px] text-white/55 overflow-hidden text-ellipsis pl-0.5 mt-px leading-[1.3] break-words" style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                }}>
                  {entry.text}
                </div>
              </>
            ) : (
              <>
                <div className="flex gap-1 items-center">
                  <span className="text-[14px] text-white/35 font-mono shrink-0">
                    {formatTime(entry.timestamp)}
                  </span>
                  <span className="text-[14px] font-bold shrink-0" style={{ color: getEntryColor(entry.type) }}>
                    {getEntryIcon(entry.type)}
                  </span>
                  {entryRole?.role && <RoleBadge role={entryRole.role} colors={entryRole.colors} />}
                  {entry.isSubagent ? (
                    <span className="text-[10px] px-[3px] font-bold tracking-[0.3px] bg-[rgba(120,160,255,0.15)] text-[rgba(120,160,255,0.9)] border border-[rgba(120,160,255,0.3)] whitespace-nowrap leading-[14px] shrink-0">
                      {entry.agentName.includes(' > ') ? entry.agentName.split(' > ').pop() : entry.agentName}
                    </span>
                  ) : (
                    <span className="text-[14px] text-[rgba(90,140,255,0.8)] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap max-w-[140px]">
                      {entry.agentName}
                    </span>
                  )}
                </div>
                <div className="text-[15px] text-white/60 overflow-hidden text-ellipsis whitespace-nowrap pl-0.5">
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
