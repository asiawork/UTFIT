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
HEAD = ["กองทุน", "ความเสี่ยง", "ชื่อกองทุน", "บลจ.", "Average Credit Rating", "ระยะเวลาที่ควรถือลงทุน"]


def main():
    idx = json.loads(INDEX.read_text("utf-8"))
    C = {c: i for i, c in enumerate(idx["cols"])}
    funds = {}
    for r in idx["funds"]:
        if str(r[C["risk"]]) in ("1", "2", "3", "4"):
            funds[r[C["name"]]] = [r[C["name"]], int(r[C["risk"]]), r[C["proj_name_th"]] or "", r[C["comp_name_th"]] or "", "", ""]

    # คงค่าที่กรอกไว้ (รวมกองที่ไม่อยู่ในรายชื่อแล้ว)
    if OUT.exists():
        ws = load_workbook(OUT).worksheets[0]
        for row in ws.iter_rows(min_row=2, values_only=True):
            if not row or not row[0]:
                continue
            name = str(row[0]).strip()
            old = funds.get(name) or [name, row[1] or "", row[2] or "", row[3] or "", "", ""]
            old[4], old[5] = row[4] or "", row[5] or ""
            funds[name] = old

    wb = Workbook()
    ws = wb.active
    ws.title = "ข้อมูลกอง"
    ws.append(HEAD)
    for row in sorted(funds.values(), key=lambda x: (x[1] if isinstance(x[1], int) else 9, x[0])):
        ws.append(row)

    navy = PatternFill("solid", fgColor="1B3560")
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = navy
        c.alignment = Alignment(horizontal="center", vertical="center")
    for col, w in zip("ABCDEF", (16, 11, 52, 40, 22, 32)):
        ws.column_dimensions[col].width = w
    ws.freeze_panes = "B2"
    ws.auto_filter.ref = f"A1:F{ws.max_row}"

    # รายการให้เลือก (dropdown) เก็บในชีตซ่อน
    opt = wb.create_sheet("ตัวเลือก")
    for i, v in enumerate(RATING, 1):
        opt.cell(i, 1, v)
    for i, v in enumerate(HOLD, 1):
        opt.cell(i, 2, v)
    opt.sheet_state = "hidden"
    last = max(ws.max_row, 2) + 300
    for col, ref in (("E", f"'ตัวเลือก'!$A$1:$A${len(RATING)}"), ("F", f"'ตัวเลือก'!$B$1:$B${len(HOLD)}")):
        dv = DataValidation(type="list", formula1=ref, allow_blank=True, showErrorMessage=True,
                            errorTitle="ค่าไม่ตรงตัวเลือก", error="เลือกจากรายการในช่องนี้")
        dv.add(f"{col}2:{col}{last}")
        ws.add_data_validation(dv)

    wb.save(OUT)
    print(OUT, len(funds), "กอง")


if __name__ == "__main__":
    main()
