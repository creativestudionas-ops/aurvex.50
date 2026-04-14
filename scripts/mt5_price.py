"""Fetch live price from MT5 terminal. Outputs JSON to stdout."""
import MetaTrader5 as mt5
import json
import sys

symbol = sys.argv[1] if len(sys.argv) > 1 else "GOLD#"

if not mt5.initialize():
    print(json.dumps({"error": "MT5 initialize failed"}))
    sys.exit(1)

tick = mt5.symbol_info_tick(symbol)
if tick is None:
    mt5.shutdown()
    print(json.dumps({"error": f"No tick for {symbol}"}))
    sys.exit(1)

result = {
    "symbol": symbol,
    "bid": tick.bid,
    "ask": tick.ask,
    "spread": round(tick.ask - tick.bid, 2),
    "time": str(tick.time),
}

mt5.shutdown()
print(json.dumps(result))
