/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { useEffect, useCallback, useRef } from 'react'
import { getModelShortName } from '../modelInfo.js'

export interface AgentDetails {
  id: number
  model?: string
  gitBranch?: string
  cwd?: string
  sessionId: string
  version?: string
  permissionMode?: string
  toolHistory: Array<{ name: string; timestamp: string; durationMs?: number }>
  tokenBreakdown: { input: number; output: number; cacheRead: number; cacheCreation: number }
  contextUsage?: { input: number; output: number; cacheRead: number; total: number; limit: number }
  turnCount: number
  totalDurationMs: number
  startTime?: string
}

interface InspectionPanelProps {
  agentId: number | null
  agentDetails: AgentDetails | null
  folderName?: string
  onClose: () => void
}

function formatNumber(n: number): string {
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

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return isoString
  }
}

function PixelBar({ value, max, color }: { value: number; max: number; color: string }) {
  const totalBlocks = 10
  const filled = max > 0 ? Math.round((value / max) * totalBlocks) : 0
  const blocks: string[] = []
  for (let i = 0; i < totalBlocks; i++) {
    blocks.push(i < filled ? '\u2588' : '\u2591')
  }
  return (
    <span className="font-mono tracking-[1px] text-[14px]" style={{ color }}>
      {blocks.join('')}
    </span>
  )
}

const sectionCls = "px-3 py-2 border-b border-[#333355]"
const sectionTitleCls = "text-[16px] text-[#8888bb] mb-1 uppercase tracking-[1px]"
const labelCls = "text-[14px] text-white/50 min-w-[70px] inline-block"
const valueCls = "text-[14px] text-white/85"
const rowCls = "flex items-center gap-2 py-0.5"

