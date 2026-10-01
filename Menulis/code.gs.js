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
 *      Pertanyaan Berikutnya
 *  - Jangan rename / hapus baris header (baris 1) di tab tag.
 *  - Tab sistem diawali "_" (mis. _Panduan) jangan diubah atau dihapus.
 *  - doGet hanya health check, tidak pernah mengembalikan isi sheet.
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
  'Pertanyaan Berikutnya'
];

var GUIDE_SHEET = '_Panduan';
var RESERVED_PREFIX = '_';
var TAG_MAX_LEN = 100;
var LOCK_WAIT_MS = 10000;

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
    'Kolom tiap tab tag: Hari | Tanggal | Waktu Simpan | Tag | Pertanyaan | Dugaan Awal | Yang Mendukung | Yang Meruntuhkan | Kesimpulan Sementara | Pertanyaan Berikutnya',
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

  // Wrap untuk kolom teks (Tag .. Pertanyaan Berikutnya = kolom 4..10)
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

    // Validasi server-side (sama dengan REQ di client: tag, q, dugaan, simpul)
    var tag = sanitizeTagName(payload.tag);
    if (!tag) {
      return json_({ ok: false, error: 'Tag wajib diisi (tidak boleh kosong atau diawali "_")' });
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
        neutralizeCell(next)
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
 * 5. doGet(e) - health check saja. TIDAK PERNAH mengembalikan isi data.
 * ========================================================================== */

function doGet(e) {
  return json_({ ok: true, service: 'menulis' });
}

/** Balikkan objek sebagai JSON. */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
