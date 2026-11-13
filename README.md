# UTFIT

รวมเครื่องมือของทีม Mutual Fund ไว้ในหน้าเดียว (ใช้ภายในทีม)

หน้าเว็บ: `https://asiawork.github.io/UTFIT/`

## หมวดและเครื่องมือ

| หมวด | เครื่องมือ | โฟลเดอร์ | ข้อมูล |
|---|---|---|---|
| **Auto Top Funds** | Wealth Solution Plan | `atf/wealthplan/` | ไฟล์ Model Performance ที่อัปโหลด |
| | Auto Top Funds vs รายกอง | `atf/compare/` | ไฟล์ที่อัปโหลด + NAV กองทุนรวมจาก SEC |
| **รายกองทุน** | กราฟ Weekly | `funds/weekly/` | SEC (อัปเดตทุกวันจันทร์) |
| | ค้นหาด้วย Master Fund | `funds/masterfund/` | SEC |

## ไฟล์ Model Performance (อัปโหลดครั้งเดียว)

- อัปโหลดที่หน้า **Auto Top Funds** แล้วทุกเครื่องมือในหมวดนี้ใช้ไฟล์เดียวกัน
- อัปโหลดจากในเครื่องมือก็ได้ จะอัปเดตให้เครื่องมืออื่นด้วย
- ไฟล์อยู่ในเบราว์เซอร์เครื่องนั้นเท่านั้น (IndexedDB) ไม่ถูกส่งขึ้นเว็บหรือเก็บใน repo
- จำไว้จนกว่าจะอัปโหลดไฟล์ใหม่หรือกด **ล้างไฟล์ออกจากเครื่องนี้**

## ข้อมูลและการอัปเดตอัตโนมัติ

ข้อมูลทั้งหมดอยู่ใน UTFIT แล้ว อัปเดตด้วย GitHub Actions

| Workflow | ใช้กับ | เวลารัน | สคริปต์ / ข้อมูลดิบ | หน้าเว็บอ่านจาก |
|---|---|---|---|---|
| **ATF compare data** | เปรียบเทียบ ATF กับกองทุน | จ.–ศ. 06:40 + ทยอยดึงย้อนหลังทุก 2 ชม. จนครบ | `pipelines/atf-compare/` | `atf/compare/data/` |
| **Weekly charts** | กราฟ Weekly | จันทร์ 06:15 และทุกครั้งที่แก้ `funds.csv` | `pipelines/weekly/` | `funds/weekly/data.json`, `charts/` |
| **Master fund data** | ค้นหาด้วย Master Fund | วันที่ 5 ของทุกเดือน 06:37 (กดรันเองได้) | `pipelines/masterfund/` | `funds/masterfund/` |

- เปลี่ยนกองที่แนะนำในกราฟ Weekly: แก้ `pipelines/weekly/funds.csv` (คอลัมน์ `fund`, `recommend_date`, `compare_with`)
- เพิ่มกองที่ไม่อยู่ในเกณฑ์ของหน้าเปรียบเทียบ: ใส่ชื่อใน `pipelines/atf-compare/extra_funds.csv` แล้วรัน **ATF compare data** แบบ `full`
- ที่อยู่ข้อมูลที่หน้าเว็บใช้อยู่ใน `shared/sources.js`
- `.gitignore` กันไฟล์ `.csv`/`.xlsx` ทุกไฟล์ (กันไฟล์ Model Performance หลุดขึ้น repo) ยกเว้น CSV ที่ระบบใช้ ถ้าเพิ่ม CSV ใหม่ต้องเพิ่มบรรทัด `!` ใน `.gitignore`

## โครงสร้าง

```
index.html              หน้าแรก (เลือกหมวด)
atf/index.html          หมวด Auto Top Funds + อัปโหลดไฟล์
atf/wealthplan/         Wealth Solution Plan (+ backfill.js)
atf/compare/            Auto Top Funds vs รายกอง
funds/index.html        หมวดรายกองทุน
funds/weekly/           กราฟ Weekly
funds/masterfund/       ค้นหาด้วย Master Fund
shared/sources.js       ที่อยู่ข้อมูลของแต่ละเครื่องมือ
shared/atf-store.js     เก็บ/อ่านไฟล์ Model Performance ที่ใช้ร่วมกัน
shared/nav.js           แถบนำทางด้านบน (UTFIT › หมวด › เครื่องมือ)
shared/utfit.css        สไตล์ของหน้าแรกและหน้าหมวด
pipelines/              สคริปต์ดึงข้อมูลจาก SEC + ข้อมูลดิบ (ไม่ได้ใช้บนหน้าเว็บ)
.github/workflows/      ระบบอัปเดตข้อมูลอัตโนมัติ
```

## เพิ่มเครื่องมือใหม่

1. สร้างโฟลเดอร์ใต้หมวด เช่น `funds/ชื่อเครื่องมือ/index.html`
2. ใส่ใน `<head>`:
   ```html
   <script src="../../shared/sources.js"></script>
   <script src="../../shared/nav.js" data-section="funds" data-title="ชื่อเครื่องมือ"></script>
   ```
   ถ้าใช้ไฟล์ Model Performance เพิ่ม `<script src="../../shared/atf-store.js"></script>` แล้วอ่านด้วย `await UTFIT_ATF.get()` (ได้ `{text, name, savedAt}`)
3. เพิ่มการ์ดในหน้าหมวด (`atf/index.html` หรือ `funds/index.html`) โดยก็อปการ์ด `<a class="tool">` ที่มีอยู่ แล้วใส่ภาพตัวอย่างหน้าเครื่องมือ (สัดส่วน 16:10 กว้างประมาณ 960px) ไว้ที่ `shared/previews/`

## ตั้งค่า GitHub Pages

Settings → Pages → Source: **Deploy from a branch** → `main` / `/ (root)`
