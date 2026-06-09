import { useState } from 'react'

interface TooltipProps {
  text: string
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export default function Tooltip({ text, children, position = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && text && (
        <div style={{
          position: 'absolute',
          ...(position === 'top' && { bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' }),
          ...(position === 'bottom' && { top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' }),
          ...(position === 'left' && { right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)' }),
          ...(position === 'right' && { left: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)' }),
          background: '#1d1d1f',
          color: '#fff',
          fontSize: 11,
          fontWeight: 500,
          padding: '5px 9px',
          borderRadius: 6,
          whiteSpace: 'nowrap',
          zIndex: 9999,
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          letterSpacing: '0.01em',
        }}>
          {text}
        </div>
      )}
    </div>
  )
}
