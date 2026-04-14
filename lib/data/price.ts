/**
 * Price data — wired to MT5 via internal API routes.
 *
 * The MT5 MCP server runs alongside Claude Code. These functions call
 * internal Next.js API routes that proxy to MT5 for live price + candle data.
 * In production, swap the base URL to your deployed MT5 bridge.
 */

export interface LivePrice {
  price: number
  ch: number
  chp: number
}

export interface Candle {
  datetime: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
const SYMBOL = 'GOLD#'

/** Fetch live XAU/USD spot price from MT5. */
export async function getLivePrice(): Promise<LivePrice> {
  const res = await fetch(`${BASE}/api/mt5/price?symbol=${encodeURIComponent(SYMBOL)}`, {
    next: { revalidate: 30 },
  })
  if (!res.ok) throw new Error(`MT5 price API returned ${res.status}`)
  const data = await res.json() as LivePrice
  return data
}

/** Map interval names to MT5 timeframe codes. */
const TF_MAP: Record<string, string> = {
  '1h': 'H1',
  '4h': 'H4',
  '1day': 'D1',
}

/** Fetch OHLCV candles from MT5 history. */
export async function getCandles(
  interval: '1h' | '4h' | '1day',
  count = 200,
): Promise<Candle[]> {
  const tf = TF_MAP[interval] ?? 'H1'
  const res = await fetch(
    `${BASE}/api/mt5/history?symbol=${encodeURIComponent(SYMBOL)}&timeframe=${tf}&count=${count}`,
    { next: { revalidate: 60 } },
  )
  if (!res.ok) throw new Error(`MT5 history API returned ${res.status}`)
  const data = await res.json() as { candles: Candle[] }
  return data.candles
}
