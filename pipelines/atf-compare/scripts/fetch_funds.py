"""
ดึงรายชื่อกองทุนเปิดรายย่อยทุกกอง + NAV ตั้งแต่ ธ.ค. 2021 + ข้อมูลเบื้องต้นจาก SEC Open API (v2)
สำหรับหน้า Auto Top Funds เทียบกองทุนรวม (docs/index.html)

เขียน : data/nav/<กอง>.csv        NAV สะสม (ดึงเพิ่มเฉพาะวันใหม่)
        data/universe.json        รายชื่อกอง + ข้อมูลในตาราง (อัปเดตรอบเต็ม)
        docs/data/index.json      รายชื่อกองสำหรับหน้าเว็บ (ค้นหา/กลุ่ม)
        docs/data/f/<กอง>.json    NAV + ข้อมูลของแต่ละกอง (หน้าเว็บโหลดเฉพาะกองที่เลือก)

รอบเต็ม (full): วันจันทร์แรก/ที่สามของเดือน, กดเอง หรือยังไม่มี universe.json
  ดึง profiles + ระดับความเสี่ยง + ค่าธรรมเนียม/สถิติ/ลิงก์หนังสือชี้ชวน แล้วเลือก class หลักของทุกกองรายย่อย
รอบปกติ: ใช้รายชื่อเดิม ดึงเฉพาะ NAV วันใหม่
ทุกรอบ: กองที่ยังไม่เคยดึงย้อนหลัง ทยอยดึงจนหมดเวลาที่กำหนด (TIME_BUDGET_MIN) รอบต่อไปทำต่อ

รัน:
  python scripts/fetch_funds.py
  python scripts/fetch_funds.py --selftest
"""

import csv
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_nav as fn  # noqa: E402

ROOT = fn.ROOT
DATA = ROOT / "data"
OUT = ROOT.parent.parent / "atf" / "compare" / "data"   # หน้าเว็บใน UTFIT
FUND_OUT = OUT / "f"
START = date.fromisoformat(os.getenv("FUNDS_START", "2021-12-01"))
BUDGET = float(os.getenv("TIME_BUDGET_MIN", "300")) * 60      # วินาที
T0 = time.time()
LEVEL_GROUP = {
    1: "ความเสี่ยง 1 · ตลาดเงินในประเทศ",
    2: "ความเสี่ยง 2 · ตลาดเงิน (ต่างประเทศบางส่วน)",
    3: "ความเสี่ยง 3 · พันธบัตรรัฐบาล",
    4: "ความเสี่ยง 4 · ตราสารหนี้",
    5: "ความเสี่ยง 5 · กองผสม",
    6: "ความเสี่ยง 6 · หุ้น",
    7: "ความเสี่ยง 7 · หุ้นรายกลุ่มอุตสาหกรรม",
    8: "ความเสี่ยง 8 · กองทุนทางเลือก",
}
OTHER_GROUP = "ไม่ระบุระดับความเสี่ยง"
MANUAL_GROUP = "เพิ่มเอง"
RISK_URL = f"{fn.BASE}/factsheet/risk-spectrum"
STATS_URL = f"{fn.BASE}/factsheet/statistics"
FEES_URL = f"{fn.BASE}/factsheet/fees"
REDEMP_URL = f"{fn.BASE}/factsheet/subscription-redemption-periods"
URLS_URL = f"{fn.BASE}/factsheet/urls"


def ckey(pid, cls) -> str:
    c = str(cls or "").strip()
    return f"{pid}|{'' if c.lower() in ('', 'main', 'none', 'nan') else fn.norm(c)}"   # SEC ใช้ "main" กับกองที่ไม่มี class


