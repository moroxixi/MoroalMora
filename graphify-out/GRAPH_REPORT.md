# Graph Report - MoroalMora  (2026-08-06)

## Corpus Check
- 6 files · ~6,441 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 47 nodes · 74 edges · 10 communities (8 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a02cd313`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur
- Setup manual Google Sheets + Apps Script (WAJIB 1x)
- loadAll
- script.js
- fmtTanggal
- appsscript.json
- showToast
- renderChart
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
10. `renderKalkulasi()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `init()` --calls--> `todayIso()`  [EXTRACTED]
  Catatan-Haid/script.js → Catatan-Haid/script.js  _Bridges community 3 → community 6_
- `bindReminderButtons()` --calls--> `fmtTanggal()`  [EXTRACTED]
  Catatan-Haid/script.js → Catatan-Haid/script.js  _Bridges community 4 → community 6_
- `renderCatatan()` --calls--> `fmtTanggal()`  [EXTRACTED]
  Catatan-Haid/script.js → Catatan-Haid/script.js  _Bridges community 4 → community 2_
- `renderChart()` --calls--> `fmtTanggal()`  [EXTRACTED]
  Catatan-Haid/script.js → Catatan-Haid/script.js  _Bridges community 4 → community 7_
- `loadAll()` --calls--> `showToast()`  [EXTRACTED]
  Catatan-Haid/script.js → Catatan-Haid/script.js  _Bridges community 6 → community 2_

## Import Cycles
- None detected.

## Communities (10 total, 2 thin omitted)

### Community 0 - "Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur"
Cohesion: 0.25
Nodes (7): Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur, Endpoint Apps Script (`gas/Code.gs`), Fitur, Graphify (peta codebase HomeLab), Reminder ntfy, Struktur, Verifikasi yang sudah dilakukan saat build

### Community 1 - "Setup manual Google Sheets + Apps Script (WAJIB 1x)"
Cohesion: 0.29
Nodes (7): 1. Install & login clasp, 2. Buat Sheet + project Apps Script terikat, 3. Push kode backend, 4. Deploy sebagai Web App (MANUAL — tidak otomatis), 5. Isi URL ke config.js, 6. Test end-to-end, Setup manual Google Sheets + Apps Script (WAJIB 1x)

### Community 2 - "loadAll"
Cohesion: 0.33
Nodes (7): apiGet(), apiPost(), escapeHtml(), loadAll(), renderCatatan(), renderSiklus(), setBusy()

### Community 3 - "script.js"
Cohesion: 0.47
Nodes (5): csvEscape(), downloadCsv(), pad2(), state, todayIso()

### Community 4 - "fmtTanggal"
Cohesion: 0.40
Nodes (6): fmtDurasi(), fmtTanggal(), parseIsoDate(), relHari(), renderKalkulasi(), setReminder()

### Community 5 - "appsscript.json"
Cohesion: 0.40
Nodes (4): dependencies, exceptionLogging, runtimeVersion, timeZone

### Community 6 - "showToast"
Cohesion: 1.00
Nodes (3): bindReminderButtons(), init(), showToast()

## Knowledge Gaps
- **18 isolated node(s):** `timeZone`, `dependencies`, `exceptionLogging`, `runtimeVersion`, `state` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur` connect `Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur` to `Setup manual Google Sheets + Apps Script (WAJIB 1x)`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `Setup manual Google Sheets + Apps Script (WAJIB 1x)` connect `Setup manual Google Sheets + Apps Script (WAJIB 1x)` to `Catatan Haid · MAO — Pencatat Siklus + Kalkulator Masa Subur`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `loadAll()` connect `loadAll` to `script.js`, `fmtTanggal`, `showToast`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `timeZone`, `dependencies`, `exceptionLogging` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._