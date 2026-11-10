/**
 * A tiny declarative parameter spec, so the same definition produces:
 *   - runtime validation
 *   - JSON Schema for LLM tool calling
 *   - slider metadata
 *
 * Deliberately not zod: two consumers, no dependency.
 */
import { t } from '../i18n'

export type ParamSpec = {
  name: string
  type: 'number' | 'string'
  enum?: string[]
  min?: number
  max?: number
  required?: boolean
  description: string
}

export type Args = Record<string, number | string>

export type Validated =
  | { ok: true; args: Args }
  | { ok: false; errors: string[] }

export function validateArgs(spec: ParamSpec[], raw: unknown): Validated {
  const errors: string[] = []
  const out: Args = {}
  const input = (raw ?? {}) as Record<string, unknown>

  for (const p of spec) {
    const v = input[p.name]
    if (v === undefined || v === null || v === '') {
      if (p.required) errors.push(t('validate.required', { name: p.name }))
      continue
    }
    if (p.type === 'number') {
      const n = typeof v === 'number' ? v : Number(v)
      if (!Number.isFinite(n)) {
        errors.push(t('validate.number', { name: p.name }))
        continue
      }
      let clamped = n
      if (p.min !== undefined) clamped = Math.max(p.min, clamped)
      if (p.max !== undefined) clamped = Math.min(p.max, clamped)
      out[p.name] = clamped
    } else {
      const s = String(v)
      if (p.enum && !p.enum.includes(s)) {
        errors.push(t('validate.enum', { name: p.name, list: p.enum.join(' / ') }))
        continue
      }
      out[p.name] = s
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, args: out }
}

export function toJsonSchema(spec: ParamSpec[]) {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const p of spec) {
    properties[p.name] = {
      type: p.type,
      description: p.description,
      ...(p.enum ? { enum: p.enum } : {}),
      ...(p.min !== undefined ? { minimum: p.min } : {}),
      ...(p.max !== undefined ? { maximum: p.max } : {}),
    }
    if (p.required) required.push(p.name)
  }
  return { type: 'object', properties, required, additionalProperties: false }
}
