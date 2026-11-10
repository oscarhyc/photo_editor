/**
 * One full-screen-quad vertex shader serves every pass.
 * The whole "engine" is: N fragment shaders + a uniform per parameter.
 */

export const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const HEAD = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
`

const luma = `float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }`

export const FRAGS: Record<string, string> = {
  /** exposure: value in stops */
  exposure: `${HEAD}
uniform float u_ev;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  gl_FragColor = vec4(clamp(c.rgb * u_ev, 0.0, 1.0), c.a);
}`,

  /** contrast: factor around mid grey */
  contrast: `${HEAD}
uniform float u_c;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  gl_FragColor = vec4(clamp((c.rgb - 0.5) * u_c + 0.5, 0.0, 1.0), c.a);
}`,

  /** saturation */
  saturation: `${HEAD}
${luma}
uniform float u_s;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  float l = luma(c.rgb);
  gl_FragColor = vec4(clamp(mix(vec3(l), c.rgb, u_s), 0.0, 1.0), c.a);
}`,

  /** temperature: t in -1..1 */
  temperature: `${HEAD}
uniform float u_t;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  vec3 shift = vec3(0.14, 0.02, -0.14) * u_t;
  gl_FragColor = vec4(clamp(c.rgb + shift, 0.0, 1.0), c.a);
}`,

  /** vignette */
  vignette: `${HEAD}
uniform float u_amount;
uniform float u_feather;
uniform float u_aspect;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  vec2 p = (v_uv - 0.5) * vec2(u_aspect, 1.0);
  float d = length(p) / length(vec2(u_aspect, 1.0) * 0.5);
  float t = smoothstep(max(0.0, 1.0 - u_feather), 1.0, d);
  gl_FragColor = vec4(clamp(c.rgb * (1.0 - u_amount * t), 0.0, 1.0), c.a);
}`,

  /** single-pass 5x5 gaussian approximation, radius in px */
  blur: `${HEAD}
uniform vec2 u_texel;
uniform float u_radius;
void main() {
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      float w = exp(-0.5 * float(i * i + j * j));
      vec2 off = vec2(float(i), float(j)) * u_texel * u_radius * 0.6;
      sum += texture2D(u_tex, v_uv + off) * w;
      total += w;
    }
  }
  gl_FragColor = sum / total;
}`,

  /** unsharp mask via 3x3 blur */
  sharpen: `${HEAD}
uniform vec2 u_texel;
uniform float u_amount;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  vec3 n = texture2D(u_tex, v_uv + vec2(0.0, -u_texel.y)).rgb;
  vec3 s = texture2D(u_tex, v_uv + vec2(0.0,  u_texel.y)).rgb;
  vec3 w = texture2D(u_tex, v_uv + vec2(-u_texel.x, 0.0)).rgb;
  vec3 e = texture2D(u_tex, v_uv + vec2( u_texel.x, 0.0)).rgb;
  vec3 soft = (c.rgb * 4.0 + n + s + w + e) / 8.0;
  gl_FragColor = vec4(clamp(c.rgb + u_amount * (c.rgb - soft), 0.0, 1.0), c.a);
}`,

  /** draw a layer texture into the document, honouring its inverse matrix + mask */
  blit: `${HEAD}
uniform mat3 u_inv;
uniform float u_opacity;
uniform sampler2D u_mask;
uniform float u_hasMask;
void main() {
  vec3 luv = u_inv * vec3(v_uv, 1.0);
  if (luv.x < 0.0 || luv.x > 1.0 || luv.y < 0.0 || luv.y > 1.0) discard;
  vec4 c = texture2D(u_tex, luv.xy);
  float a = c.a * u_opacity;
  if (u_hasMask > 0.5) a *= texture2D(u_mask, luv.xy).r;
  gl_FragColor = vec4(c.rgb, a);
}`,

  /** flat fill, used for the document background */
  solid: `${HEAD}
uniform vec4 u_color;
void main() { gl_FragColor = u_color; }`,
}
