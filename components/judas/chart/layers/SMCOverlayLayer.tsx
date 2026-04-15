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
      {/* ── z=2: OB Boxes ── */}
      {overlays.obBoxes.map((ob, i) => {
        const isBull = ob.type === 'bull'
        const inRange = candles.filter((c) => c.time >= ob.startTime)
        if (inRange.length === 0) return null
        const x = xScale(inRange[0].time) ?? 0
        const endX = ob.endTime
          ? (xScale(ob.endTime) ?? chartWidth) + bw
          : chartWidth
        const yTop = yScale(ob.priceHigh)
        const h = yScale(ob.priceLow) - yTop
        const boxW = endX - x

        const barColor = isBull ? '#10b981' : '#ef4444'
        const textColor = isBull ? '#34d399' : '#f87171'

        return (
          <g key={`ob-${i}`}>
            {/* Box fill — no dashed border */}
            <rect
              x={x} y={yTop}
              width={boxW} height={h}
              fill={isBull ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)'}
            />
            {/* Left anchor bar — 2px solid */}
            <rect
              x={x} y={yTop}
              width={2} height={h}
              fill={barColor}
            />
            {/* OB label */}
            <text
              x={x + 8} y={yTop + 18}
              fill={textColor} fontSize={9} fontWeight={500}
              fontFamily="var(--font-geist-mono), monospace"
            >
              OB
            </text>
            {/* Price range */}
            <text
              x={x + 8} y={yTop + 30}
              fill={textColor} fontSize={8} opacity={0.7}
              fontFamily="var(--font-geist-mono), monospace"
            >
              {`$${ob.priceLow.toFixed(0)}\u2013$${ob.priceHigh.toFixed(0)}`}
            </text>
          </g>
        )
      })}

      {/* ── z=3: FVG Zones ── */}
      {overlays.fvgZones.map((fvg, i) => {
        const inRange = candles.filter((c) => c.time >= fvg.startTime)
        if (inRange.length === 0) return null
        const x = xScale(inRange[0].time) ?? 0
        const yTop = yScale(fvg.priceHigh)
        const yBot = yScale(fvg.priceLow)
        const h = yBot - yTop
        const zoneW = chartWidth - x

        return (
          <g key={`fvg-${i}`} opacity={fvg.mitigated ? 0.3 : 1}>
            {/* Zone fill — no side borders */}
            <rect
              x={x} y={yTop}
              width={zoneW} height={h}
              fill="rgba(59,130,246,0.07)"
            />
            {/* Top edge dashed */}
            <line
              x1={x} y1={yTop} x2={x + zoneW} y2={yTop}
              stroke="#3b82f6" strokeWidth={0.8} strokeDasharray="4 3"
            />
            {/* Bottom edge dashed */}
            <line
              x1={x} y1={yBot} x2={x + zoneW} y2={yBot}
              stroke="#3b82f6" strokeWidth={0.8} strokeDasharray="3 3"
            />
            {/* Left-anchored pill badge */}
            <rect
              x={x + 2} y={yTop + 4}
              width={38} height={15}
              fill="rgba(59,130,246,0.2)" rx={3}
            />
            <text
              x={x + 2 + 19} y={yTop + 4 + 11}
              fill="#60a5fa" fontSize={9}
              fontFamily="var(--font-geist-mono), monospace"
              textAnchor="middle"
            >
              {fvg.mitigated ? 'FVG \u2715' : 'FVG'}
            </text>
            {/* Price range label inside zone */}
            <text
              x={x + zoneW / 2} y={yTop + h / 2 + 2}
              fill="#3b82f6" fontSize={8} opacity={0.8}
              fontFamily="var(--font-geist-mono), monospace"
              textAnchor="middle"
            >
              {`${fvg.priceLow.toFixed(0)} \u2013 ${fvg.priceHigh.toFixed(0)}`}
            </text>
          </g>
        )
      })}

      {/* ── z=4: BSL / SSL lines  &  z=5: SMA 100 ── */}
      {overlays.levels.map((lvl, i) => {
        const y = yScale(lvl.price)

        /* ── Change 2: BSL — red dashed + right-side price tag ── */
        if (lvl.type === 'BSL') {
          return (
            <g key={`lvl-${i}`}>
              <line
                x1={0} y1={y} x2={chartWidth} y2={y}
                stroke="#f87171" strokeWidth={1}
                strokeDasharray="7 4" opacity={0.85}
              />
              {/* Price tag background */}
              <rect
                x={chartWidth - 46} y={y - 10}
                width={46} height={20}
                fill="rgba(239,68,68,0.2)" rx={3}
              />
              {/* Right-pointing triangle */}
              <polygon
                points={`${chartWidth},${y} ${chartWidth - 6},${y - 4} ${chartWidth - 6},${y + 4}`}
                fill="#f87171"
              />
              {/* Label inside tag */}
              <text
                x={chartWidth - 23} y={y + 1}
                fill="#f87171" fontSize={9} fontWeight={500}
                fontFamily="var(--font-geist-mono), monospace"
                textAnchor="middle" dominantBaseline="middle"
              >
                BSL
              </text>
              {/* Price outside chart */}
              <text
                x={chartWidth + 6} y={y + 4}
                fill="#f87171" fontSize={9}
                fontFamily="var(--font-geist-mono), monospace"
              >
                {lvl.price.toFixed(0)}
              </text>
            </g>
          )
        }

        /* ── Change 3: SSL — teal dashed + right-side price tag ── */
        if (lvl.type === 'SSL') {
          return (
            <g key={`lvl-${i}`}>
              <line
                x1={0} y1={y} x2={chartWidth} y2={y}
                stroke="#2dd4bf" strokeWidth={1}
                strokeDasharray="7 4" opacity={0.85}
              />
              <rect
                x={chartWidth - 46} y={y - 10}
                width={46} height={20}
                fill="rgba(20,184,166,0.18)" rx={3}
              />
              <polygon
                points={`${chartWidth},${y} ${chartWidth - 6},${y - 4} ${chartWidth - 6},${y + 4}`}
                fill="#2dd4bf"
              />
              <text
                x={chartWidth - 23} y={y + 1}
                fill="#2dd4bf" fontSize={9} fontWeight={500}
                fontFamily="var(--font-geist-mono), monospace"
                textAnchor="middle" dominantBaseline="middle"
              >
                SSL
              </text>
              <text
                x={chartWidth + 6} y={y + 4}
                fill="#2dd4bf" fontSize={9}
                fontFamily="var(--font-geist-mono), monospace"
              >
                {lvl.price.toFixed(0)}
              </text>
            </g>
          )
        }

        /* ── Change 12: SMA 100 — solid muted line ── */
        if (lvl.type === 'SMA') {
          return (
            <g key={`lvl-${i}`}>
              <line
                x1={0} y1={y} x2={chartWidth} y2={y}
                stroke="#52525b" strokeWidth={1.5}
                opacity={0.5}
              />
              {/* Two-line stacked label */}
              <text
                x={chartWidth + 6} y={y - 2}
                fill="#52525b" fontSize={8}
                fontFamily="var(--font-geist-mono), monospace"
              >
                SMA
              </text>
              <text
                x={chartWidth + 6} y={y + 8}
                fill="#52525b" fontSize={8}
                fontFamily="var(--font-geist-mono), monospace"
              >
                100
              </text>
            </g>
          )
        }

        return null
      })}
    </g>
  )
}
