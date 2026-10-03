/**
 * edit.js — halaman edit dokumen.
 *
 * - Draf per dokumen disimpan di sessionStorage (kunci per id) agar tidak
 *   hilang saat refresh; dihapus setelah simpan sukses.
 * - beforeunload dipasang kalau ada perubahan belum disimpan.
 * - Validasi batas karakter sama dengan server (MAX_JUDUL / MAX_ISI).
 *
 * Keamanan konten: semua data dari Sheet masuk lewat value/textContent,
 * tidak pernah innerHTML.
 */
(function () {
  "use strict";

  /** Harus sama dengan batas di Apps-Script/code.gs.js. */
  var MAX_JUDUL = 200;
  var MAX_ISI = 45000;

  var params = new URLSearchParams(window.location.search);
  var docId = params.get("id") || "";
  var draftKey = "read-dashboard:draft:" + docId;

  var editForm = document.getElementById("edit-form");
  var judulInput = document.getElementById("edit-judul");
  var isiInput = document.getElementById("edit-isi");
  var tipeEl = document.getElementById("edit-tipe");
  var saveBtn = document.getElementById("save-btn");
  var errorMsg = document.getElementById("error-msg");
  var setupMsg = document.getElementById("setup-msg");
  var retryBtn = document.getElementById("retry-btn");
  var draftNotice = document.getElementById("draft-notice");
  var editError = document.getElementById("edit-error");

  var STATE_IDS = ["loading", "error", "setup"];
  var original = { judul: "", isi: "" };
  var saveLabel = saveBtn.textContent;
  var saving = false;
  var loaded = false;

  function showState(name, message) {
    STATE_IDS.forEach(function (key) {
      document.getElementById("state-" + key).hidden = key !== name;
    });
    editForm.hidden = name !== "form";
    if (name === "error" && message) errorMsg.textContent = message;
  }

  function errText(err) {
    return (err && err.message) || String(err);
  }

  function showError(message) {
    editError.textContent = message || "";
    editError.hidden = !message;
  }

  function isDirty() {
    return (
      judulInput.value !== original.judul || isiInput.value !== original.isi
    );
  }

  function readDraft() {
    try {
      var raw = sessionStorage.getItem(draftKey);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return {
        judul: typeof parsed.judul === "string" ? parsed.judul : null,
        isi: typeof parsed.isi === "string" ? parsed.isi : null
      };
    } catch (e) {
      return null;
    }
  }

  function writeDraft() {
    if (!loaded) return;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ judul: judulInput.value, isi: isiInput.value })
      );
    } catch (e) {
      /* storage penuh/di-block: abaikan, draf hanyalah kenyamanan */
    }
  }

  function clearDraft() {
    try {
      sessionStorage.removeItem(draftKey);
    } catch (e) {
      /* abaikan */
    }
  }

  /* --------------------------------------------------------- Muat doc */

  async function load() {
    if (!ReadDashAPI.isConfigured()) {
      showState("setup");
      return;
    }
    if (!docId) {
      showState("error", "Tidak ada id dokumen di URL. Buka dokumen dari daftar.");
      return;
    }

    showState("loading");
    try {
      var doc = await ReadDashAPI.get(docId);
      if (!doc || typeof doc !== "object") {
        throw new Error("Dokumen tidak ditemukan.");
      }

      var judul = String(doc.judul || "");
      var isi = doc.isi === null || doc.isi === undefined ? "" : String(doc.isi);

      original = { judul: judul, isi: isi };
      judulInput.value = judul;
      isiInput.value = isi;
      tipeEl.textContent = String(doc.tipe || "-");
      document.title = "Edit: " + judul + " — Read-Dashboard";
      loaded = true;

      // Pulihkan draf tersimpan (kalau ada) setelah data asli siap.
      var draft = readDraft();
      if (draft && (draft.judul !== null || draft.isi !== null)) {
        if (draft.judul !== null) judulInput.value = draft.judul;
        if (draft.isi !== null) isiInput.value = draft.isi;
        draftNotice.hidden = false;
      } else {
        draftNotice.hidden = true;
      }

      showError("");
      showState("form");
    } catch (err) {
      showState("error", errText(err));
    }
  }

  /* ----------------------------------------------------------- Simpan */

  async function save() {
    if (saving || !loaded) return;

    if (!ReadDashAPI.isConfigured()) {
      showState("setup");
      return;
    }

    var judul = judulInput.value.trim();
    var isi = isiInput.value;

    if (!judul) {
      showError("Judul tidak boleh kosong.");
      judulInput.focus();
      return;
    }
    if (judul.length > MAX_JUDUL) {
      showError(
        "Judul melebihi batas " + MAX_JUDUL + " karakter (saat ini " +
          judul.length + ")."
      );
      judulInput.focus();
      return;
    }
    if (isi.length > MAX_ISI) {
      showError(
        "Isi melebihi batas " + MAX_ISI + " karakter (saat ini " +
          isi.length + ")."
      );
      isiInput.focus();
      return;
    }

    showError("");
    saving = true;
    saveBtn.disabled = true;
    saveBtn.textContent = "Menyimpan…";

    try {
      await ReadDashAPI.update({ id: docId, judul: judul, isi: isi });
      clearDraft();
      window.location.href = "../Read/index.html?id=" + encodeURIComponent(docId);
    } catch (err) {
      showError(errText(err));
      saving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = saveLabel;
    }
  }

  /* ------------------------------------------------------- Pintasan & draf */

  saveBtn.addEventListener("click", save);

  editForm.addEventListener("submit", function (e) {
    e.preventDefault();
    save();
  });

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      save();
    }
  });

  judulInput.addEventListener("input", writeDraft);
  isiInput.addEventListener("input", writeDraft);

  window.addEventListener("beforeunload", function (e) {
    if (loaded && isDirty()) {
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
  });

  /* ------------------------------------------------------------- Init */

  retryBtn.addEventListener("click", load);
  setupMsg.textContent = ReadDashAPI.SETUP_MESSAGE;
  load();
})();
