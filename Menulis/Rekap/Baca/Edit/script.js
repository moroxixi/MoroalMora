/* ==========================================================================
 *  Rekap/Baca/Edit - script.js (edit SATU tulisan lewat ?id=)
 *
 *  URL endpoint ada di ../../../config.js (konstanta ENDPOINT).
 *  Pola fetch & pesan error = Menulis/Catatan-Baca/script.js (key `error`).
 *
 *  P4: halaman ini meniru bentuk formulir SUMBER tulisannya (satu halaman,
 *  dua varian, dipilih dari item.sumber):
 *    - "Jawab-Pertanyaan" -> form Menulis/Jawab-Pertanyaan/index.html
 *      (urutan field, label, placeholder, hint titik, auto-grow textarea).
 *    - "Catatan" -> form Menulis/Catatan-Baca/index.html
 *      (chip jenis read-only, baris Judul+Detail adaptif per jenis,
 *       radio Reaksiku + Alasan, hint per field).
 *  TAG & JENIS DIKUNCI: chip read-only, TIDAK PERNAH dikirim.
 *  Payload rekapUpdate HANYA berisi key whitelist untuk field yang TAMPIL:
 *    Jawab     : judul, dugaan, dukung, runtuh, simpul, next (tanpa detail/link)
 *    Catatan   : judul, detail, link, dugaan, simpul, dukung, next (tanpa runtuh)
 *  Validasi klien mencerminkan backend (rekapUpdate_): judul <= 1000,
 *  field lain <= 45000, judul/dugaan/simpul wajib; pesan memakai label
 *  form masing-masing sumber.
 *  RENDER: semua teks via textContent/value - tidak pernah innerHTML.
 * ========================================================================== */

/* ==========================================================================
 * 1. Fungsi murni (tanpa DOM) - bisa diuji lewat node require()
 * ========================================================================== */

function trim_(s) {
  if (s === null || typeof s === 'undefined') return '';
  return String(s).replace(/^\s+|\s+$/g, '');
}

/* Label & placeholder adaptif per jenis - disalin PERSIS dari
   Menulis/Catatan-Baca/script.js (map JENIS, baris 139-143). Jangan menebak.
   kunci .judul = label+placeholder field judul; kunci .detail = label
   field detail; kunci .ph = placeholder field detail. */
var JENIS_CATATAN = {
  'Buku':         { judul: 'Judul buku',    detail: 'Halaman',               ph: '19' },
  'Media sosial': { judul: 'Judul post',    detail: 'Platform',              ph: 'misal: Substack' },
  'Podcast':      { judul: 'Judul episode', detail: 'Menit ke-',             ph: '12' },
  'Video':        { judul: 'Judul video',   detail: 'Menit ke-',             ph: '12' },
  'Lainnya':      { judul: 'Judul sumber',  detail: 'Keterangan (opsional)', ph: 'opsional' }
};

/* Nilai radio Reaksiku - persis form Catatan-Baca/index.html (name=reaksi). */
var REAKSI_OPSI = ['Setuju', 'Ragu', 'Teringat hal lain'];

/**
 * Parse isi kolom `simpul` Catatan. Format asli (disusun di
 * Menulis/Catatan-Baca/script.js baris 194-195):
 *   "Reaksi: <x>"  +  opsional  "\nAlasan: <y>"  (y boleh multi-baris).
 * Return:
 *   {mode:'radio', reaksi:x, alasan:y}
 *     - pola cocok DAN <x> sama persis dengan salah satu opsi radio.
 *   {mode:'teks', teks:teks}
 *     - selain itu (pola tidak cocok / <x> tidak dikenal / string kosong):
 *       TANPA pembuangan data - pemanggil menampilkan teks apa adanya
 *       dan mengirimnya apa adanya.
 */
