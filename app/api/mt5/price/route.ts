import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import path from 'path'

/**
 * GET /api/mt5/price?symbol=GOLD#
 *
 * Returns live bid price + daily change from MT5 via Python bridge scripts.
 */

interface MT5Tick {
  symbol: string
  bid: number
  ask: number
  spread: number
  time: string
}

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol') ?? 'GOLD#'
  const scriptsDir = path.resolve(process.cwd(), 'scripts')

  try {
    // Fetch live tick
    const tickOutput = execSync(`python "${path.join(scriptsDir, 'mt5_price.py')}" "${symbol}"`, {
      timeout: 8000,
      encoding: 'utf-8',
    })
    const tick: MT5Tick = JSON.parse(tickOutput.trim())
    if ('error' in tick) throw new Error(String(tick.error))

    // Fetch yesterday's close for daily change calc
    const closeOutput = execSync(`python "${path.join(scriptsDir, 'mt5_daily_close.py')}" "${symbol}"`, {
      timeout: 8000,
      encoding: 'utf-8',
    })
    const { close: dailyClose } = JSON.parse(closeOutput.trim()) as { close: number }

    const ch = Math.round((tick.bid - dailyClose) * 100) / 100
    const chp = dailyClose > 0 ? Math.round((ch / dailyClose) * 10000) / 100 : 0

    return NextResponse.json({ price: tick.bid, ch, chp })
  } catch (err) {
    console.error('[api/mt5/price] error:', err)
    return NextResponse.json({ error: 'Failed to fetch MT5 price' }, { status: 502 })
  }
}
