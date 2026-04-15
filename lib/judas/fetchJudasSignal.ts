import type {
  JudasSignal,
  SessionData,
  SMCLevel,
  COTData,
  MacroData,
  SignalGrade,
  JudasFactor,
  SessionDirection,
  CandleWarning,
} from '@/types/judas'
import { getLivePrice, getCandles } from '@/lib/data/price'
import type { Candle } from '@/lib/data/price'
import { computeScore } from '@/lib/judas/grades'
import type { ScoreInput } from '@/lib/judas/grades'
import { mockSignal } from '@/lib/judas/mockSignal'
import { detect4HWarnings } from '@/lib/judas/exhaustionDetector'
import { deriveTradeScenarios } from '@/lib/judas/tradeScenarios'

// ---------------------------------------------------------------------------
// Cache layer — holds last-known-good values for graceful degradation
// ---------------------------------------------------------------------------
const cache: Partial<{
  price: { price: number; priceChange: number; priceChangePct: number }
  sessions: [SessionData, SessionData, SessionData]
  judasPhase: string
  sessionBias: string
  levels: SMCLevel[]
  cot: COTData
  macro: MacroData
  score: { score: number; grade: SignalGrade; factors: JudasFactor[] }
}> = {}

function log(source: string, error: unknown): void {
  console.error('[judas] source failed:', source, error)
}

// ---------------------------------------------------------------------------
// 1. Spot price
// ---------------------------------------------------------------------------
async function fetchSpotPrice(): Promise<{
  price: number
  priceChange: number
  priceChangePct: number
  stale: boolean
}> {
  try {
    const live = await getLivePrice()
    const result = { price: live.price, priceChange: live.ch, priceChangePct: live.chp }
    cache.price = result
    return { ...result, stale: false }
  } catch (err) {
    log('spotPrice', err)
    const fallback = cache.price ?? {
      price: mockSignal.price,
      priceChange: mockSignal.priceChange,
      priceChangePct: mockSignal.priceChangePct,
    }
    return { ...fallback, stale: true }
  }
}

// ---------------------------------------------------------------------------
// 2. Session candles + Judas chain
// ---------------------------------------------------------------------------
function hourOfCandle(candle: Candle): number {
  return new Date(candle.datetime).getUTCHours()
}

function sessionWindow(
  candles: Candle[],
  startHour: number,
  endHour: number,
): { high: number; low: number; filtered: Candle[] } {
  const filtered = candles.filter((c) => {
    const h = hourOfCandle(c)
    return h >= startHour && h < endHour
  })
  if (filtered.length === 0) {
    return { high: 0, low: 0, filtered: [] }
  }
  const high = Math.max(...filtered.map((c) => c.high))
  const low = Math.min(...filtered.map((c) => c.low))
  return { high, low, filtered }
}

function detectJudasSweep(
  asianHigh: number,
  asianLow: number,
  londonHigh: number,
  londonLow: number,
  londonClose: number,
): { swept: 'high' | 'low' | null; reversed: boolean } {
  const sweptLow = londonLow < asianLow
  const sweptHigh = londonHigh > asianHigh

  if (sweptLow && londonClose > asianHigh) {
    return { swept: 'low', reversed: true }
  }
  if (sweptHigh && londonClose < asianLow) {
    return { swept: 'high', reversed: true }
  }
  if (sweptLow) return { swept: 'low', reversed: false }
  if (sweptHigh) return { swept: 'high', reversed: false }
  return { swept: null, reversed: false }
}

function deriveDirection(high: number, low: number, close: number, open: number): SessionDirection {
  const range = high - low
  if (range < 5) return 'neutral'
  return close > open ? 'bullish' : close < open ? 'bearish' : 'neutral'
}

