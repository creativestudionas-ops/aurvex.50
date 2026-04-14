import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import path from 'path'

/**
 * GET /api/price
 *
 * Lightweight endpoint for client-side polling.
 * Returns { price, ch, chp } from MT5 with no caching.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const scriptsDir = path.resolve(process.cwd(), 'scripts')

    const tickOut = execSync(
      `python "${path.join(scriptsDir, 'mt5_price.py')}" "GOLD#"`,
      { timeout: 8000, encoding: 'utf-8' },
    )
    const tick = JSON.parse(tickOut.trim()) as { bid: number; error?: string }
    if (tick.error) throw new Error(tick.error)

    const closeOut = execSync(
      `python "${path.join(scriptsDir, 'mt5_daily_close.py')}" "GOLD#"`,
      { timeout: 8000, encoding: 'utf-8' },
    )
    const { close } = JSON.parse(closeOut.trim()) as { close: number }

    const ch = Math.round((tick.bid - close) * 100) / 100
    const chp = close > 0 ? Math.round((ch / close) * 10000) / 100 : 0

    return NextResponse.json(
      { price: tick.bid, ch, chp },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    console.error('[api/price] error:', err)
    return NextResponse.json({ error: 'MT5 unavailable' }, { status: 502 })
  }
}
