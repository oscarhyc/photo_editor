import { create } from 'zustand'
import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer'
import type { Doc } from './types'
import type { Recipe } from './ops'
import { collectMaskIds, pruneMasks } from './mask'
import type { Rect } from '../render/crop'

enablePatches()

const HISTORY_LIMIT = 120

type Entry = { fwd: Patch[]; inv: Patch[]; label: string }

const COALESCE_MS = 800

export type DocStore = {
  doc: Doc
  past: Entry[]
  future: Entry[]
  lastLabel: string
  lastCoalesce: string
  lastCommitAt: number
  /** `coalesce` merges consecutive commits with the same key into one undo step. */
  commit: (recipe: Recipe, label?: string, coalesce?: string) => void
  commitMany: (recipes: Recipe[], label: string, coalesce?: string) => void
  undo: () => void
  redo: () => void
  /** Keep only the first `keep` entries of history (0 = document as loaded). */
  jumpTo: (keep: number) => void
  load: (doc: Doc) => void
}

export type { Entry }

/** Dry-run a list of recipes against a base doc without touching history. */
export function simulate(base: Doc, recipes: Recipe[]): Doc {
  let cur = base
  for (const r of recipes) {
    const [next] = produceWithPatches(cur, r as never) as unknown as [Doc, Patch[], Patch[]]
    cur = next
  }
  return cur
}

/** Drop mask rasters that neither the document nor its history can reach. */
function pruneMasksFor(doc: Doc, past: Entry[], future: Entry[], workingMaskId: string | null) {
  const keep = collectMaskIds(doc, [...past, ...future])
  if (workingMaskId) keep.add(workingMaskId)
  pruneMasks(keep)
}

export const useDoc = create<DocStore>((set, get) => ({
  doc: { id: 'empty', width: 1600, height: 1067, dpi: 72, background: '#0e0f12', layers: [], selection: [] },
  past: [],
  future: [],
  lastLabel: '',
  lastCoalesce: '',
  lastCommitAt: 0,

  commit: (recipe, label = 'edit', coalesce) => get().commitMany([recipe], label, coalesce),

  commitMany: (recipes, label, coalesce) => {
    const doc = get().doc
    let cur = doc
    const fwd: Patch[] = []
    const inv: Patch[] = []
    for (const r of recipes) {
      const [next, patches, inverse] = produceWithPatches(cur, r as never) as unknown as [
        Doc,
        Patch[],
        Patch[],
      ]
      cur = next
      fwd.push(...patches)
      inv.push(...inverse)
    }
    if (fwd.length === 0) return

    const now = Date.now()
    const past = get().past
    const canMerge =
      !!coalesce &&
      coalesce === get().lastCoalesce &&
      now - get().lastCommitAt < COALESCE_MS &&
      past.length > 0

    if (canMerge) {
      const last = past[past.length - 1]
      // undo order is reversed: [.. oldInv, .. newInv] -> newInv first
      const merged: Entry = { fwd: [...last.fwd, ...fwd], inv: [...inv, ...last.inv], label }
      set({
        doc: cur,
        past: [...past.slice(0, -1), merged],
        future: [],
        lastLabel: label,
        lastCommitAt: now,
      })
      return
    }

    const nextPast = [...past, { fwd, inv, label }].slice(-HISTORY_LIMIT)
    set({
      doc: cur,
      past: nextPast,
      future: [],
      lastLabel: label,
      lastCoalesce: coalesce ?? '',
      lastCommitAt: now,
    })
    pruneMasksFor(cur, nextPast, [], useUI.getState().workingMaskId)
  },

  undo: () => {
    const { past, future, doc } = get()
    const entry = past[past.length - 1]
    if (!entry) return
    const nextPast = past.slice(0, -1)
    const nextFuture = [entry, ...future]
    const nextDoc = applyPatches(doc, entry.inv)
    set({ doc: nextDoc, past: nextPast, future: nextFuture, lastCoalesce: '' })
  },

  redo: () => {
    const { past, future, doc } = get()
    const entry = future[0]
    if (!entry) return
    set({
      doc: applyPatches(doc, entry.fwd),
      future: future.slice(1),
      past: [...past, entry].slice(-HISTORY_LIMIT),
      lastCoalesce: '',
    })
  },

  jumpTo: (keep) => {
    const { doc } = get()
    let cur = doc
    let past = get().past
    let future = get().future

    while (past.length > keep) {
      const e = past[past.length - 1]
      cur = applyPatches(cur, e.inv)
      past = past.slice(0, -1)
      future = [e, ...future]
    }
    while (past.length < keep) {
      const e = future[0]
      if (!e) break
      cur = applyPatches(cur, e.fwd)
      future = future.slice(1)
      past = [...past, e]
    }

    set({ doc: cur, past, future, lastCoalesce: '' })
  },

  load: (doc) => {
    set({ doc, past: [], future: [], lastLabel: '', lastCoalesce: '' })
    pruneMasksFor(doc, [], [], null)
  },
}))

// ------------------------------------------------------------------ UI state

export type Panel = 'layers' | 'adjust' | 'presets'

export type Tool = 'select' | 'wand' | 'eraser' | 'crop'

export type WandSettings = { tolerance: number; contiguous: boolean; feather: number }
export type EraserSettings = { radius: number; tolerance: number }

type UIStore = {
  panel: Panel
  zoom: number
  panX: number
  panY: number
  showOriginal: boolean
  previewDoc: Doc | null
  previewLabel: string
  status: string
  tool: Tool
  wand: WandSettings
  eraser: EraserSettings
  /** temporary mask being brushed / previewed, substituted at render time */
  workingMaskId: string | null
  workingMaskLayer: string | null
  setTool: (t: Tool) => void
  setWand: (p: Partial<WandSettings>) => void
  setEraser: (p: Partial<EraserSettings>) => void
  setWorkingMask: (layerId: string | null, maskId: string | null) => void
  /** interactive crop rect, in document pixels */
  cropRect: Rect | null
  cropAspect: number | null
  setCropRect: (r: Rect | null) => void
  setCropAspect: (a: number | null) => void
  setPanel: (p: Panel) => void
  setView: (v: { zoom?: number; panX?: number; panY?: number }) => void
  setShowOriginal: (v: boolean) => void
  setPreview: (doc: Doc | null, label?: string) => void
  setStatus: (s: string) => void
}

export const useUI = create<UIStore>((set) => ({
  panel: 'adjust',
  zoom: 1,
  panX: 0,
  panY: 0,
  showOriginal: false,
  previewDoc: null,
  previewLabel: '',
  status: 'status.ready',
  tool: 'select',
  wand: { tolerance: 30, contiguous: true, feather: 2 },
  eraser: { radius: 40, tolerance: 35 },
  workingMaskId: null,
  workingMaskLayer: null,
  setTool: (tool) => set({ tool }),
  setWand: (p) => set((s) => ({ wand: { ...s.wand, ...p } })),
  setEraser: (p) => set((s) => ({ eraser: { ...s.eraser, ...p } })),
  setWorkingMask: (workingMaskLayer, workingMaskId) => set({ workingMaskLayer, workingMaskId }),
  cropRect: null,
  cropAspect: null,
  setCropRect: (cropRect) => set({ cropRect }),
  setCropAspect: (cropAspect) => set({ cropAspect }),
  setPanel: (panel) => set({ panel }),
  setView: (v) => set({ ...v }),
  setShowOriginal: (showOriginal) => set({ showOriginal }),
  setPreview: (previewDoc, previewLabel = '') => set({ previewDoc, previewLabel }),
  setStatus: (status) => set({ status }),
}))
