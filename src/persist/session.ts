import type { Doc } from '../doc/types'
import { getSource, allSources, adoptSource } from '../doc/sources'
import { allMasks, adoptMask, collectMaskIds } from '../doc/mask'
import { useDoc } from '../doc/store'
import { idbDelete, idbGet, idbPut } from './db'

const KEY = 'current'
const VERSION = 1

type StoredSource = { id: string; name: string; width: number; height: number; blob: Blob }
type StoredMask = { id: string; width: number; height: number; data: Uint8Array }

type Stored = {
  version: number
  savedAt: number
  doc: Doc
  sources: StoredSource[]
  masks: StoredMask[]
}

/**
 * Persist the whole session — document, the original bytes of every image it
 * uses, and the masks it (or its undo history) can still reference.
 *
 * The document is plain JSON-shaped data and the blobs/typed arrays survive
 * IndexedDB's structured clone, so no base64 or custom format is needed.
 */
export async function saveSession(): Promise<boolean> {
  try {
    const doc = useDoc.getState().doc
    const usedSources = new Set(doc.layers.map((l) => l.src))
    const usedMasks = collectMaskIds(doc, [...useDoc.getState().past, ...useDoc.getState().future])

    const payload: Stored = {
      version: VERSION,
      savedAt: Date.now(),
      doc,
      sources: allSources()
        .filter((s) => usedSources.has(s.id))
        .map((s) => ({ id: s.id, name: s.name, width: s.width, height: s.height, blob: s.blob })),
      masks: allMasks()
        .filter((m) => usedMasks.has(m.id))
        .map((m) => ({ id: m.id, width: m.width, height: m.height, data: m.data })),
    }
    await idbPut(KEY, payload)
    return true
  } catch {
    return false
  }
}

/** Returns true when a usable session was restored. */
export async function restoreSession(): Promise<boolean> {
  let stored: Stored | undefined
  try {
    stored = await idbGet<Stored>(KEY)
  } catch {
    return false
  }
  if (!stored || stored.version !== VERSION || !stored.doc) return false

  // rebuild image sources first — the layers reference them by id
  for (const s of stored.sources ?? []) {
    try {
      const bitmap = await createImageBitmap(s.blob)
      adoptSource({ id: s.id, name: s.name, width: s.width, height: s.height, bitmap, blob: s.blob })
    } catch {
      /* skip unreadable sources */
    }
  }

  for (const m of stored.masks ?? []) {
    try {
      adoptMask(m.id, m.width, m.height, new Uint8Array(m.data))
    } catch {
      /* skip unreadable masks */
    }
  }

  const doc: Doc = stored.doc
  doc.layers = (doc.layers ?? []).filter((l) => getSource(l.src))
  doc.selection = (doc.selection ?? []).filter((id) => doc.layers.some((l) => l.id === id))
  if (doc.layers.length === 0) return false

  useDoc.getState().load(doc)
  return true
}

export async function clearSession(): Promise<void> {
  try {
    await idbDelete(KEY)
  } catch {
    /* ignore */
  }
}
