# Discovery "Rekap" — laporan read-only

- Tanggal: 2026-10-06 · Sumber: isi repo `~/HomeLab/MoroalMora` (branch main), statis saja (tanpa request jaringan, tanpa perubahan file lama).
- Kutipan bertanda `FILE:BARIS` adalah **verbatim** (disalin persis dari filesystem, nomor baris 1-based).
- URL endpoint **di-mask** sebagai `https://script.google.com/macros/s/<MASKED>/exec`. Tidak ada token/isi data sheet di laporan ini.

---

R1 — Backend Menulis/Apps-Script/code.gs.js

### a. Daftar fungsi (543 baris total)

Konstanta (baris): `TZ`(36), `HEADERS`(38), `JENIS_SUMBER`(56), `GUIDE_SHEET`(58), `RESERVED_PREFIX`(59), `TAG_MAX_LEN=100`(60), `LOCK_WAIT_MS=10000`(61), `DAFTAR_SHEET`(64), `DAFTAR_HEADERS`(65), `PERTANYAAN_MAX_LEN=1000`(66), `HARI`(68).

| Baris | Fungsi | Argumen | Tujuan (1 baris) |
|---|---|---|---|
| 75 | `setupSheet()` | – | Sekali manual: buat tab `_Panduan` kalau belum ada (idempoten). |
| 93 | `isEmptySheet_(sh)` | sheet | True bila seluruh sel sheet kosong. |
| 103 | `writeGuide_(sh)` | sheet | Tulis teks panduan baris 1 ke `_Panduan`. |
| 135 | `sanitizeTagName(tag)` | string tag | Rapikan jadi nama tab tag (trim, buang `[ ]*?:/\`, maks 100, tolak awalan `_`). |
| 155 | `hariIndonesia(dateIso)` | 'yyyy-MM-dd' | Nama hari Indonesia (Minggu..Sabtu) via UTC. |
| 164 | `neutralizeCell(v)` | nilai sel | Prefix `'` kalau string diawali `= + - @` (anti-formula). |
| 170 | `parseIso_(s)` | string | Parser ISO date valid kalender, murni UTC; `null` bila invalid. |
| 181 | `isValidIso_(s)` | string | Wrapper `parseIso_ !== null`. |
| 186 | `str_(v)` | nilai apa pun | Coerce ke string ter-trim; null/undefined → `''`. |
| 192 | `findSheet_(ss, name)` | spreadsheet, nama | Cari tab case-insensitive; `null` bila tak ada. |
| 206 | `isDaftarSheetName_(name)` | nama tab | True bila nama == tab reserved "Daftar Pertanyaan". |
| 216 | `getOrCreateTagSheet_(tag)` | nama tag | Cari tab tag, kalau belum ada buat lengkap dengan `HEADERS`. |
| 247 | `getOrCreateDaftarSheet_()` | – | Cari/buat tab "Daftar Pertanyaan" + `DAFTAR_HEADERS`. |
| 272 | `daftarPertanyaan_()` | – | GET-list untuk panel: `[{id,text,created}]`. |
| 294 | `tambahPertanyaan_(payload)` | `{pertanyaan}` | Tambah 1 pertanyaan (UUID + ISO), max 1000 karakter. |
| 332 | `hapusPertanyaan_(payload)` | `{id}` | Hapus baris pertanyaan **berdasarkan ID** (bukan nomor baris). |
| 375 | `ensureTagHeaders_(sh)` | sheet | Lengkapi header kolom baru di tab lama, idempoten. |
| 394 | `doPost(e)` | event | Router POST: daftar/tambah/hapus, atau simpan 1 tulisan ke tab tag. |
| 498 | `daftarTag_()` | – | Nama-nama tab tag (baca-saja), terkecuali tab sistem. |
| 526 | `doGet(e)` | event | Router GET: `daftarTag` atau health check. |
| 540 | `json_(obj)` | objek | Balikkan JSON via ContentService. |

### b. doGet — parameter & bentuk respons

Parameter yang dikenali: **hanya `action`**. Dua cabang + default:

```js
// Menulis/Apps-Script/code.gs.js:526-537
function doGet(e) {
  var action = e && e.parameter ? str_(e.parameter.action) : '';
  if (action === 'daftarTag') {
    try {
      return json_({ ok: true, tags: daftarTag_() });
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) console.error('daftarTag_ error: ' + err);
      return json_({ ok: false, error: 'Gagal memuat daftar tag' });
    }
  }
  return json_({ ok: true, service: 'menulis' });
}
```

Bentuk respons:
- `?action=daftarTag` → `{ok:true, tags:[string,...]}` atau `{ok:false, error:string}`.
- tanpa / action lain → `{ok:true, service:'menulis'}` (health check).
- **Tidak pernah** mengembalikan isi sheet; tidak ada GET untuk membaca baris tulisan.

### c. doPost — action, field payload, bentuk respons

Routing (parse body → whitelist action → default submit harian):

```js
// Menulis/Apps-Script/code.gs.js:394-411
function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '';
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (parseErr) {
      return json_({ ok: false, error: 'Payload bukan JSON valid' });
    }
    if (!payload || typeof payload !== 'object') payload = {};

    // Routing aksi (ADDITIVE): payload tanpa "action" = submit harian,
    // persis seperti perilaku lama. Aksi baru: daftar | tambah | hapus.
    var action = str_(payload.action);
    if (action === 'daftar') return daftarPertanyaan_();
    if (action === 'tambah') return tambahPertanyaan_(payload);
    if (action === 'hapus') return hapusPertanyaan_(payload);
    if (action) return json_({ ok: false, error: 'Aksi tidak dikenal: ' + action });
```

Field payload per cabang:
- **submit harian** (tanpa `action`): wajib `tag`, `q`, `dugaan`, `simpul` (422-427); opsional `dukung`, `runtuh`, `next` (429-431), `date` ('yyyy-MM-dd', 441), `detail`, `jenis`, `link` (434-437; `jenis` harus persis salah satu dari `JENIS_SUMBER`, selain itu dipaksa `''`).
- **`daftar`**: tanpa field → `{ok:true, items:[{id,text,created}]}`.
- **`tambah`**: `pertanyaan` (wajib, trim, ≤1000 karakter).
- **`hapus`**: `id` (wajib).

Bentuk respons: `{ok:true, sheet:string, row:number}` untuk submit; `{ok:true, item:{id,text,created}}` untuk tambah; `{ok:true, id}` untuk hapus; kegagalan `{ok:false, error:string}`.

Penulisan baris (append di bawah, `setValues`, bukan `appendRow`):

```js
// Menulis/Apps-Script/code.gs.js:452-475
    try {
      var sheet = getOrCreateTagSheet_(tag);
      ensureTagHeaders_(sheet); // idempoten: tab lama dapat header kolom baru
      var row = sheet.getLastRow() + 1;
      var values = [[
        neutralizeCell(hari),
        neutralizeCell(tgl),
        neutralizeCell(waktu),
        neutralizeCell(tag),
        neutralizeCell(q),
        neutralizeCell(dugaan),
        neutralizeCell(dukung),
        neutralizeCell(runtuh),
        neutralizeCell(simpul),
        neutralizeCell(next),
        neutralizeCell(detail),
        neutralizeCell(jenis),
        neutralizeCell(link)
      ]];
      sheet.getRange(row, 1, 1, HEADERS.length).setValues(values);
      return json_({ ok: true, sheet: sheet.getName(), row: row });
    } finally {
      lock.releaseLock();
    }
```

### d. Struktur sheet

**Tab khusus:** `_Panduan` (panduan, dibuat `setupSheet()`, jangan diubah), `Daftar Pertanyaan` (tab sistem untuk panel pertanyaan; juga ditolak sebagai nama tag — 418-421), `Sheet1` (tab default, dikecualikan dari daftar tag).

**Penamaan tab per tag:** lookup case-insensitive (`findSheet_`, 192); nama tab dihasilkan `sanitizeTagName()` (135-148): trim + rapikan spasi ganda → buang karakter terlarang nama sheet `[ ] * ? : / \` (139) → maksimum `TAG_MAX_LEN=100` (143) → tolak hasil kosong atau nama berawalan `_` (141-142, 145-146). Kapitalisasi dipertahankan seperti input (pencocokan tab nanti case-insensitive).

**HEADERS kolom 1-13 (verbatim):**

```js
// Menulis/Apps-Script/code.gs.js:38-52
var HEADERS = [
  'Hari',
  'Tanggal',
  'Waktu Simpan',
  'Tag',
  'Pertanyaan',
  'Dugaan Awal',
  'Yang Mendukung',
  'Yang Meruntuhkan',
  'Kesimpulan Sementara',
  'Pertanyaan Berikutnya',
  'Detail',
  'Jenis Sumber',
  'Link'
];
```

Tab `Daftar Pertanyaan` memakai `DAFTAR_HEADERS = ['ID', 'Pertanyaan', 'Dibuat (ISO)']` (65).

**Cara baris ditulis:** `sheet.getRange(row, 1, 1, HEADERS.length).setValues(values)` dengan `row = getLastRow() + 1` (455, 471) — selalu nambah di bawah; **tidak ada `appendRow`** di seluruh file (satu-satunya `deleteRow` ada di `hapusPertanyaan_`, 353).

**ID unik & timestamp:** baris tulisan (tab tag) **TIDAK punya ID unik**; identitas hanya `sheet.getName()` + nomor baris. Timestamp kolom 3 `Waktu Simpan` = `yyyy-MM-dd HH:mm:ss` zona `Asia/Jakarta` (443), kolom 2 `Tanggal` = `yyyy-MM-dd` (441), kolom 1 `Hari` nama hari (442). Hanya tab `Daftar Pertanyaan` yang punya ID unik (`Utilities.getUuid()`, 317).

### e. Membedakan baris Jawab-Pertanyaan vs Catatan-Baca

**Karakteristik payload klien (endpoint sama, tanpa kolom sumber di Jawab-Pertanyaan):**
- `Menulis/Jawab-Pertanyaan/script.js:55` POST `{tag, q, dugaan, dukung, runtuh, simpul, next, date}` — **tanpa** `detail/jenis/link`, jadi kolom 11-13 selalu `''`.
- `Menulis/Catatan-Baca/script.js:187-192` POST `{tag, q:<judul>, detail, jenis:<label whitelist>, link, dugaan, dukung, runtuh, simpul, next, date}` (field `jenis` memakai label `JENIS[jenisId].nama`, bukan id).

| Sinyal di baris | Jawab-Pertanyaan | Catatan-Baca |
|---|---|---|
| Kolom 12 `Jenis Sumber` | **selalu `''`** (tidak dikirim) | label whitelist: `Buku`/`Media sosial`/`Podcast`/`Video`/`Lainnya` |
| Kolom 11 `Detail` / 13 `Link` | `''` | bisa terisi (Detail opsional; Link opsional) |
| Kolom 5 `Pertanyaan` (q) | teks pertanyaan bebas | judul tulisan (tanpa ", hlm. …") |
| Kolom 10 `Pertanyaan Berikutnya` | sering terisi (loop harian) | isi bebas dari field "Pertanyaan yang muncul" (boleh kosong) |
| Baris LAMA tanpa `Jenis Sumber` | ya, semua baris Jawab-Pertanyaan | ya, catatan yang disimpan sebelum fitur jenis |

**Kesimpulan:** satu-satunya pembeda andal untuk baris baru adalah `Jenis Sumber != ''`. Baris Jawab-Pertanyaan dan baris Catatan-Baca LAMA **tidak bisa dibedakan secara struktural** (keduanya kolom 11-13 kosong); pembedanya hanya heuristik isi `q`.

### f. Aksi hapus/edit yang sudah ada

- **Edit: TIDAK ADA** untuk apa pun (tidak ada aksi `update`/`edit` di `doPost`; fungsi update di file ini tidak ada).
- **Hapus: hanya `hapus`** untuk tab `Daftar Pertanyaan`, identifikasi **pakai ID UUID** (bukan nomor baris):

```js
// Menulis/Apps-Script/code.gs.js:346-358
    try {
      var sh = getOrCreateDaftarSheet_();
      var last = sh.getLastRow();
      if (last >= 2) {
        var ids = sh.getRange(2, 1, last - 1, 1).getValues();
        for (var i = 0; i < ids.length; i++) {
          if (str_(ids[i][0]) === id) {
            sh.deleteRow(i + 2);
            return json_({ ok: true, id: id });
          }
        }
      }
      return json_({ ok: false, error: 'Pertanyaan tidak ditemukan.' });
```

Nomor baris **bisa bergeser**: `sh.deleteRow(i + 2)` menggeser semua baris di bawahnya. Aman karena ID di-scan ulang tiap kali; yang jadi masalah adalah nilai `row` yang pernah dikembalikan `doPost` (472) — kalau disimpan pihak mana pun, nilai itu jadi basi setelah ada hapus di atasnya. Baris tulisan di tab tag sendiri **tidak pernah dihapus/diedit** oleh backend, jadi nomor barisnya stabil selama tidak ada intervensi manual.

### g. Batasan (trim/limit/sanitasi/caching/lock)

`str_()` (dipakai untuk SEMUA field payload) — verbatim:

```js
// Menulis/Apps-Script/code.gs.js:185-189
/** Coerce value menjadi string ter-trim; null/undefined -> ''. */
function str_(v) {
  if (v === null || typeof v === 'undefined') return '';
  return String(v).replace(/^\s+|\s+$/g, '');
}
```

Sanitasi formula dipisah dari `str_`, hanya saat menulis sel:

```js
// Menulis/Apps-Script/code.gs.js:164-167
function neutralizeCell(v) {
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}
```

- **Limit panjang:** `TAG_MAX_LEN=100` (nama tab), `PERTANYAAN_MAX_LEN=1000` (hanya aksi `tambah`). **Field `q/dugaan/dukung/runtuh/simpul/next/detail/link` TIDAK ada batas karakter** → rawan error 50.000 karakter sel Google Sheets (lihat R8).
- **Trim:** ya, semua lewat `str_` (ujung saja; spasi ganda di tengah dibiarkan).
- **Caching:** **tidak ada** (`CacheService` tidak muncul di file — dicek dengan rg, 0 match).
- **Lock:** ada. `doPost` dan `tambah`/`hapus` memakai `LockService.getScriptLock()` + `waitLock(LOCK_WAIT_MS=10000)` (445-450, 304-310, 339-344); kalau kunci gagal → `{ok:false, error:'Sedang ada proses simpan lain…'}`. `doGet`/`daftarTag_` tanpa lock (baca-saja).

---

R2 — Pola Read/Edit dari Read-Dashboard

Backend terpisah (sheet tab `Dokumen`, kolom `["id","judul","isi","tipe","dibuat","diubah"]`, code.gs.js:36-38), kontrak `{ok:true,data:…}` / `{ok:false,error:…}`.

**`findRow_` — cari baris by ID UUID (bukan nomor baris):**

```js
// Read-Dashboard/Apps-Script/code.gs.js:201-212
function findRow_(sheet, id) {
  var last = sheet.getLastRow();
  if (last >= 2) {
    var values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
    for (var i = 0; i < values.length; i++) {
      if (str_(values[i][COL.ID - 1]) === id) {
        return { row: i + 2, values: values[i] };
      }
    }
  }
  throw new Error("Dokumen tidak ditemukan (id: " + id + ").");
}
```

**`getDoc_` — baca satu dokumen:**

```js
// Read-Dashboard/Apps-Script/code.gs.js:377-391
function getDoc_(id) {
  var docId = str_(id);
  if (!docId) throw new Error("Parameter id wajib diisi.");
  var sheet = ensureSheet_();
  var found = findRow_(sheet, docId);
  var r = found.values;
  return {
    id: str_(r[COL.ID - 1]),
    judul: str_(r[COL.JUDUL - 1]),
    isi: str_(r[COL.ISI - 1]),
    tipe: str_(r[COL.TIPE - 1]),
    dibuat: str_(r[COL.DIBUAT - 1]),
    diubah: str_(r[COL.DIUBAH - 1])
  };
}
```

**`updateDoc_` — tulis ulang judul+isi + timestamp `diubah`:**

```js
// Read-Dashboard/Apps-Script/code.gs.js:414-430
function updateDoc_(payload) {
  var id = str_(payload.id);
  if (!id) throw new Error("Parameter id wajib diisi.");
  var v = validateContent_(payload.judul, payload.isi);

  return withLock_(function () {
    var sheet = ensureSheet_();
    var found = findRow_(sheet, id);
    var ts = nowIso_();

    // Kolom tipe & dibuat tidak diubah.
    sheet.getRange(found.row, COL.JUDUL, 1, 2).setValues([[v.judul, v.isi]]);
    sheet.getRange(found.row, COL.DIUBAH, 1, 1).setValues([[ts]]);

    return { id: id, judul: v.judul, diubah: ts };
  });
}
```

Pembantu yang dipakainya:

```js
// Read-Dashboard/Apps-Script/code.gs.js:215-229
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  var got = false;
  try {
    got = lock.tryLock(LOCK_TIMEOUT_MS);
    if (!got) {
      throw new Error(
        "Server sedang sibuk (gagal mendapat kunci tulis). Coba lagi sebentar."
      );
    }
    return fn();
  } finally {
    if (got) lock.releaseLock();
  }
}
```

- `ensureSheet_()` (140-165): buat tab + header bila belum ada; **menyetel seluruh kolom ke format teks `"@"`** (`sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).setNumberFormat("@");`, baris 163) — inilah penahan formula (beda dengan `neutralizeCell` di Menulis).
- `createDoc_()` (393-412): `id = Utilities.getUuid()`, `dibuat`/`diubah` = ISO UTC; append di `getLastRow()+1`.
- `deleteDoc_()` (432-443): hapus by `findRow_(id)`.
- `validateContent_()` (446-465): judul wajib, `MAX_JUDUL=200`, `MAX_ISI=45000` (sengaja di bawah 50.000 — komentar baris 31-32).
- `readRows_()` (175-198) mengembalikan `row: i + 2` per baris, `listDocs_()` (233-250) hanya ringkasan + `preview_()` 200 karakter, urut `diubah` terbaru dulu.

**api.js (dipakai ketiga halaman):**

```js
// Read-Dashboard/api.js:39-48
  function withQuery(url, params) {
    var parts = [];
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null) return;
      parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(value)));
    });
    if (parts.length === 0) return url;
    return url + (url.indexOf("?") === -1 ? "?" : "&") + parts.join("&");
  }