function parseSimpul(teks) {
  var s = teks === null || typeof teks === 'undefined' ? '' : String(teks);
  var m = /^Reaksi: ([^\n]*)(?:\nAlasan: ([\s\S]*))?$/.exec(s);
  if (m && REAKSI_OPSI.indexOf(m[1]) !== -1) {
    return { mode: 'radio', reaksi: m[1], alasan: m[2] === undefined ? '' : m[2] };
  }
  return { mode: 'teks', teks: s };
}

/**
 * Susun `simpul` persis seperti Catatan-Baca/script.js baris 194-195:
 *   "Reaksi: " + pilihan, ditambah "\nAlasan: " + alasan HANYA bila alasan
 *   (setelah trim, sama seperti trim_ di petaKePayload) tidak kosong.
 *   Pilihan kosong -> '' (validasi klien memblokir sebelum kirim).
 */
function susunSimpul(pilihan, alasan) {
  var p = trim_(pilihan);
  if (!p) return '';
  var s = 'Reaksi: ' + p;
  var a = trim_(alasan);
  if (a) s += '\nAlasan: ' + a;
  return s;
}

/* Ekspor untuk tes node; tidak berpengaruh di browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    trim_: trim_,
    parseSimpul: parseSimpul,
    susunSimpul: susunSimpul,
    JENIS_CATATAN: JENIS_CATATAN,
    REAKSI_OPSI: REAKSI_OPSI
  };
}

/* ==========================================================================
 * 2. Bagian DOM - hanya dijalankan di browser (guard aman di node).
 * ========================================================================== */
