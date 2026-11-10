import { addImageLayer, createDoc } from '../doc/ops'
import { putSource, releaseAllExcept } from '../doc/sources'
import { useDoc, useUI } from '../doc/store'
import { getCompositor } from '../render/compositor'
import { t } from '../i18n'
import type { Source } from '../doc/types'

/**
 * Replace the whole document with this image.
 * Undo history is intentionally cleared, and GPU/bitmap memory for the old
 * document is released.
 */
export async function openAsDocument(file: File): Promise<void> {
  const bitmap = await createImageBitmap(file)
  const src = putSource(file.name, bitmap)

  const store = useDoc.getState()
  store.load(createDoc(bitmap.width, bitmap.height))
  getCompositor().resetTextures()
  releaseAllExcept([src.id])

  store.commit((d) => {
    addImageLayer(d, src.id, file.name)
  }, 'hist.loadFile')

  useUI.getState().setPreview(null)
  useUI.getState().setView({ zoom: 1, panX: 0, panY: 0 })
}

/**
 * Add images as additional layers on top of the current document.
 * All files land in a single undo step.
 */
export async function addLayersFromFiles(files: File[]): Promise<void> {
  if (files.length === 0) return

  const sources: Source[] = []
  for (const f of files) {
    try {
      const bitmap = await createImageBitmap(f)
      sources.push(putSource(f.name, bitmap))
    } catch {
      // skip unreadable files rather than failing the whole batch
    }
  }
  if (sources.length === 0) {
    useUI.getState().setStatus(t('status.noFiles'))
    return
  }

  const store = useDoc.getState()
  if (store.doc.layers.length === 0) {
    // blank document: adopt the size of the first image
    const first = sources[0]
    store.load(createDoc(first.width, first.height))
  }

  store.commit((d) => {
    for (const s of sources) addImageLayer(d, s.id, s.name)
  }, 'hist.addLayer')

  useUI.getState().setPanel('layers')
  useUI.getState().setStatus(t('status.added', { n: sources.length }))
}

export const addLayerFromFile = (file: File) => addLayersFromFiles([file])

/** Blank document, all history and GPU resources cleared. */
export function newDocument(width = 1600, height = 1067): void {
  const store = useDoc.getState()
  store.load(createDoc(width, height))
  getCompositor().resetTextures()
  releaseAllExcept([])
  useUI.getState().setPreview(null)
  useUI.getState().setView({ zoom: 1, panX: 0, panY: 0 })
  useUI.getState().setStatus(t('status.newDoc'))
}
