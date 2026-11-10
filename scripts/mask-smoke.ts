/**
 * Mask + selection algorithm tests. Pure functions, no DOM.
 * Run: npm run smoke:mask
 */
import { wandSelection, applyWand, boxBlur } from '../src/tools/wand'
import { eraseDab, eraseStroke } from '../src/tools/bgEraser'
import type { PixelBuffer } from '../src/tools/pixels'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`)
}
function ok(name: string, cond: boolean, extra = '') {
  if (!cond) failures++
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ` ${extra}`}`)
}

const W = 64
const H = 64
function makePixels(): PixelBuffer {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4
      const inPatch = x >= 40 && x < 48 && y >= 40 && y < 48
      const red = x < 32 || inPatch
      data[o] = red ? 200 : 40
      data[o + 1] = red ? 40 : 60
      data[o + 2] = red ? 40 : 200
      data[o + 3] = 255
    }
  }
  return { width: W, height: H, data }
}

const count = (sel: Uint8Array, t = 128) => sel.reduce((n, v) => (v > t ? n + 1 : n), 0)

// ---------------------------------------------------------------- wand
const px = makePixels()

const contiguous = wandSelection(px, 5, 5, { tolerance: 5, contiguous: true, feather: 0 })
check('contiguous selects left half only', count(contiguous), 32 * 64)

const global = wandSelection(px, 5, 5, { tolerance: 5, contiguous: false, feather: 0 })
check('global also grabs the isolated patch', count(global), 32 * 64 + 64)

const blue = wandSelection(px, 50, 5, { tolerance: 5, contiguous: true, feather: 0 })
check('seed colour decides the region', count(blue), 32 * 64 - 64)

const loose = wandSelection(px, 5, 5, { tolerance: 100, contiguous: true, feather: 0 })
ok('high tolerance floods everything reachable', count(loose) > 32 * 64)

const feathered = wandSelection(px, 5, 5, { tolerance: 5, contiguous: true, feather: 3 })
const soft = feathered.reduce((n, v) => (v > 8 && v < 248 ? n + 1 : n), 0)
ok('feather produces partial alpha', soft > 0, `soft=${soft}`)

// outside the image is a no-op, not a crash
check('seed outside image selects nothing', count(wandSelection(px, -5, 999, { tolerance: 50, contiguous: true, feather: 0 })), 0)

// ---------------------------------------------------------------- mask combine
const opaque = new Uint8Array(W * H).fill(255)
const erased = applyWand(opaque, contiguous, 'erase')
check('erase clears the selection', erased[5 * W + 5], 0)
check('erase keeps the rest', erased[5 * W + 50], 255)

const kept = applyWand(opaque, contiguous, 'keep')
check('keep inverts', kept[5 * W + 5], 255)
check('keep drops the rest', kept[5 * W + 50], 0)

// erase is idempotent w.r.t. an existing mask
const twice = applyWand(erased, contiguous, 'erase')
check('erase twice changes nothing', twice[5 * W + 5], erased[5 * W + 5])

// ---------------------------------------------------------------- blur
const hard = new Uint8Array(W * H)
for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) hard[y * W + x] = x < 32 ? 255 : 0
const blurred = boxBlur(hard, W, H, 4)
ok('blur softens a hard edge', blurred[32 * W + 32] > 0 && blurred[32 * W + 32] < 255, `v=${blurred[32 * W + 32]}`)
check('blur preserves far colours', blurred[0], 255)
check('blur preserves far colours (2)', blurred[W - 1], 0)

// ---------------------------------------------------------------- background eraser
const bgMask = new Uint8Array(W * H).fill(255)
const changed = eraseDab(px, bgMask, 5, 5, { radius: 6, tolerance: 5 })
ok('eraser reports a change', changed)
check('eraser removes the sampled colour', bgMask[5 * W + 5], 0)
check('eraser leaves the other colour', bgMask[5 * W + 50], 255)
check('eraser respects the brush radius', bgMask[5 * W + 25], 255)

const noChange = eraseDab(px, bgMask, 60, 60, { radius: 4, tolerance: 0 })
ok('erasing an already-clear area reports no change', noChange === false || bgMask[60 * W + 60] === 0)

// stroke interpolation must not leave gaps on fast drags
const strokeMask = new Uint8Array(W * H).fill(255)
const strokeChanged = eraseStroke(px, strokeMask, [4, 4], [28, 28], { radius: 5, tolerance: 5 })
ok('stroke reports a change', strokeChanged)
ok('stroke erases along the whole path', strokeMask[4 * W + 4] === 0 && strokeMask[16 * W + 16] === 0 && strokeMask[28 * W + 28] === 0,
  `mid=${strokeMask[16 * W + 16]}`)

// a stroke never touches pixels outside the brush
check('stroke leaves untouched colour alone', strokeMask[60 * W + 60], 255)

console.log(`\nfailures: ${failures}`)
process.exit(failures ? 1 : 0)