def load_latest(url, label, latest=True):
    """ดึงข้อมูล factsheet ล่าสุดทุกกองแบบเป็นหน้า ๆ (ดึงทีเดียวทั้งตลาด)"""
    rows, cursor = [], None
    while True:
        params = {"page_size": "100"}
        if latest:
            params["latest"] = "true"
        if cursor:
            params["next_cursor"] = cursor
        r = fn.get(url, params)
        if r.status_code == 204:           # SEC ตอบ 204 = ไม่มีข้อมูลเพิ่ม (จบหน้า)
            if not rows and latest:        # หน้าแรกว่าง: ลองแบบไม่ใส่ latest
                return load_latest(url, label, latest=False)
            break
        if r.status_code != 200:
            raise RuntimeError(f"{label} HTTP {r.status_code}: {r.text[:200]}")
        got, cursor = fn.extract_list(r.json())
        rows.extend(got)
        if not got or not cursor:
            break
    print(f"  {label} ได้ {len(rows)} แถว")
    return rows


def load_risk():
    """proj_id -> ระดับความเสี่ยงล่าสุด (int) จาก factsheet ที่มีผลล่าสุด ดึงทีเดียวทุกกอง"""
    out, cursor = {}, None
    while True:
        params = {"latest": "true", "page_size": "100"}
        if cursor:
            params["next_cursor"] = cursor
        r = fn.get(RISK_URL, params)
        if r.status_code != 200:
            raise RuntimeError(f"risk-spectrum HTTP {r.status_code}: {r.text[:200]}")
        rows, cursor = fn.extract_list(r.json())
        for row in rows:
            m = re.search(r"(\d)", str(row.get("risk_spectrum") or ""))
            pid = row.get("proj_id")
            if m and pid:
                out[pid] = int(m.group(1))
        if not rows or not cursor:
            break
    print(f"  risk-spectrum ได้ {len(out)} กอง")
    return out


def is_money_market(p: dict) -> bool:
    txt = re.sub(r"<[^>]+>", " ", str(p.get("investment_policy_desc") or ""))
    txt = re.sub(r"\s+", "", txt)
    return "กองทุนรวมตลาดเงิน" in txt and "ไม่ใช่กองทุนรวมตลาดเงิน" not in txt and "ไม่เป็นกองทุนรวมตลาดเงิน" not in txt

# ให้ fetch_series ของ fetch_nav.py เขียนลงโฟลเดอร์ของหน้าเปรียบเทียบแทนโฟลเดอร์เดิม
fn.NAV_DIR = DATA / "nav"   # NAV สะสมของทุกกอง


