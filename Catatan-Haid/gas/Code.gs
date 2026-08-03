/**
 * Code.gs — Backend Google Sheets (Apps Script Web App) untuk Catatan Haid
 * Lokasi: MoroalMora/Catatan-Haid/gas/Code.gs
 *
 * Melayani frontend (index.html + script.js):
 *   GET  ?action=getSiklus     → seluruh histori siklus (urut kronologis naik)
 *   GET  ?action=getCatatan    → seluruh catatan (terbaru dulu)
 *   GET  ?action=getKalkulasi  → hasil kalkulasi kesuburan adaptif (real-time)
 *   POST {action:addSiklus}    → simpan entri siklus baru + hitung PanjangSiklus
 *                                + auto-flag anomali (Sumber=auto)
 *   POST {action:updateSiklus} → isi TanggalSelesai untuk ID tertentu + cek durasi anomali
 *   POST {action:addCatatan}   → simpan catatan manual
 *
 * DESAIN: TIDAK memakai time-based trigger / ScriptApp.newTrigger apa pun.
 * Reminder dikirim dari sisi client (browser) via ntfy.sh scheduled push
 * (header "In: <detik>s") — lihat Work/Reminder/script.js sebagai referensi pola.
 */

// ── Nama sheet & header kolom ──────────────────────────────────────────────
const SHEET_SIKLUS = "Siklus";
const SHEET_CATATAN = "Catatan";
const HEADER_SIKLUS = ["ID", "TanggalMulai", "TanggalSelesai", "PanjangSiklus", "CatatanSingkat"];
const HEADER_CATATAN = ["ID", "Tanggal", "Isi", "Anomali", "Sumber"];

// ── Parameter kalkulasi & anomali ──────────────────────────────────────────
const MIN_ENTRI = 3;            // minimal entri siklus utk kalkulasi adaptif
const RENTANG_MIN = 21;         // panjang siklus normal minimum (hari)
const RENTANG_MAX = 35;         // panjang siklus normal maksimum (hari)
const DURASI_MAX = 8;           // durasi haid normal maksimum (hari)
const AMBANG_STABIL = 10;       // selisih longest-shortest > 10 → siklus tidak stabil
const TIMEZONE = "Asia/Jakarta";
const DAY_MS = 86400000;

// ═══════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

function doGet(e) {
  const action = (e && e.parameter) ? e.parameter.action : "";
  if (action === "getSiklus") return jsonOut_(handleGetSiklus_());
  if (action === "getCatatan") return jsonOut_(handleGetCatatan_());
  if (action === "getKalkulasi") return jsonOut_(handleGetKalkulasi_());
  return jsonOut_({ status: "error", message: "Action tidak dikenal: " + action });
}

function doPost(e) {
  const data = JSON.parse((e && e.postData) ? e.postData.contents : "{}");
  const action = data.action || "";
  if (action === "addSiklus") return handleAddSiklus_(data);
  if (action === "updateSiklus") return handleUpdateSiklus_(data);
  if (action === "addCatatan") return handleAddCatatan_(data);
  return jsonOut_({ status: "error", message: "Action tidak dikenal: " + action });
}

// ═══════════════════════════════════════════════════════════════════════════
// GET HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/** Semua histori siklus, urut TanggalMulai naik (frontend bisa balik utk tampilan). */
function handleGetSiklus_() {
  const rows = readSiklusRows_();
  return {
    status: "ok",
    count: rows.length,
    rows: rows.map(function (r) {
      return {
        id: r.id,
        tanggalMulai: fmtDate_(r.tanggalMulai),
        tanggalSelesai: r.tanggalSelesai ? fmtDate_(r.tanggalSelesai) : "",
        panjangSiklus: r.panjangSiklus === null ? "" : r.panjangSiklus,
        catatanSingkat: r.catatanSingkat
      };
    })
  };
}

/** Semua catatan, terbaru dulu (urut ID turun — ID selalu naik). */
function handleGetCatatan_() {
  const sheet = ensureSheets_().catatan;
  const lastRow = sheet.getLastRow();
  const rows = [];
  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, HEADER_CATATAN.length).getValues();
    values.forEach(function (v) {
      rows.push({
        id: Number(v[0]),
        tanggal: String(v[1] || ""),
        isi: String(v[2] || ""),
        anomali: String(v[3] || "") === "TRUE",
        sumber: String(v[4] || "manual")
      });
    });
    rows.sort(function (a, b) { return b.id - a.id; }); // terbaru dulu
  }
  return { status: "ok", count: rows.length, rows: rows };
}

