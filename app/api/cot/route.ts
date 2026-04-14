import { NextResponse } from 'next/server'

/**
 * GET /api/cot
 *
 * Fetches CFTC Commitments of Traders data for Gold futures.
 * Uses the CFTC public API (no key required).
 * Gold futures contract code: 088691 (COMEX Gold)
 */

interface COTRow {
  report_date_as_yyyy_mm_dd: string
  comm_positions_long_all: string
  comm_positions_short_all: string
  noncomm_positions_long_all: string
  noncomm_positions_short_all: string
}

export async function GET() {
  try {
    // CFTC SODA API — Gold futures (COMMODITY EXCHANGE INC.), last 52 weeks
    const url =
      'https://publicreporting.cftc.gov/resource/jun7-fc8e.json' +
      '?$where=commodity_name=%27GOLD%27%20AND%20market_and_exchange_names%20like%20%27%25COMMODITY%20EXCHANGE%25%27' +
      '&$order=report_date_as_yyyy_mm_dd%20DESC' +
      '&$limit=52'

    const res = await fetch(url, { next: { revalidate: 86400 } }) // cache 24h
    if (!res.ok) throw new Error(`CFTC API returned ${res.status}`)

    const rows = (await res.json()) as COTRow[]
    if (rows.length === 0) throw new Error('No COT data returned')

    // Parse positions
    const parsed = rows.map((r) => {
      const commLong = parseInt(r.comm_positions_long_all ?? '0', 10)
      const commShort = parseInt(r.comm_positions_short_all ?? '0', 10)
      const specLong = parseInt(r.noncomm_positions_long_all ?? '0', 10)
      const specShort = parseInt(r.noncomm_positions_short_all ?? '0', 10)
      return {
        weekOf: r.report_date_as_yyyy_mm_dd.slice(0, 10), // "2026-04-07"
        commercialNet: commLong - commShort,
        specNet: specLong - specShort,
      }
    })

    const current = parsed[0]

    // Compute rolling 52-week percentile
    const commNets = parsed.map((p) => p.commercialNet).sort((a, b) => a - b)
    const specNets = parsed.map((p) => p.specNet).sort((a, b) => a - b)

    const commercialPctile = Math.round(
      (commNets.filter((n) => n <= current.commercialNet).length / commNets.length) * 100,
    )
    const specPctile = Math.round(
      (specNets.filter((n) => n <= current.specNet).length / specNets.length) * 100,
    )

    return NextResponse.json({
      commercialNet: current.commercialNet,
      commercialPctile,
      specNet: current.specNet,
      specPctile,
      weekOf: current.weekOf,
    })
  } catch (err) {
    console.error('[api/cot] error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch COT data' },
      { status: 502 },
    )
  }
}
