import { useEffect, useRef, useState } from 'react'
import { useDoc, useUI, type Panel } from './doc/store'
import { addImageLayer, createDoc } from './doc/ops'
import { bitmapToBlob, putSource } from './doc/sources'
import { addLayersFromFiles, openAsDocument } from './app/fileActions'
import { makeSampleImage } from './demo/sample'
import { Viewport } from './components/Viewport'
import { LayersPanel } from './components/LayersPanel'
import { AdjustPanel } from './components/AdjustPanel'
import { PresetsPanel } from './components/PresetsPanel'
import { ChatPanel } from './components/ChatPanel'
import { Topbar } from './components/Topbar'
import { t, useT } from './i18n'
import { restoreSession, saveSession } from './persist/session'

const RAIL: { key: Panel; icon: string; labelKey: string }[] = [
  { key: 'layers', icon: '▤', labelKey: 'rail.layers' },
  { key: 'adjust', icon: '☰', labelKey: 'rail.adjust' },
  { key: 'presets', icon: '◈', labelKey: 'rail.presets' },
]

async function loadSample() {
  const bitmap = await makeSampleImage()
  const src = putSource(t('sample.name'), bitmap, await bitmapToBlob(bitmap))
  const store = useDoc.getState()
  store.load(createDoc(bitmap.width, bitmap.height))
  store.commit((d) => {
    addImageLayer(d, src.id, t('sample.name'))
  }, 'hist.loadSample')
  useUI.getState().setView({ zoom: 1, panX: 0, panY: 0 })
}

export default function App() {
  const tr = useT()
  const panel = useUI((s) => s.panel)
  const setPanel = useUI((s) => s.setPanel)
  const [dropping, setDropping] = useState(false)
  const booted = useRef(false)

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    void (async () => {
      // a refresh, or the browser's back/forward buttons, must not lose the document
      if (await restoreSession()) {
        useUI.getState().setStatus(t('status.restored'))
        return
      }
      await loadSample()
    })()
  }, [])

  // autosave: debounced after every document change, plus one last attempt when
  // the page goes away
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = useDoc.subscribe((state, prev) => {
      if (state.doc === prev.doc) return
      clearTimeout(timer)
      timer = setTimeout(() => void saveSession(), 700)
    })
    const flush = () => void saveSession()
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      unsubscribe()
      clearTimeout(timer)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
    }
  }, [])

  const onFile = async (file: File) => {
    try {
      await openAsDocument(file)
    } catch (err) {
      useUI.getState().setStatus(t('status.loadFailed', { msg: (err as Error).message }))
    }
  }

  const onDrop = async (files: File[]) => {
    if (files.length === 0) return
    try {
      // Dropping onto a design means "place these"; onto an empty doc it means "open".
      if (useDoc.getState().doc.layers.length > 0) await addLayersFromFiles(files)
      else await openAsDocument(files[0])
    } catch (err) {
      useUI.getState().setStatus(t('status.loadFailed', { msg: (err as Error).message }))
    }
  }

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault()
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDropping(false)
        void onDrop([...(e.dataTransfer.files ?? [])])
      }}
    >
      <Topbar onFile={onFile} />

      <div className="body">
        <nav className="rail">
          {RAIL.map((r) => (
            <button
              key={r.key}
              className={`rail-btn ${panel === r.key ? 'is-active' : ''}`}
              onClick={() => setPanel(r.key)}
              title={tr(r.labelKey)}
            >
              <span className="rail-icon">{r.icon}</span>
              <span className="rail-label">{tr(r.labelKey)}</span>
            </button>
          ))}
        </nav>

        <aside className="panel">
          {panel === 'layers' && <LayersPanel />}
          {panel === 'adjust' && <AdjustPanel />}
          {panel === 'presets' && <PresetsPanel />}
        </aside>

        <main className="workspace">
          <Viewport />
          {dropping && <div className="dropzone">{tr('viewport.dropHint')}</div>}
        </main>

        <ChatPanel />
      </div>
    </div>
  )
}
