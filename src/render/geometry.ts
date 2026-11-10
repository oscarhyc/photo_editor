import type { Doc, Layer } from '../doc/types'
import { type Affine, apply, inverse, mul, rotate, scale, translate } from './matrix'

/**
 * Forward transform: layer-local pixels (0..w, 0..h, y-down) -> document pixels.
 * Used for hit testing and for drawing selection handles.
 */
export function layerForward(doc: Doc, layer: Layer): Affine {
  void doc
  const { x, y, w, h, rotation } = layer.transform
  const cx = x + w / 2
  const cy = y + h / 2
  // apply: translate(-w/2,-h/2) -> rotate -> translate(cx,cy)
  return mul(translate(cx, cy), mul(rotate(rotation), translate(-w / 2, -h / 2)))
}

/**
 * Inverse of the above, plus the uv-space mapping that WebGL texture sampling needs.
 */
export function layerUvMatrix(doc: Doc, layer: Layer): Affine {
  const { x, y, w, h, rotation } = layer.transform
  const cx = x + w / 2
  const cy = y + h / 2
  // uv(y-up) -> doc px (y-down)
  const flip: Affine = [doc.width, 0, 0, -doc.height, 0, doc.height]
  // local px (y-down) -> texture uv
  // NB: ImageBitmap uploads ignore UNPACK_FLIP_Y_WEBGL, so v=0 is the image top.
  const localToUv: Affine = [1 / w, 0, 0, 1 / h, 0, 0]
  return mul(
    localToUv,
    mul(translate(w / 2, h / 2), mul(rotate(-rotation), mul(translate(-cx, -cy), flip))),
  )
}

/** Document pixels -> layer-local pixels (0..transform.w, y-down). */
export function docToLayer(doc: Doc, layer: Layer, px: number, py: number): [number, number] {
  return apply(inverse(layerForward(doc, layer)), px, py)
}

/** Layer-local pixels -> source image pixels. */
export function layerToSource(
  layer: Layer,
  source: { width: number; height: number },
  lx: number,
  ly: number,
): [number, number] {
  const { w, h } = layer.transform
  return [(lx / w) * source.width, (ly / h) * source.height]
}

export function layerCorners(doc: Doc, layer: Layer): [number, number][] {
  const f = layerForward(doc, layer)
  const { w, h } = layer.transform
  return (
    [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ] as [number, number][]
  ).map(([lx, ly]) => [f[0] * lx + f[2] * ly + f[4], f[1] * lx + f[3] * ly + f[5]])
}

export function hitTest(doc: Doc, layer: Layer, px: number, py: number): boolean {
  const f = layerForward(doc, layer)
  const det = f[0] * f[3] - f[1] * f[2]
  if (!det) return false
  const dx = px - f[4]
  const dy = py - f[5]
  const lx = (f[3] * dx - f[2] * dy) / det
  const ly = (-f[1] * dx + f[0] * dy) / det
  const { w, h } = layer.transform
  return lx >= 0 && ly >= 0 && lx <= w && ly <= h
}

/** Half-checks: returns a corner handle index if within `r` px in doc space. */
export function handleAt(doc: Doc, layer: Layer, px: number, py: number, r: number): number {
  const corners = layerCorners(doc, layer)
  for (let i = 0; i < corners.length; i++) {
    const [x, y] = corners[i]
    if ((x - px) ** 2 + (y - py) ** 2 <= r * r) return i
  }
  return -1
}

export function fitScale(doc: Doc, viewport: { w: number; h: number }): number {
  return Math.min(viewport.w / doc.width, viewport.h / doc.height) * 0.9
}

export { scale }
