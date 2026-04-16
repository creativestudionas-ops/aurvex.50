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

// ---------------------------------------------------------------------------
// Silver Bullet window definitions (UTC hours)
// ---------------------------------------------------------------------------
const SILVER_BULLET_WINDOWS_UTC = [
  { startHour: 3,  endHour: 4,  label: 'SB\u00b7LN' },
  { startHour: 10, endHour: 11, label: 'SB\u00b7NY' },
  { startHour: 14, endHour: 15, label: 'SB\u00b7AF' },
]

function inferIs1H(candles: Candle[]): boolean {
  if (candles.length < 2) return false
  const gap = Math.abs(candles[1].time - candles[0].time)
  return gap >= 3000 && gap <= 4200 // ~3600s = 1H
}

export default function SessionZoneLayer({ zones, candles, xScale, height }: Props) {
  if (candles.length === 0) return null

  const is1H = inferIs1H(candles)

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

      {/* Silver Bullet window markers — 1H only */}
      {is1H && SILVER_BULLET_WINDOWS_UTC.map((sbw) => {
        const windowCandles = candles.filter((c) => {
          const hour = new Date(c.time * 1000).getUTCHours()
          return hour >= sbw.startHour && hour < sbw.endHour
        })
        if (windowCandles.length === 0) return null

        const firstX = xScale(windowCandles[0].time) ?? 0
        const lastX = xScale(windowCandles[windowCandles.length - 1].time) ?? 0
        const bw = xScale.bandwidth()
        const sbX = firstX
        const sbW = lastX - firstX + bw

        if (sbW <= 0) return null

        return (
          <g key={sbw.label}>
            {/* Window background fill */}
            <rect
              x={sbX}
              y={0}
              width={sbW}
              height={height}
              fill="rgba(20,184,166,0.06)"
            />
            {/* Left dashed border */}
            <line
              x1={sbX} y1={0} x2={sbX} y2={height}
              stroke="#14b8a6" strokeWidth={0.5}
              strokeDasharray="3 3"
            />
            {/* Right dashed border */}
            <line
              x1={sbX + sbW} y1={0} x2={sbX + sbW} y2={height}
              stroke="#14b8a6" strokeWidth={0.5}
              strokeDasharray="3 3"
            />
            {/* Label */}
            <text
              x={sbX + sbW / 2}
              y={STRIP_HEIGHT + 12}
              fill="#2dd4bf"
              fontSize={8}
              fontFamily="var(--font-geist-mono), monospace"
              textAnchor="middle"
              opacity={0.8}
            >
              {sbw.label}
            </text>
          </g>
        )
      })}
    </g>
  )
}
