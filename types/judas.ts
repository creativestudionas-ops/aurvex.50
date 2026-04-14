export type SessionStatus = 'consolidation' | 'judas_confirmed' | 'active' | 'closed'
export type SessionDirection = 'bullish' | 'bearish' | 'neutral'
export type SignalGrade = 'A++' | 'A+' | 'A' | 'B' | 'C' | 'F'
export type FactorDirection = 'up' | 'down' | 'neutral'

export interface SessionData {
  label: 'Asian' | 'London' | 'New York'
  high: number
  low: number
  status: SessionStatus
  direction: SessionDirection
  note: string
  judasConfirmed: boolean
}

export interface SMCLevel {
  name: string
  type: 'BSL' | 'SSL' | 'OB_bull' | 'OB_bear' | 'FVG' | 'SMA'
  price: number
  priceHigh?: number
  priceLow?: number
  description: string
  direction: FactorDirection
  active: boolean
}

export interface JudasFactor {
  name: string
  weight: number
  value: number
  direction: FactorDirection
  note: string
}

export interface COTData {
  commercialNet: number
  commercialPctile: number
  specNet: number
  specPctile: number
  weekOf: string
  stale?: boolean
}

export interface MacroData {
  dxy: number
  dxyChange: number
  us10y: number
  us10yChange: number
  stale?: boolean
}

export interface Catalyst {
  name: string
  impact: 'high' | 'medium' | 'low'
  direction: FactorDirection
  note: string
  time?: string
}

export interface TradeScenario {
  label: string
  type: 'primary' | 'alternate'
  description: string
  invalidation?: string
}

export interface JudasSignal {
  // Price
  price: number
  priceChange: number
  priceChangePct: number
  priceStale?: boolean

  // Grade & score
  grade: SignalGrade
  score: number
  sessionLabel: 'Asian' | 'London' | 'New York'
  sessionBias: string
  judasPhase: string

  // Session chain
  sessions: [SessionData, SessionData, SessionData]

  // SMC levels
  levels: SMCLevel[]

  // 18-factor breakdown
  factors: JudasFactor[]

  // COT
  cot: COTData

  // Macro
  macro: MacroData

  // Trade framework
  tradeScenarios: TradeScenario[]

  // Catalysts
  catalysts: Catalyst[]

  // Meta
  computedAt: string
}
