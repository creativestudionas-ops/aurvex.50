'use client'

import { useMemo } from 'react'
import type { JudasSignal } from '@/types/judas'
import type { Candle, ChartOverlays } from '../types/chart'
import { computeSessionZones } from '../utils/sessionWindows'
import { levelsToOBBoxes, levelsToFVGZones, levelsToHorizontals, deriveSweepAnnotation, deriveEntryZone } from '../utils/smcShapes'
import type { ScaleBand } from 'd3-scale'

export function useSMCOverlays(
  signal: JudasSignal,
  candles: Candle[],
  xScale: ScaleBand<number>,
): ChartOverlays {
  return useMemo(() => ({
    sessionZones: computeSessionZones(candles, xScale, signal.sessions),
    obBoxes: levelsToOBBoxes(signal.levels, candles),
    fvgZones: levelsToFVGZones(signal.levels, candles),
    levels: levelsToHorizontals(signal.levels),
    sweepAnnotation: deriveSweepAnnotation(signal, candles),
    entryZone: deriveEntryZone(signal),
  }), [signal, candles, xScale])
}
