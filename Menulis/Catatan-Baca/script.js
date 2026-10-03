/* ==========================================================================
 *  Catatan-Baca - script.js
 * ==========================================================================
 *
 *  URL endpoint ada di ../config.js (konstanta ENDPOINT). JANGAN hardcode URL
 *  di file ini.
 *
 *  Bagian 1 : fungsi murni (tanpa DOM/jaringan) - bisa diuji lewat node.
 *  Bagian 2 : init DOM, dibungkus guard supaya file aman dimuat di node.
 *
 *  Pemetaan field -> kolom Sheet (disepakati):
 *    topik        -> tag        (tab per tag; WAJIB)
 *    buku + hal   -> q          ("Judul" / "Judul, hlm. 19"; buku WAJIB)
 *    temuan       -> dugaan     (WAJIB)
 *    reaksi       -> simpul     baris 1 "Reaksi: <reaksi>" (WAJIB)
 *    alasan       -> simpul     baris 2 "Alasan: <alasan>" (opsional, dilewati
 *                               bila kosong)
 *    hubungan     -> dukung     (apa adanya, boleh kosong)
 *    tanya        -> next       (apa adanya, boleh kosong)
 *    -            -> runtuh     (selalu kosong; tidak ada field-nya)
 * ========================================================================== */

/* ==========================================================================
 * 1. Fungsi murni
 * ========================================================================== */

function trim_(s) {
  if (s === null || typeof s === 'undefined') return '';
  return String(s).replace(/^\s+|\s+$/g, '');
}

/** Rapikan spasi: buang \t\n, spasi ganda jadi satu, trim ujung. */
function norm_(s) {
  if (s === null || typeof s === 'undefined') return '';
  return trim_(String(s).replace(/\s+/g, ' '));
}

/** Pecah jadi daftar kata huruf kecil (kata kosong dibuang). */
function kata_(s) {
  var n = norm_(s).toLowerCase();
  return n ? n.split(' ') : [];
}

/**
 * true bila seluruh kata `a` muncul BERURUTAN dan UTUH sebagai kata di `b`.
 * Kecocokan per KATA, bukan substring: "life" cocok dengan "about life",
 * tetapi "art" TIDAK cocok dengan "smart".
 */
function berurutanUtuh_(a, b) {
  if (!a.length || !b.length || a.length > b.length) return false;
  for (var i = 0; i <= b.length - a.length; i++) {
    var cocok = true;
    for (var j = 0; j < a.length; j++) {
      if (a[j] !== b[i + j]) { cocok = false; break; }
    }
    if (cocok) return true;
  }
  return false;
}

/**
 * Saran tag.
 *   input    : teks yang sedang diketik user.
 *   daftarTag: daftar nama tag asli dari server.
 * Return {persis: namaTagAsli|null, mirip: [namaTagAsli, ... maks 5]}.
 *   - persis : sama SETELAH normalisasi (trim, lowercase, spasi ganda -> 1),
 *              dikembalikan dengan nama aslinya.
 *   - mirip  : bukan persis, tapi urutan kata salah satunya muncul berurutan
 *              utuh sebagai kata di yang lain. Input < 3 karakter diabaikan.
 * Fungsi ini tidak memblokir apa pun; petunjuk hanya informasi.
 */
function tagMirip(input, daftarTag) {
  var hasil = { persis: null, mirip: [] };
  if (!daftarTag || !daftarTag.length) return hasil;

  var nIn = norm_(input).toLowerCase();
  var i, t;

  // 1. exact match -> pakai tag yang ada (nama asli, kapitalisasi asli)
  for (i = 0; i < daftarTag.length; i++) {
    t = trim_(daftarTag[i]);
    if (!t) continue;
    if (norm_(t).toLowerCase() === nIn) { hasil.persis = t; break; }
  }
  if (hasil.persis !== null) return hasil;

  // 2. mirip - abaikan input kurang dari 3 karakter
  if (nIn.length < 3) return hasil;
  var inKata = kata_(input);
  for (i = 0; i < daftarTag.length && hasil.mirip.length < 5; i++) {
    t = trim_(daftarTag[i]);
    if (!t || norm_(t).toLowerCase() === nIn) continue;
    if (berurutanUtuh_(inKata, kata_(t)) || berurutanUtuh_(kata_(t), inKata)) {
      hasil.mirip.push(t);
    }
  }
  return hasil;
}

