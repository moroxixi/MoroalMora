/**
 * Read-Dashboard — backend Google Apps Script (container-bound).
 *
 * === LANGKAH DEPLOY MANUAL (sekali saja, dilakukan USER) ===
 * 1. Buka Google Sheet yang akan dipakai.
 * 2. Menu Ekstensi > Apps Script. Karena script menempel pada sheet ini,
 *    ia boleh memakai SpreadsheetApp.getActiveSpreadsheet() — TIDAK ada
 *    Spreadsheet ID yang di-hardcode di file ini.
 * 3. Hapus isi Code.gs, tempel seluruh isi file ini, lalu simpan.
 * 4. (Opsional) Jalankan fungsi setupSheet() sekali untuk membuat tab
 *    "Dokumen" beserta header secara eksplisit. Tab + header juga dibuat
 *    otomatis oleh ensureSheet_() pada request pertama bila belum ada.
 * 5. Deploy > New deployment > Web app:
 *       - Execute as: Me
 *       - Who has access: Anyone
 *    Salin URL yang berakhiran /exec.
 * 6. Tempel URL itu ke config.js pada field APPS_SCRIPT_URL.
 *
 * CATATAN:
 * - Tidak ada trigger (time-based/installable) yang dibutuhkan; file ini
 *   sama sekali tidak memanggil ScriptApp untuk membuat trigger apa pun.
 * - Respons SELALU JSON: {ok:true, data:...} atau {ok:false, error:"pesan"}.
 * - Kontrak (harus sama dengan api.js):
 *     GET  ?action=list        -> daftar ringkas TANPA isi penuh
 *     GET  ?action=get&id=...  -> satu dokumen lengkap (termasuk isi)
 *     POST JSON {action:create|update|delete, ...}
 */

/** Nama tab sheet dan urutan kolomnya. */
var SHEET_NAME = "Dokumen";
var HEADERS = ["id", "judul", "isi", "tipe", "dibuat", "diubah"];
/** Nomor kolom 1-based. */
var COL = { ID: 1, JUDUL: 2, ISI: 3, TIPE: 4, DIBUAT: 5, DIUBAH: 6 };
var MAX_JUDUL = 200;
/** Sengaja di bawah batas 50.000 karakter per sel Google Sheets. */
var MAX_ISI = 45000;
var PREVIEW_LEN = 200;
var LOCK_TIMEOUT_MS = 10000;
/** Tipe yang diizinkan untuk kolom tipe (hasil ekstensi file / pilihan form). */
var TIPE_RE = /^[a-z0-9]{1,16}$/;

/* ---------------------------------------------------------------- Router */

function doGet(e) {
  var action = "";
  try {
    action = String((e && e.parameter && e.parameter.action) || "");
  } catch (err) {
    action = "";
  }
  try {
    if (action === "list") return jsonOk_(listDocs_());
    if (action === "get") return jsonOk_(getDoc_(e.parameter.id));
    return jsonErr_(
      "Action GET tidak dikenal: " + (action || "(kosong)") + ". Yang diizinkan: list, get."
    );
  } catch (err) {
    return jsonErr_(errMessage_(err));
  }
}

/** Router tipis: parse body, whitelist action, delegasikan ke fungsi terpisah. */
function doPost(e) {
  var payload = null;
  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || "");
  } catch (err) {
    return jsonErr_("Body bukan JSON yang valid.");
  }
  if (!payload || typeof payload !== "object") {
    return jsonErr_("Body kosong.");
  }

  var action = String(payload.action || "");
  try {
    if (action === "create") return jsonOk_(createDoc_(payload));
    if (action === "update") return jsonOk_(updateDoc_(payload));
    if (action === "delete") return jsonOk_(deleteDoc_(payload));
    return jsonErr_(
      "Action POST tidak dikenal: " +
        (action || "(kosong)") +
        ". Yang diizinkan: create, update, delete."
    );
  } catch (err) {
    return jsonErr_(errMessage_(err));
  }
}

/* ------------------------------------------------------- Util respons OK */

function jsonOk_(data) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, data: data })
  ).setMimeType(ContentService.MimeType.JSON);
}

function jsonErr_(message) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: false, error: String(message) })
  ).setMimeType(ContentService.MimeType.JSON);
}

function errMessage_(err) {
  if (err && err.message) return String(err.message);
  return String(err);
}

