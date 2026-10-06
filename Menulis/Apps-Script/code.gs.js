/**
 * ==========================================================================
 *  Menulis - Google Apps Script Web App (container-bound di sheet "Menulis")
 * ==========================================================================
 *
 *  LANGKAH DEPLOY MANUAL (sekali saja):
 *  1. Buka spreadsheet "Menulis" di Google Sheets.
 *  2. Menu Extensions > Apps Script. Editor terbuka di tab baru.
 *  3. Hapus isi Code.gs bawaan, lalu tempel SELURUH isi file ini. Simpan (Ctrl+S).
 *  4. Pada daftar fungsi di atas, pilih "setupSheet" lalu klik Run.
 *     Saat diminta izin: Review permissions > pilih akun > Advanced >
 *     Go to project > Allow. (Wajar untuk script milik sendiri.)
 *  5. Deploy > New deployment > ikon gigi > Web app:
 *       - Description     : Menulis API
 *       - Execute as      : Me
 *       - Who has access  : Anyone
 *     Klik Deploy, salu URL yang berakhiran /exec.
 *  6. Buka index.html, tempel URL tadi ke konstanta ENDPOINT, simpan.
 *
 *  CARA KERJA:
 *  - Satu tab (sheet) per tag. Tab baru dibuat otomatis saat tag baru masuk.
 *  - Kolom tiap tab tag (urutan persis):
 *      Hari | Tanggal | Waktu Simpan | Tag | Pertanyaan | Dugaan Awal |
 *      Yang Mendukung | Yang Meruntuhkan | Kesimpulan Sementara |
 *      Pertanyaan Berikutnya | Detail | Jenis Sumber | Link
 *    (Detail | Jenis Sumber | Link ditambahkan di UJUNG; kolom lama tidak
 *     pernah di-rename/digeser. ensureTagHeaders_() melengkapi header tab
 *     lama secara idempoten.)
 *  - Jangan rename / hapus baris header (baris 1) di tab tag.
 *  - Tab sistem diawali "_" (mis. _Panduan) jangan diubah atau dihapus.
 *  - doGet: health check + ?action=daftarTag (baca-saja daftar nama tab),
 *    tidak pernah mengembalikan isi sheet.
 * ==========================================================================
 */

var TZ = 'Asia/Jakarta';

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
  'Link',
  'ID'
];

// Label jenis sumber yang diterima dari client (kolom "Jenis Sumber").
// Nilai di luar daftar ini tidak ditulis (kolom dikosongkan).
var JENIS_SUMBER = ['Buku', 'Media sosial', 'Podcast', 'Video', 'Lainnya'];

var GUIDE_SHEET = '_Panduan';
var RESERVED_PREFIX = '_';
var TAG_MAX_LEN = 100;
var LOCK_WAIT_MS = 10000;

// Tab sistem untuk fitur "Daftar Pertanyaan" (bukan tab tag).
var DAFTAR_SHEET = 'Daftar Pertanyaan';
var DAFTAR_HEADERS = ['ID', 'Pertanyaan', 'Dibuat (ISO)'];
var PERTANYAAN_MAX_LEN = 1000;

var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/* ==========================================================================
 * 1. setupSheet() - idempotent, aman dijalankan berulang.
 *    Tidak pernah menghapus tab atau data apa pun.
 * ========================================================================== */

function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var guide = findSheet_(ss, GUIDE_SHEET);

  if (!guide) {
    var def = findSheet_(ss, 'Sheet1');
    if (def && isEmptySheet_(def)) {
      def.setName(GUIDE_SHEET); // rename tab default yang masih kosong total
      guide = def;
    } else {
      guide = ss.insertSheet(GUIDE_SHEET); // fallback: buat tab panduan baru
    }
    writeGuide_(guide);
  }
  // Tab _Panduan sudah ada -> jangan ditimpa.
  return 'setupSheet selesai: tab ' + guide.getName() + ' siap.';
}

function isEmptySheet_(sh) {
  var values = sh.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    for (var j = 0; j < values[i].length; j++) {
      if (values[i][j] !== '' && values[i][j] !== null) return false;
    }
  }
  return true;
}

