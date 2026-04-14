import type { ScaleLinear } from 'd3-scale'
import type { Candle } from '../types/chart'

export function isGreenCandle(c: Candle): boolean {
  return c.close >= c.open
}

export function isBearishCandle(c: Candle): boolean {
  return c.close < c.open
}

export function candleBodyY(c: Candle, yScale: ScaleLinear<number, number>): number {
  return yScale(Math.max(c.open, c.close))
}

export function candleBodyHeight(c: Candle, yScale: ScaleLinear<number, number>): number {
  const top = yScale(Math.max(c.open, c.close))
  const bot = yScale(Math.min(c.open, c.close))
  return Math.max(1, bot - top)
}

export function wickTop(c: Candle, yScale: ScaleLinear<number, number>): number {
  return yScale(c.high)
}

export function wickBottom(c: Candle, yScale: ScaleLinear<number, number>): number {
  return yScale(c.low)
}
