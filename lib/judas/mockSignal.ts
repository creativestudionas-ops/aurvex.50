import type { JudasSignal } from '@/types/judas'

/**
 * Fully populated mock JudasSignal — absolute last fallback if all APIs fail.
 * Realistic XAU/USD values as of Apr 14 2026 (~$4,798 spot from MT5 live).
 */
export const mockSignal: JudasSignal = {
  // Price
  price: 4798.25,
  priceChange: 58.11,
  priceChangePct: 1.23,
  priceStale: true,

  // Grade & score
  grade: 'A',
  score: 74,
  sessionLabel: 'London',
  sessionBias: 'Long continuation',
  judasPhase: 'Post-sweep \u00b7 long bias',

  // Session chain — Asian closed, London confirmed Judas, NY pending
  sessions: [
    {
      label: 'Asian',
      high: 4787.95,
      low: 4752.33,
      status: 'closed',
      direction: 'neutral',
      note: 'Range $35.62 \u2014 liquidity building above and below',
      judasConfirmed: false,
    },
    {
      label: 'London',
      high: 4817.86,
      low: 4744.21,
      status: 'judas_confirmed',
      direction: 'bullish',
      note: 'Swept Asian low 4752.33 \u2192 reversed through Asian high',
      judasConfirmed: true,
    },
    {
      label: 'New York',
      high: 4803.49,
      low: 4794.64,
      status: 'active',
      direction: 'bullish',
      note: 'Continuation of London reversal \u2014 holding above OB',
      judasConfirmed: false,
    },
  ],

  // SMC levels
  levels: [
    {
      name: 'BSL \u2014 Equal Highs',
      type: 'BSL',
      price: 4818.00,
      description: 'Double-tap at 4817.86 over past 18 hours \u2014 buy stops resting above',
      direction: 'up',
      active: true,
    },
    {
      name: 'Bullish OB (1H)',
      type: 'OB_bull',
      price: 4762.50,
      priceHigh: 4768.33,
      priceLow: 4752.33,
      description: 'Last bearish candle before 3-candle impulse (+$46 move)',
      direction: 'up',
      active: true,
    },
    {
      name: 'FVG (4H)',
      type: 'FVG',
      price: 4764.00,
      priceHigh: 4771.04,
      priceLow: 4757.94,
      description: 'Unmitigated fair value gap from Apr 14 rally \u2014 potential retest magnet',
      direction: 'up',
      active: true,
    },
    {
      name: 'SSL Swept \u2014 London Low',
      type: 'SSL',
      price: 4744.21,
      description: 'London swept Asian low at 4744.21 then recovered \u2014 sell stops cleared',
      direction: 'up',
      active: true,
    },
    {
      name: '100-Day SMA',
      type: 'SMA',
      price: 4620.00,
      description: 'Dynamic support \u2014 price trading $178 above, trend intact',
      direction: 'neutral',
      active: false,
    },
  ],

  // 18 factors
  factors: [
    { name: 'Judas Sweep Confirmed', weight: 15, value: 15, direction: 'up', note: 'London swept Asian low and reversed' },
    { name: 'Session Trend Alignment', weight: 8, value: 8, direction: 'up', note: 'London + NY both bullish' },
    { name: 'Bullish OB Holding', weight: 8, value: 8, direction: 'up', note: 'Price respecting 1H OB at 4762' },
    { name: 'FVG Unmitigated Below', weight: 5, value: 3, direction: 'up', note: '4H gap at 4764 still open' },
    { name: 'BSL Target Proximity', weight: 6, value: 6, direction: 'up', note: 'Equal highs at 4818 within reach' },
    { name: 'SSL Cleared', weight: 6, value: 6, direction: 'up', note: 'Sell stops below Asian low taken' },
    { name: 'DXY Weakness', weight: 5, value: 5, direction: 'up', note: 'Dollar index down -0.32%' },
    { name: 'US 10Y Direction', weight: 4, value: 2, direction: 'up', note: 'Yields dipping slightly \u2014 mild gold tailwind' },
    { name: 'COT Commercial Positioning', weight: 6, value: 4, direction: 'up', note: '68th percentile \u2014 smart money net long' },
    { name: 'COT Spec Crowding', weight: 4, value: 2, direction: 'neutral', note: '55th percentile \u2014 not extreme' },
    { name: 'Price vs 100-Day SMA', weight: 4, value: 4, direction: 'up', note: 'Holding $178 above SMA' },
    { name: 'Range Expansion', weight: 4, value: 3, direction: 'up', note: 'London range 73.65 vs Asian 35.62' },
    { name: 'Volume Profile', weight: 3, value: 2, direction: 'up', note: 'Above-average volume on reversal candles' },
    { name: 'Higher Timeframe Trend', weight: 4, value: 4, direction: 'up', note: 'Daily and weekly trend both bullish' },
    { name: 'Previous Day Close', weight: 3, value: 2, direction: 'up', note: 'Closed above prior day high' },
    { name: 'Catalyst Risk', weight: 4, value: -2, direction: 'down', note: 'FOMC minutes tomorrow \u2014 potential volatility' },
    { name: 'Asian Session Quality', weight: 3, value: 1, direction: 'neutral', note: 'Range $35.62, decent liquidity buildup' },
    { name: 'Invalidation Distance', weight: 3, value: 1, direction: 'neutral', note: 'SL at 4757 = $41 risk \u2014 acceptable' },
  ],

  // COT
  cot: {
    commercialNet: 48200,
    commercialPctile: 68,
    specNet: 142800,
    specPctile: 55,
    weekOf: '2026-04-08',
    stale: true,
  },

  // Macro
  macro: {
    dxy: 103.42,
    dxyChange: -0.33,
    us10y: 4.28,
    us10yChange: -0.04,
    stale: true,
  },

  // Trade scenarios
  tradeScenarios: [
    {
      label: 'Long Continuation to BSL',
      type: 'primary',
      description:
        'Enter long on pullback to 4790\u20134795 zone (NY session support). Target BSL at 4818. ' +
        'Stop below FVG at 4757. R:R \u2248 1:1.6.',
      invalidation: 'Price closes below 4H FVG at 4757.94 \u2014 Judas thesis invalidated.',
    },
    {
      label: 'Reversal Short if BSL Swept',
      type: 'alternate',
      description:
        'If price sweeps BSL at 4818 and shows bearish displacement, short targeting London low at 4744. ' +
        'Wait for M15 bearish OB confirmation above 4815.',
    },
  ],

  // Catalysts
  catalysts: [
    {
      name: 'FOMC Meeting Minutes',
      impact: 'high',
      direction: 'neutral',
      note: 'Could shift rate-cut expectations \u2014 key for USD and gold direction',
      time: '2026-04-15 18:00 UTC',
    },
    {
      name: 'US Retail Sales (Mar)',
      impact: 'medium',
      direction: 'down',
      note: 'Consensus +0.3% \u2014 a miss could weaken USD and lift gold',
      time: '2026-04-15 12:30 UTC',
    },
    {
      name: 'China Q1 GDP',
      impact: 'medium',
      direction: 'up',
      note: 'Strong print could boost commodity demand broadly',
      time: '2026-04-15 02:00 UTC',
    },
    {
      name: 'Geopolitical Tensions',
      impact: 'low',
      direction: 'up',
      note: 'Ongoing safe-haven bid \u2014 background supportive for gold',
    },
  ],

  // Candle warnings
  warnings: [
    {
      id: 'ob_rejection_1744588800_Bullish_OB_(1H)',
      type: 'ob_rejection',
      category: 'rejection',
      severity: 'critical',
      direction: 'bullish',
      candleTime: 1744588800,
      price: 4762.50,
      levelConfluence: 'Bullish OB (1H) @ $4,752.33\u2013$4,768.33',
      title: 'Order block rejection',
      note: 'Price dipped into Bullish OB (1H) and closed above the zone \u2014 OB held as support.',
      confirmed: true,
      formattedTime: 'Apr 16 \u00b7 08:00 UTC',
      timeAgo:       '2h ago',
      isLatest:      true,
    },
    {
      id: 'pin_bar_1744574400',
      type: 'pin_bar',
      category: 'rejection',
      severity: 'high',
      direction: 'bullish',
      candleTime: 1744574400,
      price: 4744.21,
      levelConfluence: 'SSL Swept \u2014 London Low @ $4,744.21',
      title: 'Pin bar rejection',
      note: 'Long lower wick 4\u00d7 body on 4H \u2014 strong demand rejection near SSL.',
      confirmed: true,
      formattedTime: 'Apr 16 \u00b7 04:00 UTC',
      timeAgo:       '6h ago',
      isLatest:      false,
    },
    {
      id: 'wick_exhaustion_1744560000',
      type: 'wick_exhaustion',
      category: 'exhaustion',
      severity: 'medium',
      direction: 'bearish',
      candleTime: 1744560000,
      price: 4817.86,
      levelConfluence: null,
      title: 'Wick exhaustion',
      note: '2 of last 3 4H candles show upper wicks more than 2\u00d7 body \u2014 bearish momentum fading at highs.',
      confirmed: true,
      formattedTime: 'Apr 15 \u00b7 20:00 UTC',
      timeAgo:       '14h ago',
      isLatest:      false,
    },
  ],

  // Entry engines — all models sorted by confidenceScore desc
  entries: [
    {
      model: 'judas_sweep',
      modelLabel: 'Judas Sweep',
      direction: 'buy',
      confidence: 'A++',
      confidenceScore: 91,
      entryZone: { low: 4804, high: 4812, midpoint: 4808, source: 'Bullish OB' },
      stopLoss: 4798,
      stopNote: 'Below Bullish OB low $4,804.00',
      targets: [
        { label: 'TP1', price: 4841, rMultiple: 1.5, rationale: 'Prior session high' },
        { label: 'TP2', price: 4852, rMultiple: 2.4, rationale: 'BSL $4,852' },
        { label: 'TP3', price: 4878, rMultiple: 3.6, rationale: '3R extension' },
      ],
      riskReward: 2.4,
      reasons: [
        'Judas sweep confirmed \u2014 Post-sweep \u00b7 long bias',
        'Entry zone: Bullish OB ($4,804\u2013$4,812)',
        '4H OB rejection confirmed at $4,806.50',
        'COT commercials 68th percentile \u2014 smart money bullish',
      ],
      blockers: ['COT data stale \u2014 confirm current week'],
      computedAt: '2026-04-16T08:00:00.000Z',
    },
    {
      model: 'cisd',
      modelLabel: 'CISD',
      direction: 'buy',
      confidence: 'A+',
      confidenceScore: 84,
      entryZone: { low: 4806, high: 4812, midpoint: 4809, source: 'CISD candle 50% @ $4,809.00' },
      stopLoss: 4791,
      stopNote: 'Below sweep low $4,794.00',
      targets: [
        { label: 'TP1', price: 4830, rMultiple: 1.8, rationale: 'SSL level reclaimed' },
        { label: 'TP2', price: 4852, rMultiple: 2.8, rationale: 'BSL $4,852' },
        { label: 'TP3', price: 4882, rMultiple: 3.5, rationale: 'Displacement origin' },
      ],
      riskReward: 2.8,
      reasons: [
        'SSL swept at $4,794 \u2014 CISD candle closed back above',
        'CISD candle 1 candle ago \u2014 fresh signal',
        'Judas phase aligned: Post-sweep \u00b7 long bias',
      ],
      blockers: ['CPI release at 12:30 UTC \u2014 wait for candle close after'],
      computedAt: '2026-04-16T08:00:00.000Z',
    },
    {
      model: 'silver_bullet',
      modelLabel: 'Silver Bullet',
      direction: 'buy',
      confidence: 'A',
      confidenceScore: 71,
      entryZone: { low: 4819, high: 4826, midpoint: 4822.5, source: 'NY open FVG' },
      stopLoss: 4816,
      stopNote: 'Below window FVG low $4,819.00',
      targets: [
        { label: 'TP1', price: 4841, rMultiple: 1.4, rationale: 'London session high' },
        { label: 'TP2', price: 4852, rMultiple: 2.0, rationale: 'Prior session extreme' },
        { label: 'TP3', price: 4878, rMultiple: 2.8, rationale: '3R extension' },
      ],
      riskReward: 2.0,
      reasons: [
        'Silver Bullet window active: NY open (10:00\u201311:00 UTC)',
        'FVG formed at open, price now retesting',
        'Session bias: Long continuation',
      ],
      blockers: ['Grade A (not A+) \u2014 moderate conviction, half size recommended'],
      computedAt: '2026-04-16T10:00:00.000Z',
    },
    {
      model: 'fvg_fill',
      modelLabel: 'FVG Fill',
      direction: 'wait',
      confidence: 'wait',
      confidenceScore: 0,
      entryZone: null,
      stopLoss: null,
      stopNote: '',
      targets: [],
      riskReward: null,
      reasons: [],
      blockers: ['Price not near any active FVG \u2014 wait for retracement'],
      computedAt: '2026-04-16T08:00:00.000Z',
    },
    {
      model: 'breaker_block',
      modelLabel: 'Breaker Block',
      direction: 'buy',
      confidence: 'A',
      confidenceScore: 68,
      entryZone: { low: 4802, high: 4815, midpoint: 4808.5, source: 'Breaker (failed Bull OB \u2014 $4,802\u2013$4,815)' },
      stopLoss: 4796,
      stopNote: 'Below breaker low $4,802.00',
      targets: [
        { label: 'TP1', price: 4837, rMultiple: 2.2, rationale: 'Nearest structure level' },
        { label: 'TP2', price: 4852, rMultiple: 3.5, rationale: 'BSL / session high' },
        { label: 'TP3', price: 4871, rMultiple: 5.0, rationale: 'Measured displacement move' },
      ],
      riskReward: 3.5,
      reasons: [
        'Breaker block: failed Bull OB now acting as support',
        'Entry zone $4,802\u2013$4,815 \u2014 price retesting from above',
        'Session bias aligned: Long continuation',
      ],
      blockers: ['Grade A (not A+) \u2014 moderate conviction only'],
      computedAt: '2026-04-16T08:00:00.000Z',
    },
    {
      model: 'ote_fibonacci',
      modelLabel: 'OTE Fibonacci',
      direction: 'buy',
      confidence: 'A+',
      confidenceScore: 78,
      entryZone: { low: 4806, high: 4822, midpoint: 4814, source: 'OTE 62\u201379% zone ($4,806\u2013$4,822)' },
      stopLoss: 4789,
      stopNote: 'Below swing low $4,794.00 (100% Fib)',
      targets: [
        { label: 'TP1', price: 4858, rMultiple: 1.7, rationale: 'Prior swing high' },
        { label: 'TP2', price: 4879, rMultiple: 2.5, rationale: '127% Fib extension' },
        { label: 'TP3', price: 4910, rMultiple: 3.9, rationale: '161.8% Fib extension' },
      ],
      riskReward: 2.5,
      reasons: [
        'OTE zone hit: 70.8% retracement \u2014 perfect 70.5 sweet spot',
        'Swing low $4,794 \u2192 high $4,858 (64 pts displacement)',
        'TP2 = 127% extension at $4,879',
        'TP3 = 161.8% extension at $4,910',
      ],
      blockers: ['COT data stale \u2014 confirm current week positioning'],
      computedAt: '2026-04-16T08:00:00.000Z',
    },
    {
      model: 'propulsion_block',
      modelLabel: 'Propulsion Block',
      direction: 'buy',
      confidence: 'B',
      confidenceScore: 58,
      entryZone: { low: 4810, high: 4821, midpoint: 4815.5, source: 'Propulsion block (4-candle, $11.0 range)' },
      stopLoss: 4805,
      stopNote: 'Below propulsion block low $4,810.00',
      targets: [
        { label: 'TP1', price: 4838, rMultiple: 2.1, rationale: 'Nearest structure level' },
        { label: 'TP2', price: 4852, rMultiple: 3.4, rationale: 'Mid-target' },
        { label: 'TP3', price: 4869, rMultiple: 5.1, rationale: 'Impulse replication (54 pts)' },
      ],
      riskReward: 3.4,
      reasons: [
        'Propulsion block: 4-candle consolidation $4,810\u2013$4,821',
        'Original impulse: 54 pts \u2014 TP3 = replicated move',
        'Session bias aligned: Long continuation',
        'Judas phase: Post-sweep \u00b7 long bias',
      ],
      blockers: [
        'Grade B \u2014 consider half position size',
        'R:R to TP1 only 2.1 \u2014 wait for TP2+ to be realistic',
      ],
      computedAt: '2026-04-16T08:00:00.000Z',
    },
  ],

  // Meta
  computedAt: new Date().toISOString(),
}
