# Aurvex · Judas × SMC — Tier 3 D3.js Custom Charting System
## Build Workflow v1.0 · Apr 15 2026

---

## Overview

This document defines the full build workflow for the Tier 3 custom D3.js charting engine
embedded inside the `JudasSMCDashboard`. The goal is a fully bespoke, animated, SMC-aware
candlestick renderer with real-time tick updates, session zone shading, and interactive
overlay annotations — all wired directly to the live `JudasSignal` data layer.

No TradingView. No Lightweight Charts. Full ownership. Full control.

---

## Architecture at a Glance

```
JudasSMCDashboard
└── <ChartPanel signal={signal} />          ← new top-level chart wrapper
    ├── useChartData()                       ← candle + tick data hook
    ├── <D3CandleChart />                    ← core D3 SVG renderer
    │   ├── SessionZoneLayer                 ← colored background bands
    │   ├── CandleLayer                      ← OHLC bodies + wicks
    │   ├── SMCOverlayLayer                  ← OB boxes, FVG zones, BSL/SSL lines
    │   ├── SweepAnnotationLayer             ← Judas sweep arrow + label
    │   ├── EntryZoneLayer                   ← green highlight when grade = A+
    │   └── LivePriceLine                    ← animated real-time price crosshair
    └── <ChartControls />                    ← timeframe switcher (1H / 4H / 1D)
```

---

## File Map

```
components/
  judas/
    chart/
      ChartPanel.tsx               ← wrapper, owns state, passes props down
      D3CandleChart.tsx            ← main SVG canvas, D3 zoom + pan
      layers/
        SessionZoneLayer.tsx       ← Asian / London / NY background bands
        CandleLayer.tsx            ← candlestick bodies and wicks
        SMCOverlayLayer.tsx        ← OB boxes, FVG zones, BSL/SSL lines, SMA
        SweepAnnotationLayer.tsx   ← sweep arrow, phase label
        EntryZoneLayer.tsx         ← entry highlight box
        LivePriceLine.tsx          ← animated horizontal price line
      controls/
        ChartControls.tsx          ← 1H / 4H / 1D switcher
      hooks/
        useChartData.ts            ← fetches candles, subscribes to price ticks
        useD3Scale.ts              ← x/y scale factory, updates on zoom/pan
        useSMCOverlays.ts          ← derives overlay shapes from signal.levels
      utils/
        candleTransform.ts         ← raw API candles → D3-ready format
        sessionWindows.ts          ← maps UTC windows to pixel x-ranges
        smcShapes.ts               ← converts SMCLevel[] → SVG rect/line specs
      types/
        chart.ts                   ← internal chart types (Candle, ZoneRect, etc.)

lib/
  judas/
    chartData.ts                   ← server fn: getChartCandles(interval, limit)
```

---

## Step 1 — Internal Chart Types

### File: `components/judas/chart/types/chart.ts`

```typescript
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
  color: string       // CSS variable or hex
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
  label: string       // e.g. "Judas Sweep · Long bias"
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
```

---

## Step 2 — Data Layer

### File: `lib/judas/chartData.ts`

Server-side function. Wraps `getCandles()` from `lib/data/price.ts`.

```typescript
import { getCandles } from '@/lib/data/price'
import { Candle, Interval } from '@/components/judas/chart/types/chart'

export async function getChartCandles(
  interval: Interval,
  limit: number = 200
): Promise<Candle[]>
```

- Maps raw Twelve Data candle format to `Candle` shape
- Filters out incomplete candles (partial current candle is included last)
- Sorts ascending by time
- On failure: returns empty array — caller handles gracefully

---

### File: `components/judas/chart/hooks/useChartData.ts`

Client-side hook. Fetches candles and subscribes to live price.

```typescript
export function useChartData(interval: Interval): {
  candles: Candle[]
  livePrice: number | null
  loading: boolean
  error: string | null
}
```

**Rules:**
- Fetch candles via `/api/chart-candles?interval=1h&limit=200`
- Create a new API route `app/api/chart-candles/route.ts` that calls `getChartCandles()`
- Revalidate candles every 60s using `setInterval`
- Subscribe to live price via XM MCP tick feed (or poll `getLivePrice()` every 10s as fallback)
- Never crash — on fetch failure, retain last good candle set

---

## Step 3 — Scale Hook

### File: `components/judas/chart/hooks/useD3Scale.ts`

```typescript
import * as d3 from 'd3'

export function useD3Scale(
  candles: Candle[],
  width: number,
  height: number,
  visibleRange: [number, number]    // [startIndex, endIndex] into candles array
): {
  xScale: d3.ScaleBand<number>
  yScale: d3.ScaleLinear<number, number>
  xAxis: d3.Axis<number>
  yAxis: d3.Axis<number>
}
```

