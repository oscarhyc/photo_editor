import { useEffect, useRef, useState } from 'react'
import type { Doc, LayerTransform } from '../doc/types'
import { useDoc, useUI } from '../doc/store'
import { removeLayer, select, setLayerMask, setLayerTransform } from '../doc/ops'
import { getSource } from '../doc/sources'
import { bumpMask, maskDataFor, putMask } from '../doc/mask'
import { getCompositor } from '../render/compositor'
import { docToLayer, handleAt, hitTest, layerCorners, layerToSource } from '../render/geometry'
import { sourcePixels } from '../tools/pixels'
import { applyWand, wandSelection } from '../tools/wand'
import { eraseDab, eraseStroke } from '../tools/bgEraser'
import { ToolPalette } from './ToolPalette'
import { useT } from '../i18n'

type Drag =
  | { kind: 'pan'; sx: number; sy: number; panX: number; panY: number }
  | { kind: 'move'; layerId: string; sx: number; sy: number; t0: LayerTransform }
  | { kind: 'resize'; layerId: string; t0: LayerTransform; r0: number; cx: number; cy: number }

type Stroke = {
  layerId: string
  maskId: string
  width: number
  height: number
  data: Uint8Array
  last: [number, number]
  changed: boolean
}

function stripFilters(doc: Doc): Doc {
  return { ...doc, layers: doc.layers.map((l) => (l.filter.length ? { ...l, filter: [] } : l)) }
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

export function Viewport() {
  const tr = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const doc = useDoc((s) => s.doc)
  const commit = useDoc((s) => s.commit)
  const previewDoc = useUI((s) => s.previewDoc)
  const previewLabel = useUI((s) => s.previewLabel)
  const showOriginal = useUI((s) => s.showOriginal)
  const zoom = useUI((s) => s.zoom)
  const panX = useUI((s) => s.panX)
  const panY = useUI((s) => s.panY)
  const setView = useUI((s) => s.setView)
  const setStatus = useUI((s) => s.setStatus)
  const tool = useUI((s) => s.tool)
  const wand = useUI((s) => s.wand)
  const eraser = useUI((s) => s.eraser)
  const workingMaskId = useUI((s) => s.workingMaskId)
  const workingMaskLayer = useUI((s) => s.workingMaskLayer)
  const setWorkingMask = useUI((s) => s.setWorkingMask)

  const [size, setSize] = useState({ w: 800, h: 600 })
  const [ghost, setGhost] = useState<{ id: string; t: LayerTransform } | null>(null)
  const [dragging, setDragging] = useState(false)

  const dragRef = useRef<Drag | null>(null)
  const strokeRef = useRef<Stroke | null>(null)
  const hoverRef = useRef<[number, number] | null>(null)
  const spaceRef = useRef(false)
  const dirty = useRef(true)
  const drawRef = useRef<() => void>(() => {})

  // ------------------------------------------------------------- derived doc
  const viewDoc: Doc = (() => {
    let base = previewDoc ?? (showOriginal && tool === 'select' ? stripFilters(doc) : doc)
    if (workingMaskId && workingMaskLayer) {
      base = {
        ...base,
        layers: base.layers.map((l) =>
          l.id === workingMaskLayer ? { ...l, maskId: workingMaskId } : l,
        ),
      }
    }
    if (!ghost) return base
    return {
      ...base,
      layers: base.layers.map((l) => (l.id === ghost.id ? { ...l, transform: ghost.t } : l)),
    }
  })()
  const viewDocRef = useRef(viewDoc)
  viewDocRef.current = viewDoc

  // ------------------------------------------------------------- geometry
  const cw = size.w
  const ch = size.h
  const baseScale = Math.min(cw / Math.max(1, viewDoc.width), ch / Math.max(1, viewDoc.height)) * 0.92
  const scale = baseScale * zoom
  const geoRef = useRef({ cw, ch, scale, panX, panY, dw: viewDoc.width, dh: viewDoc.height })
  geoRef.current = { cw, ch, scale, panX, panY, dw: viewDoc.width, dh: viewDoc.height }

  const docToScreen = (x: number, y: number): [number, number] => {
    const g = geoRef.current
    return [
      g.cw / 2 + g.panX + (x - g.dw / 2) * g.scale,
      g.ch / 2 + g.panY + (y - g.dh / 2) * g.scale,
    ]
  }

  const screenToDoc = (sx: number, sy: number): [number, number] => {
    const g = geoRef.current
    return [
      (sx - g.cw / 2 - g.panX) / g.scale + g.dw / 2,
      (sy - g.ch / 2 - g.panY) / g.scale + g.dh / 2,
    ]
  }

  // ------------------------------------------------------------- paint
  drawRef.current = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const g = geoRef.current
    if (canvas.width !== Math.round(g.cw * dpr) || canvas.height !== Math.round(g.ch * dpr)) {
      canvas.width = Math.round(g.cw * dpr)
      canvas.height = Math.round(g.ch * dpr)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, g.cw, g.ch)

    const activeDoc = viewDocRef.current
    const gl = getCompositor().render(activeDoc)

    const w = g.dw * g.scale
    const h = g.dh * g.scale
    const x = g.cw / 2 + g.panX - w / 2
    const y = g.ch / 2 + g.panY - h / 2

    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = 28
    ctx.shadowOffsetY = 8
    ctx.fillStyle = '#000'
    ctx.fillRect(x, y, w, h)
    ctx.restore()

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(gl, x, y, w, h)

    ctx.strokeStyle = 'rgba(255,255,255,0.10)'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

    // selection outline (only meaningful for the transform tool)
    if (tool === 'select') {
      const selIds = activeDoc.selection
      for (const layer of activeDoc.layers) {
        if (!selIds.includes(layer.id)) continue
        const corners = layerCorners(activeDoc, layer).map(([px, py]) => docToScreen(px, py))
        ctx.beginPath()
        corners.forEach(([sx, sy], i) => (i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy)))
        ctx.closePath()
        ctx.strokeStyle = layer.locked ? 'rgba(255,255,255,0.35)' : '#5b9cff'
        ctx.lineWidth = 1.5
        ctx.stroke()
        if (!layer.locked) {
          for (const [sx, sy] of corners) {
            ctx.fillStyle = '#0d1117'
            ctx.strokeStyle = '#5b9cff'
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.rect(sx - 4, sy - 4, 8, 8)
            ctx.fill()
            ctx.stroke()
          }
        }
      }
    }

    // brush cursor
    if (tool === 'eraser' && hoverRef.current) {
      const [hx, hy] = hoverRef.current
      const r = Math.max(2, eraser.radius * g.scale)
      ctx.beginPath()
      ctx.arc(hx, hy, r, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(0,0,0,0.65)'
      ctx.lineWidth = 2.5
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  useEffect(() => {
    dirty.current = true
  }, [viewDoc, zoom, panX, panY, size, tool, eraser.radius])

  useEffect(() => {
    let raf = 0
    const loop = () => {
      if (dirty.current) {
        dirty.current = false
        drawRef.current()
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ------------------------------------------------------------- sizing
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
      dirty.current = true
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // ------------------------------------------------------------- wheel zoom
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const g = geoRef.current
      const [dx, dy] = screenToDoc(sx, sy)
      const factor = Math.exp(-e.deltaY * 0.0016)
      const nextZoom = Math.max(0.05, Math.min(12, useUI.getState().zoom * factor))
      const nextScale = (g.scale / useUI.getState().zoom) * nextZoom
      setView({
        zoom: nextZoom,
        panX: sx - g.cw / 2 - (dx - g.dw / 2) * nextScale,
        panY: sy - g.ch / 2 - (dy - g.dh / 2) * nextScale,
      })
      dirty.current = true
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setView])

  // ------------------------------------------------------------- keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e.target)) {
        spaceRef.current = true
        e.preventDefault()
      }
      if (isTyping(e.target)) return
      const s = useDoc.getState()
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? s.redo() : s.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        s.redo()
        return
      }
      if (mod) return

      switch (e.key.toLowerCase()) {
        case 'v':
          useUI.getState().setTool('select')
          break
        case 'w':
          useUI.getState().setTool('wand')
          break
        case 'e':
          useUI.getState().setTool('eraser')
          break
        case 'f':
          setView({ zoom: 1, panX: 0, panY: 0 })
          break
        case 'b':
          useUI.getState().setShowOriginal(true)
          break
        case 'delete':
        case 'backspace':
          if (s.doc.selection.length) {
            e.preventDefault()
            for (const id of s.doc.selection) s.commit((d) => removeLayer(d, id), 'hist.deleteLayer')
          }
          break
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false
      if (e.key.toLowerCase() === 'b') useUI.getState().setShowOriginal(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [setView])

  // ------------------------------------------------------------- tools
  const activeLayer = () => {
    const d = useDoc.getState().doc
    return d.layers.find((l) => l.id === d.selection[0]) ?? d.layers[d.layers.length - 1]
  }

  const runWand = (dx: number, dy: number, mode: 'erase' | 'keep') => {
    const d = useDoc.getState().doc
    const layer = activeLayer()
    if (!layer || layer.locked) {
      setStatus(tr('status.selectLayer'))
      return
    }
    const source = getSource(layer.src)
    if (!source) return

    const [lx, ly] = docToLayer(d, layer, dx, dy)
    const [px, py] = layerToSource(layer, source, lx, ly)
    const buf = sourcePixels(source)
    const sel = wandSelection(buf, px, py, wand)

    let any = false
    for (let i = 0; i < sel.length; i++) {
      if (sel[i] > 8) {
        any = true
        break
      }
    }
    if (!any) {
      setStatus(tr('status.nothingSelected'))
      return
    }

    const base = maskDataFor(layer.maskId, source.width, source.height)
    const out = applyWand(base, sel, mode)
    const mask = putMask(source.width, source.height, out)
    commit(
      (dd) => setLayerMask(dd, layer.id, mask.id),
      mode === 'erase' ? 'hist.wandErase' : 'hist.wandKeep',
    )
    setStatus(mode === 'erase' ? tr('status.erased') : tr('status.kept'))
  }

  const beginErase = (dx: number, dy: number) => {
    const d = useDoc.getState().doc
    const layer = activeLayer()
    if (!layer || layer.locked) {
      setStatus(tr('status.selectLayer'))
      return
    }
    const source = getSource(layer.src)
    if (!source) return

    const data = maskDataFor(layer.maskId, source.width, source.height)
    const mask = putMask(source.width, source.height, data)
    const buf = sourcePixels(source)
    const k = source.width / Math.max(1, layer.transform.w)

    const [lx, ly] = docToLayer(d, layer, dx, dy)
    const [px, py] = layerToSource(layer, source, lx, ly)

    const changed = eraseDab(buf, mask.data, px, py, {
      radius: eraser.radius * k,
      tolerance: eraser.tolerance,
    })

    strokeRef.current = {
      layerId: layer.id,
      maskId: mask.id,
      width: source.width,
      height: source.height,
      data: mask.data,
      last: [px, py],
      changed,
    }
    setWorkingMask(layer.id, mask.id)
    dirty.current = true
  }

  const continueErase = (dx: number, dy: number) => {
    const st = strokeRef.current
    if (!st) return
    const d = useDoc.getState().doc
    const layer = d.layers.find((l) => l.id === st.layerId)
    if (!layer) return
    const source = getSource(layer.src)
    if (!source) return

    const k = source.width / Math.max(1, layer.transform.w)
    const [lx, ly] = docToLayer(d, layer, dx, dy)
    const [px, py] = layerToSource(layer, source, lx, ly)
    const buf = sourcePixels(source)

    if (
      eraseStroke(buf, st.data, st.last, [px, py], {
        radius: eraser.radius * k,
        tolerance: eraser.tolerance,
      })
    ) {
      st.changed = true
    }
    st.last = [px, py]
    bumpMask(st.maskId)
    dirty.current = true
  }

  const endErase = () => {
    const st = strokeRef.current
    strokeRef.current = null
    if (!st) return
    setWorkingMask(null, null)
    if (!st.changed) return
    commit((dd) => setLayerMask(dd, st.layerId, st.maskId), 'hist.eraser')
    setStatus(tr('status.erasedBrush'))
  }

  // ------------------------------------------------------------- pointer
  const onPointerDown = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* synthetic events have no real pointer */
    }

    if (e.button === 1 || spaceRef.current || e.altKey) {
      dragRef.current = { kind: 'pan', sx, sy, panX: useUI.getState().panX, panY: useUI.getState().panY }
      setDragging(true)
      return
    }

    const [dx, dy] = screenToDoc(sx, sy)

    if (tool === 'wand') {
      runWand(dx, dy, e.shiftKey ? 'keep' : 'erase')
      return
    }
    if (tool === 'eraser') {
      beginErase(dx, dy)
      setDragging(true)
      return
    }

    const d = viewDocRef.current
    const sel = d.selection[0]
    const selLayer = d.layers.find((l) => l.id === sel)

    if (selLayer && !selLayer.locked) {
      const hitR = 9 / geoRef.current.scale
      if (handleAt(d, selLayer, dx, dy, hitR) >= 0) {
        const cx = selLayer.transform.x + selLayer.transform.w / 2
        const cy = selLayer.transform.y + selLayer.transform.h / 2
        const r0 = Math.max(1, Math.hypot(dx - cx, dy - cy))
        dragRef.current = { kind: 'resize', layerId: selLayer.id, t0: { ...selLayer.transform }, r0, cx, cy }
        setDragging(true)
        return
      }
    }

    const picked = [...d.layers].reverse().find((l) => l.visible && hitTest(d, l, dx, dy))
    if (picked) {
      if (!d.selection.includes(picked.id)) commit((dd) => select(dd, [picked.id]), 'hist.selectLayer')
      if (!picked.locked) {
        dragRef.current = { kind: 'move', layerId: picked.id, sx: dx, sy: dy, t0: { ...picked.transform } }
        setDragging(true)
      }
    } else {
      commit((dd) => select(dd, []), 'hist.deselect')
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    if (tool === 'eraser') {
      hoverRef.current = [sx, sy]
      dirty.current = true
    }

    const drag = dragRef.current
    const [dx, dy] = screenToDoc(sx, sy)

    if (!drag) {
      if (strokeRef.current) continueErase(dx, dy)
      return
    }

    if (drag.kind === 'pan') {
      setView({ panX: drag.panX + (sx - drag.sx), panY: drag.panY + (sy - drag.sy) })
      dirty.current = true
      return
    }

    if (drag.kind === 'move') {
      const t: LayerTransform = {
        ...drag.t0,
        x: drag.t0.x + (dx - drag.sx),
        y: drag.t0.y + (dy - drag.sy),
      }
      setGhost({ id: drag.layerId, t })
      setStatus(`x ${Math.round(t.x)}  y ${Math.round(t.y)}`)
      dirty.current = true
      return
    }

    if (drag.kind === 'resize') {
      const r = Math.hypot(dx - drag.cx, dy - drag.cy)
      const k = Math.max(0.02, r / drag.r0)
      const w = drag.t0.w * k
      const h = drag.t0.h * k
      const t: LayerTransform = { ...drag.t0, w, h, x: drag.cx - w / 2, y: drag.cy - h / 2 }
      setGhost({ id: drag.layerId, t })
      setStatus(`${Math.round(w)} × ${Math.round(h)}`)
      dirty.current = true
    }
  }

  const endDrag = () => {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(false)
    if (tool === 'eraser') {
      endErase()
      return
    }
    if (!drag) return
    if (drag.kind === 'pan') return
    const g = ghost
    if (g) {
      const t = g.t
      commit((d) => setLayerTransform(d, g.id, t), drag.kind === 'move' ? 'hist.moveLayer' : 'hist.resizeLayer')
      setGhost(null)
    }
  }

  const onDoubleClick = () => setView({ zoom: 1, panX: 0, panY: 0 })

  const cursor =
    tool === 'wand' ? 'crosshair' : tool === 'eraser' ? 'none' : dragging ? 'grabbing' : 'default'

  return (
    <div ref={containerRef} className="viewport" onDoubleClick={onDoubleClick}>
      <canvas
        ref={canvasRef}
        className="viewport-canvas"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          hoverRef.current = null
          dirty.current = true
        }}
      />

      <ToolPalette />

      <div className="viewport-hud">
        <span>{Math.round(zoom * 100)}%</span>
        <span className="dim">
          {viewDoc.width} × {viewDoc.height}
        </span>
        {previewDoc && <span className="badge-preview">{tr('viewport.aiPreview')}</span>}
        {showOriginal && <span className="badge-original">{tr('viewport.original')}</span>}
        {previewLabel && !previewDoc ? <span className="dim">{previewLabel}</span> : null}
      </div>
      <div className="viewport-hint">{tr('viewport.hint')}</div>
    </div>
  )
}
