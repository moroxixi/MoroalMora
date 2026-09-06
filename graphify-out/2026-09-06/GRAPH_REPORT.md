# Graph Report - MoroalMora  (2026-09-06)

## Corpus Check
- 9 files · ~18,266 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 63 nodes · 100 edges · 10 communities (9 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2aba331c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur
- Tiga-Kisah-Babylon/script.js
- fmtTanggal
- script.js
- loadAll
- appsscript.json
- showToast
- Tiga Kisah dari Babylon
- MoroalMora-push.sh

## God Nodes (most connected - your core abstractions)
1. `loadAll()` - 8 edges
2. `Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur` - 8 edges
3. `fmtTanggal()` - 7 edges
4. `showToast()` - 7 edges
5. `renderSiklus()` - 7 edges
6. `Setup manual Google Sheets + Apps Script (WAJIB 1x)` - 7 edges
7. `setReminder()` - 6 edges
8. `bindReminderButtons()` - 5 edges
9. `init()` - 5 edges
10. `el()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `init()` --calls--> `todayIso()`  [EXTRACTED]
  Catatan-Haid/script.js → Catatan-Haid/script.js  _Bridges community 3 → community 6_
- `setReminder()` --calls--> `parseIsoDate()`  [EXTRACTED]
  Catatan-Haid/script.js → Catatan-Haid/script.js  _Bridges community 4 → community 6_
- `bindReminderButtons()` --calls--> `fmtTanggal()`  [EXTRACTED]
  Catatan-Haid/script.js → Catatan-Haid/script.js  _Bridges community 2 → community 6_
- `renderKalkulasi()` --calls--> `fmtTanggal()`  [EXTRACTED]
  Catatan-Haid/script.js → Catatan-Haid/script.js  _Bridges community 2 → community 4_

## Import Cycles
- None detected.

## Communities (10 total, 1 thin omitted)

### Community 0 - "Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur"
Cohesion: 0.13
Nodes (14): 1. Install & login clasp, 2. Buat Sheet + project Apps Script terikat, 3. Push kode backend, 4. Deploy sebagai Web App (MANUAL — tidak otomatis), 5. Isi URL ke config.js, 6. Test end-to-end, Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur, Endpoint Apps Script (`gas/Code.gs`) (+6 more)

### Community 1 - "Tiga-Kisah-Babylon/script.js"
Cohesion: 0.47
Nodes (9): bacaInline(), el(), gagal(), muat(), ornament(), render(), renderBenangMerah(), renderInline() (+1 more)

### Community 2 - "fmtTanggal"
Cohesion: 0.38
Nodes (7): apiPost(), escapeHtml(), fmtTanggal(), fmtTanggalPendek(), renderCatatan(), renderChart(), renderSiklus()

### Community 3 - "script.js"
Cohesion: 0.47
Nodes (5): csvEscape(), downloadCsv(), pad2(), state, todayIso()

### Community 4 - "loadAll"
Cohesion: 0.33
Nodes (6): apiGet(), loadAll(), parseIsoDate(), relHari(), renderKalkulasi(), setBusy()

### Community 5 - "appsscript.json"
Cohesion: 0.40
Nodes (4): dependencies, exceptionLogging, runtimeVersion, timeZone

### Community 6 - "showToast"
Cohesion: 0.60
Nodes (5): bindReminderButtons(), fmtDurasi(), init(), setReminder(), showToast()

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