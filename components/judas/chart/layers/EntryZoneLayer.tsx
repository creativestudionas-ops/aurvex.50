'use client'

import type { ScaleLinear } from 'd3-scale'
import type { EntryZone } from '../types/chart'
import type { EntrySignal } from '@/types/judas'

interface Props {
  zone: EntryZone | null
  yScale: ScaleLinear<number, number>
  chartWidth: number
  entry?: EntrySignal
}

export default function EntryZoneLayer({ zone, yScale, chartWidth, entry }: Props) {
  // Use entry signal zone when available, fall back to overlay zone
  const hasEntry = entry && entry.direction !== 'wait' && entry.entryZone !== null
  const isBuy = entry?.direction === 'buy'

  const zoneHigh = hasEntry ? entry.entryZone!.high : zone?.priceHigh
  const zoneLow = hasEntry ? entry.entryZone!.low : zone?.priceLow
  if (!zoneHigh || !zoneLow) return null

  const y = yScale(zoneHigh)
  const h = yScale(zoneLow) - y

  const zoneFill = isBuy
    ? 'rgba(16,185,129,0.15)'
    : entry?.direction === 'sell'
      ? 'rgba(239,68,68,0.12)'
      : 'rgba(16,185,129,0.15)'

  const accentColor = isBuy ? '#10b981' : entry?.direction === 'sell' ? '#ef4444' : '#10b981'
  const labelColor = isBuy ? '#34d399' : entry?.direction === 'sell' ? '#f87171' : '#34d399'

  return (
    <g className="entry-zone">
      {/* Entry zone band */}
      <rect
        x={0}
        y={y}
        width={chartWidth}
        height={h}
        fill={zoneFill}
        style={{ animation: 'entryPulse 2s ease-in-out infinite' }}
      />
      {/* Left border accent */}
      <line
        x1={0} y1={y} x2={0} y2={y + h}
        stroke={accentColor}
        strokeWidth={2}
      />
      {/* Label */}
      <text
        x={chartWidth - 8}
        y={y + h / 2 + 3}
        fill={labelColor}
        fontSize={9}
        fontFamily="var(--font-geist-mono), monospace"
        textAnchor="end"
      >
        ENTRY ZONE
      </text>

      {/* ── SL / TP lines — only when entry engine is active ── */}
      {hasEntry && entry.stopLoss !== null && (
        <g>
          {/* Stop loss line */}
          <line
            x1={0} y1={yScale(entry.stopLoss)}
            x2={chartWidth} y2={yScale(entry.stopLoss)}
            stroke="#f87171" strokeWidth={1}
            strokeDasharray="3 2" opacity={0.7}
          />
          <text
            x={chartWidth + 6} y={yScale(entry.stopLoss) + 4}
            fill="#f87171" fontSize={9}
            fontFamily="var(--font-geist-mono), monospace"
          >
            {`SL $${entry.stopLoss.toFixed(0)}`}
          </text>
        </g>
      )}

      {/* TP lines */}
      {hasEntry && entry.targets.map((tp) => {
        const tpY = yScale(tp.price)
        const isTP2 = tp.label === 'TP2'
        const tpColor =
          tp.label === 'TP1' ? '#a1a1aa'
            : isTP2 ? (isBuy ? '#34d399' : '#f87171')
              : '#52525b'
        const tpWidth = isTP2 ? 1 : 0.8

        return (
          <g key={tp.label}>
            <line
              x1={0} y1={tpY}
              x2={chartWidth} y2={tpY}
              stroke={tpColor} strokeWidth={tpWidth}
              strokeDasharray="4 3"
            />
            <text
              x={chartWidth + 6} y={tpY + 4}
              fill={tpColor}
              fontSize={isTP2 ? 10 : 9}
              fontFamily="var(--font-geist-mono), monospace"
            >
              {`${tp.label} $${tp.price.toFixed(0)}`}
            </text>
          </g>
        )
      })}

      {/* R:R annotation */}
      {hasEntry && entry.riskReward !== null && (
        <g>
          <text
            x={chartWidth + 6} y={y + h / 2 - 6}
            fill="#71717a" fontSize={8}
            fontFamily="var(--font-geist-mono), monospace"
          >
            R:R
          </text>
          <text
            x={chartWidth + 6} y={y + h / 2 + 6}
            fill={
              entry.riskReward >= 2.0 ? '#34d399'
                : entry.riskReward >= 1.5 ? '#eab308'
                  : '#ef4444'
            }
            fontSize={10}
            fontFamily="var(--font-geist-mono), monospace"
          >
            {entry.riskReward.toFixed(1)}
          </text>
        </g>
      )}
    </g>
  )
}
