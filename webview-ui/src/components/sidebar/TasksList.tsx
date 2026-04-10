/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import type { GithubTasksConfig, PipelineIssue } from '../../hooks/useExtensionMessages.js'

function getIssueLabelColor(label: string): string {
  const normalized = label.toLowerCase()
  if (normalized.includes('bug') || normalized.includes('blocked')) return '#e55'
  if (normalized.includes('feature') || normalized.includes('enhancement')) return '#3794ff'
  if (normalized.includes('high') || normalized.includes('urgent')) return '#f90'
  if (normalized.includes('done') || normalized.includes('fixed') || normalized.includes('release')) return '#5ac88c'
  return 'rgba(255,255,255,0.4)'
}

function getPipelineStateColor(state: string): string {
  switch (state) {
    case 'done': return '#5ac88c'
    case 'in_progress': return '#3794ff'
    case 'ready': return '#5ac88c'
    case 'review_ready': case 'merge_ready': return '#a78bfa'
    case 'blocked': return '#e55'
    case 'todo': return '#fc0'
    case 'intake_required': return '#f90'
    default: return 'rgba(255,255,255,0.4)'
  }
}

function getPipelineStateLabel(state: string): string {
  return state.replace(/_/g, ' ')
}

const PIPELINE_STAGES = ['intake_required', 'todo', 'ready', 'in_progress', 'blocked', 'review_ready', 'merge_ready', 'done']

const PIPELINE_GATES = [
  { gate: 5, label: 'DOC' },
  { gate: 8, label: 'PLN' },
  { gate: 11, label: 'REV' },
  { gate: 12, label: 'VAL' },
  { gate: 13, label: 'VIS' },
  { gate: 15, label: 'MRG' },
] as const

function getPipelineProgress(state: string): number {
  if (!state) return 0
  if (state === 'done') return 100
  if (state === 'blocked') return -1 // special: blocked
  if (state === 'intake_required' || state === 'todo') return 0
  const idx = PIPELINE_STAGES.indexOf(state)
  if (idx < 0) return 0
  // Progress starts from 'ready'; intake_required and todo are 0%
  const linear = ['ready', 'in_progress', 'review_ready', 'merge_ready', 'done']
  const li = linear.indexOf(state)
  if (li < 0) return 0
  return Math.round((li / (linear.length - 1)) * 100)
}

export interface TasksListProps {
  githubTasks: GithubTasksConfig
  pipelineIssues: PipelineIssue[]
  tasksCollapsed: boolean
  onToggleTasksCollapse: () => void
}

