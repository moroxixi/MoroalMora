/**
 * api.js — klien API bersama untuk ketiga halaman Read-Dashboard
 * (index.html, Read/index.html, Edit/index.html).
 *
 * Kontrak dengan Apps-Script/code.gs.js (harus konsisten):
 *   GET  ?action=list         -> {ok:true, data:[{id,judul,preview,tipe,dibuat,diubah}]}
 *   GET  ?action=get&id=...   -> {ok:true, data:{id,judul,isi,tipe,dibuat,diubah}}
 *   GET  ?action=search&q=... -> {ok:true, data:{items:[...],total,terpotong}}
 *     (action=search hanya ada setelah backend di-deploy ulang; lihat
 *      fallback "Backend belum diperbarui" di script.js)
 *   POST body JSON {action:create|update|delete, ...}
 *   Selalu JSON: {ok:true, data:...} atau {ok:false, error:"pesan"}.
 *
 * CATATAN CORS (penting): POST dikirim TANPA header Content-Type kustom.
 * fetch dengan body string tanpa Content-Type apa pun mengirim
 * "text/plain; charset=UTF-8", yang termasuk CORS "simple request" sehingga
 * TIDAK memicu preflight OPTIONS. Preflight itu yang tidak ditangani dengan
 * baik oleh Google Apps Script web app (permintaan gagal sebelum doPost
 * sempat jalan), jadi harus dihindari. Apps Script tetap menerima JSON
 * lengkap lewat e.postData.contents tanpa peduli nilai Content-Type.
 */
(function () {
  "use strict";

  var TIMEOUT_MS = 20000;
  var SETUP_MESSAGE =
    "APPS_SCRIPT_URL belum diisi. Buka config.js lalu tempel URL Web App " +
    "Apps Script (hasil Deploy > Web app) ke dalam APPS_SCRIPT_URL.";

  function endpoint() {
    var cfg = window.READ_DASHBOARD_CONFIG || {};
    return String(cfg.APPS_SCRIPT_URL || "").trim();
  }

  function isConfigured() {
    return endpoint() !== "";
  }

  function withQuery(url, params) {
    var parts = [];
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null) return;
      parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(value)));
    });
    if (parts.length === 0) return url;
    return url + (url.indexOf("?") === -1 ? "?" : "&") + parts.join("&");
  }

  /** fetch + timeout; mengembalikan teks mentah respons. */
  async function fetchText(url, options) {
    if (!isConfigured()) throw new Error(SETUP_MESSAGE);

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = null;
    if (controller) {
      options = options || {};
      options.signal = controller.signal;
      timer = setTimeout(function () {
        controller.abort();
      }, TIMEOUT_MS);
    }

    var res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new Error(
          "Permintaan melebihi waktu tunggu " +
            Math.round(TIMEOUT_MS / 1000) +
            " detik. Periksa koneksi internet atau APPS_SCRIPT_URL."
        );
      }
      throw new Error(
        "Gagal menghubungi server: " + ((err && err.message) || String(err))
      );
    } finally {
      if (timer) clearTimeout(timer);
    }

    try {
      return await res.text();
    } catch (err) {
      throw new Error("Gagal membaca respons server.");
    }
  }

  /** Ubah teks mentah menjadi data, atau lempar Error dengan pesan ramah. */
  function unwrap(text) {
    var raw = text === null || text === undefined ? "" : String(text).trim();
    var json = null;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      json = null;
    }

    if (!json || typeof json !== "object") {
      // Apps Script sering mengirim halaman HTML (error 500, login, dsb).
      if (/^\s*<(!doctype|html)/i.test(raw)) {
        throw new Error(
          "Server mengirim halaman HTML, bukan JSON. Pastikan APPS_SCRIPT_URL " +
            "benar dan Web app di-deploy dengan Execute as: Me, Access: Anyone."
        );
      }
      throw new Error("Respons server bukan JSON yang valid.");
    }

    if (json.ok === true) return json.data;
    if (json.ok === false) {
      throw new Error(json.error || "Permintaan gagal tanpa keterangan dari server.");
    }
    throw new Error("Respons server tidak sesuai kontrak (field ok tidak ada).");
  }

  async function do_GET(params) {
    var url = withQuery(endpoint(), params);
    return unwrap(await fetchText(url, { method: "GET" }));
  }

  async function do_POST(payload) {
    // Sengaja TANPA header Content-Type (lihat komentar di kepala file).
    var text = await fetchText(endpoint(), {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return unwrap(text);
  }

  window.ReadDashAPI = {
    SETUP_MESSAGE: SETUP_MESSAGE,
    TIMEOUT_MS: TIMEOUT_MS,
    isConfigured: isConfigured,
    list: function () {
      return do_GET({ action: "list" });
    },
    get: function (id) {
      return do_GET({ action: "get", id: id });
    },
    /**
     * Cari judul+isi (GET ?action=search&q=...).
     * BARU — ditambahkan tanpa mengubah fungsi lain, agar halaman Edit/
     * dan Read/ yang memuat api.js tetap berjalan seperti sebelumnya.
     * Bila backend lama membalas error "action tidak dikenal",
     * script.js menjatuhkan pencarian ke filter lokal (lihat fallback).
     */
    search: function (q) {
      return do_GET({ action: "search", q: q });
    },
    create: function (doc) {
      return do_POST({
        action: "create",
        judul: doc.judul,
        isi: doc.isi,
        tipe: doc.tipe
      });
    },
    update: function (doc) {
      return do_POST({
        action: "update",
        id: doc.id,
        judul: doc.judul,
        isi: doc.isi
      });
    },
    remove: function (id) {
      return do_POST({ action: "delete", id: id });
    }
  };
})();
