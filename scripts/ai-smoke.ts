/**
 * Headless smoke test for the AI tool layer.
 * Run: npx esbuild scripts/ai-smoke.ts --bundle --platform=node --format=esm \
 *        --define:import.meta.env='{}' --outfile=/tmp/ai-smoke.mjs && node /tmp/ai-smoke.mjs
 */
import { plan, localCalls } from '../src/ai/agent'
import { createDoc, addImageLayer } from '../src/doc/ops'
import { simulate } from '../src/doc/store'
import type { Doc } from '../src/doc/types'

function baseDoc(): Doc {
  const doc = createDoc(1600, 1067)
  addImageLayer(doc, 'src_demo', '示例照片')
  return doc
}

const CASES = [
  '套用胶片预设',
  '做成黑白',
  '曝光 +0.5 对比度 25',
  '让它更亮一点，饱和度高一些',
  '加一点暗角',
  '裁剪成 16:9',
  '不透明度 60%',
  '正片叠底',
  '还原',
  '做得更有电影感',
  '帮我把背景去掉',
]

let failures = 0

for (const text of CASES) {
  const doc = baseDoc()
  const result = await plan(text, doc)
  const ok = result.steps.length > 0
  const preview = simulate(doc, result.steps.map((s) => s.recipe))
  const changed = JSON.stringify(preview) !== JSON.stringify(doc)
  const consistent = result.steps.length === 0 || changed || result.steps.some((s) => s.tool === 'reset_edits')

  if (ok && !consistent) failures++

  console.log(`\n> ${text}`)
  console.log(`  calls: ${localCalls(text).map((c) => c.name).join(', ') || '(none)'}`)
  console.log(`  steps: ${result.steps.map((s) => `${s.tool}(${s.title})`).join(' | ') || '(none)'}`)
  console.log(`  preview changed doc: ${changed}`)
  if (result.steps.length) {
    const l = preview.layers[0]
    console.log(`  layer0 chain: ${l.filter.map((f) => f.kind).join(' → ') || '(empty)'}`)
  }
}

// validation must reject garbage
const bad = await plan('set_blend mode=overlay', baseDoc())
console.log(`\n> invalid enum handled: steps=${bad.steps.length}`)

console.log(`\nfailures: ${failures}`)
process.exit(failures ? 1 : 0)