/** Label pesan untuk field wajib. */
var LABEL_WAJIB_ = {
  topik: 'Topik',
  buku: 'Buku',
  temuan: 'Yang kutemukan',
  reaksi: 'Reaksiku'
};

/**
 * Bentuk payload POST (lihat bagian header file untuk pemetaan lengkap).
 * Semua nilai di-trim; spasi saja dianggap kosong.
 * Return {ok:true, payload:{...}} atau {ok:false, errors:[label, ...]}.
 * Murni: tidak menyentuh DOM dan tidak mengirim apa pun.
 */
function petaKePayload(v) {
  v = v || {};
  var f = {
    buku: trim_(v.buku),
    hal: trim_(v.hal),
    topik: trim_(v.topik),
    temuan: trim_(v.temuan),
    reaksi: trim_(v.reaksi),
    alasan: trim_(v.alasan),
    hubungan: trim_(v.hubungan),
    tanya: trim_(v.tanya)
  };

  var errors = [];
  if (!f.topik) errors.push(LABEL_WAJIB_.topik);
  if (!f.buku) errors.push(LABEL_WAJIB_.buku);
  if (!f.temuan) errors.push(LABEL_WAJIB_.temuan);
  if (!f.reaksi) errors.push(LABEL_WAJIB_.reaksi);
  if (errors.length) return { ok: false, errors: errors };

  // Kesimpulan Sementara: dua baris berlabel, baris kosong dilewati.
  var simpul = 'Reaksi: ' + f.reaksi;
  if (f.alasan) simpul += '\nAlasan: ' + f.alasan;

  var d = new Date();
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  return {
    ok: true,
    payload: {
      tag: f.topik,
      q: f.hal ? f.buku + ', hlm. ' + f.hal : f.buku,
      dugaan: f.temuan,
      dukung: f.hubungan,
      runtuh: '',
      simpul: simpul,
      next: f.tanya,
      date: date
    }
  };
}

/**
 * Validasi respons GET ?action=daftarTag.
 * SAH hanya bila ok === true DAN tags berupa array.
 * Respons lama ({ok:true, service:'menulis'}), ok:false, atau bukan objek
 * -> {ok:false, tags:[]} (pemanggil mematikan saran tag, form tetap jalan).
 */
function parseDaftarTag(res) {
  if (res && res.ok === true && Array.isArray(res.tags)) {
    var out = [];
    for (var i = 0; i < res.tags.length; i++) {
      if (typeof res.tags[i] === 'string' && trim_(res.tags[i])) out.push(res.tags[i]);
    }
    return { ok: true, tags: out };
  }
  return { ok: false, tags: [] };
}

/* Ekspor untuk tes node; tidak berpengaruh di browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    trim_: trim_,
    norm_: norm_,
    tagMirip: tagMirip,
    petaKePayload: petaKePayload,
    parseDaftarTag: parseDaftarTag
  };
}

/* ==========================================================================
 * 2. Bagian DOM - hanya dijalankan di browser (guard agar aman di node).
 * ========================================================================== */

