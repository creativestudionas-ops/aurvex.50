import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import path from 'path'

/**
 * GET /api/mt5/history?symbol=GOLD#&timeframe=H1&count=200
 *
 * Returns OHLCV candle data from MT5 via Python bridge script.
 */

const VALID_TF = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1']

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol') ?? 'GOLD#'
  const timeframe = request.nextUrl.searchParams.get('timeframe') ?? 'H1'
  const count = Math.min(Number(request.nextUrl.searchParams.get('count') ?? '200'), 500)

  if (!VALID_TF.includes(timeframe)) {
    return NextResponse.json({ error: `Invalid timeframe: ${timeframe}` }, { status: 400 })
  }

  try {
    const scriptsDir = path.resolve(process.cwd(), 'scripts')
    const output = execSync(
      `python "${path.join(scriptsDir, 'mt5_history.py')}" "${symbol}" "${timeframe}" ${count}`,
      { timeout: 15000, encoding: 'utf-8' },
    )
    const data = JSON.parse(output.trim()) as { candles: Array<{ time: string; open: number; high: number; low: number; close: number; volume: number }> }

    // Normalize field name: script outputs "time", price.ts expects "datetime"
    const candles = (data.candles ?? []).map((c) => ({
      datetime: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }))

    return NextResponse.json({ candles })
  } catch (err) {
    console.error('[api/mt5/history] error:', err)
    return NextResponse.json({ error: 'Failed to fetch MT5 history' }, { status: 502 })
  }
}
