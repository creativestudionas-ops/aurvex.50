'use client'

import type { ScaleBand, ScaleLinear } from 'd3-scale'
import type { SweepAnnotation } from '../types/chart'

interface Props {
  annotation: SweepAnnotation | null
  xScale: ScaleBand<number>
  yScale: ScaleLinear<number, number>
}

export default function SweepAnnotationLayer({ annotation, xScale, yScale }: Props) {
  if (!annotation) return null

  const x = xScale(annotation.time)
  if (x === undefined) return null

  const bw = xScale.bandwidth()
  const cx = x + bw / 2
  const py = yScale(annotation.price)
  const isUp = annotation.direction === 'up'
  const color = isUp ? '#10b981' : '#ef4444'

  // Arrow pointing up or down
  const arrowSize = 10
  const tipY = isUp ? py - arrowSize - 4 : py + arrowSize + 4
  const baseY = isUp ? py - 4 : py + 4
  const arrowPath = isUp
    ? `M${cx},${tipY} L${cx - 5},${baseY} L${cx + 5},${baseY} Z`
    : `M${cx},${tipY} L${cx - 5},${baseY} L${cx + 5},${baseY} Z`

  // Label position
  const labelY = isUp ? tipY - 8 : tipY + 16

  return (
    <g
      className="sweep-annotation"
      style={{ animation: 'scaleIn 300ms ease-out' }}
    >
      <path d={arrowPath} fill={color} />
      {/* Label background */}
      <rect
        x={cx - 70}
        y={labelY - 12}
        width={140}
        height={18}
        rx={3}
        fill="#18181b"
        stroke="rgba(234,179,8,0.5)"
        strokeWidth={1}
      />
      <text
        x={cx}
        y={labelY}
        fill="#e4e4e7"
        fontSize={10}
        fontFamily="var(--font-geist-mono), monospace"
        textAnchor="middle"
      >
        {annotation.label}
      </text>
    </g>
  )
}
