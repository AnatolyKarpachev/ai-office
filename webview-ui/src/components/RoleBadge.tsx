// Pixel-art role badge component for agent overlay

export interface RoleBadgeProps {
  role: string
  colors: { primary: string; badge: string }
}

export function RoleBadge({ role, colors }: RoleBadgeProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '14px',
        lineHeight: 1,
        padding: '1px 4px',
        background: colors.badge,
        color: '#fff',
        border: `1px solid ${colors.primary}`,
        borderRadius: 0,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        textTransform: 'none',
        letterSpacing: '0.5px',
        imageRendering: 'pixelated',
      }}
    >
      {role}
    </span>
  )
}
