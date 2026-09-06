/* ============================================================
   editor.js — Form generik untuk edit content.json
   ------------------------------------------------------------
   - Tanpa library eksternal. Vanilla JS, offline-safe.
   - Render form dinamis berdasarkan tipe data asli:
       string pendek   -> <input type="text">
       string panjang  -> <textarea>
       array of object -> list block (tambah/hapus), tiap item
                          jadi sub-form dari key-key di dalamnya
       array of string -> list input (tambah/hapus)
       objek nested    -> sub-section berisi field-fieldnya
   - Saat Save, JSON direkonstruksi dengan tipe tiap field TETAP
     sama seperti aslinya (angka tetap angka, bukan string).
   ============================================================ */

(function () {
  "use strict";

  var LONG_TEXT = 200; // string lebih panjang dari ini -> textarea

  // ---- elemen utama ---------------------------------------------------
  var selectEl = document.getElementById("folder-select");
  var saveBtn = document.getElementById("save-btn");
  var statusEl = document.getElementById("status");
  var formArea = document.getElementById("form-area");

  var folders = [];
  var currentFolder = null;

  // ---- utilitas kecil -------------------------------------------------

  function h(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function isLongString(s) {
    return typeof s === "string" && (s.indexOf("\n") !== -1 || s.length > LONG_TEXT);
  }

  function escapeHtmlAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ---- baca tipe data asli -------------------------------------------

  function describeType(v) {
    if (v === null || v === undefined) return "null";
    if (Array.isArray(v)) {
      if (v.length === 0) return "array (kosong)";
      var first = v[0];
      if (first !== null && typeof first === "object" && !Array.isArray(first)) {
        return "array objek";
      }
      if (Array.isArray(first)) return "array bersarang";
      return "array " + describeType(first);
    }
    if (typeof v === "object") return "objek";
    if (typeof v === "boolean") return "bool";
    if (typeof v === "number") return "angka";
    return "teks";
  }

  function jtypeOf(v) {
    if (v === null || v === undefined) return "null";
    if (typeof v === "boolean") return "boolean";
    if (typeof v === "number") return "number";
    if (Array.isArray(v)) return "array";
    if (typeof v === "object") return "object";
    return "string";
  }

  // ---- render: field scalar -------------------------------------------

  function makeScalarInput(jtype, value, path) {
    var input;
    if (jtype === "boolean") {
      input = h("input", "bool-input");
      input.type = "checkbox";
      input.checked = !!value;
    } else if (jtype === "number") {
      input = h("input", "field-input");
      input.type = "number";
      input.step = "any";
      if (value !== null && value !== undefined) input.value = String(value);
    } else if (jtype === "null") {
      input = h("input", "field-input");
      input.type = "text";
      input.placeholder = "(null) — kosongkan untuk null, isi untuk jadi teks";
    } else {
      var long = typeof value === "string" && isLongString(value);
      if (long) {
        input = h("textarea", "field-input");
        input.rows = Math.min(18, Math.max(3, Math.ceil(String(value).length / 110)));
        input.value = value || "";
      } else {
        input = h("input", "field-input");
        input.type = "text";
        input.value = value || "";
      }
    }
    input.dataset.jtype = jtype;
    input.dataset.path = path;
    input.classList.add("value-root");
    return input;
  }

  // ---- render: objek & array -------------------------------------------

  // Render field berisi satu key dari objek.
  function renderField(container, key, value, path) {
    var field = h("div", "field");
    field.dataset.key = key;

    var head = h("div", "field-head");
    var label = h("label", "field-key", key);
    label.setAttribute("for", "f-" + key); // fallback sederhana
    var tag = h("span", "field-type-tag", describeType(value));
    head.appendChild(label);
    head.appendChild(tag);
    field.appendChild(head);

    var controlWrap = h("div", "field-control");
    var control = buildControl(value, path);
    controlWrap.appendChild(control);
    field.appendChild(controlWrap);

    container.appendChild(field);
  }

  // Bangun kontrol untuk sebuah nilai (scalar / objek / array).
  function buildControl(value, path) {
    var jt = jtypeOf(value);

    if (jt === "array") return buildArrayEditor(value, path);
    if (jt === "object") return buildObjectEditor(value, path);
    return makeScalarInput(jt, value, path);
  }

  // Render objek biasa (root atau nested) sebagai kumpulan field.
  function buildObjectEditor(obj, path) {
    var editor = h("div", "object-editor value-root");
    Object.keys(obj).forEach(function (key) {
      renderField(editor, key, obj[key], path ? path + "." + key : key);
    });
    if (!Object.keys(obj).length) {
      editor.appendChild(h("div", "hint", "(objek kosong)"));
    }
    return editor;
  }

  // Default nilai kosong yang menjaga TIPE saat item array baru ditambah.
  function blankValueOf(sample) {
    var jt = jtypeOf(sample);
    if (jt === "array") {
      var elemSample = sample.length ? sample[0] : "";
      return [blankValueOf(elemSample)];
    }
    if (jt === "object") {
      var out = {};
      Object.keys(sample).forEach(function (k) {
        out[k] = blankValueOf(sample[k]);
      });
      return out;
    }
    if (jt === "number") return 0;
    if (jt === "boolean") return false;
    if (jt === "null") return null;
    return "";
  }

  // Item tunggal di dalam array.
  function buildArrayItem(value, path, index) {
    var item = h("div", "array-item");
    item.dataset.index = String(index);

    var head = h("div", "array-item-head");
    var num = h("span", "item-num", "#" + (index + 1));
    head.appendChild(num);

    var summary = h("span", "item-summary");
    if (value && typeof value === "object" && !Array.isArray(value)) {
      var labelKey = value.id || value.judul || value.nama || value.title || "";
      if (typeof labelKey === "string" && labelKey) {
        summary.textContent = labelKey;
      } else if (value.judul) {
        summary.textContent = value.judul;
      }
    } else if (typeof value === "string" && value) {
      summary.textContent = value.length > 60 ? value.slice(0, 60) + "…" : value;
    }
    head.appendChild(summary);

    var removeBtn = h("button", "remove-btn", "Hapus");
    removeBtn.type = "button";
    removeBtn.addEventListener("click", function () {
      item.remove();
      renumber(listParentOf(item));
    });
    head.appendChild(removeBtn);

    item.appendChild(head);

    var body = h("div", "array-item-body");
    var control = buildControl(value, path);
    body.appendChild(control);
    item.appendChild(body);

    return item;
  }

  function listParentOf(item) {
    var p = item.parentElement;
    return p && p.classList.contains("array-editor") ? p : null;
  }

  function renumber(listEl) {
    if (!listEl) return;
    var items = listEl.querySelectorAll(":scope > .array-item");
    items.forEach(function (it, i) {
      it.dataset.index = String(i);
      var n = it.querySelector(".item-num");
      if (n) n.textContent = "#" + (i + 1);
    });
    var hint = listEl.querySelector(":scope > .array-empty-hint");
    if (hint) hint.style.display = items.length ? "none" : "";
  }

  // Render array -> list block.
  function buildArrayEditor(arr, path) {
    var list = h("div", "array-editor value-root");
    list.dataset.kind = "array";

    // Tipe elemen array: ikuti elemen pertama (kalau kosong -> string).
    var sample = arr.length ? arr[0] : "";
    var elemJtype = jtypeOf(sample);
    list.dataset.elemtype = elemJtype === "array" || elemJtype === "object" ? "object" : elemJtype;

    arr.forEach(function (item, i) {
      var itemPath = path + "[" + i + "]";
      var elItem = buildArrayItem(item, itemPath, i);
      list.appendChild(elItem);
    });

    if (!arr.length) {
      list.appendChild(h("div", "array-empty-hint hint", "(belum ada item)"));
    }

    var addBtn = h("button", "add-btn", "+ Tambah " + (elemJtype === "object" ? "item objek" : "item"));
    addBtn.type = "button";
    addBtn.addEventListener("click", function () {
      var newVal = blankValueOf(sample);
      var count = list.querySelectorAll(":scope > .array-item").length;
      var newPath = path + "[" + count + "]";
      var elItem = buildArrayItem(newVal, newPath, count);
      // sisipkan sebelum tombol tambah
      list.insertBefore(elItem, addBtn);
      renumber(list);
      var firstInput = elItem.querySelector("input, textarea");
      if (firstInput) firstInput.focus();
    });
    list.appendChild(addBtn);

    return list;
  }

  // ---- render seluruh data ---------------------------------------------

  function renderForm(data) {
    formArea.textContent = "";
    var editor = buildObjectEditor(data, "");
    formArea.appendChild(editor);
  }

  // ---- rekonstruksi JSON (tipe konsisten) -------------------------------

  function readScalar(root, path) {
    var jt = root.dataset.jtype;
    if (jt === "boolean") return root.checked;
    if (jt === "number") {
      var raw = (root.value || "").trim();
      if (raw === "") {
        throw new Error("Kolom angka kosong di \u201C" + path + "\u201D.");
      }
      var n = Number(raw);
      if (!isFinite(n)) {
        throw new Error("Nilai bukan angka valid di \u201C" + path + "\u201D: \u201C" + raw + "\u201D.");
      }
      return n;
    }
    if (jt === "null") {
      var v = (root.value || "").trim();
      return v === "" ? null : v;
    }
    // string
    return root.value || "";
  }

  function collectValue(root, path) {
    if (root.dataset.jtype) return readScalar(root, path);

    if (root.classList.contains("array-editor")) {
      var arr = [];
      var items = root.querySelectorAll(":scope > .array-item");
      items.forEach(function (item, i) {
        var valueRoot = item.querySelector(":scope > .array-item-body > .value-root");
        if (!valueRoot) {
          valueRoot = item.querySelector(".value-root");
        }
        var childPath = path + "[" + i + "]";
        arr.push(collectValue(valueRoot, childPath));
      });
      return arr;
    }

    if (root.classList.contains("object-editor")) {
      var obj = {};
      var fields = root.querySelectorAll(":scope > .field");
      fields.forEach(function (field) {
        var key = field.dataset.key;
        var valueRoot = field.querySelector(".value-root");
        var childPath = path ? path + "." + key : key;
        obj[key] = collectValue(valueRoot, childPath);
      });
      return obj;
    }

    throw new Error("Struktur tak dikenal saat menyusun ulang JSON.");
  }

  // ---- fetch helpers ----------------------------------------------------

  function parseErrorResponse(resp) {
    return resp.text().then(function (txt) {
      try {
        var j = JSON.parse(txt);
        return new Error(j.error || ("HTTP " + resp.status));
      } catch (e) {
        return new Error("HTTP " + resp.status + ": " + txt.slice(0, 200));
      }
    });
  }

  function apiGet(url) {
    return fetch(url, { cache: "no-store" }).then(function (resp) {
      if (!resp.ok) return parseErrorResponse(resp).then(function (e) { throw e; });
      return resp.json();
    });
  }

  function apiPost(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body
    }).then(function (resp) {
      if (!resp.ok) return parseErrorResponse(resp).then(function (e) { throw e; });
      return resp.json();
    });
  }

  // ---- alur utama ---------------------------------------------------------

  function loadFolders() {
    setStatus("Memuat daftar folder…");
    apiGet("/api/list")
      .then(function (list) {
        folders = list || [];
        selectEl.textContent = "";
        if (!folders.length) {
          var opt = h("option", null, "(tidak ada folder dengan content.json)");
          opt.disabled = true;
          selectEl.appendChild(opt);
          saveBtn.disabled = true;
          formArea.textContent = "";
          setStatus("Tidak ada subfolder Kisah/ yang berisi content.json.", "err");
          return;
        }
        folders.forEach(function (f) {
          var opt = h("option", null, f);
          opt.value = f;
          selectEl.appendChild(opt);
        });
        selectEl.value = folders[0];
        loadFolder(folders[0]);
      })
      .catch(function (e) {
        saveBtn.disabled = true;
        setStatus("Gagal memuat daftar folder: " + e.message, "err");
      });
  }

  function loadFolder(folder) {
    currentFolder = folder;
    saveBtn.disabled = true;
    formArea.textContent = "";
    setStatus("Memuat " + folder + "…");

    apiGet("/api/content?folder=" + encodeURIComponent(folder))
      .then(function (data) {
        renderForm(data);
        saveBtn.disabled = false;
        setStatus("Tersimpan di memori — folder \u201C" + folder + "\u201D siap diedit. Klik Simpan untuk menulis ke file.");
      })
      .catch(function (e) {
        formArea.textContent = "";
        saveBtn.disabled = true;
        setStatus("Gagal memuat " + folder + ": " + e.message, "err");
      });
  }

  function onSave() {
    if (!currentFolder) return;

    var rootEditor = formArea.querySelector(":scope > .object-editor");
    if (!rootEditor) {
      setStatus("Belum ada data untuk disimpan.", "err");
      return;
    }

    var data;
    try {
      data = collectValue(rootEditor, "");
    } catch (e) {
      setStatus("Tidak bisa menyimpan: " + e.message, "err");
      return;
    }

    var payload = JSON.stringify(data, null, 2);
    saveBtn.disabled = true;
    setStatus("Menyimpan ke " + currentFolder + "…");

    apiPost("/api/content?folder=" + encodeURIComponent(currentFolder), payload)
      .then(function (res) {
        setStatus("Berhasil disimpan ke " + (res.file || currentFolder + "/content.json") + ".", "ok");
      })
      .catch(function (e) {
        setStatus("Gagal menyimpan: " + e.message, "err");
      })
      .finally(function () {
        saveBtn.disabled = false;
      });
  }

  // ---- wire up -------------------------------------------------------------

  selectEl.addEventListener("change", function () {
    if (selectEl.value) loadFolder(selectEl.value);
  });

  saveBtn.addEventListener("click", onSave);

  loadFolders();
})();
