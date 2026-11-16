# UTFIT

เว็บรวมเครื่องมือของทีม Mutual Fund (ใช้ในทีมเท่านั้น) — GitHub Pages: https://asiawork.github.io/UTFIT/

## วิธีทำงาน
- แก้แล้ว push ขึ้น main ได้เลย commit ด้วยชื่อ `asiawork` อีเมล `asiawork@users.noreply.github.com`
- ก่อนส่งงาน เปิดหน้าดูจริงทุกครั้ง (เปิด local server แล้วแคปหน้าจอเช็ก) ถ้ามีดาวน์โหลด PowerPoint/PDF ให้ลองสร้างไฟล์ดูด้วย
- ไลบรารีจาก CDN (pptxgenjs, html-to-image) อาจโหลดไม่ได้ในเครื่องที่ทดสอบ ให้ติดตั้งผ่าน npm แล้ว route แทนตอนทดสอบ

## โครงสร้าง
- `index.html` หน้าแรก 2 หมวด
- `atf/` หมวด Auto Top Funds: อัปโหลดไฟล์ Model Performance ครั้งเดียวใช้ทุกเครื่องมือในหมวด (`shared/atf-store.js`, IndexedDB)
  - `atf/wealthplan/` Wealth Solution Plan
  - `atf/wealthplan/monthly/` รายงานประจำเดือน (ใช้คนเดียว ห้ามใส่ลิงก์จากหน้าอื่น) ใช้โค้ดของ wealthplan ผ่าน `window.WPAPI` ใน iframe
  - `atf/compare/` Auto Top Funds vs รายกอง
- `funds/` หมวดรายกองทุน (ข้อมูล SEC): `funds/weekly/` กราฟ Weekly, `funds/masterfund/` ค้นหาด้วย Master Fund
- `shared/` nav, สไตล์ร่วม (`utfit.css`, `tool-theme.css`), ไอคอน (`ui.js`), รูปตัวอย่าง (`previews/`)
- `pipelines/` + `.github/workflows/` ดึงข้อมูล SEC Open API (secret `SEC_API_KEY`)

## ดีไซน์และข้อความ
- ธีมสว่างอย่างเดียว สีหลักกรมท่าเข้ม `#0f1a3c` ไม่เอาเอฟเฟกต์ดู AI (glow, glass, gradient เยอะ)
- ข้อความบนเว็บ: ไม่ใช้ "·" คั่น ไม่เขียนลิสต์คั่นด้วยจุลภาค ไม่เขียนบอกผู้ใช้ว่าให้กดตรงไหน
- สไลด์/PowerPoint ใช้ฟอนต์ `BLS ExtraBold` (หัวข้อใหญ่), `BLS Bold`, `BLS Text`
- ไฟล์ Model Performance ของจริงห้ามขึ้น repo ภาพตัวอย่างห้ามใช้ข้อมูลจริงของโมเดล

## หมายเหตุ
- ช่องที่ขึ้น "—" บนสไลด์ (เช่นแผน 3 Median Drawdown/Recovery Period) ไม่ใช่บั๊ก จะหายเมื่อโหลดข้อมูลเข้ามาแล้ว
- รายงานประจำเดือน: PowerPoint เรียง section TH (ไทย กรมท่า) › EN (อังกฤษ กรมท่า) › P (ไทย ขาว) › ENP (อังกฤษ ขาว) pie แบบกรมท่าห้ามมีสีทอง ชื่อแผนสีทองบนหัวสไลด์กรมท่าเป็นตัวหนังสือไล่สี (ใน PowerPoint แก้ XML หลังสร้างผ่าน `goldTextGradient`) แบบพื้นขาวไม่ใช้ gradient