function writeGuide_(sh) {
  var lines = [
    'Menulis - panduan singkat',
    'Cara kerja: SATU TAB (sheet) PER TAG. Tag baru otomatis membuat tab baru.',
    'Kolom tiap tab tag: Hari | Tanggal | Waktu Simpan | Tag | Pertanyaan | Dugaan Awal | Yang Mendukung | Yang Meruntuhkan | Kesimpulan Sementara | Pertanyaan Berikutnya | Detail | Jenis Sumber | Link',
    'Jangan rename atau hapus baris 1 (header) di tab tag.',
    'Tab sistem diawali "_" (termasuk tab ini) jangan diubah atau dihapus.',
    'Isi datang dari index.html lewat Web App (kode di code.gs). Baris baru selalu ditambah di bawah.',
    'Timestamp memakai zona Asia/Jakarta.'
  ];
  var rows = [];
  for (var i = 0; i < lines.length; i++) rows.push([lines[i]]);

  sh.getRange(1, 1, rows.length, 1).setValues(rows);
  sh.getRange(1, 1, 1, 1).setFontWeight('bold');
  sh.getRange(1, 1, rows.length, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  sh.setColumnWidth(1, 640);
  sh.setFrozenRows(1);
}

/* ==========================================================================
 * 2. Helper murni (tanpa efek ke SpreadsheetApp -> bisa dites di node).
 * ========================================================================== */

/**
 * Rapikan nama tag untuk dijadikan nama tab.
 * - trim + rapikan spasi ganda
 * - buang karakter terlarang nama sheet: [ ] * ? : / \
 * - batasi 100 karakter
 * - kapitalisasi dipertahankan seperti input (pencocokan tab nanti case-insensitive)
 * Kembalikan '' bila tag kosong setelah sanitasi atau diawali "_" (tab sistem).
 */
function sanitizeTagName(tag) {
  if (tag === null || typeof tag === 'undefined') return '';
  var s = String(tag);
  s = s.replace(/\s+/g, ' '); // rapikan spasi ganda dulu
  s = s.replace(/[\[\]\*\?\\\/:]/g, ''); // buang karakter terlarang
  s = s.replace(/\s+/g, ' ').trim(); // trim + rapikan sisa spasi
  if (!s) return '';
  if (s.charAt(0) === RESERVED_PREFIX) return '';
  if (s.length > TAG_MAX_LEN) s = s.slice(0, TAG_MAX_LEN);
  s = s.replace(/\s+$/, '').trim();
  if (!s) return '';
  if (s.charAt(0) === RESERVED_PREFIX) return '';
  return s;
}

/**
 * Nama hari Indonesia (Senin..Minggu) dari tanggal 'yyyy-MM-dd'.
 * Hitung via UTC supaya tidak bergantung zona waktu server.
 * Kembalikan '' bila tanggal tidak valid.
 */
function hariIndonesia(dateIso) {
  var p = parseIso_(dateIso);
  if (!p) return '';
  return HARI[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
}

/**
 * Kalau string diawali = + - @, prefix apostrof supaya tidak jadi formula.
 */
function neutralizeCell(v) {
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

/** Parser tanggal 'yyyy-MM-dd' yang valid secara kalender (murni, UTC). */
function parseIso_(s) {
  if (typeof s !== 'string') return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  var dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y: y, m: mo, d: d };
}

function isValidIso_(s) {
  return parseIso_(s) !== null;
}

/** Coerce value menjadi string ter-trim; null/undefined -> ''. */
function str_(v) {
  if (v === null || typeof v === 'undefined') return '';
  return String(v).replace(/^\s+|\s+$/g, '');
}

/** Cari tab berdasarkan nama, pencocokan case-insensitive. */
function findSheet_(ss, name) {
  if (!name) return null;
  var target = String(name).toLowerCase();
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (String(sheets[i].getName()).toLowerCase() === target) return sheets[i];
  }
  return null;
}

/**
 * true bila nama tab == tab reserved "Daftar Pertanyaan"
 * (trim + case-insensitive).
 */
function isDaftarSheetName_(name) {
  if (name === null || typeof name === 'undefined') return false;
  var s = String(name).replace(/^\s+|\s+$/g, '');
  return s.toLowerCase() === DAFTAR_SHEET.toLowerCase();
}

/* ==========================================================================
 * 3. getOrCreateTagSheet_(tag) - cari case-insensitive, kalau belum ada buat.
 * ========================================================================== */

function getOrCreateTagSheet_(tag) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = findSheet_(ss, tag);
  if (existing) return existing;

  var sh = ss.insertSheet(tag);

  var head = sh.getRange(1, 1, 1, HEADERS.length);
  head.setValues([HEADERS]);
  head.setFontWeight('bold');
  sh.setFrozenRows(1);

  // Wrap untuk kolom teks (Tag .. Link = kolom 4..HEADERS.length)
  sh.getRange(1, 4, 1, HEADERS.length - 3).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);

  // Lebar kolom wajar
  sh.setColumnWidth(1, 90);   // Hari
  sh.setColumnWidth(2, 110);  // Tanggal
  sh.setColumnWidth(3, 150);  // Waktu Simpan
  sh.setColumnWidth(4, 140);  // Tag
  sh.setColumnWidths(5, HEADERS.length - 4, 230); // kolom teks

  return sh;
}

