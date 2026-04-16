'use client'

import type {
  EntrySignal,
  EntryDirection,
  EntryConfidence,
  EntryModel,
  TPLevel,
} from '@/types/judas'

// ---------------------------------------------------------------------------
// Direction badge config
// ---------------------------------------------------------------------------
const directionConfig: Record<
  EntryDirection,
  { label: string; arrow: string; bg: string; border: string; text: string; glow: string }
> = {
  buy: {
    label: 'BUY',
    arrow: '\u25B2',
    bg: 'bg-emerald-950/60',
    border: 'border-emerald-500',
    text: 'text-emerald-400',
    glow: 'shadow-[0_0_0_1px_rgba(16,185,129,0.3)]',
  },
  sell: {
    label: 'SELL',
    arrow: '\u25BC',
    bg: 'bg-red-950/60',
    border: 'border-red-500',
    text: 'text-red-400',
    glow: 'shadow-[0_0_0_1px_rgba(239,68,68,0.3)]',
  },
  wait: {
    label: 'WAIT',
    arrow: '\u2014',
    bg: 'bg-zinc-900',
    border: 'border-zinc-700',
    text: 'text-zinc-400',
    glow: '',
  },
}

// ---------------------------------------------------------------------------
// Model badge colors
// ---------------------------------------------------------------------------
const modelStyle: Record<EntryModel, { border: string; bg: string; text: string; label: string }> = {
  judas_sweep:   { border: '#B8972A', bg: 'rgba(184,151,42,0.12)',  text: '#fbbf24', label: 'Judas Sweep'   },
  fvg_fill:      { border: '#3b82f6', bg: 'rgba(59,130,246,0.10)',  text: '#60a5fa', label: 'FVG Fill'      },
  cisd:          { border: '#8b5cf6', bg: 'rgba(139,92,246,0.10)',  text: '#a78bfa', label: 'CISD'          },
  silver_bullet: { border: '#14b8a6', bg: 'rgba(20,184,166,0.10)', text: '#2dd4bf', label: 'Silver Bullet' },
}