export function InspectionPanel({ agentId, agentDetails, folderName, onClose }: InspectionPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (agentId === null || !agentDetails) return null

  const d = agentDetails
  const modelShort = getModelShortName(d.model) ?? 'unknown'
  const totalTokens = d.tokenBreakdown.input + d.tokenBreakdown.output
  const contextInput = d.contextUsage?.input ?? d.tokenBreakdown.input
  const contextOutput = d.contextUsage?.output ?? d.tokenBreakdown.output
  const contextCacheRead = d.contextUsage?.cacheRead ?? d.tokenBreakdown.cacheRead
  const contextTotal = d.contextUsage?.total ?? totalTokens
  const contextLimit = d.contextUsage?.limit ?? 200_000
  const cacheHitRate =
    d.tokenBreakdown.input > 0
      ? Math.round((d.tokenBreakdown.cacheRead / Math.max(d.tokenBreakdown.input, 1)) * 100)
      : 0
  const avgTurnMs = d.turnCount > 0 ? d.totalDurationMs / d.turnCount : 0

  const reversedHistory = [...d.toolHistory].reverse()

  return (
    <div className="fixed top-1/2 right-6 -translate-y-1/2 w-[380px] max-h-[80vh] bg-[#1a1a2e] border-2 border-[#4a4a6a] shadow-[4px_4px_0px_#0a0a14] z-[200] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b-2 border-[#4a4a6a] bg-[#22223a]">
        <div className="flex items-center gap-2">
          <button className="bg-transparent border-0 text-white/50 text-[18px] cursor-pointer px-1 leading-none hover:text-pixel-close-hover" onClick={onClose} title="Close (Esc)">
            [X]
          </button>
          <span className="text-[16px] text-white">
            Agent: {folderName ?? `#${d.id}`} ({modelShort})
          </span>
        </div>
        <span className="text-[12px] text-pixel-green flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-pixel-green" />
          active
        </span>
      </div>

      {/* Scrollable body */}
      <div ref={scrollRef} className="overflow-y-auto flex-1">
        {/* Info section */}
        <div className={sectionCls}>
          <div className={sectionTitleCls}>Info</div>
          {d.gitBranch && (
            <div className={rowCls}>
              <span className={labelCls}>Branch:</span>
              <span className={`${valueCls} text-[#7cb3ff]`}>{d.gitBranch}</span>
            </div>
          )}
          {d.cwd && (
            <div className={rowCls}>
              <span className={labelCls}>Dir:</span>
              <span className={`${valueCls} text-[12px] break-all`}>{d.cwd}</span>
            </div>
          )}
          <div className={rowCls}>
            <span className={labelCls}>Session:</span>
            <span className={valueCls}>{d.sessionId.slice(0, 8)}</span>
          </div>
          {d.version && (
            <div className={rowCls}>
              <span className={labelCls}>Version:</span>
              <span className={valueCls}>{d.version}</span>
            </div>
          )}
          {d.permissionMode && (
            <div className={rowCls}>
              <span className={labelCls}>Perms:</span>
              <span className={valueCls} style={{ color: d.permissionMode === 'bypassPermissions' ? '#e5c07b' : '#98c379' }}>
                {d.permissionMode}
              </span>
            </div>
          )}
          {d.startTime && (
            <div className={rowCls}>
              <span className={labelCls}>Started:</span>
              <span className={valueCls}>{formatTime(d.startTime)}</span>
            </div>
          )}
        </div>

        {/* Token Usage section */}
        <div className={sectionCls}>
          <div className={sectionTitleCls}>Token Usage</div>
          <div className={rowCls}>
            <span className={`${labelCls} min-w-[60px]`}>Input:</span>
            <PixelBar value={contextInput} max={contextLimit} color="#5a8cff" />
            <span className={`${valueCls} ml-1`}>{formatNumber(contextInput)}</span>
          </div>
          <div className={rowCls}>
            <span className={`${labelCls} min-w-[60px]`}>Output:</span>
            <PixelBar value={contextOutput} max={contextLimit} color="#5ac88c" />
            <span className={`${valueCls} ml-1`}>{formatNumber(contextOutput)}</span>
          </div>
          <div className={rowCls}>
            <span className={`${labelCls} min-w-[60px]`}>Cache:</span>
            <PixelBar value={contextCacheRead} max={contextLimit} color="#c678dd" />
            <span className={`${valueCls} ml-1`}>{formatNumber(contextCacheRead)}</span>
          </div>
          <div className={rowCls}>
            <span className={`${labelCls} min-w-[60px]`}>Context:</span>
            <PixelBar value={contextTotal} max={contextLimit} color="#e5c07b" />
            <span className={`${valueCls} ml-1`}>
              {formatNumber(contextTotal)}/{formatNumber(contextLimit)}
            </span>
          </div>
          {d.contextUsage && (
            <div className={rowCls}>
              <span className={`${labelCls} min-w-[60px]`}>Lifetime:</span>
              <span className={valueCls}>{formatNumber(totalTokens)}</span>
            </div>
          )}
        </div>

        {/* Performance section */}
        <div className={sectionCls}>
          <div className={sectionTitleCls}>Performance</div>
          <div className={rowCls}>
            <span className={valueCls}>
              Turns: {d.turnCount} | Avg: {formatDuration(avgTurnMs)}
            </span>
          </div>
          <div className={rowCls}>
            <span className={valueCls}>
              Cache hit: {cacheHitRate}% | Total: {formatDuration(d.totalDurationMs)}
            </span>
          </div>
        </div>

        {/* Tool History section */}
        <div className="px-3 py-2 pb-3">
          <div className={sectionTitleCls}>Tool History (last {d.toolHistory.length})</div>
          <div className="max-h-[200px] overflow-y-auto bg-[#151528] border border-[#333355] py-1">
            {reversedHistory.length === 0 && (
              <div className="px-3 py-2 text-white/30 text-[13px]">
                No tools used yet
              </div>
            )}
            {reversedHistory.map((entry, i) => (
              <div
                key={`${entry.timestamp}-${i}`}
                className="flex justify-between px-2 py-0.5 text-[13px] text-white/70"
                style={{ borderBottom: i < reversedHistory.length - 1 ? '1px solid #222244' : 'none' }}
              >
                <span className="text-white/40 min-w-[65px]">
                  {formatTime(entry.timestamp)}
                </span>
                <span className="flex-1 text-left ml-2 text-[#7cb3ff]">
                  {entry.name}
                </span>
                <span className="min-w-[60px] text-right text-white/50">
                  {entry.durationMs !== undefined ? formatDuration(entry.durationMs) : '...'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
