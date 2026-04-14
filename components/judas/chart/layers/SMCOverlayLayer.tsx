'use client'

import type { ScaleBand, ScaleLinear } from 'd3-scale'
import type { Candle, ChartOverlays } from '../types/chart'

interface Props {
  overlays: ChartOverlays
  candles: Candle[]
  xScale: ScaleBand<number>
  yScale: ScaleLinear<number, number>
  chartWidth: number
}

export default function SMCOverlayLayer({ overlays, candles, xScale, yScale, chartWidth }: Props) {
  if (candles.length === 0) return null

  const bw = xScale.bandwidth()

  return (
    <g className="smc-overlay">
      {/* FVG Zones */}
      {overlays.fvgZones.map((fvg, i) => {
        const inRange = candles.filter((c) => c.time >= fvg.startTime)
        if (inRange.length === 0) return null
        const x = xScale(inRange[0].time) ?? 0
        const y = yScale(fvg.priceHigh)
        const h = yScale(fvg.priceLow) - y

        return (
          <g key={`fvg-${i}`} opacity={fvg.mitigated ? 0.3 : 1}>
            <rect
              x={x}
              y={y}
              width={chartWidth - x}
              height={h}
              fill="rgba(59,130,246,0.10)"
              stroke="#60a5fa"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text
              x={x + 4}
              y={y + 12}
              fill="#60a5fa"
              fontSize={8}
              fontFamily="var(--font-geist-mono), monospace"
              textDecoration={fvg.mitigated ? 'line-through' : undefined}
            >
              FVG
            </text>
          </g>
        )
      })}

      {/* OB Boxes */}
      {overlays.obBoxes.map((ob, i) => {
        const isBull = ob.type === 'bull'
        const inRange = candles.filter((c) => c.time >= ob.startTime)
        if (inRange.length === 0) return null
        const x = xScale(inRange[0].time) ?? 0
        const endX = ob.endTime
          ? (xScale(ob.endTime) ?? chartWidth) + bw
          : chartWidth
        const y = yScale(ob.priceHigh)
        const h = yScale(ob.priceLow) - y

        return (
          <g key={`ob-${i}`}>
            <rect
              x={x}
              y={y}
              width={endX - x}
              height={h}
              fill={isBull ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.10)'}
              stroke={isBull ? '#10b981' : '#ef4444'}
              strokeWidth={1}
              strokeDasharray="4 2"
            />
            <text
              x={x + 4}
              y={y + 12}
              fill={isBull ? '#10b981' : '#ef4444'}
              fontSize={8}
              fontFamily="var(--font-geist-mono), monospace"
            >
              OB
            </text>
          </g>
        )
      })}

      {/* Horizontal levels (BSL, SSL, SMA) */}
      {overlays.levels.map((lvl, i) => {
        const y = yScale(lvl.price)
        const color =
          lvl.type === 'BSL' ? '#f87171' :
          lvl.type === 'SSL' ? '#34d399' :
          '#71717a'
        const dash = lvl.type === 'SMA' ? undefined : '6 3'

        return (
          <g key={`lvl-${i}`}>
            <line
              x1={0}
              y1={y}
              x2={chartWidth}
              y2={y}
              stroke={color}
              strokeWidth={lvl.type === 'SMA' ? 1.5 : 1}
              strokeDasharray={dash}
            />
            <text
              x={chartWidth - 4}
              y={y - 4}
              fill={color}
              fontSize={9}
              fontFamily="var(--font-geist-mono), monospace"
              textAnchor="end"
            >
              {lvl.label}
            </text>
          </g>
        )
      })}
    </g>
  )
}