/* ==========================================================================
 * 3b. getOrCreateDaftarSheet_() - tab "Daftar Pertanyaan" (pola sama dengan
 *     getOrCreateTagSheet_): cari case-insensitive, kalau belum ada buat
 *     lengkap dengan header baris 1.
 * ========================================================================== */

function getOrCreateDaftarSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = findSheet_(ss, DAFTAR_SHEET);
  if (existing) return existing;

  var sh = ss.insertSheet(DAFTAR_SHEET);

  var head = sh.getRange(1, 1, 1, DAFTAR_HEADERS.length);
  head.setValues([DAFTAR_HEADERS]);
  head.setFontWeight('bold');
  sh.setFrozenRows(1);

  sh.setColumnWidth(1, 280);  // ID
  sh.setColumnWidth(2, 520);  // Pertanyaan
  sh.setColumnWidth(3, 180);  // Dibuat (ISO)

  return sh;
}

/* ==========================================================================
 * 3c. Aksi "Daftar Pertanyaan" (ADDITIVE): daftar | tambah | hapus.
 *     Tidak mengubah perilaku submit harian di doPost.
 * ========================================================================== */

/** Ambil semua baris pertanyaan sebagai [{id, text, created}]. */
function daftarPertanyaan_() {
  try {
    var sh = getOrCreateDaftarSheet_();
    var items = [];
    var last = sh.getLastRow();
    if (last >= 2) {
      var values = sh.getRange(2, 1, last - 1, DAFTAR_HEADERS.length).getValues();
      for (var i = 0; i < values.length; i++) {
        var id = str_(values[i][0]);
        var text = str_(values[i][1]);
        if (!id && !text) continue;
        items.push({ id: id, text: text, created: str_(values[i][2]) });
      }
    }
    return json_({ ok: true, items: items });
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) console.error('daftarPertanyaan_ error: ' + err);
    return json_({ ok: false, error: 'Gagal memuat daftar pertanyaan' });
  }
}

/** Tambah satu pertanyaan (trim, wajib non-kosong, maks PERTANYAAN_MAX_LEN). */
function tambahPertanyaan_(payload) {
  try {
    var text = str_(payload.pertanyaan);
    if (!text) {
      return json_({ ok: false, error: 'Pertanyaan tidak boleh kosong.' });
    }
    if (text.length > PERTANYAAN_MAX_LEN) {
      return json_({ ok: false, error: 'Pertanyaan maksimal ' + PERTANYAAN_MAX_LEN + ' karakter.' });
    }

    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(LOCK_WAIT_MS);
    } catch (lockErr) {
      return json_({ ok: false, error: 'Sedang ada proses simpan lain, coba lagi sebentar.' });
    }

    try {
      var sh = getOrCreateDaftarSheet_();
      var id = Utilities.getUuid();
      var created = new Date().toISOString();
      var row = sh.getLastRow() + 1;
      sh.getRange(row, 1, 1, DAFTAR_HEADERS.length).setValues([[
        neutralizeCell(id),
        neutralizeCell(text),
        neutralizeCell(created)
      ]]);
      return json_({ ok: true, item: { id: id, text: text, created: created } });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) console.error('tambahPertanyaan_ error: ' + err);
    return json_({ ok: false, error: 'Gagal menambah pertanyaan' });
  }
}

