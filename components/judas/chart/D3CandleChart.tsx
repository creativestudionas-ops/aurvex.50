'use client'

import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { select } from 'd3-selection'
import { zoom as d3Zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom'
import type { D3ZoomEvent } from 'd3-zoom'
import { axisBottom, axisRight } from 'd3-axis'
import type { Candle, ChartOverlays } from './types/chart'
import type { JudasSignal } from '@/types/judas'
import { useD3Scale } from './hooks/useD3Scale'
import SessionZoneLayer from './layers/SessionZoneLayer'
import CandleLayer from './layers/CandleLayer'
import SMCOverlayLayer from './layers/SMCOverlayLayer'
import SweepAnnotationLayer from './layers/SweepAnnotationLayer'
import EntryZoneLayer from './layers/EntryZoneLayer'
import LivePriceLine from './layers/LivePriceLine'

interface Props {
  candles: Candle[]
  overlays: ChartOverlays
  livePrice: number | null
  signal: JudasSignal
  width: number
  height: number
  zoomRef?: React.MutableRefObject<(() => void) | null>
}

const MARGIN = { top: 8, right: 72, bottom: 28, left: 8 }
const MIN_VISIBLE = 40
const MAX_VISIBLE = 200

export default function D3CandleChart({
  candles, overlays, livePrice, signal, width, height, zoomRef,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomRef_ = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  // State-driven visible range so zoom/pan triggers re-render
  const [visibleRange, setVisibleRange] = useState<[number, number]>([
    Math.max(0, candles.length - 80),
    Math.max(0, candles.length - 1),
  ])

  // Reset range when candle count changes (new data or timeframe switch)
  useEffect(() => {
    const end = Math.max(0, candles.length - 1)
    const start = Math.max(0, end - 79)
    setVisibleRange([start, end])
  }, [candles.length])

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const { xScale, yScale } = useD3Scale(candles, innerW, innerH, visibleRange)

  const visibleCandles = useMemo(
    () => candles.slice(visibleRange[0], visibleRange[1] + 1),
    [candles, visibleRange],
  )

  // Time-duration-aware label formatting
  const formatTime = useCallback((t: number) => {
    const d = new Date(t * 1000)
    const h = d.getUTCHours().toString().padStart(2, '0')
    const m = d.getUTCMinutes().toString().padStart(2, '0')
    const mon = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
    const day = d.getUTCDate()

    // Use time span in seconds to decide format, not index count
    const [startIdx, endIdx] = visibleRange
    if (startIdx >= candles.length || endIdx >= candles.length || candles.length === 0) {
      return `${h}:${m}`
    }
    const spanSec = candles[endIdx].time - candles[startIdx].time
    // > 3 days → show dates; otherwise show times
    return spanSec > 3 * 86400 ? `${mon} ${day}` : `${h}:${m}`
  }, [visibleRange, candles])

  // Render axes with D3
  const xAxisRef = useRef<SVGGElement>(null)
  const yAxisRef = useRef<SVGGElement>(null)

  useEffect(() => {
    if (!xAxisRef.current || !yAxisRef.current) return

    const xAxis = axisBottom(xScale)
      .tickValues(
        xScale.domain().filter((_, i, arr) => {
          const step = Math.max(1, Math.floor(arr.length / 8))
          return i % step === 0
        }),
      )
      .tickFormat((t) => formatTime(t as number))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select(xAxisRef.current).call(xAxis as any)
      .call((g) => {
        g.selectAll('text').attr('fill', '#52525b').attr('font-size', 9)
        g.selectAll('line').attr('stroke', '#27272a')
        g.select('.domain').attr('stroke', '#27272a')
      })

    const yAxis = axisRight(yScale)
      .ticks(6)
      .tickFormat((d) => (d as number).toFixed(0))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select(yAxisRef.current).call(yAxis as any)
      .call((g) => {
        g.selectAll('text').attr('fill', '#71717a').attr('font-size', 9)
        g.selectAll('line').attr('stroke', '#27272a')
        g.select('.domain').attr('stroke', '#27272a')
      })
  }, [xScale, yScale, formatTime])

  // Zoom/pan behavior — updates state to trigger React re-render
  useEffect(() => {
    if (!svgRef.current || candles.length === 0) return

    const svg = select(svgRef.current)
    const totalCandles = candles.length

    const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 4])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        const t = event.transform
        const baseVisible = 80
        const visible = Math.round(
          Math.max(MIN_VISIBLE, Math.min(MAX_VISIBLE, baseVisible / t.k)),
        )
        const panShift = Math.round(-t.x / 10)
        const end = Math.min(totalCandles - 1, totalCandles - 1 + panShift)
        const start = Math.max(0, end - visible + 1)
        const clampedEnd = Math.min(end, totalCandles - 1)

        setVisibleRange((prev) => {
          if (prev[0] === start && prev[1] === clampedEnd) return prev
          return [start, clampedEnd]
        })
      })

    svg.call(zoomBehavior)
    zoomRef_.current = zoomBehavior

    if (zoomRef) {
      zoomRef.current = () => {
        svg.transition().duration(300).call(zoomBehavior.transform, zoomIdentity)
      }
    }

    return () => {
      svg.on('.zoom', null)
    }
  }, [candles.length, zoomRef])

  const priceChange = livePrice && candles.length > 0
    ? livePrice - candles[candles.length - 1].open
    : 0

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="select-none"
      style={{ overflow: 'visible' }}
    >
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        <SessionZoneLayer
          zones={overlays.sessionZones}
          candles={visibleCandles}
          xScale={xScale}
          height={innerH}
        />
        <SMCOverlayLayer
          overlays={overlays}
          candles={visibleCandles}
          xScale={xScale}
          yScale={yScale}
          chartWidth={innerW}
        />
        <CandleLayer candles={visibleCandles} xScale={xScale} yScale={yScale} />
        <EntryZoneLayer zone={overlays.entryZone} yScale={yScale} chartWidth={innerW} />
        <SweepAnnotationLayer
          annotation={overlays.sweepAnnotation}
          xScale={xScale}
          yScale={yScale}
        />
        <LivePriceLine
          price={livePrice}
          yScale={yScale}
          chartWidth={innerW}
          priceChange={priceChange}
        />
        <g ref={xAxisRef} transform={`translate(0,${innerH})`} />
        <g ref={yAxisRef} transform={`translate(${innerW},0)`} />
      </g>
    </svg>
  )
}
