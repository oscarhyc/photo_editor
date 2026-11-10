import type { Draft } from 'immer'
import type { BlendMode, Doc, FilterKind, FilterOp, Layer } from './types'
import { uid } from './types'

/** Every mutation is a recipe: a pure function applied to an immer draft. */
export type Recipe = (d: Draft<Doc>) => void

// ---------------------------------------------------------------- helpers

function requireLayer(d: Draft<Doc>, id: string): Draft<Layer> {
  const l = d.layers.find((x) => x.id === id)
  if (!l) throw new Error(`layer not found: ${id}`)
  return l
}

// ---------------------------------------------------------------- doc

export function createDoc(width: number, height: number, dpi = 72): Doc {
  return {
    id: uid('doc'),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    dpi,
    background: '#0e0f12',
    layers: [],
    selection: [],
  }
}

export function addImageLayer(
  d: Draft<Doc>,
  src: string,
  name: string,
  opts?: { fit?: boolean; w?: number; h?: number },
): string {
  // Default: fit the image inside the document, preserving aspect.
  let w = opts?.w ?? d.width
  let h = opts?.h ?? d.height
  if (opts?.fit !== false) {
    const scale = Math.min(d.width / w, d.height / h)
    w *= scale
    h *= scale
  }
  const l: Layer = {
    id: uid('ly'),
    name,
    src,
    transform: {
      x: (d.width - w) / 2,
      y: (d.height - h) / 2,
      w,
      h,
      rotation: 0,
    },
    opacity: 100,
    blend: 'normal',
    visible: true,
    locked: false,
    filter: [],
    maskId: null,
  }
  d.layers.push(l)
  d.selection = [l.id]
  return l.id
}

export function removeLayer(d: Draft<Doc>, id: string) {
  d.layers = d.layers.filter((l) => l.id !== id)
  d.selection = d.selection.filter((s) => s !== id)
}

/** Copy a layer in place (offset so the duplicate is visible) and select it. */
export function duplicateLayer(d: Draft<Doc>, id: string) {
  const i = d.layers.findIndex((l) => l.id === id)
  const src = d.layers[i]
  if (!src) return
  const copy: Layer = {
    ...src,
    id: uid('ly'),
    name: `${src.name} 副本`,
    transform: { ...src.transform, x: src.transform.x + 24, y: src.transform.y + 24 },
    filter: structuredClone(src.filter),
  }
  d.layers.splice(i + 1, 0, copy)
  d.selection = [copy.id]
}

export function moveLayer(d: Draft<Doc>, id: string, direction: -1 | 1) {
  const i = d.layers.findIndex((l) => l.id === id)
  const j = i + direction
  if (i < 0 || j < 0 || j >= d.layers.length) return
  const [l] = d.layers.splice(i, 1)
  d.layers.splice(j, 0, l)
}

export function setLayerTransform(d: Draft<Doc>, id: string, t: Partial<Layer['transform']>) {
  Object.assign(requireLayer(d, id).transform, t)
}

export function setLayer(d: Draft<Doc>, id: string, patch: Partial<Layer>) {
  Object.assign(requireLayer(d, id), patch)
}

export function reorderLayer(d: Draft<Doc>, id: string, toIndex: number) {
  const i = d.layers.findIndex((l) => l.id === id)
  if (i < 0) return
  const [l] = d.layers.splice(i, 1)
  d.layers.splice(Math.max(0, Math.min(d.layers.length, toIndex)), 0, l)
}

export function select(d: Draft<Doc>, ids: string[]) {
  d.selection = ids
}

// ---------------------------------------------------------------- canvas geometry
//
// Three distinct operations. `crop` is a special case of `setCanvasRect`, and
// "image size" is `applyScale` — resampling is non-destructive because layers
// keep their source bitmap and only the transform changes.

type BoundsInput = {
  layers: ReadonlyArray<{
    visible: boolean
    transform: { x: number; y: number; w: number; h: number; rotation: number }
  }>
}

/** Union of every visible layer's rotated corners. */
export function contentBounds(
  doc: BoundsInput,
  padding = 0,
): { x: number; y: number; w: number; h: number } | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  let any = false

  for (const l of doc.layers) {
    if (!l.visible) continue
    any = true
    const { x, y, w, h, rotation } = l.transform
    const cx = x + w / 2
    const cy = y + h / 2
    const c = Math.cos(rotation)
    const s = Math.sin(rotation)
    const corners: [number, number][] = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ]
    for (const [px, py] of corners) {
      const X = cx + px * c - py * s
      const Y = cy + px * s + py * c
      if (X < x0) x0 = X
      if (Y < y0) y0 = Y
      if (X > x1) x1 = X
      if (Y > y1) y1 = Y
    }
  }

  if (!any) return null
  return {
    x: Math.floor(x0 - padding),
    y: Math.floor(y0 - padding),
    w: Math.max(1, Math.ceil(x1 - x0 + padding * 2)),
    h: Math.max(1, Math.ceil(y1 - y0 + padding * 2)),
  }
}

/** Set the canvas to an arbitrary rect in document space (used by crop + fit). */
export function setCanvasRect(d: Draft<Doc>, x: number, y: number, w: number, h: number) {
  for (const l of d.layers) {
    l.transform.x -= x
    l.transform.y -= y
  }
  d.width = Math.max(1, Math.round(w))
  d.height = Math.max(1, Math.round(h))
}

