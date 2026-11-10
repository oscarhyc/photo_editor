import { useRef } from 'react'
import { useDoc, useUI } from '../doc/store'
import { exportDoc } from '../render/compositor'
import { addLayersFromFiles, newDocument } from '../app/fileActions'
import { useT } from '../i18n'
import { Dropdown, MenuItem } from './Dropdown'
import { LangSwitcher } from './LangSwitcher'

const MIN_ZOOM = 0.05
const MAX_ZOOM = 12

export function Topbar({ onFile }: { onFile: (f: File) => void }) {
  const t = useT()
  const past = useDoc((s) => s.past)
  const future = useDoc((s) => s.future)
  const undo = useDoc((s) => s.undo)
  const redo = useDoc((s) => s.redo)
  const jumpTo = useDoc((s) => s.jumpTo)
  const doc = useDoc((s) => s.doc)
  const lastLabel = useDoc((s) => s.lastLabel)
  const zoom = useUI((s) => s.zoom)
  const setView = useUI((s) => s.setView)
  const setShowOriginal = useUI((s) => s.setShowOriginal)
  const setStatus = useUI((s) => s.setStatus)

  const openRef = useRef<HTMLInputElement>(null)
  const addRef = useRef<HTMLInputElement>(null)

  const undoLabel = past[past.length - 1]?.label
  const redoLabel = future[0]?.label

  const zoomBy = (factor: number) =>
    setView({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor)) })

  const download = async (type: 'image/png' | 'image/jpeg') => {
    const blob = await exportDoc(doc, type)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `edit-${Date.now()}.${type === 'image/png' ? 'png' : 'jpg'}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    setStatus(t('status.exported', { type: type === 'image/png' ? 'PNG' : 'JPG' }))
  }

  const copy = async () => {
    if (!window.isSecureContext || !navigator.clipboard?.write) {
      setStatus(t('status.clipboardInsecure'))
      return
    }
    try {
      const blob = await exportDoc(doc, 'image/png')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setStatus(t('status.copied'))
    } catch (err) {
      setStatus(t('status.copyFailed', { msg: (err as Error).message }))
    }
  }

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-dot" />
        <span className="brand-name">Photo Editor</span>
      </div>

      {/* ---------------------------------------------------------- file */}
      <div className="topbar-group">
        <button onClick={() => newDocument()} title={t('topbar.newTitle')}>
          {t('topbar.new')}
        </button>
        <button onClick={() => openRef.current?.click()} title={t('topbar.openTitle')}>
          {t('topbar.open')}
        </button>
        <input
          ref={openRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            e.target.value = ''
          }}
        />
        <button onClick={() => addRef.current?.click()} title={t('topbar.addLayerTitle')}>
          {t('topbar.addLayer')}
        </button>
        <input
          ref={addRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            if (files.length) void addLayersFromFiles(files)
            e.target.value = ''
          }}
        />

        <Dropdown label={t('topbar.export')} title={t('topbar.exportTitle')} align="left" width={196}>
          <MenuItem hint={t('topbar.pngHint')} onClick={() => void download('image/png')}>
            {t('topbar.png')}
          </MenuItem>
          <MenuItem hint={t('topbar.jpgHint')} onClick={() => void download('image/jpeg')}>
            {t('topbar.jpg')}
          </MenuItem>
          <div className="dd-sep" />
          <MenuItem hint={t('topbar.copyHint')} onClick={() => void copy()}>
            {t('topbar.copy')}
          </MenuItem>
        </Dropdown>
      </div>

      <span className="topbar-sep" />

      {/* ---------------------------------------------------------- edit */}
      <div className="topbar-group">
        <button
          onClick={undo}
          disabled={past.length === 0}
          title={undoLabel ? t('topbar.undoTitle', { label: t(undoLabel) }) : t('topbar.undoNone')}
        >
          {t('topbar.undo')}
        </button>
        <button
          onClick={redo}
          disabled={future.length === 0}
          title={redoLabel ? t('topbar.redoTitle', { label: t(redoLabel) }) : t('topbar.redoNone')}
        >
          {t('topbar.redo')}
        </button>

        <Dropdown label={t('topbar.history')} title={t('topbar.historyTitle')} width={260}>
          {past.length === 0 && future.length === 0 && (
            <div className="dd-empty">{t('topbar.historyEmpty')}</div>
          )}
          <div className="dd-scroll">
            {past.slice(-30).map((e, i) => {
              const absolute = past.length - Math.min(30, past.length) + i
              return (
                <MenuItem
                  key={`p${absolute}`}
                  active={absolute === past.length - 1}
                  hint={absolute === past.length - 1 ? t('topbar.current') : undefined}
                  onClick={() => jumpTo(absolute + 1)}
                >
                  {t(e.label)}
                </MenuItem>
              )
            })}
            {future.map((e, i) => (
              <MenuItem
                key={`f${i}`}
                hint={t('topbar.undone')}
                onClick={() => jumpTo(past.length + i + 1)}
              >
                <span className="struck">{t(e.label)}</span>
              </MenuItem>
            ))}
          </div>
        </Dropdown>
      </div>

      <span className="topbar-sep" />

      {/* ---------------------------------------------------------- view */}
      <div className="topbar-group zoom-group">
        <button onClick={() => zoomBy(1 / 1.25)} title={t('topbar.zoomOut')} className="square">
          −
        </button>
        <button
          className="zoom-value"
          onClick={() => setView({ zoom: 1 })}
          title={t('topbar.zoomReset')}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => zoomBy(1.25)} title={t('topbar.zoomIn')} className="square">
          ＋
        </button>
        <button onClick={() => setView({ zoom: 1, panX: 0, panY: 0 })} title={t('topbar.fitTitle')}>
          {t('topbar.fit')}
        </button>
      </div>

      <button
        className="compare"
        onPointerDown={() => setShowOriginal(true)}
        onPointerUp={() => setShowOriginal(false)}
        onPointerLeave={() => setShowOriginal(false)}
        title={t('topbar.compareTitle')}
      >
        {t('topbar.compare')}
      </button>

      <div className="spacer" />
      <span
        className="status"
        title={t('topbar.count', { n: past.length, m: future.length })}
      >
        {t('topbar.recent', { label: lastLabel ? t(lastLabel) : '—' })}
      </span>

      <LangSwitcher />
    </header>
  )
}