if (typeof document !== 'undefined') {
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

  /* Label per sumber - dipakai untuk validasi & varian Jawab. */
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

  var WAJIB_MAX = 1000;   // = PERTANYAAN_MAX_LEN backend (judul)
  var ISI_MAX = 45000;    // = ISI_MAX backend (field lain)

  var id = '';
  try { id = new URLSearchParams(location.search).get('id') || ''; } catch (e) { id = ''; }

  var sumberKini = '';  // 'Catatan' | 'Jawab-Pertanyaan' (setelah rekapBaca)
  var modeKini = '';    // 'jwb' | 'cat-radio' | 'cat-teks'
  var jenisKini = '';   // nama jenis Catatan (mis. 'Buku'); '' bila tak ada
  var LBL = {};         // id elemen -> label form (untuk pesan validasi)

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

  function str(v) {
    return v === null || typeof v === 'undefined' ? '' : String(v);
  }

  function chip(kelas, teks) {
    var c = document.createElement('span');
    c.className = kelas;
    c.textContent = teks;
    return c;
  }

  /* Label adaptif Catatan (fallback persis Baca: 'Judul' / 'Detail'). */
  function labelJudulCatatan() {
    var j = JENIS_CATATAN[jenisKini];
    return j ? j.judul : LABEL.Catatan.judul;
  }
  function labelDetailCatatan() {
    var j = JENIS_CATATAN[jenisKini];
    return j ? j.detail : 'Detail';
  }

  /* ----- pembangun field (pola HTML form sumber) ----- */

  function labelL(teks) { // span.l gaya sibling (.l sudah ada di style.css)
    var l = document.createElement('span');
    l.className = 'l';
    l.textContent = teks;
    return l;
  }

  function hintH(teks) { // span.h gaya sibling (petunjuk di bawah label)
    var h = document.createElement('span');
    h.className = 'h';
    h.textContent = teks;
    return h;
  }

  function dotEl() { // titik penanda kolom wajib (form Jawab-Pertanyaan)
    var d = document.createElement('span');
    d.className = 'dot';
    return d;
  }

  /* input[type=text|url] dalam label.f - struktur field Catatan-Baca */
  function fInput(key, label, ph, max, nilai, tipe) {
    var w = document.createElement('label');
    w.className = 'f';
    w.appendChild(labelL(label));
    var el = document.createElement('input');
    el.type = tipe || 'text';
    el.id = 'f-' + key;
    if (ph) el.placeholder = ph;
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('maxlength', String(max));
    el.value = str(nilai);
    w.appendChild(el);
    LBL[el.id] = label;
    return w;
  }

  /* textarea dalam label.f (+hint opsional) - struktur Catatan-Baca */
  function fTextarea(key, label, hintTeks, ph, max, nilai) {
    var w = document.createElement('label');
    w.className = 'f';
    w.appendChild(labelL(label));
    if (hintTeks) w.appendChild(hintH(hintTeks));
    var ta = document.createElement('textarea');
    ta.id = 'f-' + key;
    if (ph) ta.placeholder = ph;
    ta.setAttribute('maxlength', String(max));
    ta.value = str(nilai);
    w.appendChild(ta);
    LBL[ta.id] = label;
    return w;
  }

  /* Auto-grow textarea - persis grow() di
     Menulis/Jawab-Pertanyaan/script.js baris 16 (min 72px). */
  function grow(t) {
    t.style.height = 'auto';
    t.style.height = Math.max(72, t.scrollHeight + 2) + 'px';
  }
  function onGrow() { grow(this); }

  /* ----- varian Jawab-Pertanyaan (tiru Jawab-Pertanyaan/index.html) ----- */
  function bangunJawab(item) {
    var L = LABEL['Jawab-Pertanyaan'];
    modeKini = 'jwb';

    /* hint pembuka (index.html baris 20: "Hari malas? ...") */
    var hp = document.createElement('p');
    hp.className = 'hint';
    hp.appendChild(dotEl());
    hp.appendChild(document.createTextNode('Hari malas? Isi tiga kolom bertanda titik saja.'));
    fieldsEl.appendChild(hp);

    /* urutan & placeholder = form asli (index.html baris 22-27) */
    var defs = [
      { key: 'judul',  label: L.judul,  dot: true,  ph: 'Satu kalimat. Apa yang ingin kamu cari tahu hari ini?', max: WAJIB_MAX },
      { key: 'dugaan', label: L.dugaan, dot: true,  ph: 'Dua sampai tiga kalimat. Jawabanmu sebelum mencari.', max: ISI_MAX },
      { key: 'dukung', label: L.dukung, dot: false, ph: 'Satu sumber, fakta, atau pengalaman.', max: ISI_MAX },
      { key: 'runtuh', label: L.runtuh, dot: false, ph: 'Satu hal yang bisa membantah dugaanmu.', max: ISI_MAX },
      { key: 'simpul', label: L.simpul, dot: true,  ph: 'Dua kalimat. Boleh berubah besok.', max: ISI_MAX },
      { key: 'next',   label: L.next,   dot: false, ph: 'Ini akan jadi pertanyaan awal besok.', max: ISI_MAX }
    ];

    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var w = document.createElement('div');
      w.className = 'f jwb';
      var lab = document.createElement('label');
      lab.setAttribute('for', 'f-' + d.key);
      if (d.dot) lab.appendChild(dotEl());
      lab.appendChild(document.createTextNode(d.label));
      w.appendChild(lab);
      var ta = document.createElement('textarea');
      ta.id = 'f-' + d.key;
      ta.placeholder = d.ph;
      ta.setAttribute('maxlength', String(d.max));
      ta.value = str(item[d.key]);
      w.appendChild(ta);
      LBL[ta.id] = d.label;
      fieldsEl.appendChild(w);
    }

    var tas = fieldsEl.querySelectorAll('textarea');
    for (var j = 0; j < tas.length; j++) {
      grow(tas[j]);
      tas[j].addEventListener('input', onGrow);
    }
  }

  /* ----- varian Catatan (tiru Catatan-Baca/index.html) ----- */
  function bangunCatatan(item) {
    var L = LABEL.Catatan;
    jenisKini = JENIS_CATATAN[item.jenis] ? item.jenis : '';
    var j = JENIS_CATATAN[jenisKini];
    var lblJudul = labelJudulCatatan();
    var lblDetail = labelDetailCatatan();

    /* baris Judul + Detail (index.html baris 28-29; label & placeholder
       adaptif per jenis, sama seperti updateLabel_ di form asli) */
    var row = document.createElement('div');
    row.className = 'row';
    row.appendChild(fInput('judul', lblJudul, j ? j.judul : 'Judul', WAJIB_MAX, item.judul));
    row.appendChild(fInput('detail', lblDetail, j ? j.ph : '', ISI_MAX, item.detail));
    fieldsEl.appendChild(row);

    /* Link (index.html baris 31) */
    fieldsEl.appendChild(fInput('link', L.link, 'https://', ISI_MAX, item.link, 'url'));

    /* Yang kutemukan + hint (index.html baris 36) */
    fieldsEl.appendChild(fTextarea('dugaan', L.dugaan,
      'Tulis ulang dengan kata sendiri, jangan salin kalimat sumbernya.',
      'Penulis bilang bahwa...', ISI_MAX, item.dugaan));

    /* Reaksiku: radio + Alasan (index.html baris 37-45) ATAU,
       bila teks simpul tidak cocok pola, satu textarea mentah. */
    var p = parseSimpul(str(item.simpul));
    var fR = document.createElement('div');
    fR.className = 'f';
    fR.appendChild(labelL(L.simpul));
    if (p.mode === 'radio') {
      modeKini = 'cat-radio';
      var chips = document.createElement('div');
      chips.className = 'chips';
      chips.setAttribute('role', 'radiogroup');
      chips.setAttribute('aria-label', 'Reaksi');
      for (var i = 0; i < REAKSI_OPSI.length; i++) {
        var lab = document.createElement('label');
        var r = document.createElement('input');
        r.type = 'radio';
        r.name = 'reaksi';
        r.value = REAKSI_OPSI[i];
        if (p.reaksi === REAKSI_OPSI[i]) r.checked = true;
        var sp = document.createElement('span');
        sp.textContent = REAKSI_OPSI[i];
        lab.appendChild(r);
        lab.appendChild(sp);
        chips.appendChild(lab);
      }
      fR.appendChild(chips);
      var al = document.createElement('textarea');
      al.id = 'f-alasan';
      al.placeholder = 'Kenapa? Apa yang kamu rasakan atau ingat?';
      al.setAttribute('maxlength', String(ISI_MAX));
      al.value = p.alasan;
      fR.appendChild(al);
      LBL[al.id] = L.simpul;
    } else {
      modeKini = 'cat-teks';
      /* label diganti: hanya SATU textarea mentah, tanpa radio */
      var lRaw = document.createElement('span');
      lRaw.className = 'l';
      lRaw.textContent = 'Reaksiku (teks asli)';
      fR.replaceChild(lRaw, fR.firstChild);
      var raw = document.createElement('textarea');
      raw.id = 'f-simpul';
      raw.setAttribute('maxlength', String(ISI_MAX));
      raw.value = p.teks; // teks asli APA ADANYA (tanpa pembuangan data)
      fR.appendChild(raw);
      LBL[raw.id] = L.simpul;
    }
    fieldsEl.appendChild(fR);

    /* Nyambung ke apa + hint (index.html baris 46) */
    fieldsEl.appendChild(fTextarea('dukung', L.dukung,
      'Pertanyaan di daftarmu, pengalamanmu, atau buku lain.',
      'Ini mirip dengan...', ISI_MAX, item.dukung));

    /* Pertanyaan yang muncul + hint (index.html baris 47) */
    fieldsEl.appendChild(fTextarea('next', L.next,
      'Apa yang sekarang ingin kamu cari tahu?',
      'Kalau begitu, apakah...', ISI_MAX, item.next));
  }

  function bangunForm(item) {
    sumberKini = item.sumber === 'Catatan' ? 'Catatan' : 'Jawab-Pertanyaan';
    jenisKini = '';
    LBL = {};
    subEl.textContent = item.sumber || '';

    /* TAG & JENIS DIKUNCI: chip read-only, tidak pernah ikut payload. */
    while (roEl.firstChild) roEl.removeChild(roEl.firstChild);
    if (item.tag) roEl.appendChild(chip('chip', item.tag));
    if (item.jenis) roEl.appendChild(chip('chip jenis', item.jenis));
    if (sumberKini === 'Catatan' && item.jenis) {
      var note = document.createElement('span');
      note.className = 'note';
      note.textContent = 'Jenis tidak bisa diubah.';
      roEl.appendChild(note);
    }

    while (fieldsEl.firstChild) fieldsEl.removeChild(fieldsEl.firstChild);
    if (sumberKini === 'Catatan') bangunCatatan(item);
    else bangunJawab(item);

    /* tombol mengikuti form sumber (Simpan catatan / Simpan halaman) */
    btnEl.textContent = sumberKini === 'Catatan' ? 'Simpan catatan' : 'Simpan halaman';

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

  function reaksiTerpilih() {
    var r = document.querySelector('input[name=reaksi]:checked');
    return r ? r.value : '';
  }

  /* Validasi = cermin backend (rekapUpdate_): judul/dugaan/simpul wajib,
     judul <= 1000, field lain <= 45000 (panjang setelah trim, seperti str_);
     SEMUA pesan memakai label form masing-masing sumber. */
  function validasi() {
    var L = LABEL[sumberKini];
    var lJudul = sumberKini === 'Catatan' ? labelJudulCatatan() : L.judul;

    var miss = [];
    if (!trim_(nilai('judul'))) miss.push(lJudul);
    if (!trim_(nilai('dugaan'))) miss.push(L.dugaan);
    if (modeKini === 'cat-radio') {
      if (!reaksiTerpilih()) miss.push(L.simpul); // 'Reaksiku' wajib dipilih
    } else if (!trim_(nilai('simpul'))) {
      miss.push(L.simpul);
    }
    if (miss.length) return 'Isi dulu: ' + miss.join(', ') + '.';

    if (trim_(nilai('judul')).length > WAJIB_MAX) {
      return lJudul + ' maksimal ' + WAJIB_MAX + ' karakter.';
    }

    /* panjang field lain - hanya elemen yang TAMPIL (input/textarea ber-id) */
    var els = fieldsEl.querySelectorAll('input, textarea');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el.id || el.id === 'f-judul') continue;
      if (trim_(el.value).length > ISI_MAX) {
        return (LBL[el.id] || 'Isi') + ' maksimal ' + ISI_MAX + ' karakter.';
      }
    }
    /* simpul tersusun (mode radio) bisa lebih panjang dari alasan mentah */
    if (modeKini === 'cat-radio' &&
        susunSimpul(reaksiTerpilih(), nilai('alasan')).length > ISI_MAX) {
      return L.simpul + ' maksimal ' + ISI_MAX + ' karakter.';
    }
    return '';
  }

  /* HANYA key whitelist untuk field yang TAMPIL per varian;
     tag/jenis/sumber/id TIDAK PERNAH masuk fields. */
  function ambilFields() {
    var fields = {};
    if (sumberKini === 'Catatan') {
      fields.judul = nilai('judul');
      fields.detail = nilai('detail');
      fields.link = nilai('link');
      fields.dugaan = nilai('dugaan');
      fields.simpul = (modeKini === 'cat-radio')
        ? susunSimpul(reaksiTerpilih(), nilai('alasan'))
        : nilai('simpul'); // mode teks: apa adanya
      fields.dukung = nilai('dukung');
      fields.next = nilai('next');
      // runtuh TIDAK dikirim (form Catatan tidak punya field itu)
    } else {
      fields.judul = nilai('judul');
      fields.dugaan = nilai('dugaan');
      fields.dukung = nilai('dukung');
      fields.runtuh = nilai('runtuh');
      fields.simpul = nilai('simpul');
      fields.next = nilai('next');
      // detail/link TIDAK dikirim (form Jawab tidak punya kedua field itu)
    }
    return fields;
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

    var fields = ambilFields();

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
}
