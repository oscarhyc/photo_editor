import { uid } from './types'

/**
 * A layer mask: one byte per source pixel, 255 = keep, 0 = erased.
 *
 * Masks live outside the document (same rule as image sources): the document
 * only stores a `maskId`. Committed masks are immutable — every edit creates a
 * new one — so undo is just a `maskId` patch and masks can be shared safely
 * (e.g. by a duplicated layer).
 */
export type Mask = {
  id: string
  width: number
  height: number
  data: Uint8Array
  /** bumped only for the temporary mask being brushed, so the GPU re-uploads */
  rev: number
}

const registry = new Map<string, Mask>()

export function opaqueMaskData(w: number, h: number): Uint8Array {
  const d = new Uint8Array(w * h)
  d.fill(255)
  return d
}

export function putMask(width: number, height: number, data: Uint8Array): Mask {
  if (data.length !== width * height) {
    throw new Error(`mask size mismatch: ${data.length} != ${width * height}`)
  }
  const m: Mask = { id: uid('mask'), width, height, data, rev: 0 }
  registry.set(m.id, m)
  return m
}

export function getMask(id: string | null | undefined): Mask | undefined {
  return id ? registry.get(id) : undefined
}

/** Mutable copy of a layer's mask, or a fully opaque one if it has none. */
export function maskDataFor(
  maskId: string | null | undefined,
  w: number,
  h: number,
): Uint8Array {
  const m = getMask(maskId)
  if (m && m.width === w && m.height === h) return new Uint8Array(m.data)
  return opaqueMaskData(w, h)
}

export function bumpMask(id: string) {
  const m = registry.get(id)
  if (m) m.rev++
}

/** True when the mask would be a no-op (everything kept). */
export function isOpaque(data: Uint8Array): boolean {
  for (let i = 0; i < data.length; i++) if (data[i] !== 255) return false
  return true
}

export function pruneMasks(keep: Set<string>) {
  for (const id of [...registry.keys()]) {
    if (!keep.has(id)) registry.delete(id)
  }
}

export function allMasks(): Mask[] {
  return [...registry.values()]
}

/** Re-create a mask under its original id, used when restoring a session. */
export function adoptMask(id: string, width: number, height: number, data: Uint8Array): Mask {
  const m: Mask = { id, width, height, data, rev: 0 }
  registry.set(id, m)
  return m
}

export function maskStats() {
  let bytes = 0
  for (const m of registry.values()) bytes += m.data.length
  return { count: registry.size, megabytes: +(bytes / 1048576).toFixed(1) }
}

/** Collect every mask id the document or its history can still reference. */
export function collectMaskIds(doc: import('./types').Doc, entries: { fwd: unknown[]; inv: unknown[] }[]): Set<string> {
  const keep = new Set<string>()
  for (const l of doc.layers) if (l.maskId) keep.add(l.maskId)
  for (const e of entries) {
    for (const list of [e.fwd, e.inv]) {
      for (const p of list as { path: (string | number)[]; value: unknown }[]) {
        if (p.path[p.path.length - 1] === 'maskId' && typeof p.value === 'string') keep.add(p.value)
      }
    }
  }
  return keep
}
