/**
 * The document is the single source of truth.
 * It is fully serialisable (no pixel data lives in here, only handles).
 */

export type LayerId = string
export type SourceId = string

/** Non-destructive pixel operations. Order matters. */
export type FilterOp =
  | { kind: 'exposure'; value: number } // stops, -3..3
  | { kind: 'contrast'; value: number } // -100..100
  | { kind: 'saturation'; value: number } // -100..100
  | { kind: 'temperature'; value: number } // -100..100
  | { kind: 'vignette'; amount: number; feather: number } // 0..200, 0..100
  | { kind: 'blur'; radius: number } // px
  | { kind: 'sharpen'; amount: number } // 0..200

export type FilterKind = FilterOp['kind']

/** Only modes expressible with fixed-function GPU blending (see render/gl.ts). */
export type BlendMode = 'normal' | 'multiply' | 'screen'

/** Geometry is kept in document pixels, y-down, top-left origin. */
export type LayerTransform = {
  x: number
  y: number
  w: number
  h: number
  rotation: number // radians
}

export type Layer = {
  id: LayerId
  name: string
  src: SourceId
  transform: LayerTransform
  opacity: number // 0..100
  blend: BlendMode
  visible: boolean
  locked: boolean
  filter: FilterOp[]
  /** Erase mask handle (see doc/mask.ts). null = fully opaque. */
  maskId: string | null
}

export type Doc = {
  id: string
  /** pixel grid of the output — this *is* the resolution */
  width: number
  height: number
  /** print metadata only; the renderer never reads it */
  dpi: number
  background: string
  layers: Layer[] // index 0 = bottom
  selection: LayerId[]
}

/** A decoded image, held outside the document. */
export type Source = {
  id: SourceId
  name: string
  width: number
  height: number
  bitmap: ImageBitmap
  /** the original encoded bytes, so the session can be persisted and restored */
  blob: Blob
}

let n = 0
export const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(n++).toString(36)}`
