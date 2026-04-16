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
// Styling constants (Patch 1.1)
// ---------------------------------------------------------------------------
const SEVERITY_DOT_COLOR: Record<WarningSeverity, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  info:     '#52525b',
}

const TIMELINE_DOT_BG_LATEST: Record<'bullish' | 'bearish', string> = {
  bullish: '#052e16',
  bearish: '#1a0808',
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
      {/* Top line: dot + severity + category + latest badge + confirmed badge */}
      <div className="flex items-center gap-2 mb-1 flex-wrap">
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

        {/* Latest badge */}
        {warning.isLatest && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            padding: '1px 7px',
            borderRadius: 3,
            background: 'rgba(16,185,129,0.15)',
            color: '#34d399',
            border: '0.5px solid rgba(16,185,129,0.3)',
            fontWeight: 500,
          }}>
            latest
          </span>
        )}

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

      {/* Timestamp row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 4,
        flexWrap: 'wrap',
      }}>
        {/* Direction */}
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: warning.direction === 'bullish' ? '#34d399' : '#f87171',
        }}>
          {warning.direction === 'bullish' ? '\u25B2' : '\u25BC'} {warning.direction}
        </span>

        {/* Clock pill */}
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: '#e4e4e7',
          background: '#1a1a1d',
          border: '0.5px solid #2f2f35',
          borderRadius: 4,
          padding: '2px 7px',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}>
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <circle cx="4.5" cy="4.5" r="3.5" stroke="#52525b" strokeWidth="1.2"/>
            <line x1="4.5" y1="2.5" x2="4.5" y2="4.5"
                  stroke="#52525b" strokeWidth="1.2" strokeLinecap="round"/>
            <line x1="4.5" y1="4.5" x2="6"   y2="4.5"
                  stroke="#52525b" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          {warning.formattedTime}
        </span>

        {/* Time ago */}
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: '#52525b',
        }}>
          {warning.timeAgo}
        </span>
      </div>

      {/* Price */}
      <p className="font-[Geist_Mono] text-xs text-zinc-300 mb-1">
        ${formatPrice(warning.price)}
      </p>

      {/* Note */}
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
// Timeline strip
// ---------------------------------------------------------------------------
function TimelineStrip({ warnings }: { warnings: CandleWarning[] }) {
  if (warnings.length === 0) return null

  const sorted = [...warnings].sort((a, b) => a.candleTime - b.candleTime)

  return (
    <div style={{
      background: '#111114',
      borderTop: '0.5px solid #1f1f23',
      padding: '10px 18px 12px',
    }}>
      {/* Label */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: '#52525b',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 10,
      }}>
        Signal timeline &middot; last 24H
      </div>

      {/* Timeline row */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        position: 'relative',
      }}>
        {/* Connector line behind all dots */}
        <div style={{
          position: 'absolute',
          top: 7,
          left: 7,
          right: 7,
          height: 1,
          background: '#27272a',
          zIndex: 0,
        }} />

        {sorted.map((w) => {
          const dotColor = SEVERITY_DOT_COLOR[w.severity]
          const dotSize  = w.isLatest ? 16 : 14
          const dotBg    = w.isLatest ? TIMELINE_DOT_BG_LATEST[w.direction] : '#0d0d0f'

          return (
            <div key={w.id} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              flex: 1,
              position: 'relative',
              zIndex: 1,
            }}>
              {/* Dot */}
              <div style={{
                width: dotSize,
                height: dotSize,
                borderRadius: '50%',
                border: `2px solid ${dotColor}`,
                background: dotBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 5,
                marginTop: w.isLatest ? -1 : 0,
              }}>
                <div style={{
                  width: w.isLatest ? 7 : 6,
                  height: w.isLatest ? 7 : 6,
                  borderRadius: '50%',
                  background: dotColor,
                }} />
              </div>

              {/* Date + time */}
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: w.isLatest ? '#e4e4e7' : '#52525b',
                fontWeight: w.isLatest ? 500 : 400,
                textAlign: 'center',
                marginBottom: 2,
                lineHeight: 1.4,
                whiteSpace: 'pre-line',
              }}>
                {w.formattedTime.replace(' \u00b7 ', '\n')}
              </div>

              {/* Signal name */}
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                color: w.isLatest ? '#34d399' : '#71717a',
                fontWeight: w.isLatest ? 500 : 400,
                textAlign: 'center',
                maxWidth: 68,
                lineHeight: 1.3,
              }}>
                {w.isLatest ? `${w.title} \u00b7 latest` : w.title}
              </div>
            </div>
          )
        })}

        {/* Future candle placeholder dot */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          flex: 1,
          position: 'relative',
          zIndex: 1,
        }}>
          <div style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: '2px solid #27272a',
            background: '#0d0d0f',
            marginBottom: 5,
          }} />
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: '#3f3f46',
            textAlign: 'center',
            marginBottom: 2,
            lineHeight: 1.4,
          }}>
            Next<br/>candle
          </div>
        </div>
      </div>
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
  const [sortMode, setSortMode] = useState<'severity' | 'latest'>('severity')

  if (!warnings || warnings.length === 0) return null

  const severityOrder: Record<WarningSeverity, number> = {
    critical: 0,
    high:     1,
    medium:   2,
    info:     3,
  }

  const sorted = [...warnings].sort((a, b) =>
    sortMode === 'severity'
      ? severityOrder[a.severity] - severityOrder[b.severity]
      : b.candleTime - a.candleTime
  )

  const visible  = expanded ? sorted : sorted.slice(0, 5)
  const overflow = sorted.length - 5

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-[Cormorant] text-sm uppercase tracking-wider text-zinc-500">
            Candle Warnings
          </h2>
          <span className="rounded-sm bg-zinc-700 px-1.5 py-0.5 font-[Geist_Mono] text-[10px] text-zinc-400">
            4H
          </span>
        </div>

        {/* Sort toggle + count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: '#52525b',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Sort
          </span>

          <button
            onClick={() => setSortMode('severity')}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              padding: '3px 8px',
              borderRadius: 4,
              border: '0.5px solid',
              borderColor: sortMode === 'severity' ? '#52525b' : '#2f2f35',
              background: sortMode === 'severity' ? '#1c1c1f' : 'transparent',
              color: sortMode === 'severity' ? '#e4e4e7' : '#71717a',
              cursor: 'pointer',
            }}
          >
            Severity
          </button>

          <button
            onClick={() => setSortMode('latest')}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              padding: '3px 8px',
              borderRadius: 4,
              border: '0.5px solid',
              borderColor: sortMode === 'latest' ? '#52525b' : '#2f2f35',
              background: sortMode === 'latest' ? '#1c1c1f' : 'transparent',
              color: sortMode === 'latest' ? '#e4e4e7' : '#71717a',
              cursor: 'pointer',
            }}
          >
            Latest first
          </button>

          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: '#52525b',
          }}>
            {warnings.length} active
          </span>
        </div>
      </div>

      {/* Warning rows */}
      <div className="space-y-2">
        {visible.map((w) => (
          <WarningRow key={w.id} warning={w} />
        ))}
      </div>

      {/* Expand button */}
      {!expanded && overflow > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 w-full rounded-md border border-zinc-800 bg-zinc-900/40 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
        >
          + {overflow} more
        </button>
      )}

      {/* Timeline strip — always visible regardless of expand state */}
      <TimelineStrip warnings={warnings} />
    </div>
  )
}
