import type { Doc } from '../doc/types'
import type { Recipe } from '../doc/ops'
import { PRESETS } from '../doc/presets'
import { findTool, targetLayer, TOOLS, toolsJsonSchema } from './tools'
import { validateArgs, type Args } from './schema'
import { t as tr, useLocale } from '../i18n'

const useLocaleLang = () => useLocale.getState().locale

export type Step = { tool: string; title: string; recipe: Recipe }
export type PlanResult = { reply: string; steps: Step[]; source: 'local' | 'llm'; raw?: string }

type Call = { name: string; args: Args }

// ---------------------------------------------------------------- local planner

const DIRECTIONS = {
  up: ['更亮', '亮一点', '加亮', '提亮', 'brighter', 'brighten', 'increase', '更强', '增加', '多一点'],
  down: ['更暗', '暗一点', '压暗', 'darker', 'darken', '降低', '减少', '少一点', '不那么'],
} as const

function hasAny(t: string, words: readonly string[]): boolean {
  return words.some((w) => t.includes(w))
}

/**
 * Offline planner. Not an LLM — a keyword/intent matcher that emits the same
 * tool calls a model would. It proves the tool layer is the real interface.
 */
export function localCalls(text: string): Call[] {
  const t = text.toLowerCase()
  const calls: Call[] = []
  const seen = new Set<string>()
  const push = (name: string, args: Args) => {
    const key = name + JSON.stringify(args)
    if (seen.has(key)) return
    seen.add(key)
    calls.push({ name, args })
  }

  const has = (...words: string[]) => hasAny(t, words)

  // Numbers are consumed one-to-one, nearest-first, so that
  // "曝光 +0.5 对比度 25" gives 0.5 to exposure and 25 to contrast.
  const nums = [...text.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => ({
    v: Number(m[0]),
    i: m.index ?? 0,
    used: false,
  }))
  const takeNum = (start: number, end: number): number | null => {
    let best: (typeof nums)[number] | null = null
    let bestDist = Infinity
    for (const n of nums) {
      if (n.used) continue
      const d = n.i >= end ? n.i - end : start - n.i
      if (d >= 0 && d < bestDist) {
        bestDist = d
        best = n
      }
    }
    if (!best || bestDist > 14) return null
    best.used = true
    return best.v
  }
  const kw = (...words: string[]): [number, number] | null => {
    for (const w of words) {
      const i = t.indexOf(w)
      if (i >= 0) return [i, i + w.length]
    }
    return null
  }
  const numFor = (...words: string[]): number | null => {
    const span = kw(...words)
    return span ? takeNum(span[0], span[1]) : null
  }

  const sign = hasAny(t, DIRECTIONS.down) ? -1 : 1

  // explicit presets by key or label
  for (const [key, p] of Object.entries(PRESETS)) {
    if (t.includes(key) || text.includes(p.label)) push('set_preset', { preset: key })
  }
  const synonym: [string[], string][] = [
    [['黑白', 'bw', 'black and white', 'mono', '去色'], 'bw'],
    [['vivid', 'vibrant', 'pop', '浓郁'], 'vivid'],
    [['电影', 'cinematic', 'cinema'], 'cinematic'],
    [['胶片', 'film', 'analog', '菲林'], 'film'],
    [['warm', 'sunset'], 'warm'],
    [['cool', 'cold'], 'cool'],
    [['褪色', 'fade', 'faded'], 'fade'],
    [['柔焦', 'soft'], 'soft'],
    [['冲击', 'punch'], 'punch'],
    [['natural'], 'natural'],
  ]
  for (const [words, preset] of synonym) {
    if (hasAny(t, words)) push('set_preset', { preset })
  }
  // single-character Chinese modifiers are checked separately to avoid
  // colliding with compound words (暗 vs 暗角, 冷 vs 冷暖)
  if (has('鲜艳')) push('set_preset', { preset: 'vivid' })
  if (has('暖') && !has('冷暖')) push('set_preset', { preset: 'warm' })
  if (has('冷') && !has('冷暖') && !has('冷调')) push('set_preset', { preset: 'cool' })
  if (has('冷调')) push('set_preset', { preset: 'cool' })
  if (has('柔和')) push('set_preset', { preset: 'soft' })
  if (has('强烈')) push('set_preset', { preset: 'punch' })
  if (has('自然') && !has('自然光')) push('set_preset', { preset: 'natural' })

  // crop
  if (has('裁', 'crop', '比例', 'aspect')) {
    const m = text.match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/)
    push('crop', { aspect: m ? `${m[1]}:${m[2]}` : '1:1' })
  }

  // reset
  if (has('还原', '重置', '清除', 'reset', '撤销全部')) push('reset_edits', {})

  // adjustments — 暗角 is stripped first so 暗 doesn't look like exposure
  const toneText = t.replace(/暗角/g, ' ')
  if (hasAny(toneText, ['曝光', 'exposure', '亮', 'bright', '暗', 'dark'])) {
    const explicit = /曝光|exposure/.test(t) ? numFor('曝光', 'exposure') : null
    const value = explicit ?? 0.3 * sign
    push('set_adjustment', { kind: 'exposure', value: Math.max(-3, Math.min(3, value)) })
  }
  if (has('对比', 'contrast', '层次', '通透')) {
    push('set_adjustment', { kind: 'contrast', value: (numFor('对比度', '对比', 'contrast') ?? 25) * sign })
  }
  if (has('饱和', 'saturat', '浓郁度')) {
    push('set_adjustment', { kind: 'saturation', value: (numFor('饱和度', '饱和', 'saturat') ?? 25) * sign })
  }
  if (has('色温', 'temperature', '白平衡')) {
    const cold = has('冷', 'cool')
    push('set_adjustment', {
      kind: 'temperature',
      value: (numFor('色温', 'temperature') ?? 25) * (cold ? -1 : 1),
    })
  }

  // effects
  if (has('暗角', 'vignette')) {
    push('add_effect', { kind: 'vignette', value: numFor('暗角', 'vignette') ?? 45 })
  }
  if (has('模糊', 'blur', '虚化')) {
    push('add_effect', { kind: 'blur', value: numFor('模糊', 'blur', '虚化') ?? 30 })
  }
  if (has('锐', 'sharpen', '清晰')) {
    push('add_effect', { kind: 'sharpen', value: numFor('锐化', 'sharpen', '锐') ?? 60 })
  }

  // layer props
  if (has('透明', 'opacity')) {
    push('set_opacity', { value: Math.max(0, Math.min(100, numFor('不透明度', '透明度', 'opacity') ?? 50)) })
  }
  if (has('正片叠底', 'multiply')) push('set_blend', { mode: 'multiply' })
  if (has('滤色', 'screen')) push('set_blend', { mode: 'screen' })

  return calls
}

