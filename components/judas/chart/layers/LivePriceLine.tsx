'use client'

import type { ScaleLinear } from 'd3-scale'

interface Props {
  price: number | null
  yScale: ScaleLinear<number, number>
  chartWidth: number
  priceChange: number
  priceChangePct: number
}

export default function LivePriceLine({ price, yScale, chartWidth, priceChange, priceChangePct }: Props) {
  if (price === null) return null

  const y = yScale(price)
  const isBull = priceChange >= 0
  const color = isBull ? '#34d399' : '#f87171'
  const bgColor = isBull ? '#052e16' : '#1a0808'
  const strokeColor = isBull ? '#10b981' : '#ef4444'
  const formatted = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const changeText = `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)} (${priceChangePct.toFixed(2)}%)`

  // Price pill position
  const pillW = 88
  const pillH = 34
  const pillX = chartWidth - 148
  const pillY = y - 17

  // Pulsing dot position
  const dotCX = chartWidth - 6

  return (
    <g className="live-price-line" style={{ transition: 'transform 150ms ease-out' }}>
      {/* z=10: Dashed horizontal line — full width */}
      <line
        x1={0}
        y1={y}
        x2={chartWidth}
        y2={y}
        stroke={color}
        strokeWidth={1}
        strokeDasharray="5 3"
        opacity={0.6}
      />

      {/* Pulsing dot — outer ring */}
      <circle
        cx={dotCX}
        cy={y}
        r={8}
        fill="none"
        stroke={color}
        strokeWidth={1}
        style={{
          transformBox: 'fill-box' as const,
          transformOrigin: 'center',
          animation: 'pulse-ring 1.8s ease-out infinite',
        }}
      />

      {/* Pulsing dot — inner */}
      <circle
        cx={dotCX}
        cy={y}
        r={4}
        fill={color}
        style={{
          transformBox: 'fill-box' as const,
          transformOrigin: 'center',
          animation: 'pulse-dot 1.8s ease-in-out infinite',
        }}
      />

      {/* z=11: Price pill background */}
      <rect
        x={pillX}
        y={pillY}
        width={pillW}
        height={pillH}
        fill={bgColor}
        stroke={strokeColor}
        strokeWidth={1}
        rx={5}
      />

      {/* Price text — line 1 */}
      <text
        x={pillX + pillW / 2}
        y={pillY + 15}
        fill={color}
        fontSize={13}
        fontWeight={500}
        fontFamily="var(--font-geist-mono), monospace"
        textAnchor="middle"
      >
        {formatted}
      </text>

      {/* Daily change — line 2 */}
      <text
        x={pillX + pillW / 2}
        y={pillY + 28}
        fill={color}
        fontSize={9}
        opacity={0.8}
        fontFamily="var(--font-geist-mono), monospace"
        textAnchor="middle"
      >
        {changeText}
      </text>
    </g>
  )
}
