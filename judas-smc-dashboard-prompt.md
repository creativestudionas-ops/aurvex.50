# Judas × SMC Dashboard — Claude Code Build Prompt

## Overview

Build a fully live, data-connected `JudasSMCDashboard` component for the Aurvex platform.
This covers the component, types, data fetching layer, and demo route.

---

## Step 1 — Types

Create `types/judas.ts` with the following type definitions:

```typescript
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
```

---

## Step 2 — Data Fetching

Create `lib/judas/fetchJudasSignal.ts` as a **server-side** function.

### 2a. Spot price

Use the existing `getLivePrice()` from `lib/data/price.ts`.
Map: `price`, `ch` → `priceChange`, `chp` → `priceChangePct`.
Cache: `revalidate: 30`.
On failure: return last cached value with `priceStale: true`.

### 2b. Session candles + Judas chain

Use `getCandles('1h')` from `lib/data/price.ts` (Twelve Data, 200 candles).

Pipe into existing `extractSessionData()` and `computeChainState()`.

Derive:
- `sessions[0]` — Asian: UTC 00:00–07:00, H/L of that window
- `sessions[1]` — London: UTC 07:00–12:00, detect if Asian H or L was swept, then reversed
- `sessions[2]` — New York: UTC 12:00–21:00, continuation or reversal of London
- `judasPhase`: if London swept Asian low and reversed → `'Post-sweep · long bias'`; swept high and reversed → `'Post-sweep · short bias'`; neither → `'Pre-sweep · watching'`
- `sessionBias`: derive from chain state (`'Long continuation'`, `'Short continuation'`, `'Reversal watch'`, `'Ranging'`)

### 2c. SMC levels

Use `getCandles('1h')` and `getCandles('4h')` and `getCandles('1day')`.

Compute:

**BSL (Buy-side liquidity)**
- Find equal highs in last 20 × 1H candles where two or more candle highs are within $5 of each other
- That price zone is the BSL
- Mark as `active: true` if current price is within $30 below it

**Bullish OB (1H)**
- Scan last 50 × 1H candles for the most recent bullish impulse leg (3+ consecutive bullish candles moving $20+)
- The last bearish candle immediately before that leg = the order block
- `priceLow` = that candle's low, `priceHigh` = that candle's high

**FVG (4H)**
- Scan last 30 × 4H candles
- FVG exists where `candles[i+2].low > candles[i].high` (gap between bodies)
- Use the most recent unmitigated one (price has not traded back through it)

**SSL swept**
- Prior session (London) low
- Flag `active: true` if price traded below it and recovered above within the session

**100-day SMA**
- `getCandles('1day')`, take last 100 closes, compute simple average

### 2d. COT data

Use the existing CFTC COT API route.
Extract commercial net position and speculator net position.
Compute rolling percentile: rank current reading against the last 52 weeks of data.
Return `commercialPctile`, `specPctile`, `weekOf`.
On failure: `stale: true`.

### 2e. Macro

Use existing FRED calls:
- DXY: series `DTWEXBGS`
- US 10Y: series `DGS10`

Filter out `"."` (FRED placeholder for missing data) before reading values.
Take the most recent valid observation.
Compute 1-day change for each.
On failure: `stale: true`.

### 2f. 18-factor score

Run existing `computeScore()` from `lib/judas/grades.ts` (or wherever it currently lives) against the assembled data above.

Return:
- `score: number` (0–100)
- `grade: SignalGrade`
- `factors: JudasFactor[]` — each factor with name, weight, value earned, direction, note

### 2g. Error handling rule

If **any single source** fails:
- Use last cached value for that field
- Set `stale: true` on that field's sub-object
- Do **not** throw — return a partial `JudasSignal` with whatever data is available
- Log the failure with `console.error('[judas] source failed:', sourceName, error)`

### 2h. Export

```typescript
export async function fetchJudasSignal(): Promise<JudasSignal>
```

---

## Step 3 — Component

Create `components/judas/JudasSMCDashboard.tsx`.

```typescript
'use client'

import { JudasSignal } from '@/types/judas'

interface Props {
  signal: JudasSignal
}

export default function JudasSMCDashboard({ signal }: Props) { ... }
```

