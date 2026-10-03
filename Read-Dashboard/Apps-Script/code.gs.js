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
 * 7. DEPLOY ULANG setiap kali kode file ini berubah (agar versi web app
 *    mengikuti editor): tempel kode -> simpan -> Deploy > Kelola
 *    deployment > ikon pensil (Edit) > Versi: "Versi baru" > Deploy.
 *    URL TIDAK berubah, jadi config.js tidak perlu diganti lagi.
 *
 * CATATAN:
 * - Tidak ada trigger (time-based/installable) yang dibutuhkan; file ini
 *   sama sekali tidak memanggil ScriptApp untuk membuat trigger apa pun.
 * - Respons SELALU JSON: {ok:true, data:...} atau {ok:false, error:"pesan"}.
 * - Kontrak (harus sama dengan api.js):
 *     GET  ?action=list        -> daftar ringkas TANPA isi penuh
 *     GET  ?action=get&id=...  -> satu dokumen lengkap (termasuk isi)
 *     GET  ?action=search&q=... -> cari judul+isi (lihat searchDocs_/searchCore_)
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
/** Aturan pencarian (harus sama dengan front-end script.js). */
var SEARCH_MIN = 2;
var SEARCH_MAX = 100;
var SEARCH_MAX_TOKENS = 5;
/** Jumlah karakter sebelum/sesudah kemunculan token di dalam cuplikan. */
var CUPLIKAN_RADIUS = 160;
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
    if (action === "search") return jsonOk_(searchDocs_(e.parameter.q));
    return jsonErr_(
      "Action GET tidak dikenal: " + (action || "(kosong)") +
        ". Yang diizinkan: list, get, search."
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

/* ---------------------------------------------------------- Pencarian */

/**
 * Pencarian baca-saja (GET ?action=search&q=...).
 * TANPA LockService dan TANPA menulis apa pun ke Sheet: hanya membaca
 * baris lewat readRows_ (jalur baca yang sama dengan listDocs_).
 */
function searchDocs_(q) {
  return searchCore_(readRows_(), q);
}

/**
 * Inti pencarian MURNI — hanya array baris + string query, tanpa memanggil
 * API Apps Script apa pun, sehingga bisa diuji langsung di node.
 *
 * Aturan:
 * - Query di-trim dan whitespace-nya dirapatkan dulu; panjang 2..100
 *   karakter. Di luar rentang itu -> lempar Error (jadi
 *   {ok:false,error:"Kata kunci minimal/maksimal 2/100 karakter"}).
 * - Pecah per spasi, pakai maksimal 5 token pertama.
 * - SEMUA token harus cocok (AND) di dalam judul + "\n" + isi,
 *   tanpa peduli huruf besar/kecil, memakai indexOf LITERAL (bukan
 *   regex) supaya karakter . * + ? [ ] aman dianggap teks biasa.
 * - cuplikan: ±CUPLIKAN_RADIUS karakter di sekitar kemunculan pertama
 *   token (urut token) yang ditemukan di isi, whitespace dirapatkan,
 *   penanda \u2026 pada sisi yang terpotong; kosong kalau tidak ada token
 *   yang cocok di isi (hanya cocok di judul).
 * - Urutan: yang cocok di judul dulu, lalu diubah terbaru.
 * - Batas 100 hasil; total = jumlah cocok sebenarnya; terpotong = total > 100.
 *
 * @param {Array<Object>} rows baris {id,judul,isi,tipe,dibuat,diubah}
 * @param {*} query kata kunci mentah dari parameter request
 * @return {{items:Array, total:Number, terpotong:Boolean}}
 */
function searchCore_(rows, query) {
  var q = String(query === null || query === undefined ? "" : query)
    .replace(/\s+/g, " ")
    .replace(/^\s+|\s+$/g, "");
  if (q.length < SEARCH_MIN) {
    throw new Error("Kata kunci minimal " + SEARCH_MIN + " karakter");
  }
  if (q.length > SEARCH_MAX) {
    throw new Error("Kata kunci maksimal " + SEARCH_MAX + " karakter");
  }

  var tokens = q.split(" ").slice(0, SEARCH_MAX_TOKENS);
  var tokensL = tokens.map(function (t) {
    return t.toLowerCase();
  });

  var list = Array.isArray(rows) ? rows : [];
  var matches = [];

  for (var i = 0; i < list.length; i++) {
    var row = list[i] || {};
    var judul = str_(row.judul);
    var isi = str_(row.isi);
    var hayL = (judul + "\n" + isi).toLowerCase();

    var all = true;
    for (var t = 0; t < tokensL.length; t++) {
      if (hayL.indexOf(tokensL[t]) === -1) {
        all = false;
        break;
      }
    }
    if (!all) continue;

    var judulL = judul.toLowerCase();
    var isiL = isi.toLowerCase();
    var anyJudul = false;
    var anyIsi = false;
    for (var t2 = 0; t2 < tokensL.length; t2++) {
      if (judulL.indexOf(tokensL[t2]) !== -1) anyJudul = true;
      if (isiL.indexOf(tokensL[t2]) !== -1) anyIsi = true;
    }

    // Cuplikan: ±160 karakter di sekitar token pertama yang ada di isi.
    var isiC = isi.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    var isiCL = isiC.toLowerCase();
    var cuplikan = "";
    for (var t3 = 0; t3 < tokensL.length; t3++) {
      var pos = isiCL.indexOf(tokensL[t3]);
      if (pos === -1) continue;
      var start = Math.max(0, pos - CUPLIKAN_RADIUS);
      var end = Math.min(
        isiC.length,
        pos + String(tokens[t3]).length + CUPLIKAN_RADIUS
      );
      var snip = isiC.slice(start, end);
      if (start > 0) snip = "\u2026" + snip;
      if (end < isiC.length) snip = snip + "\u2026";
      cuplikan = snip;
      break;
    }

    matches.push({
      id: str_(row.id),
      judul: judul,
      preview: preview_(isi),
      tipe: str_(row.tipe),
      dibuat: str_(row.dibuat),
      diubah: str_(row.diubah),
      cocok: anyJudul && anyIsi ? "judul+isi" : anyJudul ? "judul" : "isi",
      cuplikan: cuplikan
    });
  }

  // 1) yang cocok di judul (termasuk judul+isi) dulu; 2) diubah terbaru.
  matches.sort(function (a, b) {
    var aj = a.cocok.indexOf("judul") !== -1 ? 0 : 1;
    var bj = b.cocok.indexOf("judul") !== -1 ? 0 : 1;
    if (aj !== bj) return aj - bj;
    if (a.diubah === b.diubah) return 0;
    return a.diubah < b.diubah ? 1 : -1;
  });

  var total = matches.length;
  return {
    items: matches.slice(0, SEARCH_MAX),
    total: total,
    terpotong: total > SEARCH_MAX
  };
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
