/**
 * Candle Exhaustion & Rejection Detection Engine
 *
 * Detects 5 signal types on 4H candles:
 * 1. Wick exhaustion — momentum fading via oversized wicks
 * 2. Diminishing range — consecutive same-direction candles shrinking
 * 3. Pin bar / hammer — single-candle rejection
 * 4. Order block rejection — price taps OB and closes outside
 * 5. BSL/SSL sweep + reclaim — liquidity grab complete
 */

import type { Candle } from '@/lib/data/price'
import type { SMCLevel, CandleWarning, WarningSeverity } from '@/types/judas'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toUnix(c: Candle): number {
  return Math.floor(new Date(c.datetime).getTime() / 1000)
}

function upperWick(c: Candle): number {
  return c.high - Math.max(c.open, c.close)
}

function lowerWick(c: Candle): number {
  return Math.min(c.open, c.close) - c.low
}

function body(c: Candle): number {
  return Math.abs(c.close - c.open)
}

function isBull(c: Candle): boolean {
  return c.close > c.open
}

function isBear(c: Candle): boolean {
  return c.close < c.open
}

function nearLevel(
  price: number,
  levels: SMCLevel[],
  threshold = 15,
): SMCLevel | null {
  return (
    levels.find(
      (l) => l.active && Math.abs(l.price - price) <= threshold,
    ) ?? null
  )
}

function upgradeOnConfluence(
  severity: WarningSeverity,
  level: SMCLevel | null,
): WarningSeverity {
  if (!level) return severity
  const order: WarningSeverity[] = ['info', 'medium', 'high', 'critical']
  const idx = order.indexOf(severity)
  return order[Math.min(idx + 1, 3)]
}

// ---------------------------------------------------------------------------
// Signal 1 — Wick Exhaustion
// ---------------------------------------------------------------------------
function detectWickExhaustion(
  closed: Candle[],
  levels: SMCLevel[],
): CandleWarning[] {
  const warnings: CandleWarning[] = []
  const last3 = closed.slice(-3)
  if (last3.length < 3) return warnings

  // Check bearish exhaustion (upper wicks dominate)
  const bearishCount = last3.filter(
    (c) => isBear(c) && upperWick(c) > body(c) * 2,
  ).length
  if (bearishCount >= 2) {
    const trigger = last3[last3.length - 1]
    const level = nearLevel(trigger.close, levels)
    const sev = upgradeOnConfluence('medium', level)
    warnings.push({
      id: `wick_exhaustion_${toUnix(trigger)}`,
      type: 'wick_exhaustion',
      category: 'exhaustion',
      severity: sev,
      direction: 'bearish',
      candleTime: toUnix(trigger),
      price: trigger.close,
      levelConfluence: level
        ? `${level.name} @ $${level.price.toFixed(2)}`
        : null,
      title: 'Wick exhaustion',
      note: '2 of last 3 4H candles show upper wicks more than 2\u00d7 the body \u2014 bearish momentum fading.',
      confirmed: true,
    })
  }

  // Check bullish exhaustion (lower wicks dominate)
  const bullishCount = last3.filter(
    (c) => isBull(c) && lowerWick(c) > body(c) * 2,
  ).length
  if (bullishCount >= 2) {
    const trigger = last3[last3.length - 1]
    const level = nearLevel(trigger.close, levels)
    const sev = upgradeOnConfluence('medium', level)
    warnings.push({
      id: `wick_exhaustion_${toUnix(trigger)}`,
      type: 'wick_exhaustion',
      category: 'exhaustion',
      severity: sev,
      direction: 'bullish',
      candleTime: toUnix(trigger),
      price: trigger.close,
      levelConfluence: level
        ? `${level.name} @ $${level.price.toFixed(2)}`
        : null,
      title: 'Wick exhaustion',
      note: '2 of last 3 4H candles show lower wicks more than 2\u00d7 the body \u2014 bullish momentum fading at lows.',
      confirmed: true,
    })
  }

  return warnings
}

