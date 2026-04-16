/**
 * Breaker Block Signal Engine
 *
 * A Breaker Block is a FAILED Order Block. When a bull OB gets broken
 * (price closes below its priceLow), that OB becomes a bear breaker --
 * when price retraces back into it, enter SHORT. Vice versa for bear OBs.
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
interface BreakerLevel {
  originalOB: SMCLevel
  breakerType: 'bear' | 'bull' // bear = formerly bull OB now bearish resistance
  priceLow: number
  priceHigh: number
  brokenAt: number
  midpoint: number
}

// ---------------------------------------------------------------------------
// Wait helper
// ---------------------------------------------------------------------------
function breakerWait(reason: string): EntrySignal {
  return {
    model: 'breaker_block',
    modelLabel: 'Breaker Block',
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
// Formatting helpers
// ---------------------------------------------------------------------------
function fmtPrice(n: number): string {
  return n.toFixed(2)
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

// ---------------------------------------------------------------------------
// Detect breaker blocks from OB levels + candle data
// ---------------------------------------------------------------------------
function detectBreakerBlocks(
  candles: Candle[],
  levels: SMCLevel[],
): BreakerLevel[] {
  const breakers: BreakerLevel[] = []

  for (const level of levels) {
    if (level.type !== 'OB_bull' && level.type !== 'OB_bear') continue
    if (level.priceLow === undefined || level.priceHigh === undefined) continue

    const lo = level.priceLow
    const hi = level.priceHigh

    if (level.type === 'OB_bull') {
      // Bull OB broken = candle closes below its priceLow -> becomes bear breaker
      for (const candle of candles) {
        if (candle.close < lo) {
          breakers.push({
            originalOB: level,
            breakerType: 'bear',
            priceLow: lo,
            priceHigh: hi,
            brokenAt: candle.close,
            midpoint: (lo + hi) / 2,
          })
          break
        }
      }
    }

    if (level.type === 'OB_bear') {
      // Bear OB broken = candle closes above its priceHigh -> becomes bull breaker
      for (const candle of candles) {
        if (candle.close > hi) {
          breakers.push({
            originalOB: level,
            breakerType: 'bull',
            priceLow: lo,
            priceHigh: hi,
            brokenAt: candle.close,
            midpoint: (lo + hi) / 2,
          })
          break
        }
      }
    }
  }

  return breakers
}

// ---------------------------------------------------------------------------
// Measure displacement size before the break candle
// ---------------------------------------------------------------------------
function measureDisplacementBeforeBreak(
  candles: Candle[],
  breaker: BreakerLevel,
): number {
  const breakIdx = candles.findIndex((c) => c.close === breaker.brokenAt)

  if (breakIdx < 0 || breakIdx < 5) return 30 // fallback

  const lookbackStart = Math.max(0, breakIdx - 20)
  const lookback = candles.slice(lookbackStart, breakIdx)

  if (lookback.length === 0) return 30

  const highestHigh = Math.max(...lookback.map((c) => c.high))
  const lowestLow = Math.min(...lookback.map((c) => c.low))

  return highestHigh - lowestLow
}

// ---------------------------------------------------------------------------
// Find nearest target level in trade direction
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
      // BSL levels above entry
      if (level.type === 'BSL') {
        const p = level.priceHigh ?? level.price
        if (p > entryMid + minDistance) {
          candidates.push({ price: p, label: `${level.name} @ $${fmtPrice(p)}` })
        }
      }
    } else {
      // SSL levels below entry
      if (level.type === 'SSL') {
        const p = level.priceLow ?? level.price
        if (p < entryMid - minDistance) {
          candidates.push({ price: p, label: `${level.name} @ $${fmtPrice(p)}` })
        }
      }
    }
  }

  // Add session highs/lows as candidates
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
export function computeBreakerSignal(
  signal: JudasSignal,
  candles1h: Candle[],
  candles4h: Candle[],
): EntrySignal {
  try {
    // Combine candle pools -- prefer 1h, fall back to 4h
    const candles = candles1h.length >= 10 ? candles1h : candles4h

    // =====================================================================
    // Detect breaker blocks from all OB levels
    // =====================================================================
    const breakers = detectBreakerBlocks(candles, signal.levels)

    // =====================================================================
    // Gate 1: At least one breaker must exist
    // =====================================================================
    if (breakers.length === 0) {
      return breakerWait('No broken Order Blocks detected -- no breaker levels')
    }

    // =====================================================================
    // Gate 2: Price must be within $10 of a breaker
    // =====================================================================
    const nearbyBreaker = breakers.find(
      (b) =>
        signal.price >= b.priceLow - 10 && signal.price <= b.priceHigh + 10,
    )
    if (!nearbyBreaker) {
      return breakerWait('Price not within range of any breaker block')
    }

    // =====================================================================
    // Gate 3: Score must be >= 45
    // =====================================================================
    if (signal.score < 45) {
      return breakerWait(
        `Score ${signal.score.toFixed(0)}/100 -- minimum 45 required`,
      )
    }

    // =====================================================================
    // Gate 4: Grade must not be C or F
    // =====================================================================
    if (signal.grade === 'C' || signal.grade === 'F') {
      return breakerWait(
        `Grade ${signal.grade} -- minimum B required for Breaker Block entries`,
      )
    }

    // =====================================================================
    // Derive trade direction from breaker type
    // =====================================================================
    // bear breaker (formerly bull OB) -> sell (bearish)
    // bull breaker (formerly bear OB) -> buy (bullish)
    const tradeBias: 'bullish' | 'bearish' =
      nearbyBreaker.breakerType === 'bear' ? 'bearish' : 'bullish'

    // =====================================================================
    // Gate 5: No critical/high warning in opposite direction to breaker trade
    // =====================================================================
    const oppositeDir: 'bullish' | 'bearish' =
      tradeBias === 'bullish' ? 'bearish' : 'bullish'
    const conflicting = signal.warnings.find(
      (w) =>
        (w.severity === 'critical' || w.severity === 'high') &&
        w.direction === oppositeDir,
    )
    if (conflicting) {
      return breakerWait(
        `${conflicting.severity} ${oppositeDir} warning: ${conflicting.title}`,
      )
    }

    // =====================================================================
    // Entry zone
    // =====================================================================
    const entryZone: EntryZoneRange = {
      low: Math.round(nearbyBreaker.priceLow * 100) / 100,
      high: Math.round(nearbyBreaker.priceHigh * 100) / 100,
      midpoint: Math.round(nearbyBreaker.midpoint * 100) / 100,
      source: `Breaker (failed ${nearbyBreaker.originalOB.name})`,
    }

    // =====================================================================
    // Stop loss
    // =====================================================================
    const MIN_STOP = 8

    let stopLoss: number
    let stopNote: string

    if (nearbyBreaker.breakerType === 'bear') {
      // Bear breaker -> selling -> stop above the zone
      stopLoss = nearbyBreaker.priceHigh + 6
      stopNote = `Above breaker high $${fmtPrice(nearbyBreaker.priceHigh)} + $6 buffer`
    } else {
      // Bull breaker -> buying -> stop below the zone
      stopLoss = nearbyBreaker.priceLow - 6
      stopNote = `Below breaker low $${fmtPrice(nearbyBreaker.priceLow)} - $6 buffer`
    }

    stopLoss = Math.round(stopLoss * 100) / 100

    const risk = Math.max(
      Math.abs(nearbyBreaker.midpoint - stopLoss),
      MIN_STOP,
    )

    // =====================================================================
    // Displacement size for TP3
    // =====================================================================
    const displacementSize = measureDisplacementBeforeBreak(
      candles,
      nearbyBreaker,
    )

    // =====================================================================
    // TP targets
    // =====================================================================
    const mid = nearbyBreaker.midpoint

    // enforceMinR -- guarantees each TP meets a minimum R multiple
    const enforceMinR = (tpPrice: number, minR: number): number => {
      const natural = Math.abs(tpPrice - mid)
      if (natural >= risk * minR) return tpPrice
      return tradeBias === 'bullish'
        ? mid + risk * minR
        : mid - risk * minR
    }

    // TP1: midpoint +/- max(risk * 1.0, 15). Min 1.0R enforced.
    const rawTP1 = tradeBias === 'bullish'
      ? mid + Math.max(risk * 1.0, 15)
      : mid - Math.max(risk * 1.0, 15)
    const tp1Price = Math.round(enforceMinR(rawTP1, 1.0) * 100) / 100
    const tp1R =
      Math.round((Math.abs(tp1Price - mid) / risk) * 10) / 10

    // TP2: nearest target level or fallback risk * 2.0. Min 1.8R enforced.
    const minTP2Distance = risk * 1.8
    const nearestLevel = findNearestTargetLevel(
      signal,
      mid,
      tradeBias,
      0, // no minimum distance filter -- we enforce R below
    )

    let rawTP2: number
    let tp2Rationale: string

    if (
      nearestLevel &&
      Math.abs(nearestLevel.price - mid) >= minTP2Distance
    ) {
      rawTP2 = nearestLevel.price
      tp2Rationale = nearestLevel.label
    } else {
      rawTP2 = tradeBias === 'bullish'
        ? mid + risk * 2.0
        : mid - risk * 2.0
      tp2Rationale = `2.0R extension @ $${fmtPrice(rawTP2)}`
    }

    const tp2Price = Math.round(enforceMinR(rawTP2, 1.8) * 100) / 100
    const tp2R =
      Math.round((Math.abs(tp2Price - mid) / risk) * 10) / 10

    // TP3: midpoint +/- displacementSize. Min 2.8R enforced.
    const rawTP3 = tradeBias === 'bullish'
      ? mid + displacementSize
      : mid - displacementSize
    const tp3Price = Math.round(enforceMinR(rawTP3, 2.8) * 100) / 100
    const tp3R =
      Math.round((Math.abs(tp3Price - mid) / risk) * 10) / 10

    const targets: TPLevel[] = [
      {
        label: 'TP1',
        price: tp1Price,
        rMultiple: tp1R,
        rationale:
          tp1R >= 1.0
            ? `Breaker continuation @ $${fmtPrice(tp1Price)}`
            : `1.0R extension @ $${fmtPrice(tp1Price)}`,
      },
      {
        label: 'TP2',
        price: tp2Price,
        rMultiple: tp2R,
        rationale: tp2Rationale,
      },
      {
        label: 'TP3',
        price: tp3Price,
        rMultiple: tp3R,
        rationale: `Displacement measured move ($${fmtPrice(displacementSize)}) @ $${fmtPrice(tp3Price)}`,
      },
    ]

    // =====================================================================
    // R:R (against TP2)
    // =====================================================================
    const riskReward =
      risk > 0
        ? Math.round(
            (Math.abs(tp2Price - entryZone.midpoint) / risk) * 100,
          ) / 100
        : null

    // =====================================================================
    // Confidence scoring
    // =====================================================================
    let score = 52

    // -- Boosts --

    // Grade bonus
    if (signal.grade === 'A++' || signal.grade === 'A+') score += 10

    // High score bonus
    if (signal.score >= 70) score += 8

    // Post-sweep bonus
    if (signal.judasPhase.includes('Post-sweep')) score += 6

    // Session bias aligned with breaker direction
    const biasAligned =
      (tradeBias === 'bullish' &&
        (signal.sessionBias.includes('Long') ||
          signal.sessionBias.includes('Bullish'))) ||
      (tradeBias === 'bearish' &&
        (signal.sessionBias.includes('Short') ||
          signal.sessionBias.includes('Bearish')))
    if (biasAligned) score += 6

    // R:R bonus
    if (riskReward !== null && riskReward >= 2.5) score += 6
    if (riskReward !== null && riskReward >= 3.0) score += 4

    // Critical rejection aligned with trade direction
    const alignedRejection = signal.warnings.find(
      (w) =>
        w.severity === 'critical' &&
        w.category === 'rejection' &&
        w.direction === tradeBias,
    )
    if (alignedRejection) score += 8

    // COT commercial aligned
    const cotAligned =
      (tradeBias === 'bullish' && signal.cot.commercialPctile > 60) ||
      (tradeBias === 'bearish' && signal.cot.commercialPctile < 40)
    if (cotAligned) score += 4

    // -- Penalties --

    if (signal.cot.stale) score -= 4

    if (signal.priceStale) score -= 5

    if (signal.grade === 'B') score -= 4

    if (riskReward !== null && riskReward < 1.5) score -= 10

    const highCatalyst = signal.catalysts.find((c) => c.impact === 'high')
    if (highCatalyst) score -= 6

    // Clamp 0-100
    score = clamp(score, 0, 100)

    const confidence = toConfidenceGrade(score)

    // =====================================================================
    // Reasons
    // =====================================================================
    const reasons: string[] = []

    reasons.push(
      `${nearbyBreaker.breakerType === 'bear' ? 'Bear' : 'Bull'} breaker detected -- failed ${nearbyBreaker.originalOB.name} ($${fmtPrice(nearbyBreaker.priceLow)}--$${fmtPrice(nearbyBreaker.priceHigh)})`,
    )

    reasons.push(
      `Entry zone: ${entryZone.source} ($${fmtPrice(entryZone.low)}--$${fmtPrice(entryZone.high)})`,
    )

    if (signal.judasPhase) {
      reasons.push(`Judas phase: ${signal.judasPhase}`)
    }

    reasons.push(`Grade: ${signal.grade} (${signal.score.toFixed(0)}/100)`)

    if (biasAligned) {
      reasons.push(`Session bias aligned: ${signal.sessionBias}`)
    }

    if (cotAligned) {
      reasons.push(
        `COT commercials at ${signal.cot.commercialPctile.toFixed(0)}th percentile -- aligned with ${tradeBias} bias`,
      )
    }

    if (riskReward !== null) {
      reasons.push(`Risk/reward to TP2: 1:${fmtPrice(riskReward)}`)
    }

    // =====================================================================
    // Blockers
    // =====================================================================
    const blockers: string[] = []

    if (signal.cot.stale) {
      blockers.push(`COT data stale (week of ${signal.cot.weekOf})`)
    }

    if (highCatalyst) {
      blockers.push(
        `High-impact catalyst pending: ${highCatalyst.name}${highCatalyst.time ? ` at ${highCatalyst.time}` : ''}`,
      )
    }

    if (riskReward !== null && riskReward < 1.5) {
      blockers.push(
        `R:R below 1.5 (${fmtPrice(riskReward)}) -- suboptimal risk/reward`,
      )
    }

    if (signal.priceStale) {
      blockers.push('Price feed stale -- using cached quote')
    }

    // =====================================================================
    // Direction: bear breaker -> sell, bull breaker -> buy
    // If confidence is 'wait', direction = 'wait'
    // =====================================================================
    const direction =
      confidence === 'wait'
        ? ('wait' as const)
        : nearbyBreaker.breakerType === 'bear'
          ? ('sell' as const)
          : ('buy' as const)

    // =====================================================================
    // Final signal
    // =====================================================================
    return {
      model: 'breaker_block',
      modelLabel: 'Breaker Block',
      direction,
      confidence,
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
    console.error('[breakerSignal] unexpected error:', err)
    return breakerWait('Engine error')
  }
}
