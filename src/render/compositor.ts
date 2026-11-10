import type { Doc } from '../doc/types'
import { scaledDoc } from '../doc/ops'
import { getSource } from '../doc/sources'
import { getMask } from '../doc/mask'
import { GLCore } from './gl'
import { ChainEngine } from './evaluate'
import { layerUvMatrix } from './geometry'
import { identity, toMat3 } from './matrix'

const IDENTITY_MAT3 = toMat3(identity)

export function parseColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim()
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16) / 255,
      parseInt(h[1] + h[1], 16) / 255,
      parseInt(h[2] + h[2], 16) / 255,
    ]
  }
  const n = parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) return [0, 0, 0]
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/**
 * Renders the document into a WebGL canvas:
 *   document model -> per-layer filter chain -> composited accumulation buffer -> visible canvas
 *
 * Export uses this exact same path, which is why preview == export.
 */
export class Compositor {
  private core: GLCore
  private engine: ChainEngine
  private accum: import('./gl').Tex | null = null

  constructor(width = 1600, height = 1067) {
    this.core = new GLCore(width, height)
    this.engine = new ChainEngine(this.core)
  }

  get canvas(): HTMLCanvasElement {
    return this.core.canvas
  }

  get maxTextureSize(): number {
    return this.core.maxTextureSize
  }

  render(doc: Doc): HTMLCanvasElement {
    const core = this.core
    const w = Math.max(1, Math.round(doc.width))
    const h = Math.max(1, Math.round(doc.height))
    core.resize(w, h)

    if (this.accum && (this.accum.w !== w || this.accum.h !== h)) {
      core.free(this.accum)
      this.accum = null
    }
    if (!this.accum) this.accum = core.tex(w, h)

    const bg = parseColor(doc.background)
    const blit = core.program('blit')

    // 1) background
    core.draw({
      program: core.program('solid'),
      target: this.accum,
      blend: null,
      clear: [bg[0], bg[1], bg[2], 1],
      uniforms: (u) => u.vec4('u_color', bg[0], bg[1], bg[2], 1),
    })

    // 2) layers, bottom to top
    for (const layer of doc.layers) {
      if (!layer.visible || layer.opacity <= 0) continue
      const source = getSource(layer.src)
      if (!source) continue
      const tex = this.engine.source(source.id, source.bitmap)
      const filtered = this.engine.evaluate(tex, layer.filter)
      const mat = toMat3(layerUvMatrix(doc, layer))

      const mask = getMask(layer.maskId)
      // A mask that no longer exists (pruned history) degrades to opaque.
      const maskTex = mask ? core.maskTex(mask) : core.whiteMask()

      core.draw({
        program: blit,
        target: this.accum,
        texture: filtered,
        texture2: maskTex,
        blend: layer.blend,
        uniforms: (u) => {
          u.mat3('u_inv', mat)
          u.float('u_opacity', layer.opacity / 100)
          u.float('u_hasMask', mask ? 1 : 0)
        },
      })
    }

    // 3) accumulation buffer -> default framebuffer
    core.draw({
      program: blit,
      target: null,
      texture: this.accum,
      texture2: core.whiteMask(),
      blend: null,
      uniforms: (u) => {
        u.mat3('u_inv', IDENTITY_MAT3)
        u.float('u_opacity', 1)
        u.float('u_hasMask', 0)
      },
    })

    return core.canvas
  }

  dropSource(id: string) {
    this.core.dropSource(id)
  }

  /** Frees every cached GPU texture. Call when the document is replaced. */
  resetTextures() {
    this.engine.clear()
    this.core.clearSources()
    this.core.clearMasks()
  }

  dispose() {
    this.engine.clear()
    if (this.accum) {
      this.core.free(this.accum)
      this.accum = null
    }
  }
}

let singleton: Compositor | null = null

export function getCompositor(): Compositor {
  if (!singleton) singleton = new Compositor()
  return singleton
}

/**
 * Render a doc and hand back a PNG/JPEG blob. Same pipeline as the viewport.
 *
 * `scale` re-renders the document at N× (not an upscale of the composite):
 * transforms are multiplied, so layers are re-sampled from their original
 * bitmaps. Clamped to the GPU texture limit.
 */
export async function exportDoc(
  doc: Doc,
  type: 'image/png' | 'image/jpeg',
  quality = 0.92,
  scale = 1,
): Promise<Blob> {
  const compositor = getCompositor()
  const max = compositor.maxTextureSize
  const safe = Math.max(
    1,
    Math.min(scale, max / Math.max(1, doc.width), max / Math.max(1, doc.height)),
  )
  const canvas = compositor.render(scaledDoc(doc, safe))
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('export failed'))), type, quality)
  })
}