// ---------------------------------------------------------------------------
// Confidence color
// ---------------------------------------------------------------------------
const confidenceColor: Record<EntryConfidence, string> = {
  'A++': '#34d399',
  'A+':  '#10b981',
  A:     '#eab308',
  B:     '#f97316',
  wait:  '#71717a',
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

function barColor(score: number): string {
  if (score >= 75) return '#10b981'
  if (score >= 55) return '#eab308'
  return '#ef4444'
}

// ---------------------------------------------------------------------------
// Model badge
// ---------------------------------------------------------------------------
function ModelBadge({ model }: { model: EntryModel }) {
  const s = modelStyle[model]
  return (
    <span style={{
      fontFamily: 'var(--font-geist-mono), monospace',
      fontSize: 10,
      fontWeight: 500,
      padding: '2px 8px',
      borderRadius: 4,
      border: `1px solid ${s.border}`,
      background: s.bg,
      color: s.text,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// TP row
// ---------------------------------------------------------------------------
function TPRow({ tp, direction }: { tp: TPLevel; direction: EntryDirection }) {
  const isTP2 = tp.label === 'TP2'
  const rColor = direction === 'sell' ? '#f87171' : '#34d399'

  return (
    <div className="flex items-baseline gap-3">
      <span style={{
        fontFamily: 'var(--font-geist-mono), monospace',
        fontSize: 11,
        color: '#71717a',
        flexShrink: 0,
      }}>
        {tp.label}
      </span>
      <span style={{
        fontFamily: 'var(--font-geist-mono), monospace',
        fontSize: isTP2 ? 14 : 13,
        fontWeight: isTP2 ? 500 : 400,
        color: '#f4f4f5',
      }}>
        ${formatPrice(tp.price)}
      </span>
      <span style={{
        fontFamily: 'var(--font-geist-mono), monospace',
        fontSize: 11,
        color: rColor,
      }}>
        +{tp.rMultiple.toFixed(1)}R
      </span>
      <span style={{
        fontSize: 11,
        color: '#71717a',
        fontStyle: 'italic',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {tp.rationale}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Signal card — full or compact
// ---------------------------------------------------------------------------
function SignalCard({
  entry,
  pinned = false,
}: {
  entry: EntrySignal
  pinned?: boolean
}) {
  const dir = directionConfig[entry.direction]
  const isWait = entry.direction === 'wait'
  const ms = modelStyle[entry.model]

  return (
    <div
      style={{
        borderRadius: 8,
        border: `1px solid ${isWait ? '#3f3f46' : ms.border}`,
        background: isWait ? '#18181b' : ms.bg,
        padding: pinned ? 16 : 14,
        boxShadow: !isWait ? `0 0 0 1px ${ms.border}33` : undefined,
      }}
    >
      {/* Header — model badge + direction + confidence */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ModelBadge model={entry.model} />
          <span style={{
            fontFamily: 'var(--font-geist-mono), monospace',
            fontSize: pinned ? 16 : 13,
            fontWeight: 700,
            color: isWait ? '#71717a' : (entry.direction === 'buy' ? '#34d399' : '#f87171'),
          }}>
            {dir.arrow} {dir.label}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span style={{
            fontFamily: 'var(--font-geist-mono), monospace',
            fontSize: 12,
            fontWeight: 600,
            color: confidenceColor[entry.confidence],
          }}>
            {entry.confidence}
          </span>
          <span style={{
            fontFamily: 'var(--font-geist-mono), monospace',
            fontSize: 11,
            color: '#a1a1aa',
          }}>
            {entry.confidenceScore}/100
          </span>
        </div>
      </div>

      {/* Confidence bar */}
      <div style={{
        height: 3,
        borderRadius: 2,
        backgroundColor: '#27272a',
        marginBottom: pinned ? 14 : 10,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          borderRadius: 2,
          width: `${entry.confidenceScore}%`,
          backgroundColor: barColor(entry.confidenceScore),
          transition: 'width 600ms ease-out',
        }} />
      </div>

      {/* WAIT state */}
      {isWait && (
        <div style={{
          fontFamily: 'var(--font-geist-mono), monospace',
          fontSize: 11,
          color: '#71717a',
        }}>
          {entry.blockers[0] ?? 'Waiting for setup'}
        </div>
      )}

      {/* Active state */}
      {!isWait && (
        <>
          {/* Entry zone + SL + TPs + R:R */}
          <div className="space-y-2">
            {/* Entry zone */}
            {entry.entryZone && (
              <div>
                <span className="font-[Cormorant]" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#71717a' }}>
                  Entry Zone
                </span>
                <p style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: 13, color: '#f4f4f5' }}>
                  ${formatPrice(entry.entryZone.low)} &ndash; ${formatPrice(entry.entryZone.high)}
                </p>
                <p style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: 11, color: '#71717a' }}>
                  mid ${formatPrice(entry.entryZone.midpoint)} &middot; {entry.entryZone.source}
                </p>
              </div>
            )}

            {/* Stop loss */}
            {entry.stopLoss !== null && (
              <div>
                <span className="font-[Cormorant]" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#71717a' }}>
                  Stop Loss
                </span>
                <p>
                  <span style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: 13, color: '#f87171' }}>
                    ${formatPrice(entry.stopLoss)}
                  </span>
                  {entry.stopNote && (
                    <span style={{ fontSize: 11, color: '#71717a', fontStyle: 'italic', marginLeft: 8 }}>
                      {entry.stopNote}
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* TP levels */}
            {entry.targets.length > 0 && (
              <div>
                <span className="font-[Cormorant]" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#71717a' }}>
                  Targets
                </span>
                <div className="space-y-1 mt-0.5">
                  {entry.targets.map((tp) => (
                    <TPRow key={tp.label} tp={tp} direction={entry.direction} />
                  ))}
                </div>
              </div>
            )}

            {/* Risk:Reward */}
            {entry.riskReward !== null && (
              <div>
                <span className="font-[Cormorant]" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#71717a' }}>
                  Risk : Reward
                </span>
                <p style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: 13, color: '#f4f4f5' }}>
                  1 : {entry.riskReward.toFixed(1)}
                </p>
              </div>
            )}
          </div>

          {/* Reasons — only on pinned card */}
          {pinned && entry.reasons.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(63,63,70,0.5)', paddingTop: 12, marginTop: 12 }}>
              <h3 className="font-[Cormorant]" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#71717a', marginBottom: 8 }}>
                Reasons
              </h3>
              <ul className="space-y-1">
                {entry.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span style={{ color: '#34d399', flexShrink: 0, marginTop: 1 }}>&#10003;</span>
                    <span style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: 12, color: '#d4d4d8' }}>
                      {r}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Blockers */}
          {entry.blockers.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(63,63,70,0.5)', paddingTop: 12, marginTop: pinned ? 12 : 8 }}>
              <h3 className="font-[Cormorant]" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#71717a', marginBottom: 8 }}>
                {pinned ? 'Blockers' : 'Watch'}
              </h3>
              <ul className="space-y-1">
                {entry.blockers.map((b, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span style={{ color: '#fbbf24', flexShrink: 0, marginTop: 1 }}>&#9888;</span>
                    <span style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: 12, color: '#a1a1aa' }}>
                      {b}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Wait row — collapsed single-line for wait signals
// ---------------------------------------------------------------------------
function WaitRow({ entry }: { entry: EntrySignal }) {
  const ms = modelStyle[entry.model]

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 12px',
      borderRadius: 6,
      border: '1px solid #27272a',
      background: '#18181b',
    }}>
      <ModelBadge model={entry.model} />
      <span style={{
        fontFamily: 'var(--font-geist-mono), monospace',
        fontSize: 11,
        color: '#52525b',
      }}>
        WAIT
      </span>
      <span style={{
        fontSize: 11,
        color: '#52525b',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: 1,
      }}>
        {entry.blockers[0] ?? 'Waiting for setup'}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------
interface Props {
  entries: EntrySignal[]
}

export default function EntryPanel({ entries }: Props) {
  if (!entries || entries.length === 0) return null

  // Split into active and waiting
  const active = entries.filter(e => e.direction !== 'wait')
  const waiting = entries.filter(e => e.direction === 'wait')

  // Pinned = highest confidence active signal
  const pinned = active[0] ?? null
  const rest = active.slice(1)

  const activeCount = active.length
  const waitCount = waiting.length

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-[Cormorant] text-sm uppercase tracking-wider text-zinc-500">
          Active Signals
        </h2>
        <span style={{
          fontFamily: 'var(--font-geist-mono), monospace',
          fontSize: 11,
          color: '#71717a',
        }}>
          {activeCount} active &middot; {waitCount} wait
        </span>
      </div>

      {/* Pinned card — full width */}
      {pinned && (
        <div className="mb-3">
          <SignalCard entry={pinned} pinned />
        </div>
      )}

      {/* Remaining active signals — 3-column grid */}
      {rest.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
          {rest.map(e => (
            <SignalCard key={e.model} entry={e} />
          ))}
        </div>
      )}

      {/* Wait signals — collapsed rows */}
      {waiting.length > 0 && (
        <div className="space-y-2">
          {waiting.map(e => (
            <WaitRow key={e.model} entry={e} />
          ))}
        </div>
      )}

      {/* All-wait fallback — when no active signals exist */}
      {!pinned && waiting.length > 0 && (
        <div style={{
          textAlign: 'center',
          padding: '20px 0 8px',
          fontFamily: 'var(--font-geist-mono), monospace',
          fontSize: 11,
          color: '#52525b',
        }}>
          No active entry signals &mdash; all models watching
        </div>
      )}
    </div>
  )
}
