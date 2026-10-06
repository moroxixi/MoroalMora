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
 *    buku         -> q          (judul saja; WAJIB)
 *    hal          -> detail     (per jenis sumber: halaman/platform/menit/ket.)
 *    jenis        -> jenis      (label: Buku | Media sosial | Podcast | Video |
 *                               Lainnya; opsional, default Buku)
 *    link         -> link       (opsional; http(s) dirender sebagai link)
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

/**
 * P3 - preview daftar catatan: potong `teks` maksimal `batas` (default 160)
 * karakter. Dipotong di batas kata bila memungkinkan (fallback: keras),
 * dan hanya diberi "\u2026" bila benar-benar terpotong. Teks yang sudah
 * <= batas dikembalikan apa adanya (tanpa "\u2026"). Murni, tanpa DOM.
 */
function potongPreview(teks, batas) {
  var s = teks === null || typeof teks === 'undefined' ? '' : String(teks);
  var n = typeof batas === 'number' && batas > 0 ? batas : 160;
  if (s.length <= n) return s;
  var pot = s.slice(0, n);
  var i = pot.lastIndexOf(' ');
  if (i > Math.floor(n / 2)) pot = pot.slice(0, i); // hindari memotong di tengah kata
  return pot.replace(/\s+$/, '') + '\u2026';
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
 * Jenis sumber catatan.
 *   nama   : label yang tampil (chip, tag di daftar, dan kolom Sheet).
 *   judul  : label + placeholder adaptif untuk field judul (id "buku").
 *   detail : label adaptif untuk field Detail (id "hal").
 *   ph     : placeholder field Detail.
 *   def    : nilai awal Detail per jenis (hanya Media sosial yang punya
 *            default: "Substack"); diingat per jenis selama sesi.
 */
var JENIS_URUT = ['buku', 'sosial', 'podcast', 'video', 'lainnya'];
var JENIS = {
  buku:    { nama: 'Buku',         judul: 'Judul buku',    detail: 'Halaman',               ph: '19',         def: '' },
  sosial:  { nama: 'Media sosial', judul: 'Judul post',    detail: 'Platform',              ph: 'misal: Substack', def: 'Substack' },
  podcast: { nama: 'Podcast',      judul: 'Judul episode', detail: 'Menit ke-',             ph: '12',         def: '' },
  video:   { nama: 'Video',        judul: 'Judul video',   detail: 'Menit ke-',             ph: '12',         def: '' },
  lainnya: { nama: 'Lainnya',      judul: 'Judul sumber',  detail: 'Keterangan (opsional)', ph: 'opsional',   def: '' }
};

/**
 * Kapitalisasi huruf PERTAMA judul, sisa karakter TIDAK disentuh
 * (tidak di-lowercase) supaya "iPhone"/"AI" aman dari "Iphone"/"Ai".
 *   trimDepan : true -> spasi depan dibuang dulu (dipakai saat blur dan
 *                sebelum kirim); false -> tanpa trim (dipakai saat mengetik
 *                supaya panjang string tidak berubah dan kursor tidak lompat).
 * Hanya char index 0 yang boleh berubah; "" dan input non-huruf balik apa adanya.
 */
function kapitalAwal(s, trimDepan) {
  var t = (s === null || typeof s === 'undefined') ? '' : String(s);
  if (trimDepan) t = t.replace(/^\s+/, '');
  if (!t) return t;
  var awal = t.charAt(0);
  var atas = awal.toLocaleUpperCase('id');
  return atas === awal ? t : atas + t.slice(1);
}

/**
 * Bentuk payload POST (lihat bagian header file untuk pemetaan lengkap).
 * Semua nilai di-trim; spasi saja dianggap kosong.
 * Input opsional tambahan: v.jenis (id jenis, default 'buku'),
 * v.detail (nilai field Detail), v.link, v.lblJudul (label error judul).
 * Return {ok:true, payload:{...}} atau {ok:false, errors:[label, ...]}.
 * Murni: tidak menyentuh DOM dan tidak mengirim apa pun.
 */
function petaKePayload(v) {
  v = v || {};
  var jenisId = (v.jenis && JENIS[v.jenis]) ? v.jenis : 'buku';
  var f = {
    buku: trim_(v.buku),
    hal: trim_(v.detail !== null && typeof v.detail !== 'undefined' ? v.detail : v.hal),
    topik: trim_(v.topik),
    temuan: trim_(v.temuan),
    reaksi: trim_(v.reaksi),
    alasan: trim_(v.alasan),
    hubungan: trim_(v.hubungan),
    tanya: trim_(v.tanya),
    link: trim_(v.link)
  };

  var errors = [];
  if (!f.topik) errors.push(LABEL_WAJIB_.topik);
  if (!f.buku) errors.push(v.lblJudul || LABEL_WAJIB_.buku);
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
      q: f.buku,
      detail: f.hal,
      jenis: JENIS[jenisId].nama,
      link: f.link,
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
    parseDaftarTag: parseDaftarTag,
    kapitalAwal: kapitalAwal,
    potongPreview: potongPreview,
    JENIS: JENIS,
    JENIS_URUT: JENIS_URUT
  };
}

