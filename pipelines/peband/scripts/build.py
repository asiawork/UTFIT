"""P/E Band: ดึงราคาดัชนี + EPS ย้อนหลัง แล้วเขียน market/peband/data/<id>.json

ตอนนี้มี S&P 500 ตัวเดียว
  ราคา  : Yahoo Finance (^GSPC) สำรองด้วย Stooq
  EPS   : ไฟล์ sp-500-eps-est.xlsx ของ S&P Dow Jones Indices (EPS รายไตรมาส Operating และ As Reported + ประมาณการ)
          สำรองด้วยตาราง P/E รายเดือนของ multpl.com (EPS = ราคา / P/E)
หน้าเว็บคำนวณ P/E ค่าเฉลี่ย SD และเส้น band เองจาก date/price/eps ในไฟล์นี้
"""
import io, json, os, sys, re, datetime as dt
import requests
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "market", "peband", "data")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "*/*", "Accept-Language": "en-US,en;q=0.9"}
START = "2005-01-01"
LAG_DAYS = int(os.environ.get("EPS_LAG_DAYS", "45"))  # EPS ของไตรมาสเริ่มใช้หลังสิ้นไตรมาสกี่วัน (ช่วงที่บริษัทประกาศงบครบ)
SPX_XLSX = "https://www.spglobal.com/spdji/en/documents/additional-material/sp-500-eps-est.xlsx"


def log(*a):
    print(*a, flush=True)


# ---------------- ราคา ----------------
def price_yahoo(sym):
    import yfinance as yf
    df = yf.download(sym, start=START, auto_adjust=False, progress=False, threads=False)
    if df is None or df.empty:
        raise RuntimeError("yahoo empty")
    c = df["Close"]
    if isinstance(c, pd.DataFrame):
        c = c.iloc[:, 0]
    c.index = pd.to_datetime(c.index).tz_localize(None).normalize()
    return c.dropna()


def price_stooq(sym):
    r = requests.get(f"https://stooq.com/q/d/l/?s={sym}&i=d", headers=UA, timeout=60)
    r.raise_for_status()
    df = pd.read_csv(io.StringIO(r.text))
    s = pd.Series(df["Close"].values, index=pd.to_datetime(df["Date"]))
    return s[s.index >= START].dropna()


def get_price(yahoo, stooq):
    for name, fn, arg in (("yahoo", price_yahoo, yahoo), ("stooq", price_stooq, stooq)):
        try:
            s = fn(arg)
            log(f"price {name}: {len(s)} rows {s.index[0].date()} .. {s.index[-1].date()} last={s.iloc[-1]:.2f}")
            return s, name
        except Exception as e:
            log(f"price {name} failed: {e!r}")
    raise SystemExit("no price source worked")


# ---------------- EPS ของ S&P 500 ----------------
def _to_date(v):
    if isinstance(v, (dt.datetime, pd.Timestamp)):
        return pd.Timestamp(v).normalize()
    if isinstance(v, dt.date):
        return pd.Timestamp(v)
    if isinstance(v, str):
        m = re.match(r"^\s*(\d{1,2})/(\d{1,2})/(\d{4})", v)
        if m:
            return pd.Timestamp(int(m.group(3)), int(m.group(1)), int(m.group(2)))
    return None


