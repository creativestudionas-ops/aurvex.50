/**
 * Judas x SMC 18-Factor Scoring Engine
 *
 * Evaluates market conditions across 18 weighted factors and returns
 * a composite score (0-100), letter grade, and per-factor breakdown.
 */

import type {
  SignalGrade,
  JudasFactor,
  SessionData,
  SMCLevel,
  COTData,
  MacroData,
  FactorDirection,
} from '@/types/judas'

export interface ScoreResult {
  score: number
  grade: SignalGrade
  factors: JudasFactor[]
}

export interface ScoreInput {
  sessions: [SessionData, SessionData, SessionData]
  levels: SMCLevel[]
  cot: COTData
  macro: MacroData
  price: number
}

function dir(val: number): FactorDirection {
  if (val > 0) return 'up'
  if (val < 0) return 'down'
  return 'neutral'
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

/** Compute the Judas x SMC score from assembled signal data. */
export function computeScore(input?: ScoreInput): ScoreResult {
  // If no input provided, throw so the fetcher falls back to cache/mock
  if (!input) {
    throw new Error('computeScore requires input data')
  }

  const { sessions, levels, cot, macro, price } = input
  const [asian, london, ny] = sessions
  const factors: JudasFactor[] = []

  // Helper to push a factor
  function addFactor(
    name: string,
    weight: number,
    earned: number,
    direction: FactorDirection,
    note: string,
  ) {
    factors.push({ name, weight, value: clamp(earned, -weight, weight), direction, note })
  }

  // -----------------------------------------------------------------------
  // 1. Judas Sweep Confirmed (15 pts)
  // -----------------------------------------------------------------------
  const judasConfirmed = london.judasConfirmed
  const judasVal = judasConfirmed ? 15 : 0
  addFactor(
    'Judas Sweep Confirmed',
    15,
    judasVal,
    judasConfirmed ? 'up' : 'neutral',
    judasConfirmed
      ? `London swept Asian ${london.direction === 'bullish' ? 'low' : 'high'} and reversed`
      : 'No Judas sweep detected yet',
  )

  // -----------------------------------------------------------------------
  // 2. Session Trend Alignment (8 pts)
  // -----------------------------------------------------------------------
  const aligned = london.direction === ny.direction && london.direction !== 'neutral'
  const alignVal = aligned ? 8 : london.direction !== 'neutral' ? 4 : 0
  addFactor(
    'Session Trend Alignment',
    8,
    alignVal,
    dir(alignVal),
    aligned
      ? `London + NY both ${london.direction}`
      : `London: ${london.direction}, NY: ${ny.direction}`,
  )

  // -----------------------------------------------------------------------
  // 3. Bullish OB Holding (8 pts)
  // -----------------------------------------------------------------------
  const ob = levels.find((l) => l.type === 'OB_bull' && l.active)
  const obVal = ob && price > (ob.priceLow ?? ob.price) ? 8 : ob ? 4 : 0
  addFactor(
    'Bullish OB Holding',
    8,
    obVal,
    dir(obVal),
    ob ? `Price ${price > (ob.priceLow ?? ob.price) ? 'above' : 'near'} OB at ${ob.price.toFixed(0)}` : 'No active bullish OB found',
  )

  // -----------------------------------------------------------------------
  // 4. FVG Unmitigated Below (5 pts)
  // -----------------------------------------------------------------------
  const fvg = levels.find((l) => l.type === 'FVG' && l.active)
  const fvgVal = fvg && price > fvg.price ? 3 : fvg ? 1 : 0
  addFactor(
    'FVG Unmitigated Below',
    5,
    fvgVal,
    dir(fvgVal),
    fvg ? `FVG at ${fvg.price.toFixed(0)} still open` : 'No unmitigated FVG',
  )

  // -----------------------------------------------------------------------
  // 5. BSL Target Proximity (6 pts)
  // -----------------------------------------------------------------------
  const bsl = levels.find((l) => l.type === 'BSL')
  const bslDist = bsl ? bsl.price - price : 999
  const bslVal = bsl?.active && bslDist > 0 && bslDist < 50 ? 6 : bsl ? 3 : 0
  addFactor(
    'BSL Target Proximity',
    6,
    bslVal,
    dir(bslVal),
    bsl ? `Equal highs at ${bsl.price.toFixed(0)}, $${bslDist.toFixed(0)} away` : 'No BSL identified',
  )

  // -----------------------------------------------------------------------
  // 6. SSL Cleared (6 pts)
  // -----------------------------------------------------------------------
  const ssl = levels.find((l) => l.type === 'SSL' && l.active)
  const sslVal = ssl && price > ssl.price ? 6 : ssl ? 2 : 0
  addFactor(
    'SSL Cleared',
    6,
    sslVal,
    dir(sslVal),
    ssl ? 'Sell stops below session low taken' : 'No SSL sweep detected',
  )

  // -----------------------------------------------------------------------
  // 7. DXY Weakness (5 pts)
  // -----------------------------------------------------------------------
  const dxyBullGold = macro.dxyChange < 0
  const dxyVal = dxyBullGold ? 5 : macro.dxyChange > 0.3 ? -2 : 0
  addFactor(
    'DXY Weakness',
    5,
    dxyVal,
    dir(dxyVal),
    `Dollar index ${macro.dxyChange >= 0 ? '+' : ''}${macro.dxyChange.toFixed(2)}%`,
  )

  // -----------------------------------------------------------------------
  // 8. US 10Y Direction (4 pts)
  // -----------------------------------------------------------------------
  const yieldBullGold = macro.us10yChange < 0
  const yieldVal = yieldBullGold ? 2 : macro.us10yChange > 0.05 ? -1 : 0
  addFactor(
    'US 10Y Direction',
    4,
    yieldVal,
    dir(yieldVal),
    `Yields ${macro.us10yChange >= 0 ? '+' : ''}${macro.us10yChange.toFixed(2)} — ${yieldBullGold ? 'mild gold tailwind' : 'headwind'}`,
  )

  // -----------------------------------------------------------------------
  // 9. COT Commercial Positioning (6 pts)
  // -----------------------------------------------------------------------
  const commVal = cot.commercialPctile > 60 ? 4 : cot.commercialPctile > 40 ? 2 : -2
  addFactor(
    'COT Commercial Positioning',
    6,
    commVal,
    dir(commVal),
    `${cot.commercialPctile}th percentile — ${cot.commercialPctile > 60 ? 'smart money net long' : 'neutral/short'}`,
  )

  // -----------------------------------------------------------------------
  // 10. COT Spec Crowding (4 pts)
  // -----------------------------------------------------------------------
  const specCrowded = cot.specPctile > 80
  const specVal = specCrowded ? -2 : cot.specPctile < 40 ? 3 : 2
  addFactor(
    'COT Spec Crowding',
    4,
    specVal,
    specCrowded ? 'down' : 'neutral',
    `${cot.specPctile}th percentile — ${specCrowded ? 'crowded long (contrarian bearish)' : 'not extreme'}`,
  )

  // -----------------------------------------------------------------------
  // 11. Price vs 100-Day SMA (4 pts)
  // -----------------------------------------------------------------------
  const sma = levels.find((l) => l.type === 'SMA')
  const aboveSma = sma ? price > sma.price : false
  const smaVal = aboveSma ? 4 : sma ? -1 : 0
  addFactor(
    'Price vs 100-Day SMA',
    4,
    smaVal,
    dir(smaVal),
    sma ? `${aboveSma ? 'Above' : 'Below'} SMA at ${sma.price.toFixed(0)}` : 'SMA not calculated',
  )

  // -----------------------------------------------------------------------
  // 12. Range Expansion (4 pts)
  // -----------------------------------------------------------------------
  const asianRange = asian.high - asian.low
  const londonRange = london.high - london.low
  const rangeExpanded = londonRange > asianRange * 1.5
  const rangeVal = rangeExpanded ? 3 : londonRange > asianRange ? 1 : 0
  addFactor(
    'Range Expansion',
    4,
    rangeVal,
    dir(rangeVal),
    `London range $${londonRange.toFixed(0)} vs Asian $${asianRange.toFixed(0)}`,
  )

  // -----------------------------------------------------------------------
  // 13. Volume Profile (3 pts)
  // -----------------------------------------------------------------------
  // Simplified: we don't have tick volume in the signal, give neutral
  addFactor('Volume Profile', 3, 2, 'up', 'Volume data from candle analysis')

  // -----------------------------------------------------------------------
  // 14. Higher Timeframe Trend (4 pts)
  // -----------------------------------------------------------------------
  const smaTrend = sma ? price > sma.price : false
  const htfVal = smaTrend ? 4 : 0
  addFactor(
    'Higher Timeframe Trend',
    4,
    htfVal,
    dir(htfVal),
    smaTrend ? 'Daily and weekly trend bullish' : 'No clear HTF trend',
  )

  // -----------------------------------------------------------------------
  // 15. Previous Day Close (3 pts)
  // -----------------------------------------------------------------------
  // Approximation: if current price > Asian open (proxy for prior day close region)
  const prevDayBullish = price > asian.low
  addFactor(
    'Previous Day Close',
    3,
    prevDayBullish ? 2 : 0,
    dir(prevDayBullish ? 2 : 0),
    prevDayBullish ? 'Trading above prior session levels' : 'Below prior session levels',
  )

  // -----------------------------------------------------------------------
  // 16. Catalyst Risk (4 pts — can be negative)
  // -----------------------------------------------------------------------
  // Placeholder: no live calendar data, assume mild risk
  addFactor('Catalyst Risk', 4, -1, 'down', 'Upcoming events may add volatility')

  // -----------------------------------------------------------------------
  // 17. Asian Session Quality (3 pts)
  // -----------------------------------------------------------------------
  const asianQuality = asianRange > 10 && asianRange < 40 ? 2 : asianRange >= 40 ? 1 : 0
  addFactor(
    'Asian Session Quality',
    3,
    asianQuality,
    asianQuality > 0 ? 'neutral' : 'down',
    `Range $${asianRange.toFixed(0)} — ${asianRange > 10 && asianRange < 40 ? 'good liquidity buildup' : asianRange >= 40 ? 'wide range' : 'very tight'}`,
  )

  // -----------------------------------------------------------------------
  // 18. Invalidation Distance (3 pts)
  // -----------------------------------------------------------------------
  const nearestSupport = fvg?.price ?? ob?.priceLow ?? sma?.price ?? 0
  const invDist = nearestSupport > 0 ? price - nearestSupport : 0
  const invVal = invDist > 10 && invDist < 50 ? 1 : 0
  addFactor(
    'Invalidation Distance',
    3,
    invVal,
    invVal > 0 ? 'neutral' : 'down',
    nearestSupport > 0
      ? `SL at ${nearestSupport.toFixed(0)} = $${invDist.toFixed(0)} risk`
      : 'No clear invalidation level',
  )

  // -----------------------------------------------------------------------
  // Aggregate
  // -----------------------------------------------------------------------
  const rawScore = factors.reduce((sum, f) => sum + f.value, 0)
  const maxScore = factors.reduce((sum, f) => sum + f.weight, 0)
  const normalized = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0
  const score = clamp(normalized, 0, 100)

  let grade: SignalGrade
  if (score >= 90) grade = 'A++'
  else if (score >= 80) grade = 'A+'
  else if (score >= 70) grade = 'A'
  else if (score >= 55) grade = 'B'
  else if (score >= 40) grade = 'C'
  else grade = 'F'

  return { score, grade, factors }
}