// ---------------------------------------------------------------------------
// Signal 2 — Diminishing Range
// ---------------------------------------------------------------------------
function detectDiminishingRange(
  closed: Candle[],
  levels: SMCLevel[],
): CandleWarning[] {
  const warnings: CandleWarning[] = []
  const last6 = closed.slice(-6)
  if (last6.length < 3) return warnings

  // Find longest consecutive bull or bear streak
  let bestStreak: Candle[] = []
  let bestDir: 'bull' | 'bear' | null = null
  let current: Candle[] = []
  let currentDir: 'bull' | 'bear' | null = null

  for (const c of last6) {
    const dir = isBull(c) ? 'bull' : isBear(c) ? 'bear' : null
    if (dir && dir === currentDir) {
      current.push(c)
    } else if (dir) {
      if (current.length > bestStreak.length) {
        bestStreak = [...current]
        bestDir = currentDir
      }
      current = [c]
      currentDir = dir
    } else {
      if (current.length > bestStreak.length) {
        bestStreak = [...current]
        bestDir = currentDir
      }
      current = []
      currentDir = null
    }
  }
  if (current.length > bestStreak.length) {
    bestStreak = [...current]
    bestDir = currentDir
  }

  if (bestStreak.length >= 3 && bestDir) {
    // Check if bodies are strictly decreasing
    const bodies = bestStreak.map((c) => body(c))
    let decreasing = true
    for (let i = 1; i < bodies.length; i++) {
      if (bodies[i] >= bodies[i - 1]) {
        decreasing = false
        break
      }
    }

    if (decreasing) {
      const last = bestStreak[bestStreak.length - 1]
      // Direction opposite to the streak (move is dying)
      const direction = bestDir === 'bull' ? 'bearish' : 'bullish'
      warnings.push({
        id: `diminishing_range_${toUnix(last)}`,
        type: 'diminishing_range',
        category: 'exhaustion',
        severity: 'medium',
        direction,
        candleTime: toUnix(last),
        price: last.close,
        levelConfluence: null,
        title: 'Diminishing range',
        note: `${bestStreak.length} consecutive 4H candles in same direction, each body smaller than the last. Push is losing energy.`,
        confirmed: true,
      })
    }
  }

  return warnings
}

// ---------------------------------------------------------------------------
// Signal 3 — Pin Bar / Hammer Rejection
// ---------------------------------------------------------------------------
function detectPinBar(
  closed: Candle[],
  levels: SMCLevel[],
): CandleWarning[] {
  const warnings: CandleWarning[] = []
  if (closed.length === 0) return warnings

  const candle = closed[closed.length - 1]
  const totalRange = candle.high - candle.low
  if (totalRange <= 0) return warnings

  const b = body(candle)
  const uw = upperWick(candle)
  const lw = lowerWick(candle)
  const bodyPositionRatio = (Math.min(candle.open, candle.close) - candle.low) / totalRange

  // Bearish pin bar (shooting star)
  if (uw >= b * 3 && bodyPositionRatio < 0.25) {
    const level = nearLevel(candle.high, levels, 20)
    const sev = level ? 'high' : 'medium'
    warnings.push({
      id: `pin_bar_${toUnix(candle)}`,
      type: 'pin_bar',
      category: 'rejection',
      severity: sev as WarningSeverity,
      direction: 'bearish',
      candleTime: toUnix(candle),
      price: candle.high,
      levelConfluence: level
        ? `${level.name} @ $${level.price.toFixed(2)}`
        : null,
      title: 'Pin bar rejection',
      note: 'Long upper wick (3\u00d7 body) on 4H candle \u2014 strong rejection of the attempted move up.',
      confirmed: true,
    })
  }

  // Bullish pin bar (hammer)
  if (lw >= b * 3 && bodyPositionRatio > 0.75) {
    const level = nearLevel(candle.low, levels, 20)
    const sev = level ? 'high' : 'medium'
    warnings.push({
      id: `pin_bar_${toUnix(candle)}`,
      type: 'pin_bar',
      category: 'rejection',
      severity: sev as WarningSeverity,
      direction: 'bullish',
      candleTime: toUnix(candle),
      price: candle.low,
      levelConfluence: level
        ? `${level.name} @ $${level.price.toFixed(2)}`
        : null,
      title: 'Pin bar rejection',
      note: 'Long lower wick (3\u00d7 body) on 4H candle \u2014 strong rejection of the attempted move down.',
      confirmed: true,
    })
  }

  return warnings
}

