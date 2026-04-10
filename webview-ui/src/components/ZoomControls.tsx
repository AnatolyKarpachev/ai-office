import { useState, useEffect, useRef } from 'react'
import {
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_BUTTON_FACTOR,
  ZOOM_LEVEL_FADE_DELAY_MS,
  ZOOM_LEVEL_HIDE_DELAY_MS,
  ZOOM_LEVEL_FADE_DURATION_SEC,
} from '../constants.js'

interface ZoomControlsProps {
  zoom: number
  onZoomChange: (zoom: number) => void
}

const btnCls = "w-10 h-10 p-0 bg-pixel-bg text-pixel-text border-2 border-pixel-border cursor-pointer flex items-center justify-center shadow-pixel hover:bg-pixel-btn-hover disabled:cursor-default disabled:opacity-35"

export function ZoomControls({ zoom, onZoomChange }: ZoomControlsProps) {
  const [showLevel, setShowLevel] = useState(false)
  const [fadeOut, setFadeOut] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevZoomRef = useRef(zoom)

  const minDisabled = zoom <= ZOOM_MIN
  const maxDisabled = zoom >= ZOOM_MAX

  useEffect(() => {
    if (zoom === prevZoomRef.current) return
    prevZoomRef.current = zoom

    if (timerRef.current) clearTimeout(timerRef.current)
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)

    setShowLevel(true)
    setFadeOut(false)

    fadeTimerRef.current = setTimeout(() => {
      setFadeOut(true)
    }, ZOOM_LEVEL_FADE_DELAY_MS)

    timerRef.current = setTimeout(() => {
      setShowLevel(false)
      setFadeOut(false)
    }, ZOOM_LEVEL_HIDE_DELAY_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    }
  }, [zoom])

  return (
    <>
      {showLevel && (
        <div
          className="absolute top-2.5 left-1/2 -translate-x-1/2 z-controls bg-pixel-bg border-2 border-pixel-border px-3 py-1 shadow-pixel text-[26px] text-pixel-text select-none pointer-events-none"
          style={{
            opacity: fadeOut ? 0 : 1,
            transition: `opacity ${ZOOM_LEVEL_FADE_DURATION_SEC}s ease-out`,
          }}
        >
          {zoom < 1.05 ? '1x' : zoom >= 9.95 ? '10x' : `${zoom.toFixed(1)}x`}
        </div>
      )}

      <div className="absolute top-2 left-[300px] z-controls flex flex-col gap-1">
        <button
          onClick={() => onZoomChange(Math.min(ZOOM_MAX, zoom * ZOOM_BUTTON_FACTOR))}
          disabled={maxDisabled}
          className={btnCls}
          title="Zoom in (Ctrl+Scroll)"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <line x1="9" y1="3" x2="9" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="3" y1="9" x2="15" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={() => onZoomChange(Math.max(ZOOM_MIN, zoom / ZOOM_BUTTON_FACTOR))}
          disabled={minDisabled}
          className={btnCls}
          title="Zoom out (Ctrl+Scroll)"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <line x1="3" y1="9" x2="15" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </>
  )
}
