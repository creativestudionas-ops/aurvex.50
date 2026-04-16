/**
 * CISD (Change In State of Delivery) Signal Engine
 *
 * Detects when price sweeps a liquidity level (BSL/SSL), then the first
 * candle closes back through that level -- confirming a change in the
 * state of delivery direction.
 *
 * Designed for XAU/USD (gold) on the Aurvex platform.
 * Strict TypeScript -- no `any` types. File never throws.
 */

import type { Candle } from '@/components/judas/chart/types/chart'
import type {
  JudasSignal,
  EntrySignal,
  EntryConfidence,
  EntryZoneRange,
  TPLevel,
  SMCLevel,
} from '@/types/judas'

// ---------------------------------------------------------------------------
// Internal interfaces
// ---------------------------------------------------------------------------
interface SweepEvent {
  level: SMCLevel
  sweepCandle: Candle
  direction: 'bullish' | 'bearish'
  sweepPrice: number
}

// ---------------------------------------------------------------------------
// Wait helper
// ---------------------------------------------------------------------------
function cisdWait(reason: string): EntrySignal {
  return {
    model: 'cisd',
    modelLabel: 'CISD',
    direction: 'wait',
    confidence: 'wait',
    confidenceScore: 0,
    entryZone: null,
    stopLoss: null,
    stopNote: '',
    targets: [],
    riskReward: null,
    reasons: [],
    blockers: [reason],
    computedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Price formatting
// ---------------------------------------------------------------------------
function fmtPrice(n: number): string {
  return n.toFixed(2)
}

// ---------------------------------------------------------------------------
// Sweep detection
// ---------------------------------------------------------------------------
function detectSweepEvent(
  candles1h: Candle[],
  levels: SMCLevel[],
): SweepEvent | null {
  // Slice off the last forming candle, then take the last 10 closed candles
  const closed = candles1h.slice(0, -1)
  const recent = closed.slice(-10)

  for (let i = recent.length - 1; i >= 0; i--) {
    const candle = recent[i]

    for (const level of levels) {
      if (!level.active) continue

      // SSL sweep (bullish): wick below level, close back above
      if (
        level.type === 'SSL' &&
        candle.low < level.price &&
        candle.close > level.price
      ) {
        return {
          level,
          sweepCandle: candle,
          direction: 'bullish',
          sweepPrice: candle.low,
        }
      }

      // BSL sweep (bearish): wick above level, close back below
      if (
        level.type === 'BSL' &&
        candle.high > level.price &&
        candle.close < level.price
      ) {
        return {
          level,
          sweepCandle: candle,
          direction: 'bearish',
          sweepPrice: candle.high,
        }
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// CISD candle detection
// ---------------------------------------------------------------------------
function detectCISDCandle(
  candles1h: Candle[],
  sweep: SweepEvent,
): Candle | null {
  const sweepTime = sweep.sweepCandle.time
  const afterSweep = candles1h.filter((c) => c.time > sweepTime)

  for (const candle of afterSweep) {
    if (sweep.direction === 'bullish' && candle.close > sweep.level.price) {
      return candle
    }
    if (sweep.direction === 'bearish' && candle.close < sweep.level.price) {
      return candle
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Displacement origin
// ---------------------------------------------------------------------------
function findDisplacementOrigin(
  candles1h: Candle[],
  sweep: SweepEvent,
): number | null {
  const sweepIdx = candles1h.findIndex((c) => c.time === sweep.sweepCandle.time)
  if (sweepIdx < 5) return null

  const lookbackStart = Math.max(0, sweepIdx - 40)
  const lookback = candles1h.slice(lookbackStart, sweepIdx)

  if (lookback.length === 0) return null

  if (sweep.direction === 'bullish') {
    // SSL sweep -- origin is the highest high before the sweep
    return Math.max(...lookback.map((c) => c.high))
  } else {
    // BSL sweep -- origin is the lowest low before the sweep
    return Math.min(...lookback.map((c) => c.low))
  }
}

// ---------------------------------------------------------------------------
// Nearest target level
// ---------------------------------------------------------------------------
function findNearestTargetLevel(
  signal: JudasSignal,
  entryMid: number,
  direction: 'bullish' | 'bearish',
  minDistance: number,
): { price: number; label: string } | null {
  const candidates: { price: number; label: string }[] = []

  for (const level of signal.levels) {
    if (direction === 'bullish') {
      // Find BSL levels above entry
      if (level.type === 'BSL') {
        const p = level.priceHigh ?? level.price
        if (p > entryMid + minDistance) {
          candidates.push({ price: p, label: `${level.name} @ $${fmtPrice(p)}` })
        }
      }
    } else {
      // Find SSL levels below entry
      if (level.type === 'SSL') {
        const p = level.priceLow ?? level.price
        if (p < entryMid - minDistance) {
          candidates.push({ price: p, label: `${level.name} @ $${fmtPrice(p)}` })
        }
      }
    }
  }

  // Add session highs/lows
  for (const session of signal.sessions) {
    if (direction === 'bullish' && session.high > entryMid + minDistance) {
      candidates.push({
        price: session.high,
        label: `${session.label} session high @ $${fmtPrice(session.high)}`,
      })
    }
    if (direction === 'bearish' && session.low < entryMid - minDistance) {
      candidates.push({
        price: session.low,
        label: `${session.label} session low @ $${fmtPrice(session.low)}`,
      })
    }
  }

  if (candidates.length === 0) return null

  // Sort by distance from entry (nearest first)
  candidates.sort(
    (a, b) => Math.abs(a.price - entryMid) - Math.abs(b.price - entryMid),
  )

  return candidates[0]
}

// ---------------------------------------------------------------------------
// Confidence grading
// ---------------------------------------------------------------------------
function toConfidenceGrade(score: number): EntryConfidence {
  if (score >= 85) return 'A++'
  if (score >= 75) return 'A+'
  if (score >= 62) return 'A'
  if (score >= 50) return 'B'
  return 'wait'
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------
export function computeCISDSignal(
  signal: JudasSignal,
  candles1h: Candle[],
  candles4h: Candle[],
): EntrySignal {
  try {
    // =====================================================================
    // Gate 1: Must find a sweep in last 10 x 1H candles
    // =====================================================================
    const sweep = detectSweepEvent(candles1h, signal.levels)
    if (!sweep) {
      return cisdWait('No liquidity sweep detected in last 10 candles')
    }

    // =====================================================================
    // Gate 2: Must find the CISD candle
    // =====================================================================
    const cisdCandle = detectCISDCandle(candles1h, sweep)
    if (!cisdCandle) {
      return cisdWait('Sweep found but no CISD candle confirmed yet')
    }

    // =====================================================================
    // Gate 3: CISD candle must be closed (not the forming candle)
    // =====================================================================
    const lastCandleTime = candles1h[candles1h.length - 1]?.time ?? 0
    if (cisdCandle.time === lastCandleTime) {
      return cisdWait('CISD candle still forming -- awaiting close')
    }

    // =====================================================================
    // Gate 4: CISD must be within last 3 candles
    // =====================================================================
    const cisdIdx = candles1h.findIndex((c) => c.time === cisdCandle.time)
    const cisdAge = candles1h.length - 1 - cisdIdx
    if (cisdAge > 3) {
      return cisdWait(`CISD candle too old (${cisdAge} candles ago)`)
    }

    // =====================================================================
    // Gate 5: signal.score >= 40
    // =====================================================================
    if (signal.score < 40) {
      return cisdWait(`Score ${signal.score.toFixed(0)}/100 -- minimum 40 required`)
    }

    // =====================================================================
    // Entry zone: 50% level of the CISD candle body
    // =====================================================================
    const cisdBodyHigh = Math.max(cisdCandle.open, cisdCandle.close)
    const cisdBodyLow = Math.min(cisdCandle.open, cisdCandle.close)
    const cisdMid = (cisdBodyHigh + cisdBodyLow) / 2
    const halfZone = (cisdBodyHigh - cisdBodyLow) * 0.25

    const entryZone: EntryZoneRange = {
      low: Math.round((cisdMid - halfZone) * 100) / 100,
      high: Math.round((cisdMid + halfZone) * 100) / 100,
      midpoint: Math.round(cisdMid * 100) / 100,
      source: `CISD candle 50% @ $${cisdMid.toFixed(2)}`,
    }

    // =====================================================================
    // Stop loss
    // =====================================================================
    const MIN_STOP = 8

    let stopLoss: number
    let stopNote: string

    if (sweep.direction === 'bullish') {
      stopLoss = sweep.sweepPrice - 3
      stopNote = `Below sweep low $${fmtPrice(sweep.sweepPrice)} - $3 buffer`
    } else {
      stopLoss = sweep.sweepPrice + 3
      stopNote = `Above sweep high $${fmtPrice(sweep.sweepPrice)} + $3 buffer`
    }

    stopLoss = Math.round(stopLoss * 100) / 100
    const risk = Math.max(Math.abs(entryZone.midpoint - stopLoss), MIN_STOP)

    // =====================================================================
    // TP targets
    // =====================================================================
    const displacementOrigin = findDisplacementOrigin(candles1h, sweep)

    // TP1: sweep level +/- risk * 1.0
    const tp1Price =
      sweep.direction === 'bullish'
        ? sweep.level.price + risk * 1.0
        : sweep.level.price - risk * 1.0
    const tp1R = Math.abs(tp1Price - entryZone.midpoint) / risk

    const tp1: TPLevel = {
      label: 'TP1',
      price: Math.round(tp1Price * 100) / 100,
      rMultiple: Math.round(tp1R * 10) / 10,
      rationale: `${sweep.level.type} level reclaimed`,
    }

    // TP2: nearest SMC level or midpoint to origin, minimum 1.5R
    const minTP2Distance = risk * 1.5
    const nearestLevel = findNearestTargetLevel(
      signal,
      entryZone.midpoint,
      sweep.direction,
      minTP2Distance,
    )

    let tp2Price: number
    let tp2Rationale: string

    if (nearestLevel) {
      tp2Price = nearestLevel.price
      tp2Rationale = nearestLevel.label
    } else if (displacementOrigin !== null) {
      // Midpoint to origin
      tp2Price =
        sweep.direction === 'bullish'
          ? entryZone.midpoint + Math.abs(displacementOrigin - entryZone.midpoint) * 0.5
          : entryZone.midpoint - Math.abs(entryZone.midpoint - displacementOrigin) * 0.5
      tp2Rationale = 'Midpoint to displacement origin'
    } else {
      // Fallback: 1.5R extension
      tp2Price =
        sweep.direction === 'bullish'
          ? entryZone.midpoint + risk * 1.5
          : entryZone.midpoint - risk * 1.5
      tp2Rationale = `1.5R extension @ $${fmtPrice(tp2Price)}`
    }

    // Enforce minimum 1.5R for TP2
    const tp2MinPrice =
      sweep.direction === 'bullish'
        ? entryZone.midpoint + risk * 1.5
        : entryZone.midpoint - risk * 1.5

    if (
      (sweep.direction === 'bullish' && tp2Price < tp2MinPrice) ||
      (sweep.direction === 'bearish' && tp2Price > tp2MinPrice)
    ) {
      tp2Price = tp2MinPrice
    }

    const tp2R = Math.abs(tp2Price - entryZone.midpoint) / risk

    const tp2: TPLevel = {
      label: 'TP2',
      price: Math.round(tp2Price * 100) / 100,
      rMultiple: Math.round(tp2R * 10) / 10,
      rationale: tp2Rationale,
    }

    // TP3: displacement origin or fallback risk * 3.5
    let tp3Price: number
    let tp3Rationale: string

    if (displacementOrigin !== null) {
      tp3Price = displacementOrigin
      tp3Rationale = 'Displacement origin'
    } else {
      tp3Price =
        sweep.direction === 'bullish'
          ? entryZone.midpoint + risk * 3.5
          : entryZone.midpoint - risk * 3.5
      tp3Rationale = 'Displacement origin'
    }

    const tp3R = Math.abs(tp3Price - entryZone.midpoint) / risk

    const tp3: TPLevel = {
      label: 'TP3',
      price: Math.round(tp3Price * 100) / 100,
      rMultiple: Math.round(tp3R * 10) / 10,
      rationale: tp3Rationale,
    }

    const targets: TPLevel[] = [tp1, tp2, tp3]

    // =====================================================================
    // R:R (against TP2)
    // =====================================================================
    const riskReward =
      risk > 0
        ? Math.round((Math.abs(tp2.price - entryZone.midpoint) / risk) * 100) / 100
        : null

    // =====================================================================
    // Confidence scoring
    // =====================================================================
    let score = 55

    // -- Boosts --
    if (cisdAge === 1) score += 12
    else if (cisdAge === 2) score += 6

    if (signal.judasPhase.includes('Post-sweep')) score += 10

    if (signal.grade === 'A++' || signal.grade === 'A+') score += 8

    if (riskReward !== null && riskReward >= 2.5) score += 6
    if (riskReward !== null && riskReward >= 3.5) score += 4

    // COT commercial alignment
    if (
      sweep.direction === 'bullish' &&
      signal.cot.commercialPctile > 65
    ) {
      score += 5
    } else if (
      sweep.direction === 'bearish' &&
      signal.cot.commercialPctile < 35
    ) {
      score += 5
    }

    // Critical rejection aligned with direction
    const alignedRejection = signal.warnings.find(
      (w) =>
        w.severity === 'critical' &&
        w.category === 'rejection' &&
        w.direction === sweep.direction,
    )
    if (alignedRejection) score += 8

    // -- Penalties --
    if (signal.priceStale) score -= 5
    if (signal.cot.stale) score -= 4

    if (riskReward !== null && riskReward < 2.0) score -= 8

    const highCatalyst = signal.catalysts.find((c) => c.impact === 'high')
    if (highCatalyst) score -= 7

    if (signal.grade === 'C' || signal.grade === 'F') score -= 15

    // Clamp 0-100
    score = Math.max(0, Math.min(100, score))

    const confidenceGrade = toConfidenceGrade(score)

    // =====================================================================
    // Reasons
    // =====================================================================
    const reasons: string[] = []

    reasons.push(
      `${sweep.level.type} sweep @ $${fmtPrice(sweep.sweepPrice)} -- ${sweep.direction} CISD confirmed`,
    )

    reasons.push(
      `CISD candle age: ${cisdAge} candle${cisdAge !== 1 ? 's' : ''} ago`,
    )

    if (signal.judasPhase.includes('Post-sweep')) {
      reasons.push('Judas phase aligned -- Post-sweep confirmed')
    }

    if (
      (sweep.direction === 'bullish' && signal.cot.commercialPctile > 65) ||
      (sweep.direction === 'bearish' && signal.cot.commercialPctile < 35)
    ) {
      reasons.push(
        `COT commercials at ${signal.cot.commercialPctile.toFixed(0)}th percentile -- aligned with ${sweep.direction} bias`,
      )
    }

    if (riskReward !== null) {
      reasons.push(`Risk/reward to TP2: 1:${fmtPrice(riskReward)}`)
    }

    reasons.push(
      `Entry zone: ${entryZone.source} ($${fmtPrice(entryZone.low)}--$${fmtPrice(entryZone.high)})`,
    )

    // =====================================================================
    // Blockers
    // =====================================================================
    const blockers: string[] = []

    if (signal.cot.stale) {
      blockers.push(`COT data stale (week of ${signal.cot.weekOf})`)
    }

    if (signal.priceStale) {
      blockers.push('Price feed stale -- using cached quote')
    }

    if (highCatalyst) {
      blockers.push(
        `High-impact catalyst pending: ${highCatalyst.name}${highCatalyst.time ? ` at ${highCatalyst.time}` : ''}`,
      )
    }

    if (riskReward !== null && riskReward < 2.0) {
      blockers.push(`R:R below 2.0 (${fmtPrice(riskReward)}) -- suboptimal risk/reward`)
    }

    if (signal.grade === 'C' || signal.grade === 'F') {
      blockers.push(`Grade ${signal.grade} -- minimum B recommended for CISD entries`)
    }

    // =====================================================================
    // Direction
    // =====================================================================
    const direction =
      confidenceGrade === 'wait'
        ? 'wait' as const
        : sweep.direction === 'bullish'
          ? 'buy' as const
          : 'sell' as const

    // =====================================================================
    // Final signal
    // =====================================================================
    return {
      model: 'cisd',
      modelLabel: 'CISD',
      direction,
      confidence: confidenceGrade,
      confidenceScore: score,
      entryZone,
      stopLoss,
      stopNote,
      targets,
      riskReward,
      reasons,
      blockers,
      computedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.error('[cisdSignal] unexpected error:', err)
    return cisdWait('Engine error')
  }
}
