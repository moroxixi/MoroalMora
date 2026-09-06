/* ============================================================
   Tiga Kisah dari Babylon — loader & renderer
   Sumber teks tunggal: content.json.
   - Saat diakses lewat HTTP: fetch('content.json').
   - Saat dibuka via file:// (fetch diblokir CORS lokal):
     fallback ke <script type="application/json" id="content-data">
     yang di-embed inline di index.html.
   ============================================================ */

(function () {
  "use strict";

  var INLINE_ID = "content-data";

  // --- utilitas teks -------------------------------------------------

  // Escaping dasar lalu konversi **tebal** (markdown) -> <strong>.
  function renderInline(texto) {
    var escaped = texto
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  // --- ikon SVG per kisah (sungai / bel / kebun), stroke emas ---

  var IKON = {
    naran:
      '<svg class="kisah-ikon" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">' +
      '<path d="M5 16 C 12 8, 20 24, 27 16 S 43 11, 43 16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M5 27 C 12 19, 20 35, 27 27 S 43 22, 43 27" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M5 38 C 12 30, 20 46, 27 38 S 43 33, 43 38" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
      "</svg>",
    idin:
      '<svg class="kisah-ikon" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">' +
      '<path d="M15 26 C 15 15, 19 10, 24 10 C 29 10, 33 15, 33 26 L 33 30 L 15 30 Z" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<path d="M15 26 C 15 24.5, 33 24.5, 33 26" stroke="currentColor" stroke-width="1.4"/>' +
      '<path d="M24 30 L 24 35" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
      '<circle cx="24" cy="37.5" r="2.2" stroke="currentColor" stroke-width="1.8"/>' +
      "</svg>",
    "ur-nanshe":
      '<svg class="kisah-ikon" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">' +
      '<path d="M24 40 L 24 20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M24 20 C 18 16, 11 15, 6 17 M24 20 C 31 15, 39 15, 43 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M24 16 C 24 10, 21 7, 17 5 M24 16 C 25 9, 28 6, 32 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
      "</svg>"
  };

  // --- render halaman dari data ---

  function ornament() {
    return el(
      "div",
      "ornament",
      '<span class="ornament-diamond"></span>'
    );
  }

  function renderKisah(kisah) {
    var section = el("section", "kisah");
    section.id = "kisah-" + kisah.id;

    var header = el("div", "kisah-header");
    var ikon = IKON[kisah.id] || IKON.naran;
    header.appendChild(el("span", null, ikon));
    header.appendChild(el("h2", null, renderInline(kisah.judul)));
    section.appendChild(header);

    kisah.paragraf.forEach(function (teks) {
      section.appendChild(el("p", null, renderInline(teks)));
    });

    if (kisah.paragrafPenutup) {
      section.appendChild(el("p", "penutup", renderInline(kisah.paragrafPenutup)));
    }

    return section;
  }

  function renderBenangMerah(benang) {
    var section = el("section", "benang-merah");
    section.id = "benang-merah";
    section.appendChild(el("h2", null, renderInline(benang.judul)));
    benang.paragraf.forEach(function (teks) {
      section.appendChild(el("p", null, renderInline(teks)));
    });
    return section;
  }

  function render(data) {
    document.getElementById("judul-utama").textContent = data.judul;
    document.title = data.judul;
    document.getElementById("subjudul").textContent = data.subjudul;

    var konten = document.getElementById("konten");
    konten.textContent = "";

    data.kisah.forEach(function (kisah, i) {
      konten.appendChild(renderKisah(kisah));
      if (i < data.kisah.length - 1) {
        konten.appendChild(ornament());
      }
    });

    konten.appendChild(ornament());
    konten.appendChild(renderBenangMerah(data.benangMerah));
  }

  function gagal(pesan) {
    var konten = document.getElementById("konten");
    konten.textContent = "";
    konten.appendChild(
      el("p", "status-loading", "Maaf, kisah gagal dimuat: " + pesan)
    );
  }

  // --- muat data: fetch dulu, fallback inline ---

  function bacaInline() {
    var node = document.getElementById(INLINE_ID);
    if (!node || !node.textContent.trim()) return null;
    try {
      return JSON.parse(node.textContent);
    } catch (e) {
      return null;
    }
  }

  async function muat() {
    var data = null;
    try {
      var res = await fetch("content.json", { cache: "no-store" });
      if (res.ok) {
        data = await res.json();
      }
    } catch (e) {
      data = null; // file:// — fetch diblokir, pakai fallback inline
    }

    if (!data) {
      data = bacaInline();
    }

    if (data && data.kisah && data.benangMerah) {
      render(data);
    } else {
      gagal("content.json tidak ditemukan atau tidak valid.");
    }
  }

  muat();
})();