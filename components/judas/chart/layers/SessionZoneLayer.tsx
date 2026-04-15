'use client'

import type { ScaleBand } from 'd3-scale'
import type { Candle, SessionZone } from '../types/chart'

interface Props {
  zones: SessionZone[]
  candles: Candle[]
  xScale: ScaleBand<number>
  height: number
}

const STRIP_HEIGHT = 22

const ZONE_STYLES: Record<string, {
  stripFill: string
  textFill: string
  fullName: string
  timeLabel: string
}> = {
  Asian: {
    stripFill: 'rgba(99,102,241,0.18)',
    textFill: '#818cf8',
    fullName: 'Asian',
    timeLabel: '00:00 \u2013 07:00 UTC',
  },
  London: {
    stripFill: 'rgba(180,130,20,0.22)',
    textFill: '#fbbf24',
    fullName: 'London',
    timeLabel: '07:00 \u2013 12:00 UTC',
  },
  'New York': {
    stripFill: 'rgba(16,185,129,0.15)',
    textFill: '#34d399',
    fullName: 'New York',
    timeLabel: '12:00 \u2013 21:00 UTC',
  },
}

export default function SessionZoneLayer({ zones, candles, xScale, height }: Props) {
  if (candles.length === 0) return null

  return (
    <g className="session-zones">
      {zones.map((zone) => {
        const inZone = candles.filter((c) => c.time >= zone.startTime && c.time < zone.endTime)
        if (inZone.length === 0) return null

        const firstX = xScale(inZone[0].time) ?? 0
        const lastX = xScale(inZone[inZone.length - 1].time) ?? 0
        const bw = xScale.bandwidth()
        const x = firstX
        const w = lastX - firstX + bw

        if (w <= 0) return null

        const style = ZONE_STYLES[zone.label]
        if (!style) return null

        const isLondon = zone.label === 'London'

        return (
          <g key={zone.label}>
            {/* z=0: Session zone background fill */}
            <rect
              x={x}
              y={0}
              width={w}
              height={height}
              fill={zone.color}
            />

            {/* London zone: solid gold vertical borders */}
            {isLondon && (
              <>
                <line
                  x1={x} y1={0} x2={x} y2={height}
                  stroke="#B8972A" strokeWidth={0.6}
                />
                <line
                  x1={x + w} y1={0} x2={x + w} y2={height}
                  stroke="#B8972A" strokeWidth={0.6}
                />
              </>
            )}

            {/* z=1: Header strip */}
            <rect
              x={x}
              y={0}
              width={w}
              height={STRIP_HEIGHT}
              fill={style.stripFill}
            />
            <text
              x={x + w / 2}
              y={15}
              fill={style.textFill}
              fontSize={10}
              fontWeight={500}
              fontFamily="var(--font-geist-mono), monospace"
              textAnchor="middle"
            >
              {style.fullName}
            </text>

            {/* Footer time label below x-axis */}
            <text
              x={x + w / 2}
              y={height + 13}
              fill="#52525b"
              fontSize={8}
              fontFamily="var(--font-geist-mono), monospace"
              textAnchor="middle"
            >
              {style.timeLabel}
            </text>
          </g>
        )
      })}
    </g>
  )
}