/** Hapus satu pertanyaan berdasarkan ID (bukan nomor baris). */
function hapusPertanyaan_(payload) {
  try {
    var id = str_(payload.id);
    if (!id) {
      return json_({ ok: false, error: 'ID pertanyaan wajib diisi.' });
    }

    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(LOCK_WAIT_MS);
    } catch (lockErr) {
      return json_({ ok: false, error: 'Sedang ada proses simpan lain, coba lagi sebentar.' });
    }

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
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) console.error('hapusPertanyaan_ error: ' + err);
    return json_({ ok: false, error: 'Gagal menghapus pertanyaan' });
  }
}

/* ==========================================================================
 * 3d. ensureTagHeaders_(sheet) - lengkapi header kolom BARU di tab lama.
 *     Idempoten: kolom yang header-nya sudah sesuai dilewati (tidak dobel),
 *     kolom kosong diisi nama header, kolom yang sudah berisi teks lain
 *     TIDAK ditimpa. Hanya menyentuh baris 1; tidak pernah menghapus data.
 * ========================================================================== */

function ensureTagHeaders_(sh) {
  // Tab yang kolomnya pernah dikurangi: tambahkan kolom dulu (additive,
  // tidak menyentuh data) supaya baca/tulis HEADERS.length kolom tidak gagal.
  var maxCols = sh.getMaxColumns();
  if (maxCols < HEADERS.length) sh.insertColumnsAfter(maxCols, HEADERS.length - maxCols);

  var last = Math.max(sh.getLastColumn(), HEADERS.length);
  var head = sh.getRange(1, 1, 1, last).getValues()[0];
  for (var i = 0; i < HEADERS.length; i++) {
    if (str_(head[i]) === HEADERS[i]) continue; // sudah ada - jangan dobel
    if (str_(head[i]) !== '') continue;         // berisi teks lain - jangan ditimpa
    sh.getRange(1, i + 1).setValue(HEADERS[i]).setFontWeight('bold');
  }
}

/* ==========================================================================
 * 4. doPost(e) - simpan satu halaman ke tab sesuai tag.
 * ========================================================================== */

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
    if (action === 'rekapDaftar') return rekapDaftar_(payload);
    if (action === 'rekapBaca') return rekapBaca_(payload);
    if (action === 'rekapUpdate') return rekapUpdate_(payload);
    if (action) return json_({ ok: false, error: 'Aksi tidak dikenal: ' + action });

    // Validasi server-side (sama dengan REQ di client: tag, q, dugaan, simpul)
    var tag = sanitizeTagName(payload.tag);
    if (!tag) {
      return json_({ ok: false, error: 'Tag wajib diisi (tidak boleh kosong atau diawali "_")' });
    }
    // Tab "Daftar Pertanyaan" RESERVED: tidak boleh dipakai sebagai tag harian.
    if (isDaftarSheetName_(tag)) {
      return json_({ ok: false, error: 'Tag "' + tag + '" dipakai untuk tab sistem "Daftar Pertanyaan". Gunakan tag lain.' });
    }
    var q = str_(payload.q);
    var dugaan = str_(payload.dugaan);
    var simpul = str_(payload.simpul);
    if (!q || !dugaan || !simpul) {
      return json_({ ok: false, error: 'Isi dulu: Pertanyaan, Dugaan awal, Kesimpulan sementara.' });
    }

    var dukung = str_(payload.dukung);
    var runtuh = str_(payload.runtuh);
    var next = str_(payload.next);
    // Tiga kolom baru di ujung (Detail | Jenis Sumber | Link).
    // Client lama (tanpa field ini) -> '' sehingga baris lama tetap utuh.
    var detail = str_(payload.detail);
    var jenis = str_(payload.jenis);
    if (JENIS_SUMBER.indexOf(jenis) < 0) jenis = '';
    var link = str_(payload.link);

    // Tanggal: pakai date (yyyy-MM-dd) dari client kalau valid, kalau tidak hari ini di TZ
    var now = new Date();
    var tgl = isValidIso_(payload.date) ? String(payload.date).trim() : Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
    var hari = hariIndonesia(tgl);
    var waktu = Utilities.formatDate(now, TZ, 'yyyy-MM-dd HH:mm:ss');

    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(LOCK_WAIT_MS);
    } catch (lockErr) {
      return json_({ ok: false, error: 'Sedang ada proses simpan lain, coba lagi sebentar.' });
    }

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
        neutralizeCell(link),
        // Kolom 14: ID unik baris (baru) - biar baris bisa dirujuk tanpa
        // nomor baris (yang bisa bergeser kalau ada hapus).
        Utilities.getUuid()
      ]];
      sheet.getRange(row, 1, 1, HEADERS.length).setValues(values);
      return json_({ ok: true, sheet: sheet.getName(), row: row });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    // Jangan bocorkan stack trace ke client.
    if (typeof console !== 'undefined' && console.error) console.error('doPost error: ' + err);
    return json_({ ok: false, error: 'Gagal menyimpan di server' });
  }
}

