import { NextResponse } from 'next/server'

/**
 * GET /api/macro
 *
 * Returns DXY and US 10Y yield with 1-day changes.
 * Sources: Treasury.gov CSV (10Y, no key), FRED API (DXY, key optional).
 * Falls back gracefully if either source is unavailable.
 */

export const dynamic = 'force-dynamic'

interface MacroResult {
  dxy: number
  dxyChange: number
  us10y: number
  us10yChange: number
}

export async function GET() {
  const result: MacroResult = { dxy: 0, dxyChange: 0, us10y: 0, us10yChange: 0 }
  let hasData = false

  // --- 10Y Yield from Treasury.gov (no API key needed) ---
  try {
    const year = new Date().getFullYear()
    const url =
      `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all` +
      '?type=daily_treasury_yield_curve&field_tdr_date_value=' + year + '&page&_format=csv'

    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(`Treasury CSV returned ${res.status}`)

    const text = await res.text()
    const lines = text.trim().split('\n')
    // Header: Date,"1 Mo","1.5 Month","2 Mo","3 Mo","4 Mo","6 Mo","1 Yr","2 Yr","3 Yr","5 Yr","7 Yr","10 Yr","20 Yr","30 Yr"
    // 10Y is column index 12 (0-based)
    if (lines.length >= 3) {
      const header = lines[0].split(',')
      const tenYrIdx = header.findIndex((h) => h.replace(/"/g, '').trim() === '10 Yr')
      const idx = tenYrIdx >= 0 ? tenYrIdx : 12

      const parseLine = (line: string): number => {
        const cols = line.split(',')
        const val = parseFloat(cols[idx]?.replace(/"/g, '') ?? '')
        return isNaN(val) ? 0 : val
      }

      const current = parseLine(lines[1])
      const previous = parseLine(lines[2])

      if (current > 0) {
        result.us10y = current
        result.us10yChange = Math.round((current - previous) * 100) / 100
        hasData = true
      }
    }
  } catch (err) {
    console.error('[api/macro] Treasury 10Y error:', err)
  }

  // --- DXY from FRED (requires API key) ---
  try {
    const apiKey = process.env.FRED_API_KEY
    if (!apiKey) throw new Error('FRED_API_KEY not set')

    const url =
      'https://api.stlouisfed.org/fred/series/observations?series_id=DTWEXBGS' +
      '&sort_order=desc&limit=10&file_type=json&api_key=' + apiKey

    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(`FRED DXY returned ${res.status}`)

    const json = await res.json() as { observations: Array<{ value: string }> }
    const valid = json.observations.filter((o) => o.value !== '.')
    if (valid.length >= 2) {
      const current = parseFloat(valid[0].value)
      const previous = parseFloat(valid[1].value)
      result.dxy = current
      result.dxyChange = Math.round((current - previous) * 100) / 100
      hasData = true
    }
  } catch (err) {
    console.error('[api/macro] FRED DXY error:', err)
    // DXY unavailable without FRED key — not critical, dashboard still works
  }

  if (!hasData) {
    return NextResponse.json({ error: 'No macro data available' }, { status: 502 })
  }

  return NextResponse.json(result)
}
