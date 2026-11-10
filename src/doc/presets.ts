import type { FilterOp } from './types'
import type { Recipe } from './ops'

/**
 * Presets are just named filter chains — no special code path.
 * `label` is only used by the local AI keyword matcher; display names come
 * from i18n (`preset.<key>`) so switching language relabels them instantly.
 */
export const PRESETS: Record<string, { label: string; chain: FilterOp[] }> = {
  natural: {
    label: '自然',
    chain: [
      { kind: 'exposure', value: 0.08 },
      { kind: 'contrast', value: 8 },
      { kind: 'saturation', value: 6 },
    ],
  },
  vivid: {
    label: '鲜艳',
    chain: [
      { kind: 'exposure', value: 0.1 },
      { kind: 'contrast', value: 26 },
      { kind: 'saturation', value: 42 },
      { kind: 'temperature', value: 8 },
      { kind: 'sharpen', amount: 45 },
    ],
  },
  film: {
    label: '胶片',
    chain: [
      { kind: 'contrast', value: -12 },
      { kind: 'saturation', value: -18 },
      { kind: 'temperature', value: 16 },
      { kind: 'exposure', value: 0.16 },
      { kind: 'vignette', amount: 38, feather: 62 },
    ],
  },
  bw: {
    label: '黑白',
    chain: [
      { kind: 'saturation', value: -100 },
      { kind: 'contrast', value: 28 },
      { kind: 'exposure', value: 0.05 },
      { kind: 'vignette', amount: 26, feather: 70 },
    ],
  },
  warm: {
    label: '暖调',
    chain: [
      { kind: 'temperature', value: 46 },
      { kind: 'exposure', value: 0.12 },
      { kind: 'saturation', value: 10 },
    ],
  },
  cool: {
    label: '冷调',
    chain: [
      { kind: 'temperature', value: -46 },
      { kind: 'contrast', value: 12 },
      { kind: 'saturation', value: -6 },
    ],
  },
  fade: {
    label: '褪色',
    chain: [
      { kind: 'contrast', value: -28 },
      { kind: 'saturation', value: -22 },
      { kind: 'exposure', value: 0.22 },
    ],
  },
  cinematic: {
    label: '电影感',
    chain: [
      { kind: 'contrast', value: 22 },
      { kind: 'saturation', value: -14 },
      { kind: 'temperature', value: -12 },
      { kind: 'exposure', value: -0.12 },
      { kind: 'vignette', amount: 62, feather: 46 },
    ],
  },
  soft: {
    label: '柔焦',
    chain: [
      { kind: 'blur', radius: 1.5 },
      { kind: 'exposure', value: 0.14 },
      { kind: 'contrast', value: -8 },
      { kind: 'saturation', value: 8 },
    ],
  },
  punch: {
    label: '冲击',
    chain: [
      { kind: 'contrast', value: 44 },
      { kind: 'saturation', value: 30 },
      { kind: 'sharpen', amount: 90 },
      { kind: 'vignette', amount: 30, feather: 50 },
    ],
  },
}

export function presetRecipe(layerId: string, name: string): Recipe {
  const p = PRESETS[name]
  if (!p) throw new Error(`unknown preset: ${name}`)
  return (d) => {
    const l = d.layers.find((x) => x.id === layerId)
    if (l) l.filter = p.chain.map((op) => ({ ...op }) as FilterOp)
  }
}
