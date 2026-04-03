import { useState } from 'react'
import { vscode } from '../vscodeApi.js'
import { isSoundEnabled, setSoundEnabled, isDesktopNotificationsEnabled, setDesktopNotificationsEnabled } from '../notificationSound.js'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onExportLayout: () => void
  onImportLayout: () => void
  alwaysShowOverlay: boolean
  onToggleAlwaysShowOverlay: () => void
  showTeamLines: boolean
  onToggleShowTeamLines: () => void
}

const menuItemBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '6px 10px',
  fontSize: '24px',
  color: 'rgba(255, 255, 255, 0.8)',
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  cursor: 'pointer',
  textAlign: 'left',
}

export function SettingsModal({
  isOpen,
  onClose,
  onExportLayout,
  onImportLayout,
  alwaysShowOverlay,
  onToggleAlwaysShowOverlay,
  showTeamLines,
  onToggleShowTeamLines,
}: SettingsModalProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [soundLocal, setSoundLocal] = useState(isSoundEnabled)
  const [desktopNotifLocal, setDesktopNotifLocal] = useState(isDesktopNotificationsEnabled)

  if (!isOpen) return null

  return (
    <>
      {/* Dark backdrop — click to close */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 190,
        }}
      />
      {/* Centered modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 191,
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          borderRadius: 0,
          padding: '4px',
          boxShadow: 'var(--pixel-shadow)',
          minWidth: 200,
        }}
      >
        {/* Header with title and X button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 10px',
            borderBottom: '1px solid var(--pixel-border)',
            marginBottom: '4px',
          }}
        >
          <span style={{ fontSize: '24px', color: 'rgba(255, 255, 255, 0.9)' }}>Settings</span>
          <button
            onClick={onClose}
            onMouseEnter={() => setHovered('close')}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: hovered === 'close' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              border: 'none',
              borderRadius: 0,
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            X
          </button>
        </div>
        {/* Menu items */}
        <button
          onClick={() => {
            onExportLayout()
            onClose()
          }}
          onMouseEnter={() => setHovered('export')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'export' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          Export Layout
        </button>
        <button
          onClick={() => {
            onImportLayout()
            onClose()
          }}
          onMouseEnter={() => setHovered('import')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'import' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          Import Layout
        </button>
        <button
          onClick={() => {
            const newVal = !isSoundEnabled()
            setSoundEnabled(newVal)
            setSoundLocal(newVal)
            vscode.postMessage({ type: 'saveSoundEnabled', enabled: newVal })
          }}
          onMouseEnter={() => setHovered('sound')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'sound' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          <span>Sound Notifications</span>
          <span
            style={{
              width: 14,
              height: 14,
              border: '2px solid rgba(255, 255, 255, 0.5)',
              borderRadius: 0,
              background: soundLocal ? 'rgba(90, 140, 255, 0.8)' : 'transparent',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              lineHeight: 1,
              color: '#fff',
            }}
          >
            {soundLocal ? 'X' : ''}
          </span>
        </button>
        <button
          onClick={() => {
            const newVal = !isDesktopNotificationsEnabled()
            setDesktopNotificationsEnabled(newVal)
            setDesktopNotifLocal(newVal)
            vscode.postMessage({ type: 'saveDesktopNotifications', enabled: newVal })
          }}
          onMouseEnter={() => setHovered('desktop-notif')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'desktop-notif' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          <span>Desktop Notifications</span>
          <span
            style={{
              width: 14,
              height: 14,
              border: '2px solid rgba(255, 255, 255, 0.5)',
              borderRadius: 0,
              background: desktopNotifLocal ? 'rgba(90, 140, 255, 0.8)' : 'transparent',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              lineHeight: 1,
              color: '#fff',
            }}
          >
            {desktopNotifLocal ? 'X' : ''}
          </span>
        </button>
        <button
          onClick={onToggleAlwaysShowOverlay}
          onMouseEnter={() => setHovered('overlay')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'overlay' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          <span>Always Show Labels</span>
          <span
            style={{
              width: 14,
              height: 14,
              border: '2px solid rgba(255, 255, 255, 0.5)',
              borderRadius: 0,
              background: alwaysShowOverlay ? 'rgba(90, 140, 255, 0.8)' : 'transparent',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              lineHeight: 1,
              color: '#fff',
            }}
          >
            {alwaysShowOverlay ? 'X' : ''}
          </span>
        </button>
        <button
          onClick={onToggleShowTeamLines}
          onMouseEnter={() => setHovered('team-lines')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'team-lines' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          <span>Show Team Lines</span>
          <span
            style={{
              width: 14,
              height: 14,
              border: '2px solid rgba(255, 255, 255, 0.5)',
              borderRadius: 0,
              background: showTeamLines ? 'rgba(90, 140, 255, 0.8)' : 'transparent',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              lineHeight: 1,
              color: '#fff',
            }}
          >
            {showTeamLines ? 'X' : ''}
          </span>
        </button>
        <div
          style={{
            marginTop: '8px',
            padding: '10px',
            borderTop: '1px solid var(--pixel-border)',
            fontSize: '20px',
            lineHeight: 1.45,
            color: 'rgba(255, 255, 255, 0.78)',
            maxWidth: 520,
          }}
        >
          Проект поддерживается по личной инициативе и содержит баги, которые стараюсь оперативно
          исправлять. Если вам понравилось, то лучшая благодарность это подписка на канал:{' '}
          <a href="https://t.me/segagridchin" target="_blank" rel="noreferrer" style={{
            color: 'var(--pixel-accent)',
            textDecoration: 'none',
          }}>
            t.me/segagridchin
          </a>
        </div>
      </div>
    </>
  )
}
