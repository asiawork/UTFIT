/* ที่อยู่ข้อมูลของแต่ละเครื่องมือ (นับจากโฟลเดอร์ของหน้านั้น)
   ข้อมูลอยู่ใน UTFIT แล้ว อัปเดตโดย workflow ใน .github/workflows/
   "" = โฟลเดอร์เดียวกับหน้าเว็บ เช่น atf/compare/data/ , funds/weekly/data.json */
window.UTFIT_SRC = {
  atfCompare: "",   // atf/compare/data/ + atf/compare/assets/
  weekly:     "",   // funds/weekly/data.json + charts/
  masterfund: "",   // funds/masterfund/funds_data.json, amc_abbr.csv, master_tags.csv
};
