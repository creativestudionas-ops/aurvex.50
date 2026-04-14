import type { SMCLevel, JudasSignal } from '@/types/judas'
import type { Candle, OBBox, FVGZone, HorizontalLevel, SweepAnnotation, EntryZone } from '../types/chart'

export function levelsToOBBoxes(levels: SMCLevel[], candles: Candle[]): OBBox[] {
  if (candles.length === 0) return []

  const lastTime = candles[candles.length - 1].time
  // Place OB boxes starting from ~20 candles back by default
  const obStart = candles.length > 20 ? candles[candles.length - 20].time : candles[0].time

  return levels
    .filter((l) => l.type === 'OB_bull' || l.type === 'OB_bear')
    .map((l) => ({
      type: l.type === 'OB_bull' ? 'bull' as const : 'bear' as const,
      priceHigh: l.priceHigh ?? l.price + 5,
      priceLow: l.priceLow ?? l.price - 5,
      startTime: obStart,
      endTime: l.active ? undefined : lastTime,
      active: l.active,
    }))
}

export function levelsToFVGZones(levels: SMCLevel[], candles: Candle[]): FVGZone[] {
  if (candles.length === 0) return []

  const fvgStart = candles.length > 15 ? candles[candles.length - 15].time : candles[0].time

  return levels
    .filter((l) => l.type === 'FVG')
    .map((l) => ({
      priceHigh: l.priceHigh ?? l.price + 3,
      priceLow: l.priceLow ?? l.price - 3,
      startTime: fvgStart,
      mitigated: !l.active,
    }))
}

export function levelsToHorizontals(levels: SMCLevel[]): HorizontalLevel[] {
  return levels
    .filter((l) => l.type === 'BSL' || l.type === 'SSL' || l.type === 'SMA')
    .map((l) => ({
      price: l.price,
      type: l.type as 'BSL' | 'SSL' | 'SMA',
      active: l.active,
      label: l.type === 'SMA' ? 'SMA 100' : `${l.type} ${l.price.toFixed(0)}`,
    }))
}

export function deriveSweepAnnotation(
  signal: JudasSignal,
  candles: Candle[],
): SweepAnnotation | null {
  if (!signal.judasPhase.toLowerCase().includes('post-sweep')) return null
  if (candles.length === 0) return null

  // Place annotation at ~75% into the candle set
  const idx = Math.floor(candles.length * 0.75)
  const c = candles[idx]

  const isLong = signal.sessionBias.toLowerCase().includes('bull') ||
                 signal.sessionBias.toLowerCase().includes('long')

  return {
    time: c.time,
    price: isLong ? c.low : c.high,
    direction: isLong ? 'up' : 'down',
    label: `Post-sweep · ${isLong ? 'Long' : 'Short'} bias`,
  }
}

export function deriveEntryZone(signal: JudasSignal): EntryZone | null {
  const isHighGrade = signal.grade === 'A++' || signal.grade === 'A+'
  const isPostSweep = signal.judasPhase.toLowerCase().includes('post-sweep')
  const hasActiveOB = signal.levels.some(
    (l) => (l.type === 'OB_bull' || l.type === 'OB_bear') && l.active,
  )

  if (!isHighGrade || !isPostSweep || !hasActiveOB) return null

  const ob = signal.levels.find(
    (l) => (l.type === 'OB_bull' || l.type === 'OB_bear') && l.active,
  )
  if (!ob) return null

  return {
    priceHigh: ob.priceHigh ?? ob.price + 5,
    priceLow: ob.priceLow ?? ob.price - 5,
    startTime: 0, // will be set relative to chart
  }
}
