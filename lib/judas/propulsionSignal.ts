/**
 * Propulsion Block Signal Engine
 *
 * Detects a tight consolidation (3-5 candles, range <= $15) followed
 * immediately by a strong impulse ($30+).  When price retraces back to
 * the consolidation zone, enter in the impulse direction.
 *
 * Designed for XAU/USD (gold) on the Aurvex platform.
 * Strict TypeScript -- no `any` types.  File never throws.
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
interface PropulsionBlock {
  priceLow: number
  priceHigh: number
  midpoint: number
  direction: 'bullish' | 'bearish'
  impulseSize: number
  candleCount: number
  startTime: number
}

// ---------------------------------------------------------------------------
// Wait helper
// ---------------------------------------------------------------------------
function propWait(reason: string): EntrySignal {
  return {
    model: 'propulsion_block',
    modelLabel: 'Propulsion Block',
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
// Propulsion block detection
// ---------------------------------------------------------------------------
const MAX_CONSOL_RANGE = 15
const MIN_IMPULSE_MOVE = 30
const MIN_CONSOL_CANDLES = 3
const MAX_CONSOL_CANDLES = 5

function detectPropulsionBlocks(candles: Candle[]): PropulsionBlock[] {
  // Exclude the forming candle
  const closed = candles.slice(0, -1)
  if (closed.length < MIN_CONSOL_CANDLES + 1) return []

  const blocks: PropulsionBlock[] = []

  for (let i = 0; i <= closed.length - MIN_CONSOL_CANDLES - 1; i++) {
    let matched = false

    for (
      let winLen = MIN_CONSOL_CANDLES;
      winLen <= MAX_CONSOL_CANDLES;
      winLen++
    ) {
      if (i + winLen > closed.length) break

      const window = closed.slice(i, i + winLen)
      const windowHigh = Math.max(...window.map((c) => c.high))
      const windowLow = Math.min(...window.map((c) => c.low))
      const range = windowHigh - windowLow

      if (range > MAX_CONSOL_RANGE) continue

      // Check next 1-3 candles after consolidation for impulse
      const afterStart = i + winLen
      const afterEnd = Math.min(afterStart + 3, closed.length)
      if (afterStart >= closed.length) continue

      const afterCandles = closed.slice(afterStart, afterEnd)
      if (afterCandles.length === 0) continue

      const postHigh = Math.max(...afterCandles.map((c) => c.close))
      const postLow = Math.min(...afterCandles.map((c) => c.close))

      // Bullish impulse: breakout above consolidation high
      if (postHigh - windowHigh >= MIN_IMPULSE_MOVE) {
        blocks.push({
          priceLow: windowLow,
          priceHigh: windowHigh,
          midpoint: (windowLow + windowHigh) / 2,
          direction: 'bullish',
          impulseSize: postHigh - windowHigh,
          candleCount: winLen,
          startTime: window[0].time,
        })
        matched = true
        break
      }

      // Bearish impulse: breakdown below consolidation low
      if (windowLow - postLow >= MIN_IMPULSE_MOVE) {
        blocks.push({
          priceLow: windowLow,
          priceHigh: windowHigh,
          midpoint: (windowLow + windowHigh) / 2,
          direction: 'bearish',
          impulseSize: windowLow - postLow,
          candleCount: winLen,
          startTime: window[0].time,
        })
        matched = true
        break
      }
    }

    // Skip past this block if matched so we don't double-count
    if (matched) continue
  }

  // Most-recent first, limited to 3
  return blocks.reverse().slice(0, 3)
}

// ---------------------------------------------------------------------------
// Find nearest target level in trade direction
// ---------------------------------------------------------------------------
function findNearestTargetLevel(
  signal: JudasSignal,
  entryMid: number,
  bias: 'bullish' | 'bearish',
): { price: number; label: string } | null {
  const candidates: { price: number; label: string }[] = []

  for (const level of signal.levels) {
    if (bias === 'bullish') {
      // BSL levels above entry
      if (level.type === 'BSL') {
        const p = level.priceHigh ?? level.price
        if (p > entryMid) {
          candidates.push({ price: p, label: `${level.name} @ $${fmtPrice(p)}` })
        }
      }
    } else {
      // SSL levels below entry
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
export function computePropulsionSignal(
  signal: JudasSignal,
  candles1h: Candle[],
  candles4h: Candle[],
): EntrySignal {
  try {
    // =====================================================================
    // Gate 1: Detect propulsion blocks from both timeframes
    // =====================================================================
    const blocks1h = detectPropulsionBlocks(candles1h)
    const blocks4h = detectPropulsionBlocks(candles4h)

    // Merge most-recent-first
    const allBlocks = [...blocks1h, ...blocks4h].sort(
      (a, b) => b.startTime - a.startTime,
    )

    if (allBlocks.length === 0) {
      return propWait('No propulsion blocks detected on 1H or 4H')
    }

    // =====================================================================
    // Gate 2: Price must be within $8 of a block
    // =====================================================================
    const nearbyBlock = allBlocks.find((block) => {
      return (
        signal.price >= block.priceLow - 8 &&
        signal.price <= block.priceHigh + 8
      )
    })

    if (!nearbyBlock) {
      return propWait('Price not within $8 of any propulsion block')
    }

    // =====================================================================
    // Gate 3: Block direction must align with session bias
    // =====================================================================
    const biasAligned =
      (nearbyBlock.direction === 'bullish' &&
        (signal.sessionBias.includes('Long') ||
          signal.sessionBias.includes('long'))) ||
      (nearbyBlock.direction === 'bearish' &&
        (signal.sessionBias.includes('Short') ||
          signal.sessionBias.includes('short')))

    if (!biasAligned) {
      return propWait(
        `Block direction (${nearbyBlock.direction}) conflicts with session bias (${signal.sessionBias})`,
      )
    }

    // =====================================================================
    // Gate 4: Score must be >= 42
    // =====================================================================
    if (signal.score < 42) {
      return propWait(
        `Score ${signal.score.toFixed(0)}/100 -- minimum 42 required`,
      )
    }

    // =====================================================================
    // Gate 5: Grade must not be F
    // =====================================================================
    if (signal.grade === 'F') {
      return propWait('Grade F -- minimum C required for propulsion entries')
    }

    // =====================================================================
    // Entry zone: the consolidation block itself
    // =====================================================================
    const blockRange = nearbyBlock.priceHigh - nearbyBlock.priceLow

    const entryZone: EntryZoneRange = {
      low: Math.round(nearbyBlock.priceLow * 100) / 100,
      high: Math.round(nearbyBlock.priceHigh * 100) / 100,
      midpoint: Math.round(nearbyBlock.midpoint * 100) / 100,
      source: `Propulsion block (${nearbyBlock.candleCount}-candle, $${fmtPrice(blockRange)} range)`,
    }

    // =====================================================================
    // Stop loss
    // =====================================================================
    const MIN_STOP = 8

    let stopLoss: number
    let stopNote: string

    if (nearbyBlock.direction === 'bullish') {
      stopLoss = nearbyBlock.priceLow - 5
      stopNote = `Below propulsion block low $${fmtPrice(nearbyBlock.priceLow)}`
    } else {
      stopLoss = nearbyBlock.priceHigh + 5
      stopNote = `Above propulsion block high $${fmtPrice(nearbyBlock.priceHigh)}`
    }

    stopLoss = Math.round(stopLoss * 100) / 100

    let risk = Math.abs(nearbyBlock.midpoint - stopLoss)
    if (risk < MIN_STOP) {
      risk = MIN_STOP
      if (nearbyBlock.direction === 'bullish') {
        stopLoss = Math.round((nearbyBlock.midpoint - MIN_STOP) * 100) / 100
        stopNote = `Below propulsion block low $${fmtPrice(nearbyBlock.priceLow)} (min $${MIN_STOP} risk enforced)`
      } else {
        stopLoss = Math.round((nearbyBlock.midpoint + MIN_STOP) * 100) / 100
        stopNote = `Above propulsion block high $${fmtPrice(nearbyBlock.priceHigh)} (min $${MIN_STOP} risk enforced)`
      }
    }

    // =====================================================================
    // TP targets with enforceMin
    // =====================================================================
    const measuredMoveTarget =
      nearbyBlock.direction === 'bullish'
        ? nearbyBlock.midpoint + nearbyBlock.impulseSize
        : nearbyBlock.midpoint - nearbyBlock.impulseSize

    const targets: TPLevel[] = []

    // Helper: enforce minimum R-multiple
    const blockMid = nearbyBlock.midpoint
    const enforceMin = (
      rawPrice: number,
      minR: number,
      direction: 'bullish' | 'bearish',
    ): number => {
      const minPrice =
        direction === 'bullish'
          ? blockMid + risk * minR
          : blockMid - risk * minR

      if (direction === 'bullish') {
        return rawPrice >= minPrice ? rawPrice : minPrice
      }
      return rawPrice <= minPrice ? rawPrice : minPrice
    }

    // TP1: nearest target level, or fallback risk * 1.2.  Min 1.0R.
    const nearestLevel = findNearestTargetLevel(
      signal,
      nearbyBlock.midpoint,
      nearbyBlock.direction,
    )
    const tp1Raw = nearestLevel
      ? nearestLevel.price
      : nearbyBlock.direction === 'bullish'
        ? nearbyBlock.midpoint + risk * 1.2
        : nearbyBlock.midpoint - risk * 1.2

    const tp1Price = enforceMin(tp1Raw, 1.0, nearbyBlock.direction)
    const tp1R = Math.abs(tp1Price - nearbyBlock.midpoint) / risk

    targets.push({
      label: 'TP1',
      price: Math.round(tp1Price * 100) / 100,
      rMultiple: Math.round(tp1R * 10) / 10,
      rationale: nearestLevel
        ? nearestLevel.label
        : `1.2R extension @ $${fmtPrice(tp1Price)}`,
    })

    // TP2: midpoint between TP1 and measured move target.  Min 1.8R.
    const tp2Raw = (tp1Price + measuredMoveTarget) / 2
    const tp2Price = enforceMin(tp2Raw, 1.8, nearbyBlock.direction)
    const tp2R = Math.abs(tp2Price - nearbyBlock.midpoint) / risk

    targets.push({
      label: 'TP2',
      price: Math.round(tp2Price * 100) / 100,
      rMultiple: Math.round(tp2R * 10) / 10,
      rationale: `Midpoint to measured move @ $${fmtPrice(tp2Price)}`,
    })

    // TP3: full measured move.  Min 2.8R.
    const tp3Price = enforceMin(measuredMoveTarget, 2.8, nearbyBlock.direction)
    const tp3R = Math.abs(tp3Price - nearbyBlock.midpoint) / risk

    targets.push({
      label: 'TP3',
      price: Math.round(tp3Price * 100) / 100,
      rMultiple: Math.round(tp3R * 10) / 10,
      rationale: `Full measured move ($${fmtPrice(nearbyBlock.impulseSize)} impulse)`,
    })

    // =====================================================================
    // R:R (against TP2)
    // =====================================================================
    const tp2 = targets.find((t) => t.label === 'TP2')
    const riskReward =
      tp2 && risk > 0
        ? Math.round(
            (Math.abs(tp2.price - nearbyBlock.midpoint) / risk) * 100,
          ) / 100
        : null

    // =====================================================================
    // Confidence scoring
    // =====================================================================
    let score = 50

    // -- Boosts --

    // Grade A++ or A+
    if (signal.grade === 'A++' || signal.grade === 'A+') score += 10

    // High signal score
    if (signal.score >= 65) score += 8

    // Session aligned AND post-sweep
    const sessionAligned =
      (nearbyBlock.direction === 'bullish' &&
        signal.sessionBias.includes('Long')) ||
      (nearbyBlock.direction === 'bearish' &&
        signal.sessionBias.includes('Short'))
    const postSweep = signal.judasPhase.includes('Post-sweep')
    if (sessionAligned && postSweep) score += 10

    // Tighter consolidation = better
    if (nearbyBlock.candleCount <= 3) score += 5

    // Impulse size bonuses
    if (nearbyBlock.impulseSize >= 40) score += 6
    if (nearbyBlock.impulseSize >= 60) score += 4

    // R:R bonuses
    if (riskReward !== null && riskReward >= 2.5) score += 6
    if (riskReward !== null && riskReward >= 3.5) score += 4

    // Critical rejection aligned with direction
    const alignedRejection = signal.warnings.find(
      (w) =>
        w.severity === 'critical' &&
        w.category === 'rejection' &&
        w.direction === nearbyBlock.direction,
    )
    if (alignedRejection) score += 8

    // COT commercial alignment
    const cotAligned =
      (nearbyBlock.direction === 'bullish' &&
        signal.cot.commercialPctile > 60) ||
      (nearbyBlock.direction === 'bearish' &&
        signal.cot.commercialPctile < 40)
    if (cotAligned) score += 4

    // -- Penalties --

    // COT stale
    if (signal.cot.stale) score -= 4

    // Price stale
    if (signal.priceStale) score -= 5

    // Weak grade
    if (signal.grade === 'B' || signal.grade === 'C') score -= 5

    // Low R:R
    if (riskReward !== null && riskReward < 1.5) score -= 10

    // High-impact catalyst pending
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
      `Propulsion block: ${nearbyBlock.candleCount}-candle consolidation, $${fmtPrice(blockRange)} range, $${fmtPrice(nearbyBlock.impulseSize)} impulse`,
    )

    reasons.push(`Session bias: ${signal.sessionBias}`)

    reasons.push(`Judas phase: ${signal.judasPhase}`)

    if (cotAligned) {
      reasons.push(
        `COT commercials at ${signal.cot.commercialPctile.toFixed(0)}th percentile -- aligned with ${nearbyBlock.direction} bias`,
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

    if (signal.grade === 'B' || signal.grade === 'C') {
      blockers.push(
        `Grade ${signal.grade} -- A or higher recommended for propulsion entries`,
      )
    }

    if (riskReward !== null && riskReward < 1.5) {
      blockers.push(
        `R:R below 1.5 (${fmtPrice(riskReward)}) -- suboptimal risk/reward`,
      )
    }

    // =====================================================================
    // Direction
    // =====================================================================
    const direction =
      confidenceGrade === 'wait'
        ? ('wait' as const)
        : nearbyBlock.direction === 'bullish'
          ? ('buy' as const)
          : ('sell' as const)

    // =====================================================================
    // Final signal
    // =====================================================================
    return {
      model: 'propulsion_block',
      modelLabel: 'Propulsion Block',
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
    console.error('[propulsionSignal] unexpected error:', err)
    return propWait('Engine error')
  }
}
