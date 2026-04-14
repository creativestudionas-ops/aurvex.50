"""Fetch yesterday's daily close from MT5. Outputs JSON to stdout."""
import MetaTrader5 as mt5
import json
import sys

symbol = sys.argv[1] if len(sys.argv) > 1 else "GOLD#"

if not mt5.initialize():
    print(json.dumps({"close": 0}))
    sys.exit(1)

rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_D1, 0, 2)
mt5.shutdown()

if rates is None or len(rates) < 2:
    print(json.dumps({"close": 0}))
else:
    print(json.dumps({"close": float(rates[-2]["close"])}))
