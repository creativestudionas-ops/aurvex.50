/**
 * FVG Fill + Continuation Signal Engine
 *
 * Detects when price retraces into an unmitigated Fair Value Gap and
 * provides entry signals for continuation in the FVG direction.
 *
 * Designed for XAU/USD (gold) on the Aurvex platform.
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
// Wait helper
// ---------------------------------------------------------------------------
function fvgWait(reason: string): EntrySignal {
  return {
    model: 'fvg_fill',
    modelLabel: 'FVG Fill',
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
// Bias derivation
// ---------------------------------------------------------------------------
type Bias = 'bullish' | 'bearish'

function deriveFVGBias(signal: JudasSignal, fvg: SMCLevel): Bias {
  if (fvg.direction === 'up') return 'bullish'
  if (fvg.direction === 'down') return 'bearish'
  if (signal.sessionBias.includes('Long')) return 'bullish'
  if (signal.sessionBias.includes('Short')) return 'bearish'
  return 'bullish'
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
// Find nearest target level in trade direction
// ---------------------------------------------------------------------------
function findNearestTargetLevel(
  signal: JudasSignal,
  entryMid: number,
  bias: Bias,
): { price: number; label: string } | null {
  const candidates: { price: number; label: string }[] = []

  for (const level of signal.levels) {
    if (bias === 'bullish') {
      // BSL levels or session highs above entry
      if (level.type === 'BSL') {
        const p = level.priceHigh ?? level.price
        if (p > entryMid) {
          candidates.push({ price: p, label: `${level.name} @ $${fmtPrice(p)}` })
        }
      }
    } else {
      // SSL levels or session lows below entry
      if (level.type === 'SSL') {
        const p = level.priceLow ?? level.price
        if (p < entryMid) {
          candidates.push({ price: p, label: `${level.name} @ $${fmtPrice(p)}` })
        }
      }
    }
  }

  // Add session highs/lows as candidates
  for (const session of signal.sessions) {
    if (bias === 'bullish' && session.high > entryMid) {
      candidates.push({
        price: session.high,
        label: `${session.label} session high @ $${fmtPrice(session.high)}`,
      })
    }
    if (bias === 'bearish' && session.low < entryMid) {
      candidates.push({
        price: session.low,
        label: `${session.label} session low @ $${fmtPrice(session.low)}`,
      })
    }
  }

  if (candidates.length === 0) return null

  // Sort by distance from entry (nearest first)
  if (bias === 'bullish') {
    candidates.sort((a, b) => a.price - b.price)
  } else {
    candidates.sort((a, b) => b.price - a.price)
  }

  return candidates[0]
}

// ---------------------------------------------------------------------------
// Compute displacement size from candle data
// ---------------------------------------------------------------------------
function computeDisplacementSize(candles: Candle[]): number | null {
  // Scan for a 3-candle FVG pattern (gap between candle[i].high and candle[i+2].low)
  for (let i = candles.length - 3; i >= 0; i--) {
    const first = candles[i]
    const third = candles[i + 2]

    // Bullish FVG: gap up (candle[i].high < candle[i+2].low)
    if (first.high < third.low) {
      return Math.abs(third.close - first.open)
    }

    // Bearish FVG: gap down (candle[i].low > candle[i+2].high)
    if (first.low > third.high) {
      return Math.abs(third.close - first.open)
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// TP target computation
// ---------------------------------------------------------------------------
function computeTargets(
  signal: JudasSignal,
  entryZone: EntryZoneRange,
  risk: number,
  bias: Bias,
  candles: Candle[],
): TPLevel[] {
  const entryMid = entryZone.midpoint
  const targets: TPLevel[] = []

  // TP1: FVG outer edge, minimum 1.0R
  const minTP1 = bias === 'bullish'
    ? entryMid + risk * 1.0
    : entryMid - risk * 1.0
  const fvgEdge = bias === 'bullish' ? entryZone.high : entryZone.low
  const tp1Price =
    (bias === 'bullish' && fvgEdge >= minTP1) ||
    (bias === 'bearish' && fvgEdge <= minTP1)
      ? fvgEdge
      : minTP1
  const tp1R = Math.abs(tp1Price - entryMid) / risk
  targets.push({
    label: 'TP1',
    price: Math.round(tp1Price * 100) / 100,
    rMultiple: Math.round(tp1R * 10) / 10,
    rationale: tp1Price === fvgEdge
      ? `FVG outer edge @ $${fmtPrice(fvgEdge)}`
      : `1.0R extension @ $${fmtPrice(tp1Price)}`,
  })

  // TP2: nearest SMC level in trade direction, minimum 1.5R
  const minTP2R = 1.5
  const minTP2 = bias === 'bullish'
    ? entryMid + risk * minTP2R
    : entryMid - risk * minTP2R
  const nearestLevel = findNearestTargetLevel(signal, entryMid, bias)
  let tp2Price: number
  let tp2Rationale: string
  if (
    nearestLevel &&
    ((bias === 'bullish' && nearestLevel.price >= minTP2) ||
     (bias === 'bearish' && nearestLevel.price <= minTP2))
  ) {
    tp2Price = nearestLevel.price
    tp2Rationale = nearestLevel.label
  } else {
    tp2Price = minTP2
    tp2Rationale = `1.5R extension @ $${fmtPrice(minTP2)}`
  }
  const tp2R = Math.abs(tp2Price - entryMid) / risk
  targets.push({
    label: 'TP2',
    price: Math.round(tp2Price * 100) / 100,
    rMultiple: Math.round(tp2R * 10) / 10,
    rationale: tp2Rationale,
  })

  // TP3: displacement measured move, minimum 2.5R
  const minTP3R = 2.5
  const minTP3 = bias === 'bullish'
    ? entryMid + risk * minTP3R
    : entryMid - risk * minTP3R
  const displacement = computeDisplacementSize(candles)
  let tp3Price: number
  let tp3Rationale: string

  if (displacement !== null) {
    const displacementTarget = bias === 'bullish'
      ? entryMid + displacement
      : entryMid - displacement
    if (
      (bias === 'bullish' && displacementTarget >= minTP3) ||
      (bias === 'bearish' && displacementTarget <= minTP3)
    ) {
      tp3Price = displacementTarget
      tp3Rationale = `Displacement measured move ($${fmtPrice(displacement)})`
    } else {
      tp3Price = minTP3
      tp3Rationale = `2.5R extension @ $${fmtPrice(minTP3)}`
    }
  } else {
    // Fallback: risk * 3
    const fallbackTarget = bias === 'bullish'
      ? entryMid + risk * 3
      : entryMid - risk * 3
    if (
      (bias === 'bullish' && fallbackTarget >= minTP3) ||
      (bias === 'bearish' && fallbackTarget <= minTP3)
    ) {
      tp3Price = fallbackTarget
      tp3Rationale = `3.0R extension @ $${fmtPrice(fallbackTarget)}`
    } else {
      tp3Price = minTP3
      tp3Rationale = `2.5R extension @ $${fmtPrice(minTP3)}`
    }
  }

  const tp3R = Math.abs(tp3Price - entryMid) / risk
  targets.push({
    label: 'TP3',
    price: Math.round(tp3Price * 100) / 100,
    rMultiple: Math.round(tp3R * 10) / 10,
    rationale: tp3Rationale,
  })

  return targets
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------
function computeConfidence(
  signal: JudasSignal,
  fvgBias: Bias,
  rr: number | null,
): { score: number; grade: EntryConfidence } {
  let score = 50

  // --- Boosts ---

  if (signal.score >= 65) score += 10
  if (signal.score >= 75) score += 8

  if (signal.judasPhase.includes('Post-sweep')) score += 12

  // Session bias aligned with FVG direction
  const biasAligned =
    (fvgBias === 'bullish' && signal.sessionBias.includes('Long')) ||
    (fvgBias === 'bearish' && signal.sessionBias.includes('Short'))
  if (biasAligned) score += 6

  // Critical rejection in FVG direction
  const criticalBiasRejection = signal.warnings.find(
    (w) =>
      w.severity === 'critical' &&
      w.category === 'rejection' &&
      w.direction === fvgBias,
  )
  if (criticalBiasRejection) score += 10

  // R:R boost
  if (rr !== null && rr >= 2.0) score += 5

  // COT commercial aligned
  const cotAligned =
    (fvgBias === 'bullish' && signal.cot.commercialPctile > 60) ||
    (fvgBias === 'bearish' && signal.cot.commercialPctile < 40)
  if (cotAligned) score += 4

  // --- Penalties ---

  if (signal.cot.stale) score -= 4

  if (signal.priceStale) score -= 5

  if (rr !== null && rr < 1.5) score -= 10

  const highCatalyst = signal.catalysts.find((c) => c.impact === 'high')
  if (highCatalyst) score -= 6

  // Clamp to 0-100
  score = clamp(score, 0, 100)

  return { score, grade: toConfidenceGrade(score) }
}

// ---------------------------------------------------------------------------
// Reasons & blockers
// ---------------------------------------------------------------------------
function buildReasons(
  signal: JudasSignal,
  fvgBias: Bias,
  fvg: SMCLevel,
  entryZone: EntryZoneRange,
  rr: number | null,
): string[] {
  const reasons: string[] = []

  // FVG retest info
  const fvgLow = fvg.priceLow ?? fvg.price
  const fvgHigh = fvg.priceHigh ?? fvg.price
  reasons.push(
    `Price retesting ${fvgBias} FVG $${fmtPrice(fvgLow)}\u2013$${fmtPrice(fvgHigh)}`,
  )

  // Session bias alignment
  const biasAligned =
    (fvgBias === 'bullish' && signal.sessionBias.includes('Long')) ||
    (fvgBias === 'bearish' && signal.sessionBias.includes('Short'))
  if (biasAligned) {
    reasons.push(`Session bias aligned: ${signal.sessionBias}`)
  }

  // Judas phase info
  if (signal.judasPhase.includes('Post-sweep')) {
    reasons.push(
      `Judas sweep confirmed \u2014 ${fvgBias === 'bullish' ? 'long' : 'short'} bias active`,
    )
  }

  // COT alignment
  const cotAligned =
    (fvgBias === 'bullish' && signal.cot.commercialPctile > 60) ||
    (fvgBias === 'bearish' && signal.cot.commercialPctile < 40)
  if (cotAligned) {
    reasons.push(
      `COT commercials at ${signal.cot.commercialPctile.toFixed(0)}th percentile \u2014 aligned with ${fvgBias} bias`,
    )
  }

  // R:R info
  if (rr !== null) {
    reasons.push(`Risk/reward to TP2: 1:${fmtPrice(rr)}`)
  }

  // Entry zone detail
  reasons.push(
    `Entry zone: ${entryZone.source} ($${fmtPrice(entryZone.low)}\u2013$${fmtPrice(entryZone.high)})`,
  )

  return reasons
}

function buildBlockers(
  signal: JudasSignal,
  fvgBias: Bias,
  rr: number | null,
): string[] {
  const blockers: string[] = []

  if (signal.cot.stale) {
    blockers.push(`COT data stale (week of ${signal.cot.weekOf})`)
  }

  if (signal.priceStale) {
    blockers.push('Price feed stale \u2014 using cached quote')
  }

  const highCatalyst = signal.catalysts.find((c) => c.impact === 'high')
  if (highCatalyst) {
    blockers.push(
      `High-impact catalyst pending: ${highCatalyst.name}${highCatalyst.time ? ` at ${highCatalyst.time}` : ''}`,
    )
  }

  if (rr !== null && rr < 1.5) {
    blockers.push(`R:R below 1.5 (${fmtPrice(rr)}) \u2014 suboptimal risk/reward`)
  }

  return blockers
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------
export function computeFVGSignal(
  signal: JudasSignal,
  candles1h: Candle[],
  candles4h: Candle[],
): EntrySignal {
  try {
    // =====================================================================
    // Gate 1: Must have at least one active FVG
    // =====================================================================
    const activeFVGs = signal.levels.filter(
      (l) => l.type === 'FVG' && l.active,
    )
    if (activeFVGs.length === 0) {
      return fvgWait('No active FVG levels found')
    }

    // =====================================================================
    // Gate 2: Score must be >= 45
    // =====================================================================
    if (signal.score < 45) {
      return fvgWait(`Score ${signal.score.toFixed(0)}/100 \u2014 minimum 45 required`)
    }

    // =====================================================================
    // Gate 3: Price must be inside or within $8 of an FVG
    // =====================================================================
    const nearbyFVG = activeFVGs.find((l) => {
      const lo = l.priceLow ?? l.price
      const hi = l.priceHigh ?? l.price
      return signal.price >= lo - 8 && signal.price <= hi + 8
    })
    if (!nearbyFVG) {
      return fvgWait('Price not within range of any active FVG')
    }

    // =====================================================================
    // Derive FVG bias
    // =====================================================================
    const fvgBias = deriveFVGBias(signal, nearbyFVG)

    // =====================================================================
    // Gate 4: No critical/high warning in opposite direction to FVG bias
    // =====================================================================
    const oppositeDir: Bias = fvgBias === 'bullish' ? 'bearish' : 'bullish'
    const conflicting = signal.warnings.find(
      (w) =>
        (w.severity === 'critical' || w.severity === 'high') &&
        w.direction === oppositeDir,
    )
    if (conflicting) {
      return fvgWait(
        `${conflicting.severity} ${oppositeDir} warning: ${conflicting.title}`,
      )
    }

    // =====================================================================
    // Entry zone
    // =====================================================================
    const fvgLow = nearbyFVG.priceLow ?? nearbyFVG.price
    const fvgHigh = nearbyFVG.priceHigh ?? nearbyFVG.price
    const midpoint = (fvgLow + fvgHigh) / 2

    const entryZone: EntryZoneRange = {
      low: Math.round(fvgLow * 100) / 100,
      high: Math.round(fvgHigh * 100) / 100,
      midpoint: Math.round(midpoint * 100) / 100,
      source: `FVG $${fmtPrice(fvgLow)}\u2013$${fmtPrice(fvgHigh)}`,
    }

    // =====================================================================
    // Stop loss
    // =====================================================================
    const MIN_STOP = 8
    let stopLoss: number
    let stopNote: string

    if (fvgBias === 'bullish') {
      stopLoss = entryZone.low - 5
      stopNote = `Below FVG low $${fmtPrice(entryZone.low)}`
    } else {
      stopLoss = entryZone.high + 5
      stopNote = `Above FVG high $${fmtPrice(entryZone.high)}`
    }

    stopLoss = Math.round(stopLoss * 100) / 100

    let risk = Math.abs(midpoint - stopLoss)
    if (risk < MIN_STOP) {
      risk = MIN_STOP
      if (fvgBias === 'bullish') {
        stopLoss = Math.round((midpoint - MIN_STOP) * 100) / 100
        stopNote = `Below FVG low $${fmtPrice(entryZone.low)} (min $${MIN_STOP} risk enforced)`
      } else {
        stopLoss = Math.round((midpoint + MIN_STOP) * 100) / 100
        stopNote = `Above FVG high $${fmtPrice(entryZone.high)} (min $${MIN_STOP} risk enforced)`
      }
    }

    // =====================================================================
    // TP targets — use 1h candles first, fall back to 4h
    // =====================================================================
    const candlesForDisplacement = candles1h.length >= 3 ? candles1h : candles4h
    const targets = computeTargets(
      signal,
      entryZone,
      risk,
      fvgBias,
      candlesForDisplacement,
    )

    // =====================================================================
    // R:R (against TP2)
    // =====================================================================
    const tp2 = targets.find((t) => t.label === 'TP2')
    const riskReward =
      tp2 && risk > 0
        ? Math.round((Math.abs(tp2.price - entryZone.midpoint) / risk) * 100) / 100
        : null

    // =====================================================================
    // Confidence
    // =====================================================================
    const confidence = computeConfidence(signal, fvgBias, riskReward)

    // =====================================================================
    // Reasons & blockers
    // =====================================================================
    const reasons = buildReasons(signal, fvgBias, nearbyFVG, entryZone, riskReward)
    const blockers = buildBlockers(signal, fvgBias, riskReward)

    // =====================================================================
    // If confidence maps to 'wait', set direction to 'wait'
    // =====================================================================
    if (confidence.grade === 'wait') {
      return {
        model: 'fvg_fill',
        modelLabel: 'FVG Fill',
        direction: 'wait',
        confidence: 'wait',
        confidenceScore: confidence.score,
        entryZone,
        stopLoss,
        stopNote,
        targets,
        riskReward,
        reasons,
        blockers,
        computedAt: new Date().toISOString(),
      }
    }

    // =====================================================================
    // Final signal
    // =====================================================================
    return {
      model: 'fvg_fill',
      modelLabel: 'FVG Fill',
      direction: fvgBias === 'bullish' ? 'buy' : 'sell',
      confidence: confidence.grade,
      confidenceScore: confidence.score,
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
    console.error('[fvgSignal] unexpected error:', err)
    return fvgWait('Engine error')
  }
}
