import { useState, useEffect } from 'react'
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

  // Share link state
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareExpiry, setShareExpiry] = useState<number>(0)

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (msg.type === 'shareLinkCreated') {
        setShareUrl(msg.url);
        setShareExpiry(msg.expiresAt);
      }
      if (msg.type === 'shareLinkRevoked') {
        setShareUrl(null);
        setShareExpiry(0);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Countdown timer
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!shareUrl) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [shareUrl]);
  const remaining = Math.max(0, Math.ceil((shareExpiry - now) / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

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
          zIndex: 49,
        }}
      />
      {/* Centered modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 50,
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
        {/* Share Office section */}
        <div style={{
          borderTop: '1px solid var(--pixel-border)',
          marginTop: 4,
          paddingTop: 4,
        }}>
          <div style={{ padding: '4px 10px', fontSize: '18px', color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>
            SHARE OFFICE
          </div>
          {shareUrl ? (
            <div style={{ padding: '4px 10px' }}>
              <div style={{ fontSize: '16px', color: 'var(--pixel-green)', wordBreak: 'break-all', marginBottom: 4 }}>
                {shareUrl}
              </div>
              <div style={{ fontSize: '16px', color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
                Expires in {minutes}:{seconds.toString().padStart(2, '0')}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => { navigator.clipboard.writeText(shareUrl); }}
                  style={{ ...menuItemBase, fontSize: '18px', flex: 1, justifyContent: 'center' }}
                >
                  Copy Link
                </button>
                <button
                  onClick={() => { vscode.postMessage({ type: 'revokeShareLink', token: shareUrl.split('/').pop() }); }}
                  style={{ ...menuItemBase, fontSize: '18px', flex: 1, justifyContent: 'center', color: '#e55' }}
                >
                  Revoke
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 4, padding: '4px 10px' }}>
              <button
                onClick={() => vscode.postMessage({ type: 'createShareLink', durationMs: 600000 })}
                onMouseEnter={() => setHovered('share-10')}
                onMouseLeave={() => setHovered(null)}
                style={{
                  ...menuItemBase,
                  flex: 1,
                  justifyContent: 'center',
                  background: hovered === 'share-10' ? 'rgba(255,255,255,0.08)' : 'transparent',
                }}
              >
                10 min
              </button>
              <button
                onClick={() => vscode.postMessage({ type: 'createShareLink', durationMs: 3600000 })}
                onMouseEnter={() => setHovered('share-60')}
                onMouseLeave={() => setHovered(null)}
                style={{
                  ...menuItemBase,
                  flex: 1,
                  justifyContent: 'center',
                  background: hovered === 'share-60' ? 'rgba(255,255,255,0.08)' : 'transparent',
                }}
              >
                60 min
              </button>
            </div>
          )}
        </div>
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
          Claude CLI and Claude macOS app are supported. Codex agent rendering is available in a
          basic form and will continue to evolve.
        </div>
      </div>
    </>
  )
}