export function TasksList({
  githubTasks,
  pipelineIssues,
  tasksCollapsed,
  onToggleTasksCollapse,
}: TasksListProps) {
  return (
    <div style={{
      borderTop: '2px solid var(--pixel-border)',
      background: 'rgba(255,255,255,0.03)',
      flex: tasksCollapsed ? '0 0 auto' : '1 1 0',
      minHeight: 0,
      overflowY: tasksCollapsed ? 'hidden' : 'auto',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Tasks header — always visible, clickable to toggle */}
      <div
        onClick={onToggleTasksCollapse}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 8px', cursor: 'pointer', flexShrink: 0,
        }}
      >
        <span style={{
          fontSize: '14px', color: '#ff9f43', fontWeight: 'bold',
          textTransform: 'uppercase', letterSpacing: '0.5px', flex: 1,
        }}>
          TASKS ({pipelineIssues.length})
        </span>
        <span style={{ fontSize: '14px', color: 'var(--pixel-text-dim)' }}>
          {tasksCollapsed ? '\u25B2' : '\u25BC'}
        </span>
      </div>

      {/* Tasks content — hidden when collapsed */}
      {!tasksCollapsed && (
        <div style={{ overflowY: 'auto', padding: '0 8px 6px', flex: '1 1 0', minHeight: 0 }}>
          {pipelineIssues.length === 0 ? (
            <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
              {githubTasks.enabled
                ? 'No GitHub issues found, or GitHub CLI is not configured.'
                : 'GitHub tasks are disabled in ~/.pixel-agents/config.json.'}
            </div>
          ) : (
            pipelineIssues.map((issue) => (
              <div key={`bottom-${issue.repo}-${issue.number}`} style={{
                padding: '6px 8px', marginBottom: 3, background: 'rgba(255,255,255,0.02)',
                border: '2px solid rgba(255,255,255,0.05)', borderRadius: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                  <span style={{ fontSize: '14px', color: 'var(--pixel-accent)', fontWeight: 'bold', flexShrink: 0 }}>
                    #{issue.number}
                  </span>
                  <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                    {issue.repo}
                  </span>
                  {issue.pipelineState && (
                    <span style={{
                      fontSize: '12px', padding: '1px 5px', marginLeft: 'auto',
                      background: `${(githubTasks.pipeline.states.find((state) => state.id === issue.pipelineState)?.color || getPipelineStateColor(issue.pipelineState))}22`,
                      color: githubTasks.pipeline.states.find((state) => state.id === issue.pipelineState)?.color || getPipelineStateColor(issue.pipelineState),
                      border: `1px solid ${(githubTasks.pipeline.states.find((state) => state.id === issue.pipelineState)?.color || getPipelineStateColor(issue.pipelineState))}44`,
                      borderRadius: 0, whiteSpace: 'nowrap', fontWeight: 'bold',
                      textTransform: 'uppercase', letterSpacing: '0.3px',
                    }}>
                      {githubTasks.pipeline.states.find((state) => state.id === issue.pipelineState)?.label || getPipelineStateLabel(issue.pipelineState)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '14px', color: 'var(--pixel-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                  {issue.title}
                </div>
                {issue.labels.length > 0 && (
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {issue.labels.map((label) => (
                      <span key={label} style={{
                        fontSize: '14px', padding: '1px 4px',
                        background: `${getIssueLabelColor(label)}22`,
                        color: getIssueLabelColor(label),
                        border: `1px solid ${getIssueLabelColor(label)}44`,
                        borderRadius: 0, whiteSpace: 'nowrap',
                      }}>
                        {label}
                      </span>
                    ))}
                  </div>
                )}
                {issue.pipelineState && (() => {
                  const gates = (issue as any).gates || []
                  const hasGateData = gates.length > 0

                  const configuredState = githubTasks.pipeline.states.find((state) => state.id === issue.pipelineState)
                  const stateColor = configuredState?.color || getPipelineStateColor(issue.pipelineState)
                  const configuredGates = githubTasks.pipeline.gates.length > 0 ? githubTasks.pipeline.gates : PIPELINE_GATES

                  if (hasGateData) {
                    const passCount = gates.filter((g: any) => g.status === 'pass').length
                    return (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ display: 'flex', gap: 2 }}>
                          {configuredGates.map(({ gate, label }) => {
                            const entry = gates.find((g: any) => g.gate === gate)
                            const s = entry?.status
                            const color = s === 'pass' ? '#5ac88c' : s === 'fail' ? '#e55' : 'rgba(255,255,255,0.08)'
                            return (
                              <div key={gate} style={{ flex: 1, textAlign: 'center' }}>
                                <div style={{
                                  height: 6,
                                  background: s === 'fail'
                                    ? 'repeating-linear-gradient(45deg, #e55, #e55 2px, #a33 2px, #a33 4px)'
                                    : color,
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  imageRendering: 'pixelated' as const,
                                }} title={entry?.comment || label} />
                                <div style={{
                                  fontSize: 8, fontFamily: 'monospace', marginTop: 1,
                                  color: s === 'pass' ? '#5ac88c' : s === 'fail' ? '#e55' : 'rgba(255,255,255,0.15)',
                                  letterSpacing: -0.5,
                                }}>{label}</div>
                              </div>
                            )
                          })}
                        </div>
                        <div style={{
                          fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace',
                          textAlign: 'right', marginTop: 2,
                        }}>
                          {passCount}/{configuredGates.length}
                        </div>
                      </div>
                    )
                  }

                  // Fallback: single bar for states without gate data
                  const pct = githubTasks.pipeline.states.length > 0
                    ? (() => {
                        if (issue.pipelineState === 'blocked') return -1
                        if (issue.pipelineState === 'done') return 100
                        const states = githubTasks.pipeline.states
                        const idx = states.findIndex((state) => state.id === issue.pipelineState)
                        return idx < 0 ? 0 : Math.round((idx / Math.max(states.length - 1, 1)) * 100)
                      })()
                    : getPipelineProgress(issue.pipelineState)
                  const isBlocked = pct === -1
                  const barColor = isBlocked ? '#e55' : stateColor
                  const displayPct = isBlocked ? 100 : pct
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <div style={{
                        flex: 1, height: 6,
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 0, overflow: 'hidden',
                        imageRendering: 'pixelated' as const,
                      }}>
                        <div style={{
                          width: `${displayPct}%`, height: '100%',
                          background: isBlocked
                            ? 'repeating-linear-gradient(45deg, #e55, #e55 3px, #a33 3px, #a33 6px)'
                            : barColor,
                          borderRadius: 0,
                          transition: 'width 0.3s ease',
                          imageRendering: 'pixelated' as const,
                        }} />
                      </div>
                      <span style={{
                        fontSize: '14px', color: barColor, fontFamily: 'monospace',
                        fontWeight: 'bold', flexShrink: 0, minWidth: 32, textAlign: 'right',
                      }}>
                        {isBlocked ? 'BLK' : `${pct}%`}
                      </span>
                    </div>
                  )
                })()}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
