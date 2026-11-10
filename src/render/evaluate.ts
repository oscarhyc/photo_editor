import type { FilterOp } from '../doc/types'
import { GLCore, type Tex } from './gl'

const CACHE_LIMIT = 28

/**
 * Evaluates a linear filter chain on the GPU, caching every intermediate stage.
 *
 * This is the entire "engine". It is deliberately not a node graph: a chain is
 * what 95% of photo edits need, and the GPU already pipelines the passes.
 * Dragging the last slider only re-runs the passes after it.
 */
export class ChainEngine {
  private cache = new Map<string, Tex>()

  constructor(private core: GLCore) {}

  source(key: string, bitmap: ImageBitmap): Tex {
    return this.core.source(key, bitmap)
  }

  evaluate(base: Tex, chain: FilterOp[]): Tex {
    if (chain.length === 0) return base

    let cur = base
    let key = `s${base.id}`
    const used = new Set<string>()

    for (const op of chain) {
      key += '|' + JSON.stringify(op)
      used.add(key)
      const hit = this.cache.get(key)
      if (hit) {
        // LRU touch
        this.cache.delete(key)
        this.cache.set(key, hit)
        cur = hit
        continue
      }
      cur = this.applyPass(cur, op, base.w, base.h)
      this.cache.set(key, cur)
    }

    this.evict(used)
    return cur
  }

  private applyPass(input: Tex, op: FilterOp, w: number, h: number): Tex {
    const out = this.core.tex(w, h)
    const texelX = 1 / w
    const texelY = 1 / h

    this.core.draw({
      program: this.core.program(op.kind),
      target: out,
      texture: input,
      uniforms: (u) => {
        switch (op.kind) {
          case 'exposure':
            u.float('u_ev', Math.pow(2, op.value))
            break
          case 'contrast': {
            const c = Math.max(-100, Math.min(100, op.value))
            u.float('u_c', (259 * (c + 255)) / (255 * (259 - c)))
            break
          }
          case 'saturation':
            u.float('u_s', 1 + op.value / 100)
            break
          case 'temperature':
            u.float('u_t', op.value / 100)
            break
          case 'vignette':
            u.float('u_amount', op.amount / 100)
            u.float('u_feather', Math.max(0.001, op.feather / 100))
            u.float('u_aspect', w / h)
            break
          case 'blur':
            u.vec2('u_texel', texelX, texelY)
            u.float('u_radius', Math.max(0, op.radius))
            break
          case 'sharpen':
            u.vec2('u_texel', texelX, texelY)
            u.float('u_amount', op.amount / 100)
            break
        }
      },
    })
    return out
  }

  private evict(used: Set<string>) {
    while (this.cache.size > CACHE_LIMIT) {
      let victim: string | undefined
      for (const k of this.cache.keys()) {
        if (!used.has(k)) {
          victim = k
          break
        }
      }
      if (!victim) return
      const t = this.cache.get(victim)!
      this.cache.delete(victim)
      this.core.free(t)
    }
  }

  clear() {
    for (const t of this.cache.values()) this.core.free(t)
    this.cache.clear()
  }
}
