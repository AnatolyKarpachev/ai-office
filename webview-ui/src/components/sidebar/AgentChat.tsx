/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import type React from 'react'
import type { ConversationMessage, AgentDetails } from '../../hooks/useExtensionMessages.js'
import { getModelShortName } from '../../modelInfo.js'

// ── Helpers ──────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

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

// ── ConversationView ─────────────────────────────────────────────────

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

export interface ConversationViewProps {
  messages: ConversationMessage[]
  selectedAgentId: number | null
}

export function ConversationView({ messages, selectedAgentId }: ConversationViewProps) {
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

// ── AgentDetailsView ─────────────────────────────────────────────────

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

export interface AgentDetailsViewProps {
  details: AgentDetails
  folderName?: string
  onClose: () => void
}

export function AgentDetailsView({ details, folderName, onClose }: AgentDetailsViewProps) {
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
