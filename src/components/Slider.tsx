type Props = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  defaultValue?: number
  onChange: (v: number) => void
}

export function Slider({ label, value, min, max, step = 1, suffix = '', defaultValue, onChange }: Props) {
  return (
    <label className="slider">
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
      />
      <input
        className="slider-num"
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number(value.toFixed(2))}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
      <span className="slider-suffix">{suffix}</span>
    </label>
  )
}
