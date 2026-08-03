# Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur

Web app pencatat siklus haid + kalkulator masa subur adaptif (metode kalender
**Ogino-Knaus**) dengan backend **Google Sheets via Apps Script (GAS) Web App**.

- Lokasi: `MoroalMora/Catatan-Haid/` (top-level folder baru di repo HomeLab)
- Status otomatisasi clasp: **DILEWATI** (clasp tidak terpasang/login di device saat build — setup dilakukan manual, lihat di bawah)

---

## Fitur

1. **Kalkulator kesuburan adaptif (Ogino-Knaus)**
   - Input tanggal mulai siklus baru → POST `addSiklus` → sheet **Siklus**.
   - `PanjangSiklus` dihitung backend = selisih `TanggalMulai` entri ini dengan
     `TanggalMulai` entri sebelumnya.
   - Kalkulasi **hanya jalan kalau histori ≥ 3 entri**; kalau kurang, tampil:
     *"Data belum cukup untuk kalkulasi adaptif — minimal butuh 3 siklus tercatat"*.
   - Rumus (dihitung ulang tiap ada data baru):
     - `shortestCycle` / `longestCycle` dari seluruh histori
     - `fertileStartDay = shortestCycle - 18`
     - `fertileEndDay = longestCycle - 11`
     - Mulai masa subur = `TanggalMulai` siklus TERAKHIR + `(fertileStartDay - 1)` hari
     - Akhir masa subur = `TanggalMulai` siklus TERAKHIR + `(fertileEndDay - 1)` hari
     - Estimasi haid berikutnya = `TanggalMulai` siklus TERAKHIR + rata-rata `PanjangSiklus`
   - Warning **"Siklus tidak stabil, hasil kalkulasi kurang reliable"** muncul
     kalau rentang shortest–longest > 10 hari ATAU `fertileStartDay <= 0`.

2. **Catatan anomali**
   - Form catatan bebas (tanggal + isi) → POST `addCatatan` → sheet **Catatan**.
   - Auto-flag `Anomali=TRUE` (`Sumber=auto`) saat entri siklus disimpan kalau:
     durasi haid (`TanggalSelesai - TanggalMulai`) **> 8 hari**, atau
     `PanjangSiklus` **< 21** atau **> 35 hari**. Tiap flag otomatis membuat
     1 baris catatan deskriptif di sheet **Catatan**.
   - Daftar riwayat catatan tampil terbaru dulu, anomali disorot.

3. **Riwayat siklus + reminder**
   - Bar chart panjang siklus (SVG native, tanpa library chart eksternal —
     dicek: tidak ada pola pemakaian chart library di Work/ lain).
   - Tombol **Set Reminder** pada estimasi *mulai masa subur*, *akhir masa subur*,
     dan *estimasi haid berikutnya* → kirim scheduled push ke **ntfy.sh/reminderme**
     (topic yang sudah ada) pakai header `In: <detik>s`, persis pola
     `Work/Reminder/script.js`. Limit scheduled delivery public ntfy.sh = 3 hari.

4. **Download CSV** — tombol `Siklus.csv` dan `Catatan.csv`, digenerate
   client-side dari data yang sudah difetch (tanpa endpoint CSV khusus).

---

## Struktur

```
MoroalMora/
├── MoroalMora-push.sh        # auto commit & push (pola Work/work-push.sh)
└── Catatan-Haid/
    ├── index.html            # UI (dark theme Tokyo Night, tanpa style.css terpisah)
    ├── script.js             # logika frontend (fetch GAS, ntfy, chart SVG, CSV)
    ├── config.js             # GAS_WEB_APP_URL ← diisi setelah deploy
    ├── README.md             # ini
    └── gas/
        ├── Code.gs           # backend Apps Script (doGet / doPost)
        ├── appsscript.json   # manifest (timeZone Asia/Jakarta, V8)
        └── .clasp.json       # scriptId ← diisi otomatis oleh `clasp create`
```

---

## Setup manual Google Sheets + Apps Script (WAJIB 1x)

> `clasp` **tidak terpasang** di device ini saat project dibuat, jadi otomatisasi
> clasp sengaja dilewati. Lakukan langkah berikut secara manual.

### 1. Install & login clasp

```bash
npm install -g @google/clasp        # butuh Node.js
clasp login                          # OAuth interaktif, buka browser sekali
clasp login --status                 # pastikan "You are logged in"
```

### 2. Buat Sheet + project Apps Script terikat

```bash
cd MoroalMora/Catatan-Haid/gas
clasp create --type sheets --title "Catatan Haid MAO"
```

