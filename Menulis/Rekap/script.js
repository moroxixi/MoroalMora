/* ==========================================================================
 *  Rekap - script.js (daftar tulisan + filter tag sisi klien)
 *
 *  URL endpoint ada di ../config.js (konstanta ENDPOINT). JANGAN hardcode URL
 *  di file ini. Pola fetch disalin dari Menulis/Catatan-Baca/script.js:
 *  POST + header text/plain + body JSON, respons {ok:true,...} atau
 *  {ok:false, error:string} -> pesan error dibaca dari key `error`.
 *  Semua teks dari backend dirender dengan textContent (aman dari injeksi HTML).
 * ========================================================================== */
(function () {
  'use strict';

  var url = (typeof ENDPOINT !== 'undefined' && ENDPOINT) ? String(ENDPOINT) : '';

  var filterEl = document.getElementById('filter');
  var listEl = document.getElementById('list');
  var loadingEl = document.getElementById('loading');
  var errorEl = document.getElementById('error');
  var errmsgEl = document.getElementById('errmsg');
  var emptyEl = document.getElementById('empty');
  var femptyEl = document.getElementById('fempty');
  var retryEl = document.getElementById('retry');

  var items = []; // hasil rekapDaftar: diambil SEKALI, disimpan di memori
  var tags = [];        // tag unik dari items (urutan kemunculan)
  var aktif = '';       // '' = "Semua"

  function apiPost(payload) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });
  }

  function show(el, on) { el.hidden = !on; }

  function setState(mode, pesan) {
    show(loadingEl, mode === 'loading');
    show(errorEl, mode === 'error');
    show(emptyEl, mode === 'empty');
    errmsgEl.textContent = mode === 'error' ? (pesan || 'Gagal memuat daftar rekap.') : '';
  }

  /* ---------- chip filter: "Semua" + tag unik dari items ---------- */
  function renderFilter() {
    while (filterEl.firstChild) filterEl.removeChild(filterEl.firstChild);
    var all = [''].concat(tags);
    for (var i = 0; i < all.length; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = all[i] === '' ? 'Semua' : all[i];
      b.setAttribute('data-tag', all[i]);
      filterEl.appendChild(b);
    }
    syncPressed();
  }

  function syncPressed() {
    var bs = filterEl.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      bs[i].setAttribute('aria-pressed', bs[i].getAttribute('data-tag') === aktif ? 'true' : 'false');
    }
  }

  function filtered() {
    if (!aktif) return items;
    var out = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].tag === aktif) out.push(items[i]);
    }
    return out;
  }

  /* ---------- kartu: chip tag + judul (potong) + tanggal, lalu preview ---------- */
  function kartu(it) {
    var a = document.createElement('a');
    a.className = 'card';
    a.href = 'Baca/?id=' + encodeURIComponent(it.id || '');

    var row = document.createElement('div');
    row.className = 'row1';

    var chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = it.tag || '';
    row.appendChild(chip);

    var h = document.createElement('h2');
    h.className = 'judul';
    h.textContent = it.judul || 'Tanpa judul';
    row.appendChild(h);

    var tgl = document.createElement('span');
    tgl.className = 'tgl';
    tgl.textContent = it.tanggal || '';
    row.appendChild(tgl);

    a.appendChild(row);

    if (it.preview) {
      var p = document.createElement('p');
      p.className = 'prev';
      p.textContent = it.preview;
      a.appendChild(p);
    }
    return a;
  }

  function render() {
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
    var rows = filtered();
    show(femptyEl, !!aktif && rows.length === 0);
    for (var i = 0; i < rows.length; i++) listEl.appendChild(kartu(rows[i]));
  }

  /* ---------- muat sekali ---------- */
  function muat() {
    if (!url) { setState('error', 'URL belum diisi di config.js'); return; }
    setState('loading');
    apiPost({ action: 'rekapDaftar' })
      .then(function (res) {
        if (!res || !res.ok) {
          setState('error', (res && res.error) || 'Gagal memuat daftar rekap.');
          return;
        }
        items = res.items || [];
        tags = [];
        for (var i = 0; i < items.length; i++) {
          var t = items[i].tag || '';
          if (t && tags.indexOf(t) < 0) tags.push(t);
        }
        renderFilter();
        render();
        setState(items.length ? 'ready' : 'empty');
      })
      .catch(function () {
        setState('error', 'Gagal memuat. Periksa jaringan, lalu coba lagi.');
      });
  }

  filterEl.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!b || !filterEl.contains(b)) return;
    aktif = b.getAttribute('data-tag') || '';
    syncPressed();
    render();
  });

  retryEl.addEventListener('click', muat);

  muat();
})();
