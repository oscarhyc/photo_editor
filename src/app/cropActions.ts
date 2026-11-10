import { useDoc, useUI } from '../doc/store'
import { setCanvasRect } from '../doc/ops'
import { t } from '../i18n'

/** Enter the crop tool, seeding the rect with the whole canvas if it is stale. */
export function enterCropTool() {
  const ui = useUI.getState()
  const doc = useDoc.getState().doc
  const r = ui.cropRect
  const valid =
    r !== null &&
    r.x >= -0.5 &&
    r.y >= -0.5 &&
    r.x + r.w <= doc.width + 0.5 &&
    r.y + r.h <= doc.height + 0.5 &&
    r.w > 0 &&
    r.h > 0
  ui.setTool('crop')
  if (!valid) ui.setCropRect({ x: 0, y: 0, w: doc.width, h: doc.height })
}

export function applyCrop() {
  const ui = useUI.getState()
  const r = ui.cropRect
  if (!r) return
  const w = Math.max(1, Math.round(r.w))
  const h = Math.max(1, Math.round(r.h))
  const x = Math.round(r.x)
  const y = Math.round(r.y)
  const doc = useDoc.getState().doc
  if (w === doc.width && h === doc.height && x === 0 && y === 0) {
    cancelCrop()
    return
  }
  useDoc.getState().commit((d) => setCanvasRect(d, x, y, w, h), 'hist.crop')
  ui.setCropRect(null)
  ui.setTool('select')
  ui.setStatus(t('status.cropped', { w, h }))
}

export function cancelCrop() {
  const ui = useUI.getState()
  ui.setCropRect(null)
  ui.setTool('select')
}
