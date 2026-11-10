import { colorDistance2, toleranceToDistance2, type PixelBuffer } from './pixels'

export type WandOptions = {
  /** 0..100 */
  tolerance: number
  /** only pixels connected to the seed */
  contiguous: boolean
  /** edge softness in source pixels */
  feather: number
}

/**
 * Magic wand: colour-distance selection seeded at (sx, sy).
 * Returns a selection buffer, 255 = selected, 0 = not.
 *
 * Plain flood fill — the same algorithm as 1979 tint fill. No patent to worry about.
 */
export function wandSelection(
  px: PixelBuffer,
  sx: number,
  sy: number,
  opts: WandOptions,
): Uint8Array {
  const { width: w, height: h, data } = px
  const sel = new Uint8Array(w * h)

  const x0 = Math.round(sx)
  const y0 = Math.round(sy)
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return sel

  const seed = y0 * w + x0
  const so = seed * 4
  const sr = data[so]
  const sg = data[so + 1]
  const sb = data[so + 2]
  const limit = toleranceToDistance2(opts.tolerance)

  const matches = (i: number) => {
    const o = i * 4
    if (data[o + 3] === 0) return false // already transparent
    return colorDistance2(data, i, sr, sg, sb) <= limit
  }

  if (!opts.contiguous) {
    for (let i = 0; i < w * h; i++) if (matches(i)) sel[i] = 255
  } else {
    // explicit stack: contiguous flood fill, 4-neighbour
    const stack = new Int32Array(w * h)
    let sp = 0
    stack[sp++] = seed
    while (sp > 0) {
      const i = stack[--sp]
      if (sel[i]) continue
      if (!matches(i)) continue
      sel[i] = 255
      const x = i % w
      if (x > 0 && !sel[i - 1]) stack[sp++] = i - 1
      if (x < w - 1 && !sel[i + 1]) stack[sp++] = i + 1
      if (i >= w && !sel[i - w]) stack[sp++] = i - w
      if (i + w < w * h && !sel[i + w]) stack[sp++] = i + w
    }
  }

  const r = Math.round(opts.feather)
  return r > 0 ? boxBlur(sel, w, h, r) : sel
}

/** Separable box blur, O(w*h) via a sliding window. */
export function boxBlur(src: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const r = Math.max(1, Math.round(radius))
  const win = 2 * r + 1
  const tmp = new Uint8Array(w * h)
  const out = new Uint8Array(w * h)

  // horizontal
  for (let y = 0; y < h; y++) {
    const row = y * w
    let sum = 0
    for (let i = -r; i <= r; i++) sum += src[row + Math.min(w - 1, Math.max(0, i))]
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / win
      sum -= src[row + Math.min(w - 1, Math.max(0, x - r))]
      sum += src[row + Math.min(w - 1, Math.max(0, x + r + 1))]
    }
  }

  // vertical
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let i = -r; i <= r; i++) sum += tmp[Math.min(h - 1, Math.max(0, i)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / win
      sum -= tmp[Math.min(h - 1, Math.max(0, y - r)) * w + x]
      sum += tmp[Math.min(h - 1, Math.max(0, y + r + 1)) * w + x]
    }
  }

  return out
}

export type WandMode = 'erase' | 'keep'

/**
 * Combine a selection with the layer's existing mask.
 *  erase → selected pixels are removed
 *  keep  → everything except the selection is removed
 */
export function applyWand(base: Uint8Array, sel: Uint8Array, mode: WandMode): Uint8Array {
  const out = new Uint8Array(base.length)
  if (mode === 'erase') {
    for (let i = 0; i < base.length; i++) out[i] = (base[i] * (255 - sel[i])) / 255
  } else {
    for (let i = 0; i < base.length; i++) out[i] = (base[i] * sel[i]) / 255
  }
  return out
}
