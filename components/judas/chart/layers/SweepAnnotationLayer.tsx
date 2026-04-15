'use client'

import type { ScaleBand, ScaleLinear } from 'd3-scale'
import type { SweepAnnotation } from '../types/chart'

interface Props {
  annotation: SweepAnnotation | null
  xScale: ScaleBand<number>
  yScale: ScaleLinear<number, number>
  judasPhase?: string
}

export default function SweepAnnotationLayer({ annotation, xScale, yScale, judasPhase }: Props) {
  if (!annotation) return null

  const x = xScale(annotation.time)
  if (x === undefined) return null

  const bw = xScale.bandwidth()
  const cx = x + bw / 2
  const py = yScale(annotation.price)
  const isUp = annotation.direction === 'up'

  // Colors per direction
  const arrowColor = isUp ? '#10b981' : '#ef4444'
  const textColor = isUp ? '#34d399' : '#f87171'
  const boxFill = isUp ? '#052e16' : '#1a0808'
  const boxStroke = isUp ? '#10b981' : '#ef4444'

  // Arrow triangle — tip 14px above/below price
  const tipY = isUp ? py - 14 : py + 14
  const arrowPoints = isUp
    ? `${cx},${tipY} ${cx - 8},${tipY + 16} ${cx + 8},${tipY + 16}`
    : `${cx},${tipY} ${cx - 8},${tipY - 16} ${cx + 8},${tipY - 16}`

  // Label box dimensions
  const boxW = 174
  const boxH = 38
  const boxX = cx - boxW / 2
  const boxY = isUp ? tipY - 12 - boxH : tipY + 12

  // Connector: arrow tip → nearest box edge
  const connEndY = isUp ? boxY + boxH : boxY

  // Sub-label text
  const subLabel = isUp
    ? 'London swept Asian low \u00B7 Reversed'
    : 'London swept Asian high \u00B7 Reversed'

  return (
    <g
      className="sweep-annotation"
      style={{
        transformOrigin: `${cx}px ${isUp ? tipY + 16 : tipY - 16}px`,
        animation: 'sweep-in 300ms ease-out forwards',
      }}
    >
      {/* Filled triangle arrow */}
      <polygon points={arrowPoints} fill={arrowColor} />

      {/* Connector dashed line */}
      <line
        x1={cx} y1={tipY}
        x2={cx} y2={connEndY}
        stroke={arrowColor}
        strokeWidth={1.5}
        strokeDasharray="3 2"
      />

      {/* Label box */}
      <rect
        x={boxX} y={boxY}
        width={boxW} height={boxH}
        fill={boxFill}
        stroke={boxStroke}
        strokeWidth={0.8}
        rx={4}
      />
      {/* Left accent bar */}
      <rect
        x={boxX} y={boxY}
        width={3} height={boxH}
        fill={boxStroke}
        rx={2}
      />

      {/* Line 1: Judas phase */}
      <text
        x={boxX + 12} y={boxY + 15}
        fill={textColor} fontSize={9} fontWeight={500}
        fontFamily="var(--font-geist-mono), monospace"
      >
        {judasPhase ?? annotation.label}
      </text>

      {/* Line 2: contextual sub-label */}
      <text
        x={boxX + 12} y={boxY + 28}
        fill={textColor} fontSize={8} opacity={0.8}
        fontFamily="var(--font-geist-mono), monospace"
      >
        {subLabel}
      </text>
    </g>
  )
}
