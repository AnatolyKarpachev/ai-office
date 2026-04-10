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
        <pre key={i} className="bg-black/30 px-1.5 py-1 my-1 text-[12px] font-mono border border-white/10 overflow-auto max-h-[150px] whitespace-pre-wrap break-words">
          {code}
        </pre>
      )
    }
    return part.split(/(`[^`]+`)/g).map((seg, j) => {
      if (seg.startsWith('`') && seg.endsWith('`')) {
        return (
          <code key={`${i}-${j}`} className="bg-white/10 px-[3px] py-px text-[12px] font-mono">
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
    return <div className="p-4 text-center text-white/30 text-[18px]">Select an agent to view conversation</div>
  }
  if (messages.length === 0) {
    return <div className="p-4 text-center text-white/30 text-[18px] italic">No messages yet...</div>
  }

  return (
    <>
      {messages.map((msg, i) => (
        <div key={i} className="px-2 py-1.5 mb-1" style={{
          borderLeft: `3px solid ${msg.role === 'assistant' ? '#6c5ce7' : '#00b894'}`,
          background: msg.role === 'assistant' ? 'rgba(108,92,231,0.08)' : 'rgba(0,184,148,0.08)',
        }}>
          <div className="flex justify-between mb-0.5">
            <span className="text-[11px] font-bold uppercase" style={{ color: msg.role === 'assistant' ? '#a29bfe' : '#55efc4' }}>
              {msg.role}
            </span>
            <span className="text-[11px] text-white/30 font-mono">
              {formatTime(new Date(msg.timestamp).getTime())}
            </span>
          </div>
          {msg.toolNames && msg.toolNames.length > 0 && (
            <div className="text-[10px] text-[rgba(90,140,255,0.6)] mb-[3px]">
              tools: {msg.toolNames.join(', ')}
            </div>
          )}
          <div className="text-[13px] text-white/75 whitespace-pre-wrap break-words leading-[1.4] max-h-[200px] overflow-hidden">
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
  return <span className="font-mono tracking-[1px] text-[12px]" style={{ color }}>{blocks.join('')}</span>
}

const dlCls = "text-[12px] text-white/45 min-w-[55px] shrink-0"
const dvCls = "text-[12px] text-white/80"
const drCls = "flex items-center gap-1.5 py-px"
const dsCls = "text-[11px] text-[#8888bb] mb-0.5 mt-1.5 uppercase tracking-[1px]"

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
    <div className="border-t-2 border-pixel-border bg-white/[0.02] overflow-y-auto shrink-0 max-h-[45%]">
      <div className="flex items-center justify-between px-2 py-1 bg-white/[0.03] border-b border-white/[0.06]">
        <span className="text-[13px] text-white font-bold">
          {folderName ?? `#${d.id}`} <span className="text-white/40 font-normal">({modelShort})</span>
        </span>
        <button onClick={onClose} className="bg-transparent border-0 text-white/40 text-[14px] cursor-pointer px-1 hover:text-pixel-close-hover">[X]</button>
      </div>

      <div className="px-2 py-0.5 pb-1.5">
        {(d.gitBranch || d.permissionMode || d.startTime) && (
          <>
            <div className={dsCls}>Info</div>
            {d.gitBranch && <div className={drCls}><span className={dlCls}>Branch:</span><span className={`${dvCls} text-[#7cb3ff]`}>{d.gitBranch}</span></div>}
            {d.permissionMode && <div className={drCls}><span className={dlCls}>Perms:</span><span className={dvCls} style={{ color: d.permissionMode === 'bypassPermissions' ? '#e5c07b' : '#98c379' }}>{d.permissionMode}</span></div>}
            {d.startTime && <div className={drCls}><span className={dlCls}>Started:</span><span className={dvCls}>{formatIsoTime(d.startTime)}</span></div>}
          </>
        )}

        <div className={dsCls}>Tokens</div>
        <div className={drCls}><span className={dlCls}>Input:</span><PixelBar value={contextInput} max={contextLimit} color="#5a8cff" /><span className={`${dvCls} ml-1`}>{formatNumberCompact(contextInput)}</span></div>
        <div className={drCls}><span className={dlCls}>Output:</span><PixelBar value={contextOutput} max={contextLimit} color="#5ac88c" /><span className={`${dvCls} ml-1`}>{formatNumberCompact(contextOutput)}</span></div>
        <div className={drCls}><span className={dlCls}>Cache:</span><PixelBar value={contextCacheRead} max={contextLimit} color="#c678dd" /><span className={`${dvCls} ml-1`}>{formatNumberCompact(contextCacheRead)}</span></div>
        <div className={drCls}><span className={dlCls}>Context:</span><PixelBar value={contextTotal} max={contextLimit} color="#e5c07b" /><span className={`${dvCls} ml-1`}>{formatNumberCompact(contextTotal)}/{formatNumberCompact(contextLimit)}</span></div>
        {d.contextUsage && <div className={drCls}><span className={dlCls}>Lifetime:</span><span className={dvCls}>{formatNumberCompact(totalTokens)}</span></div>}

        <div className={dsCls}>Performance</div>
        <div className="text-[12px] text-white/70">
          Turns: {d.turnCount} | Avg: {formatDuration(avgTurnMs)} | Cache: {cacheHitRate}% | Total: {formatDuration(d.totalDurationMs)}
        </div>

        {reversedHistory.length > 0 && (
          <>
            <div className={dsCls}>Tools (last {reversedHistory.length})</div>
            <div className="max-h-[120px] overflow-y-auto bg-[#151528] border border-[#333355] py-0.5">
              {reversedHistory.map((entry, i) => (
                <div key={`${entry.timestamp}-${i}`} className="flex justify-between px-1.5 py-px text-[11px] text-white/60">
                  <span className="text-white/35 min-w-[55px]">{formatIsoTime(entry.timestamp)}</span>
                  <span className="flex-1 ml-1 text-[#7cb3ff]">{entry.name}</span>
                  <span className="min-w-[45px] text-right text-white/40">{entry.durationMs !== undefined ? formatDuration(entry.durationMs) : '...'}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
