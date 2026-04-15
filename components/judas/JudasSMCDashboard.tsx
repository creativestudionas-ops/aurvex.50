'use client'

import { useState, useEffect, useCallback } from 'react'
import type {
  JudasSignal,
  SessionData,
  SMCLevel,
  JudasFactor,
  Catalyst,
  TradeScenario,
  SignalGrade,
  FactorDirection,
} from '@/types/judas'
import ChartPanel from './chart/ChartPanel'
import WarningPanel from './WarningPanel'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface Props {
  signal: JudasSignal
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatPrice(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function gradeColor(grade: SignalGrade): string {
  switch (grade) {
    case 'A++':
    case 'A+':
    case 'A':
      return 'text-emerald-400'
    case 'B':
      return 'text-amber-400'
    case 'C':
    case 'F':
      return 'text-red-400'
  }
}

function gradeBg(grade: SignalGrade): string {
  switch (grade) {
    case 'A++':
    case 'A+':
    case 'A':
      return 'bg-emerald-500/20 border-emerald-500/40'
    case 'B':
      return 'bg-amber-500/20 border-amber-500/40'
    case 'C':
    case 'F':
      return 'bg-red-500/20 border-red-500/40'
  }
}

function dirColor(dir: FactorDirection): string {
  switch (dir) {
    case 'up':
      return 'bg-emerald-500'
    case 'down':
      return 'bg-red-500'
    case 'neutral':
      return 'bg-zinc-500'
  }
}

function dirText(dir: FactorDirection): string {
  switch (dir) {
    case 'up':
      return 'text-emerald-400'
    case 'down':
      return 'text-red-400'
    case 'neutral':
      return 'text-zinc-400'
  }
}

function smcDotColor(type: SMCLevel['type']): string {
  switch (type) {
    case 'BSL':
      return 'bg-red-500'
    case 'OB_bull':
    case 'SSL':
      return 'bg-emerald-500'
    case 'OB_bear':
      return 'bg-red-500'
    case 'FVG':
      return 'bg-blue-500'
    case 'SMA':
      return 'bg-zinc-500'
  }
}

function impactColor(impact: Catalyst['impact']): string {
  switch (impact) {
    case 'high':
      return 'bg-red-500/20 text-red-400 border-red-500/40'
    case 'medium':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/40'
    case 'low':
      return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40'
  }
}

function utcNow(): string {
  return new Date().toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }) + ' UTC'
}

// ---------------------------------------------------------------------------
// Stale badge
// ---------------------------------------------------------------------------
function StaleBadge({ show }: { show: boolean | undefined }) {
  if (!show) return null
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-sm bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/30">
      &#x26A0; stale
    </span>
  )
}

// ---------------------------------------------------------------------------
// Live price hook
// ---------------------------------------------------------------------------
interface LivePrice {
  price: number
  ch: number
  chp: number
}

function useLivePrice(initial: LivePrice, intervalMs = 5000): LivePrice {
  const [tick, setTick] = useState<LivePrice>(initial)

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/price', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as LivePrice
      if (data.price > 0) setTick(data)
    } catch {
      // silent — keep last known tick
    }
  }, [])

  useEffect(() => {
    const id = setInterval(poll, intervalMs)
    // Fire immediately on mount so we don't wait for the first interval
    poll()
    return () => clearInterval(id)
  }, [poll, intervalMs])

  return tick
}