def _num(v):
    try:
        f = float(v)
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def parse_spx_xlsx(content):
    """คืน (DataFrame รายไตรมาส: date, op, rep  — เฉพาะตัวจริง, DataFrame ประมาณการ: date, op, rep)"""
    xl = pd.read_excel(io.BytesIO(content), sheet_name=None, header=None)
    log("sheets:", list(xl))
    best = None
    for name, g in xl.items():
        g = g.astype(object)
        # หาแถวหัวตาราง: คอลัมน์ที่มีคำว่า OPERATING และ REPORTED
        for r in range(min(len(g), 400)):
            row = [str(x).upper() if x is not None else "" for x in g.iloc[r].tolist()]
            text = " | ".join(row)
            if "OPERATING" in text and "REPORTED" in text:
                # รวมข้อความหัวตาราง 3 แถว (บางไฟล์หัวตารางแตกหลายบรรทัด)
                hdr = []
                for c in range(g.shape[1]):
                    parts = [str(g.iat[rr, c]) for rr in range(max(0, r - 2), min(len(g), r + 3))
                             if isinstance(g.iat[rr, c], str)]
                    hdr.append(" ".join(parts).upper())
                op = [c for c, h in enumerate(hdr) if "OPERATING" in h and "EARN" in h or "OPERATING" in h and "EPS" in h]
                rep = [c for c, h in enumerate(hdr) if "REPORTED" in h and ("EARN" in h or "EPS" in h)]
                if not op or not rep:
                    continue
                # คอลัมน์วันที่ = คอลัมน์ที่มีวันที่มากที่สุดในแถวถัดลงไป
                dcounts = {c: sum(_to_date(g.iat[rr, c]) is not None for rr in range(r + 1, min(len(g), r + 200))) for c in range(g.shape[1])}
                dc = max(dcounts, key=dcounts.get)
                if dcounts[dc] < 8:
                    continue
                log(f"  sheet {name!r} header row {r}: date col {dc} ({dcounts[dc]} dates) op cols {op} rep cols {rep}")
                log("   hdr:", [h[:40] for h in hdr[:12]])
                if best is None or dcounts[dc] > best[0]:
                    best = (dcounts[dc], name, g, r, dc, op[0], rep[0])
                break
    if best is None:
        raise RuntimeError("no quarterly EPS table found")
    _, name, g, r, dc, oc, rc = best
    log(f"use sheet {name!r}")
    rows = []
    for rr in range(r + 1, len(g)):
        d = _to_date(g.iat[rr, dc])
        if d is None:
            continue
        rows.append((d, _num(g.iat[rr, oc]), _num(g.iat[rr, rc]), rr))
    q = pd.DataFrame(rows, columns=["date", "op", "rep", "row"]).drop_duplicates("date").sort_values("date")
    q = q[(q.date.dt.month.isin([3, 6, 9, 12]))]
    log(q.tail(12).to_string())
    return q


def quarterly_to_ttm(q):
    """รวม 4 ไตรมาสติดกันเป็น EPS ย้อนหลัง 12 เดือน"""
    q = q.dropna(subset=["op", "rep"], how="all").sort_values("date").reset_index(drop=True)
    out = []
    for i in range(3, len(q)):
        w = q.iloc[i - 3:i + 1]
        months = (w.date.dt.year * 12 + w.date.dt.month).tolist()
        if months[-1] - months[0] != 9:
            continue
        out.append((q.date[i], w.op.sum(min_count=4), w.rep.sum(min_count=4)))
    return pd.DataFrame(out, columns=["date", "op", "rep"])


def spx_eps_sp():
    r = requests.get(SPX_XLSX, headers=UA, timeout=90)
    log("S&P xlsx:", r.status_code, r.headers.get("content-type"), len(r.content))
    r.raise_for_status()
    q = parse_spx_xlsx(r.content)
    today = pd.Timestamp.today().normalize()
    # ประมาณการ = ไตรมาสที่ยังไม่ถึงวันใช้จริง (สิ้นไตรมาส + LAG) หรือไตรมาสในอนาคต
    act = q[q.date + pd.Timedelta(days=LAG_DAYS) <= today]
    est = q[q.date + pd.Timedelta(days=LAG_DAYS) > today]
    ttm = quarterly_to_ttm(act)
    fwd = None
    allq = quarterly_to_ttm(q)
    last_act = act.date.max()
    nxt = allq[allq.date == last_act + pd.offsets.QuarterEnd(4)]
    if len(nxt) and pd.notna(nxt.op.iloc[0]):
        fwd = {"op": round(float(nxt.op.iloc[0]), 2), "rep": None if pd.isna(nxt.rep.iloc[0]) else round(float(nxt.rep.iloc[0]), 2),
               "to": str(nxt.date.iloc[0].date())}
    log("TTM tail:\n" + ttm.tail(8).to_string())
    log("forward 4Q:", fwd)
    return ttm, fwd, "S&P Dow Jones Indices (sp-500-eps-est.xlsx)"