def load_extras(fetch_urls=True):
    """(proj_id|class) -> ข้อมูลเสริมสำหรับตารางรายละเอียด"""
    ex = {}

    def newer(row, slot):
        """ถ้า SEC ส่งหลายแถวต่อกอง (เช่น factsheet ตอน IPO + รายเดือน) ใช้แถวที่ start_date ใหม่สุด"""
        key = ckey(row.get("proj_id"), row.get("fund_class_name"))
        d = str(row.get("start_date") or "")
        cur = ex.setdefault(key, {}).get("_d_" + slot, "")
        if d < cur:
            return None
        if d > cur:
            ex[key]["_d_" + slot] = d
        return key

    def put_stats(row):
        key = newer(row, "stats")
        if key is None:
            return
        ex[key]["duration"] = row.get("portfolio_duration_period")
        ex[key]["ytm"] = row.get("yield_to_maturity")
        ex[key]["stat_date"] = str(row.get("start_date") or "")[:10]

    def put_fee(row):
        # เก็บเฉพาะค่าธรรมเนียมที่ตารางใช้: ค่าธรรมเนียมขาย (front-end) และค่าใช้จ่ายรวม / ค่าธรรมเนียมการจัดการ
        desc = str(row.get("fee_type_desc") or "").strip()
        if not re.search(r"front|การขาย|รวม|total|การจัดการ|management", desc, re.I):
            return
        if re.search(r"ขายคืน|รับซื้อคืน|back|สับเปลี่ยน|switch", desc, re.I) and not re.search(r"front", desc, re.I):
            return
        # ค่าธรรมเนียมแต่ละประเภทใช้แถวที่ใหม่สุดของประเภทนั้น
        key = ckey(row.get("proj_id"), row.get("fund_class_name"))
        d = str(row.get("start_date") or "")
        fees = ex.setdefault(key, {}).setdefault("fees", {})
        if desc in fees and d < fees[desc].get("_d", ""):
            return
        e = {"rate": row.get("rate"), "actual": row.get("actual_value"), "_d": d}
        if e["actual"] in (None, "") and e["rate"] in (None, ""):
            e["other"] = str(row.get("fee_other_desc") or "")[:80]
        fees[desc] = e

    def put_redemp(row):
        if str(row.get("type") or "").lower() != "redemption":
            return
        key = newer(row, "redemp")
        if key is None:
            return
        e = {k: row.get(k) for k in ("type", "period", "redemp_period_oth", "settlement_period") if row.get(k) not in (None, "")}
        ex[key]["redemp"] = [e]

    jobs = [
        ("statistics", STATS_URL, put_stats),
        ("fees", FEES_URL, put_fee),
        ("redemption", REDEMP_URL, put_redemp),
    ]
    for label, url, fn_row in jobs:
        try:
            for row in load_latest(url, label):
                fn_row(row)
        except Exception as e:  # noqa: BLE001
            print(f"  ! ดึง {label} ไม่ได้: {e}")
    # ลิงก์หนังสือชี้ชวน (fund factsheet) — ลิงก์ไม่ค่อยเปลี่ยน ดึงเดือนละครั้ง หรือเมื่อมีกองใหม่ที่ยังไม่มีลิงก์
    if fetch_urls:
        load_urls(ex)
    for v in ex.values():
        for k in [k for k in v if k.startswith("_d_")]:
            del v[k]
        for e in (v.get("fees") or {}).values():
            e.pop("_d", None)
    return ex


def load_urls(ex):
    try:
        for row in load_latest(URLS_URL, "factsheet urls", latest=False):
            link = row.get("pdf_factsheet") or row.get("amc_url_factsheet")
            if not link:
                continue
            key = ckey(row.get("proj_id"), row.get("fund_class_name"))
            d = str(row.get("as_of_date") or "")
            cur = ex.setdefault(key, {}).get("fs")
            if not cur or d >= cur[1]:
                ex[key]["fs"] = [link, d, row.get("amc_url_factsheet") or ""]
    except Exception as e:  # noqa: BLE001
        print(f"  ! ดึง factsheet urls ไม่ได้: {e}")


# เก็บมูลค่าทรัพย์สินสุทธิ (net_asset) ล่าสุดจาก response NAV ที่ดึงอยู่แล้ว ไม่ต้องเรียก API เพิ่ม
AUM = {}
_orig_call_nav = fn.call_nav


def _call_nav_capture(proj_id, start, end):
    rows = _orig_call_nav(proj_id, start, end)
    for row in rows:
        na, d = row.get("net_asset"), str(row.get("nav_date") or "")[:10]
        if na in (None, "") or not d:
            continue
        key = ckey(proj_id, row.get("fund_class_name"))
        if key not in AUM or d >= AUM[key][0]:
            try:
                AUM[key] = (d, float(na))
            except (TypeError, ValueError):
                pass
    return rows


fn.call_nav = _call_nav_capture


TAX_NAME = re.compile(r"(RMF|SSF|LTF|TESG|THAIESG|SESG|ESGX)", re.I)
TAX_TH = re.compile(r"เพื่อการเลี้ยงชีพ|เพื่อการออม|หุ้นระยะยาว|ไทยเพื่อความยั่งยืน")


def is_tax_fund(p: dict) -> bool:
    """กองลดหย่อนภาษี (RMF / SSF / LTF / ThaiESG) ดูจากชื่อย่อ ชื่อ class และชื่อไทย"""
    names = " ".join(str(p.get(k) or "") for k in ("proj_abbr_name", "fund_class_name", "proj_name_en"))
    th = " ".join(str(p.get(k) or "") for k in ("proj_name_th", "fund_class_detail"))
    return bool(TAX_NAME.search(names) or TAX_TH.search(th))


