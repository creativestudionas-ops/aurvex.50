'use client'

import type { ScaleLinear } from 'd3-scale'

interface Props {
  price: number | null
  yScale: ScaleLinear<number, number>
  chartWidth: number
  priceChange: number
}

export default function LivePriceLine({ price, yScale, chartWidth, priceChange }: Props) {
  if (price === null) return null

  const y = yScale(price)
  const color = priceChange >= 0 ? '#10b981' : '#ef4444'
  const formatted = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <g className="live-price-line" style={{ transition: 'transform 150ms ease-out' }}>
      {/* Dashed horizontal line */}
      <line
        x1={0}
        y1={y}
        x2={chartWidth - 70}
        y2={y}
        stroke={color}
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.7}
      />
      {/* Dot at right edge of line */}
      <circle
        cx={chartWidth - 70}
        cy={y}
        r={3}
        fill={color}
      />
      {/* Price label */}
      <rect
        x={chartWidth - 66}
        y={y - 10}
        width={62}
        height={20}
        rx={3}
        fill={color}
      />
      <text
        x={chartWidth - 35}
        y={y + 4}
        fill="#fff"
        fontSize={11}
        fontWeight="bold"
        fontFamily="var(--font-geist-mono), monospace"
        textAnchor="middle"
      >
        {formatted}
      </text>
    </g>
  )
}
