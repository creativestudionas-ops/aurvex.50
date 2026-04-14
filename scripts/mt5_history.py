"""Fetch OHLCV candle history from MT5 terminal. Outputs JSON to stdout."""
import MetaTrader5 as mt5
import json
import sys
import datetime

symbol = sys.argv[1] if len(sys.argv) > 1 else "GOLD#"
timeframe_str = sys.argv[2] if len(sys.argv) > 2 else "H1"
count = int(sys.argv[3]) if len(sys.argv) > 3 else 200

TF_MAP = {
    "M1": mt5.TIMEFRAME_M1,
    "M5": mt5.TIMEFRAME_M5,
    "M15": mt5.TIMEFRAME_M15,
    "M30": mt5.TIMEFRAME_M30,
    "H1": mt5.TIMEFRAME_H1,
    "H4": mt5.TIMEFRAME_H4,
    "D1": mt5.TIMEFRAME_D1,
    "W1": mt5.TIMEFRAME_W1,
}

tf = TF_MAP.get(timeframe_str, mt5.TIMEFRAME_H1)

if not mt5.initialize():
    print(json.dumps({"error": "MT5 initialize failed", "candles": []}))
    sys.exit(1)

rates = mt5.copy_rates_from_pos(symbol, tf, 0, count)
mt5.shutdown()

if rates is None or len(rates) == 0:
    print(json.dumps({"candles": []}))
    sys.exit(0)

candles = []
for r in rates:
    candles.append({
        "time": str(datetime.datetime.utcfromtimestamp(r["time"])),
        "open": float(r["open"]),
        "high": float(r["high"]),
        "low": float(r["low"]),
        "close": float(r["close"]),
        "volume": int(r["tick_volume"]),
    })

print(json.dumps({"candles": candles}))
