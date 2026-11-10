import { useDoc } from '../doc/store'
import { PRESETS, presetRecipe } from '../doc/presets'
import { useT } from '../i18n'

const SWATCH: Record<string, string> = {
  natural: 'linear-gradient(135deg,#8fb3d9,#d9c3a5)',
  vivid: 'linear-gradient(135deg,#ff7a3d,#1e9bff)',
  film: 'linear-gradient(135deg,#c9a06a,#5a4632)',
  bw: 'linear-gradient(135deg,#f2f2f2,#1a1a1a)',
  warm: 'linear-gradient(135deg,#ffb347,#ff6f3c)',
  cool: 'linear-gradient(135deg,#5aa9ff,#2b4d7a)',
  fade: 'linear-gradient(135deg,#d8d2c8,#9aa0a6)',
  cinematic: 'linear-gradient(135deg,#2e4a63,#c8a06a)',
  soft: 'linear-gradient(135deg,#f0e6ef,#b8c6db)',
  punch: 'linear-gradient(135deg,#0f0f10,#ff3b30)',
}

export function PresetsPanel() {
  const t = useT()
  const doc = useDoc((s) => s.doc)
  const commit = useDoc((s) => s.commit)
  const layerId = doc.selection[0]
  const layer = doc.layers.find((l) => l.id === layerId)

  return (
    <div className="panel-body">
      <div className="panel-title">{t('presets.title')}</div>
      {!layer && <div className="empty">{t('adjust.pickLayer')}</div>}
      <div className="preset-grid">
        {Object.entries(PRESETS).map(([key, p]) => {
          const active = layer && JSON.stringify(layer.filter) === JSON.stringify(p.chain)
          return (
            <button
              key={key}
              className={`preset ${active ? 'is-active' : ''}`}
              disabled={!layer}
              onClick={() => layer && commit(presetRecipe(layer.id, key), 'hist.preset')}
            >
              <span className="preset-swatch" style={{ background: SWATCH[key] }} />
              <span className="preset-label">{t(`preset.${key}`)}</span>
              <span className="preset-desc">{t('presets.nodes', { n: p.chain.length })}</span>
            </button>
          )
        })}
      </div>
      <p className="hint">{t('presets.hint')}</p>
    </div>
  )
}
