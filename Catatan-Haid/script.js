/* ============================================================
 * script.js — Catatan Haid (MoroalMora/Catatan-Haid)
 *
 * - Fetch ke GAS Web App: GET ?action=... dan POST JSON (pola
 *   sama seperti Work/Pencatatan-Buku-Kas/Riwayat/script.js).
 * - Reminder via ntfy.sh topic "reminderme" dengan scheduled
 *   delivery header "In: <detik>s" (pola persis Work/Reminder).
 * - Bar chart riwayat siklus: SVG native, tanpa library eksternal.
 * - Download CSV: digenerate client-side dari data yang sudah difetch.
 * ============================================================ */

const $ = (id) => document.getElementById(id);
const PLACEHOLDER = "ISI_SETELAH_DEPLOY";
const IS_CONFIGURED = typeof GAS_WEB_APP_URL === "string" &&
  GAS_WEB_APP_URL !== PLACEHOLDER && GAS_WEB_APP_URL.indexOf("https://") === 0;

/* ── ntfy ── */
const NTFY_TOPIC = "reminderme";
const NTFY_URL = "https://ntfy.sh/" + NTFY_TOPIC;
const MIN_SECONDS = 10;
const MAX_SECONDS = 259200; // 3 hari — limit scheduled delivery di public ntfy.sh

/* ── State ── */
const state = { cycles: [], catatan: [], kalkulasi: null };

/* ── Util ── */
function pad2(n) { return String(n).padStart(2, "0"); }
function todayIso() {
  const d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}
// "yyyy-MM-dd" -> Date jam 09:00 waktu lokal (stabil utk hitung selisih hari)
function parseIsoDate(iso) {
  const p = iso.split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2], 9, 0, 0);
}
function fmtTanggal(iso) { // -> "dd/MM/yyyy"
  if (!iso) return "—";
  const p = iso.split("-");
  return p[2] + "/" + p[1] + "/" + p[0];
}
function fmtTanggalPendek(iso) { // -> "dd/MM"
  if (!iso) return "—";
  const p = iso.split("-");
  return p[2] + "/" + p[1];
}
function relHari(iso) {
  const days = Math.round((parseIsoDate(iso).getTime() - Date.now()) / 86400000);
  if (days < 0) return Math.abs(days) + " hari lalu";
  if (days === 0) return "hari ini";
  return days + " hari lagi";
}
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function fmtDurasi(sec) {
  if (sec < 60) return sec + " detik";
  const m = Math.floor(sec / 60);
  if (m < 60) return m + " menit";
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm === 0 ? h + " jam" : h + " jam " + rm + " menit";
}

/* ── Toast ── */
let toastTimer = null;
function showToast(msg, type, ms) {
  $("toast").className = "toast show " + (type || "info");
  const icon = type === "ok" ? "ti-circle-check" : type === "err" ? "ti-alert-circle" : "ti-info-circle";
  $("toastIcon").className = "ti " + icon;
  $("toastMsg").textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $("toast").className = "toast"; }, ms || 4000);
}

/* ── API (GAS Web App) ── */
async function apiGet(action) {
  const res = await fetch(GAS_WEB_APP_URL + "?action=" + encodeURIComponent(action));
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if (data.status === "error") throw new Error(data.message || "Terjadi kesalahan.");
  return data;
}

