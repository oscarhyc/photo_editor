export type Affine = [number, number, number, number, number, number]
// x' = a*x + c*y + e
// y' = b*x + d*y + f

export const identity: Affine = [1, 0, 0, 1, 0, 0]

export function translate(tx: number, ty: number): Affine {
  return [1, 0, 0, 1, tx, ty]
}

export function scale(sx: number, sy: number): Affine {
  return [sx, 0, 0, sy, 0, 0]
}

export function rotate(r: number): Affine {
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [c, s, -s, c, 0, 0]
}

/** m after n (apply n first, then m) */
export function mul(m: Affine, n: Affine): Affine {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

export function chain(...ms: Affine[]): Affine {
  return ms.reduce((acc, m) => mul(acc, m), identity)
}

export function inverse(m: Affine): Affine {
  const det = m[0] * m[3] - m[1] * m[2]
  if (!det) return identity
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ]
}

export function apply(m: Affine, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

export function toMat3(m: Affine): Float32Array {
  // column-major, for GLSL mat3
  return new Float32Array([m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1])
}
