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

  // Candle warnings
  warnings: CandleWarning[]

  // Entry engines — all active signals across all models, sorted by confidenceScore desc
  entries: EntrySignal[]

  // Meta
  computedAt: string
}

// ---------------------------------------------------------------------------
// Candle Warning System
// ---------------------------------------------------------------------------
export type ExhaustionType =
  | 'wick_exhaustion'
  | 'volume_climax'
  | 'diminishing_range'
  | 'momentum_divergence'

export type RejectionType =
  | 'pin_bar'
  | 'ob_rejection'
  | 'liquidity_sweep_reclaim'

export type WarningSeverity = 'critical' | 'high' | 'medium' | 'info'

export interface CandleWarning {
  id: string                         // unique: `${type}_${candleTime}`
  type: ExhaustionType | RejectionType
  category: 'exhaustion' | 'rejection'
  severity: WarningSeverity
  direction: 'bullish' | 'bearish'   // direction the warning implies
  candleTime: number                  // Unix timestamp of trigger candle
  price: number                       // price level where signal fired
  levelConfluence: string | null      // e.g. "Bullish OB @ $3,198" or null
  title: string                       // short human label
  note: string                        // full plain-English explanation
  confirmed: boolean                  // true = closed candle, false = still forming

  // ── Timestamp patch v1.1 ───────────────────────
  formattedTime: string               // e.g. "Apr 16 · 08:00 UTC"
  timeAgo: string                     // e.g. "2h ago" — computed at detection time
  isLatest: boolean                   // true on the warning with the highest candleTime
  // ───────────────────────────────────────────────
}

// ---------------------------------------------------------------------------
// Entry Engine
// ---------------------------------------------------------------------------
export type EntryDirection = 'buy' | 'sell' | 'wait'

export type EntryConfidence = 'A++' | 'A+' | 'A' | 'B' | 'wait'

export interface TPLevel {
  label: 'TP1' | 'TP2' | 'TP3'
  price: number
  rMultiple: number       // e.g. 1.5 = 1.5R
  rationale: string       // e.g. "BSL @ $4,852"
}

export interface EntryZoneRange {
  low: number             // bottom of entry zone
  high: number            // top of entry zone
  midpoint: number        // (low + high) / 2
  source: string          // e.g. "Bullish OB" or "FVG midpoint"
}

export type EntryModel =
  | 'judas_sweep'
  | 'fvg_fill'
  | 'cisd'
  | 'silver_bullet'
  | 'breaker_block'
  | 'ote_fibonacci'
  | 'propulsion_block'

export interface EntrySignal {
  // ── Model identifier ───────────────────────────────────────────
  model: EntryModel
  modelLabel: string          // human label: "Judas Sweep" / "FVG Fill" / etc
  // ────────────────────────────────────────────────────────────────

  direction: EntryDirection
  confidence: EntryConfidence
  confidenceScore: number    // 0–100
  entryZone: EntryZoneRange | null
  stopLoss: number | null
  stopNote: string
  targets: TPLevel[]
  riskReward: number | null  // ratio to TP2
  reasons: string[]
  blockers: string[]
  computedAt: string
}