- `clasp create` membuat **Google Sheet baru** + **Apps Script project terikat**
  sekaligus, dan menimpa `.clasp.json` dengan `scriptId` asli.
- Catat hasilnya di sini:

| Item | Nilai |
|------|-------|
| **Sheet ID** | *(isi setelah `clasp create` — dari URL sheet `docs.google.com/spreadsheets/d/<SHEET_ID>`)* |
| **Script ID** | *(isi setelah `clasp create` — dari `.clasp.json`)* |

### 3. Push kode backend

```bash
clasp push    # mengunggah Code.gs + appsscript.json ke project GAS (aman/reversible)
```

Sheet **Siklus** dan **Catatan** dibuat otomatis oleh `Code.gs` saat Web App
pertama kali dipanggil (fungsi `ensureSheets_()`). Kolom:

- **Siklus**: `ID, TanggalMulai, TanggalSelesai, PanjangSiklus, CatatanSingkat`
- **Catatan**: `ID, Tanggal, Isi, Anomali, Sumber`

### 4. Deploy sebagai Web App (MANUAL — tidak otomatis)

```bash
clasp deploy
```

Di dialog Apps Script (atau lewat `clasp deploy`), pilih/atur versi pertama
dengan **Execute as: Me** dan **Who has access: Anyone** — penting supaya
fetch GET/POST dari browser bisa membaca respons (CORS).

> ⚠️ **Deploy pertama WAJIB manual oleh user** — freebuff tidak menjalankan
> `clasp deploy` otomatis.

### 5. Isi URL ke config.js

Salin URL `/exec` hasil deploy, lalu tempel ke `Catatan-Haid/config.js`:

```js
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/.../exec";
```

Sampai diisi, aplikasi menampilkan banner setup dan tidak fetch apa pun.

### 6. Test end-to-end

- Buka `Catatan-Haid/index.html` di browser (atau file:// / local server).
- Input 3+ siklus → cek kalkulasi masa subur muncul.
- Cek bar chart riwayat, catatan, dan tombol download CSV.
- Coba "Set Reminder" → notif masuk di aplikasi ntfy yang subscribe topic `reminderme`.

---

## Graphify (peta codebase HomeLab)

- Folder `MoroalMora/` sudah didaftarkan di peta root via `graphify update .`
  dari root repo HomeLab (kali ini saja, karena ini folder top-level BARU).
- **Untuk sesi berikutnya**: gunakan `cd MoroalMora && graphify update .`
  (scope root hanya untuk pendaftaran folder baru).

---

## Endpoint Apps Script (`gas/Code.gs`)

| Method | Action | Fungsi |
|--------|--------|--------|
| GET | `getSiklus` | semua histori siklus (urut naik) |
| GET | `getCatatan` | semua catatan (terbaru dulu) |
| GET | `getKalkulasi` | hasil hitung kesuburan real-time |
| POST | `addSiklus` | simpan entri siklus + hitung PanjangSiklus + auto-anomali |
| POST | `updateSiklus` | isi `TanggalSelesai` utk ID tertentu + cek durasi anomali |
| POST | `addCatatan` | simpan catatan manual |

**Trigger**: TIDAK ada `ScriptApp.newTrigger(...)` di `Code.gs` — sesuai desain.
Reminder ditangani client-side via ntfy scheduled push, bukan GAS trigger.

---

## Reminder ntfy

- Topic: **`reminderme`** (sudah ada, jangan buat topic baru).
- Pola pengiriman identik dengan `Work/Reminder/script.js`:
  `POST https://ntfy.sh/reminderme` dengan header `Title: ...` dan
  `In: <detik>s`, body = pesan. Target reminder = tanggal target jam 09:00 lokal.
- Limit scheduled delivery public ntfy.sh = **3 hari** ke depan.

---

## Verifikasi yang sudah dilakukan saat build

- `node --check` lolos untuk `script.js`, `config.js`, dan `gas/Code.gs`.
- Cek manual: semua `action=` yang dipanggil frontend (`getSiklus`,
  `getCatatan`, `getKalkulasi`, `addSiklus`, `updateSiklus`, `addCatatan`)
  punya dispatch yang cocok di `doGet`/`doPost` — tidak ada yang nyasar.
- Rumus kalkulasi dicek sesuai definisi (shortestCycle-18, longestCycle-11).
- Tidak ada `ScriptApp.newTrigger` — status "tidak ada trigger dibuat, sesuai desain".
- `clasp push`: **BELUM dijalankan** (clasp tidak terpasang — manual, lihat di atas).
- `clasp deploy`: **BELUM dijalankan** (wajib manual oleh user).
