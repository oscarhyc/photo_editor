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

export function createDoc(width: number, height: number): Doc {
  return {
    id: uid('doc'),
    width,
    height,
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

export function crop(d: Draft<Doc>, aspect: number) {
  const { width: W, height: H } = d
  let w = W
  let h = W / aspect
  if (h > H) {
    h = H
    w = H * aspect
  }
  const x = (W - w) / 2
  const y = (H - h) / 2
  for (const l of d.layers) {
    l.transform.x -= x
    l.transform.y -= y
  }
  d.width = Math.round(w)
  d.height = Math.round(h)
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