def spx_eps_multpl_q():
    """multpl: กำไรต่อหุ้นย้อนหลัง 12 เดือน (As Reported) รายไตรมาส"""
    r = requests.get("https://www.multpl.com/s-p-500-earnings/table/by-quarter", headers=UA, timeout=60)
    r.raise_for_status()
    t = pd.read_html(io.StringIO(r.text))[0]
    log("multpl earnings raw head:\n" + t.head(8).to_string())
    t.columns = ["date", "v"]
    t["est"] = t["v"].astype(str).str.contains("estimate", case=False)
    t["date"] = pd.to_datetime(t["date"], errors="coerce")
    t["rep"] = pd.to_numeric(t["v"].astype(str).str.replace(",", "").str.extract(r"([\d.]+)")[0], errors="coerce")
    t = t.dropna(subset=["date", "rep"])
    t = t[~t.est].sort_values("date")
    # วันที่ในตารางเป็นวันสิ้นไตรมาส
    t["date"] = t["date"] + pd.offsets.QuarterEnd(0)
    t["op"] = None
    return t[["date", "op", "rep"]], None, "multpl.com (S&P 500 Earnings รายไตรมาส จาก S&P)"


def spx_eps_multpl(price):
    r = requests.get("https://www.multpl.com/s-p-500-pe-ratio/table/by-month", headers=UA, timeout=60)
    r.raise_for_status()
    t = pd.read_html(io.StringIO(r.text))[0]
    t.columns = ["date", "pe"]
    t["date"] = pd.to_datetime(t["date"], errors="coerce")
    t["pe"] = pd.to_numeric(t["pe"].astype(str).str.extract(r"([\d.]+)")[0], errors="coerce")
    t = t.dropna().sort_values("date")
    px = price.reindex(t.date, method="ffill")
    t["rep"] = px.values / t.pe.values
    t["op"] = None
    t = t.dropna(subset=["rep"])
    log("multpl tail:\n" + t.tail(6).to_string())
    # multpl ลงวันที่ต้นเดือน ใช้ได้ทันที (ไม่ต้องหน่วง)
    return t[["date", "op", "rep"]], None, "multpl.com (S&P 500 P/E รายเดือน)"


# ---------------- รวม ----------------
def daily_eps(price, ttm, lag):
    """EPS ที่ใช้ในแต่ละวัน = TTM ล่าสุดที่ประกาศแล้ว (สิ้นไตรมาส + lag)"""
    e = ttm.copy()
    e["eff"] = e.date + pd.Timedelta(days=lag)
    e = e.sort_values("eff").set_index("eff")[["op", "rep"]]
    e = e[~e.index.duplicated(keep="last")]
    out = e.reindex(price.index.union(e.index)).ffill().reindex(price.index)
    return out


def build_spx():
    price, psrc = get_price("^GSPC", "^spx")
    try:
        ttm, fwd, esrc = spx_eps_sp()
        lag = LAG_DAYS
    except Exception as e:
        log(f"S&P EPS failed: {e!r} -> multpl quarterly")
        try:
            ttm, fwd, esrc = spx_eps_multpl_q()
            log("multpl quarterly TTM tail:\n" + ttm.tail(8).to_string())
            lag = LAG_DAYS
        except Exception as e2:
            log(f"multpl quarterly failed: {e2!r} -> multpl monthly P/E")
            ttm, fwd, esrc = spx_eps_multpl(price)
            lag = 0
    eps = daily_eps(price, ttm, lag)
    keep = eps.rep.notna() | eps.op.notna()
    price, eps = price[keep], eps[keep]
    r2 = lambda v: None if v is None or pd.isna(v) else round(float(v), 2)
    data = {
        "id": "spx", "name": "S&P 500", "ticker": "SPX Index", "ccy": "USD",
        "updated": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"),
        "source": {"price": "Yahoo Finance (^GSPC)" if psrc == "yahoo" else "Stooq (^SPX)", "eps": esrc,
                   "lagDays": lag},
        "eps": {k: [r2(v) for v in eps[k]] for k in ("op", "rep") if eps[k].notna().any()},
        "date": [d.strftime("%Y-%m-%d") for d in price.index],
        "price": [r2(v) for v in price],
        "ttm": [{"q": str(d.date()), "op": r2(o), "rep": r2(p)} for d, o, p in ttm.itertuples(index=False)][-48:],
        "fwd": fwd,
    }
    last = len(price) - 1
    for k, arr in data["eps"].items():
        if arr[last]:
            log(f"latest {data['date'][last]} price {data['price'][last]} EPS[{k}] {arr[last]} -> P/E {data['price'][last] / arr[last]:.1f}")
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "spx.json"), "w") as f:
        json.dump(data, f, separators=(",", ":"))
    return {"id": "spx", "name": data["name"], "ticker": data["ticker"], "updated": data["updated"]}


def main():
    items = [build_spx()]
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump({"updated": items[0]["updated"], "items": items}, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
