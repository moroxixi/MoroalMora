/* ==========================================================================
 *  Rekap/Baca/Edit - script.js (edit SATU tulisan lewat ?id=)
 *
 *  URL endpoint ada di ../../../config.js (konstanta ENDPOINT).
 *  Pola fetch & pesan error = Menulis/Catatan-Baca/script.js (key `error`).
 *
 *  TAG DIKUNCI: chip read-only, tanpa input, TIDAK PERNAH dikirim.
 *  Field yang diedit = yang tampil per sumber (tabel pemetaan yang sama
 *  dengan halaman Baca); payload rekapUpdate HANYA berisi key whitelist
 *  (judul, dugaan, dukung, runtuh, simpul, next, detail, link) untuk field
 *  yang tampil. Validasi klien mencerminkan backend:
 *  judul <= 1000 (maxlength), field lain <= 45000, judul/dugaan/simpul wajib.
 * ========================================================================== */
(function () {
  'use strict';

  var url = (typeof ENDPOINT !== 'undefined' && ENDPOINT) ? String(ENDPOINT) : '';

  var subEl = document.getElementById('sub');
  var errorEl = document.getElementById('error');
  var errmsgEl = document.getElementById('errmsg');
  var retryEl = document.getElementById('retry');
  var formEl = document.getElementById('form');
  var roEl = document.getElementById('ro');
  var fieldsEl = document.getElementById('fields');
  var btnEl = document.getElementById('simpan');
  var msgEl = document.getElementById('msg');
  var navEl = document.getElementById('nav');
  var batalEl = document.getElementById('batal');

  var LABEL = {
    'Jawab-Pertanyaan': {
      judul: 'Pertanyaan', dugaan: 'Dugaan awal', dukung: 'Yang mendukung',
      runtuh: 'Yang meruntuhkan', simpul: 'Kesimpulan sementara',
      next: 'Pertanyaan berikutnya', link: 'Link'
    },
    'Catatan': {
      judul: 'Judul', dugaan: 'Yang kutemukan', dukung: 'Nyambung ke apa',
      runtuh: '', simpul: 'Reaksiku',
      next: 'Pertanyaan yang muncul', link: 'Link'
    }
  };

  /* Label Detail per jenis - disalin PERSIS dari Menulis/Catatan-Baca/script.js
     baris 123-127 (kunci `.detail` pada map JENIS). Jangan menebak. */
  var LABEL_DETAIL = {
    'Buku': 'Halaman',
    'Media sosial': 'Platform',
    'Podcast': 'Menit ke-',
    'Video': 'Menit ke-',
    'Lainnya': 'Keterangan (opsional)'
  };

  var WAJIB_MAX = 1000;   // = PERTANYAAN_MAX_LEN backend (judul)
  var ISI_MAX = 45000;    // = ISI_MAX backend (field lain)

  // Urutan field per sumber; `hanya` membatasi sumber; `wajib` = tidak boleh kosong.
  var FIELDS = [
    { key: 'judul', jenis: 'input', wajib: true, max: WAJIB_MAX },
    { key: 'detail', jenis: 'input', hanya: 'Catatan', max: ISI_MAX },
    { key: 'dugaan', jenis: 'ta', wajib: true, max: ISI_MAX },
    { key: 'dukung', jenis: 'ta', max: ISI_MAX },
    { key: 'runtuh', jenis: 'ta', hanya: 'Jawab-Pertanyaan', max: ISI_MAX },
    { key: 'simpul', jenis: 'ta', wajib: true, max: ISI_MAX },
    { key: 'next', jenis: 'ta', max: ISI_MAX },
    { key: 'link', jenis: 'input', max: ISI_MAX }
  ];

  var id = '';
  try { id = new URLSearchParams(location.search).get('id') || ''; } catch (e) { id = ''; }
  var sumberKini = ''; // diisi setelah rekapBaca sukses

  function apiPost(payload) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });
  }

  function show(el, on) { el.hidden = !on; }

  function msg(teks, salah) {
    msgEl.textContent = teks || '';
    msgEl.className = salah ? 'msg err' : 'msg';
  }

  function tampilkanError(pesan) {
    show(formEl, false);
    show(navEl, false);
    show(errorEl, true);
    errmsgEl.textContent = pesan || 'Gagal memuat tulisan.';
    subEl.textContent = '';
  }

  function chip(kelas, teks) {
    var c = document.createElement('span');
    c.className = kelas;
    c.textContent = teks;
    return c;
  }

  function tampilMenurutSumber(def, sumber) {
    if (def.hanya && sumber !== def.hanya) return false;
    return true;
  }

  function labelUntuk(def, item, sumber) {
    if (def.key === 'detail') return LABEL_DETAIL[item.jenis] || 'Detail';
    return LABEL[sumber][def.key] || def.key;
  }

  function bangunForm(item) {
    var sumber = item.sumber === 'Catatan' ? 'Catatan' : 'Jawab-Pertanyaan';
    sumberKini = sumber;
    subEl.textContent = item.sumber || '';

    // TAG DIKUNCI: chip read-only, tanpa input, tidak pernah ikut payload.
    while (roEl.firstChild) roEl.removeChild(roEl.firstChild);
    if (item.tag) roEl.appendChild(chip('chip', item.tag));
    if (item.jenis) roEl.appendChild(chip('chip jenis', item.jenis));

    while (fieldsEl.firstChild) fieldsEl.removeChild(fieldsEl.firstChild);
    for (var i = 0; i < FIELDS.length; i++) {
      var def = FIELDS[i];
      if (!tampilMenurutSumber(def, sumber)) continue;

      var wrap = document.createElement('label');
      wrap.className = 'f';

      var l = document.createElement('span');
      l.className = 'l';
      l.textContent = labelUntuk(def, item, sumber);
      wrap.appendChild(l);

      var el;
      if (def.jenis === 'ta') {
        el = document.createElement('textarea');
      } else {
        el = document.createElement('input');
        el.type = 'text';
      }
      el.id = 'f-' + def.key;
      el.setAttribute('data-key', def.key);
      el.setAttribute('maxlength', String(def.max));
      el.value = item[def.key] === null || typeof item[def.key] === 'undefined' ? '' : String(item[def.key]);
      wrap.appendChild(el);
      fieldsEl.appendChild(wrap);
    }

    batalEl.href = '../?id=' + encodeURIComponent(item.id || id);
    show(errorEl, false);
    show(formEl, true);
    show(navEl, true);
    msg('', false);
  }

  function nilai(key) {
    var el = document.getElementById('f-' + key);
    return el ? String(el.value) : '';
  }

  /* Validasi = cermin backend (rekapUpdate_): judul/dugaan/simpul wajib,
     judul <= 1000, field lain <= 45000 (panjang setelah trim, seperti str_). */
  function validasi() {
    if (!nilai('judul').replace(/^\s+|\s+$/g, '') ||
        !nilai('dugaan').replace(/^\s+|\s+$/g, '') ||
        !nilai('simpul').replace(/^\s+|\s+$/g, '')) {
      return 'Isi dulu: Pertanyaan, Dugaan awal, Kesimpulan sementara.';
    }
    if (nilai('judul').replace(/^\s+|\s+$/g, '').length > WAJIB_MAX) {
      return 'Judul maksimal ' + WAJIB_MAX + ' karakter.';
    }
    for (var i = 0; i < FIELDS.length; i++) {
      var def = FIELDS[i];
      if (def.key === 'judul') continue;
      var el = document.getElementById('f-' + def.key);
      if (!el) continue;
      if (String(el.value).replace(/^\s+|\s+$/g, '').length > ISI_MAX) {
        return 'Isi maksimal ' + ISI_MAX + ' karakter.';
      }
    }
    return '';
  }

  function muat() {
    if (!id) { tampilkanError('Parameter id wajib diisi.'); return; }
    if (!url) { tampilkanError('URL belum diisi di config.js'); return; }
    show(errorEl, false);
    show(formEl, false);
    show(navEl, false);
    subEl.textContent = 'Memuat\u2026';
    apiPost({ action: 'rekapBaca', id: id })
      .then(function (res) {
        if (!res || !res.ok) {
          tampilkanError((res && res.error) || 'Gagal memuat tulisan.');
          return;
        }
        bangunForm(res.item);
      })
      .catch(function () {
        tampilkanError('Gagal memuat. Periksa jaringan, lalu coba lagi.');
      });
  }

  btnEl.addEventListener('click', function () {
    var err = validasi();
    if (err) { msg(err, true); return; }

    // Hanya key whitelist untuk field yang tampil; tag/jenis/id TIDAK ikut.
    var fields = {};
    for (var i = 0; i < FIELDS.length; i++) {
      var def = FIELDS[i];
      if (!tampilMenurutSumber(def, sumberKini)) continue;
      fields[def.key] = nilai(def.key);
    }

    btnEl.disabled = true; // cegah submit ganda
    msg('Menyimpan...', false);
    apiPost({ action: 'rekapUpdate', id: id, fields: fields })
      .then(function (res) {
        if (res && res.ok) {
          location.href = '../?id=' + encodeURIComponent(id); // ke halaman Baca
          return;
        }
        // GAGAL: isi form tidak disentuh, pesan error tampil.
        msg('Gagal menyimpan: ' + ((res && res.error) || 'respons server tidak dikenal'), true);
      })
      .catch(function () {
        msg('Gagal menyimpan. Periksa jaringan, lalu coba lagi.', true);
      })
      .then(function () {
        btnEl.disabled = false;
      });
  });

  retryEl.addEventListener('click', muat);

  muat();
})();