async function fetchSessions(): Promise<{
  sessions: [SessionData, SessionData, SessionData]
  judasPhase: string
  sessionBias: string
  stale: boolean
}> {
  try {
    const candles1h = await getCandles('1h', 200)

    // Today's candles (last ~24h worth)
    const now = new Date()
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    )
    const todayCandles = candles1h.filter((c) => new Date(c.datetime) >= todayStart)

    const asian = sessionWindow(todayCandles, 0, 7)
    const london = sessionWindow(todayCandles, 7, 12)
    const ny = sessionWindow(todayCandles, 12, 21)

    const asianFirst = asian.filtered[0]
    const asianLast = asian.filtered[asian.filtered.length - 1]
    const londonLast = london.filtered[london.filtered.length - 1]
    const nyLast = ny.filtered[ny.filtered.length - 1]

    // Detect Judas sweep
    const judas = asian.high > 0 && london.high > 0
      ? detectJudasSweep(
          asian.high,
          asian.low,
          london.high,
          london.low,
          londonLast?.close ?? london.high,
        )
      : { swept: null as 'high' | 'low' | null, reversed: false }

    const judasConfirmed = judas.swept !== null && judas.reversed

    // Judas phase
    let judasPhase: string
    if (judas.swept === 'low' && judas.reversed) {
      judasPhase = 'Post-sweep \u00b7 long bias'
    } else if (judas.swept === 'high' && judas.reversed) {
      judasPhase = 'Post-sweep \u00b7 short bias'
    } else {
      judasPhase = 'Pre-sweep \u00b7 watching'
    }

    // Determine current session
    const currentHour = now.getUTCHours()

    // Session data
    const asianDir = asianFirst && asianLast
      ? deriveDirection(asian.high, asian.low, asianLast.close, asianFirst.open)
      : 'neutral' as SessionDirection

    const londonDir = london.filtered.length > 0
      ? deriveDirection(london.high, london.low, londonLast?.close ?? 0, london.filtered[0].open)
      : 'neutral' as SessionDirection

    const nyDir = ny.filtered.length > 0
      ? deriveDirection(ny.high, ny.low, nyLast?.close ?? 0, ny.filtered[0].open)
      : 'neutral' as SessionDirection

    const sessions: [SessionData, SessionData, SessionData] = [
      {
        label: 'Asian',
        high: asian.high || mockSignal.sessions[0].high,
        low: asian.low || mockSignal.sessions[0].low,
        status: currentHour >= 7 ? 'closed' : currentHour >= 0 ? 'active' : 'consolidation',
        direction: asianDir,
        note: asian.high > 0
          ? `Range $${(asian.high - asian.low).toFixed(2)} \u2014 ${asianDir === 'neutral' ? 'consolidation' : asianDir + ' bias'}`
          : 'No data',
        judasConfirmed: false,
      },
      {
        label: 'London',
        high: london.high || mockSignal.sessions[1].high,
        low: london.low || mockSignal.sessions[1].low,
        status: judasConfirmed
          ? 'judas_confirmed'
          : currentHour >= 12
            ? 'closed'
            : currentHour >= 7
              ? 'active'
              : 'consolidation',
        direction: londonDir,
        note: judasConfirmed
          ? `Swept Asian ${judas.swept === 'low' ? 'low' : 'high'} \u2192 reversed`
          : london.high > 0
            ? `Range $${(london.high - london.low).toFixed(2)}`
            : 'No data',
        judasConfirmed,
      },
      {
        label: 'New York',
        high: ny.high || mockSignal.sessions[2].high,
        low: ny.low || mockSignal.sessions[2].low,
        status: currentHour >= 21 ? 'closed' : currentHour >= 12 ? 'active' : 'consolidation',
        direction: nyDir,
        note: ny.high > 0
          ? `Range $${(ny.high - ny.low).toFixed(2)} \u2014 ${nyDir === 'neutral' ? 'ranging' : nyDir + ' continuation'}`
          : 'Awaiting open',
        judasConfirmed: false,
      },
    ]

    // Session bias
    let sessionBias: string
    if (judasConfirmed && judas.swept === 'low') {
      sessionBias = 'Long continuation'
    } else if (judasConfirmed && judas.swept === 'high') {
      sessionBias = 'Short continuation'
    } else if (londonDir !== asianDir && londonDir !== 'neutral') {
      sessionBias = 'Reversal watch'
    } else {
      sessionBias = 'Ranging'
    }

    cache.sessions = sessions
    cache.judasPhase = judasPhase
    cache.sessionBias = sessionBias

    return { sessions, judasPhase, sessionBias, stale: false }
  } catch (err) {
    log('sessions', err)
    return {
      sessions: cache.sessions ?? mockSignal.sessions,
      judasPhase: cache.judasPhase ?? mockSignal.judasPhase,
      sessionBias: cache.sessionBias ?? mockSignal.sessionBias,
      stale: true,
    }
  }
}

// ---------------------------------------------------------------------------
// 3. SMC levels
// ---------------------------------------------------------------------------
function findEqualHighs(candles: Candle[], tolerance = 5): SMCLevel | null {
  const recent = candles.slice(-20)
  const highs = recent.map((c) => c.high).sort((a, b) => b - a)
  for (let i = 0; i < highs.length - 1; i++) {
    if (Math.abs(highs[i] - highs[i + 1]) <= tolerance) {
      const bslPrice = (highs[i] + highs[i + 1]) / 2
      return {
        name: 'BSL \u2014 Equal Highs',
        type: 'BSL',
        price: Math.round(bslPrice * 100) / 100,
        description: `Equal highs within $${tolerance} in last 20 candles \u2014 buy stops above`,
        direction: 'up',
        active: false, // will be set based on current price
      }
    }
  }
  return null
}

