'use client'

import { useMemo } from 'react'
import { scaleBand, scaleLinear } from 'd3-scale'
import type { ScaleBand, ScaleLinear } from 'd3-scale'
import type { Candle } from '../types/chart'

interface D3Scales {
  xScale: ScaleBand<number>
  yScale: ScaleLinear<number, number>
}

export function useD3Scale(
  candles: Candle[],
  width: number,
  height: number,
  visibleRange: [number, number],
): D3Scales {
  return useMemo(() => {
    const [startIdx, endIdx] = visibleRange
    const visible = candles.slice(startIdx, endIdx + 1)

    const domain = visible.map((c) => c.time)

    const xScale = scaleBand<number>()
      .domain(domain)
      .range([0, width])
      .paddingInner(0.2)
      .paddingOuter(0.1)

    let minPrice = Infinity
    let maxPrice = -Infinity
    for (const c of visible) {
      if (c.low < minPrice) minPrice = c.low
      if (c.high > maxPrice) maxPrice = c.high
    }

    // Add small padding to y domain
    if (minPrice === Infinity) {
      minPrice = 0
      maxPrice = 100
    }
    const pad = (maxPrice - minPrice) * 0.02
    minPrice -= pad
    maxPrice += pad

    const yScale = scaleLinear()
      .domain([minPrice, maxPrice])
      .range([height, 0]) // inverted: high prices at top

    return { xScale, yScale }
  }, [candles, width, height, visibleRange])
}