/* ==========================================================================
 * 4d. daftarTag_() - baca-saja: daftar nama tab tag (untuk saran tag front-end).
 * ========================================================================== */

/**
 * Kumpulkan nama tab yang merupakan tab tag: semua tab KECUALI tab sistem
 * "Daftar Pertanyaan", tab berawalan "_" (mis. _Panduan), dan tab default
 * bawaan "Sheet1" (lihat setupSheet - tab default yang berisi dipertahankan,
 * jadi bukan tab tag).
 * HANYA membaca (getSheets / getName): tidak pernah getOrCreate*, insertSheet,
 * appendRow, setValue, setValues, atau menulis apa pun.
 * Nama dikembalikan persis seperti tersimpan di Sheet (tanpa normalisasi),
 * diurut alfabet case-insensitive.
 * TIDAK menangkap error - pemanggil (doGet) yang membungkus try/catch.
 */
function daftarTag_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var tags = [];
  for (var i = 0; i < sheets.length; i++) {
    var name = String(sheets[i].getName());
    var key = name.replace(/^\s+|\s+$/g, '').toLowerCase();
    if (!key) continue;                               // nama kosong
    if (key === DAFTAR_SHEET.toLowerCase()) continue; // tab sistem "Daftar Pertanyaan"
    if (key.charAt(0) === RESERVED_PREFIX) continue;  // tab sistem berawalan "_"
    if (key === 'sheet1') continue;                   // tab default bawaan
    tags.push(name);
  }
  tags.sort(function (a, b) {
    var la = String(a).toLowerCase();
    var lb = String(b).toLowerCase();
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  });
  return tags;
}

/* ==========================================================================
 * 4e. Rekap (ADDITIVE): helper + tiga aksi.
 *     sumberOf_ | rowToItem_ | backfillIds_ | previewOf_
 *     rekapDaftar_ | rekapBaca_ | rekapUpdate_
 *     Semua baca/tulis memakai INDEKS kolom (bukan nama header) karena tab
 *     lama bisa punya teks header berbeda di kolom 11-14.
 * ========================================================================== */

/**
 * Asal baris: 'Catatan' bila jenis terisi ATAU judul bergaya "<judul>, hlm. NN"
 * (pola lama Catatan-Baca); selain itu 'Jawab-Pertanyaan'.
 */
function sumberOf_(jenis, judul) {
  if (str_(jenis)) return 'Catatan';
  if (/,\s*hlm\./i.test(str_(judul))) return 'Catatan';
  return 'Jawab-Pertanyaan';
}

/**
 * Peta satu baris data tag -> objek penuh, DARI INDEKS kolom:
 * 1=hari, 2=tanggal, 3=waktu, 5=judul(q), 6=dugaan, 7=dukung, 8=runtuh,
 * 9=simpul, 10=next, 11=detail, 12=jenis, 13=link, 14=id.
 * `tag` = NAMA TAB (sheet.getName()), bukan isi kolom 4. Semua nilai lewat str_.
 */
