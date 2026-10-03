/**
 * script.js — dashboard Read-Dashboard.
 *
 * Keamanan konten: semua data dari Sheet dimasukkan lewat textContent /
 * setAttribute (tidak pernah innerHTML), karena konten Sheet tidak dipercaya.
 */
(function () {
  "use strict";

  /** Harus sama dengan batas di Apps-Script/code.gs.js. */
  var MAX_JUDUL = 200;
  var MAX_ISI = 45000;
  var MAX_JUDUL_DARI_BARIS = 80;
  /** Byte file mustahil muat dalam batas 45.000 karakter UTF-8 (4 byte/karakter). */
  var MAX_BYTES = 200000;

  var BINARY_MIME_PREFIXES = ["image/", "audio/", "video/"];
  var BINARY_EXTS = [
    "pdf", "zip", "rar", "7z", "gz", "tgz", "tar", "bz2", "xz",
    "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp",
    "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "tif", "tiff", "svg",
    "mp3", "wav", "ogg", "flac", "m4a", "aac",
    "mp4", "mov", "avi", "mkv", "webm",
    "exe", "dll", "so", "apk", "dmg", "iso", "bin", "wasm",
    "woff", "woff2", "ttf", "otf", "eot",
    "class", "jar", "pyc", "db", "sqlite"
  ];

  var dropzone = document.getElementById("dropzone");
  var fileInput = document.getElementById("file-input");
  var pasteForm = document.getElementById("paste-form");
  var judulInput = document.getElementById("judul-input");
  var isiInput = document.getElementById("isi-input");
  var tipeInput = document.getElementById("tipe-input");
  var saveBtn = document.getElementById("save-btn");
  var statusEl = document.getElementById("status");
  var summaryEl = document.getElementById("summary");
  var docList = document.getElementById("doc-list");
  var errorMsg = document.getElementById("error-msg");
  var setupMsg = document.getElementById("setup-msg");
  var retryBtn = document.getElementById("retry-btn");
  var deleteDialog = document.getElementById("delete-dialog");
  var deleteDialogText = document.getElementById("delete-dialog-text");
  var deleteCancel = document.getElementById("delete-cancel");
  var deleteConfirm = document.getElementById("delete-confirm");
  var searchInput = document.getElementById("search-input");
  var searchClear = document.getElementById("search-clear");
  var searchStatus = document.getElementById("search-status");
  var searchErrorMsg = document.getElementById("search-error-msg");
  var searchRetryBtn = document.getElementById("search-retry-btn");
  var noresultMsg = document.getElementById("noresult-msg");

  var STATE_IDS = {
    loading: "state-loading",
    empty: "state-empty",
    error: "state-error",
    setup: "state-setup",
    searching: "state-searching",
    noresult: "state-noresult",
    searchError: "state-search-error",
    list: "doc-list"
  };

  var pendingDelete = null;
  var busy = false;
  var saveLabel = saveBtn.textContent;

  /* ----------------------------------------------------------- Util */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function errText(err) {
    return (err && err.message) || String(err);
  }

  function extOf(nama) {
    var m = /\.([^.]+)$/.exec(nama || "");
    return m ? m[1].toLowerCase() : "";
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || "");
    try {
      return (
        d.toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric"
        }) +
        " " +
        d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
      );
    } catch (e) {
      return String(iso || "");
    }
  }

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    statusEl.classList.toggle("is-error", !!isError);
  }

  function showState(name, message) {
    Object.keys(STATE_IDS).forEach(function (key) {
      document.getElementById(STATE_IDS[key]).hidden = key !== name;
    });
    if (name === "error" && message) errorMsg.textContent = message;
    if (name === "searchError" && message) searchErrorMsg.textContent = message;
    if (name === "noresult" && message) noresultMsg.textContent = message;
  }

  function setBusy(on) {
    busy = on;
    saveBtn.disabled = on;
    saveBtn.textContent = on ? "Memproses…" : saveLabel;
  }

  /** Judul: dari input, atau baris pertama isi, atau "Tanpa judul". */
  function deriveTitle(rawJudul, isi) {
    var t = String(rawJudul || "").trim();
    if (t) return t.length > MAX_JUDUL ? t.slice(0, MAX_JUDUL) : t;

    var lines = String(isi || "").split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var cleaned = line.replace(/^[\s#]+/, "").trim().slice(0, MAX_JUDUL_DARI_BARIS);
      if (cleaned) return cleaned;
    }
    return "Tanpa judul";
  }

  /* ------------------------------------------------------ Muat daftar */

  async function loadList() {
    if (!ReadDashAPI.isConfigured()) {
      showState("setup");
      return;
    }
    showState("loading");
    try {
      var docs = await ReadDashAPI.list();
      lastDocs = docs || [];
      if (!lastDocs || lastDocs.length === 0) {
        showState("empty");
        return;
      }
      renderList(lastDocs);
      showState("list");
    } catch (err) {
      showState("error", errText(err));
    }
  }

  function renderList(docs) {
    docList.replaceChildren();
    docs.forEach(function (doc) {
      docList.appendChild(buildCard(doc));
    });
  }

  function buildCard(doc, opts) {
    var id = String(doc.id || "");
    var judul = String(doc.judul || "Tanpa judul");
    var readHref = "Read/index.html?id=" + encodeURIComponent(id);
    var editHref = "Edit/index.html?id=" + encodeURIComponent(id);

    var card = el("article", "card");

    var row = el("div", "card-row");

    var title = el("a", "card-title");
    title.href = readHref;
    // Hasil pencarian: sorot token lewat <mark> buatan DOM (bukan innerHTML).
    if (opts && opts.tokens && opts.tokens.length) {
      fillHighlighted(title, judul, opts.tokens);
    } else {
      title.textContent = judul;
    }

    var menuWrap = el("div", "card-menu");
    var menuBtn = el("button", "menu-btn", "\u22EE"); // ⋮
    menuBtn.type = "button";
    menuBtn.setAttribute("aria-haspopup", "menu");
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.setAttribute("aria-label", "Menu dokumen: " + judul);

    var menu = el("div", "menu");
    menu.setAttribute("role", "menu");
    menu.hidden = true;

    var editItem = el("button", null, "Edit");
    editItem.type = "button";
    editItem.setAttribute("role", "menuitem");
    editItem.addEventListener("click", function (e) {
      e.stopPropagation();
      closeMenus(false);
      location.href = editHref;
    });

    var deleteItem = el("button", null, "Hapus");
    deleteItem.type = "button";
    deleteItem.setAttribute("role", "menuitem");
    deleteItem.addEventListener("click", function (e) {
      e.stopPropagation();
      closeMenus(false);
      openDeleteDialog({ id: id, judul: judul });
    });

    menu.appendChild(editItem);
    menu.appendChild(deleteItem);
    menuWrap.appendChild(menuBtn);
    menuWrap.appendChild(menu);

    menuBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var wasOpen = !menu.hidden;
      closeMenus(false);
      if (!wasOpen) {
        menu.hidden = false;
        menuBtn.setAttribute("aria-expanded", "true");
      }
    });

    row.appendChild(title);
    row.appendChild(menuWrap);

    // Pencarian: cuplikan menggantikan preview bila ada.
    var previewText =
      opts && opts.cuplikan ? String(opts.cuplikan) : String(doc.preview || "");
    var preview = el("p", "card-preview");
    if (opts && opts.tokens && opts.tokens.length) {
      fillHighlighted(preview, previewText, opts.tokens);
    } else {
      preview.textContent = previewText;
    }
    if (!previewText.trim()) preview.hidden = true;

    var meta = el("div", "card-meta");
    var time = el("time", null, formatDate(doc.diubah));
    if (doc.diubah) time.setAttribute("datetime", String(doc.diubah));
    var badge = el("span", "badge", String(doc.tipe || "-"));
    meta.appendChild(time);
    meta.appendChild(badge);

    card.appendChild(row);
    card.appendChild(preview);
    card.appendChild(meta);

    // Klik badan kartu -> halaman baca. Klik tombol/menu ⋮ TIDAK ikut navigasi.
    card.addEventListener("click", function (e) {
      var target = e.target;
      if (target && target.closest && target.closest(".card-menu")) return;
      if (target && target.closest && target.closest("a")) return;
      location.href = readHref;
    });

    return card;
  }

  function closeMenus(refocus) {
    var openMenus = document.querySelectorAll(".menu:not([hidden])");
    Array.prototype.forEach.call(openMenus, function (menu) {
      menu.hidden = true;
      var btn = menu.parentNode.querySelector(".menu-btn");
      if (btn) {
        btn.setAttribute("aria-expanded", "false");
        if (refocus) btn.focus();
      }
    });
  }

  // Tutup menu saat klik di luar.
  document.addEventListener("click", function (e) {
    if (e.target && e.target.closest && e.target.closest(".card-menu")) return;
    closeMenus(false);
  });

  // Tutup menu saat Escape.
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenus(true);
  });

  /* --------------------------------------------------------- Pencarian */

  var SEARCH_DEBOUNCE_MS = 300;
  var SEARCH_MIN = 2;
  var FALLBACK_NOTE =
    "Backend belum diperbarui: mencari di judul dan cuplikan saja";

  var lastDocs = null;
  var searchActive = false;
  var searchQuery = "";
  /** Penghitung request: hanya respons terbaru yang dirender. */
  var searchSeq = 0;
  var searchTimer = null;

  /** Normalisasi + token yang SAMA dengan searchCore_ di code.gs.js. */
  function searchTokens(raw) {
    var norm = String(raw === null || raw === undefined ? "" : raw)
      .replace(/\s+/g, " ")
      .replace(/^\s+|\s+$/g, "");
    var tokens = [];
    if (norm.length >= SEARCH_MIN) {
      tokens = norm.split(" ").slice(0, 5).map(function (t) {
        return t.toLowerCase();
      });
    }
    return { norm: norm, tokens: tokens };
  }

  /**
   * Isi node dengan teks + elemen <mark> hasil buatan DOM
   * (textContent / createTextNode) — TIDAK PERNAH innerHTML dari data.
   */
  function fillHighlighted(node, text, tokens) {
    var s = String(text === null || text === undefined ? "" : text);
    if (!tokens || tokens.length === 0 || !s) {
      node.textContent = s;
      return;
    }
    var lower = s.toLowerCase();
    var at = 0;
    while (at < s.length) {
      var best = -1;
      var bestLen = 0;
      for (var i = 0; i < tokens.length; i++) {
        var p = lower.indexOf(tokens[i], at);
        if (p === -1) continue;
        if (
          best === -1 ||
          p < best ||
          (p === best && tokens[i].length > bestLen)
        ) {
          best = p;
          bestLen = tokens[i].length;
        }
      }
      if (best === -1) break;
      if (best > at) {
        node.appendChild(document.createTextNode(s.slice(at, best)));
      }
      var mark = document.createElement("mark");
      mark.textContent = s.slice(best, best + bestLen);
      node.appendChild(mark);
      at = best + bestLen;
    }
    if (at < s.length) node.appendChild(document.createTextNode(s.slice(at)));
  }

  /** Render hasil pencarian ke kartu yang sama (menu ⋮ Edit/Hapus ikut). */
  function renderSearchItems(items, tokens) {
    docList.replaceChildren();
    items.forEach(function (doc) {
      docList.appendChild(
        buildCard(doc, { tokens: tokens, cuplikan: doc.cuplikan || "" })
      );
    });
  }

  /** Kembali ke daftar normal dari data yang sudah dimuat. */
  function showNormalList() {
    if (lastDocs === null) {
      loadList();
      return;
    }
    if (lastDocs.length === 0) {
      showState("empty");
      return;
    }
    renderList(lastDocs);
    showState("list");
  }

  /** Backend lama membalas "Action GET tidak dikenal: search...". */
  function isBackendTooOld(err) {
    return errText(err).toLowerCase().indexOf("tidak dikenal") !== -1;
  }

  function renderSearchData(data, q) {
    var items = (data && data.items) || [];
    var total =
      data && typeof data.total === "number" ? data.total : items.length;
    var terpotong = !!(data && data.terpotong);
    var statusText = total + " hasil";
    if (terpotong) {
      statusText +=
        " \u00B7 menampilkan " + items.length + " dari " + total + " hasil";
    }
    searchStatus.textContent = statusText;
    if (items.length === 0) {
      showState("noresult", 'Tidak ada hasil untuk "' + q.norm + '"');
      return;
    }
    renderSearchItems(items, q.tokens);
    showState("list");
  }

  /** Fallback bila backend belum di-deploy ulang: filter judul + preview. */
  function renderLocalFallback(q, seq) {
    var docs = lastDocs || [];
    var found = docs.filter(function (d) {
      var hay =
        (String(d.judul || "") + "\n" + String(d.preview || "")).toLowerCase();
      for (var i = 0; i < q.tokens.length; i++) {
        if (hay.indexOf(q.tokens[i]) === -1) return false;
      }
      return true;
    });
    if (seq !== searchSeq) return;
    searchStatus.textContent = found.length + " hasil \u00B7 " + FALLBACK_NOTE;
    if (found.length === 0) {
      showState("noresult", 'Tidak ada hasil untuk "' + q.norm + '"');
      return;
    }
    renderSearchItems(found, q.tokens);
    showState("list");
  }

  async function runSearch(rawQuery) {
    var seq = ++searchSeq;
    var q = searchTokens(rawQuery);
    searchActive = true;
    searchQuery = rawQuery;
    searchStatus.textContent = "";

    if (!ReadDashAPI.isConfigured()) {
      showState("setup");
      setStatus(ReadDashAPI.SETUP_MESSAGE, true);
      return;
    }

    showState("searching");
    try {
      var data = await ReadDashAPI.search(q.norm);
      if (seq !== searchSeq) return; // respons usang — buang
      renderSearchData(data, q);
    } catch (err) {
      if (seq !== searchSeq) return; // respons usang — buang
      if (!isBackendTooOld(err)) {
        showState("searchError", errText(err));
        return;
      }
      // Fallback: backend lama -> filter lokal judul + preview.
      try {
        if (!lastDocs) lastDocs = (await ReadDashAPI.list()) || [];
      } catch (err2) {
        if (seq !== searchSeq) return;
        showState("searchError", errText(err2));
        return;
      }
      renderLocalFallback(q, seq);
    }
  }

  /** Sesudah tambah/hapus dokumen: pencarian aktif -> jalankan ulang. */
  function refreshList() {
    var q = searchTokens(searchQuery);
    if (searchActive && q.norm.length >= SEARCH_MIN) {
      lastDocs = null; // agar fallback mengambil daftar segar bila perlu
      return runSearch(searchQuery);
    }
    return loadList();
  }

  function handleSearchInput() {
    var raw = searchInput.value;
    searchClear.hidden = raw.length === 0;
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    if (searchTokens(raw).norm.length < SEARCH_MIN) {
      searchSeq++; // batalkan request yang sedang berjalan
      searchActive = false;
      searchQuery = "";
      searchStatus.textContent = "";
      showNormalList();
      return;
    }
    searchTimer = setTimeout(function () {
      searchTimer = null;
      runSearch(raw);
    }, SEARCH_DEBOUNCE_MS);
  }

  searchInput.addEventListener("input", handleSearchInput);

  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Escape" || e.key === "Esc") {
      searchInput.value = "";
      handleSearchInput();
    }
  });

  searchClear.addEventListener("click", function () {
    searchInput.value = "";
    handleSearchInput();
    searchInput.focus();
  });

  searchRetryBtn.addEventListener("click", function () {
    if (searchQuery) runSearch(searchQuery);
  });

  /* ------------------------------------------------------- Dialog hapus */

  function openDeleteDialog(doc) {
    pendingDelete = doc;
    deleteDialogText.textContent =
      'Dokumen "' + doc.judul + '" akan dihapus permanen dari Sheet.';
    if (typeof deleteDialog.showModal === "function") {
      deleteDialog.showModal();
    } else {
      deleteDialog.setAttribute("open", "");
    }
  }

  deleteCancel.addEventListener("click", function () {
    deleteDialog.close();
  });

  deleteDialog.addEventListener("close", function () {
    pendingDelete = null;
  });

  deleteConfirm.addEventListener("click", async function () {
    var doc = pendingDelete;
    deleteDialog.close();
    if (!doc) return;
    if (busy) return;

    setBusy(true);
    setStatus("Menghapus " + doc.judul + "…", false);
    try {
      await ReadDashAPI.remove(doc.id);
      setStatus("Dokumen dihapus.", false);
      await refreshList();
    } catch (err) {
      setStatus("Gagal menghapus: " + errText(err), true);
    } finally {
      setBusy(false);
    }
  });

  /* -------------------------------------------------- Validasi file */

  async function validateFile(file) {
    var nama = file.name || "(tanpa nama)";
    var ext = extOf(file.name);
    var mime = String(file.type || "").toLowerCase();

    var mimePrefix = null;
    for (var i = 0; i < BINARY_MIME_PREFIXES.length; i++) {
      if (mime.indexOf(BINARY_MIME_PREFIXES[i]) === 0) {
        mimePrefix = BINARY_MIME_PREFIXES[i];
        break;
      }
    }
    if (mimePrefix) {
      return {
        ok: false,
        reason:
          'ditolak: MIME "' + (file.type || "(kosong)") +
          '" diawali ' + mimePrefix + " (bukan teks)."
      };
    }

    if (ext && BINARY_EXTS.indexOf(ext) !== -1) {
      return {
        ok: false,
        reason: "ditolak: ekstensi ." + ext + " termasuk file biner."
      };
    }

    if (typeof file.size === "number" && file.size > MAX_BYTES) {
      return {
        ok: false,
        reason:
          "ditolak: ukuran " + file.size +
          " byte tidak mungkin muat dalam batas " + MAX_ISI + " karakter."
      };
    }

    var text = await file.text();

    if (text.indexOf("\u0000") !== -1) {
      return {
        ok: false,
        reason: "ditolak: mengandung karakter NUL (kemungkinan file biner)."
      };
    }

    var repl = (text.match(/\uFFFD/g) || []).length;
    if (text.length > 0 && repl / text.length > 0.01) {
      return {
        ok: false,
        reason:
          "ditolak: " + ((repl / text.length) * 100).toFixed(1) +
          "% karakter tidak terbaca sebagai UTF-8 (bukan teks)."
      };
    }

    if (text.length > MAX_ISI) {
      return {
        ok: false,
        reason:
          "ditolak: isi " + text.length + " karakter melebihi batas " +
          MAX_ISI + " karakter."
      };
    }

    var base = (file.name || "").replace(/\.[^.]*$/, "").trim();
    if (!base) base = "Tanpa judul";
    if (base.length > MAX_JUDUL) base = base.slice(0, MAX_JUDUL);

    return {
      ok: true,
      judul: base,
      isi: text,
      tipe: ext || "txt"
    };
  }

  /* ----------------------------------------------- Proses banyak file */

  async function processFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (files.length === 0 || busy) return;

    if (!ReadDashAPI.isConfigured()) {
      showState("setup");
      setStatus(ReadDashAPI.SETUP_MESSAGE, true);
      return;
    }

    setBusy(true);
    setStatus("Memproses " + files.length + " file…", false);

    var results = [];
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var check;
      try {
        check = await validateFile(file);
      } catch (err) {
        results.push({
          name: file.name || "(tanpa nama)",
          ok: false,
          reason: "gagal membaca file: " + errText(err)
        });
        continue;
      }

      if (!check.ok) {
        results.push({ name: file.name || "(tanpa nama)", ok: false, reason: check.reason });
        continue;
      }

      // Berurutan: satu POST selesai, baru POST berikutnya.
      try {
        await ReadDashAPI.create({
          judul: check.judul,
          isi: check.isi,
          tipe: check.tipe
        });
        results.push({ name: file.name, ok: true });
      } catch (err) {
        results.push({ name: file.name, ok: false, reason: errText(err) });
      }
    }

    setBusy(false);
    renderSummary(results);

    var okCount = results.filter(function (r) {
      return r.ok;
    }).length;
    setStatus(
      okCount + " dari " + results.length + " file berhasil disimpan.",
      okCount === 0
    );

    if (okCount > 0) refreshList();
  }

  function renderSummary(results) {
    summaryEl.replaceChildren();
    results.forEach(function (r) {
      var item = el("li", "summary-item " + (r.ok ? "is-ok" : "is-fail"));
      item.appendChild(el("span", "summary-mark", r.ok ? "✓" : "✕"));
      var body = el("div", "summary-body");
      body.appendChild(el("span", "summary-name", r.name));
      if (!r.ok) body.appendChild(el("span", "summary-reason", r.reason));
      item.appendChild(body);
      summaryEl.appendChild(item);
    });
    summaryEl.hidden = results.length === 0;
  }

  /* ------------------------------------------------------- Drag & drop */

  // Cegah browser membuka file yang jatuh di luar dropzone.
  window.addEventListener("dragover", function (e) {
    e.preventDefault();
  });
  window.addEventListener("drop", function (e) {
    e.preventDefault();
  });

  dropzone.addEventListener("dragover", function (e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    dropzone.classList.add("is-over");
  });

  dropzone.addEventListener("dragleave", function () {
    dropzone.classList.remove("is-over");
  });

  dropzone.addEventListener("drop", function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("is-over");
    if (e.dataTransfer) processFiles(e.dataTransfer.files);
  });

  // Klik-untuk-pilih (juga bisa dengan Enter/Space karena role="button").
  dropzone.addEventListener("click", function () {
    if (!busy) fileInput.click();
  });

  dropzone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      if (!busy) fileInput.click();
    }
  });

  fileInput.addEventListener("change", function () {
    processFiles(fileInput.files);
    fileInput.value = "";
  });

  /* --------------------------------------------------------- Form tempel */

  pasteForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (busy) return;

    if (!ReadDashAPI.isConfigured()) {
      showState("setup");
      setStatus(ReadDashAPI.SETUP_MESSAGE, true);
      return;
    }

    var judulRaw = judulInput.value.trim();
    var isi = isiInput.value;

    if (judulRaw.length > MAX_JUDUL) {
      setStatus(
        "Judul melebihi batas " + MAX_JUDUL + " karakter (saat ini " +
          judulRaw.length + ").",
        true
      );
      return;
    }
    if (isi.length > MAX_ISI) {
      setStatus(
        "Isi melebihi batas " + MAX_ISI + " karakter (saat ini " +
          isi.length + ").",
        true
      );
      return;
    }

    var judul = deriveTitle(judulRaw, isi);
    setBusy(true);
    try {
      await ReadDashAPI.create({
        judul: judul,
        isi: isi,
        tipe: tipeInput.value
      });
      judulInput.value = "";
      isiInput.value = "";
      summaryEl.hidden = true;
      setStatus('Tersimpan: "' + judul + '".', false);
      await refreshList();
    } catch (err) {
      setStatus(errText(err), true);
    } finally {
      setBusy(false);
    }
  });

  /* ------------------------------------------------------------- Init */

  retryBtn.addEventListener("click", loadList);
  setupMsg.textContent = ReadDashAPI.SETUP_MESSAGE;

  if (!ReadDashAPI.isConfigured()) {
    showState("setup");
    setStatus(ReadDashAPI.SETUP_MESSAGE, true);
  } else {
    loadList();
  }
})();
