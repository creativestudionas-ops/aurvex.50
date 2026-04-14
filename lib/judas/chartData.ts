import { getCandles } from '@/lib/data/price'
import type { Candle, Interval } from '@/components/judas/chart/types/chart'

/**
 * Fetch candles from MT5 and transform to the chart Candle shape.
 * Returns empty array on failure — caller handles gracefully.
 */
export async function getChartCandles(
  interval: Interval,
  limit: number = 200,
): Promise<Candle[]> {
  try {
    const raw = await getCandles(interval, limit)

    const candles: Candle[] = raw.map((r) => ({
      time: Math.floor(new Date(r.datetime).getTime() / 1000),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
    }))

    // Sort ascending by time
    candles.sort((a, b) => a.time - b.time)

    return candles
  } catch (err) {
    console.error('[chartData] getChartCandles failed:', err)
    return []
  }
}