/** Kalkulasi kesuburan adaptif (Ogino-Knaus) — dihitung real-time dari histori. */
function handleGetKalkulasi_() {
  return computeKalkulasi_(readSiklusRows_());
}

// ═══════════════════════════════════════════════════════════════════════════
// POST HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/** Simpan entri siklus baru. PanjangSiklus dihitung dari TanggalMulai entri sebelumnya. */
function handleAddSiklus_(data) {
  const tanggalMulai = parseDateStr_(String(data.tanggalMulai || "").trim());
  if (!tanggalMulai || isNaN(tanggalMulai.getTime())) {
    return jsonOut_({ status: "error", message: "Tanggal mulai wajib diisi (format yyyy-MM-dd)." });
  }
  const selesaiStr = String(data.tanggalSelesai || "").trim();
  const tanggalSelesai = selesaiStr ? parseDateStr_(selesaiStr) : null;
  if (tanggalSelesai && tanggalSelesai.getTime() < tanggalMulai.getTime()) {
    return jsonOut_({ status: "error", message: "Tanggal selesai tidak boleh sebelum tanggal mulai." });
  }
  const catatanSingkat = String(data.catatanSingkat || "").trim();

  const sheet = ensureSheets_().siklus;
  const prev = readSiklusRows_().reduce(function (acc, r) {
    // Entri sebelumnya = entri dengan TanggalMulai terbesar yang lebih awal dari entri ini
    return (r.tanggalMulai.getTime() < tanggalMulai.getTime()) ? r : acc;
  }, null);

  const panjangSiklus = prev ? diffDays_(prev.tanggalMulai, tanggalMulai) : null;

  const id = nextId_(sheet, HEADER_SIKLUS.length);
  sheet.appendRow([
    id,
    fmtDate_(tanggalMulai),
    tanggalSelesai ? fmtDate_(tanggalSelesai) : "",
    panjangSiklus === null ? "" : panjangSiklus,
    catatanSingkat
  ]);

  // ── Auto-flag anomali (Sumber=auto) saat entri siklus disimpan ───────────
  const anomali = [];
  if (tanggalSelesai) {
    const durasi = diffDays_(tanggalMulai, tanggalSelesai);
    if (durasi > DURASI_MAX) {
      anomali.push("Durasi haid " + durasi + " hari, di atas rentang normal (maks " + DURASI_MAX + " hari).");
    }
  }
  if (panjangSiklus !== null && (panjangSiklus < RENTANG_MIN || panjangSiklus > RENTANG_MAX)) {
    anomali.push("Panjang siklus " + panjangSiklus + " hari, di luar rentang normal (" + RENTANG_MIN + "\u2013" + RENTANG_MAX + " hari).");
  }
  anomali.forEach(function (isi) {
    autoLogAnomali_(tanggalMulai, isi);
  });

  return jsonOut_({ status: "ok", id: id, panjangSiklus: panjangSiklus, anomali: anomali });
}

