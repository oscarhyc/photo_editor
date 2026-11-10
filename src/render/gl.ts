import { FRAGS, VERT } from './shaders'
import type { BlendMode } from '../doc/types'
import { t } from '../i18n'

export type Tex = {
  id: number
  tex: WebGLTexture
  fbo: WebGLFramebuffer
  w: number
  h: number
}

type Program = {
  prog: WebGLProgram
  loc: (name: string) => WebGLUniformLocation | null
  attr: (name: string) => number
}

export type DrawOpts = {
  program: Program
  target: Tex | null
  texture?: Tex | null
  /** secondary texture, bound to unit 1 and exposed as `u_mask` */
  texture2?: Tex | null
  uniforms?: (u: Uniforms) => void
  blend?: BlendMode | null
  clear?: [number, number, number, number]
}

/** Structural shape of a layer mask, so gl.ts does not depend on doc/. */
export type MaskTextureSource = {
  id: string
  width: number
  height: number
  data: Uint8Array
  rev: number
}

export class Uniforms {
  constructor(
    private gl: WebGLRenderingContext,
    private p: Program,
  ) {}
  float(name: string, v: number) {
    const l = this.p.loc(name)
    if (l) this.gl.uniform1f(l, v)
  }
  vec2(name: string, x: number, y: number) {
    const l = this.p.loc(name)
    if (l) this.gl.uniform2f(l, x, y)
  }
  vec4(name: string, x: number, y: number, z: number, w: number) {
    const l = this.p.loc(name)
    if (l) this.gl.uniform4f(l, x, y, z, w)
  }
  mat3(name: string, m: Float32Array) {
    const l = this.p.loc(name)
    if (l) this.gl.uniformMatrix3fv(l, false, m)
  }
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    throw new Error(`shader compile failed: ${log}`)
  }
  return sh
}

/**
 * Thin WebGL1 wrapper. Owns the quad, the program cache and the draw call.
 * Everything above this file only ever deals with textures and passes.
 */
export class GLCore {
  readonly canvas: HTMLCanvasElement
  readonly gl: WebGLRenderingContext
  private programs = new Map<string, Program>()
  private vert: WebGLShader
  private quad: WebGLBuffer
  private nextTexId = 1
  private sources = new Map<string, Tex>()
  private masks = new Map<string, { tex: Tex; rev: number }>()
  private white: Tex | null = null

  constructor(width: number, height: number) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = Math.max(1, width)
    this.canvas.height = Math.max(1, height)