```

```js
// Read-Dashboard/api.js:51-87
  async function fetchText(url, options) {
    if (!isConfigured()) throw new Error(SETUP_MESSAGE);

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = null;
    if (controller) {
      options = options || {};
      options.signal = controller.signal;
      timer = setTimeout(function () {
        controller.abort();
      }, TIMEOUT_MS);
    }

    var res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new Error(
          "Permintaan melebihi waktu tunggu " +
            Math.round(TIMEOUT_MS / 1000) +
            " detik. Periksa koneksi internet atau APPS_SCRIPT_URL."
        );
      }
      throw new Error(
        "Gagal menghubungi server: " + ((err && err.message) || String(err))
      );
    } finally {
      if (timer) clearTimeout(timer);
    }

    try {
      return await res.text();
    } catch (err) {
      throw new Error("Gagal membaca respons server.");
    }
  }
```

```js
// Read-Dashboard/api.js:90-115
  function unwrap(text) {
    var raw = text === null || text === undefined ? "" : String(text).trim();
    var json = null;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      json = null;
    }

    if (!json || typeof json !== "object") {
      // Apps Script sering mengirim halaman HTML (error 500, login, dsb).
      if (/^\s*<(!doctype|html)/i.test(raw)) {
        throw new Error(
          "Server mengirim halaman HTML, bukan JSON. Pastikan APPS_SCRIPT_URL " +
            "benar dan Web app di-deploy dengan Execute as: Me, Access: Anyone."
        );
      }
      throw new Error("Respons server bukan JSON yang valid.");
    }

    if (json.ok === true) return json.data;
    if (json.ok === false) {
      throw new Error(json.error || "Permintaan gagal tanpa keterangan dari server.");
    }
    throw new Error("Respons server tidak sesuai kontrak (field ok tidak ada).");
  }
