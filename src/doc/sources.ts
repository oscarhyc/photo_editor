import type { Source, SourceId } from './types'
import { uid } from './types'

/**
 * Image data lives here, never in the document.
 * The renderer keeps its own GPU texture cache keyed by the same id.
 */
const registry = new Map<SourceId, Source>()
const thumbs = new Map<SourceId, string>()

export function putSource(name: string, bitmap: ImageBitmap): Source {
  const source: Source = {
    id: uid('src'),
    name,
    width: bitmap.width,
    height: bitmap.height,
    bitmap,
  }
  registry.set(source.id, source)
  return source
}

export function getSource(id: SourceId): Source | undefined {
  return registry.get(id)
}

export function allSources(): Source[] {
  return [...registry.values()]
}

export function releaseSource(id: SourceId) {
  const s = registry.get(id)
  if (s) {
    s.bitmap.close()
    registry.delete(id)
    thumbs.delete(id)
  }
}

export function releaseAllExcept(keep: SourceId[] = []) {
  const keepSet = new Set(keep)
  for (const id of [...registry.keys()]) {
    if (!keepSet.has(id)) releaseSource(id)
  }
}

/** Small data-url preview of a source, cached. Used by the layer list. */
export function thumbnail(id: SourceId, size = 56): string | undefined {
  const cached = thumbs.get(id)
  if (cached) return cached
  const s = registry.get(id)
  if (!s) return undefined
  const k = size / Math.max(s.width, s.height)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(s.width * k))
  c.height = Math.max(1, Math.round(s.height * k))
  const ctx = c.getContext('2d')
  if (!ctx) return undefined
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(s.bitmap, 0, 0, c.width, c.height)
  const url = c.toDataURL('image/png')
  thumbs.set(id, url)
  return url
}
