# Graph Report - MoroalMora  (2026-09-06)

## Corpus Check
- 11 files · ~20,842 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 105 nodes · 188 edges · 9 communities (8 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `598096c8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur
- Tiga-Kisah-Babylon/script.js
- Catatan-Haid/script.js
- editor.js
- server.py
- appsscript.json
- Tiga Kisah dari Babylon
- MoroalMora-push.sh

## God Nodes (most connected - your core abstractions)
1. `loadAll()` - 8 edges
2. `Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur` - 8 edges
3. `fmtTanggal()` - 7 edges
4. `showToast()` - 7 edges
5. `renderSiklus()` - 7 edges
6. `h()` - 7 edges
7. `buildControl()` - 7 edges
8. `buildArrayEditor()` - 7 edges
9. `Handler` - 7 edges
10. `Setup manual Google Sheets + Apps Script (WAJIB 1x)` - 7 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (9 total, 1 thin omitted)

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

### Community 7 - "Tiga Kisah dari Babylon"
Cohesion: 0.33
Nodes (5): Benang Merah dari Tiga Kisah, Kisah Kedua: Idin, Sang Guru Tua, dan Bel yang Tidak Peduli, Kisah Ketiga: Ur-Nanshe dan Kebun yang Tak Pernah Dilihat, Kisah Pertama: Naran dan Sungai yang Tidak Peduli, Tiga Kisah dari Babylon

## Knowledge Gaps
- **22 isolated node(s):** `timeZone`, `dependencies`, `exceptionLogging`, `runtimeVersion`, `state` (+17 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `timeZone`, `dependencies`, `exceptionLogging` to the rest of the system?**
  _22 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._