```

API publik: `window.ReadDashAPI = {isConfigured, list, get, search, create, update, remove}` (131-169). POST sengaja **tanpa** `Content-Type` kustom agar lolos CORS simple-request (lihat komentar di kepala `api.js`, baris 9-17).

**ID antar halaman:** lewat **query param `?id=`** (bukan hash):
- `read.js:20-21` `new URLSearchParams(window.location.search)` → `params.get("id")`.
- Read → Edit: `read.js:71` `editBtn.href = "../Edit/index.html?id=" + encodeURIComponent(String(doc.id || ""));`
- Edit → Read (setelah simpan): `edit.js:187` `window.location.href = "../Read/index.html?id=" + encodeURIComponent(docId);`
- Index → Read/Edit: `script.js:171-172` `"Read/index.html?id=" + …` / `"Edit/index.html?id=" + …`.

**Kerangka Read/index.html** — toolbar + tiga blok state (`#state-loading`, `#state-error` dengan `#error-msg` + `#retry-btn`, `#state-setup` dengan `#setup-msg`; baris 22-31) + `article#doc-view`:

```html
<!-- Read-Dashboard/Read/index.html:15-19,33-40 -->
    <nav class="toolbar" aria-label="Navigasi dokumen">
      <a class="btn btn-ghost" href="../index.html">&larr; Kembali</a>
      <span class="spacer"></span>
      <a id="edit-btn" class="btn" href="../index.html">Edit</a>
    </nav>
      <article id="doc-view" hidden>
        <h1 id="doc-title" class="reader-title"></h1>
        <div class="reader-meta">
          <time id="doc-date"></time>
          <span id="doc-tipe" class="badge"></span>
        </div>
        <div id="doc-body" class="prose"></div>
      </article>
```