async function apiPost(payload) {
  const res = await fetch(GAS_WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if (data.status === "error") throw new Error(data.message || "Terjadi kesalahan.");
  return data;
}

/* ── Load & render semua ── */
function setBusy(busy) {
  $("siklusSubmitBtn").disabled = busy;
  $("catatanSubmitBtn").disabled = busy;
}

async function loadAll() {
  setBusy(true);
  try {
    const [s, c, k] = await Promise.all([
      apiGet("getSiklus"),
      apiGet("getCatatan"),
      apiGet("getKalkulasi")
    ]);
    state.cycles = s.rows || [];
    state.catatan = c.rows || [];
    state.kalkulasi = k;
    renderSiklus(state.cycles);
    renderCatatan(state.catatan);
    renderKalkulasi(state.kalkulasi);
    $("infoLine").textContent = state.cycles.length + " siklus · " + state.catatan.length + " catatan";
  } catch (err) {
    showToast("Gagal memuat data: " + err.message, "err", 6000);
    $("infoLine").textContent = "error";
  } finally {
    setBusy(false);
  }
}

/* ── Kalkulasi kesuburan ── */
function renderKalkulasi(k) {
  $("calcInsufficient").classList.remove("show");
  $("calcUnstable").classList.remove("show");
  if (!k) return;

  if (k.status !== "ok") {
    $("calcInsufficientMsg").textContent = k.message || "Kalkulasi gagal.";
    $("calcInsufficient").classList.add("show");
    $("calcBody").hidden = true;
    return;
  }

  $("calcBody").hidden = false;
  $("ccStartDate").innerHTML = fmtTanggal(k.fertileStartDate) + '<span class="rel">' + relHari(k.fertileStartDate) + "</span>";
  $("ccEndDate").innerHTML = fmtTanggal(k.fertileEndDate) + '<span class="rel">' + relHari(k.fertileEndDate) + "</span>";
  $("ccNextDate").innerHTML = fmtTanggal(k.nextPeriodDate) + '<span class="rel">' + relHari(k.nextPeriodDate) + "</span>";

  $("stShortest").textContent = k.shortestCycle;
  $("stLongest").textContent = k.longestCycle;
  $("stAvg").textContent = k.avgCycle;
  $("stFertile").textContent = k.fertileStartDay;
  $("stFertile2").textContent = k.fertileEndDay;

  if (k.unstable) {
    $("calcUnstableDetail").textContent =
      "Rentang siklus " + k.shortestCycle + "–" + k.longestCycle + " hari (selisih " +
      (k.longestCycle - k.shortestCycle) + " hari). Tanggal di bawah hanya estimasi kasar, bukan kepastian.";
    $("calcUnstable").classList.add("show");
  }
}

/* ── Riwayat siklus: bar chart SVG + list ── */
function renderChart(cyclesAsc) {
  const data = cyclesAsc
    .filter(function (r) {
      return r.panjangSiklus !== "" && r.panjangSiklus !== null &&
        r.panjangSiklus !== undefined && !isNaN(Number(r.panjangSiklus));
    })
    .map(function (r) {
      return { label: fmtTanggalPendek(r.tanggalMulai), full: fmtTanggal(r.tanggalMulai), value: Number(r.panjangSiklus) };
    });

  const wrap = $("chartWrap");
  if (data.length === 0) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const W = 720, H = 230;
  const PAD = { l: 38, r: 16, t: 18, b: 32 };
  const cw = W - PAD.l - PAD.r;
  const ch = H - PAD.t - PAD.b;

  let maxVal = 40;
  data.forEach(function (d) { if (d.value > maxVal) maxVal = d.value; });
  maxVal = Math.ceil(maxVal / 10) * 10;

  const y = (v) => PAD.t + ch - (v / maxVal) * ch;
  const x = (i) => PAD.l + (i + 0.5) * (cw / data.length);

  const parts = [];

  // Grid + label sumbu Y
  [0, 0.5, 1].forEach(function (f) {
    const v = maxVal * f;
    const yy = y(v);
    parts.push('<line x1="' + PAD.l + '" y1="' + yy + '" x2="' + (W - PAD.r) + '" y2="' + yy + '" stroke="#2a2f45" stroke-width="1"/>');
    parts.push('<text x="' + (PAD.l - 8) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="10" fill="#565f89" font-family="JetBrains Mono, monospace">' + Math.round(v) + "</text>");
  });

  // Garis batas normal (21 & 35 hari)
  [21, 35].forEach(function (v) {
    const yy = y(v);
    parts.push('<line x1="' + PAD.l + '" y1="' + yy + '" x2="' + (W - PAD.r) + '" y2="' + yy + '" stroke="#565f89" stroke-width="1" stroke-dasharray="4 4" opacity="0.7"/>');
    parts.push('<text x="' + (W - PAD.r + 5) + '" y="' + (yy + 4) + '" font-size="9" fill="#565f89" font-family="JetBrains Mono, monospace">' + v + "</text>");
  });

  // Bar
  const labelStep = Math.max(1, Math.ceil(data.length / 8));
  data.forEach(function (d, i) {
    const bw = Math.min(42, (cw / data.length) * 0.62);
    const bx = x(i) - bw / 2;
    const by = y(d.value);
    const inRange = d.value >= 21 && d.value <= 35;
    const color = inRange ? "#9ece6a" : "#e0af68";
    parts.push(
      '<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + (ch - (by - PAD.t)) +
      '" rx="4" fill="' + color + '" opacity="0.9"><title>' + d.full + " — siklus " + d.value + " hari</title></rect>"
    );
    parts.push('<text x="' + x(i) + '" y="' + (by - 5) + '" text-anchor="middle" font-size="10" fill="#a9b1d6" font-family="JetBrains Mono, monospace">' + d.value + "</text>");
    if (data.length <= 12 || i === 0 || i === data.length - 1 || i % labelStep === 0) {
      parts.push('<text x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="9.5" fill="#565f89" font-family="JetBrains Mono, monospace">' + d.label + "</text>");
    }
  });

  $("cycleChart").innerHTML = parts.join("");
}

function renderSiklus(cyclesAsc) {
  renderChart(cyclesAsc);
  const listEl = $("cycList");
  $("siklusEmpty").hidden = cyclesAsc.length > 0;
  listEl.innerHTML = "";

  // Terbaru dulu
  const reversed = cyclesAsc.slice().reverse();
  reversed.forEach(function (r) {
    const len = (r.panjangSiklus === "" || r.panjangSiklus === null) ? null : Number(r.panjangSiklus);
    const lenBadge = len === null
      ? '<span class="cyc-len none">siklus pertama</span>'
      : (len >= 21 && len <= 35
          ? '<span class="cyc-len">' + len + " hari</span>"
          : '<span class="cyc-len warn">' + len + " hari ⚠</span>");

    const row = document.createElement("div");
    row.className = "cyc-row";
    row.innerHTML =
      '<div class="cyc-main">' +
        '<div class="cyc-top">' +
          '<span class="cyc-id">#' + r.id + "</span>" +
          '<span class="cyc-date">Mulai ' + fmtTanggal(r.tanggalMulai) + "</span>" +
          lenBadge +
          (r.tanggalSelesai ? '<span class="cyc-len" style="color:var(--text-dim)">selesai ' + fmtTanggal(r.tanggalSelesai) + "</span>" : "") +
        "</div>" +
        (r.catatanSingkat ? '<div class="cyc-note">' + escapeHtml(r.catatanSingkat) + "</div>" : "") +
      "</div>" +
      '<div class="cyc-selesai">' +
        '<input type="date" value="' + (r.tanggalSelesai || "") + '" aria-label="Tanggal selesai siklus #' + r.id + '">' +
        '<button type="button" class="btn btn-ghost btn-sm" title="Simpan tanggal selesai"><i class="ti ti-check"></i></button>' +
      "</div>";

    const input = row.querySelector("input[type=date]");
    const btn = row.querySelector("button");
    btn.addEventListener("click", async function () {
      const val = input.value;
      if (!val) { showToast("Pilih tanggal selesai dulu.", "err"); return; }
      btn.disabled = true;
      try {
        await apiPost({ action: "updateSiklus", id: r.id, tanggalSelesai: val });
        showToast("Tanggal selesai siklus #" + r.id + " tersimpan ✓", "ok");
        await loadAll();
      } catch (err) {
        showToast("Gagal simpan tanggal selesai: " + err.message, "err");
      } finally {
        btn.disabled = false;
      }
    });
    listEl.appendChild(row);
  });
}

/* ── Catatan & anomali ── */
function renderCatatan(rows) {
  const listEl = $("catList");
  $("catatanEmpty").hidden = rows.length > 0;
  listEl.innerHTML = "";

  rows.forEach(function (r) {
    const row = document.createElement("div");
    row.className = "cat-row" + (r.anomali ? " anomali" : "");
    const badgeAno = r.anomali
      ? '<span class="cat-badge ano">ANOMALI</span>'
      : '<span class="cat-badge norm">normal</span>';
    const badgeSrc = '<span class="cat-badge src">' + (r.sumber === "auto" ? "auto" : "manual") + "</span>";
    row.innerHTML =
      badgeAno + badgeSrc +
      '<div class="cat-body">' +
        '<div class="cat-date">' + fmtTanggal(r.tanggal) + " · #" + r.id + "</div>" +
        '<div class="cat-isi">' + escapeHtml(r.isi) + "</div>" +
      "</div>";
    listEl.appendChild(row);
  });
}

/* ── Reminder via ntfy (scheduled push, header "In: <detik>s") ── */
async function setReminder(targetIso, title, msg) {
  if (!targetIso) { showToast("Belum ada tanggal target untuk reminder.", "err"); return; }
  let seconds = Math.floor((parseIsoDate(targetIso).getTime() - Date.now()) / 1000);
  if (seconds < 0) {
    showToast("Tanggal target sudah lewat (" + fmtTanggal(targetIso) + ") — reminder dibatalkan. Pilih tanggal yang masih akan datang.", "err", 6000);
    return;
  }
  if (seconds < MIN_SECONDS) seconds = MIN_SECONDS;
  if (seconds > MAX_SECONDS) {
    showToast(
      "Reminder max 3 hari ke depan — target " + fmtTanggal(targetIso) +
      " masih " + fmtDurasi(seconds) + ". Set reminder manual lebih dekat ke tanggalnya.",
      "err", 7000
    );
    return;
  }
  try {
    const res = await fetch(NTFY_URL, {
      method: "POST",
      body: msg,
      headers: { "Title": title, "In": seconds + "s" }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    showToast("Reminder terkirim ✓ — berbunyi dalam " + fmtDurasi(seconds) + " (ntfy.sh/" + NTFY_TOPIC + ")", "ok", 6000);
  } catch (err) {
    showToast("Gagal kirim reminder: " + err.message, "err");
  }
}

function bindReminderButtons() {
  $("remStartBtn").addEventListener("click", function () {
    const k = state.kalkulasi;
    if (!k || k.status !== "ok") { showToast("Kalkulasi belum tersedia.", "err"); return; }
    setReminder(k.fertileStartDate, "Catatan Haid — Mulai Masa Subur",
      "🌸 Mulai masa subur diperkirakan: " + fmtTanggal(k.fertileStartDate));
  });
  $("remEndBtn").addEventListener("click", function () {
    const k = state.kalkulasi;
    if (!k || k.status !== "ok") { showToast("Kalkulasi belum tersedia.", "err"); return; }
    setReminder(k.fertileEndDate, "Catatan Haid — Akhir Masa Subur",
      "🌷 Akhir masa subur diperkirakan: " + fmtTanggal(k.fertileEndDate));
  });
  $("remNextBtn").addEventListener("click", function () {
    const k = state.kalkulasi;
    if (!k || k.status !== "ok") { showToast("Kalkulasi belum tersedia.", "err"); return; }
    setReminder(k.nextPeriodDate, "Catatan Haid — Estimasi Haid Berikutnya",
      "🩸 Estimasi haid berikutnya: " + fmtTanggal(k.nextPeriodDate));
  });
}

/* ── Download CSV (client-side) ── */
function csvEscape(value) {
  const s = String(value == null ? "" : value);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadCsv(filename, header, rows) {
  if (!rows.length) { showToast("Tidak ada data untuk " + filename + ".", "err"); return; }
  const lines = [header.map(csvEscape).join(",")];
  rows.forEach(function (r) { lines.push(r.map(csvEscape).join(",")); });
  const csv = "\uFEFF" + lines.join("\r\n"); // BOM + \r\n → aman di Excel/Sheets
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  showToast("Download " + filename + " dimulai (" + rows.length + " baris).", "ok");
}

$("dlSiklusBtn").addEventListener("click", function () {
  const rows = state.cycles.map(function (r) {
    return [r.id, r.tanggalMulai, r.tanggalSelesai || "", r.panjangSiklus === "" ? "" : r.panjangSiklus, r.catatanSingkat || ""];
  });
  downloadCsv("Siklus.csv", ["ID", "TanggalMulai", "TanggalSelesai", "PanjangSiklus", "CatatanSingkat"], rows);
});

$("dlCatatanBtn").addEventListener("click", function () {
  const rows = state.catatan.map(function (r) {
    return [r.id, r.tanggal, r.isi, r.anomali ? "TRUE" : "FALSE", r.sumber];
  });
  downloadCsv("Catatan.csv", ["ID", "Tanggal", "Isi", "Anomali", "Sumber"], rows);
});

/* ── Form: siklus baru ── */
$("siklusForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const mulai = $("tmMulai").value;
  if (!mulai) { showToast("Pilih tanggal mulai haid dulu.", "err"); return; }

  const btn = $("siklusSubmitBtn");
  btn.disabled = true;
  try {
    const res = await apiPost({
      action: "addSiklus",
      tanggalMulai: mulai,
      tanggalSelesai: $("tmSelesai").value || "",
      catatanSingkat: $("tmCatatan").value.trim()
    });
    let msg = "Siklus tersimpan ✓ · PanjangSiklus: " +
      (res.panjangSiklus ? res.panjangSiklus + " hari" : "— (entri pertama)");
    const adaAnomali = res.anomali && res.anomali.length > 0;
    if (adaAnomali) msg += " · ⚠ " + res.anomali.length + " anomali dicatat otomatis";
    showToast(msg, adaAnomali ? "err" : "ok", 6000);
    e.target.reset();
    await loadAll();
  } catch (err) {
    showToast("Gagal simpan siklus: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

/* ── Form: catatan ── */
$("catatanForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const tanggal = $("ctTanggal").value;
  const isi = $("ctIsi").value.trim();
  if (!tanggal) { showToast("Pilih tanggal catatan dulu.", "err"); return; }
  if (!isi) { showToast("Isi catatan tidak boleh kosong.", "err"); return; }

  const btn = $("catatanSubmitBtn");
  btn.disabled = true;
  try {
    await apiPost({
      action: "addCatatan",
      tanggal: tanggal,
      isi: isi,
      anomali: $("ctAnomali").checked
    });
    showToast("Catatan tersimpan ✓", "ok");
    $("ctIsi").value = "";
    $("ctAnomali").checked = false;
    await loadAll();
  } catch (err) {
    showToast("Gagal simpan catatan: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

/* ── Init ── */
function init() {
  $("ctTanggal").value = todayIso();

  if (!IS_CONFIGURED) {
    $("setupBanner").classList.add("show");
    $("infoLine").textContent = "config.js belum diisi";
    document.querySelectorAll("button, input, textarea").forEach(function (el) { el.disabled = true; });
    showToast("config.js masih placeholder — deploy GAS dulu lalu isi GAS_WEB_APP_URL (lihat README).", "err", 8000);
    return;
  }

  bindReminderButtons();
  loadAll();
}

init();
