'use client'

import type { Interval } from '../types/chart'

interface Props {
  interval: Interval
  onChange: (interval: Interval) => void
  onResetZoom?: () => void
}

const INTERVALS: { value: Interval; label: string }[] = [
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1day', label: '1D' },
]

export default function ChartControls({ interval, onChange, onResetZoom }: Props) {
  return (
    <div className="flex items-center gap-1">
      {INTERVALS.map((tf) => {
        const active = tf.value === interval
        return (
          <button
            key={tf.value}
            onClick={() => onChange(tf.value)}
            className={`px-2.5 py-1 text-xs font-medium font-[Geist_Mono] rounded-sm transition-colors ${
              active
                ? 'bg-zinc-800 text-zinc-100 border-b-2 border-yellow-500/60'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tf.label}
          </button>
        )
      })}
      {onResetZoom && (
        <button
          onClick={onResetZoom}
          className="ml-2 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          title="Reset zoom"
        >
          &#x21ba;
        </button>
      )}
    </div>
  )
}