**Kerangka Edit/index.html** — toolbar `<nav class="toolbar">` berisi `Batal` + `#save-btn` `btn-primary` (baris 15-21), lalu form (`#edit-form`, `novalidate`, `hidden` sampai data siap). Tag/tipe dikunci (hanya ditampilkan), yang bisa diedit judul + isi:

```html
<!-- Read-Dashboard/Edit/index.html:34-53 -->
    <form id="edit-form" class="edit-form" novalidate hidden>
      <div class="field">
        <label for="edit-judul">Judul</label>
        <input
          id="edit-judul"
          type="text"
          maxlength="200"
          autocomplete="off"
        />
      </div>

      <p class="edit-tipe-line">
        Tipe (tidak bisa diubah):
        <span id="edit-tipe" class="badge">-</span>
      </p>

      <div class="field field-grow">
        <label for="edit-isi">Isi</label>
        <textarea id="edit-isi" spellcheck="false"></textarea>
      </div>
```

**Path relatif dari subfolder:** `Read/index.html` memuat `../config.js` (43), `../api.js` (50), `read.js` (51), `../style.css` + `read.css`; `Edit/index.html` memuat `../config.js` (62), `../api.js` (63), `edit.js` (64). Keduanya menambah `<meta name="theme-color" content="#000000" />` (baris 9).

**Konflik edit:** **TIDAK ada.** Tidak ada field versi/ETag/`updatedAt` yang dicek sebelum tulis; `updateDoc_` menimpa `judul+isi` apa pun kondisi server (last-write-wins). `diubah` hanya ditulis, tidak pernah dibandingkan. `edit.js` punya proteksi lokal saja: draf per id di sessionStorage (`read-dashboard:draft:<id>`, baris 22) dan `beforeunload` kalau `isDirty()` (215-223).

---

R3 — Jawab-Pertanyaan

**Struktur DOM area daftar pertanyaan** (`Menulis/Jawab-Pertanyaan/index.html:32-47`; panel adalah anak pertama `.grid` — CSS `.panel{order:-1}` menaruhnya di atas form pada layar sempit, kolom kanan sticky pada ≥1024px):

