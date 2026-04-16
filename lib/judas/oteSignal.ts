/**
 * OTE (Optimal Trade Entry) Fibonacci Signal Engine
 *
 * Uses Fibonacci retracement after a confirmed displacement leg.
 * The 62-79% zone is the optimal institutional re-entry zone.
 * Entry at 70.5% (midpoint of the OTE zone).
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
} from '@/types/judas'

// ---------------------------------------------------------------------------
// Wait helper
// ---------------------------------------------------------------------------
function oteWait(reason: string): EntrySignal {
  return {
    model: 'ote_fibonacci',
    modelLabel: 'OTE Fibonacci',
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
// Price formatting & utility
// ---------------------------------------------------------------------------
function fmtPrice(n: number): string {
  return n.toFixed(2)
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

// ---------------------------------------------------------------------------
// Displacement leg detection
// ---------------------------------------------------------------------------
interface DisplacementLeg {
  swingLow: number
  swingHigh: number
  direction: 'bullish' | 'bearish'
  startTime: number
  endTime: number
  totalMove: number
}

function detectDisplacementLeg(candles: Candle[]): DisplacementLeg | null {
  // Exclude the forming (last) candle, then take up to the last 50 closed
  const closed = candles.slice(0, -1)
  const recent = closed.slice(-50)

  if (recent.length < 3) return null

  let bestLeg: DisplacementLeg | null = null

  for (let i = 0; i < recent.length; i++) {
    const candle = recent[i]

    // --- Bullish streak ---
    if (candle.close > candle.open) {
      let bullCount = 1
      let legLow = candle.low
      let legHigh = candle.high
      const startTime = candle.time

      for (let j = i + 1; j < recent.length && j < i + 10; j++) {
        const next = recent[j]
        if (next.close <= next.open) break
        bullCount++
        legLow = Math.min(legLow, next.low)
        legHigh = Math.max(legHigh, next.high)
      }

      const move = legHigh - legLow
      if (bullCount >= 3 && move >= 20) {
        const endTime = recent[Math.min(i + bullCount - 1, recent.length - 1)].time
        if (bestLeg === null || move > bestLeg.totalMove) {
          bestLeg = {
            swingLow: legLow,
            swingHigh: legHigh,
            direction: 'bullish',
            startTime,
            endTime,
            totalMove: move,
          }
        }
      }
    }

    // --- Bearish streak ---
    if (candle.close < candle.open) {
      let bearCount = 1
      let legLow = candle.low
      let legHigh = candle.high
      const startTime = candle.time

      for (let j = i + 1; j < recent.length && j < i + 10; j++) {
        const next = recent[j]
        if (next.close >= next.open) break
        bearCount++
        legLow = Math.min(legLow, next.low)
        legHigh = Math.max(legHigh, next.high)
      }

      const move = legHigh - legLow
      if (bearCount >= 3 && move >= 20) {
        const endTime = recent[Math.min(i + bearCount - 1, recent.length - 1)].time
        if (bestLeg === null || move > bestLeg.totalMove) {
          bestLeg = {
            swingLow: legLow,
            swingHigh: legHigh,
            direction: 'bearish',
            startTime,
            endTime,
            totalMove: move,
          }
        }
      }
    }
  }

  return bestLeg
}

// ---------------------------------------------------------------------------
// Fibonacci levels
// ---------------------------------------------------------------------------
interface FibLevels {
  pct62: number
  pct705: number
  pct79: number
  pct100: number
  ext127: number
  ext1618: number
}

function computeFibLevels(leg: DisplacementLeg): FibLevels {
  const range = leg.swingHigh - leg.swingLow

  if (leg.direction === 'bullish') {
    // Retracement measured DOWN from swingHigh
    return {
      pct62: leg.swingHigh - range * 0.62,
      pct705: leg.swingHigh - range * 0.705,
      pct79: leg.swingHigh - range * 0.79,
      pct100: leg.swingLow,
      ext127: leg.swingHigh + range * 0.27,
      ext1618: leg.swingHigh + range * 0.618,
    }
  }

  // Bearish: retracement measured UP from swingLow
  return {
    pct62: leg.swingLow + range * 0.62,
    pct705: leg.swingLow + range * 0.705,
    pct79: leg.swingLow + range * 0.79,
    pct100: leg.swingHigh,
    ext127: leg.swingLow - range * 0.27,
    ext1618: leg.swingLow - range * 0.618,
  }
}

// ---------------------------------------------------------------------------
// Enforce minimum R-multiple for a TP level
// ---------------------------------------------------------------------------
function enforceMin(
  entryMid: number,
  rawPrice: number,
  risk: number,
  minR: number,
  direction: 'bullish' | 'bearish',
): number {
  const minPrice =
    direction === 'bullish'
      ? entryMid + risk * minR
      : entryMid - risk * minR

  if (direction === 'bullish') {
    return rawPrice >= minPrice ? rawPrice : minPrice
  }
  return rawPrice <= minPrice ? rawPrice : minPrice
}

// ---------------------------------------------------------------------------
// Confidence grade mapping
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
export function computeOTESignal(
  signal: JudasSignal,
  candles1h: Candle[],
  candles4h: Candle[],
): EntrySignal {
  try {
    // =====================================================================
    // Gate 1: Find displacement leg -- try 1H first, fall back to 4H
    // =====================================================================
    let leg = detectDisplacementLeg(candles1h)
    if (!leg) {
      leg = detectDisplacementLeg(candles4h)
    }
    if (!leg) {
      return oteWait('No displacement leg detected (need 3+ candles, $20+ move)')
    }

    // =====================================================================
    // Gate 2: Compute Fibonacci levels
    // =====================================================================
    const fib = computeFibLevels(leg)

    // =====================================================================
    // Gate 3: Price must be INSIDE the OTE zone (62-79%)
    // =====================================================================
    const price = signal.price

    if (leg.direction === 'bullish') {
      // Bullish OTE: pct79 is lower price, pct62 is higher price
      if (price < fib.pct79 || price > fib.pct62) {
        return oteWait(
          `Price $${fmtPrice(price)} outside OTE zone ($${fmtPrice(fib.pct79)}\u2013$${fmtPrice(fib.pct62)})`,
        )
      }
    } else {
      // Bearish OTE: pct62 is lower price, pct79 is higher price
      if (price < fib.pct62 || price > fib.pct79) {
        return oteWait(
          `Price $${fmtPrice(price)} outside OTE zone ($${fmtPrice(fib.pct62)}\u2013$${fmtPrice(fib.pct79)})`,
        )
      }
    }

    // =====================================================================
    // Gate 4: Grade must not be C or F
    // =====================================================================
    if (signal.grade === 'C' || signal.grade === 'F') {
      return oteWait(`Grade ${signal.grade} -- minimum B required for OTE entries`)
    }

    // =====================================================================
    // Gate 5: Score must be >= 45
    // =====================================================================
    if (signal.score < 45) {
      return oteWait(`Score ${signal.score.toFixed(0)}/100 -- minimum 45 required`)
    }

    // =====================================================================
    // Entry zone
    // =====================================================================
    const zoneLow =
      leg.direction === 'bullish' ? fib.pct79 : fib.pct62
    const zoneHigh =
      leg.direction === 'bullish' ? fib.pct62 : fib.pct79
    const midpoint = fib.pct705

    const entryZone: EntryZoneRange = {
      low: Math.round(zoneLow * 100) / 100,
      high: Math.round(zoneHigh * 100) / 100,
      midpoint: Math.round(midpoint * 100) / 100,
      source: `OTE 62\u201379% zone ($${fmtPrice(zoneLow)}\u2013$${fmtPrice(zoneHigh)})`,
    }

    // =====================================================================
    // Stop loss
    // =====================================================================
    const MIN_STOP = 10 // OTE stops are structural

    let stopLoss: number
    let stopNote: string

    if (leg.direction === 'bullish') {
      stopLoss = fib.pct100 - 5
      stopNote = `Below swing low $${fmtPrice(fib.pct100)} - $5 buffer`
    } else {
      stopLoss = fib.pct100 + 5
      stopNote = `Above swing high $${fmtPrice(fib.pct100)} + $5 buffer`
    }

    stopLoss = Math.round(stopLoss * 100) / 100
    const risk = Math.max(Math.abs(midpoint - stopLoss), MIN_STOP)

    // =====================================================================
    // TP targets
    // =====================================================================
    const targets: TPLevel[] = []

    // TP1: prior swing high (bullish) or swing low (bearish), min 1.0R
    const rawTP1 = leg.direction === 'bullish' ? leg.swingHigh : leg.swingLow
    const tp1Price = enforceMin(midpoint, rawTP1, risk, 1.0, leg.direction)
    const tp1R = Math.abs(tp1Price - midpoint) / risk
    targets.push({
      label: 'TP1',
      price: Math.round(tp1Price * 100) / 100,
      rMultiple: Math.round(tp1R * 10) / 10,
      rationale:
        tp1Price === rawTP1
          ? `Prior swing ${leg.direction === 'bullish' ? 'high' : 'low'} @ $${fmtPrice(rawTP1)}`
          : `1.0R extension @ $${fmtPrice(tp1Price)}`,
    })

    // TP2: 127% extension, min 1.8R
    const tp2Price = enforceMin(midpoint, fib.ext127, risk, 1.8, leg.direction)
    const tp2R = Math.abs(tp2Price - midpoint) / risk
    targets.push({
      label: 'TP2',
      price: Math.round(tp2Price * 100) / 100,
      rMultiple: Math.round(tp2R * 10) / 10,
      rationale:
        tp2Price === fib.ext127
          ? `127% Fib extension @ $${fmtPrice(fib.ext127)}`
          : `1.8R extension @ $${fmtPrice(tp2Price)}`,
    })

    // TP3: 161.8% extension, min 2.8R
    const tp3Price = enforceMin(midpoint, fib.ext1618, risk, 2.8, leg.direction)
    const tp3R = Math.abs(tp3Price - midpoint) / risk
    targets.push({
      label: 'TP3',
      price: Math.round(tp3Price * 100) / 100,
      rMultiple: Math.round(tp3R * 10) / 10,
      rationale:
        tp3Price === fib.ext1618
          ? `161.8% Fib extension @ $${fmtPrice(fib.ext1618)}`
          : `2.8R extension @ $${fmtPrice(tp3Price)}`,
    })

    // =====================================================================
    // R:R (against TP2)
    // =====================================================================
    const riskReward =
      risk > 0
        ? Math.round((Math.abs(tp2Price - midpoint) / risk) * 100) / 100
        : null

    // =====================================================================
    // Confidence scoring
    // =====================================================================
    let score = 55

    // Retracement depth: how far into the OTE zone has price retraced?
    const retracePct =
      (Math.abs(price - (leg.direction === 'bullish' ? leg.swingHigh : leg.swingLow)) /
        leg.totalMove) *
      100

    if (retracePct >= 69 && retracePct <= 72) score += 10    // sweet spot
    else if (retracePct >= 65 && retracePct <= 76) score += 5 // in zone

    // Grade bonus
    if (signal.grade === 'A++' || signal.grade === 'A+') score += 10

    // Signal score bonus
    if (signal.score >= 70) score += 8

    // Post-sweep aligned with leg direction
    if (
      signal.judasPhase.includes('Post-sweep') &&
      ((leg.direction === 'bullish' && signal.sessionBias.includes('Long')) ||
       (leg.direction === 'bearish' && signal.sessionBias.includes('Short')))
    ) {
      score += 8
    }

    // R:R boost
    if (riskReward !== null && riskReward >= 2.0) score += 5
    if (riskReward !== null && riskReward >= 3.0) score += 4

    // COT alignment
    if (
      (leg.direction === 'bullish' && signal.cot.commercialPctile > 60) ||
      (leg.direction === 'bearish' && signal.cot.commercialPctile < 40)
    ) {
      score += 5
    }

    // Critical rejection in OTE zone
    const criticalRejection = signal.warnings.find(
      (w) =>
        w.severity === 'critical' &&
        w.category === 'rejection' &&
        w.direction === leg.direction,
    )
    if (criticalRejection) score += 8

    // --- Penalties ---
    if (signal.cot.stale) score -= 4
    if (signal.priceStale) score -= 5
    if (signal.grade === 'B') score -= 3
    if (riskReward !== null && riskReward < 1.5) score -= 10
    const highCatalyst = signal.catalysts.find((c) => c.impact === 'high')
    if (highCatalyst) score -= 6

    // Clamp 0-100
    score = clamp(score, 0, 100)

    const confidenceGrade = toConfidenceGrade(score)

    // =====================================================================
    // Reasons
    // =====================================================================
    const reasons: string[] = []

    reasons.push(
      `OTE zone hit at ${retracePct.toFixed(1)}% retracement ($${fmtPrice(price)})`,
    )

    reasons.push(
      `${leg.direction} displacement: $${fmtPrice(leg.swingLow)} \u2192 $${fmtPrice(leg.swingHigh)} ($${fmtPrice(leg.totalMove)} move)`,
    )

    reasons.push(
      `TP2 at 127% extension: $${fmtPrice(tp2Price)}`,
    )

    reasons.push(
      `TP3 at 161.8% extension: $${fmtPrice(tp3Price)}`,
    )

    if (riskReward !== null) {
      reasons.push(`Risk/reward to TP2: 1:${fmtPrice(riskReward)}`)
    }

    reasons.push(
      `Entry zone: ${entryZone.source}`,
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

    if (riskReward !== null && riskReward < 1.5) {
      blockers.push(`R:R below 1.5 (${fmtPrice(riskReward)}) -- suboptimal risk/reward`)
    }

    // =====================================================================
    // Direction
    // =====================================================================
    const direction =
      confidenceGrade === 'wait'
        ? ('wait' as const)
        : leg.direction === 'bullish'
          ? ('buy' as const)
          : ('sell' as const)

    // =====================================================================
    // Final signal
    // =====================================================================
    return {
      model: 'ote_fibonacci',
      modelLabel: 'OTE Fibonacci',
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
    console.error('[oteSignal] unexpected error:', err)
    return oteWait('Engine error')
  }
}
