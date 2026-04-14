'use client'

import type { ScaleBand } from 'd3-scale'
import type { Candle, SessionZone } from '../types/chart'

interface Props {
  zones: SessionZone[]
  candles: Candle[]
  xScale: ScaleBand<number>
  height: number
}

export default function SessionZoneLayer({ zones, candles, xScale, height }: Props) {
  if (candles.length === 0) return null

  return (
    <g className="session-zones">
      {zones.map((zone) => {
        // Find candles within this session window
        const inZone = candles.filter((c) => c.time >= zone.startTime && c.time < zone.endTime)
        if (inZone.length === 0) return null

        const firstX = xScale(inZone[0].time) ?? 0
        const lastX = xScale(inZone[inZone.length - 1].time) ?? 0
        const bw = xScale.bandwidth()
        const x = firstX
        const w = lastX - firstX + bw

        if (w <= 0) return null

        const shortLabel = zone.label === 'Asian' ? 'AS' : zone.label === 'London' ? 'LN' : 'NY'

        return (
          <g key={zone.label}>
            <rect
              x={x}
              y={0}
              width={w}
              height={height}
              fill={zone.color}
              stroke={zone.judasConfirmed ? 'rgba(234,179,8,0.4)' : 'none'}
              strokeWidth={zone.judasConfirmed ? 1.5 : 0}
            />
            <text
              x={x + 6}
              y={14}
              fill="#71717a"
              fontSize={9}
              fontFamily="var(--font-geist-mono), monospace"
            >
              {shortLabel}
            </text>
          </g>
        )
      })}
    </g>
  )
}
