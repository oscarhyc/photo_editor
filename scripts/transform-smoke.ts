/**
 * Free-transform math. Pure, no DOM.
 * Run: npm run smoke:transform
 */
import {
  MIN_LAYER_SIZE,
  cursorForTransformHandle,
  handlePoints,
  hitHandle,
  resizeByHandle,
  rotateByHandle,
} from '../src/render/transform'
import type { LayerTransform } from '../src/doc/types'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`)
}
function near(name: string, a: number, b: number, eps = 0.01) {
  const ok = Math.abs(a - b) <= eps
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${a}, want ${b}`}`)
}

const t = (over: Partial<LayerTransform> = {}): LayerTransform => ({
  x: 0,
  y: 0,
  w: 100,
  h: 50,
  rotation: 0,
  ...over,
})

const round = (r: { x: number; y: number; w: number; h: number }) => [
  Math.round(r.x * 100) / 100,
  Math.round(r.y * 100) / 100,
  Math.round(r.w * 100) / 100,
  Math.round(r.h * 100) / 100,
]

// ---------------------------------------------------------------- non-uniform
{
  const r = resizeByHandle(t(), 'e', 150, 25)
  check('east edge changes width only', round(r), [0, 0, 150, 50])
}
{
  const r = resizeByHandle(t(), 'w', -50, 25)
  check('west edge keeps the right edge fixed', round(r), [-50, 0, 150, 50])
}
{
  const r = resizeByHandle(t(), 's', 50, 200)
  check('south edge changes height only', round(r), [0, 0, 100, 200])
}
{
  const r = resizeByHandle(t(), 'n', 50, -50)
  check('north edge keeps the bottom fixed', round(r), [0, -50, 100, 100])
}
{
  const r = resizeByHandle(t(), 'se', 200, 100)
  check('corner is free (aspect NOT locked)', round(r), [0, 0, 200, 100])
}
{
  const r = resizeByHandle(t(), 'nw', -100, -50)
  check('nw anchors the bottom-right', round(r), [-100, -50, 200, 100])
}

// ---------------------------------------------------------------- modifiers
{
  const r = resizeByHandle(t(), 'se', 200, 50, { uniform: true })
  near('shift keeps the aspect (kx wins)', r.w / r.h, 2)
  check('shift: size', round(r), [0, 0, 200, 100])
}
{
  const r = resizeByHandle(t(), 'e', 150, 25, { fromCenter: true })
  check('alt/meta mirrors around the centre', round(r), [-50, 0, 200, 50])
}
{
  const tiny = resizeByHandle(t(), 'e', -1000, 25)
  check('minimum size is enforced', tiny.w, MIN_LAYER_SIZE)
  // the west edge is the anchor at x=0, so the collapsed box still touches it
  check('no flip: box collapses onto the anchor edge', Math.round(tiny.x), 0)
}

// ---------------------------------------------------------------- rotated layers
{
  const start = t({ rotation: Math.PI / 2 })
  // centre is (50,25); the east handle sits at (50,75) in document space
  const pts = handlePoints(start)
  const east = pts.find((p) => p.handle === 'e')!
  near('rotated east handle x', east.x, 50)
  near('rotated east handle y', east.y, 75)

  const r = resizeByHandle(start, 'e', 50, 125)
  check('rotated layer still resizes along its own axis', round(r), [-25, 25, 150, 50])
  near('rotation is preserved', r.rotation, Math.PI / 2)
}
{
  // an edge handle on a rotated layer may only touch its own axis
  const start = t({ rotation: Math.PI / 4 })
  const r = resizeByHandle(start, 'e', 200, 200)
  near('rotated edge drag keeps the other axis', r.h, 50)
}

// ---------------------------------------------------------------- rotation
{
  const r = rotateByHandle(t(), 50, -100)
  near('pointing up means 0°', r.rotation, 0)
}
{
  const r = rotateByHandle(t(), 200, 25)
  near('pointing right means 90°', r.rotation, Math.PI / 2)
}
{
  const r = rotateByHandle(t(), 205, 26, true)
  near('shift snaps to 15°', r.rotation, Math.PI / 2)
}
{
  const r = rotateByHandle(t(), 0, 25)
  near('pointing left means -90°', r.rotation, -Math.PI / 2)
}
{
  const start = t({ rotation: 1 })
  const r = resizeByHandle(start, 'e', 150, 25)
  check('scale keeps the existing rotation', r.rotation, 1)
}

// ---------------------------------------------------------------- hit testing
{
  const pts = handlePoints(t(), 20)
  check('eight scale handles plus rotate', pts.length, 9)
  check('east handle is hit', hitHandle(t(), 100, 25, 10), 'e')
  check('corner beats edge when close', hitHandle(t(), 100, 50, 10), 'se')
  check('inside is not a handle', hitHandle(t(), 50, 25, 10), null)
  const rot = pts.find((p) => p.handle === 'rotate')!
  check('rotation handle is hit', hitHandle(t(), rot.x, rot.y, 10, 20), 'rotate')
}
{
  check('cursor follows rotation (0°)', cursorForTransformHandle('e', 0), 'ew-resize')
  check('cursor follows rotation (90°)', cursorForTransformHandle('e', Math.PI / 2), 'ns-resize')
  check('rotation cursor', cursorForTransformHandle('rotate', 0), 'grab')
  check('no handle', cursorForTransformHandle(null), 'default')
}

console.log(`\nfailures: ${failures}`)
process.exit(failures ? 1 : 0)
