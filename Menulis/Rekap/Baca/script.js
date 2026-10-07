/* ==========================================================================
 *  Rekap/Baca - script.js (baca SATU tulisan lewat ?id=)
 *
 *  URL endpoint ada di ../../config.js (konstanta ENDPOINT).
 *  Pola fetch & pesan error = Menulis/Catatan-Baca/script.js (key `error`).
 *
 *  Pemetaan LABEL per sumber (kolom sheet yang sama berisi hal berbeda):
 *    field   | Jawab-Pertanyaan      | Catatan
 *    judul   | Pertanyaan            | Judul
 *    dugaan  | Dugaan awal           | Yang kutemukan
 *    dukung  | Yang mendukung        | Nyambung ke apa
 *    runtuh  | Yang meruntuhkan      | (tidak ada - sembunyikan)
 *    simpul  | Kesimpulan sementara  | Reaksiku (teks "Reaksi:...\nAlasan:...")
 *    next    | Pertanyaan berikutnya | Pertanyaan yang muncul
 *    detail  | (tidak ada)           | label adaptif per jenis (LABEL_DETAIL)
 *    link    | Link                  | Link (tautan hanya bila http(s))
 *  Field kosong tidak ditampilkan. Semua teks via textContent.
 * ========================================================================== */
(function () {
  'use strict';

  var url = (typeof ENDPOINT !== 'undefined' && ENDPOINT) ? String(ENDPOINT) : '';

  var loadingEl = document.getElementById('loading');
  var errorEl = document.getElementById('error');
  var errmsgEl = document.getElementById('errmsg');
  var retryEl = document.getElementById('retry');
  var viewEl = document.getElementById('view');
  var metaEl = document.getElementById('meta');
  var judulEl = document.getElementById('judul');
  /* P4: label kecil di atas judul (kelas .k, sama dengan field lain);
     disisipkan dari JS karena index.html tidak diubah. */
  var judulLblEl = document.createElement('span');
  judulLblEl.className = 'k';
  var isiEl = document.getElementById('isi');
  var editEl = document.getElementById('edit');

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

  var id = '';
  try { id = new URLSearchParams(location.search).get('id') || ''; } catch (e) { id = ''; }

  function apiPost(payload) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });
  }

  function show(el, on) { el.hidden = !on; }

  function tampilkanError(pesan) {
    show(loadingEl, false);
    show(viewEl, false);
    show(editEl, false);
    show(errorEl, true);
    errmsgEl.textContent = pesan || 'Gagal memuat tulisan.';
  }

  function chip(kelas, teks) {
    var c = document.createElement('span');
    c.className = kelas;
    c.textContent = teks;
    return c;
  }

  function blok(label, nilai, wadah) {
    var val = nilai === null || typeof nilai === 'undefined' ? '' : String(nilai);
    if (!val.replace(/^\s+|\s+$/g, '')) return; // field kosong tidak ditampilkan
    var d = document.createElement('div');
    d.className = 'blok';
    var k = document.createElement('span');
    k.className = 'k';
    k.textContent = label;
    d.appendChild(k);
    var p = document.createElement('p');
    p.textContent = val; // teks backend SELALU textContent (bukan innerHTML)
    d.appendChild(p);
    wadah.appendChild(d);
  }

  /* Link: jadi <a> HANYA bila diawali http:// atau https://; selain itu teks. */
  function blokLink(label, nilai, wadah) {
    var val = nilai === null || typeof nilai === 'undefined' ? '' : String(nilai);
    var t = val.replace(/^\s+|\s+$/g, '');
    if (!t) return;
    var d = document.createElement('div');
    d.className = 'blok';
    var k = document.createElement('span');
    k.className = 'k';
    k.textContent = label;
    d.appendChild(k);
    var p = document.createElement('p');
    if (/^https?:\/\//i.test(t)) {
      var a = document.createElement('a');
      a.href = t;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = t;
      p.appendChild(a);
    } else {
      p.textContent = val; // javascript:/data:/dll -> teks biasa, bukan tautan
    }
    d.appendChild(p);
    wadah.appendChild(d);
  }

  function render(item) {
    var sumber = item.sumber === 'Catatan' ? 'Catatan' : 'Jawab-Pertanyaan';
    var L = LABEL[sumber];

    // chip tag + chip jenis (opsional)
    while (metaEl.firstChild) metaEl.removeChild(metaEl.firstChild);
    if (item.tag) metaEl.appendChild(chip('chip', item.tag));
    if (item.jenis) metaEl.appendChild(chip('chip jenis', item.jenis));

    judulEl.textContent = item.judul || '';
    show(judulEl, !!item.judul);

    // P4: label di atas judul - "Pertanyaan" (Jawab) / "Judul" (Catatan)
    if (item.judul) {
      judulLblEl.textContent = sumber === 'Catatan' ? 'Judul' : 'Pertanyaan';
      judulEl.parentNode.insertBefore(judulLblEl, judulEl);
    } else if (judulLblEl.parentNode) {
      judulLblEl.parentNode.removeChild(judulLblEl);
    }

    while (isiEl.firstChild) isiEl.removeChild(isiEl.firstChild);

    if (sumber === 'Catatan') {
      var lblDetail = LABEL_DETAIL[item.jenis] || 'Detail';
      blok(lblDetail, item.detail, isiEl);
      blok(L.dugaan, item.dugaan, isiEl);
      blok(L.dukung, item.dukung, isiEl);
      blok(L.simpul, item.simpul, isiEl);
      blok(L.next, item.next, isiEl);
    } else {
      blok(L.dugaan, item.dugaan, isiEl);
      blok(L.dukung, item.dukung, isiEl);
      blok(L.runtuh, item.runtuh, isiEl);
      blok(L.simpul, item.simpul, isiEl);
      blok(L.next, item.next, isiEl);
    }
    blokLink(L.link, item.link, isiEl);

    editEl.href = 'Edit/?id=' + encodeURIComponent(item.id || id);
    show(loadingEl, false);
    show(errorEl, false);
    show(viewEl, true);
    show(editEl, true);
  }

  function muat() {
    if (!id) { tampilkanError('Parameter id wajib diisi.'); return; }
    if (!url) { tampilkanError('URL belum diisi di config.js'); return; }
    show(errorEl, false);
    show(viewEl, false);
    show(editEl, false);
    show(loadingEl, true);
    apiPost({ action: 'rekapBaca', id: id })
      .then(function (res) {
        if (!res || !res.ok) {
          tampilkanError((res && res.error) || 'Gagal memuat tulisan.');
          return;
        }
        render(res.item);
      })
      .catch(function () {
        tampilkanError('Gagal memuat. Periksa jaringan, lalu coba lagi.');
      });
  }

  retryEl.addEventListener('click', muat);

  muat();
})();
