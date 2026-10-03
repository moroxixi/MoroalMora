/**
 * read.js — halaman baca dokumen.
 *
 * Keamanan konten: judul/meta masuk lewat textContent; satu-satunya
 * innerHTML adalah output DOMPurify.sanitize() untuk Markdown.
 */
(function () {
  "use strict";

  var docView = document.getElementById("doc-view");
  var docTitle = document.getElementById("doc-title");
  var docDate = document.getElementById("doc-date");
  var docTipe = document.getElementById("doc-tipe");
  var docBody = document.getElementById("doc-body");
  var editBtn = document.getElementById("edit-btn");
  var errorMsg = document.getElementById("error-msg");
  var setupMsg = document.getElementById("setup-msg");
  var retryBtn = document.getElementById("retry-btn");

  var params = new URLSearchParams(window.location.search);
  var docId = params.get("id") || "";
  var STATE_IDS = ["loading", "error", "setup"];

  function showState(name, message) {
    STATE_IDS.forEach(function (key) {
      document.getElementById("state-" + key).hidden = key !== name;
    });
    docView.hidden = name !== "doc";
    if (name === "error" && message) errorMsg.textContent = message;
  }

  function errText(err) {
    return (err && err.message) || String(err);
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || "");
    try {
      return (
        d.toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric"
        }) +
        " · " +
        d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
      );
    } catch (e) {
      return String(iso || "");
    }
  }

  function renderDoc(doc) {
    var judul = String(doc.judul || "Tanpa judul");
    var isi = doc.isi === null || doc.isi === undefined ? "" : String(doc.isi);
    var tipe = String(doc.tipe || "").toLowerCase();

    docTitle.textContent = judul;
    document.title = judul + " — Read-Dashboard";

    var iso = String(doc.diubah || "");
    if (iso && !isNaN(new Date(iso).getTime())) {
      docDate.setAttribute("datetime", iso);
      docDate.textContent = formatDate(iso);
    } else {
      docDate.textContent = iso;
    }
    docTipe.textContent = String(doc.tipe || "-");

    editBtn.href = "../Edit/index.html?id=" + encodeURIComponent(String(doc.id || ""));

    docBody.className = "prose";

    if (tipe === "md") {
      docBody.classList.add("markdown");
      var html = null;
      try {
        if (window.marked && typeof window.marked.parse === "function") {
          html = window.marked.parse(isi, { gfm: true, breaks: true });
        }
      } catch (e) {
        html = null;
      }

      if (typeof html === "string" && window.DOMPurify) {
        // Satu-satunya innerHTML: output sanitizer.
        docBody.innerHTML = window.DOMPurify.sanitize(html);
        return;
      }
      // Library tidak termuat (CDN/SRI gagal): jatuhkan ke teks biasa
      // agar konten tetap tampil tanpa risiko XSS.
      docBody.classList.add("plain");
      docBody.textContent = isi;
      return;
    }

    if (tipe === "txt") {
      docBody.classList.add("plain");
      docBody.textContent = isi;
      return;
    }

    // Tipe lain (json, csv, kode, dll).
    docBody.classList.add("codeview");
    docBody.textContent = isi;
  }

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
      renderDoc(doc);
      showState("doc");
    } catch (err) {
      showState("error", errText(err));
    }
  }

  retryBtn.addEventListener("click", load);
  setupMsg.textContent = ReadDashAPI.SETUP_MESSAGE;
  load();
})();
