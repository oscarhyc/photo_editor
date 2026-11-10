import { useDoc, useUI } from '../doc/store'
import { clearLayerMask } from '../doc/ops'
import { useT } from '../i18n'
import { applyCrop, cancelCrop, enterCropTool } from '../app/cropActions'
import { withAspect } from '../render/crop'
import { Slider } from './Slider'

const TOOLS = [
  { key: 'select', icon: '↖', labelKey: 'tool.select', hint: 'V' },
  { key: 'wand', icon: '✦', labelKey: 'tool.wand', hint: 'W' },
  { key: 'eraser', icon: '◌', labelKey: 'tool.eraser', hint: 'E' },
  { key: 'crop', icon: '⬚', labelKey: 'tool.crop', hint: 'C' },
] as const

const CROP_RATIOS: { key: string; value: number | null }[] = [
  { key: 'crop.free', value: null },
  { key: '1:1', value: 1 },
  { key: '4:5', value: 4 / 5 },
  { key: '16:9', value: 16 / 9 },
  { key: '9:16', value: 9 / 16 },
  { key: '3:2', value: 3 / 2 },
]

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
  const cropRect = useUI((s) => s.cropRect)
  const cropAspect = useUI((s) => s.cropAspect)
  const setCropRect = useUI((s) => s.setCropRect)
  const setCropAspect = useUI((s) => s.setCropAspect)

  const layer = doc.layers.find((l) => l.id === doc.selection[0]) ?? doc.layers[doc.layers.length - 1]

  return (
    <div className="tool-dock">
      <div className="tool-strip">
        {TOOLS.map((tl) => (
          <button
            key={tl.key}
            className={`tool-btn ${tool === tl.key ? 'is-active' : ''}`}
            title={`${t(tl.labelKey)} (${tl.hint})`}
            onClick={() => (tl.key === 'crop' ? enterCropTool() : setTool(tl.key))}
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

        {tool === 'crop' && (
          <>
            <div className="opt-title">{t('tool.crop')}</div>
            <div className="modal-label">{t('crop.keepRatio')}</div>
            <div className="chips">
              {CROP_RATIOS.map((r) => (
                <button
                  key={r.key}
                  className={`chip ${cropAspect === r.value ? 'is-active' : ''}`}
                  onClick={() => {
                    setCropAspect(r.value)
                    const base = cropRect ?? { x: 0, y: 0, w: doc.width, h: doc.height }
                    setCropRect(withAspect(base, r.value, { w: doc.width, h: doc.height }))
                  }}
                >
                  {r.value === null ? t('crop.free') : r.key}
                </button>
              ))}
            </div>
            {cropRect && (
              <div className="crop-size">
                {t('crop.size', { w: Math.round(cropRect.w), h: Math.round(cropRect.h) })}
              </div>
            )}
            <div className="hint-block">{t('crop.hint')}</div>
            <div className="row">
              <button className="primary" onClick={applyCrop}>
                {t('crop.apply')}
              </button>
              <button onClick={cancelCrop}>{t('crop.cancel')}</button>
            </div>
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
