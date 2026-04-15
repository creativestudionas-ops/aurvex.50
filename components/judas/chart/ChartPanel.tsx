'use client'

import { useState, useRef, useEffect } from 'react'
import type { JudasSignal } from '@/types/judas'
import type { Interval } from './types/chart'
import { useChartData } from './hooks/useChartData'
import { useD3Scale } from './hooks/useD3Scale'
import { useSMCOverlays } from './hooks/useSMCOverlays'
import D3CandleChart from './D3CandleChart'

interface Props {
  signal: JudasSignal
}

const INTERVALS: { value: Interval; label: string }[] = [
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1day', label: '1D' },
]

function StaleBadge({ show }: { show: boolean | undefined }) {
  if (!show) return null
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-sm bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/30">
      &#x26A0; stale
    </span>
  )
}

/* ── Legend definitions ── */
interface LegendSquare { label: string; type: 'square'; fill: string; border: string }
interface LegendLine   { label: string; type: 'line-solid' | 'line-dashed'; color: string }
type LegendItem = LegendSquare | LegendLine

const LEGEND_ITEMS: LegendItem[] = [
  { label: 'Asian session',    type: 'square',      fill: 'rgba(99,102,241,0.4)',  border: '#818cf8' },
  { label: 'London session',   type: 'square',      fill: 'rgba(180,130,20,0.35)', border: '#B8972A' },
  { label: 'New York session', type: 'square',      fill: 'rgba(16,185,129,0.25)', border: '#10b981' },
  { label: 'Bull OB',          type: 'line-solid',  color: '#34d399' },
  { label: 'FVG',              type: 'line-dashed', color: '#3b82f6' },
  { label: 'BSL',              type: 'line-dashed', color: '#f87171' },
  { label: 'SSL',              type: 'line-dashed', color: '#2dd4bf' },
  { label: 'SMA 100',          type: 'line-solid',  color: '#52525b' },
]

export default function ChartPanel({ signal }: Props) {
  const [interval, setInterval_] = useState<Interval>('4h')
  const { candles, livePrice, loading } = useChartData(interval)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)
  const chartHeight = width < 640 ? 320 : 480
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

  // Dummy scale for overlay computation
  const dummyRange: [number, number] = [
    Math.max(0, candles.length - 80),
    Math.max(0, candles.length - 1),
  ]
  const { xScale } = useD3Scale(candles, width - 80, chartHeight - 36, dummyRange)
  const overlays = useSMCOverlays(signal, candles, xScale)

  // Price data for header
  const displayPrice = livePrice ?? signal.price
  const priceChange = signal.priceChange
  const priceChangePct = signal.priceChangePct
  const isBull = priceChange >= 0
  const priceColor = isBull ? '#34d399' : '#f87171'
  const changeText = `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)} (${priceChangePct.toFixed(2)}%)`
  const activeLabel = INTERVALS.find((tf) => tf.value === interval)?.label ?? '4H'

  return (
    <div className="mb-6">
      {/* ── Change 10: Chart Header Bar ── */}
      <div className="flex items-center justify-between mb-3 px-1">
        {/* Left side */}
        <div className="flex items-center gap-3">
          <h2
            style={{ fontFamily: 'var(--font-cormorant), serif', fontSize: 17, fontWeight: 500 }}
            className="text-zinc-200"
          >
            Price Action
          </h2>
          <StaleBadge show={signal.priceStale} />
          <span
            className="rounded-sm border px-1.5 py-0.5"
            style={{
              fontFamily: 'var(--font-geist-mono), monospace',
              fontSize: 10,
              color: '#71717a',
              backgroundColor: '#27272a',
              borderColor: '#3f3f46',
            }}
          >
            XAU/USD
          </span>
          <span
            style={{
              fontFamily: 'var(--font-geist-mono), monospace',
              fontSize: 10,
              color: '#71717a',
            }}
          >
            {activeLabel}
          </span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <span
            style={{
              fontFamily: 'var(--font-geist-mono), monospace',
              fontSize: 12,
              fontWeight: 500,
              color: priceColor,
            }}
          >
            {displayPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-geist-mono), monospace',
              fontSize: 11,
              color: priceColor,
            }}
          >
            {changeText}
          </span>

          {/* Vertical divider */}
          <div style={{ width: 0.5, height: 14, backgroundColor: '#3f3f46' }} />

          {/* Timeframe buttons */}
          <div className="flex items-center gap-1">
            {INTERVALS.map((tf) => {
              const active = tf.value === interval
              return (
                <button
                  key={tf.value}
                  onClick={() => setInterval_(tf.value)}
                  className="px-2.5 py-1 rounded-sm transition-colors"
                  style={{
                    fontFamily: 'var(--font-geist-mono), monospace',
                    fontSize: 10,
                    backgroundColor: active ? '#1c1a12' : 'transparent',
                    color: active ? '#fbbf24' : '#71717a',
                    border: `1px solid ${active ? '#B8972A' : '#3f3f46'}`,
                    borderBottom: active ? '1.5px solid #B8972A' : undefined,
                  }}
                >
                  {tf.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Chart container + legend inside rounded wrapper */}
      <div
        ref={containerRef}
        className="rounded-lg border border-zinc-800 bg-zinc-900/60 overflow-hidden"
      >
        {loading && candles.length === 0 ? (
          <div className="w-full" style={{ height: chartHeight }}>
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

        {/* ── Change 9: Legend Bar ── */}
        <div
          className="flex items-center gap-5 flex-wrap"
          style={{
            padding: '10px 16px',
            backgroundColor: '#111114',
            borderTop: '0.5px solid #27272a',
          }}
        >
          {LEGEND_ITEMS.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              {item.type === 'square' && (
                <div
                  style={{
                    width: 10,
                    height: 10,
                    backgroundColor: (item as LegendSquare).fill,
                    border: `1px solid ${(item as LegendSquare).border}`,
                    borderRadius: 1,
                  }}
                />
              )}
              {item.type === 'line-solid' && (
                <div
                  style={{
                    width: 12,
                    height: 2,
                    backgroundColor: (item as LegendLine).color,
                  }}
                />
              )}
              {item.type === 'line-dashed' && (
                <svg width={12} height={2}>
                  <line
                    x1={0} y1={1} x2={12} y2={1}
                    stroke={(item as LegendLine).color}
                    strokeWidth={1}
                    strokeDasharray="3 2"
                  />
                </svg>
              )}
              <span
                style={{
                  fontFamily: 'var(--font-geist-mono), monospace',
                  fontSize: 10,
                  color: '#a1a1aa',
                }}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
