"""สร้าง/เติมรายชื่อกองใน atf/compare/data/fund-manual.xlsx (Average Credit Rating กับ ระยะเวลาที่ควรถือลงทุน)

ทีมกรอกค่าในไฟล์นี้เอง หน้า atf/compare อ่านไฟล์ตอนเปิดหน้า
สคริปต์นี้เติมกองความเสี่ยง 1–4 ที่ยังไม่มีในไฟล์ และคงค่าที่กรอกไว้เดิมทุกช่อง
รัน: python pipelines/atf-compare/scripts/fund_manual.py
"""
import json
import pathlib

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = pathlib.Path(__file__).resolve().parents[3]
INDEX = ROOT / "atf/compare/data/index.json"
OUT = ROOT / "atf/compare/data/fund-manual.xlsx"

# ตัวเลือกต้องตรงกับ PICK ใน atf/compare/index.html
RATING = ["AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+", "BBB", "BBB-", "ต่ำกว่า BBB-"]
HOLD = ["แนะนำประมาณ 1 สัปดาห์ขึ้นไป", "แนะนำประมาณ 1 เดือนขึ้นไป", "แนะนำประมาณ 3 เดือนขึ้นไป",
        "แนะนำประมาณ 6 เดือนขึ้นไป", "แนะนำประมาณ 1 ปีขึ้นไป"]
HEAD = ["กองทุน", "Average Credit Rating", "ระยะเวลาที่ควรถือลงทุน"]


def main():
    idx = json.loads(INDEX.read_text("utf-8"))
    C = {c: i for i, c in enumerate(idx["cols"])}
    funds = {}
    for r in idx["funds"]:
        if str(r[C["risk"]]) in ("1", "2", "3", "4"):
            funds[r[C["name"]]] = [r[C["name"]], "", ""]

    # คงค่าที่กรอกไว้ (รวมกองที่ไม่อยู่ในรายชื่อแล้ว)
    if OUT.exists():
        ws = load_workbook(OUT).worksheets[0]
        rows = list(ws.iter_rows(values_only=True))
        head = [str(h or "").strip() for h in rows[0]] if rows else []
        col = {h: head.index(h) for h in HEAD if h in head}   # อ่านตามชื่อหัวคอลัมน์ (ไฟล์รุ่นเก่ามีคอลัมน์มากกว่านี้)
        for row in rows[1:]:
            name = str(row[col["กองทุน"]] or "").strip() if "กองทุน" in col else ""
            if not name:
                continue
            funds[name] = [name] + [row[col[h]] or "" if h in col else "" for h in HEAD[1:]]

    wb = Workbook()
    ws = wb.active
    ws.title = "ข้อมูลกอง"
    ws.append(HEAD)
    for row in sorted(funds.values(), key=lambda x: x[0].upper()):
        ws.append(row)

    navy = PatternFill("solid", fgColor="1B3560")
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = navy
        c.alignment = Alignment(horizontal="center", vertical="center")
    for col, w in zip("ABC", (18, 24, 32)):
        ws.column_dimensions[col].width = w
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:C{ws.max_row}"

    # รายการให้เลือก (dropdown) เก็บในชีตซ่อน
    opt = wb.create_sheet("ตัวเลือก")
    for i, v in enumerate(RATING, 1):
        opt.cell(i, 1, v)
    for i, v in enumerate(HOLD, 1):
        opt.cell(i, 2, v)
    opt.sheet_state = "hidden"
    last = max(ws.max_row, 2) + 300
    for col, ref in (("B", f"'ตัวเลือก'!$A$1:$A${len(RATING)}"), ("C", f"'ตัวเลือก'!$B$1:$B${len(HOLD)}")):
        dv = DataValidation(type="list", formula1=ref, allow_blank=True, showErrorMessage=True,
                            errorTitle="ค่าไม่ตรงตัวเลือก", error="เลือกจากรายการในช่องนี้")
        dv.add(f"{col}2:{col}{last}")
        ws.add_data_validation(dv)

    wb.save(OUT)
    print(OUT, len(funds), "กอง")


if __name__ == "__main__":
    main()
