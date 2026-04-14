'use client'

import type { ScaleLinear } from 'd3-scale'
import type { EntryZone } from '../types/chart'

interface Props {
  zone: EntryZone | null
  yScale: ScaleLinear<number, number>
  chartWidth: number
}

export default function EntryZoneLayer({ zone, yScale, chartWidth }: Props) {
  if (!zone) return null

  const y = yScale(zone.priceHigh)
  const h = yScale(zone.priceLow) - y

  return (
    <g className="entry-zone">
      {/* Pulsing green rectangle */}
      <rect
        x={0}
        y={y}
        width={chartWidth}
        height={h}
        fill="rgba(16,185,129,0.15)"
        style={{ animation: 'entryPulse 2s ease-in-out infinite' }}
      />
      {/* Left border accent */}
      <line
        x1={0}
        y1={y}
        x2={0}
        y2={y + h}
        stroke="#10b981"
        strokeWidth={2}
      />
      {/* Label */}
      <text
        x={chartWidth - 8}
        y={y + h / 2 + 3}
        fill="#34d399"
        fontSize={9}
        fontFamily="var(--font-geist-mono), monospace"
        textAnchor="end"
      >
        ENTRY ZONE
      </text>
    </g>
  )
}
