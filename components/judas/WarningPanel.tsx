'use client'

import { useState } from 'react'
import type { CandleWarning, WarningSeverity } from '@/types/judas'

// ---------------------------------------------------------------------------
// Severity config
// ---------------------------------------------------------------------------
const severityConfig: Record<
  WarningSeverity,
  { label: string; borderColor: string; bgClass: string; dotColor: string; textColor: string }
> = {
  critical: {
    label: 'CRITICAL',
    borderColor: '#ef4444',
    bgClass: 'bg-red-950/30',
    dotColor: '#ef4444',
    textColor: 'text-red-400',
  },
  high: {
    label: 'HIGH',
    borderColor: '#f97316',
    bgClass: 'bg-orange-950/20',
    dotColor: '#f97316',
    textColor: 'text-orange-400',
  },
  medium: {
    label: 'MEDIUM',
    borderColor: '#eab308',
    bgClass: 'bg-yellow-950/20',
    dotColor: '#eab308',
    textColor: 'text-yellow-400',
  },
  info: {
    label: 'INFO',
    borderColor: '#71717a',
    bgClass: 'bg-transparent',
    dotColor: '#71717a',
    textColor: 'text-zinc-500',
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatPrice(n: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// ---------------------------------------------------------------------------
// Warning row
// ---------------------------------------------------------------------------
function WarningRow({ warning }: { warning: CandleWarning }) {
  const cfg = severityConfig[warning.severity]

  return (
    <div
      className={`${cfg.bgClass} rounded-md px-3 py-2.5`}
      style={{ borderLeft: `3px solid ${cfg.borderColor}` }}
    >
      {/* Top line: dot + severity + category + confirmed badge */}
      <div className="flex items-center gap-2 mb-1">
        <span
          className="inline-block h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: cfg.dotColor }}
        />
        <span
          className={`font-[Geist_Mono] text-[10px] font-medium uppercase ${cfg.textColor}`}
        >
          {cfg.label}
        </span>
        <span className="text-[10px] text-zinc-600">&middot;</span>
        <span className="text-[10px] text-zinc-500">{warning.category}</span>
        {!warning.confirmed && (
          <span className="ml-auto rounded-sm bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/30">
            forming
          </span>
        )}
        {warning.confirmed && (
          <span className="ml-auto text-[10px] text-zinc-600">confirmed</span>
        )}
      </div>

      {/* Title */}
      <p className="text-[13px] font-medium text-zinc-100 mb-0.5">
        {warning.title}
      </p>

      {/* Direction + Price */}
      <p className="font-[Geist_Mono] text-xs text-zinc-400 mb-1">
        <span
          className={
            warning.direction === 'bullish'
              ? 'text-emerald-400'
              : 'text-red-400'
          }
        >
          {warning.direction === 'bullish' ? '\u25B2' : '\u25BC'}{' '}
          {warning.direction}
        </span>
        <span className="text-zinc-600 mx-1.5">&middot;</span>
        <span className="text-zinc-300">${formatPrice(warning.price)}</span>
      </p>

      {/* Note — max 2 lines */}
      <p className="text-xs text-zinc-400 leading-tight line-clamp-2">
        {warning.note}
      </p>

      {/* Level confluence */}
      {warning.levelConfluence && (
        <p className="font-[Geist_Mono] text-[11px] text-zinc-500 italic mt-1">
          {warning.levelConfluence}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------
interface Props {
  warnings: CandleWarning[]
}

export default function WarningPanel({ warnings }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (!warnings || warnings.length === 0) return null

  const visible = expanded ? warnings : warnings.slice(0, 5)
  const hidden = warnings.length - 5

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-[Cormorant] text-sm uppercase tracking-wider text-zinc-500">
            Candle Warnings
          </h2>
          <span className="rounded-sm bg-zinc-700 px-1.5 py-0.5 font-[Geist_Mono] text-[10px] text-zinc-400">
            4H
          </span>
        </div>
        <span className="text-xs text-zinc-500">
          {warnings.length} active
        </span>
      </div>

      {/* Warning rows */}
      <div className="space-y-2">
        {visible.map((w) => (
          <WarningRow key={w.id} warning={w} />
        ))}
      </div>

      {/* Expand button */}
      {!expanded && hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 w-full rounded-md border border-zinc-800 bg-zinc-900/40 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
        >
          + {hidden} more
        </button>
      )}
    </div>
  )
}
