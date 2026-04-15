/**
 * Dynamic Trade Scenario Generator
 *
 * Derives primary + alternate trade frameworks from live session data,
 * SMC levels, Judas phase, and current price.
 */

import type { TradeScenario, SMCLevel, SessionData } from '@/types/judas'

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function findLevel(levels: SMCLevel[], type: string): SMCLevel | undefined {
  return levels.find((l) => l.type === type && l.active)
}

function findAnyLevel(levels: SMCLevel[], type: string): SMCLevel | undefined {
  return levels.find((l) => l.type === type)
}

export function deriveTradeScenarios(
  price: number,
  sessions: [SessionData, SessionData, SessionData],
  levels: SMCLevel[],
  judasPhase: string,
  sessionBias: string,
): TradeScenario[] {
  const [asian, london, ny] = sessions

  const bsl = findLevel(levels, 'BSL') ?? findAnyLevel(levels, 'BSL')
  const ssl = findLevel(levels, 'SSL') ?? findAnyLevel(levels, 'SSL')
  const obBull = findLevel(levels, 'OB_bull') ?? findAnyLevel(levels, 'OB_bull')
  const obBear = findLevel(levels, 'OB_bear') ?? findAnyLevel(levels, 'OB_bear')
  const fvg = findLevel(levels, 'FVG') ?? findAnyLevel(levels, 'FVG')

  // Nearest support/resistance from OB or FVG
  const supportZone = obBull
    ? `${fmt(obBull.priceLow ?? obBull.price)}\u2013${fmt(obBull.priceHigh ?? obBull.price)}`
    : fvg
      ? `${fmt(fvg.priceLow ?? fvg.price)}\u2013${fmt(fvg.priceHigh ?? fvg.price)}`
      : null
  const supportPrice = obBull?.price ?? fvg?.price ?? 0

  const resistanceZone = obBear
    ? `${fmt(obBear.priceLow ?? obBear.price)}\u2013${fmt(obBear.priceHigh ?? obBear.price)}`
    : null

  // ---------- Judas confirmed LONG ----------
  if (sessionBias === 'Long continuation' || judasPhase.includes('long bias')) {
    const target = bsl?.price ?? asian.high
    const stop = obBull?.priceLow ?? fvg?.priceLow ?? (price - 40)
    const entry = supportPrice > 0 ? supportPrice : price - 10
    const risk = Math.abs(entry - stop)
    const reward = Math.abs(target - entry)
    const rr = risk > 0 ? (reward / risk).toFixed(1) : '?'

    const primary: TradeScenario = {
      label: `Long to ${bsl ? 'BSL' : 'Asian High'}`,
      type: 'primary',
      description:
        `Enter long on pullback to ${supportZone ?? fmt(entry)} zone. ` +
        `Target ${bsl ? `BSL at ${fmt(target)}` : `Asian high at ${fmt(target)}`}. ` +
        `Stop below ${obBull ? obBull.name : 'support'} at ${fmt(stop)}. ` +
        `R:R \u2248 1:${rr}.`,
      invalidation:
        `Price closes below ${fvg ? `FVG at ${fmt(fvg.priceLow ?? fvg.price)}` : fmt(stop)} \u2014 Judas thesis invalidated.`,
    }

    const alternate: TradeScenario = {
      label: bsl ? 'Reversal Short if BSL Swept' : 'Reversal Short at Highs',
      type: 'alternate',
      description: bsl
        ? `If price sweeps BSL at ${fmt(bsl.price)} and shows bearish displacement, short ` +
          `targeting ${ssl ? `SSL at ${fmt(ssl.price)}` : `London low at ${fmt(london.low)}`}. ` +
          `Wait for M15 bearish OB confirmation above ${fmt(bsl.price - 5)}.`
        : `If price rejects at ${fmt(asian.high)} with bearish structure, ` +
          `short targeting ${fmt(asian.low)}. Confirm on M15 displacement.`,
    }

    return [primary, alternate]
  }

  // ---------- Judas confirmed SHORT ----------
  if (sessionBias === 'Short continuation' || judasPhase.includes('short bias')) {
    const target = ssl?.price ?? asian.low
    const stop = obBear?.priceHigh ?? (price + 40)
    const entry = obBear?.price ?? price + 10
    const risk = Math.abs(stop - entry)
    const reward = Math.abs(entry - target)
    const rr = risk > 0 ? (reward / risk).toFixed(1) : '?'

    const primary: TradeScenario = {
      label: `Short to ${ssl ? 'SSL' : 'Asian Low'}`,
      type: 'primary',
      description:
        `Enter short on rally to ${resistanceZone ?? fmt(entry)} zone. ` +
        `Target ${ssl ? `SSL at ${fmt(target)}` : `Asian low at ${fmt(target)}`}. ` +
        `Stop above ${obBear ? obBear.name : 'resistance'} at ${fmt(stop)}. ` +
        `R:R \u2248 1:${rr}.`,
      invalidation:
        `Price closes above ${fmt(stop)} \u2014 bearish thesis invalidated.`,
    }

    const alternate: TradeScenario = {
      label: ssl ? 'Reversal Long if SSL Swept' : 'Reversal Long at Lows',
      type: 'alternate',
      description: ssl
        ? `If price sweeps SSL at ${fmt(ssl.price)} and shows bullish displacement, long ` +
          `targeting ${bsl ? `BSL at ${fmt(bsl.price)}` : `Asian high at ${fmt(asian.high)}`}. ` +
          `Wait for M15 bullish OB confirmation below ${fmt(ssl.price + 5)}.`
        : `If price rejects at ${fmt(asian.low)} with bullish structure, ` +
          `long targeting ${fmt(asian.high)}. Confirm on M15 displacement.`,
    }

    return [primary, alternate]
  }

  // ---------- Pre-sweep / Ranging ----------
  const asianRange = asian.high - asian.low
  const primary: TradeScenario = {
    label: 'Await Judas Sweep',
    type: 'primary',
    description:
      `Asian range ${fmt(asian.low)}\u2013${fmt(asian.high)} ($${asianRange.toFixed(2)}). ` +
      `Watch for London to sweep one side and reverse. ` +
      (bsl && ssl
        ? `BSL above at ${fmt(bsl.price)}, SSL below at ${fmt(ssl.price)}.`
        : `Key levels: H ${fmt(asian.high)} / L ${fmt(asian.low)}.`),
    invalidation: 'No clear sweep by London close \u2014 low-conviction day.',
  }

  const alternate: TradeScenario = {
    label: 'Range Fade',
    type: 'alternate',
    description:
      `If no Judas sweep develops, fade extremes of the Asian range. ` +
      `Short near ${fmt(asian.high)}, long near ${fmt(asian.low)}. ` +
      `Tight stops $5\u201310 beyond range. Only valid if range < $50.` +
      (asianRange > 50 ? ' Current range is wide \u2014 low confidence.' : ''),
  }

  return [primary, alternate]
}