/**
 * Change the frame, keep pixels 1:1. `anchorX/Y` ∈ {0, .5, 1} decide which
 * edge the new space comes from (0 = left/top, 1 = right/bottom).
 */
export function resizeCanvas(
  d: Draft<Doc>,
  newW: number,
  newH: number,
  anchorX = 0.5,
  anchorY = 0.5,
) {
  const W = Math.max(1, Math.round(newW))
  const H = Math.max(1, Math.round(newH))
  const dx = (W - d.width) * anchorX
  const dy = (H - d.height) * anchorY
  for (const l of d.layers) {
    l.transform.x += dx
    l.transform.y += dy
  }
  d.width = W
  d.height = H
}

/** Resample: scale the grid *and* every layer transform. Source pixels untouched. */
export function applyScale(d: Draft<Doc>, k: number) {
  if (!Number.isFinite(k) || k <= 0) return
  for (const l of d.layers) {
    const t = l.transform
    t.x *= k
    t.y *= k
    t.w *= k
    t.h *= k
  }
  d.width = Math.max(1, Math.round(d.width * k))
  d.height = Math.max(1, Math.round(d.height * k))
}

export function setDpi(d: Draft<Doc>, dpi: number) {
  d.dpi = Math.max(1, Math.round(dpi))
}

export function fitToContent(d: Draft<Doc>, padding = 0) {
  const b = contentBounds(d, padding)
  if (!b) return
  setCanvasRect(d, b.x, b.y, b.w, b.h)
}

/** Pure clone, used for exporting at a multiple. */
export function scaledDoc(doc: Doc, k: number): Doc {
  if (k === 1) return doc
  return {
    ...doc,
    width: Math.max(1, Math.round(doc.width * k)),
    height: Math.max(1, Math.round(doc.height * k)),
    layers: doc.layers.map((l) => ({
      ...l,
      transform: {
        ...l.transform,
        x: l.transform.x * k,
        y: l.transform.y * k,
        w: l.transform.w * k,
        h: l.transform.h * k,
      },
    })),
  }
}

export function crop(d: Draft<Doc>, aspect: number) {
  const { width: W, height: H } = d
  let w = W
  let h = W / aspect
  if (h > H) {
    h = H
    w = H * aspect
  }
  setCanvasRect(d, (W - w) / 2, (H - h) / 2, w, h)
}

// ---------------------------------------------------------------- filters

export function setFilterChain(d: Draft<Doc>, id: string, chain: FilterOp[]) {
  requireLayer(d, id).filter = chain
}

export function addFilter(d: Draft<Doc>, id: string, op: FilterOp) {
  requireLayer(d, id).filter.push(op)
}

export function removeFilter(d: Draft<Doc>, id: string, index: number) {
  const l = requireLayer(d, id)
  if (index >= 0 && index < l.filter.length) l.filter.splice(index, 1)
}

export function setFilterParam(d: Draft<Doc>, id: string, index: number, value: Record<string, number>) {
  const l = requireLayer(d, id)
  const op = l.filter[index] as unknown as Record<string, number>
  if (!op) return
  Object.assign(op, value)
}

export function resetFilters(d: Draft<Doc>, id: string) {
  requireLayer(d, id).filter = []
}

// ---------------------------------------------------------------- masks

export function setLayerMask(d: Draft<Doc>, id: string, maskId: string | null) {
  requireLayer(d, id).maskId = maskId
}

export function clearLayerMask(d: Draft<Doc>, id: string) {
  requireLayer(d, id).maskId = null
}

// ---------------------------------------------------------------- defaults

export function defaultFilter(kind: FilterKind): FilterOp {
  switch (kind) {
    case 'exposure':
      return { kind, value: 0.2 }
    case 'contrast':
      return { kind, value: 15 }
    case 'saturation':
      return { kind, value: 15 }
    case 'temperature':
      return { kind, value: 20 }
    case 'vignette':
      return { kind, amount: 45, feather: 55 }
    case 'blur':
      return { kind, radius: 6 }
    case 'sharpen':
      return { kind, amount: 60 }
  }
}

export const blendModes: BlendMode[] = ['normal', 'multiply', 'screen']

/** Human-readable range info, single source of truth for sliders + AI validation. */
/** `label` is an i18n key, resolved at render time so switching language is instant. */
export const FILTER_RANGES: Record<FilterKind, Record<string, { min: number; max: number; step: number; label: string }>> = {
  exposure: { value: { min: -3, max: 3, step: 0.01, label: 'filter.exposure' } },
  contrast: { value: { min: -100, max: 100, step: 1, label: 'filter.contrast' } },
  saturation: { value: { min: -100, max: 100, step: 1, label: 'filter.saturation' } },
  temperature: { value: { min: -100, max: 100, step: 1, label: 'filter.temperature' } },
  vignette: {
    amount: { min: 0, max: 200, step: 1, label: 'param.amount' },
    feather: { min: 0, max: 100, step: 1, label: 'param.feather' },
  },
  blur: { radius: { min: 0, max: 40, step: 0.5, label: 'param.radius' } },
  sharpen: { amount: { min: 0, max: 200, step: 1, label: 'param.amount' } },
}

/** i18n keys, not display strings. */
export const FILTER_LABELS: Record<FilterKind, string> = {
  exposure: 'filter.exposure',
  contrast: 'filter.contrast',
  saturation: 'filter.saturation',
  temperature: 'filter.temperature',
  vignette: 'filter.vignette',
  blur: 'filter.blur',
  sharpen: 'filter.sharpen',
}