// ---------------------------------------------------------------------------
// Signal 4 — Order Block Rejection
// ---------------------------------------------------------------------------
function detectOBRejection(
  closed: Candle[],
  formingCandle: Candle | null,
  levels: SMCLevel[],
): CandleWarning[] {
  const warnings: CandleWarning[] = []
  const last5 = closed.slice(-5)
  if (last5.length < 2) return warnings

  // All candles to scan (closed + forming)
  const allCandles = formingCandle ? [...last5, formingCandle] : last5

  for (const level of levels) {
    if (level.type !== 'OB_bull' && level.type !== 'OB_bear') continue
    if (!level.priceHigh || !level.priceLow) continue

    for (let i = 0; i < allCandles.length - 1; i++) {
      const entry = allCandles[i]
      const exit = allCandles[i + 1]

      // Check if entry candle dipped into the OB zone
      if (entry.low > level.priceHigh || entry.high < level.priceLow) continue

      // Determine if exit candle is confirmed (not the forming candle)
      const isConfirmed = formingCandle
        ? i + 1 < allCandles.length - 1
        : true

      // Bullish OB rejection — price dipped in and recovered above
      if (level.type === 'OB_bull' && exit.close > level.priceHigh) {
        warnings.push({
          id: `ob_rejection_${toUnix(exit)}_${level.name.replace(/\s+/g, '_')}`,
          type: 'ob_rejection',
          category: 'rejection',
          severity: 'critical',
          direction: 'bullish',
          candleTime: toUnix(exit),
          price: level.price,
          levelConfluence: `${level.name} @ $${level.priceLow.toFixed(2)}\u2013$${level.priceHigh.toFixed(2)}`,
          title: 'Order block rejection',
          note: `Price tapped ${level.name} and closed above the zone \u2014 OB held as support.`,
          confirmed: isConfirmed,
        })
        break // One warning per level
      }

      // Bearish OB rejection — price rose into bear OB and reversed below
      if (level.type === 'OB_bear' && exit.close < level.priceLow) {
        warnings.push({
          id: `ob_rejection_${toUnix(exit)}_${level.name.replace(/\s+/g, '_')}`,
          type: 'ob_rejection',
          category: 'rejection',
          severity: 'critical',
          direction: 'bearish',
          candleTime: toUnix(exit),
          price: level.price,
          levelConfluence: `${level.name} @ $${level.priceLow.toFixed(2)}\u2013$${level.priceHigh.toFixed(2)}`,
          title: 'Order block rejection',
          note: `Price tapped ${level.name} and closed below the zone \u2014 OB held as resistance.`,
          confirmed: isConfirmed,
        })
        break
      }
    }
  }

  return warnings
}

