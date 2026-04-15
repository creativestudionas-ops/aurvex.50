'use client'

import type {
  EntrySignal,
  EntryDirection,
  EntryConfidence,
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
// Confidence color
// ---------------------------------------------------------------------------
const confidenceColor: Record<EntryConfidence, string> = {
  'A++': 'text-emerald-400',
  'A+': 'text-emerald-500',
  A: 'text-yellow-400',
  B: 'text-orange-400',
  wait: 'text-zinc-500',
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
// TP row
// ---------------------------------------------------------------------------
function TPRow({
  tp,
  direction,
}: {
  tp: TPLevel
  direction: EntryDirection
}) {
  const isTP2 = tp.label === 'TP2'
  const rColor = direction === 'sell' ? 'text-red-500' : 'text-emerald-500'

  return (
    <div className="flex items-baseline gap-3">
      {/* Label */}
      <span
        className="text-zinc-500 shrink-0"
        style={{
          fontFamily: 'var(--font-geist-mono), monospace',
          fontSize: '11px',
        }}
      >
        {tp.label}
      </span>

      {/* Price */}
      <span
        className="text-zinc-100"
        style={{
          fontFamily: 'var(--font-geist-mono), monospace',
          fontSize: isTP2 ? '14px' : '13px',
          fontWeight: isTP2 ? 500 : 400,
        }}
      >
        ${formatPrice(tp.price)}
      </span>

      {/* R-multiple */}
      <span
        className={rColor}
        style={{
          fontFamily: 'var(--font-geist-mono), monospace',
          fontSize: '11px',
        }}
      >
        +{tp.rMultiple.toFixed(1)}R
      </span>

      {/* Rationale */}
      <span
        className="text-zinc-500 italic truncate"
        style={{ fontSize: '11px' }}
      >
        {tp.rationale}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------
interface Props {
  entry: EntrySignal
}

export default function EntryPanel({ entry }: Props) {
  const dir = directionConfig[entry.direction]
  const isWait = entry.direction === 'wait'

  return (
    <div className="mb-6">
      <div
        className={`rounded-lg border ${dir.border} ${dir.bg} ${dir.glow} p-4`}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-[Cormorant] text-sm uppercase tracking-wider text-zinc-500">
            Optimal Entry
          </h2>

          <div className="flex items-center gap-2">
            <span
              className={`font-[Geist_Mono] text-xs font-semibold ${confidenceColor[entry.confidence]}`}
            >
              {entry.confidence}
            </span>
            <span className="text-zinc-600 text-[10px]">&middot;</span>
            <span className="font-[Geist_Mono] text-[11px] text-zinc-400">
              confidence{' '}
              <span className="text-zinc-200">{entry.confidenceScore}</span>
              /100
            </span>
          </div>
        </div>

        {/* ── Confidence bar ─────────────────────────────────────── */}
        <div
          className="rounded-full mb-4 overflow-hidden"
          style={{ height: '4px', backgroundColor: '#27272a' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${entry.confidenceScore}%`,
              backgroundColor: barColor(entry.confidenceScore),
              transition: 'width 600ms ease-out',
            }}
          />
        </div>

        {/* ── WAIT state ─────────────────────────────────────────── */}
        {isWait && (
          <>
            {/* Direction badge */}
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-2xl ${dir.text}`}>{dir.arrow}</span>
              <span
                className={`font-[Geist_Mono] text-lg font-bold ${dir.text}`}
              >
                {dir.label}
              </span>
            </div>

            {/* Why waiting */}
            <div className="border-t border-zinc-800/50 pt-3">
              <h3 className="font-[Cormorant] text-xs uppercase tracking-wider text-zinc-500 mb-2">
                Why Waiting
              </h3>
              <ul className="space-y-1">
                {entry.blockers.map((b, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-400 shrink-0 mt-px">
                      &#9888;
                    </span>
                    <span
                      className="text-zinc-400"
                      style={{
                        fontFamily: 'var(--font-geist-mono), monospace',
                        fontSize: '12px',
                      }}
                    >
                      {b}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* ── BUY / SELL state ───────────────────────────────────── */}
        {!isWait && (
          <>
            {/* Direction + data grid */}
            <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 mb-3">
              {/* Left — arrow + label */}
              <div className="flex flex-col items-center justify-center gap-1">
                <span className={`text-5xl leading-none ${dir.text}`}>
                  {dir.arrow}
                </span>
                <span
                  className={`font-[Geist_Mono] text-xl font-bold tracking-wide ${dir.text}`}
                >
                  {dir.label}
                </span>
                <span className="font-[Geist_Mono] text-[11px] text-zinc-500">
                  XAU/USD
                </span>
              </div>

              {/* Right — entry zone, SL, TPs, R:R */}
              <div className="space-y-2">
                {/* Entry zone */}
                {entry.entryZone && (
                  <div>
                    <span className="font-[Cormorant] text-[10px] uppercase tracking-wider text-zinc-500">
                      Entry Zone
                    </span>
                    <p
                      className="text-zinc-100"
                      style={{
                        fontFamily: 'var(--font-geist-mono), monospace',
                        fontSize: '13px',
                      }}
                    >
                      ${formatPrice(entry.entryZone.low)} &ndash; $
                      {formatPrice(entry.entryZone.high)}
                    </p>
                    <p
                      className="text-zinc-500"
                      style={{
                        fontFamily: 'var(--font-geist-mono), monospace',
                        fontSize: '11px',
                      }}
                    >
                      mid ${formatPrice(entry.entryZone.midpoint)} &middot;{' '}
                      {entry.entryZone.source}
                    </p>
                  </div>
                )}

                {/* Stop loss */}
                {entry.stopLoss !== null && (
                  <div>
                    <span className="font-[Cormorant] text-[10px] uppercase tracking-wider text-zinc-500">
                      Stop Loss
                    </span>
                    <p>
                      <span
                        className="text-red-400"
                        style={{
                          fontFamily: 'var(--font-geist-mono), monospace',
                          fontSize: '13px',
                        }}
                      >
                        ${formatPrice(entry.stopLoss)}
                      </span>
                      {entry.stopNote && (
                        <span
                          className="text-zinc-500 italic ml-2"
                          style={{ fontSize: '11px' }}
                        >
                          {entry.stopNote}
                        </span>
                      )}
                    </p>
                  </div>
                )}

                {/* TP levels */}
                {entry.targets.length > 0 && (
                  <div>
                    <span className="font-[Cormorant] text-[10px] uppercase tracking-wider text-zinc-500">
                      Targets
                    </span>
                    <div className="space-y-1 mt-0.5">
                      {entry.targets.map((tp) => (
                        <TPRow
                          key={tp.label}
                          tp={tp}
                          direction={entry.direction}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Risk:Reward */}
                {entry.riskReward !== null && (
                  <div>
                    <span className="font-[Cormorant] text-[10px] uppercase tracking-wider text-zinc-500">
                      Risk : Reward
                    </span>
                    <p
                      className="text-zinc-100"
                      style={{
                        fontFamily: 'var(--font-geist-mono), monospace',
                        fontSize: '13px',
                      }}
                    >
                      1 : {entry.riskReward.toFixed(1)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Reasons ──────────────────────────────────────────── */}
            {entry.reasons.length > 0 && (
              <div className="border-t border-zinc-800/50 pt-3">
                <h3 className="font-[Cormorant] text-xs uppercase tracking-wider text-zinc-500 mb-2">
                  Reasons
                </h3>
                <ul className="space-y-1">
                  {entry.reasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-emerald-400 shrink-0 mt-px">
                        &#10003;
                      </span>
                      <span
                        className="text-zinc-300"
                        style={{
                          fontFamily: 'var(--font-geist-mono), monospace',
                          fontSize: '12px',
                        }}
                      >
                        {r}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ── Blockers ─────────────────────────────────────────── */}
            {entry.blockers.length > 0 && (
              <div className="border-t border-zinc-800/50 pt-3 mt-3">
                <h3 className="font-[Cormorant] text-xs uppercase tracking-wider text-zinc-500 mb-2">
                  Blockers
                </h3>
                <ul className="space-y-1">
                  {entry.blockers.map((b, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-amber-400 shrink-0 mt-px">
                        &#9888;
                      </span>
                      <span
                        className="text-zinc-400"
                        style={{
                          fontFamily: 'var(--font-geist-mono), monospace',
                          fontSize: '12px',
                        }}
                      >
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
    </div>
  )
}