/** Apapun yang masuk, jadikan string aman (termasuk sel Date). */
function str_(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function nowIso_() {
  return new Date().toISOString();
}

/* ------------------------------------------------------------ Sheet I/O */

/**
 * Pastikan tab "Dokumen" + header ada, dan SEMUA kolom diset ke number
 * format plain text ("@") SEBELUM ada tulisan apa pun. Format "@" inilah
 * yang mencegah isi yang diawali "=", "+", "-", atau berbentuk tanggal
 * dianggap formula / dikonversi oleh Sheets.
 */
function ensureSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error(
      "Spreadsheet tidak ditemukan. Pastikan skrip ini container-bound " +
        "(dibuka lewat Ekstensi > Apps Script pada Sheet)."
    );
  }

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  var lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS.slice()]);
  } else {
    var header = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    if (str_(header[0]).trim() !== HEADERS[0]) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS.slice()]);
    }
  }

  // Plain text untuk seluruh kolom, semua baris.
  sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).setNumberFormat("@");
  return sheet;
}

/** Bisa dijalankan manual user sekali saja dari editor Apps Script. */
function setupSheet() {
  var sheet = ensureSheet_();
  sheet.setFrozenRows(1);
  Logger.log("Sheet '%s' siap. Kolom: %s", SHEET_NAME, HEADERS.join(" | "));
}

/** Baca semua baris dokumen (id, judul, isi, tipe, dibuat, diubah). */
function readRows_() {
  var sheet = ensureSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];

  var values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var row = {
      row: i + 2,
      id: str_(r[COL.ID - 1]),
      judul: str_(r[COL.JUDUL - 1]),
      isi: str_(r[COL.ISI - 1]),
      tipe: str_(r[COL.TIPE - 1]),
      dibuat: str_(r[COL.DIBUAT - 1]),
      diubah: str_(r[COL.DIUBAH - 1])
    };
    // Lewati baris yang benar-benar kosong.
    if (!row.id && !row.judul && !row.isi && !row.tipe) continue;
    rows.push(row);
  }
  return rows;
}

/** Cari satu baris berdasarkan id; lempar Error bila tidak ada. */
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

/** Kunci script lock untuk operasi tulis; lempar Error bila tidak didapat. */
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

/* ------------------------------------------------------------- Operasi */

function listDocs_() {
  var docs = readRows_().map(function (row) {
    return {
      id: row.id,
      judul: row.judul,
      preview: preview_(row.isi),
      tipe: row.tipe,
      dibuat: row.dibuat,
      diubah: row.diubah
    };
  });
  // diubah terbaru dulu (string ISO UTC urut leksikografis = urut waktu).
  docs.sort(function (a, b) {
    if (a.diubah === b.diubah) return 0;
    return a.diubah < b.diubah ? 1 : -1;
  });
  return docs;
}

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

function createDoc_(payload) {
  var v = validateContent_(payload.judul, payload.isi);
  var tipe = normalizeTipe_(payload.tipe);

  return withLock_(function () {
    var sheet = ensureSheet_(); // format "@" sudah dipasang sebelum menulis
    var ts = nowIso_();
    var id = Utilities.getUuid();

    var targetRow = sheet.getLastRow() + 1;
    if (targetRow > sheet.getMaxRows()) {
      sheet.insertRowsAfter(sheet.getMaxRows(), targetRow - sheet.getMaxRows());
    }
    sheet
      .getRange(targetRow, 1, 1, HEADERS.length)
      .setValues([[id, v.judul, v.isi, tipe, ts, ts]]);

    return { id: id, judul: v.judul, tipe: tipe, dibuat: ts, diubah: ts };
  });
}

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

function deleteDoc_(payload) {
  var id = str_(payload.id);
  if (!id) throw new Error("Parameter id wajib diisi.");

  return withLock_(function () {
    var sheet = ensureSheet_();
    var found = findRow_(sheet, id);
    sheet.deleteRow(found.row);
    return { id: id, deleted: true };
  });
}

/* ----------------------------------------------------------- Validasi */

function validateContent_(judul, isi) {
  var j = str_(judul);
  var i = str_(isi);
  var jt = j.replace(/^\s+|\s+$/g, "");

  if (!jt) throw new Error("Judul tidak boleh kosong.");
  if (jt.length > MAX_JUDUL) {
    throw new Error(
      "Judul maksimal " + MAX_JUDUL + " karakter (saat ini " + jt.length + ")."
    );
  }
  if (i.length > MAX_ISI) {
    throw new Error(
      "Isi maksimal " + MAX_ISI.toLocaleString("id-ID") +
        " karakter (saat ini " + i.length.toLocaleString("id-ID") + ")."
    );
  }
  return { judul: jt, isi: i };
}

/** Normalisasi tipe: huruf kecil, karakter aman, default "txt". */
function normalizeTipe_(tipe) {
  var t = str_(tipe).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!TIPE_RE.test(t)) t = t ? t.slice(0, 16) : "txt";
  if (!t) t = "txt";
  return t;
}

/** 200 karakter pertama isi, whitespace dirapatkan. Tanpa isi penuh. */
function preview_(isi) {
  return str_(isi)
    .replace(/\s+/g, " ")
    .replace(/^\s+|\s+$/g, "")
    .slice(0, PREVIEW_LEN);
}
