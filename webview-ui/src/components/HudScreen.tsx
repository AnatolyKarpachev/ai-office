import { useState, useMemo } from 'react'
import type { AgentStats, AgentRoleInfo } from '../hooks/useExtensionMessages.js'

interface HudScreenProps {
  isOpen: boolean
  onClose: () => void
  agents: Map<number, { name: string; status: string }>
  agentStats: Map<number, AgentStats>
  agentRoles: Map<number, AgentRoleInfo>
}

type SortKey = 'id' | 'role' | 'model' | 'input' | 'output' | 'cache' | 'context' | 'turns' | 'duration'
type SortDir = 'asc' | 'desc'

// ------- formatting helpers -------

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

function formatCost(dollars: number): string {
  if (dollars >= 1) return `$${dollars.toFixed(2)}`
  if (dollars >= 0.01) return `$${dollars.toFixed(3)}`
  return `$${dollars.toFixed(4)}`
}

// ------- pricing per model -------

interface ModelPricing {
  inputPerMtok: number
  outputPerMtok: number
}

function getPricing(model?: string): ModelPricing {
  const m = (model ?? '').toLowerCase()
  if (m.includes('haiku')) return { inputPerMtok: 0.25, outputPerMtok: 1.25 }
  if (m.includes('sonnet')) return { inputPerMtok: 3, outputPerMtok: 15 }
  // Default to Opus
  return { inputPerMtok: 15, outputPerMtok: 75 }
}

function estimateCost(stats: AgentStats): number {
  const pricing = getPricing(stats.model)
  const cacheDiscount = 0.1
  const inputCost = ((stats.totalInputTokens - stats.totalCacheRead) / 1_000_000) * pricing.inputPerMtok
  const cacheCost = (stats.totalCacheRead / 1_000_000) * pricing.inputPerMtok * cacheDiscount
  const outputCost = (stats.totalOutputTokens / 1_000_000) * pricing.outputPerMtok
  return Math.max(0, inputCost + cacheCost + outputCost)
}

// ------- color for context fill -------

function contextFillColor(pct: number): string {
  if (pct < 50) return '#4caf50'
  if (pct < 80) return '#ffc107'
  return '#f44336'
}

// ------- styles -------

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  background: 'rgba(0, 0, 0, 0.75)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  overflowY: 'auto',
  padding: '40px 16px',
}

const contentStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 900,
  background: 'var(--pixel-bg)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  boxShadow: 'var(--pixel-shadow)',
  padding: 20,
  position: 'relative',
  color: 'var(--pixel-text)',
  fontSize: 16,
  fontFamily: 'monospace',
  imageRendering: 'pixelated' as const,
}

const closeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 12,
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  color: 'rgba(255, 255, 255, 0.6)',
  fontSize: 20,
  cursor: 'pointer',
  padding: '2px 6px',
  lineHeight: 1,
}

const summaryBarStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 16,
  padding: '10px 14px',
  marginBottom: 16,
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  background: 'rgba(255, 255, 255, 0.03)',
}

const summaryItemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const summaryLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--pixel-text-dim, rgba(255,255,255,0.5))',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const summaryValueStyle: React.CSSProperties = {
  fontSize: 20,
  color: 'var(--pixel-accent, #5a8cff)',
  fontWeight: 'bold',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
  marginBottom: 16,
}

const thStyle: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'left',
  borderBottom: '2px solid var(--pixel-border)',
  cursor: 'pointer',
  userSelect: 'none',
  color: 'rgba(255, 255, 255, 0.7)',
  fontSize: 13,
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  whiteSpace: 'nowrap',
}

const warningBoxStyle: React.CSSProperties = {
  padding: '10px 14px',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  background: 'rgba(244, 67, 54, 0.08)',
}

const warningTitleStyle: React.CSSProperties = {
  fontSize: 16,
  color: '#f44336',
  marginBottom: 6,
  fontWeight: 'bold',
}

const warningItemStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'rgba(255, 255, 255, 0.75)',
  padding: '2px 0',
}

// ------- component -------

