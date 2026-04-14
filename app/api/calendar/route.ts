import { NextResponse } from 'next/server'

/**
 * GET /api/calendar
 *
 * Returns upcoming high/medium impact US economic events from FMP.
 * Filters for gold-relevant catalysts (Fed speeches, jobs, CPI, GDP, etc.)
 * and maps them to the Catalyst interface.
 */

export const dynamic = 'force-dynamic'

interface FMPEvent {
  date: string
  country: string
  event: string
  currency: string
  previous: number | null
  estimate: number | null
  actual: number | null
  impact: string
  unit: string
}

interface CatalystOut {
  name: string
  impact: 'high' | 'medium' | 'low'
  direction: 'up' | 'down' | 'neutral'
  note: string
  time?: string
}

// Keywords that signal gold-relevant events
const GOLD_KEYWORDS = [
  'fed', 'fomc', 'interest rate', 'cpi', 'inflation', 'ppi',
  'gdp', 'employment', 'nonfarm', 'payroll', 'jobless', 'unemployment',
  'retail sales', 'consumer confidence', 'ism', 'pmi',
  'trade balance', 'beige book', 'treasury', 'housing',
  'industrial production', 'durable goods', 'philadelphia',
]

function isGoldRelevant(event: string): boolean {
  const lower = event.toLowerCase()
  return GOLD_KEYWORDS.some((kw) => lower.includes(kw))
}

function inferDirection(event: string): 'up' | 'down' | 'neutral' {
  const lower = event.toLowerCase()
  // Fed hawkish signals tend to pressure gold
  if (lower.includes('interest rate') || lower.includes('fomc')) return 'neutral'
  // Weak economic data tends to boost gold (safe haven + rate cut expectations)
  if (lower.includes('jobless') || lower.includes('unemployment')) return 'up'
  // Strong data can pressure gold
  if (lower.includes('retail sales') || lower.includes('gdp') || lower.includes('payroll')) return 'down'
  return 'neutral'
}

function buildNote(evt: FMPEvent): string {
  const parts: string[] = []
  if (evt.estimate !== null) parts.push(`Forecast: ${evt.estimate}${evt.unit ?? ''}`)
  if (evt.previous !== null) parts.push(`Prior: ${evt.previous}${evt.unit ?? ''}`)
  if (evt.actual !== null) parts.push(`Actual: ${evt.actual}${evt.unit ?? ''}`)
  if (parts.length === 0) return 'Scheduled release \u2014 watch for USD and gold impact'
  return parts.join(' | ')
}

export async function GET() {
  try {
    const apiKey = process.env.FMP_API_KEY
    if (!apiKey) throw new Error('FMP_API_KEY not set')

    // Fetch next 3 days of events
    const now = new Date()
    const from = now.toISOString().slice(0, 10)
    const to = new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10)

    const url =
      `https://financialmodelingprep.com/stable/economic-calendar` +
      `?from=${from}&to=${to}&apikey=${apiKey}`

    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(`FMP returned ${res.status}`)

    const events = (await res.json()) as FMPEvent[]

    // Filter: US only, High/Medium impact, gold-relevant, no CFTC position reports
    const filtered = events.filter((e) =>
      e.country === 'US' &&
      (e.impact === 'High' || e.impact === 'Medium') &&
      !e.event.includes('CFTC') &&
      isGoldRelevant(e.event),
    )

    // Sort by date ascending, take top 6
    filtered.sort((a, b) => a.date.localeCompare(b.date))
    const top = filtered.slice(0, 6)

    const catalysts: CatalystOut[] = top.map((e) => ({
      name: e.event,
      impact: e.impact.toLowerCase() as 'high' | 'medium' | 'low',
      direction: inferDirection(e.event),
      note: buildNote(e),
      time: e.date.replace(' ', 'T') + 'Z',
    }))

    return NextResponse.json(catalysts)
  } catch (err) {
    console.error('[api/calendar] error:', err)
    return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 502 })
  }
}