    const gl = this.canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true, // needed so toBlob() works outside the draw call
    })
    if (!gl) throw new Error(t('error.webgl'))
    this.gl = gl

    this.vert = compile(gl, gl.VERTEX_SHADER, VERT)

    this.quad = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )
    gl.disable(gl.DEPTH_TEST)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  }

  resize(w: number, h: number) {
    const W = Math.max(1, Math.round(w))
    const H = Math.max(1, Math.round(h))
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W
      this.canvas.height = H
    }
  }

  program(kind: string): Program {
    const cached = this.programs.get(kind)
    if (cached) return cached
    const src = FRAGS[kind]
    if (!src) throw new Error(`no shader for ${kind}`)
    const prog = this.gl.createProgram()!
    this.gl.attachShader(prog, this.vert)
    this.gl.attachShader(prog, compile(this.gl, this.gl.FRAGMENT_SHADER, src))
    this.gl.linkProgram(prog)
    if (!this.gl.getProgramParameter(prog, this.gl.LINK_STATUS)) {
      throw new Error(`link failed: ${this.gl.getProgramInfoLog(prog)}`)
    }
    const locCache = new Map<string, WebGLUniformLocation | null>()
    const attrCache = new Map<string, number>()
    const p: Program = {
      prog,
      loc: (name) => {
        if (!locCache.has(name)) locCache.set(name, this.gl.getUniformLocation(prog, name))
        return locCache.get(name) ?? null
      },
      attr: (name) => {
        if (!attrCache.has(name)) attrCache.set(name, this.gl.getAttribLocation(prog, name))
        return attrCache.get(name) ?? -1
      },
    }
    this.programs.set(kind, p)
    return p
  }

  tex(w: number, h: number): Tex {
    const gl = this.gl
    const width = Math.max(1, Math.round(w))
    const height = Math.max(1, Math.round(h))
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    return { id: this.nextTexId++, tex: texture, fbo, w: width, h: height }
  }

  free(t: Tex) {
    this.gl.deleteFramebuffer(t.fbo)
    this.gl.deleteTexture(t.tex)
  }

  source(key: string, bitmap: ImageBitmap): Tex {
    const cached = this.sources.get(key)
    if (cached) return cached
    const gl = this.gl
    const t = this.tex(bitmap.width, bitmap.height)
    gl.bindTexture(gl.TEXTURE_2D, t.tex)
    // Note: UNPACK_FLIP_Y_WEBGL is a no-op for ImageBitmap sources, so we keep
    // v=0 == image top and account for it in layerUvMatrix().
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
    this.sources.set(key, t)
    return t
  }

  dropSource(key: string) {
    const t = this.sources.get(key)
    if (t) {
      this.free(t)
      this.sources.delete(key)
    }
  }

  clearSources() {
    for (const t of this.sources.values()) this.free(t)
    this.sources.clear()
  }

  /** Single-channel (LUMINANCE) texture for a layer mask. */
  maskTex(mask: MaskTextureSource): Tex {
    const hit = this.masks.get(mask.id)
    if (hit && hit.rev === mask.rev) return hit.tex
    if (hit) {
      this.free(hit.tex)
      this.masks.delete(mask.id)
    }

    const gl = this.gl
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      mask.width,
      mask.height,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      mask.data,
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    const tex: Tex = {
      id: this.nextTexId++,
      tex: texture,
      fbo: gl.createFramebuffer()!,
      w: mask.width,
      h: mask.height,
    }
    this.masks.set(mask.id, { tex, rev: mask.rev })
    return tex
  }

  /** 1x1 white mask, used when a layer has none. */
  whiteMask(): Tex {
    if (this.white) return this.white
    const gl = this.gl
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      1,
      1,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      new Uint8Array([255]),
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    this.white = { id: this.nextTexId++, tex: texture, fbo: gl.createFramebuffer()!, w: 1, h: 1 }
    return this.white
  }

  clearMasks() {
    for (const { tex } of this.masks.values()) this.free(tex)
    this.masks.clear()
  }

  draw({ program, target, texture, texture2, uniforms, blend = null, clear }: DrawOpts) {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null)
    gl.viewport(0, 0, target ? target.w : this.canvas.width, target ? target.h : this.canvas.height)

    if (blend) {
      gl.enable(gl.BLEND)
      applyBlend(gl, blend)
    } else {
      gl.disable(gl.BLEND)
    }

    if (clear) {
      gl.clearColor(clear[0], clear[1], clear[2], clear[3])
      gl.clear(gl.COLOR_BUFFER_BIT)
    }

    gl.useProgram(program.prog)

    if (texture) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture.tex)
      gl.uniform1i(program.loc('u_tex'), 0)
    }

    if (texture2) {
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, texture2.tex)
      gl.uniform1i(program.loc('u_mask'), 1)
    }

    uniforms?.(new Uniforms(gl, program))

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    const aPos = program.attr('a_pos')
    if (aPos >= 0) {
      gl.enableVertexAttribArray(aPos)
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }
}

function applyBlend(gl: WebGLRenderingContext, mode: BlendMode) {
  switch (mode) {
    case 'normal':
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.blendEquation(gl.FUNC_ADD)
      break
    case 'multiply':
      gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.blendEquation(gl.FUNC_ADD)
      break
    case 'screen':
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.blendEquation(gl.FUNC_ADD)
      break
  }
}