- `xScale` → band scale, one band per candle, 20% padding between bands
- `yScale` → linear, domain = [min(low) * 0.9995, max(high) * 1.0005] of visible candles
- Recalculates whenever `candles`, `width`, `height`, or `visibleRange` changes
- Export scale updater for zoom/pan transform integration

---

## Step 4 — Utility Functions

### File: `components/judas/chart/utils/candleTransform.ts`

```typescript
export function isGreenCandle(c: Candle): boolean
export function isBearishCandle(c: Candle): boolean
export function candleBodyHeight(c: Candle, yScale: d3.ScaleLinear<number,number>): number
export function candleBodyY(c: Candle, yScale: d3.ScaleLinear<number,number>): number
export function wickTop(c: Candle, yScale: d3.ScaleLinear<number,number>): number
export function wickBottom(c: Candle, yScale: d3.ScaleLinear<number,number>): number
```

---

### File: `components/judas/chart/utils/sessionWindows.ts`

```typescript
// Given a candles array, return the pixel x-ranges for each session zone
export function computeSessionZones(
  candles: Candle[],
  xScale: d3.ScaleBand<number>,
  sessions: [SessionData, SessionData, SessionData]
): SessionZone[]
```

- Asian: UTC 00:00–07:00 → background color `rgba(99,102,241,0.08)` (indigo tint)
- London: UTC 07:00–12:00 → `rgba(245,158,11,0.08)` (amber tint)
- New York: UTC 12:00–21:00 → `rgba(16,185,129,0.08)` (emerald tint)
- London zone gets gold border highlight if `session.judasConfirmed === true`

---

### File: `components/judas/chart/utils/smcShapes.ts`

```typescript
export function levelsToOBBoxes(levels: SMCLevel[], candles: Candle[]): OBBox[]
export function levelsToFVGZones(levels: SMCLevel[], candles: Candle[]): FVGZone[]
export function levelsToHorizontals(levels: SMCLevel[]): HorizontalLevel[]
export function deriveSweepAnnotation(
  signal: JudasSignal,
  candles: Candle[]
): SweepAnnotation | null
export function deriveEntryZone(signal: JudasSignal): EntryZone | null
```

`deriveEntryZone` returns a zone only when:
- `signal.grade` is `'A++'` or `'A+'`
- `signal.judasPhase` contains `'Post-sweep'`
- An active OB level exists in `signal.levels`

---

## Step 5 — Layer Components

### 5a. SessionZoneLayer

**File:** `components/judas/chart/layers/SessionZoneLayer.tsx`

```typescript
interface Props {
  zones: SessionZone[]
  xScale: d3.ScaleBand<number>
  height: number
}
```

- Renders `<rect>` for each zone using `xScale` x-position of first candle in that window
- Uses `fill` with low opacity
- Gold `stroke` border on London zone if `judasConfirmed`
- Label at top of zone: "AS" / "LN" / "NY" in Geist Mono, 9px, zinc-500

---

### 5b. CandleLayer

**File:** `components/judas/chart/layers/CandleLayer.tsx`

```typescript
interface Props {
  candles: Candle[]
  xScale: d3.ScaleBand<number>
  yScale: d3.ScaleLinear<number, number>
}
```

- Body: `<rect>` with rounded corners (rx=1)
- Bull candle: `fill: emerald-500`
- Bear candle: `fill: red-500`
- Wick: `<line>` center of band, `stroke: zinc-500`, `strokeWidth: 1`
- Doji (open ≈ close within $0.50): `stroke: zinc-400` horizontal line, no fill rect
- Animate new candle: opacity 0 → 1 over 200ms on mount

---

### 5c. SMCOverlayLayer

**File:** `components/judas/chart/layers/SMCOverlayLayer.tsx`

```typescript
interface Props {
  overlays: ChartOverlays
  xScale: d3.ScaleBand<number>
  yScale: d3.ScaleLinear<number, number>
  chartWidth: number
}
```

**OB Boxes:**
- Bull OB: `fill: rgba(16,185,129,0.12)`, `stroke: emerald-500`, `strokeWidth: 1`, `strokeDasharray: 4 2`
- Bear OB: `fill: rgba(239,68,68,0.10)`, `stroke: red-500`
- Label inside box: "OB" in Geist Mono 8px

**FVG Zones:**
- `fill: rgba(59,130,246,0.10)`, `stroke: blue-400`, `strokeDasharray: 3 3`
- Label: "FVG" in Geist Mono 8px
- Mitigated FVG: opacity 0.3, strikethrough label

