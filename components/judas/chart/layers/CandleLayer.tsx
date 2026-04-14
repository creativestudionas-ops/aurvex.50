'use client'

import type { ScaleBand, ScaleLinear } from 'd3-scale'
import type { Candle } from '../types/chart'
import { isGreenCandle, candleBodyY, candleBodyHeight, wickTop, wickBottom } from '../utils/candleTransform'

interface Props {
  candles: Candle[]
  xScale: ScaleBand<number>
  yScale: ScaleLinear<number, number>
}

export default function CandleLayer({ candles, xScale, yScale }: Props) {
  const bw = xScale.bandwidth()
  const wickX = bw / 2

  return (
    <g className="candle-layer">
      {candles.map((c, i) => {
        const x = xScale(c.time)
        if (x === undefined) return null

        const green = isGreenCandle(c)
        const isDoji = Math.abs(c.close - c.open) < 0.50
        const bodyY = candleBodyY(c, yScale)
        const bodyH = candleBodyHeight(c, yScale)
        const wTop = wickTop(c, yScale)
        const wBot = wickBottom(c, yScale)

        return (
          <g
            key={c.time}
            style={{
              opacity: 1,
              animation: i === candles.length - 1 ? 'fadeIn 200ms ease-out' : undefined,
            }}
          >
            {/* Wick */}
            <line
              x1={x + wickX}
              y1={wTop}
              x2={x + wickX}
              y2={wBot}
              stroke="#71717a"
              strokeWidth={1}
            />
            {/* Body */}
            {isDoji ? (
              <line
                x1={x + 1}
                y1={yScale(c.close)}
                x2={x + bw - 1}
                y2={yScale(c.close)}
                stroke="#a1a1aa"
                strokeWidth={1.5}
              />
            ) : (
              <rect
                x={x}
                y={bodyY}
                width={bw}
                height={bodyH}
                rx={1}
                fill={green ? '#10b981' : '#ef4444'}
              />
            )}
          </g>
        )
      })}
    </g>
  )
}
