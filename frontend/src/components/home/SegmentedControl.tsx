import { type ReactNode } from 'react'

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  labels?: Partial<Record<T, ReactNode>>
}) {
  return (
    <div className="flex rounded-md bg-muted">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`flex-1 py-2.5 rounded-md text-sm transition-all ${
            value === opt
              ? 'bg-card text-foreground font-semibold shadow-sm'
              : 'text-muted-foreground font-medium'
          }`}
        >
          {labels?.[opt] ?? opt}
        </button>
      ))}
    </div>
  )
}