- `<section class="panel" id="dp-panel" aria-labelledby="dp-title">` → `.panel-head` berisi `<h2 id="dp-title">Daftar Pertanyaan</h2>` + tombol `#dp-toggle` (`aria-expanded="true"`, `aria-controls="dp-body"`, teks `−`).
- `.panel-body` `#dp-body` → label + `.dp-add` (`<input id="dp-input">` + `<button id="dp-add">Tambah</button>`) + `<p id="dp-status" class="dp-status" role="status" aria-live="polite">` + `<ul id="dp-list" class="dp-list" aria-label="Daftar pertanyaan tersimpan">` + `<p id="dp-empty" class="dp-empty" hidden>Belum ada pertanyaan</p>`.
- Class per item (dibuat `itemNode`): `dp-item, dp-text, dp-acts, dp-salin, dp-hapus`; state menyusut = class `min` di `#dp-panel`.

**Alur `muat()` → render daftar** (dipanggil **sekali saat init**, baris 242):

```js
// Menulis/Jawab-Pertanyaan/script.js:200-215
  function muat(){
    empty.hidden=true;
    show('Memuat daftar...');
    post({action:'daftar'})
      .then(function(res){
        if(res&&res.ok&&res.items){
          while(list.firstChild)list.removeChild(list.firstChild);
          for(var i=0;i<res.items.length;i++)list.appendChild(itemNode(res.items[i]));
          show('');
          setEmpty(res.items.length);
        }else{
          show('Gagal memuat: '+((res&&res.error)||'respons server tidak dikenal'),true);
        }
      })
      .catch(function(){show('Gagal memuat daftar. Periksa jaringan, lalu muat ulang halaman.',true)});
  }
```

`itemNode(it)` (103-121) membangun `<li class="dp-item" data-id=…>` berisi `<span class="dp-text">` (textContent, aman XSS) + `<div class="dp-acts">` dengan tombol `dp-salin` dan `dp-hapus`.

`onHapus(btn,li)` (155-175): baca `data-id` → `window.confirm` → `post({action:'hapus',id:id})` → hapus `<li>` dari DOM; kalau gagal tombol diaktifkan lagi. (Kutipan lengkap ada di R1f untuk sisi server; sisi klien identik pola POST-nya.)

`applyMin(min)` (217-223) menyetur `class="min"`, `aria-expanded`, teks tombol `+ / −`, lalu `sput(PK,min)` ke sessionStorage (kunci `hh:dp`).

**Init panel** — daftar selalu dimuat walau panel menyusut:

```js
// Menulis/Jawab-Pertanyaan/script.js:225-245
  try{
    if(!panel||!toggle||!input||!addBtn||!status||!list||!empty)return;
    applyMin(sget(PK,false)===true);
    toggle.addEventListener('click',function(){applyMin(!panel.classList.contains('min'))});
    addBtn.addEventListener('click',tambah);
    input.addEventListener('keydown',function(ev){
      if(ev.key==='Enter'||ev.keyCode===13){ev.preventDefault();tambah()}
    });
    list.addEventListener('click',function(ev){
      var t=ev.target;
      while(t&&t!==list&&t.tagName!=='BUTTON')t=t.parentNode;
      if(!t||t===list||t.tagName!=='BUTTON')return;
      var li=t.parentNode&&t.parentNode.parentNode;
      if(!li||li.tagName!=='LI')return;
      if(t.className==='dp-salin')onSalin(t,li);
      else if(t.className==='dp-hapus')onHapus(t,li);
    });
    muat();
  }catch(err){
    if(typeof console!=='undefined'&&console.error)console.error('panel daftar pertanyaan: '+err);
  }
```

**State default saat halaman dibuka:**
- Panel **terbuka** (`aria-expanded="true"` di HTML; `applyMin(sget(PK,false)===true)` → false saat sesi belum pernah menyusutkan).
- Daftar kosong lalu terisi oleh `muat()` (POST `action:'daftar'`); `#dp-empty` dikendalikan `setEmpty(n)`.
- Form harian: draf sessionStorage `hh:draft` dipulihkan (31-32), kalau tidak ada → `hh:next` mengisi `#q` (33), tag diambil dari entri terakhir `hh:entries` (34-36). Kunci: `var K={e:'hh:entries',d:'hh:draft',n:'hh:next'}` (7), panel: `PK='hh:dp'` (89).
- `grow(t)` (16): textarea auto-height `Math.max(72, scrollHeight+2)`; dipanggil dari `fill()` dan listener `input` (38) — dipakai untuk `#q,#dugaan,#dukung,#runtuh,#simpul,#next` (array `F`, baris 5).

**Cara load config.js: TIDAK DIMUAT.** `index.html:50` hanya `<script src="script.js" defer></script>`; `ENDPOINT` di-hardcode di `script.js:3` (`https://script.google.com/macros/s/<MASKED>/exec`). Ini berbeda dengan Catatan-Baca (lihat R6).

---

R4 — Catatan-Baca (penampil catatan)

**`render()` daftar catatan (verbatim):**

