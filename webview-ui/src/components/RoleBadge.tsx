/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

// Pixel-art role badge component for agent overlay

export interface RoleBadgeProps {
  role: string
  colors: { primary: string; badge: string }
}

export function RoleBadge({ role, colors }: RoleBadgeProps) {
  return (
    <span
      className="inline-block text-[14px] leading-none px-1 py-px text-white whitespace-nowrap shrink-0 tracking-[0.5px] [image-rendering:pixelated]"
      style={{ background: colors.badge, border: `1px solid ${colors.primary}` }}
    >
      {role}
    </span>
  )
}
