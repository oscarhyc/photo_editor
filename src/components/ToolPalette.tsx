import { useDoc, useUI } from '../doc/store'
import { clearLayerMask } from '../doc/ops'
import { useT } from '../i18n'
import { Slider } from './Slider'

const TOOLS = [
  { key: 'select', icon: '↖', labelKey: 'tool.select', hint: 'V' },
  { key: 'wand', icon: '✦', labelKey: 'tool.wand', hint: 'W' },
  { key: 'eraser', icon: '◌', labelKey: 'tool.eraser', hint: 'E' },
] as const

export function ToolPalette() {
  const t = useT()
  const tool = useUI((s) => s.tool)
  const setTool = useUI((s) => s.setTool)
  const wand = useUI((s) => s.wand)
  const setWand = useUI((s) => s.setWand)
  const eraser = useUI((s) => s.eraser)
  const setEraser = useUI((s) => s.setEraser)
  const doc = useDoc((s) => s.doc)
  const commit = useDoc((s) => s.commit)

  const layer = doc.layers.find((l) => l.id === doc.selection[0]) ?? doc.layers[doc.layers.length - 1]

  return (
    <div className="tool-dock">
      <div className="tool-strip">
        {TOOLS.map((tl) => (
          <button
            key={tl.key}
            className={`tool-btn ${tool === tl.key ? 'is-active' : ''}`}
            title={`${t(tl.labelKey)} (${tl.hint})`}
            onClick={() => setTool(tl.key)}
          >
            <span className="tool-icon">{tl.icon}</span>
            <span className="tool-name">{t(tl.labelKey)}</span>
          </button>
        ))}
      </div>

      <div className="tool-options">
        {!layer && <div className="empty-small">{t('tool.pickLayer')}</div>}

        {layer && tool === 'select' && <div className="hint-block">{t('tool.selectHint')}</div>}

        {layer && tool === 'wand' && (
          <>
            <div className="opt-title">{t('tool.wandPanel', { name: layer.name })}</div>
            <Slider
              label={t('param.tolerance')}
              value={wand.tolerance}
              min={0}
              max={100}
              step={1}
              onChange={(v) => setWand({ tolerance: v })}
            />
            <Slider
              label={t('param.feather')}
              value={wand.feather}
              min={0}
              max={16}
              step={1}
              onChange={(v) => setWand({ feather: v })}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={wand.contiguous}
                onChange={(e) => setWand({ contiguous: e.target.checked })}
              />
              {t('tool.contiguous')}
            </label>
            <div className="hint-block">{t('tool.wandHint')}</div>
          </>
        )}

        {layer && tool === 'eraser' && (
          <>
            <div className="opt-title">{t('tool.eraserPanel', { name: layer.name })}</div>
            <Slider
              label={t('param.radius')}
              value={eraser.radius}
              min={4}
              max={240}
              step={1}
              onChange={(v) => setEraser({ radius: v })}
            />
            <Slider
              label={t('param.tolerance')}
              value={eraser.tolerance}
              min={0}
              max={100}
              step={1}
              onChange={(v) => setEraser({ tolerance: v })}
            />
            <div className="hint-block">{t('tool.eraserHint')}</div>
          </>
        )}

        {layer?.maskId && (
          <button
            className="ghost mask-reset"
            onClick={() => {
              commit((d) => clearLayerMask(d, layer.id), 'hist.clearMask')
              useUI.getState().setStatus(t('status.maskRemoved'))
            }}
          >
            {t('tool.removeMask')}
          </button>
        )}
      </div>
    </div>
  )
}