/** Isi TanggalSelesai untuk entri siklus dengan ID tertentu. */
function handleUpdateSiklus_(data) {
  const id = Number(data.id);
  if (!id || isNaN(id)) {
    return jsonOut_({ status: "error", message: "ID siklus wajib diisi." });
  }
  const selesaiStr = String(data.tanggalSelesai || "").trim();
  const tanggalSelesai = parseDateStr_(selesaiStr);
  if (!tanggalSelesai || isNaN(tanggalSelesai.getTime())) {
    return jsonOut_({ status: "error", message: "Tanggal selesai wajib diisi (format yyyy-MM-dd)." });
  }

  const sheet = ensureSheets_().siklus;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonOut_({ status: "error", message: "Belum ada data siklus." });

  const values = sheet.getRange(2, 1, lastRow - 1, HEADER_SIKLUS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    if (Number(values[i][0]) === id) {
      const row = i + 2;
      const tanggalMulai = parseDateStr_(String(values[i][1] || "").trim());
      if (tanggalMulai && tanggalSelesai.getTime() < tanggalMulai.getTime()) {
        return jsonOut_({ status: "error", message: "Tanggal selesai tidak boleh sebelum tanggal mulai." });
      }
      sheet.getRange(row, 3).setValue(fmtDate_(tanggalSelesai));

      // Cek durasi haid saat TanggalSelesai diisi
      const anomali = [];
      if (tanggalMulai && !isNaN(tanggalMulai.getTime())) {
        const durasi = diffDays_(tanggalMulai, tanggalSelesai);
        if (durasi > DURASI_MAX) {
          const isi = "Durasi haid " + durasi + " hari, di atas rentang normal (maks " + DURASI_MAX + " hari).";
          anomali.push(isi);
          autoLogAnomali_(tanggalMulai, isi);
        }
      }
      return jsonOut_({ status: "ok", anomali: anomali });
    }
  }
  return jsonOut_({ status: "error", message: "Siklus dengan ID " + id + " tidak ditemukan." });
}

/** Simpan catatan manual (Anomali sesuai pilihan user, Sumber=manual). */
function handleAddCatatan_(data) {
  const tanggal = parseDateStr_(String(data.tanggal || "").trim());
  if (!tanggal || isNaN(tanggal.getTime())) {
    return jsonOut_({ status: "error", message: "Tanggal wajib diisi (format yyyy-MM-dd)." });
  }
  const isi = String(data.isi || "").trim();
  if (!isi) return jsonOut_({ status: "error", message: "Isi catatan wajib diisi." });
  const anomali = (data.anomali === true || data.anomali === "true" || data.anomali === "TRUE");

  const sheet = ensureSheets_().catatan;
  const id = nextId_(sheet, HEADER_CATATAN.length);
  sheet.appendRow([id, fmtDate_(tanggal), isi, anomali ? "TRUE" : "FALSE", "manual"]);
  return jsonOut_({ status: "ok", id: id });
}

// ═══════════════════════════════════════════════════════════════════════════
// KALKULASI KESUBURAN (metode kalender Ogino-Knaus)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hitung kalkulasi adaptif dari histori siklus.
 * Rumus:
 *   shortestCycle  = panjang siklus terpendek di seluruh histori
 *   longestCycle   = panjang siklus terpanjang di seluruh histori
 *   fertileStartDay = shortestCycle - 18
 *   fertileEndDay   = longestCycle - 11
 *   Mulai masa subur  = TanggalMulai siklus TERAKHIR + (fertileStartDay - 1) hari
 *   Akhir masa subur  = TanggalMulai siklus TERAKHIR + (fertileEndDay - 1) hari
 *   Estimasi haid berikutnya = TanggalMulai siklus TERAKHIR + rata-rata PanjangSiklus
 *
 * @param {Array} rows histori siklus (hasil readSiklusRows_, urut naik)
 */
