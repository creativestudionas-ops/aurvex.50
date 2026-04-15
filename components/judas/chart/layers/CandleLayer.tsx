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
  const bodyWidth = bw * 0.70
  const bodyOffset = bw * 0.15

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
        const bodyX = x + bodyOffset
        const wickCX = bodyX + bodyWidth / 2

        return (
          <g
            key={c.time}
            style={{
              opacity: 1,
              animation: i === candles.length - 1 ? 'fadeIn 200ms ease-out' : undefined,
            }}
          >
            {/* z=6: Wick — 1px max, muted color */}
            <line
              x1={wickCX}
              y1={wTop}
              x2={wickCX}
              y2={wBot}
              stroke="#52525b"
              strokeWidth={1}
              opacity={0.6}
            />
            {/* z=7: Body */}
            {isDoji ? (
              <line
                x1={bodyX}
                y1={yScale(c.close)}
                x2={bodyX + bodyWidth}
                y2={yScale(c.close)}
                stroke="#a1a1aa"
                strokeWidth={1.5}
              />
            ) : (
              <rect
                x={bodyX}
                y={bodyY}
                width={bodyWidth}
                height={bodyH}
                rx={1}
                fill={green ? '#34d399' : '#ef4444'}
              />
            )}
          </g>
        )
      })}
    </g>
  )
}