// ---------------------------------------------------------------- shared

function toSteps(doc: Doc, calls: Call[]): { steps: Step[]; notes: string[] } {
  const steps: Step[] = []
  const notes: string[] = []
  for (const call of calls) {
    const tool = findTool(call.name)
    if (!tool) {
      notes.push(tr('ai.unknownTool', { name: call.name }))
      continue
    }
    const v = validateArgs(tool.params, call.args)
    if (!v.ok) {
      notes.push(tr('ai.invalidArgs', { name: call.name, errors: v.errors.join('; ') }))
      continue
    }
    const result = tool.run(doc, v.args)
    if (result.kind === 'text') notes.push(result.text)
    else steps.push({ tool: call.name, title: result.title, recipe: result.recipe })
  }
  return { steps, notes }
}

function summarize(doc: Doc, steps: Step[]): string {
  if (steps.length === 0) return ''
  const layer = targetLayer(doc)
  const target = layer ? `“${layer.name}”` : tr('ai.wholeDoc')
  const list = steps.map((s) => `· ${s.title}`).join('\n')
  return tr('ai.stepSummary', { target, n: steps.length, list })
}

export function helpText(): string {
  const presets = Object.keys(PRESETS)
    .slice(0, 6)
    .map((k) => tr(`preset.${k}`))
    .join(' · ')
  return tr('ai.help', {
    presets,
    tools: TOOLS.map((tool) => tool.name).join(', '),
  })
}

