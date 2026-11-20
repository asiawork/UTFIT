"""ทดสอบว่า yfinance ดึง top holdings ของ ETF จาก GitHub Actions ได้ไหม"""
import yfinance as yf

for t in ["XLK", "SMH", "SCHG", "QQQ", "IUIT.L", "SPY", "VWRA.L"]:
    try:
        fd = yf.Ticker(t).funds_data
        h = fd.top_holdings
        print(t, "OK", len(h), "แถว")
        print(h.head(12).to_string())
    except Exception as e:  # noqa: BLE001
        print(t, "ERR", type(e).__name__, str(e)[:200])
