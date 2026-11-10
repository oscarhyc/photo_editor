import { useDoc } from '../doc/store'
import {
  FILTER_LABELS,
  FILTER_RANGES,
  addFilter,
  defaultFilter,
  removeFilter,
  resetFilters,
  setFilterParam,
} from '../doc/ops'
import type { FilterKind } from '../doc/types'
import { useT } from '../i18n'
import { Slider } from './Slider'

const ORDER: FilterKind[] = ['exposure', 'contrast', 'saturation', 'temperature', 'vignette', 'blur', 'sharpen']

export function AdjustPanel() {
  const t = useT()
  const doc = useDoc((s) => s.doc)
  const commit = useDoc((s) => s.commit)
  const layerId = doc.selection[0]
  const layer = doc.layers.find((l) => l.id === layerId)

  if (!layer) {
    return (
      <div className="panel-body">
        <div className="panel-title">{t('adjust.title')}</div>
        <div className="empty">{t('adjust.pickLayer')}</div>
      </div>
    )
  }

  const present = new Set(layer.filter.map((f) => f.kind))

  return (
    <div className="panel-body">
      <div className="panel-head">
        <div className="panel-title">
          {t('adjust.title')} · {layer.name}
        </div>
        <button
          className="ghost"
          disabled={layer.filter.length === 0}
          onClick={() => commit((d) => resetFilters(d, layer.id), 'hist.resetFilters')}
        >
          {t('adjust.clear')}
        </button>
      </div>

      <div className="chain">
        {layer.filter.length === 0 && <div className="empty">{t('adjust.empty')}</div>}
        {layer.filter.map((op, i) => {
          const ranges = FILTER_RANGES[op.kind]
          return (
            <div className="card" key={`${op.kind}-${i}`}>
              <div className="card-head">
                <span className="card-title">
                  <b>{i + 1}</b> {t(FILTER_LABELS[op.kind])}
                </span>
                <button
                  className="ghost danger"
                  title={t('adjust.removeTitle')}
                  onClick={() => commit((d) => removeFilter(d, layer.id, i), 'hist.removeFilter')}
                >
                  ×
                </button>
              </div>
              {Object.entries(ranges).map(([param, r]) => {
                const value = (op as unknown as Record<string, number>)[param]
                return (
                  <Slider
                    key={param}
                    label={t(r.label)}
                    value={value}
                    min={r.min}
                    max={r.max}
                    step={r.step}
                    onChange={(v) =>
                      commit(
                        (d) => setFilterParam(d, layer.id, i, { [param]: v }),
                        'hist.filterParam',
                        `filter:${layer.id}:${i}:${param}`,
                      )
                    }
                  />
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="panel-title sub">{t('adjust.addNode')}</div>
      <div className="chips">
        {ORDER.filter((k) => !present.has(k)).map((kind) => (
          <button
            key={kind}
            className="chip"
            onClick={() => commit((d) => addFilter(d, layer.id, defaultFilter(kind)), 'hist.addFilter')}
          >
            + {t(FILTER_LABELS[kind])}
          </button>
        ))}
        {ORDER.every((k) => present.has(k)) && <span className="dim">{t('adjust.allAdded')}</span>}
      </div>
    </div>
  )
}
