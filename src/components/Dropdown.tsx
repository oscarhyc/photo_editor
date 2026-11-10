import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  label: ReactNode
  title?: string
  disabled?: boolean
  align?: 'left' | 'right'
  className?: string
  width?: number
  children: ReactNode
}

/**
 * Minimal popover menu. Rendered in a portal so the top bar's horizontal
 * scroll container cannot clip it. Closes on outside click, Escape, or item click.
 */
export function Dropdown({ label, title, disabled, align = 'left', className = '', width, children }: Props) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  return (
    <div className="dd" ref={ref}>
      <button
        className={`dd-trigger ${open ? 'is-open' : ''} ${className}`}
        title={title}
        disabled={disabled}
        onClick={() => {
          if (open) {
            setOpen(false)
            return
          }
          const r = ref.current?.getBoundingClientRect()
          if (r) setRect(r)
          setOpen(true)
        }}
      >
        {label}
        <span className="caret">▾</span>
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            className={`dd-panel align-${align}`}
            style={{
              position: 'fixed',
              top: rect.bottom + 6,
              ...(align === 'left'
                ? { left: Math.max(8, rect.left) }
                : { right: Math.max(8, window.innerWidth - rect.right) }),
              ...(width ? { width } : {}),
            }}
            onClick={() => setOpen(false)}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  )
}

export function MenuItem({
  children,
  onClick,
  disabled,
  hint,
  active,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  hint?: string
  active?: boolean
}) {
  return (
    <button className={`dd-item ${active ? 'is-active' : ''}`} disabled={disabled} onClick={onClick}>
      <span className="dd-item-label">{children}</span>
      {hint && <span className="dd-item-hint">{hint}</span>}
    </button>
  )
}