if (typeof document !== 'undefined') {
  (function () {
    var KEY = 'catatan-baca-v1', DKEY = 'catatan-baca-draft-v1';
    var ids = ['buku', 'hal', 'topik', 'temuan', 'alasan', 'hubungan', 'tanya'];
    var url = (typeof ENDPOINT !== 'undefined' && ENDPOINT) ? String(ENDPOINT) : '';
    var daftarTag = [];

    function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
    function load(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
    function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
    function getReaksi() { var r = document.querySelector('input[name=reaksi]:checked'); return r ? r.value : ''; }

    try {
      var msgEl = document.getElementById('msg');
      var form = document.getElementById('form');
      var listBox = document.getElementById('list');
      var btn = document.getElementById('simpan');
      var topikEl = document.getElementById('topik');
      var datalist = document.getElementById('tags');
      var tagsInfo = document.getElementById('tagsinfo');
      var tagHint = document.getElementById('taghint');
      if (!msgEl || !form || !listBox || !btn || !topikEl) return;

      function msg(t, err) { msgEl.textContent = t; msgEl.className = err ? 'msg err' : 'msg'; }
      function setInfo(t) { if (!tagsInfo) return; tagsInfo.textContent = t || ''; tagsInfo.hidden = !t; }

      /* ---------- daftar catatan tersimpan (localStorage) ---------- */
      var items = load(KEY, []);

      function field(parent, label, text) {
        if (!text) return;
        var p = el('p');
        p.appendChild(el('span', 'k', label));
        p.appendChild(document.createTextNode(text));
        parent.appendChild(p);
      }

      function render() {
        listBox.textContent = '';
        if (!items.length) {
          listBox.appendChild(el('p', 'empty', 'Belum ada catatan. Saat kamu menemukan sesuatu yang bikin berhenti membaca, tulis di form ini.'));
          return;
        }
        items.slice().reverse().forEach(function (it) {
          var d = el('article', 'entry');
          var m = el('div', 'meta');
          m.appendChild(el('span', null, it.buku + (it.hal ? ', hlm. ' + it.hal : '')));
          if (it.topik) m.appendChild(el('span', 'tag', it.topik));
          m.appendChild(el('span', null, new Date(it.ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })));
          var b = el('button', 'ghost', 'Hapus'); b.type = 'button';
          b.addEventListener('click', function () {
            if (!b.dataset.sure) {
              b.dataset.sure = '1'; b.textContent = 'Yakin hapus?'; b.className = 'ghost warn';
              setTimeout(function () { b.dataset.sure = ''; b.textContent = 'Hapus'; b.className = 'ghost'; }, 3000);
              return;
            }
            items = items.filter(function (x) { return x.id !== it.id; });
            store(KEY, items);
            render();
          });
          m.appendChild(b);
          d.appendChild(m);
          field(d, 'Yang kutemukan', it.temuan);
          field(d, 'Reaksiku' + (it.reaksi ? ' (' + it.reaksi.toLowerCase() + ')' : ''), it.alasan);
          field(d, 'Nyambung ke', it.hubungan);
          field(d, 'Pertanyaan yang muncul', it.tanya);
          listBox.appendChild(d);
        });
      }

      /* ---------- draf ---------- */
      function saveDraft() {
        var d = { reaksi: getReaksi() };
        ids.forEach(function (i) { var e = document.getElementById(i); if (e) d[i] = e.value; });
        store(DKEY, d);
      }
      function loadDraft() {
        var d = load(DKEY, null);
        if (!d) return;
        ids.forEach(function (i) { var e = document.getElementById(i); if (e) e.value = d[i] || ''; });
        if (d.reaksi) {
          var r = document.querySelector('input[name=reaksi][value="' + d.reaksi + '"]');
          if (r) r.checked = true;
        }
      }
      function clearForm() {
        ids.forEach(function (i) { var e = document.getElementById(i); if (e) e.value = ''; });
        var r = document.querySelector('input[name=reaksi]:checked');
        if (r) r.checked = false;
        store(DKEY, {});
      }

      /* ---------- saran tag ---------- */
      function fillDatalist() {
        if (!datalist) return;
        datalist.textContent = '';
        for (var i = 0; i < daftarTag.length; i++) {
          var o = document.createElement('option');
          o.value = daftarTag[i];
          datalist.appendChild(o);
        }
      }

      function clearHint() {
        if (!tagHint) return;
        tagHint.textContent = '';
        tagHint.hidden = true;
      }

      function appendTagBtn(nama) {
        var b = el('button', 'tagbtn', nama);
        b.type = 'button';
        b.setAttribute('aria-label', 'Pakai tag ' + nama);
        b.addEventListener('click', function () {
          topikEl.value = nama;
          saveDraft();
          renderTagHint();
          topikEl.focus();
        });
        tagHint.appendChild(b);
      }

      function showHint(teks, tags) {
        tagHint.textContent = '';
        tagHint.appendChild(el('span', 'dot'));
        tagHint.appendChild(document.createTextNode(teks));
        tags.forEach(function (t) { appendTagBtn(t); });
        tagHint.hidden = false;
      }

      function renderTagHint() {
        clearHint();
        if (!tagHint || !daftarTag.length) return;
        var raw = topikEl.value;
        var r = tagMirip(raw, daftarTag);
        if (r.persis !== null && trim_(raw) !== r.persis) {
          // kapitalisasi berbeda -> tawarkan nama asli
          showHint("Pakai '" + r.persis + "'?", [r.persis]);
          return;
        }
        if (r.mirip.length) showHint('Tag mirip sudah ada:', r.mirip);
      }

      function loadTags() {
        if (!url) return; // pesan "URL belum diisi di config.js" sudah tampil
        fetch(url + '?action=daftarTag')
          .then(function (r) { return r.json(); })
          .then(function (res) {
            var p = parseDaftarTag(res);
            if (!p.ok) { setInfo('Saran tag nonaktif; ketik tag manual.'); return; }
            daftarTag = p.tags;
            fillDatalist();
            setInfo(daftarTag.length ? '' : 'Belum ada tag tersimpan.');
            renderTagHint();
          })
          .catch(function () {
            setInfo('Saran tag nonaktif; ketik tag manual. Periksa jaringan.');
          });
      }

      /* ---------- simpan ---------- */
      btn.addEventListener('click', function () {
        var v = {};
        ids.forEach(function (i) { var e = document.getElementById(i); v[i] = e ? e.value : ''; });
        v.reaksi = getReaksi();

        var r = petaKePayload(v);
        if (!r.ok) { msg('Isi dulu: ' + r.errors.join(', ') + '.', true); return; }
        if (!url) { msg('URL belum diisi di config.js', true); return; }

        btn.disabled = true;
        msg('Menyimpan...');
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(r.payload)
        })
          .then(function (resp) { return resp.json(); })
          .then(function (res) {
            if (res && res.ok) {
              var it = {
                id: Date.now(), ts: Date.now(),
                buku: trim_(v.buku), hal: trim_(v.hal), topik: trim_(v.topik),
                temuan: trim_(v.temuan), reaksi: v.reaksi, alasan: trim_(v.alasan),
                hubungan: trim_(v.hubungan), tanya: trim_(v.tanya)
              };
              items.push(it);
              var buku = it.buku;
              if (!store(KEY, items)) {
                render();
                msg('Tersimpan di server, tetapi daftar browser ini penuh/dinonaktifkan.', true);
                return;
              }
              clearForm();
              document.getElementById('buku').value = buku;
              saveDraft();
              render();
              msg('Tersimpan. Total ' + items.length + ' catatan.');
            } else {
              msg('Gagal menyimpan: ' + ((res && res.error) || 'respons server tidak dikenal'), true);
            }
          })
          .catch(function () { msg('Gagal menyimpan. Periksa jaringan, lalu coba lagi.', true); })
          .then(function () { btn.disabled = false; });
      });

      /* ---------- init ---------- */
      form.addEventListener('input', saveDraft);
      form.addEventListener('change', saveDraft);
      topikEl.addEventListener('input', function () { saveDraft(); renderTagHint(); });

      loadDraft();
      render();
      if (!url) msg('URL belum diisi di config.js', true);
      loadTags();
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) console.error('catatan-baca: ' + err);
    }
  })();
}
