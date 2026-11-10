import type { Doc, FilterKind, Layer } from '../doc/types'
import type { Recipe } from '../doc/ops'
import {
  FILTER_LABELS,
  addFilter,
  crop as cropOp,
  removeFilter,
  resetFilters,
  setLayer,
} from '../doc/ops'
import { t } from '../i18n'
import { PRESETS } from '../doc/presets'
import type { Args, ParamSpec } from './schema'

export type ToolResult =
  | { kind: 'text'; text: string }
  | { kind: 'step'; title: string; recipe: Recipe }

export type ToolDef = {
  name: string
  description: string
  params: ParamSpec[]
  run: (doc: Doc, args: Args) => ToolResult
}

export function targetLayer(doc: Doc): Layer | undefined {
  const sel = doc.selection[0]
  return doc.layers.find((l) => l.id === sel) ?? doc.layers[doc.layers.length - 1]
}

/** Wrap a layer mutation so a missing layer yields a readable message, not a throw. */
function onLayer(doc: Doc, title: string, fn: (layerId: string) => Recipe): ToolResult {
  const layer = targetLayer(doc)
  if (!layer) return { kind: 'text', text: t('ai.noLayers') }
  return { kind: 'step', title, recipe: fn(layer.id) }
}

const ADJUSTABLE: FilterKind[] = ['exposure', 'contrast', 'saturation', 'temperature']
const EFFECTS: FilterKind[] = ['vignette', 'blur', 'sharpen']

const ASPECTS: Record<string, number> = {
  '1:1': 1,
  '4:5': 4 / 5,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
}