**BSL Line:**
- `stroke: red-400`, `strokeWidth: 1`, `strokeDasharray: 6 3`
- Label right-aligned: "BSL" + price in Geist Mono 9px

**SSL Line:**
- `stroke: emerald-400`, `strokeWidth: 1`, `strokeDasharray: 6 3`
- Label: "SSL"

**100-day SMA:**
- `stroke: zinc-500`, `strokeWidth: 1.5`, solid
- Label: "SMA 100"

---

### 5d. SweepAnnotationLayer

**File:** `components/judas/chart/layers/SweepAnnotationLayer.tsx`

```typescript
interface Props {
  annotation: SweepAnnotation | null
  xScale: d3.ScaleBand<number>
  yScale: d3.ScaleLinear<number, number>
}
```

- Arrow: custom SVG path pointing up (long bias) or down (short bias)
- Color: emerald (long) or red (short)
- Label box below/above arrow: phase text (e.g. "Post-sweep · Long bias")
  - Background: zinc-900, border: gold, text: Geist Mono 10px
- Animate in: scale 0 → 1 with 300ms ease-out on mount

---

### 5e. EntryZoneLayer

**File:** `components/judas/chart/layers/EntryZoneLayer.tsx`

```typescript
interface Props {
  zone: EntryZone | null
  xScale: d3.ScaleBand<number>
  yScale: d3.ScaleLinear<number, number>
  chartWidth: number
}
```

- Only renders when zone is non-null
- Pulsing green rect: `fill: rgba(16,185,129,0.15)`, animated opacity 0.15 ↔ 0.30 on 2s loop
- Right-side label: "ENTRY ZONE" in Geist Mono 9px, emerald-400
- Left border stroke: emerald-500, 2px solid

---

### 5f. LivePriceLine

**File:** `components/judas/chart/layers/LivePriceLine.tsx`

```typescript
interface Props {
  price: number | null
  yScale: d3.ScaleLinear<number, number>
  chartWidth: number
  priceChange: number
}
```

- Horizontal dashed line across full chart width
- Color: emerald if `priceChange >= 0`, red if negative
- Right label: current price in Geist Mono 11px, bold
- Transition: y-position animates smoothly on each tick update (CSS transition 150ms)
- Small dot at right edge of line

---

## Step 6 — Main Chart Canvas

### File: `components/judas/chart/D3CandleChart.tsx`

```typescript
'use client'

interface Props {
  candles: Candle[]
  overlays: ChartOverlays
  livePrice: number | null
  signal: JudasSignal
  width: number
  height: number
}
```

**Implementation:**

1. `useRef` for SVG element
2. `useD3Scale()` for scales
3. `useState<[number, number]>` for `visibleRange` (default: last 80 candles)
4. D3 zoom behavior:
   - Attach to SVG wrapper div
   - On zoom: update `visibleRange` to pan left/right and zoom in/out
   - Min zoom: 40 candles visible; Max zoom: 200 candles visible
5. Responsive: `useResizeObserver` on wrapper div, update `width`
6. Render all layers in z-order:
   ```
   <svg>
     <SessionZoneLayer />     z=0 (background)
     <SMCOverlayLayer />      z=1
     <CandleLayer />          z=2
     <EntryZoneLayer />       z=3
     <SweepAnnotationLayer /> z=4
     <LivePriceLine />        z=5 (top)
     <XAxis />                z=6
     <YAxis />                z=6
   </svg>
   ```
7. Axes: D3 bottom axis (timestamps formatted `HH:mm` for 1H, `MMM DD` for 1D), right axis (prices)

---

## Step 7 — Chart Controls

### File: `components/judas/chart/controls/ChartControls.tsx`

```typescript
interface Props {
  interval: Interval
  onChange: (interval: Interval) => void
}
```

- 3 buttons: `1H` `4H` `1D`
- Active state: zinc-800 background, platinum text, gold bottom border
- Inactive: transparent, zinc-500 text
- Right side: zoom reset button (↺)

---

## Step 8 — Chart Panel (Wrapper)

### File: `components/judas/chart/ChartPanel.tsx`

```typescript
'use client'

interface Props {
  signal: JudasSignal
}
```

**State:**
- `interval: Interval` — default `'1h'`
- Candles + live price from `useChartData(interval)`
- Overlays from `useSMCOverlays(signal)`

**Layout:**
```
┌─────────────────────────────────────────────┐
│  [Section title: "Price Action"]  ⚠ stale?  │
├──────────────────────────────────┬──────────┤
│                                  │  1H 4H 1D │
│     D3CandleChart                │          │
│     (takes full 2/3 left col)    │          │
│                                  │          │
└──────────────────────────────────┴──────────┘
```

