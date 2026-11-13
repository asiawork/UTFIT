# UTFIT

รวมเครื่องมือของทีม Mutual Fund ไว้ในหน้าเดียว (ใช้ภายในทีม)

หน้าเว็บ: `https://asiawork.github.io/UTFIT/`

## หมวดและเครื่องมือ

| หมวด | เครื่องมือ | โฟลเดอร์ | ข้อมูล |
|---|---|---|---|
| **Auto Top Funds** | Wealth Solution Plan | `atf/wealthplan/` | ไฟล์ Model Performance ที่อัปโหลด |
| | เปรียบเทียบ Auto Top Funds กับกองทุน | `atf/compare/` | ไฟล์ที่อัปโหลด + NAV กองทุนรวมจาก SEC |
| **รายกองทุน** | กราฟ Weekly | `funds/weekly/` | SEC (อัปเดตทุกวันจันทร์) |
| | ค้นหาด้วย Master Fund | `funds/masterfund/` | SEC |

## ไฟล์ Model Performance (อัปโหลดครั้งเดียว)

- อัปโหลดที่หน้า **Auto Top Funds** แล้วทุกเครื่องมือในหมวดนี้ใช้ไฟล์เดียวกัน
- อัปโหลดจากในเครื่องมือก็ได้ จะอัปเดตให้เครื่องมืออื่นด้วย
- ไฟล์อยู่ในเบราว์เซอร์เครื่องนั้นเท่านั้น (IndexedDB) ไม่ถูกส่งขึ้นเว็บหรือเก็บใน repo
- จำไว้จนกว่าจะอัปโหลดไฟล์ใหม่หรือกด **ล้างไฟล์ออกจากเครื่องนี้**

## ที่มาของข้อมูล

ตอนนี้ข้อมูล NAV และข้อมูลกองทุนยังอ่านจาก repo เดิม (ระบบอัปเดตอัตโนมัติด้วย GitHub Actions ยังรันอยู่ที่นั่น):

| เครื่องมือ | อ่านข้อมูลจาก |
|---|---|
| เปรียบเทียบ ATF กับกองทุน | `asiawork/autotopfund-vs-fund` (`docs/data/`, `docs/assets/`) |
| กราฟ Weekly | `asiawork/weekly-graph` (`docs/data.json`, `docs/charts/`) |
| ค้นหาด้วย Master Fund | `asiawork/masterfund-lookup` (`funds_data.json` ฯลฯ) |

ที่อยู่ทั้งหมดอยู่ใน `shared/sources.js` ไฟล์เดียว
**ห้ามลบ repo เดิมจนกว่าจะย้ายข้อมูลและ workflow มาไว้ใน UTFIT แล้วแก้ `shared/sources.js`**

## โครงสร้าง

```
index.html              หน้าแรก (เลือกหมวด)
atf/index.html          หมวด Auto Top Funds + อัปโหลดไฟล์
atf/wealthplan/         Wealth Solution Plan (+ backfill.js)
atf/compare/            เปรียบเทียบ Auto Top Funds กับกองทุน
funds/index.html        หมวดรายกองทุน
funds/weekly/           กราฟ Weekly
funds/masterfund/       ค้นหาด้วย Master Fund
shared/sources.js       ที่อยู่ข้อมูลของแต่ละเครื่องมือ
shared/atf-store.js     เก็บ/อ่านไฟล์ Model Performance ที่ใช้ร่วมกัน
shared/nav.js           แถบนำทางด้านบน (UTFIT › หมวด › เครื่องมือ)
shared/utfit.css        สไตล์ของหน้าแรกและหน้าหมวด
```

## เพิ่มเครื่องมือใหม่

1. สร้างโฟลเดอร์ใต้หมวด เช่น `funds/ชื่อเครื่องมือ/index.html`
2. ใส่ใน `<head>`:
   ```html
   <script src="../../shared/sources.js"></script>
   <script src="../../shared/nav.js" data-section="funds" data-title="ชื่อเครื่องมือ"></script>
   ```
   ถ้าใช้ไฟล์ Model Performance เพิ่ม `<script src="../../shared/atf-store.js"></script>` แล้วอ่านด้วย `await UTFIT_ATF.get()` (ได้ `{text, name, savedAt}`)
3. เพิ่มปุ่มในหน้าหมวด (`atf/index.html` หรือ `funds/index.html`)

## ตั้งค่า GitHub Pages

Settings → Pages → Source: **Deploy from a branch** → `main` / `/ (root)`
