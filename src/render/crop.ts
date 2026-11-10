/**
 * Crop rectangle math. Pure functions over document-space rects, so the
 * interactive tool and the tests share exactly one implementation.
 */

export type Rect = { x: number; y: number; w: number; h: number }
export type CropHandle = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const MIN_SIZE = 8

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function rectFromPoints(ax: number, ay: number, bx: number, by: number): Rect {
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(bx - ax),
    h: Math.abs(by - ay),
  }
}

/** Handle under a point, in document units. `tol` is the hit radius. */
export function handleAt(rect: Rect, px: number, py: number, tol: number): CropHandle | null {
  const x0 = rect.x
  const y0 = rect.y
  const x1 = rect.x + rect.w
  const y1 = rect.y + rect.h
  const near = (v: number, t: number) => Math.abs(v - t) <= tol

  const left = near(px, x0)
  const right = near(px, x1)
  const top = near(py, y0)
  const bottom = near(py, y1)
  const insideX = px >= x0 - tol && px <= x1 + tol
  const insideY = py >= y0 - tol && py <= y1 + tol

  if (!insideX || !insideY) return null

  if (top && left) return 'nw'
  if (top && right) return 'ne'
  if (bottom && left) return 'sw'
  if (bottom && right) return 'se'
  if (top) return 'n'
  if (bottom) return 's'
  if (left) return 'w'
  if (right) return 'e'
  if (px > x0 && px < x1 && py > y0 && py < y1) return 'move'
  return null
}

export function cursorForHandle(handle: CropHandle | null): string {
  switch (handle) {
    case 'nw':
    case 'se':
      return 'nwse-resize'
    case 'ne':
    case 'sw':
      return 'nesw-resize'
    case 'n':
    case 's':
      return 'ns-resize'
    case 'e':
    case 'w':
      return 'ew-resize'
    case 'move':
      return 'move'
    default:
      return 'crosshair'
  }
}

/** Largest rect with `aspect` that fits inside `r`, centred. */
export function withAspect(r: Rect, aspect: number | null, bounds: { w: number; h: number }): Rect {
  if (!aspect || aspect <= 0) return clampRect(r, bounds)
  let w = r.w
  let h = r.h
  if (w / h > aspect) w = h * aspect
  else h = w / aspect
  return clampRect({ x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h }, bounds)
}

/** Keep the rect inside the canvas without changing its size (unless it can't fit). */
export function clampRect(r: Rect, bounds: { w: number; h: number }): Rect {
  const w = Math.min(r.w, bounds.w)
  const h = Math.min(r.h, bounds.h)
  return {
    x: clamp(r.x, 0, Math.max(0, bounds.w - w)),
    y: clamp(r.y, 0, Math.max(0, bounds.h - h)),
    w,
    h,
  }
}

/**
 * Rect created by dragging from an origin point. With an aspect lock the
 * origin corner stays fixed and the box grows along the locked ratio.
 */
export function rectFromDrag(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  aspect: number | null,
  bounds: { w: number; h: number },
): Rect {
  let r = rectFromPoints(ox, oy, dx, dy)
  if (aspect && aspect > 0 && r.w > 0 && r.h > 0) {
    let w = r.w
    let h = r.h
    if (w / h > aspect) h = w / aspect
    else w = h * aspect
    r = { x: dx < ox ? ox - w : ox, y: dy < oy ? oy - h : oy, w, h }
  }
  return clampRect(r, bounds)
}

/**
 * Drag a handle by (dx, dy).
 * The edge opposite the dragged handle stays put, so the rect grows from the
 * anchor rather than from its centre.
 */
export function dragHandle(
  start: Rect,
  handle: CropHandle,
  dx: number,
  dy: number,
  aspect: number | null,
  bounds: { w: number; h: number },
): Rect {
  if (handle === 'move') {
    return clampRect({ x: start.x + dx, y: start.y + dy, w: start.w, h: start.h }, bounds)
  }

  let x0 = start.x
  let y0 = start.y
  let x1 = start.x + start.w
  let y1 = start.y + start.h

  if (handle.includes('w')) x0 += dx
  if (handle.includes('e')) x1 += dx
  if (handle.includes('n')) y0 += dy
  if (handle.includes('s')) y1 += dy

  x0 = clamp(x0, 0, bounds.w)
  x1 = clamp(x1, 0, bounds.w)
  y0 = clamp(y0, 0, bounds.h)
  y1 = clamp(y1, 0, bounds.h)

  if (x1 - x0 < MIN_SIZE) {
    if (handle.includes('w')) x0 = Math.max(0, x1 - MIN_SIZE)
    else x1 = Math.min(bounds.w, x0 + MIN_SIZE)
  }
  if (y1 - y0 < MIN_SIZE) {
    if (handle.includes('n')) y0 = Math.max(0, y1 - MIN_SIZE)
    else y1 = Math.min(bounds.h, y0 + MIN_SIZE)
  }

  let rect: Rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }

  if (aspect && aspect > 0) {
    // the anchor is the edge we are *not* dragging
    const anchorRight = handle.includes('w')
    const anchorBottom = handle.includes('n')
    let w = rect.w
    let h = rect.h

    if (handle === 'n' || handle === 's') w = h * aspect
    else if (handle === 'e' || handle === 'w') h = w / aspect
    else if (w / h > aspect) h = w / aspect
    else w = h * aspect

    // never exceed the canvas
    const maxW = anchorRight ? rect.x + rect.w : bounds.w - rect.x
    const maxH = anchorBottom ? rect.y + rect.h : bounds.h - rect.y
    const k = Math.min(1, maxW / w, maxH / h)
    w *= k
    h *= k

    rect = {
      x: anchorRight ? rect.x + rect.w - w : rect.x,
      y: anchorBottom ? rect.y + rect.h - h : rect.y,
      w,
      h,
    }
  }

  return clampRect(rect, bounds)
}
