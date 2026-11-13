import { useRef } from 'react'
import { useDoc } from '../doc/store'
import { blendModes, duplicateLayer, moveLayer, removeLayer, reorderLayer, select, setLayer } from '../doc/ops'
import { thumbnail } from '../doc/sources'
import { addLayersFromFiles } from '../app/fileActions'
import { useT } from '../i18n'

export function LayersPanel() {
  const t = useT()
  const doc = useDoc((s) => s.doc)
  const commit = useDoc((s) => s.commit)
  const selected = doc.selection[0]
  const layer = doc.layers.find((l) => l.id === selected)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="panel-body">
      <div className="panel-head">
        <div className="panel-title">{t('layers.title', { n: doc.layers.length })}</div>
        <button className="ghost add-layer" onClick={() => fileRef.current?.click()} title={t('layers.addTitle')}>
          {t('layers.add')}
        </button>
        <input
          ref={fileRef}
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
      </div>

      <div className="layer-list">
        {doc.layers.length === 0 && (
          <div className="empty">
            {t('layers.empty')}
            <br />
            {t('layers.emptyHint')}
          </div>
        )}
        {[...doc.layers].reverse().map((l, revIndex) => (
          <div
            key={l.id}
            className={`layer-row ${l.id === selected ? 'is-active' : ''}`}
            onClick={() => commit((d) => select(d, [l.id]), 'hist.selectLayer')}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/layer-id', l.id)}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('text/layer-id')) e.preventDefault()
            }}
            onDrop={(e) => {
              const from = e.dataTransfer.getData('text/layer-id')
              if (!from || from === l.id) return
              e.preventDefault()
              const toIndex = doc.layers.length - 1 - revIndex
              commit((d) => reorderLayer(d, from, toIndex), 'hist.reorder')
            }}
          >
            <button
              className={`eye ${l.visible ? 'on' : ''}`}
              title={t('layers.visible')}
              onClick={(e) => {
                e.stopPropagation()
                commit((d) => setLayer(d, l.id, { visible: !l.visible }), 'hist.toggleVisible')
              }}
            >
              {l.visible ? '◉' : '○'}
            </button>
            <img className="layer-thumb" src={thumbnail(l.src)} alt="" draggable={false} />
            <span className="layer-name">{l.name}</span>
            {l.filter.length > 0 && <span className="layer-badge">{l.filter.length}</span>}
            {l.maskId && <span className="layer-badge mask">{t('layers.mask')}</span>}
          </div>
        ))}
      </div>

      {layer && (
        <div className="layer-detail">
          <div className="row">
            <button
              onClick={() => commit((d) => moveLayer(d, layer.id, 1), 'hist.reorder')}
              title={t('layers.upTitle')}
            >
              {t('layers.up')}
            </button>
            <button
              onClick={() => commit((d) => moveLayer(d, layer.id, -1), 'hist.reorder')}
              title={t('layers.downTitle')}
            >
              {t('layers.down')}
            </button>
            <button onClick={() => commit((d) => duplicateLayer(d, layer.id), 'hist.duplicateLayer')}>
              {t('layers.duplicate')}
            </button>
            <button
              className="danger"
              onClick={() => commit((d) => removeLayer(d, layer.id), 'hist.deleteLayer')}
            >
              {t('layers.delete')}
            </button>
          </div>

          <label className="field">
            <span>{t('layers.opacity')}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={layer.opacity}
              onChange={(e) =>
                commit(
                  (d) => setLayer(d, layer.id, { opacity: Number(e.target.value) }),
                  'hist.opacity',
                  `opacity:${layer.id}`,
                )
              }
            />
            <b>{Math.round(layer.opacity)}%</b>
          </label>

          <label className="field">
            <span>{t('layers.blend')}</span>
            <select
              value={layer.blend}
              onChange={(e) =>
                commit((d) => setLayer(d, layer.id, { blend: e.target.value as never }), 'hist.blend')
              }
            >
              {blendModes.map((m) => (
                <option key={m} value={m}>
                  {t(`blend.${m}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>{t('layers.rotation')}</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={Math.round((layer.transform.rotation * 180) / Math.PI)}
              onChange={(e) =>
                commit(
                  (d) => {
                    const l = d.layers.find((x) => x.id === layer.id)
                    if (l) l.transform.rotation = (Number(e.target.value) * Math.PI) / 180
                  },
                  'hist.rotateLayer',
                  `rot:${layer.id}`,
                )
              }
            />
            <b>{Math.round((layer.transform.rotation * 180) / Math.PI)}°</b>
          </label>

          <div className="panel-title sub">{t('layers.position')}</div>
          <div className="grid2">
            {(['x', 'y', 'w', 'h'] as const).map((k) => (
              <label className="field compact" key={k}>
                <span>{k.toUpperCase()}</span>
                <input
                  type="number"
                  value={Math.round(layer.transform[k])}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v))
                      commit(
                        (d) => {
                          const t2 = d.layers.find((x) => x.id === layer.id)
                          if (t2) t2.transform[k] = v
                        },
                        'hist.geometry',
                        `geo:${layer.id}`,
                      )
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
