/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { getModelShortName } from '../modelInfo.js'

interface TokenBarProps {
  totalTokens: number
  usageTokens?: number
  contextLimit: number
  model?: string
  turnCount: number
  visible: boolean
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function TokenBar({ totalTokens, usageTokens, contextLimit, model, turnCount, visible }: TokenBarProps) {
  if (!visible || contextLimit === 0) return null

  const contextTokens = usageTokens ?? totalTokens
  const pct = Math.min((contextTokens / contextLimit) * 100, 100)
  const modelShort = getModelShortName(model)

  // Color gradient: green (<50%) -> yellow (50-80%) -> red (>80%)
  let barColor: string
  if (pct < 50) {
    barColor = '#4caf50'
  } else if (pct < 80) {
    barColor = '#ffc107'
  } else {
    barColor = '#f44336'
  }

  const tooltipText = `${formatNumber(contextTokens)} / ${formatNumber(contextLimit)} tokens in context (${Math.round(pct)}%) | ${formatNumber(totalTokens)} total | ${turnCount} turns`

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
      }}
    >
      {modelShort && (
        <span
          style={{
            fontSize: '10px',
            lineHeight: 1,
            color: 'var(--pixel-text-dim)',
            fontFamily: 'monospace',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          {modelShort}
        </span>
      )}
      <div
        title={tooltipText}
        style={{
          width: 64,
          height: 5,
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: 0,
          overflow: 'hidden',
          imageRendering: 'pixelated',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: barColor,
            borderRadius: 0,
            transition: 'width 0.3s ease',
            imageRendering: 'pixelated',
          }}
        />
      </div>
    </div>
  )
}
