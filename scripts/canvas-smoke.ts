/**
 * Canvas size / resolution tests. Pure ops, no DOM.
 * Run: npm run smoke:canvas
 */
import {
  addImageLayer,
  applyScale,
  contentBounds,
  createDoc,
  crop,
  fitToContent,
  resizeCanvas,
  scaledDoc,
  setCanvasRect,
  setDpi,
} from '../src/doc/ops'
import type { Doc } from '../src/doc/types'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`)
}

function makeDoc(w = 100, h = 100): Doc {
  const doc = createDoc(w, h)
  addImageLayer(doc, 'src_a', 'A', { fit: false, w, h })
  return doc
}

const t0 = (d: Doc) => d.layers[0].transform

// ---------------------------------------------------------------- canvas size
{
  const d = makeDoc()
  resizeCanvas(d, 200, 150, 0, 0)
  check('anchor top-left: layer stays put', [t0(d).x, t0(d).y], [0, 0])
  check('anchor top-left: doc grows', [d.width, d.height], [200, 150])
}
{
  const d = makeDoc()
  resizeCanvas(d, 200, 150, 1, 1)
  check('anchor bottom-right shifts layers', [t0(d).x, t0(d).y], [100, 50])
}
{
  const d = makeDoc()
  resizeCanvas(d, 200, 150, 0.5, 0.5)
  check('anchor centre: half the delta', [t0(d).x, t0(d).y], [50, 25])
}
{
  const d = makeDoc()
  resizeCanvas(d, 60, 40, 0.5, 0.5)
  check('shrinking is the same math', [t0(d).x, t0(d).y], [-20, -30])
  check('shrinking updates the grid', [d.width, d.height], [60, 40])
}
{
  const d = makeDoc()
  resizeCanvas(d, 200, 200, 0.5, 0.5)
  check('canvas size never scales content', [t0(d).w, t0(d).h], [100, 100])
}

// ---------------------------------------------------------------- setCanvasRect / crop
{
  const d = makeDoc()
  setCanvasRect(d, 10, 20, 50, 60)
  check('rect: layers translated by -origin', [t0(d).x, t0(d).y], [-10, -20])
  check('rect: grid set', [d.width, d.height], [50, 60])
}
{
  const d = makeDoc(1600, 1000)
  crop(d, 16 / 9)
  check('crop 16:9 keeps width', d.width, 1600)
  check('crop 16:9 height', d.height, 900)
  check('crop shifts layers up by the crop origin', t0(d).y, -50)
}
{
  const d = makeDoc(1600, 1000)
  crop(d, 1)
  check('crop 1:1 is height-bound', [d.width, d.height], [1000, 1000])
  check('crop 1:1 shifts horizontally', t0(d).x, -300)
}

// ---------------------------------------------------------------- resample
{
  const d = makeDoc()
  applyScale(d, 2)
  check('scale doubles the grid', [d.width, d.height], [200, 200])
  check('scale doubles the transform', [t0(d).x, t0(d).w, t0(d).h], [0, 200, 200])
}
{
  const d = makeDoc(100, 100)
  applyScale(d, 2)
  applyScale(d, 0.5)
  check('scale is reversible within rounding', [d.width, d.height, t0(d).w], [100, 100, 100])
}
{
  const d = makeDoc()
  applyScale(d, 0)
  applyScale(d, -2)
  check('invalid scales are ignored', [d.width, d.height], [100, 100])
}

// ---------------------------------------------------------------- dpi is metadata
{
  const d = makeDoc()
  setDpi(d, 300)
  check('dpi does not touch pixels', [d.width, d.height, t0(d).w, t0(d).h], [100, 100, 100, 100])
  check('dpi is stored', d.dpi, 300)
  check('dpi is clamped to >= 1', (setDpi(d, 0), d.dpi), 1)
}
{
  const d = makeDoc()
  check('default dpi is 72', d.dpi, 72)
}

// ---------------------------------------------------------------- content bounds + fit
{
  const d = makeDoc()
  const b = contentBounds(d)
  check('bounds of a full-bleed layer', b && [b.x, b.y, b.w, b.h], [0, 0, 100, 100])
}
{
  const d = makeDoc()
  t0(d).x = 20
  t0(d).y = 10
  t0(d).w = 30
  t0(d).h = 40
  const b = contentBounds(d)!
  check('bounds follow the transform', [b.x, b.y, b.w, b.h], [20, 10, 30, 40])
  check('padding expands', contentBounds(d, 5)!.w, 40)
}
{
  const d = makeDoc()
  t0(d).rotation = Math.PI / 2
  const b = contentBounds(d)!
  check('rotated square bounds stay 100x100', [b.w, b.h], [100, 100])
}
{
  const d = makeDoc()
  d.layers[0].visible = false
  check('hidden layers are ignored', contentBounds(d), null)
}
{
  const d = makeDoc(200, 200)
  t0(d).x = 30
  t0(d).y = 40
  t0(d).w = 50
  t0(d).h = 60
  fitToContent(d)
  check('fit trims to content', [d.width, d.height], [50, 60])
  check('fit re-origins the layer', [t0(d).x, t0(d).y], [0, 0])
}

// ---------------------------------------------------------------- pure export scale
{
  const d = makeDoc()
  t0(d).x = 10
  const out = scaledDoc(d, 2)
  check('scaledDoc returns a new doc', out === d, false)
  check('scaledDoc scales the grid', [out.width, out.height], [200, 200])
  check('scaledDoc scales transforms', [out.layers[0].transform.x, out.layers[0].transform.w], [20, 200])
  check('scaledDoc leaves the original alone', [d.width, d.layers[0].transform.x], [100, 10])
  check('scaledDoc(1) is identity', scaledDoc(d, 1) === d, true)
}

console.log(`\nfailures: ${failures}`)
process.exit(failures ? 1 : 0)
