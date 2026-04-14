'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Candle, Interval } from '../types/chart'

interface ChartDataResult {
  candles: Candle[]
  livePrice: number | null
  loading: boolean
  error: string | null
}

export function useChartData(interval: Interval): ChartDataResult {
  const [candles, setCandles] = useState<Candle[]>([])
  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastGood = useRef<Candle[]>([])

  const fetchCandles = useCallback(async () => {
    try {
      const res = await fetch(`/api/chart-candles?interval=${interval}&limit=200`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as Candle[]
      if (data.length > 0) {
        setCandles(data)
        lastGood.current = data
        setError(null)
      }
    } catch (err) {
      // Retain last good candle set on failure
      if (lastGood.current.length > 0) {
        setCandles(lastGood.current)
      }
      setError(err instanceof Error ? err.message : 'Failed to fetch candles')
    } finally {
      setLoading(false)
    }
  }, [interval])

  // Fetch candles on mount and every 60s
  useEffect(() => {
    setLoading(true)
    fetchCandles()
    const id = setInterval(fetchCandles, 60_000)
    return () => clearInterval(id)
  }, [fetchCandles])

  // Poll live price every 10s
  useEffect(() => {
    async function pollPrice() {
      try {
        const res = await fetch('/api/price', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { price: number }
        if (data.price > 0) setLivePrice(data.price)
      } catch {
        // silent
      }
    }
    pollPrice()
    const id = setInterval(pollPrice, 10_000)
    return () => clearInterval(id)
  }, [])

  return { candles, livePrice, loading, error }
}
