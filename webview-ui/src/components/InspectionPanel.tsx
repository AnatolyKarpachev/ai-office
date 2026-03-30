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
  agentId: number | null // null = hidden
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

/** Pixel-art styled progress bar */
function PixelBar({ value, max, color }: { value: number; max: number; color: string }) {
  const totalBlocks = 10
  const filled = max > 0 ? Math.round((value / max) * totalBlocks) : 0
  const blocks: string[] = []
  for (let i = 0; i < totalBlocks; i++) {
    blocks.push(i < filled ? '\u2588' : '\u2591')
  }
  return (
    <span style={{ fontFamily: 'monospace', letterSpacing: '1px', color, fontSize: '14px' }}>
      {blocks.join('')}
    </span>
  )
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  right: 24,
  transform: 'translateY(-50%)',
  width: 380,
  maxHeight: '80vh',
  background: '#1a1a2e',
  border: '2px solid #4a4a6a',
  boxShadow: '4px 4px 0px #0a0a14',
  zIndex: 200,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  borderBottom: '2px solid #4a4a6a',
  background: '#22223a',
}

const sectionStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #333355',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '16px',
  color: '#8888bb',
  marginBottom: 4,
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
}

const labelStyle: React.CSSProperties = {
  fontSize: '14px',
  color: 'rgba(255,255,255,0.5)',
  minWidth: 70,
  display: 'inline-block',
}

const valueStyle: React.CSSProperties = {
  fontSize: '14px',
  color: 'rgba(255,255,255,0.85)',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '2px 0',
}

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.5)',
  fontSize: '18px',
  cursor: 'pointer',
  padding: '0 4px',
  lineHeight: 1,
}

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

  // Reversed tool history (most recent first)
  const reversedHistory = [...d.toolHistory].reverse()

  return (
    <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={closeBtnStyle} onClick={onClose} title="Close (Esc)">
            [X]
          </button>
          <span style={{ fontSize: '16px', color: '#fff' }}>
            Agent: {folderName ?? `#${d.id}`} ({modelShort})
          </span>
        </div>
        <span
          style={{
            fontSize: '12px',
            color: '#5ac88c',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#5ac88c',
            }}
          />
          active
        </span>
      </div>

      {/* Scrollable body */}
      <div ref={scrollRef} style={{ overflowY: 'auto', flex: 1 }}>
        {/* Info section */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Info</div>
          {d.gitBranch && (
            <div style={rowStyle}>
              <span style={labelStyle}>Branch:</span>
              <span style={{ ...valueStyle, color: '#7cb3ff' }}>{d.gitBranch}</span>
            </div>
          )}
          {d.cwd && (
            <div style={rowStyle}>
              <span style={labelStyle}>Dir:</span>
              <span style={{ ...valueStyle, fontSize: '12px', wordBreak: 'break-all' }}>{d.cwd}</span>
            </div>
          )}
          <div style={rowStyle}>
            <span style={labelStyle}>Session:</span>
            <span style={valueStyle}>{d.sessionId.slice(0, 8)}</span>
          </div>
          {d.version && (
            <div style={rowStyle}>
              <span style={labelStyle}>Version:</span>
              <span style={valueStyle}>{d.version}</span>
            </div>
          )}
          {d.permissionMode && (
            <div style={rowStyle}>
              <span style={labelStyle}>Perms:</span>
              <span style={{ ...valueStyle, color: d.permissionMode === 'bypassPermissions' ? '#e5c07b' : '#98c379' }}>
                {d.permissionMode}
              </span>
            </div>
          )}
          {d.startTime && (
            <div style={rowStyle}>
              <span style={labelStyle}>Started:</span>
              <span style={valueStyle}>{formatTime(d.startTime)}</span>
            </div>
          )}
        </div>

        {/* Token Usage section */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Token Usage</div>
          <div style={rowStyle}>
            <span style={{ ...labelStyle, minWidth: 60 }}>Input:</span>
            <PixelBar value={contextInput} max={contextLimit} color="#5a8cff" />
            <span style={{ ...valueStyle, marginLeft: 4 }}>{formatNumber(contextInput)}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ ...labelStyle, minWidth: 60 }}>Output:</span>
            <PixelBar value={contextOutput} max={contextLimit} color="#5ac88c" />
            <span style={{ ...valueStyle, marginLeft: 4 }}>{formatNumber(contextOutput)}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ ...labelStyle, minWidth: 60 }}>Cache:</span>
            <PixelBar value={contextCacheRead} max={contextLimit} color="#c678dd" />
            <span style={{ ...valueStyle, marginLeft: 4 }}>{formatNumber(contextCacheRead)}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ ...labelStyle, minWidth: 60 }}>Context:</span>
            <PixelBar value={contextTotal} max={contextLimit} color="#e5c07b" />
            <span style={{ ...valueStyle, marginLeft: 4 }}>
              {formatNumber(contextTotal)}/{formatNumber(contextLimit)}
            </span>
          </div>
          {d.contextUsage && (
            <div style={rowStyle}>
              <span style={{ ...labelStyle, minWidth: 60 }}>Lifetime:</span>
              <span style={valueStyle}>{formatNumber(totalTokens)}</span>
            </div>
          )}
        </div>

        {/* Performance section */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Performance</div>
          <div style={rowStyle}>
            <span style={valueStyle}>
              Turns: {d.turnCount} | Avg: {formatDuration(avgTurnMs)}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={valueStyle}>
              Cache hit: {cacheHitRate}% | Total: {formatDuration(d.totalDurationMs)}
            </span>
          </div>
        </div>

        {/* Tool History section */}
        <div style={{ ...sectionStyle, borderBottom: 'none', paddingBottom: 12 }}>
          <div style={sectionTitleStyle}>Tool History (last {d.toolHistory.length})</div>
          <div
            style={{
              maxHeight: 200,
              overflowY: 'auto',
              background: '#151528',
              border: '1px solid #333355',
              padding: '4px 0',
            }}
          >
            {reversedHistory.length === 0 && (
              <div style={{ padding: '8px 12px', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>
                No tools used yet
              </div>
            )}
            {reversedHistory.map((entry, i) => (
              <div
                key={`${entry.timestamp}-${i}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '2px 8px',
                  fontSize: '13px',
                  color: 'rgba(255,255,255,0.7)',
                  borderBottom: i < reversedHistory.length - 1 ? '1px solid #222244' : 'none',
                }}
              >
                <span style={{ color: 'rgba(255,255,255,0.4)', minWidth: 65 }}>
                  {formatTime(entry.timestamp)}
                </span>
                <span style={{ flex: 1, textAlign: 'left', marginLeft: 8, color: '#7cb3ff' }}>
                  {entry.name}
                </span>
                <span style={{ minWidth: 60, textAlign: 'right', color: 'rgba(255,255,255,0.5)' }}>
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
