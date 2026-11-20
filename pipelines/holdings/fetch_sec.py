"""
ดึงพอร์ตกองทุนไทยจาก SEC Open API (v2) สำหรับหน้า "หุ้นนี้กองไหนถือ" (funds/holdings/)

เขียน : pipelines/holdings/data/top5.json        5 อันดับแรกตาม factsheet ล่าสุดของทุกโครงการ
        pipelines/holdings/data/portfolio.json   พอร์ตรายไตรมาส (ทุกรายการ) ไตรมาสล่าสุดที่ SEC มีข้อมูล
        pipelines/holdings/data/projects.json    ชื่อย่อ/ชื่อไทย/บลจ. ของแต่ละโครงการ

รัน: python pipelines/holdings/fetch_sec.py
"""
import collections
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipelines/atf-compare/scripts"))
import fetch_nav as fn  # noqa: E402

DATA = Path(__file__).resolve().parent / "data"
TOP5_URL = f"{fn.BASE}/factsheet/top5-holdings"
PORT_URL = f"{fn.BASE}/outstanding/portfolio"


def pages(url, params, label, limit=None):
    rows, cursor, n = [], None, 0
    while True:
        p = dict(params, page_size="100")
        if cursor:
            p["next_cursor"] = cursor
        r = fn.get(url, p)
        n += 1
        if r.status_code == 204:
            break
        if r.status_code != 200:
            raise RuntimeError(f"{label} HTTP {r.status_code}: {r.text[:300]}")
        got, cursor = fn.extract_list(r.json())
        rows.extend(got)
        if n % 50 == 0:
            print(f"  {label}: {n} หน้า {len(rows)} แถว")
        if not got or not cursor or (limit and n >= limit):
            break
    print(f"{label}: {len(rows)} แถว ({n} หน้า)")
    return rows


def quarters_back(today, k=4):
    y, q = today.year, (today.month - 1) // 3      # ไตรมาสที่จบแล้วล่าสุด
    out = []
    for _ in range(k):
        if q == 0:
            y, q = y - 1, 4
        out.append(y * 100 + q * 3)
        q -= 1
    return out


def main():
    if not fn.API_KEY:
        raise SystemExit("ไม่พบ SEC_API_KEY")
    DATA.mkdir(parents=True, exist_ok=True)

    # ---------- 5 อันดับแรกตาม factsheet ----------
    rows = pages(TOP5_URL, {"latest": "true"}, "top5")
    if rows:
        print("ตัวอย่าง top5:", json.dumps(rows[:3], ensure_ascii=False))
    top5 = {}
    for r in rows:
        pid, d = r.get("proj_id"), str(r.get("start_date") or "")
        cur = top5.get(pid)
        if cur and d < cur["d"]:
            continue
        if not cur or d > cur["d"]:
            top5[pid] = cur = {"d": d, "t": r.get("prospectus_type"), "h": []}
        cur["h"].append([r.get("asset_seq"), r.get("asset_name"), r.get("asset_ratio")])
    for v in top5.values():
        v["h"].sort(key=lambda x: (x[0] is None, x[0]))
    print(f"top5: {len(top5)} โครงการ วันที่ล่าสุด {collections.Counter(v['d'][:7] for v in top5.values()).most_common(6)}")
    (DATA / "top5.json").write_text(json.dumps(top5, ensure_ascii=False, separators=(",", ":")))

    # ---------- พอร์ตรายไตรมาส: หาไตรมาสล่าสุดที่มีข้อมูลครบพอ ----------
    best = None
    for per in quarters_back(date.today()):
        probe = pages(PORT_URL, {"start_period": str(per), "end_period": str(per)}, f"portfolio {per} (ลอง 3 หน้า)", limit=3)
        print(f"  {per}: {len(probe)} แถว")
        if probe:
            print("ตัวอย่าง portfolio:", json.dumps(probe[:3], ensure_ascii=False))
            best = per
            break
    if best:
        rows = pages(PORT_URL, {"start_period": str(best), "end_period": str(best)}, f"portfolio {best}")
        port = collections.defaultdict(list)
        asof = {}
        for r in rows:
            pid = r.get("proj_id")
            asof[pid] = str(r.get("as_of_date") or "")[:10]
            port[pid].append([r.get("assetliab_id"), r.get("assetliab_desc"), r.get("issue_code"), r.get("isin_code"),
                              r.get("issuer"), r.get("assetliab_value"), r.get("percent_nav")])
        print(f"portfolio {best}: {len(port)} โครงการ")
        print("ประเภทรายการ:", collections.Counter(x[1] for v in port.values() for x in v).most_common(40))
        (DATA / "portfolio.json").write_text(json.dumps({"period": best, "asof": asof, "funds": port},
                                                        ensure_ascii=False, separators=(",", ":")))

    # ---------- ชื่อโครงการ ----------
    profs = fn.load_profiles()
    proj = {}
    for p in profs:
        pid = p.get("proj_id")
        if pid and pid not in proj:
            proj[pid] = [p.get("proj_abbr_name"), p.get("proj_name_th"), p.get("comp_name_th"), p.get("fund_status")]
    (DATA / "projects.json").write_text(json.dumps(proj, ensure_ascii=False, separators=(",", ":")))
    print(f"projects: {len(proj)}")
    for pid in ("M0444_2565", "M0666_2569", "M0045_2561"):
        print(pid, proj.get(pid, [None])[0], "top5:", json.dumps(top5.get(pid), ensure_ascii=False))


if __name__ == "__main__":
    main()