- Chart height: `480px`
- On `priceStale`: show amber `⚠ stale` badge next to section title
- Loading state: skeleton shimmer (no spinner — use CSS animated gradient)

---

## Step 9 — Dashboard Integration

### Update `components/judas/JudasSMCDashboard.tsx`

Insert `<ChartPanel signal={signal} />` between the **4-card metric row** and the **main 2-column grid**:

```tsx
{/* 4 metric cards */}
<MetricRow signal={signal} />

{/* NEW: Full-width chart panel */}
<ChartPanel signal={signal} />

{/* Main 2-col grid */}
<div className="grid grid-cols-3 gap-4">
  <div className="col-span-2">
    <SessionChain ... />
    <SMCLevelsTable ... />
  </div>
  <div>
    <FactorList ... />
  </div>
</div>
```

---

## Step 10 — API Route

### File: `app/api/chart-candles/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getChartCandles } from '@/lib/judas/chartData'
import { Interval } from '@/components/judas/chart/types/chart'

export const revalidate = 60

export async function GET(req: NextRequest) {
  const interval = (req.nextUrl.searchParams.get('interval') ?? '1h') as Interval
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '200')
  try {
    const candles = await getChartCandles(interval, limit)
    return NextResponse.json(candles)
  } catch (err) {
    console.error('[chart-candles] failed:', err)
    return NextResponse.json([], { status: 200 }) // never 500 — return empty
  }
}
```

---

## Step 11 — D3 Installation

```bash
npm install d3
npm install --save-dev @types/d3
```

D3 is imported per-module — only import what you need:

```typescript
import { scaleLinear, scaleBand } from 'd3-scale'
import { axisBottom, axisRight } from 'd3-axis'
import { zoom, zoomTransform } from 'd3-zoom'
import { select } from 'd3-selection'
```

This tree-shakes cleanly with Next.js bundler.

---

## Step 12 — Checklist

Before marking complete:

- [ ] D3 installed, `@types/d3` installed
- [ ] `/api/chart-candles` route returns candles without throwing
- [ ] `useChartData()` hook polls every 60s and never crashes
- [ ] All 6 layers render in correct z-order
- [ ] Zoom and pan functional on desktop and touch
- [ ] Session zones color-coded correctly (indigo/amber/emerald)
- [ ] OB boxes, FVG zones, BSL/SSL lines drawn from `signal.levels`
- [ ] Sweep annotation appears only when `judasPhase` contains "Post-sweep"
- [ ] Entry zone pulsing only when grade = A+ or A++ and phase = Post-sweep
- [ ] Live price line updates smoothly on each tick
- [ ] Stale badge shown if `signal.priceStale === true`
- [ ] Timeframe switcher (1H / 4H / 1D) correctly refetches candles
- [ ] Chart renders gracefully with empty candle array (loading skeleton)
- [ ] TypeScript strict — no `any` types
- [ ] No Framer Motion — CSS transitions only
- [ ] Chart is readable on 1280px and 1920px viewports

---

## Visual Reference — Layer Stack

```
┌──────────────────────────────────────────────────────┐
│  ░░░░░ Asian ░░░░░  ▓▓▓▓▓ London ▓▓▓▓▓  ░ NY ░░░   │  ← SessionZoneLayer
│                                                      │
│  ┌────────────────────────────┐                      │
│  │  FVG Zone (blue, dashed)   │                      │  ← SMCOverlayLayer
│  └────────────────────────────┘                      │
│  ╔═══════╗  ← Bull OB (green box)                    │
│  ║       ║                                           │
│  ╚═══════╝                                           │
│  - - - - - - - - - - - - - - - - - BSL $3,245 - -   │
│                                                      │
│    │  │  │ ▐█ │  ▐█  ▐█  │  ▐█  │                  │  ← CandleLayer
│   ─┼──┼──┼─█──┼───█───█──┼───█──┼─                 │
│    │  │  │ █▌ │  █▌  █▌  │   │  │                  │
│                                                      │
│  ╔══════════════════════════════════╗               │
│  ║  ENTRY ZONE (pulsing green)      ║               │  ← EntryZoneLayer
│  ╚══════════════════════════════════╝               │
│                                                      │
│     ↑  ┌─────────────────────┐                      │
│        │ Post-sweep · Long   │                      │  ← SweepAnnotationLayer
│        └─────────────────────┘                      │
│                                                      │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  $3,228.40       │  ← LivePriceLine
└──────────────────────────────────────────────────────┘
```

---

*Aurvex · Judas × SMC · Tier 3 Charting Workflow · v1.0 · Apr 15 2026*