export const TOOLS: ToolDef[] = [
  {
    name: 'describe_document',
    description: '读取当前文档：尺寸、图层、每个图层的滤镜链。编辑前先调用它。',
    params: [],
    run: (doc) => {
      if (doc.layers.length === 0)
        return { kind: 'text', text: t('ai.blankDoc', { w: doc.width, h: doc.height }) }
      const lines = doc.layers.map((l, i) => {
        const chain = l.filter.length
          ? l.filter
              .map(
                (f) =>
                  `${f.kind}(${Object.entries(f)
                    .filter(([k]) => k !== 'kind')
                    .map(([, v]) => v)
                    .join(',')})`,
              )
              .join(' → ')
          : t('ai.noFilterChain')
        return t('ai.layerLine', {
          i: i + 1,
          name: l.name,
          w: Math.round(l.transform.w),
          h: Math.round(l.transform.h),
          opacity: l.opacity,
          blend: t(`blend.${l.blend}`),
          chain,
        })
      })
      return {
        kind: 'text',
        text:
          t('ai.docSummary', { w: doc.width, h: doc.height, n: doc.layers.length }) +
          '\n' +
          lines.join('\n'),
      }
    },
  },

  {
    name: 'set_preset',
    description: '给当前图层套用整体风格预设（会替换现有滤镜链）。',
    params: [
      {
        name: 'preset',
        type: 'string',
        required: true,
        enum: Object.keys(PRESETS),
        description: Object.entries(PRESETS)
          .map(([k, v]) => `${k}=${v.label}`)
          .join(', '),
      },
    ],
    run: (doc, args) => {
      const preset = String(args.preset)
      const p = PRESETS[preset]
      if (!p) return { kind: 'text', text: t('ai.unknownPreset', { name: preset }) }
      return onLayer(doc, t('ai.stepPreset', { name: t(`preset.${preset}`) }), (id) => (d) => {
        const l = d.layers.find((x) => x.id === id)
        if (l) l.filter = p.chain.map((op) => ({ ...op }))
      })
    },
  },

  {
    name: 'set_adjustment',
    description: '设置某一项基础调整的值（不存在则新增），作用于当前图层。',
    params: [
      { name: 'kind', type: 'string', required: true, enum: ADJUSTABLE, description: '调整项' },
      {
        name: 'value',
        type: 'number',
        required: true,
        description:
          'exposure 为 -3..3（档）；contrast/saturation/temperature 为 -100..100',
      },
    ],
    run: (doc, args) => {
      const kind = String(args.kind) as FilterKind
      const value = Number(args.value)
      return onLayer(doc, t('ai.stepAdjust', { label: t(FILTER_LABELS[kind]), value }), (id) => (d) => {
        const l = d.layers.find((x) => x.id === id)
        if (!l) return
        const idx = l.filter.findIndex((o) => o.kind === kind)
        if (idx >= 0) Object.assign(l.filter[idx] as Record<string, unknown>, { value })
        else l.filter.push({ kind, value } as never)
      })
    },
  },

  {
    name: 'add_effect',
    description: '追加一个特效（暗角 / 模糊 / 锐化），作用于当前图层。',
    params: [
      { name: 'kind', type: 'string', required: true, enum: EFFECTS, description: '特效类型' },
      { name: 'value', type: 'number', required: true, description: '强度 0..100（模糊为 0..40 px）' },
    ],
    run: (doc, args) => {
      const kind = String(args.kind) as FilterKind
      const value = Number(args.value)
      return onLayer(doc, t('ai.stepAddEffect', { label: t(FILTER_LABELS[kind]), value }), (id) => (d) => {
        const l = d.layers.find((x) => x.id === id)
        if (!l) return
        if (kind === 'vignette') addFilter(d as never, id, { kind: 'vignette', amount: value, feather: 55 })
        else if (kind === 'blur') addFilter(d as never, id, { kind: 'blur', radius: (value / 100) * 40 })
        else addFilter(d as never, id, { kind: 'sharpen', amount: value })
      })
    },
  },

  {
    name: 'remove_effect',
    description: '移除当前图层上某一类的所有滤镜节点。',
    params: [
      {
        name: 'kind',
        type: 'string',
        required: true,
        enum: [...ADJUSTABLE, ...EFFECTS],
        description: '要移除的滤镜类型',
      },
    ],
    run: (doc, args) => {
      const kind = String(args.kind) as FilterKind
      return onLayer(doc, t('ai.stepRemoveEffect', { label: t(FILTER_LABELS[kind]) }), (id) => (d) => {
        const l = d.layers.find((x) => x.id === id)
        if (!l) return
        l.filter = l.filter.filter((o) => o.kind !== kind)
      })
    },
  },

  {
    name: 'reset_edits',
    description: '清空当前图层的所有滤镜，回到原始像素。',
    params: [],
    run: (doc) => onLayer(doc, t('ai.stepReset'), (id) => (d) => resetFilters(d as never, id)),
  },

  {
    name: 'crop',
    description: '按比例居中裁剪整个文档。',
    params: [
      { name: 'aspect', type: 'string', required: true, enum: Object.keys(ASPECTS), description: '目标比例' },
    ],
    run: (_doc, args) => {
      const aspect = String(args.aspect)
      const v = ASPECTS[aspect]
      if (!v) return { kind: 'text', text: t('ai.unsupportedAspect', { aspect }) }
      return {
        kind: 'step',
        title: t('ai.stepCrop', { aspect }),
        recipe: (d) => cropOp(d as never, v),
      }
    },
  },

  {
    name: 'set_opacity',
    description: '设置当前图层的不透明度。',
    params: [
      { name: 'value', type: 'number', required: true, min: 0, max: 100, description: '0..100' },
    ],
    run: (doc, args) => {
      const value = Number(args.value)
      return onLayer(doc, t('ai.stepOpacity', { value }), (id) => (d) =>
        setLayer(d as never, id, { opacity: value }),
      )
    },
  },

  {
    name: 'set_blend',
    description: '设置当前图层的混合模式。',
    params: [
      {
        name: 'mode',
        type: 'string',
        required: true,
        enum: ['normal', 'multiply', 'screen'],
        description: 'normal=正常, multiply=正片叠底, screen=滤色',
      },
    ],
    run: (doc, args) => {
      const mode = String(args.mode) as 'normal' | 'multiply' | 'screen'
      return onLayer(doc, t('ai.stepBlend', { mode: t(`blend.${mode}`) }), (id) => (d) =>
        setLayer(d as never, id, { blend: mode }),
      )
    },
  },
]

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name)
}

export function toolsJsonSchema() {
  return TOOLS.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          t.params.map((p) => [
            p.name,
            {
              type: p.type,
              description: p.description,
              ...(p.enum ? { enum: p.enum } : {}),
            },
          ]),
        ),
        required: t.params.filter((p) => p.required).map((p) => p.name),
      },
    },
  }))
}

export { removeFilter, ASPECTS }
