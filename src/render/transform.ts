/**
 * Free-transform math for a layer: 8 scale handles anchored at the opposite
 * edge, a rotation handle, and optional uniform scaling.
 *
 * Everything is computed in the layer's own local frame (origin at the layer
 * centre, y down, before rotation), then mapped back to document space. That is
 * what makes it work on rotated layers — the old implementation used the
 * distance from the centre, which forced uniform scaling and could never unlock
 * the aspect ratio.
 */

import type { LayerTransform } from '../doc/types'

export type TransformHandle =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'rotate'

export const MIN_LAYER_SIZE = 4

/** Local-space (centred) position of a scale handle on a w×h box. */
export function handleLocal(handle: TransformHandle, w: number, h: number): [number, number] {
  const xs = handle.includes('w') ? -w / 2 : handle.includes('e') ? w / 2 : 0
  const ys = handle.includes('n') ? -h / 2 : handle.includes('s') ? h / 2 : 0
  return [xs, ys]
}

/** Map any angle into (-PI, PI] so the model holds a canonical value. */
export function normalizeAngle(a: number): number {
  const twoPi = Math.PI * 2
  let r = ((a + Math.PI) % twoPi + twoPi) % twoPi - Math.PI
  if (r === -Math.PI) r = Math.PI
  return r
}

const toLocal = (
  t: LayerTransform,
  px: number,
  py: number,
): { lx: number; ly: number; cx: number; cy: number } => {
  const cx = t.x + t.w / 2
  const cy = t.y + t.h / 2
  const c = Math.cos(-t.rotation)
  const s = Math.sin(-t.rotation)
  const dx = px - cx
  const dy = py - cy
  return { lx: dx * c - dy * s, ly: dx * s + dy * c, cx, cy }
}

const localToDoc = (t: LayerTransform, cx: number, cy: number, lx: number, ly: number): [number, number] => {
  const c = Math.cos(t.rotation)
  const s = Math.sin(t.rotation)
  return [cx + lx * c - ly * s, cy + lx * s + ly * c]
}

/** Every handle's document-space position, for drawing and hit-testing. */
export function handlePoints(
  t: LayerTransform,
  rotateOffset = 0,
): { handle: TransformHandle; x: number; y: number }[] {
  const cx = t.x + t.w / 2
  const cy = t.y + t.h / 2
  const out: { handle: TransformHandle; x: number; y: number }[] = []
  const list: TransformHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
  for (const handle of list) {
    const [lx, ly] = handleLocal(handle, t.w, t.h)
    const [x, y] = localToDoc(t, cx, cy, lx, ly)
    out.push({ handle, x, y })
  }
  if (rotateOffset > 0) {
    const [x, y] = localToDoc(t, cx, cy, 0, -t.h / 2 - rotateOffset)
    out.push({ handle: 'rotate', x, y })
  }
  return out
}

export function hitHandle(
  t: LayerTransform,
  px: number,
  py: number,
  tol: number,
  rotateOffset = 0,
): TransformHandle | null {
  let best: TransformHandle | null = null
  let bestD = tol * tol
  for (const p of handlePoints(t, rotateOffset)) {
    const d = (p.x - px) ** 2 + (p.y - py) ** 2
    if (d <= bestD) {
      bestD = d
      best = p.handle
    }
  }
  return best
}

export type ResizeOptions = {
  /** keep the original aspect ratio (Shift) */
  uniform?: boolean
  /** scale around the centre instead of the opposite edge (Alt) */
  fromCenter?: boolean
}

/**
 * Drag a scale handle to (px, py) in document space.
 * Non-uniform by default: dragging the east edge only changes width.
 */
export function resizeByHandle(
  start: LayerTransform,
  handle: TransformHandle,
  px: number,
  py: number,
  opts: ResizeOptions = {},
): LayerTransform {
  if (handle === 'rotate') return start

  const { lx, ly, cx, cy } = toLocal(start, px, py)
  const affectsX = handle.includes('e') || handle.includes('w')
  const affectsY = handle.includes('n') || handle.includes('s')

  // the opposite edge is the anchor
  const ax = opts.fromCenter ? 0 : handle.includes('e') ? -start.w / 2 : handle.includes('w') ? start.w / 2 : 0
  const ay = opts.fromCenter ? 0 : handle.includes('s') ? -start.h / 2 : handle.includes('n') ? start.h / 2 : 0

  let w = start.w
  let h = start.h
  if (opts.fromCenter) {
    // mirror around the centre: the opposite edge moves the other way
    if (affectsX) w = Math.abs(lx) * 2
    if (affectsY) h = Math.abs(ly) * 2
  } else {
    // signed extent: dragging past the anchor clamps to the minimum instead of
    // flipping the layer, which is what a photo editor should do
    if (affectsX) w = handle.includes('e') ? lx - ax : ax - lx
    if (affectsY) h = handle.includes('s') ? ly - ay : ay - ly
  }

  if (opts.uniform && start.w > 0 && start.h > 0) {
    const kx = w / start.w
    const ky = h / start.h
    const k = affectsX && affectsY ? Math.max(kx, ky) : affectsX ? kx : ky
    w = start.w * k
    h = start.h * k
  }

  w = Math.max(MIN_LAYER_SIZE, w)
  h = Math.max(MIN_LAYER_SIZE, h)

  // new centre in local space: halfway between the anchor and the dragged edge
  let nlx = 0
  let nly = 0
  if (!opts.fromCenter) {
    if (handle.includes('e')) nlx = ax + w / 2
    else if (handle.includes('w')) nlx = ax - w / 2
    if (handle.includes('s')) nly = ay + h / 2
    else if (handle.includes('n')) nly = ay - h / 2
  }

  const [ncx, ncy] = localToDoc(start, cx, cy, nlx, nly)
  return { ...start, w, h, x: ncx - w / 2, y: ncy - h / 2 }
}

/** Rotate so the rotation handle points at (px, py). Snaps to 15° when `snap`. */
export function rotateByHandle(
  start: LayerTransform,
  px: number,
  py: number,
  snap = false,
): LayerTransform {
  const cx = start.x + start.w / 2
  const cy = start.y + start.h / 2
  // the handle sits straight up at rotation 0, i.e. angle -PI/2
  let r = Math.atan2(py - cy, px - cx) + Math.PI / 2
  if (snap) {
    const step = Math.PI / 12
    r = Math.round(r / step) * step
  }
  return { ...start, rotation: normalizeAngle(r) }
}

export function cursorForTransformHandle(handle: TransformHandle | null, rotation = 0): string {
  if (!handle) return 'default'
  if (handle === 'rotate') return 'grab'
  // rotate the cursor with the layer so the arrow matches the visual direction
  const base: Record<string, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 }
  const deg = ((base[handle] ?? 0) + (rotation * 180) / Math.PI) % 360
  const a = ((deg % 180) + 180) % 180 // 0..180, symmetric
  if (a < 22.5 || a >= 157.5) return 'ew-resize'
  if (a < 67.5) return 'nwse-resize'
  if (a < 112.5) return 'ns-resize'
  return 'nesw-resize'
}
