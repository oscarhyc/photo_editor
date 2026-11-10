import { useEffect, useMemo, useState } from 'react'
import { useDoc } from '../doc/store'
import {
  applyScale,
  contentBounds,
  fitToContent,
  resizeCanvas,
  setDpi,
} from '../doc/ops'
import { getCompositor } from '../render/compositor'
import { useT } from '../i18n'

const PRESETS: [number, number][] = [
  [1080, 1080],
  [1080, 1350],
  [1920, 1080],
  [1080, 1920],
  [1200, 630],
  [2480, 3508],
]

const ANCHORS: [number, number][] = [
  [0, 0],
  [0.5, 0],
  [1, 0],
  [0, 0.5],
  [0.5, 0.5],
  [1, 0.5],
  [0, 1],
  [0.5, 1],
  [1, 1],
]

type Tab = 'canvas' | 'image'
type Unit = 'cm' | 'inch'

export function CanvasDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const doc = useDoc((s) => s.doc)
  const commit = useDoc((s) => s.commit)

  const max = useMemo(() => {
    try {
      return getCompositor().maxTextureSize
    } catch {
      return 4096
    }
  }, [])

  const [tab, setTab] = useState<Tab>('canvas')

  // canvas tab
  const [relative, setRelative] = useState(false)
  const [cw, setCw] = useState(doc.width)
  const [ch, setCh] = useState(doc.height)
  const [dw, setDw] = useState(0)
  const [dh, setDh] = useState(0)
  const [lock, setLock] = useState(true)
  const [anchorX, setAnchorX] = useState(0.5)
  const [anchorY, setAnchorY] = useState(0.5)
  const [unit, setUnit] = useState<Unit>('inch')

  // image tab
  const [resample, setResample] = useState(true)
  const [iw, setIw] = useState(doc.width)
  const [ih, setIh] = useState(doc.height)
  const [dpi, setDpiValue] = useState(doc.dpi)

  const ratio = doc.width / Math.max(1, doc.height)
  const hasContent = contentBounds(doc) !== null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // --------------------------------------------------------------- derived
  const targetW = relative ? doc.width + dw : cw
  const targetH = relative ? doc.height + dh : ch
  const canvasValid = targetW >= 1 && targetH >= 1 && targetW <= max && targetH <= max

  const imageW = resample ? iw : doc.width
  const imageH = resample ? ih : doc.height
  const imageValid = imageW >= 1 && imageH >= 1 && imageW <= max && imageH <= max
  const dpiValid = dpi >= 1 && dpi <= 10000

  const physical = (px: number, atDpi: number): string => {
    const inches = px / Math.max(1, atDpi)
    const v = unit === 'inch' ? inches : inches * 2.54
    return v.toFixed(2)
  }

  const mp = (w: number, h: number) => (Math.round((w * h) / 10000) / 100).toFixed(2)

  // --------------------------------------------------------------- actions
  const apply = () => {
    if (tab === 'canvas') {
      if (!canvasValid) return
      commit((d) => resizeCanvas(d, targetW, targetH, anchorX, anchorY), 'hist.canvasResize')
    } else if (!imageValid || !dpiValid) {
      return
    } else if (resample) {
      const k = iw / doc.width
      commit((d) => {
        applyScale(d, k)
        setDpi(d, dpi)
      }, 'hist.imageResize')
    } else {
      if (dpi !== doc.dpi) commit((d) => setDpi(d, dpi), 'hist.dpi')
    }
    onClose()
  }

  const doFit = () => {
    commit((d) => fitToContent(d), 'hist.fitContent')
    onClose()
  }

  const setCanvasW = (v: number) => {
    setCw(v)
    if (lock) setCh(Math.max(1, Math.round(v / ratio)))
  }
  const setCanvasH = (v: number) => {
    setCh(v)
    if (lock) setCw(Math.max(1, Math.round(v * ratio)))
  }
  const setImageW = (v: number) => {
    setIw(v)
    if (lock) setIh(Math.max(1, Math.round(v / ratio)))
  }
  const setImageH = (v: number) => {
    setIh(v)
    if (lock) setIw(Math.max(1, Math.round(v * ratio)))
  }
  const setPercent = (p: number) => {
    const k = Math.max(1, p) / 100
    setIw(Math.max(1, Math.round(doc.width * k)))
    setIh(Math.max(1, Math.round(doc.height * k)))
  }

  // --------------------------------------------------------------- render
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <span>{t('canvas.title')}</span>
          <button className="ghost" onClick={onClose} title={t('canvas.cancel')}>
            ×
          </button>
        </header>

        <div className="tabs">
          <button className={tab === 'canvas' ? 'is-active' : ''} onClick={() => setTab('canvas')}>
            {t('canvas.tabCanvas')}
          </button>
          <button className={tab === 'image' ? 'is-active' : ''} onClick={() => setTab('image')}>
            {t('canvas.tabImage')}
          </button>
        </div>

        <div className="modal-body">
          {tab === 'canvas' && (
            <>
              <div className="seg">
                <button className={!relative ? 'is-active' : ''} onClick={() => setRelative(false)}>
                  {t('canvas.absolute')}
                </button>
                <button className={relative ? 'is-active' : ''} onClick={() => setRelative(true)}>
                  {t('canvas.relative')}
                </button>
              </div>

              <div className="grid2 modal-grid">
                <label className="field compact">
                  <span>{t('canvas.width')}</span>
                  <input
                    type="number"
                    min={1}
                    max={max}
                    value={Math.round(relative ? dw : cw)}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      if (!Number.isFinite(v)) return
                      if (relative) setDw(v)
                      else setCanvasW(v)
                    }}
                  />
                </label>
                <label className="field compact">
                  <span>{t('canvas.height')}</span>
                  <input
                    type="number"
                    min={1}
                    max={max}
                    value={Math.round(relative ? dh : ch)}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      if (!Number.isFinite(v)) return
                      if (relative) setDh(v)
                      else setCanvasH(v)
                    }}
                  />
                </label>
              </div>

              {relative ? (
                <p className="modal-note">{t('canvas.deltaHint')}</p>
              ) : (
                <label className="check">
                  <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
                  {t('canvas.lockAspect')} · {ratio.toFixed(3)}
                </label>
              )}

              <div className="modal-label">{t('canvas.anchor')}</div>
              <div className="anchor-grid">
                {ANCHORS.map(([ax, ay]) => (
                  <button
                    key={`${ax}-${ay}`}
                    className={`anchor ${anchorX === ax && anchorY === ay ? 'is-active' : ''}`}
                    onClick={() => {
                      setAnchorX(ax)
                      setAnchorY(ay)
                    }}
                    aria-label={`${ax},${ay}`}
                  >
                    <span />
                  </button>
                ))}
              </div>

              <div className="modal-label">{t('canvas.presets')}</div>
              <div className="chips">
                {PRESETS.map(([w, h]) => (
                  <button
                    key={`${w}x${h}`}
                    className="chip"
                    onClick={() => {
                      setRelative(false)
                      setCw(w)
                      setCh(h)
                      setLock(false)
                    }}
                  >
                    {w}×{h}
                  </button>
                ))}
                <button className="chip" disabled={!hasContent} onClick={doFit}>
                  {hasContent ? t('canvas.fitContent') : t('canvas.noContent')}
                </button>
              </div>

              <div className="modal-facts">
                <span>
                  {t('canvas.megapixels', { mp: mp(targetW, targetH) })}
                </span>
                <span className="dim">
                  {t('canvas.physicalSize')}: {physical(targetW, doc.dpi)} × {physical(targetH, doc.dpi)}{' '}
                  {unit === 'inch' ? t('unit.inch') : t('unit.cm')} @ {doc.dpi} dpi
                </span>
              </div>
              {!canvasValid && (
                <p className="warn">{t('canvas.tooLarge', { max })}</p>
              )}
            </>
          )}

          {tab === 'image' && (
            <>
              <label className="check">
                <input type="checkbox" checked={resample} onChange={(e) => setResample(e.target.checked)} />
                {t('canvas.resample')}
              </label>
              {!resample && <p className="modal-note">{t('canvas.resampleOffHint')}</p>}

              <div className="grid2 modal-grid">
                <label className="field compact">
                  <span>{t('canvas.width')}</span>
                  <input
                    type="number"
                    min={1}
                    max={max}
                    disabled={!resample}
                    value={Math.round(iw)}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      if (Number.isFinite(v)) setImageW(v)
                    }}
                  />
                </label>
                <label className="field compact">
                  <span>{t('canvas.height')}</span>
                  <input
                    type="number"
                    min={1}
                    max={max}
                    disabled={!resample}
                    value={Math.round(ih)}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      if (Number.isFinite(v)) setImageH(v)
                    }}
                  />
                </label>
              </div>

              <div className="grid2 modal-grid">
                <label className="field compact">
                  <span>%</span>
                  <input
                    type="number"
                    min={1}
                    max={2000}
                    disabled={!resample || !lock}
                    value={Math.round((iw / doc.width) * 100)}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      if (Number.isFinite(v)) setPercent(v)
                    }}
                  />
                </label>
                <label className="field compact">
                  <span>{t('canvas.dpi')}</span>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={dpi}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      if (Number.isFinite(v)) setDpiValue(v)
                    }}
                  />
                </label>
              </div>

              <label className="check">
                <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
                {t('canvas.lockAspect')} · {ratio.toFixed(3)}
              </label>

              <div className="modal-facts">
                <span>{t('canvas.megapixels', { mp: mp(imageW, imageH) })}</span>
                <span className="dim">
                  {t('canvas.physicalSize')}: {physical(imageW, dpi)} × {physical(imageH, dpi)}{' '}
                  {unit === 'inch' ? t('unit.inch') : t('unit.cm')} @ {dpi} dpi
                </span>
              </div>
              {!imageValid && <p className="warn">{t('canvas.tooLarge', { max })}</p>}
            </>
          )}
        </div>

        <footer className="modal-foot">
          <label className="unit-pick">
            <span className="dim">{t('canvas.unit')}</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              <option value="inch">{t('unit.inch')}</option>
              <option value="cm">{t('unit.cm')}</option>
            </select>
          </label>
          <span className="dim modal-limit">{t('canvas.limit', { max })}</span>
          <div className="spacer" />
          <button onClick={onClose}>{t('canvas.cancel')}</button>
          <button
            className="primary"
            onClick={apply}
            disabled={tab === 'canvas' ? !canvasValid : !imageValid || !dpiValid}
          >
            {t('canvas.apply')}
          </button>
        </footer>
      </div>
    </div>
  )
}