// ---------------------------------------------------------------------------
// Signal 5 — BSL / SSL Sweep + Reclaim
// ---------------------------------------------------------------------------
function detectLiquiditySweepReclaim(
  closed: Candle[],
  formingCandle: Candle | null,
  levels: SMCLevel[],
): CandleWarning[] {
  const warnings: CandleWarning[] = []
  const last5 = closed.slice(-5)
  if (last5.length < 1) return warnings

  const allCandles = formingCandle ? [...last5, formingCandle] : last5

  for (const level of levels) {
    if (level.type !== 'BSL' && level.type !== 'SSL') continue

    for (let i = 0; i < allCandles.length; i++) {
      const candle = allCandles[i]
      const nextCandle = allCandles[i + 1] ?? null

      if (level.type === 'BSL') {
        // BSL sweep: candle.high > level.price, then close back below
        if (candle.high > level.price) {
          // Same candle reclaim
          if (candle.close < level.price) {
            const recency = allCandles.length - 1 - i
            const sev: WarningSeverity = recency <= 1 ? 'critical' : 'high'
            const isConfirmed = formingCandle ? i < allCandles.length - 1 : true
            warnings.push({
              id: `liquidity_sweep_reclaim_${toUnix(candle)}_${level.name.replace(/\s+/g, '_')}`,
              type: 'liquidity_sweep_reclaim',
              category: 'rejection',
              severity: sev,
              direction: 'bearish',
              candleTime: toUnix(candle),
              price: level.price,
              levelConfluence: `${level.name} @ $${level.price.toFixed(2)}`,
              title: 'Liquidity sweep + reclaim',
              note: `${level.name} swept on 4H then reclaimed \u2014 liquidity grab complete, expect downside continuation.`,
              confirmed: isConfirmed,
            })
            break
          }
          // Next candle reclaim
          if (nextCandle && nextCandle.close < level.price) {
            const recency = allCandles.length - 1 - (i + 1)
            const sev: WarningSeverity = recency <= 1 ? 'critical' : 'high'
            const isConfirmed = formingCandle
              ? i + 1 < allCandles.length - 1
              : true
            warnings.push({
              id: `liquidity_sweep_reclaim_${toUnix(nextCandle)}_${level.name.replace(/\s+/g, '_')}`,
              type: 'liquidity_sweep_reclaim',
              category: 'rejection',
              severity: sev,
              direction: 'bearish',
              candleTime: toUnix(nextCandle),
              price: level.price,
              levelConfluence: `${level.name} @ $${level.price.toFixed(2)}`,
              title: 'Liquidity sweep + reclaim',
              note: `${level.name} swept on 4H then reclaimed \u2014 liquidity grab complete, expect downside continuation.`,
              confirmed: isConfirmed,
            })
            break
          }
        }
      }

      if (level.type === 'SSL') {
        // SSL sweep: candle.low < level.price, then close back above
        if (candle.low < level.price) {
          // Same candle reclaim
          if (candle.close > level.price) {
            const recency = allCandles.length - 1 - i
            const sev: WarningSeverity = recency <= 1 ? 'critical' : 'high'
            const isConfirmed = formingCandle ? i < allCandles.length - 1 : true
            warnings.push({
              id: `liquidity_sweep_reclaim_${toUnix(candle)}_${level.name.replace(/\s+/g, '_')}`,
              type: 'liquidity_sweep_reclaim',
              category: 'rejection',
              severity: sev,
              direction: 'bullish',
              candleTime: toUnix(candle),
              price: level.price,
              levelConfluence: `${level.name} @ $${level.price.toFixed(2)}`,
              title: 'Liquidity sweep + reclaim',
              note: `${level.name} swept on 4H then reclaimed \u2014 liquidity grab complete, expect upside continuation.`,
              confirmed: isConfirmed,
            })
            break
          }
          // Next candle reclaim
          if (nextCandle && nextCandle.close > level.price) {
            const recency = allCandles.length - 1 - (i + 1)
            const sev: WarningSeverity = recency <= 1 ? 'critical' : 'high'
            const isConfirmed = formingCandle
              ? i + 1 < allCandles.length - 1
              : true
            warnings.push({
              id: `liquidity_sweep_reclaim_${toUnix(nextCandle)}_${level.name.replace(/\s+/g, '_')}`,
              type: 'liquidity_sweep_reclaim',
              category: 'rejection',
              severity: sev,
              direction: 'bullish',
              candleTime: toUnix(nextCandle),
              price: level.price,
              levelConfluence: `${level.name} @ $${level.price.toFixed(2)}`,
              title: 'Liquidity sweep + reclaim',
              note: `${level.name} swept on 4H then reclaimed \u2014 liquidity grab complete, expect upside continuation.`,
              confirmed: isConfirmed,
            })
            break
          }
        }
      }
    }
  }

  return warnings
}

// ---------------------------------------------------------------------------
// Main entry point — never throws
// ---------------------------------------------------------------------------
export function detect4HWarnings(
  candles: Candle[],
  levels: SMCLevel[],
  currentPrice: number,
): CandleWarning[] {
  try {
    if (!candles || candles.length < 10) return []

    // Split: closed candles vs forming candle (last one is still forming)
    const closed = candles.slice(0, -1)
    const forming = candles[candles.length - 1]

    // Collect all warnings from 5 signal detectors
    let warnings: CandleWarning[] = [
      ...detectWickExhaustion(closed, levels),
      ...detectDiminishingRange(closed, levels),
      ...detectPinBar(closed, levels),
      ...detectOBRejection(closed, forming, levels),
      ...detectLiquiditySweepReclaim(closed, forming, levels),
    ]

    // 1. Confluence upgrade — check every warning without a levelConfluence
    warnings = warnings.map((w) => {
      const level = nearLevel(w.price, levels, 15)
      if (level && !w.levelConfluence) {
        return {
          ...w,
          levelConfluence: `${level.name} @ $${level.price.toFixed(2)}`,
          severity: upgradeOnConfluence(w.severity, level),
        }
      }
      return w
    })

    // 2. Deduplicate by id
    const seen = new Map<string, CandleWarning>()
    for (const w of warnings) {
      seen.set(w.id, w)
    }
    warnings = Array.from(seen.values())

    // 3. Sort by severity: critical -> high -> medium -> info
    const order: Record<WarningSeverity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      info: 3,
    }
    warnings.sort((a, b) => order[a.severity] - order[b.severity])

    // 4. Cap at 8 warnings
    return warnings.slice(0, 8)
  } catch {
    return []
  }
}
