import {
  NOTIFICATION_NOTE_1_HZ,
  NOTIFICATION_NOTE_2_HZ,
  NOTIFICATION_NOTE_1_START_SEC,
  NOTIFICATION_NOTE_2_START_SEC,
  NOTIFICATION_NOTE_DURATION_SEC,
  NOTIFICATION_VOLUME,
} from './constants.js'

let soundEnabled = true
let audioCtx: AudioContext | null = null

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled
}

export function isSoundEnabled(): boolean {
  return soundEnabled
}

function playNote(ctx: AudioContext, freq: number, startOffset: number): void {
  const t = ctx.currentTime + startOffset
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, t)

  gain.gain.setValueAtTime(NOTIFICATION_VOLUME, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + NOTIFICATION_NOTE_DURATION_SEC)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(t)
  osc.stop(t + NOTIFICATION_NOTE_DURATION_SEC)
}

export async function playDoneSound(): Promise<void> {
  if (!soundEnabled) return
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext()
    }
    // Resume suspended context (webviews suspend until user gesture)
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume()
    }
    // Ascending two-note chime: E5 → B5
    playNote(audioCtx, NOTIFICATION_NOTE_1_HZ, NOTIFICATION_NOTE_1_START_SEC)
    playNote(audioCtx, NOTIFICATION_NOTE_2_HZ, NOTIFICATION_NOTE_2_START_SEC)
  } catch {
    // Audio may not be available
  }
}

/** Call from any user-gesture handler to ensure AudioContext is unlocked */
export function unlockAudio(): void {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext()
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume()
    }
  } catch {
    // ignore
  }
}

let desktopNotificationsEnabled = false

export function setDesktopNotificationsEnabled(enabled: boolean): void {
  desktopNotificationsEnabled = enabled
  if (enabled && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

export function isDesktopNotificationsEnabled(): boolean {
  return desktopNotificationsEnabled
}

export function showDesktopNotification(title: string, body: string): void {
  if (!desktopNotificationsEnabled) return
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  // Don't spam when user is looking at the app
  if (document.visibilityState === 'visible') return
  try {
    new Notification(title, { body, tag: `pixel-agents-${Date.now()}` })
  } catch { /* ignore */ }
}
