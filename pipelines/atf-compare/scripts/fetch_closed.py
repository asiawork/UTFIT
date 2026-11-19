"""ดึง NAV ของกองที่ปิดไปแล้ว (เช่นกองเทอมที่ครบอายุ) ครั้งเดียว สำหรับหน้า atf/compare

รายชื่ออยู่ใน pipelines/atf-compare/closed_funds.csv (fund,group)
ผลลัพธ์: atf/compare/data/closed/<slug>.json + closed/index.json (รูปแบบเดียวกับ data/f/ และ data/index.json)
กองที่ดึงไปแล้วจะข้าม ไม่อัปเดตอีก (กองปิดแล้ว NAV ไม่เปลี่ยน) · ระบบดึงรายวัน (fetch_funds.py) ไม่แตะโฟลเดอร์นี้
รัน: SEC_API_KEY=... python pipelines/atf-compare/scripts/fetch_closed.py [--force]
"""
import csv
import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_nav as fn  # noqa: E402
import fetch_funds as ff  # noqa: E402

LIST = fn.ROOT / "closed_funds.csv"
OUT = ff.OUT / "closed"
GROUP = "กองที่ปิดแล้ว"


def all_profiles():
    """รายชื่อทุกกองใน SEC รวมกองที่เลิกแล้ว (fn.load_profiles คัดเหลือแต่กองที่ยังเปิด)"""
    items, cursor = [], None
    while True:
        params = {"page_size": "100"}
        if cursor:
            params["next_cursor"] = cursor
        r = fn.get(fn.PROFILES_URL, params)
        if r.status_code != 200:
            raise SystemExit(f"profiles HTTP {r.status_code}: {r.text[:300]}")
        rows, cursor = fn.extract_list(r.json())
        items.extend(rows)
        if not rows or not cursor:
            break
    return items


def day(v):
    s = str(v or "").strip()[:10]
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def main():
    force = "--force" in sys.argv
    if not fn.API_KEY:
        raise SystemExit("ไม่พบ SEC_API_KEY")
    with LIST.open(encoding="utf-8-sig") as f:
        wanted = [(r["fund"].strip(), (r.get("group") or "").strip() or GROUP) for r in csv.DictReader(f) if (r.get("fund") or "").strip()]
    OUT.mkdir(parents=True, exist_ok=True)
    todo = [(n, g) for n, g in wanted if force or not (OUT / f"{fn.slug(n)}.json").exists()]
    if not todo:
        print("ไม่มีกองใหม่ให้ดึง")
    else:
        profiles = all_profiles()
        by_class, by_abbr = fn.build_lookup(profiles)
        raw = {}
        for p in profiles:
            raw.setdefault(p.get("proj_id"), []).append(p)
        try:
            risk = ff.load_risk()
        except Exception as e:  # noqa: BLE001
            print(f"  ! ดึงระดับความเสี่ยงไม่ได้: {e}")
            risk = {}
        for name, group in todo:
            res = fn.resolve(name, by_class, by_abbr)
            if res is None or "ambiguous" in res:
                print(f"  ! {name}: {'ไม่พบใน SEC' if res is None else 'มีหลาย class: ' + ', '.join(res['ambiguous'])}")
                continue
            p = raw.get(res["proj_id"], [{}])[0]
            start = max(ff.START, (day(p.get("regis_date")) or ff.START) - timedelta(days=7))
            end = min(day(p.get("cancel_date")) or date.today(), date.today())
            info = {**res, "name": name}
            series, warn, cur = {}, None, start
            while cur <= end:
                to = min(cur + timedelta(days=fn.CHUNK_DAYS - 1), end)
                got, w = fn.parse_rows(fn.call_nav(info["proj_id"], cur, to), info["fund_class_name"])
                series.update(got)
                warn = warn or w
                cur = to + timedelta(days=1)
                time.sleep(0.15)
            packed, days = ff.pack(series, ff.START)
            if not days:
                print(f"  ! {name}: ไม่มี NAV ({warn or 'API ไม่ส่งข้อมูล'})")
                continue
            sec = ff.scalar_fields(p)
            sec["fund_status"] = "ปิดแล้ว"
            lv = risk.get(res["proj_id"])
            (OUT / f"{fn.slug(name)}.json").write_text(json.dumps(
                {"name": name, "group": group, "risk": lv, "info": info, "sec": sec, "x": {}, "warning": None,
                 "closed": True, **packed}, ensure_ascii=False, separators=(",", ":")))
            print(f"  {name}: {days[0]} – {days[-1]} ({len(days)} วัน)")

    # index ของกองที่ปิดแล้ว (หน้าเว็บรวมกับ data/index.json)
    rows, groups = [], {}
    for p in sorted(OUT.glob("*.json")):
        if p.name == "index.json":
            continue
        f = json.loads(p.read_text())
        gi = groups.setdefault(f["group"], len(groups))
        sec, info = f.get("sec") or {}, f.get("info") or {}
        rows.append([f["name"], gi, f.get("risk"), p.stem, sec.get("proj_name_th") or info.get("proj_name_th") or "",
                     sec.get("comp_name_th") or info.get("comp_name_th") or "", info.get("proj_abbr_name") or "", 0])
    (OUT / "index.json").write_text(json.dumps(
        {"groups": sorted(groups, key=lambda g: groups[g]),
         "cols": ["name", "group", "risk", "file", "proj_name_th", "comp_name_th", "abbr", "ipo"], "funds": rows},
        ensure_ascii=False, separators=(",", ":")))
    print(f"กองที่ปิดแล้วในหน้าเว็บ {len(rows)} กอง")


if __name__ == "__main__":
    main()