function findBullishOB(candles: Candle[]): SMCLevel | null {
  const recent = candles.slice(-50)
  for (let i = recent.length - 4; i >= 0; i--) {
    // Look for 3+ bullish candles with $20+ total move
    let bullishCount = 0
    let moveStart = recent[i + 1]?.open ?? 0
    let moveEnd = 0
    for (let j = i + 1; j < recent.length && j <= i + 6; j++) {
      if (recent[j].close > recent[j].open) {
        bullishCount++
        moveEnd = recent[j].close
      } else {
        break
      }
    }
    if (bullishCount >= 3 && moveEnd - moveStart >= 20) {
      // The bearish candle before the impulse
      const ob = recent[i]
      if (ob.close < ob.open) {
        return {
          name: 'Bullish OB (1H)',
          type: 'OB_bull',
          price: Math.round(((ob.high + ob.low) / 2) * 100) / 100,
          priceHigh: Math.round(ob.high * 100) / 100,
          priceLow: Math.round(ob.low * 100) / 100,
          description: `Last bearish candle before ${bullishCount}-candle impulse (+$${(moveEnd - moveStart).toFixed(0)} move)`,
          direction: 'up',
          active: true,
        }
      }
    }
  }
  return null
}

function findFVG(candles: Candle[]): SMCLevel | null {
  const recent = candles.slice(-30)
  for (let i = recent.length - 3; i >= 0; i--) {
    const gapLow = recent[i + 2]?.low ?? 0
    const gapHigh = recent[i]?.high ?? 0
    if (gapLow > gapHigh) {
      return {
        name: 'FVG (4H)',
        type: 'FVG',
        price: Math.round(((gapLow + gapHigh) / 2) * 100) / 100,
        priceHigh: Math.round(gapLow * 100) / 100,
        priceLow: Math.round(gapHigh * 100) / 100,
        description: 'Unmitigated fair value gap \u2014 potential retest magnet',
        direction: 'up',
        active: true,
      }
    }
  }
  return null
}

function computeSMA(candles: Candle[], period = 100): number {
  const closes = candles.slice(-period).map((c) => c.close)
  if (closes.length === 0) return 0
  return Math.round((closes.reduce((s, c) => s + c, 0) / closes.length) * 100) / 100
}

async function fetchSMCLevels(
  currentPrice: number,
  londonLow: number,
): Promise<{ levels: SMCLevel[]; stale: boolean }> {
  try {
    const [candles1h, candles4h, candlesDaily] = await Promise.all([
      getCandles('1h', 200),
      getCandles('4h', 200),
      getCandles('1day', 200),
    ])

    const levels: SMCLevel[] = []

    // BSL
    const bsl = findEqualHighs(candles1h)
    if (bsl) {
      bsl.active = currentPrice > 0 && bsl.price - currentPrice <= 30 && bsl.price > currentPrice
      levels.push(bsl)
    }

    // Bullish OB
    const ob = findBullishOB(candles1h)
    if (ob) levels.push(ob)

    // FVG
    const fvg = findFVG(candles4h)
    if (fvg) levels.push(fvg)

    // SSL swept
    if (londonLow > 0) {
      levels.push({
        name: 'SSL Swept \u2014 London Low',
        type: 'SSL',
        price: Math.round(londonLow * 100) / 100,
        description: 'Prior session low \u2014 sell stops cleared if price dipped below and recovered',
        direction: 'up',
        active: currentPrice > londonLow,
      })
    }

    // 100-day SMA
    const sma = computeSMA(candlesDaily, 100)
    if (sma > 0) {
      levels.push({
        name: '100-Day SMA',
        type: 'SMA',
        price: sma,
        description: `Dynamic support \u2014 price ${currentPrice > sma ? `$${(currentPrice - sma).toFixed(0)} above` : `$${(sma - currentPrice).toFixed(0)} below`}`,
        direction: 'neutral',
        active: false,
      })
    }

    cache.levels = levels
    return { levels, stale: false }
  } catch (err) {
    log('smcLevels', err)
    return { levels: cache.levels ?? mockSignal.levels, stale: true }
  }
}