function rowToItem_(sheetName, rowValues) {
  var r = rowValues || [];
  var judul = str_(r[4]);
  var jenis = str_(r[11]);
  return {
    id: str_(r[13]),
    tag: str_(sheetName),
    sumber: sumberOf_(jenis, judul),
    jenis: jenis,
    hari: str_(r[0]),
    tanggal: str_(r[1]),
    waktu: str_(r[2]),
    judul: judul,
    dugaan: str_(r[5]),
    dukung: str_(r[6]),
    runtuh: str_(r[7]),
    simpul: str_(r[8]),
    next: str_(r[9]),
    detail: str_(r[10]),
    link: str_(r[12])
  };
}

/**
 * Isi kolom 14 (ID) dengan UUID untuk baris yang ID-nya kosong dan tidak
 * seluruhnya kosong. SATU setValues di kolom 14 (bukan per baris); kolom 1-13
 * tidak pernah ditulis; idempoten (panggilan kedua tidak mengubah apa pun).
 * HANYA dipanggil di dalam lock. Return jumlah ID baru yang ditulis.
 */
function backfillIds_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var cols = Math.min(Math.max(sheet.getLastColumn(), HEADERS.length), sheet.getMaxColumns());
  var values = sheet.getRange(2, 1, last - 1, cols).getValues();
  var out = [];
  var baru = 0;
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var id = str_(row[13]);
    if (id) { out.push([id]); continue; }
    var kosongSemua = true;
    for (var j = 0; j < row.length; j++) {
      if (str_(row[j]) !== '') { kosongSemua = false; break; }
    }
    if (kosongSemua) { out.push(['']); continue; } // baris seluruhnya kosong: jangan diisi
    out.push([Utilities.getUuid()]);
    baru++;
  }
  if (baru > 0) sheet.getRange(2, 14, out.length, 1).setValues(out);
  return baru;
}

/**
 * Preview daftar: isi pertama yang tidak kosong dari kolom
 * simpul(9), dugaan(6), dukung(7), runtuh(8), next(10); spasi/newline
 * dipadatkan jadi satu spasi; dipotong 160 karakter + '…' bila lebih.
 */
function previewOf_(rowValues) {
  var urut = [8, 5, 6, 7, 9];
  var r = rowValues || [];
  for (var i = 0; i < urut.length; i++) {
    var t = str_(r[urut[i]]).replace(/\s+/g, ' ');
    if (!t) continue;
    if (t.length > 160) return t.slice(0, 160) + '…';
    return t;
  }
  return '';
}

/**
 * rekapDaftar: daftar semua tulisan lintas tab tag (payload opsional {tag}).
 * Dalam lock: lengkapi header -> backfill ID -> baca tiap tab SEKALI getValues.
 * Respons: {ok:true, total, items:[{id, tag, sumber, jenis, judul, detail,
 * link, tanggal, waktu, preview}]}, urut waktu menurun (kosong di akhir).
 */
