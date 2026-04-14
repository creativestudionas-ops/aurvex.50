import { NextRequest, NextResponse } from 'next/server'
import { getChartCandles } from '@/lib/judas/chartData'
import type { Interval } from '@/components/judas/chart/types/chart'

export const revalidate = 60

const VALID: Set<string> = new Set(['1h', '4h', '1day'])

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('interval') ?? '1h'
  const interval: Interval = VALID.has(raw) ? (raw as Interval) : '1h'
  const limit = Math.min(500, Math.max(10, parseInt(req.nextUrl.searchParams.get('limit') ?? '200')))

  try {
    const candles = await getChartCandles(interval, limit)
    return NextResponse.json(candles)
  } catch (err) {
    console.error('[chart-candles] failed:', err)
    return NextResponse.json([], { status: 200 })
  }
}