```js
// Menulis/Catatan-Baca/script.js:300-349
      function render() {
        listBox.textContent = '';
        if (!items.length) {
          listBox.appendChild(el('p', 'empty', 'Belum ada catatan. Saat kamu menemukan sesuatu yang bikin berhenti membaca, tulis di form ini.'));
          return;
        }
        items.slice().reverse().forEach(function (it) {
          var d = el('article', 'entry');
          var m = el('div', 'meta');
          // Catatan lama tanpa jenis dianggap "Buku" (Detail lama = halaman).
          var jenisKey = (it.jenis && JENIS[it.jenis]) ? it.jenis : 'buku';
          m.appendChild(el('span', 'jenis', JENIS[jenisKey].nama));
          m.appendChild(el('span', null, it.buku));
          var det = trim_(it.hal);
          if (det) m.appendChild(el('span', null, det));
          var link = trim_(it.link);
          if (link) {
            if (/^https?:\/\//i.test(link)) {
              var a = document.createElement('a');
              a.href = link;
              a.textContent = link;
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              m.appendChild(a);
            } else {
              m.appendChild(el('span', null, link));
            }
          }
          if (it.topik) m.appendChild(el('span', 'tag', it.topik));
          m.appendChild(el('span', null, new Date(it.ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })));
          var b = el('button', 'ghost', 'Hapus'); b.type = 'button';
          b.addEventListener('click', function () {
            if (!b.dataset.sure) {
              b.dataset.sure = '1'; b.textContent = 'Yakin hapus?'; b.className = 'ghost warn';
              setTimeout(function () { b.dataset.sure = ''; b.textContent = 'Hapus'; b.className = 'ghost'; }, 3000);
              return;
            }
            items = items.filter(function (x) { return x.id !== it.id; });
            store(KEY, items);
            render();
          });
          m.appendChild(b);
          d.appendChild(m);
          field(d, 'Yang kutemukan', it.temuan);
          field(d, 'Reaksiku' + (it.reaksi ? ' (' + it.reaksi.toLowerCase() + ')' : ''), it.alasan);
          field(d, 'Nyambung ke', it.hubungan);
          field(d, 'Pertanyaan yang muncul', it.tanya);
          listBox.appendChild(d);
        });
      }
```

Pembantu `field()` (292-298) me-render `<p><span class="k">Label</span>teks</p>` (textContent/`createTextNode`, aman XSS), dan dilewati bila kosong.

**Ditampilkan per item:** tag jenis (pil `.jenis`), judul (`buku`), detail (`hal`), link (anchor `http(s)` saja / teks biasa), tag topik, tanggal (`ts` lokal), lalu empat blok teks penuh: `Yang kutemukan`, `Reaksiku (…)`, `Nyambung ke`, `Pertanyaan yang muncul`. **Tidak ada pemotongan/truncation** — `field()` mengirim teks apa adanya dan `.entry p{white-space:pre-wrap}` (style.css:87) mempertahankan baris.

**Interaksi:** hanya (1) tombol **Hapus** dengan konfirmasi 2 langkah (`Yakin hapus?`, jendela 3 detik) yang menyimpan ulang ke localStorage — hapus **lokal saja, tidak memanggil server**; (2) klik link membuka tab baru (`target="_blank"` + `rel="noopener noreferrer"`). **Tidak ada klik-kartu/expand** — semua isi selalu terbuka.

**Sumber datanya: BUKAN dari server.** Daftar dibaca dari localStorage sekali saat init (`var items = load(KEY, [])`, 290; kunci `KEY='catatan-baca-v1'`, 240). Satu-satunya request GET di halaman ini hanya untuk saran tag: `fetch(url + '?action=daftarTag')` (`loadTags()`, 453-468). Simpan memakai POST body `{tag,q,detail,jenis,link,dugaan,dukung,runtuh,simpul,next,date}` (491) dan menaruh salinan lokal juga (499).

**Class CSS terkait** (Catatan-Baca/style.css): `.entry` (79-80), `.entry:first-of-type`, `.meta` flex-wrap (81), `.meta>span` (82), `.meta .tag` topik (83), `.meta .jenis` pil jenis (85), `.meta a` (86-88), `.entry p` pre-wrap (89), `.k` label (90), `.empty` (91), `.ghost`/`.ghost.warn` tombol hapus (73-75).

---

R5 — Tema

**`:root` (token) — JAWAB: identik persis** (diverifikasi `diff`: Jawab-Pertanyaan baris 2-15 == Catatan-Baca baris 8-21, tanpa beda satu pun):

```css
/* Menulis/Jawab-Pertanyaan/style.css:2-15  ==  Menulis/Catatan-Baca/style.css:8-21 */
:root{
  color-scheme:dark;
  --bg:#000;
  --ink:#e9e6df;
  --muted:#7d7a74;
  --line:#1c1c1c;
  --field:#070707;
  --accent:#9db8ff;
  --serif:"Newsreader",Georgia,"Times New Roman",serif;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  box-sizing:border-box;
  padding-top:env(safe-area-inset-top,0px);
  padding-bottom:env(safe-area-inset-bottom,0px);
}
```

**Font & meta (kedua halaman Menulis):** sama — Google Fonts `Newsreader` (400/500/400-italic) di `<head>`, `body{font-family:var(--serif);font-size:19px;line-height:1.6}` identik, viewport `width=device-width, initial-scale=1, viewport-fit=cover` (baris 5 masing-masing). **Keduanya TIDAK punya `<meta name="theme-color">`** — itu hanya ada di Read-Dashboard (`Read/index.html:9`, `Edit/index.html:9`, `content="#000000"`).

**Pola komponen dasar:**

- **Tombol — identik** di dua file:
  `button{font-family:var(--sans);font-size:16px;font-weight:500;background:var(--accent);color:#000;border:0;border-radius:6px;padding:12px 22px;cursor:pointer}` + `button:hover{filter:brightness(1.1)}` + `button:focus-visible{outline:2px solid var(--ink);outline-offset:3px}` (Jawab 30-32, Catatan 62-64; diff = identik).
- **Header (hanya Jawab):** `header{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:12px 24px;margin-bottom:8px}` (19) + input tag bergaris bawah `.tag input{width:150px;background:transparent;border:0;border-bottom:1px solid var(--line);color:var(--accent);…}` (21). Catatan-Baca memakai `.wrap` grid dua kolom `minmax(0,560px) minmax(0,1fr)` (25) tanpa `<header>`/`.tag`.
- **Kartu:** Jawab `.dp-item{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:6px;background:var(--bg)}` (64); Catatan `.entry{border-top:1px solid var(--line);padding:20px 0}` (79-80) — kartu bergaya beda (panel vs baris bertumpuk), token warna sama.
- **Chip:** hanya **Catatan-Baca** (`.chips` flex-wrap, radio tersembunyi, span jadi pil; style.css 49-59) — dipakai untuk chip Sumber & Reaksiku. Jawab-Pertanyaan **tidak punya chip** (memakai input tag + datalist `#tags`).
- **Input/textarea — beda:** Jawab hanya `textarea{width:100%;min-height:72px;resize:none;overflow:hidden;…}` (23) dan `.tag input`; Catatan memakai `input[type=text],input[type=url],textarea{width:100%;min-width:0;…}` (44) dengan `textarea{resize:vertical;min-height:96px;overflow-wrap:anywhere}` (45) — ada dukungan `input[type=url]` dan label `.l/.h` (41-43).
- **.bar — beda:** Jawab `gap:20px` tanpa `justify-content` (28); Catatan `justify-content:space-between;gap:12px 16px` (61).
- **.hint/.dot — beda tipis:** margin bawah 40px vs 12px + `overflow-wrap:anywhere` (Jawab 24 vs Catatan 70); `.dot` Catatan menambah `flex-shrink:0` (74 vs 25).