// ---------------------------------------------------------------------------
// 4. COT data
// ---------------------------------------------------------------------------
async function fetchCOT(): Promise<{ cot: COTData; stale: boolean }> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/cot`, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(`COT API returned ${res.status}`)
    const data = await res.json() as {
      commercialNet: number
      specNet: number
      commercialPctile: number
      specPctile: number
      weekOf: string
    }
    const cot: COTData = {
      commercialNet: data.commercialNet,
      commercialPctile: data.commercialPctile,
      specNet: data.specNet,
      specPctile: data.specPctile,
      weekOf: data.weekOf,
    }
    cache.cot = cot
    return { cot, stale: false }
  } catch (err) {
    log('cot', err)
    return { cot: cache.cot ?? { ...mockSignal.cot, stale: true }, stale: true }
  }
}

// ---------------------------------------------------------------------------
// 5. Macro data (Treasury.gov + FRED via /api/macro)
// ---------------------------------------------------------------------------
async function fetchMacro(): Promise<{ macro: MacroData; stale: boolean }> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/macro`, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(`Macro API returned ${res.status}`)
    const data = await res.json() as {
      dxy: number
      dxyChange: number
      us10y: number
      us10yChange: number
    }
    const macro: MacroData = {
      dxy: data.dxy,
      dxyChange: data.dxyChange,
      us10y: data.us10y,
      us10yChange: data.us10yChange,
      // Mark stale if DXY is missing (no FRED key) but 10Y is available
      stale: data.dxy === 0 ? true : undefined,
    }
    cache.macro = macro
    return { macro, stale: data.dxy === 0 }
  } catch (err) {
    log('macro', err)
    return { macro: cache.macro ?? { ...mockSignal.macro, stale: true }, stale: true }
  }
}

// ---------------------------------------------------------------------------
// 6. Catalysts (FMP economic calendar via /api/calendar)
// ---------------------------------------------------------------------------
async function fetchCatalysts(): Promise<{ catalysts: JudasSignal['catalysts']; stale: boolean }> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/calendar`, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(`Calendar API returned ${res.status}`)
    const data = await res.json() as JudasSignal['catalysts']
    if (!Array.isArray(data) || data.length === 0) throw new Error('No calendar events')
    return { catalysts: data, stale: false }
  } catch (err) {
    log('catalysts', err)
    return { catalysts: mockSignal.catalysts, stale: true }
  }
}

// ---------------------------------------------------------------------------
// 7. Score
// ---------------------------------------------------------------------------
function fetchScore(input: ScoreInput): {
  score: number
  grade: SignalGrade
  factors: JudasFactor[]
  stale: boolean
} {
  try {
    const result = computeScore(input)
    cache.score = result
    return { ...result, stale: false }
  } catch (err) {
    log('score', err)
    const fallback = cache.score ?? {
      score: mockSignal.score,
      grade: mockSignal.grade,
      factors: mockSignal.factors,
    }
    return { ...fallback, stale: true }
  }
}

// ---------------------------------------------------------------------------
// Main assembler — NEVER throws
// ---------------------------------------------------------------------------
export async function fetchJudasSignal(): Promise<JudasSignal> {
  try {
    // Parallel fetch all independent data sources
    const [spotResult, sessionResult, cotResult, macroResult, calendarResult] = await Promise.all([
      fetchSpotPrice(),
      fetchSessions(),
      fetchCOT(),
      fetchMacro(),
      fetchCatalysts(),
    ])

    // SMC levels depend on current price and London low
    const londonLow = sessionResult.sessions[1].low
    const smcResult = await fetchSMCLevels(spotResult.price, londonLow)

    // Candle warnings — reuse 4H candles (already fetched inside fetchSMCLevels)
    let warnings: CandleWarning[] = []
    try {
      const candles4h = await getCandles('4h', 200)
      warnings = detect4HWarnings(candles4h, smcResult.levels, spotResult.price)
    } catch (err) {
      log('warnings', err)
      warnings = []
    }

    // Score — pass all assembled data
    const scoreResult = fetchScore({
      sessions: sessionResult.sessions,
      levels: smcResult.levels,
      cot: cotResult.cot,
      macro: macroResult.macro,
      price: spotResult.price,
    })

    // Determine current session label
    const currentHour = new Date().getUTCHours()
    const sessionLabel: 'Asian' | 'London' | 'New York' =
      currentHour < 7 ? 'Asian' : currentHour < 12 ? 'London' : 'New York'

    return {
      price: spotResult.price,
      priceChange: spotResult.priceChange,
      priceChangePct: spotResult.priceChangePct,
      priceStale: spotResult.stale,

      grade: scoreResult.grade,
      score: scoreResult.score,
      sessionLabel,
      sessionBias: sessionResult.sessionBias,
      judasPhase: sessionResult.judasPhase,

      sessions: sessionResult.sessions,
      levels: smcResult.levels,
      factors: scoreResult.factors,

      cot: {
        ...cotResult.cot,
        stale: cotResult.stale || undefined,
      },
      macro: {
        ...macroResult.macro,
        stale: macroResult.stale || undefined,
      },

      tradeScenarios: deriveTradeScenarios(
        spotResult.price,
        sessionResult.sessions,
        smcResult.levels,
        sessionResult.judasPhase,
        sessionResult.sessionBias,
      ),
      catalysts: calendarResult.catalysts,

      warnings,

      computedAt: new Date().toISOString(),
    }
  } catch (err) {
    // Absolute fallback — should never reach here, but guarantees no throw
    console.error('[judas] critical failure — returning mockSignal:', err)
    return { ...mockSignal, computedAt: new Date().toISOString() }
  }
}