/* ==========================================================================
 * 2. Bagian DOM - hanya dijalankan di browser (guard agar aman di node).
 * ========================================================================== */

if (typeof document !== 'undefined') {
  (function () {
    var KEY = 'catatan-baca-v1', DKEY = 'catatan-baca-draft-v1';
    // Field teks biasa. "hal" (Detail) TIDAK di sini: nilainya diingat per
    // jenis sumber lewat detailMap (lihat saveDraft/loadDraft/clearForm).
    var ids = ['buku', 'topik', 'temuan', 'alasan', 'hubungan', 'tanya', 'link'];
    var url = (typeof ENDPOINT !== 'undefined' && ENDPOINT) ? String(ENDPOINT) : '';
    var daftarTag = [];

    var jenisKini = 'buku';
    var detailMap = defaultDetail_();

    function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
    function load(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
    function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
    function drop(k) { try { localStorage.removeItem(k); } catch (e) {} }
    function getReaksi() { var r = document.querySelector('input[name=reaksi]:checked'); return r ? r.value : ''; }
    function getJenis() { var r = document.querySelector('input[name=sumber]:checked'); return (r && JENIS[r.value]) ? r.value : 'buku'; }
    function defaultDetail_() {
      var m = {};
      for (var i = 0; i < JENIS_URUT.length; i++) m[JENIS_URUT[i]] = JENIS[JENIS_URUT[i]].def;
      return m;
    }

    try {
      var msgEl = document.getElementById('msg');
      var form = document.getElementById('form');
      var listBox = document.getElementById('list');
      var btn = document.getElementById('simpan');
      var topikEl = document.getElementById('topik');
      var datalist = document.getElementById('tags');
      var tagsInfo = document.getElementById('tagsinfo');
      var tagHint = document.getElementById('taghint');
      var bukuEl = document.getElementById('buku');
      var halEl = document.getElementById('hal');
      var lblJudul = document.getElementById('lbl-judul');
      var lblDetail = document.getElementById('lbl-detail');
      if (!msgEl || !form || !listBox || !btn || !topikEl || !bukuEl || !halEl) return;

      function msg(t, err) { msgEl.textContent = t; msgEl.className = err ? 'msg err' : 'msg'; }
      function setInfo(t) { if (!tagsInfo) return; tagsInfo.textContent = t || ''; tagsInfo.hidden = !t; }

      /** Sinkronkan label/placeholder Judul & Detail dengan chip yang aktif. */
      function updateLabel_() {
        var j = JENIS[jenisKini] || JENIS.buku;
        if (lblJudul) lblJudul.textContent = j.judul;
        bukuEl.placeholder = j.judul;
        if (lblDetail) lblDetail.textContent = j.detail;
        halEl.placeholder = j.ph;
      }

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
          // Catatan lama tanpa jenis dianggap "Buku" (Detail lama = halaman).
          var jenisKey = (it.jenis && JENIS[it.jenis]) ? it.jenis : 'buku';
          m.appendChild(el('span', 'jenis', JENIS[jenisKey].nama));
          m.appendChild(el('span', null, it.buku));
          var det = trim_(it.hal);
          if (det) m.appendChild(el('span', null, det));
          var link = trim_(it.link);
          if (link) {
            if (/^https?:\/\//i.test(link)) {
              var a = document.createElement('a');
              a.href = link;
              a.textContent = link;
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              m.appendChild(a);
            } else {
              m.appendChild(el('span', null, link));
            }
          }
          if (it.topik) m.appendChild(el('span', 'tag', it.topik));
          m.appendChild(el('span', 'tgl', new Date(it.ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })));
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

          // P3: isi lengkap dibungkus .isi (default tersembunyi = mode preview).
          var isi = el('div', 'isi');
          field(isi, 'Yang kutemukan', it.temuan);
          field(isi, 'Reaksiku' + (it.reaksi ? ' (' + it.reaksi.toLowerCase() + ')' : ''), it.alasan);
          field(isi, 'Nyambung ke', it.hubungan);
          field(isi, 'Pertanyaan yang muncul', it.tanya);

          // P3: preview ~160 karakter dari isi yang sama, dibuat di sisi klien.
          var isiTeks = [it.temuan, it.alasan, it.hubungan, it.tanya].filter(function (v) {
            return v && String(v).replace(/\s+/g, '');
          }).join(' ');
          var prev = potongPreview(isiTeks, 160);
          if (prev) {
            d.appendChild(el('p', 'prev', prev)); // SELALU textContent (bukan innerHTML)
            var exp = el('button', 'exp', 'Tampilkan lengkap');
            exp.type = 'button';
            exp.setAttribute('aria-expanded', 'false');
            exp.addEventListener('click', function () {
              var buka = d.classList.toggle('buka');
              exp.textContent = buka ? 'Sembunyikan' : 'Tampilkan lengkap';
              exp.setAttribute('aria-expanded', buka ? 'true' : 'false');
            });
            d.appendChild(exp);
          }
          d.appendChild(isi);
          listBox.appendChild(d);
        });
      }

      /* ---------- draf ---------- */
      function saveDraft() {
        if (halEl) detailMap[jenisKini] = halEl.value;
        var d = { sumber: jenisKini, reaksi: getReaksi(), detail: {} };
        for (var i = 0; i < JENIS_URUT.length; i++) d.detail[JENIS_URUT[i]] = detailMap[JENIS_URUT[i]];
        ids.forEach(function (x) { var e = document.getElementById(x); if (e) d[x] = e.value; });
        store(DKEY, d);
      }

      function loadDraft() {
        var d = load(DKEY, null);
        if (!d || typeof d !== 'object') return;
        ids.forEach(function (x) { var e = document.getElementById(x); if (e && typeof d[x] === 'string') e.value = d[x]; });

        detailMap = defaultDetail_();
        if (d.detail && typeof d.detail === 'object') {
          for (var i = 0; i < JENIS_URUT.length; i++) {
            var k = JENIS_URUT[i];
            if (typeof d.detail[k] === 'string') detailMap[k] = d.detail[k];
          }
        } else if (typeof d.hal === 'string' && d.hal) {
          detailMap.buku = d.hal; // draf lama (sebelum ada chip jenis)
        }

        jenisKini = (d.sumber && JENIS[d.sumber]) ? d.sumber : getJenis();
        var r = document.querySelector('input[name=sumber][value="' + jenisKini + '"]');
        if (r) r.checked = true;
        updateLabel_();
        halEl.value = detailMap[jenisKini];

        if (d.reaksi) {
          var rk = document.querySelector('input[name=reaksi][value="' + d.reaksi + '"]');
          if (rk) rk.checked = true;
        }
        // Judul yang dipulihkan dari draf tetap kapital huruf pertamanya.
        bukuEl.value = kapitalAwal(bukuEl.value, true);
      }

      function clearForm() {
        ids.forEach(function (i) { var e = document.getElementById(i); if (e) e.value = ''; });
        // Detail kembali ke default jenis yang sedang aktif
        // (Substack untuk Media sosial, kosong untuk lainnya).
        detailMap = defaultDetail_();
        halEl.value = detailMap[jenisKini];
        var r = document.querySelector('input[name=reaksi]:checked');
        if (r) r.checked = false;
        // Draf dibuang total: refresh tidak memunculkan isian lama lagi.
        // Chip sumber TIDAK diubah (tetap di pilihan terakhir).
        drop(DKEY);
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
        // Kapital huruf pertama dipastikan lagi tepat sebelum kirim.
        bukuEl.value = kapitalAwal(bukuEl.value, true);

        var v = {};
        ids.forEach(function (i) { var e = document.getElementById(i); v[i] = e ? e.value : ''; });
        v.detail = halEl.value;
        v.jenis = jenisKini;
        v.lblJudul = (JENIS[jenisKini] || JENIS.buku).judul;
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
                buku: trim_(v.buku), hal: trim_(v.detail),
                jenis: JENIS[v.jenis] ? v.jenis : 'buku', link: trim_(v.link),
                topik: trim_(v.topik),
                temuan: trim_(v.temuan), reaksi: v.reaksi, alasan: trim_(v.alasan),
                hubungan: trim_(v.hubungan), tanya: trim_(v.tanya)
              };
              items.push(it);
              if (!store(KEY, items)) {
                render();
                msg('Tersimpan di server, tetapi daftar browser ini penuh/dinonaktifkan.', true);
                return;
              }
              // SUKSES: bersihkan semua field + buang draf.
              // Judul tidak ditulis balik ke sini (dulu penyebab bug reset).
              clearForm();
              render();
              msg('Tersimpan. Total ' + items.length + ' catatan.');
            } else {
              // GAGAL: form dan draf tidak disentuh, isian tetap utuh.
              msg('Gagal menyimpan: ' + ((res && res.error) || 'respons server tidak dikenal'), true);
            }
          })
          .catch(function () {
            // GAGAL: form dan draf tidak disentuh, isian tetap utuh.
            msg('Gagal menyimpan. Periksa jaringan, lalu coba lagi.', true);
          })
          .then(function () { btn.disabled = false; });
      });

      /* ---------- init ---------- */
      form.addEventListener('input', saveDraft);
      form.addEventListener('change', saveDraft);
      topikEl.addEventListener('input', function () { saveDraft(); renderTagHint(); });

      // Pergantian chip sumber: simpan Detail jenis lama, muat Detail jenis baru.
      var sumberRadios = document.querySelectorAll('input[name=sumber]');
      for (var si = 0; si < sumberRadios.length; si++) {
        sumberRadios[si].addEventListener('change', function () {
          if (!this.checked) return;
          if (halEl) detailMap[jenisKini] = halEl.value;
          jenisKini = JENIS[this.value] ? this.value : 'buku';
          updateLabel_();
          if (halEl) halEl.value = detailMap[jenisKini];
          saveDraft();
        });
      }

      // Kapital huruf pertama judul SAAT mengetik (hanya char index 0,
      // panjang tidak berubah -> posisi kursor dipertahankan).
      bukuEl.addEventListener('input', function () {
        var lama = bukuEl.value;
        var baru = kapitalAwal(lama, false);
        if (baru === lama) return;
        var pos = bukuEl.selectionStart;
        bukuEl.value = baru;
        if (typeof pos === 'number' && bukuEl.setSelectionRange) bukuEl.setSelectionRange(pos, pos);
      });

      // Sekali lagi saat blur: trim spasi depan + kapital.
      bukuEl.addEventListener('blur', function () {
        var baru = kapitalAwal(bukuEl.value, true);
        if (baru !== bukuEl.value) { bukuEl.value = baru; saveDraft(); }
      });

      jenisKini = getJenis();
      detailMap = defaultDetail_();
      updateLabel_();
      halEl.value = detailMap[jenisKini];

      loadDraft();
      render();
      if (!url) msg('URL belum diisi di config.js', true);
      loadTags();
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) console.error('catatan-baca: ' + err);
    }
  })();
}