function rekapDaftar_(payload) {
  if (!payload || typeof payload !== 'object') payload = {};
  var filter = str_(payload.tag).toLowerCase();

  var lock = LockService.getScriptLock();
  var got = false;
  try {
    lock.waitLock(LOCK_WAIT_MS);
    got = true;
  } catch (lockErr) {
    return json_({ ok: false, error: 'Sedang ada proses simpan lain, coba lagi sebentar.' });
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var names = daftarTag_();
    var items = [];
    for (var n = 0; n < names.length; n++) {
      var name = names[n];
      if (filter && String(name).toLowerCase() !== filter) continue; // filter satu tab
      var sh = findSheet_(ss, name);
      if (!sh) continue;
      ensureTagHeaders_(sh);
      backfillIds_(sh);
      var last = sh.getLastRow();
      if (last < 2) continue;
      var cols = Math.max(sh.getLastColumn(), HEADERS.length); // aman: header sudah dipastikan
      var rows = sh.getRange(2, 1, last - 1, cols).getValues();
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var adaIsi = false;
        for (var j = 0; j < row.length; j++) {
          if (str_(row[j]) !== '') { adaIsi = true; break; }
        }
        if (!adaIsi) continue; // baris seluruhnya kosong: dilewati
        var it = rowToItem_(name, row);
        items.push({
          id: it.id, tag: it.tag, sumber: it.sumber, jenis: it.jenis,
          judul: it.judul, detail: it.detail, link: it.link,
          tanggal: it.tanggal, waktu: it.waktu, preview: previewOf_(row)
        });
      }
    }
    items.sort(function (a, b) {
      var wa = str_(a.waktu), wb = str_(b.waktu);
      if (wa === wb) return 0;
      if (!wa) return 1;              // waktu kosong di paling akhir
      if (!wb) return -1;
      return wa < wb ? 1 : -1;        // menurun (baru ke atas)
    });
    return json_({ ok: true, total: items.length, items: items });
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) console.error('rekapDaftar_ error: ' + err);
    return json_({ ok: false, error: 'Gagal memuat daftar rekap' });
  } finally {
    if (got) lock.releaseLock();
  }
}

/**
 * rekapBaca: satu tulisan berdasar {id}. Baca-saja TANPA lock, TANPA tulis
 * (termasuk tidak backfill). Item penuh = rowToItem_ (15 field).
 */
function rekapBaca_(payload) {
  if (!payload || typeof payload !== 'object') payload = {};
  var id = str_(payload.id);
  if (!id) return json_({ ok: false, error: 'Parameter id wajib diisi.' });
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var names = daftarTag_();
    for (var n = 0; n < names.length; n++) {
      var sh = findSheet_(ss, names[n]);
      if (!sh) continue;
      var last = sh.getLastRow();
      if (last < 2) continue;
      var cols = Math.min(Math.max(sh.getLastColumn(), HEADERS.length), sh.getMaxColumns());
      if (cols < HEADERS.length) continue; // tanpa kolom 14: tidak mungkin ada ID
      var rows = sh.getRange(2, 1, last - 1, cols).getValues();
      for (var i = 0; i < rows.length; i++) {
        if (str_(rows[i][13]) === id) {
          return json_({ ok: true, item: rowToItem_(names[n], rows[i]) });
        }
      }
    }
    return json_({ ok: false, error: 'Tulisan tidak ditemukan.' });
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) console.error('rekapBaca_ error: ' + err);
    return json_({ ok: false, error: 'Gagal memuat tulisan' });
  }
}

/**
 * rekapUpdate: update parsial {id, fields:{...}} di dalam lock. ID dicari ulang
 * di dalam lock (nomor baris bisa bergeser). Hanya kunci whitelist yang dipakai:
 * judul, dugaan, dukung, runtuh, simpul, next, detail, link; kunci lain (tag,
 * jenis, id, hari, tanggal, waktu, ...) DIABAIKAN diam-diam. Tulisan hanya ke
 * kolom 5-11 (satu setValues) dan kolom 13 (satu setValues); kolom 12 (jenis)
 * dan kolom lain TIDAK ditulis. Tanpa pengecekan versi -> last-write-wins.
 */
