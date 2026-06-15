# ระบบบันทึกรับ-ส่งเอกสาร — สมาคมนักศึกษาเก่า มช.

PWA ใช้งานได้ทั้งคอมพิวเตอร์และมือถือ เก็บข้อมูลใน Google Sheets

---

## วิธีติดตั้ง

### 1. อัปโหลดขึ้น GitHub Pages

```bash
# สร้าง repo ใหม่บน GitHub ชื่อ cmu-doctrack
git init
git add .
git commit -m "initial"
git remote add origin https://github.com/YOUR_USERNAME/cmu-doctrack.git
git push -u origin main
```

จากนั้นไปที่ Settings → Pages → Source: main branch → Save

แอพจะอยู่ที่: `https://YOUR_USERNAME.github.io/cmu-doctrack/`

---

### 2. ตั้งค่า Google Apps Script Backend

1. เปิด [Google Sheets](https://sheets.google.com) ใหม่ ตั้งชื่อ **"บันทึกรับ-ส่งเอกสาร"**
2. ไปที่ **Extensions → Apps Script**
3. ลบโค้ดเดิมออก แล้ววางเนื้อหาจากไฟล์ `Code.gs` ทั้งหมด
4. กด **Save** (Ctrl+S)
5. กด **Deploy → New Deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. กด **Deploy** แล้ว **Copy** URL ที่ได้

---

### 3. เชื่อมแอพกับ Google Sheets

1. เปิดแอพ → ไปหน้า **ตั้งค่า**
2. วาง URL ที่ Copy มาในช่อง **Google Apps Script URL**
3. กด **บันทึก URL**
4. กด **ซิงก์ข้อมูล** เพื่อทดสอบ

---

### 4. ติดตั้งบนมือถือ (PWA)

**Android (Chrome):**
เปิด URL → กด ⋮ → "Add to Home screen"

**iPhone (Safari):**
เปิด URL → กด Share → "Add to Home Screen"

---

## โครงสร้างไฟล์

```
cmu-doctrack/
├── index.html        ← หน้าหลักแอพ
├── manifest.json     ← PWA config
├── sw.js             ← Service Worker (offline)
├── css/
│   └── style.css     ← สไตล์ทั้งหมด
├── js/
│   ├── app.js        ← Logic หลัก
│   └── api.js        ← เชื่อมต่อ Google Sheets
└── Code.gs           ← วางใน Google Apps Script
```

---

## ฟีเจอร์

- บันทึกหนังสือรับ / หนังสือส่ง ครบทุกฟิลด์
- เซ็นลายมือบนหน้าจอสำหรับหนังสือส่ง
- แจ้งเตือนเมื่อถึงกำหนดตอบ
- ค้นหาและกรองรายการ
- สถิติรายเดือนและรายประเภท
- Export CSV
- ใช้งาน offline ได้ (เก็บ local)
- ซิงก์กับ Google Sheets เมื่อออนไลน์
- รองรับ Dark Mode อัตโนมัติ
