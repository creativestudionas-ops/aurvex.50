/**
 * Judas Entry Signal Computation Engine
 *
 * Takes a fully-assembled JudasSignal (minus the `entry` field) and produces
 * an EntrySignal telling the trader to BUY, SELL, or WAIT.
 *
 * Designed for XAU/USD (gold) on the Aurvex platform.
 */

import type {
  JudasSignal,
  EntrySignal,
  EntryDirection,
  EntryConfidence,
  EntryZoneRange,
  TPLevel,
  SMCLevel,
  SignalGrade,
  CandleWarning,
} from '@/types/judas'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
type EntryInput = Omit<JudasSignal, 'entry'>

// ---------------------------------------------------------------------------
// Wait helper \u2014 exported so fetchJudasSignal can use it as a fallback
// ---------------------------------------------------------------------------
export function waitSignal(reason: string): EntrySignal {
  return {
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
// Internal helpers
// ---------------------------------------------------------------------------
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

function fmtPrice(n: number): string {
  return n.toFixed(2)
}

function fmtInt(n: number): string {
  return n.toFixed(0)
}

type Bias = 'bullish' | 'bearish'

function deriveBiasDirection(signal: EntryInput): Bias {
  if (signal.judasPhase.includes('long')) return 'bullish'
  if (signal.judasPhase.includes('short')) return 'bearish'
  if (signal.sessionBias.includes('Long')) return 'bullish'
  if (signal.sessionBias.includes('Short')) return 'bearish'
  return 'bullish'
}

function isPassingGrade(grade: SignalGrade): boolean {
  return grade === 'A' || grade === 'A+' || grade === 'A++'
}

function hasActiveOBorFVG(levels: SMCLevel[]): boolean {
  return levels.some(
    (l) =>
      l.active &&
      (l.type === 'OB_bull' || l.type === 'OB_bear' || l.type === 'FVG'),
  )
}

function hasConflictingWarning(
  warnings: CandleWarning[],
  bias: Bias,
): CandleWarning | undefined {
  const oppositeDir = bias === 'bullish' ? 'bearish' : 'bullish'
  return warnings.find(
    (w) =>
      (w.severity === 'critical' || w.severity === 'high') &&
      w.direction === oppositeDir,
  )
}

// ---------------------------------------------------------------------------
// Entry zone computation
// ---------------------------------------------------------------------------
interface CandidateZone {
  low: number
  high: number
  midpoint: number
  source: string
}

function gatherCandidateZones(
  signal: EntryInput,
  bias: Bias,
): CandidateZone[] {
  const zones: CandidateZone[] = []

  // 1. Active OB in bias direction
  const obType = bias === 'bullish' ? 'OB_bull' : 'OB_bear'
  const obLevels = signal.levels.filter((l) => l.type === obType && l.active)
  for (const ob of obLevels) {
    const lo = ob.priceLow ?? ob.price
    const hi = ob.priceHigh ?? ob.price
    zones.push({
      low: lo,
      high: hi,
      midpoint: (lo + hi) / 2,
      source: ob.name,
    })
  }

  // 2. Active FVG
  const fvgLevels = signal.levels.filter(
    (l) => l.type === 'FVG' && l.active,
  )
  for (const fvg of fvgLevels) {
    const lo = fvg.priceLow ?? fvg.price
    const hi = fvg.priceHigh ?? fvg.price
    zones.push({
      low: lo,
      high: hi,
      midpoint: (lo + hi) / 2,
      source: `FVG $${fmtPrice(lo)}\u2013$${fmtPrice(hi)}`,
    })
  }

  // 3. Fallback: session-derived zone
  if (bias === 'bullish') {
    // SSL reclaim zone around London low
    const sessionLow = signal.sessions[1].low
    const lo = sessionLow - 2
    const hi = sessionLow + 8
    zones.push({
      low: lo,
      high: hi,
      midpoint: (lo + hi) / 2,
      source: `SSL reclaim \u2014 London low $${fmtPrice(sessionLow)}`,
    })
  } else {
    // BSL retest zone
    const lo = signal.price - 8
    const hi = signal.price + 2
    zones.push({
      low: lo,
      high: hi,
      midpoint: (lo + hi) / 2,
      source: `BSL retest zone $${fmtPrice(lo)}\u2013$${fmtPrice(hi)}`,
    })
  }

  return zones
}

function pickBestZone(
  zones: CandidateZone[],
  price: number,
  bias: Bias,
): CandidateZone | null {
  // Filter by proximity constraint
  const valid = zones.filter((z) => {
    if (bias === 'bullish') return z.midpoint <= price + 15
    return z.midpoint >= price - 15
  })

  if (valid.length === 0) return null

  // Pick zone whose midpoint is closest to current price
  valid.sort(
    (a, b) => Math.abs(a.midpoint - price) - Math.abs(b.midpoint - price),
  )
  return valid[0]
}

// ---------------------------------------------------------------------------
// TP target computation
// ---------------------------------------------------------------------------
function computeTargets(
  signal: EntryInput,
  entryMid: number,
  risk: number,
  bias: Bias,
): TPLevel[] {
  // Gather candidate resistance/support levels
  const candidates: { price: number; label: string }[] = []

  for (const level of signal.levels) {
    if (bias === 'bullish') {
      // Find levels ABOVE entry: BSL, session highs, OB_bear
      if (
        level.type === 'BSL' ||
        level.type === 'OB_bear'
      ) {
        const p = level.priceHigh ?? level.price
        if (p > entryMid) {
          candidates.push({ price: p, label: `${level.name} @ $${fmtPrice(p)}` })
        }
      }
    } else {
      // Find levels BELOW entry: SSL, session lows, OB_bull
      if (
        level.type === 'SSL' ||
        level.type === 'OB_bull'
      ) {
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

  // Sort by distance from entry (nearest first)
  if (bias === 'bullish') {
    candidates.sort((a, b) => a.price - b.price)
  } else {
    candidates.sort((a, b) => b.price - a.price)
  }

  const targets: TPLevel[] = []

  // TP1: nearest resistance, minimum 1.0R
  const minTP1 = bias === 'bullish'
    ? entryMid + risk * 1.0
    : entryMid - risk * 1.0
  const tp1Candidate = candidates[0]
  const tp1Price =
    tp1Candidate &&
    ((bias === 'bullish' && tp1Candidate.price >= minTP1) ||
     (bias === 'bearish' && tp1Candidate.price <= minTP1))
      ? tp1Candidate.price
      : minTP1
  const tp1R = Math.abs(tp1Price - entryMid) / risk
  targets.push({
    label: 'TP1',
    price: Math.round(tp1Price * 100) / 100,
    rMultiple: Math.round(tp1R * 10) / 10,
    rationale: tp1Candidate
      ? tp1Candidate.label
      : `1.0R extension @ $${fmtPrice(tp1Price)}`,
  })

  // TP2: next resistance, minimum 1.5R
  const minTP2 = bias === 'bullish'
    ? entryMid + risk * 1.5
    : entryMid - risk * 1.5
  const tp2Candidate = candidates.find((c) =>
    bias === 'bullish' ? c.price > tp1Price : c.price < tp1Price,
  )
  const tp2Price =
    tp2Candidate &&
    ((bias === 'bullish' && tp2Candidate.price >= minTP2) ||
     (bias === 'bearish' && tp2Candidate.price <= minTP2))
      ? tp2Candidate.price
      : minTP2
  const tp2R = Math.abs(tp2Price - entryMid) / risk
  targets.push({
    label: 'TP2',
    price: Math.round(tp2Price * 100) / 100,
    rMultiple: Math.round(tp2R * 10) / 10,
    rationale: tp2Candidate
      ? tp2Candidate.label
      : `1.5R extension @ $${fmtPrice(tp2Price)}`,
  })

  // TP3: next resistance or 2.5R extension
  const minTP3 = bias === 'bullish'
    ? entryMid + risk * 2.5
    : entryMid - risk * 2.5
  const tp3Candidate = candidates.find((c) =>
    bias === 'bullish' ? c.price > tp2Price : c.price < tp2Price,
  )
  const tp3Price =
    tp3Candidate &&
    ((bias === 'bullish' && tp3Candidate.price >= minTP3) ||
     (bias === 'bearish' && tp3Candidate.price <= minTP3))
      ? tp3Candidate.price
      : minTP3
  const tp3R = Math.abs(tp3Price - entryMid) / risk
  targets.push({
    label: 'TP3',
    price: Math.round(tp3Price * 100) / 100,
    rMultiple: Math.round(tp3R * 10) / 10,
    rationale: tp3Candidate
      ? tp3Candidate.label
      : `2.5R extension @ $${fmtPrice(tp3Price)}`,
  })

  return targets
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------
function computeConfidence(
  signal: EntryInput,
  bias: Bias,
  rr: number | null,
): { score: number; grade: EntryConfidence } {
  let score = signal.score

  // --- Boosts ---

  // Post-sweep
  if (signal.judasPhase.includes('Post-sweep')) {
    score += 8
  }

  // A++ or A+ grade
  if (signal.grade === 'A++' || signal.grade === 'A+') {
    score += 6
  }

  // COT commercial positioning aligned with bias
  if (bias === 'bullish' && signal.cot.commercialPctile > 60) {
    score += 5
  } else if (bias === 'bearish' && signal.cot.commercialPctile < 40) {
    score += 5
  }

  // DXY directional alignment
  if (bias === 'bullish' && signal.macro.dxyChange < 0) {
    score += 3
  } else if (bias === 'bearish' && signal.macro.dxyChange > 0) {
    score += 3
  }

  // Critical rejection warning in bias direction
  const criticalBiasRejection = signal.warnings.find(
    (w) =>
      w.severity === 'critical' &&
      w.category === 'rejection' &&
      w.direction === bias,
  )
  if (criticalBiasRejection) {
    score += 8
  }

  // Pin bar in bias direction
  const pinBarBias = signal.warnings.find(
    (w) => w.type === 'pin_bar' && w.direction === bias,
  )
  if (pinBarBias) {
    score += 4
  }

  // R:R boosts
  if (rr !== null && rr >= 2.0) {
    score += 4
  }
  if (rr !== null && rr >= 3.0) {
    score += 4
  }

  // --- Penalties ---

  // COT stale
  if (signal.cot.stale) {
    score -= 5
  }

  // Macro stale
  if (signal.macro.stale) {
    score -= 3
  }

  // Price stale
  if (signal.priceStale) {
    score -= 4
  }

  // Critical warning in opposite direction
  const oppositeDir = bias === 'bullish' ? 'bearish' : 'bullish'
  const criticalOpposite = signal.warnings.find(
    (w) => w.severity === 'critical' && w.direction === oppositeDir,
  )
  if (criticalOpposite) {
    score -= 12
  }

  // Grade A only (not A+ or A++)
  if (signal.grade === 'A') {
    score -= 4
  }

  // Low R:R
  if (rr !== null && rr < 1.5) {
    score -= 8
  }

  // High-impact catalyst pending
  const highCatalyst = signal.catalysts.find((c) => c.impact === 'high')
  if (highCatalyst) {
    score -= 6
  }

  // Clamp to 0-100
  score = clamp(score, 0, 100)

  // Map to grade
  let grade: EntryConfidence
  if (score >= 85) grade = 'A++'
  else if (score >= 75) grade = 'A+'
  else if (score >= 62) grade = 'A'
  else if (score >= 50) grade = 'B'
  else grade = 'wait'

  return { score, grade }
}

// ---------------------------------------------------------------------------
// Reasons & blockers
// ---------------------------------------------------------------------------
function buildReasons(
  signal: EntryInput,
  bias: Bias,
  zone: EntryZoneRange,
  rr: number | null,
): string[] {
  const reasons: string[] = []

  // Sweep confirmed
  if (signal.judasPhase.includes('Post-sweep')) {
    reasons.push(
      `Judas sweep confirmed \u2014 ${bias === 'bullish' ? 'long' : 'short'} bias active`,
    )
  }

  // Entry zone detail
  reasons.push(
    `Entry zone: ${zone.source} ($${fmtPrice(zone.low)}\u2013$${fmtPrice(zone.high)})`,
  )

  // Rejection warning in bias direction
  const biasRejection = signal.warnings.find(
    (w) => w.category === 'rejection' && w.direction === bias,
  )
  if (biasRejection) {
    reasons.push(`${biasRejection.title} \u2014 ${biasRejection.note}`)
  }

  // COT alignment
  if (
    (bias === 'bullish' && signal.cot.commercialPctile > 60) ||
    (bias === 'bearish' && signal.cot.commercialPctile < 40)
  ) {
    reasons.push(
      `COT commercials at ${fmtInt(signal.cot.commercialPctile)}th percentile \u2014 aligned with ${bias} bias`,
    )
  }

  // DXY alignment
  if (
    (bias === 'bullish' && signal.macro.dxyChange < 0) ||
    (bias === 'bearish' && signal.macro.dxyChange > 0)
  ) {
    reasons.push(
      `DXY ${signal.macro.dxyChange >= 0 ? '+' : ''}${fmtPrice(signal.macro.dxyChange)}% \u2014 tailwind for gold`,
    )
  }

  // Grade
  reasons.push(`Signal grade: ${signal.grade} (${fmtInt(signal.score)}/100)`)

  // R:R
  if (rr !== null) {
    reasons.push(`Risk/reward to TP2: 1:${fmtPrice(rr)}`)
  }

  return reasons
}

function buildBlockers(
  signal: EntryInput,
  bias: Bias,
  rr: number | null,
): string[] {
  const blockers: string[] = []

  // COT stale
  if (signal.cot.stale) {
    blockers.push(`COT data stale (week of ${signal.cot.weekOf})`)
  }

  // High-impact catalyst pending
  const highCatalyst = signal.catalysts.find((c) => c.impact === 'high')
  if (highCatalyst) {
    blockers.push(
      `High-impact catalyst pending: ${highCatalyst.name}${highCatalyst.time ? ` at ${highCatalyst.time}` : ''}`,
    )
  }

  // Low R:R
  if (rr !== null && rr < 1.5) {
    blockers.push(`R:R below 1.5 (${fmtPrice(rr)}) \u2014 suboptimal risk/reward`)
  }

  // Grade A only
  if (signal.grade === 'A') {
    blockers.push('Grade A only \u2014 not A+ or A++')
  }

  // Macro stale
  if (signal.macro.stale) {
    blockers.push('Macro data stale \u2014 DXY/yield readings may be outdated')
  }

  // Price stale
  if (signal.priceStale) {
    blockers.push('Price feed stale \u2014 using cached quote')
  }

  // Opposite-direction warning
  const oppositeDir = bias === 'bullish' ? 'bearish' : 'bullish'
  const oppositeWarning = signal.warnings.find(
    (w) =>
      (w.severity === 'critical' || w.severity === 'high') &&
      w.direction === oppositeDir,
  )
  if (oppositeWarning) {
    blockers.push(
      `${oppositeWarning.severity} warning in ${oppositeDir} direction: ${oppositeWarning.title}`,
    )
  }

  return blockers
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------
export function computeEntrySignal(
  signal: EntryInput,
  _candles4h: unknown[],
): EntrySignal {
  try {
    // =====================================================================
    // Gate checks \u2014 bail early if ANY fail
    // =====================================================================

    // 1. Judas phase must include 'Post-sweep'
    if (!signal.judasPhase.includes('Post-sweep')) {
      return waitSignal('Judas phase not confirmed \u2014 awaiting sweep')
    }

    // 2. Grade must be A, A+, or A++
    if (!isPassingGrade(signal.grade)) {
      return waitSignal(`Grade ${signal.grade} \u2014 minimum A required`)
    }

    // 3. Score >= 55
    if (signal.score < 55) {
      return waitSignal(`Score ${fmtInt(signal.score)}/100 \u2014 minimum 55 required`)
    }

    // 4. At least one active OB or FVG
    if (!hasActiveOBorFVG(signal.levels)) {
      return waitSignal('No active OB or FVG near price')
    }

    // 5. No critical/high warning in OPPOSITE direction to bias
    const bias = deriveBiasDirection(signal)
    const conflicting = hasConflictingWarning(signal.warnings, bias)
    if (conflicting) {
      return waitSignal('Conflicting high-severity warning on opposite side')
    }

    // =====================================================================
    // Direction
    // =====================================================================
    const direction: EntryDirection = bias === 'bullish' ? 'buy' : 'sell'

    // =====================================================================
    // Entry zone
    // =====================================================================
    const candidateZones = gatherCandidateZones(signal, bias)
    const bestZone = pickBestZone(candidateZones, signal.price, bias)

    if (!bestZone) {
      return waitSignal('No suitable entry zone found near price')
    }

    const entryZone: EntryZoneRange = {
      low: Math.round(bestZone.low * 100) / 100,
      high: Math.round(bestZone.high * 100) / 100,
      midpoint: Math.round(bestZone.midpoint * 100) / 100,
      source: bestZone.source,
    }

    // =====================================================================
    // Stop loss
    // =====================================================================
    let stopLoss: number
    let stopNote: string

    if (direction === 'buy') {
      stopLoss = entryZone.low - 5
      stopNote = `Below ${entryZone.source} low $${fmtPrice(entryZone.low)}`
    } else {
      stopLoss = entryZone.high + 5
      stopNote = `Above ${entryZone.source} high $${fmtPrice(entryZone.high)}`
    }

    stopLoss = Math.round(stopLoss * 100) / 100

    // Minimum risk = $8 from midpoint
    let risk = Math.abs(entryZone.midpoint - stopLoss)
    if (risk < 8) {
      risk = 8
      if (direction === 'buy') {
        stopLoss = Math.round((entryZone.midpoint - 8) * 100) / 100
        stopNote = `Below ${entryZone.source} low $${fmtPrice(entryZone.low)} (min $8 risk enforced)`
      } else {
        stopLoss = Math.round((entryZone.midpoint + 8) * 100) / 100
        stopNote = `Above ${entryZone.source} high $${fmtPrice(entryZone.high)} (min $8 risk enforced)`
      }
    }

    // =====================================================================
    // TP targets
    // =====================================================================
    const targets = computeTargets(signal, entryZone.midpoint, risk, bias)

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
    const confidence = computeConfidence(signal, bias, riskReward)

    // If confidence maps to 'wait', override direction
    if (confidence.grade === 'wait') {
      return {
        direction: 'wait',
        confidence: 'wait',
        confidenceScore: confidence.score,
        entryZone,
        stopLoss,
        stopNote,
        targets,
        riskReward,
        reasons: buildReasons(signal, bias, entryZone, riskReward),
        blockers: buildBlockers(signal, bias, riskReward),
        computedAt: new Date().toISOString(),
      }
    }

    // =====================================================================
    // Reasons & blockers
    // =====================================================================
    const reasons = buildReasons(signal, bias, entryZone, riskReward)
    const blockers = buildBlockers(signal, bias, riskReward)

    // =====================================================================
    // Final signal
    // =====================================================================
    return {
      direction,
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
    console.error('[entryEngine] unexpected error:', err)
    return waitSignal('Engine error')
  }
}