function rekapUpdate_(payload) {
  var ISI_MAX = 45000;
  if (!payload || typeof payload !== 'object') payload = {};
  var id = str_(payload.id);
  if (!id) return json_({ ok: false, error: 'Parameter id wajib diisi.' });

  // Whitelist kunci: selain ini diabaikan diam-diam (tak pernah menulis kolomnya).
  var BOLEH = ['judul', 'dugaan', 'dukung', 'runtuh', 'simpul', 'next', 'detail', 'link'];
  var fields = payload.fields;
  var masuk = {};
  if (fields && typeof fields === 'object') {
    for (var w = 0; w < BOLEH.length; w++) {
      var key = BOLEH[w];
      if (Object.prototype.hasOwnProperty.call(fields, key)) masuk[key] = str_(fields[key]);
    }
  }

  // Validasi panjang SEBELUM lock/tulis: melebihi -> tidak ada tulisan sama sekali.
  if (typeof masuk.judul === 'string' && masuk.judul.length > PERTANYAAN_MAX_LEN) {
    return json_({ ok: false, error: 'Judul maksimal ' + PERTANYAAN_MAX_LEN + ' karakter.' });
  }
  for (var k2 in masuk) {
    if (!Object.prototype.hasOwnProperty.call(masuk, k2) || k2 === 'judul') continue;
    if (masuk[k2].length > ISI_MAX) {
      return json_({ ok: false, error: 'Isi maksimal ' + ISI_MAX + ' karakter.' });
    }
  }

  var lock = LockService.getScriptLock();
  var got = false;
  try {
    lock.waitLock(LOCK_WAIT_MS);
    got = true;
  } catch (lockErr) {
    return json_({ ok: false, error: 'Sedang ada proses simpan lain, coba lagi sebentar.' });
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var names = daftarTag_();
    var sh = null, rowIdx = -1, rows = null;
    for (var n = 0; n < names.length && !sh; n++) {
      var cand = findSheet_(ss, names[n]);
      if (!cand) continue;
      var last = cand.getLastRow();
      if (last < 2) continue;
      var cols = Math.min(Math.max(cand.getLastColumn(), HEADERS.length), cand.getMaxColumns());
      if (cols < HEADERS.length) continue; // tanpa kolom 14: tidak mungkin ada ID
      var vals = cand.getRange(2, 1, last - 1, cols).getValues();
      for (var i = 0; i < vals.length; i++) {
        if (str_(vals[i][13]) === id) {
          sh = cand; rowIdx = i + 2; rows = vals[i];
          break;
        }
      }
    }
    if (!sh) return json_({ ok: false, error: 'Tulisan tidak ditemukan.' });

    // Nilai akhir per kolom: kunci tidak dikirim -> nilai lama dipertahankan;
    // kunci dikirim string kosong -> kolom dikosongkan (untuk kolom opsional).
    var nilai = {
      judul: str_(rows[4]),
      dugaan: str_(rows[5]),
      dukung: str_(rows[6]),
      runtuh: str_(rows[7]),
      simpul: str_(rows[8]),
      next: str_(rows[9]),
      detail: str_(rows[10]),
      link: str_(rows[12])
    };
    for (var k3 in masuk) {
      if (Object.prototype.hasOwnProperty.call(masuk, k3)) nilai[k3] = masuk[k3];
    }

    // Salin persis aturan wajib-isi submit harian di doPost (q/dugaan/simpul).
    if (!nilai.judul || !nilai.dugaan || !nilai.simpul) {
      return json_({ ok: false, error: 'Isi dulu: Pertanyaan, Dugaan awal, Kesimpulan sementara.' });
    }

    // Tulis HANYA kolom 5-11 (satu setValues) dan kolom 13 (satu setValues).
    sh.getRange(rowIdx, 5, 1, 7).setValues([[
      neutralizeCell(nilai.judul),
      neutralizeCell(nilai.dugaan),
      neutralizeCell(nilai.dukung),
      neutralizeCell(nilai.runtuh),
      neutralizeCell(nilai.simpul),
      neutralizeCell(nilai.next),
      neutralizeCell(nilai.detail)
    ]]);
    sh.getRange(rowIdx, 13, 1, 1).setValues([[ neutralizeCell(nilai.link) ]]);

    // Baca ulang baris terbaru untuk respons.
    var colsAkhir = Math.min(Math.max(sh.getLastColumn(), HEADERS.length), sh.getMaxColumns());
    var segar = sh.getRange(rowIdx, 1, 1, colsAkhir).getValues()[0];
    return json_({ ok: true, item: rowToItem_(sh.getName(), segar) });
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) console.error('rekapUpdate_ error: ' + err);
    return json_({ ok: false, error: 'Gagal memperbarui tulisan' });
  } finally {
    if (got) lock.releaseLock();
  }
}

/* ==========================================================================
 * 5. doGet(e) - health check + daftar tag (read-only).
 *    TIDAK PERNAH mengembalikan isi sheet.
 * ========================================================================== */

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

/** Balikkan objek sebagai JSON. */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
