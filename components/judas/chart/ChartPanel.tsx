'use client'

import { useState, useRef, useEffect } from 'react'
import type { JudasSignal } from '@/types/judas'
import type { Interval } from './types/chart'
import { useChartData } from './hooks/useChartData'
import { useD3Scale } from './hooks/useD3Scale'
import { useSMCOverlays } from './hooks/useSMCOverlays'
import D3CandleChart from './D3CandleChart'
import ChartControls from './controls/ChartControls'

interface Props {
  signal: JudasSignal
}

function StaleBadge({ show }: { show: boolean | undefined }) {
  if (!show) return null
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-sm bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/30">
      &#x26A0; stale
    </span>
  )
}

export default function ChartPanel({ signal }: Props) {
  const [interval, setInterval_] = useState<Interval>('1h')
  const { candles, livePrice, loading } = useChartData(interval)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)
  const chartHeight = 480
  const zoomResetRef = useRef<(() => void) | null>(null)

  // Responsive width
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Dummy scale for overlay computation (before chart mounts)
  const dummyRange: [number, number] = [
    Math.max(0, candles.length - 80),
    Math.max(0, candles.length - 1),
  ]
  const { xScale } = useD3Scale(candles, width - 80, chartHeight - 36, dummyRange)
  const overlays = useSMCOverlays(signal, candles, xScale)

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <h2 className="font-[Cormorant] text-sm uppercase tracking-wider text-zinc-500">
            Price Action
          </h2>
          <StaleBadge show={signal.priceStale} />
        </div>
        <ChartControls
          interval={interval}
          onChange={setInterval_}
          onResetZoom={() => zoomResetRef.current?.()}
        />
      </div>

      <div
        ref={containerRef}
        className="rounded-lg border border-zinc-800 bg-zinc-900/60 overflow-hidden"
      >
        {loading && candles.length === 0 ? (
          /* Skeleton shimmer */
          <div
            className="w-full"
            style={{ height: chartHeight }}
          >
            <div
              className="h-full w-full"
              style={{
                background: 'linear-gradient(90deg, #18181b 25%, #27272a 50%, #18181b 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s infinite',
              }}
            />
          </div>
        ) : (
          <D3CandleChart
            candles={candles}
            overlays={overlays}
            livePrice={livePrice}
            signal={signal}
            width={width}
            height={chartHeight}
            zoomRef={zoomResetRef}
          />
        )}
      </div>
    </div>
  )
}
