import type { EntrySignal, EntryDirection } from '@/types/judas'

// ---------------------------------------------------------------------------
// In-memory dedup — skip resending same direction within 15 minutes
// ---------------------------------------------------------------------------
const DEDUP_WINDOW_MS = 15 * 60 * 1000

const lastSent: Map<EntryDirection, number> = new Map()

function isDuplicate(direction: EntryDirection): boolean {
  const prev = lastSent.get(direction)
  if (prev === undefined) return false
  return Date.now() - prev < DEDUP_WINDOW_MS
}

function markSent(direction: EntryDirection): void {
  lastSent.set(direction, Date.now())
}

// ---------------------------------------------------------------------------
// Price formatter — $X,XXX.XX
// ---------------------------------------------------------------------------
function fmt(price: number): string {
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ---------------------------------------------------------------------------
// Build the Markdown message body
// ---------------------------------------------------------------------------
function buildMessage(entry: EntrySignal): string {
  const isBuy = entry.direction === 'buy'
  const emoji = isBuy ? '\u{1F7E2}' : '\u{1F534}'
  const label = isBuy ? 'BUY' : 'SELL'

  const lines: string[] = []

  // Header
  lines.push(`${emoji} *${label} SIGNAL \u2014 XAU/USD*`)
  lines.push(`Model: *${entry.modelLabel}*`)
  lines.push(`Confidence: *${entry.confidence}* (${entry.confidenceScore}/100)`)

  // Entry zone
  if (entry.entryZone) {
    lines.push('')
    lines.push('\u{1F4CD} *Entry Zone*')
    lines.push(`${fmt(entry.entryZone.low)} \u2013 ${fmt(entry.entryZone.high)}`)
    lines.push(`Source: ${entry.entryZone.source}`)
  }

  // Stop loss
  if (entry.stopLoss !== null) {
    lines.push('')
    lines.push('\u{1F6D1} *Stop Loss*')
    lines.push(`${fmt(entry.stopLoss)} \u2014 ${entry.stopNote}`)
  }

  // Targets
  if (entry.targets.length > 0) {
    lines.push('')
    lines.push('\u{1F3AF} *Targets*')
    for (const tp of entry.targets) {
      lines.push(`${tp.label}: ${fmt(tp.price)} (+${tp.rMultiple}R) \u2014 ${tp.rationale}`)
    }
  }

  // Risk/Reward
  if (entry.riskReward !== null) {
    lines.push('')
    lines.push(`\u{1F4CA} *Risk/Reward:* ${entry.riskReward} : 1`)
  }

  // Reasons
  if (entry.reasons.length > 0) {
    lines.push('')
    lines.push('\u2705 *Why:*')
    for (const r of entry.reasons) {
      lines.push(`\u2022 ${r}`)
    }
  }

  // Blockers
  if (entry.blockers.length > 0) {
    lines.push('')
    lines.push('\u26A0\uFE0F *Watch:*')
    for (const b of entry.blockers) {
      lines.push(`\u2022 ${b}`)
    }
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Telegram Bot API response shape
// ---------------------------------------------------------------------------
interface TelegramResponse {
  ok: boolean
  description?: string
}

// ---------------------------------------------------------------------------
// Public API — fire-and-forget, never throws
// ---------------------------------------------------------------------------
export async function sendTelegramAlert(entry: EntrySignal): Promise<void> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID

    if (!token || !chatId) {
      console.warn('[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set \u2014 skipping alert')
      return
    }

    // Only send for actionable signals
    if (entry.direction === 'wait') return

    // Dedup — skip if same direction was sent recently
    if (isDuplicate(entry.direction)) return

    const text = buildMessage(entry)

    const url = `https://api.telegram.org/bot${token}/sendMessage`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    })

    const data = (await res.json()) as TelegramResponse

    if (!data.ok) {
      console.error(`[telegram] Send failed: ${data.description ?? res.statusText}`)
      return
    }

    markSent(entry.direction)
    console.log(`[telegram] Alert sent: ${entry.direction} signal`)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[telegram] Network error: ${message}`)
  }
}