# class อื่นที่ไม่เอา แม้ชื่อจะมีคำว่าสะสมมูลค่า/ปันผล (ขายคืนอัตโนมัติ ช่องทางออนไลน์ สถาบัน ฯลฯ)
NOT_MAIN = re.compile(r"อัตโนมัติ|อิเล็กทรอนิกส์|ออนไลน์|สถาบัน|นิติบุคคล|ผู้มีเงินลงทุนสูง|พิเศษ|กองทุนสำรองเลี้ยงชีพ"
                      r"|เพื่อการออม|เลี้ยงชีพ|ช่องทาง|ไม่ใช่รายย่อย")
KEEP_CLASS = re.compile(r"สะสมมูลค่า|ปันผล")


def is_main_fund(p: dict) -> bool:
    return str(p.get("fund_class_name") or "").strip().lower() in ("", "main", "none", "nan")


def keep_class(p: dict) -> bool:
    """กองที่มีหลาย class: เอาเฉพาะชนิดสะสมมูลค่า และชนิดจ่ายปันผล"""
    detail = str(p.get("fund_class_detail") or "")
    return bool(KEEP_CLASS.search(detail)) and not NOT_MAIN.search(detail)


def fallback_score(p: dict) -> int:
    """กองที่ไม่มีชนิดสะสมมูลค่า/ปันผลเลย (เช่น KKP CASH ชนิดทั่วไป) เลือก class ทั่วไปมา 1 class"""
    detail = str(p.get("fund_class_detail") or "")
    sc = 0 if not NOT_MAIN.search(detail) else -5
    if re.search(r"ทั่วไป", detail):
        sc += 3
    return sc