// ---------------------------------------------------------------------------
// Header bar
// ---------------------------------------------------------------------------
function Header({ signal, live }: Props & { live?: LivePrice }) {
  const p = live ?? { price: signal.price, ch: signal.priceChange, chp: signal.priceChangePct }
  const positive = p.ch >= 0
  const [clock, setClock] = useState(utcNow())

  useEffect(() => {
    const id = setInterval(() => setClock(utcNow()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-800 pb-4 mb-6 gap-3">
      <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
        <h1 className="font-[Cormorant] text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
          Judas &times; SMC
        </h1>
        <span className="rounded-sm bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-300">
          XAU/USD
        </span>
        <span className="text-xs text-zinc-500" suppressHydrationWarning>
          {signal.sessionLabel} &middot; {clock}
        </span>
        <StaleBadge show={signal.priceStale} />
      </div>
      <div className="flex items-center gap-3 sm:text-right">
        <span className="font-[Geist_Mono] text-2xl sm:text-3xl font-semibold text-zinc-100 tabular-nums">
          {formatPrice(p.price)}
        </span>
        <div className="flex flex-col items-end">
          <span className={`font-[Geist_Mono] text-sm tabular-nums ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {positive ? '+' : ''}{formatPrice(p.ch)}
          </span>
          <span className={`font-[Geist_Mono] text-xs tabular-nums ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {positive ? '+' : ''}{p.chp.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 4-card metric row
// ---------------------------------------------------------------------------
function MetricCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="font-[Cormorant] text-xs uppercase tracking-wider text-zinc-500 mb-1">{label}</p>
      {children}
    </div>
  )
}

function MetricRow({ signal }: Props) {
  const barWidth = Math.max(0, Math.min(100, signal.score))
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      <MetricCard label="SMC Grade">
        <p className={`text-2xl font-bold ${gradeColor(signal.grade)}`}>{signal.grade}</p>
      </MetricCard>
      <MetricCard label="Score">
        <p className="font-[Geist_Mono] text-2xl font-bold text-zinc-100 tabular-nums">{signal.score}<span className="text-sm text-zinc-500">/100</span></p>
        <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${signal.score >= 70 ? 'bg-emerald-500' : signal.score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </MetricCard>
      <MetricCard label="Session Bias">
        <p className="text-lg font-semibold text-zinc-100">{signal.sessionBias}</p>
        <p className="text-xs text-zinc-500">{signal.sessionLabel} session</p>
      </MetricCard>
      <MetricCard label="Judas Phase">
        <p className="text-lg font-semibold text-zinc-100">{signal.judasPhase}</p>
        <p className="text-xs text-zinc-500">Sweep detection</p>
      </MetricCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Session chain (left column)
// ---------------------------------------------------------------------------
function SessionBox({ session }: { session: SessionData }) {
  const isJudas = session.judasConfirmed
  const isActive = session.status === 'active'

  let borderClass = 'border-zinc-800'
  if (isJudas) borderClass = 'border-yellow-500/60'
  else if (isActive) borderClass = 'border-amber-500/40'

  const statusColors: Record<string, string> = {
    consolidation: 'bg-zinc-500/20 text-zinc-400',
    judas_confirmed: 'bg-yellow-500/20 text-yellow-400',
    active: 'bg-amber-500/20 text-amber-400',
    closed: 'bg-zinc-700/40 text-zinc-500',
  }

  return (
    <div className={`flex-1 rounded-lg border ${borderClass} bg-zinc-900/60 p-3`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-[Cormorant] text-sm font-semibold text-zinc-300">{session.label}</span>
        <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium border ${statusColors[session.status] ?? statusColors.closed} border-current/20`}>
          {session.status.replace('_', ' ')}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-[Geist_Mono] text-sm text-zinc-100 tabular-nums">H {formatPrice(session.high)}</span>
        <span className="text-zinc-600">/</span>
        <span className="font-[Geist_Mono] text-sm text-zinc-100 tabular-nums">L {formatPrice(session.low)}</span>
      </div>
      <p className="font-[Geist_Mono] text-xs text-zinc-500 mt-1 tabular-nums">
        Range ${(session.high - session.low).toFixed(2)}
      </p>
      <p className="text-xs text-zinc-500 mt-1 leading-tight">{session.note}</p>
    </div>
  )
}

function SessionChain({ sessions }: { sessions: [SessionData, SessionData, SessionData] }) {
  return (
    <div className="mb-6">
      <h2 className="font-[Cormorant] text-sm uppercase tracking-wider text-zinc-500 mb-3">Session Chain</h2>
      <div className="flex flex-col sm:flex-row items-stretch gap-2">
        <SessionBox session={sessions[0]} />
        <div className="hidden sm:flex items-center text-zinc-600 text-lg shrink-0">&rarr;</div>
        <SessionBox session={sessions[1]} />
        <div className="hidden sm:flex items-center text-zinc-600 text-lg shrink-0">&rarr;</div>
        <SessionBox session={sessions[2]} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SMC levels table (left column)
// ---------------------------------------------------------------------------
function SMCLevelsTable({ levels, stale }: { levels: SMCLevel[]; stale: boolean }) {
  return (
    <div>
      <div className="flex items-center mb-3">
        <h2 className="font-[Cormorant] text-sm uppercase tracking-wider text-zinc-500">SMC Levels</h2>
        <StaleBadge show={stale} />
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs text-zinc-600">
              <th className="py-2 px-3 text-left w-6" />
              <th className="py-2 px-3 text-left">Level</th>
              <th className="py-2 px-3 text-right">Price</th>
              <th className="py-2 px-3 text-left hidden md:table-cell">Description</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((level, i) => (
              <tr key={i} className="border-b border-zinc-800/50 last:border-0">
                <td className="py-2 px-3">
                  <span className={`inline-block h-2 w-2 rounded-full ${smcDotColor(level.type)}`} />
                </td>
                <td className="py-2 px-3 text-zinc-300 font-medium">{level.name}</td>
                <td className="py-2 px-3 text-right">
                  <span className="font-[Geist_Mono] text-zinc-100 tabular-nums">
                    {level.priceHigh && level.priceLow
                      ? `${formatPrice(level.priceLow)}\u2013${formatPrice(level.priceHigh)}`
                      : formatPrice(level.price)}
                  </span>
                </td>
                <td className="py-2 px-3 text-zinc-500 text-xs hidden md:table-cell">{level.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 18-factor list (right column)
// ---------------------------------------------------------------------------
function FactorList({ factors, score }: { factors: JudasFactor[]; score: number }) {
  const maxPossible = factors.reduce((s, f) => s + Math.abs(f.weight), 0)
  const barPct = maxPossible > 0 ? Math.max(0, Math.min(100, (score / maxPossible) * 100)) : 0

  return (
    <div>
      <h2 className="font-[Cormorant] text-sm uppercase tracking-wider text-zinc-500 mb-3">18-Factor Breakdown</h2>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
        <ul className="space-y-1.5">
          {factors.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${dirColor(f.direction)}`} />
              <span className="text-zinc-400 flex-1 truncate">{f.name}</span>
              <span className={`font-[Geist_Mono] tabular-nums ${dirText(f.direction)}`}>
                {f.value >= 0 ? '+' : ''}{f.value}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-zinc-800 pt-3">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-zinc-500">Net Score</span>
            <span className="font-[Geist_Mono] text-zinc-100 tabular-nums">{score}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full rounded-full ${score >= 70 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${barPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// COT positioning
// ---------------------------------------------------------------------------
function CotPanel({ cot }: { cot: JudasSignal['cot'] }) {
  const commColor = cot.commercialPctile > 60 ? 'bg-emerald-500' : cot.commercialPctile < 40 ? 'bg-red-500' : 'bg-zinc-500'
  const specColor = cot.specPctile > 60 ? 'bg-red-500' : cot.specPctile < 40 ? 'bg-emerald-500' : 'bg-zinc-500'

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center mb-3">
        <h3 className="font-[Cormorant] text-sm uppercase tracking-wider text-zinc-500">COT Positioning</h3>
        <StaleBadge show={cot.stale} />
      </div>
      {/* Commercial */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-zinc-400">Commercials (smart money)</span>
          <span className="font-[Geist_Mono] text-zinc-300 tabular-nums">{cot.commercialPctile}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div className={`h-full rounded-full ${commColor}`} style={{ width: `${cot.commercialPctile}%` }} />
        </div>
      </div>
      {/* Spec */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-zinc-400">Large speculators</span>
          <span className="font-[Geist_Mono] text-zinc-300 tabular-nums">{cot.specPctile}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div className={`h-full rounded-full ${specColor}`} style={{ width: `${cot.specPctile}%` }} />
        </div>
      </div>
      <p className="text-[10px] text-zinc-600 mt-2">Week of {cot.weekOf}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trade framework
// ---------------------------------------------------------------------------
function TradePanel({ scenarios }: { scenarios: TradeScenario[] }) {
  const primary = scenarios.find((s) => s.type === 'primary')
  const alternate = scenarios.find((s) => s.type === 'alternate')

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="font-[Cormorant] text-sm uppercase tracking-wider text-zinc-500 mb-3">Trade Framework</h3>
      {primary && (
        <div className="border-l-2 border-emerald-500/60 pl-3 mb-3">
          <p className="text-xs font-medium text-emerald-400 mb-1">{primary.label}</p>
          <p className="text-xs text-zinc-400 leading-relaxed">{primary.description}</p>
        </div>
      )}
      {alternate && (
        <div className="border-l-2 border-zinc-700 pl-3 mb-3">
          <p className="text-xs font-medium text-zinc-400 mb-1">{alternate.label}</p>
          <p className="text-xs text-zinc-500 leading-relaxed">{alternate.description}</p>
        </div>
      )}
      {primary?.invalidation && (
        <p className="text-[10px] text-zinc-600 italic mt-1">
          Invalidation: {primary.invalidation}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Catalyst watch
// ---------------------------------------------------------------------------
function CatalystPanel({ catalysts }: { catalysts: Catalyst[] }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="font-[Cormorant] text-sm uppercase tracking-wider text-zinc-500 mb-3">Catalyst Watch</h3>
      <ul className="space-y-2.5">
        {catalysts.map((c, i) => (
          <li key={i} className="text-xs">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-zinc-200 font-medium">{c.name}</span>
              <span className={`rounded-sm border px-1 py-px text-[10px] font-medium ${impactColor(c.impact)}`}>
                {c.impact}
              </span>
              <span className={`rounded-sm border px-1 py-px text-[10px] font-medium ${
                c.direction === 'up'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : c.direction === 'down'
                    ? 'bg-red-500/20 text-red-400 border-red-500/40'
                    : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40'
              }`}>
                {c.direction}
              </span>
            </div>
            <p className="text-zinc-500 leading-tight">{c.note}</p>
            {c.time && <p className="text-zinc-600 mt-0.5">{c.time}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------
export default function JudasSMCDashboard({ signal }: Props) {
  // Live price polling — updates every 5 seconds from MT5
  const live = useLivePrice(
    { price: signal.price, ch: signal.priceChange, chp: signal.priceChangePct },
    10000,
  )

  // Detect if SMC levels are from stale data
  const levelsStale = signal.levels.length > 0 && signal.levels.every((l) => !l.active) && signal.priceStale

  return (
    <div className="mx-auto max-w-7xl text-zinc-300">
      {/* Header */}
      <Header signal={signal} live={live} />

      {/* 4-card metric row */}
      <MetricRow signal={signal} />

      {/* Full-width chart panel */}
      <ChartPanel signal={signal} />

      {/* Candle warning system */}
      <WarningPanel warnings={signal.warnings} />

      {/* Main 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Left column — 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          <SessionChain sessions={signal.sessions} />
          <SMCLevelsTable levels={signal.levels} stale={!!levelsStale} />
        </div>

        {/* Right column — 1/3 */}
        <div>
          <FactorList factors={signal.factors} score={signal.score} />
        </div>
      </div>

      {/* Bottom 3-column row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <CotPanel cot={signal.cot} />
        <TradePanel scenarios={signal.tradeScenarios} />
        <CatalystPanel catalysts={signal.catalysts} />
      </div>

      {/* Footer timestamp */}
      <p className="mt-6 text-center text-[10px] text-zinc-700">
        Computed at {signal.computedAt}
      </p>
    </div>
  )
}