function computeKalkulasi_(rows) {
  const count = rows.length;
  if (count < MIN_ENTRI) {
    return {
      status: "insufficient",
      count: count,
      message: "Data belum cukup untuk kalkulasi adaptif — minimal butuh " + MIN_ENTRI + " siklus tercatat"
    };
  }

  const panjang = rows
    .map(function (r) { return r.panjangSiklus; })
    .filter(function (p) { return p !== null && !isNaN(p); });

  if (panjang.length === 0) {
    return {
      status: "insufficient",
      count: count,
      message: "Belum ada nilai PanjangSiklus yang bisa dihitung — data siklus belum lengkap"
    };
  }

  let shortest = panjang[0], longest = panjang[0], total = 0;
  panjang.forEach(function (p) {
    if (p < shortest) shortest = p;
    if (p > longest) longest = p;
    total += p;
  });
  const avg = total / panjang.length;

  const fertileStartDay = shortest - 18;
  const fertileEndDay = longest - 11;

  // Siklus tidak stabil kalau rentang shortest-longest terlalu lebar (>10 hari)
  // ATAU fertileStartDay hasil hitung <= 0 (tidak masuk akal).
  const unstable = (longest - shortest) > AMBANG_STABIL || fertileStartDay <= 0;

  const lastStart = rows[count - 1].tanggalMulai; // siklus TERAKHIR (urut naik)

  const fertileStartDate = addDays_(lastStart, fertileStartDay - 1);
  const fertileEndDate = addDays_(lastStart, fertileEndDay - 1);
  const nextPeriodDate = addDays_(lastStart, Math.round(avg));

  return {
    status: "ok",
    count: count,
    shortestCycle: shortest,
    longestCycle: longest,
    avgCycle: Math.round(avg * 10) / 10,
    fertileStartDay: fertileStartDay,
    fertileEndDay: fertileEndDay,
    fertileStartDate: fmtDate_(fertileStartDate),
    fertileEndDate: fmtDate_(fertileEndDate),
    nextPeriodDate: fmtDate_(nextPeriodDate),
    lastStartDate: fmtDate_(lastStart),
    unstable: unstable,
    warning: unstable ? "Siklus tidak stabil, hasil kalkulasi kurang reliable" : ""
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════════════════════════════════════

/** Pastikan sheet "Siklus" & "Catatan" ada (dibuat otomatis kalau belum). */
function ensureSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let siklus = ss.getSheetByName(SHEET_SIKLUS);
  if (!siklus) {
    siklus = ss.insertSheet(SHEET_SIKLUS);
    siklus.appendRow(HEADER_SIKLUS);
  }
  let catatan = ss.getSheetByName(SHEET_CATATAN);
  if (!catatan) {
    catatan = ss.insertSheet(SHEET_CATATAN);
    catatan.appendRow(HEADER_CATATAN);
  }
  return { siklus: siklus, catatan: catatan };
}

/** Baca semua baris sheet Siklus → array objek, urut TanggalMulai naik. */
function readSiklusRows_() {
  const sheet = ensureSheets_().siklus;
  const lastRow = sheet.getLastRow();
  const rows = [];
  if (lastRow < 2) return rows;

  const values = sheet.getRange(2, 1, lastRow - 1, HEADER_SIKLUS.length).getValues();
  values.forEach(function (v) {
    const mulai = parseDateStr_(String(v[1] || "").trim());
    if (!mulai || isNaN(mulai.getTime())) return; // TanggalMulai tidak valid — lewati

    const selesai = parseDateStr_(String(v[2] || "").trim());
    const rawPanjang = String(v[3] || "").trim();
    const panjang = rawPanjang === "" ? null : Number(rawPanjang);

    rows.push({
      id: Number(v[0]),
      tanggalMulai: mulai,
      tanggalSelesai: selesai,
      panjangSiklus: (panjang !== null && !isNaN(panjang)) ? panjang : null,
      catatanSingkat: String(v[4] || "").trim()
    });
  });

  rows.sort(function (a, b) { return a.tanggalMulai.getTime() - b.tanggalMulai.getTime(); });
  return rows;
}

/** Tambah baris catatan anomali otomatis (Sumber=auto, Anomali=TRUE). */
function autoLogAnomali_(tanggal, isi) {
  const sheet = ensureSheets_().catatan;
  const id = nextId_(sheet, HEADER_CATATAN.length);
  sheet.appendRow([id, fmtDate_(tanggal), isi, "TRUE", "auto"]);
}

/** ID berikutnya = max ID yang ada + 1. */
function nextId_(sheet, numCols) {
  const lastRow = sheet.getLastRow();
  let maxId = 0;
  if (lastRow >= 2) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    ids.forEach(function (r) {
      const n = Number(r[0]);
      if (!isNaN(n) && n > maxId) maxId = n;
    });
  }
  return maxId + 1;
}

/** Parse "yyyy-MM-dd" → Date (anchor UTC noon, aman lintas timezone). */
function parseDateStr_(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
  if (!y || !mo || !d) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
}

/** Date → "yyyy-MM-dd" (Asia/Jakarta). */
function fmtDate_(d) {
  if (!d || isNaN(d.getTime())) return "";
  return Utilities.formatDate(d, TIMEZONE, "yyyy-MM-dd");
}

/** Selisih hari (to - from). */
function diffDays_(from, to) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** Tambah n hari. */
function addDays_(d, n) {
  return new Date(d.getTime() + n * DAY_MS);
}

/** Output JSON standar untuk Apps Script Web App. */
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
