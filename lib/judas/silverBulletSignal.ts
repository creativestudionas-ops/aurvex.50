/**
 * Silver Bullet Signal Engine
 *
 * Detects Fair Value Gaps (FVGs) formed inside ICT Silver Bullet time windows
 * and provides entry signals when price retests those FVGs within the same
 * window.  Designed for XAU/USD (gold) on the Aurvex platform.
 *
 * Silver Bullet windows (UTC):
 *   - London open:   03:00 - 04:00
 *   - NY open:       10:00 - 11:00
 *   - NY afternoon:  14:00 - 15:00
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
// Silver Bullet windows
// ---------------------------------------------------------------------------
const SILVER_BULLET_WINDOWS = [
  { label: 'London open',  startHourUTC: 3,  endHourUTC: 4  },
  { label: 'NY open',      startHourUTC: 10, endHourUTC: 11 },
  { label: 'NY afternoon', startHourUTC: 14, endHourUTC: 15 },
] as const

export { SILVER_BULLET_WINDOWS }

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------
type SBWindow = typeof SILVER_BULLET_WINDOWS[number]
type Bias = 'bullish' | 'bearish'

// ---------------------------------------------------------------------------
// Wait helper
// ---------------------------------------------------------------------------
function sbWait(reason: string): EntrySignal {
  return {
    model: 'silver_bullet',
    modelLabel: 'Silver Bullet',
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
// Clamp utility
// ---------------------------------------------------------------------------
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

// ---------------------------------------------------------------------------
// isInSilverBulletWindow
// ---------------------------------------------------------------------------
function isInSilverBulletWindow(
  unixSeconds: number,
): { active: boolean; window: SBWindow | null } {
  const d = new Date(unixSeconds * 1000)
  const hour = d.getUTCHours()

  for (const w of SILVER_BULLET_WINDOWS) {
    if (hour >= w.startHourUTC && hour < w.endHourUTC) {
      return { active: true, window: w }
    }
  }
  return { active: false, window: null }
}

// ---------------------------------------------------------------------------
// getNextWindowTime
// ---------------------------------------------------------------------------
function getNextWindowTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  const hour = d.getUTCHours()

  const next = SILVER_BULLET_WINDOWS.find((w) => w.startHourUTC > hour)
  const target = next ?? SILVER_BULLET_WINDOWS[0]

  const hh = target.startHourUTC.toString().padStart(2, '0')
  return `${hh}:00 UTC (${target.label})`
}

// ---------------------------------------------------------------------------
// findWindowFVG
// ---------------------------------------------------------------------------
function findWindowFVG(
  candles: Candle[],
  window: SBWindow,
): SMCLevel | null {
  // Filter candles whose UTC hour falls within the window
  const windowCandles = candles.filter((c) => {
    const h = new Date(c.time * 1000).getUTCHours()
    return h >= window.startHourUTC && h < window.endHourUTC
  })

  if (windowCandles.length < 3) return null

  // Scan triplets for FVG pattern (most recent first)
  for (let i = windowCandles.length - 3; i >= 0; i--) {
    const c0 = windowCandles[i]
    const c1 = windowCandles[i + 1]
    const c2 = windowCandles[i + 2]

    // Bullish FVG: candle 2's low is above candle 0's high (gap up)
    if (c2.low > c0.high) {
      return {
        name: `${window.label} Bullish FVG`,
        type: 'FVG',
        price: (c0.high + c2.low) / 2,
        priceHigh: c2.low,
        priceLow: c0.high,
        description: `Bullish FVG $${fmtPrice(c0.high)}\u2013$${fmtPrice(c2.low)} formed in ${window.label} window`,
        direction: 'up',
        active: true,
      }
    }

    // Bearish FVG: candle 0's low is above candle 2's high (gap down)
    if (c0.low > c2.high) {
      return {
        name: `${window.label} Bearish FVG`,
        type: 'FVG',
        price: (c2.high + c0.low) / 2,
        priceHigh: c0.low,
        priceLow: c2.high,
        description: `Bearish FVG $${fmtPrice(c2.high)}\u2013$${fmtPrice(c0.low)} formed in ${window.label} window`,
        direction: 'down',
        active: true,
      }
    }
  }

  return null
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
export function computeSilverBulletSignal(
  signal: JudasSignal,
  candles1h: Candle[],
): EntrySignal {
  try {
    const nowSec = Math.floor(Date.now() / 1000)

    // =======================================================================
    // Gate 1 - Current time must be inside a Silver Bullet window
    // =======================================================================
    const { active, window: activeWindow } = isInSilverBulletWindow(nowSec)
    if (!active || !activeWindow) {
      const next = getNextWindowTime(nowSec)
      return sbWait(`Outside Silver Bullet window \u2014 next window: ${next}`)
    }

    // =======================================================================
    // Gate 2 - Find the first FVG formed inside this window
    // =======================================================================
    const windowFVG = findWindowFVG(candles1h, activeWindow)
    if (!windowFVG) {
      return sbWait(
        `No FVG formed yet in ${activeWindow.label} window \u2014 waiting for displacement`,
      )
    }

    // =======================================================================
    // Gate 3 - Price must be inside or within $5 of the window FVG
    // =======================================================================
    const fvgLow = windowFVG.priceLow ?? windowFVG.price
    const fvgHigh = windowFVG.priceHigh ?? windowFVG.price
    const price = signal.price

    const insideFVG = price >= fvgLow && price <= fvgHigh
    const nearFVG =
      (price < fvgLow && fvgLow - price <= 5) ||
      (price > fvgHigh && price - fvgHigh <= 5)

    if (!insideFVG && !nearFVG) {
      return sbWait(
        `Price $${fmtPrice(price)} not near ${activeWindow.label} FVG ($${fmtPrice(fvgLow)}\u2013$${fmtPrice(fvgHigh)})`,
      )
    }

    // =======================================================================
    // Gate 4 - Grade must not be F
    // =======================================================================
    if (signal.grade === 'F') {
      return sbWait(`Grade F \u2014 signal quality too low for Silver Bullet entry`)
    }

    // =======================================================================
    // Bias direction from FVG
    // =======================================================================
    const fvgBias: Bias = windowFVG.direction === 'up' ? 'bullish' : 'bearish'

    // =======================================================================
    // Entry zone
    // =======================================================================
    const entryZone: EntryZoneRange = {
      low: Math.round(fvgLow * 100) / 100,
      high: Math.round(fvgHigh * 100) / 100,
      midpoint: Math.round(((fvgLow + fvgHigh) / 2) * 100) / 100,
      source: `${activeWindow.label} FVG`,
    }

    // =======================================================================
    // Stop loss
    // =======================================================================
    const MIN_STOP = 8
    let stopLoss: number
    let stopNote: string

    if (fvgBias === 'bullish') {
      stopLoss = fvgLow - 3
      stopNote = `Below ${activeWindow.label} FVG low $${fmtPrice(fvgLow)}`
    } else {
      stopLoss = fvgHigh + 3
      stopNote = `Above ${activeWindow.label} FVG high $${fmtPrice(fvgHigh)}`
    }

    stopLoss = Math.round(stopLoss * 100) / 100

    const risk = Math.max(Math.abs(entryZone.midpoint - stopLoss), MIN_STOP)

    // =======================================================================
    // TP targets using session levels
    // =======================================================================
    // sessions: [Asian, London, New York]
    const asianHigh = signal.sessions[0].high
    const asianLow = signal.sessions[0].low
    const londonHigh = signal.sessions[1].high
    const londonLow = signal.sessions[1].low

    // enforceMinR — guarantees each TP meets a minimum R multiple
    const enforceMinR = (tpPrice: number, minR: number): number => {
      const natural = Math.abs(tpPrice - entryZone.midpoint)
      if (natural >= risk * minR) return tpPrice
      return fvgBias === 'bullish'
        ? entryZone.midpoint + risk * minR
        : entryZone.midpoint - risk * minR
    }

    // TP1: London high (bullish) or London low (bearish) — min 1.0R
    const rawTP1 = fvgBias === 'bullish' ? londonHigh : londonLow
    const tp1Price = Math.round(enforceMinR(rawTP1, 1.0) * 100) / 100
    const tp1R = Math.round((Math.abs(tp1Price - entryZone.midpoint) / risk) * 10) / 10

    // TP2: max(Asian high, London high) bullish / min(Asian low, London low) bearish — min 1.8R
    const rawTP2 = fvgBias === 'bullish'
      ? Math.max(asianHigh, londonHigh)
      : Math.min(asianLow, londonLow)
    const tp2Price = Math.round(enforceMinR(rawTP2, 1.8) * 100) / 100
    const tp2R = Math.round((Math.abs(tp2Price - entryZone.midpoint) / risk) * 10) / 10

    // TP3: midpoint +/- risk * 3 — min 2.8R
    const rawTP3 = fvgBias === 'bullish'
      ? entryZone.midpoint + risk * 3
      : entryZone.midpoint - risk * 3
    const tp3Price = Math.round(enforceMinR(rawTP3, 2.8) * 100) / 100
    const tp3R = Math.round((Math.abs(tp3Price - entryZone.midpoint) / risk) * 10) / 10

    const targets: TPLevel[] = [
      {
        label: 'TP1',
        price: tp1Price,
        rMultiple: tp1R,
        rationale: fvgBias === 'bullish'
          ? `London high @ $${fmtPrice(tp1Price)}`
          : `London low @ $${fmtPrice(tp1Price)}`,
      },
      {
        label: 'TP2',
        price: tp2Price,
        rMultiple: tp2R,
        rationale: fvgBias === 'bullish'
          ? `Max(Asian high, London high) @ $${fmtPrice(tp2Price)}`
          : `Min(Asian low, London low) @ $${fmtPrice(tp2Price)}`,
      },
      {
        label: 'TP3',
        price: tp3Price,
        rMultiple: tp3R,
        rationale: `3R extension @ $${fmtPrice(tp3Price)}`,
      },
    ]

    // =======================================================================
    // R:R (against TP2)
    // =======================================================================
    const riskReward =
      risk > 0
        ? Math.round((Math.abs(tp2Price - entryZone.midpoint) / risk) * 100) / 100
        : null

    // =======================================================================
    // Confidence scoring
    // =======================================================================
    let score = 60

    // Window bonus
    if (activeWindow.label === 'NY open') score += 8
    else if (activeWindow.label === 'London open') score += 6
    else if (activeWindow.label === 'NY afternoon') score += 4

    // Post-sweep bonus
    if (signal.judasPhase.includes('Post-sweep')) score += 8

    // Session bias alignment
    const biasAligned =
      (fvgBias === 'bullish' && (signal.sessionBias.includes('Long') || signal.sessionBias.includes('Bullish'))) ||
      (fvgBias === 'bearish' && (signal.sessionBias.includes('Short') || signal.sessionBias.includes('Bearish')))
    if (biasAligned) score += 6

    // A++ or A+ grade
    if (signal.grade === 'A++' || signal.grade === 'A+') score += 6

    // COT commercial aligned (>60 bullish)
    if (fvgBias === 'bullish' && signal.cot.commercialPctile > 60) score += 5
    else if (fvgBias === 'bearish' && signal.cot.commercialPctile < 40) score += 5

    // Critical rejection aligned
    const criticalRejection = signal.warnings.find(
      (w) =>
        w.severity === 'critical' &&
        w.category === 'rejection' &&
        w.direction === fvgBias,
    )
    if (criticalRejection) score += 8

    // R:R bonus
    if (riskReward !== null && riskReward >= 2.0) score += 4

    // --- Penalties ---
    if (signal.cot.stale) score -= 4
    if (signal.priceStale) score -= 5

    const highCatalyst = signal.catalysts.find((c) => c.impact === 'high')
    if (highCatalyst) score -= 8

    if (riskReward !== null && riskReward < 1.5) score -= 10

    score = clamp(score, 0, 100)

    const confidence = toConfidenceGrade(score)

    // =======================================================================
    // Reasons
    // =======================================================================
    const reasons: string[] = []

    reasons.push(
      `${activeWindow.label} Silver Bullet window active (${activeWindow.startHourUTC.toString().padStart(2, '0')}:00\u2013${activeWindow.endHourUTC.toString().padStart(2, '0')}:00 UTC)`,
    )
    reasons.push(
      `FVG retest: ${fvgBias} FVG $${fmtPrice(fvgLow)}\u2013$${fmtPrice(fvgHigh)}`,
    )

    if (biasAligned) {
      reasons.push(`Session bias aligned: ${signal.sessionBias}`)
    }
    if (signal.judasPhase.includes('Post-sweep')) {
      reasons.push(`Judas phase: ${signal.judasPhase}`)
    }
    if (riskReward !== null) {
      reasons.push(`Risk/reward to TP2: 1:${fmtPrice(riskReward)}`)
    }

    // =======================================================================
    // Blockers
    // =======================================================================
    const blockers: string[] = []

    if (signal.cot.stale) {
      blockers.push(`COT data stale (week of ${signal.cot.weekOf})`)
    }
    if (signal.priceStale) {
      blockers.push('Price feed stale \u2014 using cached quote')
    }
    if (highCatalyst) {
      blockers.push(
        `High-impact catalyst pending: ${highCatalyst.name}${highCatalyst.time ? ` at ${highCatalyst.time}` : ''}`,
      )
    }
    if (riskReward !== null && riskReward < 1.5) {
      blockers.push(`R:R below 1.5 (${fmtPrice(riskReward)}) \u2014 suboptimal risk/reward`)
    }
    if (signal.grade !== 'A++' && signal.grade !== 'A+' && signal.grade !== 'A') {
      blockers.push(`Grade ${signal.grade} \u2014 below A threshold`)
    }

    // =======================================================================
    // Final direction (override to 'wait' if confidence is 'wait')
    // =======================================================================
    const direction = confidence === 'wait'
      ? 'wait' as const
      : fvgBias === 'bullish'
        ? 'buy' as const
        : 'sell' as const

    return {
      model: 'silver_bullet',
      modelLabel: 'Silver Bullet',
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
    console.error('[silverBulletSignal] unexpected error:', err)
    return sbWait('Engine error')
  }
}
