# Graph Report - MoroalMora  (2026-10-07)

## Corpus Check
- 25 files · ~43,063 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 303 nodes · 620 edges · 23 communities (22 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0b6d11f1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur
- Tiga-Kisah-Babylon/script.js
- Catatan-Haid/script.js
- editor.js
- server.py
- appsscript.json
- Jawab-Pertanyaan/script.js
- Tiga Kisah dari Babylon
- MoroalMora-push.sh
- Menulis/Apps-Script/code.gs.js
- Read-Dashboard/Apps-Script/code.gs.js
- Read-Dashboard/script.js
- edit.js
- api.js
- read.js
- Catatan-Baca/script.js
- Discovery "Rekap" — laporan read-only
- Edit/script.js
- Rekap/script.js
- Baca/script.js

## God Nodes (most connected - your core abstractions)
1. `doPost()` - 16 edges
2. `str_()` - 14 edges
3. `str_()` - 11 edges
4. `rekapDaftar_()` - 10 edges
5. `runSearch()` - 10 edges
6. `json_()` - 9 edges
7. `loadAll()` - 8 edges
8. `rekapUpdate_()` - 8 edges
9. `ensureSheet_()` - 8 edges
10. `updateDoc_()` - 8 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (23 total, 1 thin omitted)

### Community 0 - "Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur"
Cohesion: 0.13
Nodes (14): 1. Install & login clasp, 2. Buat Sheet + project Apps Script terikat, 3. Push kode backend, 4. Deploy sebagai Web App (MANUAL — tidak otomatis), 5. Isi URL ke config.js, 6. Test end-to-end, Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur, Endpoint Apps Script (`gas/Code.gs`) (+6 more)

### Community 1 - "Tiga-Kisah-Babylon/script.js"
Cohesion: 0.47
Nodes (9): bacaInline(), el(), gagal(), muat(), ornament(), render(), renderBenangMerah(), renderInline() (+1 more)

### Community 2 - "Catatan-Haid/script.js"
Cohesion: 0.20
Nodes (23): apiGet(), apiPost(), bindReminderButtons(), csvEscape(), downloadCsv(), escapeHtml(), fmtDurasi(), fmtTanggal() (+15 more)

### Community 3 - "editor.js"
Cohesion: 0.20
Nodes (23): apiGet(), apiPost(), blankValueOf(), buildArrayEditor(), buildArrayItem(), buildControl(), buildObjectEditor(), collectValue() (+15 more)

### Community 4 - "server.py"
Cohesion: 0.21
Nodes (11): BaseHTTPRequestHandler, find_free_port(), Handler, is_safe_folder_name(), json_bytes(), main(), Subfolder LANGSUNG di dalam Kisah/ yang berisi content.json., Nama folder aman: non-kosong, bukan '.'/'..', tanpa separator path. (+3 more)

### Community 5 - "appsscript.json"
Cohesion: 0.40
Nodes (4): dependencies, exceptionLogging, runtimeVersion, timeZone

### Community 6 - "Jawab-Pertanyaan/script.js"
Cohesion: 0.16
Nodes (17): applyMin(), el(), fill(), get(), grow(), itemNode(), muat(), onHapus() (+9 more)

### Community 7 - "Tiga Kisah dari Babylon"
Cohesion: 0.33
Nodes (5): Benang Merah dari Tiga Kisah, Kisah Kedua: Idin, Sang Guru Tua, dan Bel yang Tidak Peduli, Kisah Ketiga: Ur-Nanshe dan Kebun yang Tak Pernah Dilihat, Kisah Pertama: Naran dan Sungai yang Tidak Peduli, Tiga Kisah dari Babylon

### Community 10 - "Menulis/Apps-Script/code.gs.js"
Cohesion: 0.22
Nodes (28): backfillIds_(), daftarPertanyaan_(), daftarTag_(), doGet(), doPost(), ensureTagHeaders_(), findSheet_(), getOrCreateDaftarSheet_() (+20 more)

### Community 11 - "Read-Dashboard/Apps-Script/code.gs.js"
Cohesion: 0.26
Nodes (22): createDoc_(), deleteDoc_(), doGet(), doPost(), ensureSheet_(), errMessage_(), findRow_(), getDoc_() (+14 more)

### Community 12 - "Read-Dashboard/script.js"
Cohesion: 0.19
Nodes (25): buildCard(), closeMenus(), el(), errText(), extOf(), fillHighlighted(), formatDate(), handleSearchInput() (+17 more)

### Community 13 - "edit.js"
Cohesion: 0.38
Nodes (7): clearDraft(), errText(), load(), readDraft(), save(), showError(), showState()

### Community 14 - "api.js"
Cohesion: 0.57
Nodes (7): do_GET(), do_POST(), endpoint(), fetchText(), isConfigured(), unwrap(), withQuery()

### Community 15 - "read.js"
Cohesion: 0.60
Nodes (5): errText(), formatDate(), load(), renderDoc(), showState()

### Community 17 - "Catatan-Baca/script.js"
Cohesion: 0.15
Nodes (28): appendTagBtn(), berurutanUtuh_(), clearForm(), clearHint(), defaultDetail_(), drop(), el(), field() (+20 more)

### Community 19 - "Discovery "Rekap" — laporan read-only"
Cohesion: 0.22
Nodes (8): a. Daftar fungsi (543 baris total), b. doGet — parameter & bentuk respons, c. doPost — action, field payload, bentuk respons, d. Struktur sheet, Discovery "Rekap" — laporan read-only, e. Membedakan baris Jawab-Pertanyaan vs Catatan-Baca, f. Aksi hapus/edit yang sudah ada, g. Batasan (trim/limit/sanitasi/caching/lock)

### Community 20 - "Edit/script.js"
Cohesion: 0.33
Nodes (11): apiPost(), bangunForm(), chip(), labelUntuk(), msg(), muat(), nilai(), show() (+3 more)

### Community 21 - "Rekap/script.js"
Cohesion: 0.40
Nodes (9): apiPost(), filtered(), kartu(), muat(), render(), renderFilter(), setState(), show() (+1 more)

### Community 22 - "Baca/script.js"
Cohesion: 0.47
Nodes (8): apiPost(), blok(), blokLink(), chip(), muat(), render(), show(), tampilkanError()

## Knowledge Gaps
- **29 isolated node(s):** `timeZone`, `dependencies`, `exceptionLogging`, `runtimeVersion`, `state` (+24 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `timeZone`, `dependencies`, `exceptionLogging` to the rest of the system?**
  _29 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `Catatan-Baca/script.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1471264367816092 - nodes in this community are weakly interconnected._