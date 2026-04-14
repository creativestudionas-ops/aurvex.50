import type { ScaleBand } from 'd3-scale'
import type { Candle, SessionZone } from '../types/chart'
import type { SessionData } from '@/types/judas'

/** Session UTC hour windows */
const SESSION_DEFS: { label: SessionZone['label']; startH: number; endH: number; color: string }[] = [
  { label: 'Asian',    startH: 0,  endH: 7,  color: 'rgba(99,102,241,0.08)' },
  { label: 'London',   startH: 7,  endH: 12, color: 'rgba(245,158,11,0.08)' },
  { label: 'New York', startH: 12, endH: 21, color: 'rgba(16,185,129,0.08)' },
]

export function computeSessionZones(
  candles: Candle[],
  _xScale: ScaleBand<number>,
  sessions: [SessionData, SessionData, SessionData],
): SessionZone[] {
  if (candles.length === 0) return []

  // Find the most recent trading day in the candles
  const lastCandle = candles[candles.length - 1]
  const lastDate = new Date(lastCandle.time * 1000)
  const dayStart = Date.UTC(
    lastDate.getUTCFullYear(),
    lastDate.getUTCMonth(),
    lastDate.getUTCDate(),
  ) / 1000

  const judasMap = new Map(sessions.map((s) => [s.label, s.judasConfirmed]))

  return SESSION_DEFS.map((def) => ({
    label: def.label,
    startTime: dayStart + def.startH * 3600,
    endTime: dayStart + def.endH * 3600,
    color: def.color,
    judasConfirmed: judasMap.get(def.label) ?? false,
  }))
}