// ---------------------------------------------------------------- entry point

/** Requests we deliberately do not fake. */
const UNSUPPORTED: { words: string[]; message: string }[] = [
  {
    words: ['去背景', '移除背景', '抠图', 'remove background', '背景透明', '去背', 'ai 扩图', '生成式填充'],
    message: tr('ai.unsupportedBg'),
  },
]

function unsupportedReply(text: string): string | null {
  const t = text.toLowerCase()
  for (const u of UNSUPPORTED) {
    if (hasAny(t, u.words)) return u.message
  }
  return null
}

export async function plan(userText: string, doc: Doc, apiKey?: string): Promise<PlanResult> {
  const blocked = unsupportedReply(userText)
  if (blocked) return { reply: blocked, steps: [], source: 'local' }

  if (apiKey) {
    try {
      const calls = await llmCalls(userText, doc, apiKey)
      const { steps, notes } = toSteps(doc, calls)
      const reply =
        [summarize(doc, steps), ...notes].filter(Boolean).join('\n\n') || tr('ai.unsure')
      return { reply, steps, source: 'llm' }
    } catch (err) {
      const fallback = localCalls(userText)
      const { steps, notes } = toSteps(doc, fallback)
      const reply =
        tr('ai.llmFailed', { msg: (err as Error).message }) +
        '\n\n' +
        ([summarize(doc, steps), ...notes].filter(Boolean).join('\n\n') || helpText())
      return { reply, steps, source: 'local' }
    }
  }

  // Always answer a describe request locally so the chat is useful offline.
  let text = userText
  const wantsDescribe = /有什么|描述|状态|describe|what.*(in|on)/i.test(userText)
  if (wantsDescribe && !localCalls(userText).length) text = 'describe'

  const calls = localCalls(text)
  if (calls.length === 0) {
    const describe = findTool('describe_document')!.run(doc, {})
    return { reply: helpText(), steps: [], source: 'local', raw: describe.kind === 'text' ? describe.text : '' }
  }

  const { steps, notes } = toSteps(doc, calls)
  if (steps.length === 0 && notes.length === 0) {
    return { reply: helpText(), steps: [], source: 'local' }
  }
  const reply = [summarize(doc, steps), ...notes].filter(Boolean).join('\n\n')
  return { reply, steps, source: 'local' }
}

function replyLanguage(): string {
  const l = useLocaleLang()
  return l === 'en' ? 'English' : l === 'zh-Hant' ? 'Traditional Chinese' : 'Simplified Chinese'
}

// ---------------------------------------------------------------- real LLM

async function llmCalls(userText: string, doc: Doc, apiKey: string): Promise<Call[]> {  const base = (import.meta.env.VITE_AI_BASE_URL as string | undefined) ?? 'https://api.openai.com/v1'
  const model = (import.meta.env.VITE_AI_MODEL as string | undefined) ?? 'gpt-4o-mini'

  const describe = findTool('describe_document')!.run(doc, {})
  const docText = describe.kind === 'text' ? describe.text : ''

  const body = {
    model,
    temperature: 0.2,
    tools: toolsJsonSchema(),
    tool_choice: 'auto',
    messages: [
      {
        role: 'system',
        content:
          '你是照片编辑器的助手。你只能通过工具修改文档，绝不输出坐标或代码。' +
          '风格类需求优先用 set_preset；具体调整用 set_adjustment；没有明确数值时给一个克制的小值。' +
          '不确定时先调用 describe_document。最多三句。',
      },
      {
        role: 'user',
        content: `Reply in ${replyLanguage()}.\n\nDocument state:\n${docText}\n\nUser request: ${userText}`,
      },
    ],
  }

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const data = (await res.json()) as {
    choices?: { message?: { tool_calls?: { function: { name: string; arguments: string } }[] } }[]
  }
  const calls = data.choices?.[0]?.message?.tool_calls ?? []
  return calls.map((c) => {
    let args: Args = {}
    try {
      args = JSON.parse(c.function.arguments || '{}')
    } catch {
      /* ignore malformed args; validation will report it */
    }
    return { name: c.function.name, args }
  })
}
