export interface Candle {
  time: number        // Unix timestamp (seconds)
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export type Interval = '1h' | '4h' | '1day'

export interface SessionZone {
  label: 'Asian' | 'London' | 'New York'
  startTime: number   // Unix seconds
  endTime: number
  color: string
  judasConfirmed?: boolean
}

export interface OBBox {
  type: 'bull' | 'bear'
  priceHigh: number
  priceLow: number
  startTime: number
  endTime?: number    // undefined = extends to chart right edge
  active: boolean
}

export interface FVGZone {
  priceHigh: number
  priceLow: number
  startTime: number
  mitigated: boolean
}

export interface HorizontalLevel {
  price: number
  type: 'BSL' | 'SSL' | 'SMA'
  active: boolean
  label: string
}

export interface SweepAnnotation {
  time: number
  price: number
  direction: 'up' | 'down'
  label: string
}

export interface EntryZone {
  priceHigh: number
  priceLow: number
  startTime: number
}

export interface ChartOverlays {
  sessionZones: SessionZone[]
  obBoxes: OBBox[]
  fvgZones: FVGZone[]
  levels: HorizontalLevel[]
  sweepAnnotation: SweepAnnotation | null
  entryZone: EntryZone | null
}
