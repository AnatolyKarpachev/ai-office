import { useState } from 'react'
import { SettingsModal } from './SettingsModal.js'
import { vscode } from '../vscodeApi.js'

interface BottomToolbarProps {
  isEditMode: boolean
  onToggleEditMode: () => void
  onExportLayout: () => void
  onImportLayout: () => void
  alwaysShowOverlay: boolean
  onToggleAlwaysShowOverlay: () => void
  showTeamLines: boolean
  onToggleShowTeamLines: () => void
  onFitView: () => void
  isHudOpen: boolean
  onToggleHud: () => void
  shareLink: { url: string; expiresAt: number } | null
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 10,
  left: 10,
  zIndex: 'var(--pixel-controls-z)',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'var(--pixel-bg)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  padding: '4px 6px',
  boxShadow: 'var(--pixel-shadow)',
}

const btnBase: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: '24px',
  color: 'var(--pixel-text)',
  background: 'var(--pixel-btn-bg)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}

const btnActive: React.CSSProperties = {
  ...btnBase,
  background: 'var(--pixel-active-bg)',
  border: '2px solid var(--pixel-accent)',
}


export function BottomToolbar({
  isEditMode,
  onToggleEditMode,
  onExportLayout,
  onImportLayout,
  alwaysShowOverlay,
  onToggleAlwaysShowOverlay,
  showTeamLines,
  onToggleShowTeamLines,
  onFitView,
  isHudOpen,
  onToggleHud,
  shareLink,
}: BottomToolbarProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(Date.now())

  // Tick countdown when share link is active
  if (shareLink && Date.now() - now > 1000) {
    setTimeout(() => setNow(Date.now()), 100)
  }

  const shareUrl = shareLink?.url ?? null
  const remaining = shareLink ? Math.max(0, Math.ceil((shareLink.expiresAt - now) / 1000)) : 0
  const shareMinutes = Math.floor(remaining / 60)
  const shareSeconds = remaining % 60

  return (
    <>
    <div style={panelStyle}>
      <button
        onClick={onToggleEditMode}
        onMouseEnter={() => setHovered('edit')}
        onMouseLeave={() => setHovered(null)}
        style={
          isEditMode
            ? { ...btnActive }
            : {
                ...btnBase,
                background: hovered === 'edit' ? 'var(--pixel-btn-hover-bg)' : btnBase.background,
              }
        }
        title="Edit office layout"
      >
        Layout
      </button>
      <button
        onClick={() => setIsSettingsOpen((v) => !v)}
        onMouseEnter={() => setHovered('settings')}
        onMouseLeave={() => setHovered(null)}
        style={
          isSettingsOpen
            ? { ...btnActive }
            : {
                ...btnBase,
                background: hovered === 'settings' ? 'var(--pixel-btn-hover-bg)' : btnBase.background,
              }
        }
        title="Settings"
      >
        Settings
      </button>
      <button
        onClick={onFitView}
        onMouseEnter={() => setHovered('fit')}
        onMouseLeave={() => setHovered(null)}
        style={{
          ...btnBase,
          background: hovered === 'fit' ? 'var(--pixel-btn-hover-bg)' : btnBase.background,
        }}
        title="Fit office to view"
      >
        Fit
      </button>
      <button
        onClick={onToggleHud}
        onMouseEnter={() => setHovered('hud')}
        onMouseLeave={() => setHovered(null)}
        style={
          isHudOpen
            ? { ...btnActive }
            : {
                ...btnBase,
                background: hovered === 'hud' ? 'var(--pixel-btn-hover-bg)' : btnBase.background,
              }
        }
        title="Heads-Up Display"
      >
        HUD
      </button>
      <button
        onClick={() => setIsShareOpen((v) => !v)}
        onMouseEnter={() => setHovered('share')}
        onMouseLeave={() => setHovered(null)}
        style={
          isShareOpen || shareUrl
            ? { ...btnActive, color: shareUrl ? 'var(--pixel-green)' : 'var(--pixel-text)' }
            : {
                ...btnBase,
                background: hovered === 'share' ? 'var(--pixel-btn-hover-bg)' : btnBase.background,
              }
        }
        title="Share office with friends"
      >
        Share
      </button>
      <button
        onClick={onToggleShowTeamLines}
        onMouseEnter={() => setHovered('teams')}
        onMouseLeave={() => setHovered(null)}
        style={
          showTeamLines
            ? { ...btnActive }
            : {
                ...btnBase,
                background: hovered === 'teams' ? 'var(--pixel-btn-hover-bg)' : btnBase.background,
              }
        }
        title="Show team group lines and clusters"
      >
        Show teams
      </button>
    </div>

    {/* Modals rendered OUTSIDE toolbar to escape stacking context */}
    <SettingsModal
      isOpen={isSettingsOpen}
      onClose={() => setIsSettingsOpen(false)}
      onExportLayout={onExportLayout}
      onImportLayout={onImportLayout}
      alwaysShowOverlay={alwaysShowOverlay}
      onToggleAlwaysShowOverlay={onToggleAlwaysShowOverlay}
    />

    {isShareOpen && (
      <>
        <div
          onClick={() => setIsShareOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 190 }}
        />
        <div style={{
          position: 'fixed',
          bottom: 60,
          left: 10,
          zIndex: 191,
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          borderRadius: 0,
          padding: '8px',
          boxShadow: 'var(--pixel-shadow)',
          minWidth: 260,
        }}>
          <div style={{ fontSize: '18px', color: 'rgba(255,255,255,0.5)', marginBottom: 6, fontWeight: 'bold' }}>
            SHARE OFFICE
          </div>
          {shareUrl ? (
            <div>
              <div style={{
                fontSize: '14px',
                color: 'var(--pixel-green)',
                wordBreak: 'break-all',
                marginBottom: 6,
                padding: '4px 6px',
                background: 'rgba(90, 200, 140, 0.08)',
                border: '1px solid rgba(90, 200, 140, 0.2)',
              }}>
                {shareUrl}
              </div>
              <div style={{ fontSize: '16px', color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
                Expires in {shareMinutes}:{shareSeconds.toString().padStart(2, '0')}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  style={{
                    ...btnBase,
                    fontSize: '16px',
                    flex: 1,
                    textAlign: 'center',
                    background: copied ? 'rgba(90, 200, 140, 0.15)' : 'var(--pixel-btn-bg)',
                    color: copied ? 'var(--pixel-green)' : 'var(--pixel-text)',
                  }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => {
                    const token = shareUrl.split('/').pop()
                    vscode.postMessage({ type: 'revokeShareLink', token })
                  }}
                  style={{ ...btnBase, fontSize: '16px', flex: 1, textAlign: 'center', color: '#e55' }}
                >
                  Revoke
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => vscode.postMessage({ type: 'createShareLink', durationMs: 600000 })}
                onMouseEnter={() => setHovered('share-10')}
                onMouseLeave={() => setHovered(null)}
                style={{
                  ...btnBase,
                  fontSize: '16px',
                  flex: 1,
                  textAlign: 'center',
                  background: hovered === 'share-10' ? 'var(--pixel-btn-hover-bg)' : 'var(--pixel-btn-bg)',
                }}
              >
                10 min
              </button>
              <button
                onClick={() => vscode.postMessage({ type: 'createShareLink', durationMs: 3600000 })}
                onMouseEnter={() => setHovered('share-60')}
                onMouseLeave={() => setHovered(null)}
                style={{
                  ...btnBase,
                  fontSize: '16px',
                  flex: 1,
                  textAlign: 'center',
                  background: hovered === 'share-60' ? 'var(--pixel-btn-hover-bg)' : 'var(--pixel-btn-bg)',
                }}
              >
                60 min
              </button>
            </div>
          )}
        </div>
      </>
    )}
    </>
  )
}