def read_list():
    with (ROOT / "extra_funds.csv").open(encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    out, seen = [], set()
    for r in rows:
        name = (r.get("fund") or "").strip()
        if name and name not in seen:
            seen.add(name)
            out.append({"name": name, "group": (r.get("group") or "").strip() or "อื่น ๆ"})
    return out


SEC_KEEP = ["fund_status", "comp_name_th", "comp_name_en", "proj_name_th", "proj_name_en", "regis_date", "invest_country_flag",
            "investment_policy_desc", "management_style", "exchange_rate_protection_policy", "feederfund_master_fund"]
MASTER_PREFIX = re.compile(r"^\s*((ชื่อ\s*)?กองทุน\s*(หลัก)?\s*[:：]\s*|(name\s+of\s+)?master\s*fund\s*(name)?\s*[:：]\s*)", re.I)


def scalar_fields(row: dict) -> dict:
    """เก็บเฉพาะ field ที่หน้าเว็บใช้ (ตัด HTML ออกจากนโยบายลงทุน)"""
    keep = {}
    for k in SEC_KEEP:
        v = row.get(k)
        if v is None or str(v).strip() in ("", "-", "None", "null"):
            continue
        s = str(v).strip()
        if k == "investment_policy_desc":
            s = re.sub(r"<[^>]+>", " ", s).replace("&nbsp;", " ")
            s = re.sub(r"\s+", " ", s).strip()
            s = s if len(s) <= 3000 else s[:3000] + "…"
        if k == "feederfund_master_fund":           # ชื่อกองแม่ (feeder fund) ตัด HTML/คำนำหน้า
            s = re.sub(r"<[^>]+>", " ", s).replace("&nbsp;", " ")
            s = MASTER_PREFIX.sub("", re.sub(r"\s+", " ", s)).strip()[:200]
            if not s:
                continue
        keep[k] = s
    return keep



BACKFILL_PATH = DATA / "backfill.json"
BACKFILL = json.loads(BACKFILL_PATH.read_text()) if BACKFILL_PATH.exists() else {}


def fetch_nav(info, start, today):
    """ดึง NAV: รอบแรกดึงตั้งแต่ start · รอบต่อไปดึงเฉพาะวันใหม่ (รวมกองที่เปิดหลัง start)"""
    name = info["name"]
    series = fn.read_cache(fn.NAV_DIR / f"{fn.slug(name)}.csv")
    frm = start
    if series and BACKFILL.get(name, "9999") <= start.isoformat():
        frm = max(start, min(series))
    _, warn = fn.fetch_series(info, frm, today)
    BACKFILL[name] = start.isoformat()
    return warn


# วันที่ดึง NAV ล่าสุดของแต่ละกอง (+ คำเตือนจากรอบนั้น) ใช้ข้ามกองที่ดึงไปแล้ววันนี้
FETCHED_PATH = DATA / "fetched.json"
FETCHED = json.loads(FETCHED_PATH.read_text()) if FETCHED_PATH.exists() else {}


def save_fetched():
    FETCHED_PATH.write_text(json.dumps(FETCHED, ensure_ascii=False, indent=0, sort_keys=True))


def save_backfill(names):
    keep = {k: v for k, v in BACKFILL.items() if k in names}
    BACKFILL_PATH.write_text(json.dumps(keep, ensure_ascii=False, indent=0, sort_keys=True))


def nav_series(info, start, today):
    """ดึง NAV เพิ่ม (เฉพาะวันใหม่) แล้วคืน (วันที่เรียงแล้ว, series, warning)"""
    warn = None
    try:
        warn = fetch_nav(info, start, today)
    except Exception as e:  # noqa: BLE001
        warn = str(e)[:300]
        print(f"  ! {e}")
    cache = fn.NAV_DIR / f"{fn.slug(info['name'])}.csv"
    series = fn.read_cache(cache)
    return cache, series, warn


def pack(series, start):
    series = {d: v for d, v in series.items() if d >= start}
    days = sorted(series)
    return {"s": days[0].isoformat() if days else None,
            "dd": [(b - a).days for a, b in zip(days, days[1:])],
            "v": [round(series[d], 4) for d in days]}, days



# ---------- ดึง NAV ทีละโครงการ: class อื่นของโครงการเดียวกันใช้ response เดิม ไม่เรียก API ซ้ำ ----------
_memo = {"pid": None, "rows": {}}
_call_nav_aum = fn.call_nav


def _call_nav_memo(proj_id, start, end):
    if _memo["pid"] != proj_id:
        _memo["pid"], _memo["rows"] = proj_id, {}
    k = (start.isoformat(), end.isoformat())
    if k not in _memo["rows"]:
        _memo["rows"][k] = _call_nav_aum(proj_id, start, end)
    return _memo["rows"][k]


fn.call_nav = _call_nav_memo
UNIVERSE = DATA / "universe.json"
UNI_V = 5                  # เปลี่ยนเลขเมื่อวิธีสร้างรายชื่อ/ข้อมูลในตารางเปลี่ยน → รอบถัดไปสร้างใหม่อัตโนมัติ
POLICY_MAX = 1200          # ตัดนโยบายการลงทุนให้สั้นลง (ไฟล์ต่อกองเล็กลง)


# กองที่ SEC ไม่นับเป็นกองมีอายุ (proj_term_flag = N) แต่ลักษณะเป็นกองเป้าหมาย/ครบกำหนด: ทริกเกอร์, ท็อป xM, ประจำ x เดือน, โรลโอเวอร์
TERM_LIKE = re.compile(r"ทริกเกอร์|trigger|ประจำ\s*\d|โรลโอเวอร์|roll ?over|ท็อป\s*\d+\s*M|top\s*\d+\s*M", re.I)


def build_universe(today, prev):
    """รายชื่อกองเปิดรายย่อยทุกกอง (class หลัก ไม่รวมกองภาษี/กองมีอายุ) + ข้อมูลในตาราง"""
    profiles = fn.load_profiles()
    by_class, by_abbr = fn.build_lookup(profiles)
    raw_by_proj = {}
    for p in profiles:
        raw_by_proj.setdefault(p.get("proj_id"), []).append(p)

    def raw_profile(info):
        rows = raw_by_proj.get(info["proj_id"], [])
        want = fn.norm(info["fund_class_name"])
        for r in rows:
            if fn.norm(r.get("fund_class_name")) == want:
                return r
        return rows[0] if rows else {}

    try:
        risk = load_risk()
    except Exception as e:  # noqa: BLE001
        print(f"  ! ดึงระดับความเสี่ยงไม่ได้: {e}")
        risk = {}
    by_pid = {}   # load_profiles ให้เฉพาะกองที่ยังเปิดอยู่ (Registered / IPO)
    for p in profiles:
        if str(p.get("proj_retail_type") or "R").strip().upper() != "R":
            continue
        if str(p.get("proj_term_flag") or "N").strip().upper() not in ("N", ""):
            continue
        if is_tax_fund(p):
            continue
        if TERM_LIKE.search(f"{p.get('proj_name_th') or ''} {p.get('proj_name_en') or ''}"):
            continue
        by_pid.setdefault(p.get("proj_id"), []).append(p)
    funds, listed = [], set()
    for pid, ps in by_pid.items():
        mains = [p for p in ps if is_main_fund(p)]
        keep = mains or [p for p in ps if keep_class(p)]
        if not keep:
            best = max(ps, key=fallback_score)
            keep = [best] if fallback_score(best) >= 0 else []
        for p in keep:
            cls = str(p.get("fund_class_name") or "").strip()
            cls = "" if cls.lower() in ("main", "none", "nan") else cls
            name = cls or str(p.get("proj_abbr_name") or "").strip()
            if not name or fn.norm(name) in listed:
                continue
            listed.add(fn.norm(name))
            lv = risk.get(pid)
            funds.append({"name": name, "group": LEVEL_GROUP.get(lv, OTHER_GROUP), "risk": lv,
                          "info": {"proj_id": pid, "proj_abbr_name": str(p.get("proj_abbr_name") or "").strip(),
                                   "fund_class_name": cls, "proj_name_th": p.get("proj_name_th"),
                                   "comp_name_th": p.get("comp_name_th"), "name": name}})
    print(f"กองรายย่อย {len(funds)} กอง (class หลัก, ไม่รวมกองภาษี/กองมีอายุ)")
    # กองที่เพิ่มเอง (เช่น class สถาบัน) จาก extra_funds.csv
    missing = {}
    if (ROOT / "extra_funds.csv").exists():
        for f in read_list():
            if fn.norm(f["name"]) in listed:
                continue
            res = fn.resolve(f["name"], by_class, by_abbr)
            if res is None:
                missing[f["name"]] = "ไม่พบชื่อนี้ใน SEC"
            elif "ambiguous" in res:
                missing[f["name"]] = "มีหลาย class ให้ระบุเป็น: " + ", ".join(res["ambiguous"])
            else:
                lv = risk.get(res["proj_id"])
                funds.append({"name": f["name"], "group": f["group"] if f["group"] != "อื่น ๆ" else LEVEL_GROUP.get(lv, MANUAL_GROUP),
                              "risk": lv, "info": {**res, "name": f["name"]}})
                listed.add(fn.norm(f["name"]))
    # ข้อมูลในตาราง (ดึงทั้งตลาดทีเดียว) · ลิงก์หนังสือชี้ชวนดึงเดือนละครั้ง
    prev_x = {ckey(f["info"]["proj_id"], f["info"]["fund_class_name"]): f.get("x") or {} for f in (prev or {}).get("funds", [])}
    need_urls = today.day <= 7 or os.getenv("FUNDS_URLS") == "1" or not prev_x or (prev or {}).get("v") != UNI_V
    extras = load_extras(fetch_urls=need_urls)
    for f in funds:
        i = f["info"]
        k = ckey(i["proj_id"], i["fund_class_name"])
        x = {**({"fs": prev_x.get(k, {}).get("fs")} if prev_x.get(k, {}).get("fs") else {}),
             **({"fs": extras.get(ckey(i["proj_id"], ""), {}).get("fs")} if extras.get(ckey(i["proj_id"], ""), {}).get("fs") else {}),
             **extras.get(k, {})}
        f["x"] = x
        sec = scalar_fields(raw_profile(i))
        if len(sec.get("investment_policy_desc", "")) > POLICY_MAX:
            sec["investment_policy_desc"] = sec["investment_policy_desc"][:POLICY_MAX] + "…"
        f["sec"] = sec
    funds.sort(key=lambda f: (f["info"]["proj_id"], f["name"]))
    return {"v": UNI_V, "built": today.isoformat(), "funds": funds, "missing": missing}


def main():
    if not fn.API_KEY:
        raise SystemExit("ไม่พบ SEC_API_KEY (ตั้งใน GitHub → Settings → Secrets and variables → Actions)")
    today = datetime.now(timezone(timedelta(hours=7))).date()
    if "--selftest" in sys.argv:
        ps = fn.load_profiles()
        print(json.dumps(ps[:1], ensure_ascii=False, indent=1)[:3000])
        import collections
        for k in ("proj_term_flag", "proj_retail_type", "fund_status"):
            print(k, collections.Counter(repr(p.get(k)) for p in ps).most_common(10))
        for p in ps:
            if str(p.get("proj_abbr_name")) in ("ONE-GLOBALTOP8M10", "SI5A4", "SF5", "RPF2", "K-CASH"):
                print(json.dumps(p, ensure_ascii=False))
        return
    prev = json.loads(UNIVERSE.read_text()) if UNIVERSE.exists() else None
    first_or_third_monday = today.weekday() == 0 and (today.day <= 7 or 15 <= today.day <= 21)
    mode = os.getenv("FUNDS_MODE", "").strip().lower() or ("full" if first_or_third_monday or not prev else "nav")
    if mode == "full" or not prev or prev.get("v") != UNI_V:
        print("รอบเต็ม: ดึงรายชื่อกองและข้อมูลในตารางใหม่")
        uni = build_universe(today, prev)
        DATA.mkdir(parents=True, exist_ok=True)
        UNIVERSE.write_text(json.dumps(uni, ensure_ascii=False, separators=(",", ":")))
    else:
        uni = prev
    funds = uni["funds"]
    # กองที่ดึงย้อนหลังครบแล้วอัปเดตก่อน (เร็ว) แล้วค่อยทยอยดึงย้อนหลังกองใหม่จนหมดเวลา
    done = [f for f in funds if BACKFILL.get(f["name"], "9999") <= START.isoformat()]
    done_names = {f["name"] for f in done}
    todo = [f for f in funds if f["name"] not in done_names]
    n_today = sum(1 for f in done if FETCHED.get(f["name"], [None])[0] == today.isoformat())
    print(f"อัปเดต NAV {len(done)} กอง (ดึงไปแล้ววันนี้ {n_today} กอง ข้าม) · รอดึงย้อนหลัง {len(todo)} กอง · เวลา {BUDGET / 60:.0f} นาที")
    FUND_OUT.mkdir(parents=True, exist_ok=True)
    pending, n_ok = [], 0
    for i, f in enumerate(done + todo):
        info = f["info"]
        if f["name"] not in done_names and time.time() - T0 > BUDGET:
            pending.append(f["name"])
            continue
        if i % 50 == 0:
            print(f"  [{i}/{len(funds)}] {f['name']} ({time.time() - T0:.0f}s)")
        if f["name"] in done_names and FETCHED.get(f["name"], [None])[0] == today.isoformat():
            # ดึง NAV ของกองนี้ไปแล้ววันนี้ (รอบก่อนหน้า) ไม่เรียก API ซ้ำ เหลือเวลาไว้ดึงย้อนหลังกองที่ยังไม่ครบ
            cache = fn.NAV_DIR / f"{fn.slug(info['name'])}.csv"
            series, warn = fn.read_cache(cache), FETCHED[f["name"]][1]
        else:
            cache, series, warn = nav_series(info, START, today)
            FETCHED[f["name"]] = [today.isoformat(), warn]
            if i % 50 == 0:
                save_fetched()
        packed, days = pack(series, START)
        if days and warn and warn.startswith("API ตอบกลับมาแต่ไม่มี NAV"):
            warn = None
        k = ckey(info["proj_id"], info["fund_class_name"])
        x = dict(f.get("x") or {})
        if k in AUM:
            x["aum"] = AUM[k]
        f["_s"], f["_e"] = packed["s"], days[-1].isoformat() if days else None
        (FUND_OUT / f"{fn.slug(f['name'])}.json").write_text(json.dumps(
            {"name": f["name"], "group": f["group"], "risk": f.get("risk"), "info": info, "sec": f.get("sec") or {},
             "x": x, "warning": warn, **packed}, ensure_ascii=False, separators=(",", ":")))
        n_ok += 1
    # หน้าเว็บ: รายชื่อสำหรับค้นหา/แบ่งกลุ่ม (ไม่มี NAV)
    have = {p.stem for p in FUND_OUT.glob("*.json")}
    groups = {}
    rows = []
    for f in sorted(funds, key=lambda f: (f["group"], f["name"])):
        k = fn.slug(f["name"])
        if k not in have:
            continue
        sec0 = f.get("sec") or {}
        if f.get("_s", "x") is None and str(sec0.get("fund_status") or "").strip().upper() != "IPO":
            continue                                                  # ไม่มี NAV ของ class นี้ใน SEC
        gi = groups.setdefault(f["group"], len(groups))
        sec = f.get("sec") or {}
        rows.append([f["name"], gi, f.get("risk"), k, sec.get("proj_name_th") or f["info"].get("proj_name_th") or "",
                     sec.get("comp_name_th") or f["info"].get("comp_name_th") or "", f["info"].get("proj_abbr_name") or "",
                     1 if str(sec.get("fund_status") or "").strip().upper() == "IPO" else 0])
    ends = [f.get("_e") for f in funds if f.get("_e")]
    prev_idx = json.loads((OUT / "index.json").read_text()) if (OUT / "index.json").exists() else {}
    index = {"updated": today.isoformat(), "run_at": datetime.utcnow().isoformat() + "Z", "start": START.isoformat(),
             "nav_to": max(ends) if ends else prev_idx.get("nav_to"),
             "groups": sorted(groups, key=lambda g: groups[g]), "pending": len(pending),
             "cols": ["name", "group", "risk", "file", "proj_name_th", "comp_name_th", "abbr", "ipo"],
             "funds": rows, "missing": uni.get("missing") or {}}
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")))
    # ลบไฟล์ของกองที่ไม่อยู่ในรายชื่อแล้ว
    keep = {fn.slug(f["name"]) for f in funds}
    for p in FUND_OUT.glob("*.json"):
        if p.stem not in keep:
            p.unlink()
    if len(funds) >= 200:
        for p in fn.NAV_DIR.glob("*.csv"):
            if p.stem not in keep:
                p.unlink()
    save_backfill({f["name"] for f in funds})
    names = {f["name"] for f in funds}
    for k in [k for k in FETCHED if k not in names]:
        del FETCHED[k]
    save_fetched()
    print(f"เขียนข้อมูล {n_ok} กอง · ยังรอดึงย้อนหลัง {len(pending)} กอง (รอบต่อไปทำต่อ) · ใช้เวลา {(time.time() - T0) / 60:.1f} นาที")


if __name__ == "__main__":
    main()