**Kesimpulan:** token desain (`:root`), tipografi body, aturan tombol, dan breakpoint `@media(max-width:520px)` **identik**; yang beda adalah **layout & komponen** (grid `.wrap` vs `main` tunggal; chips vs input tag; `.dp-item` vs `.entry`; rule `.bar`, `.hint`, `.dot`, textarea). Catatan-Baca menyebut sumbernya di komentar kepala file (style.css:1-6): "Token warna, tipografi & pola kelas diambil dari Menulis/Jawab-Pertanyaan/style.css".

---

R6 — config.js & path

| Halaman | Global yang dipakai | Cara dimuat (script tag) | Nilai endpoint |
|---|---|---|---|
| `Menulis/Catatan-Baca/index.html` | `var ENDPOINT` | baris 56 `<script src="../config.js" defer>`, baris 57 `<script src="script.js" defer>` | `Menulis/config.js:17` → `https://script.google.com/macros/s/<MASKED>/exec` |
| `Menulis/Jawab-Pertanyaan/index.html` | `var ENDPOINT` | baris 50 `<script src="script.js" defer>` — **config.js TIDAK dimuat** | hardcode di `Jawab-Pertanyaan/script.js:3` → `https://script.google.com/macros/s/<MASKED>/exec` |
| `Read-Dashboard/index.html` | `window.READ_DASHBOARD_CONFIG` | 150 `config.js`, 151 `api.js`, 152 `script.js` (tanpa `../`, karena config di folder yang sama) | `Read-Dashboard/config.js:8` → `https://script.google.com/macros/s/<MASKED>/exec` |
| `Read-Dashboard/Read/index.html` | idem | 43 `../config.js`, 50 `../api.js`, 51 `read.js` | idem (satu config untuk 3 halaman) |
| `Read-Dashboard/Edit/index.html` | idem | 62 `../config.js`, 63 `../api.js`, 64 `edit.js` | idem |

Catatan: `Menulis/config.js:9-11` menyatakan nilainya disalin dari ENDPOINT Jawab-Pertanyaan dan "File Jawab-Pertanyaan TIDAK diubah dari sini" — jadi ada **dua salinan URL yang bisa menyebar** (config.js dan script.js Jawab-Pertanyaan). `api.js` membaca konfig lewat `function endpoint(){ var cfg = window.READ_DASHBOARD_CONFIG || {}; return String(cfg.APPS_SCRIPT_URL || "").trim(); }` (30-33).

**Path relatif yang BENAR ke `Menulis/config.js` untuk halaman Rekap yang akan datang:**

| Halaman baru | `<script>` ke config | ke style/script lokal |
|---|---|---|
| `Menulis/Rekap/index.html` | `../config.js` | `style.css`, `script.js` (satu folder) |
| `Menulis/Rekap/Baca/index.html` | `../../config.js` | `../style.css`, `baca.js` (atau pola serupa) |
| `Menulis/Rekap/Baca/Edit/index.html` | `../../../config.js` | `../../style.css`, `edit.js` |

(Pola yang sudah jalan: Read-Dashboard root = `config.js`, subfolder 1 = `../config.js`, dan Edit/Baca dua tingkat di bawah root Read-Dashboard juga `../config.js` karena config-nya di root folder Read-Dashboard — milik Rekap yang kedalaman folder-nya lebih dalam harus naik 1/2/3 level.)

---

R7 — Hosting & navigasi

**Cara di-serve (dari isi repo):**
- Repo git: `origin git@github.com:moroxixi/MoroalMora.git` (dicek `git remote -v`), branch main, commit terakhir `213c9f8 auto: 2026-10-06 22:07`.
- **Tidak ada** `.github/`, `CNAME`, workflow CI, atau README di root (dicek: hanya `Catatan-Haid/README.md`). Jadi **tidak ada konfigurasi GitHub Pages/CI di repo** — halaman berupa HTML statis dengan path relatif yang diasumsikan disajikan dari mana saja (server statis lokal/atau hosting di luar repo).
- Ada pola server lokal: `Kisah/server.py` ("Editor lokal content.json untuk folder Kisah/", Python stdlib, `python3 server.py` lalu buka `127.0.0.1:<port>`).
- Perubahan dikirim lewat `MoroalMora-push.sh` (graphify update → manifest → gen-folder-tree → `git commit` + `git push`); tidak ada proses build/bundle untuk aset web.

**Halaman hub/navigasi Menulis: TIDAK ADA.**
- `Menulis/Jawab-Pertanyaan/index.html` dan `Menulis/Catatan-Baca/index.html` **tidak punya satu pun `<a href>` ke halaman lain** (rg `href=` di kedua file hanya menemukan stylesheet/font) — keduanya berdiri sendiri, tidak saling menautkan, dan tidak tertaut dari halaman mana pun di repo (rg `Menulis/|Jawab-Pertanyaan|Catatan-Baca` di luar folder itu sendiri hanya menemukan komentar di `Menulis/config.js`).
- Read-Dashboard juga tanpa hub: `Read-Dashboard/index.html` hanya memuat `config.js/api.js/script.js` (150-152) tanpa `<a>`; navigasi ke Read/Edit dibangun JS (`script.js:171-172` `readHref = "Read/index.html?id="`, `editHref = "Edit/index.html?id="`). Halaman anak punya tombol statis kembali: `Read/index.html:16` `href="../index.html"` dan `Edit/index.html:16` `href="../index.html"`, plus `#edit-btn` yang href-nya diset JS (read.js:71).