export function HudScreen({ isOpen, onClose, agents, agentStats, agentRoles }: HudScreenProps) {
  const [sortKey, setSortKey] = useState<SortKey>('id')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [closeBtnHovered, setCloseBtnHovered] = useState(false)

  // Aggregated summary
  const summary = useMemo(() => {
    let totalInput = 0
    let totalOutput = 0
    let totalCacheRead = 0
    let totalDuration = 0
    let totalCost = 0
    let cacheHitSum = 0
    let cacheHitCount = 0

    for (const stats of agentStats.values()) {
      totalInput += stats.totalInputTokens
      totalOutput += stats.totalOutputTokens
      totalCacheRead += stats.totalCacheRead
      totalDuration += stats.totalDurationMs
      totalCost += estimateCost(stats)
      cacheHitSum += stats.cacheHitRate
      cacheHitCount++
    }

    const totalTokens = totalInput + totalOutput + totalCacheRead
    const avgCacheHit = cacheHitCount > 0 ? cacheHitSum / cacheHitCount : 0
    const activeCount = [...agents.values()].filter((a) => a.status === 'active' || a.status === undefined).length

    return { totalTokens, totalCost, totalDuration, activeCount, avgCacheHit }
  }, [agentStats, agents])

  // Build rows
  const rows = useMemo(() => {
    const result: Array<{
      id: number
      name: string
      role: string
      model: string
      input: number
      output: number
      cacheHit: number
      contextPct: number
      turns: number
      durationMs: number
    }> = []

    for (const [id, agent] of agents) {
      const stats = agentStats.get(id)
      const roleInfo = agentRoles.get(id)
      const contextPct = stats?.currentContextLimit
        ? Math.min(((stats.currentContextTokens ?? 0) / stats.currentContextLimit) * 100, 100)
        : 0

      result.push({
        id,
        name: agent.name,
        role: roleInfo?.role ?? '-',
        model: stats?.model ?? '-',
        input: stats?.totalInputTokens ?? 0,
        output: stats?.totalOutputTokens ?? 0,
        cacheHit: stats?.cacheHitRate ?? 0,
        contextPct,
        turns: stats?.turnCount ?? 0,
        durationMs: stats?.totalDurationMs ?? 0,
      })
    }

    result.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'id': cmp = a.id - b.id; break
        case 'role': cmp = a.role.localeCompare(b.role); break
        case 'model': cmp = a.model.localeCompare(b.model); break
        case 'input': cmp = a.input - b.input; break
        case 'output': cmp = a.output - b.output; break
        case 'cache': cmp = a.cacheHit - b.cacheHit; break
        case 'context': cmp = a.contextPct - b.contextPct; break
        case 'turns': cmp = a.turns - b.turns; break
        case 'duration': cmp = a.durationMs - b.durationMs; break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [agents, agentStats, agentRoles, sortKey, sortDir])

  // Bottleneck warnings
  const warnings = useMemo(() => {
    const lowCache: Array<{ id: number; name: string; rate: number }> = []
    const highContext: Array<{ id: number; name: string; pct: number }> = []

    for (const row of rows) {
      // Only warn if agent actually has stats (cacheHit > 0 check is wrong — 0 is valid).
      // Warn if has stats and cache hit < 30%
      const stats = agentStats.get(row.id)
      if (stats && stats.cacheHitRate < 30 && stats.turnCount > 0) {
        lowCache.push({ id: row.id, name: row.name, rate: row.cacheHit })
      }
      if (row.contextPct > 80) {
        highContext.push({ id: row.id, name: row.name, pct: row.contextPct })
      }
    }

    return { lowCache, highContext }
  }, [rows, agentStats])

  if (!isOpen) return null

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' ^' : ' v'
  }

  const hasWarnings = warnings.lowCache.length > 0 || warnings.highContext.length > 0

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={contentStyle} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          style={{
            ...closeBtnStyle,
            background: closeBtnHovered ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
          onClick={onClose}
          onMouseEnter={() => setCloseBtnHovered(true)}
          onMouseLeave={() => setCloseBtnHovered(false)}
          title="Close HUD"
        >
          X
        </button>

        {/* Title */}
        <div style={{ fontSize: 20, marginBottom: 14, color: 'rgba(255, 255, 255, 0.9)' }}>
          HUD - Agent Metrics
        </div>

        {/* A) Summary Bar */}
        <div style={summaryBarStyle}>
          <div style={summaryItemStyle}>
            <span style={summaryLabelStyle}>Total Tokens</span>
            <span style={summaryValueStyle}>{formatTokens(summary.totalTokens)}</span>
          </div>
          <div style={summaryItemStyle}>
            <span style={summaryLabelStyle}>Est. Cost</span>
            <span style={summaryValueStyle}>{formatCost(summary.totalCost)}</span>
          </div>
          <div style={summaryItemStyle}>
            <span style={summaryLabelStyle}>Total Duration</span>
            <span style={summaryValueStyle}>{formatDuration(summary.totalDuration)}</span>
          </div>
          <div style={summaryItemStyle}>
            <span style={summaryLabelStyle}>Active Agents</span>
            <span style={summaryValueStyle}>{summary.activeCount}</span>
          </div>
          <div style={summaryItemStyle}>
            <span style={summaryLabelStyle}>Avg Cache Hit</span>
            <span style={summaryValueStyle}>{Math.round(summary.avgCacheHit)}%</span>
          </div>
        </div>

        {/* B) Per-Agent Table */}
        {rows.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--pixel-text-dim, rgba(255,255,255,0.5))' }}>
            No agent data available
          </div>
        ) : (
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle} onClick={() => handleSort('id')}>ID{sortIndicator('id')}</th>
                  <th style={thStyle} onClick={() => handleSort('role')}>Role{sortIndicator('role')}</th>
                  <th style={thStyle} onClick={() => handleSort('model')}>Model{sortIndicator('model')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('input')}>Input{sortIndicator('input')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('output')}>Output{sortIndicator('output')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('cache')}>Cache %{sortIndicator('cache')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('context')}>Ctx %{sortIndicator('context')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('turns')}>Turns{sortIndicator('turns')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('duration')}>Duration{sortIndicator('duration')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} style={{ background: 'transparent' }}>
                    <td style={tdStyle}>{row.id}</td>
                    <td style={tdStyle}>{row.role}</td>
                    <td style={tdStyle}>{row.model}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatTokens(row.input)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatTokens(row.output)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{Math.round(row.cacheHit)}%</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: contextFillColor(row.contextPct) }}>
                      {Math.round(row.contextPct)}%
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{row.turns}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatDuration(row.durationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* C) Bottleneck Warnings */}
        {hasWarnings && (
          <div style={warningBoxStyle}>
            <div style={warningTitleStyle}>Bottleneck Warnings</div>
            {warnings.lowCache.map((w) => (
              <div key={`cache-${w.id}`} style={warningItemStyle}>
                Agent {w.id} ({w.name}): cache hit rate {Math.round(w.rate)}% — wasteful, consider prompt caching
              </div>
            ))}
            {warnings.highContext.map((w) => (
              <div key={`ctx-${w.id}`} style={warningItemStyle}>
                Agent {w.id} ({w.name}): context fill {Math.round(w.pct)}% — near limit
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