### Design system

- Font: Cormorant (serif) for section headings, Geist Mono for all price values
- Palette: obsidian/platinum — match existing Aurvex color tokens
- Tailwind v4 only — no Framer Motion, no inline style overrides unless Tailwind cannot express it
- Positive delta: `text-emerald-500` / green token
- Negative delta: `text-red-500` / red token
- Neutral: `text-zinc-400`

### Layout (top to bottom)

#### Header bar
- Left: "Judas × SMC" title (Cormorant), asset label "XAU/USD", session label + UTC time
- Right: live spot price (Geist Mono, large), daily change amount + %

#### Metric row — 4 cards
| Card | Content |
|------|---------|
| SMS Grade | `signal.grade` — color-coded A++/A+/A = green, B = amber, C/F = red |
| Score | `signal.score / 100` with a fill progress bar |
| Session Bias | `signal.sessionBias` text + sub-label |
| Judas Phase | `signal.judasPhase` text + sub-label |

#### Main 2-column grid (2/3 + 1/3)

**Left column:**

*Session chain* — 3 boxes (Asian → London → New York) connected by arrows
- Each box: session label, price range (Geist Mono), range size in $, status badge, note
- London box: highlight border if Judas confirmed
- NY box: amber border if active/live

*SMC levels table* — rows for each level in `signal.levels`
- Columns: colored dot, level name, price / price range (Geist Mono), description
- BSL rows: red dot
- OB rows: green dot
- FVG rows: blue dot
- SSL rows: green dot (if swept and recovered)
- SMA rows: gray dot

**Right column:**

*18-factor scoring list*
- Each factor: colored dot (up/down/neutral), factor name, earned value (e.g. `+22` or `−14`)
- Divider line
- Net score bar at bottom

#### Bottom 3-column row

**COT positioning**
- Two labeled bars: "Commercials (smart money)" and "Large speculators"
- Bar fill = percentile (0–100%)
- Commercial bar: green fill if > 60th percentile, red if < 40th
- Spec bar: inverse coloring
- Show percentile label on right
- If `signal.cot.stale` → show "Stale data" badge

**Trade framework**
- Primary scenario card (green accent border)
- Alternate scenario card (gray border)
- Invalidation note at bottom in muted text

**Catalyst watch**
- List of `signal.catalysts`
- Each: event name, impact badge (high/medium/low), direction badge, note text
- Time label if present

#### Stale indicators
If any data field has `stale: true`, show a small amber `⚠ stale` badge next to that section title.

---

## Step 4 — Demo route

Create `app/judas-demo/page.tsx`:

```typescript
import { fetchJudasSignal } from '@/lib/judas/fetchJudasSignal'
import JudasSMCDashboard from '@/components/judas/JudasSMCDashboard'

export const revalidate = 60

export default async function JudasDemoPage() {
  const signal = await fetchJudasSignal()
  return (
    <main className="min-h-screen p-6">
      <JudasSMCDashboard signal={signal} />
    </main>
  )
}
```

---

## Step 5 — Mock data fallback

Create `lib/judas/mockSignal.ts` with a fully populated `JudasSignal` object using realistic values based on current XAU/USD conditions (~$4,787, Apr 14 2026).

Use this in `fetchJudasSignal.ts` as the absolute last fallback if all APIs fail, so the dashboard always renders something rather than crashing.

---

## Step 6 — Checklist

Before finishing, verify:

- [ ] `fetchJudasSignal()` never throws — all errors are caught and logged
- [ ] Dashboard renders with mock data if all APIs are unavailable
- [ ] All prices render through Geist Mono
- [ ] Stale badges appear on any section with degraded data
- [ ] `app/judas-demo` route is accessible and ISR revalidates every 60s
- [ ] No Framer Motion imports anywhere in this component tree
- [ ] TypeScript strict mode — no `any` types

---

## File map

```
types/
  judas.ts

lib/
  judas/
    fetchJudasSignal.ts
    mockSignal.ts

components/
  judas/
    JudasSMCDashboard.tsx

app/
  judas-demo/
    page.tsx
```

---

*Aurvex · Judas × SMC Dashboard · Build spec v1.0 · Apr 14 2026*