Implikasi untuk Rekap: akan jadi halaman pertama di `Menulis/` yang mungkin butuh titik masuk bersama — saat ini belum ada hub yang bisa dipakai ulang.

---

R8 — Temuan & risiko

**Risiko untuk Rekap / Baca / Edit**

1. **Tidak ada API baca isi sama sekali di backend Menulis.** `doGet` hanya `daftarTag` (baca nama tab) — tidak ada `action=list/get` untuk membaca baris tulisan. Rekap (daftar preview), Baca, dan Edit **wajib menambah aksi GET baru** di `Menulis/Apps-Script/code.gs.js` (dan deploy ulang). Ini gap terbesar.
2. **Tidak ada ID unik untuk baris tulisan.** Identitas baris = nomor baris (`row = getLastRow()+1`, dikembalikan di respons 472 tapi tidak disimpan klien). Begitu ada hapus/manual edit di atasnya, nomor baris bergeser → halaman Baca/Edit **tidak boleh** memakai nomor baris sebagai kunci; perlu kolom ID (pola `Utilities.getUuid()` seperti `createDoc_`, Read-Dashboard:400) atau kunci gabungan (tab + Waktu Simpan + isi), keduanya butuh perubahan backend.
3. **Pembeda sumber rapuh.** Satu-satunya tanda baris dari Catatan-Baca adalah kolom `Jenis Sumber` terisi (R1e). Baris Jawab-Pertanyaan dan **baris Catatan-Baca LAMA** sama-sama kosong di kolom 11-13 → filter "sumber" di Rekap akan salah mengelompokkan catatan lama kecuali memakai heuristik `q` (pertanyaan vs judul).
4. **Tidak ada aksi edit/hapus untuk baris tulisan.** `doPost` hanya `daftar|tambah|hapus` (hapus pun hanya untuk tab Daftar Pertanyaan, by ID). Halaman `Rekap/Baca/Edit` butuh aksi `update` baru; kalau "tag dikunci, hanya isi yang boleh diedit", backend harus menulis ulang hanya kolom tertentu (baris Read-Dashboard `updateDoc_` adalah acuannya: tulis kolom target + `diubah`, cari by ID).
5. **Batas 50.000 karakter/sel.** Field tulisan (`q/dugaan/simpul/...`) **tanpa limit panjang** (R1g) — mengedit/menyimpan isi besar bisa gagal diam-diam di Sheets. Read-Dashboard sengaja membatasi `MAX_ISI=45000` (code.gs.js:31-32) dan `MAX_JUDUL=200`; kalau Rekap menampilkan/menggabungkan isi, batas yang sama perlu ditambahkan di backend Menulis.
6. **Dua backend / dua spreadsheet terpisah.** Menulis (tab per tag) dan Read-Dashboard (tab `Dokumen`) adalah proyek Apps Script & sheet berbeda dengan skema berbeda. Kalau Rekap mau membaca keduanya, ia memanggil dua endpoint berbeda (dua config) atau butuh migrasi — tidak ada jembatan di kode.
7. **Tab lama dengan header berbeda.** `ensureTagHeaders_()` melengkapi kolom kosong, tetapi **melewati sel header yang sudah berisi teks lain** (384-385, "jangan ditimpa") → tab yang pernah diedit manual bisa punya header tidak cocok di 11-13; pembaca berbasis indeks kolom tetap aman, pembaca berbasis nama bisa bingung. `ensureTagHeaders_` hanya dipanggil di `doPost` — aksi GET baru yang membaca tab harus siap membaca tanpa header lengkap.
8. **Tab `Daftar Pertanyaan` dan `_Panduan`/`Sheet1` harus dikecualikan** dari daftar sumber tulisan (sudah dikecualikan di `daftarTag_`, 515-518); `Sheet1` hanya dikecualikan berdasarkan nama persis.
9. **Menjaga konsistensi dua salinan URL.** `Menulis/config.js` vs hardcode `Jawab-Pertanyaan/script.js:3` — kalau endpoint berubah, Rekap yang hanya membaca config.js bisa tidak sinkron dengan halaman Jawab-Pertanyaan.
10. **Sumber daftar catatan berbeda-beda.** Panel Catatan-Baca menampilkan data **localStorage** (`catatan-baca-v1`, R4), bukan isi sheet — Rekap yang membaca sheet akan menampilkan kumpulan yang berbeda dari yang terlihat di Catatan-Baca (bukan bug, tapi ekspektasi perlu dikelola).
11. **Konflik edit tidak tertangani** (R2): pola Read-Dashboard last-write-wins; kalau Edit Rekap dibuka di dua tab, perubahan terakhir menang tanpa peringatan.

**Klaim dalam brief vs kode aktual**

| Klaim | Status | Bukti |
|---|---|---|
| Kolom 11-13 = `Detail \| Jenis Sumber \| Link` | **SESUAI** | `HEADERS` baris 49-51 (kutipan R1d) |
| Ada `ensureTagHeaders_()` | **SESUAI** | definisi baris 375-388, dipanggil di `doPost` baris 454 |
| Whitelist `JENIS_SUMBER` | **SESUAI** | baris 56 `['Buku','Media sosial','Podcast','Video','Lainnya']`; dipakai baris 436 (di luar daftar → `''`) |
| Draf Catatan-Baca di **localStorage** kunci `catatan-baca-draft-v1` | **SESUAI** | `Catatan-Baca/script.js:240` `var KEY='catatan-baca-v1', DKEY='catatan-baca-draft-v1'`; akses lewat `localStorage.getItem/setItem/removeItem` (251-253) — bukan sessionStorage |
| `doPost()` god node 13 edges, `str_()` 11 edges | **dipercaya dari graph** — secara fungsional `doPost` (394) memang satu-satunya router tulis & memanggil `str_` (186) untuk hampir semua field; tidak ada fungsi lain yang menulis sheet tag |
| "Tidak ada kolom lama yang di-rename/digeser" | **SESUAI** | `ensureTagHeaders_` hanya menulis sel header kosong (383-387); baris data lama tak tersentuh |
