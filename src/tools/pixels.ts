import type { Source } from '../doc/types'

/** Structural subset of ImageData, so the algorithms are testable in Node. */
export type PixelBuffer = {
  width: number
  height: number
  data: Uint8ClampedArray | Uint8Array
}

const cache = new Map<string, PixelBuffer>()

/**
 * Decoded pixels for a source image, cached by source id.
 * This is the only place that reads pixel data on the CPU.
 */
export function sourcePixels(source: Source): PixelBuffer {
  const hit = cache.get(source.id)
  if (hit) return hit

  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2d context unavailable')
  ctx.drawImage(source.bitmap, 0, 0)
  const data = ctx.getImageData(0, 0, source.width, source.height)
  const buf: PixelBuffer = { width: data.width, height: data.height, data: data.data }
  cache.set(source.id, buf)
  return buf
}

export function evictPixels(sourceId: string) {
  cache.delete(sourceId)
}

export function clearPixels() {
  cache.clear()
}

/** 0 at exactly tolerance 0, very permissive at 100. Squared RGB distance. */
export function toleranceToDistance2(tolerance: number): number {
  const d = (Math.max(0, Math.min(100, tolerance)) / 100) * 300
  return d * d
}

export function colorDistance2(
  data: PixelBuffer['data'],
  i: number,
  r: number,
  g: number,
  b: number,
): number {
  const o = i * 4
  const dr = data[o] - r
  const dg = data[o + 1] - g
  const db = data[o + 2] - b
  return dr * dr + dg * dg + db * db
}
