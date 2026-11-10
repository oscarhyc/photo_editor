import { colorDistance2, toleranceToDistance2, type PixelBuffer } from './pixels'

export type EraserOptions = {
  /** brush radius, in source pixels */
  radius: number
  /** 0..100 colour tolerance */
  tolerance: number
}

/**
 * Background eraser dab: samples the colour under the brush and removes pixels
 * within `radius` whose colour is close to it.
 *
 * Mutates `mask` in place (the caller owns a private copy). Sampling the colour
 * continuously from the *source* pixels is what makes it feel like the real tool:
 * dragging across a background keeps erasing whatever colour is under the cursor.
 */
export function eraseDab(
  px: PixelBuffer,
  mask: Uint8Array,
  cx: number,
  cy: number,
  opts: EraserOptions,
): boolean {
  let changed = false
  const { width: w, height: h, data } = px
  const r = Math.max(0.5, opts.radius)
  const r2 = r * r

  const sxp = Math.min(w - 1, Math.max(0, Math.round(cx)))
  const syp = Math.min(h - 1, Math.max(0, Math.round(cy)))
  const so = (syp * w + sxp) * 4
  const sr = data[so]
  const sg = data[so + 1]
  const sb = data[so + 2]

  const limit2 = toleranceToDistance2(opts.tolerance)
  const hard = limit2 * 0.4 // below this distance: fully erased

  const x0 = Math.max(0, Math.floor(cx - r))
  const x1 = Math.min(w - 1, Math.ceil(cx + r))
  const y0 = Math.max(0, Math.floor(cy - r))
  const y1 = Math.min(h - 1, Math.ceil(cy + r))

  for (let y = y0; y <= y1; y++) {
    const dy = y - cy
    const dy2 = dy * dy
    if (dy2 > r2) continue
    const row = y * w
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx
      const d2 = dx * dx + dy2
      if (d2 > r2) continue

      const i = row + x
      if (mask[i] === 0) continue

      const cd2 = colorDistance2(data, i, sr, sg, sb)
      if (cd2 > limit2) continue

      // colour similarity: 1 at the sampled colour, 0 at the tolerance edge
      const cs = limit2 > hard ? 1 - (cd2 - hard) / (limit2 - hard) : 1
      // brush falloff over the outer 30% of the radius
      const t = Math.sqrt(d2) / r
      const edge = t <= 0.7 ? 1 : 1 - (t - 0.7) / 0.3
      const alpha = Math.max(0, Math.min(1, cs)) * Math.max(0, Math.min(1, edge))
      if (alpha <= 0) continue

      const next = Math.round(mask[i] * (1 - alpha))
      if (next !== mask[i]) {
        mask[i] = next
        changed = true
      }
    }
  }
  return changed
}

/** Dab along a segment so fast drags don't leave gaps. */
export function eraseStroke(
  px: PixelBuffer,
  mask: Uint8Array,
  from: [number, number],
  to: [number, number],
  opts: EraserOptions,
): boolean {
  let changed = false
  const spacing = Math.max(1, opts.radius * 0.3)
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dist = Math.hypot(dx, dy)
  const steps = Math.max(1, Math.ceil(dist / spacing))
  for (let s = 1; s <= steps; s++) {
    const t = s / steps
    if (eraseDab(px, mask, from[0] + dx * t, from[1] + dy * t, opts)) changed = true
  }
  return changed
}
