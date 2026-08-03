#!/bin/bash
# MoroalMora-push.sh — Auto commit & push HomeLab/MoroalMora ke GitHub
# Pola: meniru Work/work-push.sh, path & cek syntax disesuaikan.
# Simpan ke: /home/moroxixi/HomeLab/MoroalMora/MoroalMora-push.sh
# chmod +x MoroalMora-push.sh
HOMELAB_DIR="/home/moroxixi/HomeLab/MoroalMora"
GAS_DIR="$HOMELAB_DIR/Catatan-Haid/gas"
LOG="$HOMELAB_DIR/push.log"
cd "$HOMELAB_DIR" || exit 1

# ── Pastikan strategi pull sudah diset (merge biasa, tanpa nanya-nanya) ────
git config pull.rebase false >/dev/null 2>&1
git config core.editor "true" >/dev/null 2>&1   # "true" = no-op, biar gak nyangkut nunggu editor kalau ada merge commit tanpa -m

# ── Cari SSH agent yang aktif ──────────────────────────────────────────────
# Kalau SSH_AUTH_SOCK sudah ke-set & valid (biasanya otomatis di sesi desktop normal),
# pakai itu dulu. Kalau tidak, cari socket manual di lokasi umum.
if [ -z "$SSH_AUTH_SOCK" ] || [ ! -S "$SSH_AUTH_SOCK" ]; then
    SSH_AGENT_SOCK=$(ls "$HOME"/.ssh/agent/s.*.agent.* 2>/dev/null | head -1)
    if [ -n "$SSH_AGENT_SOCK" ]; then
        export SSH_AUTH_SOCK="$SSH_AGENT_SOCK"
    fi
fi

# ── Cek syntax semua file JS/GS sebelum commit ─────────────────────────────
SYNTAX_ERRORS=""
while IFS= read -r -d '' jsfile; do
    case "$jsfile" in
        *.gs)
            # node --check tidak mengenal ekstensi .gs — cek via salinan sementara .js
            tmpfile=$(mktemp /tmp/gs-check.XXXXXX.js)
            cp "$jsfile" "$tmpfile"
            ERR=$(node --check "$tmpfile" 2>&1)
            CHECK_STATUS=$?
            rm -f "$tmpfile"
            ;;
        *)
            ERR=$(node --check "$jsfile" 2>&1)
            CHECK_STATUS=$?
            ;;
    esac
    if [ $CHECK_STATUS -ne 0 ]; then
        SYNTAX_ERRORS+="$jsfile: $ERR\n"
    fi
done < <(find "$HOMELAB_DIR" \( -name "*.js" -o -name "*.gs" \) -not -path "*/.git/*" -not -path "*/node_modules/*" -print0)
if [ -n "$SYNTAX_ERRORS" ]; then
    echo "$(date '+%H:%M') [Syntax] ERROR ditemukan:" >> "$LOG"
    echo -e "$SYNTAX_ERRORS" >> "$LOG"
    echo ""
    echo "❌ SyntaxError — push dibatalkan:"
    echo -e "$SYNTAX_ERRORS"
    notify-send "MoroalMora" "❌ SyntaxError! Push dibatalkan — cek terminal" --urgency=critical 2>/dev/null
    exit 1
fi
echo "$(date '+%H:%M') [Syntax] Semua file JS/GS OK." >> "$LOG"

# ── Cek apakah ada perubahan ───────────────────────────────────────────────
if [ -z "$(git status --porcelain)" ]; then
    echo "$(date '+%H:%M') [Git] Tidak ada perubahan, skip." >> "$LOG"
    echo "ℹ️  Tidak ada perubahan."
    notify-send "MoroalMora" "Tidak ada perubahan" --urgency=low 2>/dev/null
    exit 0
fi

# ── Commit ──────────────────────────────────────────────────────────────
git add -A
COMMIT_MSG="${1:-auto: $(date '+%Y-%m-%d %H:%M')}"
git commit -m "$COMMIT_MSG"

# ── Push ke Apps Script via clasp (OPSIONAL & dijaga aman) ────────────────
# Hanya jalan kalau:
#   1. binary clasp tersedia, DAN
#   2. .clasp.json sudah berisi scriptId asli (bukan placeholder), DAN
#   3. user sengaja mengaktifkannya lewat variabel CLASP_PUSH=1.
# Deploy Web App (butuh set akses "Anyone" secara interaktif) TIDAK pernah
# dijalankan dari script ini — hanya clasp push yang boleh jalan otomatis.
if [ "$CLASP_PUSH" = "1" ] && command -v clasp >/dev/null 2>&1; then
    if [ -f "$GAS_DIR/.clasp.json" ] && grep -q 'ISI_SETELAH_CLASP_CREATE' "$GAS_DIR/.clasp.json"; then
        echo "$(date '+%H:%M') [Clasp] .clasp.json masih placeholder, clasp push dilewati." >> "$LOG"
    else
        echo "$(date '+%H:%M') [Clasp] Menjalankan clasp push..." >> "$LOG"
        CLASP_PUSH_OUTPUT=$(cd "$GAS_DIR" && clasp push 2>&1)
        CLASP_PUSH_STATUS=$?
        echo "$CLASP_PUSH_OUTPUT" >> "$LOG"
        if [ $CLASP_PUSH_STATUS -ne 0 ]; then
            echo "⚠️  clasp push gagal (lihat push.log) — commit git tetap lanjut." >> "$LOG"
        fi
    fi
else
    echo "$(date '+%H:%M') [Clasp] Dilewati (set CLASP_PUSH=1 untuk aktifkan, atau clasp belum terpasang)." >> "$LOG"
fi

# ── Pull dulu sebelum push, biar gak ketolak karena remote lebih maju ─────
PULL_OUTPUT=$(git pull origin main --no-edit 2>&1)
PULL_STATUS=$?
echo "$PULL_OUTPUT" >> "$LOG"

if [ $PULL_STATUS -ne 0 ]; then
    echo "$(date '+%H:%M') [Git] Pull GAGAL / ada konflik:" >> "$LOG"
    echo ""
    echo "❌ Pull gagal / ada konflik — push dibatalkan:"
    echo "$PULL_OUTPUT"
    echo ""
    echo "👉 Beresin manual dulu: cek 'git status', selesaikan konflik di file yang ditandai,"
    echo "   lalu 'git add <file>' dan 'git commit', baru jalankan script ini lagi."
    notify-send "MoroalMora" "❌ Konflik saat pull! Perlu beresin manual" --urgency=critical 2>/dev/null
    exit 1
fi

# ── Push ────────────────────────────────────────────────────────────────
PUSH_OUTPUT=$(git push origin main 2>&1)
PUSH_STATUS=$?
echo "$PUSH_OUTPUT" >> "$LOG"
if [ $PUSH_STATUS -eq 0 ]; then
    echo "$(date '+%H:%M') [Git] Push berhasil: $COMMIT_MSG" >> "$LOG"
    echo "✅ Push berhasil: $COMMIT_MSG"
    notify-send "MoroalMora" "📤 HomeLab/MoroalMora di-push ke GitHub" --urgency=low 2>/dev/null
else
    echo "$(date '+%H:%M') [Git] Push GAGAL:" >> "$LOG"
    echo "$PUSH_OUTPUT" >> "$LOG"
    echo ""
    echo "❌ Push GAGAL:"
    echo "$PUSH_OUTPUT"
    notify-send "MoroalMora" "❌ Push gagal! $PUSH_OUTPUT" --urgency=critical 2>/dev/null
fi
